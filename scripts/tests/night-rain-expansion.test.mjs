import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTypescriptModule} from './helpers/load-typescript-module.mjs';
import {walkTo,playFirstLevel} from './helpers/night-rain-pilot.mjs';
const engine=await loadTypescriptModule('src/components/nightRain/engine.ts');
const world=await loadTypescriptModule('src/components/nightRain/world.ts');
const guide=await loadTypescriptModule('src/components/nightRain/companion.ts');
const fresh=()=>{const s=engine.createGame();engine.startGame(s);return s;};
const step=(s,ms,input={})=>engine.stepGame(s,ms,{x:0,z:0,...input});
const place=(s,p)=>Object.assign(s.player,p,{lastGround:{...p},fallPeak:p.y,jumpHeight:0,jumpVelocity:0});
const travel=(s,id)=>{const p=typeof id==='string'?world.interactionPoint(world.LANDMARKS.find(l=>l.id===id)):id;const route=guide.findPath(s.player,p,s);assert.ok(route.length,`route to ${id}`);for(const q of route.slice(1))walkTo(engine,s,{...q,ignoreBoss:true},120000);};

test('low parapet is solid on foot, jump clears it and lands on a lower floor with fall damage',()=>{
 const s=fresh();place(s,{x:9,y:3,z:6});step(s,500,{x:-1});assert.ok(s.player.x>8.3);
 place(s,{x:9,y:3,z:6});step(s,350,{x:-1,jump:true});assert.ok(s.player.x<8);step(s,1000,{x:-1});assert.equal(s.player.y,0);assert.equal(s.player.jumpHeight,0);assert.ok(s.player.hp<100&&s.player.hp>0);
});
test('open ledges allow intentional walk-off, falls survive reload, and void death leaves recoverable money on last ground',()=>{
 const s=fresh();place(s,{x:32,y:4,z:-25.5});step(s,300,{z:-1});assert.ok(engine.isAirborne(s.player));assert.ok(engine.loadGame(engine.saveGame(s)));step(s,1000,{z:-1});assert.equal(s.player.y,0);assert.ok(s.player.hp<100);
 const voidFall=fresh();place(voidFall,{x:31,y:6,z:-66});voidFall.rice=75;step(voidFall,400,{x:-1,jump:true});step(voidFall,3000,{x:-1});assert.equal(voidFall.mode,'dead');assert.equal(voidFall.bloodstain.rice,75);assert.ok(world.canOccupy(voidFall.bloodstain.x,voidFall.bloodstain.z,voidFall.bloodstain.y,voidFall));assert.ok(engine.loadGame(engine.saveGame(voidFall)));
 assert.equal(engine.fallDamage(3.5),0);assert.ok(engine.fallDamage(6)>engine.fallDamage(4));assert.ok(engine.fallDamage(10)>=100);
});
test('new guest patterns have distinct timings, silhouettes, punish windows and leapable danger attacks',()=>{
 const s=fresh();const nana=s.enemies.find(e=>e.kind==='nana'),azi=s.enemies.find(e=>e.kind==='azi');
 for(const e of [nana,azi]){const names=[];for(let i=0;i<3;i++){e.attackIndex=i;const a=engine.enemyAttack(e);names.push(a.name);assert.ok(a.recovery>=.55);if(i===2)assert.equal(a.parryable,false);}assert.equal(new Set(names).size,3);}
 assert.notEqual(engine.enemyAttack({...nana,attackIndex:1}).windup,engine.enemyAttack({...azi,attackIndex:1}).windup);
});
test('v3 progression migrates to expanded map without healing, resetting enemies or losing chosen skin',()=>{
 const s=fresh();s.worldVersion=3;s.enemies=s.enemies.slice(0,8);delete s.defeatedGuests;delete s.harborGate;s.playerSkin='nagisa';s.player.hp=43;s.player.flasks=1;s.enemies[0].hp=0;s.enemies[0].action='dead';
 const loaded=engine.loadGame(engine.saveGame(s));assert.ok(loaded);assert.equal(loaded.worldVersion,4);assert.equal(loaded.player.hp,43);assert.equal(loaded.player.flasks,1);assert.equal(loaded.playerSkin,'nagisa');assert.deepEqual(loaded.enemies.slice(0,8),s.enemies);assert.equal(loaded.enemies.length,13);
});
test('complete old city then new main route, guest duels, side rewards, inside shortcut and free exploration with persistent guest victories',()=>{
 const {state:s}=playFirstLevel(engine);engine.continueExploring(s);
 travel(s,'tide-note');engine.interact(s);travel(s,'harbor-gate');engine.interact(s);assert.ok(s.harborGate);
 travel(s,'courtyard');engine.interact(s);engine.upgrade(s);travel(s,{x:43,y:0,z:-35});travel(s,{x:43,y:6,z:-56});travel(s,'tide-seal');assert.ok(s.defeatedGuests.includes('nana-tide'));
 travel(s,'dawn-bell');engine.interact(s);assert.equal(s.mode,'playing');assert.ok(s.collected.includes('dawn-bell'));const money=s.rice;engine.interact(s);assert.equal(s.rice,money);
 travel(s,'courtyard');engine.interact(s);travel(s,'frog-cache');engine.interact(s);assert.ok(s.defeatedGuests.includes('azi-stage'));assert.ok(s.collected.includes('frog-cache'));
 travel(s,'net-cache');engine.interact(s);assert.ok(s.collected.includes('net-cache'));travel(s,'courtyard');engine.interact(s);
 assert.ok(s.enemies.filter(e=>e.kind==='nana'||e.kind==='azi').every(e=>e.hp===0));assert.ok(engine.loadGame(engine.saveGame(s)));assert.equal(s.litLamps.length,1);
});

test('drop from frog stage returns through stair foot, never through its physical side',()=>{
 const s=fresh();place(s,{x:56.5,y:3,z:-42.4});step(s,1300,{z:1});assert.equal(s.player.y,0);
 assert.equal(world.canOccupy(50.9,-37.5,0,s),false);
 travel(s,{x:43,y:0,z:-34});assert.ok(s.player.x<46);assert.equal(s.mode,'playing');
});
test('guest posture executions deal boss damage and allow the second phase',()=>{
 for(const kind of ['nana','azi']){const s=fresh(),e=s.enemies.find(e=>e.kind===kind);place(s,{x:e.x,y:e.y,z:e.z+1.5});s.player.facing=Math.PI;e.action='stagger';e.posture=e.maxPosture;
 const hp=e.hp;step(s,16,{light:true});assert.equal(s.player.action,'execute');assert.ok(e.hp>0&&e.hp<hp);assert.equal(s.defeatedGuests.length,0);
 e.hp=e.maxHp*.49;step(s,20);assert.equal(e.phase,2);
 }
});

test('future world versions are rejected without rewriting progression',()=>{const s=fresh();s.worldVersion=99;assert.equal(engine.loadGame(engine.saveGame(s)),null);});
