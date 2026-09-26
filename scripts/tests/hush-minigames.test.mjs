import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const {createMini,lockKind,cookKind,miniInput:input,stepMini:step}=await loadTypescriptModule('src/components/hushLive/minigames.ts');

test('seeded nights cover three locks and two cooking modes independently',()=>{
  const locks=new Set(),cook=new Set(),pairs=new Set();
  for(let seed=1;seed<=600;seed++){locks.add(lockKind(seed));cook.add(cookKind(seed));pairs.add(lockKind(seed)+'/'+cookKind(seed));assert.deepEqual(createMini(lockKind(seed),seed),createMini(lockKind(seed),seed));}
  assert.equal(locks.size,3);assert.equal(cook.size,2);assert.equal(pairs.size,6);
});
test('dial requires the correct direction and three remembered stops; misses retain progress',()=>{
  const m=createMini('dial',7);input(m,'press');assert.equal(m.score,0);assert.equal(m.misses,1);step(m,.5);
  for(let i=0;i<3;i++){
    for(let n=0;n<150&&(Math.abs(m.angle-m.targets[i])>1||m.travel<10);n++)input(m,'turn',m.direction*5);
    input(m,'press');assert.equal(m.score,i+1);if(i<2){input(m,'press');assert.equal(m.score,i+1);step(m,.5);}
  }
  assert.equal(m.won,true);
});
test('pick feedback requires releasing tension before repositioning and turning the core',()=>{
  const m=createMini('pick',2);input(m,'set',m.targets[0]>0?-90:90);input(m,'press');step(m,.7);
  assert.equal(m.score,0);assert.equal(m.misses,1);assert.equal(m.held,false);step(m,.5);
  for(let i=0;i<3;i++){
    input(m,'set',m.targets[i]);input(m,'press');const angle=m.angle;input(m,'set',90);assert.equal(m.angle,angle);
    step(m,.7);assert.equal(m.score,i+1);
  }assert.equal(m.won,true);
});
test('pins need shear-line alignment and retain earlier latched pins',()=>{
  const m=createMini('pins',2);input(m,'set',0);input(m,'press');assert.equal(m.score,0);step(m,.5);
  for(let i=0;i<3;i++){input(m,'set',m.targets[i]);input(m,'press');assert.equal(m.score,i+1);}assert.equal(m.won,true);
});
test('toss has flight, rotation and a catch window; extra toss input cannot reset airborne rice',()=>{
  const m=createMini('toss',7);input(m,'toss',.6);step(m,.2);assert.ok(m.y>0&&m.spin>0);const vy=m.vy;input(m,'toss',1);assert.equal(m.vy,vy);
  input(m,'pan',m.vx>0?8:92);step(m,2);assert.equal(m.score,0);assert.equal(m.misses,1);
  step(m,.5);for(let n=0;n<1500&&!m.won;n++){if(!m.flight)input(m,'toss',.6);input(m,'pan',m.x);step(m,.025);}
  assert.equal(m.won,true);assert.equal(m.score,3);
});
test('egg catching needs pan movement, retries misses, and ends after six catches',()=>{
  const m=createMini('eggs',7);step(m,.1);input(m,'pan',m.x>50?8:92);step(m,2.6);assert.equal(m.score,0);assert.equal(m.misses,1);
  for(let n=0;n<1500&&!m.won;n++){input(m,'pan',m.x);step(m,.025);}assert.equal(m.score,6);assert.equal(m.won,true);
});
test('recoil forces downwards compensation; one clip is finite and release stops fire',()=>{
  const idle=createMini('recoil',7);input(idle,'press');step(idle,5);assert.equal(idle.shots,24);assert.ok(idle.score<10);
  const active=createMini('recoil',7);input(active,'press');step(active,.1);input(active,'release');step(active,1);assert.equal(active.shots,1);
  input(active,'press');for(let i=0;i<200&&!active.won;i++){input(active,'aim',50-active.aimX,50-active.aimY);step(active,.05);}
  assert.equal(active.shots,24);assert.equal(active.score,24);assert.equal(active.held,false);step(active,5);assert.equal(active.shots,24);
});
