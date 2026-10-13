import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const e = await loadTypescriptModule('src/components/hushLive/engine.ts');
const { earnedCgs, CGS } = await loadTypescriptModule('src/components/hushLive/cg.ts');
const life = await loadTypescriptModule('src/components/hushLive/lifeEvents.ts');
const daily = await loadTypescriptModule('src/components/hushLive/daily.ts');
const s = skin => { const g=e.createGame(4,1,5,skin);g.phase='playing';g.daily.arrival='done';g.daily.household.rest.stage='done';g.daily.panel=null;return g; };
test('old saves migrate without losing progress; corrupt CG IDs are discarded and duplicates bounded',()=>{
  const old={...e.freshSave(),unlocked:5,best:[1,2,3,4,5]};delete old.cgs;
  assert.deepEqual(e.parseSave(JSON.stringify(old)),{...old,cgs:[]});
  assert.deepEqual(e.parseSave(JSON.stringify({...old,cgs:['host-lamp','unknown','host-lamp',null,'sui-repair']})).cgs,['host-lamp','sui-repair']);
  assert.deepEqual(e.parseSave(JSON.stringify({...old,cgs:'host-lamp'})).cgs,[]);
});
test('host memory requires success, retains collected CGs through result recording',()=>{
  const g=s('host');assert.deepEqual(earnedCgs(g),[]);g.phase='result';assert.deepEqual(earnedCgs(g),[]);g.won=true;
  assert.deepEqual(earnedCgs(g),['host-lamp']);assert.deepEqual(e.record({...e.freshSave(),cgs:['host-lamp']},g).cgs,['host-lamp']);
});
test('nana7mi supper unlock waits until both players finish leaving',()=>{
  const g=s('nana7mi');g.done=[...g.tasks];g.daily.events.repair.stage='fixed';daily.sleepDaily(g);e.step(g,3.2,e.emptyInput());daily.discoverDaily(g);daily.chooseGoodnight(g,'together');
  e.step(g,2,e.emptyInput());assert.deepEqual(earnedCgs(g),[]);e.step(g,2.2,e.emptyInput());assert.deepEqual(earnedCgs(g),['nana7mi-supper']);
});
test('shiori trip memory is never an opening reward; it requires completing the whole night',()=>{
  const g=s('shiori');assert.deepEqual(earnedCgs(g),[]);g.daily.outing.trip=true;
  for(const stage of ['outside','to-desk','live']){g.daily.outing.stage=stage;assert.deepEqual(earnedCgs(g),[]);}
  g.won=true;assert.deepEqual(earnedCgs(g),['shiori-home']);
});
test('sui memory requires correct repair, observation and explicitly resuming stream',()=>{
  const g=s('sui');e.step(g,35,e.emptyInput());g.daily.panel='repair';life.repairInput(g,'isolate');life.repairInput(g,g.daily.events.repair.kind);life.repairInput(g,'resume');assert.deepEqual(earnedCgs(g),[]);
  e.step(g,3.1,e.emptyInput());assert.deepEqual(earnedCgs(g),[]);life.repairInput(g,'resume');assert.deepEqual(earnedCgs(g),['sui-repair']);
});
test('mizuki computer memory needs actual computer play and a completed night; repair cannot unlock it',()=>{
  const g=s('mizuki');g.daily.events.repair.stage='fixed';assert.deepEqual(earnedCgs(g),[]);g.won=true;assert.deepEqual(earnedCgs(g),[]);
  g.won=false;daily.openDailyPanel(g,'leisure',true);e.step(g,8.1,e.emptyInput());daily.finishLeisure(g);assert.deepEqual(earnedCgs(g),[]);
  daily.openDailyPanel(g,'leisure',false);daily.finishLeisure(g);g.won=true;assert.deepEqual(earnedCgs(g),['mizuki-computer']);
});
test('memories belong to selected character and mere selection grants nothing',()=>{
  for(const cg of CGS) assert.deepEqual(earnedCgs(s(cg.skin)),[]);
  const g=s('shiori');g.won=true;g.daily.after='supper';g.daily.events.repair.stage='fixed';assert.deepEqual(earnedCgs(g),[]);
});
