import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const { AutoChessAutopilot } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const runs = Math.max(1, Math.min(100, Number(option("--runs", "12")) || 12));
const baseSeed = Math.max(1, Number(option("--seed", "72000")) || 72000);
const outputPath = option("--output", "");
const maximumBattles = Math.max(1, Math.min(64, Number(option("--battles", "16")) || 16));

const playRun = (seed) => {
  const bridge = new EngineBridge(seed);
  bridge.setConsoleLogging(false);
  const autopilot = new AutoChessAutopilot(bridge);
  if (!autopilot.startFromTitle()) throw new Error(`Autopilot could not start seed ${seed}`);

  let now = 1000;
  let safety = 0;
  let invalidMoves = 0;
  let maximumSelectionStreak = 0;
  let selectionStreak = 0;
  let previousSelection = "";
  const actions = {};
  const rounds = [];

  while (rounds.length < maximumBattles && bridge.engine.state.phase !== "gameover" && safety < 5000) {
    safety += 1;
    now += 1000;
    if (bridge.engine.state.phase === "battle") {
      const round = bridge.engine.state.round;
      const before = {
        round,
        gold: bridge.engine.state.gold,
        level: bridge.engine.state.playerLevel,
        boardCount: bridge.engine.boardCount,
        benchCount: bridge.engine.state.bench.filter(Boolean).length,
        fullBench: bridge.engine.state.bench.every(Boolean),
        activeTraits: bridge.engine.getActiveTraits().map((trait) => ({
          id: trait.id,
          count: trait.count,
          level: trait.level,
        })),
      };
      const skipped = bridge.skipBattle();
      if (!skipped.skipped) throw new Error(`Battle did not finish for seed ${seed}, round ${round}`);
      rounds.push({
        ...before,
        won: bridge.engine.state.result?.won || false,
        hpAfter: bridge.engine.state.hp,
      });
      continue;
    }

    const action = autopilot.tick(now);
    if (action) actions[action.type] = (actions[action.type] || 0) + 1;
    if (action?.type === "move" && bridge.engine.state.toast?.text.startsWith("当前只能上阵")) {
      invalidMoves += 1;
    }
    const selected = bridge.engine.state.selected;
    const selectionKey = selected ? `${selected.zone}:${selected.index}` : "";
    selectionStreak = selectionKey && selectionKey === previousSelection ? selectionStreak + 1 : selectionKey ? 1 : 0;
    maximumSelectionStreak = Math.max(maximumSelectionStreak, selectionStreak);
    previousSelection = selectionKey;
  }

  if (safety >= 5000) throw new Error(`Autopilot safety limit reached for seed ${seed}`);
  return {
    seed,
    battles: rounds.length,
    wins: rounds.filter((round) => round.won).length,
    finalRound: rounds.at(-1)?.round || 0,
    finalHp: bridge.engine.state.hp,
    campaignCleared: bridge.engine.state.endlessUnlocked || rounds.some((round) => round.round >= 16 && round.won),
    invalidMoves,
    maximumSelectionStreak,
    fullBenchRounds: rounds.filter((round) => round.fullBench).length,
    underfilledRounds: rounds.filter((round) => round.boardCount < Math.min(round.level, 10)).length,
    actions,
    rounds,
  };
};

const results = Array.from({ length: runs }, (_, index) => playRun(baseSeed + index));
const aggregate = {
  runs,
  baseSeed,
  maximumBattles,
  campaignClearRate: results.filter((run) => run.campaignCleared).length / runs,
  averageFinalRound: results.reduce((sum, run) => sum + run.finalRound, 0) / runs,
  averageWins: results.reduce((sum, run) => sum + run.wins, 0) / runs,
  averageFinalHp: results.reduce((sum, run) => sum + run.finalHp, 0) / runs,
  invalidMoves: results.reduce((sum, run) => sum + run.invalidMoves, 0),
  maximumSelectionStreak: Math.max(...results.map((run) => run.maximumSelectionStreak)),
  fullBenchRounds: results.reduce((sum, run) => sum + run.fullBenchRounds, 0),
  underfilledRounds: results.reduce((sum, run) => sum + run.underfilledRounds, 0),
  actions: results.reduce((totals, run) => {
    Object.entries(run.actions).forEach(([action, count]) => {
      totals[action] = (totals[action] || 0) + count;
    });
    return totals;
  }, {}),
};
const report = { generatedAt: new Date().toISOString(), aggregate, runs: results };
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Wrote autopilot benchmark to ${outputPath}`);
}
console.log(JSON.stringify(aggregate, null, 2));
