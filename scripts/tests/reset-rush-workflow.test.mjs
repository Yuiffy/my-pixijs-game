import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const player = g => g.players[0];
const job = g => player(g).projects[0];
const acc = g => player(g).accounts[0];
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
const studio = (g, changes={}) => E.act(g,{type:'studio',...g.studio,...changes});
const known = g => {
 for (const m of Object.keys(E.MODELS)) player(g).experience[m] = {edition:E.modelEdition(g,m).name,work:60};
 for (const j of player(g).projects) j.understood=true;
 return g;
};
const longGame = (seed=880) => {const g=E.createGame(seed);job(g).need=1000;job(g).challenge=0;return g;};
const add = (g, difficulty=2, challenge=0) => {
 const j={...job(g),id:++g.serial,name:`Extra ${g.serial}`,difficulty,challenge,work:0,checked:0,riskLoad:0,bugs:0,repair:0};
 player(g).projects.push(j);return j;
};

test('adaptive selects the cheapest zero-risk configuration per known project and model generation',()=>{
 for (const stage of [0,1,2,3,4,5]) for(const difficulty of [1,2,3,4]) for(const challenge of [0,0.5]) {
  let g=longGame();g.platform.stage=stage;job(g).difficulty=difficulty;job(g).challenge=challenge;g=known(g);
  g=studio(g,{configuration:'adaptive'});
  const config=E.projectDevelopment(g,player(g),job(g));
  const chosen=E.developmentStats(g,player(g),config,job(g));
  assert.equal(chosen.risk,0);
  for(const model of Object.keys(E.MODELS))for(const effort of Object.keys(E.EFFORTS)) {
   const candidate=E.developmentStats(g,player(g),{model,effort,turbo:false},job(g));
   if(candidate.risk===0)assert.ok(chosen.cost<=candidate.cost+1e-9);
  }
 }
 let g=known(longGame());add(g,3);g=known(g);g=studio(g,{configuration:'adaptive',threads:2,collaboration:1});
 assert.notDeepEqual(player(g).lanes[0].development,player(g).lanes[1].development);
 assert.deepEqual(player(g).lanes[0].development,{model:'luna',effort:'medium',turbo:false});
 assert.deepEqual(player(g).lanes[1].development,{model:'sol',effort:'xhigh',turbo:false});
});

test('unknown recommendations and public state cannot inspect hidden project complications',()=>{
 let a=studio(longGame(),{configuration:'adaptive'});job(a).difficulty=2;job(a).understood=false;
 const b=structuredClone(a);job(a).challenge=0;job(b).challenge=0.5;
 assert.deepEqual(E.projectDevelopment(a,player(a),job(a)),E.projectDevelopment(b,player(b),job(b)));
 assert.deepEqual(E.textState(a),E.textState(b));
 const cfg=E.projectDevelopment(a,player(a),job(a));
 assert.equal(E.riskAssessment(a,player(a),cfg,job(a)).known,false);
 assert.equal(E.riskAssessment(a,player(a),cfg,job(a)).risk,null);
 assert.ok(!('riskLoad' in E.textState(a).players[0].projects[0]));
});

test('work reveals project requirements, calibrates models and automatically drops to a cheaper effort',()=>{
 let g=studio(longGame(),{configuration:'adaptive'});
 assert.equal(job(g).understood,false);
 assert.equal(player(g).lanes[0].development.effort,'xhigh');
 g=E.advanceMinutes(g,334);
 assert.equal(job(g).understood,true);
 assert.equal(player(g).lanes[0].development.effort,'high');
 assert.equal(E.riskAssessment(g,player(g),player(g).lanes[0].development,job(g)).known,false);
 g=E.nextDay(E.endDay(g));g=E.nextDay(E.endDay(g));g=E.advanceMinutes(g,180);
 assert.equal(E.modelExperience(g,player(g),'luna'),60);
 assert.equal(player(g).lanes[0].development.effort,'medium');
 assert.equal(E.riskAssessment(g,player(g),player(g).lanes[0].development,job(g)).risk,0);
 g.platform.stage=1;
 assert.equal(E.modelExperience(g,player(g),'luna'),0);
 assert.equal(job(g).understood,true);
 assert.equal(E.riskAssessment(g,player(g),player(g).lanes[0].development,job(g)).known,false);
 g=E.advanceMinutes(g,1);assert.equal(player(g).experience.luna.edition,'5.6 Luna');
});

test('discovering a bug reveals hidden complexity and does not double-count a shared checkpoint',()=>{
 let g=longGame(0);job(g).difficulty=4;job(g).challenge=0.5;job(g).work=19.99;job(g).riskLoad=0.7996;
 g=E.act(g,{type:'configure',development:{model:'luna',effort:'medium',turbo:false}});
 g=studio(g,{threads:3,collaboration:3});g.minute=1;g.rng=0;
 g=E.advanceMinutes(g,1);
 assert.equal(job(g).bugs,1);assert.equal(job(g).checked,20);assert.equal(job(g).understood,true);
 assert.equal(g.logs.filter(l=>l.player===0&&l.text.includes('发现 1 个 bug')).length,1);
});

test('collaboration speeds are sublinear, charge each agent once, and do not multiply useful-work cost',()=>{
 for(const count of [1,2,3]) {
  let g=known(longGame());g=studio(g,{threads:count,collaboration:count});
  assert.equal(player(g).energy,12-count*2);
  g=studio(g,{threads:0});g=studio(g,{threads:count});assert.equal(player(g).energy,12-count*2);
  const before=acc(g).quota;g=E.advanceMinutes(g,60);
  near(job(g).work,0.18*60*E.collaborationSpeed(count));
  near(before-acc(g).quota,job(g).work*0.16);
  assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
 }
});

test('scheduler spreads projects first, then helps large jobs and respects per-project cap',()=>{
 let g=longGame();add(g);g=studio(g,{threads:5,collaboration:3});
 const counts=player(g).projects.map(j=>player(g).lanes.filter(l=>l.projects[0]===j.id).length);
 assert.deepEqual(counts.sort(),[2,3]);assert.equal(player(g).energy,2);
 g=studio(g,{collaboration:1});
 assert.equal(player(g).lanes.filter(l=>l.enabled).length,2);
 assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
});

test('joint completion and repair settle once, with fractional work carried into the next project',()=>{
 let g=known(longGame());job(g).need=0.2;
 g=E.act(g,{type:'configure',development:{model:'astra',effort:'ultra',turbo:true}});
 g=studio(g,{threads:3,collaboration:3});const initial=structuredClone(g);g=E.advanceMinutes(g,1);
 assert.equal(player(g).shipped.length,1);assert.equal(player(g).projects.length,0);
 near(acc(initial).quota-acc(g).quota,0.2*3);
 assert.equal(player(g).cash,player(initial).cash+job(initial).cash);
 assert.equal(player(g).lanes.filter(l=>l.projects.length).length,0);
 let repair=known(longGame());job(repair).work=job(repair).need;job(repair).checked=job(repair).need;job(repair).bugs=1;job(repair).repair=11.9;
 repair=studio(repair,{threads:3,collaboration:3});const prior=acc(repair).quota;repair=E.advanceMinutes(repair,1);
 assert.equal(player(repair).shipped.length,1);assert.equal(player(repair).shipped[0].bugs,0);near(prior-acc(repair).quota,0.1*0.16);
 let queue=known(longGame());job(queue).need=0.01;const extra=add(queue,3);extra.understood=true;extra.need=100;
 queue=studio(queue,{configuration:'adaptive',threads:1,collaboration:1});queue=E.advanceMinutes(queue,1);
 assert.equal(player(queue).shipped.length,1);assert.ok(job(queue).work>0);
 assert.deepEqual(player(queue).lanes[0].development,{model:'sol',effort:'xhigh',turbo:false});
});

test('cooperative shared-account exhaustion, account switching and split advances conserve state',()=>{
 let g=known(longGame());g=E.act(g,{type:'buy',tier:20});acc(g).quota=0.01;
 g=studio(g,{threads:3,collaboration:3,accountPolicy:'preferred'});
 const once=E.advanceMinutes(g,80);
 const split=[1,19,30,30].reduce((state,n)=>E.advanceMinutes(state,n),g);
 assert.deepEqual(once,split);assert.equal(acc(once).quota,0);
 assert.ok(player(once).accounts[1].quota<24);
 near(24.01-player(once).accounts[1].quota,job(once).work*0.16);
});

test('Turbo stays independent of automatic selection; explicit manual presets switch back cleanly',()=>{
 let g=studio(known(longGame()),{configuration:'adaptive'});
 g=E.act(g,{type:'configure',development:{...g.development,turbo:true},keepAutomatic:true});
 assert.equal(g.studio.configuration,'adaptive');assert.equal(player(g).lanes[0].development.turbo,true);
 g=E.act(g,{type:'configure',development:{model:'astra',effort:'ultra',turbo:false}});
 assert.equal(g.studio.configuration,'fixed');assert.deepEqual(player(g).lanes[0].development,g.development);
});

test('legacy v5 keeps previously known projects and settings; new malformed workflow saves are rejected',()=>{
 const old=longGame();delete old.workflowRules;delete old.studio.configuration;delete old.studio.collaboration;
 for(const p of old.players){delete p.experience;for(const j of [...p.projects,...p.shipped]){delete j.challenge;delete j.understood;}}
 for(const j of old.market){delete j.challenge;delete j.understood;}
 const migrated=E.restoreGame(JSON.stringify(old));assert.ok(migrated);
 assert.equal(migrated.rng,old.rng);assert.equal(player(migrated).cash,player(old).cash);
 assert.equal(migrated.studio.configuration,'fixed');assert.equal(migrated.studio.collaboration,1);
 assert.equal(job(migrated).challenge,0);assert.equal(job(migrated).understood,true);
 assert.equal(E.modelExperience(migrated,player(migrated),'sol'),60);
 assert.deepEqual(E.restoreGame(JSON.stringify(migrated)),migrated);
 for(const corrupt of [g=>{g.studio.collaboration=4;},g=>{player(g).experience.sol.work=61;},g=>{job(g).challenge=2;},g=>{g.workflowRules=2;}]) {
  const g=longGame();corrupt(g);assert.equal(E.restoreGame(JSON.stringify(g)),null);
 }
 let shared=studio(longGame(),{threads:3,collaboration:3});shared.studio.collaboration=2;
 assert.equal(E.restoreGame(JSON.stringify(shared)),null);
});

test('adaptive cooperative seasons remain playable, restorable and bounded without per-project clicks',()=>{
 for(const seed of [91,92,93,94]) {
  let g=E.createGame(seed,seed%2?21:42);
  g=E.act(g,{type:'upgrade',account:acc(g).id,tier:200});
  g=studio(g,{configuration:'adaptive',threads:3,collaboration:seed%2?2:3});
  while(g.phase!=='over') {
   if(g.phase==='plan') {
    if(player(g).projects.length<3&&player(g).energy>0)g=E.act(g,{type:'claim',project:g.market[0].id});
    g=E.endDay(g);
   } else g=E.nextDay(g);
   assert.ok(E.restoreGame(JSON.stringify(g)),`seed ${seed}, day ${g.day}`);
   for(const j of player(g).projects)assert.ok(j.work<=j.need&&j.bugs>=0);
  }
  assert.ok(player(g).shipped.length>=8,`${seed}: ${player(g).shipped.length}`);
  assert.equal(new Set(player(g).shipped.map(j=>j.id)).size,player(g).shipped.length);
  console.log('Adaptive season',seed,JSON.stringify({works:player(g).shipped.length,score:E.score(player(g)).total}));
 }
});
