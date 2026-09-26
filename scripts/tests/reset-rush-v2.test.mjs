import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const fresh = () => E.createGame(84);
const human = g => g.players[0];
const account = g => human(g).accounts[0];
const job = g => human(g).projects[0];
const config = (model='luna',effort='medium',turbo=false) => ({model,effort,turbo});
const develop = (g,c) => E.act(g,{type:'develop',project:job(g).id,account:account(g).id,...c});
const morning = (g,day) => {const f=structuredClone(g);f.day=day-1;f.phase='reveal';f.events=['quiet'];return E.nextDay(f);};

test('all players start with the same $20 account, $480 cash and three human actions',()=>{
  const g=fresh();assert.equal(g.version,2);assert.equal(E.actionsLeft(g),3);
  for(const p of g.players){assert.equal(p.cash,480);assert.equal(p.accounts.length,1);assert.equal(p.accounts[0].tier,20);assert.equal(p.accounts[0].renewal,20);}
  assert.equal(E.createGame(84,21).length,21);
});
test('all 36 independent model/effort/Turbo combinations are supported and persisted',()=>{
  let g=fresh();
  for(const model of Object.keys(E.MODELS))for(const effort of Object.keys(E.EFFORTS))for(const turbo of [false,true]){
    const d=config(model,effort,turbo);const before=structuredClone(g);
    g=E.act(g,{type:'configure',development:d});
    assert.deepEqual(g.development,d);assert.equal(g.cursor,before.cursor);assert.equal(g.rng,before.rng);assert.equal(human(g).cash,480);
    assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
  }
  assert.equal(E.actionsLeft(g),3);
});
test('Turbo changes throughput and price, never per-action bug probability; effort reduces risk',()=>{
  const g=fresh();job(g).difficulty=4;
  for(const model of Object.keys(E.MODELS)){
    let previous=100;
    for(const effort of Object.keys(E.EFFORTS)){
      const normal=E.developmentStats(g,human(g),config(model,effort),job(g));
      const fast=E.developmentStats(g,human(g),config(model,effort,true),job(g));
      assert.equal(fast.risk,normal.risk);assert.ok(fast.cost>normal.cost);assert.ok(fast.work>normal.work);
      assert.ok(normal.risk<=previous);previous=normal.risk;
    }
  }
  assert.equal(E.developmentStats(g,human(g),config('astra','ultra',true),job(g)).risk,0);
  const slow=E.developmentStats(g,human(g),config('astra','ultra',true),job(g));g.event={...E.EVENTS.find(e=>e.effect==='sale')};
  const sale=E.developmentStats(g,human(g),config('astra','ultra',true),job(g));
  assert.equal(sale.cost,Math.ceil(slow.cost*.75));assert.equal(sale.work,slow.work);assert.equal(sale.risk,slow.risk);
});
test('Luna can build a large simple project free, while difficult projects have actual seeded bug risk',()=>{
  const g=fresh();job(g).need=64;job(g).difficulty=1;account(g).quota=0;account(g).paidUntil=0;
  const n=develop(g,config());assert.equal(job(n).work,3);assert.equal(job(n).bugs,0);assert.equal(human(n).used,0);
  for(const d of [config('luna','high'),config('luna','medium',true)])assert.match(E.actionError(g,0,{type:'develop',project:job(g).id,account:account(g).id,...d}),/有效订阅/);
  let bugs=0;
  for(let seed=1;seed<=200;seed++){const hard=E.createGame(seed);hard.rng=(seed*2654435761)>>>0;job(hard).difficulty=4;job(hard).need=64;const end=develop(hard,config());bugs+=job(end).bugs;assert.deepEqual(end,develop(hard,config()));}
  assert.ok(bugs>130&&bugs<190,`80% game risk observed ${bugs}/200`);
});
test('scheduling a downgrade is free; on D31 it charges the lower tier and preserves bank expiry',()=>{
  let g=E.act(fresh(),{type:'upgrade',account:account(fresh()).id,tier:200});
  account(g).banks=[34,39];account(g).quota=155;
  const before=structuredClone(g);g=E.act(g,{type:'renewal',account:account(g).id,tier:20});
  assert.equal(g.cursor,before.cursor);assert.equal(account(g).tier,200);assert.equal(account(g).quota,155);assert.equal(human(g).cash,300);
  const d30=morning(g,30);assert.equal(account(d30).tier,200);
  const d31=morning(g,31);assert.equal(account(d31).tier,20);assert.equal(account(d31).quota,24);assert.equal(human(d31).cash,280);
  assert.equal(account(d31).paidUntil,60);assert.equal(account(d31).nextReset,38);assert.deepEqual(account(d31).banks,[34,39]);
  const d32=morning(d31,32);assert.equal(human(d32).cash,280);
});
test('stop-renewal and insufficient cash pause exactly once, with no delayed surprise charge',()=>{
  for(const stop of [true,false]){
    let g=fresh();account(g).renewal=stop?null:200;human(g).cash=5;account(g).banks=[35];
    g=morning(g,31);assert.equal(account(g).quota,0);assert.equal(E.activeAccount(g,account(g)),false);assert.equal(human(g).cash,5);
    human(g).cash=400;const n=morning(g,32);assert.equal(human(n).cash,400);assert.equal(E.activeAccount(n,account(n)),false);
    n.cursor=n.order.indexOf(0);
    const renewed=E.act(n,{type:'renew',account:account(n).id,tier:100});assert.equal(account(renewed).tier,100);assert.equal(account(renewed).quota,90);assert.equal(account(renewed).paidUntil,61);assert.deepEqual(account(renewed).banks,[35]);
  }
});
test('policies can change after all actions and at night; paid purchases still require an action',()=>{
  let g=fresh();g.cursor=12;
  g=E.act(g,{type:'renewal',account:account(g).id,tier:null});assert.equal(account(g).renewal,null);assert.equal(g.cursor,12);
  g=E.endDay(g);const before=human(g).cash;
  g=E.act(g,{type:'renewal',account:account(g).id,tier:100});assert.equal(account(g).renewal,100);assert.equal(g.phase,'reveal');assert.equal(human(g).cash,before);
  assert.ok(E.actionError(g,0,{type:'buy',tier:20}));
});
test('upgrades preserve explicit downgrade/stop policies and both dates',()=>{
  for(const policy of [null,20]){
    let g=fresh();g=E.act(g,{type:'upgrade',account:account(g).id,tier:100});g=E.act(g,{type:'renewal',account:account(g).id,tier:policy});
    const n=E.act(g,{type:'upgrade',account:account(g).id,tier:200});assert.equal(account(n).renewal,policy);assert.equal(account(n).paidUntil,30);assert.equal(account(n).nextReset,8);
  }
});
test('real v1 checkpoint saves migrate without losing assets or RNG and without enabling surprise renewal',()=>{
  const old=JSON.parse(readFileSync(new URL('./fixtures/reset-rush-v1.json',import.meta.url),'utf8'));
  const n=E.restoreGame(JSON.stringify(old));assert.equal(n.version,2);assert.equal(n.rng,old.rng);assert.equal(n.players[0].projects[0].work,8);assert.equal(n.players[0].accounts[0].quota,33);assert.equal(n.players[0].cash,100);
  assert.ok(n.players.every(p=>p.accounts.every(a=>a.renewal===null)));assert.deepEqual(n.resetDeck,old.resetDeck);
  for(const mutate of [g=>{g.development.effort='oops';},g=>{account(g).renewal=99;},g=>{job(g).difficulty=8;}]){const b=structuredClone(n);mutate(b);assert.equal(E.restoreGame(JSON.stringify(b)),null);}
});
