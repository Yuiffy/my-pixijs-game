import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
// Funded states isolate reset mechanics; real new games always start at $20.
const fresh = (setup = 'balanced', seed = 84) => {
  const g=E.createGame(seed); const p=g.players[0]; const tiers=setup==='dual'?[200,200]:setup==='lean'?[20]:[100];
  p.accounts=tiers.map((tier,i)=>({...structuredClone(p.accounts[0]),id:i?++g.serial:p.accounts[0].id,tier,quota:E.PLANS[tier].capacity,renewal:null}));
  p.cash=500-tiers.reduce((a,b)=>a+b,0); return g;
};
const clone = g => structuredClone(g);
const human = g => g.players[0];
const account = g => human(g).accounts[0];
const job = g => human(g).projects[0];
const develop = (g, model = 'sol', effort = 'medium', turbo = false) => E.act(g, { type: 'develop', project: job(g).id, account: account(g).id, model, effort, turbo });
const nextMorning = (g, day) => {
  const fixture = clone(g); fixture.day = day - 1; fixture.phase = 'reveal'; fixture.events = ['quiet'];
  return E.nextDay(fixture);
};

test('seeded fixtures, opening bank grants and round-trip persistence', () => {
  for (const setup of ['lean', 'balanced', 'dual']) {
    const g = fresh(setup);
    assert.deepEqual(g, fresh(setup));
    assert.deepEqual(E.restoreGame(JSON.stringify(g)), g);
    assert.equal(human(g).cash + human(g).accounts.reduce((n, a) => n + a.tier, 0), 500);
    assert.ok(human(g).accounts.every(a => a.banks[0] === 31 && a.nextReset === 8));
  }
});
test('one human action advances each rival once and spends exactly one action', () => {
  const g = fresh(); const n = develop(g);
  assert.equal(E.actionsLeft(n), 2);
  assert.equal(account(n).quota, account(g).quota - 4);
  assert.equal(job(n).work, 6);
  assert.ok(n.players.slice(1).every(p => p.accounts[0].tier > 20));
  assert.equal(g.cursor, 0, 'reducers never mutate the previous state');
});
test('normal reset refills instead of stacking and preserves every natural reset date', () => {
  const g = develop(fresh('dual'));
  g.event = { ...E.EVENTS[1] }; g.resetDeck = ['normal'];
  const dates = human(g).accounts.map(a => a.nextReset);
  const old = human(g).accounts.reduce((n, a) => n + a.quota, 0);
  const n = E.endDay(g);
  assert.equal(n.receipt.kind, 'normal');
  assert.equal(n.receipt.gains[0].gained, 360 - old);
  assert.equal(n.receipt.gains[0].unused, old);
  assert.deepEqual(human(n).accounts.map(a => a.nextReset), dates);
  assert.ok(human(n).accounts.every(a => a.quota === 180));
});
test('bank is account-bound, free, one per day, and same-day force reset records collision', () => {
  const g = fresh('dual'); account(g).quota = 0; human(g).accounts[1].quota = 50;
  const used = E.act(g, { type: 'bank', account: account(g).id });
  assert.equal(used.cursor, 0); assert.equal(account(used).quota, 180);
  assert.equal(human(used).accounts[1].quota, 50); assert.equal(account(used).nextReset, 8);
  assert.equal(account(used).banks.length, 0);
  account(used).banks = [31]; account(used).quota = 100;
  assert.match(E.actionError(used, 0, { type: 'bank', account: account(used).id }), /最多使用/);
  used.event = { ...E.EVENTS[1] }; used.resetDeck = ['normal'];
  const n = E.endDay(used);
  assert.equal(n.receipt.gains[0].collision, true); assert.equal(human(n).collisions, 1);
  assert.equal(n.receipt.gains[0].gained, 210);
});
test('banked event grants tokens without changing current quota, capped at three', () => {
  const g = fresh('dual'); account(g).quota = 11; account(g).banks = [20, 25, 31];
  g.event = { ...E.EVENTS[1] }; g.resetDeck = ['bank'];
  const n = E.endDay(g);
  assert.equal(account(n).quota, 11); assert.equal(account(n).banks.length, 3);
  assert.equal(human(n).accounts[1].banks.length, 2);
  assert.equal(n.receipt.gains[0].gained, 1); assert.equal(n.receipt.gains[0].unused, 1);
});
test('bank expires exactly on day 31 and oldest valid token is consumed first', () => {
  const g = fresh(); account(g).banks = [31, 34]; account(g).quota = 0;
  const b = E.act(g, { type: 'bank', account: account(g).id }); assert.deepEqual(account(b).banks, [34]);
  const d30 = nextMorning(g, 30); assert.equal(account(d30).banks.length, 2);
  const d31 = nextMorning(g, 31); assert.deepEqual(account(d31).banks, [34]); assert.equal(human(d31).expired, 1);
});
test('independent seven-day clocks permit one banked refill while the other naturally resets', () => {
  const g = fresh('dual'); account(g).quota = 0; account(g).nextReset = 10;
  human(g).accounts[1].quota = 7; human(g).accounts[1].nextReset = 8;
  const d8 = nextMorning(g, 8);
  assert.equal(account(d8).quota, 0); assert.equal(human(d8).accounts[1].quota, 180);
  const b = E.act(d8, { type: 'bank', account: account(d8).id });
  assert.equal(account(b).quota, 180); assert.equal(account(b).nextReset, 10);
  assert.equal(human(b).accounts[1].nextReset, 15);
});
test('subscriptions expire, Luna remains available, renewal restores paid usage', () => {
  const g = fresh(); g.day = 31; account(g).quota = 70;
  assert.match(E.actionError(g, 0, { type: 'develop', project: job(g).id, account: account(g).id, model: 'sol', effort: 'medium', turbo: false }), /有效订阅/);
  assert.equal(E.actionError(g, 0, { type: 'develop', project: job(g).id, account: account(g).id, model: 'luna', effort: 'medium', turbo: false }), null);
  const n = E.act(g, { type: 'renew', account: account(g).id, tier: 100 });
  assert.equal(account(n).paidUntil, 60); assert.equal(account(n).nextReset, 38);
  assert.equal(account(n).quota, 90); assert.equal(human(n).cash, 300);
  assert.match(E.actionError(n, 0, { type: 'renew', account: account(n).id, tier: 100 }), /到期后/);
});
test('upgrade only grants capacity difference; new accounts start an independent clock', () => {
  const g = fresh('lean'); g.day = 3; account(g).quota = 5;
  const upgraded = E.act(g, { type: 'upgrade', account: account(g).id, tier: 100 });
  assert.equal(account(upgraded).quota, 71); assert.equal(human(upgraded).cash, 400);
  assert.equal(account(upgraded).nextReset, 8); assert.equal(account(upgraded).paidUntil, 30);
  const bought = E.act(upgraded, { type: 'buy', tier: 200 });
  assert.equal(human(bought).accounts[1].nextReset, 10); assert.equal(human(bought).accounts[1].paidUntil, 32);
  assert.deepEqual(human(bought).accounts[1].banks, []);
});
test('capable Ultra + Turbo can publish directly without an invented bug penalty', () => {
  const g=fresh();job(g).need=36;job(g).category='game';job(g).difficulty=2;
  const done=develop(g,'astra','ultra',true);
  assert.equal(human(done).projects.length,0);assert.equal(human(done).shipped.length,1);
  assert.equal(human(done).shipped[0].bugs,0);assert.equal(done.awards[0].owner,0);
  assert.equal(account(done).quota,36);
});
test('project pool is shared and invalid actions spend neither money nor time', () => {
  const g = fresh(); const id = g.market[0].id;
  const claimed = E.act(g, { type: 'claim', project: id });
  assert.ok(human(claimed).projects.some(j => j.id === id)); assert.ok(!claimed.market.some(j => j.id === id));
  const illegal = E.act(claimed, { type: 'claim', project: claimed.market[0].id });
  assert.equal(illegal.cursor, claimed.cursor); assert.equal(human(illegal).cash, human(claimed).cash);
  assert.match(illegal.message, /最多同时/);
  const fullBank = E.act(g, { type: 'bank', account: account(g).id });
  assert.equal(fullBank.cursor, 0); assert.equal(account(fullBank).banks.length, 1);
});
test('company deadlines include the final day; a missed deadline deducts once', () => {
  const g = fresh(); job(g).category = 'company'; job(g).deadline = 8;
  assert.equal(human(nextMorning(g, 8)).projects.length, 1);
  const late = nextMorning(g, 9); assert.equal(human(late).projects.length, 0); assert.equal(human(late).vp, -3);
  assert.equal(human(nextMorning(late, 10)).vp, -3);
});
test('weekly personal income, diversity and resource scoring caps are finite', () => {
  const g = fresh(); g.day = 7; g.event = { ...E.EVENTS[2] };
  human(g).shipped = [{ ...job(g), work: job(g).need }];
  assert.equal(human(E.endDay(g)).cash, 450);
  human(g).cash = 9000; human(g).used = 9000;
  human(g).shipped = ['game', 'open', 'company', 'personal'].map((category, i) => ({ ...job(g), category, id: 900 + i }));
  assert.equal(E.score(human(g)).total, 32);
});
test('public diagnostics hide future randomness and malformed saves are rejected', () => {
  const g = fresh(); const text = E.textState(g);
  assert.equal(text.rng, undefined); assert.equal(text.events, undefined); assert.ok(!Array.isArray(text.resetDeck));
  for (const raw of ['', 'null', '{', '{}', '{"version":1}']) assert.equal(E.restoreGame(raw), null);
  const bad = clone(g); bad.players[0].accounts[0].quota = -1; assert.equal(E.restoreGame(JSON.stringify(bad)), null);
});
test('AI policies finish 72 seeded full games, preserve invariants and use multiple strategies', () => {
  const totals = { lean: [], balanced: [], dual: [] }; const counts = {}; let reveals = 0;
  for (const setup of Object.keys(totals)) for (let seed = 1; seed <= 24; seed++) {
    let g = fresh(setup, seed); let guard = 0;
    while (g.phase !== 'over' && guard++ < 400) {
      if (g.phase === 'reveal') g = E.nextDay(g);
      else if (E.actionsLeft(g)) {
        const a = E.chooseAction(g, 0, ['balanced', 'builder', 'sprinter', 'banker'][seed % 4]);
        counts[a.type] = (counts[a.type] || 0) + 1;
        assert.equal(E.actionError(g, 0, a), null, JSON.stringify({ seed, day: g.day, a }));
        g = E.act(g, a);
      } else { g = E.endDay(g); reveals++; }
      assert.ok(E.restoreGame(JSON.stringify(g)), `valid persisted state ${setup} seed ${seed} day ${g.day}`);
      assert.ok(g.players.every(p => p.cash >= 0 && p.accounts.every(a => a.quota >= 0 && a.banks.length <= 3)));
      assert.equal(new Set(g.market.map(p => p.name)).size, 4, 'project pool never accumulates duplicate contracts');
    }
    assert.equal(g.phase, 'over'); assert.equal(g.day, 42); assert.ok(human(g).shipped.length > 5);
    totals[setup].push(E.score(human(g)).total);
  }
  for (const action of ['develop', 'claim', 'test', 'bank', 'renew']) assert.ok(counts[action] > 0, action);
  console.log(JSON.stringify({ games: 72, reveals, actions: counts, scores: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, { min: Math.min(...v), max: Math.max(...v), mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }])) }));
});
