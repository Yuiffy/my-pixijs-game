const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');

const candidates = [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
  'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright',
].filter(Boolean);
let chromium;
for (const candidate of candidates) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
if (!chromium) throw new Error('Playwright is required; set PLAYWRIGHT_MODULE to its installed location.');

const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3870';
const output = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-verify';
const evidence = [];
const errors = [];
const events = [];
mkdirSync(output, { recursive: true });

const state = page => page.evaluate(() => window.nightRain.getState());
const textState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const input = (page, action) => page.evaluate(value => window.nightRain.input(value), { x: 0, z: 0, ...action });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const observe = page => {
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
};
const open = async page => {
  await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.nightRain && window.render_game_to_text && window.advanceTime && document.querySelector('canvas')?.width > 0);
};
const capture = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const snapshot = await state(page);
  const text = await textState(page);
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(canvas => ({ width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight })),
    text: document.body.innerText.slice(0, 2200),
    badImages: [...document.querySelectorAll('img')].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
  }));
  assert.ok(layout.scrollWidth <= layout.width + 1, `Horizontal overflow in ${name}`);
  assert.equal(layout.canvas.length, 1, `Exactly one 3D canvas in ${name}`);
  assert.ok(layout.canvas[0].width > 0 && layout.canvas[0].height > 0);
  assert.deepEqual(layout.badImages, []);
  const path = join(output, `${name}.png`);
  // This is a full-page capture through installed Chrome, never canvas.toDataURL.
  // Pointer Lock is virtualized so tests never capture the user’s physical mouse.
  const pixels = inspectPng(await page.screenshot({ path, fullPage: true, animations: "disabled" }));
  evidence.push({ name, path, pixels, layout, mode: snapshot.mode, region: snapshot.region, player: snapshot.player });
  writeFileSync(join(output, `${name}.json`), JSON.stringify({ state: snapshot, text, layout, pixels }, null, 2));
  console.log(`capture ${name}: ${snapshot.mode}, ${snapshot.region}, ${pixels.width}x${pixels.height}`);
};

const keyMove = async (page, key, ms = 150) => {
  const before = (await state(page)).player;
  await page.keyboard.down(key);
  await advance(page, ms);
  await page.keyboard.up(key);
  const after = (await state(page)).player;
  assert.ok(distance(before, after) > 0.15, `${key.toUpperCase()} must move the actual player`);
};

const checkKeyboard = async page => {
  for (const key of ['w', 's', 'a', 'd']) await keyMove(page, key);
  for (const [key, action] of [['j', 'light'], ['k', 'heavy'], [' ', 'dodge'], ['l', 'parry']]) {
    await advance(page, 1600);
    const before = await state(page);
    await page.keyboard.press(key === ' ' ? 'Space' : key);
    await advance(page, 25);
    const after = await state(page);
    assert.equal(after.player.action, action, `${key} starts ${action}`);
    assert.ok(after.player.stamina < before.player.stamina, `${action} consumes stamina`);
    events.push({ type: 'keyboard-action', action, stamina: after.player.stamina });
  }
  await advance(page, 1600);
  await page.keyboard.press('r');
  await advance(page, 25);
  const heal = await state(page);
  assert.ok(heal.player.action === 'heal' || heal.player.hp === 100 || /无需|已满|满血/.test(heal.message), 'R heals or reports that healing is unnecessary');
  await advance(page, 1600);
  await page.keyboard.press('q');
  await advance(page, 25);
  assert.equal((await state(page)).lockedId, null, 'Q in the safe room cannot acquire an absent enemy');
  await page.keyboard.press('e');
  await advance(page, 25);
  const note = await state(page);
  assert.ok(note.collected.includes('laptop') || /笔记本|下播|夜宵/.test(note.message), 'E reads the laptop opening');
  await page.keyboard.press('Escape');
  const paused = await state(page);
  assert.equal(paused.paused, true);
  await advance(page, 3000);
  const stillPaused = await state(page);
  assert.equal(stillPaused.time, paused.time, 'Pause freezes simulation time');
  assert.deepEqual(stillPaused.player, paused.player, 'Pause freezes the player');
  assert.deepEqual(stillPaused.enemies, paused.enemies, 'Pause freezes every enemy');
  await capture(page, '03-paused');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).paused, false);
  await page.keyboard.press('m');
  await capture(page, '04-map');
  await page.keyboard.press('m');
};

const checkCamera = async page => {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  const before = await textState(page);
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.57);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.62, { steps: 12 });
  await page.mouse.up();
  await advance(page, 60);
  const after = await textState(page);
  assert.ok(before.camera && after.camera, 'Text state exposes camera orientation for 3D verification');
  assert.notEqual(after.camera.yaw, before.camera.yaw, 'Real pointer drag changes camera yaw');
  await capture(page, '02-room-camera');
  await page.evaluate(() => window.nightRain.resetCamera());
};

const touchHold = async (page, cdp, locator, ms) => {
  const box = await locator.boundingBox();
  assert.ok(box, 'The touch control is visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await advance(page, ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

const checkMobile = async browser => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await context.addInitScript(installVirtualPointerLock); const page = await context.newPage();
  observe(page);
  await open(page);
  await page.getByRole('button', { name: '出门找夜宵', exact: true }).tap();
  const cdp = await context.newCDPSession(page);
  const before = (await state(page)).player;
  await touchHold(page, cdp, page.getByRole('button', { name: '向右', exact: true }), 240);
  assert.ok(distance(before, (await state(page)).player) > 0.35, 'Real mobile touch moves the player');
  const released = (await state(page)).player;
  await advance(page, 450);
  assert.ok(distance(released, (await state(page)).player) < 0.05, 'Releasing touch clears movement');
  await page.getByRole('button', { name: '轻击', exact: true }).tap();
  await advance(page, 25);
  assert.equal((await state(page)).player.action, 'light', 'Mobile attack uses the real action button');
  await capture(page, '10-mobile-portrait');
  await advance(page, 1500);
  await page.setViewportSize({ width: 844, height: 390 });
  await capture(page, '11-mobile-landscape');
  await page.setViewportSize({ width: 320, height: 740 });
  await capture(page, '12-small-portrait');
  await context.close();
};

const checkRefresh = async page => {
  await page.evaluate(() => window.nightRain.save());
  const saved = await state(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.nightRain);
  const resume = page.getByRole('button', { name: /继续.*雨|继续旅程|继续寻味/ });
  if (await resume.count()) await resume.first().click();
  const restored = await state(page);
  for (const field of ['deaths', 'level', 'charm', 'shortcut', 'bossDefeated', 'checkpoint']) {
    assert.deepEqual(restored[field], saved[field], `Refresh preserves ${field}`);
  }
  assert.deepEqual(restored.collected, saved.collected, 'Refresh preserves collected exploration rewards');
  events.push({ type: 'refresh', checkpoint: restored.checkpoint, collected: restored.collected });
};

const main = async () => {
  const response = await fetch(`${base}/game/night-rain`);
  assert.equal(response.status, 200, 'The actual game URL must respond before Chrome launches');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(installVirtualPointerLock); const page = await context.newPage();
    observe(page);
    await open(page);
    await capture(page, '01-title');
    await page.getByRole('button', { name: '出门找夜宵', exact: true }).click();
    assert.equal((await state(page)).mode, 'playing');
    await checkCamera(page);
    await checkKeyboard(page);
    await checkRefresh(page);
    await checkMobile(browser);
    assert.deepEqual([...new Set(errors)], [], 'No browser console, page or HTTP errors');
    writeFileSync(join(output, 'report.json'), JSON.stringify({ base, scope: 'keyboard-camera-pause-map-refresh-mobile', evidence, events, errors, final: await state(page) }, null, 2));
    console.log(`Night Rain input verification passed: ${evidence.length} screenshots. Full-route combat and ending are separate acceptance requirements.`);
  } finally { await browser.close(); }
};

if (require.main === module) main().catch(error => {
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ message: error.stack, evidence, events, errors }, null, 2));
  console.error(error);
  process.exitCode = 1;
});

module.exports = { state, textState, advance, input, distance, capture, observe, open, touchHold };
