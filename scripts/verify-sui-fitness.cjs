const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.FITNESS_BASE_URL || 'http://localhost:3971';
const output = process.env.FITNESS_QA_DIR || 'tmp/sui-fitness-dev';
const recordKey = 'sui-fitness-record-v1';
const errors = [];
const responses = [];
const shots = [];
const scenarios = [];
const liveObservations = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const ready = page => page.waitForFunction(() => typeof window.render_game_to_text === 'function'
  && typeof window.advanceTime === 'function' && JSON.parse(window.render_game_to_text()).assetsReady);
const button = (page, name) => ['继续挑战', '重新挑战', '换个开局', '收起说明'].includes(name)
  ? page.getByRole('dialog').getByRole('button', { name, exact: true })
  : page.getByRole('button', { name, exact: true });
const readRecord = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), recordKey);
const stable = value => ({
  phase: value.phase, day: value.day, time: value.time, elapsed: value.elapsed,
  player: value.player, weight: value.weight, muscle: value.muscle,
  motivation: value.motivation, foods: value.foods, workouts: value.workouts,
  defeats: value.defeats,
});

async function prepare(context) {
  await context.route('**/api/record', route => route.fulfill({ json: { success: true } }));
  await context.route('**/api/demos/visits', route => route.fulfill({ json: { visits: {} } }));
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//,
    route => route.fulfill({ body: '' }));
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  });
  context.on('page', page => {
    page.on('pageerror', error => errors.push({ url: page.url(), text: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ url: page.url(), text: message.text() });
    });
    page.on('response', response => {
      if (response.status() >= 400) responses.push({ status: response.status(), url: response.url() });
    });
  });
}

async function open(context, seed = 41) {
  const page = await context.newPage();
  await page.goto(`${base}/game/sui-fitness?seed=${seed}`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await advance(page, 0);
  assert.equal(await page.locator('canvas').count(), 1);
  return page;
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const box = canvas.getBoundingClientRect();
    const overflow = [...document.querySelectorAll('h1,h2,p,button')]
      .filter(element => element.clientWidth && element.scrollWidth > element.clientWidth + 3)
      .map(element => ({ text: element.textContent, width: element.clientWidth, scroll: element.scrollWidth }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      canvas: { x: box.x, y: box.y, right: box.right, width: box.width, height: box.height,
        backingWidth: canvas.width, backingHeight: canvas.height },
      overflow,
    };
  });
  assert.ok(layout.scrollWidth <= layout.viewport.width + 1, `Page overflows: ${JSON.stringify(layout)}`);
  assert.ok(layout.canvas.x >= -1 && layout.canvas.right <= layout.viewport.width + 1,
    `Canvas overflows: ${JSON.stringify(layout)}`);
  assert.ok(layout.canvas.width > 200 && layout.canvas.height > 100, JSON.stringify(layout));
  assert.equal(layout.canvas.backingWidth, 1100);
  assert.equal(layout.canvas.backingHeight, 700);
  assert.deepEqual(layout.overflow, [], `Text overflows: ${JSON.stringify(layout.overflow)}`);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  shots.push({ file, pixels, layout, state: await state(page) });
}

async function frozen(page) {
  const before = stable(await state(page));
  assert.equal(before.phase, 'paused');
  await advance(page, 2500);
  await page.waitForTimeout(120);
  assert.deepEqual(stable(await state(page)), before, 'Pause must freeze movement, foods, stats and day timer');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), 'Pause must keep keyboard focus in the dialog');
  await page.keyboard.press('Shift+Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
}

// Uses the production keyboard handler and deterministic public time hook only.
// No engine references, React fibers, or state mutations are used by this pilot.
async function pilot(page, mode, targetKind) {
  return page.evaluate(({ mode: action, targetKind: requestedKind }) => {
    const read = () => JSON.parse(window.render_game_to_text());
    const held = new Set();
    const codes = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', exercise: 'KeyE' };
    const keys = { KeyA: 'a', KeyD: 'd', KeyW: 'w', KeyS: 's', KeyE: 'e', KeyQ: 'q', Space: ' ' };
    const setKey = (code, down) => {
      if (held.has(code) === down) return;
      if (down) held.add(code); else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: keys[code], bubbles: true }));
    };
    const clear = () => { [...held].forEach(code => setKey(code, false)); };
    const tap = code => { setKey(code, true); window.advanceTime(1000 / 60); setKey(code, false); };
    const seen = new Set();
    let steps = 0;
    let lastDay = read().day;
    let target = requestedKind || 'gym';
    const initial = read();
    const trace = [];
    const candidates = ['gym', 'swim', 'home'];
    const waypoints = [{ x: 215, y: 200 }, { x: 885, y: 210 }, { x: 550, y: 540 }];
    let waypoint = 0;
    let trainingTarget = null;
    const completed = { ...initial.workouts };
    try {
      for (; steps < 12000; steps += 1) {
        let current = read();
        if (current.phase !== 'playing') break;
        if (current.day !== lastDay) {
          trace.push({ day: current.day, weight: current.weight, muscle: current.muscle, motivation: current.motivation });
          lastDay = current.day;
        }
        if (action === 'idle') {
          clear();
          window.advanceTime(100);
          continue;
        }
        if (trainingTarget && !current.exercise && current.motivation < 23) {
          trainingTarget = null;
          waypoint = (waypoint + 1) % waypoints.length;
        }
        if (!trainingTarget && current.motivation >= 27) {
          target = requestedKind || candidates.find(kind => Number(current.workouts[kind]) === 0)
            || (current.muscle < 62 ? 'gym' : current.weight > 60 ? 'swim' : 'home');
          trainingTarget = current.zones.find(value => value.kind === target);
        }
        const zone = current.zones.find(value => value.kind === target);
        if (!zone) throw Error(`Missing workout zone ${target}`);
        let destination = trainingTarget || waypoints[waypoint];
        if (!trainingTarget && current.motivation < 27) {
          const nearby = current.pickups.filter(item => item.kind === 'motivation'
            && Math.hypot(item.x - current.player.x, item.y - current.player.y) < 260);
          nearby.sort((a, b) => Math.hypot(a.x - current.player.x, a.y - current.player.y)
            - Math.hypot(b.x - current.player.x, b.y - current.player.y));
          if (nearby[0]) destination = nearby[0];
        }
        if (!trainingTarget && Math.hypot(destination.x - current.player.x, destination.y - current.player.y) < 35) {
          waypoint = (waypoint + 1) % waypoints.length;
          destination = waypoints[waypoint];
        }
        const dx = destination.x - current.player.x;
        const dy = destination.y - current.player.y;
        const distance = Math.hypot(dx, dy);
        const near = Boolean(trainingTarget && distance < 30 && current.motivation > 0.5);
        setKey(codes.left, !near && dx < -7);
        setKey(codes.right, !near && dx > 7);
        setKey(codes.up, !near && dy < -7);
        setKey(codes.down, !near && dy > 7);
        setKey(codes.exercise, near);
        const closeFoods = current.foods.filter(food => Math.hypot(food.x - current.player.x, food.y - current.player.y) < 120);
        if (current.pulseCooldown <= 0 && current.motivation > 48 && closeFoods.length >= 3) tap('KeyQ');
        if (!near && closeFoods.length >= 2 && current.dashCooldown <= 0 && current.stamina >= 30) tap('Space');
        window.advanceTime(50);
        current = read();
        if (Number(current.workouts?.[target] || 0) > Number(completed[target] || 0)) {
          completed[target] = current.workouts[target];
          trainingTarget = null;
          waypoint = (waypoint + 1) % waypoints.length;
          seen.add(target);
          if (action === 'workout') break;
        }
      }
    } finally { clear(); }
    return { state: read(), initial, steps, seen: [...seen], trace };
  }, { mode, targetKind });
}

async function selectUpgrade(page) {
  const upgrades = page.getByTestId('fitness-upgrade');
  await upgrades.first().waitFor({ state: 'visible' });
  const ids = await upgrades.evaluateAll(elements => elements.map(element => element.dataset.upgrade));
  const priority = ['strong', 'reach', 'focus', 'shoes', 'magnet', 'guard', 'breath', 'protein'];
  const preferred = priority.find(id => ids.includes(id));
  const choice = preferred ? page.locator(`[data-testid="fitness-upgrade"][data-upgrade="${preferred}"]`) : upgrades.first();
  await choice.click();
  assert.equal((await state(page)).phase, 'playing');
  return ids;
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const response = await fetch(`${base}/game/sui-fitness?seed=41`, { signal: AbortSignal.timeout(90000) });
  assert.equal(response.status, 200, `Dev server not responsive: ${response.status}`);
  const browser = await chromium.launch({
    channel: 'chrome', headless: process.env.FITNESS_HEADED !== '1',
    args: ['--mute-audio', '--disable-speech-api'],
  });
  let passed = false;
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 },
      permissions: ['clipboard-read', 'clipboard-write'] });
    await prepare(desktop);
    const page = await open(desktop);
    const initial = await state(page);
    assert.equal(initial.phase, 'ready');
    assert.equal(initial.seed, 41);
    assert.deepEqual(initial.zones.map(zone => zone.kind).sort(), ['gym', 'home', 'swim']);
    await button(page, '玩法说明').click();
    const body = await page.locator('body').innerText();
    assert.match(body, /DQ|dq/);
    assert.match(body, /牛肉干/);
    assert.match(body, /西西里|柠檬柚/);
    await button(page, '收起说明').click();
    await button(page, '分享游戏').click();
    const shared = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shared, /\/game\/sui-fitness\?seed=41/);
    await capture(page, '01-desktop-ready');
    await page.locator('#start-fitness').click();
    assert.equal((await state(page)).phase, 'playing');
    const beforeMove = await state(page);
    await page.keyboard.down('ArrowRight'); await advance(page, 200); await page.keyboard.up('ArrowRight');
    assert.ok((await state(page)).player.x > beforeMove.player.x + 15, 'Real ArrowRight key must move Sui');
    const dashBefore = await state(page);
    await page.keyboard.down('d'); await page.keyboard.down('Space'); await advance(page, 80);
    await page.keyboard.up('Space'); await page.keyboard.up('d');
    const dash = await state(page);
    assert.ok(dash.player.x > dashBefore.player.x + 25 && dash.dashCooldown > 0, 'Space dash must move and enter cooldown');
    await page.keyboard.down('q'); await advance(page, 30); await page.keyboard.up('q');
    assert.ok((await state(page)).pulseCooldown > 0, 'Q pulse must enter cooldown');
    await advance(page, 1500);
    await capture(page, '02-desktop-playing-abilities');
    await advance(page, 15000);
    const visibleFoodKinds = current => [...new Set(current.foods
      .filter(food => food.x > 55 && food.x < 1045 && food.y > 70 && food.y < 625)
      .map(food => food.kind))].sort();
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (visibleFoodKinds(await state(page)).length === 3) break;
      await advance(page, 250);
    }
    assert.deepEqual(visibleFoodKinds(await state(page)), ['dq', 'jerky', 'tea'],
      'Representative mid-wave must contain all three named food enemies');
    await capture(page, '12-desktop-three-foods-midwave');
    scenarios.push('Seeded ready screen, share link, real arrow movement, Space dash and Q pulse');

    await page.keyboard.press('p'); await frozen(page);
    await capture(page, '03-desktop-paused');
    await page.keyboard.press('p');
    assert.equal((await state(page)).phase, 'playing', 'A second P key must resume the paused challenge');
    await page.keyboard.press('Escape'); await frozen(page);
    await button(page, '继续挑战').click();
    assert.equal((await state(page)).phase, 'playing');
    await page.keyboard.down('d');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await frozen(page);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal((await state(page)).phase, 'paused', 'Focus must require explicit resume');
    const awayPosition = (await state(page)).player;
    await button(page, '继续挑战').click();
    await advance(page, 100);
    assert.deepEqual((await state(page)).player, awayPosition, 'Background pause must clear the physically held movement key');
    await page.keyboard.up('d');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await frozen(page);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal((await state(page)).phase, 'paused');
    await button(page, '继续挑战').click();
    await button(page, '玩法说明').focus();
    await page.keyboard.press('Space');
    const helpBefore = stable(await state(page));
    await advance(page, 1000);
    assert.deepEqual(stable(await state(page)), helpBefore, 'Help must freeze active play');
    await button(page, '收起说明').click();
    if ((await state(page)).phase === 'paused') await button(page, '继续挑战').click();
    await page.keyboard.press('f');
    await page.waitForFunction(() => !!document.fullscreenElement);
    await button(page, '全屏').click();
    await page.waitForFunction(() => !document.fullscreenElement);
    scenarios.push('P pause/resume toggle, Escape pause, explicit menu resume, blur/visibility pause, help freeze and fullscreen');

    await page.keyboard.press('Escape'); await frozen(page);
    await button(page, '重新挑战').click();
    assert.equal((await state(page)).seed, 41);
    assert.equal((await state(page)).phase, 'playing');
    for (const kind of ['gym', 'swim', 'home']) {
      const workout = await pilot(page, 'workout', kind);
      assert.ok(workout.seen.includes(kind), `Public controls failed to complete ${kind}: ${JSON.stringify(workout)}`);
      const naturalLoss = (workout.state.elapsed - workout.initial.elapsed) * 0.34;
      const gain = { gym: 9, swim: 2, home: 6 }[kind];
      assert.ok(workout.state.muscle >= workout.initial.muscle - naturalLoss + gain - 0.05,
        'Training must add the stated muscle gain after allowing for time spent travelling');
      if (kind === 'gym') await capture(page, '04-desktop-workout');
      if (workout.state.phase === 'upgrade') await selectUpgrade(page);
    }
    scenarios.push('Gym, swimming and home workout each complete through public movement and held E');
    let result;
    let upgradeCount = 0;
    const campaignTrace = [];
    for (let checkpoint = 0; checkpoint < 20; checkpoint += 1) {
      result = await pilot(page, 'campaign');
      campaignTrace.push(result);
      if (result.state.phase !== 'upgrade') break;
      if (upgradeCount === 0) await capture(page, '05-desktop-upgrade');
      await selectUpgrade(page);
      upgradeCount += 1;
    }
    assert.equal(result.state.phase, 'won', `Campaign pilot failed: ${JSON.stringify(campaignTrace)}`);
    assert.ok(result.state.weight <= 62 && result.state.muscle >= 55, 'Victory must meet both fitness goals');
    assert.ok(result.state.defeats > 0, 'Automatic combat must defeat food temptations');
    assert.ok(upgradeCount > 0, 'Full campaign must include upgrade choices');
    await capture(page, '06-desktop-won');
    const record = await readRecord(page);
    assert.ok(record && record.wins >= 1 && record.runs >= 1);
    await advance(page, 2000);
    assert.deepEqual(await readRecord(page), record, 'Terminal run must be recorded exactly once');
    await page.reload(); await ready(page); await advance(page, 0);
    assert.equal((await state(page)).phase, 'ready');
    assert.deepEqual(await readRecord(page), record, 'Records survive reload');
    await page.locator('#start-fitness').click();
    let lost;
    for (let checkpoint = 0; checkpoint < 6; checkpoint += 1) {
      lost = await pilot(page, 'idle');
      if (lost.state.phase !== 'upgrade') break;
      await selectUpgrade(page);
    }
    assert.equal(lost.state.phase, 'lost', `Idle play should provide a real failure outcome: ${JSON.stringify(lost)}`);
    await capture(page, '07-desktop-lost');
    assert.equal((await readRecord(page)).runs, record.runs + 1);
    await button(page, '重新挑战').click();
    assert.equal((await state(page)).phase, 'playing');
    assert.equal((await state(page)).seed, 41);
    await page.keyboard.press('p');
    await button(page, '换个开局').click();
    const fresh = await state(page);
    assert.equal(fresh.phase, 'ready');
    assert.notEqual(fresh.seed, 41);
    assert.equal(new URL(page.url()).searchParams.get('seed'), String(fresh.seed));
    await page.reload(); await ready(page); assert.equal((await state(page)).seed, fresh.seed);
    scenarios.push(`Full campaign victory (${upgradeCount} choices), automatic food defeats, idle loss, record dedup/reload and same/new seed restart`);
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await prepare(mobile);
    const phone = await open(mobile);
    await capture(phone, '13-mobile-390-ready');
    await button(phone, '玩法说明').tap();
    await capture(phone, '14-mobile-390-help');
    await button(phone, '收起说明').tap();
    await phone.locator('#start-fitness').tap();
    const joystick = phone.getByTestId('fitness-joystick');
    await joystick.scrollIntoViewIfNeeded();
    const joystickBox = await joystick.boundingBox();
    const exerciseBox = await button(phone, '锻炼 E').boundingBox();
    assert.ok(joystickBox && exerciseBox, 'Touch controls must be visible');
    const origin = { x: joystickBox.x + joystickBox.width / 2, y: joystickBox.y + joystickBox.height / 2, id: 1 };
    const right = { ...origin, x: origin.x + joystickBox.width * 0.3 };
    const exercise = { x: exerciseBox.x + exerciseBox.width / 2, y: exerciseBox.y + exerciseBox.height / 2, id: 2 };
    const cdp = await mobile.newCDPSession(phone);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const phoneBefore = await state(phone);
    await touch('touchStart', [origin]);
    await touch('touchMove', [right]);
    await touch('touchStart', [right, exercise]);
    await advance(phone, 200);
    assert.ok((await state(phone)).player.x > phoneBefore.player.x + 10, 'True touch joystick must move');
    assert.equal((await state(phone)).inputs.exercise, true, 'Exercise finger must be held alongside joystick');
    await capture(phone, '08-mobile-390-multitouch');
    await touch('touchEnd', [exercise]);
    assert.equal((await state(phone)).inputs.exercise, false, 'Releasing workout must release only its own input');
    const heldBefore = (await state(phone)).player.x;
    await advance(phone, 120);
    assert.ok((await state(phone)).player.x > heldBefore + 5, 'Releasing workout finger must preserve joystick finger');
    await touch('touchCancel', []);
    const canceled = stable(await state(phone));
    await advance(phone, 100);
    assert.deepEqual((await state(phone)).player, canceled.player, 'Touch cancellation must clear joystick movement');
    assert.equal((await state(phone)).inputs.exercise, false);
    await phone.locator('canvas').focus();
    await phone.keyboard.down('e');
    await touch('touchStart', [{ ...exercise, id: 5 }]);
    await touch('touchEnd', []);
    assert.equal((await state(phone)).inputs.exercise, true, 'Releasing a touch must preserve a held physical E key');
    await phone.keyboard.up('e');
    assert.equal((await state(phone)).inputs.exercise, false);
    await button(phone, '锻炼 E').focus();
    await phone.keyboard.down('Space'); await advance(phone, 100);
    assert.equal((await state(phone)).inputs.exercise, true, 'Focused workout button must support held Space');
    assert.equal((await state(phone)).dashCooldown, 0, 'Focused workout Space must not dash');
    await phone.keyboard.up('Space');
    assert.equal((await state(phone)).inputs.exercise, false);
    await button(phone, '拒绝诱惑 Q').tap(); await advance(phone, 50);
    assert.ok((await state(phone)).pulseCooldown > 0, 'Touch decision pulse must fire');
    await button(phone, '冲刺 Space').tap(); await advance(phone, 50);
    assert.ok((await state(phone)).dashCooldown > 0, 'Touch dash must fire');
    await button(phone, '暂停').tap(); await frozen(phone);
    await phone.setViewportSize({ width: 320, height: 740 });
    await capture(phone, '09-mobile-320-paused');
    await phone.setViewportSize({ width: 844, height: 390 });
    await capture(phone, '10-mobile-landscape-paused');
    await button(phone, '继续挑战').tap();
    await advance(phone, 3000);
    await button(phone, '冲刺 Space').focus();
    const focusedBefore = await state(phone);
    await phone.keyboard.press('Space'); await advance(phone, 100);
    const focusedAfter = await state(phone);
    assert.ok(focusedAfter.dashCooldown > 0 && focusedAfter.player.x > focusedBefore.player.x, 'Focused ability button must fire once from keyboard');
    await mobile.close();
    scenarios.push('True two-finger touch joystick/workout, mixed physical/touch holds, independent release, touch cancel, 320/390px/landscape and keyboard focus');

    const restricted = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await prepare(restricted);
    await restricted.addInitScript(() => {
      Storage.prototype.getItem = () => { throw Error('Storage denied by test'); };
      Storage.prototype.setItem = () => { throw Error('Storage denied by test'); };
    });
    const blocked = await open(restricted, 3);
    await blocked.locator('#start-fitness').click();
    let deniedLoss;
    for (let checkpoint = 0; checkpoint < 6; checkpoint += 1) {
      deniedLoss = await pilot(blocked, 'idle');
      if (deniedLoss.state.phase !== 'upgrade') break;
      await selectUpgrade(blocked);
    }
    assert.equal(deniedLoss.state.phase, 'lost');
    assert.match(await blocked.locator('body').innerText(), /存储|保存|纪录/);
    await capture(blocked, '11-storage-blocked');
    await button(blocked, '重新挑战').click();
    assert.equal((await state(blocked)).phase, 'playing');
    await blocked.reload(); await ready(blocked); assert.equal((await state(blocked)).phase, 'ready');
    await restricted.close();
    scenarios.push('Storage denied and reduced motion retain start, terminal outcome, restart and reload playability');

    const hall = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await prepare(hall);
    const entry = await hall.newPage();
    await entry.goto(`${base}/demos#games`, { waitUntil: 'domcontentloaded' });
    await entry.getByRole('searchbox', { name: '搜索游戏' }).fill('岁己');
    const gameLink = entry.locator('a[href="/game/sui-fitness"]');
    assert.equal(await gameLink.count(), 1, 'The game must be discoverable in the game hall');
    await gameLink.click();
    await ready(entry);
    assert.equal((await state(entry)).phase, 'ready');
    await hall.close();
    scenarios.push('Search game hall for 岁己 and follow real link into the ready game');

    // A fresh page exercises the real animation loop before advanceTime is ever called.
    const live = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await prepare(live);
    const livePage = await live.newPage();
    await livePage.goto(`${base}/game/sui-fitness?seed=41`, { waitUntil: 'domcontentloaded' });
    await ready(livePage);
    await livePage.locator('#start-fitness').click();
    const liveBefore = await state(livePage);
    await livePage.keyboard.down('ArrowRight');
    await livePage.waitForTimeout(450);
    await livePage.keyboard.up('ArrowRight');
    const liveMoved = await state(livePage);
    assert.ok(liveMoved.player.x > liveBefore.player.x + 60,
      'Real RAF must process a normally held ArrowRight key without advanceTime');
    await livePage.waitForFunction(() => JSON.parse(window.render_game_to_text()).elapsed >= 1.5);
    const liveSpawned = await state(livePage);
    assert.ok(liveSpawned.foods.length > 0 && liveSpawned.elapsed > liveBefore.elapsed + 1,
      'Real RAF must advance time and spawn food enemies');
    await livePage.keyboard.press('p');
    const livePaused = stable(await state(livePage));
    assert.equal(livePaused.phase, 'paused');
    await livePage.waitForTimeout(300);
    assert.deepEqual(stable(await state(livePage)), livePaused, 'Real RAF must freeze during pause');
    await livePage.keyboard.press('p');
    assert.equal((await state(livePage)).phase, 'playing');
    await livePage.waitForFunction(previous => JSON.parse(window.render_game_to_text()).elapsed > previous + 0.2,
      livePaused.elapsed);
    const liveResumed = await state(livePage);
    liveObservations.push({ before: liveBefore, moved: liveMoved, spawned: liveSpawned,
      paused: livePaused, resumed: liveResumed, usedAdvanceTime: false });
    await live.close();
    scenarios.push('Fresh real RAF page: normal held key movement, enemy spawn, elapsed time, frozen pause and P keyboard resume without advanceTime');

    assert.deepEqual(errors, [], 'No browser/page errors');
    assert.deepEqual(responses, [], 'No failed network responses');
    passed = true;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed, base, scenarios, errors, responses, shots, liveObservations }, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ passed, scenarios, errors, screenshots: shots.map(shot => shot.file) }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
