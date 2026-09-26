import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadTypescriptModule} from './helpers/load-typescript-module.mjs';
import {walkTo,playFirstLevel} from './helpers/night-rain-pilot.mjs';
const a=await loadTypescriptModule('src/components/nightRain/architecture.ts');
const w=await loadTypescriptModule('src/components/nightRain/world.ts');
const e=await loadTypescriptModule('src/components/nightRain/engine.ts');
const c=await loadTypescriptModule('src/components/nightRain/companion.ts');
const fresh=()=>{const s=e.createGame();e.startGame(s);return s;};
const place=(s,x,y,z)=>Object.assign(s.player,{x,y,z,lastGround:{x,y,z},fallPeak:y,jumpHeight:0,jumpVelocity:0});
const step=(s,ms,input={})=>e.stepGame(s,ms,{x:0,z:0,...input});

test('architectural collision heights match rendered rotated roof box triangles',()=>{
 let checked=0;
 for(const solid of a.ARCHITECTURE.filter(s=>s.id.includes('/roof-'))){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...solid.size),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const root=new THREE.Group();root.position.set(...solid.position);root.rotation.y=solid.yaw??0;mesh.rotation.z=solid.tilt??0;root.add(mesh);root.updateMatrixWorld(true);
  for(const local of [[0,0,0],[solid.size[0]*.3,0,0],[-solid.size[0]*.3,0,solid.size[2]*.3]]){
   const p=mesh.localToWorld(new THREE.Vector3(...local));const ray=new THREE.Raycaster(new THREE.Vector3(p.x,30,p.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];
   const actual=a.architectureIntervals(p.x,p.z).find(h=>h.id===solid.id);assert.ok(hit&&actual,solid.id);assert.ok(Math.abs(hit.point.y-actual.top)<1e-5,solid.id);checked++;
  }
  mesh.geometry.dispose();mesh.material.dispose();
 }
 assert.ok(checked>100);
});
test('ordinary jump lands on merchant roof, walks its slope, survives reload, then jumps the gap to the cloister',()=>{
 const s=fresh();place(s,-5,6,-21);step(s,700,{z:1,jump:true});step(s,500);
 assert.equal(s.mode,'playing');assert.equal(s.player.jumpHeight,0);assert.ok(s.player.y>4.5&&s.player.y<6);assert.ok(s.player.z>-20);assert.ok(e.loadGame(e.saveGame(s)));
 const y=s.player.y;step(s,200,{x:1});assert.notEqual(s.player.y,y);assert.ok(s.player.hp>0);
 step(s,1050,{z:1,jump:true});step(s,700);assert.equal(s.player.y,3);assert.equal(s.mode,'playing');
});
test('walls stop grounded and airborne bodies and undersides interrupt upward jumps',()=>{
 const s=fresh();place(s,-5,3,-16);step(s,400,{z:-1});assert.ok(s.player.z> -16.75);
 step(s,400,{z:-1,jump:true});assert.ok(s.player.z> -16.75);assert.equal(s.mode,'playing');
 place(s,18,2,-30);s.player.jumpVelocity=6.3;step(s,500);assert.ok(s.player.y+s.player.jumpHeight<=4.675-1.65+.001);assert.ok(s.player.jumpVelocity<=0);
});
test('ferry passage and old first act remain traversable, with an explicit tide entrance guide',()=>{
 const {state:s}=playFirstLevel(e);e.continueExploring(s);assert.match(s.interpretation,/摆渡庵/);assert.equal(c.mainTarget(s),'tide-note');
 const guide=c.createCompanion(s);assert.ok(c.leadTo(guide,s,'tide-note'));assert.match(guide.subtitle,/潮汐港/);
 const dest=w.LANDMARKS.find(l=>l.id==='tide-note');for(const p of c.findPath(s.player,dest,s).slice(1))walkTo(e,s,{...p,ignoreBoss:true},120000);
 assert.ok(s.player.x>21);assert.equal(s.player.y,0);assert.equal(s.mode,'playing');
});
test('unstuck returns to the recorded checkpoint without healing, refilling, or resetting progress',()=>{
 const s=fresh();s.checkpoint='courtyard';s.litLamps=['courtyard'];s.player.hp=37;s.player.flasks=1;s.player.stamina=24;s.rice=57;s.harborGate=true;s.collected=['laptop'];s.enemies[0].hp=0;s.enemies[0].action='dead';
 const enemies=structuredClone(s.enemies);s.player.jumpHeight=-4;s.player.jumpVelocity=-12;s.paused=true;assert.ok(e.escapeStuck(s));
 assert.deepEqual({x:s.player.x,y:s.player.y,z:s.player.z},w.REST_POINTS.courtyard);assert.equal(s.player.hp,37);assert.equal(s.player.flasks,1);assert.equal(s.player.stamina,24);assert.equal(s.rice,57);assert.ok(s.harborGate);assert.deepEqual(s.enemies,enemies);assert.equal(s.player.jumpHeight,0);assert.ok(e.loadGame(e.saveGame(s)));
 const room=fresh();place(room,0,0,0);assert.ok(e.escapeStuck(room));assert.deepEqual(room.player.lastGround,w.REST_POINTS.room);room.mode='dead';assert.equal(e.escapeStuck(room),false);
});
