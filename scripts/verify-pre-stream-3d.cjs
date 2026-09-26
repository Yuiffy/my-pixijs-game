const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.PRE_STREAM_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const output = process.env.PRE_STREAM_QA_DIR || 'tmp/pre-stream-3d-verify';
const screenshots = [];
const errors = [];
const observations = [];
const foodItems = ['bread', 'berry', 'cream', 'mint'];
const poses = ['smile', 'blink', 'tilt'];
const obsSources = ['camera', 'mic', 'chat', 'overlay', 'desktop'];
const liveTransitionMs = 2000;
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const mark = scenario => console.log(`[pre-stream-3d] ${scenario}`);

async function assertAudioState(page, expected, scenario) {
  await page.waitForFunction(values => {
    const current = JSON.parse(window.render_game_to_text()).audio;
    return current && Object.entries(values).every(([key, value]) => current[key] === value);
  }, expected);
  const current = (await state(page)).audio;
  assert.ok(current, `${scenario}: audio state must be exposed for verification`);
  for (const [key, value] of Object.entries(expected)) assert.equal(current[key], value, `${scenario}: audio.${key}`);
  const root = page.locator('main[data-phase]');
  assert.equal(await root.getAttribute('data-audio-enabled'), String(current.enabled), `${scenario}: DOM enabled state`);
  assert.equal(await root.getAttribute('data-audio-active'), String(current.active), `${scenario}: DOM active state`);
  return current;
}

async function assertAudioRuntime(page, expected, scenario) {
  await page.waitForFunction(values => {
    const runtime = JSON.parse(window.render_game_to_text()).audio?.runtime;
    return runtime && Object.entries(values).every(([key, value]) => runtime[key] === value);
  }, expected);
  const runtime = (await state(page)).audio.runtime;
  for (const [key, value] of Object.entries(expected)) assert.equal(runtime[key], value, `${scenario}: audio.runtime.${key}`);
  assert.equal(runtime.disposed, false, `${scenario}: mounted audio helper must remain available`);
  assert.ok(Number.isFinite(runtime.volume) && runtime.volume >= 0 && runtime.volume <= 1, `${scenario}: runtime volume must be normalized`);
  return runtime;
}

async function setTestVisibility(page, hidden) {
  await page.evaluate(value => {
    if (value) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    } else {
      Reflect.deleteProperty(document, 'hidden');
      Reflect.deleteProperty(document, 'visibilityState');
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

function observeErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  const layout = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    scrollWidth: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(canvas => ({
      width: canvas.width,
      height: canvas.height,
      bounds: canvas.getBoundingClientRect().toJSON(),
    })),
  }));
  assert.ok(layout.scrollWidth <= layout.viewport[0] + 1, JSON.stringify(layout));
  assert.ok(layout.canvas.length > 0, 'The 3D game canvas is missing');
  const canvas = layout.canvas[0];
  assert.ok(canvas.width > 200 && canvas.height > 200, JSON.stringify(canvas));
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  const rect = canvas.bounds;
  const scenePixels = inspectPng(await page.screenshot({
    clip: {
      x: Math.max(0, Math.floor(rect.x + 5)),
      y: Math.max(0, Math.floor(rect.y + 5)),
      width: Math.max(100, Math.floor(rect.width - 10)),
      height: Math.max(100, Math.floor(rect.height - 10)),
    },
    animations: 'disabled',
  }));
  const current = await state(page);
  screenshots.push({ file, pixels, scenePixels, layout, state: current });
  return current;
}

async function visit(page, id, expected, touch = false) {
  const button = page.locator(`[data-station="${id}"]`);
  if (touch) await button.tap(); else await button.click();
  if (touch) {
    const tapped = await state(page);
    assert.ok(tapped.target === id || expected(tapped), `Touch station ${id} did not activate: ${JSON.stringify(tapped)}`);
  }
  for (let i = 0; i < 180; i++) {
    const current = await state(page);
    if (expected(current)) return current;
    await advance(page, 96);
  }
  throw new Error(`Could not finish ${id}: ${JSON.stringify(await state(page))}`);
}

async function sprayTarget(page) {
  const board = page.locator('[data-aim-area]');
  const bounds = await board.boundingBox();
  assert.ok(bounds && bounds.width > 100 && bounds.height > 100);
  const point = current => ({
    x: bounds.x + bounds.width * current.minigame.targetX,
    y: bounds.y + bounds.height * current.minigame.targetY,
  });
  let mini = (await state(page)).minigame;
  let target = point({ minigame: mini });
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  for (let i = 0; i < 360; i++) {
    const current = await state(page);
    mini = current.minigame;
    if (mini?.stage === 'flush-ready') break;
    assert.equal(mini?.kind, 'toilet', JSON.stringify(current));
    target = point(current);
    await page.mouse.move(target.x, target.y);
    await advance(page, 50);
  }
  await page.mouse.up();
  assert.equal((await state(page)).minigame?.stage, 'flush-ready', 'Aimed spray should reach the flush stage');
}

async function plateFood(page, touch = false) {
  const sequence = (await state(page)).minigame.sequence;
  for (let plate = 0; plate < sequence.length; plate++) {
    const pastry = foodItems.indexOf(sequence[plate]);
    assert.ok(pastry >= 0);
    const pastryButton = page.locator(`[data-food-pastry="${pastry}"]`);
    const slotButton = page.locator(`[data-food-slot="${plate}"]`);
    if (touch) { await pastryButton.tap(); await slotButton.tap(); }
    else { await pastryButton.click(); await slotButton.click(); }
    const current = await state(page);
    assert.ok(current.phase === 'explore' || current.minigame.foodPlaced[plate] === pastry);
  }
  assert.ok((await state(page)).completed.includes('food'), 'Food must complete from pastry-to-plate clicks');
}

async function pourCat(page) {
  for (let scoop = 0; scoop < 3; scoop++) {
    const current = await state(page);
    if (current.phase === 'explore') break;
    assert.equal(current.minigame?.kind, 'cat');
    const button = await page.locator('[data-cat-pour]').boundingBox();
    assert.ok(button);
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await advance(page, Math.round(current.minigame.targetX * 1500));
    await page.mouse.up();
    const after = await state(page);
    assert.ok(after.phase === 'explore' || after.minigame.hits === current.minigame.hits + 1, `Cat pour failed: ${JSON.stringify(after.minigame)}`);
  }
  assert.ok((await state(page)).completed.includes('cat'), 'Measured cat scoops must complete');
}

async function pourCatTouch(page) {
  const client = await page.context().newCDPSession(page);
  try {
    for (let scoop = 0; scoop < 3; scoop++) {
      const current = await state(page);
      if (current.phase === 'explore') break;
      assert.equal(current.minigame?.kind, 'cat');
      const button = await page.locator('[data-cat-pour]').boundingBox();
      assert.ok(button);
      const point = { x: button.x + button.width / 2, y: button.y + button.height / 2, id: 1 };
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await advance(page, Math.round(current.minigame.targetX * 1500));
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point] });
      const after = await state(page);
      assert.ok(after.phase === 'explore' || after.minigame.hits === current.minigame.hits + 1, `Touch cat pour failed: ${JSON.stringify(after.minigame)}`);
    }
  } finally { await client.detach(); }
  assert.ok((await state(page)).completed.includes('cat'));
}

async function sprayTargetTouch(page) {
  const client = await page.context().newCDPSession(page);
  const bounds = await page.locator('[data-aim-area]').boundingBox();
  assert.ok(bounds && bounds.width > 100 && bounds.height > 100);
  const point = mini => ({ x: bounds.x + bounds.width * mini.targetX, y: bounds.y + bounds.height * mini.targetY, id: 1 });
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point((await state(page)).minigame)] });
    for (let step = 0; step < 360; step++) {
      const current = await state(page);
      if (current.minigame?.stage === 'flush-ready') break;
      assert.equal(current.minigame?.kind, 'toilet');
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(current.minigame)] });
      await advance(page, 50);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await client.detach(); }
  assert.equal((await state(page)).minigame?.stage, 'flush-ready');
}

async function tuneAudio(page) {
  const targets = (await state(page)).minigame.audioTargets;
  for (let index = 0; index < targets.length; index++) {
    const slider = page.locator(`[data-audio-channel="${index}"]`);
    const bounds = await slider.boundingBox();
    assert.ok(bounds);
    await page.mouse.click(bounds.x + 8 + (bounds.width - 16) * targets[index], bounds.y + bounds.height / 2);
    let current = (await state(page)).minigame.audioLevels[index];
    for (let correction = 0; Math.abs(current - targets[index]) > 0.06 && correction < 20; correction++) {
      await slider.focus();
      await page.keyboard.press(current < targets[index] ? 'ArrowRight' : 'ArrowLeft');
      current = (await state(page)).minigame.audioLevels[index];
    }
    assert.ok(Math.abs(current - targets[index]) <= 0.075, `Audio channel ${index}: ${current} vs ${targets[index]}`);
  }
  await page.locator('[data-minigame-action]').click();
  assert.equal((await state(page)).minigame?.stage, 'testing');
  await advance(page, 1300);
  assert.ok((await state(page)).completed.includes('audio'), 'Mixer test must complete');
}

async function captureVts(page) {
  for (let step = 0; step < 3; step++) {
    const current = await state(page);
    const pose = poses.indexOf(current.minigame.sequence[current.minigame.poseIndex]);
    assert.ok(pose >= 0);
    await page.locator(`[data-vts-pose="${pose}"]`).click();
  }
  const finished = await state(page);
  assert.ok(finished.completed.includes('vts') || finished.incidents.active.includes('power'), 'Prompted expressions must complete or trigger the power event');
}

async function wipeSpill(page) {
  const area = await page.locator('[data-spill-area]').boundingBox();
  assert.ok(area && area.width > 100);
  const stains = (await state(page)).minigame.stains;
  for (let index = 0; index < stains.length; index++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await state(page);
      if (current.phase === 'explore' || current.minigame.stains[index].clean >= 3) break;
      const stain = current.minigame.stains[index];
      const left = area.x + area.width * (stain.x - 0.1);
      const right = area.x + area.width * (stain.x + 0.1);
      const y = area.y + area.height * stain.y;
      await page.mouse.move(left, y);
      await page.mouse.down();
      await page.mouse.move(right, y);
      await page.mouse.move(left, y);
      await page.mouse.move(right, y);
      await page.mouse.up();
    }
    const after = await state(page);
    assert.ok(after.phase === 'explore' || after.minigame.stains[index].clean >= 3, `Stain ${index} not wiped: ${JSON.stringify(after.minigame)}`);
  }
  assert.ok((await state(page)).incidents.resolved.includes('spill'), 'Separate stains must complete');
}

async function lureCat(page) {
  for (let attempt = 0; attempt < 240; attempt++) {
    const current = await state(page);
    assert.equal(current.minigame?.kind, 'catwalk');
    if (current.minigame.stage === 'confirm') break;
    if (current.minigame.targetX >= 0.8 && current.minigame.cooldownMs === 0) {
      await page.locator('[data-catwalk-action]').click();
      await advance(page, 300);
    } else await advance(page, 50);
  }
  assert.equal((await state(page)).minigame?.stage, 'confirm', 'Timed cat lure must reach confirm stage');
  await page.locator('[data-catwalk-action]').click();
  assert.ok((await state(page)).incidents.resolved.includes('catwalk'));
}

async function reconnectCable(page) {
  for (const [plug, socket] of [1, 2, 0].entries()) {
    await page.locator(`[data-cable-plug="${plug}"]`).click();
    await page.locator(`[data-cable-socket="${socket}"]`).click();
    assert.equal((await state(page)).minigame.cablePairs[plug], socket);
  }
  assert.equal((await state(page)).minigame?.stage, 'confirm');
  await page.locator('[data-minigame-action]').click();
  assert.ok((await state(page)).incidents.resolved.includes('cable'));
}

async function connectObs(page) {
  const needed = (await state(page)).minigame.sequence;
  for (const source of needed) {
    const index = obsSources.indexOf(source);
    assert.ok(index >= 0);
    await page.locator(`[data-obs-source="${index}"]`).click();
    assert.equal((await state(page)).minigame.obsEnabled[index], true);
  }
  assert.equal(await page.locator('[data-obs-source="4"]').getAttribute('aria-pressed'), 'false', 'Desktop decoy must stay off');
  await page.locator('[data-minigame-action]').click();
  assert.equal((await state(page)).minigame?.stage, 'confirm');
  await page.locator('[data-minigame-action]').click();
  const finished = await state(page);
  assert.ok(finished.completed.includes('obs') || finished.incidents.active.includes('power'), 'OBS must complete or trigger the power event');
}

async function restartPower(page) {
  await page.locator('[data-minigame-action]').click();
  assert.equal((await state(page)).minigame?.stage, 'booting');
  await advance(page, 1400);
  assert.ok((await state(page)).incidents.resolved.includes('power'));
}

async function sweepGlass(page) {
  for (let index = 0; index < 4; index++) await page.locator(`[data-glass-shard="${index}"]`).click();
  assert.ok((await state(page)).incidents.resolved.includes('glass'));
}

async function scoopLitter(page) {
  const clumps = (await state(page)).minigame.litterClumps;
  for (const index of clumps) await page.locator(`[data-litter-cell="${index}"]`).click();
  assert.ok((await state(page)).incidents.resolved.includes('litter'));
}

async function clearBowel(page) {
  for (const index of [7, 12, 13, 18, 23]) await page.locator(`[data-bowel-cell="${index}"]`).click();
  await page.locator('[data-minigame-action]').click();
  assert.equal((await state(page)).minigame?.stage, 'flowing');
  await advance(page, 1700);
  assert.ok((await state(page)).incidents.resolved.includes('bowel'));
}

async function solveMini(page, kind) {
  if (kind === 'food') return plateFood(page);
  if (kind === 'cat') return pourCat(page);
  if (kind === 'audio') return tuneAudio(page);
  if (kind === 'vts') return captureVts(page);
  if (kind === 'obs') return connectObs(page);
  if (kind === 'spill') return wipeSpill(page);
  if (kind === 'cable') return reconnectCable(page);
  if (kind === 'catwalk') return lureCat(page);
  if (kind === 'power') return restartPower(page);
  if (kind === 'glass') return sweepGlass(page);
  if (kind === 'litter') return scoopLitter(page);
  if (kind === 'bowel') return clearBowel(page);
  throw new Error(`No UI solver for ${kind}`);
}

async function resolveIncident(page, id, captureOnce = false) {
  await visit(page, id, current => current.minigame?.kind === id);
  if (captureOnce) await capture(page, `incident-${id}-night-three`);
  await solveMini(page, id);
  assert.ok((await state(page)).incidents.resolved.includes(id));
}

async function resolveActiveIncidents(page, seen = null) {
  while ((await state(page)).incidents.active.length > 0) {
    const id = (await state(page)).incidents.active[0];
    await resolveIncident(page, id, seen !== null && !seen.has(id));
    if (seen) seen.add(id);
  }
}

async function finishComputerTasks(page, seen = null) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await resolveActiveIncidents(page, seen);
    const current = await state(page);
    if (!current.completed.includes('vts')) {
      await visit(page, 'vts', value => value.minigame?.kind === 'vts');
      await captureVts(page);
    } else if (!current.completed.includes('obs')) {
      await visit(page, 'obs', value => value.minigame?.kind === 'obs');
      await connectObs(page);
    } else if (current.incidents.queue.length === 0) return;
  }
  throw new Error(`Computer setup never finished: ${JSON.stringify(await state(page))}`);
}

async function routeToComputerThenInteract(page) {
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 80; i++) {
    const current = await state(page);
    if (Math.hypot(current.player.x - 3.1, current.player.z) > 1.6) break;
    await advance(page, 64);
  }
  await page.keyboard.up('KeyD');
  const away = await state(page);
  assert.equal(away.phase, 'explore');
  assert.ok(Math.hypot(away.player.x - 3.1, away.player.z) > 1.6, `Move away from the OBS terminal before remote route test: ${JSON.stringify({ player: away.player, cat: away.cat })}`);
  await page.locator('[data-station="obs"]').click();
  assert.equal((await state(page)).phase, 'explore', 'Remote OBS click must not begin live transition');
  for (let i = 0; i < 180 && (await state(page)).target === 'obs'; i++) await advance(page, 96);
  const arrived = await state(page);
  assert.equal(arrived.target, null, 'Avatar must arrive at the bedroom computer');
  assert.equal(arrived.phase, 'explore', 'Arrival alone must not begin live transition');
  assert.ok(Math.hypot(arrived.player.x - 3.1, arrived.player.z) <= 1.6, 'Avatar must be physically near OBS');
  assert.equal(await page.locator('#go-live').count(), 0, 'Floating remote Go Live command must be absent');
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 40; i++) {
    const current = await state(page);
    if (Math.hypot(current.player.x - 3.1, current.player.z) >= 1.38) break;
    await advance(page, 32);
  }
  await page.keyboard.up('KeyD');
  const edge = await state(page);
  const edgeDistance = Math.hypot(edge.player.x - 3.1, edge.player.z);
  assert.ok(edgeDistance > 1.3 && edgeDistance <= 1.6, `OBS edge range ${edgeDistance}`);
  assert.match(await page.locator('#interact').innerText(), /正式上播/);
  await page.keyboard.press('KeyE');
  assert.equal((await state(page)).phase, 'countdown', 'E at the terminal must begin live transition');
}

async function verifyLiveTransition(page, name) {
  const overlay = page.getByTestId('live-transition');
  await overlay.waitFor();
  const started = await state(page);
  const voiceBefore = started.audio.runtime.voiceScheduledCount;
  assert.equal(started.phase, 'countdown');
  assert.ok(started.countdownMs > 1000 && started.countdownMs <= liveTransitionMs, `Transition starts at two seconds: ${started.countdownMs}`);
  assert.equal(await page.getByTestId('live-standby').isVisible(), true, 'Standby image must appear first');
  assert.equal(await page.getByTestId('live-avatar').isVisible(), false, 'Avatar reveal must wait until the second half');
  assert.doesNotMatch(await overlay.innerText(), /[0-9０-９]|三、二、一/, 'Transition must not show a numeric countdown');
  await assertAudioRuntime(page, { requested: false, fading: true, muted: false }, 'live transition begins audio fade');
  await capture(page, `${name}-standby`);

  await page.keyboard.press('KeyP');
  const paused = await state(page);
  assert.equal(paused.paused, true, 'Live transition can pause');
  await assertAudioState(page, { active: false, suspended: true }, 'paused live transition');
  await assertAudioRuntime(page, { playing: false, muted: true, fading: false, voiceActive: false }, 'paused live transition audio');
  await advance(page, 2500);
  assert.equal((await state(page)).countdownMs, paused.countdownMs, 'Paused transition time must freeze');
  await page.locator('#resume-game').click();
  assert.equal((await state(page)).paused, false);
  await assertAudioState(page, { active: false, suspended: false }, 'resumed live transition');

  await advance(page, Math.max(0, (await state(page)).countdownMs - 700));
  assert.equal((await state(page)).phase, 'countdown');
  assert.equal(await page.getByTestId('live-avatar').isVisible(), true, 'Avatar image must replace standby in the second half');
  assert.equal(await page.getByTestId('live-standby').isVisible(), false, 'Standby image must leave after the reveal');
  const revealedAudio = (await state(page)).audio.runtime;
  assert.equal(revealedAudio.voiceScheduledCount, voiceBefore + 1, 'Avatar reveal must schedule the live-start voice once');
  assert.doesNotMatch(await overlay.innerText(), /[0-9０-９]|三、二、一/, 'Avatar reveal must not show a numeric countdown');
  await capture(page, `${name}-avatar`);
  await advance(page, (await state(page)).countdownMs + 100);
  const result = await state(page);
  assert.equal(result.phase, 'result', 'Two-second transition must end in the score screen');
  assert.ok(Math.abs(result.elapsedMs - started.elapsedMs - started.countdownMs) < 1, 'Transition must add only its remaining duration to elapsed time');
  assert.equal(await overlay.count(), 0, 'Transition overlay must leave the result screen');
  await assertAudioState(page, { active: false }, 'result screen');
  await assertAudioRuntime(page, { requested: false, playing: false, fading: false }, 'result waiting music stopped');
  assert.equal(result.audio.runtime.voiceScheduledCount, voiceBefore + 1, 'Result must not repeat the live-start voice');
  return result;
}

async function main() {
  mkdirSync(output, { recursive: true });
  const response = await fetch(`${base}/game/pre-stream`);
  assert.equal(response.status, 200, 'The target dev server must answer before launching Chrome');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.HEADED !== '1',
    args: ['--mute-audio', '--disable-speech-api'],
  });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    observeErrors(page);
    await page.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
    mark('desktop boot and movement');
    await capture(page, 'title-desktop');
    await page.locator('#start-game').click();
    await advance(page, 100);
    await capture(page, 'explore-desktop');
    observations.push({ scenario: 'start-and-render', state: await state(page) });

    mark('audio toggle and background suspension');
    const audioToggle = page.getByTestId('audio-toggle');
    await audioToggle.waitFor();
    if (!(await state(page)).audio.enabled) await audioToggle.click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio?.active === true);
    await assertAudioState(page, { enabled: true, active: true, suspended: false }, 'sound enabled during preparation');
    const initialAudio = await assertAudioRuntime(page, { requested: true, playing: true, muted: false }, 'waiting track really playing');
    assert.equal(initialAudio.trackId, 'waiting-op', 'The supplied waiting OP must be selected');
    assert.equal(initialAudio.loop, true, 'The waiting OP must actually loop');
    assert.equal(await audioToggle.getAttribute('aria-pressed'), 'true');
    const volume = page.getByTestId('audio-volume');
    assert.equal(await volume.count(), 1, 'Volume control must be available');
    await volume.press('Home');
    await volume.press('ArrowRight');
    const volumeMax = Number(await volume.getAttribute('max'));
    const selectedVolume = Number(await volume.inputValue()) / volumeMax;
    assert.ok(selectedVolume > 0 && selectedVolume <= 1, 'Volume slider must change to a normalized nonzero value');
    await assertAudioRuntime(page, { volume: selectedVolume }, 'volume preference reaches audio helper');
    await audioToggle.click();
    await assertAudioState(page, { enabled: false, active: false }, 'sound toggle off');
    await assertAudioRuntime(page, { playing: false, muted: true, voiceActive: false }, 'sound toggle mutes player');
    assert.equal(await audioToggle.getAttribute('aria-pressed'), 'false');
    await audioToggle.click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio?.active === true);
    await assertAudioState(page, { enabled: true, active: true }, 'sound toggle on');
    await assertAudioRuntime(page, { requested: true, playing: true, muted: false }, 'sound toggle resumes player');
    await setTestVisibility(page, true);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).paused === true);
    const background = await state(page);
    await assertAudioState(page, { active: false, suspended: true }, 'background tab');
    await assertAudioRuntime(page, { playing: false, muted: true, voiceActive: false }, 'background player muted');
    await advance(page, 1200);
    assert.equal((await state(page)).elapsedMs, background.elapsedMs, 'Background tab must freeze the game clock');
    await setTestVisibility(page, false);
    assert.equal((await state(page)).paused, true, 'Returning to the tab must wait for player resume');
    await assertAudioState(page, { active: false, suspended: true }, 'returned but still paused');
    await page.locator('#resume-game').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio?.active === true);
    await assertAudioState(page, { active: true, suspended: false }, 'player resumed after background');
    await assertAudioRuntime(page, { requested: true, playing: true, muted: false }, 'audio resumed after background');
    observations.push({ scenario: 'audio-lifecycle', toggle: 'on-off-on', backgroundPaused: true, resultStopsWaiting: true });

    const startX = (await state(page)).player.x;
    await page.keyboard.down('KeyD');
    await advance(page, 500);
    await page.keyboard.up('KeyD');
    assert.ok((await state(page)).player.x > startX + 0.6, 'WASD must move the 3D avatar');
    observations.push({ scenario: 'keyboard-movement', player: (await state(page)).player });

    await page.locator('[data-objective-task="food"]').click();
    assert.equal((await state(page)).selectedStation, 'food', 'Clicking the task title must select its station');
    await capture(page, 'selected-objective-desktop');

    await visit(page, 'thermos', current => current.water.cup === 'carried-empty');
    await visit(page, 'dispenser', current => current.water.cup === 'filling');
    const fillBefore = (await state(page)).water.fillMs;
    const toilet = await visit(page, 'toilet', current => current.phase === 'minigame' && current.minigame?.kind === 'toilet');
    assert.ok(toilet.water.fillMs > fillBefore, 'The dispenser must keep filling while walking to the toilet');
    await capture(page, 'toilet-aim-desktop');
    await sprayTarget(page);
    const aimed = await capture(page, 'toilet-flush-ready-desktop');
    assert.ok(aimed.minigame.splashCount >= 3, 'The shooter should create visible splashes');
    await page.locator('[data-flush]').click();
    assert.equal((await state(page)).minigame?.stage, 'flushing');
    await capture(page, 'toilet-flushing-desktop');
    await advance(page, 1900);
    assert.ok((await state(page)).completed.includes('toilet'), 'Flushing must complete the toilet task');
    await advance(page, (await state(page)).water.fillRequiredMs);
    assert.equal((await state(page)).water.cup, 'ready');
    await visit(page, 'dispenser', current => current.water.cup === 'carried-full');
    const drank = await visit(page, 'thermos', current => current.water.cup === 'drank');
    assert.ok(drank.completed.includes('water'));
    observations.push({ scenario: 'background-fill-and-toilet-full-chain', elapsedMs: drank.elapsedMs, splashes: aimed.minigame.splashCount, completed: drank.completed });
    await capture(page, 'water-and-toilet-done-desktop');

    const incident = (await state(page)).incidents.active[0];
    if (incident) {
      await visit(page, incident, current => current.minigame?.kind === incident);
      await capture(page, 'incident-desktop');
      await solveMini(page, incident);
      assert.ok((await state(page)).incidents.resolved.includes(incident));
    }

    mark('desktop distinct mini-games');
    await visit(page, 'food', current => current.minigame?.kind === 'food');
    await capture(page, 'food-desktop');
    await plateFood(page);
    await resolveActiveIncidents(page);
    await visit(page, 'cat', current => current.minigame?.kind === 'cat');
    await capture(page, 'cat-desktop');
    await pourCat(page);
    await resolveActiveIncidents(page);
    await visit(page, 'audio', current => current.minigame?.kind === 'audio');
    await capture(page, 'audio-desktop');
    await tuneAudio(page);
    await page.keyboard.down('KeyD');
    await advance(page, 200);
    await page.keyboard.up('KeyD');
    await page.locator('canvas').hover();
    await page.mouse.wheel(0, 120);
    assert.ok((await state(page)).selectedStation, `Wheel should select a nearby unfinished station: ${JSON.stringify((await state(page)).player)}`);
    observations.push({ scenario: 'wheel-select-nearby', selectedStation: (await state(page)).selectedStation });
    await resolveActiveIncidents(page);
    await visit(page, 'vts', current => current.minigame?.kind === 'vts');
    await capture(page, 'vts-desktop');
    await captureVts(page);
    await resolveActiveIncidents(page);
    await visit(page, 'obs', current => current.minigame?.kind === 'obs');
    await capture(page, 'obs-desktop');
    await connectObs(page);
    await finishComputerTasks(page);
    const prepared = await state(page);
    assert.equal(prepared.completed.length, 7);
    assert.equal(prepared.incidents.resolved.length, 1);
    mark('physical OBS return and E to go live');
    await routeToComputerThenInteract(page);
    await verifyLiveTransition(page, 'live-desktop');
    const result = await capture(page, 'result-desktop');
    assert.equal(result.phase, 'result');
    observations.push({ scenario: 'full-night-complete', elapsedMs: result.elapsedMs, stars: result.records.best[1].stars, completed: result.completed, incidents: result.incidents.resolved });

    const saveContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const savePage = await saveContext.newPage();
    observeErrors(savePage);
    await savePage.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
    await savePage.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
    mark('save pause reload resume');
    await savePage.locator('#start-game').click();
    await visit(savePage, 'thermos', current => current.water.cup === 'carried-empty');
    await visit(savePage, 'dispenser', current => current.water.cup === 'filling');
    await advance(savePage, 1600);
    await capture(savePage, 'water-filling-desktop');
    await savePage.locator('#pause-game').click();
    const paused = await capture(savePage, 'paused-desktop');
    await advance(savePage, 5000);
    assert.equal((await state(savePage)).water.fillMs, paused.water.fillMs);
    assert.equal((await state(savePage)).elapsedMs, paused.elapsedMs);
    await savePage.reload({ waitUntil: 'networkidle' });
    await savePage.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
    const restored = await state(savePage);
    assert.equal(restored.paused, true);
    assert.equal(restored.water.cup, 'filling');
    assert.equal(restored.water.fillMs, paused.water.fillMs);
    await savePage.locator('#resume-game').click();
    await advance(savePage, 1000);
    assert.ok((await state(savePage)).water.fillMs > paused.water.fillMs);
    observations.push({ scenario: 'pause-reload-resume-water', fillBefore: paused.water.fillMs, fillAfter: (await state(savePage)).water.fillMs });
    await saveContext.close();

    const lateContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await lateContext.addInitScript(() => {
      localStorage.setItem('sui-pre-stream-records-v2', JSON.stringify({ version: 2, best: { 1: { elapsedMs: 90000, stars: 3 }, 2: { elapsedMs: 120000, stars: 3 } }, unlocked: 3 }));
    });
    const late = await lateContext.newPage();
    observeErrors(late);
    await late.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
    await late.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
    mark('night three and all incidents');
    await late.locator('[data-level="3"]').click();
    await late.locator('#start-game').click();
    const incidentFixture = await state(late);
    await visit(late, 'thermos', current => current.water.cup === 'carried-empty');
    await visit(late, 'dispenser', current => current.water.cup === 'filling');
    await visit(late, 'food', current => current.minigame?.kind === 'food');
    await plateFood(late);
    await visit(late, 'toilet', current => current.minigame?.kind === 'toilet');
    await sprayTarget(late);
    await late.locator('[data-flush]').click();
    await advance(late, 1900);
    const seenIncidents = new Set();
    await resolveActiveIncidents(late, seenIncidents);
    for (const station of ['cat', 'audio', 'vts']) {
      await visit(late, station, current => current.minigame?.kind === station);
      await solveMini(late, station);
      await resolveActiveIncidents(late, seenIncidents);
    }
    const filling = await state(late);
    if (filling.water.cup === 'filling') await advance(late, filling.water.fillRequiredMs - filling.water.fillMs + 100);
    await visit(late, 'dispenser', current => current.water.cup === 'carried-full');
    await visit(late, 'thermos', current => current.water.cup === 'drank');
    await resolveActiveIncidents(late, seenIncidents);
    await finishComputerTasks(late, seenIncidents);
    assert.equal(seenIncidents.size, 3, 'Third night must resolve three incidents');
    assert.equal((await state(late)).completed.length, 7);
    observations.push({ scenario: 'night-three-all-incidents', incidents: [...seenIncidents].sort() });
    await routeToComputerThenInteract(late);
    await advance(late, liveTransitionMs + 100);
    assert.equal((await state(late)).phase, 'result', 'Third night must finish after all incidents');
    await assertAudioRuntime(late, { requested: false, playing: false, fading: false }, 'uninterrupted transition finishes its audio fade');
    await lateContext.close();

    mark('new incident interaction and responsive layouts');
    for (const id of ['power', 'glass', 'litter', 'bowel']) {
      const compact = id === 'litter' || id === 'bowel';
      const width = id === 'bowel' ? 320 : compact ? 390 : 1280;
      const height = id === 'bowel' ? 740 : compact ? 844 : 800;
      const fixture = {
        ...incidentFixture,
        paused: true,
        incidents: { active: [id], resolved: [], queue: ['spill', 'cable'] },
      };
      const eventContext = await browser.newContext({ viewport: { width, height }, hasTouch: compact, isMobile: compact, deviceScaleFactor: 1 });
      await eventContext.addInitScript(save => {
        localStorage.setItem('sui-pre-stream-run-v2', JSON.stringify(save));
        localStorage.setItem('sui-pre-stream-records-v2', JSON.stringify({ version: 2, best: { 1: { elapsedMs: 90000, stars: 3 }, 2: { elapsedMs: 120000, stars: 3 } }, unlocked: 3 }));
      }, fixture);
      const eventPage = await eventContext.newPage();
      observeErrors(eventPage);
      await eventPage.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
      await eventPage.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
      assert.equal((await state(eventPage)).paused, true, `Saved ${id} incident should restore paused`);
      await eventPage.locator('#resume-game').click();
      await visit(eventPage, id, current => current.minigame?.kind === id);
      await capture(eventPage, `incident-${id}-${width}`);
      await solveMini(eventPage, id);
      assert.ok((await state(eventPage)).incidents.resolved.includes(id), `${id} should resolve through UI controls`);
      await eventContext.close();
    }

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const mobile = await mobileContext.newPage();
    observeErrors(mobile);
    await mobile.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
    await mobile.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
    mark('mobile joystick and layout');
    await capture(mobile, 'title-mobile-390');
    await mobile.locator('#start-game').tap();
    await mobile.locator('[data-objective-task="food"]').tap();
    assert.equal((await state(mobile)).selectedStation, 'food', 'Mobile task title must select its station');
    await advance(mobile, 100);
    await capture(mobile, 'explore-mobile-390');
    const mobileX = (await state(mobile)).player.x;
    const joystick = await mobile.locator('[aria-label="移动摇杆"]').boundingBox();
    assert.ok(joystick && joystick.width >= 60);
    const client = await mobileContext.newCDPSession(mobile);
    const center = { x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2, id: 1 };
    const right = { x: center.x + joystick.width * 0.28, y: center.y, id: 1 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [right] });
    await advance(mobile, 500);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [right] });
    await client.detach();
    assert.ok((await state(mobile)).player.x > mobileX + 0.3, 'Touch joystick must move the avatar');
    const releasedX = (await state(mobile)).player.x;
    await advance(mobile, 500);
    assert.ok(Math.abs((await state(mobile)).player.x - releasedX) < 0.02, 'Releasing the touch joystick must stop movement');
    observations.push({ scenario: 'touch-joystick-and-toilet-layout', player: (await state(mobile)).player });
    await mobileContext.close();

    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const touchPage = await touchContext.newPage();
    observeErrors(touchPage);
    await touchPage.goto(`${base}/game/pre-stream`, { waitUntil: 'networkidle' });
    await touchPage.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
    await touchPage.locator('#start-game').tap();
    await visit(touchPage, 'food', current => current.minigame?.kind === 'food', true);
    await capture(touchPage, 'food-mobile-390');
    await plateFood(touchPage, true);
    await touchPage.setViewportSize({ width: 320, height: 740 });
    await visit(touchPage, 'cat', current => current.minigame?.kind === 'cat', true);
    await capture(touchPage, 'cat-mobile-320');
    await pourCatTouch(touchPage);
    await visit(touchPage, 'toilet', current => current.phase === 'minigame' && current.minigame?.kind === 'toilet', true);
    await capture(touchPage, 'toilet-mobile-320');
    await sprayTargetTouch(touchPage);
    await touchPage.locator('[data-flush]').tap();
    await capture(touchPage, 'flush-mobile-320');
    await advance(touchPage, 1900);
    assert.ok((await state(touchPage)).completed.includes('toilet'));
    await touchContext.close();

    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, observations, screenshots, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, screenshots: screenshots.map(item => item.file), observations }, null, 2));
  } catch (error) {
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, failure: String(error.stack || error), observations, screenshots, errors }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
