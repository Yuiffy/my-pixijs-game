import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const enginePath = fileURLToPath(new URL('../../src/components/hypeHarbor/engine.ts', import.meta.url));
const source = ts.transpileModule(readFileSync(enginePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = new Module(enginePath);
compiled.filename = enginePath;
compiled.paths = Module._nodeModulePaths(path.dirname(enginePath));
compiled._compile(source, enginePath);
const E = compiled.exports;
const players = n => Array.from({ length: n }, (_, i) => ({ name: `玩家${i + 1}`, ai: i !== 0 }));
const start = (n = 3, seed = 42) => E.launch(E.createGame(players(n), 3, seed));
const action = (s, kind, boat = 0, insured = false) => E.takeAction(s, { kind, boat, insured });
const asTurn = (s, turn = 0) => ({ ...s, phase: 'placing', turn, placed: 0 });
const finishFixture = s => E.continueGame({ ...s, phase: 'reveal', beat: 3 });

test('three four-person presets have complete art and exactly one resting member', () => {
  assert.deepEqual(E.ROSTERS[0].members, ['sui', 'nagisa', 'shiori', 'mizuki']);
  for (const preset of E.ROSTERS) {
    const s = E.createGame(players(3), 3, 42, preset.members);
    assert.equal(s.roster.length, 4);
    assert.equal(s.boats.length, 3);
    assert.equal(new Set(s.boats.map(b => b.streamer)).size, 3);
    assert.equal(s.roster.filter(id => !s.boats.some(b => b.streamer === id)).length, 1);
    assert.ok(E.restoreGame(JSON.stringify(s)));
  }
  for (const streamer of E.STREAMERS) assert.ok(existsSync(path.resolve('public', `.${streamer.portrait}`)), streamer.name);
  assert.throws(() => E.createGame(players(2), 3, 42, ['sui', 'sui', 'nagisa', 'mizuki']));
});

test('producer swaps seats, cannot duplicate streamers or leave the selected pool', () => {
  const s = E.createGame(players(3));
  const swapped = E.setRoster(s, 0, 'nagisa');
  assert.deepEqual(swapped.boats.map(b => b.streamer), ['nagisa', 'sui', 'shiori']);
  const resting = E.setRoster(swapped, 2, 'mizuki');
  assert.ok(!resting.boats.some(b => b.streamer === 'shiori'));
  assert.equal(E.setRoster(resting, 0, 'hazel'), resting);
  const launched = E.launch(resting);
  assert.equal(E.setRoster(launched, 0, 'sui'), launched);
  assert.equal(s.boats[0].streamer, 'sui', 'input is immutable');
});

test('three preparation points are neither duplicated nor lost', () => {
  let s = E.createGame(players(3));
  s = E.setWarmup(s, 0, 3);
  assert.equal(E.setWarmup(s, 1, 1), s);
  assert.equal(E.setWarmup(s, 0, -1), s);
  s = E.launch(s);
  assert.deepEqual(s.boats.map(b => b.position), [6, 3, 3]);
  assert.equal(s.boats.reduce((sum, b) => sum + b.position, 0), 12);
  assert.deepEqual(start().boats.map(b => b.position), [4, 4, 4]);
});

test('one action per player per beat, late-seat prices and premium accounting', () => {
  let s = start();
  s = action(s, 'support', 0, true);
  assert.equal(s.players[0].cash, 24);
  assert.deepEqual(s.boats[0].seats[0], { player: 0, cost: 4, insured: true });
  assert.equal(s.turn, 1);
  s = action(s, 'support', 0);
  assert.equal(s.players[1].cash, 25);
  s = action(s, 'work');
  assert.equal(s.phase, 'sailing');
  assert.equal(action(s, 'work'), s);
  const revealed = E.roll(s);
  assert.equal(revealed.phase, 'reveal');
  const next = E.continueGame(revealed);
  assert.equal(next.beat, 2);
  assert.equal(next.turn, 0);
  assert.equal(E.actionCost(next, { kind: 'support', boat: 2 }), 6);
});

test('failed insurance refunds only principal and settlement cannot repeat', () => {
  let s = start();
  s = action(s, 'support', 0, true);
  s = action(s, 'work');
  s = action(s, 'support', 1);
  s.boats[0].position = 14; s.boats[1].position = 15;
  s = finishFixture(s);
  assert.deepEqual(s.players.map(p => p.cash), [28, 31, 38]);
  assert.equal(s.prices.sui, 5);
  assert.equal(s.prices.nagisa, 9);
  assert.equal(s.prices.mizuki, 6);
  assert.equal(s.results[0].payments.find(p => p.player === 0).amount, 4);
  assert.deepEqual(E.continueGame(s).players.map(p => p.cash), [28, 31, 38]);
});

test('successful insured support pays once', () => {
  let s = start(); s = action(s, 'support', 0, true); s = action(s, 'work');
  s.boats[0].position = 15; s = finishFixture(s);
  assert.equal(s.players[0].cash, 36); assert.equal(s.players[1].cash, 31);
});

test('later insurance cannot be stacked or bought for someone else', () => {
  let s = action(start(), 'support', 0);
  assert.ok(E.actionProblem(s, { kind: 'insure', boat: 0 }));
  s = action(asTurn(s), 'insure', 0);
  assert.equal(s.players[0].cash, 24);
  assert.equal(s.boats[0].seats[0].insured, true);
  assert.equal(action(asTurn(s), 'insure', 0).players[0].cash, 24);
  s.boats[0].position = 14; s = finishFixture(s);
  assert.equal(s.players[0].cash, 28);
});

test('scarce seats, cash recovery, boost and arrival lock prevent invalid actions', () => {
  let s = start(4);
  s = action(s, 'support'); s = action(s, 'support'); s = action(s, 'support');
  assert.equal(E.actionProblem(s, { kind: 'support', boat: 0 }), '三个应援席已满');
  s = action(s, 'clip');
  assert.ok(E.actionProblem(asTurn(s, 3), { kind: 'clip', boat: 0 }));
  let empty = start(); empty.players[0].cash = 0;
  assert.equal(action(empty, 'support'), empty);
  empty = action(empty, 'work'); assert.equal(empty.players[0].cash, 1);
  s = start(); s.boats[0].position = 14;
  s = action(s, 'boost'); assert.equal(s.boats[0].position, 15);
  for (const kind of ['support', 'share', 'boost', 'smear', 'insure']) assert.ok(E.actionProblem(s, { kind, boat: 0 }));
});

test('negative traffic costs an action, respects both boundaries and survives reload', () => {
  const s = start(); s.boats[0].position = 14;
  const moved = action(s, 'smear');
  assert.equal(moved.boats[0].position, 12);
  assert.equal(s.boats[0].position, 14, 'input is immutable');
  assert.equal(moved.players[0].cash, 28);
  assert.equal(moved.placed, 1); assert.equal(moved.turn, 1);
  assert.equal(moved.phase, 'placing'); assert.equal(moved.seed, s.seed);
  assert.deepEqual(E.restoreGame(JSON.stringify(moved)), moved);
  const edge = start(); edge.boats[0].position = 1;
  const floor = action(edge, 'smear');
  assert.equal(floor.boats[0].position, 0);
  assert.match(floor.log[0], /后退 1 格/);
  assert.equal(action(floor, 'smear'), floor, 'cannot charge for an impossible move');
  const arrived = start(); arrived.boats[0].position = 15;
  assert.equal(action(arrived, 'smear'), arrived, 'completed projects stay completed');
  const poor = start(); poor.players[0].cash = 1;
  assert.equal(action(poor, 'smear'), poor);
  assert.ok(E.availableActions(s).some(a => a.kind === 'smear' && a.boat === 0));
});

test('negative traffic odds agree with legal dice outcomes and benefit recognition or clip positions', () => {
  for (const position of [0, 1, 3, 12, 14]) for (const event of [0, 1, 4]) {
    const s = start(); s.beat = 3; s.event = event; s.boats[0].position = position;
    const wind = E.EVENTS[event].wind[0];
    const wins = [1, 2, 3, 4, 5, 6].filter(die => Math.max(0, position - 2) + Math.max(1, die + wind) >= 15).length;
    assert.ok(Math.abs(E.successChance(s, 0, -2) - wins / 6) < 1e-10);
  }
  const s = start(); s.beat = 3; s.boats[0].position = 14; s.boats[1].position = 15; s.boats[2].position = 15;
  const moved = action(s, 'smear');
  assert.ok(E.recognitionChance(moved, 0) > E.recognitionChance(s, 0));
  assert.ok(E.clipForecast(moved).jackpot > E.clipForecast(s).jackpot);
  assert.equal(moved.clipQueue.length, 0, 'moving only changes future dice chances');
});

test('AI can use negative traffic against rival investments while protecting its own shares', () => {
  const s = start(); s.beat = 3; s.players[0].boughtThisRound = true;
  s.boats[0].position = 11; s.boats[1].position = 15; s.boats[2].position = 15;
  s.boats[0].seats = [{ player: 1, cost: 4, insured: false }];
  s.players[1].shares.sui = 8;
  assert.equal(E.chooseAiAction(s).action.kind, 'smear');
  assert.deepEqual(E.chooseAiAction(s), E.chooseAiAction({ ...s, seed: 998877 }));
  s.players[1].shares.sui = 0; s.players[0].shares.sui = 8;
  assert.equal(E.chooseAiAction(s).action.kind, 'boost');
});

test('shares retain value at purchase, revalue at settlement and persist across voyages', () => {
  let s = action(start(), 'share', 0);
  assert.equal(E.wealth(s, s.players[0]), 30);
  assert.ok(E.actionProblem(asTurn(s), { kind: 'share', boat: 1 }));
  s.boats[0].position = 15; s = finishFixture(s);
  assert.equal(E.wealth(s, s.players[0]), 33);
  s = E.continueGame(s);
  assert.equal(s.players[0].shares.sui, 1);
  assert.equal(s.players[0].boughtThisRound, false);
  assert.equal(s.producer, 1); assert.equal(s.boats[0].seats.length, 0);
});

test('recognition seats pays every satisfied threshold for zero, one, two or three misses', () => {
  for (let misses = 0; misses <= 3; misses++) {
    let s = start();
    for (let recognition = 0; recognition < 3; recognition++) s = E.takeAction(s, { kind: 'recognition', boat: 0, recognition });
    assert.deepEqual(s.players.map(p => p.cash), [27, 28, 29]);
    s.boats.forEach((b, i) => { b.position = i < misses ? 14 : 15; });
    s = finishFixture(s);
    assert.deepEqual(s.players.map(p => p.cash), [27 + (misses >= 1 ? 5 : 0), 28 + (misses >= 2 ? 6 : 0), 29 + (misses >= 3 ? 8 : 0)]);
    assert.equal(s.results[0].payments.filter(p => p.label.startsWith('认知民')).length, 3);
    assert.ok(E.restoreGame(JSON.stringify(s)), 'including the new payouts');
    const next = E.continueGame(s);
    assert.deepEqual(next.recognition, [null, null, null]);
    assert.deepEqual(next.players.map(p => p.cash), s.players.map(p => p.cash), 'no duplicate payout');
  }
});

test('recognition seats is independent of boat selection, exclusive, turn-limited and affordable', () => {
  let s = start(); s.boats[0].position = 15;
  const a = { kind: 'recognition', boat: 0, recognition: 0 };
  assert.equal(E.actionProblem(s, a), null, 'the selected boat has arrived but others can still miss');
  const claimed = E.takeAction(s, a);
  assert.equal(s.recognition[0], null, 'input is immutable');
  assert.equal(claimed.turn, 1); assert.equal(claimed.placed, 1);
  assert.ok(E.actionProblem(claimed, a)); assert.equal(E.takeAction(claimed, a), claimed);
  assert.equal(E.actionCost({ ...s, beat: 2 }, a), 4);
  assert.equal(E.actionCost({ ...s, beat: 3 }, a), 5);
  s.players[0].cash = 0;
  assert.equal(E.takeAction(s, a), s);
  assert.ok(E.actionProblem(s, { ...a, recognition: -1 }));
  assert.ok(E.actionProblem(s, { ...a, recognition: 1.5 }));
  s = start(); s.boats.forEach(b => { b.position = 15; });
  assert.ok(E.actionProblem(s, a), 'no wasting money on an impossible outcome');
});

test('recognition seats joint probability follows remaining dice and thresholds, including boost', () => {
  const s = start(); s.beat = 3; s.boats.forEach(b => { b.position = 11; });
  [7 / 8, 1 / 2, 1 / 8].forEach((expected, i) => assert.ok(Math.abs(E.recognitionChance(s, i) - expected) < 1e-10));
  assert.ok(E.recognitionChance(s, 0, 0) < E.recognitionChance(s, 0), 'helping a boat reduces global miss odds');
  s.boats[0].position = 15;
  assert.ok(Math.abs(E.recognitionChance(s, 0) - 3 / 4) < 1e-10);
  assert.equal(E.recognitionChance(s, 2), 0);
  s.phase = 'reveal';
  assert.equal(E.recognitionChance(s, 0), 1); assert.equal(E.recognitionChance(s, 1), 1);
});

test('AI competes for recognition seats positions and accounts for its own recognition seats before boosting', () => {
  let s = start(); s.beat = 3; s.boats.forEach(b => { b.position = 0; });
  assert.equal(E.chooseAiAction(s).action.kind, 'recognition');
  assert.equal(E.chooseAiAction(s).action.recognition, 2);
  s = start(); s.beat = 3;
  s.boats[0].position = 11; s.boats[1].position = 15; s.boats[2].position = 15;
  s.boats[0].seats = [{ player: 0, cost: 4, insured: false }];
  s.players[0].shares.sui = 0; s.players[0].boughtThisRound = true;
  assert.equal(E.chooseAiAction(s).action.kind, 'boost');
  s.recognition[0] = { player: 0, cost: 3 };
  assert.equal(E.chooseAiAction(s).action.kind, 'work');
});

test('price floor and eight-share supply cap', () => {
  let s = start(); s.prices.sui = 3; s.players[1].shares.sui = 8;
  assert.equal(E.actionProblem(s, { kind: 'share', boat: 0 }), '这位主播的八股已售完');
  s = finishFixture(s); assert.equal(s.prices.sui, 3);
});

const twoClippers = (n = 3) => {
  let s = start(n); s = action(s, 'clip'); s = action(s, 'clip');
  return s;
};
const secondSpotlight = s => {
  s.phase = 'reveal'; s.beat = 2;
  s.boats.forEach((b, i) => { b.position = i === 0 ? 13 : 6; b.die = 4; });
  return E.continueGame(s);
};

test('recognition replaces rescue, has modest returns, and simple work cannot dominate every choice', () => {
  const s = start();
  assert.ok(E.actionProblem(s, { kind: 'rescue', boat: 0 }));
  assert.ok(E.actionProblem(s, { kind: 'yard', boat: 0, yard: 0 }));
  assert.deepEqual(E.RECOGNITION_SPACES.map(x => x.payout), [5, 6, 8]);
  assert.equal(E.RECOGNITION_SPACES[0].payout - E.RECOGNITION_SPACES[0].cost, 2);
  assert.equal(E.WORK_PAYOUT, 1);
  assert.ok(E.recognitionChance(s, 0) * 5 - 3 > E.WORK_PAYOUT);
  assert.ok(E.recognitionChance(s, 0) * 5 - 3 < E.successChance(s, 0) * 12 - 4);
});

test('two clip positions are exclusive, one entry per player, with no seed peeking', () => {
  const s = twoClippers();
  assert.deepEqual(s.players.map(p => p.cash), [28, 28, 30]);
  assert.ok(E.actionProblem(s, { kind: 'clip', boat: 0 }));
  assert.deepEqual(E.clipForecast(s), E.clipForecast({ ...s, seed: 998877 }));
  const old = start(); old.boats.forEach(b => { b.position = 15; });
  assert.ok(E.actionProblem(old, { kind: 'clip', boat: 0 }));
});

test('second-roll 13 offers boarding in claim order; join uses an empty seat and preserves the normal turn', () => {
  let s = twoClippers(); s.boats[0].seats = [{ player: 2, cost: 4, insured: false }];
  s = secondSpotlight(s);
  assert.equal(s.phase, 'spotlight'); assert.equal(s.turn, 0);
  assert.deepEqual(E.clipBoardingOptions(s), [0]);
  assert.ok(E.restoreGame(JSON.stringify(s)));
  assert.equal(E.resolveClip(s, 1), s, 'only exact 13 is eligible');
  s = E.resolveClip(s, 0);
  assert.equal(s.phase, 'spotlight'); assert.equal(s.turn, 1);
  assert.equal(s.boats[0].seats.at(-1).cost, 0);
  assert.equal(s.boats[0].seats.at(-1).source, 'clip');
  s = E.resolveClip(s, 0);
  assert.equal(s.boats[0].seats.length, 3);
  assert.equal(s.phase, 'placing'); assert.equal(s.beat, 3); assert.equal(s.turn, s.producer);
  assert.deepEqual(s.clippers, [null, null]);
  assert.ok(E.actionProblem(s, { kind: 'clip', boat: 0 }), 'cannot enter again after free boarding');
  assert.ok(E.actionProblem(s, { kind: 'insure', boat: 0 }), 'zero-principal seats cannot buy pointless insurance');
  assert.ok(E.restoreGame(JSON.stringify(s)));
  s.boats[0].position = 15; s = finishFixture(s);
  assert.equal(s.players[0].cash, 40); assert.equal(s.players[1].cash, 40);
});

test('last empty seat goes to first clipper; full boats do not displace their supporters', () => {
  let s = twoClippers(4);
  s.boats[0].seats = [2, 3].map(player => ({ player, cost: 4, insured: false }));
  s = secondSpotlight(s); s = E.resolveClip(s, 0);
  assert.equal(s.phase, 'placing'); assert.equal(s.clippers[1].player, 1);
  assert.deepEqual(s.boats[0].seats.map(x => x.player), [2, 3, 0]);
  s = start(4); s = action(s, 'clip');
  s.boats[0].seats = [1, 2, 3].map(player => ({ player, cost: 4, insured: false }));
  s = secondSpotlight(s);
  assert.equal(s.phase, 'placing'); assert.equal(s.clippers[0].player, 0);
});

test('holding skips boarding to preserve the final clip opportunity; first roll and boost cannot trigger it', () => {
  let s = secondSpotlight(twoClippers());
  s = E.resolveClip(s, null); assert.equal(s.turn, 1); assert.equal(s.clippers[0].player, 0);
  s = E.resolveClip(s, 0); assert.equal(s.phase, 'placing');
  s.boats[0].position = 15; s.boats[1].position = 13; s = finishFixture(s);
  assert.equal(s.players[0].cash, 36); assert.equal(s.players[1].cash, 40);
  let early = start(); early = action(early, 'clip');
  early.phase = 'reveal'; early.boats[0].position = 13;
  early = E.continueGame(early); assert.equal(early.phase, 'placing'); assert.equal(early.beat, 2);
  early.boats[0].position = 11;
  early = action(early, 'boost'); assert.equal(early.boats[0].position, 13); assert.equal(early.phase, 'placing');
});

test('third-roll clips split a fixed pool, miss for zero, and never pay twice', () => {
  for (const count of [0, 1, 2, 3]) {
    let s = twoClippers(); s.boats.forEach((b, i) => { b.position = i < count ? 13 : 15; });
    s = finishFixture(s);
    const payments = s.results[0].payments.filter(p => p.label.startsWith('切片佬'));
    assert.deepEqual(payments.map(p => p.amount), [count * 4, count * 4]);
    assert.equal(payments.reduce((sum,p) => sum + p.amount,0), count * E.CLIP_PAYOUT);
    assert.ok(E.restoreGame(JSON.stringify(s)));
    const next = E.continueGame(s);
    assert.deepEqual(next.clippers, [null, null]); assert.deepEqual(next.clipEntrants, []);
    assert.deepEqual(next.players.map(p => p.cash), s.players.map(p => p.cash));
  }
  let solo = action(start(), 'clip'); solo.boats.forEach(b => { b.position = 13; });
  solo = finishFixture(solo); assert.equal(solo.players[0].cash, 52); assert.ok(E.restoreGame(JSON.stringify(solo)));
});

test('saved game migration refunds only unresolved old investments and preserves cash, shares and turns', () => {
  const legacy = s => {
    s.version = 1; delete s.recognition; delete s.clippers; delete s.clipQueue; delete s.clipEntrants;
    s.boats.forEach(b => { b.rescue = null; }); s.yard = [null,null,null]; return s;
  };
  const s = legacy(action(start(), 'share'));
  s.boats[1].rescue = { player: 1, cost: 3 }; s.players[1].cash -= 3;
  s.yard[0] = { player: 2, cost: 3 }; s.players[2].cash -= 3;
  const migrated = E.restoreGame(JSON.stringify(s));
  assert.equal(migrated.version, E.SAVE_VERSION);
  assert.deepEqual(migrated.players.map(p => p.cash), [24,30,30]);
  assert.equal(migrated.turn, s.turn); assert.equal(migrated.players[0].shares.sui, 1);
  assert.deepEqual(migrated.recognition, [null,null,null]);
  assert.deepEqual(E.restoreGame(JSON.stringify(migrated)), migrated, 'refund runs once');
  const settled = legacy(finishFixture(start()));
  settled.yard[0] = { player: 0, cost: 3 };
  assert.equal(E.restoreGame(JSON.stringify(settled)).players[0].cash, 30, 'already settled claims are not refunded');
  s.yard[0].player = 9; assert.equal(E.restoreGame(JSON.stringify(s)), null);
});

test('exact odds account for reveal phases, wind and guaranteed outcomes', () => {
  const s = start(); s.beat = 3; s.boats[0].position = 9;
  assert.ok(Math.abs(E.successChance(s, 0) - 1 / 6) < 1e-10);
  assert.ok(Math.abs(E.successChance(s, 0, 2) - 3 / 6) < 1e-10);
  s.event = 1; assert.ok(Math.abs(E.successChance(s, 0) - 2 / 6) < 1e-10);
  s.event = 4; assert.equal(E.successChance(s, 0), 0);
  s.boats[0].position = 14; assert.ok(Math.abs(E.successChance(s, 0) - 1) < 1e-10);
  s.phase = 'reveal'; assert.equal(E.successChance(s, 0), 0);
  s.boats[0].position = 15; assert.equal(E.successChance(s, 0), 1);
});

test('seeded dice replay; AI decisions cannot peek at the future seed', () => {
  let s = start();
  assert.deepEqual(E.chooseAiAction(s), E.chooseAiAction({ ...s, seed: 980001 }));
  for (let i = 0; i < 3; i++) s = action(s, 'work');
  assert.deepEqual(E.roll(s), E.roll(E.restoreGame(JSON.stringify(s))));
  assert.notDeepEqual(E.roll(s).boats.map(b => b.die), E.roll({ ...s, seed: 213 }).boats.map(b => b.die));
});

test('corrupt, partial and unsafe saved games are rejected', () => {
  for (const bad of ['', 'nope', 'null', '{}', '{"version":1}']) assert.equal(E.restoreGame(bad), null);
  for (const mutate of [
    s => { s.players[0].cash = -1; }, s => { s.boats[0].position = 16; },
    s => { s.roster = ['sui']; }, s => { s.boats[1].streamer = 'sui'; },
    s => { s.clippers[0] = { player: 7, cost: 2 }; },
    s => { s.results = [{}]; }, s => { s.phase = 'finished'; }, s => { s.players[0].shares = {}; },
  ]) { const s = start(); mutate(s); assert.equal(E.restoreGame(JSON.stringify(s)), null); }
});

test('270 seeded AI matches finish and survive every save boundary', () => {
  const actionCounts = {}; let wins = 0; let misses = 0;
  for (const preset of E.ROSTERS) for (const n of [2, 3, 4]) for (let seed = 1; seed <= 30; seed++) {
    let s = E.createGame(players(n), seed % 2 ? 3 : 5, seed * 1337, preset.members);
    let transitions = 0;
    while (s.phase !== 'finished' && transitions++ < 160) {
      if (s.phase === 'preparing') s = E.prepareAi(s);
      else if (s.phase === 'placing') {
        const chosen = E.chooseAiAction(s).action;
        actionCounts[chosen.kind] = (actionCounts[chosen.kind] || 0) + 1;
        assert.equal(E.actionProblem(s, chosen), null);
        s = E.takeAction(s, chosen);
      } else if (s.phase === 'spotlight') s = E.resolveClip(s, E.chooseAiClip(s));
      else if (s.phase === 'sailing') s = E.roll(s);
      else s = E.continueGame(s);
      assert.ok(E.restoreGame(JSON.stringify(s)), `restore ${preset.name}/${n}/${seed}/${s.phase}`);
      assert.ok(s.players.every(p => p.cash >= 0));
      assert.equal(s.producer, (s.round - 1) % n);
    }
    assert.equal(s.phase, 'finished'); assert.equal(s.results.length, s.rounds);
    for (const result of s.results) for (const b of result.boats) { if (b.success) wins++; else misses++; }
  }
  assert.ok(wins > 0 && misses > 0);
  for (const kind of ['support', 'share', 'clip', 'recognition', 'boost', 'smear', 'work']) assert.ok(actionCounts[kind] > 0, kind);
  console.log(JSON.stringify({ matches: 270, successfulBoats: wins, failedBoats: misses, actionCounts }));
});
