import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  goCanonicalFormationPlacements,
  hydrateAutopilotRolloutCache,
  snapshotAutopilotRolloutCache,
} = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");
const { SHOP_UNITS, UNIT_DEFS } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const inputPath = path.resolve(option(
  "--snapshot",
  ".tmp/autochess-go-v4-before-round55-preparation.resume.json",
));
const outputPath = path.resolve(option(
  "--output",
  "artifacts/autochess-go-v4-round55-single-project-search.json",
));
const cachePath = path.resolve(option(
  "--rollout-cache",
  ".tmp/autochess-go-fixed-v4-round46-hz20.json",
));
const rerollBudget = Math.max(1, Number(option("--rerolls", "64")) || 64);
const candidateLimit = Math.max(1, Number(option("--candidates", "24")) || 24);
const exactPerPlan = Math.max(1, Number(option("--exact-per-plan", "12")) || 12);
const maxProjects = Math.max(1, Math.min(3, Number(option("--max-projects", "1")) || 1));
const horizon = Math.max(1, Math.min(3, Number(option("--horizon", "1")) || 1));
const requiredProjectIds = option("--require-projects", "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const input = JSON.parse(await readFile(inputPath, "utf8"));
if (input.schema !== "go-loss-snapshot-v1") {
  throw new Error(`Unsupported shop-search snapshot schema: ${input.schema}`);
}

const cacheFingerprint = (await computeAutoChessRolloutSourceFingerprint()).hash;
let hydratedEntries = 0;
try {
  const persisted = JSON.parse(await readFile(cachePath, "utf8"));
  const inspection = inspectAutoChessRolloutCachePayload(persisted, cacheFingerprint);
  if (!inspection.compatible) throw new Error(`Incompatible rollout cache: ${inspection.reason}`);
  hydrateAutopilotRolloutCache(inspection.entries);
  hydratedEntries = inspection.entries.length;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const unitCopies = (unit) => (unit.star === 3 ? 9 : unit.star === 2 ? 3 : 1);
const entries = (pilot) => pilot.ownedEntries();
const copiesOf = (roster, id) => roster
  .filter(({ unit }) => unit.id === id)
  .reduce((sum, { unit }) => sum + unitCopies(unit), 0);
const shapeKey = (lineup) => lineup
  .map(({ unit }) => `${unit.id}:${unit.star}`)
  .sort()
  .join("|");
const describeLineup = (lineup) => lineup
  .map(({ unit }) => ({ id: unit.id, star: unit.star }))
  .sort((left, right) => left.id.localeCompare(right.id) || right.star - left.star);

const createSimulation = () => {
  const bridge = new EngineBridge(input.seed, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.restoreSimulationSnapshot(input.engine);
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "go",
    "oracle",
    20,
  );
  return { bridge, pilot };
};

const rankingSimulation = createSimulation();
const startRoster = entries(rankingSimulation.pilot);
const startRound = rankingSimulation.bridge.engine.state.round;
const futureShops = rankingSimulation.bridge.engine.previewFutureShops(rerollBudget);
const shops = [rankingSimulation.bridge.engine.state.shop, ...futureShops];
rankingSimulation.bridge.engine.state.round = startRound + 1;
const projectCandidates = SHOP_UNITS.flatMap((id) => {
  const copies = copiesOf(startRoster, id);
  if (copies >= 9) return [];
  let seen = copies;
  let completionReroll = null;
  shops.forEach((shop, shopIndex) => {
    seen += shop.filter((shopId) => shopId === id).length;
    if (completionReroll === null && seen >= 9) completionReroll = shopIndex;
  });
  if (completionReroll === null) return [];
  return [{
    id,
    copies,
    completionReroll,
    learnedGain: rankingSimulation.pilot.goCompletedUnitModelGain(startRoster, id),
  }];
});
rankingSimulation.bridge.engine.state.round = startRound;

const selectedProjects = new Map();
[...projectCandidates]
  .sort((left, right) => right.learnedGain - left.learnedGain
    || left.completionReroll - right.completionReroll)
  .slice(0, Math.ceil(candidateLimit / 2))
  .forEach((candidate) => selectedProjects.set(candidate.id, candidate));
[...projectCandidates]
  .sort((left, right) => left.completionReroll - right.completionReroll
    || right.copies - left.copies
    || right.learnedGain - left.learnedGain)
  .slice(0, candidateLimit)
  .forEach((candidate) => {
    if (selectedProjects.size < candidateLimit) selectedProjects.set(candidate.id, candidate);
  });

const sellForCapacity = (bridge, pilot, targetIds, trace) => {
  if (bridge.engine.state.bench.some((unit) => !unit)) return true;
  const sale = entries(pilot)
    .filter(({ unit, location }) => (
      location.zone === "bench"
      && unit.star < 3
      && !targetIds.has(unit.id)
    ))
    .sort((left, right) => unitCopies(left.unit) - unitCopies(right.unit)
      || UNIT_DEFS[left.unit.id].cost - UNIT_DEFS[right.unit.id].cost
      || left.unit.uid - right.unit.uid)[0];
  if (!sale) return false;
  trace.push({ type: "sell", id: sale.unit.id, star: sale.unit.star });
  bridge.dispatch({ type: "sell", location: sale.location });
  return true;
};

const pursueProjects = (bridge, pilot, projectIds, maximumRerolls = rerollBudget) => {
  const targetIds = new Set(projectIds);
  const trace = [];
  let rerolls = 0;
  const completed = () => projectIds.every((id) => copiesOf(entries(pilot), id) >= 9);
  while (rerolls <= maximumRerolls && !completed()) {
    for (let index = 0; index < bridge.engine.state.shop.length; index += 1) {
      const targetId = bridge.engine.state.shop[index];
      if (!targetId || !targetIds.has(targetId) || copiesOf(entries(pilot), targetId) >= 9) {
        continue;
      }
      if (!sellForCapacity(bridge, pilot, targetIds, trace)) {
        return { completed: false, rerolls, trace, reason: "capacity" };
      }
      const before = copiesOf(entries(pilot), targetId);
      bridge.dispatch({ type: "shop", index });
      const after = copiesOf(entries(pilot), targetId);
      if (after <= before) return { completed: false, rerolls, trace, reason: "purchase" };
      trace.push({ type: "buy", id: targetId, copiesAfter: after });
    }
    if (completed()) break;
    if (rerolls >= maximumRerolls) break;
    bridge.dispatch({ type: "reroll" });
    rerolls += 1;
  }
  return {
    completed: completed(),
    rerolls,
    trace,
    reason: null,
  };
};

const projectList = Array.from(selectedProjects.values());
const plans = projectList.map((project) => ({
  ids: [project.id],
  projects: [project],
  mode: "portfolio",
}));
for (let size = 2; size <= maxProjects; size += 1) {
  const selected = [];
  const collectPortfolios = (start) => {
    if (selected.length === size) {
      plans.push({
        ids: selected.map(({ id }) => id),
        projects: [...selected],
        mode: "portfolio",
      });
      return;
    }
    const needed = size - selected.length;
    for (let index = start; index <= projectList.length - needed; index += 1) {
      selected.push(projectList[index]);
      collectPortfolios(index + 1);
      selected.pop();
    }
  };
  collectPortfolios(0);

  const collectSequences = () => {
    if (selected.length === size) {
      plans.push({
        ids: selected.map(({ id }) => id),
        projects: [...selected],
        mode: "sequence",
      });
      return;
    }
    projectList.forEach((project) => {
      if (selected.includes(project)) return;
      selected.push(project);
      collectSequences();
      selected.pop();
    });
  };
  collectSequences();
}

const pursuePlan = (bridge, pilot, plan) => {
  if (plan.mode === "portfolio") return pursueProjects(bridge, pilot, plan.ids);
  const trace = [];
  let rerolls = 0;
  for (const id of plan.ids) {
    const pursuit = pursueProjects(bridge, pilot, [id], rerollBudget - rerolls);
    rerolls += pursuit.rerolls;
    trace.push(...pursuit.trace);
    if (!pursuit.completed) {
      return { completed: false, rerolls, trace, reason: pursuit.reason };
    }
  }
  return { completed: true, rerolls, trace, reason: null };
};

const selectedPlanList = requiredProjectIds.length === 0
  ? plans
  : plans.filter((plan) => requiredProjectIds.every((id) => plan.ids.includes(id)));

const rankLineups = (pilot) => {
  const roster = entries(pilot);
  const cap = pilot.bridge.engine.boardCap;
  const eligible = roster.filter(({ unit, location }) => (
    unit.star === 3 || location.zone === "board"
  ));
  const unique = new Map();
  const selected = [];
  const collect = (start) => {
    if (selected.length === cap) {
      const lineup = [...selected];
      const key = shapeKey(lineup);
      if (!unique.has(key)) unique.set(key, lineup);
      return;
    }
    const needed = cap - selected.length;
    for (let index = start; index <= eligible.length - needed; index += 1) {
      selected.push(eligible[index]);
      collect(index + 1);
      selected.pop();
    }
  };
  collect(0);
  const scored = Array.from(unique.values()).map((lineup) => ({
    lineup,
    key: shapeKey(lineup),
    model: pilot.goModelScore(lineup, "go_canonical"),
    heuristic: pilot.lineupHeuristicScore(lineup),
  }));
  const finalists = new Map();
  const add = (candidate) => {
    if (candidate) finalists.set(candidate.key, candidate);
  };
  add(scored.find(({ key }) => key === shapeKey(
    roster.filter(({ location }) => location.zone === "board"),
  )));
  [...scored]
    .sort((left, right) => right.model - left.model || right.heuristic - left.heuristic)
    .slice(0, exactPerPlan)
    .forEach(add);
  [...scored]
    .sort((left, right) => right.heuristic - left.heuristic || right.model - left.model)
    .slice(0, exactPerPlan)
    .forEach(add);
  return {
    eligible: eligible.length,
    combinations: unique.size,
    finalists: Array.from(finalists.values()),
  };
};

const exactBestLineup = (pilot) => {
  const ranked = rankLineups(pilot);
  const exact = ranked.finalists.map((candidate) => ({
    ...candidate,
    score: pilot.rolloutLineupScore(candidate.lineup, "go_canonical", true, 60),
  })).sort((left, right) => right.score - left.score
    || right.model - left.model
    || right.heuristic - left.heuristic);
  return { ranked, exact, best: exact[0] || null };
};

const commitLineup = (bridge, pilot, lineup) => {
  const roster = entries(pilot);
  if (lineup.length !== bridge.engine.boardCap) return null;
  const selectedUids = new Set(lineup.map(({ unit }) => unit.uid));
  const reserve = roster.filter(({ unit }) => !selectedUids.has(unit.uid));
  if (reserve.length > bridge.engine.state.bench.length) return null;
  const placements = goCanonicalFormationPlacements(lineup);
  if (placements.length !== lineup.length) return null;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  placements.forEach(({ entry, slot }) => {
    bridge.engine.state.board[slot] = entry.unit;
  });
  reserve.forEach(({ unit }, index) => {
    bridge.engine.state.bench[index] = unit;
  });
  return {
    score: pilot.rolloutLineupScore(lineup, "go_canonical", true, 60),
    lineup: describeLineup(lineup),
  };
};

const reports = [];
for (const plan of selectedPlanList) {
  const { bridge, pilot } = createSimulation();
  const planSummary = {
    ids: plan.ids,
    mode: plan.mode,
    learnedGain: plan.projects.reduce((sum, project) => sum + project.learnedGain, 0),
    completionReroll: Math.max(...plan.projects.map((project) => project.completionReroll)),
  };
  const roundPlans = [];
  const trace = [];
  let rerolls = 0;
  let failure = null;
  for (let step = 0; step < horizon; step += 1) {
    const pursuit = pursuePlan(bridge, pilot, plan);
    rerolls += pursuit.rerolls;
    trace.push(...pursuit.trace.map((action) => ({
      round: bridge.engine.state.round,
      ...action,
    })));
    if (!pursuit.completed) {
      failure = pursuit.reason || "incomplete";
      break;
    }
    const intermediate = exactBestLineup(pilot);
    const committed = intermediate.best
      ? commitLineup(bridge, pilot, intermediate.best.lineup)
      : null;
    if (!committed || committed.score < 10000 - 26) {
      failure = "intermediate-lineup";
      roundPlans.push({
        round: bridge.engine.state.round,
        plan: committed,
        exact: intermediate.exact.map(({ lineup, model, heuristic, score }) => ({
          lineup: describeLineup(lineup),
          model,
          heuristic,
          score,
        })),
        won: false,
      });
      break;
    }
    const round = bridge.engine.state.round;
    bridge.dispatch({ type: "battle" });
    bridge.skipBattle();
    const won = bridge.engine.state.result?.won === true;
    roundPlans.push({ round, plan: committed, won });
    if (bridge.engine.state.phase === "result") bridge.dispatch({ type: "resultContinue" });
    if (!won || bridge.engine.state.phase !== "preparation") {
      failure = "intermediate-battle";
      break;
    }
  }
  if (failure) {
    reports.push({
      ...planSummary,
      completed: false,
      rerolls,
      trace,
      roundPlans,
      failure,
      exact: [],
      winner: null,
    });
    continue;
  }
  const finalSelection = exactBestLineup(pilot);
  const exact = finalSelection.exact.map(({ lineup, model, heuristic, score }) => ({
    model,
    heuristic,
    score,
    lineup: describeLineup(lineup),
  }));
  const winner = exact.find(({ score }) => score >= 10000 - 26) || null;
  reports.push({
    ...planSummary,
    completed: true,
    rerolls,
    trace,
    roundPlans,
    targetRound: bridge.engine.state.round,
    targetGold: bridge.engine.state.gold,
    roster: describeLineup(entries(pilot)),
    eligible: finalSelection.ranked.eligible,
    combinations: finalSelection.ranked.combinations,
    exact,
    winner,
  });
  console.error(`${plan.mode}:${plan.ids.join("+")}: rerolls=${rerolls} winner=${Boolean(winner)}`);
}

reports.sort((left, right) => Number(Boolean(right.winner)) - Number(Boolean(left.winner))
  || (right.winner?.score || Number.NEGATIVE_INFINITY)
    - (left.winner?.score || Number.NEGATIVE_INFINITY)
  || Math.max(...(right.exact || []).map(({ score }) => score), Number.NEGATIVE_INFINITY)
    - Math.max(...(left.exact || []).map(({ score }) => score), Number.NEGATIVE_INFINITY));

const payload = {
  schema: "go-shop-project-search-v1",
  generatedAt: new Date().toISOString(),
  inputPath,
  seed: input.seed,
  enemySeed: input.enemySeed,
  startRound,
  rerollBudget,
  candidateLimit,
  exactPerPlan,
  maxProjects,
  horizon,
  availableProjects: projectCandidates,
  selectedProjects: Array.from(selectedProjects.keys()),
  requiredProjectIds,
  totalGeneratedPlans: plans.length,
  winners: reports.filter(({ winner }) => winner).length,
  reports,
  cache: {
    path: cachePath,
    hydratedEntries,
    persistedEntries: snapshotAutopilotRolloutCache().length,
  },
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
const temporaryCachePath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
await mkdir(path.dirname(cachePath), { recursive: true });
await writeFile(
  temporaryCachePath,
  `${JSON.stringify(createAutoChessRolloutCachePayload(
    snapshotAutopilotRolloutCache(),
    cacheFingerprint,
  ))}\n`,
  "utf8",
);
await rename(temporaryCachePath, cachePath);

console.log(JSON.stringify({
  outputPath,
  startRound,
  candidates: reports.length,
  winners: payload.winners,
  best: reports.slice(0, 8).map(({ ids, mode, rerolls, winner, exact }) => ({
    ids,
    mode,
    rerolls,
    winnerScore: winner?.score || null,
    bestScore: Math.max(...(exact || []).map(({ score }) => score), Number.NEGATIVE_INFINITY),
  })),
  cache: payload.cache,
}, null, 2));
