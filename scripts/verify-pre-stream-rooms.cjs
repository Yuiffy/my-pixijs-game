const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.PRE_STREAM_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const output = process.env.PRE_STREAM_QA_DIR || 'tmp/pre-stream-rooms-verify';
const shots = [];
const errors = [];
const observations = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(160);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  const snapshot = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    scrollWidth: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(canvas => [canvas.width, canvas.height]),
    state: JSON.parse(window.render_game_to_text()),
  }));
  assert.ok(snapshot.canvas[0]?.[0] > 200 && snapshot.canvas[0]?.[1] > 200, `${name}: missing canvas`);
  assert.ok(snapshot.scrollWidth <= snapshot.viewport[0] + 1, `${name}: horizontal overflow`);
  assert.ok(pixels.colors > 32 && pixels.nearBlackRatio < 0.95 && pixels.transparentRatio < 0.95, `${name}: invalid screenshot`);
  shots.push({ file, pixels, ...snapshot });
}

async function findCatWest(page) {
  for (let i = 0; i < 140; i++) {
    const current = await state(page);
    if (current.cat.x < -0.4 && current.cat.x < current.player.x - 0.5) return current;
    await advance(page, 100);
  }
  throw new Error('The roaming cat never reached the west living room');
}

async function enterBedroom(page, touch) {
  const thermos = page.locator('[data-station="thermos"]');
  if (touch) await thermos.tap();
  else await thermos.click();
  let previous = await state(page);
  assert.equal(previous.target, 'thermos', 'The thermos should start automatic walking');
  let crossing = null;
  for (let i = 0; i < 160; i++) {
    await advance(page, 96);
    const current = await state(page);
    if (previous.player.x < 1.2 && current.player.x >= 1.2) {
      crossing = { from: previous.player, to: current.player };
      assert.ok(current.player.z >= 0.65 && current.player.z <= 1.35, `Player missed the bedroom doorway: ${JSON.stringify(crossing)}`);
    }
    if (current.player.x > 1.7) {
      assert.ok(crossing, 'The player entered the bedroom without crossing the doorway');
      return { player: current.player, crossing, target: current.target };
    }
    previous = current;
  }
  throw new Error(`The player did not enter the bedroom: ${JSON.stringify(await state(page))}`);
}

async function main() {
  mkdirSync(output, { recursive: true });
  const response = await fetch(`${base}/game/pre-stream`);
  assert.equal(response.status, 200, 'The target server must answer before launching Chrome');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.HEADED !== '1',
    args: ['--mute-audio', '--disable-speech-api'],
  });
  try {
    for (const [name, width, height] of [
      ['desktop', 1440, 900],
      ['mobile-390', 390, 844],
      ['mobile-320', 320, 740],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        isMobile: width < 500,
        hasTouch: width < 500,
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(`${name}: ${message.text()}`);
      });
      await page.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
      await capture(page, `${name}-title`);
      if (width < 500) await page.locator('#start-game').tap();
      else await page.locator('#start-game').click();
      await capture(page, `${name}-explore`);
      const catWest = await findCatWest(page);
      assert.ok(catWest.cat.x < 1.2 && catWest.player.x < 1.2);
      observations.push({ viewport: name, scenario: 'cat-west', cat: catWest.cat, player: catWest.player });
      await capture(page, `${name}-cat-west`);
      const bedroom = await enterBedroom(page, width < 500);
      observations.push({ viewport: name, scenario: 'player-bedroom', ...bedroom });
      await capture(page, `${name}-player-bedroom`);
      await context.close();
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, shots, observations, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, shots: shots.map(shot => shot.file), observations, errors }));
  } catch (error) {
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, failure: String(error.stack || error), shots, observations, errors }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
