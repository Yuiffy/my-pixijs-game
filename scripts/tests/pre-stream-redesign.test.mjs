import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { createPrepGame, startPrepGame, stepPrepGame, dashPrep, togglePausePrep, validatePrepGame,
  getPrepGuideStation, getPrepWalkTarget, interactPrep, PREP_DASH_MS, PREP_DASH_COOLDOWN_MS } =
  await loadTypescriptModule('src/components/preStreamGame/gameplay3d.ts');
const start = () => startPrepGame(createPrepGame(1, 81));
const input = { x: 0, z: 1, primary: false };

test('short dash covers more ground, locks its direction and requires a fresh action after cooldown', () => {
  const initial = start();
  const dash = dashPrep(initial, 0, 1);
  assert.equal(initial.movement.dashes, 0, 'action must not mutate the source');
  assert.equal(dashPrep(dash, 1, 0), dash, 'no second dash during cooldown');
  const run = stepPrepGame(initial, PREP_DASH_MS, input);
  const quick = stepPrepGame(dash, PREP_DASH_MS, { ...input, x: 1, z: 0 });
  assert.ok(quick.player.z - initial.player.z > (run.player.z - initial.player.z) * 2);
  assert.equal(quick.player.x, initial.player.x, 'direction stays committed for the short burst');
  assert.equal(quick.movement.dashMs, 0);
  const ready = stepPrepGame(quick, PREP_DASH_COOLDOWN_MS, { x: 0, z: 0, primary: false });
  assert.equal(ready.movement.dashes, 1, 'cooldown alone must not retrigger');
  assert.equal(dashPrep(ready, 1, 0).movement.dashes, 2);
});

test('dash respects both walls and exits through real door openings', () => {
  let bedroom = start();
  bedroom.player = { x: 0.8, z: -1, yaw: Math.PI / 2 };
  bedroom = stepPrepGame(dashPrep(bedroom, 1, 0), PREP_DASH_MS);
  assert.ok(bedroom.player.x < 1.2, 'cannot tunnel through bedroom wall');
  let bathroom = start();
  bathroom.player = { x: -1.8, z: -2.5, yaw: -Math.PI / 2 };
  bathroom = stepPrepGame(dashPrep(bathroom, -1, 0), PREP_DASH_MS);
  assert.ok(bathroom.player.x > -2.4, 'cannot tunnel through bathroom wall');
  let doorway = start();
  doorway.player = { x: 0.7, z: 1, yaw: Math.PI / 2 };
  doorway = stepPrepGame(dashPrep(doorway, 1, 0), PREP_DASH_MS);
  assert.ok(doorway.player.x > 1.8, 'actual bedroom doorway remains passable');
});

test('dash is a response to the moving cat instead of a blocked movement timer', () => {
  const initial = start();
  initial.player = { x: 2.2, z: -1, yaw: 0 };
  const walking = stepPrepGame(initial, PREP_DASH_MS, input);
  const hopping = stepPrepGame(dashPrep(initial, 0, 1), PREP_DASH_MS, input);
  assert.ok(hopping.player.z > 0.5);
  assert.ok(walking.player.z < -0.5);
});

test('pause and restore cancel the burst without skipping cooldown or damaging old saves', () => {
  const dash = stepPrepGame(dashPrep(start(), 0, 1), 40);
  const paused = togglePausePrep(dash);
  assert.equal(paused.movement.dashMs, 0);
  assert.equal(stepPrepGame(paused, 500), paused);
  assert.equal(dashPrep(paused, 1, 0), paused);
  const restored = validatePrepGame(JSON.parse(JSON.stringify(dash)));
  assert.ok(restored);
  assert.equal(restored.movement.dashMs, 0);
  assert.equal(restored.movement.cooldownMs, dash.movement.cooldownMs);
  const oldSave = JSON.parse(JSON.stringify(start()));
  delete oldSave.movement;
  assert.equal(validatePrepGame(oldSave).movement.cooldownMs, 0);
  const badSave = JSON.parse(JSON.stringify(dash));
  badSave.movement.cooldownMs = -1;
  assert.equal(validatePrepGame(badSave), null);
});

test('suggestion teaches parallel water preparation then returns for water and the live desk', () => {
  let state = start();
  assert.equal(getPrepGuideStation(state).id, 'thermos');
  state.player = { x: 2.95, z: 1.65, yaw: 0 };
  state = interactPrep(state, 'thermos');
  assert.equal(getPrepGuideStation(state).id, 'dispenser');
  const door = getPrepWalkTarget(state, 'dispenser');
  assert.equal(door.z, 1, 'guide uses the same real doorway as autowalk');
  state.player = { x: -0.6, z: 2.25, yaw: 0 };
  state = interactPrep(state, 'dispenser');
  assert.equal(state.water.cup, 'filling');
  assert.notEqual(getPrepGuideStation(state).id, 'dispenser', 'do useful work during background fill');
  state = stepPrepGame(state, state.water.fillRequiredMs);
  assert.equal(getPrepGuideStation(state).id, 'dispenser');
  state = interactPrep(state, 'dispenser');
  assert.equal(getPrepGuideStation(state).id, 'thermos');
  state.incidents.active = ['spill']; state.incidents.queue = [];
  assert.equal(getPrepGuideStation(state).id, 'spill', 'incident gets a visible route');
  state.incidents.active = []; state.incidents.resolved = ['spill'];
  state.completed = ['water', 'toilet', 'food', 'cat', 'audio', 'vts', 'obs'];
  state.water.cup = 'drank';
  assert.equal(getPrepGuideStation(state).id, 'obs');
});
