import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const rules = await loadTypescriptModule('src/components/autoChessGame/multiplayer/match.ts');
const rooms = await loadTypescriptModule('src/components/autoChessGame/multiplayer/room.ts');
const config = (mode = 'coop', seats = 2, aiCount = 0) => ({ mode, seats, aiCount, prepSeconds: 90, isPublic: false });
const match = (mode = 'coop', seats = 2, seed = 927) => rules.createMatch(config(mode, seats), Array.from({ length: seats }, (_, i) => ({ name: `P${i}`, ai: false, joined: true })), seed, 100);
const give = (m, seat, ids, star = 1) => {
  m.players[seat].snapshot.state.board.fill(null);
  ids.forEach((id, i) => { m.players[seat].snapshot.state.board[i] = { uid: i + 10, id, star }; });
};
test('valid mode populations and AI bounds', () => {
  for (let n = 1; n <= 8; n++) {
    assert.equal(rules.validConfig(config('coop', n)), n <= 4);
    assert.equal(rules.validConfig(config('versus', n)), n >= 2);
  }
  for (const c of [config('coop', 0), config('versus', 9), config('coop', 2, 2), { ...config(), prepSeconds: NaN }, { ...config(), mode: 'anything' }]) assert.equal(rules.validConfig(c), false);
});
test('circle schedule covers each real participant once, rotates byes, never self-pairs', () => {
  for (let count = 2; count <= 8; count++) {
    const ids = Array.from({ length: count }, (_, i) => i);
    const opponents = new Set(); const byes = new Set();
    for (let round = 1; round <= (count % 2 ? count : count - 1); round++) {
      const pairs = rules.pairPlayers(ids, round);
      const visits = pairs.flatMap(p => p.ghost ? [p.a] : [p.a, p.b]).sort((a, b) => a - b);
      assert.deepEqual(visits, ids);
      assert.equal(pairs.filter(p => p.ghost).length, count % 2);
      pairs.forEach(p => { assert.notEqual(p.a, p.b); if (p.ghost) byes.add(p.a); else opponents.add([p.a, p.b].sort((a, b) => a - b).join(':')); });
    }
    assert.equal(opponents.size, count * (count - 1) / 2);
    if (count % 2) assert.equal(byes.size, count);
  }
  const pairs = rules.pairPlayers([1, 3, 6], 19);
  assert.deepEqual(pairs.flatMap(p => p.ghost ? [p.a] : [p.a, p.b]).sort(), [1, 3, 6]);
});
test('standard starts share unit, health and money; no campaign bonuses', () => {
  const m = match('versus', 8);
  m.players.forEach(p => { assert.equal(p.hp, 40); assert.equal(p.snapshot.state.gold, 10); assert.equal(p.snapshot.state.starter, null); assert.equal(p.snapshot.state.board.filter(Boolean)[0].id, 'nori'); });
});
test('cooperative successful rescue preserves helper HP and clears leaker damage', () => {
  const m = match(); give(m, 0, []); give(m, 1, ['sui_cat', 'biscuit_sui', 'nori'], 3);
  const settled = rules.settleRound(m, 200);
  assert.equal(settled.battles.length, 3);
  assert.equal(settled.players[0].report.rescuedBy, 1);
  assert.equal(settled.players[0].report.damage, 0);
  assert.equal(settled.players[1].hp, 20);
  const rescue = settled.battles.find(b => b.rescueFor === 0);
  const defense = rules.simulate(settled.battles[1].recipe);
  const survivors = defense.battle.player.filter(f => f.alive);
  assert.deepEqual(rescue.recipe.player.map(f => f.hp), survivors.map(f => f.hp));
  assert.equal(rescue.won, true);
});
test('failed rescue charges only remaining enemies to the leaking owner', () => {
  let found = false;
  for (let round = 2; round <= 16 && !found; round++) {
    const m = match('coop', 2, 321); m.round = round;
    m.players.forEach(p => { p.snapshot.state.round = round; });
    give(m, 0, []); give(m, 1, ['nori', 'sui', 'mossback'], 2);
    const settled = rules.settleRound(m, 200);
    const rescue = settled.battles.find(b => b.rescueFor === 0);
    if (rescue && !rescue.won) {
      found = true;
      const replay = rules.simulate(rescue.recipe);
      const expected = replay.battle.enemy.filter(f => f.alive).reduce((sum, f) => sum + f.star, 0);
      assert.equal(settled.players[0].report.damage, expected);
      assert.equal(settled.players[1].hp, 20);
    }
  }
  assert.ok(found, 'fixture must exercise failed rescue');
});
test('without helpers, losses charge surviving stars; each helper rescues at most once', () => {
  const m = match('coop', 4); [0, 1, 2].forEach(s => give(m, s, [])); give(m, 3, ['sui_cat', 'biscuit_sui'], 3);
  const s = rules.settleRound(m);
  assert.equal(s.battles.filter(b => b.rescueFor !== null).length, 1);
  assert.equal(s.players.filter(p => p.report.damage > 0).length, 2);
  assert.equal(s.players[3].report.damage, 0);
  const solo = match('coop', 1); give(solo, 0, []);
  const loss = rules.settleRound(solo);
  const enemies = rules.simulate(loss.battles[0].recipe).battle.enemy.filter(f => f.alive);
  assert.equal(loss.players[0].report.damage, enemies.reduce((n, f) => n + f.star, 0));
});
test('ghost copy cannot damage its source; only the real participant is settled', () => {
  const m = match('versus', 3);
  const ghost = m.pairings.find(p => p.ghost);
  give(m, ghost.a, ['sui_cat', 'biscuit_sui'], 3); give(m, ghost.b, []);
  const result = rules.settleRound(m);
  const realPair = result.battles.find(b => !b.ghost);
  const realSimulation = rules.simulate(realPair.recipe);
  const sourceLost = realPair.a === ghost.b ? !realSimulation.won : realSimulation.won;
  const expected = sourceLost ? Math.max(1, (realSimulation.won ? realSimulation.battle.player : realSimulation.battle.enemy).filter(f => f.alive).reduce((n, f) => n + f.star, 0)) : 0;
  assert.equal(result.players[ghost.b].report.damage, expected);
  assert.equal(result.players[ghost.a].report.damage, 0);
});
test('serialization and client visual effects preserve deterministic battle results', () => {
  const m = match('versus', 2);
  give(m, 0, ['clock_gunner', 'nori', 'sui_cat', 'biscuit_sui'], 2);
  give(m, 1, ['sumi', 'pako', 'mitsuri', 'mossback'], 2);
  const result = rules.settleRound(m);
  const recipe = JSON.parse(JSON.stringify(result.battles[0].recipe));
  const baseline = rules.simulate(recipe);
  const visual = rules.replayEngine(recipe, true);
  for (let i = 0; visual.state.phase === 'battle' && i < 1800; i++) visual.update(1 / 60);
  assert.equal(visual.state.result.won, baseline.won);
  assert.deepEqual(visual.state.battle.player.map(f => f.hp), baseline.battle.player.map(f => f.hp));
  assert.deepEqual(visual.state.battle.enemy.map(f => f.hp), baseline.battle.enemy.map(f => f.hp));
  assert.equal(result.battles[0].won, baseline.won);
  assert.equal(result.battles[0].elapsed, baseline.battle.elapsed);
});
test('next round preserves income and locked shop, updates prior roster, omits talents', () => {
  let m = match(); m.players[0].snapshot.state.shopLocked = true;
  const shop = structuredClone(m.players[0].snapshot.state.shop);
  const before = m.players[0].snapshot.state.board;
  for (let round = 1; round <= 8; round++) {
    m.players.forEach(p => { p.hp = 100; p.snapshot.state.hp = 100; });
    m = rules.settleRound(m, 200);
    const gold = m.players[0].snapshot.state.gold;
    m = rules.nextRound(m, 300);
    assert.equal(m.players[0].snapshot.state.gold, gold);
    assert.deepEqual(m.players[0].snapshot.state.augments, []);
    assert.equal(m.players[0].snapshot.state.round, round + 1);
  }
  assert.deepEqual(m.players[0].snapshot.state.shop, shop);
  assert.deepEqual(m.players[0].previous, before);
});
test('deadlines, acknowledgements and elimination advance without a connected host', () => {
  let m = match('versus', 3);
  assert.equal(rules.tickMatch(m, 1000), m);
  m = rules.tickMatch(m, m.deadline);
  assert.equal(m.phase, 'review');
  m = rules.tickMatch(m, m.deadline);
  assert.equal(m.round, 2);
  m.players[0].hp = 1; m.players[0].snapshot.state.hp = 1;
  give(m, 0, []); give(m, 1, ['sui_cat', 'biscuit_sui'], 3); give(m, 2, ['sui_cat', 'biscuit_sui'], 3);
  m = rules.settleRound(m, 500);
  assert.equal(m.players[0].hp, 0);
  if (m.phase === 'review') { m = rules.nextRound(m); assert.ok(m.pairings.every(p => p.a !== 0 && p.b !== 0)); }
});
test('coop ends on wave 16; versus has a finite shared-HP tie ending', () => {
  const c = match(); c.round = 16; c.players.forEach(p => { p.hp = 100; p.snapshot.state.hp = 100; });
  const end = rules.settleRound(c); assert.equal(end.phase, 'finished'); assert.deepEqual(end.winners, [0, 1]);
  const v = match('versus', 2); v.round = 40;
  const ve = rules.settleRound(v); assert.equal(ve.phase, 'finished'); assert.ok(ve.winners.length);
});
test('room ownership, human seat protection, private shop and replay commands', () => {
  let r = rooms.createRoom('ABCDEFGH', 'host', '房主', config('versus', 3, 1));
  assert.equal(rooms.applyCommand(r, 0, { kind: 'start' }, 1), null);
  r = rooms.joinRoom(r, 'guest', '朋友');
  assert.equal(rooms.applyCommand(r, 1, { kind: 'configure', config: config() }, 1), null);
  assert.equal(rooms.configure(r, config('coop', 1)), null);
  assert.equal(rooms.configure(r, config('coop', 3, 2)), null);
  r = rooms.applyCommand(r, 0, { kind: 'start' }, 1, 100);
  const view = rooms.viewRoom(r, 0);
  assert.equal(view.tokens, undefined); assert.equal(view.match.seed, undefined);
  view.match.players.forEach(p => assert.equal(p.snapshot, undefined));
  assert.ok(view.match.self.shop);
  assert.equal(rooms.applyCommand(r, 1, { kind: 'ready', round: 2, ready: true }, 1), null);
  r = rooms.applyCommand(r, 0, { kind: 'ready', round: 1, ready: true }, 1, 100);
  assert.equal(rooms.applyCommand(r, 0, { kind: 'action', round: 1, action: { kind: 'reroll' } }, 1), null);
  assert.equal(rooms.applyCommand(r, 0, { kind: 'action', round: 1, action: { kind: 'move', from: null, to: {} } }, 1), null);
  r = rooms.applyCommand(r, 1, { kind: 'ready', round: 1, ready: true }, 1, 100);
  assert.equal(r.match.phase, 'review');
  assert.equal(rooms.applyCommand(r, 0, { kind: 'ready', round: 1, ready: true }, 1), null);
});
test('movement, purchase, merge, sell and server-side affordability stay canonical', () => {
  const m = match(); const e = rules.engineFor(m.players[0].snapshot);
  assert.equal(rules.act(e, { kind: 'move', from: { zone: 'board', index: 11 }, to: { zone: 'board', index: 0 } }), true);
  assert.ok(e.state.board[0]); assert.equal(e.state.board[11], null);
  e.state.shop = ['nori', 'nori', 'nori', 'nori', 'nori'];
  rules.act(e, { kind: 'buy', index: 0 }); rules.act(e, { kind: 'buy', index: 1 });
  assert.equal(e.state.board.filter(Boolean).length, 1); assert.equal(e.state.board[0].star, 2);
  const gold = e.state.gold; rules.act(e, { kind: 'sell', location: { zone: 'board', index: 0 } }); assert.ok(e.state.gold > gold);
  e.state.gold = 0; rules.act(e, { kind: 'buy', index: 2 }); assert.equal(e.state.gold, 0); assert.equal(e.state.board.filter(Boolean).length, 0);
});
test('AI completes actual matches within the round cap for all populations', () => {
  for (const mode of ['coop', 'versus']) for (let count = mode === 'coop' ? 1 : 2; count <= (mode === 'coop' ? 4 : 8); count++) {
    let m = rules.createMatch(config(mode, count, count - 1), Array.from({ length: count }, (_, i) => ({ name: `AI ${i}`, ai: true, joined: true })), count * 937, 0);
    let iterations = 0;
    while (m.phase !== 'finished' && iterations++ < 85) m = rules.tickMatch(m, iterations * 200000);
    assert.equal(m.phase, 'finished', `${mode} ${count}`);
    assert.ok(m.round <= (mode === 'coop' ? 16 : 40));
    m.players.forEach(p => { assert.ok(p.hp >= 0); assert.ok(p.snapshot.state.gold >= 0); });
  }
});


test('shared timeline waits for slowest defense and rescue then auto advances without acknowledgements',()=>{
 const m=match('coop',4);
 give(m,0,[]);give(m,1,[]);give(m,2,['sui_cat','biscuit_sui'],3);give(m,3,['nori','sui_cat','mossback'],3);
 const s=rules.settleRound(m,10000),t=s.timeline;
 assert.equal(t.startsAt,10000,'combat starts immediately');assert.equal(t.rescueStartsAt,t.defenseEndsAt,'rescue has no added waiting');
 const primary=s.battles.filter(b=>b.rescueFor===null),rescues=s.battles.filter(b=>b.rescueFor!==null);
 assert.equal(rescues.length,2);
 assert.equal(t.defenseEndsAt,t.startsAt+Math.ceil(Math.max(...primary.map(b=>b.elapsed))*1000));
 assert.equal(t.combatEndsAt,t.rescueStartsAt+Math.ceil(Math.max(...rescues.map(b=>b.elapsed))*1000));
 assert.equal(rules.roundStage(s,t.startsAt-1),'starting');assert.equal(rules.roundStage(s,t.defenseEndsAt-1),'battle');
 assert.equal(rules.roundStage(s,t.defenseEndsAt),'rescue');assert.equal(rules.roundStage(s,t.rescueStartsAt),'rescue');
 assert.equal(rules.roundStage(s,t.combatEndsAt),'settlement');
 s.players.forEach(p=>{p.acknowledged=true;});assert.equal(rules.tickMatch(s,t.endsAt-1),s,'cannot skip shared presentation');
 s.players.forEach(p=>{p.acknowledged=false;});const next=rules.tickMatch(s,t.endsAt);
 assert.equal(next.round,2);assert.equal(next.phase,'preparation');assert.equal(next.timeline,undefined);
 assert.equal(next.deadline,t.endsAt+90000);
});
test('legacy continue cannot advance active combat; old saves migrate once',()=>{
 let r=rooms.createRoom('LOCAL','a','A',config('coop',1));r=rooms.applyCommand(r,0,{kind:'start'},927,1000);
 r.match=rules.settleRound(r.match,1000);
 assert.equal(rooms.applyCommand(r,0,{kind:'continue',round:1},927,r.match.timeline.startsAt),null);
 delete r.match.timeline;const adopted=rooms.tickRoom(r,5000);assert.ok(adopted.match.timeline);
 assert.equal(rooms.tickRoom(adopted,5001),adopted);
});
