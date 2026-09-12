const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.MINI_BASE_URL || 'http://127.0.0.1:3845';
const output = process.env.MINI_QA_DIR || 'tmp/mini-games-verify';
const screenshots = []; const errors = [];
mkdirSync(output, { recursive: true });
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const observed = [];
const resolveAiEvent = async page => { if (!(await state(page)).industry.eventResolved) await page.locator('[data-event-choice]:not(:disabled)').first().click(); };
const endAi = async page => { await resolveAiEvent(page); await button(page, '结束季度 →').click(); };
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll('main button')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).map(el => el.textContent) }));
  assert.ok(overflow.scroll <= overflow.width + 1, JSON.stringify(overflow));
  assert.deepEqual(overflow.controls, []);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  const text = await state(page);
  const canvas = await page.locator('canvas').evaluate(el => ({ width: el.width, height: el.height, cssWidth: el.clientWidth }));
  assert.equal(canvas.width, 960); assert.ok(canvas.cssWidth > 250);
  screenshots.push({ file, pixels, canvas, state: text });
}
async function open(page, kind) {
  await page.goto(`${base}/game/${kind}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.render_game_to_text);
  assert.equal((await state(page)).kind, kind);
}
async function resetRoute(page, kind) {
  await open(page, kind);
  if ((await state(page)).started) {
    await button(page, '新开一局').click();
    await button(page, '同种子重开').click();
  }
}
(async () => {
  assert.equal((await fetch(`${base}/game/agi`)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    for (const kind of ['agi', 'fab', 'snack']) {
      await open(page, kind);
      await capture(page, `${kind}-intro-desktop`);
      await page.locator('#start-game').click();
      await advance(page, 0);
      if (kind === 'agi') {
        await page.locator('[data-action="train"]').click();
        await page.locator('[data-action="compute"]').click();
        await endAi(page);
      } else if (kind === 'fab') {
        await button(page, '全部囤货').click();
        await page.locator('[data-action="expand"]').click();
        await button(page, '结算本季市场 →').click();
      } else {
        await page.keyboard.down('j'); await advance(page, 600); await page.keyboard.up('j');
      }
      await capture(page, `${kind}-playing-desktop`);
      if (process.env.EXPORT_THUMBNAILS) {
        mkdirSync('public/games/mini', { recursive: true });
        const png = await page.locator('canvas').evaluate(el => el.toDataURL('image/png').split(',')[1]);
        writeFileSync(`public/games/mini/${kind}.png`, Buffer.from(png, 'base64'));
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, `${kind}-playing-mobile`);
      await page.setViewportSize({ width: 1440, height: 960 });
    }
    const { aiPilot, fabPilot } = await import('./tests/helpers/mini-games-pilots.mjs');
    for (const route of ['shared', 'commerce', 'safe', 'doom']) {
      await resetRoute(page, 'agi');
      const style = route === 'commerce' ? 'product' : 'efficient';
      await page.locator(`[data-company="${style === 'product' ? 'openai' : 'deepseek'}"]`).click();
      await page.locator('#start-game').click();
      await button(page, route === 'shared' ? '开源共享' : '闭源商业').click();
      const trace = []; const expected = aiPilot(2026, style, route, trace);
      for (const step of trace) {
        if (step.type === 'event') await page.locator(`[data-event-choice="${step.id}"]`).click();
        else if (step.type === 'end') await endAi(page);
        else await page.locator(`[data-action="${step.id}"]`).click();
      }
      const actual = await state(page);
      for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], `AI ${route} ${key}`);
      await page.evaluate(() => scrollTo(0, 0));
      await capture(page, `agi-ending-${route}`);
      await page.reload({ waitUntil: 'networkidle' });
      assert.deepEqual((await state(page)).ending, expected.ending);
      observed.push({ scenario: `agi-${route}`, title: actual.ending.title, turn: actual.turn });
      console.log(`Verified AI ending: ${actual.ending.title}`);
    }
    await button(page, '同种子再战').click();
    assert.equal((await state(page)).started, false); assert.equal((await state(page)).seed, 2026);
    await page.locator('#start-game').click();
    await page.locator('[data-action="train"]').click();
    const savedAi = await state(page);
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual((await state(page)).used, savedAi.used);
    assert.equal((await state(page)).cash, savedAi.cash);
    await resetRoute(page, 'agi'); await page.locator('#start-game').click();
    for (const action of ['train', 'compute', 'fund']) await page.locator(`[data-action="${action}"]`).click();
    await endAi(page);
    for (const action of ['train', 'distill', 'release']) await page.locator(`[data-action="${action}"]`).click();
    await endAi(page);
    await page.locator('[data-action="train"]').click(); await page.locator('[data-action="self"]').click();
    await page.locator('[data-action="fund"]').click();
    await resolveAiEvent(page); const recursive = await state(page); await endAi(page);
    const grown = await state(page); assert.equal(grown.recursive, true);
    assert.equal(grown.capability - recursive.capability, 9); assert.equal(recursive.safety - grown.safety, 6);
    await page.evaluate(() => scrollTo(0, 0)); await capture(page, 'agi-recursive-research');

    await resetRoute(page, 'fab'); await page.locator('#start-game').click();
    const fabTrace = []; const fabExpected = fabPilot(2026, 'memory', fabTrace);
    for (const step of fabTrace) {
      if (step.type === 'end') await button(page, '结算本季市场 →').click();
      else if (step.type === 'action') await page.locator(`[data-action="${step.id}"]`).click();
      else {
        await button(page, step.production === 0 ? '停产' : step.production === 0.5 ? '半产' : '满产').click();
        await button(page, '降价 15%').click(); await button(page, '全部出货').click();
      }
      const current = await state(page);
      if (step.type === 'end' && [7, 17].includes(current.turn)) {
        await page.evaluate(() => scrollTo(0, 0)); await capture(page, `fab-quarter-${current.turn}`);
        await page.reload({ waitUntil: 'networkidle' });
        assert.deepEqual((await state(page)).player, current.player);
      }
    }
    const fabActual = await state(page);
    for (const key of Object.keys(fabExpected)) assert.deepEqual(fabActual[key], fabExpected[key], `FAB ${key}`);
    await page.evaluate(() => scrollTo(0, 0)); await capture(page, 'fab-ending');
    observed.push({ scenario: 'fab-full-six-years', title: fabActual.ending.title, cash: fabActual.player.cash });
    console.log(`Verified 24 quarters: ${fabActual.ending.title}`);
    await button(page, '同种子再战').click(); await page.locator('#start-game').click();
    await page.locator('[data-action="loan"]').click(); assert.equal((await state(page)).player.debt, 80);
    await page.locator('[data-action="repay"]').click(); assert.equal((await state(page)).player.debt, 0);
    await button(page, '涨价 20%').click(); await button(page, '卖一半').click();
    await button(page, '结算本季市场 →').click(); assert.ok((await state(page)).player.sold > 0);

    await resetRoute(page, 'snack'); await page.locator('#start-game').click(); await advance(page, 0);
    await page.keyboard.down('j'); await advance(page, 350); await page.keyboard.up('j');
    await page.keyboard.press('p'); const paused = await state(page); await advance(page, 10000);
    assert.equal((await state(page)).time, paused.time); assert.equal(paused.phase, 'paused');
    assert.ok(Object.values(paused.inputs).every(v => !v));
    await capture(page, 'snack-paused');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await state(page)).phase, 'paused');
    assert.equal((await state(page)).chewing, paused.chewing);
    await advance(page, 0); await button(page, '继续直播').click();
    // Speaking mid-bite is recoverable; explicitly exercise the time-limit loss.
    await page.keyboard.down('Space'); await advance(page, 70000); await page.keyboard.up('Space');
    assert.equal((await state(page)).phase, 'lost'); await capture(page, 'snack-caught');
    await button(page, '重试本关').click(); assert.equal((await state(page)).phase, 'ready');
    for (let level = 0; level < 5; level++) {
      await page.locator('#start-game').click(); await advance(page, 0);
      let current = await state(page);
      while (current.phase === 'playing') {
        await page.keyboard.down('Space'); await advance(page, 1200); await page.keyboard.up('Space');
        current = await state(page);
        const eatMs = [1400, 2000, 2600, 3600][current.selected];
        await page.keyboard.down('k'); await page.keyboard.down('j'); await advance(page, eatMs + 35);
        await page.keyboard.up('j'); await page.keyboard.up('k');
        current = await state(page);
        if (level === 2 && current.eaten === 1) { await page.evaluate(() => scrollTo(0, 0)); await capture(page, 'snack-level-three'); }
      }
      assert.equal(current.phase, level === 4 ? 'ending' : 'won', JSON.stringify(current));
      assert.ok(current.best[level] > 0);
      observed.push({ scenario: `snack-level-${level + 1}`, score: current.score, peak: current.peak });
      console.log(`Verified snack level ${level + 1}`);
      if (level < 4) await button(page, '准备下一关').click();
    }
    await page.evaluate(() => scrollTo(0, 0)); await capture(page, 'snack-campaign-ending');
    const records = (await state(page)).best;
    await page.reload({ waitUntil: 'networkidle' }); assert.deepEqual((await state(page)).best, records);
    await button(page, '再挑战五关').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#start-game').click(); await advance(page, 0);
    const visible = await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="按住"], button[aria-label="吃一口"]')].every(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    assert.equal(visible, true, 'Touch controls must be visible together with meters');
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touch = await mobile.newPage(); touch.on('pageerror', error => errors.push(error.message));
    await open(touch, 'snack'); await touch.locator('#start-game').tap(); await advance(touch, 0);
    const cdp = await mobile.newCDPSession(touch);
    const eatBox = await button(touch, '吃一口').boundingBox(); const muteBox = await button(touch, '按住静音').boundingBox();
    const points = [eatBox, muteBox].map((r, id) => ({ id, x: r.x + r.width / 2, y: r.y + r.height / 2 }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await advance(touch, 600); assert.equal((await state(touch)).inputs.eat, true); assert.equal((await state(touch)).inputs.mute, true);
    assert.equal((await state(touch)).suspicion, 0); await capture(touch, 'snack-multitouch-mobile');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(Object.values((await state(touch)).inputs).every(v => !v));
    await touch.evaluate(() => dispatchEvent(new Event('blur'))); assert.equal((await state(touch)).phase, 'paused');
    await touch.reload({ waitUntil: 'networkidle' }); assert.equal((await state(touch)).phase, 'paused');
    await advance(touch, 0); await button(touch, '继续直播').tap();
    await touch.setViewportSize({ width: 320, height: 740 }); await capture(touch, 'snack-small-mobile');
    await mobile.close();

    const denied = await browser.newContext();
    await denied.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Test: storage unavailable'); }; });
    const offline = await denied.newPage(); await open(offline, 'agi'); await offline.locator('#start-game').click();
    await offline.locator('[data-action="train"]').click(); assert.equal((await state(offline)).capability, 24);
    assert.ok((await offline.locator('main').innerText()).includes('本局仍可玩')); await denied.close();
    await page.setViewportSize({ width: 1440, height: 960 });
    await open(page, 'agi'); await page.keyboard.press('f');
    await page.waitForFunction(() => !!document.fullscreenElement); await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.goto(`${base}/demos`, { waitUntil: 'networkidle' });
    for (const kind of ['agi', 'fab', 'snack']) assert.equal(await page.locator(`a[href="/game/${kind}"]`).count(), 1);
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ screenshots, observed, errors }, null, 2));
    console.log(JSON.stringify({ screenshots: screenshots.map(s => s.file), observed, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
