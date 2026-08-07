import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const {
  AutoChessAutopilot,
  getAutopilotRolloutCacheStats,
  hydrateAutopilotRolloutCache,
  snapshotAutopilotRolloutCache,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);
const { STARTING_PLAYER_LEVEL, upgradeCostForLevel } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);
const {
  AUTOPILOT_LATE_GAME_TARGET_IDS,
  AUTOPILOT_TERMINAL_TARGETS,
  lateGameTargetDesiredCopies,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/lateGamePlan.ts",
);

const cachePath = workerData.cachePath;
try {
  const persisted = JSON.parse(await readFile(cachePath, "utf8"));
  hydrateAutopilotRolloutCache(Array.isArray(persisted.entries) ? persisted.entries : []);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const persistCache = async () => {
  const entries = snapshotAutopilotRolloutCache();
  await mkdir(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify({ entries }), "utf8");
  await rename(temporaryPath, cachePath);
  return entries.length;
};

const rosterValue = (engine) => [...engine.state.board, ...engine.state.bench].reduce(
  (sum, unit) => sum + (unit ? engine.getUnitSellValue(unit) : 0),
  0,
);
const developmentValue = (engine) => {
  let value = 0;
  for (let level = STARTING_PLAYER_LEVEL; level < engine.state.playerLevel; level += 1) {
    value += upgradeCostForLevel(level) || 0;
  }
  const currentCost = upgradeCostForLevel(engine.state.playerLevel) || 0;
  return value + Math.max(0, currentCost - engine.state.upgradeRemaining);
};
const battleMargin = (battle) => {
  if (!battle) return 0;
  const health = (fighters) => fighters.reduce(
    (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
    0,
  );
  return health(battle.player) - health(battle.enemy);
};
const unitCopyValue = (unit) => (unit.star === 3 ? 9 : unit.star === 2 ? 3 : 1);
const terminalProgress = (engine) => {
  const roster = [...engine.state.board, ...engine.state.bench].filter(Boolean);
  const copiesById = new Map();
  roster.forEach((unit) => {
    copiesById.set(unit.id, (copiesById.get(unit.id) || 0) + unitCopyValue(unit));
  });
  const desiredCopies = AUTOPILOT_TERMINAL_TARGETS.reduce(
    (sum, target) => sum + lateGameTargetDesiredCopies(target.id),
    0,
  );
  const completedCopies = AUTOPILOT_TERMINAL_TARGETS.reduce(
    (sum, target) => sum + Math.min(
      lateGameTargetDesiredCopies(target.id),
      copiesById.get(target.id) || 0,
    ),
    0,
  );
  return {
    ownedTargets: AUTOPILOT_TERMINAL_TARGETS.filter(
      ({ id }) => (copiesById.get(id) || 0) > 0,
    ).length,
    threeStarTargets: AUTOPILOT_TERMINAL_TARGETS.filter(
      ({ id }) => roster.some((unit) => unit.id === id && unit.star === 3),
    ).length,
    copyCompletion: completedCopies / Math.max(1, desiredCopies),
    benchUnits: engine.state.bench.filter(Boolean).length,
    offPlanBenchUnits: engine.state.bench.filter((unit) => (
      unit && !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(unit.id)
    )).length,
  };
};

const playRun = ({
  seed,
  policy,
  battleLimit,
  starter,
  mode = "training",
  battleStepHz,
}) => {
  const startedAt = performance.now();
  const training = mode === "training";
  const bridge = new EngineBridge(seed, 1, {
    simulation: true,
    battleStepHz: battleStepHz || 60,
  });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = [starter];
  bridge.engine.startRun(starter);
  const autopilot = new AutoChessAutopilot(
    bridge,
    training ? "training" : "evolution",
    policy,
  );
  autopilot.setEnabled(true);
  let now = 1000;
  let safety = 0;
  const rounds = [];

  while (rounds.length < battleLimit && bridge.engine.state.phase !== "gameover" && safety < 5000) {
    safety += 1;
    now += 1000;
    if (bridge.engine.state.phase !== "battle") {
      autopilot.tick(now);
      continue;
    }
    const round = bridge.engine.state.round;
    const interest = bridge.engine.interestIncome;
    const financeCount = bridge.engine.getActiveTraits()
      .find((trait) => trait.id === "finance")?.count || 0;
    const skipped = bridge.skipBattle();
    if (!skipped.skipped) throw new Error(`Battle did not finish for seed ${seed}, round ${round}`);
    const assets = bridge.engine.state.gold + rosterValue(bridge.engine);
    const invested = developmentValue(bridge.engine);
    const progress = terminalProgress(bridge.engine);
    rounds.push({
      round,
      won: bridge.engine.state.result?.won || false,
      hp: bridge.engine.state.hp,
      assetValue: assets,
      level: bridge.engine.state.playerLevel,
      developmentValue: invested,
      netWorth: assets + invested,
      margin: battleMargin(bridge.engine.state.battle),
      interest,
      financeCount,
      ...progress,
    });
  }
  if (safety >= 5000) throw new Error(`Autopilot safety limit reached for seed ${seed}`);

  const wins = rounds.filter((round) => round.won).length;
  const earlyRounds = rounds.filter((round) => round.round <= 12);
  const earlyLosses = earlyRounds.filter((round) => !round.won).length;
  const final = rounds.at(-1);
  const missingMilestoneRound = battleLimit + 1;
  const firstFourFinanceRound = rounds.find((round) => round.financeCount >= 4)?.round
    ?? missingMilestoneRound;
  const firstMaxInterestRound = rounds.find((round) => round.interest >= 20)?.round
    ?? missingMilestoneRound;
  const finalTerminalProgress = terminalProgress(bridge.engine);
  const fitness = (final?.round || 0) * 100_000_000
    + wins * 1_000_000
    - earlyLosses * 100_000
    + finalTerminalProgress.copyCompletion * 500_000
    + finalTerminalProgress.threeStarTargets * 100_000
    + (final?.hp || 0) * 2_500
    + (final?.netWorth || 0) * 1_000
    + Math.max(0, missingMilestoneRound - firstFourFinanceRound) * 500
    + Math.max(0, missingMilestoneRound - firstMaxInterestRound) * 250
    + rounds.reduce((sum, round) => sum + round.margin * 1_000 + round.interest * 100, 0);
  return {
    mode,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
    seed,
    wins,
    finalRound: final?.round || 0,
    finalHp: final?.hp || 0,
    finalAssetValue: final?.assetValue || 0,
    finalLevel: final?.level || STARTING_PLAYER_LEVEL,
    finalDevelopmentValue: final?.developmentValue || 0,
    finalNetWorth: final?.netWorth || 0,
    earlyLosses,
    perfectEarly: earlyRounds.length >= Math.min(12, battleLimit) && earlyLosses === 0,
    averageMargin: rounds.reduce((sum, round) => sum + round.margin, 0) / Math.max(1, rounds.length),
    averageInterest: rounds.reduce((sum, round) => sum + round.interest, 0) / Math.max(1, rounds.length),
    firstFourFinanceRound,
    firstMaxInterestRound,
    finalTerminalOwnedTargets: finalTerminalProgress.ownedTargets,
    finalTerminalThreeStarTargets: finalTerminalProgress.threeStarTargets,
    finalTerminalCopyCompletion: finalTerminalProgress.copyCompletion,
    finalBenchUnits: finalTerminalProgress.benchUnits,
    finalOffPlanBenchUnits: finalTerminalProgress.offPlanBenchUnits,
    cacheStats: {
      worker: workerData.workerIndex,
      ...getAutopilotRolloutCacheStats(),
    },
    fitness,
  };
};

parentPort.on("message", async ({ id, task, flush }) => {
  try {
    parentPort.postMessage({
      id,
      result: flush ? { persistedEntries: await persistCache() } : playRun(task),
    });
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.stack : String(error) });
  }
});
