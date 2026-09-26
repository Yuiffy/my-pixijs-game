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
const out = process.env.FLICK_CLEANUP_QA_DIR || 'tmp/flick-chess-cleanup-verify';
const errors = [];
const captures = [];
const readState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));

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

async function checkedScreenshot(page, file, options) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return inspectPng(await page.screenshot({ path: file, ...options }));
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  throw new Error(`${file}: ${lastError.message}. Retry with FLICK_HEADED=1 if Chrome capture is suspect.`);
}

async function capture(page, name) {
  await page.locator('[data-game-canvas="flick-chess"]').waitFor({ state: 'visible', timeout: 10000 });
  const before = await readState(page);
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="flick-chess"]');
    const box = canvas.getBoundingClientRect();
    return {
      canvasTag: canvas.tagName,
      viewport: [innerWidth, innerHeight],
      document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      canvasCss: [box.width, box.height],
      canvasPixels: [canvas.width, canvas.height],
    };
  });
  assert.equal(layout.canvasTag, 'CANVAS');
  assert.ok(layout.document[0] <= layout.viewport[0] + 1, JSON.stringify(layout));
  assert.ok(layout.canvasCss.every(value => value > 0), JSON.stringify(layout));
  assert.ok(layout.canvasPixels.every(value => value > 0), JSON.stringify(layout));
  assert.equal(before.pieces.length, 32);
  assert.ok(before.cleanup && typeof before.cleanup.phase === 'string', JSON.stringify(before.cleanup));

  const file = path.join(out, `${name}.png`);
  const full = await checkedScreenshot(page, file, { fullPage: true });
  const surfaceFile = path.join(out, `${name}-canvas.png`);
  const surface = await checkedScreenshot(page.locator('[data-game-canvas="flick-chess"]'), surfaceFile, {});
  const after = await readState(page);
  captures.push({
    name, file, surfaceFile, full, surface, layout,
    before: { phase: before.phase, shotCount: before.shotCount, remaining: before.remaining, cleanup: before.cleanup },
    after: { phase: after.phase, shotCount: after.shotCount, remaining: after.remaining, cleanup: after.cleanup },
  });
}

async function ready(page, navigate = true) {
  if (navigate) await page.goto(`${base}/game/flick-chess`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-game-canvas="flick-chess"]');
    const box = canvas?.getBoundingClientRect();
    if (!canvas || !box || box.width <= 0 || box.height <= 0 || typeof window.render_game_to_text !== 'function') return false;
    const state = JSON.parse(window.render_game_to_text());
    return state.pieces.length === 32 && state.cleanup?.phase === 'idle';
  }, undefined, { timeout: 60000 });
  await page.waitForFunction(() => performance.getEntriesByType('resource')
    .filter(entry => entry.name.includes('/images/autochess/portraits/minimal/')).length >= 32,
  undefined, { timeout: 20000 });
  await page.getByRole('button', { name: '本地双人' }).click();
  try {
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'local', undefined, { timeout: 5000 });
  } catch {
    const state = await readState(page);
    throw new Error(`Mode switch failed: ${JSON.stringify({ mode: state.mode, phase: state.phase, shotCount: state.shotCount, cleanup: state.cleanup, errors })}`);
  }
  await page.waitForTimeout(250);
}

async function startShot(page, touchInput) {
  const start = await readState(page);
  assert.equal(start.phase, 'aiming');
  assert.equal(start.turn, 'red');
  const piece = start.pieces.find(candidate => candidate.id === 'red-15');
  assert.ok(piece?.inPlay && !piece.exit, 'red-15 must begin on the board');
  const canvasBox = await page.locator('[data-game-canvas="flick-chess"]').boundingBox();
  const viewport = page.viewportSize();
  const from = project(piece, canvasBox, viewport, start.board);
  const to = project({ ...piece, x: piece.x - 4.1 }, canvasBox, viewport, start.board);

  await page.evaluate(() => {
    const samples = [];
    const timer = window.setInterval(() => {
      const state = JSON.parse(window.render_game_to_text());
      const last = samples.at(-1);
      if (last?.phase !== state.cleanup.phase || last?.collected !== state.cleanup.collected) {
        samples.push({ at: performance.now(), ...state.cleanup });
      }
    }, 16);
    window.__cleanupProbe = { samples, timer };
  });

  if (touchInput) {
    const cdp = await page.context().newCDPSession(page);
    const point = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
    for (let step = 1; step <= 12; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(from.x + (to.x - from.x) * step / 12, from.y + (to.y - from.y) * step / 12),
      });
    }
    assert.ok(await page.locator('[aria-label^="力度 "]').isVisible(), 'Touch pull should show the aim meter.');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: point(to.x, to.y) });
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    assert.ok(await page.locator('[aria-label^="力度 "]').isVisible(), 'Mouse pull should show the aim meter.');
    await page.mouse.up();
  }
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotCount === 1, undefined, { timeout: 2500 });
}

async function verifyViewport(browser, name, contextOptions, touchInput) {
  const page = await browser.newPage(contextOptions);
  page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`${name}: ${error.stack || error.message}`));
  try {
    await ready(page);
    await capture(page, `${name}-ready`);
    await startShot(page, touchInput);

    const captured = new Set();
    const deadline = Date.now() + 24000;
    let finished = false;
    while (Date.now() < deadline) {
      const current = await readState(page);
      const phase = current.cleanup.phase;
      if (phase !== 'idle' && !captured.has(phase)) {
        captured.add(phase);
        if (['flying', 'seeking', 'collecting', 'carrying', 'dropping'].includes(phase)) {
          await capture(page, `${name}-${phase}`);
          if (phase === 'flying') {
            const untilMidFlight = await page.evaluate(() => {
              const started = window.__cleanupProbe.samples.find(item => item.phase === 'flying')?.at ?? performance.now();
              return Math.max(0, 300 - (performance.now() - started));
            });
            if (untilMidFlight > 0) await page.waitForTimeout(untilMidFlight);
            assert.equal((await readState(page)).cleanup.phase, 'flying', 'Flight must last long enough for a mid-air frame.');
            await capture(page, `${name}-flying-mid`);
          }
        }
      }
      const fallen = current.pieces.find(piece => piece.id === 'red-15');
      if (!fallen.inPlay && phase === 'idle' && current.cleanup.collected >= 1 && current.cleanup.pending === 0) {
        finished = true;
        break;
      }
      await page.waitForTimeout(35);
    }
    await capture(page, `${name}-complete`);

    const final = await readState(page);
    const history = await page.evaluate(() => {
      window.clearInterval(window.__cleanupProbe.timer);
      return window.__cleanupProbe.samples;
    });
    assert.ok(finished, `Cleanup did not finish: ${JSON.stringify({ final: final.cleanup, history })}`);
    assert.equal(final.mode, 'local');
    assert.equal(final.shotCount, 1);
    assert.equal(final.remaining.red, 15);
    assert.equal(final.pieces.find(piece => piece.id === 'red-15').inPlay, false);
    assert.ok(final.pieces.find(piece => piece.id === 'red-15').exit);
    assert.equal(final.cleanup.phase, 'idle');
    assert.ok(final.cleanup.collected >= 1);
    assert.ok(history.some(item => item.phase === 'flying'), JSON.stringify(history));
    assert.ok(history.some(item => item.phase === 'seeking'), JSON.stringify(history));
    assert.ok(history.some(item => item.phase === 'carrying'), JSON.stringify(history));
    assert.ok(captures.some(item => item.name === `${name}-flying`), 'A flight screenshot is required.');
    assert.ok(captures.some(item => item.name === `${name}-flying-mid`), 'A mid-flight screenshot is required.');
    assert.ok(captures.some(item => item.name === `${name}-complete`), 'A basket screenshot is required.');

    await page.getByRole('button', { name: '重新开局' }).click();
    await page.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      return state.shotCount === 0 && state.cleanup.phase === 'idle'
        && state.cleanup.collected === 0 && state.cleanup.pending === 0;
    }, undefined, { timeout: 5000 });
    const reset = await readState(page);
    assert.equal(reset.mode, 'local');
    assert.deepEqual(reset.remaining, { red: 16, blue: 16 });
    assert.ok(reset.pieces.every(piece => piece.inPlay && !piece.exit));
    await capture(page, `${name}-reset`);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready(page, false);
      const reloaded = await readState(page);
      assert.equal(reloaded.mode, 'local');
      assert.equal(reloaded.shotCount, 0);
      assert.equal(reloaded.cleanup.phase, 'idle');
    }
    return {
      name, history, modeReloads: 3,
      final: { phase: final.phase, turn: final.turn, shotCount: final.shotCount, remaining: final.remaining, cleanup: final.cleanup },
      reset: { phase: reset.phase, shotCount: reset.shotCount, remaining: reset.remaining, cleanup: reset.cleanup },
    };
  } finally {
    await page.close();
  }
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const response = await fetch(`${base}/game/flick-chess`, { signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, 200, `Dev server at ${base} must answer before Playwright starts.`);
  assert.ok((await response.text()).includes('维阿弹棋'), `Stale or incorrect dev server at ${base}.`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.FLICK_HEADED !== '1',
    args: ['--mute-audio', '--disable-speech-api'],
  });
  try {
    const desktop = await verifyViewport(browser, 'desktop', { viewport: { width: 1440, height: 900 } }, false);
    const mobile = await verifyViewport(browser, 'mobile', {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    }, true);
    assert.deepEqual(errors, []);
    const report = { base, desktop, mobile, captures, errors };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); console.error('Browser errors:', errors); process.exitCode = 1; });
