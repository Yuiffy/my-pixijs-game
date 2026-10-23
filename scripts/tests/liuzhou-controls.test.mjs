import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const e = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const neutral = { forward: 0, turn: 0, sprint: false, brake: false, jump: false };

test('A/D and touch left/right match camera screen directions at every heading', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7]) {
    for (const turn of [-1, 1]) {
      const g = e.createGame(); g.phase = 'playing';
      const start = { ...g.player };
      for (let i = 0; i < 15; i++) e.step(g, { ...neutral, turn }, 1 / 60, undefined, yaw);
      const dx = g.player.x - start.x, dz = g.player.z - start.z;
      const right = dx * -Math.cos(yaw) + dz * Math.sin(yaw);
      assert.ok(right * turn > 0.3, `${yaw} / ${turn}: ${right}`);
    }
  }
});

test('bike/car turn right with D going forward and steer realistically in reverse', () => {
  for (const kind of ['bike', 'car']) for (const direction of [-1, 1]) for (const turn of [-1, 1]) {
    const g = e.createGame(); g.phase = 'playing';
    const v = g.vehicles.find(v => v.kind === kind);
    Object.assign(v, { x: 31, z: -10, angle: 0, speed: direction * 3 });
    Object.assign(g.player, v); g.vehicle = v.id;
    e.step(g, { ...neutral, turn });
    assert.ok(v.angle * turn * direction < 0, `${kind} / ${direction} / ${turn}`);
    assert.ok(v.steering * turn < 0, 'wheel mesh turns with steering');
  }
});
