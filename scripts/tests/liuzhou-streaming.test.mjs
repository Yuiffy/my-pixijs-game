import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const { roadTiles, tileDistance } = require('../../src/components/liuzhou/cityStreaming.ts');
const { buildRoadGeometry } = require('../../src/components/liuzhou/roadGeometry.ts');
const { selectRoadRenderSegments } = require('../../src/components/liuzhou/roadSurfaces.ts');
const world = require('../../src/components/liuzhou/world.ts');
const city = require('../../src/components/liuzhou/city.ts');
const terrain = require('../../src/components/liuzhou/terrainMesh.ts');
const heights = require('../../src/components/liuzhou/terrain.ts');

test('every original four-metre road strip is loaded once, preserving markings, height and shoreline cuts across negative tile boundaries', () => {
  const segments = selectRoadRenderSegments(world.ROAD_SEGMENTS, city.CITY_ROAD_SEGMENTS);
  const tiles = roadTiles(segments); const coverage = new Map(segments.map(s => [s, []]));
  for (const tile of tiles) for (const job of tile.jobs) for (let i = job.first; i < job.last; i++) coverage.get(job.segment).push(i);
  for (const segment of segments) {
    const count = Math.ceil(world.distance(segment.a, segment.b) / 4);
    assert.deepEqual(coverage.get(segment).sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
  }
  const jobs = segments.map(segment => ({ segment, first: 0, last: Math.ceil(world.distance(segment.a, segment.b) / 4) }));
  const triangles = data => {
    const result = []; const positions = Buffer.from(data.positions.buffer); const colors = Buffer.from(data.colors.buffer);
    for (let offset = 0; offset < positions.length; offset += 36) result.push(Buffer.concat([positions.subarray(offset, offset + 36), colors.subarray(offset, offset + 36)]).toString('base64'));
    return result;
  };
  const whole = triangles(buildRoadGeometry(jobs)).sort();
  const streamed = tiles.flatMap(tile => triangles(buildRoadGeometry(tile.jobs))).sort();
  assert.deepEqual(streamed, whole);
  assert.ok(tiles.filter(tile => tileDistance(tile, { x: -3020, z: 60 }) < 220).length > 0);
  console.log(JSON.stringify({ tiles: tiles.length, triangles: whole.length }));
});

test('cached terrain cell samples match an independent uncached interpolation, including shared cell edges and shoreline cuts', () => {
  const shoreline = JSON.parse(fs.readFileSync('src/components/liuzhou/terrain-shoreline.json'));
  const chunks = terrain.terrainChunks();
  const uncached = p => {
    const chunk = chunks.find(c => p.x >= c.minX && p.x <= c.maxX && p.z >= c.minZ && p.z <= c.maxZ);
    if (!chunk) return heights.terrainHeight(p);
    const { step } = chunk;
    const x = chunk.minX + Math.floor((p.x - chunk.minX) / step) * step;
    const z = chunk.minZ + Math.floor((p.z - chunk.minZ) / step) * step;
    if (shoreline.cells[`${step}:${x}:${z}`]) return heights.terrainHeight(p);
    const right = Math.min(chunk.maxX, x + step); const bottom = Math.min(chunk.maxZ, z + step);
    const u = (p.x - x) / (right - x || 1); const v = (p.z - z) / (bottom - z || 1);
    const a = heights.terrainHeight({ x, z }); const b = heights.terrainHeight({ x: right, z });
    const c = heights.terrainHeight({ x, z: bottom }); const d = heights.terrainHeight({ x: right, z: bottom });
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  for (let i = 0; i < 3000; i++) {
    const p = { x: -4400 + ((i * 213.777) % 5100), z: -3000 + ((i * 513.333) % 4600) };
    assert.equal(terrain.terrainBaseTriangleHeight(p), uncached(p));
    assert.equal(terrain.terrainBaseTriangleHeight(p), uncached(p));
  }
  for (const chunk of chunks) for (const p of [{ x: chunk.minX, z: chunk.minZ }, { x: chunk.maxX, z: chunk.maxZ }]) assert.equal(terrain.terrainBaseTriangleHeight(p), uncached(p));
});
