import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const e = await loadTypescriptModule('src/components/hushLive/engine.ts');
const life = await loadTypescriptModule('src/components/hushLive/lifeEvents.ts');
const { skinOf, SKINS } = await loadTypescriptModule('src/components/hushLive/skins.ts');
const { MEALS, sleepDaily } = await loadTypescriptModule('src/components/hushLive/daily.ts');
const daily = await loadTypescriptModule('src/components/hushLive/daily.ts');
const { beforeStream } = await loadTypescriptModule('src/components/hushLive/outings.ts');
const nav = await loadTypescriptModule('src/components/hushLive/navigation.ts');
const { solveActivity } = await import('./helpers/hush-minigame-pilot.mjs');
const advance = (s, dt, input=e.emptyInput()) => e.step(s, dt, input);
const start = (seed=1) => {
  const s=e.createGame(4, seed, 5);s.phase='playing';s.daily.arrival='done';s.daily.panel=null;s.daily.household.rest.stage='done';return s;
};
test('new heroines persist in v1 saves without losing old progress',()=>{
  for(const id of ['shiori','mizuki']){const save={...e.freshSave(),skin:id,unlocked:5,best:[10,20,30,40,50]};assert.deepEqual(e.parseSave(JSON.stringify(save)),save);assert.equal(skinOf(id).id,id);}
  assert.equal(SKINS.length,5);assert.equal(skinOf('removed').id,'host');
});
test('new meals occur naturally in seeded nights alongside every old meal',()=>{
  const found=new Set();for(let seed=1;seed<=1000;seed++)found.add(e.createGame(5,seed,5).daily.meal);
  for(const meal of MEALS)assert.ok(found.has(meal.id),meal.id);
  for(const id of ['goose','dumplings','soup'])assert.ok(found.has(id));
});
test('bed nap has escalating reaction, pause freezes it, and waking does not complete chores',()=>{
  const s=start();s.player={...e.SPOTS.bed};const before=[...s.done];
  assert.equal(e.action(s,'bed').key,'nap');advance(s,.5,{...e.emptyInput(),act:true,focus:'bed'});assert.equal(s.daily.panel,'nap');
  advance(s,3);assert.equal(s.daily.events.nap.reaction,1);
  e.togglePause(s);const clock=s.daily.events.nap.clock;advance(s,10);assert.equal(s.daily.events.nap.clock,clock);life.wakeNap(s);assert.equal(s.daily.events.nap.active,true);
  e.togglePause(s);advance(s,3.2);assert.equal(s.daily.events.nap.reaction,2);advance(s,3.2);assert.equal(s.daily.events.nap.reaction,3);assert.match(s.daily.messages.at(-1).text,/沙发/);
  advance(s,4);assert.equal(s.daily.panel,null);assert.equal(s.daily.events.nap.active,false);assert.deepEqual(s.done,before);assert.equal(s.daily.stage,'home');assert.equal(e.action(s,'bed').key,'');assert.ok(s.peak>0);
});
test('early wake is optional, modest reward is one-time, and carrying blocks nap',()=>{
  const s=start();s.player={...e.SPOTS.bed};s.carry='food';life.beginNap(s);assert.equal(s.daily.events.nap.active,false);s.carry=null;
  life.beginNap(s);advance(s,2.1);const love=s.love;life.wakeNap(s);assert.equal(s.love,love+4);advance(s,21);life.beginNap(s);advance(s,2.1);life.wakeNap(s);assert.equal(s.love,love+4);
});
test('all three faults trigger naturally, require isolation/correct diagnosis/stable test and cannot reward twice',()=>{
  const kinds=new Set();for(let seed=1;seed<=30;seed++){
    const s=start(seed);advance(s,35);const r=s.daily.events.repair;kinds.add(r.kind);assert.equal(r.stage,'fault');
    s.daily.panel='repair';life.repairInput(s,r.kind);assert.equal(r.stage,'fault');life.repairInput(s,'isolate');assert.equal(life.repairMuted(s),true);assert.equal(e.partnerBehavior(s).speaking,false);
    const wrong=Object.keys(life.FAULTS).find(k=>k!==r.kind);life.repairInput(s,wrong);assert.equal(r.mistakes,1);assert.equal(r.stage,'isolated');
    life.repairInput(s,r.kind);life.repairInput(s,'resume');assert.equal(r.stage,'testing');advance(s,1);e.togglePause(s);const stable=r.stable;advance(s,5);assert.equal(r.stable,stable);e.togglePause(s);advance(s,2.1);
    life.repairInput(s,'close');assert.equal(r.stage,'testing');s.daily.panel='repair';const love=s.love;life.repairInput(s,'resume');assert.equal(r.stage,'fixed');assert.equal(s.love,love+12);life.repairInput(s,'resume');assert.equal(s.love,love+12);assert.equal(life.repairMuted(s),false);
  }assert.equal(kinds.size,3);
});
test('faults wait for occupied interactions; tutorial is quiet and incomplete chores cannot be skipped',()=>{
  const s=start();s.daily.panel='leisure';advance(s,35);assert.equal(s.daily.events.repair.stage,'pending');s.daily.panel=null;advance(s,.1);assert.equal(s.daily.events.repair.stage,'fault');sleepDaily(s);assert.equal(s.daily.stage,'home');
  assert.equal(e.createGame(1,1,1).daily.events.repair.stage,'none');
});
test('rare travel arrival keeps the stream off until the host walks to the desk without crossing furniture',()=>{
  const seeds=Array.from({length:2000},(_,i)=>i+1).filter(seed=>e.createGame(5,seed,5).daily.outing.trip);
  assert.ok(seeds.length>100&&seeds.length<260);
  for(const seed of seeds.slice(0,10)){
    const s=e.createGame(5,seed,5);s.phase='playing';assert.equal(s.daily.household.arrival,'trip');assert.equal(beforeStream(s),true);assert.equal(e.partnerBehavior(s).speaking,false);
    solveActivity(s,daily,advance);
    for(let i=0;i<1000&&beforeStream(s);i++){advance(s,.025);if(s.daily.outing.stage==='to-desk')assert.ok(nav.walkable(s.daily.outing,false));}
    assert.equal(beforeStream(s),false);assert.equal(s.daily.outing.stage,'live');assert.equal(e.partnerBehavior(s).speaking,true);
  }
});
test('supper is a real paused-safe departure with two distinct choices, including the repair reward',()=>{
  for(const choice of ['care','together']){
    const s=start();s.done=[...s.tasks];s.daily.events.repair.stage='fixed';sleepDaily(s);assert.equal(s.daily.after,'supper');advance(s,3.1);assert.equal(e.partnerPose(s).x,175);
    daily.discoverDaily(s);daily.chooseGoodnight(s,choice);assert.equal(s.daily.stage,'outing');assert.match(s.daily.memory,/出门|下楼/);advance(s,1);const y=e.partnerPose(s).y;
    e.togglePause(s);advance(s,10);assert.equal(e.partnerPose(s).y,y);e.togglePause(s);advance(s,3.2);assert.equal(s.phase,'result');assert.equal(s.won,true);assert.equal(s.daily.outing.exitClock,4);
  }
});
