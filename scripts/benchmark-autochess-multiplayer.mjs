import { performance } from 'node:perf_hooks';
import { loadTypescriptModule } from './tests/helpers/load-typescript-module.mjs';
const { createMatch, settleRound, nextRound } = await loadTypescriptModule('src/components/autoChessGame/multiplayer/match.ts');
for (const [mode, count] of [['versus', 8], ['coop', 4]]) {
  let match = createMatch({ mode, seats: count, aiCount: count - 1, prepSeconds: 90, isPublic: false },
    Array.from({ length: count }, (_, i) => ({ name: `AI ${i}`, ai: true, joined: true })), 92726);
  const samples = [];
  for (let round = 1; round <= 16; round++) {
    match.players.forEach(p => { p.hp = 1000; p.snapshot.state.hp = 1000; });
    const start = performance.now();
    match = settleRound(match);
    samples.push({ round, ms: Math.round(performance.now() - start), battles: match.battles.length,
      fighters: match.battles.reduce((n, b) => n + b.recipe.player.length + b.recipe.enemy.length, 0), bytes: JSON.stringify(match).length });
    if (match.phase === 'finished') break;
    match = nextRound(match);
  }
  console.log(JSON.stringify({ mode, samples, maxMs: Math.max(...samples.map(s => s.ms)) }));
}
const stressIds = ['clock_gunner', 'pako', 'sumi', 'biscuit_sui', 'sui_cat', 'rei', 'cinder_ram', 'seki_boar_king', 'lovely', 'xuehui'];
for (const count of [7, 8]) {
  let m = createMatch({ mode: 'versus', seats: count, aiCount: 0, prepSeconds: 90, isPublic: false },
    Array.from({ length: count }, (_, i) => ({ name: `Stress ${i}`, ai: false, joined: true })), 99721);
  m.round = 30;
  m.players.forEach((p, index) => {
    const s = p.snapshot.state;
    s.playerLevel = 10; s.round = 30; s.board.fill(null);
    stressIds.forEach((id, i) => { s.board[(i * 5 + index) % 24] = { uid: i + 10, id, star: 3 }; });
  });
  const start = performance.now(); m = settleRound(m);
  console.log(JSON.stringify({ stress: true, count, ms: Math.round(performance.now() - start), battles: m.battles.length,
    fighters: m.battles.reduce((n, b) => n + b.recipe.player.length + b.recipe.enemy.length, 0), bytes: JSON.stringify(m).length }));
}
