import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { stick } = await loadTypescriptModule('src/components/nightRain/controls.ts');
const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');

test('controller dead zone rejects drift and invalid samples without losing proportional walking', () => {
  for (const value of [[0, 0], [0.1, -0.1], [NaN, Infinity]]) assert.deepEqual(stick(...value), { x: 0, y: 0 });
  const slow = stick(0.5, 0); const full = stick(1, 0); const diagonal = stick(1, 1);
  assert.ok(slow.x > 0 && slow.x < full.x); assert.equal(full.x, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9);
  const distances = [slow, full, diagonal].map(input => {
    const s = engine.createGame(); engine.startGame(s); const { x, z } = s.player;
    for (let i = 0; i < 4; i++) engine.stepGame(s, 40, { x: input.x, z: input.y });
    return Math.hypot(s.player.x - x, s.player.z - z);
  });
  assert.ok(distances[0] < distances[1] * 0.5, 'Half stick produces a walk, not a full-speed run');
  assert.ok(Math.abs(distances[1] - distances[2]) < 1e-8, 'Diagonal does not exceed cardinal speed');
});
