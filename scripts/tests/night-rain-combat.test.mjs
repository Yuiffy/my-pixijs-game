import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');
const { ATTACKS, combatPose, rollPose } = await loadTypescriptModule('src/components/nightRain/combat.ts');
const world = await loadTypescriptModule('src/components/nightRain/world.ts');
const fresh = () => { const s = engine.createGame(); engine.startGame(s); return s; };
const step = (s, ms, input = {}) => engine.stepGame(s, ms, { x: 0, z: 0, ...input });
const duel = () => { const s = fresh(); Object.assign(s.player, { x: -4, y: 0, z: 3.9, facing: Math.PI }); const e = s.enemies[0]; e.action = 'recover'; e.timer = 4; e.aggro = true; return { s, e }; };

test('jump has real ascent/descent, finite cost, air control, landing and no double jump', () => {
  const s = fresh(); const x = s.player.x; step(s, 150, { jump: true, x: 1 });
  assert.ok(s.player.jumpHeight > .5); assert.equal(s.player.stamina, 90); assert.ok(s.player.x > x);
  const velocity = s.player.jumpVelocity; step(s, 20, { jump: true }); assert.ok(s.player.jumpVelocity < velocity);
  step(s, 700); assert.equal(s.player.jumpHeight, 0); assert.equal(s.player.jumpVelocity, 0); assert.equal(s.player.y, 6);
});
test('Shift tap rolls on release; hold runs and releasing a sprint never rolls', () => {
  const tap = fresh(); step(tap, 60, { dashHeld: true }); assert.equal(tap.player.action, 'idle'); step(tap, 10); assert.equal(tap.player.action, 'dodge'); assert.equal(tap.player.stamina, 75);
  const hold = fresh(); const walk = fresh(); step(hold, 500, { x: 1, dashHeld: true }); step(walk, 500, { x: 1 });
  assert.ok(hold.player.x > walk.player.x + .3); assert.ok(hold.player.sprintTime > .1); step(hold, 10, { x: 1 }); assert.equal(hold.player.action, 'idle');
  const chord = fresh(); step(chord, 60, { dashHeld: true, jump: true }); step(chord, 10); assert.notEqual(chord.player.action, 'dodge');
});
test('light combo follows 1/2/3 and expires; one late buffer cannot queue several attacks', () => {
  const s = fresh(); step(s, 200, { light: true }); assert.equal(s.player.attack, 'light1');
  step(s, 150, { light: true }); assert.equal(s.player.attack, 'light2');
  step(s, 140); step(s, 180, { light: true }); assert.equal(s.player.attack, 'light3');
  step(s, 1200); step(s, 10, { light: true }); assert.equal(s.player.attack, 'light1');
  const spam = fresh(); step(spam, 20, { light: true }); step(spam, 20, { light: true }); step(spam, 550); assert.equal(spam.player.stamina, 83); assert.equal(spam.player.action, 'idle');
});
test('charge starts without damage, releases once, full charge earns posture and damage at higher cost', () => {
  const { s, e } = duel(); step(s, 800, { heavy: true, heavyHeld: true }); assert.equal(s.player.action, 'charge'); assert.equal(e.hp, e.maxHp);
  step(s, 200); assert.equal(s.player.attack, 'charged'); assert.equal(e.hp, e.maxHp); step(s, 150); assert.equal(e.hp, 0); assert.equal(s.player.stamina, 57);
  const partial = duel(); step(partial.s, 200, { heavy: true, heavyHeld: true }); step(partial.s, 350); assert.equal(partial.e.hp, partial.e.maxHp - 41);
  const held = fresh(); step(held, 2200, { heavy: true, heavyHeld: true }); assert.equal(held.player.attack, 'charged'); assert.equal(held.player.stamina, 57); step(held, 300, { heavyHeld: true }); assert.equal(held.player.action, 'idle');
});
test('attack steering is bounded before impact and much slower after impact; no free walking during swings', () => {
  const s = fresh(); s.player.facing = 0; step(s, 180, { heavy: true, x: 1 });
  assert.ok(s.player.facing > .6 && s.player.facing <= ATTACKS.heavy.turn + .001);
  const initial = { ...s.player }; step(s, 30, { x: -1 }); assert.equal(s.player.x, initial.x); assert.equal(s.player.z, initial.z);
  step(s, 320); const facing = s.player.facing; step(s, 50, { x: -1 }); assert.ok(Math.abs(s.player.facing - facing) <= .034);
  const aim = fresh(); aim.player.facing = 0; step(aim, 120, { heavy: true, aim: .5 }); assert.ok(aim.player.facing > .4);
});
test('running attacks are contextual, consume stamina and advance safely; both aerial attacks execute once', () => {
  for (const heavy of [false, true]) {
    const run = fresh(); step(run, 350, { x: 1, dashHeld: true }); const x = run.player.x;
    step(run, 50, { x: 1, dashHeld: true, [heavy ? 'heavy' : 'light']: true, heavyHeld: heavy });
    assert.equal(run.player.attack, heavy ? 'sprintHeavy' : 'sprintLight'); step(run, 500); assert.ok(run.player.x > x + .6);
    const air = fresh(); step(air, 150, { jump: true }); step(air, 20, { [heavy ? 'heavy' : 'light']: true }); assert.equal(air.player.attack, heavy ? 'airHeavy' : 'airLight');
    step(air, 300, { light: true }); assert.equal(air.player.airAttackUsed, true); step(air, 800); assert.equal(air.player.jumpHeight, 0);
  }
});
test('aerial heavy connects on landing, not at takeoff, and jump is not universal invulnerability', () => {
  const { s, e } = duel(); step(s, 160, { jump: true }); step(s, 80, { heavy: true }); assert.equal(e.hp, e.maxHp);
  step(s, 400); assert.equal(e.hp, e.maxHp - 46); assert.equal(s.player.jumpHeight, 0);
  const body = duel(); Object.assign(body.e, { action: 'attack', timer: .2, hitDone: false, facing: 0 }); step(body.s, 100, { jump: true }); assert.ok(body.s.player.hp < 100);
});
test('jump cannot cross a tall locked gate, but clears a low corridor parapet', () => {
  const gate=fresh();Object.assign(gate.player,{x:12,y:0,z:-7});step(gate,150,{z:-1,jump:true});step(gate,600,{z:-1,heavy:true});assert.ok(gate.player.z>-7.5);
  const ledge=fresh();Object.assign(ledge.player,{x:9,y:3,z:6,lastGround:{x:9,y:3,z:6},fallPeak:3});
  step(ledge,350,{x:-1,jump:true});step(ledge,800,{x:-1});assert.ok(ledge.player.x<8);assert.equal(ledge.player.y,0);assert.ok(ledge.player.hp<100);assert.equal(ledge.player.jumpHeight,0);
});
test('pause/Alt cancel charge and buffered inputs without releasing an unsolicited strike', () => {
  for (const cancel of [engine.clearHeldActions, s => engine.setPaused(s, true)]) {
    const s = fresh(); step(s, 800, { heavy: true, heavyHeld: true }); cancel(s); engine.setPaused(s, false); step(s, 500); assert.equal(s.player.action, 'idle'); assert.equal(s.player.attack, null);
  }
});
test('save keeps airborne combat and new state; legacy light swings resume and invalid new fields reject', () => {
  const s = fresh(); step(s, 150, { jump: true, x: 1 }); step(s, 10, { light: true }); const loaded = engine.loadGame(engine.saveGame(s)); assert.deepEqual(loaded.player, s.player);
  const legacy = fresh(); step(legacy, 100, { light: true }); delete legacy.player.attack; const restored = engine.loadGame(JSON.stringify(legacy)); assert.equal(restored.player.attack, 'light1');
  for (const [key,value] of [['jumpHeight', 30], ['charge', -1], ['attack','invalid'], ['buffer',{action:'godmode',until:2}]]) { const bad = structuredClone(s); bad.player[key] = value; assert.equal(engine.loadGame(JSON.stringify(bad)), null); }
});
test('all attacks have different body/weapon silhouettes and recovery returns to neutral', () => {
  const poses = Object.keys(ATTACKS).map(attack => { const p = fresh().player; Object.assign(p, { attack, action:'light', actionTime: ATTACKS[attack].impact - .07 }); return JSON.stringify(combatPose(p)); });
  assert.equal(new Set(poses).size, Object.keys(ATTACKS).length);
  for (const attack of Object.keys(ATTACKS)) { const p = fresh().player; Object.assign(p, { attack, action:'light', actionTime: ATTACKS[attack].duration }); assert.equal(combatPose(p).twist, 0); }
});
test('intentional lore has a separate plain-language companion interpretation', () => {
  const s = fresh(); engine.interact(s); assert.equal(s.messageKind, 'lore'); assert.match(s.message, /金塔/); assert.doesNotMatch(s.message, /按|先从|路线/); assert.match(s.interpretation, /外梯/);
});

test('contact freezes combat briefly; a whiff never pauses the simulation', () => {
  const { s, e } = duel(); step(s, 221, { light: true }); assert.ok(e.hp < e.maxHp); assert.ok(s.hitstop > 0);
  const time = s.time; const frame = s.player.actionTime; step(s, 15); assert.equal(s.time, time); assert.equal(s.player.actionTime, frame);
  step(s, 120); assert.ok(s.time > time); assert.ok(s.player.actionTime > frame);
  const miss = fresh(); step(miss, 221, { light: true }); assert.equal(miss.hitstop, 0);
});


test('press parries immediately, hold braces once, release removes guard immediately', () => {
  const s = fresh(); step(s, 10, { parry: true, guardHeld: true }); assert.equal(s.player.action, 'parry'); assert.equal(s.player.stamina, 86);
  step(s, 300, { guardHeld: true }); assert.equal(s.player.action, 'guard');
  step(s, 2000, { guardHeld: true }); assert.equal(s.player.action, 'guard'); assert.equal(s.parries, 0); assert.ok(engine.loadGame(engine.saveGame(s)));
  step(s, 1); assert.equal(s.player.action, 'guardRelease'); step(s, 200); assert.equal(s.player.action, 'idle');
  const tap = fresh(); step(tap, 10, { parry: true }); step(tap, 550); assert.equal(tap.player.action, 'idle');
});
const guardedHit = (options = {}) => {
  const {s,e} = duel(); step(s, 300, { parry:true, guardHeld:true });
  Object.assign(s.player, options); Object.assign(e, { action:'attack', timer:.17, hitDone:false, facing:0 });
  step(s, 20, { guardHeld:true }); return {s,e};
};
test('frontal block costs stamina and chip health; rear attacks bypass the guard', () => {
  const {s} = guardedHit(); assert.equal(s.player.hp, 97); assert.equal(s.player.action, 'guard'); assert.ok(Math.abs(s.player.stamina-58.9)<.01); assert.ok(s.effects.some(f=>f.kind==='block')); assert.equal(s.parries,0);
  const rear = guardedHit({facing:0}); assert.equal(rear.s.player.hp,81); assert.equal(rear.s.player.action,'hurt');
  const released = duel(); step(released.s,300,{parry:true,guardHeld:true}); Object.assign(released.e,{action:'attack',timer:.17,hitDone:false,facing:0}); step(released.s,20); assert.equal(released.s.player.hp,81);
});
test('guard break stuns, cannot be cancelled by attack or pause, and held input cannot restart defense', () => {
  const {s,e} = guardedHit({stamina:10}); assert.equal(s.player.action,'guardBreak'); assert.equal(s.player.stamina,0); assert.equal(s.player.hp,88);
  engine.clearHeldActions(s); assert.equal(s.player.action,'guardBreak'); step(s,200,{light:true,guardHeld:true}); assert.equal(s.player.action,'guardBreak');
  e.timer=4; step(s,1000,{guardHeld:true}); assert.equal(s.player.action,'idle'); step(s,1000,{guardHeld:true}); assert.equal(s.player.action,'idle'); step(s,20,{parry:true,guardHeld:true}); assert.equal(s.player.action,'parry');
});
test('red boss sweep cannot be guarded; defensive movement is slow and preserves facing', () => {
  const s=fresh(); const e=s.enemies.find(e=>e.kind==='boss'); Object.assign(s.player,{x:e.x,y:e.y,z:e.z+1.5,facing:Math.PI});
  step(s,300,{parry:true,guardHeld:true}); Object.assign(e,{phase:2,attackIndex:2,action:'attack',timer:.17,hitDone:false,facing:0,aggro:true}); step(s,20,{guardHeld:true}); assert.equal(s.player.hp,64); assert.equal(s.player.action,'hurt');
  const slow=fresh(); step(slow,300,{parry:true,guardHeld:true}); const x=slow.player.x; const facing=slow.player.facing; step(slow,400,{x:1,guardHeld:true}); assert.ok(Math.abs(slow.player.x-x-.58)<.01); assert.equal(slow.player.facing,facing);
  step(slow,20,{light:true,guardHeld:true}); assert.equal(slow.player.action,'light');
});
test('clearing held inputs lowers guard and old saves receive safe defense defaults', () => {
  const s=fresh(); step(s,300,{parry:true,guardHeld:true}); engine.clearHeldActions(s); assert.equal(s.player.action,'idle'); step(s,100,{guardHeld:true}); assert.equal(s.player.action,'idle');
  const legacy=JSON.parse(engine.saveGame(s)); delete legacy.player.guardImpact; delete legacy.player.parryFlash; const loaded=engine.loadGame(JSON.stringify(legacy)); assert.equal(loaded.player.guardImpact,0); assert.equal(loaded.player.parryFlash,0);
});
test('parry has authored preparation, deflection and settle; roll tucks and settles continuously', () => {
  const p=fresh().player; p.action='parry'; const poses=[.08,.18,.25,.52].map(t=>{p.actionTime=t;return combatPose(p);}); assert.equal(new Set(poses.map(JSON.stringify)).size,4); assert.equal(poses[3].lean,0);
  assert.equal(rollPose(0).angle,0); assert.equal(rollPose(0).tuck,0); assert.equal(rollPose(.64).angle,Math.PI*2); assert.equal(rollPose(.64).tuck,0);
  assert.ok(rollPose(.2).tuck>.99); for(let t=.001;t<.64;t+=.001)assert.ok(Math.abs(rollPose(t).angle-rollPose(t-.001).angle)<.025);
});


test('enemy windups move through raise, gather, release and continuous contact/recovery for every pattern',async()=>{
 const {enemyMotion,enemyAttack,ENEMY_STRIKE_TIME,ENEMY_CONTACT_TIME}=await loadTypescriptModule('src/components/nightRain/enemyCombat.ts');
 const neutral={lean:0,twist:0,crouch:0,ax:0,ay:0,az:-.08,lx:0,lz:0,legL:0,legR:0,weaponPitch:Math.PI/2};
 const delta=(a,b)=>Math.max(...Object.keys(a).map(k=>Math.abs(a[k]-b[k])));
 for(const kind of ['prowler','guard','duelist','boss'])for(const phase of [1,2])for(const attackIndex of [0,1,2]){
  const e={kind,phase,attackIndex,action:'windup'};const spec=enemyAttack(e);const pose=(action,timer)=>enemyMotion({...e,action,timer});
  const samples=[1,.82,.58,.3,.1,0].map(r=>pose('windup',spec.windup*r));assert.ok(delta(samples[0],neutral)<1e-8);
  for(let i=1;i<samples.length;i++)assert.ok(delta(samples[i],samples[i-1])>.005,`${kind} phase ${phase} pattern ${attackIndex} step ${i} moves`);
  for(const p of samples)assert.ok(Object.values(p).every(Number.isFinite));
  assert.ok(delta(samples.at(-1),pose('attack',ENEMY_STRIKE_TIME))<1e-8);
  assert.ok(delta(pose('attack',ENEMY_STRIKE_TIME-ENEMY_CONTACT_TIME+1e-5),pose('attack',ENEMY_STRIKE_TIME-ENEMY_CONTACT_TIME-1e-5))<1e-4);
  assert.ok(delta(pose('attack',0),pose('recover',spec.recovery))<1e-8);assert.ok(delta(pose('recover',0),neutral)<1e-8);
 }
});
