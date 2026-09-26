import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const E=await loadTypescriptModule('src/components/resetRush/engine.ts');
const human=g=>g.players[0];const account=g=>human(g).accounts[0];
const fresh=()=>E.createGame(84);
const morning=(g,day)=>{const f=structuredClone(g);f.day=day-1;f.phase='reveal';f.minute=480;f.events=['quiet'];return E.nextDay(f);};
test('v1 and v2 save migrations preserve assets, projects, random state and original storage contents',()=>{
  for(const version of [1,2]){
    const raw=readFileSync(new URL(`./fixtures/reset-rush-v${version}.json`,import.meta.url),'utf8');const old=JSON.parse(raw);const g=E.restoreGame(raw);assert.ok(g);assert.equal(g.version,3);assert.equal(g.rng,old.rng);assert.equal(g.day,old.day);
    for(let i=0;i<4;i++){assert.equal(g.players[i].cash,old.players[i].cash);assert.equal(g.players[i].used,old.players[i].used);assert.equal(g.players[i].projects[0]?.work,old.players[i].projects[0]?.work);assert.deepEqual(g.players[i].accounts.map(a=>a.banks),old.players[i].accounts.map(a=>a.banks));assert.equal(g.players[i].lanes.length,0);}
    if(version===1)assert.equal(account(g).renewal,null);
    assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);assert.equal(JSON.parse(raw).version,version);
  }
});
test('partially used v2 days convert used actions to time and energy without granting a fresh day',()=>{
  const old=JSON.parse(readFileSync(new URL('./fixtures/reset-rush-v2.json',import.meta.url),'utf8'));old.cursor=4;
  const count=old.order.slice(0,4).filter(id=>id===0).length;const g=E.restoreGame(JSON.stringify(old));assert.ok(g);assert.equal(g.minute,count*160);assert.equal(human(g).energy,12-count*4);
});
test('invalid, dangling and duplicate save state is rejected',()=>{
  for(const raw of [null,'x','{}','{"version":9}'])assert.equal(E.restoreGame(raw),null);
  const corrupt=[g=>{g.minute=-1;},g=>{human(g).energy=13;},g=>{g.players[1].id=0;},g=>{account(g).quota=-1;},g=>{human(g).projects[0].riskLoad=2;},g=>{human(g).lanes=[{id:++g.serial,account:12345,development:E.DEFAULT_DEVELOPMENT,projects:[],enabled:false,paidDay:0}];},g=>{g.market[0].id=account(g).id;}];
  for(const change of corrupt){const g=fresh();change(g);assert.equal(E.restoreGame(JSON.stringify(g)),null);}
});
test('a scheduled downgrade renews once at the lower price with separate quota and subscription clocks',()=>{
  let g=fresh();g=E.act(g,{type:'upgrade',account:account(g).id,tier:200});account(g).banks=[34,39];g=E.act(g,{type:'renewal',account:account(g).id,tier:20});
  const d30=morning(g,30);assert.equal(account(d30).tier,200);const d31=morning(g,31);assert.equal(account(d31).tier,20);assert.equal(account(d31).quota,24);assert.equal(human(d31).cash,280);assert.equal(account(d31).nextReset,38);assert.equal(account(d31).paidUntil,60);assert.deepEqual(account(d31).banks,[34,39]);assert.equal(human(morning(d31,32)).cash,280);
});
test('stopping or lacking funds pauses once and does not charge later without an explicit manual renewal',()=>{
  for(const stop of [true,false]){
    let g=fresh();account(g).renewal=stop?null:200;human(g).cash=5;account(g).banks=[35];g=morning(g,31);assert.equal(account(g).quota,0);human(g).cash=300;g=morning(g,32);assert.equal(human(g).cash,300);assert.equal(E.activeAccount(g,account(g)),false);
    g=E.act(g,{type:'renew',account:account(g).id,tier:100});assert.equal(human(g).cash,200);assert.equal(account(g).quota,90);assert.equal(account(g).paidUntil,61);assert.deepEqual(account(g).banks,[35]);assert.equal(g.minute,0);assert.equal(human(g).energy,12);
  }
});
test('each account keeps independent natural resets; forced resets never shift these clocks',()=>{
  let g=fresh();g=E.act(g,{type:'upgrade',account:account(g).id,tier:200});g=morning(g,3);g=E.act(g,{type:'buy',tier:200});
  for(const a of human(g).accounts)a.quota=0;g=morning(g,8);assert.equal(human(g).accounts[0].quota,180);assert.equal(human(g).accounts[1].quota,0);assert.deepEqual(human(g).accounts.map(a=>a.nextReset),[15,10]);
  const dates=human(g).accounts.map(a=>a.nextReset);g.event={...E.EVENTS.find(e=>e.id==='promise')};g.resetDeck=['normal'];g=E.endDay(g);assert.deepEqual(human(g).accounts.map(a=>a.nextReset),dates);assert.ok(human(g).accounts.every(a=>a.quota===180));
});
test('bank expiry, three-token limit, full-quota prevention and daily use limit remain enforced',()=>{
  let g=fresh();account(g).banks=[2,3,31];assert.match(E.actionError(g,0,{type:'bank',account:account(g).id}),/已经满/);
  g=morning(g,2);assert.deepEqual(account(g).banks,[3,31]);assert.equal(human(g).expired,1);account(g).quota=0;
  g=E.act(g,{type:'bank',account:account(g).id});assert.deepEqual(account(g).banks,[31]);account(g).quota=0;assert.match(E.actionError(g,0,{type:'bank',account:account(g).id}),/最多使用/);
  account(g).banks=[31,32,33];g.event={...E.EVENTS.find(e=>e.id==='promise')};g.resetDeck=['bank'];g=E.endDay(g);assert.equal(account(g).banks.length,3);assert.equal(g.receipt.gains[0].unused,1);
});
test('renewal management remains available in the night phase without advancing the game',()=>{
  let g=E.endDay(fresh());const before=structuredClone(g);g=E.act(g,{type:'renewal',account:account(g).id,tier:null});assert.equal(account(g).renewal,null);assert.equal(g.minute,480);assert.equal(g.phase,'reveal');assert.equal(g.rng,before.rng);assert.equal(human(g).energy,human(before).energy);
});
