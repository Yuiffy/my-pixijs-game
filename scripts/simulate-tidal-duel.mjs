import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";
const { createGame, startGame, stepGame, aiInput, STEP } = await loadTypescriptModule("src/components/tidalDuel/engine.ts");
const report = { matches: [], byDifficulty: {}, assertions: "Deterministic CPU matches; both slots, roles, mirrors, finite health/energy, no softlocks. CPU win rates are diagnostics, not proof of human matchup fairness." };
for (const difficulty of ["easy", "normal", "hard"]) {
  for (let seed = 1; seed <= 32; seed++) for (const character of ["sui", "shiori"]) {
    const g = createGame({ mode: "local", character, opponent: character === "sui" ? "shiori" : "sui", difficulty }, seed * 73179);
    startGame(g); const moves = [new Set(), new Set()]; let maxCombo = 0; let breaks = 0; let techs = 0; let lastEvent = 0;
    while (g.phase !== "result" && g.time < 330) {
      stepGame(g, [aiInput(g, 0), aiInput(g, 1)], STEP);
      g.fighters.forEach((f, side) => {
        if (f.move) moves[side].add(f.move);
        assert.ok([f.x, f.y, f.hp, f.meter, f.guardGauge].every(Number.isFinite));
        assert.ok(f.hp >= 0 && f.hp <= 300 && f.meter >= 0 && f.meter <= 100 && f.guardGauge >= 0 && f.guardGauge <= 100);
        maxCombo = Math.max(maxCombo, f.combo);
      });
      for (const event of g.events) if (event.id > lastEvent) { lastEvent = event.id; if (event.type === "burst") breaks++; if (event.type === "tech") techs++; }
    }
    assert.equal(g.phase, "result", `${difficulty}/${seed}/${character} finishes its set`);
    const winner = g.winner === null ? null : g.fighters[g.winner].character;
    report.matches.push({ difficulty, seed, characters: g.fighters.map(f => f.character), winner, slot: g.winner, score: g.wins, rounds: g.round, seconds: Math.round(g.time), maxCombo, breaks, techs, moves: moves.map(set => [...set]) });
  }
  const matches = report.matches.filter(m => m.difficulty === difficulty);
  report.byDifficulty[difficulty] = { matches: matches.length, sui: matches.filter(m => m.winner === "sui").length, shiori: matches.filter(m => m.winner === "shiori").length, slot0: matches.filter(m => m.slot === 0).length, meanSeconds: Math.round(matches.reduce((n, m) => n + m.seconds, 0) / matches.length), maxCombo: Math.max(...matches.map(m => m.maxCombo)) };
}
for (const character of ["sui", "shiori"]) for (let seed = 1; seed <= 8; seed++) {
  const g = createGame({ mode: "local", character, opponent: character, difficulty: "normal", skin: "original", opponentSkin: "resort" }, seed * 8171); startGame(g);
  while (g.phase !== "result" && g.time < 330) stepGame(g, [aiInput(g, 0), aiInput(g, 1)], STEP);
  assert.equal(g.phase, "result", `mirror ${character}/${seed} finishes`);
  report.matches.push({ difficulty: "normal", mirror: true, character, seed, slot: g.winner, score: g.wins, seconds: Math.round(g.time) });
}
fs.mkdirSync("tmp/tidal-pixel-balance", { recursive: true });
fs.writeFileSync("tmp/tidal-pixel-balance/report.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ matches: report.matches.length, byDifficulty: report.byDifficulty, mirrors: report.matches.filter(m => m.mirror).length }, null, 2));
