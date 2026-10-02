const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadPlaywright = () => {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean);
  for (const candidate of candidates) { try { return require(candidate); } catch { /* Try the next installed runtime. */ } }
  throw new Error('Install Playwright or set PLAYWRIGHT_MODULE to an installed module path.');
};
const { chromium } = loadPlaywright();
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.NEEDLE_BASE_URL || 'http://127.0.0.1:3930';
const out = process.env.NEEDLE_QA_DIR || 'tmp/golden-needle/qa';
const errors = [];
const captures = [];
const touchPages = new WeakMap();
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = async (page, ms) => { await page.evaluate(value => window.advanceTime(value), ms); await page.waitForTimeout(20); };

async function capture(page, name) {
  await page.waitForTimeout(750);
  const state = await read(page);
  const dom = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() })),
    title: document.title,
  }));
  assert.equal(dom.overflow, false, `${name} horizontal overflow`);
  assert.equal(dom.canvas.length, 1);
  assert.ok(dom.canvas[0].width > 0 && dom.canvas[0].rect.width > 150);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  assert.ok(pixels.colors > 100 && pixels.nearBlackRatio < 0.8 && pixels.transparentRatio < 0.02);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ state, dom, pixels }, null, 2));
  captures.push({ name, file, phase: state.phase, pixels });
}

async function prepare(page) {
  for (const [tool, phase] of [['swab', 'numb'], ['cream', 'wipe'], ['swab', 'needle']]) {
    await page.locator(`[data-tool=${tool}]`).click();
    for (const p of (await read(page)).spots) await act(page, p, 630);
    assert.equal((await read(page)).phase, phase);
  }
}
async function at(page, p) {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('canvas').boundingBox();
  const point = { x: box.x + p.x / 760 * box.width, y: box.y + p.y / 660 * box.height };
  if (!touchPages.has(page)) await page.mouse.move(point.x, point.y);
  await advance(page, 380);
  return point;
}
async function act(page, p, ms = 760) {
  const xy = await at(page, p);
  const cdp = touchPages.get(page);
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...xy, radiusX: 3, radiusY: 3 }] });
  else await page.mouse.down();
  await advance(page, ms);
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  await advance(page, 20);
}
async function start(page, mode) {
  if (mode) await page.getByRole('button', { name: mode }).click();
  await page.getByRole('button', { name: '戴上手套' }).click();
  await advance(page, 0);
  assert.equal((await read(page)).phase, 'clean');
}
async function rotate(page, angle) {
  const now = (await read(page)).hand.angle;
  for (let i = 0; i < Math.abs(angle - now) / 15; i++) await page.getByRole('button', { name: angle < now ? '探头向左旋转' : '探头向右旋转' }).click();
}
async function finish(page, name, touch) {
  let state = await read(page);
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  for (const p of state.spots.filter(p => !p.treated)) {
    state = await read(page);
    if (state.pain > 34 || state.heat > 38) {
      await page.locator('[data-tool=ice]').click(); await act(page, { x: 380, y: 335 }, 1900);
    }
    await page.locator('[data-tool=probe]').click();
    if (state.difficulty !== 'gentle') await rotate(page, p.angle);
    const duration = (state.timingWindow[0] + state.timingWindow[1]) * 500;
    if (cdp) {
      const xy = await at(page, p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...xy, radiusX: 3, radiusY: 3 }] });
      await advance(page, duration);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await advance(page, 20);
    } else await act(page, p, duration);
    const after = await read(page);
    assert.ok(after.spots[p.id].treated, `${name} spot ${p.id}: ${after.message}`);
  }
  assert.equal((await read(page)).phase, 'cool');
  await page.locator('[data-tool=ice]').click();
  for (const p of (await read(page)).spots) await act(page, p, 750);
  state = await read(page);
  assert.equal(state.result, 'success');
  await page.getByRole('heading', { name: state.grade.title }).waitFor();
  await capture(page, name);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(`${base}/game/golden-needle`, { signal: AbortSignal.timeout(60000) })).status, 200, 'responding server required before launching Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.NEEDLE_HEADED !== '1', args: ['--mute-audio'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(`${base}/game/golden-needle`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.render_game_to_text && document.querySelector('canvas')));
    await capture(page, 'desktop-welcome');
    if (process.env.NEEDLE_SMOKE === '1') return;
    await start(page);
    await page.keyboard.press('2'); assert.equal((await read(page)).tool, 'cream');
    await page.keyboard.press('p'); assert.equal((await read(page)).paused, true);
    await page.keyboard.press('p'); assert.equal((await read(page)).paused, false);
    await page.keyboard.press('f'); await page.waitForFunction(() => Boolean(document.fullscreenElement));
    await page.keyboard.press('f'); await page.waitForFunction(() => !document.fullscreenElement);
    await prepare(page);
    await page.locator('[data-tool=probe]').click();
    await capture(page, 'desktop-ready');
    const p = (await read(page)).spots[0];
    await at(page, p); await page.mouse.down(); await advance(page, 760);
    await capture(page, 'desktop-pulse'); await page.mouse.up(); await advance(page, 20);
    assert.equal((await read(page)).spots[0].treated, true);
    await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
    const paused = await read(page); await advance(page, 6000); assert.deepEqual(await read(page), paused);
    await page.getByRole('button', { name: '继续操作', exact: true }).click();
    await page.getByRole('button', { name: '怎么玩', exact: true }).click();
    assert.equal((await read(page)).paused, true); await page.getByRole('button', { name: '关闭弹窗' }).click(); assert.equal((await read(page)).paused, false);
    await finish(page, 'desktop-no-relief-success');
    assert.equal((await read(page)).reliefUsed, false);
    const earned = (await read(page)).score;
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.render_game_to_text));
    assert.ok((await page.locator('aside').innerText()).includes(String(earned)), 'best persists across refresh');
    await start(page, '进阶 · 手别抖'); await prepare(page);
    await page.keyboard.down('e'); await advance(page, 250); await page.keyboard.up('e');
    assert.ok((await read(page)).hand.angle > 10);
    await page.keyboard.down('q'); await advance(page, 250); await page.keyboard.up('q');
    assert.equal((await read(page)).hand.angle, 0);
    await page.getByRole('button', { name: '栓剂止痛' }).click();
    await capture(page, 'desktop-relief-curtain');
    await advance(page, 2400); assert.ok((await read(page)).reliefSeconds > 80);
    await page.locator('[data-tool=probe]').click();
    const n = (await read(page)).spots[0];
    await rotate(page, n.angle); await act(page, n, 200); assert.equal((await read(page)).spots[0].treated, false);
    await act(page, n, 1200); assert.ok((await read(page)).mistakes > 0);
    await finish(page, 'desktop-relief-success');
    assert.equal((await read(page)).reliefUsed, true);
    await page.getByRole('button', { name: '再来一局' }).click(); await advance(page, 0); await prepare(page);
    await page.locator('[data-tool=probe]').click();
    for (let i = 0; i < 22 && (await read(page)).phase !== 'result'; i++) await act(page, { x: 160, y: 400 }, 40);
    assert.equal((await read(page)).result, 'stopped'); await capture(page, 'desktop-stopped');
    await page.getByRole('button', { name: '回到接诊台' }).click();
    await page.getByRole('button', { name: '灵感档案' }).click(); await capture(page, 'desktop-sources');
    assert.equal(await page.getByRole('link', { name: 'FDA · 射频微针风险说明' }).count(), 1);
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    // Mobile: actual touch events for pulse timing; all other tools are also checked with pointer input.
    await page.setViewportSize({ width: 390, height: 844 });
    touchPages.set(page, await context.newCDPSession(page));
    await start(page, '初诊 · 稳稳来'); await prepare(page);
    await page.getByRole('button', { name: '栓剂止痛' }).click(); await advance(page, 2300);
    await page.locator('[data-tool=probe]').click(); await capture(page, 'mobile-ready');
    await finish(page, 'mobile-touch-success', true);
    await page.getByRole('button', { name: '回到接诊台' }).click();
    await page.setViewportSize({ width: 320, height: 740 }); await capture(page, 'small-welcome');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/demos`, { waitUntil: 'networkidle' });
    const entry = page.locator('a[href="/game/golden-needle"]');
    await entry.scrollIntoViewIfNeeded();
    const preview = entry.locator('img');
    await preview.waitFor();
    await page.waitForFunction(() => { const image = document.querySelector('a[href="/game/golden-needle"] img'); return image?.complete && image.naturalWidth > 0; });
    const catalogFile = path.join(out, 'catalog.png');
    const catalogPixels = inspectPng(await page.screenshot({ path: catalogFile }));
    captures.push({ name: 'catalog', file: catalogFile, pixels: catalogPixels });
    await entry.click(); await page.waitForFunction(() => Boolean(window.render_game_to_text));
    assert.equal((await read(page)).phase, 'welcome');
    await context.close();
    assert.deepEqual(errors, [], 'browser errors');
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ captures, errors, passed: true }, null, 2));
    console.log(`Passed: ${captures.length} screenshots, full five-stage runs, optional relief, touch, pause, recovery, persistence, and failure.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
