const assert = require('node:assert/strict');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright',
  'C:/Users/apple/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright',
].filter(Boolean);
let chromium;
for (const candidate of candidates) {
  try {
    if (candidate.includes('/') && !existsSync(candidate)) continue;
    ({ chromium } = require(candidate));
    break;
  } catch { /* Use the next installed Playwright runtime. */ }
}
if (!chromium) throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright module.');

const base = process.env.REMAINING_SEAT_BASE_URL || 'http://127.0.0.1:3896';
const output = path.resolve(process.env.REMAINING_SEAT_QA_DIR || 'tmp/remaining-seat');
const url = `${base}/game/remaining-seat?qa=1`;
const screenshots = [];
const checks = [];
const errors = [];
const required = [['letter', 'portrait', 'table'], ['desk', 'clock', 'table'], ['cradle', 'portrait', 'letter']];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const pose = page => page.evaluate(() => window.__remainingSeatScene.getPose());
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function quiet(context) {
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    let lockedElement = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockedElement });
    Element.prototype.requestPointerLock = function requestPointerLock() {
      lockedElement = this;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      lockedElement = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
  });
}

async function open(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.render_game_to_text && !!window.__remainingSeatScene);
  assert.equal((await state(page)).game, 'remaining-seat');
}

async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.ok(Math.max(dimensions.body, dimensions.document) <= dimensions.viewport + 1, JSON.stringify(dimensions));
}

async function capture(page, name) {
  await page.waitForTimeout(350);
  await noOverflow(page);
  const canvas = await page.locator('canvas').evaluate(element => ({ width: element.width, height: element.height, bounds: { width: element.clientWidth, height: element.clientHeight } }));
  assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.bounds.width > 0, 'Scene canvas must have a visible drawing surface');
  const renderer = await page.evaluate(() => window.__remainingSeatScene.getStats());
  assert.ok(renderer.calls > 0 && renderer.triangles > 0, 'The renderer must submit visible scene geometry');
  const file = path.join(output, `${name}.png`);
  let metrics;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const buffer = await page.screenshot({ path: file, fullPage: true });
      metrics = inspectPng(buffer);
      break;
    } catch (error) {
      if (attempt) throw new Error(`${name}: ${error.message}. Retry with HEADED=1 using installed Chrome; this is a capture failure until scene state proves otherwise.`);
      await page.waitForTimeout(650);
    }
  }
  const snapshot = await state(page);
  screenshots.push({ file, metrics, canvas, renderer, state: snapshot });
  writeFileSync(path.join(output, `${name}.json`), JSON.stringify({ state: snapshot, canvas, renderer, metrics }, null, 2));
  return snapshot;
}

async function approach(page, id) {
  await page.waitForFunction(() => {
    const current = JSON.parse(window.render_game_to_text());
    return current.phase === 'playing' && !current.paused;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(object => window.__remainingSeatScene.approach(object), id);
  try {
    await page.waitForFunction(object => JSON.parse(window.render_game_to_text()).focus === object, id, { timeout: 10000 });
  } catch (error) {
    throw new Error(`Cannot focus ${id}: ${JSON.stringify(await state(page))}; pose=${JSON.stringify(await pose(page))}. ${error.message}`);
  }
}

async function inspect(page, id, touch = false) {
  await approach(page, id);
  if (touch) await page.locator('#remaining-interact').tap();
  else await page.keyboard.press('KeyE');
  await page.locator('[data-choice]').first().waitFor();
  assert.ok((await state(page)).modal, `${id} must open an inspection`);
}

async function choose(page, id) {
  await page.locator(`[data-choice="${id}"]`).click();
  await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).modal);
}

async function clue(page, id) { await inspect(page, id); await choose(page, 'keep'); }

async function completeChapter(page, chapter) {
  assert.equal((await state(page)).chapter, chapter);
  for (const id of required[chapter]) if (!(await state(page)).interacted.includes(id)) await clue(page, id);
  assert.equal((await state(page)).ready, true);
  if (chapter < 2) {
    await inspect(page, 'door');
    await choose(page, 'next');
    await page.waitForFunction(expected => JSON.parse(window.render_game_to_text()).chapter === expected, chapter + 1);
    assert.deepEqual((await state(page)).interacted, []);
  }
}

async function blockedMovement(page, label) {
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).paused === true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const before = await pose(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  const after = await pose(page);
  assert.ok(distance(before, after) < 0.001, `${label} must freeze movement: ${JSON.stringify({ before, after })}`);
}

async function main() {
  mkdirSync(output, { recursive: true });
  const response = await fetch(`${base}/game/remaining-seat`, { signal: AbortSignal.timeout(120000) });
  assert.equal(response.status, 200, 'Confirm the target responds before launching Chrome');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await quiet(context);
    const page = await context.newPage();
    await open(page);
    assert.equal((await state(page)).phase, 'title');
    await capture(page, '01-title-desktop');
    await page.locator('#remaining-start').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing');
    await capture(page, '02-chapter-one');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', ctrlKey: true, bubbles: true })));
    assert.equal((await state(page)).modal, null, 'Ctrl+J remains a browser shortcut and cannot open the journal');

    await page.evaluate(() => window.__remainingSeatScene.teleport(2.6, 3.7, 0));
    for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
      const before = await pose(page);
      await page.keyboard.down(key);
      await page.waitForTimeout(350);
      await page.keyboard.up(key);
      assert.ok(distance(before, await pose(page)) > 0.15, `${key} moves the body`);
    }
    const heading = (await pose(page)).yaw;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');
    assert.ok(Math.abs((await pose(page)).yaw - heading) > 0.1, 'Arrow keys turn the view');
    await page.evaluate(() => window.__remainingSeatScene.teleport(0, 5.6, Math.PI));
    await page.waitForTimeout(250);
    assert.equal((await state(page)).focus, null);
    await page.keyboard.press('KeyE');
    assert.equal((await state(page)).modal, null, 'E cannot inspect an object behind the player');
    checks.push('Real W/A/S/D motion, keyboard look and gaze-gated E interaction');

    await inspect(page, 'door');
    assert.equal(await page.locator('[data-choice="next"]').count(), 0);
    await choose(page, 'close');
    await inspect(page, 'letter');
    await capture(page, '03-letter-inspection');
    await blockedMovement(page, 'Inspection');
    await choose(page, 'keep');
    assert.ok((await state(page)).interacted.includes('letter'));
    await page.locator('#remaining-journal').click();
    assert.ok((await state(page)).modal);
    await blockedMovement(page, 'Journal');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).modal);
    await page.locator('#remaining-pause').click();
    await blockedMovement(page, 'Pause');
    await page.locator('#remaining-resume').click();
    checks.push('Locked door, readable note, journal, modal and pause movement blocking');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.render_game_to_text && !!window.__remainingSeatScene);
    assert.equal((await state(page)).phase, 'title');
    await page.locator('#remaining-continue').click();
    assert.ok((await state(page)).interacted.includes('letter'), 'Continue preserves the read clue');
    await completeChapter(page, 0);
    await capture(page, '04-chapter-two');
    await completeChapter(page, 1);
    await capture(page, '05-chapter-three');
    await completeChapter(page, 2);
    const finalSave = await page.evaluate(() => localStorage.getItem('remaining-seat-v1'));
    assert.ok(finalSave, 'Final pre-choice state is autosaved');
    await inspect(page, 'window');
    await choose(page, 'air');
    assert.equal((await state(page)).ending, 'air');
    assert.equal((await state(page)).phase, 'ending');
    await capture(page, '06-ending-air');
    checks.push('Save/reload/continue, all three chapters and window ending via live UI');

    await page.evaluate(saved => localStorage.setItem('remaining-seat-v1', saved), finalSave);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.render_game_to_text && !!window.__remainingSeatScene);
    await page.locator('#remaining-continue').click();
    await inspect(page, 'table');
    await choose(page, 'seat');
    assert.equal((await state(page)).ending, 'seat');
    await capture(page, '07-ending-seat');
    await page.locator('#remaining-start').click();
    assert.equal((await state(page)).chapter, 0);
    assert.equal((await state(page)).ending, null);
    assert.deepEqual((await state(page)).interacted, []);
    checks.push('Second ending and clean restart');

    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await quiet(phoneContext);
    const phone = await phoneContext.newPage();
    await open(phone);
    await phone.setViewportSize({ width: 320, height: 740 });
    await capture(phone, '08-title-mobile-320');
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.locator('#remaining-start').tap();
    await capture(phone, '09-scene-mobile-390');
    await phone.evaluate(() => window.__remainingSeatScene.teleport(2.6, 3.7, 0));
    const forward = await phone.getByRole('button', { name: '向前走', exact: true }).boundingBox();
    assert.ok(forward && forward.width >= 40 && forward.height >= 40, 'Touch movement has a usable hit target');
    const client = await phoneContext.newCDPSession(phone);
    const beforeTouch = await pose(phone);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: forward.x + forward.width / 2, y: forward.y + forward.height / 2 }] });
    await phone.waitForTimeout(450);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(distance(beforeTouch, await pose(phone)) > 0.15, 'Holding touch movement moves the player');
    await phone.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const released = await pose(phone);
    await phone.waitForTimeout(350);
    const afterRelease = await pose(phone);
    assert.ok(distance(released, afterRelease) < 0.03, `Releasing touch movement stops the player: ${JSON.stringify({ released, afterRelease })}`);
    await client.detach();
    await inspect(phone, 'letter', true);
    await capture(phone, '10-note-mobile-390');
    await phone.locator('[data-choice="keep"]').tap();
    assert.ok((await state(phone)).interacted.includes('letter'));
    checks.push('320px title, 390px live scene, real touch movement/release and inspection, no horizontal overflow');

    await phone.setViewportSize({ width: 640, height: 360 });
    await phone.reload({ waitUntil: 'networkidle' });
    await phone.waitForFunction(() => !!window.render_game_to_text && !!window.__remainingSeatScene);
    for (const selector of ['#remaining-start', '#remaining-continue']) {
      await phone.locator(selector).scrollIntoViewIfNeeded();
      const uncovered = await phone.locator(selector).evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const center = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return !!center && (element === center || element.contains(center));
      });
      assert.equal(uncovered, true, `${selector} must remain reachable and uncovered in 640x360 landscape`);
    }
    await capture(phone, '11-title-mobile-landscape-640');
    await phone.locator('#remaining-continue').tap();
    assert.equal((await state(phone)).phase, 'playing');
    assert.ok((await state(phone)).interacted.includes('letter'));
    checks.push('Short landscape title scroll reaches both save/new-run buttons; Ctrl+J does not capture browser shortcut');

    assert.deepEqual(errors, [], 'No page or console errors');
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, checks, screenshots, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, checks, screenshots: screenshots.map(item => item.file), errors }, null, 2));
  } catch (error) {
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, failure: String(error.stack || error), checks, screenshots, errors }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
