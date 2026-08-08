import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
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
const { createGoCombatScorer } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/goValueModel.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const optionValues = (name) => process.argv.flatMap((value, index, values) => (
  value === name && values[index + 1] ? [values[index + 1]] : []
));
const hasFlag = (name) => process.argv.includes(name);

let seed = Math.max(1, Number(option("--seed", "152101")) || 152101);
let targetRound = Math.max(1, Number(option("--round", "30")) || 30);
const rolloutHz = Math.max(20, Math.min(60, Number(option("--rollout-hz", "20")) || 20));
const modelLimit = Math.max(1, Number(option("--model-limit", "512")) || 512);
const heuristicLimit = Math.max(1, Number(option("--heuristic-limit", "128")) || 128);
const exactLimit = Math.max(1, Number(option("--exact-limit", "32")) || 32);
const replaySafetyLimit = Math.max(100, Number(option("--replay-safety", "10000")) || 10000);
const requestedModelPath = option("--model", "");
const modelPath = requestedModelPath ? path.resolve(requestedModelPath) : null;
const forcedLineupKeys = optionValues("--force-lineup").map((value) => (
  value.split(",").filter(Boolean).sort().join(",")
));
const cachePath = path.resolve(option(
  "--rollout-cache",
  ".tmp/autochess-go-fixed-v2-seed-152100-152101-hz20.json",
));
const requestedSnapshotPath = option("--snapshot", "");
const snapshotOnly = hasFlag("--snapshot-only");
const snapshotPath = requestedSnapshotPath ? path.resolve(requestedSnapshotPath) : null;
const inputSnapshot = snapshotPath
  ? JSON.parse(await readFile(snapshotPath, "utf8"))
  : null;
if (inputSnapshot) {
  if (inputSnapshot.schema !== "go-loss-snapshot-v1") {
    throw new Error(`Unsupported Go loss snapshot schema: ${inputSnapshot.schema}`);
  }
  seed = inputSnapshot.seed;
  targetRound = inputSnapshot.targetRound;
}

const goCombatScorer = modelPath
  ? createGoCombatScorer(JSON.parse(await readFile(modelPath, "utf8")))
  : undefined;
const outputPath = path.resolve(option(
  "--output",
  `artifacts/autochess-go-loss-${seed}-round-${targetRound}.json`,
));
const snapshotOutputPath = path.resolve(option(
  "--snapshot-output",
  outputPath.replace(/\.json$/i, ".snapshot.json"),
));

let hydratedEntries = 0;
try {
  const persisted = JSON.parse(await readFile(cachePath, "utf8"));
  const entries = Array.isArray(persisted.entries) ? persisted.entries : [];
  hydrateAutopilotRolloutCache(entries);
  hydratedEntries = entries.length;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const bridge = new EngineBridge(seed, 1, { simulation: true, battleStepHz: 60 });
bridge.setConsoleLogging(false);
if (inputSnapshot) bridge.engine.restoreSimulationSnapshot(inputSnapshot.engine);
const autopilot = new AutoChessAutopilot(
  bridge,
  "evolution",
  {},
  "go",
  "oracle",
  rolloutHz,
);

let captured = inputSnapshot
  ? {
    state: structuredClone(inputSnapshot.engine.state),
    randomState: inputSnapshot.engine.randomState,
    engineSnapshot: inputSnapshot.engine,
    plannedLineupUids: inputSnapshot.plan.plannedLineupUids,
    plannedFormation: inputSnapshot.plan.plannedFormation,
    plannedScore: inputSnapshot.plan.plannedScore,
    preparationActions: inputSnapshot.plan.preparationActions,
  }
  : null;
const replayTrace = [];
const originalDispatch = bridge.dispatch.bind(bridge);
bridge.dispatch = (action) => {
  if (
    !captured
    && action.type === "battle"
    && bridge.engine.state.phase === "preparation"
    && bridge.engine.state.round === targetRound
  ) {
    captured = {
      state: structuredClone(bridge.engine.state),
      randomState: bridge.engine.getRandomState(),
      engineSnapshot: bridge.engine.getSimulationSnapshot(),
      plannedLineupUids: [...autopilot.plannedLineupUids],
      plannedFormation: autopilot.plannedFormation,
      plannedScore: autopilot.plannedLineupScore,
      preparationActions: autopilot.preparationActions,
    };
    return null;
  }
  return originalDispatch(action);
};

if (!inputSnapshot && !autopilot.startFromTitle()) {
  throw new Error(`Could not start Go run for seed ${seed}`);
}
let now = 1000;
let safety = 0;
while (!captured && safety < replaySafetyLimit && bridge.engine.state.phase !== "gameover") {
  safety += 1;
  now += 1000;
  if (bridge.engine.state.phase === "battle") bridge.skipBattle();
  else {
    const action = autopilot.tick(now);
    replayTrace.push({
      safety,
      round: bridge.engine.state.round,
      phase: bridge.engine.state.phase,
      action: action?.type || null,
      gold: bridge.engine.state.gold,
      hp: bridge.engine.state.hp,
      boardCount: bridge.engine.boardCount,
      benchCount: bridge.engine.state.bench.filter(Boolean).length,
      selected: bridge.engine.state.selected,
      toast: bridge.engine.state.toast?.text || null,
      preparationActions: autopilot.preparationActions,
      finalizingEconomy: autopilot.finalizingEconomy,
      rescueLineupLocked: autopilot.rescueLineupLocked,
      rescueSearchCompleted: autopilot.rescueSearchCompleted,
      plannedLineupUids: [...autopilot.plannedLineupUids],
      plannedBoardSlots: Array.from(autopilot.plannedBoardSlots.entries()),
    });
    if (replayTrace.length > 40) replayTrace.shift();
  }
}
if (!captured) {
  throw new Error(
    `Could not reach round ${targetRound}; phase=${bridge.engine.state.phase} `
      + `round=${bridge.engine.state.round} trace=${JSON.stringify(replayTrace)}`,
  );
}
if (!inputSnapshot) {
  const snapshotPayload = {
    schema: "go-loss-snapshot-v1",
    capturedAt: new Date().toISOString(),
    seed,
    enemySeed: captured.state.enemySeed,
    targetRound,
    engine: captured.engineSnapshot,
    plan: {
      plannedLineupUids: captured.plannedLineupUids,
      plannedFormation: captured.plannedFormation,
      plannedScore: captured.plannedScore,
      preparationActions: captured.preparationActions,
    },
  };
  await mkdir(path.dirname(snapshotOutputPath), { recursive: true });
  await writeFile(snapshotOutputPath, `${JSON.stringify(snapshotPayload)}\n`, "utf8");
  console.error(`Wrote Go loss snapshot to ${snapshotOutputPath}`);
}
if (snapshotOnly) {
  console.log(JSON.stringify({
    seed,
    enemySeed: captured.state.enemySeed,
    targetRound,
    snapshotInputPath: snapshotPath,
    snapshotOutputPath: inputSnapshot ? null : snapshotOutputPath,
    phase: captured.state.phase,
    hp: captured.state.hp,
    gold: captured.state.gold,
  }, null, 2));
  process.exit(0);
}

const roster = autopilot.ownedEntries();
const cap = bridge.engine.boardCap;
if (roster.length < cap) throw new Error(`Roster ${roster.length} is smaller than cap ${cap}`);
const rankingAutopilot = goCombatScorer
  ? new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "go",
    "oracle",
    rolloutHz,
    goCombatScorer,
  )
  : autopilot;

const lineupKey = (lineup) => lineup
  .map(({ unit }) => `${unit.id}:${unit.star}`)
  .sort()
  .join(",");
const describeLineup = (lineup) => lineup
  .map(({ unit }) => ({ uid: unit.uid, id: unit.id, star: unit.star }))
  .sort((left, right) => left.id.localeCompare(right.id) || right.star - left.star || left.uid - right.uid);

const combinationsByKey = new Map();
let combinationCount = 0;
const selected = [];
const collect = (start) => {
  if (selected.length === cap) {
    combinationCount += 1;
    const lineup = [...selected];
    const key = lineupKey(lineup);
    if (combinationsByKey.has(key)) return;
    combinationsByKey.set(key, {
      key,
      lineup,
      model: rankingAutopilot.goModelScore(lineup, "go_canonical"),
      heuristic: autopilot.lineupHeuristicScore(lineup),
    });
    return;
  }
  const needed = cap - selected.length;
  for (let index = start; index <= roster.length - needed; index += 1) {
    selected.push(roster[index]);
    collect(index + 1);
    selected.pop();
  }
};

const startedAt = performance.now();
collect(0);
const combinations = Array.from(combinationsByKey.values());
const modelRanked = [...combinations].sort((left, right) => (
  right.model - left.model || right.heuristic - left.heuristic
));
const heuristicRanked = [...combinations].sort((left, right) => (
  right.heuristic - left.heuristic || right.model - left.model
));
const rosterByUid = new Map(roster.map((entry) => [entry.unit.uid, entry]));
const plannedLineup = captured.plannedLineupUids.flatMap((uid) => {
  const entry = rosterByUid.get(uid);
  return entry ? [entry] : [];
});
const plannedUidKey = [...captured.plannedLineupUids].sort((left, right) => left - right).join(",");
const plannedKey = lineupKey(plannedLineup);
const currentLineup = roster.filter(({ location }) => location.zone === "board");
const currentKey = lineupKey(currentLineup);
const screened = new Map();
const addScreened = (candidate) => {
  if (candidate) screened.set(candidate.key, candidate);
};
modelRanked.slice(0, modelLimit).forEach(addScreened);
heuristicRanked.slice(0, heuristicLimit).forEach(addScreened);
addScreened(combinations.find(({ key }) => key === plannedKey));
addScreened(combinations.find(({ key }) => key === currentKey));
forcedLineupKeys.forEach((key) => addScreened(combinations.find((candidate) => candidate.key === key)));

const exploratory = Array.from(screened.values()).map((candidate, index, all) => {
  if (index > 0 && index % 50 === 0) {
    console.error(`20Hz screened ${index}/${all.length}`);
  }
  return {
    ...candidate,
    exploratory: autopilot.rolloutLineupScore(
      candidate.lineup,
      "go_canonical",
      false,
      rolloutHz,
    ),
  };
}).sort((left, right) => (
  right.exploratory - left.exploratory || right.model - left.model
));

const exactCandidates = new Map();
exploratory.slice(0, exactLimit).forEach((candidate) => exactCandidates.set(candidate.key, candidate));
addScreened(combinations.find(({ key }) => key === plannedKey));
for (const key of [plannedKey, currentKey]) {
  const candidate = exploratory.find((entry) => entry.key === key);
  if (candidate) exactCandidates.set(key, candidate);
}
forcedLineupKeys.forEach((key) => {
  const candidate = exploratory.find((entry) => entry.key === key);
  if (candidate) exactCandidates.set(key, candidate);
});
const exact = Array.from(exactCandidates.values()).map((candidate, index, all) => {
  console.error(`60Hz exact ${index + 1}/${all.length}`);
  return {
    ...candidate,
    exact: autopilot.rolloutLineupScore(
      candidate.lineup,
      "go_canonical",
      true,
      60,
    ),
  };
}).sort((left, right) => right.exact - left.exact || right.model - left.model);

const entries = snapshotAutopilotRolloutCache();
await mkdir(path.dirname(cachePath), { recursive: true });
const temporaryCachePath = `${cachePath}.${process.pid}.tmp`;
await writeFile(temporaryCachePath, JSON.stringify({ entries }), "utf8");
await rename(temporaryCachePath, cachePath);

const compactCandidate = (candidate) => ({
  modelRank: modelRanked.findIndex(({ key }) => key === candidate.key) + 1,
  heuristicRank: heuristicRanked.findIndex(({ key }) => key === candidate.key) + 1,
  model: candidate.model,
  heuristic: candidate.heuristic,
  exploratory: candidate.exploratory,
  exact: candidate.exact,
  wonAllPublicBranches: candidate.exact >= 10000 - 26,
  lineup: describeLineup(candidate.lineup),
});
const report = {
  generatedAt: new Date().toISOString(),
  seed,
  enemySeed: bridge.engine.state.enemySeed,
  targetRound,
  rolloutHz,
  modelPath,
  snapshotInputPath: snapshotPath,
  snapshotOutputPath: inputSnapshot ? null : snapshotOutputPath,
  forcedLineupKeys,
  rosterCount: roster.length,
  boardCap: cap,
  combinationCount,
  uniqueCombinationCount: combinations.length,
  screenedCount: screened.size,
  exactCount: exact.length,
  elapsedMs: performance.now() - startedAt,
  state: {
    hp: captured.state.hp,
    gold: captured.state.gold,
    playerLevel: captured.state.playerLevel,
    starter: captured.state.starter,
    augments: captured.state.augments,
    shop: captured.state.shop,
    board: describeLineup(currentLineup),
    bench: describeLineup(roster.filter(({ location }) => location.zone === "bench")),
  },
  capturedPlan: {
    score: captured.plannedScore,
    formation: captured.plannedFormation,
    preparationActions: captured.preparationActions,
    uidKey: plannedUidKey,
    modelRank: modelRanked.findIndex(({ key }) => key === plannedKey) + 1,
    heuristicRank: heuristicRanked.findIndex(({ key }) => key === plannedKey) + 1,
  },
  exactWinners: exact.filter(({ exact: score }) => score >= 10000 - 26).length,
  best: exact.slice(0, 32).map(compactCandidate),
  cache: {
    ...getAutopilotRolloutCacheStats(),
    path: cachePath,
    hydratedEntries,
    persistedEntries: entries.length,
  },
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote Go loss diagnostic to ${outputPath}`);
console.log(JSON.stringify({
  seed,
  enemySeed: report.enemySeed,
  targetRound,
  combinationCount: report.combinationCount,
  uniqueCombinationCount: report.uniqueCombinationCount,
  screenedCount: report.screenedCount,
  exactCount: report.exactCount,
  exactWinners: report.exactWinners,
  plannedModelRank: report.capturedPlan.modelRank,
  plannedHeuristicRank: report.capturedPlan.heuristicRank,
  best: report.best.slice(0, 8),
  cache: report.cache,
}, null, 2));
