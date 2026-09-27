import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const player = g => g.players[0];
const job = g => player(g).projects[0];
const lane = g => player(g).lanes[0];
const config = (model='sol', effort='medium', turbo=false) => ({model,effort,turbo});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fresh(need=30) {
 const g=E.createGame(1888,21);job(g).need=need;job(g).understood=true;
 for(const m of Object.keys(E.MODELS))player(g).experience[m]={edition:E.modelEdition(g,m).name,work:60};
 player(g).accounts[0].tier=200;player(g).accounts[0].quota=480;
 return g;
}
const set = (g,c) => { const changed=E.act(g,{type:'configure',development:c}); return E.act(changed,{type:'studio',...changed.studio}); };
const studio = (g,options={}) => E.act(g,{type:'studio',...g.studio,...options});
function dispatch(g,c,ids=[job(g).id],laneId=null) {
 return E.act(g,{type:'dispatch',lane:laneId,account:player(g).accounts[0].id,projects:ids,...c});
}

test('all models can safely deliver the same simple job; surplus earns quality and higher actual rewards',()=>{
 for(const [model,grade,multiplier,energy] of [['luna','合格',1,10],['sol','精良',1.2,11],['astra','精品',1.4,11]]) {
  let g=set(fresh(),config(model));assert.equal(player(g).energy,energy);
  const cash=player(g).cash;const base={...job(g)};
  g=E.advanceMinutes(g,410);
  const shipped=player(g).shipped[0];assert.ok(shipped);assert.equal(shipped.bugs,0);
  assert.equal(shipped.delivery.grade,grade);
  assert.equal(shipped.delivery.cash,Math.floor(base.cash*multiplier));
  assert.equal(shipped.delivery.vp,Math.floor(base.vp*multiplier));
  assert.equal(player(g).cash,cash+shipped.delivery.cash);
  assert.equal(player(g).vp,shipped.delivery.vp); // Starting personal project gives no first-game award.
  const later=E.advanceMinutes(g,20);assert.equal(player(later).cash,player(g).cash);
  assert.equal(player(later).shipped.length,1);
 }
});

test('quality accumulates over useful work; last-moment upgrades and repair cannot farm bonuses',()=>{
 let g=set(fresh(30),config('luna'));g=E.advanceMinutes(g,360);
 near(job(g).work,27);near(job(g).qualityWork,0);
 g=set(g,config('astra','ultra',true));g=E.advanceMinutes(g,10);
 const shipped=player(g).shipped[0];assert.equal(shipped.delivery.grade,'合格');near(shipped.qualityWork,3);
 let repair=fresh(30);job(repair).work=30;job(repair).checked=30;job(repair).qualityWork=15;job(repair).bugs=2;
 repair=set(repair,config('astra','ultra',true));repair=E.advanceMinutes(repair,30);
 near(player(repair).shipped[0].qualityWork,15);assert.equal(player(repair).shipped[0].delivery.grade,'精良');
});

test('Turbo and cooperation only change time and quota, not per-project craftsmanship or rewards',()=>{
 const outputs=[];
 for(const [threads,turbo] of [[1,false],[1,true],[3,true]]) {
  let g=fresh();g.development=config('astra','medium',turbo);g=studio(g,{threads,collaboration:3});
  g=E.advanceMinutes(g,120);const j=player(g).shipped[0];near(j.qualityWork,30);outputs.push(j.delivery);
  near(player(g).used,30*0.4*(turbo?2.5:1));assert.equal(player(g).energy,12-threads);
 }
 assert.deepEqual(outputs[0],outputs[1]);assert.deepEqual(outputs[0],outputs[2]);
});

test('same-day attention only tops up; pauses and repeated strong/weak switching never refund or double bill',()=>{
 let g=set(fresh(1000),config('astra'));assert.equal(player(g).energy,11);assert.equal(lane(g).attentionPaid,1);
 g=set(g,config('luna'));assert.equal(player(g).energy,10);assert.equal(lane(g).attentionPaid,2);
 for(let n=0;n<3;n++){g=set(g,config('astra'));g=studio(g,{threads:0});g=studio(g,{threads:1});g=set(g,config('luna'));}
 assert.equal(player(g).energy,10);
 g=set(g,config('astra'));g=E.nextDay(E.endDay(g));assert.equal(player(g).energy,11);assert.equal(lane(g).attentionPaid,1);
});

test('unaffordable attention top-ups wait without spending quota; strong work can resume with the paid reserve',()=>{
 let g=set(fresh(1000),config('astra'));player(g).energy=0;g=set(g,config('luna'));
 assert.equal(E.laneStatus(g,player(g),lane(g)),'等待精力');const before=structuredClone(g);
 g=E.advanceMinutes(g,10);near(job(g).work,0);near(player(g).accounts[0].quota,player(before).accounts[0].quota);
 g=set(g,config('astra'));g=E.advanceMinutes(g,10);assert.ok(job(g).work>0);assert.equal(player(g).energy,0);
});

test('queue head transitions pay additional attention in manual and automatic modes, or wait',()=>{
 for(const manual of [false,true]) for(const energy of [0,1]) {
  let g=fresh(0.01);const next={...job(g),id:++g.serial,name:'Harder',need:100,difficulty:2};player(g).projects.push(next);
  g=manual?dispatch(g,config('sol'),[job(g).id,next.id]):set(g,config('sol'));
  assert.equal(lane(g).attentionPaid,1);player(g).energy=energy;
  g=E.advanceMinutes(g,1);assert.equal(player(g).shipped.length,1);assert.equal(player(g).energy,0);
  assert.equal(job(g).work>0,energy===1);assert.equal(lane(g).attentionPaid,energy?2:1);
  if(!energy)assert.equal(E.laneStatus(g,player(g),lane(g)),'等待精力');
 }
});

test('manual dispatch, empty-lane reuse and bot lanes obey the same attention rules',()=>{
 let g=dispatch(fresh(0.01),config('astra'));assert.equal(player(g).energy,11);
 g=E.advanceMinutes(g,1);assert.equal(player(g).shipped.length,1);
 const next={...player(g).shipped[0],id:++g.serial,name:'Second',work:0,need:100,qualityWork:0,delivery:null,checked:0};player(g).projects.push(next);
 g=dispatch(g,config('luna'));assert.equal(player(g).energy,10);assert.equal(lane(g).attentionPaid,2);
 const bot=g.players[1];bot.projects[0].need=1000;bot.projects[0].understood=true;
 bot.experience.sol={edition:E.modelEdition(g,'sol').name,work:60};
 bot.lanes=[{id:++g.serial,account:bot.accounts[0].id,development:config('sol'),projects:[bot.projects[0].id],enabled:true,paidDay:0,attentionPaid:0}];bot.energy=1;
 g=E.advanceMinutes(g,1);assert.equal(g.players[1].energy,0);assert.equal(g.players[1].lanes[0].attentionPaid,1);assert.ok(g.players[1].projects[0].work>0);
});

test('unknown complexity stays hidden in quality forecasts, premium selection and attention pricing',()=>{
 let a=fresh(1000);job(a).understood=false;job(a).qualityWork=0.25;job(a).work=1;
 const b=structuredClone(a);job(b).challenge=0.5;job(b).qualityWork=0;
 a.studio.configuration=b.studio.configuration='premium';
 assert.deepEqual(E.textState(a),E.textState(b));
 assert.deepEqual(E.projectDevelopment(a,player(a),job(a)),E.projectDevelopment(b,player(b),job(b)));
 for(const c of [config('sol'),config('astra')]) {
  assert.equal(E.qualityForecast(a,player(a),c,job(a)),E.qualityForecast(b,player(b),c,job(b)));
  assert.equal(E.attentionCost(a,player(a),c,job(a)),E.attentionCost(b,player(b),c,job(b)));
 }
});

test('premium picks the cheapest conservative quality margin, supports Turbo, and admits impossible targets',()=>{
 for(const stage of [0,1,2,3,4,5])for(const difficulty of [1,2,3,4]) {
  let g=fresh();g.platform.stage=stage;job(g).difficulty=difficulty;g=studio(g,{configuration:'premium'});
  const chosen=E.projectDevelopment(g,player(g),job(g));const options=[];
  for(const model of Object.keys(E.MODELS))for(const effort of Object.keys(E.EFFORTS)) {
   const c=config(model,effort);if(E.capabilityMargin(g,player(g),c,job(g))>=1.5)options.push(E.developmentStats(g,player(g),c));
  }
  if(options.length){assert.ok(E.capabilityMargin(g,player(g),chosen,job(g))>=1.5);assert.equal(E.attentionCost(g,player(g),chosen,job(g)),1);assert.ok(options.every(s=>s.cost>=E.developmentStats(g,player(g),chosen).cost));}
  else {assert.equal(E.developmentStats(g,player(g),chosen).ability,E.developmentStats(g,player(g),config('astra','ultra')).ability);assert.doesNotMatch(E.qualityForecast(g,player(g),chosen,job(g)),/精品/);}
  g=E.act(g,{type:'configure',development:{...g.development,turbo:true},keepAutomatic:true});assert.equal(g.studio.configuration,'premium');assert.equal(lane(g).development.turbo,true);
 }
});

test('model release is applied before daily attention reservations',()=>{
 let g=fresh(1000);g.platform.stage=2;job(g).difficulty=2;g.development=config('sol','high');
 player(g).experience.sol={edition:E.modelEdition(g,'sol').name,work:60};g=studio(g);assert.equal(lane(g).attentionPaid,2);
 // Stage 3 adds 1 ability to Sol. Even with uncertainty, this becomes a 1-attention configuration.
 g.phase='reveal';g.day=4;g.platform.nextRelease=5;g=E.nextDay(g);assert.equal(g.platform.stage,3);assert.equal(lane(g).attentionPaid,1);
 assert.equal(lane(g).attentionPaid,E.attentionCost(g,player(g),lane(g).development,job(g)));
 assert.equal(player(g).energy,12-lane(g).attentionPaid);
});

test('legacy quality migration preserves assets and spent attention, with no retroactive quality reward',()=>{
 let g=set(fresh(1000),config('astra'));g=E.advanceMinutes(g,10);const original=structuredClone(g);
 delete g.qualityRules;
 for(const p of g.players){for(const l of p.lanes)delete l.attentionPaid;for(const j of [...p.projects,...p.shipped]){delete j.qualityWork;delete j.delivery;}}
 for(const j of g.market){delete j.qualityWork;delete j.delivery;}
 const restored=E.restoreGame(JSON.stringify(g));assert.ok(restored);
 assert.equal(player(restored).cash,player(original).cash);assert.equal(player(restored).energy,player(original).energy);
 assert.equal(job(restored).work,job(original).work);assert.equal(job(restored).qualityWork,0);assert.equal(lane(restored).attentionPaid,2);
 assert.deepEqual(E.restoreGame(JSON.stringify(restored)),restored);
 for(const corrupt of [g=>job(g).qualityWork=1001,g=>lane(g).attentionPaid=3,g=>g.qualityRules=2,g=>job(g).delivery={grade:'精品',cash:-1,vp:4}]) {
  const bad=structuredClone(original);corrupt(bad);assert.equal(E.restoreGame(JSON.stringify(bad)),null);
 }
});

test('premium seasons preserve resources and save/restore across generations, shared work and daily events',()=>{
 for(const seed of [711,712]) {
  let g=E.createGame(seed,seed%2?21:42);g=E.act(g,{type:'upgrade',account:player(g).accounts[0].id,tier:200});g=studio(g,{configuration:'premium',threads:3,collaboration:3});
  while(g.phase!=='over') {
   if(g.phase==='plan'){if(player(g).projects.length<3&&player(g).energy>0)g=E.act(g,{type:'claim',project:g.market[0].id});g=E.endDay(g);}else g=E.nextDay(g);
   assert.ok(E.restoreGame(JSON.stringify(g)),`D${g.day}`);
   for(const p of g.players){assert.ok(p.energy>=0&&p.energy<=12);assert.equal(new Set(p.shipped.map(j=>j.id)).size,p.shipped.length);for(const j of p.shipped)assert.ok(j.qualityWork<=j.need+1e-7);}
  }
  assert.ok(player(g).shipped.length>=8);assert.ok(player(g).shipped.some(j=>j.delivery.grade==='精品'));
 }
});
