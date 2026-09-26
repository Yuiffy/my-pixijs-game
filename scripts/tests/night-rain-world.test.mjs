import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { walkTo, NIGHT_ROUTE } from './helpers/night-rain-pilot.mjs';
const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');
const world = await loadTypescriptModule('src/components/nightRain/world.ts');
const guide = await loadTypescriptModule('src/components/nightRain/companion.ts');
const fresh = () => {const s=engine.createGame();engine.startGame(s);return s;};
const travel = (s,id) => {
  const destination=typeof id==='string'?world.interactionPoint(world.LANDMARKS.find(l=>l.id===id)):id;
  const path=guide.findPath(s.player,destination,s);assert.ok(path.length,`path to ${id}`);
  for(const point of path.slice(1))walkTo(engine,s,{...point,ignoreBoss:true},90000);
};
const interact = (s,id) => {travel(s,id);engine.interact(s);};
const distance = path => path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.z-path[i].z,p.y-path[i].y),0);

test('every expansion destination and all lamp spawn points have a legal walking route with both gates shut',()=>{
 const s=fresh();for(const l of world.LANDMARKS){assert.equal(world.heightAt(l.x,l.z),l.y);assert.ok(guide.findPath(s.player,world.interactionPoint(l),s).length,l.id);}
 for(const [id,p] of Object.entries(world.REST_POINTS))assert.ok(world.canOccupy(p.x,p.z,p.y,s),id);
 const p={x:-22,y:0,z:-2};const destination=world.interactionPoint(world.LANDMARKS.find(l=>l.id==='temple-lamp'));const closed=distance(guide.findPath(p,destination,s));s.templeGate=true;const open=distance(guide.findPath(p,destination,s));assert.ok(closed>open*3,`${closed} -> ${open}`);
 assert.equal(world.canOccupy(-30.5,-6,0,{shortcut:true,templeGate:false}),false);assert.equal(world.canOccupy(-30.5,-6,0,{shortcut:false,templeGate:true}),true);assert.equal(world.canOccupy(12,-8,0,{shortcut:false,templeGate:true}),false);
});

test('ordinary inputs traverse the temple loop, earn a fourth flask, open return gate, and return to the sole courtyard lamp',()=>{
 const s=fresh();for(const p of NIGHT_ROUTE.slice(0,7)){walkTo(engine,s,p);if(p.interact)engine.interact(s);}
 assert.equal(s.checkpoint,'courtyard');interact(s,'temple-flask');assert.equal(s.flaskUpgrade,true);assert.equal(engine.maxFlasks(s),4);assert.equal(s.enemies.find(e=>e.id==='temple-duelist').hp,0);
 interact(s,'temple-note');assert.equal(s.messageKind,'lore');assert.doesNotMatch(s.message,/按|药瓶|回中庭/);
 const lampBefore={hp:s.player.hp,flasks:s.player.flasks,rest:s.restCount};interact(s,'temple-lamp');assert.equal(s.checkpoint,'courtyard');assert.deepEqual({hp:s.player.hp,flasks:s.player.flasks,rest:s.restCount},lampBefore);
 interact(s,'temple-gate');assert.equal(s.templeGate,true);travel(s,{x:-22,y:0,z:-2});interact(s,'courtyard');assert.deepEqual(s.litLamps,['courtyard']);assert.equal(s.player.flasks,4);
 interact(s,'canal-lamp');assert.equal(s.checkpoint,'courtyard');assert.equal(s.litLamps.length,1);interact(s,'courtyard');
 assert.ok(engine.upgrade(s));const loaded=engine.loadGame(engine.saveGame(s));assert.ok(loaded);assert.equal(loaded.checkpoint,'courtyard');assert.equal(loaded.templeGate,true);assert.equal(loaded.flaskUpgrade,true);assert.deepEqual(loaded.player,s.player);
 // Genuine damage and death after checkpoint, then refill at that exact lamp.
 travel(s,{x:4,y:0,z:-37});for(let i=0;i<80&&s.mode==='playing';i++)engine.stepGame(s,500,{x:0,z:0});assert.equal(s.mode,'dead');engine.respawn(s);assert.equal(s.player.x,world.REST_POINTS.courtyard.x);assert.equal(s.player.z,world.REST_POINTS.courtyard.z);assert.equal(s.player.flasks,4);assert.equal(s.templeGate,true);
});

test('six-enemy saves migrate without healing or resetting defeated enemies; malformed new progression rejects',()=>{
 const s=fresh();s.player.hp=52;s.player.flasks=1;s.enemies[0].hp=0;s.enemies[0].action='dead';const raw=JSON.parse(engine.saveGame(s));delete raw.worldVersion;delete raw.templeGate;delete raw.flaskUpgrade;delete raw.litLamps;raw.enemies=raw.enemies.slice(0,6);
 const loaded=engine.loadGame(JSON.stringify(raw));assert.ok(loaded);assert.equal(loaded.player.hp,52);assert.equal(loaded.player.flasks,1);assert.equal(loaded.enemies[0].hp,0);assert.equal(loaded.enemies.length,8);assert.equal(loaded.templeGate,false);
 for(const corrupt of [s=>s.litLamps.push('missing'),s=>s.checkpoint='temple-lamp',s=>s.flaskUpgrade=true,s=>s.player.flasks=4,s=>s.templeGate='true']){const bad=fresh();corrupt(bad);assert.equal(engine.loadGame(engine.saveGame(bad)),null);}
});

test('empty/full-health medicine cannot be wasted; rest and respawn share upgraded capacity',()=>{
 const s=fresh();engine.stepGame(s,1200,{x:0,z:0,heal:true});assert.equal(s.player.flasks,3);s.player.hp=20;s.player.flasks=0;engine.stepGame(s,1200,{x:0,z:0,heal:true});assert.equal(s.player.hp,20);assert.equal(s.player.action,'idle');
 s.player.flasks=1;engine.stepGame(s,1200,{x:0,z:0,heal:true});assert.equal(s.player.hp,80);assert.equal(s.player.flasks,0);
});


test('solid lamps stop bodies while allowing interaction from each clear side, and migrate old overlapping saves',()=>{
 const s=fresh();
 for(const l of world.LANDMARKS.filter(l=>l.kind==='rest')){
  assert.equal(world.canOccupy(l.x,l.z,l.y,s),false);
  for(const [dx,dz] of [[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]]){
   Object.assign(s.player,{x:l.x+dx,y:l.y,z:l.z+dz});
   assert.ok(world.canOccupy(s.player.x,s.player.z,s.player.y,s));
   assert.equal(world.lineClear(s.player,l,s),false);
   engine.interact(s);assert.equal(s.nearbyId,l.id);assert.equal(s.checkpoint,l.id);
  }
 }
 const old=fresh();Object.assign(old.player,{x:-1,y:0,z:7,hp:52,flasks:1});
 const raw=JSON.parse(engine.saveGame(old));delete raw.worldVersion;delete raw.templeGate;delete raw.flaskUpgrade;delete raw.litLamps;raw.enemies=raw.enemies.slice(0,6);
 const restored=engine.loadGame(JSON.stringify(raw));assert.ok(restored);assert.ok(world.canOccupy(restored.player.x,restored.player.z,restored.player.y,restored));assert.equal(restored.player.hp,52);assert.equal(restored.player.flasks,1);
});


test('first ignition only registers; subsequent rest is free, refills and resets ordinary enemies',()=>{
 const s=fresh();Object.assign(s.player,{...world.CHECKPOINT,hp:37,stamina:29,flasks:0});
 s.enemies[0].hp=0;s.enemies[0].action='dead';s.rice=0;
 const enemies=JSON.stringify(s.enemies);const player=JSON.stringify(s.player);
 assert.equal(engine.upgrade(s),false);engine.interact(s);
 assert.equal(JSON.stringify(s.player),player);assert.equal(JSON.stringify(s.enemies),enemies);assert.equal(s.rice,0);assert.equal(s.restCount,0);
 assert.deepEqual(s.litLamps,['courtyard']);assert.equal(s.checkpoint,'courtyard');assert.match(s.prompt,/免费休息/);
 const restored=engine.loadGame(engine.saveGame(s));assert.ok(restored);assert.equal(restored.player.hp,37);assert.equal(restored.enemies[0].hp,0);
 engine.interact(s);assert.equal(s.player.hp,engine.maxHp(s));assert.equal(s.player.stamina,engine.maxStamina(s));assert.equal(s.player.flasks,3);assert.equal(s.restCount,1);assert.equal(s.rice,0);assert.ok(s.enemies[0].hp>0);
 assert.deepEqual(world.LANDMARKS.filter(l=>l.kind==='rest').map(l=>l.id),['courtyard']);assert.deepEqual(Object.keys(world.REST_POINTS),['room','courtyard']);
});

test('v2 retired checkpoint migrates without moving, healing, restocking or reviving enemies',()=>{
 for(const oldLamp of ['temple-lamp','canal-lamp']){
  const s=fresh();Object.assign(s.player,{...world.interactionPoint(world.LANDMARKS.find(l=>l.id===oldLamp)),hp:31,flasks:1});s.enemies[0].hp=0;s.enemies[0].action='dead';
  s.worldVersion=2;s.checkpoint=oldLamp;s.litLamps=[oldLamp];const loaded=engine.loadGame(engine.saveGame(s));assert.ok(loaded);assert.equal(loaded.worldVersion,3);assert.equal(loaded.checkpoint,'courtyard');assert.deepEqual(loaded.litLamps,['courtyard']);assert.deepEqual(loaded.player,s.player);assert.deepEqual(loaded.enemies,s.enemies);assert.equal(loaded.restCount,s.restCount);
  s.litLamps=[];assert.equal(engine.loadGame(engine.saveGame(s)),null);
 }
});

test('each gate operates only from its inside and leaves the other closed',()=>{
 for(const [id,key,z] of [['shortcut','shortcut',-8],['temple-gate','templeGate',-6]]){
  const s=fresh();const l=world.LANDMARKS.find(l=>l.id===id);Object.assign(s.player,{x:l.x,y:0,z:z+1});engine.interact(s);assert.equal(s[key],false);
  Object.assign(s.player,world.interactionPoint(l));engine.interact(s);assert.equal(s[key],true);assert.equal(s[key==='shortcut'?'templeGate':'shortcut'],false);
 }
});
