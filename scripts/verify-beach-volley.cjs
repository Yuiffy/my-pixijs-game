const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:3946/game/beach-volley';
const output = path.resolve(process.env.BEACH_VOLLEY_OUTPUT || 'tmp/beach-volley-qa');
fs.mkdirSync(output, { recursive: true });
const errors = []; const screenshots = []; const checks = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(page, name) {
  const image = await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  const metrics = inspectPng(image);
  const s = await state(page);
  const dimensions = await page.locator('canvas').evaluate(el => ({ width: el.width, height: el.height, rect: { width: el.clientWidth, height: el.clientHeight } }));
  screenshots.push({ name, metrics, state: s, canvas: dimensions });
  return s;
}
async function advance(page, ms) { await page.evaluate(ms => window.advanceTime(ms), ms); }
async function rig(page, scenario) {
  await page.evaluate(scenario => {
    const g = window.beachVolley.game();
    g.paused = false; g.phase = 'rally'; g.phaseTime = 0; g.freeze = 0; g.cutin = null; g.specialWindup = null;
    const p = g.players[0]; p.x = 430; p.y = 606; p.vx = 0; p.vy = 0; p.swing = 0; p.dive = 0;
    g.ball = { x: 440, y: 450, vx: -100, vy: 220, spin: 0, lastHit: 1, lock: 0, power: null };
    if (scenario === 'special') { p.y = 430; p.energy = 100; g.ball.y = 309; }
    if (scenario === 'win' || scenario === 'loss') {
      g.score = scenario === 'win' ? [6, 3] : [3, 6];
      g.ball.x = scenario === 'win' ? 1215 : 50; g.ball.y = 580; g.ball.vx = 0; g.ball.vy = 200;
    }
  }, scenario);
}
(async () => {
  const response = await fetch(url); assert.equal(response.status, 200, 'dev server responds');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.route('**/api/record', r => r.fulfill({ json: { success: true } }));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
    await page.evaluate(() => window.beachVolley.manual(true));
    await page.locator('#beach-cinema').selectOption('off');
    await capture(page, '01-menu');
    if (process.env.SMOKE_ONLY === '1') { console.log(JSON.stringify({ screenshots, errors })); return; }
    await page.getByRole('button', { name: '玩法说明', exact: true }).click();
    await capture(page, '02-help');
    await page.getByRole('button', { name: '明白，去接球' }).click();
    await page.locator('#beach-start').click();
    if (await page.getByRole('button', { name: '跳过开场' }).isVisible()) {
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5);
      await capture(page, '03a-video');
      await page.waitForFunction(() => !document.querySelector('video'), { timeout: 12000 });
      assert.equal((await state(page)).paused, false, 'video end returns to game');
      checks.push('local intro MP4 decodes, advances, and naturally ends into playable intro');
    }
    await advance(page, 1000); await capture(page, '03-intro');
    await page.getByRole('button', { name: '跳过演出' }).click();
    assert.equal((await state(page)).phase, 'serve');
    await page.keyboard.down('KeyJ'); await advance(page, 20); await page.keyboard.up('KeyJ');
    assert.equal((await state(page)).phase, 'rally');
    const beforeMove = (await state(page)).players[0].x;
    await page.keyboard.down('KeyD'); await advance(page, 350); await page.keyboard.up('KeyD');
    assert.ok((await state(page)).players[0].x > beforeMove + 60, 'keyboard movement works');
    await page.keyboard.down('Space'); await advance(page, 180); await page.keyboard.up('Space');
    assert.ok((await state(page)).players[0].y < 520, 'jump leaves sand');
    await capture(page, '04-jump');
    await rig(page, 'receive'); await advance(page, 80);
    assert.ok((await state(page)).hits[0] > 0, 'body receives ball');
    await capture(page, '05-rally');
    await rig(page, 'receive');
    await page.keyboard.down('KeyD'); await page.keyboard.down('KeyK'); await advance(page, 130);
    await page.keyboard.up('KeyK'); await page.keyboard.up('KeyD');
    assert.equal((await state(page)).players[0].diving, true); await capture(page, '05a-dive');
    await page.keyboard.press('KeyP'); const paused = await state(page); await advance(page, 1500);
    assert.deepEqual((await state(page)).ball, paused.ball, 'pause freezes physics');
    await capture(page, '06-pause'); await page.getByRole('button', { name: '继续比赛', exact: true }).last().click();
    await rig(page, 'special'); await page.keyboard.down('KeyL'); await advance(page, 30); await page.keyboard.up('KeyL');
    assert.equal((await state(page)).specials[0], 1, 'special hits and charges once');
    assert.equal((await state(page)).players[0].energy, 0); await capture(page, '07-special-sui');
    await advance(page, 1600); assert.equal((await state(page)).cutin, null);
    assert.equal((await state(page)).specialWindup, null, 'static presentation and full windup finish before flight');
    await rig(page, 'win'); await advance(page, 150); assert.equal((await state(page)).score[0], 7);
    assert.equal((await state(page)).phase, 'result'); assert.equal((await state(page)).event.type, 'win');
    const matchEvent = (await state(page)).event;
    await capture(page, '08-direct-finale'); await advance(page, 2400);
    assert.deepEqual((await state(page)).event, matchEvent, 'finale does not emit another point or win');
    assert.equal((await state(page)).winner, 0); await capture(page, '09-victory');
    await page.getByRole('button', { name: '再来一场' }).click(); await advance(page, 3500);
    assert.deepEqual((await state(page)).score, [0, 0], 'rematch resets scores');
    await rig(page, 'loss'); await advance(page, 2600); assert.equal((await state(page)).winner, 1); await capture(page, '10-defeat');
    await page.getByRole('button', { name: '返回沙滩', exact: true }).click();
    await page.getByRole('button', { name: /栞栞.*SHIORI/ }).click();
    await page.getByRole('button', { name: '同机双人', exact: true }).click();
    await page.locator('#beach-start').click();
    if (await page.getByRole('button', { name: '跳过开场' }).isVisible()) await page.getByRole('button', { name: '跳过开场' }).click();
    await advance(page, 3500); await page.keyboard.down('KeyJ'); await advance(page, 20); await page.keyboard.up('KeyJ');
    const p2x = (await state(page)).players[1].x;
    await page.keyboard.down('ArrowLeft'); await advance(page, 300); await page.keyboard.up('ArrowLeft');
    assert.ok((await state(page)).players[1].x < p2x - 50, '2P keyboard is independent');
    await rig(page, 'special'); await page.keyboard.down('KeyL'); await advance(page, 30); await page.keyboard.up('KeyL');
    assert.equal((await state(page)).ball.power, 'shiori'); await capture(page, '11-special-shiori');
    checks.push('menu/help, serve, movement/jump, receive, pause/resume, both specials, point/victory/defeat/rematch, 2P controls');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
    await page.evaluate(() => window.beachVolley.manual(true)); await capture(page, '12-mobile-menu');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile has no horizontal overflow');
    await page.getByRole('button', { name: '自由练习', exact: true }).click(); await page.locator('#beach-start').click();
    if (await page.getByRole('button', { name: '跳过开场' }).isVisible()) await page.getByRole('button', { name: '跳过开场' }).click();
    await advance(page, 3500);
    await page.locator('[data-control="0-hit"]').dispatchEvent('pointerdown', { pointerId: 1 }); await advance(page, 20); await page.locator('[data-control="0-hit"]').dispatchEvent('pointerup', { pointerId: 1 });
    await capture(page, '13-mobile-play');
    await page.setViewportSize({ width: 844, height: 390 }); await capture(page, '14-mobile-landscape');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'landscape has no horizontal overflow');
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await state(page)).paused, true, 'blur pauses game');
    checks.push('390px menu and touch serve, 844px landscape, hidden/blur pause');
    const touchContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await touchContext.route('**/api/record', r => r.fulfill({ json: { success: true } }));
    await touchContext.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await touchContext.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const mobile = await touchContext.newPage();
    mobile.on('pageerror', err => errors.push(err.message));
    await mobile.goto(url, { waitUntil: 'networkidle' });
    await mobile.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
    await mobile.evaluate(() => window.beachVolley.manual(true));
    await mobile.locator('#beach-cinema').selectOption('off');
    await mobile.locator('#beach-start').click();
    if (await mobile.getByRole('button', { name: '跳过开场' }).isVisible()) await mobile.getByRole('button', { name: '跳过开场' }).click();
    await advance(mobile, 3500);
    const cdp = await touchContext.newCDPSession(mobile);
    async function pressTouch(action, ms) {
      const box = await mobile.locator(`[data-control="0-${action}"]`).boundingBox(); assert.ok(box);
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await advance(mobile, ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await pressTouch('hit', 30); assert.equal((await state(mobile)).phase, 'rally');
    const mobileX = (await state(mobile)).players[0].x;
    await pressTouch('right', 200); assert.ok((await state(mobile)).players[0].x > mobileX + 30);
    await pressTouch('jump', 180); assert.ok((await state(mobile)).players[0].y < 540);
    await capture(mobile, '15-real-touch-landscape');
    await mobile.getByRole('button', { name: '全屏', exact: true }).click();
    await mobile.waitForTimeout(200); assert.ok(await mobile.evaluate(() => !!document.fullscreenElement));
    await capture(mobile, '16-fullscreen');
    await mobile.evaluate(() => document.exitFullscreen());
    await rig(mobile, 'win'); await advance(mobile, 2700);
    await mobile.setViewportSize({ width: 390, height: 844 }); await capture(mobile, '17-mobile-victory');
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push('real Chrome touch input: serve, move, jump, full-screen, portrait result');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
    await page.evaluate(() => window.beachVolley.manual(true)); await page.locator('#beach-start').click();
    assert.equal(await page.locator('video').count(), 0, 'reduced motion skips intro video');
    await advance(page, 3500); assert.equal((await state(page)).phase, 'serve');
    checks.push('reduced motion preserves gameplay and skips video');
    assert.deepEqual(errors, [], 'no console/page errors');
    console.log(JSON.stringify({ checks, screenshots: screenshots.map(s => ({ name: s.name, metrics: s.metrics })), errors }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, screenshots, errors }, null, 2));
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
