import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const fresh = (seed = 84) => E.createGame(seed);
const human = g => g.players[0];
const account = g => human(g).accounts[0];
const job = g => human(g).projects[0];
const config = (model = 'sol', effort = 'medium', turbo = false) => ({ model, effort, turbo });
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a-b) <= epsilon, `${a} != ${b}`);
const dispatch = (g, ids = [job(g).id], c = config(), acc = account(g).id, lane = null) => E.act(g, { type:'dispatch',lane,projects:ids,account:acc,...c });
function add(g, need = 100, difficulty = 1) {
  const j = { ...job(g), id: ++g.serial, name: `Test ${g.serial}`, category:'game', work:0,need,difficulty,bugs:0,checked:0,riskLoad:0,repair:0,deadline:null };
  human(g).projects.push(j);return j;
}
test('a day is 480 paused minutes and 12 human energy; all players start equally', () => {
  const g=fresh();assert.equal(g.version,4);assert.equal(g.minute,0);assert.deepEqual(g.studio,{mode:'auto',threads:1,accountPolicy:'soon-reset',preferredAccount:account(g).id});
  for(const p of g.players){assert.equal(p.energy,12);assert.equal(p.cash,480);assert.equal(p.accounts[0].tier,20);assert.equal(p.lanes.length,0);}
  assert.equal(E.createGame(84,21).length,21);assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
});
test('account operations cost only cash, never time, attention or an opponent turn', () => {
  let g=fresh();const bots=structuredClone(g.players.slice(1));const rng=g.rng;
  g=E.act(g,{type:'upgrade',account:account(g).id,tier:200});
  g=E.act(g,{type:'buy',tier:200});g=E.act(g,{type:'renewal',account:account(g).id,tier:null});
  assert.equal(human(g).cash,100);assert.equal(human(g).energy,12);assert.equal(g.minute,0);assert.equal(g.rng,rng);assert.deepEqual(g.players.slice(1),bots);
});
test('claiming many projects costs one attention each without advancing time or enforcing two slots', () => {
  let g=fresh();for(let i=0;i<6;i++)g=E.act(g,{type:'claim',project:g.market[0].id});
  assert.equal(human(g).projects.length,7);assert.equal(human(g).energy,4);assert.equal(g.minute,0);
  assert.equal(human(g).lanes.length,1);assert.equal(human(g).lanes[0].projects.length,7);
  const before=human(g).used;const a={type:'dispatch',lane:null,projects:human(g).projects.map(j=>j.id),account:account(g).id,...config()};
  assert.match(E.actionError(g,0,a),/另一条/);g=E.act(g,a);assert.equal(human(g).energy,4);assert.equal(human(g).used,before);assert.equal(g.minute,0);
});
test('separate threads truly run concurrently, sharing an account fairly at exhaustion', () => {
  let g=fresh();job(g).need=100;const b=add(g);account(g).quota=1;
  g=dispatch(g);g=dispatch(g,[b.id]);g=E.advanceMinutes(g,60);
  near(human(g).projects[0].work,3.125);near(human(g).projects[1].work,3.125);near(human(g).used,1);near(account(g).quota,0);
  assert.equal(human(g).energy,8);for(const l of human(g).lanes)assert.equal(E.laneStatus(g,human(g),l),'等待额度');
});
test('one minute can finish multiple jobs; queue carryover never wastes quota or partial time', () => {
  let g=fresh();job(g).need=.03;const a=job(g).id;const b=add(g,.04);const c=add(g,10);
  g=dispatch(g,[a,b.id,c.id]);g=E.advanceMinutes(g,1);
  assert.equal(human(g).shipped.length,2);near(job(g).work,.11);near(human(g).used,.18*.16);
  assert.deepEqual(human(g).lanes[0].projects,[c.id]);
});
test('the last project charges only its actual remaining work, even on Ultra and Turbo', () => {
  let g=fresh();job(g).need=.07;g=dispatch(g,undefined,config('astra','ultra',true));g=E.advanceMinutes(g,120);
  assert.equal(human(g).shipped.length,1);near(human(g).used,.07*3);near(account(g).quota,24-.21);
  assert.equal(human(g).lanes[0].enabled,false);
});
test('all independent settings retain difficulty risk; Turbo buys speed at higher cost per work', () => {
  const g=fresh();job(g).difficulty=4;
  for(const model of Object.keys(E.MODELS))for(const effort of Object.keys(E.EFFORTS)) {
    const plain=E.developmentStats(g,human(g),config(model,effort),job(g));
    const turbo=E.developmentStats(g,human(g),config(model,effort,true),job(g));
    near(turbo.speed,plain.speed*2);near(turbo.minutes,plain.minutes/2);assert.equal(plain.risk,turbo.risk);assert.ok(turbo.cost>plain.cost);
    if(plain.cost)near(turbo.cost,plain.cost*2.5);
  }
  assert.ok(E.developmentStats(g,human(g),config('sol','max'),job(g)).minutes>E.developmentStats(g,human(g),config(),job(g)).minutes);
  assert.equal(E.developmentStats(g,human(g),config('astra','ultra',true),job(g)).risk,0);
  assert.equal(E.developmentStats(g,human(g),config('luna','medium'),job(g)).risk,80);
});
test('Turbo finishes equal work in half the simulated time and pays 2.5 times quota', () => {
  let g=fresh();job(g).need=100;
  const plain=E.advanceMinutes(dispatch(g),60);const fast=E.advanceMinutes(dispatch(g,undefined,config('sol','medium',true)),30);
  near(job(plain).work,job(fast).work);near(human(fast).used,human(plain).used*2.5);
});
test('Luna runs large simple tasks without quota or subscription', () => {
  let g=fresh();job(g).need=100;account(g).quota=0;account(g).paidUntil=0;
  g=dispatch(g,undefined,config('luna'));g=E.advanceMinutes(g,400);
  near(job(g).work,30);assert.equal(job(g).bugs,0);assert.equal(human(g).used,0);
});
test('quota can be used down to a fraction then banked and resumed without rescheduling', () => {
  let g=fresh();job(g).need=100;account(g).quota=.001;g=dispatch(g);g=E.advanceMinutes(g,2);
  near(job(g).work,.001/.16);const work=job(g).work;const energy=human(g).energy;const minute=g.minute;
  g=E.act(g,{type:'bank',account:account(g).id});assert.equal(g.minute,minute);assert.equal(human(g).energy,energy);assert.equal(account(g).nextReset,8);
  g=E.advanceMinutes(g,1);near(job(g).work,work+.18);
});
test('automatic bug repair uses time, then continues into the next queued project', () => {
  let g=fresh();job(g).need=20;job(g).work=20;job(g).checked=20;job(g).bugs=1;const b=add(g);
  g=dispatch(g,[job(g).id,b.id],config('luna'));g=E.advanceMinutes(g,180);
  assert.equal(human(g).shipped.length,1);near(job(g).work,1.5);assert.equal(human(g).shipped[0].bugs,0);
});
test('human rest and freelance consume real game time while background workers keep running', () => {
  let g=fresh();job(g).need=100;g=dispatch(g,undefined,config('luna'));
  g=E.act(g,{type:'rest'});assert.equal(g.minute,60);assert.equal(human(g).energy,12);near(job(g).work,4.5);
  assert.match(E.actionError(g,0,{type:'rest'}),/已经休息/);
  const cash=human(g).cash;g=E.act(g,{type:'freelance'});assert.equal(g.minute,120);assert.equal(human(g).cash,cash+25);assert.equal(human(g).energy,11);near(job(g).work,9);
});
test('manual debugging clears defects while another background project advances', () => {
  let g=fresh();job(g).bugs=2;const a=job(g).id;const b=add(g);g=dispatch(g,[b.id],config('luna'));
  g=E.act(g,{type:'test',project:a});assert.equal(g.minute,30);assert.equal(human(g).energy,8);near(human(g).projects.find(j=>j.id===b.id).work,2.25);assert.equal(job(g).bugs,0);
});
test('splitting advance calls does not change simulation, random defects, spending or opponents', () => {
  let g=fresh();job(g).need=100;job(g).difficulty=4;const b=add(g,70,3);g=dispatch(g,[job(g).id,b.id],config('luna','ultra',true));
  const once=E.advanceMinutes(g,310);const split=[1,7,32,120,150].reduce((s,n)=>E.advanceMinutes(s,n),g);
  assert.deepEqual(split,once);assert.ok(E.restoreGame(JSON.stringify(once)));
});
test('risk is accumulated from all preceding work, so changing to a stronger model at a checkpoint cannot erase it', () => {
  let observed=0;
  for(let seed=1;seed<=70;seed++){
    let g=fresh(seed);job(g).need=100;job(g).difficulty=4;g=dispatch(g,undefined,config('luna'));g=E.advanceMinutes(g,266);
    const accumulated=job(g).riskLoad;assert.ok(accumulated>.79);
    const l=human(g).lanes[0];g=dispatch(g,l.projects,config('astra','ultra',true),l.account,l.id);assert.equal(job(g).riskLoad,accumulated);
    g=E.advanceMinutes(g,1);observed+=job(g).bugs;
  }
  assert.ok(observed>38 && observed<68,`${observed}/70 checkpoints`);
});
test('queues continue over days, reserving two energy per live lane; paused lanes reserve none', () => {
  let g=fresh();job(g).need=500;const b=add(g,500);g=dispatch(g,undefined,config('luna'));g=dispatch(g,[b.id],config('luna'));
  g=E.act(g,{type:'pause',lane:human(g).lanes[1].id});g=E.nextDay(E.endDay(g));assert.equal(g.day,2);assert.equal(g.minute,0);assert.equal(human(g).energy,10);
  near(job(g).work,36);near(human(g).projects[1].work,0);g=E.advanceMinutes(g,30);near(job(g).work,38.25);
});
test('duplicate assignments and unaffordable dispatches are rejected without resource mutations', () => {
  let g=dispatch(fresh());const a={type:'dispatch',lane:null,projects:[job(g).id],account:account(g).id,...config()};
  assert.match(E.actionError(g,0,a),/另一条/);let out=E.act(g,a);assert.equal(human(out).energy,human(g).energy);assert.equal(out.minute,g.minute);
  human(g).energy=0;assert.match(E.actionError(g,0,{...a,lane:human(g).lanes[0].id}),/精力不足/);
});
test('next-node stops at a human completion or exhaustion, rather than wasting the rest of the day', () => {
  let g=fresh();job(g).need=1;g=dispatch(g);g=E.act(g,{type:'next'});assert.equal(g.minute,6);assert.equal(human(g).shipped.length,1);
  g=fresh();job(g).need=100;account(g).quota=.1;g=dispatch(g);g=E.act(g,{type:'next'});assert.equal(g.minute,4);near(account(g).quota,0);
});
test('end-day runs the remaining time before resolving a forced reset and reports bank collision', () => {
  let g=fresh();job(g).need=100;g.event={...E.EVENTS.find(e=>e.id==='promise')};g.resetDeck=['normal'];account(g).quota=1;
  g=dispatch(g);g=E.advanceMinutes(g,20);g=E.act(g,{type:'bank',account:account(g).id});const before=job(g).work;
  g=E.endDay(g);assert.equal(g.minute,480);assert.equal(g.phase,'reveal');assert.ok(job(g).work>before);assert.equal(g.receipt.kind,'normal');assert.equal(account(g).quota,24);assert.equal(g.receipt.gains[0].collision,true);
});
test('deadline day includes its whole working window; the next morning prunes failed queues', () => {
  let g=fresh();job(g).deadline=1;job(g).category='company';job(g).need=500;g=dispatch(g,undefined,config('luna'));
  g=E.endDay(g);assert.equal(human(g).projects.length,1);g=E.nextDay(g);assert.equal(human(g).projects.length,0);assert.equal(human(g).vp,-3);assert.equal(human(g).lanes[0].enabled,false);assert.equal(human(g).energy,12);
});
test('AI decision making does not inspect the next event, reset-card order or PRNG', () => {
  const g=fresh();const b=structuredClone(g);b.rng=3999999;b.events.reverse();b.resetDeck.reverse();
  assert.deepEqual(E.chooseAction(g,1),E.chooseAction(b,1));assert.equal('rng' in E.textState(g),false);
});
test('24 seeded full seasons remain playable, bounded and restorable with different human styles', () => {
  const scores=[];const styles=['builder','sprinter','banker','balanced'];
  for(let seed=1;seed<=24;seed++) {
    let g=E.createGame(seed,seed%4===0?42:21);let iterations=0;
    while(g.phase!=='over' && iterations++<3000) {
      if(g.phase==='reveal')g=E.nextDay(g);
      else {const action=E.chooseAction(g,0,styles[seed%4]);g=action.type==='pass'?E.advanceMinutes(g,60):E.act(g,action);}
      for(const p of g.players){assert.ok(p.energy>=0&&p.energy<=12);assert.ok(p.cash>=0);for(const a of p.accounts)assert.ok(a.quota>=0&&a.quota<=E.PLANS[a.tier].capacity+1e-7);}
    }
    assert.equal(g.phase,'over');assert.ok(E.restoreGame(JSON.stringify(g)),`seed ${seed} restore`);assert.ok(human(g).shipped.length>=4);
    scores.push({seed,style:styles[seed%4],days:g.length,works:human(g).shipped.length,score:E.score(human(g)).total,bots:g.players.slice(1).map(p=>E.score(p).total)});
  }
  console.log('Season balance',JSON.stringify(scores));
});
