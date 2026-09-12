const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.PRE_STREAM_BASE_URL || 'http://127.0.0.1:3855';
const output = process.env.PRE_STREAM_QA_DIR || 'tmp/pre-stream-verify';
const tasks = ['water', 'toilet', 'food', 'cat', 'audio', 'vts', 'obs'];
const arrows = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', primary: 'Space' };
const screenshots = [];
const observed = [];
const errors = [];
const photographedActivities = new Set();
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const primary = page => page.locator('[data-control="primary"]');

function observeErrors(page) {
  page.on('pageerror', error => errors.push({ url: page.url(), message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ url: page.url(), message: message.text() });
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push({ url: response.url(), status: response.status() });
  });
}

async function open(page) {
  await page.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
  await advance(page, 0);
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    clippedControls: [...document.querySelectorAll('main button, main input')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => element.textContent || element.id),
  }));
  assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
  assert.deepEqual(layout.clippedControls, []);
  const canvas = await page.locator('canvas').evaluate(element => ({
    width: element.width, height: element.height, cssWidth: element.clientWidth,
  }));
  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 540);
  assert.ok(canvas.cssWidth > 250);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  screenshots.push({ file, pixels, layout, canvas, state: await state(page) });
}

async function aimPoint(page, value) {
  const box = await page.locator('canvas').boundingBox();
  assert.ok(box && box.width > 0);
  return { x: box.x + (180 + value * 6) / 960 * box.width, y: box.y + 360 / 540 * box.height };
}

async function aim(page, value) {
  const point = await aimPoint(page, value);
  await page.mouse.move(point.x, point.y);
}

async function tapControl(page, control) {
  await page.keyboard.press(arrows[control]);
  await advance(page, 0);
}

async function hold(page, ms) {
  await page.keyboard.down('Space');
  await advance(page, ms);
  await page.keyboard.up('Space');
  await advance(page, 0);
}

async function solveActivity(page, photograph = true) {
  const start = await state(page);
  const id = start.activity?.id;
  assert.ok(id, JSON.stringify(start));
  assert.equal(start.phase, 'activity');
  if (photograph && !photographedActivities.has(id)) {
    await capture(page, `activity-${id}-desktop`);
    photographedActivities.add(id);
  }

  for (let frame = 0; frame < 2400; frame++) {
    const current = await state(page);
    if (current.phase !== 'activity' || current.activity?.id !== id) return current;
    assert.equal(current.paused, false, 'Unexpected pause during input pilot; freeze source edits and keep Chrome focused while verifying');
    const activity = current.activity;
    const view = current.view;
    assert.ok(view && view.instruction, `Activity ${id} must explain its controls`);
    if (id === 'water') {
      if (activity.stage === 0) {
        await page.keyboard.down('Space');
        for (let fill = 0; fill < 600; fill++) {
          if ((await state(page)).activity.progress >= 75) break;
          await advance(page, 20);
        }
        await page.keyboard.up('Space');
        await advance(page, 0);
      } else await hold(page, 100);
    } else if (activity.stage < activity.sequence.length) {
      await tapControl(page, activity.sequence[activity.stage]);
      await advance(page, 50);
    } else if (id === 'toilet') {
      await hold(page, 100);
    } else if (id === 'obs') {
      await tapControl(page, 'primary');
      await advance(page, 200);
    } else if (id === 'food') {
      if (activity.cursor >= view.targetMin + 2 && activity.cursor <= view.targetMax - 2) {
        await tapControl(page, 'primary');
        await advance(page, 200);
      } else await advance(page, 15);
    } else if (['cat', 'vts', 'catwalk', 'audio'].includes(id)) {
      await aim(page, activity.target);
      await page.keyboard.down('Space');
      await advance(page, 40);
      await page.keyboard.up('Space');
    } else {
      throw new Error(`No legal control strategy for ${JSON.stringify(current)}`);
    }
  }
  throw new Error(`Activity did not finish through legal controls: ${JSON.stringify(await state(page))}`);
}

async function clearIncidents(page, photograph) {
  while ((await state(page)).activity) await solveActivity(page, photograph);
}

async function finishLevel(page, expectedStars, photograph = true) {
  let current = await state(page);
  const level = current.level;
  assert.ok(current.phase === 'room' || current.phase === 'activity');
  if (current.activity) await clearIncidents(page, photograph);
  for (const task of tasks) {
    if ((await state(page)).completed.some(result => result.id === task)) continue;
    assert.equal((await state(page)).phase, 'room');
    await page.locator(`[data-task="${task}"]`).click();
    await advance(page, 0);
    assert.equal((await state(page)).activity?.id, task);
    await solveActivity(page, photograph);
    await clearIncidents(page, photograph);
  }
  current = await state(page);
  assert.equal(current.phase, 'room');
  assert.deepEqual(current.completed.map(task => task.id).sort(), [...tasks].sort());
  assert.equal(current.incidents.length, level);
  assert.ok(current.completed.every(task => task.elapsedMs > 0 && task.stars >= 1 && task.stars <= 3));
  assert.equal(await page.locator('#go-live').isEnabled(), true);

  // Deliberately wait through real room time to exercise all three overall rating bands.
  const ratingFloor = expectedStars === 2 ? 100000 : expectedStars === 1 ? 300000 : 0;
  if (current.elapsedMs < ratingFloor) await advance(page, ratingFloor - current.elapsedMs);
  const readyAt = (await state(page)).elapsedMs;
  await page.locator('#go-live').click();
  assert.equal((await state(page)).phase, 'countdown');
  await advance(page, 1200);
  if (level === 1) {
    await page.locator('#pause-game').click();
    const frozen = await state(page);
    await advance(page, 20000);
    assert.deepEqual(await state(page), frozen, 'Paused countdown must freeze time');
    await page.locator('#resume-game').click();
  }
  await advance(page, 4000);
  current = await state(page);
  assert.equal(current.phase, 'result', JSON.stringify(current));
  assert.equal(current.elapsedMs, readyAt + 3000, 'The three-second broadcast countdown is included exactly once');
  assert.equal(current.stars, expectedStars);
  assert.equal(current.records.best[String(level)].stars, expectedStars, JSON.stringify(current));
  assert.equal(current.records.best[String(level)].elapsedMs, current.elapsedMs);
  assert.match(await page.locator('main').innerText(), /\d+分钟\d{2}秒/);
  const frozen = current;
  await advance(page, 60000);
  assert.deepEqual(await state(page), frozen, 'Result clock must stop after going live');
  await capture(page, `result-level-${level}-${expectedStars}-stars-${photograph ? 'desktop' : 'storage-unavailable'}`);
  observed.push({ scenario: `full-level-${level}`, elapsedMs: current.elapsedMs, expectedStars, tasks: current.completed, incidents: current.incidents });
  return current;
}

async function touchHold(page, ms) {
  await primary(page).scrollIntoViewIfNeeded();
  const box = await primary(page).boundingBox();
  const client = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await advance(page, ms);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await advance(page, 0);
  await client.detach();
}

async function touchTrack(page) {
  await primary(page).scrollIntoViewIfNeeded();
  const box = await primary(page).boundingBox();
  const buttonPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  const client = await page.context().newCDPSession(page);
  let target = { ...await aimPoint(page, (await state(page)).activity.target), id: 2 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [buttonPoint] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [buttonPoint, target] });
  for (let frame = 0; frame < 800 && (await state(page)).activity?.id === 'cat'; frame++) {
    target = { ...await aimPoint(page, (await state(page)).activity.target), id: 2 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [buttonPoint, target] });
    await advance(page, 40);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
  assert.ok((await state(page)).completed.some(task => task.id === 'cat'), 'Two-finger tracking must finish cat feeding');
}

async function mouseTrack(page) {
  await page.locator('[data-task="cat"]').click();
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await aim(page, (await state(page)).activity.target);
  await page.mouse.down();
  for (let frame = 0; frame < 30; frame++) {
    await aim(page, (await state(page)).activity.target);
    await advance(page, 40);
  }
  assert.ok((await state(page)).activity.progress > 20);
  await capture(page, 'cat-mouse-drag-desktop');
  await page.mouse.move(15, 15);
  await page.mouse.up();
  const released = (await state(page)).activity.progress;
  await advance(page, 300);
  assert.equal((await state(page)).activity.progress, released, 'Releasing outside the canvas must stop pouring');
  await aim(page, (await state(page)).activity.target);
  await page.mouse.down();
  await advance(page, 100);
  await page.keyboard.press('p');
  const paused = await state(page);
  assert.equal(paused.paused, true);
  await advance(page, 1000);
  assert.deepEqual(await state(page), paused);
  await page.mouse.up();
  await page.locator('#resume-game').click();
  await advance(page, 300);
  assert.equal((await state(page)).activity.progress, paused.activity.progress, 'Pause/resume must clear a canvas-owned hold');
  await aim(page, (await state(page)).activity.target);
  await page.mouse.down();
  for (let frame = 0; frame < 800 && (await state(page)).activity?.id === 'cat'; frame++) {
    await aim(page, (await state(page)).activity.target);
    await advance(page, 40);
  }
  await page.mouse.up();
  assert.ok((await state(page)).completed.some(task => task.id === 'cat'), 'Mouse-only hold-drag must finish cat feeding');
  observed.push({ scenario: 'mouse-only-canvas-track-release-outside-and-pause', completed: (await state(page)).completed });
}

async function oneFingerTrack(page) {
  await page.locator('[data-task="vts"]').tap();
  const client = await page.context().newCDPSession(page);
  const position = async () => ({ ...await aimPoint(page, (await state(page)).activity.target), id: 1 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await position()] });
  for (let frame = 0; frame < 800 && (await state(page)).activity?.id === 'vts'; frame++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await position()] });
    await advance(page, 40);
    if (frame === 30) {
      assert.ok((await state(page)).activity.progress > 20);
      await capture(page, 'vts-single-finger-drag-mobile-390');
    }
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
  assert.ok((await state(page)).completed.some(task => task.id === 'vts'), 'One finger on the artwork must aim and hold calibration together');
  observed.push({ scenario: 'mobile-one-finger-canvas-track', completed: (await state(page)).completed });
}

(async () => {
  mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/pre-stream`)).status, 200, 'The dev server must respond before Chrome launches');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' });
  let lastPage;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    lastPage = page;
    observeErrors(page);
    await open(page);
    assert.equal((await state(page)).phase, 'title');
    assert.equal((await state(page)).records.unlocked, 1);
    assert.equal(await page.locator('[data-level="2"]').isEnabled(), false);
    await capture(page, 'title-desktop');
    await page.locator('#start-game').click();
    assert.equal((await state(page)).phase, 'room');
    assert.ok(await page.locator('#go-live').count() === 0 || !await page.locator('#go-live').isEnabled(), 'Broadcast is unavailable until all preparations are complete');
    await page.locator('[data-task="water"]').click();
    await page.keyboard.down('Space');
    await advance(page, 650);
    await page.locator('#pause-game').click();
    await page.keyboard.up('Space');
    const paused = await state(page);
    assert.equal(paused.paused, true);
    assert.ok(paused.activity.progress > 0);
    await advance(page, 10000);
    assert.deepEqual(await state(page), paused);
    await capture(page, 'water-paused-desktop');
    await page.reload({ waitUntil: 'networkidle' });
    await advance(page, 0);
    assert.deepEqual(await state(page), paused, 'Refresh must restore a paused in-progress activity');
    await page.locator('#resume-game').click();
    const beforeRelease = await state(page);
    await advance(page, 150);
    assert.equal((await state(page)).activity.progress, beforeRelease.activity.progress, 'Pausing/reloading must release held controls');
    await finishLevel(page, 3);
    await page.locator('#choose-level').click();
    assert.equal((await state(page)).phase, 'title');
    assert.equal(await page.locator('[data-level="2"]').isEnabled(), true);
    assert.equal(await page.locator('[data-level="3"]').isEnabled(), false);
    await page.locator('[data-level="2"]').click();
    await page.locator('#start-game').click();
    assert.equal((await state(page)).level, 2);
    await finishLevel(page, 2);
    await page.locator('#next-level').click();
    assert.equal((await state(page)).level, 3);
    const final = await finishLevel(page, 1);
    assert.equal(final.records.unlocked, 3);
    assert.deepEqual([...new Set(observed.flatMap(item => item.incidents || []))].sort(), ['cable', 'catwalk', 'spill']);
    await page.reload({ waitUntil: 'networkidle' });
    await advance(page, 0);
    assert.deepEqual((await state(page)).records, final.records);
    assert.equal((await state(page)).phase, 'result');
    await page.locator('#replay-level').click();
    const replay = await state(page);
    assert.equal(replay.level, 3);
    assert.equal(replay.phase, 'room');
    assert.equal(replay.elapsedMs, 0);
    assert.deepEqual(replay.completed, []);
    assert.deepEqual(replay.records, final.records);
    observed.push({ scenario: 'pause-refresh-records-replay-and-level-selection', records: final.records });
    await page.locator('#pause-game').click();
    await page.getByRole('button', { name: '重开本晚', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'Tab must stay inside restart dialog');
    }
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    const modalState = await state(page);
    await page.keyboard.press('p');
    await advance(page, 3000);
    assert.deepEqual(await state(page), modalState, 'P must not resume gameplay behind a dialog');
    await capture(page, 'restart-dialog-desktop');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.equal((await state(page)).paused, true, 'Escape dismisses restart without resuming');
    await page.locator('#resume-game').click();
    await page.keyboard.press('p');
    assert.equal((await state(page)).paused, true);
    await page.keyboard.press('p');
    assert.equal((await state(page)).paused, false);
    await page.keyboard.press('Escape');
    assert.equal((await state(page)).paused, true);
    await page.locator('#resume-game').click();
    await page.locator('[data-task="water"]').click();
    await page.locator('#pause-game').focus();
    await page.keyboard.press('Space');
    assert.equal((await state(page)).paused, true, 'Space on the focused pause button must activate that button');
    assert.equal((await state(page)).activity.progress, 0, 'Focused navigation Space must not also fill the cup');
    await page.locator('#resume-game').click();
    await page.keyboard.press('f');
    await page.waitForFunction(() => !!document.fullscreenElement);
    await capture(page, 'room-fullscreen-desktop');
    await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurred = await state(page);
    assert.equal(blurred.paused, true);
    await advance(page, 2000);
    assert.deepEqual(await state(page), blurred);
    observed.push({ scenario: 'keyboard-pause-escape-fullscreen-and-blur-freeze' });

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const mobile = await mobileContext.newPage();
    lastPage = mobile;
    observeErrors(mobile);
    await open(mobile);
    await capture(mobile, 'title-mobile-390');
    await mobile.locator('#start-game').tap();
    await mobile.locator('[data-task="water"]').tap();
    await touchHold(mobile, 3300);
    assert.equal((await state(mobile)).activity.stage, 1);
    await touchHold(mobile, 2240);
    assert.ok((await state(mobile)).completed.some(task => task.id === 'water'));
    await mobile.locator('[data-task="cat"]').tap();
    await capture(mobile, 'cat-mobile-390');
    await touchTrack(mobile);
    await clearIncidents(mobile, false);
    observed.push({ scenario: 'mobile-real-touch-hold-and-two-finger-track', completed: (await state(mobile)).completed });
    await oneFingerTrack(mobile);
    await mobile.setViewportSize({ width: 320, height: 740 });
    await mobile.locator('[data-task="food"]').tap();
    await capture(mobile, 'food-mobile-320');
    await mobile.locator('#pause-game').tap();
    await capture(mobile, 'paused-mobile-320');

    const mouseContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const mousePage = await mouseContext.newPage();
    lastPage = mousePage;
    observeErrors(mousePage);
    await open(mousePage);
    await mousePage.locator('#start-game').click();
    await mouseTrack(mousePage);

    const blockedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await blockedContext.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Unavailable', 'SecurityError'); } });
    });
    const blocked = await blockedContext.newPage();
    lastPage = blocked;
    observeErrors(blocked);
    await open(blocked);
    await blocked.locator('#start-game').click();
    const blockedResult = await finishLevel(blocked, 3, false);
    assert.equal(blockedResult.phase, 'result');
    observed.push({ scenario: 'storage-unavailable-complete-run', elapsedMs: blockedResult.elapsedMs });

    const realtimeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const realtime = await realtimeContext.newPage();
    lastPage = realtime;
    observeErrors(realtime);
    await realtime.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
    await realtime.waitForFunction(() => !!window.render_game_to_text);
    await realtime.locator('#start-game').click();
    const wallStart = (await state(realtime)).elapsedMs;
    await realtime.evaluate(() => {
      const end = performance.now() + 650;
      while (performance.now() < end) { /* Simulate a slow foreground frame, without touching game state. */ }
    });
    await realtime.waitForTimeout(120);
    const elapsed = (await state(realtime)).elapsedMs - wallStart;
    assert.ok(elapsed >= 650 && elapsed < 5000, `Foreground timer must count long frames: ${elapsed}`);
    await realtime.locator('#pause-game').click();
    await capture(realtime, 'clock-real-foreground-desktop');
    observed.push({ scenario: 'real-foreground-stall-time', elapsedMs: elapsed });
    assert.deepEqual(errors, [], 'Browser must have no console, page or failed response errors');
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, observed, screenshots, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, screenshots: screenshots.map(item => item.file), observed }, null, 2));
  } catch (error) {
    if (lastPage && !lastPage.isClosed()) {
      await capture(lastPage, 'failure').catch(() => {});
      observed.push({ scenario: 'failure-state', state: await state(lastPage).catch(() => null) });
    }
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, failure: String(error.stack || error), observed, screenshots, errors }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
