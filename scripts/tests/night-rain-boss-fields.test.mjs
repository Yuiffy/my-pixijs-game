import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
const engine = await load('src/components/nightRain/engine.ts');
const fields = await load('src/components/nightRain/bossFields.ts');
const { BOSS_ROSTER } = await load('src/components/nightRain/bossRoster.ts');
const { ENEMY_STRIKE_TIME } = await load('src/components/nightRain/enemyCombat.ts');
const { canOccupy } = await load('src/components/nightRain/world.ts');
const tick = (s, ms, input = {}) => engine.stepGame(s, ms, { x: 0, z: 0, ...input });
function encounter(kind, index = 1, distance = 2) {
  const s = engine.createGame(); engine.startGame(s);
  const e = s.enemies.find(e => e.kind === kind);
  // A shared flat arena isolates combat verbs from unrelated chapter gates.
  Object.assign(e, { x: 0, y: 0, z: -41, spawn: { x: 0, y: 0, z: -41 }, facing: 0, aggro: true, action: 'windup', timer: 0.01, attackIndex: index });
  Object.assign(s.player, { x: 0, y: 0, z: -41 + distance, facing: Math.PI, lastGround: { x: 0, y: 0, z: -41 + distance }, fallPeak: 0 });
  for (const other of s.enemies) if (other !== e && Math.hypot(other.x, other.z + 41) < 12) Object.assign(other, { hp: 0, action: 'dead', aggro: false });
  assert.ok(canOccupy(s.player.x, s.player.z, s.player.y, s));
  return { s, e };
}

test('thirteen location keys map to unique characters; later chapters host Nana and Azi', () => {
  assert.equal(Object.keys(BOSS_ROSTER).length, 13);
  assert.equal(BOSS_ROSTER.boss.character, 'harei');
  assert.equal(BOSS_ROSTER.warden.character, 'nana');
  assert.equal(BOSS_ROSTER.abbot.character, 'azi');
  assert.equal(new Set(Object.values(BOSS_ROSTER).map(b => b.name)).size, 13);
});

test('ordinary enemy windups cast every distinct field, without immediate generic cone damage', () => {
  for (const [kind, index, skill] of [['boss',2,'pine'],['nana',1,'shield'],['azi',2,'drones'],['captain',1,'leap'],['regent',1,'freeze'],['warden',1,'counter'],['abbot',1,'song'],['serpent',1,'beam'],['serpent',2,'beam'],['elegist',1,'dragon'],['colossus',2,'quake'],['sentinel',2,'gust']]) {
    const { s } = encounter(kind, index);
    tick(s, 110);
    assert.ok(s.bossFields.some(f => f.kind === skill), `${kind}: ${skill}`);
    assert.equal(s.player.hp, 100, kind);
    if (kind === 'serpent' && index === 2) assert.equal(s.bossFields.length, 2);
  }
});

test('pine roots have a warning, slow only grounded players, damage and expire', () => {
  const { s } = encounter('boss',2); tick(s,110);
  assert.equal(fields.snaredByBoss(s), false);
  tick(s,950); assert.equal(fields.snaredByBoss(s), true); assert.ok(s.player.hp < 100);
  s.player.jumpHeight = 0.8; assert.equal(fields.snaredByBoss(s), false);
  s.player.jumpHeight = 0; s.enemies.forEach(e => e.aggro = false); tick(s,10); assert.equal(s.bossFields.length, 0);
});

test('time stop freezes both actors and projectiles; zone clock still thaws them', () => {
  const { s, e } = encounter('regent'); tick(s,110);
  const f = s.bossFields[0]; f.age = f.delay + 0.01;
  e.action = 'recover'; e.timer = 3;
  s.projectiles.push({ id:s.nextEffectId++, owner:e.id, x:0,y:1,z:-40, vx:2,vy:0,vz:0,life:2,damage:5,kind:'bolt' });
  const before = { p:{...s.player},timer:e.timer,bolt:{...s.projectiles[0]} };
  tick(s,300,{x:1,heavy:true});
  assert.equal(s.player.x,before.p.x); assert.equal(s.player.action,before.p.action);
  assert.equal(e.timer,before.timer); assert.deepEqual(s.projectiles[0],before.bolt);
  tick(s,1500,{x:1}); assert.ok(s.player.x > before.p.x); assert.ok(e.timer < before.timer);
});

test('front shield and pickaxe stance reward heavy breaks and rear attacks respectively', () => {
  const shield = encounter('nana'); tick(shield.s,110);
  assert.equal(fields.bossDefense(shield.s,shield.e,20),0.25);
  shield.s.player.action='heavy'; assert.equal(fields.bossDefense(shield.s,shield.e,20),1);
  assert.equal(fields.fieldActive(shield.s.bossFields[0]),false);
  const counter = encounter('warden'); tick(counter.s,110);
  assert.equal(fields.bossDefense(counter.s,counter.e,20),0.45); assert.equal(counter.s.projectiles.length,1);
  fields.bossDefense(counter.s,counter.e,20); assert.equal(counter.s.projectiles.length,1);
  counter.s.player.z = counter.e.z - 2;
  assert.equal(fields.bossDefense(counter.s,counter.e,20),1);
});

test('drone and song channels spawn real projectiles and heavy contact interrupts them', () => {
  for (const [kind,index] of [['azi',2],['abbot',1]]) {
    const { s,e } = encounter(kind,index); e.hp -= 30; tick(s,110); tick(s,950);
    assert.ok(s.projectiles.length > 0); if (kind === 'abbot') assert.ok(e.hp > e.maxHp - 30);
    s.player.action='heavy'; fields.interruptBossChannel(s,e); tick(s,10);
    assert.equal(s.bossFields.length,0); assert.ok(s.effects.some(f => f.text === '打断'));
  }
});

test('beam hits jumping players, while sidestepping its committed direction avoids contact', () => {
  const hit = encounter('serpent',1,3); tick(hit.s,110);
  hit.s.player.jumpHeight=0.8; hit.s.player.jumpVelocity=0;
  const f = hit.s.bossFields[0]; f.age=f.delay-0.005;
  tick(hit.s,10); assert.ok(hit.s.player.hp < 100);
  const safe = encounter('serpent',1,3); tick(safe.s,110); safe.s.player.x=1.3;
  safe.s.bossFields[0].age=safe.s.bossFields[0].delay-0.005;
  tick(safe.s,10); assert.equal(safe.s.player.hp,100);
});

test('projectile defense uses the emitted attack snapshot after its owner changes move', () => {
  const { s,e }=encounter('boss',2,2); e.action='recover';e.timer=3;
  s.projectiles.push({id:s.nextEffectId++,owner:e.id,x:0,y:1,z:s.player.z-0.35,vx:0,vy:0,vz:5,life:2,damage:15,kind:'bolt',parryable:true,jumpable:false});
  tick(s,10,{parry:true}); assert.equal(s.parries,1);assert.equal(s.player.hp,100);
  assert.equal(engine.enemyAttack(e).parryable,false);
});

test('pause preserves skill clocks, owner death cancels hazards, leap moves its real actor', () => {
  const {s,e}=encounter('captain');tick(s,110);const start=e.z;
  s.paused=true;const copy=structuredClone(s.bossFields);tick(s,400);assert.deepEqual(s.bossFields,copy);
  s.paused=false;tick(s,400);assert.ok(e.z>start);assert.ok(fields.bossLeapHeight(s,e)>0.5);
  e.hp=0;e.action='dead';tick(s,10);assert.equal(s.bossFields.length,0);
});

test('v10 migration keeps progress and health while retiring old attack contact clocks', () => {
  const s=engine.createGame();engine.startGame(s);s.worldVersion=10;delete s.bossFields;
  for(const e of s.enemies) {const role=BOSS_ROSTER[e.kind];if(role?.previous)e.name=role.previous;}
  const e=s.enemies.find(e=>e.kind==='boss');e.hp=137;e.posture=61;e.action='attack';e.timer=ENEMY_STRIKE_TIME;
  s.player.hp=41;s.rice=57;s.shortcut=true;
  const restored=engine.loadGame(JSON.stringify(s));assert.ok(restored);
  assert.equal(restored.player.hp,41);assert.equal(restored.rice,57);assert.equal(restored.shortcut,true);
  const boss=restored.enemies.find(e=>e.kind==='boss');assert.equal(boss.hp,137);assert.equal(boss.posture,61);assert.equal(boss.action,'recover');
  assert.deepEqual(restored.bossFields,[]);assert.equal(restored.worldVersion, 13);
});

test('current saves preserve field clocks and reject malformed or oversized hazard data', () => {
  const s=engine.createGame();engine.startGame(s);const e=s.enemies.find(e=>e.kind==='boss');e.attackIndex=2;e.aggro=true;
  fields.castBossSkill(s,e);s.bossFields[0].age=0.3;
  const loaded=engine.loadGame(engine.saveGame(s));assert.ok(loaded);assert.deepEqual(loaded.bossFields,s.bossFields);
  for(const alter of [f=>f.radius=1000,f=>f.age=-1,f=>f.owner='bad',f=>f.kind='bad',f=>f.damage=Infinity]) {
    const bad=structuredClone(s);alter(bad.bossFields[0]);assert.equal(engine.loadGame(JSON.stringify(bad)),null);
  }
});

test('current projectile snapshots survive reload and malformed flight data is rejected',()=>{
  const s=engine.createGame();engine.startGame(s);const e=s.enemies.find(e=>e.kind==='boss');
  s.projectiles.push({id:s.nextEffectId++,owner:e.id,x:e.x,y:e.y+1,z:e.z,vx:0,vy:0,vz:5,life:2,damage:15,kind:'bolt',parryable:true,jumpable:false,tint:'#efcb74'});
  assert.deepEqual(engine.loadGame(engine.saveGame(s)).projectiles,s.projectiles);
  for(const change of [b=>b.vx=1000,b=>b.life=-1,b=>b.owner='unknown',b=>b.tint='url(bad)',b=>b.parryable='yes']) {
    const bad=structuredClone(s);change(bad.projectiles[0]);assert.equal(engine.loadGame(engine.saveGame(bad)),null);
  }
});

test('rabbit circuit adds projectile counter damage and frost clock extends the real parry opening',()=>{
  const results={};
  for(const talisman of ['none','droneCore','frostClock']) {
    const {s,e}=encounter('boss',2,2);e.action='recover';e.timer=3;s.gear.talisman=talisman;
    s.projectiles.push({id:s.nextEffectId++,owner:e.id,x:0,y:1,z:s.player.z-.35,vx:0,vy:0,vz:5,life:2,damage:15,kind:'bolt',parryable:true,jumpable:false});
    tick(s,10,{parry:true});assert.equal(s.parries,1);results[talisman]={hp:e.hp,posture:e.posture,timer:e.timer};
  }
  assert.equal(results.none.hp-results.droneCore.hp,8);assert.equal(results.droneCore.posture-results.none.posture,12);
  assert.ok(Math.abs(results.frostClock.timer-results.none.timer-.4)<.001);
});
