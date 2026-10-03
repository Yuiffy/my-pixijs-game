import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const account = g => g.players[0].accounts[0];

test('large bank inventories survive awards and save restore without clipping', () => {
  let g = E.createGame(701);
  account(g).banks = Array(100).fill(31);
  g.event = { ...E.EVENTS.find(e => e.id === 'promise') };
  g.resetDeck = ['bank'];
  g = E.endDay(g);
  assert.equal(account(g).banks.length, 101);
  assert.equal(g.receipt.gains[0].gained, 1);
  assert.equal(g.receipt.gains[0].unused, 0);
  assert.deepEqual(E.restoreGame(JSON.stringify(g)), g);
  g = E.nextDay(g);
  account(g).banks = [34, 5, ...Array(100).fill(32)];
  account(g).quota = 0;
  g = E.act(g, { type: 'bank', account: account(g).id });
  assert.equal(account(g).banks.length, 101);
  assert.ok(!account(g).banks.includes(5));
  g.day = 31; g.phase = 'reveal'; g.platform.nextRelease = 100; g.events = ['quiet'];
  g = E.nextDay(g);
  assert.deepEqual(account(g).banks, [34]);
  assert.equal(g.players[0].expired, 100);
});

test('legacy v5 migration retains assets and announced event but replaces future supply decks once', () => {
  const old = E.createGame(702);
  delete old.supplyRules;
  old.day = 4;
  old.event = { ...E.EVENTS.find(e => e.id === 'gift') };
  old.events = ['gift', 'promise']; old.resetDeck = ['bank', 'bank'];
  account(old).banks = Array(8).fill(34);
  const g = E.restoreGame(JSON.stringify(old));
  assert.ok(g);
  assert.deepEqual(g.players, old.players);
  assert.deepEqual(g.event, old.event);
  assert.equal(g.rng, old.rng);
  assert.deepEqual(g.resetDeck, []);
  assert.deepEqual(g.events, []);
  assert.equal(g.supplyRules, 1);
  assert.deepEqual(E.restoreGame(JSON.stringify(g)), g);
});

test('reset deck deals nine normal resets and one voucher per complete shuffled cycle', () => {
  let g = E.createGame(703);
  for (let cycle = 0; cycle < 3; cycle++) {
    const results = [];
    for (let n = 0; n < 10; n++) {
      g.phase = 'plan'; g.minute = 480;
      g.event = { ...E.EVENTS.find(e => e.id === 'promise') };
      g = E.endDay(g); results.push(g.receipt.kind);
    }
    assert.equal(results.filter(x => x === 'bank').length, 1);
    assert.equal(results.filter(x => x === 'normal').length, 9);
    assert.equal(g.resetDeck.length, 0);
  }
});

test('opening retains a guaranteed sprint window and a teaching voucher without a day-four grant', () => {
  let g = E.createGame(704);
  assert.equal(account(g).banks.length, 1);
  const cards = [];
  for (let n = 0; n < 4; n++) {
    cards.push(g.event.id);
    if (n === 1) assert.equal(g.event.chance, 100);
    g = E.nextDay(E.endDay(g));
  }
  assert.deepEqual(cards, ['riddle', 'promise', 'quiet', 'sale']);
});

test('seeded calendars keep bonus vouchers scarce while preserving reset opportunities', () => {
  for (const length of [21, 42]) {
    let banks = 0, normals = 0, quietDays = 0;
    const seasons = 256;
    for (let seed = 1; seed <= seasons; seed++) {
      let g = E.createGame(seed * 7919, length);
      for (let day = 1; day <= length; day++) {
        assert.notEqual(g.event.effect, 'bank');
        assert.ok(!g.events.includes('gift'));
        if (g.event.effect === 'instant') normals++;
        // News replaces quiet slots, but has no morning or night gift of its own.
        if (g.event.effect === 'industry') assert.equal(g.event.chance, 0);
        if (g.event.effect === 'quiet' || g.event.effect === 'industry') quietDays++;
        // Sample event supply only; skip development so bot spending never obscures grants.
        g.minute = 480;
        g = E.endDay(g);
        banks += Number(g.receipt.kind === 'bank');
        normals += Number(g.receipt.kind === 'normal');
        g = E.nextDay(g);
      }
    }
    const stats = { days: length, seasons, bonusBankGrants: banks / seasons, forcedResets: normals / seasons, quietDays: quietDays / seasons };
    console.log('Supply calendar:', JSON.stringify(stats));
    assert.ok(stats.bonusBankGrants > 0.2 && stats.bonusBankGrants < (length === 21 ? 1 : 1.5));
    assert.ok(stats.forcedResets > length / 5 && stats.forcedResets < length / 2);
    assert.ok(stats.quietDays > length / 4);
  }
});
