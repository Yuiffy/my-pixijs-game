import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { announce, newsFixture, night } from './helpers/reset-news-fixtures.mjs';
const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const human = g => g.players[0];
const acc = g => human(g).accounts[0];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const returned = () => announce(E, newsFixture(E), 'pro-return');
const dots = () => announce(E, returned(), 'devday-dots');

test('random seasons can omit each headline; announcements are valid, once-only, and obey prerequisites', () => {
  const ids = ['pro-return', 'credit-compensation', 'sol-61', 'sol-polish', 'devday-dots'];
  for (const length of [21, 42]) {
    const counts = Object.fromEntries(ids.map(id => [id, 0]));
    for (let seed = 1; seed <= 128; seed++) {
      let g = E.createGame(seed * 7919, length), seen = new Set();
      // Keep an old $200 subscriber eligible, without letting work obscure calendar randomness.
      g = E.act(g, { type: 'upgrade', account: acc(g).id, tier: 200 });
      for (const p of g.players) for (const a of p.accounts) a.paidUntil = 100;
      while (g.phase !== 'over') {
        assert.ok(g.event.id && E.EVENTS.some(e => e.id === g.event.id));
        if (ids.includes(g.event.id)) {
          assert.equal(seen.has(g.event.id), false);
          if (g.event.id === 'pro-return') assert.ok(g.platform.proDeadline <= g.day);
          if (g.event.id === 'credit-compensation') assert.ok(seen.has('pro-return'));
          if (g.event.id === 'sol-polish') assert.ok(seen.has('sol-61'));
          if (g.event.id === 'sol-61') assert.ok(g.day >= 8);
          if (g.event.id === 'devday-dots') assert.ok(g.day >= 7);
          seen.add(g.event.id); counts[g.event.id]++;
          assert.equal(g.event.chance, 0);
        }
        g.minute = 480;
        const restored = E.restoreGame(JSON.stringify(g)); assert.ok(restored, `seed ${seed}, D${g.day}`);
        assert.deepEqual(E.nextDay(E.endDay(restored)), E.nextDay(E.endDay(g)));
        g = E.nextDay(E.endDay(g));
      }
    }
    for (const id of ids) assert.ok(counts[id] > 0 && counts[id] < 128, `${length}d ${id}: ${counts[id]}`);
    console.log('News calendar:', JSON.stringify({ length, seasons: 128, counts }));
  }
});

test('$200 returns at half capacity with the same percentage; paused accounts shrink too, and $500 unlocks', () => {
  let g = newsFixture(E); acc(g).quota = 177.12;
  const beforePercent = E.quotaPercent(acc(g), g), before = structuredClone(human(night(E, g)));
  assert.match(E.actionError(g, 0, { type: 'buy', tier: 500 }), /尚未开放/);
  assert.match(E.actionError(g, 0, { type: 'buy', tier: 200 }), /停止新开/);
  g = announce(E, g, 'pro-return');
  near(acc(g).quota, 88.56); assert.equal(E.quotaPercent(acc(g), g), beforePercent);
  assert.equal(E.planCapacity(g, 200), 240); assert.equal(E.proClosed(g), false);
  assert.deepEqual(E.availableTiers(g), [20, 100, 200, 500]);
  for (const key of ['cash', 'vp', 'used', 'credits']) assert.equal(human(g)[key], before[key]);
  for (const key of ['banks', 'nextReset', 'paidUntil']) assert.deepEqual(acc(g)[key], before.accounts[0][key]);
  assert.equal(acc(g).compensationDue, true);
  let paused = newsFixture(E); acc(paused).paidUntil = 6; acc(paused).quota = 100;
  paused = announce(E, paused, 'pro-return');
  assert.equal(acc(paused).quota, 50); assert.equal(acc(paused).compensationDue, false);
  assert.ok(E.restoreGame(JSON.stringify(g)));
});

test('the new plan buys, upgrades, renews and naturally resets with the published capacities', () => {
  let g = returned(); human(g).cash = 3000;
  const before = { cash: human(g).cash, minute: g.minute, energy: human(g).energy };
  g = E.act(g, { type: 'buy', tier: 500 });
  assert.equal(human(g).cash, before.cash - 500);
  assert.equal(human(g).accounts[1].quota, 600);
  g = E.act(g, { type: 'upgrade', account: acc(g).id, tier: 500 });
  assert.equal(human(g).cash, before.cash - 800); assert.equal(acc(g).quota, 600);
  acc(g).quota = 0; acc(g).nextReset = g.day + 1;
  g.events = ['quiet']; g = E.nextDay(night(E, g));
  assert.equal(acc(g).quota, 600);
  g = E.act(g, { type: 'renewal', account: acc(g).id, tier: 200 });
  acc(g).paidUntil = g.day; acc(g).quota = 100;
  g.events = ['quiet']; const cash = human(g).cash;
  g = E.nextDay(night(E, g));
  assert.equal(acc(g).tier, 200); assert.equal(acc(g).quota, 240);
  assert.equal(human(g).cash, cash - 200); assert.equal(acc(g).nextReset, g.day + 7);
  acc(g).quota = 1; acc(g).banks.push(g.day + 30);
  g = E.act(g, { type: 'bank', account: acc(g).id }); assert.equal(acc(g).quota, 240);
  assert.equal(before.minute, 0); assert.ok(E.restoreGame(JSON.stringify(g)));
});

test('compensation eligibility is fixed at the change, survives downgrades, and never covers later accounts', () => {
  let g = returned();
  assert.equal(human(g).credits, 0);
  g = E.act(g, { type: 'buy', tier: 200 });
  assert.equal(human(g).accounts[1].compensationDue, undefined);
  // Renewal at a lower tier cannot erase the entitlement already recorded for the old account.
  acc(g).paidUntil = g.day - 1;
  g = E.act(g, { type: 'renew', account: acc(g).id, tier: 20 });
  const before = structuredClone(human(g));
  g = announce(E, E.restoreGame(JSON.stringify(g)), 'credit-compensation');
  assert.equal(human(g).credits, 120); assert.equal(g.platform.news.compensated, true);
  assert.equal(human(g).cash, before.cash); assert.deepEqual(acc(g).banks, before.accounts[0].banks);
  assert.ok(human(g).accounts.every(a => a.compensationDue !== true));
  // A future ticket cannot award the same credits twice.
  for (let i = 0; i < 8; i++) {
    g.events = ['industry-news']; g = E.nextDay(night(E, g));
    assert.notEqual(g.event.id, 'credit-compensation'); assert.equal(human(g).credits, 120);
  }
});

test('credits refill only the gap, persist through gift resets, and cannot revive an expired subscription', () => {
  let g = announce(E, returned(), 'credit-compensation');
  acc(g).quota = 230; acc(g).meter = { tokens: 50, startPercent: 100, config: 'test', revision: 0 };
  const before = structuredClone(g);
  g = E.act(g, { type: 'credit', account: acc(g).id });
  assert.equal(acc(g).quota, 240); assert.equal(human(g).credits, 110); assert.equal(acc(g).meter, null);
  for (const key of ['cash', 'energy', 'used', 'resetGain', 'banksUsed']) assert.equal(human(g)[key], human(before)[key]);
  for (const key of ['nextReset', 'paidUntil', 'banks']) assert.deepEqual(acc(g)[key], acc(before)[key]);
  assert.equal(g.minute, before.minute); assert.match(E.actionError(g, 0, { type: 'credit', account: acc(g).id }), /已经满了/);
  acc(g).quota = 0; g = night(E, g, true);
  assert.equal(human(g).credits, 110); assert.equal(acc(g).quota, 240);
  g.phase = 'plan'; acc(g).paidUntil = g.day - 1;
  assert.match(E.actionError(g, 0, { type: 'credit', account: acc(g).id }), /有效订阅/);
  assert.ok(E.restoreGame(JSON.stringify(g)));
});

test('real Sol 6.1 and optional polishing approach Astra speed with cheaper, equally capable work', () => {
  let g = announce(E, returned(), 'sol-61');
  const config = model => ({ model, effort: 'medium', turbo: false });
  const sol = E.developmentStats(g, human(g), config('sol'));
  const astra = E.developmentStats(g, human(g), config('astra'));
  assert.equal(E.modelEdition(g, 'sol').name, 'GPT-6.1 Sol'); assert.equal(E.modelEdition(g, 'sol').fictional, false);
  assert.equal(sol.ability, astra.ability); assert.ok(sol.speed > astra.speed * 0.8 && sol.speed < astra.speed);
  assert.ok(sol.cost < astra.cost / 3);
  g = announce(E, g, 'sol-polish');
  const polished = E.developmentStats(g, human(g), config('sol'));
  assert.ok(polished.speed > sol.speed && polished.speed >= astra.speed * 0.95);
  assert.equal(polished.cost, sol.cost); assert.equal(polished.ability, sol.ability);
  g.platform.nextRelease = g.day + 1; g = E.nextDay(night(E, g));
  assert.equal(g.platform.stage, 4); assert.equal(E.modelEdition(g, 'sol').name, 'GPT-6.1 Sol');
  assert.match(g.event.detail, /主力继续使用 GPT-6.1 Sol/);
});

test('Dot handoff costs one energy per day; changing, cancelling and morning rescheduling cannot refund it', () => {
  let g = dots(); g = E.act(g, { type: 'claim', project: g.market[0].id });
  const [first, second] = human(g).projects;
  const before = human(g).energy;
  g = E.act(g, { type: 'dot', project: first.id }); assert.equal(human(g).energy, before - 1);
  g = E.act(g, { type: 'dot', project: second.id });
  g = E.act(g, { type: 'dot', project: null });
  g = E.act(g, { type: 'dot', project: first.id });
  g = E.act(g, { type: 'studio', ...g.studio, threads: 0 });
  assert.equal(human(g).energy, before - 1); assert.equal(E.energyBreakdown(g, human(g)).other, 1);
  assert.equal(g.minute, 0); assert.ok(E.restoreGame(JSON.stringify(g)));
  g = night(E, g); g.events = ['quiet']; g = E.nextDay(g);
  assert.equal(human(g).dot.paidDay, g.day); assert.equal(human(g).energy, 11);
  g = E.act(g, { type: 'dot', project: null }); assert.equal(human(g).energy, 11);
});

test('Dot uses one selected project and Astra Standard, stops on empty quota, and cannot use a Plus account', () => {
  let g = dots();
  const job = human(g).projects[0];
  g = E.act(g, { type: 'dot', project: job.id });
  acc(g).quota = 1; human(g).energy = 0;
  const oldLanes = structuredClone(human(g).lanes), beforeUsed = human(g).used;
  g = night(E, g);
  near(human(g).projects[0].work, 2.5); near(human(g).used - beforeUsed, 1);
  assert.equal(acc(g).quota, 0); assert.deepEqual(human(g).lanes, oldLanes);
  assert.equal(human(g).dot.report.work, 2.5); assert.equal(human(g).energy, 0);
  assert.deepEqual(E.endDay(g), g); assert.ok(E.restoreGame(JSON.stringify(g)));
  g.phase = 'plan'; acc(g).tier = 20; acc(g).quota = 24;
  assert.match(E.actionError(g, 0, { type: 'dot', project: job.id }), /Pro 账号/);
  const work = human(g).projects[0].work; g = night(E, g);
  assert.equal(human(g).projects[0].work, work); assert.equal(acc(g).quota, 24);
});

test('Dot night work precedes the gift; the new reset is kept for tomorrow instead of spent retroactively', () => {
  let g = dots(); g = E.act(g, { type: 'dot', project: human(g).projects[0].id });
  acc(g).quota = 0;
  const work = human(g).projects[0].work;
  g = night(E, g, true);
  assert.equal(human(g).projects[0].work, work); assert.equal(human(g).dot.report.work, 0);
  assert.equal(g.receipt.kind, 'normal'); assert.equal(acc(g).quota, 240);
});

test('Dot can finish, repair and ship only its assigned job, exactly once, without extra daytime lanes', () => {
  let g = dots(); const p = human(g), first = p.projects[0];
  first.need = 20; first.work = 19; first.checked = 0; first.bugs = 1;
  g = E.act(g, { type: 'claim', project: g.market[0].id });
  const second = human(g).projects[1], cash = human(g).cash, vp = human(g).vp, quota = acc(g).quota;
  g = E.act(g, { type: 'dot', project: first.id });
  g = night(E, g);
  const shipped = human(g).shipped.find(j => j.id === first.id);
  assert.ok(shipped); assert.equal(shipped.bugs, 0); assert.equal(human(g).shipped.filter(j => j.id === first.id).length, 1);
  assert.equal(human(g).projects.find(j => j.id === second.id).work, 0);
  near(quota - acc(g).quota, 13 * 0.4); assert.equal(human(g).dot.project, null);
  assert.equal(human(g).dot.report.shipped, true); near(human(g).dot.report.work, 13);
  assert.equal(human(g).cash, cash + shipped.delivery.cash); assert.equal(human(g).vp, vp + shipped.delivery.vp);
  assert.ok(human(g).lanes.every(l => l.id > 0));
  const resumed = E.restoreGame(JSON.stringify(g)); assert.ok(resumed); assert.deepEqual(E.endDay(resumed), resumed);
});

test('old v5 games gain news support without assets, RNG, schedule or paid attention changing', () => {
  const old = newsFixture(E); delete old.newsRules; delete old.platform.news;
  for (const p of old.players) { delete p.credits; delete p.dot; }
  const restored = E.restoreGame(JSON.stringify(old)); assert.ok(restored);
  assert.equal(restored.rng, old.rng); assert.equal(restored.platform.nextRelease, old.platform.nextRelease);
  assert.equal(restored.newsRules, 1);
  for (let i = 0; i < 4; i++) {
    const after = structuredClone(restored.players[i]); delete after.dot; delete after.credits;
    assert.deepEqual(after, old.players[i]);
  }
  assert.deepEqual(E.restoreGame(JSON.stringify(restored)), restored);
});

test('invalid news, credits, locked tiers, handoffs and reports reject without concealing a damaged save', () => {
  const baseline = dots();
  for (const mutate of [
    g => g.newsRules = 2,
    g => g.platform.news.sol61 = 'yes',
    g => { g.platform.news.sol61 = false; g.platform.news.solPolished = true; },
    g => { g.platform.news.returned = false; g.platform.news.compensated = true; },
    g => human(g).credits = -1,
    g => human(g).credits = null,
    g => human(g).dot.project = 999999,
    g => human(g).dot.paidDay = g.day + 1,
    g => human(g).dot.report = { day: g.day, project: 'x', work: 1, percent: 101, shipped: false },
    g => { g.platform.news.returned = false; acc(g).tier = 500; },
    g => { g.platform.news.returned = false; acc(g).renewal = 500; },
    g => { g.platform.news.dots = false; human(g).dot.paidDay = g.day; },
    g => { g.platform.news.compensated = true; acc(g).compensationDue = true; },
    g => acc(g).quota = 241,
  ]) {
    const g = structuredClone(baseline); mutate(g); assert.equal(E.restoreGame(JSON.stringify(g)), null);
  }
  const publicState = E.textState(baseline);
  assert.equal('rng' in publicState, false); assert.equal('events' in publicState, false);
  assert.equal('nextRelease' in publicState.platform, false); assert.equal('allowance' in publicState.platform, false);
  assert.equal('quota' in publicState.players[0].accounts[0], false);
});
