const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:3988/game/beach-volley';
const output = path.resolve(process.env.BEACH_CONTROLS_OUTPUT || 'tmp/beach-controls-dev');
fs.mkdirSync(output, { recursive: true });
const errors = [], screenshots = [], checks = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const control = (page, action, side = 0) => page.locator(`[data-control="${side}-${action}"]`);
async function capture(page, name) {
  const metrics = inspectPng(await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await page.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, displayed: { width: c.clientWidth, height: c.clientHeight } }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720);
  assert.ok(canvas.displayed.width > 0 && canvas.displayed.height > 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  screenshots.push({ name, metrics, canvas, state: await state(page) });
}
async function context(browser, options = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
  await c.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  c.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  return c;
}
async function load(page, mode = '自由练习') {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady);
  await page.evaluate(() => window.beachVolley?.manual(true));
  await page.getByRole('button', { name: mode, exact: true }).click();
  await page.locator('#beach-start').click();
  await advance(page, 3500);
  assert.equal((await state(page)).phase, 'serve');
}
async function hit(page) {
  await page.keyboard.down('KeyJ'); await advance(page, 30); await page.keyboard.up('KeyJ');
  assert.equal((await state(page)).phase, 'rally');
}
const allReleased = s => s.inputs.flatMap(Object.values).every(v => !v);
(async () => {
  assert.equal((await fetch(url)).status, 200, 'server responds before launching Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const desktop = await context(browser);
    const p = await desktop.newPage();
    await load(p); await hit(p);
    await p.keyboard.down('KeyD'); await p.keyboard.down('ArrowRight'); await advance(p, 80);
    await p.keyboard.up('ArrowRight');
    const x = (await state(p)).players[0].x;
    await advance(p, 200);
    assert.ok((await state(p)).players[0].x > x + 50, 'held D still moves after right arrow releases');
    await p.keyboard.up('KeyD'); assert.ok(allReleased(await state(p)));
    await p.keyboard.down('KeyW'); await p.keyboard.down('Space'); await advance(p, 100);
    await p.keyboard.up('Space'); assert.equal((await state(p)).inputs[0].jump, true);
    await p.keyboard.up('KeyW');
    await capture(p, '01-alias-jump');
    checks.push('keyboard aliases continue independently and jump retains the remaining hold');

    await p.getByRole('button', { name: '暂停比赛', exact: true }).click();
    const paused = await state(p); await advance(p, 500);
    assert.deepEqual((await state(p)).ball, paused.ball);
    await p.keyboard.down('KeyD'); assert.ok(allReleased(await state(p)));
    const resume = p.getByRole('button', { name: '继续比赛', exact: true }).last();
    await resume.focus(); await p.keyboard.press('Enter');
    assert.equal((await state(p)).paused, false, 'native Enter resumes');
    await p.keyboard.down('KeyD'); assert.ok(allReleased(await state(p)), 'repeat cannot revive cancelled key');
    await p.keyboard.up('KeyD');
    await p.keyboard.down('KeyD'); assert.equal((await state(p)).inputs[0].right, true); await p.keyboard.up('KeyD');
    await p.getByRole('button', { name: '暂停比赛', exact: true }).click();
    await p.getByRole('button', { name: '继续比赛', exact: true }).last().focus(); await p.keyboard.press('Space');
    assert.equal((await state(p)).paused, false, 'native Space resumes');
    await p.getByRole('button', { name: '玩法说明', exact: true }).click();
    await p.keyboard.press('KeyP'); await advance(p, 500);
    assert.equal((await state(p)).paused, true);
    await p.getByRole('button', { name: '明白，去接球' }).click();
    await p.keyboard.press('KeyP'); assert.equal((await state(p)).paused, false);
    await p.keyboard.down('KeyA'); await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.ok(allReleased(await state(p))); assert.equal((await state(p)).paused, true);
    await p.keyboard.up('KeyA');
    await capture(p, '02-pause');
    checks.push('native resume keys, pause freezing, repeat suppression, help and injected blur cancellation');

    await load(p, '同机双人'); await hit(p);
    await p.keyboard.down('KeyD'); await p.keyboard.down('ArrowLeft'); await advance(p, 200);
    assert.equal((await state(p)).inputs[0].right, true); assert.equal((await state(p)).inputs[1].left, true);
    await p.keyboard.up('KeyD'); assert.equal((await state(p)).inputs[1].left, true);
    await p.keyboard.up('ArrowLeft');
    await p.keyboard.down('Numpad1'); await p.keyboard.down('Slash'); await p.keyboard.up('Slash');
    assert.equal((await state(p)).inputs[1].hit, true); await p.keyboard.up('Numpad1');
    await capture(p, '03-local');
    // Public inputs only: move receivers toward the net so deep balls can score.
    await p.keyboard.down('KeyD'); await p.keyboard.down('ArrowLeft');
    for (let i = 0; i < 600 && (await state(p)).phase !== 'result'; i++) await advance(p, 5000);
    await p.keyboard.up('KeyD'); await p.keyboard.up('ArrowLeft');
    const result = await state(p); assert.equal(result.phase, 'result'); assert.ok(result.winner === 0 || result.winner === 1);
    await capture(p, '04-result');
    await p.getByRole('button', { name: '再来一场' }).focus(); await p.keyboard.press('Enter');
    assert.deepEqual((await state(p)).score, [0, 0]); assert.ok(allReleased(await state(p)));
    checks.push('independent local players, 2P aliases, natural full match and keyboard rematch');

    const mobileContext = await context(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const m = await mobileContext.newPage(); await load(m, '同机双人');
    const cdp = await mobileContext.newCDPSession(m);
    async function point(action, id, side = 0, offset = 0) {
      const b = await control(m, action, side).boundingBox(); assert.ok(b);
      return { x: b.x + b.width / 2 + offset, y: b.y + b.height / 2, id };
    }
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [await point('hit', 1)]); await advance(m, 30); await touch('touchEnd', []);
    assert.equal((await state(m)).phase, 'rally');
    const a = await point('right', 11, 0, -8), b = await point('right', 12, 0, 8);
    await touch('touchStart', [a]); await touch('touchStart', [a, b]); await advance(m, 50);
    await touch('touchEnd', [b]); assert.equal((await state(m)).inputs[0].right, true);
    await m.keyboard.down('KeyD'); await touch('touchCancel', []);
    assert.equal((await state(m)).inputs[0].right, true, 'cancel touch leaves keyboard held');
    await m.keyboard.up('KeyD'); assert.ok(allReleased(await state(m)));
    await touch('touchStart', [await point('left', 21)]);
    await m.keyboard.down('KeyA'); await m.keyboard.up('KeyA');
    assert.equal((await state(m)).inputs[0].left, true, 'keyboard release leaves touch held');
    await touch('touchCancel', []); assert.ok(allReleased(await state(m)));
    const one = await point('jump', 31), two = await point('dive', 32, 1);
    await touch('touchStart', [one]); await touch('touchStart', [one, two]); await advance(m, 90);
    assert.ok((await state(m)).players[0].y < 580); assert.equal((await state(m)).players[1].diving, true);
    await capture(m, '05-touch-local');
    await touch('touchCancel', []); assert.ok(allReleased(await state(m)));
    // Keyboard-operated touch buttons own their action, including independent Enter/Space.
    await control(m, 'left').focus(); await m.keyboard.down('Enter'); await m.keyboard.down('Space');
    assert.equal((await state(m)).inputs[0].left, true); assert.equal((await state(m)).inputs[0].jump, false);
    await m.keyboard.up('Enter'); assert.equal((await state(m)).inputs[0].left, true);
    await m.keyboard.press('Tab'); assert.ok(allReleased(await state(m))); await m.keyboard.up('Space');
    await control(m, 'hit').focus(); await m.keyboard.down('Enter'); assert.equal((await state(m)).inputs[0].hit, true);
    await m.keyboard.press('KeyP'); assert.ok(allReleased(await state(m))); await m.keyboard.up('Enter');
    await m.getByRole('button', { name: '继续比赛', exact: true }).last().click();
    await touch('touchStart', [await point('right', 41)]); assert.equal((await state(m)).inputs[0].right, true);
    await touch('touchEnd', []); assert.ok(allReleased(await state(m)));
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
      await m.setViewportSize({ width, height });
      for (const button of await m.locator('[data-control]').all()) {
        const box = await button.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height + 1, 'all touch buttons in viewport');
      }
      await capture(m, `06-layout-${width}`);
    }
    checks.push('real multi-touch same-button holds, mixed keyboard ownership, true touchcancel, 2P dive, focus key holds and 320/390/landscape controls');
    // Real RAF smoke, without advanceTime or the development manual hook.
    await p.goto(url); await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady);
    await p.getByRole('button', { name: '自由练习', exact: true }).click(); await p.locator('#beach-start').click();
    await p.getByRole('button', { name: '跳过演出' }).click();
    await p.keyboard.down('KeyJ'); await p.waitForTimeout(70); await p.keyboard.up('KeyJ');
    const start = await state(p); await p.keyboard.down('KeyD'); await p.waitForTimeout(220); await p.keyboard.up('KeyD');
    assert.ok((await state(p)).players[0].x > start.players[0].x + 40);
    await p.keyboard.press('KeyP'); const frozen = await state(p); await p.waitForTimeout(250);
    assert.deepEqual((await state(p)).ball, frozen.ball);
    checks.push('actual animation frames move the player and pause physics without test fast-forward');
    const cinemaContext = await context(browser, { reducedMotion: 'no-preference' });
    const cinema = await cinemaContext.newPage();
    await cinema.goto(url, { waitUntil: 'networkidle' });
    await cinema.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady);
    await cinema.locator('#beach-start').click();
    await cinema.locator('video').waitFor({ state: 'visible' });
    await cinema.keyboard.press('KeyP'); assert.equal((await state(cinema)).paused, true, 'cannot unpause behind intro');
    assert.equal((await state(cinema)).cinematic.paused, true, 'P pauses the movie');
    await cinema.keyboard.press('KeyP');
    await cinema.waitForFunction(() => document.querySelector('video')?.currentTime > 0.3);
    await cinema.getByRole('button', { name: '玩法说明', exact: true }).click();
    const cinemaTime = await cinema.locator('video').evaluate(v => v.currentTime);
    await cinema.waitForTimeout(300);
    assert.ok(Math.abs(await cinema.locator('video').evaluate(v => v.currentTime) - cinemaTime) < 0.05, 'help freezes the movie');
    assert.equal((await state(cinema)).paused, true, 'help keeps physics paused');
    await cinema.getByRole('button', { name: '明白，去接球' }).click();
    await cinema.waitForFunction(() => !document.querySelector('video'), { timeout: 15000 });
    assert.equal((await state(cinema)).paused, false);
    assert.equal((await state(cinema)).phase, 'serve');
    checks.push('P pauses only the movie; help freezes it, closing help resumes, natural ending returns directly to serve');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, screenshots: screenshots.map(s => s.name), errors }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, screenshots, errors }, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
