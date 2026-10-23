import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const nav = await loadTypescriptModule('src/components/liuzhou/navigation.ts');
const world = await loadTypescriptModule('src/components/liuzhou/world.ts');
const bridges = await loadTypescriptModule('src/components/liuzhou/bridges.ts');
const terrain = await loadTypescriptModule('src/components/liuzhou/terrain.ts');

function intersection(a, b, c, d) {
  const dx = b.x - a.x, dz = b.z - a.z, ex = d.x - c.x, ez = d.z - c.z;
  const determinant = dx * ez - dz * ex;
  if (Math.abs(determinant) < 0.001) return null;
  const t = ((c.x - a.x) * ez - (c.z - a.z) * ex) / determinant;
  const u = ((c.x - a.x) * dz - (c.z - a.z) * dx) / determinant;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * dx, z: a.z + t * dz } : null;
}
const main = bridges.BRIDGE_SECTIONS.find(s => s.main);
const riverRoad = world.ROAD_SEGMENTS.find(s => s.road.name === '滨江东路' && intersection(main.a, main.b, s.a, s.b));
const crossing = intersection(main.a, main.b, riverRoad.a, riverRoad.b);
const ground = p => ({ ...p, y: terrain.terrainHeight(p) });

function verifyContinuous(points, mode = 'walk') {
  assert.ok(points.length >= 2, 'route exists');
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = world.distance(a, b);
    assert.ok(Math.abs(a.y - b.y) <= length * 0.35 + 0.8, 'no vertical jump between street and bridge');
    for (let n = 0; n <= length; n += 0.5) {
      const t = n / (length || 1);
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t };
      assert.ok(nav.navigationClear(p, mode), `continuous passable surface at ${JSON.stringify(p)}`);
    }
  }
}

test('Binjiang East Road stays on ground beneath Wenhui bridge instead of joining its deck', () => {
  const length = world.distance(riverRoad.a, riverRoad.b);
  const dx = (riverRoad.b.x - riverRoad.a.x) / length, dz = (riverRoad.b.z - riverRoad.a.z) / length;
  const from = ground({ x: crossing.x - dx * 13, z: crossing.z - dz * 13 });
  const to = ground({ x: crossing.x + dx * 13, z: crossing.z + dz * 13 });
  assert.ok(bridges.bridgeSurface(crossing).y - terrain.terrainHeight(crossing) > 2.9, 'underpass has headroom');
  const route = nav.planRoute(from, to, 'car');
  verifyContinuous(route, 'car');
  assert.ok(nav.routeMetres(route) < 50, 'underpass remains a direct connection');
  assert.ok(route.every(p => Math.abs(p.y - terrain.terrainHeight(p)) < 0.1), 'never snaps up to the bridge');
});

test('the same map coordinate on a bridge and below it requires travel through the grounded approach', () => {
  const from = ground(crossing), to = { ...crossing, y: bridges.bridgeSurface(crossing).y };
  const route = nav.planRoute(from, to);
  verifyContinuous(route);
  assert.ok(nav.routeMetres(route) > 100, 'cannot change floors at a projected intersection');
  assert.ok(Math.abs(route[0].y - from.y) < 0.01);
  assert.ok(Math.abs(route.at(-1).y - to.y) < 0.01);
});

test('route state and worker requests preserve bridge height and do not call a deck arrival from below', () => {
  const deck = { ...crossing, y: bridges.bridgeSurface(crossing).y };
  const requests = [], navigation = new nav.StreetNavigation(request => requests.push(request));
  const target = { ...deck, id: 'bridge-view', name: '桥上', kind: 'landmark' };
  assert.equal(navigation.update(ground(crossing), target, 'walk', 0).status, 'planning');
  assert.equal(requests[0].from.y, terrain.terrainHeight(crossing));
  assert.equal(navigation.update(deck, target, 'walk', 1000).status, 'arrived');
  const destination = { ...ground({ x: 28, z: -23 }), id: 'gate', name: '东门', kind: 'story' };
  assert.equal(navigation.update(deck, destination, 'walk', 2000).status, 'planning');
  assert.equal(requests.at(-1).from.y, deck.y);
});
