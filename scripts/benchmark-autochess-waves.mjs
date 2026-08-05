import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { AutoChessEngine } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameEngine.ts",
);
const { SHOP_UNITS, UNIT_DEFS } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const rounds = option("--rounds", "1,2,3,4")
  .split(",")
  .map(Number)
  .filter((round) => Number.isInteger(round) && round >= 1 && round <= 16);
const seeds = Math.max(1, Math.min(10, Number(option("--seeds", "3")) || 3));
const maxLineups = Math.max(0, Number(option("--max-lineups", "400")) || 0);
const outputPath = option("--output", "");
const meleeSlots = [5, 11, 17, 23, 4, 10, 16, 22, 3, 9];
const rangedSlots = [0, 6, 12, 18, 1, 7, 13, 19, 2, 8];
const levelForRound = (round) => round <= 2 ? 3 : round <= 4 ? 4 : 5;
const capForRound = (round) => levelForRound(round);

const combinations = (values, size) => {
  const result = [];
  const current = [];
  const visit = (start) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    const remaining = size - current.length;
    for (let index = start; index <= values.length - remaining; index += 1) {
      current.push(values[index]);
      visit(index + 1);
      current.pop();
    }
  };
  visit(0);
  return result;
};

const candidateIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost <= 2);

const sampleEvenly = (lineups) => {
  if (!maxLineups || lineups.length <= maxLineups) return lineups;
  if (maxLineups === 1) return [lineups[0]];
  return Array.from({ length: maxLineups }, (_, index) =>
    lineups[Math.round(index * (lineups.length - 1) / (maxLineups - 1))]);
};

const playBattle = (round, lineup, seed) => {
  const engine = new AutoChessEngine(seed);
  engine.state.starterChoices = ["bastion"];
  engine.startRun("bastion");
  engine.state.starter = null;
  engine.state.round = round;
  engine.state.playerLevel = levelForRound(round);
  engine.state.board.fill(null);
  let meleeIndex = 0;
  let rangedIndex = 0;
  lineup.forEach((id, index) => {
    const definition = UNIT_DEFS[id];
    const slot = definition.attackType === "melee"
      ? meleeSlots[meleeIndex++]
      : rangedSlots[rangedIndex++];
    engine.state.board[slot] = { uid: index + 1, id, star: 1 };
  });
  engine.startBattle();
  for (let step = 0; step < 1600 && engine.state.phase === "battle"; step += 1) {
    engine.update(1 / 60);
  }
  if (engine.state.phase === "battle") throw new Error(`round ${round} benchmark did not finish`);
  return {
    won: engine.state.result?.won || false,
    timedOut: Boolean(engine.state.battle && engine.state.battle.elapsed >= engine.state.battle.limit - 0.01),
    playerSurvivors: engine.state.battle?.player.filter((fighter) => fighter.alive).length || 0,
    enemySurvivors: engine.state.battle?.enemy.filter((fighter) => fighter.alive).length || 0,
  };
};

const reports = rounds.map((round) => {
  const cap = capForRound(round);
  const allLineups = combinations(candidateIds, cap);
  const lineups = sampleEvenly(allLineups).map((lineup) => {
    const outcomes = Array.from({ length: seeds }, (_, index) => playBattle(round, lineup, 73000 + round * 100 + index));
    return {
      ids: lineup,
      names: lineup.map((id) => UNIT_DEFS[id].name),
      cost: lineup.reduce((sum, id) => sum + UNIT_DEFS[id].cost, 0),
      winRate: outcomes.filter((outcome) => outcome.won).length / outcomes.length,
      timeoutRate: outcomes.filter((outcome) => outcome.timedOut).length / outcomes.length,
      averageEnemySurvivors: outcomes.reduce((sum, outcome) => sum + outcome.enemySurvivors, 0) / outcomes.length,
      averagePlayerSurvivors: outcomes.reduce((sum, outcome) => sum + outcome.playerSurvivors, 0) / outcomes.length,
    };
  }).sort((left, right) =>
    right.winRate - left.winRate ||
    right.averagePlayerSurvivors - left.averagePlayerSurvivors ||
    left.averageEnemySurvivors - right.averageEnemySurvivors ||
    left.cost - right.cost);
  const viable = lineups.filter((lineup) => lineup.winRate >= 2 / 3);
  return {
    round,
    cap,
    candidatePool: candidateIds.length,
    totalLineups: allLineups.length,
    lineupCount: lineups.length,
    viableLineups: viable.length,
    viableRate: viable.length / lineups.length,
    top: lineups.slice(0, 12),
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  method: "Unique one-star shop units costing at most 2; no starter or augment combat bonuses; front/back formation; deterministic 60 Hz battles.",
  configuration: { rounds, seeds, maxLineups, candidateIds },
  rounds: reports,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Wrote autochess wave benchmark to ${outputPath}`);
} else {
  console.log(serialized.trimEnd());
}
