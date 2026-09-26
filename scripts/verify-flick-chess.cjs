const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const THREE = require('three');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const localRequire = createRequire(__filename);
const candidates = [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
  path.join(os.homedir(), '.codex', 'skills', 'develop-web-game', 'node_modules', 'playwright'),
].filter(Boolean);
let chromium;
for (const candidate of candidates) {
  try {
    ({ chromium } = localRequire(candidate));
    break;
  } catch { /* Try the next installed Playwright copy. */ }
}
if (!chromium) throw new Error('Playwright is unavailable; set PLAYWRIGHT_MODULE.');

const base = process.env.FLICK_BASE_URL || 'http://127.0.0.1:3865';
const out = process.env.FLICK_QA_DIR || 'tmp/flick-chess-verify';
const errors = [];
const captures = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));

function project(piece, canvasBox, viewport, board) {
  const aspect = viewport.width / viewport.height;
  const viewHeight = Math.max(board.length * (aspect >= 1 ? 1.31 : 1.08), (board.width + 4.3) / aspect);
  const camera = new THREE.OrthographicCamera(
    -(viewHeight * aspect) / 2,
    (viewHeight * aspect) / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    100,
  );
  camera.position.set(0, 18, 15);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const point = new THREE.Vector3(piece.x, piece.y, piece.z).project(camera);
  return {
    x: canvasBox.x + (point.x + 1) * canvasBox.width / 2,
    y: canvasBox.y + (1 - point.y) * canvasBox.height / 2,
  };
}

async function capture(page, name) {
  const canvas = page.locator('[data-game-canvas="flick-chess"]');
  const file = path.join(out, `${name}.png`);
  const full = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  const surface = inspectPng(await canvas.screenshot());
  const diagnostic = await state(page);
  const layout = await page.evaluate(() => {
    const target = document.querySelector('[data-game-canvas="flick-chess"]');
    return {
      canvasTag: target.tagName,
      viewport: [innerWidth, innerHeight],
      document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      canvasCss: [target.getBoundingClientRect().width, target.getBoundingClientRect().height],
      canvasPixels: [target.width, target.height],
    };
  });
  assert.ok(layout.document[0] <= layout.viewport[0] + 1, JSON.stringify(layout));
  assert.equal(layout.canvasTag, 'CANVAS');
  assert.ok(layout.canvasCss[0] > 0 && layout.canvasCss[1] > 0, JSON.stringify(layout));
  assert.ok(layout.canvasPixels[0] > 0 && layout.canvasPixels[1] > 0, JSON.stringify(layout));
  assert.equal(diagnostic.pieces.length, 32);
  captures.push({ name, file, full, surface, layout, phase: diagnostic.phase, turn: diagnostic.turn, shotCount: diagnostic.shotCount });
}

async function ready(page) {
  await page.goto(`${base}/game/flick-chess`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const target = document.querySelector('[data-game-canvas="flick-chess"]');
    const box = target?.getBoundingClientRect();
    return target && box && box.width > 0 && box.height > 0
      && typeof window.render_game_to_text === 'function'
      && JSON.parse(window.render_game_to_text()).pieces.length === 32;
  }, { timeout: 60000 });
  await page.waitForFunction(() => performance.getEntriesByType('resource')
    .filter(entry => entry.name.includes('/images/autochess/portraits/minimal/')).length >= 32,
  undefined, { timeout: 20000 });
  await page.waitForTimeout(300);
}

async function drag(page, pieceId, deltaY, deltaX = 0) {
  const diagnostic = await state(page);
  const piece = diagnostic.pieces.find(candidate => candidate.id === pieceId);
  assert.ok(piece, pieceId);
  const canvasBox = await page.locator('[data-game-canvas="flick-chess"]').boundingBox();
  const viewport = page.viewportSize();
  const point = project(piece, canvasBox, viewport, diagnostic.board);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + deltaX, point.y + deltaY, { steps: 16 });
  return point;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(`${base}/game/flick-chess`)).status, 200);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.FLICK_HEADED !== '1',
    args: ['--mute-audio'],
  });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.on('console', message => { if (message.type() === 'error') errors.push(`desktop: ${message.text()}`); });
    desktop.on('pageerror', error => errors.push(`desktop: ${error.message}`));
    await ready(desktop);
    await capture(desktop, 'desktop-ready');

    const start = await state(desktop);
    assert.equal(start.phase, 'aiming');
    assert.equal(start.turn, 'red');
    await drag(desktop, 'blue-9', 90);
    assert.equal(await desktop.locator('[aria-label^="力度 "]').count(), 0, 'The opposite side must not be selectable.');
    await desktop.mouse.up();
    assert.equal((await state(desktop)).shotCount, 0);
    await drag(desktop, 'red-4', 96);
    assert.ok(await desktop.locator('[aria-label^="力度 "]').isVisible(), 'Aim meter must appear during the drag.');
    await capture(desktop, 'desktop-aim');
    await desktop.mouse.up();
    await desktop.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotCount === 1, undefined, { timeout: 2500 });
    const fired = await state(desktop);
    assert.equal(fired.shotCount, 1, `The drag must launch exactly one shot: ${JSON.stringify({ errors, fired: { phase: fired.phase, shotCount: fired.shotCount } })}`);
    const redBefore = start.pieces.find(piece => piece.id === 'red-4');
    await desktop.waitForFunction((before) => {
      const current = JSON.parse(window.render_game_to_text()).pieces.find(piece => piece.id === 'red-4');
      return Math.hypot(current.x - before.x, current.z - before.z) > 0.1;
    }, redBefore, { timeout: 2500 });
    const redAfter = fired.pieces.find(piece => piece.id === 'red-4');
    assert.ok(redAfter.inPlay, 'The chosen piece must remain in play after the first shot.');
    await capture(desktop, 'desktop-shot');
    await desktop.evaluate(() => window.advanceTime(16000));
    await desktop.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotCount >= 2, undefined, { timeout: 8000 });
    const aiResponse = await state(desktop);
    assert.equal(aiResponse.mode, 'ai');
    assert.ok(aiResponse.shotCount >= 2, 'AI must reply after the red shot settles.');
    await capture(desktop, 'desktop-ai-response');

    await desktop.getByRole('button', { name: '本地双人' }).click();
    const localStart = await state(desktop);
    assert.equal(localStart.mode, 'local');
    assert.equal(localStart.turn, 'red');
    assert.equal(localStart.shotCount, 0);
    await drag(desktop, 'red-4', 92);
    await desktop.mouse.up();
    await desktop.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotCount === 1, undefined, { timeout: 2500 });
    await desktop.evaluate(() => window.advanceTime(16000));
    await desktop.waitForFunction(() => {
      const current = JSON.parse(window.render_game_to_text());
      return current.phase === 'aiming' && current.turn === 'blue';
    }, undefined, { timeout: 2500 });
    await desktop.waitForTimeout(850);
    assert.equal((await state(desktop)).shotCount, 1, 'AI must stay idle in local mode.');
    await capture(desktop, 'desktop-local-blue-turn');
    await drag(desktop, 'blue-9', -105);
    assert.ok(await desktop.locator('[aria-label^="力度 "]').isVisible(), 'The blue player must be able to aim.');
    await capture(desktop, 'desktop-local-blue-aim');
    await desktop.mouse.up();
    await desktop.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotCount === 2, undefined, { timeout: 2500 });
    await capture(desktop, 'desktop-local-blue-shot');

    await desktop.getByRole('button', { name: '重新开局' }).click();
    const restarted = await state(desktop);
    assert.equal(restarted.mode, 'local');
    assert.equal(restarted.shotCount, 0);
    assert.equal(restarted.turn, 'red');
    assert.deepEqual(restarted.remaining, { red: 16, blue: 16 });
    await desktop.getByRole('button', { name: '规则' }).click();
    assert.ok(await desktop.getByRole('dialog', { name: '弹棋规则' }).isVisible());
    await capture(desktop, 'desktop-help');
    await drag(desktop, 'red-4', 88);
    assert.equal(await desktop.locator('[aria-label^="力度 "]').count(), 0, 'Help dialog must block aiming.');
    await desktop.mouse.up();
    assert.equal((await state(desktop)).shotCount, 0);
    if (await desktop.getByRole('dialog', { name: '弹棋规则' }).count() === 0) {
      await desktop.getByRole('button', { name: '规则' }).click();
    }
    await desktop.getByRole('button', { name: '关闭规则' }).click();
    assert.equal(await desktop.getByRole('dialog', { name: '弹棋规则' }).count(), 0);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    mobile.on('console', message => { if (message.type() === 'error') errors.push(`mobile: ${message.text()}`); });
    mobile.on('pageerror', error => errors.push(`mobile: ${error.message}`));
    await ready(mobile);
    await capture(mobile, 'mobile-ready');
    const firstMobile = await state(mobile);
    assert.equal(firstMobile.shotCount, 0);
    await drag(mobile, 'red-4', 85);
    await capture(mobile, 'mobile-aim');
    await mobile.mouse.up();
    await mobile.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotCount === 1, undefined, { timeout: 2500 });
    assert.equal((await state(mobile)).shotCount, 1, 'Mobile width drag must launch.');
    await capture(mobile, 'mobile-shot');

    await mobile.getByRole('button', { name: '重新开局' }).click();
    assert.equal((await state(mobile)).shotCount, 0);
    const touchStart = await state(mobile);
    const piece = touchStart.pieces.find(candidate => candidate.id === 'red-4');
    const canvasBox = await mobile.locator('[data-game-canvas="flick-chess"]').boundingBox();
    const point = project(piece, canvasBox, mobile.viewportSize(), touchStart.board);
    const cdp = await mobile.context().newCDPSession(mobile);
    const touch = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(point.x, point.y) });
    for (let index = 1; index <= 12; index += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(point.x, point.y + index * 7) });
    }
    assert.ok(await mobile.locator('[aria-label^="力度 "]').isVisible(), 'Touch dragging must show aim meter.');
    await capture(mobile, 'mobile-touch-aim');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: touch(point.x, point.y + 84) });
    await mobile.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotCount === 1, undefined, { timeout: 2500 });
    await capture(mobile, 'mobile-touch-shot');

    assert.deepEqual(errors, []);
    const report = { base, captures, errors };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); console.error('Browser errors:', errors); process.exitCode = 1; });
