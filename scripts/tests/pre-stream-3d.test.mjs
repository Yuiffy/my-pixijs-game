import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const game = await loadTypescriptModule('src/components/preStreamGame/gameplay3d.ts');
const {
  TASK_IDS, STATIONS, PREP_LEVELS, FOOD_ITEMS, OBS_SOURCES, createPrepGame, startPrepGame, stepPrepGame,
  interactPrep, aimPrep, pressPrep, leaveMiniGame, goLivePrep, togglePausePrep, getPrepAction,
  placeFoodPrep, releaseCatPourPrep, setAudioChannelPrep, capturePosePrep, wipeSpillPrep,
  connectCablePrep, toggleObsSourcePrep, validatePrepGame, getPrepStars, nearestStation,
  getPrepWalkTarget, formatPrepTime,
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
    }
  }
  return state;
}

function resolveIncidents(initial) {
  let state = initial;
  for (const incident of [...state.incidents.active]) state = solveMini(visit(state, incident));
  return state;
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
  state = visit(state, 'thermos');
  state = visit(state, 'dispenser');
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
  assert.equal(state.minigame.stage, 'flush-ready');
  state = pressPrep(state);
  assert.equal(state.minigame.stage, 'flushing');
  state = stepPrepGame(state, 1799, idle);
  assert.equal(state.completed.includes('toilet'), false, 'flush animation must finish');
  state = stepPrepGame(state, 1, idle);
  assert.ok(state.completed.includes('toilet'));
  state = visit(state, 'dispenser');
  assert.equal(state.water.cup, 'carried-full');
  state = visit(state, 'thermos');
  assert.equal(state.water.cup, 'drank');
  assert.ok(state.completed.includes('water'));
});

test('all seven tasks and seeded incidents finish across three nights in free order', () => {
  const seen = new Set();
  for (let level = 1; level <= 3; level++) {
    let state = startPrepGame(createPrepGame(level, 81));
    state = visit(state, 'thermos');
    state = visit(state, 'dispenser');
    for (const id of ['toilet', 'cat', 'vts', 'food', 'audio', 'obs']) {
      state = solveMini(visit(state, id));
      state = resolveIncidents(state);
    }
    if (state.water.cup === 'filling') state = stepPrepGame(state, state.water.fillRequiredMs - state.water.fillMs, idle);
    state = visit(state, 'dispenser');
    state = visit(state, 'thermos');
    state = resolveIncidents(state);
    assert.deepEqual([...state.completed].sort(), [...TASK_IDS].sort());
    assert.equal(state.incidents.resolved.length, PREP_LEVELS[level - 1].incidentCount);
    state.incidents.resolved.forEach(id => seen.add(id));
    assert.ok(validatePrepGame(state));
    assert.equal(goLivePrep(state), state, 'cannot go live across the room');
    state = walkTo(state, 'obs');
    assert.equal(getPrepAction(state), '正式上播');
    const before = state.elapsedMs;
    state = goLivePrep(state);
    assert.equal(state.phase, 'countdown');
    state = stepPrepGame(state, 4000, idle);
    assert.equal(state.phase, 'result');
    assert.equal(state.elapsedMs, before + 3000, 'countdown counts exactly three seconds');
    assert.ok(getPrepStars(state) >= 1 && getPrepStars(state) <= 3);
    assert.ok(validatePrepGame(state));
  }
  assert.deepEqual([...seen].sort(), ['cable', 'catwalk', 'spill']);
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
  const legacyToilet = JSON.parse(JSON.stringify(state));
  legacyToilet.version = 1;
  delete legacyToilet.cat;
  for (const key of ['poseIndex', 'sweeps', 'foodPlaced', 'fillLevel', 'audioLevels', 'audioTargets', 'stains', 'lastWipeX', 'lastWipeY', 'cablePairs', 'obsEnabled']) delete legacyToilet.minigame[key];
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
