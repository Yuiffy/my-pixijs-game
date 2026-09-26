import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const human = g => g.players[0];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const studio = (g, threads, accountPolicy = 'soon-reset', preferredAccount = human(g).accounts[0].id) =>
  E.act(g, { type: 'studio', threads, accountPolicy, preferredAccount });

test('one click can work the whole day; claiming automatically queues without advancing time', () => {
  let g = E.createGame(401, 21);
  assert.equal(human(g).lanes.length, 0);
  g = E.act(g, { type: 'claim', project: g.market[0].id });
  assert.equal(g.minute, 0);
  assert.equal(human(g).energy, 9);
  assert.equal(human(g).lanes.length, 1);
  assert.equal(human(g).lanes[0].projects.length, 2);
  g = E.endDay(g);
  assert.equal(g.phase, 'reveal');
  assert.equal(g.minute, 480);
  assert.ok(human(g).projects.some(j => j.work > 0) || human(g).shipped.length > 0);
  g = E.nextDay(g);
  assert.equal(g.day, 2);
  assert.equal(g.studio.threads, 1);
});

test('requested thread count redistributes work and charges attention only when a lane starts', () => {
  let g = E.createGame(402);
  for (let i = 0; i < 2; i++) g = E.act(g, { type: 'claim', project: g.market[0].id });
  for (const j of human(g).projects) j.need = 500;
  assert.equal(human(g).energy, 8);
  g = studio(g, 3);
  assert.equal(human(g).energy, 4);
  assert.equal(human(g).lanes.length, 3);
  assert.equal(new Set(human(g).lanes.flatMap(l => l.projects)).size, 3);
  g = studio(g, 1);
  assert.equal(human(g).energy, 4);
  assert.equal(human(g).lanes.filter(l => l.projects.length).length, 1);
  assert.equal(human(g).lanes[0].projects.length, 3);
  g = studio(g, 0);
  assert.equal(human(g).lanes.filter(l => l.projects.length).length, 0);
  const before = human(g).projects.map(j => j.work);
  g = E.advanceMinutes(g, 60);
  assert.deepEqual(human(g).projects.map(j => j.work), before);
  g = studio(g, 3);
  assert.equal(human(g).energy, 4);
  assert.equal(human(g).lanes.filter(l => l.enabled).length, 3);
  g = E.nextDay(E.endDay(g));
  assert.equal(human(g).energy, 6);
  g = E.advanceMinutes(g, 1);
  assert.equal(human(g).lanes.filter(l => l.enabled).length, 3);
  assert.equal(human(g).energy, 6);
});

test('unfunded attention leaves queued work visible and starts it on the next morning', () => {
  let g = E.createGame(408);
  g = studio(g, 1);
  assert.equal(human(g).energy, 10);
  g = E.act(g, { type: 'claim', project: g.market[0].id });
  g = studio(g, 2);
  g = studio(g, 0);
  g = studio(g, 2);
  assert.equal(human(g).energy, 7);
  g = E.act(g, { type: 'claim', project: g.market[0].id });
  g = studio(g, 3);
  assert.equal(human(g).energy, 4);
  for (let i = 0; i < 3; i++) g = E.act(g, { type: 'claim', project: g.market[0].id });
  for (const j of human(g).projects) j.need = 500;
  g = studio(g, 4);
  assert.equal(human(g).energy, 1);
  assert.equal(E.laneStatus(g, human(g), human(g).lanes[3]), '等待精力');
  g = E.act(g, { type: 'configure', development: { model: 'luna', effort: 'medium', turbo: false } });
  g = E.nextDay(E.endDay(g));
  g = E.advanceMinutes(g, 1);
  assert.equal(E.laneStatus(g, human(g), human(g).lanes[3]), '开发中');
});

test('five account policies route paid work by their published rule', () => {
  const base = E.createGame(403);
  let g = E.act(base, { type: 'buy', tier: 20 });
  g = E.act(g, { type: 'buy', tier: 20 });
  const [a, b, c] = human(g).accounts;
  a.quota = 10; a.nextReset = 10; a.paidUntil = 20;
  b.quota = 8; b.nextReset = 2; b.paidUntil = 30;
  c.quota = 1; c.nextReset = 8; c.paidUntil = 50;
  for (const [policy, expected] of [
    ['preferred', a.id], ['soon-reset', b.id], ['drain', c.id],
    ['late-expiry', c.id], ['balanced', a.id],
  ]) {
    const out = studio(g, 1, policy, a.id);
    assert.equal(human(out).lanes[0].account, expected, policy);
    assert.equal(out.minute, 0);
  }
});

test('parallel balance spreads accounts, while preferred switches at fractional exhaustion', () => {
  let g = E.createGame(404);
  g = E.act(g, { type: 'buy', tier: 20 });
  g = E.act(g, { type: 'claim', project: g.market[0].id });
  g = studio(g, 2, 'balanced');
  assert.equal(new Set(human(g).lanes.map(l => l.account)).size, 2);

  let fallback = E.createGame(405);
  fallback = E.act(fallback, { type: 'buy', tier: 20 });
  const [first, second] = human(fallback).accounts;
  first.quota = 0.001;
  fallback = studio(fallback, 1, 'preferred', first.id);
  const once = E.advanceMinutes(fallback, 60);
  const split = E.advanceMinutes(E.advanceMinutes(fallback, 30), 30);
  assert.deepEqual(once, split);
  near(human(once).projects[0].work, 10.8);
  near(human(once).accounts[0].quota, 0);
  near(human(once).accounts[1].quota, 24 - 10.8 * 0.16 + 0.001);
  assert.equal(human(once).lanes[0].account, second.id);
});

test('v3 live saves move to automatic studio without losing partial work or quota', () => {
  let g = E.createGame(406);
  g = E.act(g, { type: 'dispatch', lane: null, projects: [human(g).projects[0].id], account: human(g).accounts[0].id, model: 'sol', effort: 'medium', turbo: false });
  g = E.advanceMinutes(g, 37);
  const old = structuredClone(g);
  old.version = 3;
  delete old.studio;
  const migrated = E.restoreGame(JSON.stringify(old));
  assert.ok(migrated);
  assert.equal(migrated.version, 4);
  assert.equal(migrated.studio.mode, 'auto');
  assert.equal(migrated.studio.threads, 1);
  assert.equal(migrated.minute, g.minute);
  near(human(migrated).projects[0].work, human(g).projects[0].work);
  near(human(migrated).accounts[0].quota, human(g).accounts[0].quota);
  assert.deepEqual(E.restoreGame(JSON.stringify(migrated)), migrated);
});

test('v3 migration preserves paused work and uses the running lane configuration', () => {
  let g = E.createGame(407);
  const id = human(g).projects[0].id;
  const account = human(g).accounts[0].id;
  g = E.act(g, { type: 'dispatch', lane: null, projects: [id], account, model: 'astra', effort: 'high', turbo: true });
  const old = structuredClone(g);
  old.version = 3;
  delete old.studio;
  old.development = { ...E.DEFAULT_DEVELOPMENT };
  const migrated = E.restoreGame(JSON.stringify(old));
  assert.deepEqual(migrated.development, { model: 'astra', effort: 'high', turbo: true });
  assert.equal(migrated.studio.threads, 1);
  old.players[0].lanes[0].enabled = false;
  const paused = E.restoreGame(JSON.stringify(old));
  assert.equal(paused.studio.threads, 0);
  assert.equal(human(paused).energy, human(old).energy);
  const after = E.advanceMinutes(paused, 1);
  assert.equal(human(after).projects[0].work, human(paused).projects[0].work);
});
