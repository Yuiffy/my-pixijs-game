import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const nav = await loadTypescriptModule('src/components/liuzhou/navigation.ts');
const sim = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const world = await loadTypescriptModule('src/components/liuzhou/world.ts');
const evening = await loadTypescriptModule('src/components/liuzhou/evening.ts');
const terrain = await loadTypescriptModule('src/components/liuzhou/terrain.ts');
const destination = (point, id = 'story') => ({ ...point, id, name: id, kind: 'story' });
function assertRoute(points, from, to, mode) {
  assert.ok(points.length >= 2, `${mode}: missing route ${JSON.stringify({ from, to })}`);
  assert.ok(world.distance(points[0], from) < 0.01);
  assert.ok(world.distance(points.at(-1), to) < 4, 'arrival stays within interaction range');
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i]; const length = world.distance(a, b);
    for (let t = 0; t <= length; t += 0.25) {
      const p = { x: a.x + (b.x - a.x) * t / (length || 1), z: a.z + (b.z - a.z) * t / (length || 1), y: a.y + (b.y - a.y) * t / (length || 1) };
      assert.ok(nav.navigationClear(p, mode), `${mode} route enters a wall, furniture or water at ${JSON.stringify(p)}`);
    }
  }
}

test('all chapter destinations are reachable without routing through static collision or across the river', () => {
  for (const mode of ['walk', 'bike', 'car']) {
    let from = sim.createGame().player;
    for (const q of sim.QUESTS.slice(0, 6)) {
      const points = nav.planRoute(from, q, mode);
      assertRoute(points, from, q, mode);
      if (q.target === 'nana') {
        assert.ok(nav.routeMetres(points) > world.distance(from, q) + 100);
        assert.ok(points.some(p => world.inRiver(p) && world.onBridge(p, -1.55)), 'south bank route uses a bridge');
      }
      from = points.at(-1);
    }
  }
});

test('sound spots and the five navigable landmark approaches have clear routes', () => {
  const from = { x: 42, z: -8 };
  for (const q of [...evening.SOUND_SPOTS, ...world.LANDMARKS.map(l => l.id === 'river' ? { ...l, x: 270, z: -180 } : l)]) {
    assertRoute(nav.planRoute(from, q), from, q, 'walk');
  }
  assert.deepEqual(nav.planRoute(from, { x: 340, z: 105 }), [], 'no fake route into the river');
  assert.deepEqual(nav.planRoute(from, { x: NaN, z: 0 }), []);
});

test('route progress shrinks, stays bounded while standing, and replans after leaving the street', () => {
  const n = new nav.StreetNavigation(); const q = destination(sim.QUESTS[1]);
  const first = n.update({ x: 42, z: -8 }, q, 'bike', 0);
  const initialMetres = first.metres; const p = first.points[Math.floor(first.points.length / 2)];
  const progress = n.update(p, q, 'bike', 1000);
  assert.ok(progress.metres < initialMetres / 1.5);
  assert.equal(n.replans, 1);
  const count = progress.points.length;
  for (let i = 0; i < 100; i++) n.update(p, q, 'bike', 1100 + i * 100);
  assert.equal(n.route.points.length, count, 'stationary updates cannot grow duplicate points');
  const elsewhere = { x: 60, z: 20 };
  n.update(elsewhere, q, 'bike', 20000);
  assert.equal(n.replans, 2);
  assertRoute(n.route.points, elsewhere, q, 'bike');
  assert.equal(n.update(q, q, 'bike', 21000).status, 'arrived');
  assert.equal(n.update(q, null, 'bike', 22000), null);
});

test('background replies cannot overwrite a changed destination, travel mode, cancellation or arrival', () => {
  const requests = []; const n = new nav.StreetNavigation(request => requests.push(request));
  const from = { x: 42, z: -8 }; const a = destination(sim.QUESTS[1], 'shop'); const b = destination(sim.QUESTS[3], 'south');
  assert.equal(n.update(from, a, 'walk', 0).status, 'planning');
  for (let i = 0; i < 10; i++) n.update(from, a, 'walk', 100 + i * 1000);
  assert.equal(requests.length, 1, 'pending work is not dispatched repeatedly');
  n.update(from, b, 'car', 12000);
  n.accept(requests[0].version, [{ ...from }, a]);
  assert.equal(n.route.destination.id, 'south'); assert.equal(n.route.status, 'planning');
  n.accept(requests[1].version, nav.planRoute(from, b, 'car'));
  assert.equal(n.route.status, 'route'); assert.equal(n.route.mode, 'car');
  n.update(from, a, 'bike', 13000); n.update(a, a, 'bike', 14000);
  n.accept(requests[2].version, [from, a]);
  assert.equal(n.route.status, 'arrived');
  n.update(from, b, 'walk', 15000); n.update(from, null, 'walk', 16000);
  n.accept(requests[3].version, [from, b]); assert.equal(n.route, null);
});

test('continuous movement beside the route does not accumulate the player trail or retain a long route near the shop', () => {
  const n = new nav.StreetNavigation(); const q = destination(sim.QUESTS[1]);
  const first = n.update({ x: 42, z: -8 }, q, 'bike', 0);
  const original = first.points; let now = 0;
  for (let i = 1; i < original.length; i++) {
    const a = original[i - 1]; const b = original[i]; const length = world.distance(a, b);
    for (let step = 0.3; step < length; step += 0.3) {
      const p = { x: a.x + (b.x - a.x) * step / length + 0.25, z: a.z + (b.z - a.z) * step / length };
      if (!nav.navigationClear(p, 'bike')) continue;
      now += 50;
      const current = n.update(p, q, 'bike', now);
      assert.ok(current.points.length <= original.length + 2, 'a path must not grow hundreds of backwards player positions');
      assert.ok(current.metres <= first.metres + 5);
    }
  }
  const nearby = { x: -163.8, z: 118.6 };
  const last = n.update(nearby, q, 'bike', now + 1000);
  assert.equal(last.status, 'route');
  assert.ok(last.metres < 12, `shop is six metres away, not ${last.metres}`);
  assert.ok(last.points.length <= 3);
});

test('a terrace is not treated as ground-level arrival, and descending resumes navigation', () => {
  const n = new nav.StreetNavigation(); const target = destination(sim.QUESTS[0]);
  const start = { x: 31, z: -10 };
  assert.equal(n.update({ ...start, y: terrain.terrainHeight(start) }, target, 'walk', -1000).status, 'route');
  assert.equal(n.update({ ...start, y: terrain.terrainHeight(start) + 6.2 }, target, 'walk', -500).status, 'unavailable');
  assert.equal(n.update({ ...target, y: terrain.terrainHeight(target) + 6.2 }, target, 'walk', 0).status, 'unavailable');
  assert.equal(n.update({ ...target, y: terrain.terrainHeight(target) }, target, 'walk', 1000).status, 'arrived');
});
