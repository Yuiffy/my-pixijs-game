import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const { AutoChessAutopilot } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);
const { STARTING_PLAYER_LEVEL, upgradeCostForLevel } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const runs = Math.max(1, Math.min(100, Number(option("--runs", "12")) || 12));
const baseSeed = Math.max(1, Number(option("--seed", "72000")) || 72000);
const outputPath = option("--output", "");
const maximumBattles = Math.max(1, Math.min(64, Number(option("--battles", "16")) || 16));
const forcedStarter = option("--starter", "");
const policyPath = option("--policy", "");
const policyReport = policyPath ? JSON.parse(await readFile(policyPath, "utf8")) : null;
const policy = policyReport?.bestPolicy || policyReport?.policy || policyReport || {};
const style = option("--style", "survival");
const informationMode = option("--information", style === "seer" ? "oracle" : "normal");
const rolloutHz = Math.max(20, Math.min(60, Number(option("--rollout-hz", "60")) || 60));
const battleStepHz = Math.max(20, Math.min(60, Number(option("--battle-hz", "60")) || 60));
const reportProgress = process.argv.includes("--progress");
if (!["survival", "balanced", "highroll", "seer"].includes(style)) {
  throw new Error(`Unknown autopilot style: ${style}`);
}
if (!["normal", "oracle"].includes(informationMode)) {
  throw new Error(`Unknown autopilot information mode: ${informationMode}`);
}
const requiredWinRound = Math.max(
  0,
  Math.min(64, Number(option("--require-win-round", "0")) || 0),
);
if (requiredWinRound > maximumBattles) {
  throw new Error(
    `Required win round ${requiredWinRound} exceeds battle limit ${maximumBattles}`,
  );
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

const runFitness = (run) => run.wins * 100_000_000
  + run.finalRound * 1_000_000
  - run.earlyLosses * 100_000
  + run.finalHp * 2_500
  + run.finalNetWorth * 1_000
  + run.rounds.reduce((sum, round) => sum + round.combatMargin * 1_000 + round.interest * 100, 0);

const playRun = (seed) => {
  const bridge = new EngineBridge(seed, 1, { battleStepHz });
  bridge.setConsoleLogging(false);
  if (forcedStarter) bridge.engine.state.starterChoices = [forcedStarter];
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    policy,
    style,
    informationMode,
    rolloutHz,
  );
  if (!autopilot.startFromTitle()) throw new Error(`Autopilot could not start seed ${seed}`);

  let now = 1000;
  let safety = 0;
  let invalidMoves = 0;
  let maximumSelectionStreak = 0;
  let selectionStreak = 0;
  let previousSelection = "";
  const actions = {};
  const actionsByRound = new Map();
  const rounds = [];

  while (rounds.length < maximumBattles && bridge.engine.state.phase !== "gameover" && safety < 5000) {
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
          id: unit.id,
          star: unit.star,
        }] : []),
        bench: bridge.engine.state.bench.flatMap((unit, index) => unit ? [{
          index,
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
          predictedScore: autopilot.battlePredictionScore,
          interestTiersAtRisk: autopilot.stabilizationInterestTiersAtRisk,
          paidRerolls: autopilot.paidRerolls,
          dryPaidRerolls: autopilot.dryPaidRerolls,
          preparationActions: autopilot.preparationActions,
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
    const action = autopilot.tick(now);
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
    battles: rounds.length,
    wins: rounds.filter((round) => round.won).length,
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
    rounds,
  };
  run.finalAssetValue = rounds.at(-1)?.assetValue || bridge.engine.state.gold + rosterAssetValue(bridge.engine);
  run.finalDevelopmentValue = rounds.at(-1)?.developmentValue || developmentValue(bridge.engine);
  run.finalNetWorth = rounds.at(-1)?.netWorth || run.finalAssetValue + run.finalDevelopmentValue;
  run.fitness = runFitness(run);
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
  survivalByRound: Object.fromEntries([12, 16, 20, 24, 28, 32]
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
};
const report = { generatedAt: new Date().toISOString(), aggregate, runs: results };
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
