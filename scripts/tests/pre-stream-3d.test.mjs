import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const game = await loadTypescriptModule('src/components/preStreamGame/gameplay3d.ts');
const {
  TASK_IDS, INCIDENT_IDS, STATIONS, PREP_LEVELS, FOOD_ITEMS, OBS_SOURCES, BOWEL_ROCKS, BOWEL_START, BOWEL_END, LIVE_TRANSITION_MS,
  createPrepGame, startPrepGame, stepPrepGame,
  interactPrep, aimPrep, pressPrep, leaveMiniGame, goLivePrep, togglePausePrep, getPrepAction,
  placeFoodPrep, releaseCatPourPrep, setAudioChannelPrep, capturePosePrep, wipeSpillPrep,
  connectCablePrep, toggleObsSourcePrep, sweepGlassPrep, scoopLitterPrep, digBowelPrep,
  validatePrepGame, getPrepStars, nearestStation,
  getPrepWalkTarget, formatPrepTime, getPrepStations,
} = game;
const idle = { x: 0, z: 0, primary: false };
const station = id => STATIONS.find(item => item.id === id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function walkTo(initial, id) {
  let state = initial;
  let steps = 0;
  while (dist(state.player, station(id)) > 1.12) {
    assert.ok(steps++ < 800, `reachable station: ${id} from ${JSON.stringify(state.player)}`);
    const target = getPrepWalkTarget(state, id);
    const dx = target.x - state.player.x;
    const dz = target.z - state.player.z;
    const length = Math.hypot(dx, dz);
    state = stepPrepGame(state, 50, { x: dx / length, z: dz / length, primary: false });
  }
  return state;
}

function visit(state, id) {
  const arrived = walkTo(state, id);
  const next = interactPrep(arrived, id);
  assert.notEqual(next, arrived, `interaction at ${id} should do something`);
  return next;
}

function solveMini(initial) {
  let state = initial;
  const kind = state.minigame.kind;
  let loops = 0;
  while (state.phase === 'minigame' && state.minigame.kind === kind) {
    assert.ok(loops++ < 550, `${kind} should be solvable with shown controls: ${JSON.stringify(state.minigame)}`);
    const mini = state.minigame;
    assert.ok(validatePrepGame(state), `${kind} can be saved mid-action`);
    if (kind === 'toilet') {
      if (mini.stage === 'flush-ready') state = pressPrep(state);
      else if (mini.stage === 'flushing') state = stepPrepGame(state, 50, idle);
      else state = stepPrepGame(aimPrep(state, mini.targetX, mini.targetY), 50, { ...idle, primary: true });
    } else if (kind === 'food') {
      const slot = mini.foodPlaced.indexOf(-1);
      state = placeFoodPrep(state, FOOD_ITEMS.indexOf(mini.sequence[slot]), slot);
    } else if (kind === 'cat') {
      state = stepPrepGame(state, mini.targetX * 1500, { ...idle, primary: true });
      state = releaseCatPourPrep(state);
    } else if (kind === 'audio') {
      if (mini.stage === 'testing') state = stepPrepGame(state, 1200, idle);
      else {
        mini.audioTargets.forEach((target, index) => { state = setAudioChannelPrep(state, index, target); });
        state = pressPrep(state);
      }
    } else if (kind === 'vts') {
      state = capturePosePrep(state, ['smile', 'blink', 'tilt'].indexOf(mini.sequence[mini.poseIndex]));
    } else if (kind === 'spill') {
      const stain = mini.stains.find(item => item.clean < 3);
      const side = mini.lastWipeX <= stain.x ? 1 : -1;
      state = wipeSpillPrep(state, stain.x + side * 0.11, stain.y);
    } else if (kind === 'catwalk') {
      if (mini.cooldownMs > 0) state = stepPrepGame(state, mini.cooldownMs, idle);
      else if (mini.stage === 'confirm' || mini.targetX >= 0.8) state = pressPrep(state);
      else state = stepPrepGame(state, 50, idle);
    } else if (kind === 'cable') {
      if (mini.stage === 'confirm') state = pressPrep(state);
      else {
        const plug = mini.cablePairs.indexOf(-1);
        state = connectCablePrep(state, plug, [1, 2, 0][plug]);
      }
    } else if (kind === 'obs') {
      if (mini.stage === 'confirm') state = pressPrep(state);
      else {
        const source = OBS_SOURCES.findIndex((name, index) => mini.sequence.includes(name) && !mini.obsEnabled[index]);
        state = source >= 0 ? toggleObsSourcePrep(state, source) : pressPrep(state);
      }
    } else if (kind === 'power') {
      state = mini.stage === 'booting' ? stepPrepGame(state, mini.flowMs, idle) : pressPrep(state);
    } else if (kind === 'glass') {
      state = sweepGlassPrep(state, mini.glassShards.indexOf(false));
    } else if (kind === 'litter') {
      state = scoopLitterPrep(state, mini.litterClumps.find(index => !mini.litterScooped[index]));
    } else if (kind === 'bowel') {
      if (mini.stage === 'flowing') state = stepPrepGame(state, mini.flowMs, idle);
      else {
        const path = [7, 12, 13, 18, 23];
        const cell = path.find(index => !mini.bowelDug[index]);
        state = cell === undefined ? pressPrep(state) : digBowelPrep(state, cell);
      }
    }
  }
  return state;
}

function resolveIncidents(initial) {
  let state = initial;
  let count = 0;
  while (state.incidents.active.length) {
    assert.ok(count++ < INCIDENT_IDS.length, 'an incident chain must finish');
    state = solveMini(visit(state, state.incidents.active[0]));
  }
  return state;
}

function finishNight(level, seed) {
  let state = startPrepGame(createPrepGame(level, seed));
  state = visit(state, 'thermos');
  state = visit(state, 'dispenser');
  for (let pass = 0; pass < 6; pass++) {
    state = resolveIncidents(state);
    for (const id of ['toilet', 'cat', 'vts', 'food', 'audio', 'obs']) {
      state = resolveIncidents(state);
      if (!state.completed.includes(id)) state = solveMini(visit(state, id));
    }
    if (state.water.cup === 'filling') state = stepPrepGame(state, state.water.fillRequiredMs - state.water.fillMs, idle);
    if (state.water.cup === 'ready') state = visit(state, 'dispenser');
    if (state.water.cup === 'carried-full') state = visit(state, 'thermos');
    state = resolveIncidents(state);
    if (state.completed.length === TASK_IDS.length && state.incidents.queue.length === 0) return state;
  }
  assert.fail(`night ${level}, seed ${seed} cannot finish: ${JSON.stringify(state)}`);
}

function withIncident(id) {
  const state = startPrepGame(createPrepGame(1, 145));
  return { ...state, incidents: { active: [id], resolved: [], queue: [] } };
}

test('room interaction needs proximity, wall collision routes through bathroom door', () => {
  let state = startPrepGame(createPrepGame());
  assert.equal(nearestStation(state), null, 'inactive spill marker is not an E interaction near spawn');
  assert.equal(getPrepAction(state), '');
  assert.equal(interactPrep(state), state);
  assert.equal(interactPrep(state, 'toilet'), state);
  assert.equal(interactPrep(state, 'thermos'), state);
  state = visit(state, 'thermos');
  assert.equal(state.water.cup, 'carried-empty');
  state = visit(state, 'dispenser');
  assert.equal(state.water.cup, 'filling');
  const wrongStart = walkTo(state, 'food');
  const direct = stepPrepGame(wrongStart, 4000, { x: 0, z: -1, primary: false });
  assert.ok(direct.player.z > -0.55, 'bathroom upper wall stops a wrong approach');
  state = walkTo(state, 'toilet');
  assert.ok(nearestStation(state));
  state = interactPrep(state, 'toilet');
  assert.equal(state.phase, 'minigame');
  assert.equal(state.minigame.kind, 'toilet');
  state = solveMini(state);
  assert.ok(state.completed.includes('toilet'));
  state = walkTo(state, 'food');
  assert.ok(dist(state.player, station('food')) < 1.2, 'bathroom exit route is also reachable');
});

test('slow water fills while aiming at toilet, then requires collection and drinking', () => {
  let state = startPrepGame(createPrepGame(1, 123));
  const waterHints = () => getPrepStations(state)
    .filter(item => item.id === 'thermos' || item.id === 'dispenser')
    .map(({ id, label }) => ({ id, label }));
  assert.deepEqual(waterHints(), [{ id: 'thermos', label: '保温杯' }]);
  assert.notEqual(nearestStation({ ...state, player: { ...state.player, ...station('dispenser') } })?.id, 'dispenser', 'E must ignore the dispenser before picking up the cup');
  state = visit(state, 'thermos');
  assert.deepEqual(waterHints(), [{ id: 'dispenser', label: '饮水机' }]);
  assert.notEqual(nearestStation(state)?.id, 'thermos', 'the empty cup must not leave a stale target at the desk');
  state = visit(state, 'dispenser');
  assert.deepEqual(waterHints(), [{ id: 'dispenser', label: '接水中' }]);
  state = visit(state, 'toilet');
  assert.equal(state.water.cup, 'filling');
  let shots = 0;
  while (state.minigame.stage === 'shoot') {
    assert.ok(shots++ < 180);
    state = aimPrep(state, state.minigame.targetX, state.minigame.targetY);
    state = stepPrepGame(state, 50, { ...idle, primary: true });
  }
  assert.equal(state.minigame.stage, 'flush-ready');
  assert.ok(state.minigame.splashCount >= 20);
  assert.equal(state.completed.includes('toilet'), false, 'shooting does not bypass flush');
  state = stepPrepGame(state, 21000, idle);
  assert.equal(state.water.cup, 'ready', 'water keeps filling during an unrelated activity');
  assert.deepEqual(waterHints(), [{ id: 'dispenser', label: '取满水杯' }]);
  assert.equal(state.minigame.stage, 'flush-ready');
  state = pressPrep(state);
  assert.equal(state.minigame.stage, 'flushing');
  state = stepPrepGame(state, 1799, idle);
  assert.equal(state.completed.includes('toilet'), false, 'flush animation must finish');
  state = stepPrepGame(state, 1, idle);
  assert.ok(state.completed.includes('toilet'));
  state = visit(state, 'dispenser');
  assert.equal(state.water.cup, 'carried-full');
  assert.deepEqual(waterHints(), [{ id: 'thermos', label: '桌边喝水' }]);
  assert.notEqual(nearestStation(state)?.id, 'dispenser', 'the collected cup must not leave a stale target at the dispenser');
  state = visit(state, 'thermos');
  assert.equal(state.water.cup, 'drank');
  assert.deepEqual(waterHints(), [], 'water targets disappear after drinking');
  assert.ok(state.completed.includes('water'));
});

test('all seven tasks and seeded incidents finish across three nights in free order', () => {
  for (let level = 1; level <= 3; level++) {
    let state = finishNight(level, 81);
    assert.deepEqual([...state.completed].sort(), [...TASK_IDS].sort());
    assert.equal(state.incidents.resolved.length, PREP_LEVELS[level - 1].incidentCount);
    assert.ok(validatePrepGame(state));
    state = walkTo(state, 'food');
    assert.equal(goLivePrep(state), state, 'cannot go live across the room');
    state = walkTo(state, 'obs');
    assert.equal(getPrepAction(state), '正式上播');
    const before = state.elapsedMs;
    state = goLivePrep(state);
    assert.equal(state.phase, 'countdown');
    assert.equal(state.countdownMs, LIVE_TRANSITION_MS);
    assert.equal(state.notice, '直播间接入中……');
    const oldTransition = validatePrepGame({ ...state, countdownMs: 3000, notice: '全部就绪，三、二、一，正式上播！' });
    assert.ok(oldTransition, 'an old countdown save remains loadable');
    assert.equal(oldTransition.countdownMs, LIVE_TRANSITION_MS, 'an old save plays at most two seconds of the new transition');
    state = stepPrepGame(state, LIVE_TRANSITION_MS - 1, idle);
    assert.equal(state.phase, 'countdown', 'transition remains visible until the final millisecond');
    state = stepPrepGame(state, 1, idle);
    assert.equal(state.phase, 'result');
    assert.equal(state.elapsedMs, before + LIVE_TRANSITION_MS, 'transition counts exactly two seconds');
    assert.ok(getPrepStars(state) >= 1 && getPrepStars(state) <= 3);
    assert.ok(validatePrepGame(state));
  }
});

test('all seven incident types occur in seeded third nights and remain completable', () => {
  const seedFor = new Map();
  for (let seed = 1; seed <= 512 && seedFor.size < INCIDENT_IDS.length; seed++) {
    for (const id of createPrepGame(3, seed).incidents.queue) {
      if (!seedFor.has(id)) seedFor.set(id, seed);
    }
  }
  assert.deepEqual([...seedFor.keys()].sort(), [...INCIDENT_IDS].sort(), 'each accident is reachable from a normal seed');
  const seen = new Set();
  for (const seed of new Set(seedFor.values())) {
    const state = finishNight(3, seed);
    state.incidents.resolved.forEach(id => seen.add(id));
    assert.ok(validatePrepGame(state), `seed ${seed} completes with a valid save`);
  }
  assert.deepEqual([...seen].sort(), [...INCIDENT_IDS].sort());
});

test('JiaJia power cut erases completed VTS/OBS and requires a timed reboot before reconfiguration', () => {
  let seed = 1;
  while (createPrepGame(1, seed).incidents.queue[0] !== 'power') assert.ok(seed++ < 512);
  let state = startPrepGame(createPrepGame(1, seed));
  state = solveMini(visit(state, 'vts'));
  assert.equal(state.incidents.active.length, 0, 'power waits for both programs');
  state = solveMini(visit(state, 'obs'));
  assert.deepEqual(state.incidents.active, ['power']);
  assert.ok(state.notice.includes('嘉嘉踩中关机键'));
  assert.equal(state.completed.includes('vts'), false);
  assert.equal(state.completed.includes('obs'), false);
  assert.ok(validatePrepGame(state));
  const atVts = walkTo(state, 'vts');
  assert.equal(interactPrep(atVts, 'vts'), atVts, 'computer software cannot start without power');
  state = visit(atVts, 'power');
  assert.equal(state.minigame.stage, 'restart');
  state = pressPrep(state);
  assert.equal(state.minigame.stage, 'booting');
  state = stepPrepGame(state, 1299, idle);
  assert.equal(state.phase, 'minigame');
  assert.ok(validatePrepGame(state));
  state = stepPrepGame(state, 1, idle);
  assert.deepEqual(state.incidents.resolved, ['power']);
  assert.equal(state.phase, 'explore');
  assert.ok(state.notice.includes('重新配置'));
  state = solveMini(visit(state, 'vts'));
  state = solveMini(visit(state, 'obs'));
  assert.ok(state.completed.includes('vts') && state.completed.includes('obs'));
  assert.deepEqual(state.incidents.active, [], 'one power incident cannot recur');
});

test('broken glass, litter and bowel blockage use distinct actions and reject wrong moves', () => {
  let state = visit(withIncident('glass'), 'glass');
  assert.ok(validatePrepGame(state));
  assert.equal(sweepGlassPrep(state, -1), state);
  state = sweepGlassPrep(state, 0);
  assert.equal(sweepGlassPrep(state, 0), state, 'a shard cannot be counted twice');
  state = solveMini(state);
  assert.deepEqual(state.incidents.resolved, ['glass']);

  state = visit(withIncident('litter'), 'litter');
  const cleanCell = Array.from({ length: 9 }, (_, index) => index).find(index => !state.minigame.litterClumps.includes(index));
  state = scoopLitterPrep(state, cleanCell);
  assert.equal(state.minigame.misses, 1);
  assert.ok(validatePrepGame(state));
  state = solveMini(state);
  assert.deepEqual(state.incidents.resolved, ['litter']);

  state = visit(withIncident('bowel'), 'bowel');
  assert.equal(BOWEL_START, 2);
  assert.equal(BOWEL_END, 22);
  assert.ok(BOWEL_ROCKS.includes(1));
  state = pressPrep(state);
  assert.equal(state.minigame.misses, 1, 'water cannot flow through a closed path');
  state = digBowelPrep(state, BOWEL_ROCKS[0]);
  assert.equal(state.minigame.misses, 2, 'hard blockage cannot be dug');
  for (const cell of [7, 12, 13, 18, 23]) state = digBowelPrep(state, cell);
  assert.ok(validatePrepGame(state));
  state = pressPrep(state);
  assert.equal(state.minigame.stage, 'flowing');
  state = togglePausePrep(state);
  assert.equal(stepPrepGame(state, 3000, idle), state, 'paused flow does not finish');
  state = togglePausePrep(state);
  state = stepPrepGame(state, 1599, idle);
  assert.equal(state.phase, 'minigame');
  state = stepPrepGame(state, 1, idle);
  assert.deepEqual(state.incidents.resolved, ['bowel']);
});

test('food placement, measured scoops, mixer, poses and OBS each require their own actions', () => {
  let state = visit(startPrepGame(createPrepGame(2, 14)), 'food');
  state = stepPrepGame(state, 2000, { ...idle, primary: true });
  assert.equal(state.minigame.hits, 0, 'held primary does not auto-plate food');
  const first = state.minigame.sequence[0];
  state = placeFoodPrep(state, (FOOD_ITEMS.indexOf(first) + 1) % 4, 0);
  assert.equal(state.minigame.misses, 1);
  state = solveMini(state);
  assert.ok(state.completed.includes('food'));
  state = visit(state, 'cat');
  state = stepPrepGame(state, 900, { ...idle, primary: true });
  state = stepPrepGame(state, 50, idle);
  assert.equal(state.minigame.hits, 1, 'releasing held input measures the scoop once');
  assert.equal(state.minigame.fillLevel, 0);
  state = stepPrepGame(state, 1450, { ...idle, primary: true });
  assert.ok(validatePrepGame(state), 'partly filled scoop can be saved');
  state = releaseCatPourPrep(state);
  assert.equal(state.minigame.misses, 1, 'overfilled scoop is rejected');
  state = solveMini(state);
  assert.ok(state.completed.includes('cat'));
  state = visit(state, 'audio');
  state = pressPrep(state);
  assert.equal(state.minigame.misses, 1, 'test tone rejects unbalanced channels');
  state = solveMini(state);
  assert.ok(state.completed.includes('audio'));
  state = visit(state, 'vts');
  const correctPose = ['smile', 'blink', 'tilt'].indexOf(state.minigame.sequence[0]);
  state = capturePosePrep(state, (correctPose + 1) % 3);
  assert.equal(state.minigame.misses, 1, 'wrong expression does not advance capture');
  state = solveMini(state);
  assert.ok(state.completed.includes('vts'));
  state = visit(state, 'obs');
  state = toggleObsSourcePrep(state, 4);
  state = pressPrep(state);
  assert.equal(state.minigame.misses, 1, 'desktop capture is an unwanted OBS source');
  state = toggleObsSourcePrep(state, 4);
  state = solveMini(state);
  assert.ok(state.completed.includes('obs'));
});

test('spills need movement, cable sockets need matching, and the cat reacts to timed taps', () => {
  let state = startPrepGame(createPrepGame(3, 14));
  state = { ...state, incidents: { active: ['spill', 'cable', 'catwalk'], resolved: [], queue: [] } };
  state = visit(state, 'spill');
  const stain = state.minigame.stains[0];
  state = wipeSpillPrep(state, stain.x, stain.y);
  state = wipeSpillPrep(state, stain.x, stain.y);
  assert.equal(state.minigame.sweeps, 0, 'a stationary pointer cannot clean a stain');
  state = solveMini(state);
  state = visit(state, 'cable');
  state = connectCablePrep(state, 0, 0);
  assert.equal(state.minigame.misses, 1, 'wrong socket does not pair the power plug');
  state = solveMini(state);
  state = visit(state, 'catwalk');
  while (state.minigame.targetX >= 0.8) state = stepPrepGame(state, 50, idle);
  state = pressPrep(state);
  assert.equal(state.minigame.misses, 1, 'early lure tap does not move the cat');
  state = solveMini(state);
  assert.deepEqual([...state.incidents.resolved].sort(), ['cable', 'catwalk', 'spill']);
});

test('bedroom wall routes through the door and roaming cat can briefly block passage', () => {
  let state = startPrepGame(createPrepGame(1, 42));
  state = { ...state, player: { x: 0.9, z: -0.4, yaw: 0 } };
  state = stepPrepGame(state, 1000, { ...idle, x: 1 });
  assert.ok(state.player.x < 1.2, 'solid bedroom wall blocks a straight crossing');
  state = walkTo(state, 'obs');
  assert.ok(state.player.x > 1.2, 'automatic route crosses the doorway');
  let west = false;
  let east = false;
  for (let i = 0; i < 400; i++) {
    state = stepPrepGame(state, 50, idle);
    west ||= state.cat.x < 0;
    east ||= state.cat.x > 2;
  }
  assert.ok(west && east, 'cat patrol reaches both living room and bedroom');
  while (Math.abs(state.cat.x - 1.2) > 0.06 || Math.abs(state.cat.z - 0.95) > 0.06) {
    state = stepPrepGame(state, 50, idle);
  }
  state = { ...state, player: { x: state.cat.x - 0.5, z: 0.95, yaw: 0 } };
  const blockedX = state.player.x;
  state = stepPrepGame(state, 50, { ...idle, x: 1 });
  assert.equal(state.player.x, blockedX, 'cat physically impedes a step through the doorway');
  state = walkTo(state, 'obs');
  assert.ok(state.player.x > 1.2, 'cat walks on and the station stays reachable');
});

test('pause freezes all timers; leaving a mini keeps the task unfinished', () => {
  let state = startPrepGame(createPrepGame());
  state = visit(state, 'thermos');
  state = visit(state, 'dispenser');
  state = visit(state, 'toilet');
  const before = JSON.stringify(state);
  state = togglePausePrep(state);
  assert.equal(stepPrepGame(state, 30000, { ...idle, primary: true }), state);
  assert.equal(pressPrep(state), state);
  assert.equal(aimPrep(state, 0, 0), state);
  state = togglePausePrep(state);
  assert.equal(JSON.stringify(state), before);
  state = leaveMiniGame(state);
  assert.equal(state.phase, 'explore');
  assert.equal(state.completed.includes('toilet'), false);
  state = interactPrep(state, 'toilet');
  assert.equal(state.minigame.stage, 'shoot');
});

test('seeded runs are deterministic and save validation rejects corrupt states', () => {
  assert.deepEqual(createPrepGame(3, 123), createPrepGame(3, 123));
  let state = startPrepGame(createPrepGame(3, 456));
  state = visit(state, 'toilet');
  state = aimPrep(state, 0.45, 0.53);
  state = stepPrepGame(state, 400, { ...idle, primary: true });
  const restored = validatePrepGame(JSON.parse(JSON.stringify(state)));
  assert.ok(restored);
  assert.equal(restored.paused, true, 'restored active games wait for deliberate resume');
  assert.equal(restored.elapsedMs, state.elapsedMs);
  assert.equal(validatePrepGame({ ...state, player: { ...state.player, x: 20 } }), null);
  assert.equal(validatePrepGame({ ...state, minigame: { ...state.minigame, kind: 'unknown' } }), null);
  assert.equal(validatePrepGame({ ...state, cat: undefined }), null);
  assert.equal(validatePrepGame({ ...state, completed: ['water'] }), null);
  assert.equal(validatePrepGame({ ...state, incidents: { active: ['spill'], resolved: ['spill'], queue: ['cable'] } }), null);
  assert.equal(formatPrepTime(65000), '1分钟05秒');
  const oldV2 = JSON.parse(JSON.stringify(state));
  for (const key of ['glassShards', 'litterClumps', 'litterScooped', 'bowelDug', 'flowMs']) delete oldV2.minigame[key];
  const migratedV2 = validatePrepGame(oldV2);
  assert.ok(migratedV2, 'an in-progress v2 save remains loadable');
  assert.deepEqual(migratedV2.minigame.glassShards, []);
  assert.equal(migratedV2.minigame.flowMs, 0);
  const legacyToilet = JSON.parse(JSON.stringify(state));
  legacyToilet.version = 1;
  delete legacyToilet.cat;
  for (const key of ['poseIndex', 'sweeps', 'foodPlaced', 'fillLevel', 'audioLevels', 'audioTargets', 'stains', 'lastWipeX', 'lastWipeY', 'cablePairs', 'obsEnabled', 'glassShards', 'litterClumps', 'litterScooped', 'bowelDug', 'flowMs']) delete legacyToilet.minigame[key];
  const migratedToilet = validatePrepGame(legacyToilet);
  assert.equal(migratedToilet.phase, 'minigame');
  assert.equal(migratedToilet.version, 2);
  assert.ok(migratedToilet.cat.x > 0);
  let legacyCat = visit(startPrepGame(createPrepGame(1, 78)), 'cat');
  legacyCat = JSON.parse(JSON.stringify(legacyCat));
  legacyCat.version = 1;
  delete legacyCat.cat;
  const migratedCat = validatePrepGame(legacyCat);
  assert.equal(migratedCat.phase, 'explore', 'changed minigame resumes safely in the room');
  assert.deepEqual(migratedCat.completed, legacyCat.completed);
});
