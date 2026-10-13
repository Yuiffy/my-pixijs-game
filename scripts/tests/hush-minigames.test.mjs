import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTurn } from './helpers/hush-minigame-pilot.mjs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const {bottomFace,turnedRotation,dialReady,createMini,lockKind,cookKind,miniInput:input,stepMini:step}=await loadTypescriptModule('src/components/hushLive/minigames.ts');

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
test('beef requires six distinct cooked faces; flight and repeat faces do not add heat',()=>{
  const m=createMini('toss',7);step(m,1.5);assert.equal(m.score,1);
  const faces=[...m.faces];input(m,'toss',.6,0);step(m,.2);assert.ok(m.y>0&&m.spin>0);assert.deepEqual(m.faces,faces);
  const vy=m.vy;input(m,'toss',1);assert.equal(m.vy,vy);
  input(m,'pan',92);step(m,1.1);assert.equal(m.misses,1);assert.equal(m.face,3);assert.deepEqual(m.faces,faces);
  step(m,.5);assert.equal(m.score,1);
  for(let n=0;n<1800&&!m.won;n++){
    if(!m.flight&&m.faces[m.face]>=1)input(m,'toss',.6,nextTurn(m));
    if(m.flight)input(m,'pan',m.x);step(m,.025);
  }
  assert.equal(m.won,true);assert.equal(m.score,6);assert.ok(m.faces.every(x=>x===1));
});
test('opposite flips restore orientation and repeated cooking cannot score twice',()=>{
  const q=[0,0,0,1];assert.equal(bottomFace(q),3);
  for(const [a,b] of [[0,2],[-1,1]])assert.equal(bottomFace(turnedRotation(turnedRotation(q,a),b)),3);
  const m=createMini('toss',1);step(m,20);assert.equal(m.score,1);assert.equal(m.won,false);
});
test('egg coating needs motion inside the wok, never falling targets',()=>{
  const m=createMini('eggs',7);step(m,10);assert.equal(m.score,0);assert.equal(m.flight,false);
  for(let n=0;n<2000&&!m.won;n++){input(m,'tilt',Math.sin(m.clock*2)*.8,Math.cos(m.clock*2)*.8);step(m,.025);}
  assert.equal(m.score,6);assert.equal(m.won,true);assert.ok(m.grains.every(g=>Math.hypot(g.x,g.z)<=.94));
});
test('dial accepts a visible 36-degree detent area, not an exact degree',()=>{
  for(const offset of [-17,0,17]){const m=createMini('dial',4);m.angle=m.targets[0]+offset;m.travel=20;assert.equal(dialReady(m),true);input(m,'press');assert.equal(m.score,1);}
  const m=createMini('dial',4);m.angle=m.targets[0]+25;m.travel=20;input(m,'press');assert.equal(m.score,0);
});
const {flick}=await loadTypescriptModule('src/components/hushLive/miniGestures.ts');
test('hover flick requires an intentional fast stroke; horizontal, slow, re-entry and airborne samples do not toss',()=>{
  const a={x:50,y:60,time:100};
  assert.equal(flick(null,a,false).toss,null);
  assert.equal(flick(a,{x:90,y:61,time:150},false).toss,null);
  assert.equal(flick(a,{x:50,y:35,time:600},false).toss,null);
  assert.equal(flick(a,{x:50,y:35,time:150},true).toss,null);
  assert.equal(flick(a,{x:50,y:35,time:150},false).toss.turn,0);
  assert.equal(flick(a,{x:50,y:85,time:150},false).toss.turn,2);
  assert.equal(flick(a,{x:75,y:35,time:150},false).toss.turn,1);
});

test('recoil forces downwards compensation; one clip is finite and release stops fire',()=>{
  const idle=createMini('recoil',7);input(idle,'press');step(idle,5);assert.equal(idle.shots,24);assert.ok(idle.score<10);
  const active=createMini('recoil',7);input(active,'press');step(active,.1);input(active,'release');step(active,1);assert.equal(active.shots,1);
  input(active,'press');for(let i=0;i<200&&!active.won;i++){input(active,'aim',50-active.aimX,50-active.aimY);step(active,.05);}
  assert.equal(active.shots,24);assert.equal(active.score,24);assert.equal(active.held,false);step(active,5);assert.equal(active.shots,24);
});

test('precision rewards accurate detents and resets a streak after a real miss',()=>{
  for(const offset of [0,12]){const m=createMini('dial',4);m.angle=m.targets[0]-offset;m.travel=20;input(m,'press');assert.equal(m.score,1);assert.equal(m.precision,offset?0:1);assert.equal(m.streak,1);input(m,'press');assert.equal(m.streak,0);assert.equal(m.bestStreak,1);}
});

test('moving target demands tracking, mode changes start a fresh clip, and bursts settle on release',async()=>{
  const {recoilTarget}=await loadTypescriptModule('src/components/hushLive/minigames.ts');
  const m=createMini('recoil',7);input(m,'mode');assert.equal(m.movingTarget,true);const first=recoilTarget(m);step(m,1);assert.notDeepEqual(recoilTarget(m),first);
  input(m,'press');for(let i=0;i<300&&!m.won;i++){const t=recoilTarget(m);input(m,'aim',t.x-m.aimX,t.y-m.aimY);step(m,.025);}
  assert.equal(m.shots,24);assert.equal(m.score,24);assert.equal(m.precision,24);assert.equal(m.bestStreak,24);
  input(m,'mode');assert.equal(m.won,false);assert.equal(m.shots,0);assert.equal(m.movingTarget,false);input(m,'press');step(m,.1);input(m,'release');const y=m.aimY;step(m,.5);assert.ok(m.aimY>y);assert.equal(m.shots,1);
});


test('a recoil trigger pressed during fire cooldown resumes fire when the cooldown ends',()=>{
  const m=createMini('recoil',7);input(m,'press');step(m,.025);input(m,'release');
  assert.equal(m.shots,1);assert.ok(m.cooldown>0);input(m,'press');
  assert.equal(m.held,true);step(m,.2);assert.equal(m.shots,2);
  input(m,'release');step(m,1);assert.equal(m.shots,2);
});
