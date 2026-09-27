import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const player = g => g.players[0];
const account = g => player(g).accounts[0];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const morning = (g, day, event = 'quiet') => {
  const copy = structuredClone(g);
  copy.day = day - 1;
  copy.phase = 'reveal';
  copy.platform.nextRelease = 100;
  copy.events = [event];
  return E.nextDay(copy);
};
const longJob = g => { player(g).projects[0].need = 1000; player(g).projects[0].difficulty = 1; return g; };

test('same configuration buys exactly 1x, 5x and 20x allowance', () => {
  assert.equal(E.PLANS[100].capacity / E.PLANS[20].capacity, 5);
  assert.equal(E.PLANS[200].capacity / E.PLANS[20].capacity, 20);
  for (const scale of [0.8, 1, 1.2]) {
    const g = E.createGame(500);
    g.platform.allowance = scale;
    const cost = E.developmentStats(g, player(g), g.development).cost;
    near((E.PLANS[200].capacity / cost) / (E.PLANS[20].capacity / cost), 20);
  }
});

test('retirement gives two playable days and blocks purchases, upgrades and scheduled upgrades', () => {
  let g = morning(E.createGame(501), 8, 'pro-last-call');
  assert.equal(g.platform.proDeadline, 10);
  assert.equal(E.actionError(g, 0, { type: 'buy', tier: 200 }), null);
  g = morning(g, 9);
  assert.equal(E.actionError(g, 0, { type: 'buy', tier: 200 }), null);
  g = E.act(g, { type: 'renewal', account: account(g).id, tier: 200 });
  g = morning(g, 10);
  for (const action of [
    { type: 'buy', tier: 200 },
    { type: 'upgrade', account: account(g).id, tier: 200 },
    { type: 'renewal', account: account(g).id, tier: 200 },
  ]) assert.match(E.actionError(g, 0, action), /停止新开/);
  const due = morning(g, 31);
  assert.equal(account(due).tier, 20);
  assert.equal(account(due).renewal, 20);
  assert.equal(player(due).cash, player(g).cash - 20);
});

test('old $200 accounts retain continuous renewal, but downgrade or missed payment loses access', () => {
  let base = E.createGame(502);
  base = E.act(base, { type: 'upgrade', account: account(base).id, tier: 200 });
  base.platform.proDeadline = 9;
  base = morning(base, 10);
  const retained = morning(base, 31);
  assert.equal(account(retained).tier, 200);
  assert.equal(account(retained).paidUntil, 60);
  assert.equal(player(retained).cash, 100);
  for (const mode of ['stop', 'poor', 'downgrade']) {
    let g = structuredClone(base);
    if (mode === 'stop') account(g).renewal = null;
    if (mode === 'poor') player(g).cash = 0;
    if (mode === 'downgrade') account(g).renewal = 100;
    g = morning(g, 31);
    player(g).cash = 1000;
    assert.match(E.actionError(g, 0, { type: mode === 'downgrade' ? 'upgrade' : 'renew', account: account(g).id, tier: 200 }), /停止新开/);
    assert.match(E.actionError(g, 0, { type: 'renewal', account: account(g).id, tier: 200 }), /停止新开/);
  }
});

test('hidden allowance changes preserve visible balances, reset samples and change actual endurance', () => {
  let g = E.advanceMinutes(longJob(E.createGame(503)), 60);
  const percent = E.quotaPercent(account(g));
  assert.ok(account(g).meter.tokens > 0);
  g = morning(g, 5, 'limit-rumor');
  assert.equal(E.quotaPercent(account(g)), percent);
  assert.notEqual(g.platform.allowance, 1);
  assert.equal(account(g).meter, null);
  const base = longJob(E.createGame(504));
  const small = structuredClone(base); small.platform.allowance = 0.8;
  const large = structuredClone(base); large.platform.allowance = 1.2;
  const a = E.advanceMinutes(small, 60), b = E.advanceMinutes(large, 60);
  near(player(a).projects[0].work, player(b).projects[0].work);
  near(player(a).used, player(b).used);
  assert.ok(account(a).quota < account(b).quota);
  const publicState = E.textState(a);
  assert.equal('allowance' in publicState.platform, false);
  assert.equal('nextRelease' in publicState.platform, false);
  assert.equal('quota' in publicState.players[0].accounts[0], false);
  assert.equal('resetGain' in publicState.players[0], false);
});

test('token observation brackets full allowance and starts over after reset or model change', () => {
  let g = longJob(E.createGame(505));
  g.platform.allowance = 0.8;
  g = E.advanceMinutes(g, 60);
  const observed = E.quotaObservation(account(g));
  const fullTokens = 24 * 10 * 0.8;
  assert.ok(observed.fullLow <= fullTokens && observed.fullHigh >= fullTokens);
  assert.ok(observed.fullLow !== observed.fullHigh);
  g = E.act(g, { type: 'bank', account: account(g).id });
  assert.equal(E.quotaObservation(account(g)).fullLow, null);
  g = E.advanceMinutes(g, 60);
  g = E.act(g, { type: 'configure', development: { model: 'astra', effort: 'medium', turbo: true } });
  g = E.advanceMinutes(g, 1);
  assert.match(account(g).meter.config, /GPT-6 Astra/);
  assert.ok(account(g).meter.tokens < observed.tokens);
  assert.deepEqual(E.restoreGame(JSON.stringify(g)), g);
  assert.deepEqual(E.advanceMinutes(g, 60), E.advanceMinutes(E.advanceMinutes(g, 27), 33));
});

test('releases improve capability; price drops change quota per equal work without changing token use', () => {
  let g = E.createGame(506);
  const config = { model: 'luna', effort: 'high', turbo: false };
  const stats = () => E.developmentStats(g, player(g), config, { ...player(g).projects[0], difficulty: 3 });
  const original = stats();
  g = morning(g, 15, 'tech-4');
  const launch = stats();
  assert.ok(launch.ability > original.ability && launch.speed > original.speed && launch.cost < original.cost);
  near(launch.tokenCost, original.tokenCost);
  g = morning(g, 16, 'tech-3');
  const sol = E.developmentStats(g, player(g), { model: 'sol', effort: 'medium', turbo: false }, { ...player(g).projects[0], difficulty: 3 });
  assert.equal(sol.risk, 0); assert.ok(sol.cost < 0.16);
  g = morning(g, 23, 'tech-4');
  assert.equal(E.developmentStats(g, player(g), { model: 'luna', effort: 'medium', turbo: false }, { ...player(g).projects[0], difficulty: 2 }).risk, 0);
  g = morning(g, 30, 'tech-5');
  assert.equal(E.developmentStats(g, player(g), { model: 'astra', effort: 'medium', turbo: false }, { ...player(g).projects[0], difficulty: 4 }).risk, 0);
  assert.equal(g.platform.stage, 5);
  assert.deepEqual(E.restoreGame(JSON.stringify(g)), g);
});

test('v4 migration preserves percentages, bank tokens, schedule and projects exactly once', () => {
  let old = E.createGame(507);
  old = E.act(old, { type: 'buy', tier: 100 });
  old = E.act(old, { type: 'buy', tier: 200 });
  old.version = 4;
  delete old.platform;
  for (const a of player(old).accounts) {
    a.quota = ({ 20: 24, 100: 90, 200: 180 })[a.tier] / 2;
    delete a.meter;
  }
  const g = E.restoreGame(JSON.stringify(old));
  assert.ok(g);
  assert.equal(g.version, 5);
  assert.deepEqual(player(g).accounts.map(E.quotaPercent), [50, 50, 50]);
  assert.deepEqual(player(g).accounts.map(a => a.quota), [12, 60, 240]);
  assert.deepEqual(player(g).projects, player(old).projects);
  assert.deepEqual(player(g).accounts.map(a => [a.banks, a.nextReset, a.paidUntil]), player(old).accounts.map(a => [a.banks, a.nextReset, a.paidUntil]));
  assert.deepEqual(E.restoreGame(JSON.stringify(g)), g);
  for (const mutate of [x => x.platform.allowance = 0, x => x.platform.stage = 6, x => account(x).meter = { tokens: -1 }]) {
    const corrupt = structuredClone(g); mutate(corrupt);
    assert.equal(E.restoreGame(JSON.stringify(corrupt)), null);
  }
});

test('full seasons allow one or two recent-model announcements and bots obey retired-plan restrictions', () => {
  for (const seed of [511, 512, 513]) {
    let g = E.createGame(seed, 42);
    while (g.phase !== 'over') {
      g = E.endDay(g);
      g = E.nextDay(g);
      assert.ok(E.restoreGame(JSON.stringify(g)));
      if (g.phase === 'plan') for (const p of g.players.slice(1)) {
        const a = E.chooseAction(g, p.id);
        assert.equal(E.actionError(g, p.id, a), null);
      }
    }
    assert.ok(g.platform.stage >= 3 && g.platform.stage <= 5);
    assert.ok(g.platform.proDeadline !== null);
  }
});
