import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const e = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const life = await loadTypescriptModule('src/components/liuzhou/life.ts');
const w = await loadTypescriptModule('src/components/liuzhou/world.ts');
const camera = await loadTypescriptModule('src/components/liuzhou/camera.ts');
let storage;
beforeEach(() => {
  storage = new Map();
  globalThis.localStorage = { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) ?? null };
});
afterEach(() => { delete globalThis.localStorage; });
const close = g => { for (let i = 0; g.dialogue && i < 10; i++) e.interact(g); assert.equal(g.dialogue, null); };
const game = () => { const g = e.createGame(); g.phase = 'playing'; g.stage = 6; return g; };
const reload = g => { e.saveGame(g); const restored = e.createGame(); e.loadGame(restored); restored.phase = 'playing'; return restored; };
const chefMenu = g => {
  Object.assign(g.player, g.npcs.find(n => n.id === 'chef'));
  e.interact(g);
  while (g.dialogue.index < g.dialogue.lines.length - 1) e.interact(g);
};
const accept = g => { chefMenu(g); e.chooseDialogue(g, 0); close(g); assert.ok(g.life.delivery); };
const recipient = g => { Object.assign(g.player, life.deliveryTarget(g.life, g.npcs)); e.interact(g); assert.equal(g.dialogue.effect.kind, 'delivery'); };

test('story payment and final reward commit only with stage; mid-dialogue reload cannot repeat either', () => {
  for (const [stage, startMoney, endMoney] of [[1, 60, 36], [5, 36, 76]]) {
    let g = game(); g.stage = stage; g.money = startMoney; g.bikeDistance = 46;
    Object.assign(g.player, e.QUESTS[stage]); e.interact(g);
    assert.equal(g.money, startMoney); assert.equal(g.stage, stage);
    e.interact(g); assert.equal(g.money, startMoney);
    g = reload(g); assert.equal(g.stage, stage); assert.equal(g.money, startMoney);
    Object.assign(g.player, e.QUESTS[stage]); e.interact(g); close(g);
    assert.equal(g.stage, stage + 1); assert.equal(g.money, endMoney);
    g = reload(g); assert.equal(g.money, endMoney);
    Object.assign(g.player, e.QUESTS[stage]); e.interact(g); close(g);
    assert.equal(g.money, endMoney); assert.equal(g.stage, stage + 1);
  }
});

test('an outdated story dialogue cannot advance a new stage or settle twice', () => {
  const g = game(); g.stage = 5; Object.assign(g.player, e.QUESTS[5]); e.interact(g);
  g.stage = 6; close(g); assert.equal(g.stage, 6); assert.equal(g.money, 60);
});

test('E safely dismisses the shop and choices work only on final page, once', () => {
  const g = game(); Object.assign(g.player, g.npcs.find(n => n.id === 'chef')); e.interact(g);
  e.chooseDialogue(g, 0); assert.equal(g.life.delivery, null);
  close(g); assert.equal(g.money, 60); assert.equal(g.life.delivery, null);
  chefMenu(g); e.chooseDialogue(g, 0); const order = structuredClone(g.life.delivery);
  e.chooseDialogue(g, 0); assert.deepEqual(g.life.delivery, order); assert.equal(g.life.nextOrder, 2);
  assert.ok(JSON.parse(storage.get(w.SAVE_KEY)).life.delivery);
  close(g);
});

test('delivery is restored, then paid with one receipt only after the receiving dialogue closes', () => {
  let g = game(); accept(g);
  for (let i = 0; i < 120; i++) e.step(g);
  const elapsed = g.life.delivery.elapsed;
  g = reload(g); assert.equal(g.life.delivery.elapsed, elapsed);
  recipient(g); assert.equal(g.money, 60);
  g = reload(g); recipient(g); close(g);
  assert.equal(g.life.delivered, 1); assert.equal(g.money, 78); assert.equal(g.life.delivery, null);
  assert.equal(g.life.receipt.amount, 18);
  e.chooseDialogue(g, 0); e.interact(g); close(g); assert.equal(g.money, 78);
  g = reload(g); assert.equal(g.life.delivered, 1); assert.equal(g.money, 78); assert.equal(g.life.delivery, null);
});

test('late food still pays, pause and conversation freeze its elapsed active time, all three neighbors rotate', () => {
  const g = game();
  for (let route = 0; route < 3; route++) {
    accept(g); assert.equal(g.life.delivery.route, route);
    const elapsed = g.life.delivery.elapsed;
    g.phase = 'paused'; e.step(g, undefined, 10); assert.equal(g.life.delivery.elapsed, elapsed);
    g.phase = 'playing'; chefMenu(g); e.step(g, undefined, 10); assert.equal(g.life.delivery.elapsed, elapsed); close(g);
    g.life.delivery.elapsed = 91;
    recipient(g); const before = g.money; close(g);
    assert.equal(g.money, before + 12); assert.equal(g.life.receipt.warm, false);
  }
  accept(g); assert.equal(g.life.delivery.route, 0); assert.equal(g.life.delivered, 3);
});

test('basket is affordable only, permanent, charged once and immediately extends a current order', () => {
  let g = game(); g.money = 31; chefMenu(g); assert.equal(g.dialogue.choices[1].disabled, true);
  e.chooseDialogue(g, 1); assert.equal(g.money, 31); assert.equal(g.life.insulated, false); close(g);
  g.money = 60; accept(g); g.life.delivery.elapsed = 100; assert.equal(life.deliveryWarm(g.life), false);
  chefMenu(g); e.chooseDialogue(g, 1); e.chooseDialogue(g, 1);
  assert.equal(g.money, 28); assert.equal(g.life.insulated, true); assert.equal(life.deliveryWarm(g.life), true);
  close(g); g = reload(g); assert.equal(g.life.insulated, true); assert.equal(g.life.delivery.elapsed, 100);
  recipient(g); close(g); assert.equal(g.money, 46);
  chefMenu(g); assert.equal(g.dialogue.choices.length, 1); close(g);
});

test('cancel returns the food with no pay and does not let a stale receipt pay a later order', () => {
  const g = game(); accept(g); recipient(g); const stale = structuredClone(g.dialogue); close(g);
  accept(g); const next = g.life.delivery.id; chefMenu(g); e.chooseDialogue(g, 0); close(g);
  assert.equal(g.life.delivery, null); assert.equal(g.money, 78); assert.equal(g.life.delivered, 1);
  accept(g); assert.ok(g.life.delivery.id > next);
  g.dialogue = stale; close(g); assert.ok(g.life.delivery); assert.equal(g.money, 78);
});

test('legacy saves migrate without touching balances; malformed activity and infinite counters are cleaned', () => {
  storage.set(w.SAVE_KEY, JSON.stringify({ version: 1, stage: 3, money: 24, bikeDistance: 'Infinity', carDistance: 'bad' }));
  const g = e.createGame(); e.loadGame(g); assert.equal(g.money, 24); assert.equal(g.stage, 3); assert.deepEqual(g.life, life.createStreetLife());
  assert.equal(g.bikeDistance, 0); assert.equal(g.carDistance, 0);
  assert.deepEqual(life.loadStreetLife({ version: 1, delivered: Infinity, delivery: { id: 3, route: 99, elapsed: 20 } }), life.createStreetLife());
  const duplicate = life.loadStreetLife({ version: 1, delivered: 1, nextOrder: 3, delivery: { id: 2, route: 0, elapsed: 20 }, receipt: { order: 2, name: '散步的叔叔', amount: 18, warm: true } });
  assert.equal(duplicate.delivery, null); assert.equal(duplicate.receipt.amount, 18);
});

test('resuming at the riverside recipient keeps the camera outside the character and actual walls', () => {
  const target = { x: 80.88932019407201, z: -40.81948488909691, y: 1.4 };
  target.y += w.buildingElevation({ x: target.x, z: target.z });
  const view = camera.resolveCamera(target, Math.PI + 0.2, 0.12, 10);
  assert.ok(view.distance >= 3);
  assert.equal(w.BUILDINGS.some(b => camera.cameraBlocked(view, b)), false);
  const shop = { id: 'shop', x: 0, z: 0, w: 10, d: 10, h: 10, angle: 0, color: '#fff', real: false };
  const shopGround = w.buildingElevation(shop);
  assert.equal(camera.cameraBlocked({ x: 0, z: 6.5, y: shopGround + 1.7 }, shop), false, 'space under an awning remains open');
  assert.equal(camera.cameraBlocked({ x: 0, z: 6.5, y: shopGround + 2.9 }, shop), true, 'thin awning is still solid to the camera');
  assert.equal(camera.cameraBlocked({ x: 0, z: 4.9, y: shopGround + 1.7 }, shop), true, 'wall stays solid');
  // Keep this isolated shop fixture away from the real landmark at the origin.
  const besideWall = camera.resolveCamera({ x: 1000, z: 5.5, y: w.buildingElevation({ ...shop, x: 1000 }) + 1.4 }, 0, 0.12, 10, [{ ...shop, x: 1000 }]);
  assert.ok(besideWall.distance < 0.5); assert.equal(besideWall.yaw, 0);
  assert.equal(camera.cameraBlocked(besideWall, { ...shop, x: 1000 }), false);
});

test('every initial neighbor and chapter reunion stand outside building walls', () => {
  const g = game();
  for (const n of g.npcs) assert.equal(w.BUILDINGS.some(b => w.buildingContains(n, b, 0.6)), false, n.id);
  g.stage = 5; Object.assign(g.player, e.QUESTS[5]); e.interact(g); close(g);
  for (const n of g.npcs) assert.equal(w.BUILDINGS.some(b => w.buildingContains(n, b, 0.6)), false, n.id);
});
