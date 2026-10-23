const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { makePilot } = require('./lib/sui-delivery-pilot.cjs');
const { SAVE_KEY, LEGACY_KEY } = require('./lib/sui-delivery-model.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4138';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery/verified';
const report = { errors: [], captures: [], checks: [] };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function prepare(context) {
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    Element.prototype.requestPointerLock = async () => {};
    document.exitPointerLock = () => {};
  });
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  await context.route(/\/api\/(record|demos\/visits)(\?|$)/, r => r.fulfill({ json: { success: true, count: 0 } }));
  context.on('page', page => {
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  });
}
async function loaded(page, label = /^接下第一单/) {
  await page.goto(`${base}/game/sui-spring?test=1`);
  await page.getByRole('button', { name: label }).waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !!window.deliveryTest && document.querySelector('canvas') && !Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('正在准备早餐')));
  await page.evaluate(() => window.deliveryTest.manual(true));
}
async function capture(page, name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dom = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const box = c?.getBoundingClientRect(); const host = c?.parentElement.getBoundingClientRect();
    return { canvasCount: document.querySelectorAll('canvas').length, width: c?.width, height: c?.height, box: box?.toJSON(), host: host?.toJSON(), viewport: { w: innerWidth, h: innerHeight }, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, text: document.body.innerText.slice(0, 2200) };
  });
  assert.equal(dom.canvasCount, 1); assert.ok(dom.width >= 540 && dom.width <= 1280); assert.ok(dom.height >= 540 && dom.height <= 980);
  assert.ok(dom.box.width > 0 && dom.box.width <= dom.host.width + 1 && dom.box.height <= dom.host.height + 1);
  assert.ok(Math.abs(dom.box.width / dom.box.height - dom.width / dom.height) < 0.015, 'canvas scaling preserves aspect ratio');
  assert.ok(dom.scrollWidth <= dom.viewport.w + 1); assert.ok(dom.scrollHeight <= dom.viewport.h + 1);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  report.captures.push({ name, file, pixels, dom, state: await state(page) });
}
async function key(page, code, frames = 1) {
  await page.keyboard.down(code); await page.evaluate(ms => window.advanceTime(ms), frames * 1000 / 120 + 0.001); await page.keyboard.up(code);
}
(async () => {
  assert.equal((await fetch(`${base}/game/sui-spring`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.DELIVERY_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await prepare(ctx);
    const oldRecord = JSON.stringify({ unlocked: 3, best: [{ time: 64, stars: ['star-0', 'star-1'] }], sound: false });
    await ctx.addInitScript(({ key, raw, origin }) => { if (window.location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: LEGACY_KEY, raw: oldRecord, origin: base });
    const p = await ctx.newPage(); await loaded(p); await capture(p, '01-title');
    await p.getByRole('button', { name: /^接下第一单/ }).click(); await key(p, 'KeyE', 6); assert.equal((await state(p)).carrying, true);
    await capture(p, '02-take-soup');
    const run = makePilot().journey(); let previous = 6; let resumeRaw = '';
    const photographed = new Set(['first-loft', 'old-sign', 'repairer-kindness', 'awning-compressed', 'upper-balcony', 'cart-rider', 'delivered']);
    for (const milestone of run.milestones.filter(m => m.frame > 6)) {
      await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(previous, milestone.frame)); previous = milestone.frame;
      const actual = await state(p); assert.equal(actual.phase, milestone.state.phase, milestone.name);
      assert.ok(Math.abs(actual.player.x - milestone.state.player.x) < 0.01, `${milestone.name}: player x`);
      assert.ok(Math.abs(actual.player.y - milestone.state.player.y) < 0.01, `${milestone.name}: player y`);
      assert.equal(actual.deaths, 0); assert.equal(actual.player.health, 3);
      if (photographed.has(milestone.name)) await capture(p, `03-${milestone.name}`);
      if (milestone.name === 'old-sign') {
        await p.getByRole('button', { name: '整备', exact: true }).click();
        const before = await state(p); await p.evaluate(() => window.advanceTime(1000)); assert.deepEqual(await state(p), before);
        await p.getByRole('button', { name: /^宽托盘/ }).click(); assert.equal((await state(p)).save.tray, 'wide');
        await capture(p, '04-tray-unlocked'); await p.getByRole('button', { name: /^轻托盘/ }).click();
        await p.getByRole('button', { name: '关闭面板' }).click(); assert.equal((await state(p)).phase, 'playing');
      }
      if (milestone.name === 'cart-rider') resumeRaw = await p.evaluate(key => localStorage.getItem(key), SAVE_KEY);
    }
    assert.equal((await state(p)).save.money, 42); assert.equal((await state(p)).shortcutOpen, true);
    assert.equal(await p.evaluate(key => localStorage.getItem(key), LEGACY_KEY), oldRecord);
    report.checks.push('normal-input complete order, high road, side quest, canopy, cart, real delivery and one-time money');
    await p.getByRole('button', { name: '看看放下的木梯' }).click(); await p.evaluate(() => window.advanceTime(500)); await capture(p, '05-flower-shortcut');
    await p.getByRole('button', { name: '整备', exact: true }).click(); await p.getByRole('button', { name: '选择片段练习' }).click();
    await p.getByRole('button', { name: /^揉面后院/ }).click(); assert.equal((await state(p)).mode, 'practice');
    await p.keyboard.down('ArrowRight'); await p.keyboard.down('Space'); await p.keyboard.down('KeyJ'); await p.evaluate(() => window.advanceTime(150));
    const moved = await state(p); assert.ok(moved.player.x > 730); assert.equal(moved.player.attackHeld, true); assert.ok(moved.player.y < 630);
    await p.evaluate(() => dispatchEvent(new Event('blur'))); assert.equal((await state(p)).phase, 'paused');
    const stopped = await state(p); await p.evaluate(() => window.advanceTime(700)); assert.deepEqual(await state(p), stopped);
    await p.keyboard.up('ArrowRight'); await p.keyboard.up('Space'); await p.keyboard.up('KeyJ');
    await p.getByRole('button', { name: '继续配送' }).click(); await p.evaluate(() => window.advanceTime(50)); assert.equal((await state(p)).player.attackHeld, false);
    await p.keyboard.press('KeyR'); await p.evaluate(() => window.advanceTime(50)); assert.equal((await state(p)).player.x, 730);
    await p.keyboard.press('Escape'); await capture(p, '06-practice-pause');
    await p.getByRole('button', { name: '回到标题' }).click(); await p.getByRole('button', { name: /^趁热送达/ }).click();
    assert.equal((await state(p)).mode, 'hot'); assert.equal((await state(p)).checkpoint, 'kitchen');
    await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape); assert.equal((await state(p)).phase, 'delivered');
    assert.equal((await state(p)).save.money, 42); assert.equal((await state(p)).save.hotMedal, true); await capture(p, '07-hot-medal');
    report.checks.push('keyboard movement/jump/attack/retry, blur input release, freeze/resume, practice and optional hot replay without duplicate money');

    const reloadCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await prepare(reloadCtx);
    await reloadCtx.addInitScript(({ key, raw, origin }) => { if (window.location.origin === origin && !localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: SAVE_KEY, raw: resumeRaw, origin: base });
    const r = await reloadCtx.newPage(); await loaded(r, /^继续这趟配送/); await r.getByRole('button', { name: /^继续这趟配送/ }).click();
    const resumed = await state(r); assert.equal(resumed.player.x, 2100); assert.equal(resumed.carrying, true); assert.equal(resumed.checkpoint, 'cart'); assert.ok(resumed.save.found.includes('old-sign')); assert.equal(resumed.save.kindness, true);
    await capture(r, '08-checkpoint-reload'); await reloadCtx.close(); report.checks.push('resume actual checkpoint save with discoveries, meal and side quest preserved; old record untouched');

    const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }); await prepare(mobile);
    const m = await mobile.newPage(); await loaded(m); await m.getByRole('button', { name: /^接下第一单/ }).tap();
    const cdp = await mobile.newCDPSession(m);
    const point = async label => { const b = await m.getByRole('button', { name: label, exact: true }).boundingBox(); assert.ok(b && b.width >= 44 && b.height >= 44); assert.ok(b.y >= 0 && b.y + b.height <= 390); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const right = await point('向右'); const jump = await point('跳跃'); const attack = await point('挑击');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right, id: 1 }, { ...jump, id: 2 }, { ...attack, id: 3 }] });
    await m.evaluate(() => window.advanceTime(180)); const touch = await state(m); assert.ok(touch.player.x > 155 && touch.player.y < 600); assert.equal(touch.player.attackHeld, true);
    await capture(m, '09-mobile-landscape'); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await m.evaluate(() => window.advanceTime(50));
    assert.equal((await state(m)).player.attackHeld, false); assert.equal((await state(m)).player.jumpHeld, false);
    await m.setViewportSize({ width: 390, height: 844 }); await capture(m, '10-mobile-portrait');
    await m.getByRole('button', { name: '整备', exact: true }).tap(); await m.getByRole('button', { name: /^轻松模式/ }).tap(); await m.getByRole('button', { name: /^减少动态效果/ }).tap();
    await capture(m, '11-mobile-settings'); assert.equal((await state(m)).save.settings.assist, true); assert.equal((await state(m)).save.settings.reducedMotion, true);
    await m.getByRole('button', { name: '关闭面板' }).tap(); await m.reload(); await m.getByRole('button', { name: /^继续这趟配送/ }).waitFor();
    assert.equal((await state(m)).save.settings.assist, true); assert.equal((await state(m)).save.settings.reducedMotion, true);
    report.checks.push('three simultaneous touch controls, cancel releases all inputs, 390px portrait, settings persist');
    await mobile.close();
    const passageCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await prepare(passageCtx);
    const passagePage = await passageCtx.newPage(); await loaded(passagePage);
    await passagePage.getByRole('button', { name: /^接下第一单/ }).click();
    const passage = makePilot(); passage.tick({ interact: true }); passage.tick({}, 5); passage.go(365);
    passage.tick({ right: true, run: true, jump: true }, 5); passage.tick({ right: true, run: true }, 56);
    await passagePage.evaluate(tape => window.deliveryTest.replay(tape), passage.tape);
    const underDoor = await state(passagePage);
    assert.ok(Math.abs(underDoor.player.x - passage.s.player.x) < 0.01);
    assert.equal(underDoor.player.y, 606); assert.equal(underDoor.player.grounded, true);
    assert.equal(underDoor.player.health, 3); assert.equal(underDoor.deaths, 0);
    await capture(passagePage, '14-low-courtyard-passage');
    passage.tick({ right: true, run: true }, 60);
    await passagePage.evaluate(tape => window.deliveryTest.replay(tape), passage.tape.slice(-60));
    const pastDoor = await state(passagePage);
    assert.ok(pastDoor.player.x > 650); assert.equal(pastDoor.player.y, 636);
    assert.equal(pastDoor.player.health, 3); assert.equal(pastDoor.deaths, 0);
    await passageCtx.close();
    report.checks.push('fresh short-jump low passage under the gatehouse: visible head clearance at y606, then exits safely through public inputs');
    await p.setViewportSize({ width: 960, height: 620 });
    await p.getByRole('button', { name: '看看放下的木梯' }).click(); await p.getByRole('button', { name: '整备', exact: true }).click();
    await p.getByRole('button', { name: '选择片段练习' }).click(); await p.getByRole('button', { name: /^揉面后院/ }).click();
    await p.keyboard.press('Escape'); await p.getByRole('button', { name: '回到标题' }).click();
    await capture(p, '12-library-preview');
    if (process.env.DELIVERY_UPDATE_PREVIEW === '1') await p.screenshot({ path: 'public/games/sui-spring/delivery-preview.png', fullPage: true, animations: 'disabled' });
    await p.goto(`${base}/game/sui-spring/archive?test=1`);
    await p.getByRole('button', { name: /^继续春日冒险/ }).waitFor({ timeout: 60000 });
    await p.waitForFunction(() => !!window.springTest);
    await p.evaluate(() => window.springTest.manual(true));
    await p.getByRole('button', { name: /^继续春日冒险/ }).click(); await p.evaluate(() => window.advanceTime(100));
    assert.equal((await state(p)).phase, 'playing'); await capture(p, '13-original-archive');
    report.checks.push('original four-level archive boots and starts using its separate legacy record');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, screenshots: report.captures.length, checks: report.checks, errors: report.errors, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
