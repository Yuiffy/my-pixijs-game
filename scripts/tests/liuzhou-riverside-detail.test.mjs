import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const detail = require('../../src/components/liuzhou/riversideDetail.ts');
const { terrainHeight } = require('../../src/components/liuzhou/terrain.ts');
const { terrainTriangleHeight } = require('../../src/components/liuzhou/terrainMesh.ts');
const layout = require('../../src/components/liuzhou/riverside-detail-layout.json');
const sim = require('../../src/components/liuzhou/simulation.ts');
const street = require('../../src/components/liuzhou/street.ts');
const world = require('../../src/components/liuzhou/world.ts');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];

test('archived promenade remains intact and estimated furniture clears buildings, water and junctions', () => {
  const result = spawnSync('python', ['scripts/tests/liuzhou-riverside-detail-geometry.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('furniture uses shared collision geometry, rests on terrain and leaves every rest approach walkable', async () => {
  for (const box of detail.RIVERSIDE_DETAIL_SOLIDS) assert.ok(street.STREET_SOLIDS.includes(box));
  const bays = layout.restBays.filter(b => detail.RIVERSIDE_DETAIL_BAY_IDS.includes(b.id));
  const p = { x: bays[0].route[0][0], z: bays[0].route[0][1] };
  const g = sim.createGame(); g.phase = 'playing'; g.exploration = true; g.npcs = []; g.vehicles = []; g.traffic = [];
  Object.assign(g.player, p, { y: terrainTriangleHeight(p), angle: 0, speed: 0 });
  const physics = await sim.createPhysics(g);
  const { default: R } = await import('@dimforge/rapier3d-compat');
  try {
    for (let i = 0; i < 3; i++) sim.step(g, { forward: 0, turn: 0, sprint: false, brake: false, jump: false }, 1 / 60, physics);
    for (const id of detail.RIVERSIDE_DETAIL_RAIL_IDS) {
      const rail = layout.rails.find(r => r.id === id);
      for (const [x, z] of [rail.a, rail.b]) {
        const y = detail.riversideGroundHeight({ x, z });
        const ray = new R.Ray({ x, y: y + 4, z }, { x: 0, y: -1, z: 0 });
        const hit = physics.world.castRay(ray, 8, true, undefined, undefined, undefined, undefined, collider => collider.shape.type === R.ShapeType.TriMesh);
        assert.ok(hit && Math.abs(y + 4 - hit.toi - y) < .15, JSON.stringify({ id, x, z, y, actual: hit ? y + 4 - hit.toi : null }));
      }
    }
    const walk = target => {
      let n = 0;
      while (world.distance(g.player, target) > .2 && n++ < 4000) sim.step(g, { forward: 1, turn: 0, sprint: false, brake: false, jump: false }, 1 / 60, physics, Math.atan2(target.x - g.player.x, target.z - g.player.z));
      assert.ok(world.distance(g.player, target) < .3, JSON.stringify({ target, player: g.player }));
      for (let i = 0; i < 30; i++) sim.step(g, { forward: 0, turn: 0, sprint: false, brake: false, jump: false }, 1 / 60, physics);
      assert.ok(g.locomotion.grounded && Math.abs(g.player.y - detail.riversideGroundHeight(g.player)) < .3, JSON.stringify(g.player));
    };
    let travelled = 0;
    const original = layout.sourcePath.points.map(([x, z], i, arr) => {
      if (i) travelled += Math.hypot(x - arr[i - 1][0], z - arr[i - 1][1]);
      return { x, z, chainage: travelled };
    });
    let previous = bays[0].chainage;
    for (const bay of bays) {
      for (const point of original.filter(p => p.chainage > previous && p.chainage < bay.chainage)) walk(point);
      walk({ x: bay.route[0][0], z: bay.route[0][1] });
      walk({ x: bay.route[1][0], z: bay.route[1][1] });
      walk({ x: bay.route[0][0], z: bay.route[0][1] });
      previous = bay.chainage;
    }
  } finally { physics.dispose(); }
});

test('rendered furniture has finite positive geometry and uses actual terrain triangles', () => {
  assert.ok(detail.RIVERSIDE_DETAIL_RAIL_IDS.length >= 75);
  assert.ok(detail.RIVERSIDE_DETAIL_BAY_IDS.length >= 5);
  for (const box of [...detail.RIVERSIDE_DETAIL_SOLIDS, ...detail.RIVERSIDE_DETAIL_DECOR]) {
    assert.ok([...box.at, ...box.size, box.angle || 0].every(Number.isFinite));
    assert.ok(box.size.every(v => v > 0));
    assert.match(box.color, /^#[a-f0-9]{6}$/i);
  }
  for (let i = 0; i < detail.RIVERSIDE_DETAIL_RAIL_IDS.length; i++) {
    const rail = layout.rails.find(r => r.id === detail.RIVERSIDE_DETAIL_RAIL_IDS[i]);
    const posts = detail.RIVERSIDE_DETAIL_SOLIDS.slice(i * 4 + 2, i * 4 + 4);
    for (let n = 0; n < 2; n++) {
      const post = posts[n]; const p = { x: post.at[0], z: post.at[2] };
      assert.ok(Math.hypot(p.x - rail[n ? 'b' : 'a'][0], p.z - rail[n ? 'b' : 'a'][1]) < .001);
      const bottom = terrainHeight(p) + post.at[1] - post.size[1] / 2;
      assert.ok(Math.abs(bottom - (detail.riversideGroundHeight(p) - .12)) < 1e-8);
    }
  }
  const offset = detail.RIVERSIDE_DETAIL_RAIL_IDS.length * 4;
  detail.RIVERSIDE_DETAIL_BAY_IDS.forEach((id, i) => {
    const [seat, ...rest] = detail.RIVERSIDE_DETAIL_SOLIDS.slice(offset + i * 5, offset + (i + 1) * 5);
    const absolute = box => terrainHeight({ x: box.at[0], z: box.at[2] }) + box.at[1];
    const bottom = absolute(seat) - seat.size[1] / 2;
    // Seat and back use yaw only: each is horizontal. Individually sized
    // legs meet the same seat underside while penetrating the ground 8cm.
    for (const leg of rest.slice(0, 2)) {
      assert.ok(Math.abs(absolute(leg) + leg.size[1] / 2 - bottom) < 1e-8, id);
      assert.ok(Math.abs(absolute(leg) - leg.size[1] / 2 - detail.riversideGroundHeight({ x: leg.at[0], z: leg.at[2] }) + .08) < 1e-8, id);
      assert.ok(leg.size[1] <= 1.08 && leg.size[1] >= .5, id);
    }
  });
});
