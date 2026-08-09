import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import {
  computeAutoChessRolloutSourceFingerprint,
  createAutoChessRolloutCachePayload,
  inspectAutoChessRolloutCachePayload,
} from "./lib/autochess-rollout-cache.mjs";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const {
  AutoChessAutopilot,
  getAutopilotRolloutCacheStats,
  hydrateAutopilotRolloutCache,
  snapshotAutopilotRolloutCache,
} = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");
const { STARTING_PLAYER_LEVEL, upgradeCostForLevel } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};

const requestedSnapshotPath = option("--snapshot", "");
const snapshotPath = requestedSnapshotPath ? path.resolve(requestedSnapshotPath) : null;
const inputSnapshot = snapshotPath
  ? JSON.parse(await readFile(snapshotPath, "utf8"))
  : null;
if (inputSnapshot && inputSnapshot.schema !== "go-loss-snapshot-v1") {
  throw new Error(`Unsupported autopilot snapshot schema: ${inputSnapshot.schema}`);
}
const requestedRuns = Math.max(1, Math.min(100, Number(option("--runs", "12")) || 12));
const runs = inputSnapshot ? 1 : requestedRuns;
const baseSeed = inputSnapshot?.seed
  || Math.max(1, Number(option("--seed", "72000")) || 72000);
const outputPath = option("--output", "");
const requestedSnapshotOutputPath = option("--snapshot-output", "");
const snapshotOutputPath = requestedSnapshotOutputPath
  ? path.resolve(requestedSnapshotOutputPath)
  : null;
const requestedResumeOutputPath = option("--resume-output", "");
const resumeOutputPath = requestedResumeOutputPath
  ? path.resolve(requestedResumeOutputPath)
  : null;
const maximumBattles = Math.max(1, Math.min(100, Number(option("--battles", "60")) || 60));
const forcedStarter = option("--starter", "");
const policyPath = option("--policy", "");
const policyReport = policyPath ? JSON.parse(await readFile(policyPath, "utf8")) : null;
const policy = policyReport?.bestPolicy || policyReport?.policy || policyReport || {};
const requestedStyle = option("--style", "survival");
const style = requestedStyle === "seer2" ? "seer" : requestedStyle;
const informationMode = option(
  "--information",
  style === "seer" || style === "go" ? "oracle" : "normal",
);
const rolloutHz = Math.max(20, Math.min(60, Number(option("--rollout-hz", "60")) || 60));
const battleStepHz = Math.max(20, Math.min(60, Number(option("--battle-hz", "60")) || 60));
const reportProgress = process.argv.includes("--progress");
if (!["survival", "balanced", "highroll", "seer", "go"].includes(style)) {
  throw new Error(`Unknown autopilot style: ${style}`);
}
if (!["normal", "oracle"].includes(informationMode)) {
  throw new Error(`Unknown autopilot information mode: ${informationMode}`);
}
const requiredWinRound = Math.max(
  0,
  Math.min(100, Number(option("--require-win-round", "0")) || 0),
);
if (requiredWinRound > maximumBattles) {
  throw new Error(
    `Required win round ${requiredWinRound} exceeds battle limit ${maximumBattles}`,
  );
}

const persistentCacheEnabled = !process.argv.includes("--no-rollout-cache")
  && (style === "seer" || style === "go" || process.argv.includes("--rollout-cache"));
let persistentCachePath = "";
let hydratedCacheEntries = 0;
let persistentCacheFingerprint = null;
let persistentCacheHydration = "disabled";
let persistentCacheRejectionReason = null;
if (persistentCacheEnabled) {
  const fingerprint = await computeAutoChessRolloutSourceFingerprint();
  persistentCacheFingerprint = fingerprint.hash;
  const balanceCacheVersion = fingerprint.hash.slice(0, 16);
  persistentCachePath = path.resolve(option(
    "--rollout-cache",
    path.join(
      "artifacts/autochess-rollout-cache",
      balanceCacheVersion,
      "benchmarks",
      `seed-${baseSeed}-${baseSeed + runs - 1}-hz-${rolloutHz}.json`,
    ),
  ));
  try {
    const persisted = JSON.parse(await readFile(persistentCachePath, "utf8"));
    const inspection = inspectAutoChessRolloutCachePayload(
      persisted,
      persistentCacheFingerprint,
    );
    if (inspection.compatible) {
      hydrateAutopilotRolloutCache(inspection.entries);
      hydratedCacheEntries = inspection.entries.length;
      persistentCacheHydration = "hydrated";
    } else {
      persistentCacheHydration = "rejected";
      persistentCacheRejectionReason = inspection.reason;
      console.error(`Ignored incompatible rollout cache: ${inspection.reason}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    persistentCacheHydration = "missing";
  }
}

const rosterAssetValue = (engine) => [
  ...engine.state.board,
  ...engine.state.bench,
].reduce((sum, unit) => sum + (unit ? engine.getUnitSellValue(unit) : 0), 0);

const developmentValue = (engine) => {
  let value = 0;
  for (let level = STARTING_PLAYER_LEVEL; level < engine.state.playerLevel; level += 1) {
    value += upgradeCostForLevel(level) || 0;
  }
  const currentCost = upgradeCostForLevel(engine.state.playerLevel) || 0;
  return value + Math.max(0, currentCost - engine.state.upgradeRemaining);
};

const combatMargin = (battle) => {
  if (!battle) return 0;
  const remainingHealth = (fighters) => fighters.reduce(
    (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
    0,
  );
  return remainingHealth(battle.player) - remainingHealth(battle.enemy);
};

const runFitness = (run) => run.finalRound * 1_000_000_000
  + run.wins * 1_000_000
  - run.earlyLosses * 100_000
  + run.finalHp * 2_500
  + run.finalNetWorth
  + run.rounds.reduce((sum, round) => sum + round.combatMargin * 100 + round.interest, 0);

const completedSnapshots = [];
const completedResumeSnapshots = [];

const playRun = (seed) => {
  const bridge = new EngineBridge(seed, 1, { battleStepHz });
  bridge.setConsoleLogging(false);
  if (inputSnapshot) bridge.engine.restoreSimulationSnapshot(inputSnapshot.engine);
  if (forcedStarter) bridge.engine.state.starterChoices = [forcedStarter];
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    policy,
    style,
    informationMode,
    rolloutHz,
    undefined,
    true,
  );
  const goPreBattleVerification = new Map();
  let latestPreparationSnapshot = null;
  const originalDispatch = bridge.dispatch.bind(bridge);
  bridge.dispatch = (action) => {
    if (style === "go" && action.type === "battle") {
      latestPreparationSnapshot = {
        schema: "go-loss-snapshot-v1",
        capturedAt: new Date().toISOString(),
        seed,
        enemySeed: bridge.engine.state.enemySeed,
        targetRound: bridge.engine.state.round,
        engine: bridge.engine.getSimulationSnapshot(),
        plan: {
          plannedLineupUids: [...autopilot.plannedLineupUids],
          plannedFormation: autopilot.plannedFormation,
          plannedScore: autopilot.plannedLineupScore,
          preparationActions: autopilot.preparationActions,
        },
      };
      const rosterByUid = new Map(autopilot.ownedEntries().map((entry) => [entry.unit.uid, entry]));
      const board = bridge.engine.state.board.map((unit) => (
        unit ? rosterByUid.get(unit.uid) || null : null
      ));
      goPreBattleVerification.set(bridge.engine.state.round, {
        exactBoardScore: autopilot.rolloutBoardScore(board, true, 60),
        plannedScore: autopilot.plannedLineupScore,
        plannedLineupUnits: Array.from(autopilot.plannedLineupUnits.entries()),
      });
    }
    return originalDispatch(action);
  };
  if (!inputSnapshot && !autopilot.startFromTitle()) {
    throw new Error(`Autopilot could not start seed ${seed}`);
  }
  if (inputSnapshot) autopilot.setEnabled(true);

  let now = 1000;
  let safety = 0;
  let invalidMoves = 0;
  let maximumSelectionStreak = 0;
  let selectionStreak = 0;
  let previousSelection = "";
  const actions = {};
  const actionsByRound = new Map();
  const rounds = [];
  let autopilotTickMs = 0;
  let autopilotTickCount = 0;
  let maximumAutopilotTickMs = 0;

  const battleLimitReached = () => inputSnapshot
    ? (rounds.at(-1)?.round || 0) >= maximumBattles
    : rounds.length >= maximumBattles;
  while (!battleLimitReached() && bridge.engine.state.phase !== "gameover" && safety < 5000) {
    safety += 1;
    now += 1000;
    if (bridge.engine.state.phase === "battle") {
      const round = bridge.engine.state.round;
      const before = {
        round,
        starter: bridge.engine.state.starter,
        gold: bridge.engine.state.gold,
        interest: bridge.engine.interestIncome,
        level: bridge.engine.state.playerLevel,
        boardCount: bridge.engine.boardCount,
        boardCap: bridge.engine.boardCap,
        benchCount: bridge.engine.state.bench.filter(Boolean).length,
        fullBench: bridge.engine.state.bench.every(Boolean),
        rosterValue: rosterAssetValue(bridge.engine),
        developmentValue: developmentValue(bridge.engine),
        board: bridge.engine.state.board.flatMap((unit, index) => unit ? [{
          index,
          uid: unit.uid,
          id: unit.id,
          star: unit.star,
        }] : []),
        bench: bridge.engine.state.bench.flatMap((unit, index) => unit ? [{
          index,
          uid: unit.uid,
          id: unit.id,
          star: unit.star,
        }] : []),
        activeTraits: bridge.engine.getActiveTraits().map((trait) => ({
          id: trait.id,
          count: trait.count,
          level: trait.level,
        })),
        autopilotDecision: {
          mode: autopilot.rerollMode,
          plannedFormation: autopilot.plannedFormation,
          lineageFormation: autopilot.lineageFormation,
          plannedLineupUids: [...autopilot.plannedLineupUids],
          plannedBoardSlots: Array.from(autopilot.plannedBoardSlots.entries()),
          predictedScore: autopilot.battlePredictionScore,
          interestTiersAtRisk: autopilot.stabilizationInterestTiersAtRisk,
          paidRerolls: autopilot.paidRerolls,
          dryPaidRerolls: autopilot.dryPaidRerolls,
          preparationActions: autopilot.preparationActions,
          preBattleVerification: goPreBattleVerification.get(round) || null,
        },
        actions: { ...(actionsByRound.get(round) || {}) },
      };
      const skipped = bridge.skipBattle();
      if (!skipped.skipped) throw new Error(`Battle did not finish for seed ${seed}, round ${round}`);
      const won = bridge.engine.state.result?.won || false;
      const hpAfter = bridge.engine.state.hp;
      const goldAfter = bridge.engine.state.gold;
      const assetValue = goldAfter + rosterAssetValue(bridge.engine);
      const invested = developmentValue(bridge.engine);
      const margin = combatMargin(bridge.engine.state.battle);
      rounds.push({
        ...before,
        won,
        hpAfter,
        goldAfter,
        assetValue,
        developmentValue: invested,
        netWorth: assetValue + invested,
        combatMargin: margin,
        roundStrength: (won ? 100_000 : 0)
          + hpAfter * 1_000
          + assetValue * 100
          + margin * 250,
      });
      if (reportProgress) {
        const latest = rounds.at(-1);
        console.error(JSON.stringify({
          seed,
          round,
          won,
          hpAfter,
          gold: latest.gold,
          predictedScore: latest.autopilotDecision.predictedScore,
          actions: latest.actions,
        }));
      }
      continue;
    }

    const actionRound = bridge.engine.state.round;
    const tickStartedAt = performance.now();
    const action = autopilot.tick(now);
    const tickElapsedMs = performance.now() - tickStartedAt;
    autopilotTickMs += tickElapsedMs;
    autopilotTickCount += 1;
    maximumAutopilotTickMs = Math.max(maximumAutopilotTickMs, tickElapsedMs);
    if (action) {
      actions[action.type] = (actions[action.type] || 0) + 1;
      const roundActions = actionsByRound.get(actionRound) || {};
      roundActions[action.type] = (roundActions[action.type] || 0) + 1;
      actionsByRound.set(actionRound, roundActions);
    }
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
  const run = {
    seed,
    enemySeed: bridge.engine.state.enemySeed,
    battles: rounds.length,
    wins: rounds.filter((round) => round.won).length,
    totalVictories: bridge.engine.state.victories,
    finalRound: rounds.at(-1)?.round || 0,
    finalHp: bridge.engine.state.hp,
    campaignCleared: bridge.engine.state.endlessUnlocked || rounds.some((round) => round.round >= 16 && round.won),
    invalidMoves,
    maximumSelectionStreak,
    fullBenchRounds: rounds.filter((round) => round.fullBench).length,
    earlyLosses: rounds.filter((round) => round.round <= 12 && !round.won).length,
    perfectEarly: rounds.filter((round) => round.round <= 12).length >= Math.min(12, maximumBattles)
      && rounds.every((round) => round.round > 12 || round.won),
    underfilledRounds: rounds.filter((round) => round.boardCount < round.boardCap).length,
    firstFourFinanceRound: rounds.find((round) => (
      round.activeTraits.some((trait) => trait.id === "finance" && trait.count >= 4)
    ))?.round ?? null,
    firstMaxInterestRound: rounds.find((round) => round.interest >= 20)?.round ?? null,
    actions,
    autopilotTickMs,
    autopilotTickCount,
    maximumAutopilotTickMs,
    rounds,
  };
  run.finalAssetValue = rounds.at(-1)?.assetValue || bridge.engine.state.gold + rosterAssetValue(bridge.engine);
  run.finalDevelopmentValue = rounds.at(-1)?.developmentValue || developmentValue(bridge.engine);
  run.finalNetWorth = rounds.at(-1)?.netWorth || run.finalAssetValue + run.finalDevelopmentValue;
  run.fitness = runFitness(run);
  if (latestPreparationSnapshot) completedSnapshots.push(latestPreparationSnapshot);
  if (bridge.engine.state.phase === "result") {
    originalDispatch({ type: "resultContinue" });
  }
  completedResumeSnapshots.push({
    schema: "go-loss-snapshot-v1",
    capturedAt: new Date().toISOString(),
    seed,
    enemySeed: bridge.engine.state.enemySeed,
    targetRound: bridge.engine.state.round,
    engine: bridge.engine.getSimulationSnapshot(),
    plan: latestPreparationSnapshot?.plan || {
      plannedLineupUids: [...autopilot.plannedLineupUids],
      plannedFormation: autopilot.plannedFormation,
      plannedScore: autopilot.plannedLineupScore,
      preparationActions: autopilot.preparationActions,
    },
  });
  return run;
};

const results = Array.from({ length: runs }, (_, index) => playRun(baseSeed + index));
const summarizeDistribution = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / Math.max(1, sorted.length);
  const percentile = (ratio) => {
    if (sorted.length === 0) return 0;
    const position = (sorted.length - 1) * ratio;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    mean,
    variance,
    standardDeviation: Math.sqrt(variance),
    minimum: sorted[0] ?? 0,
    p10: percentile(0.1),
    median: percentile(0.5),
    p90: percentile(0.9),
    maximum: sorted.at(-1) ?? 0,
  };
};
const survivalAt = (round) => ({
  reachedRate: results.filter((run) => run.rounds.some((entry) => entry.round === round)).length / runs,
  survivedRate: results.filter((run) => run.rounds.some((entry) => (
    entry.round === round && entry.hpAfter > 0
  ))).length / runs,
  winRate: results.filter((run) => run.rounds.some((entry) => (
    entry.round === round && entry.won
  ))).length / runs,
});
const aggregate = {
  runs,
  baseSeed,
  snapshotPath,
  snapshotOutputPath,
  resumeOutputPath,
  enemySeeds: [...new Set(results.map((run) => run.enemySeed))],
  maximumBattles,
  forcedStarter: forcedStarter || null,
  policyPath: policyPath || null,
  style,
  informationMode,
  rolloutHz,
  battleStepHz,
  requiredWinRound: requiredWinRound || null,
  requiredWinRoundPasses: requiredWinRound
    ? results.filter((run) => run.rounds.some((round) => (
      round.round === requiredWinRound && round.won
    ))).length
    : null,
  campaignClearRate: results.filter((run) => run.campaignCleared).length / runs,
  finalRoundDistribution: summarizeDistribution(results.map((run) => run.finalRound)),
  winDistribution: summarizeDistribution(results.map((run) => run.wins)),
  netWorthDistribution: summarizeDistribution(results.map((run) => run.finalNetWorth)),
  survivalByRound: Object.fromEntries([12, 16, 20, 24, 28, 32, 40, 50, 60, 70]
    .filter((round) => round <= maximumBattles)
    .map((round) => [round, survivalAt(round)])),
  averageFinalRound: results.reduce((sum, run) => sum + run.finalRound, 0) / runs,
  averageWins: results.reduce((sum, run) => sum + run.wins, 0) / runs,
  averageFinalHp: results.reduce((sum, run) => sum + run.finalHp, 0) / runs,
  averageFinalAssetValue: results.reduce((sum, run) => sum + run.finalAssetValue, 0) / runs,
  averageFinalDevelopmentValue: results.reduce(
    (sum, run) => sum + run.finalDevelopmentValue,
    0,
  ) / runs,
  averageFinalNetWorth: results.reduce((sum, run) => sum + run.finalNetWorth, 0) / runs,
  averageEarlyLosses: results.reduce((sum, run) => sum + run.earlyLosses, 0) / runs,
  perfectEarlyRate: results.filter((run) => run.perfectEarly).length / runs,
  averageCombatMargin: results.reduce(
    (sum, run) => sum + run.rounds.reduce((runSum, round) => runSum + round.combatMargin, 0),
    0,
  ) / Math.max(1, results.reduce((sum, run) => sum + run.rounds.length, 0)),
  averageRoundStrength: results.reduce(
    (sum, run) => sum + run.rounds.reduce((runSum, round) => runSum + round.roundStrength, 0),
    0,
  ) / Math.max(1, results.reduce((sum, run) => sum + run.rounds.length, 0)),
  averageFitness: results.reduce((sum, run) => sum + run.fitness, 0) / runs,
  totalInterest: results.reduce(
    (sum, run) => sum + run.rounds.reduce((runSum, round) => runSum + round.interest, 0),
    0,
  ),
  averageInterestPerBattle: results.reduce(
    (sum, run) => sum + run.rounds.reduce((runSum, round) => runSum + round.interest, 0),
    0,
  ) / Math.max(1, results.reduce((sum, run) => sum + run.rounds.length, 0)),
  averageBenchCount: results.reduce(
    (sum, run) => sum + run.rounds.reduce((runSum, round) => runSum + round.benchCount, 0),
    0,
  ) / Math.max(1, results.reduce((sum, run) => sum + run.rounds.length, 0)),
  fourFinanceRate: results.filter((run) => run.firstFourFinanceRound !== null).length / runs,
  averageFirstFourFinanceRound: results
    .filter((run) => run.firstFourFinanceRound !== null)
    .reduce((sum, run, _, reached) => sum + run.firstFourFinanceRound / reached.length, 0),
  maxInterestRate: results.filter((run) => run.firstMaxInterestRound !== null).length / runs,
  averageFirstMaxInterestRound: results
    .filter((run) => run.firstMaxInterestRound !== null)
    .reduce((sum, run, _, reached) => sum + run.firstMaxInterestRound / reached.length, 0),
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
  averageAutopilotTickMs: results.reduce((sum, run) => sum + run.autopilotTickMs, 0) / runs,
  maximumAutopilotTickMs: Math.max(...results.map((run) => run.maximumAutopilotTickMs)),
  rolloutCache: {
    ...getAutopilotRolloutCacheStats(),
    persistent: persistentCacheEnabled,
    hydratedEntries: hydratedCacheEntries,
    path: persistentCachePath || null,
    sourceFingerprint: persistentCacheFingerprint,
    hydration: persistentCacheHydration,
    rejectionReason: persistentCacheRejectionReason,
  },
};
const report = { generatedAt: new Date().toISOString(), aggregate, runs: results };

if (persistentCacheEnabled) {
  const entries = snapshotAutopilotRolloutCache();
  await mkdir(path.dirname(persistentCachePath), { recursive: true });
  const temporaryPath = `${persistentCachePath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    JSON.stringify(createAutoChessRolloutCachePayload(entries, persistentCacheFingerprint)),
    "utf8",
  );
  await rename(temporaryPath, persistentCachePath);
  aggregate.rolloutCache.persistedEntries = entries.length;
}
if (snapshotOutputPath) {
  if (completedSnapshots.length !== 1) {
    throw new Error("--snapshot-output requires exactly one completed run");
  }
  await mkdir(path.dirname(snapshotOutputPath), { recursive: true });
  await writeFile(snapshotOutputPath, `${JSON.stringify(completedSnapshots[0])}\n`, "utf8");
  console.log(`Wrote autopilot snapshot to ${snapshotOutputPath}`);
}
if (resumeOutputPath) {
  if (completedResumeSnapshots.length !== 1) {
    throw new Error("--resume-output requires exactly one completed run");
  }
  await mkdir(path.dirname(resumeOutputPath), { recursive: true });
  await writeFile(resumeOutputPath, `${JSON.stringify(completedResumeSnapshots[0])}\n`, "utf8");
  console.log(`Wrote autopilot resume snapshot to ${resumeOutputPath}`);
}
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Wrote autopilot benchmark to ${outputPath}`);
}
console.log(JSON.stringify(aggregate, null, 2));

if (requiredWinRound && aggregate.requiredWinRoundPasses !== runs) {
  throw new Error(
    `Only ${aggregate.requiredWinRoundPasses}/${runs} runs won required round ${requiredWinRound}`,
  );
}
