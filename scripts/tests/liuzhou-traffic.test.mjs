import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const w = await loadTypescriptModule('src/components/liuzhou/world.ts');
const t = await loadTypescriptModule('src/components/liuzhou/traffic.ts');
const e = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const advance = (cars, obstacles, seconds) => { for (let i = 0; i < seconds * 60; i++) t.stepTraffic(cars, obstacles, 1 / 60); };

test('traffic circuits remain on land or bridges and clear the imported building footprints', () => {
  for (const route of t.TRAFFIC_ROUTES) {
    assert.ok(route.length > 750);
    for (let s = 0; s < route.length; s++) {
      const p = t.trafficPose(route, s);
      assert.ok(w.canTraverse(p), `${route.id}: river/boundary at ${s}`);
      assert.ok(!w.BUILDINGS.some(b => w.buildingContains(p, b, 1.1)), `${route.id}: wall at ${s}`);
    }
    assert.ok(w.distance(t.trafficPose(route, route.length - 0.01), t.trafficPose(route, 0)) < 0.011);
  }
});

test('diagonal and concave footprints preserve the real street space', () => {
  const lShape = w.BUILDINGS.find(b => b.id === '641119443');
  assert.ok(lShape.footprint.length > 4);
  assert.equal(w.buildingContains({ x: -335, z: 105 }, lShape), false, 'L-shaped courtyard stays open');
  assert.equal(w.buildingContains({ x: -360, z: 100 }, lShape), true, 'solid building wing stays solid');
  const angle = 0.42;
  const points = [[-10,-5],[10,-5],[10,5],[-10,5],[-10,-5]].map(([x,z]) => ({ x: x*Math.cos(angle)-z*Math.sin(angle), z: x*Math.sin(angle)+z*Math.cos(angle) }));
  const fitted = w.footprintBox(points);
  assert.ok(Math.abs(fitted.w*fitted.d - 200) < 0.001);
});

test('cars brake before a pedestrian, illuminate brakes, and resume when the street clears', () => {
  const car = t.createTraffic()[0]; const route = t.TRAFFIC_ROUTES[0];
  advance([car], [], 3);
  const obstacle = { ...t.trafficPose(route, car.progress + 24), radius: 0.7, person: true };
  let closest = Infinity;
  for (let i = 0; i < 12*60; i++) { t.stepTraffic([car], [obstacle], 1/60); closest = Math.min(closest,w.distance(car,obstacle)); }
  assert.ok(closest >= 1.85); assert.equal(car.speed,0); assert.equal(car.braking,true); assert.equal(car.waiting,'行人');
  const stoppedAt = car.odometer;
  advance([car], [], 5);
  assert.ok(car.speed > 5); assert.ok(car.odometer-stoppedAt > 12); assert.equal(car.waiting,null);
});

test('seven cars run multiple full laps without teleporting, colliding or entering a permanent queue', () => {
  const g = e.createGame(); g.phase = 'playing';
  for (let i = 0; i < 480*60; i++) {
    const before = g.traffic.map(c => ({x:c.x,z:c.z,odometer:c.odometer}));
    e.step(g);
    g.traffic.forEach((c,j) => assert.ok(w.distance(c,before[j]) <= c.cruise/60 + 0.001));
    if (i % 30 === 0) for (let a=0;a<g.traffic.length;a++) for(let b=a+1;b<g.traffic.length;b++) assert.ok(w.distance(g.traffic[a],g.traffic[b]) >= 2.54);
  }
  for (const c of g.traffic) { assert.ok(c.odometer > t.TRAFFIC_ROUTES.find(r=>r.id===c.route).length*1.5,c.id); assert.ok(c.speed>0,c.id); }
  const stopped = structuredClone(g.traffic); g.phase='paused'; e.step(g); assert.deepEqual(g.traffic,stopped);
  g.phase='playing';g.dialogue={name:'居民',lines:['你好'],index:0,advance:false};e.step(g);assert.deepEqual(g.traffic,stopped);
});

test('ambient traffic loads clear of saved players and does not become a saved controllable vehicle', () => {
  const g = e.createGame();Object.assign(g.player,g.traffic[0]);
  let saved;globalThis.localStorage={setItem:(_,v)=>{saved=v;},getItem:()=>saved};
  e.saveGame(g); assert.equal(JSON.parse(saved).traffic,undefined);
  const loaded=e.createGame();e.loadGame(loaded);
  assert.ok(loaded.traffic.every(c=>w.distance(c,loaded.player)>6));
  assert.equal(loaded.vehicles.length,4);
  delete globalThis.localStorage;
});
