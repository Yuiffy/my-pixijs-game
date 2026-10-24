import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { riversideReserved } = require('../../src/components/liuzhou/riverside.ts');
const world = require('../../src/components/liuzhou/world.ts');
const { treeClearsBridge } = require('../../src/components/liuzhou/bridges.ts');
const sim = require('../../src/components/liuzhou/simulation.ts');
const { terrainTriangleHeight } = require('../../src/components/liuzhou/terrainMesh.ts');
const layout = require('../../src/components/liuzhou/riverside-layout.json');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];

test('complete archived park relation rings and source paths survive with dry, non-overlapping landscape', () => {
  const result = spawnSync('python', ['scripts/tests/liuzhou-riverside-geometry.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('estimated infill and enclosures clear source park land, trees clear bridges and visible buildings', () => {
  for (const b of world.BUILDINGS.filter(b => !b.real)) {
    const points = b.footprint || [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ x: b.x + sx * b.w / 2 * Math.cos(b.angle) + sz * b.d / 2 * Math.sin(b.angle), z: b.z - sx * b.w / 2 * Math.sin(b.angle) + sz * b.d / 2 * Math.cos(b.angle) }));
    assert.ok(!riversideReserved(b), b.id);
    for (let i = 0; i < points.length; i++) {
      const a = points[i]; const c = points[(i + 1) % points.length]; const count = Math.max(1, Math.ceil(world.distance(a, c)));
      for (let n = 0; n <= count; n++) assert.ok(!riversideReserved({ x: a.x + (c.x - a.x) * n / count, z: a.z + (c.z - a.z) * n / count }), b.id);
    }
  }
  const visible = layout.trees.map(t => ({ x: t.at[0], z: t.at[1] })).filter(p => treeClearsBridge(p) && !world.BUILDINGS.some(b => world.buildingContains(p, b, 4)));
  assert.ok(visible.length > 100);
  for (const p of visible) assert.equal(riversideReserved(p), true);
});

test('archived Liudi riverbank footway segment remains traversable in both directions', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.exploration = true; g.npcs = []; g.vehicles = []; g.traffic = [];
  const source = layout.paths.find(p => p.sourceId === '1524324802');
  const points = source.points.slice(3, 13).map(([x, z]) => ({ x, z }));
  Object.assign(g.player, points[0], { y: terrainTriangleHeight(points[0]), angle: 0, speed: 0 });
  const physics = await sim.createPhysics(g);
  const { default: R } = await import('@dimforge/rapier3d-compat');
  try {
    for (const target of [...points.slice(1), ...points.slice(0, -1).reverse()]) {
      let n = 0;
      while (world.distance(g.player, target) > .2 && n++ < 5000) {
        sim.step(g, { forward: 1, turn: 0, sprint: false, brake: false, jump: false }, 1 / 60, physics, Math.atan2(target.x - g.player.x, target.z - g.player.z));
      }
      assert.ok(world.distance(g.player, target) < .3, JSON.stringify({ target, player: g.player }));
      for (let i = 0; i < 30; i++) sim.step(g, { forward: 0, turn: 0, sprint: false, brake: false, jump: false }, 1 / 60, physics);
      const ray = new R.Ray({ x: g.player.x, y: g.player.y + .8, z: g.player.z }, { x: 0, y: -1, z: 0 });
      const support = physics.world.castRay(ray, 1.2, true, undefined, undefined, physics.collider);
      assert.ok(g.locomotion.grounded && support && Math.abs(support.toi - .8) < .2, JSON.stringify({ target, player: g.player, support: support?.toi }));
    }
  } finally { physics.dispose(); }
});
