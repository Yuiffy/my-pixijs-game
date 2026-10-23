import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../lib/sui-delivery-model.cjs';
import pilot from '../lib/sui-delivery-pilot.cjs';
import campaignPilot from '../lib/sui-delivery-campaign-pilot.cjs';
import rainPilot from '../lib/sui-delivery-rain-pilot.cjs';
import theaterPilot from '../lib/sui-delivery-theater-pilot.cjs';

const { createDelivery, startDelivery, stepDelivery, deliveryInput, freshDeliverySave, readDeliverySave, legacyRecord, retryDelivery, ORDER, CHECKPOINTS } = model;
function tick(s, input = {}, frames = 1) { for (let i = 0; i < frames; i++) stepDelivery(s, { ...deliveryInput(), ...input }); }
function playing() { const s = createDelivery(); startDelivery(s); return s; }

test('orientation changes immediately keep the player and landing inside the camera without advancing gameplay', () => {
  for (const levelId of ['attic-soup', 'bakery-backdoor', 'oven-crab', 'banquet-machine']) {
    const s = createDelivery(freshDeliverySave(), levelId);
    const level = model.deliveryLevel(s);
    s.player.x = levelId === 'oven-crab' ? 1150 : level.destination.x - 13;
    s.player.y = levelId === 'oven-crab' ? 480 : level.destination.y - 44;
    s.camera = { x: Math.max(0, s.player.x - 575), y: 80 };
    for (const phase of ['playing', 'paused', 'delivered']) {
      s.phase = phase;
      for (const [w, h] of [[540, 980], [1280, 540], [855, 540]]) {
        const { camera: oldCamera, viewport: oldViewport, ...before } = structuredClone(s);
        assert.ok(oldCamera && oldViewport);
        model.resizeDeliveryViewport(s, w, h);
        assert.ok(s.player.x >= s.camera.x + 10, `${levelId}/${phase}/${w}: player left visible`);
        assert.ok(s.player.x + s.player.w <= s.camera.x + w - 10, `${levelId}/${phase}/${w}: player right visible`);
        assert.ok(s.player.y >= s.camera.y, `${levelId}/${phase}/${h}: player top visible`);
        assert.ok(s.player.y + s.player.h < s.camera.y + h, `${levelId}/${phase}/${h}: landing visible`);
        assert.ok(s.camera.x >= 0 && s.camera.x <= Math.max(0, level.world.w - w));
        assert.ok(s.camera.y >= 0 && s.camera.y <= Math.max(0, level.world.h - h));
        const { camera, viewport, ...after } = s;
        assert.deepEqual(viewport, { w, h }); assert.ok(camera);
        assert.deepEqual(after, before, 'resize never steps physics, timers, mechanisms, phase or save');
      }
    }
  }
});

test('first order has a complete normal-input route including the high road, kindness, awning, cart and delivery', () => {
  const run = pilot.makePilot().journey();
  assert.equal(run.s.phase, 'delivered'); assert.equal(run.s.deaths, 0); assert.equal(run.s.player.health, 3);
  assert.equal(run.s.lifts, 2); assert.equal(run.s.bounces, 2);
  assert.ok(run.s.save.found.includes('old-sign')); assert.equal(run.s.save.kindness, true);
  assert.deepEqual(run.s.save.delivered, [ORDER]); assert.equal(run.s.save.money, 42);
  assert.equal(run.s.save.resume, null); assert.equal(run.s.cart.docked, true);
  const aboard = run.milestones.find(m => m.name === 'cart-rider').state;
  const docked = run.milestones.find(m => m.name === 'cart-docked').state;
  assert.equal(aboard.player.y + 44, 556); assert.ok(docked.player.x - aboard.player.x > 400);
  assert.equal(run.milestones.find(m => m.name === 'upper-balcony').state.player.y + 44, 365);
  const seen = new Set(run.milestones.map(m => m.state.checkpoint));
  for (const cp of CHECKPOINTS) assert.ok(seen.has(cp.id), `both high and ground routes can activate ${cp.id}`);
  assert.ok(run.tape.length > 0 && run.tape.length < 12000, 'an authored route finishes without forced waits or a grind');
});

test('short and long jumps, release deceleration, air steering and jump buffering remain usable', () => {
  const a = playing(); const b = playing(); let short = a.player.y; let high = b.player.y;
  for (let i = 0; i < 130; i++) { tick(a, { jump: i < 6 }); tick(b, { jump: i < 100 }); short = Math.min(short, a.player.y); high = Math.min(high, b.player.y); }
  assert.ok(high < short - 60); assert.ok(b.player.grounded);
  tick(a, { right: true, run: true }, 50); const speed = a.player.vx; tick(a, { right: true }); assert.ok(a.player.vx < speed && a.player.vx > 235);
  const c = playing(); c.player.y = 620; c.player.vy = 220; c.player.grounded = false; c.player.coyote = 0;
  tick(c, { jump: true }, 14); assert.ok(c.player.vy < -450); tick(c, { jump: true }, 150); assert.equal(c.player.grounded, true);
});

test('tray has startup, recovery and an edge-trigger; a second deliberate hit clears the lift target', () => {
  const s = playing(); const e = s.dough[0]; s.player.x = e.x - 53;
  tick(s, { attack: true }, 4); assert.equal(e.state, 'hop');
  tick(s, { attack: true }, 12); assert.equal(e.state, 'loft');
  tick(s, { attack: true }, 60); assert.equal(s.lifts, 1); assert.notEqual(e.state, 'gone', 'holding attack does not repeatedly hit');
  tick(s); tick(s, { attack: true }, 12); assert.equal(e.state, 'gone');
  const money = s.save.money; s.player.x -= 160; tick(s, {}, 510);
  assert.equal(e.state, 'hop'); assert.equal(s.save.money, money, 'restoring a dough target cannot farm money');
});

test('loft targets are safe to pass beside and each can provide only one boosted stomp', () => {
  const s = playing(); const e = s.dough[0]; e.state = 'loft'; e.timer = 2;
  s.player.x = e.x; tick(s); assert.equal(s.player.health, 3);
  s.player.y = e.y - 45; s.player.vy = 150; s.player.grounded = false; s.player.coyote = 0;
  tick(s, { jump: true }, 2); assert.equal(e.state, 'gone'); assert.equal(s.bounces, 1); assert.ok(s.player.vy < -800);
  tick(s, { jump: true }, 20); assert.equal(s.bounces, 1);
});

test('cleared dough recovers after a miss, and never reappears overlapping the player', () => {
  const s = playing(); const e = s.dough[0]; e.state = 'gone'; e.timer = 0; s.player.x = e.homeX;
  tick(s, {}, 20); assert.equal(e.state, 'gone');
  s.player.x -= 100; tick(s); assert.equal(e.state, 'hop'); assert.ok(e.grace > 0);
});

test('checkpoint retry and reload preserve permanent discoveries, kindness and the meal but reset the segment encounter', () => {
  const p = pilot.makePilot(); p.courtyard(); p.go(1470, 300); p.go(1650, 300); p.tick({ interact: true });
  const before = structuredClone(p.s.save); p.s.player.y = 1050; p.tick(); assert.equal(p.s.phase, 'dead'); p.tick({}, 80);
  assert.equal(p.s.phase, 'playing'); assert.equal(p.s.checkpoint, 'awning'); assert.equal(p.s.carrying, true); assert.equal(p.s.player.health, 3);
  assert.deepEqual(p.s.save, before); assert.ok(p.s.dough.every(e => e.state === 'hop'));
  const restored = createDelivery(readDeliverySave(JSON.stringify(p.s.save))); startDelivery(restored);
  assert.equal(restored.checkpoint, 'awning'); assert.equal(restored.carrying, true); assert.ok(restored.save.found.includes('old-sign')); assert.equal(restored.save.kindness, true);
});

test('a fallen rider retries at the cart stop with a reachable cart', () => {
  const p = pilot.makePilot(); p.courtyard(); p.go(2100, 500); p.tick({}, 10);
  assert.equal(p.s.checkpoint, 'cart'); p.s.player.y = 1050; p.tick(); p.tick({}, 80);
  assert.equal(p.s.phase, 'playing'); assert.equal(p.s.player.x, 2100); assert.ok(p.s.cart.x < 2180);
});

test('delivery requires the meal and interaction at the customer, changes surfaces and cannot repeat its payment', () => {
  const s = playing(); s.player.x = 3340; s.player.y = 366;
  tick(s, { interact: true }); assert.equal(s.phase, 'playing');
  s.carrying = true; tick(s); tick(s, { interact: true }); assert.equal(s.phase, 'delivered'); assert.equal(s.save.money, 30);
  const platforms = model.deliverySurfaces(s); assert.ok(platforms.some(p => p.id === 'flower-shortcut-1'));
  s.phase = 'playing'; s.carrying = true; tick(s); tick(s, { interact: true }); assert.equal(s.save.money, 30); assert.deepEqual(s.save.delivered, [ORDER]);
});

test('ordinary orders have no deadline; pausing freezes time, movement and state', () => {
  const s = playing(); tick(s, { interact: true }); s.time = 10000;
  s.phase = 'paused'; const before = structuredClone(s); tick(s, { right: true, attack: true, jump: true }, 300); assert.deepEqual(s, before);
  s.phase = 'playing'; s.player.x = 3340; s.player.y = 366; tick(s); tick(s, { interact: true }); assert.equal(s.phase, 'delivered');
});

test('hot mode starts from the kitchen; timeout still delivers; practice does not write a record', () => {
  const save = freshDeliverySave(); save.delivered = [ORDER]; save.money = 30; save.resume = { checkpoint: 'attic', carrying: true };
  const s = createDelivery(save); startDelivery(s, 'hot'); assert.equal(s.checkpoint, 'kitchen'); assert.equal(s.carrying, false);
  tick(s, { interact: true }); s.time = 120; s.player.x = 3340; s.player.y = 366; tick(s); tick(s, { interact: true }); assert.equal(s.phase, 'delivered'); assert.ok(s.save.hotBest >= 120); assert.equal(s.save.hotMedal, false); assert.equal(s.save.money, 30);
  startDelivery(s, 'practice', 'attic'); s.player.x = 3340; s.player.y = 366; const record = s.save.hotBest; tick(s, { interact: true }); assert.equal(s.save.hotBest, record);
});

test('versioned saves sanitize records and keep legacy completion separate from the new story', () => {
  for (const raw of [null, '{', 'null', '5', '[]', '{"version":1,"delivered":["attic-soup"]}']) assert.deepEqual(readDeliverySave(raw), freshDeliverySave());
  const raw = JSON.stringify({ version: 2, found: ['old-sign', 'old-sign', 'courtyard-coin-0', 'fake'], delivered: [ORDER, ORDER], kindness: true, money: 9999, tray: 'wide', hotBest: -1, resume: { checkpoint: 'not-a-place', carrying: true } });
  const clean = readDeliverySave(raw); assert.equal(clean.money, 39); assert.equal(clean.tray, 'wide'); assert.equal(clean.found.length, 2); assert.equal(clean.resume, null); assert.equal(clean.hotBest, 0);
  const old = JSON.stringify({ unlocked: 3, best: [{ time: 15, stars: ['star-0', 'star-0', 'star-2'] }] });
  assert.deepEqual(legacyRecord(old), { levels: 1, stars: 2 }); assert.deepEqual(readDeliverySave(old).delivered, []);
});

test('width modification changes reach and recovery without changing jump or run physics', () => {
  const a = playing(); const b = playing(); b.save.found.push('old-sign'); b.save.tray = 'wide';
  for (const s of [a, b]) { s.player.x = s.dough[0].x - 100; tick(s, { attack: true }, 15); }
  assert.equal(a.dough[0].state, 'hop'); assert.equal(b.dough[0].state, 'loft'); assert.ok(b.player.cooldown > a.player.cooldown);
  retryDelivery(a); retryDelivery(b); tick(a, { jump: true }, 35); tick(b, { jump: true }, 35); assert.equal(a.player.y, b.player.y);
});

test('twelve connected orders are reachable using only public inputs, with earned abilities opening later routes', () => {
  const runs = campaignPilot.campaign();
  assert.deepEqual(runs.map(p => p.s.levelId), model.LEVELS.map(v => v.id));
  for (const p of runs) { assert.equal(p.s.phase, 'delivered'); assert.equal(p.s.player.health, 3); assert.equal(p.s.deaths, 0); }
  const bakery = runs[1]; const riding = bakery.milestones.find(v => v.name === 'pan-rider').state;
  assert.equal(riding.pans['bakery-lift'].y, 450); assert.equal(riding.player.y + 44, 450);
  assert.equal(bakery.milestones.find(v => v.name === 'flour-shelf').state.player.y + 44, 375);
  const oven = runs[2];
  assert.equal(oven.s.boss.phase, 'off'); assert.equal(oven.s.boss.hits, 3); assert.ok(model.insulatedTray(oven.s));
  const stages = oven.milestones.filter(v => v.name.startsWith('pan-raised')).map(v => v.state.boss);
  assert.equal(new Set(stages.map(v => v.x)).size, 3); assert.deepEqual(stages.map(v => v.facing), [-1, 1, -1]);
  const market = runs[3]; const a = market.milestones.find(v => v.name === 'moving-stall').state; const b = market.milestones.find(v => v.name === 'moving-stall-rider').state;
  assert.equal(a.player.y + 44, 500); assert.equal(b.player.y + 44, 500); assert.ok(b.player.x > a.player.x + 35);
  assert.ok(market.milestones.find(v => v.name === 'reflected-heat').state.projectiles.some(v => v.reflected));
  assert.deepEqual(market.s.switches, ['market-bell-gate']);
});

test('freight carries its rider up the sloped rail, waits for the dispatch bell, and docks within jumping distance', () => {
  const p = campaignPilot.campaign()[4];
  const a = p.milestones.find(v => v.name === 'sloped-rail-rider').state;
  const b = p.milestones.find(v => v.name === 'middle-stop').state;
  assert.ok(b.player.x > a.player.x + 500); assert.ok(b.player.y < a.player.y - 70);
  assert.equal(b.cart.station, 1); assert.equal(b.cart.active, false); assert.equal(b.switches.length, 0);
  assert.equal(b.player.y + 44, b.cart.y); assert.equal(b.checkpoint, 'freight-middle');
  const docked = p.milestones.find(v => v.name === 'unloading-stop').state;
  assert.equal(docked.cart.y, 460); assert.equal(docked.cart.x, 2500); assert.equal(docked.cart.docked, true);
  assert.ok(model.deliverySurfaces(p.s).some(v => v.id === 'freight-neighbor-walkway'));
});

test('freight retries and continued saves put the cart at the current station with the actual bell state', () => {
  const run = campaignPilot.campaign()[4];
  for (const name of ['middle-stop', 'dispatch-open']) {
    const saved = run.milestones.find(v => v.name === name).state.save;
    const s = createDelivery(readDeliverySave(JSON.stringify(saved))); startDelivery(s);
    assert.equal(s.levelId, 'freight-lunch'); assert.equal(s.cart.station, 1); assert.equal(s.cart.y, 500);
    assert.equal(s.carrying, true); assert.equal(s.player.health, 3);
    retryDelivery(s); tick(s, {}, 30);
    assert.equal(s.phase, 'playing'); assert.equal(s.deaths, 0);
    assert.equal(s.cart.active, name === 'dispatch-open');
    assert.equal(s.switches.includes('freight-dispatch'), name === 'dispatch-open');
  }
});

test('the serving machine changes belt direction and height, opens reachable steps and becomes a table', () => {
  const p = campaignPilot.campaign()[5];
  assert.equal(p.s.machine.phase, 'off'); assert.equal(p.s.switches.length, 3);
  const a = p.milestones.find(v => v.name === 'upper-belt-1').state;
  const b = p.milestones.find(v => v.name === 'upper-belt-2').state;
  assert.equal(a.player.y + 44, 560); assert.equal(b.player.y + 44, 440);
  assert.equal(model.beltSpeed({ ...p.s, switches: ['sorter-bell-0'] }), 95);
  assert.equal(model.beltSpeed({ ...p.s, switches: ['sorter-bell-0', 'sorter-bell-1'] }), -125);
  for (let i = 0; i < 3; i++) assert.ok(p.milestones.find(v => v.name === `reflected-${i}`).state.projectiles.some(v => v.reflected));
  const surfaces = model.deliverySurfaces(p.s);
  assert.ok(surfaces.some(v => v.id === 'sorter-table-bridge')); assert.ok(!surfaces.some(v => v.id === 'sorter-bell-2'));
});

test('partially stopped serving belts survive retry and reload, while invalid out-of-order switches are sanitized', () => {
  const run = campaignPilot.campaign()[5];
  const raw = run.milestones.find(v => v.name === 'belt-stopped-1').state.save;
  const s = createDelivery(readDeliverySave(JSON.stringify(raw))); startDelivery(s); retryDelivery(s);
  assert.equal(model.servingStage(s), 2); assert.equal(s.machine.phase, 'sleep'); assert.equal(s.projectiles.length, 0);
  assert.ok(model.deliverySurfaces(s).some(v => v.id === 'sorter-second-step'));
  assert.ok(model.deliverySurfaces(s).some(v => v.id === 'sorter-bell-2'));
  const hostile = readDeliverySave(JSON.stringify({ ...raw, resume: { ...raw.resume, switches: ['sorter-bell-2'] } }));
  assert.deepEqual(hostile.resume.switches, []);
});

test('serving bells require the current height and an open feed window, and handoff requires all three', () => {
  const raw = campaignPilot.campaign()[5].milestones.find(v => v.name === 'take-meal').state.save;
  const s = createDelivery(readDeliverySave(JSON.stringify(raw))); startDelivery(s);
  s.machine.phase = 'warning'; s.machine.timer = 1;
  s.projectiles = [{ id: 1, x: 1569, y: 652, vx: 120, reflected: true, life: 1 }]; tick(s);
  assert.equal(s.switches.length, 0);
  s.machine.phase = 'feed'; s.machine.timer = 4;
  s.projectiles = [{ id: 2, x: 1569, y: 532, vx: 120, reflected: true, life: 1 }]; tick(s);
  assert.equal(s.switches.length, 0);
  s.projectiles = [{ id: 3, x: 1569, y: 652, vx: 120, reflected: true, life: 1 }]; tick(s);
  assert.deepEqual(s.switches, ['sorter-bell-0']);
  s.player.x = 2210; s.player.y = 636; tick(s, { interact: true }); assert.equal(s.phase, 'playing');
});

test('completed market orders support open-route visits and full hot replays without repeated payment or blocked emitters', () => {
  const run = campaignPilot.campaign(); const save = readDeliverySave(JSON.stringify(run[5].s.save));
  const s = createDelivery(save); startDelivery(s, 'story', undefined, 'freight-lunch');
  assert.ok(s.switches.includes('freight-dispatch'));
  startDelivery(s, 'story', undefined, 'serving-machine'); tick(s); assert.equal(s.machine.phase, 'off');
  startDelivery(s, 'practice', 'sorter-rest', 'serving-machine'); assert.equal(s.switches.length, 0); assert.equal(s.carrying, true);
  const money = save.money;
  for (const p of [campaignPilot.freight(save, 'hot'), campaignPilot.serving(save, 'hot')]) {
    assert.equal(p.s.phase, 'delivered'); assert.equal(p.s.player.health, 3); assert.equal(p.s.deaths, 0);
    assert.equal(p.s.save.money, money); assert.ok(p.s.save.records[p.s.levelId].medal);
  }
});

test('campaign unlocks sequentially; additive version-2 records migrate without discarding the first-order save', () => {
  const original = readDeliverySave(JSON.stringify({ version: 2, delivered: [ORDER], found: ['old-sign'], hotBest: 70, resume: { checkpoint: 'cart', carrying: true } }));
  assert.equal(original.hotBest, 70); assert.equal(original.records[ORDER].best, 70); assert.equal(original.resume.level, ORDER);
  assert.equal(model.levelUnlocked(original, 'bakery-backdoor'), true); assert.equal(model.levelUnlocked(original, 'oven-crab'), false);
  const s = createDelivery(original); startDelivery(s, 'story', undefined, 'oven-crab'); assert.equal(s.phase, 'title');
  const corrupted = readDeliverySave(JSON.stringify({ version: 2, delivered: ['oven-crab'], resume: { level: 'oven-crab', checkpoint: 'oven-rest' } }));
  assert.deepEqual(corrupted.delivered, []); assert.equal(corrupted.resume, null);
});

test('an activated pan carries the player, returns after its window, and resets to reachable height', () => {
  const p = campaignPilot.bakery(pilot.makePilot().journey().s.save);
  const state = p.milestones.find(v => v.name === 'pan-rider').state;
  assert.ok(state.pans['bakery-lift'].timer > 0); assert.equal(state.player.y + 44, state.pans['bakery-lift'].y);
  assert.equal(p.s.pans['bakery-lift'].y, 610);
  retryDelivery(p.s); assert.equal(p.s.pans['bakery-lift'].y, 610); assert.equal(p.s.pans['bakery-lift'].timer, 0);
});

test('a closed valve or a ground-level swing cannot damage the oven; successful stages change approach geometry', () => {
  const save = freshDeliverySave(); save.delivered = [ORDER, 'bakery-backdoor'];
  const s = createDelivery(save); startDelivery(s, 'story', undefined, 'oven-crab');
  s.boss.phase = 'vent'; s.boss.timer = 4; s.player.x = s.boss.x + 5;
  tick(s, { attack: true }, 20); assert.equal(s.boss.hits, 0);
  s.player.y = 491; s.player.health = 3; s.boss.phase = 'claw-warning'; s.boss.timer = 1; tick(s, {}, 60); tick(s, { attack: true }, 20); assert.equal(s.boss.hits, 0);
  s.boss.phase = 'vent'; s.boss.timer = 5; s.phase = 'playing';
  Object.assign(s.player, { x: s.boss.x + 10, y: 491, vy: 0, vx: 0, facing: 1, attack: 0, cooldown: 0, attackHeld: false, health: 3 });
  tick(s, { attack: true }, 20); assert.equal(s.boss.hits, 1); assert.equal(s.boss.phase, 'rest');
});

test('oven retries reset unfinished combat, preserve a closed oven, and hot replays require the fight again', () => {
  const runs = campaignPilot.campaign(); const save = readDeliverySave(JSON.stringify(runs[2].s.save));
  const s = createDelivery(save); startDelivery(s, 'hot', undefined, 'oven-crab'); assert.equal(s.boss.phase, 'sleep');
  retryDelivery(s); assert.equal(s.boss.phase, 'sleep');
  s.boss.hits = 2; s.boss.stage = 2; s.boss.phase = 'claw'; retryDelivery(s); assert.equal(s.boss.hits, 0);
  s.boss.phase = 'off'; retryDelivery(s); assert.equal(s.boss.phase, 'off');
});

test('heat reflection requires both insulation and an active swing, rather than merely holding attack', () => {
  function encounter(insulation = true) {
    const save = freshDeliverySave(); if (insulation) save.delivered = [ORDER, 'bakery-backdoor', 'oven-crab'];
    const s = createDelivery(save, 'market-stalls'); s.phase = 'playing'; s.player.x = 1650;
    s.projectiles = [{ id: 1, x: 1720, y: 652, vx: -220, reflected: false, life: 5 }]; return s;
  }
  const s = encounter(); tick(s, { attack: true }, 4); assert.equal(s.projectiles[0].reflected, false);
  tick(s, { attack: true }, 12); assert.equal(s.projectiles[0].reflected, true); assert.ok(s.projectiles[0].vx > 0);
  const idle = encounter(); tick(idle, {}, 50); assert.equal(idle.player.health, 2);
  const bare = encounter(false); tick(bare, { attack: true }, 50); assert.equal(bare.player.health, 2);
  const late = encounter(); late.player.attackHeld = true; tick(late, { attack: true }, 50); assert.equal(late.player.health, 2);
});

test('a reflected bell opens collision, survives retry and browser-save restoration, and cannot inflate currency', () => {
  const market = campaignPilot.campaign()[3];
  const raw = market.milestones.find(v => v.name === 'bell-open').state.save;
  const save = readDeliverySave(JSON.stringify(raw)); const s = createDelivery(save); startDelivery(s);
  assert.equal(s.levelId, 'market-stalls'); assert.ok(s.switches.includes('market-bell-gate'));
  assert.ok(!model.deliverySurfaces(s).some(v => v.id === 'market-bell-gate'));
  const money = s.save.money; retryDelivery(s); assert.equal(s.save.money, money); assert.ok(s.switches.includes('market-bell-gate'));
  const hostile = readDeliverySave(JSON.stringify({ ...raw, resume: { ...raw.resume, switches: ['unknown-gate', 'market-bell-gate', 'market-bell-gate'] } }));
  assert.deepEqual(hostile.resume.switches, ['market-bell-gate']);
});

test('per-order challenge records and one-time pay survive moving between completed orders', () => {
  const runs = campaignPilot.campaign(); const save = readDeliverySave(JSON.stringify(runs[3].s.save));
  const s = createDelivery(save); startDelivery(s, 'hot', 'bakery-door', 'bakery-backdoor');
  s.player.x = 3210; s.player.y = 421; s.carrying = true; s.time = 80; const money = s.save.money;
  tick(s, { interact: true }); assert.equal(s.phase, 'delivered'); assert.equal(s.save.money, money);
  assert.ok(s.save.records['bakery-backdoor'].medal); assert.equal(s.save.hotBest, 0);
  const restored = readDeliverySave(JSON.stringify(s.save)); assert.ok(restored.records['bakery-backdoor'].medal); assert.equal(restored.money, money);
});

test('closing the oven persists before the final handoff, while hot replay remains a new encounter', () => {
  const run = campaignPilot.campaign()[2];
  const beforeHandoff = run.milestones.find(v => v.name === 'valve-2').state.save;
  const restored = createDelivery(readDeliverySave(JSON.stringify(beforeHandoff))); startDelivery(restored);
  assert.equal(restored.levelId, 'oven-crab'); assert.equal(restored.boss.phase, 'off'); assert.equal(restored.carrying, true);
  retryDelivery(restored); assert.equal(restored.boss.phase, 'off');
  for (const view of run.milestones.filter(v => v.name.startsWith('on-back') || v.name.startsWith('pan-raised'))) {
    assert.ok(view.state.boss.x + 250 < view.state.camera.x + view.state.viewport.w + 20);
    assert.ok(680 < view.state.camera.y + view.state.viewport.h);
  }
  for (const name of ['claw-warning', 'vent-warning']) {
    const view = run.milestones.find(v => v.name === name).state;
    assert.ok(view.player.x >= view.camera.x + 20, `${name}: the observer remains in the frame`);
    assert.ok(view.player.x + view.player.w <= view.camera.x + view.viewport.w - 20);
  }
});

test('choosing an order explicitly starts at its meal counter, while continue restores its checkpoint', () => {
  const save = freshDeliverySave(); save.delivered = [ORDER]; save.resume = { level: 'bakery-backdoor', checkpoint: 'bakery-yard', carrying: true };
  const s = createDelivery(save); startDelivery(s, 'story', undefined, 'bakery-backdoor');
  assert.equal(s.checkpoint, 'bakery-entry'); assert.equal(s.carrying, false); assert.equal(s.player.x, 150);
});

test('steam dash is earned after the market, activates once in the air, and refreshes only on a landing', () => {
  const locked = playing(); tick(locked, { jump: true }, 20); tick(locked, { jump: true, dash: true });
  assert.equal(locked.player.dash, 0);
  const save = readDeliverySave(JSON.stringify(campaignPilot.campaign()[5].s.save));
  const s = createDelivery(save); startDelivery(s, 'story', undefined, 'rain-relay');
  tick(s, { jump: true }, 25); const x = s.player.x;
  tick(s, { jump: true, right: true, dash: true }); assert.ok(s.player.dash > 0); assert.equal(s.player.dashReady, false);
  tick(s, { jump: true, dash: true }, 23); assert.ok(s.player.x > x + 100); assert.equal(s.player.dash, 0);
  tick(s, { jump: true }, 2); tick(s, { jump: true, dash: true }); assert.equal(s.player.dash, 0);
  while (!s.player.grounded) tick(s);
  assert.equal(s.player.dashReady, true); tick(s, { dash: true }, 25); assert.equal(s.player.dash, 0);
  tick(s, {}, 2); tick(s, { jump: true, dash: true });
  assert.equal(s.player.dash, 0); assert.ok(s.player.vy < 0); assert.equal(s.player.grounded, false);
  tick(s, { jump: true }, 2); tick(s, { jump: true, dash: true }); assert.ok(s.player.dash > 0);
});

test('rain hooks unfold the actual spring surfaces, warn before folding, reopen and persist through retry', () => {
  const run = campaignPilot.campaign()[6];
  const raw = run.milestones.find(m => m.name === 'canopy-open-2').state.save;
  const s = createDelivery(readDeliverySave(JSON.stringify(raw))); startDelivery(s); retryDelivery(s);
  assert.equal(s.levelId, 'rain-relay'); assert.equal(s.carrying, true); assert.equal(s.checkpoint, 'rain-balcony');
  assert.deepEqual(s.switches, ['rain-canopy-1', 'rain-canopy-2']);
  const canopy = model.deliveryLevel(s).rain.canopies[1];
  for (const [clock, phase, visible] of [[4, 'open', true], [5, 'warning', true], [6, 'folded', false], [7.1, 'open', true]]) {
    s.clock = clock; assert.equal(model.canopyPhase(s, canopy), phase);
    assert.equal(model.deliverySurfaces(s).some(b => b.id === canopy.id), visible);
  }
  assert.ok(run.milestones.find(m => m.name === 'first-balcony').state.player.y < 400);
  assert.ok(run.milestones.some(m => m.state.player.dash > 0));
});

test('greenhouse water carries a real rider, opens flower beds, and reload keeps a reachable lift and the meal', () => {
  const run = campaignPilot.campaign()[7];
  const low = run.milestones.find(m => m.name === 'water-lift-rider').state;
  const high = run.milestones.find(m => m.name === 'water-lift-high').state;
  assert.equal(low.player.y + 44, low.rain.liftY); assert.equal(high.player.y + 44, 425);
  assert.ok(low.rain.liftY > high.rain.liftY + 80);
  const s = createDelivery(readDeliverySave(JSON.stringify(low.save))); startDelivery(s); retryDelivery(s);
  assert.equal(s.checkpoint, 'green-door'); assert.equal(s.rain.liftY, 620); assert.ok(s.switches.includes('green-inlet')); assert.equal(s.carrying, true);
  tick(s, {}, 240); assert.ok(s.rain.liftY < 520);
  const upper = createDelivery(readDeliverySave(JSON.stringify(run.milestones.find(m => m.name === 'flower-route-open').state.save))); startDelivery(upper);
  assert.equal(upper.rain.liftY, 425); assert.ok(model.deliverySurfaces(upper).some(b => b.id === 'green-flower-bed-1'));
});

test('the bird telegraphs a fixed route, takes the bread without losing the meal, and the ribbon survives reload', () => {
  const run = campaignPilot.campaign()[8];
  const warning = run.milestones.find(m => m.name === 'swoop-warning').state;
  assert.equal(warning.rain.bird.phase, 'warning'); assert.ok(warning.rain.bird.timer > 0);
  assert.ok(warning.rain.bird.fromX > warning.rain.bird.targetX);
  const ribbon = run.milestones.find(m => m.name === 'ribbon-returned').state;
  assert.ok(ribbon.switches.includes('bird-ribbon')); assert.equal(ribbon.carrying, true);
  const s = createDelivery(readDeliverySave(JSON.stringify(ribbon.save))); startDelivery(s); retryDelivery(s);
  assert.equal(s.checkpoint, 'bird-nest'); assert.ok(s.switches.includes('bird-ribbon')); assert.equal(s.carrying, true);
  const money = s.save.money; tick(s, { interact: true }); assert.equal(s.save.money, money);
});

test('bird handoff needs the recovered ribbon; an active tray can stop a swoop and create a safe bounce', () => {
  const raw = campaignPilot.campaign()[8].milestones.find(m => m.name === 'take-meal').state.save;
  const s = createDelivery(readDeliverySave(JSON.stringify(raw))); startDelivery(s);
  Object.assign(s.player, { x: 3040, y: 456 }); tick(s, { interact: true }); assert.equal(s.phase, 'playing'); assert.equal(s.carrying, true);
  Object.assign(s.player, { x: 730, y: 486, grounded: true });
  Object.assign(s.rain.bird, { x: 790, y: 500, phase: 'warning', timer: 1, fromX: 790, fromY: 500 });
  tick(s, {}, 2); tick(s, { attack: true }, 14); assert.equal(s.rain.bird.phase, 'rest'); assert.equal(s.player.health, 3);
  Object.assign(s.player, { x: s.rain.bird.x - 13, y: s.rain.bird.y - 50, vy: 100, jumpHeld: true, grounded: false });
  model.bounceBird(s, s.player.y - 10); assert.ok(s.player.vy < -600); assert.equal(s.bounces, 1);
});

test('rain challenges reset hooks and ribbon, retain earned tools, and award no repeated order money', () => {
  const runs = campaignPilot.campaign(); const save = readDeliverySave(JSON.stringify(runs[8].s.save));
  for (const fn of [rainPilot.rain, rainPilot.greenhouse, rainPilot.bird]) {
    const run = fn(save, 'hot'); assert.equal(run.s.phase, 'delivered'); assert.equal(run.s.deaths, 0); assert.equal(run.s.player.health, 3);
    assert.equal(run.s.save.money, save.money); assert.ok(run.s.save.records[run.s.levelId].medal);
  }
  const s = createDelivery(save); startDelivery(s, 'story', undefined, 'rain-relay'); assert.equal(s.switches.length, 2);
  assert.ok(model.deliverySurfaces(s).some(b => b.id === 'rain-neighbor-walkway'));
  startDelivery(s, 'practice', 'rain-mid', 'rain-relay'); assert.equal(s.switches.length, 0); assert.equal(model.steamBox(s), true);
});

test('theater pulley lifts carry a rider through actual height changes and warn before descending', () => {
  const run = campaignPilot.campaign()[9];
  for (const [id, low, high] of [['stage-lift-1', 600, 400], ['stage-lift-2', 540, 330]]) {
    const a = run.milestones.find(m => m.name === `${id}-rider`).state;
    const b = run.milestones.find(m => m.name === `${id}-high`).state;
    assert.ok(Math.abs(a.player.y + 44 - low) < 0.01); assert.ok(Math.abs(b.player.y + 44 - high) < 0.01);
    assert.ok(Math.abs(a.theater.lifts[id].y - low) < 0.01); assert.ok(Math.abs(b.theater.lifts[id].y - high) < 0.01);
  }
  const raw = run.milestones.find(m => m.name === 'second-rope-open').state.save;
  const descending = run.milestones.find(m => m.name === 'lift-descending-rider').state;
  assert.equal(descending.theater.lifts['stage-lift-1'].phase, 'descending');
  assert.ok(descending.player.y + 44 > 420 && descending.player.y + 44 < 500);
  assert.ok(Math.abs(descending.player.y + 44 - descending.theater.lifts['stage-lift-1'].y) < 0.01);
  const s = createDelivery(readDeliverySave(JSON.stringify(raw))); startDelivery(s); retryDelivery(s);
  assert.equal(s.carrying, true); assert.equal(s.theater.lifts['stage-lift-1'], 600); assert.equal(s.theater.lifts['stage-lift-2'], 540);
  assert.ok(s.switches.includes('stage-rope-2')); assert.equal(s.checkpoint, 'stage-gallery');
  s.theater.time = 7.1; assert.equal(model.liftPhase(s, 'stage-rope-2'), 'warning');
  s.theater.time = 8.1; assert.equal(model.liftPhase(s, 'stage-rope-2'), 'descending');
  assert.ok(model.deliverySurfaces(run.s).some(b => b.id === 'stage-scenery-bridge'));
});

test('serving the first basket changes the curtain and persists without completing or paying the two-basket order', () => {
  const run = campaignPilot.campaign()[10];
  const mark = run.milestones.find(m => m.name === 'first-basket-served').state;
  assert.equal(mark.phase, 'playing'); assert.equal(mark.carrying, true); assert.ok(!mark.save.delivered.includes('last-table'));
  const s = createDelivery(readDeliverySave(JSON.stringify(mark.save))); startDelivery(s); retryDelivery(s);
  assert.ok(s.switches.includes('table-served')); assert.ok(model.deliverySurfaces(s).some(b => b.id === 'table-curtain-bridge'));
  s.player.x = 1260; const money = s.save.money; tick(s, { interact: true }); assert.equal(s.save.money, money);
  s.switches = []; Object.assign(s.player, { x: 3020, y: 356 }); tick(s); tick(s, { interact: true });
  assert.equal(s.phase, 'playing'); assert.equal(s.carrying, true);
});

test('banquet parts need the previous mechanism and the crown opening, rather than three identical hits', () => {
  const run = campaignPilot.campaign()[11];
  const raw = run.milestones.find(m => m.name === 'take-meal').state.save;
  const s = createDelivery(readDeliverySave(JSON.stringify(raw))); startDelivery(s);
  const crank = { x: 2050, y: 400, w: 65, h: 66 }; const crown = { x: 2600, y: 280, w: 65, h: 66 };
  model.attackTheater(s, crank, () => {}); assert.deepEqual(s.switches, []);
  s.switches.push('banquet-heat'); model.attackTheater(s, crown, () => {}); assert.deepEqual(s.switches, ['banquet-heat']);
  model.attackTheater(s, crank, () => {}); assert.ok(s.switches.includes('banquet-crank'));
  s.theater.time = 1; model.attackTheater(s, crown, () => {}); assert.equal(model.banquetReady(s), false);
  s.theater.time = 2.5; assert.equal(model.crownPhase(s), 'warning'); model.attackTheater(s, crown, () => {}); assert.equal(model.banquetReady(s), false);
  s.theater.time = 3.5; model.attackTheater(s, crown, () => {}); assert.equal(model.banquetReady(s), true);
  assert.ok(!model.deliverySurfaces(s).some(b => b.id === 'banquet-curtain'));
  assert.ok(model.deliverySurfaces(s).some(b => b.id === 'banquet-settled-bridge'));
  const corrupted = readDeliverySave(JSON.stringify({ ...raw, resume: { ...raw.resume, switches: ['banquet-crown', 'banquet-served'] } }));
  assert.deepEqual(corrupted.resume.switches, []);
});

test('the final meal requires serving then walking to the reserved chair; completion persists and can be revisited', () => {
  const run = campaignPilot.campaign()[11];
  const before = run.milestones.find(m => m.name === 'table-before-serving').state;
  const served = run.milestones.find(m => m.name === 'banquet-served').state;
  assert.equal(before.phase, 'playing'); assert.equal(served.phase, 'playing'); assert.equal(served.theater.seated, false);
  assert.equal(served.carrying, true); assert.ok(!served.save.delivered.includes('banquet-machine'));
  assert.ok(run.s.theater.seated); assert.equal(run.s.player.pose, 'sit'); assert.equal(run.s.save.resume, null);
  const raw = run.milestones.find(m => m.name === 'crank-stopped').state.save;
  const partial = createDelivery(readDeliverySave(JSON.stringify(raw))); startDelivery(partial); retryDelivery(partial);
  assert.deepEqual(partial.switches, ['banquet-heat', 'banquet-crank']); assert.equal(partial.carrying, true);
  const s = createDelivery(readDeliverySave(JSON.stringify(served.save))); startDelivery(s); retryDelivery(s);
  assert.equal(s.checkpoint, 'banquet-seat'); assert.ok(s.switches.includes('banquet-served')); assert.equal(s.carrying, true);
  const completed = createDelivery(readDeliverySave(JSON.stringify(run.s.save))); const money = completed.save.money;
  model.visitBanquet(completed); assert.equal(completed.theater.seated, true); assert.equal(completed.player.pose, 'sit'); assert.equal(completed.phase, 'playing');
  tick(completed); tick(completed, { interact: true }); assert.equal(completed.theater.seated, false);
  tick(completed); tick(completed, { interact: true }); assert.equal(completed.theater.seated, true);
  assert.equal(completed.save.money, money); assert.equal(completed.save.resume, null);
});

test('the final handoff is blocked until all three parts stop and the meal is on the table', () => {
  const run = campaignPilot.campaign()[11];
  const s = createDelivery(readDeliverySave(JSON.stringify(run.milestones.find(m => m.name === 'take-meal').state.save))); startDelivery(s);
  Object.assign(s.player, { x: 3210, y: 456 }); tick(s, { interact: true }); assert.equal(s.phase, 'playing');
  s.switches = ['banquet-heat', 'banquet-crank', 'banquet-crown']; tick(s); tick(s, { interact: true }); assert.equal(s.phase, 'playing');
  s.switches.push('banquet-served'); tick(s); tick(s, { interact: true }); assert.equal(s.phase, 'delivered'); assert.equal(s.theater.seated, true);
});

test('theater hot replays reset their own mechanisms, require both baskets and the final seat, and do not repay orders', () => {
  const save = readDeliverySave(JSON.stringify(campaignPilot.campaign()[11].s.save));
  for (const fn of [theaterPilot.scenery, theaterPilot.lastTable, theaterPilot.banquet]) {
    const run = fn(save, 'hot'); assert.equal(run.s.phase, 'delivered'); assert.equal(run.s.player.health, 3); assert.equal(run.s.deaths, 0);
    assert.equal(run.s.save.money, save.money); assert.ok(run.s.save.records[run.s.levelId].medal);
  }
});

test('late theater practice starts with the prerequisite route open, without awarding story completion', () => {
  const save = readDeliverySave(JSON.stringify(campaignPilot.campaign()[11].s.save)); const s = createDelivery(save); const money = save.money;
  startDelivery(s, 'practice', 'table-curtain', 'last-table'); assert.ok(s.switches.includes('table-served'));
  startDelivery(s, 'practice', 'banquet-crank', 'banquet-machine'); assert.deepEqual(s.switches, ['banquet-heat']);
  startDelivery(s, 'practice', 'banquet-seat', 'banquet-machine'); assert.equal(model.banquetReady(s), true); assert.ok(!s.switches.includes('banquet-served'));
  assert.equal(s.carrying, true); assert.equal(s.save.money, money);
});

test('home-less version two saves retain earned balance, checkpoints and tools', () => {
  const raw = structuredClone(pilot.makePilot().journey().s.save);
  delete raw.home;
  const restored = readDeliverySave(JSON.stringify(raw));
  assert.equal(restored.money, raw.money);
  assert.deepEqual(restored.home, { owned: [], displayed: [] });
  assert.deepEqual(restored.delivered, raw.delivered);
  assert.deepEqual(restored.resume, raw.resume);
  assert.equal(restored.tray, raw.tray);
});

test('home purchases require the actual story unlock and funds; placing and storing are free', () => {
  const fresh = freshDeliverySave();
  assert.equal(model.decorateHome(fresh, 'red-cloth'), 'locked');
  assert.equal(model.decorateHome(fresh, 'unknown'), 'unknown');
  fresh.delivered.push(ORDER); fresh.money = 23;
  assert.equal(model.decorateHome(fresh, 'red-cloth'), 'short');
  assert.deepEqual(fresh.home.owned, []); assert.equal(fresh.money, 23);
  fresh.money = 24;
  assert.equal(model.decorateHome(fresh, 'red-cloth'), 'bought'); assert.equal(fresh.money, 0);
  assert.equal(model.decorateHome(fresh, 'red-cloth'), 'stored'); assert.equal(fresh.money, 0);
  assert.equal(model.decorateHome(fresh, 'red-cloth'), 'placed'); assert.equal(fresh.money, 0);
  assert.deepEqual(fresh.home, { owned: ['red-cloth'], displayed: ['red-cloth'] });
});

test('purchase receipts survive repeated reloads and stored decoration does not refund money', () => {
  let save = readDeliverySave(JSON.stringify(campaignPilot.campaign().at(-1).s.save));
  const income = save.money;
  for (const item of model.HOME_DECORATIONS) assert.equal(model.decorateHome(save, item.id), 'bought');
  model.decorateHome(save, 'warm-lights');
  for (let i = 0; i < 4; i++) save = readDeliverySave(JSON.stringify(save));
  assert.equal(save.money, income - 180);
  assert.equal(save.home.owned.length, 4);
  assert.deepEqual(save.home.displayed, ['red-cloth', 'menu-board', 'herb-shelf']);
  model.decorateHome(save, 'warm-lights'); assert.equal(save.money, income - 180);
});

test('malformed home receipts reject duplicate, unknown, locked, unowned and over-budget entries', () => {
  const raw = pilot.makePilot().journey().s.save;
  const save = readDeliverySave(JSON.stringify({ ...raw, money: 1e9, home: {
    owned: ['red-cloth', 'red-cloth', 'menu-board', 'unknown'],
    displayed: ['red-cloth', 'red-cloth', 'warm-lights', 'unknown'],
  } }));
  assert.equal(save.money, raw.money - 24);
  assert.deepEqual(save.home, { owned: ['red-cloth'], displayed: ['red-cloth'] });
  const budget = { ...freshDeliverySave(), money: 60, delivered: model.LEVELS.map(v => v.id) };
  model.restoreHome(budget, { owned: model.HOME_DECORATIONS.map(v => v.id) });
  assert.deepEqual(budget.home.owned, ['red-cloth', 'herb-shelf']); assert.equal(budget.money, 0);
  assert.deepEqual(budget.home.displayed, budget.home.owned);
  assert.deepEqual(readDeliverySave(JSON.stringify({ ...raw, home: { owned: null, displayed: 'red-cloth' } })).home.owned, []);
});

test('home spending survives the next delivery, retry and rewarded hot replay without affecting movement', () => {
  const save = readDeliverySave(JSON.stringify(pilot.makePilot().journey().s.save));
  const unspent = structuredClone(save); model.decorateHome(save, 'red-cloth');
  const a = campaignPilot.bakery(save); const b = campaignPilot.bakery(unspent);
  assert.equal(a.s.phase, 'delivered'); assert.equal(a.s.save.money, b.s.save.money - 24);
  assert.deepEqual(a.tape, b.tape); assert.deepEqual(a.s.player, b.s.player);
  const s = createDelivery(readDeliverySave(JSON.stringify(a.s.save)));
  startDelivery(s, 'story', undefined, 'oven-crab'); const before = structuredClone(s.save);
  retryDelivery(s); assert.equal(s.save.money, before.money); assert.deepEqual(s.save.home, before.home);
  const hot = pilot.makePilot(s.save, undefined, 'hot').journey();
  assert.equal(hot.s.save.money, before.money); assert.ok(hot.s.save.hotMedal);
  assert.equal(readDeliverySave(JSON.stringify(hot.s.save)).money, before.money);
});

test('keepsakes and neighbors follow actual deliveries and kindness, with evolving follow-up lines', () => {
  const save = freshDeliverySave();
  assert.deepEqual(model.homeKeepsakes(save), []); assert.deepEqual(model.homeNeighbors(save), []);
  save.kindness = true; assert.equal(model.homeNeighbors(save)[0].id, 'mechanic');
  assert.equal(model.homeNeighbors(save)[0].name, '栞栞');
  assert.equal(model.homeNeighbors(save)[0].art, 'shiori');
  assert.equal(model.LEVELS[2].customer, '修理师栞栞');
  save.delivered = [ORDER];
  assert.deepEqual(model.homeKeepsakes(save).map(v => v.id), ['flowers']);
  const early = model.homeNeighbors(save).find(v => v.id === 'gardener').line;
  save.delivered = model.LEVELS.map(v => v.id);
  assert.equal(model.homeNeighbors(save).length, 6);
  assert.notEqual(model.homeNeighbors(save).find(v => v.id === 'gardener').line, early);
  assert.deepEqual(model.homeKeepsakes(save).map(v => v.id), ['flowers', 'photo', 'herbs', 'bowl']);
  assert.match(model.homeNeighbors(save).find(v => v.id === 'freight').line, /下回/);
  save.money = 72; model.decorateHome(save, 'warm-lights');
  assert.match(model.homeNeighbors(save).find(v => v.id === 'freight').line, /捎来啦/);
});
