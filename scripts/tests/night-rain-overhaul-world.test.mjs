import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
const engine = await load('src/components/nightRain/engine.ts');
const world = await load('src/components/nightRain/world.ts');
const { REMOTE_LEVERS } = await load('src/components/nightRain/overhaulWorld.ts');
const { fanAttack, FAN_ENEMIES } = await load('src/components/nightRain/fanEnemies.ts');
const { equipTalisman } = await load('src/components/nightRain/equipment.ts');
const { weaponAttack } = await load('src/components/nightRain/weapons.ts');
const guide = await load('src/components/nightRain/companion.ts');
const fresh=()=>{const s=engine.createGame();engine.startGame(s);return s;};
const place=(s,p)=>Object.assign(s.player,p,{lastGround:{...p},fallPeak:p.y,jumpHeight:0,jumpVelocity:0,action:'idle',attack:null});
const tick=(s,ms,input={})=>engine.stepGame(s,ms,{x:0,z:0,...input});
const pathLength=p=>p.slice(1).reduce((n,q,i)=>n+Math.hypot(q.x-p[i].x,q.y-p[i].y,q.z-p[i].z),0);

test('seven main-route pullies open the existing physical doors and survive save and death',()=>{
  for(const [id,p] of Object.entries(REMOTE_LEVERS)) {
    const s=fresh(); if(id==='cliff-gate'||id==='reed-gate') {
      s.bossDefeated=true;Object.assign(s.enemies.find(e=>e.kind==='boss'),{hp:0,action:'dead'});
      s.chapterComplete=true;s.collected.push('food','chapter-bell');s.defeatedGuests.push('rain-regent');
      Object.assign(s.enemies.find(e=>e.kind==='regent'),{hp:0,action:'dead'});s.valleyGates.push('valley-entry');
    }
    assert.ok(world.canOccupy(p.x,p.z,p.y,s),id);place(s,p);engine.interact(s);
    assert.equal(engine.closedDoor(s,id),undefined,id);const restored=engine.loadGame(engine.saveGame(s));assert.ok(restored,id);
    assert.equal(engine.closedDoor(restored,id),undefined,id);
    engine.respawn(restored);assert.equal(engine.closedDoor(restored,id),undefined,id);
  }
});

test('market and harbor lever detours are under ten metres and far shorter than old dead-end walks',()=>{
  for(const [id,origin,old] of [
    ['shortcut',{x:2.5,y:0,z:-36.5},{x:13.3,y:0,z:-9.5}],
    ['harbor-gate',{x:32,y:0,z:-30},{x:30,y:0,z:-9.5}],
  ]) {
    const s=fresh();const before=guide.findPath(origin,old,s),after=guide.findPath(origin,REMOTE_LEVERS[id],s);
    assert.ok(before.length&&after.length,id);const oldDetour=pathLength(before)*2,newDetour=pathLength(after)*2;
    assert.ok(newDetour<10,`${id}: ${newDetour}`);assert.ok(oldDetour>newDetour+30);
    console.log(`${id}: lever out-and-back ${oldDetour.toFixed(1)}m -> ${newDetour.toFixed(1)}m`);
  }
});

function roofRun(jump) {
  const s=fresh();place(s,{x:-191.5,y:2,z:-388.5});
  for(let i=0;i<200&&s.player.z>-401.65;i++)tick(s,20,{z:-1,sprint:true});
  assert.equal(s.player.y,5);
  tick(s,20,{z:-1,sprint:true,jump});
  for(let i=0;i<60;i++)tick(s,20,{z:-1,sprint:true});
  return s;
}
test('rooftop branch requires a sprint jump, rewards the real landing and returns by safe drops',()=>{
  const failed=roofRun(false);assert.equal(failed.player.y,2);assert.equal(failed.mode,'playing');assert.ok(failed.player.hp>0);
  assert.equal(failed.collected.includes('nana-pickaxe'),false);
  const s=roofRun(true);assert.equal(s.player.y,5.8);engine.interact(s);assert.ok(s.collected.includes('nana-pickaxe'));
  assert.ok(engine.loadGame(engine.saveGame(s)));
  for(let i=0;i<350&&!(s.player.y===2&&s.player.z<-414);i++)tick(s,20,{z:-1});tick(s,800);
  assert.equal(s.player.y,2);assert.equal(s.player.hp,100);assert.ok(s.collected.includes('nana-pickaxe'));
});

test('trial pickaxe trades slow narrow swings for charged posture, and uses the normal equipment flow',()=>{
  const s=fresh();assert.equal(engine.equipWeapon(s,'nanaPickaxe'),false);s.collected.push('nana-pickaxe');
  place(s,world.REST_POINTS.courtyard);engine.interact(s);assert.ok(engine.equipWeapon(s,'nanaPickaxe'));
  const charged=weaponAttack(s,'charged'),light=weaponAttack(s,'light1');s.weapon='umbrella';const base=weaponAttack(s,'charged');
  assert.ok(charged.posture>base.posture*1.5);assert.ok(charged.duration>base.duration);assert.ok(charged.arc<base.arc);assert.ok(light.cost>0);
  s.weapon='nanaPickaxe';assert.equal(engine.loadGame(engine.saveGame(s)).weapon,'nanaPickaxe');
});

test('character talismans require their own discoveries and provide actual situational effects',()=>{
  const idle=fresh();assert.equal(equipTalisman(idle,'pineBadge'),false);
  // The dinner flag is earned by Harei's encounter; the engine loader still checks it.
  idle.collected.push('food');assert.ok(equipTalisman(idle,'pineBadge'));idle.player.stamina=0;tick(idle,1000);assert.ok(Math.abs(idle.player.stamina-56)<.01);
  const moving=fresh();moving.collected.push('food');equipTalisman(moving,'pineBadge');moving.player.stamina=0;tick(moving,1000,{x:1});assert.ok(Math.abs(moving.player.stamina-42)<.01);
  for(const [id,item] of [['droneCore','frog-cache'],['frostClock','chapter-bell'],['songScore','monastery-cache']]) {const s=fresh();assert.equal(equipTalisman(s,id),false);s.collected.push(item);assert.ok(equipTalisman(s,id));}
  const s=fresh();s.collected.push('monastery-cache');equipTalisman(s,'songScore');const enemy=s.enemies[0];
  place(s,{x:enemy.x,y:enemy.y,z:enemy.z+1.5});s.player.facing=Math.PI;s.player.hp=40;
  Object.assign(enemy,{action:'stagger',posture:enemy.maxPosture});tick(s,10,{light:true});assert.equal(s.executions,1);assert.equal(s.player.hp,58);
});

test('fan groups occupy their characters districts and execute distinct combat verbs',()=>{
  const s=fresh();for(const e of s.enemies.filter(e=>FAN_ENEMIES[e.id]))assert.equal(e.name,FAN_ENEMIES[e.id].name);
  const support=s.enemies.find(e=>e.id==='courtyard-prowler');support.attackIndex=1;assert.ok(fanAttack(support).support);
  support.hp-=20;Object.assign(support,{aggro:true,action:'windup',timer:.01});place(s,{x:support.x,y:support.y,z:support.z+2});tick(s,120);
  assert.equal(support.hp,support.maxHp-8);assert.ok(s.effects.some(f=>f.text==='分饼'));
  const slide=s.enemies.find(e=>e.id==='elephant-lancer');assert.ok(fanAttack({...slide,attackIndex:2}).lunge>2);
  const shark=s.enemies.find(e=>e.id==='mill-lancer');assert.ok(fanAttack({...shark,attackIndex:1}).windup>1.8);
  const rabbit=s.enemies.find(e=>e.id==='harbor-prowler');assert.ok(fanAttack({...rabbit,attackIndex:0}).projectile);
});

test('new mill lamp has a reachable clear approach and registers without silently refilling',()=>{
  const s=fresh();place(s,world.REST_POINTS['mill-lamp']);s.player.hp=43;s.player.flasks=1;
  engine.interact(s);assert.equal(s.checkpoint,'mill-lamp');assert.equal(s.player.hp,43);assert.equal(s.player.flasks,1);
  engine.interact(s);assert.equal(s.player.hp,100);assert.equal(s.player.flasks,3);assert.ok(engine.loadGame(engine.saveGame(s)));
});

test('v10 ground saves inside new buildings move safely without losing health, loot or money',()=>{
  for(const position of [{x:-191.5,y:2,z:-399.5},{x:-191.5,y:2,z:-407},{x:-191.5,y:2,z:-412},{x:-182,y:2,z:-403.2}]) {
    const s=fresh();s.worldVersion=10;place(s,position);s.player.hp=37;s.rice=41;s.bloodstain={...position,rice:59};
    Object.assign(s.enemies.find(e=>e.id==='mill-lancer'),position);
    const restored=engine.loadGame(engine.saveGame(s));assert.ok(restored,JSON.stringify(position));
    assert.equal(restored.player.hp,37);assert.equal(restored.rice,41);assert.equal(restored.bloodstain.rice,59);
    assert.ok(world.canOccupy(restored.player.x,restored.player.z,restored.player.y,restored));
    assert.ok(engine.loadGame(engine.saveGame(restored)));
    s.worldVersion=11;assert.equal(engine.loadGame(engine.saveGame(s)),null,'current invalid positions are not silently repaired');
  }
});
