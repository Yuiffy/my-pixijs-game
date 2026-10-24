import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const world = await loadTypescriptModule('src/components/liuzhou/world.ts');
const people = await loadTypescriptModule('src/components/liuzhou/pedestrian-layout.ts');
const pedestrian = await loadTypescriptModule('src/components/liuzhou/pedestrian.ts');
const citizens = await loadTypescriptModule('src/components/liuzhou/citizens.ts');
const market = await loadTypescriptModule('src/components/liuzhou/market.ts');
const station = await loadTypescriptModule('src/components/liuzhou/station.ts');
const { default: squareLayout } = await loadTypescriptModule('src/components/liuzhou/square-layout.json');

test('all resident homes and evening meeting points are clear of carriageways and solid scenery', () => {
  for (const [id, home] of Object.entries({ ...people.NPC_HOMES, ...Object.fromEntries(Object.entries(people.NPC_MEETING_POINTS).map(([id, p]) => [`meeting-${id}`, p])) })) {
    assert.ok(pedestrian.pedestrianClear(home), `${id}: ${JSON.stringify(home)}`);
  }
  assert.equal(pedestrian.pedestrianClear({ x: 219, z: 622 }), false, 'the old Nana spawn is in the Rongjun Road carriageway');
});

test('entire resident circuits follow mapped pavements or pedestrian streets, including their return legs', () => {
  for (const [id, plan] of Object.entries(citizens.CITIZEN_PLANS)) {
    assert.deepEqual({ x: plan.stops[0].x, z: plan.stops[0].z }, people.NPC_HOMES[id]);
    for (let i = 0; i < plan.stops.length; i++) {
      const a = plan.stops[i], b = plan.stops[(i + 1) % plan.stops.length];
      const length = world.distance(a, b);
      for (let metres = 0; metres <= length; metres += 0.25) {
        const t = metres / (length || 1);
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        assert.ok(pedestrian.pedestrianClear(p), `${id} leg ${i} enters a carriageway or solid at ${JSON.stringify(p)}`);
        const onPublicPath = world.ROAD_SEGMENTS.some(s => world.distance(p, world.closestOnSegment(p, s.a, s.b)) <= s.road.width / 2 + 2.5) || market.marketPavement(p) || station.stationPavement(p)
          || squareLayout.surfaces.some(face => station.stationPolygonContains(p, face.points));
        assert.ok(onPublicPath, `${id} leaves the mapped pavement for an empty block`);
      }
    }
  }
});
