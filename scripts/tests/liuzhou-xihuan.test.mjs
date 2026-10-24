import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const xihuan = require('../../src/components/liuzhou/xihuan.ts');
const city = require('../../src/components/liuzhou/city.ts');
const pedestrian = require('../../src/components/liuzhou/pedestrian.ts');
const world = require('../../src/components/liuzhou/world.ts');
const street = require('../../src/components/liuzhou/street.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const layout = require('../../src/components/liuzhou/xihuan-layout.json');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];

test('crossings, signals, bus platform and parcel outlines retain archived OSM identities and coordinates', () => {
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/xihuan-layout.json'), fs.readFileSync('public/games/liuzhou/xihuan-layout.json'));
  assert.equal(layout.crossings.length, 12); assert.equal(layout.signals.length, 4);
  const xml = fs.readdirSync('data/liuzhou/open/osm').filter(p => p.endsWith('.osm.gz')).map(p => gunzipSync(fs.readFileSync(`data/liuzhou/open/osm/${p}`)).toString('utf8')).join('\n');
  for (const n of [...layout.crossings, ...layout.signals, layout.busStop]) {
    const tag = xml.match(new RegExp(`<node\\b[^>]*\\bid="${n.id}"[^>]*>`))?.[0];
    assert.ok(tag, n.id);
    const lon = Number(tag.match(/\blon="([^"]+)"/)[1]); const lat = Number(tag.match(/\blat="([^"]+)"/)[1]);
    assert.ok(Math.abs(n.point[0] - (lon - 109.41225) * 101458) < 0.00051, n.id);
    assert.ok(Math.abs(n.point[1] - (24.31415 - lat) * 111320) < 0.00051, n.id);
  }
  for (const parcel of layout.parcels) {
    const element = xml.match(new RegExp(`<way\\b[^>]*\\bid="${parcel.id}"[^>]*>[\\s\\S]*?</way>`))?.[0];
    assert.ok(element, parcel.id);
    const refs = [...element.matchAll(/<nd ref="(\d+)"/g)].map(m => m[1]);
    assert.equal(refs.length, parcel.points.length);
    refs.forEach((id, i) => {
      const n = xml.match(new RegExp(`<node\\b[^>]*\\bid="${id}"[^>]*>`))[0];
      assert.ok(Math.abs(parcel.points[i][0] - (Number(n.match(/\blon="([^"]+)"/)[1]) - 109.41225) * 101458) < 0.00051);
      assert.ok(Math.abs(parcel.points[i][1] - (24.31415 - Number(n.match(/\blat="([^"]+)"/)[1])) * 111320) < 0.00051);
    });
  }
  assert.match(layout.note, /estimated/); assert.match(layout.note, /no survey/);
});

test('separate source carriageways share lane-based estimated widths with pedestrian clearance', () => {
  for (const road of layout.sourceRoads) {
    const actual = city.CITY_ROADS.find(r => r.sourceId === road.id);
    assert.equal(actual.width, layout.roadWidths[road.id]);
    assert.deepEqual(actual.points, road.points.map(([x, z]) => ({ x, z })));
    if (road.tags.lanes) assert.ok(Math.abs(actual.width - (Number(road.tags.lanes) * 3.2 + 0.8)) < 1e-8);
  }
  assert.equal(city.CITY_ROADS.find(r => r.sourceId === '644682091').width, 7.2);
  for (const signal of layout.signals) {
    assert.ok(!pedestrian.inCarriageway({ x: signal.pole[0], z: signal.pole[1] }, 0.5), signal.id);
    assert.ok(world.distance({ x: signal.pole[0], z: signal.pole[1] }, { x: signal.point[0], z: signal.point[1] }) > 1);
  }
});

test('waiting neighbours stay on usable pavement and clear the shelter and fence collision', () => {
  for (const n of xihuan.XIHUAN_RESIDENTS) {
    assert.ok(pedestrian.pedestrianClear(n), `${n.id} ${JSON.stringify(n)}`);
    assert.ok(layout.surfaces.some(f => f.kind === 'pavement' && city.polygonContains(n, f.points)), n.id);
  }
  for (const solid of xihuan.XIHUAN_SOLIDS) {
    const p = { x: solid.at[0], z: solid.at[2] };
    assert.ok(!pedestrian.inCarriageway(p, 0.1), JSON.stringify(solid));
  }
});

test('public paving excludes source buildings and campus ground remains inside the school parcel', () => {
  for (const face of layout.surfaces.filter(f => ['campus', 'pavement'].includes(f.kind))) {
    const p = { x: face.points.reduce((n, a) => n + a[0] / 3, 0), z: face.points.reduce((n, a) => n + a[1] / 3, 0) };
    assert.ok(!world.BUILDINGS.some(b => world.buildingContains(p, b)), JSON.stringify(p));
    assert.ok(!pedestrian.inCarriageway(p), JSON.stringify(p));
    if (face.kind === 'campus') assert.ok(city.polygonContains(p, layout.parcels[0].points));
  }
});

test('terrain-draped fence bases reach below the actual endpoint ground and are solid at walking height', () => {
  layout.fences.forEach((f, i) => {
    const s = xihuan.XIHUAN_SOLIDS[i];
    for (const [x, z] of [f.a, f.b]) {
      const ground = terrain.terrainTriangleHeight({ x, z });
      const midGround = require('../../src/components/liuzhou/terrain.ts').terrainHeight({ x: s.at[0], z: s.at[2] });
      assert.ok(midGround + s.at[1] - s.size[1] / 2 < ground - 0.3);
      assert.ok(midGround + s.at[1] + s.size[1] / 2 > ground + 1.5);
    }
    const p = { x: s.at[0], z: s.at[2], y: terrain.terrainTriangleHeight({ x: s.at[0], z: s.at[2] }) + 1 };
    assert.ok(street.streetContains(p));
  });
});
