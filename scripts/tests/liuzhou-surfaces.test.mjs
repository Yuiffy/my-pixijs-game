import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { Ray, Vector2, Vector3, ShapeUtils } from 'three';

const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { ROAD_SEGMENTS, URBAN_FABRIC, closestOnSegment, distance } = require('../../src/components/liuzhou/world.ts');
const { CITY_ROAD_SEGMENTS } = require('../../src/components/liuzhou/city.ts');
const { inCity, inCore } = require('../../src/components/liuzhou/exploration.ts');
const { selectRoadRenderSegments, ROAD_SURFACE_HEIGHTS } = require('../../src/components/liuzhou/roadSurfaces.ts');
const { urbanGroundPositions } = require('../../src/components/liuzhou/urbanGround.ts');
const { terrainSurface, terrainChunks } = require('../../src/components/liuzhou/terrainMesh.ts');
if (previous) require.extensions['.ts'] = previous;
else delete require.extensions['.ts'];

test('source road coverage survives removal of duplicated core/city drawings at the expansion boundary', () => {
  const eligible = CITY_ROAD_SEGMENTS.filter(s => (!inCore(s.a, 10) || !inCore(s.b, 10)) && (inCity(s.a) || inCity(s.b)));
  const selected = selectRoadRenderSegments(ROAD_SEGMENTS, CITY_ROAD_SEGMENTS);
  assert.deepEqual(selected.slice(0, ROAD_SEGMENTS.length), ROAD_SEGMENTS);
  const removed = eligible.filter(s => !selected.includes(s));
  assert.equal(removed.length, 150);
  for (const segment of removed) {
    const originals = ROAD_SEGMENTS.filter(s => s.road.id === segment.road.sourceId);
    for (let i = 0; i <= 10; i++) {
      const p = { x: segment.a.x + (segment.b.x - segment.a.x) * i / 10, z: segment.a.z + (segment.b.z - segment.a.z) * i / 10 };
      assert.ok(originals.some(s => distance(p, closestOnSegment(p, s.a, s.b)) < 0.02));
    }
  }
  const jinhui = selected.filter(s => s.road.id.replace('city-road-', '') === '1351248942');
  assert.equal(jinhui.length, 2, 'both original rear Wuxing spans are drawn once');
  assert.ok(jinhui.every(s => s.road.id === '1351248942'));
  const riverExtension = eligible.find(s => s.road.sourceId === '143833786' && Math.min(s.a.z, s.b.z) < -650);
  assert.ok(riverExtension && selected.includes(riverExtension), 'same-ID riverside road extension remains visible');
  const layers = Object.values(ROAD_SURFACE_HEIGHTS);
  for (let i = 1; i < layers.length; i++) assert.ok(layers[i] - layers[i - 1] >= 0.009, 'different pavement colours do not share depth');
});

const surfaces = URBAN_FABRIC.courtyards.map(area => ({ area, positions: urbanGroundPositions(area) }));
const chunks = terrainChunks();
const cells = new Map();
const triangulate = rings => ShapeUtils.triangulateShape(rings[0].map(p => new Vector2(...p)), rings.slice(1).map(ring => ring.map(p => new Vector2(...p))));
function renderedHeight(p) {
  const chunk = chunks.find(c => p.x >= c.minX && p.x < c.maxX && p.z >= c.minZ && p.z < c.maxZ);
  assert.ok(chunk);
  const { step } = chunk;
  const x = chunk.minX + Math.floor((p.x - chunk.minX) / step) * step;
  const z = chunk.minZ + Math.floor((p.z - chunk.minZ) / step) * step;
  const key = `${step}:${x}:${z}`;
  if (!cells.has(key)) {
    const mesh = terrainSurface({ minX: x, minZ: z, maxX: Math.min(x + step, chunk.maxX), maxZ: Math.min(z + step, chunk.maxZ) }, step, triangulate);
    const triangles = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const ids = mesh.indices.slice(i, i + 3);
      if (ids.every(id => mesh.kinds[id] === 0)) triangles.push(ids.map(id => new Vector3(...mesh.positions.slice(id * 3, id * 3 + 3))));
    }
    cells.set(key, triangles);
  }
  const ray = new Ray(new Vector3(p.x, 1000, p.z), new Vector3(0, -1, 0));
  for (const [a, b, c] of cells.get(key)) {
    const hit = ray.intersectTriangle(a, b, c, false, new Vector3());
    if (hit) return hit.y;
  }
  assert.fail(`ground painted beyond dry terrain at ${JSON.stringify(p)}`);
}

test('every courtyard follows terrain triangles through slope changes, with upward winding and stable road clearance', () => {
  let triangles = 0;
  let worst = 0;
  for (const { area, positions } of surfaces) {
    const offset = area.id.startsWith('parcel-') ? 0.012 : 0.025;
    assert.ok(positions.length > 0, `missing ground ${area.id}`);
    for (let i = 0; i < positions.length; i += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
      assert.ok((bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0);
      for (const [u, v, w] of [[1 / 3, 1 / 3, 1 / 3], [0.8, 0.1, 0.1], [0.1, 0.8, 0.1]]) {
        const p = { x: ax * u + bx * v + cx * w, z: az * u + bz * v + cz * w };
        const error = Math.abs(ay * u + by * v + cy * w - renderedHeight(p) - offset);
        worst = Math.max(worst, error);
        assert.ok(error < 0.00001, `${area.id}: interpolated ground leaves terrain by ${error}m`);
      }
      triangles++;
    }
  }
  assert.ok(triangles > 1000);
  console.log(JSON.stringify({ courtyards: surfaces.length, triangles, worstTerrainDeviation: worst }));
});

test('independent polygon intersections preserve source parcel coverage while leaving every underground opening clear', () => {
  const check = spawnSync('python', ['-c', `
import json,sys,math
from shapely.geometry import Polygon
from shapely.ops import unary_union
d=json.load(sys.stdin)
layout=json.load(open('src/components/liuzhou/underground-layout.json',encoding='utf-8'))
openings=unary_union([Polygon(rings[0],rings[1:]) for rings in layout['openings']])
clearances=[]
for e in layout['entrances']:
    for a,b in zip(e['points'],e['points'][1:]):
        length=math.hypot(b[0]-a[0],b[1]-a[1]); half=e['width']/2+0.23
        nx=(b[1]-a[1])/length*half; nz=-(b[0]-a[0])/length*half
        clearances.append(Polygon([(a[0]-nx,a[1]-nz),(b[0]-nx,b[1]-nz),(b[0]+nx,b[1]+nz),(a[0]+nx,a[1]+nz)]))
holes=unary_union([openings,*clearances])
shore=json.load(open('src/components/liuzhou/skyline-map.json',encoding='utf-8'))
water=unary_union([Polygon(p['outer'],p['holes']) for p in shore['riverPolygons']])
count=0
for surface in d:
    area=surface['area']; values=surface['positions']
    triangles=[Polygon([(values[i],values[i+2]),(values[i+3],values[i+5]),(values[i+6],values[i+8])]) for i in range(0,len(values),9)]
    actual=unary_union(triangles)
    expected=Polygon([(p['x'],p['z']) for p in area['points']]).difference(water).difference(holes)
    assert actual.symmetric_difference(expected).area<0.0001,(area['id'],'changed coverage',actual.symmetric_difference(expected).area)
    assert actual.intersection(openings).area<0.0001,(area['id'],'covered stair opening')
    assert abs(sum(t.area for t in triangles)-actual.area)<0.0001,(area['id'],'overlapping triangles')
    count+=1
print(json.dumps({'sourceParcelsChecked':count,'coveredOpeningArea':0}))
`], { input: JSON.stringify(surfaces), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(check.status, 0, check.stderr || check.stdout);
  console.log(check.stdout.trim());
});
