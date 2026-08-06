import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { DEFAULT_AUTOPILOT_POLICY } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/autopilotPolicy.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const populationSize = Math.max(2, Math.min(32, Number(option("--population", "6")) || 6));
const generations = Math.max(1, Math.min(20, Number(option("--generations", "3")) || 3));
const trainingRuns = Math.max(1, Math.min(16, Number(option("--runs", "3")) || 3));
const validationRuns = Math.max(1, Math.min(16, Number(option("--validation-runs", "3")) || 3));
const baseSeed = Math.max(1, Number(option("--seed", "74000")) || 74000);
const battles = Math.max(4, Math.min(32, Number(option("--battles", "12")) || 12));
const validationBattles = Math.max(
  battles,
  Math.min(32, Number(option("--validation-battles", "20")) || 20),
);
const starter = option("--starter", "traffic_start");
const outputPath = option("--output", "artifacts/autochess-autopilot-training.json");
const workerCount = Math.max(1, Math.min(
  16,
  Number(option("--workers", String(Math.min(8, Math.max(1, availableParallelism() - 2))))) || 1,
));

const collectSourceFiles = async (sourcePath) => {
  const statEntries = await readdir(sourcePath, { withFileTypes: true });
  const nested = await Promise.all(statEntries.map((entry) => {
    const entryPath = path.join(sourcePath, entry.name);
    return entry.isDirectory() ? collectSourceFiles(entryPath) : [entryPath];
  }));
  return nested.flat();
};
const balanceSources = [
  ...(await collectSourceFiles("src/components/autoChessGame/core/data")),
  ...(await collectSourceFiles("src/components/autoChessGame/core/engine")),
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
].sort();
const balanceHash = createHash("sha256");
for (const sourcePath of balanceSources) {
  balanceHash.update(sourcePath);
  balanceHash.update(await readFile(sourcePath));
}
const balanceCacheVersion = balanceHash.digest("hex").slice(0, 16);
const persistentCacheDirectory = path.resolve(
  "artifacts/autochess-rollout-cache",
  balanceCacheVersion,
  `workers-${workerCount}`,
);

const dimensions = [
  { key: "reserveCap", min: 6, max: 20, step: 1, sigma: 2 },
  { key: "reserveFloor", min: 0, max: 8, step: 1, sigma: 1.5 },
  { key: "reserveRoundScale", min: 0.4, max: 1.8, step: 0.1, sigma: 0.25 },
  { key: "criticalHpThreshold", min: 5, max: 10, step: 1, sigma: 1 },
  { key: "criticalReserve", min: 0, max: 5, step: 1, sigma: 1 },
  { key: "woundedHpThreshold", min: 11, max: 16, step: 1, sigma: 1 },
  { key: "woundedReserve", min: 1, max: 9, step: 1, sigma: 1.5 },
  { key: "targetLevelRoundDivisor", min: 2, max: 5, step: 1, sigma: 0.75 },
  { key: "targetLevelRoundOffset", min: 0, max: 4, step: 1, sigma: 1 },
  { key: "healthyPaidRerolls", min: 0, max: 3, step: 1, sigma: 0.75 },
  { key: "woundedPaidRerolls", min: 1, max: 5, step: 1, sigma: 1 },
  { key: "criticalPaidRerolls", min: 2, max: 8, step: 1, sigma: 1.5 },
  { key: "safeWinRolloutScore", min: 10000, max: 10600, step: 50, sigma: 120 },
  { key: "stabilizeRolloutScore", min: 10000, max: 10350, step: 25, sigma: 80 },
  { key: "upgradeChaseBonusRerolls", min: 0, max: 3, step: 1, sigma: 1 },
  { key: "bankRerollInterestTiersAtRisk", min: 0, max: 20, step: 1, sigma: 2 },
  { key: "upgradeChaseRerollInterestTiersAtRisk", min: 0, max: 20, step: 1, sigma: 3 },
  { key: "stabilizeRerollInterestTiersAtRisk", min: 0, max: 20, step: 1, sigma: 4 },
  { key: "goodPurchaseInterestTiersAtRisk", min: 0, max: 20, step: 1, sigma: 3 },
  { key: "mergePurchaseInterestTiersAtRisk", min: 0, max: 20, step: 1, sigma: 3 },
  { key: "levelInterestTiersAtRisk", min: 0, max: 20, step: 1, sigma: 4 },
  { key: "interestSaleMinimumBench", min: 0, max: 8, step: 1, sigma: 2 },
  { key: "speculativePurchaseMinimumEmptyBench", min: 1, max: 6, step: 1, sigma: 1.5 },
  { key: "minimumWinningLineupMaxPrunes", min: 0, max: 6, step: 1, sigma: 1.5 },
  { key: "maximumFinalReinvestments", min: 0, max: 3, step: 1, sigma: 1 },
  { key: "maxStarCleanupSales", min: 0, max: 3, step: 1, sigma: 1 },
  { key: "skipMaxStarDuplicatePurchases", min: 0, max: 1, step: 1, sigma: 0.5 },
];

let randomState = (baseSeed ^ 0x9e3779b9) >>> 0;
const random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x100000000;
};
const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, random())))
  * Math.cos(2 * Math.PI * random());
const clampPolicy = (policy) => {
  const clamped = Object.fromEntries(dimensions.map((dimension) => {
    const raw = Math.min(dimension.max, Math.max(dimension.min, policy[dimension.key]));
    const quantized = Math.round(raw / dimension.step) * dimension.step;
    return [dimension.key, Number(quantized.toFixed(4))];
  }));
  clamped.stabilizeRolloutScore = Math.min(
    clamped.safeWinRolloutScore,
    clamped.stabilizeRolloutScore,
  );
  return clamped;
};
const mutatePolicy = (parent) => clampPolicy(Object.fromEntries(dimensions.map((dimension) => [
  dimension.key,
  parent[dimension.key] + gaussian() * dimension.sigma,
])));

class WorkerPool {
  constructor(size) {
    this.queues = Array.from({ length: size }, () => []);
    this.pending = new Map();
    this.nextId = 1;
    this.workers = Array.from({ length: size }, (_, workerIndex) => {
      const worker = new Worker(
        new URL("./autochess-autopilot-training-worker.mjs", import.meta.url),
        {
          stdout: true,
          stderr: true,
          workerData: {
            workerIndex,
            cachePath: path.join(persistentCacheDirectory, `worker-${workerIndex}.json`),
          },
        },
      );
      worker.poolIndex = workerIndex;
      worker.busy = false;
      worker.stdout.resume();
      worker.stderr.resume();
      worker.on("message", (message) => this.finish(worker, message));
      worker.on("error", (error) => this.fail(worker, error));
      return worker;
    });
  }

  run(task) {
    return new Promise((resolve, reject) => {
      const workerIndex = Math.abs(task.seed) % this.workers.length;
      this.queues[workerIndex].push({ id: this.nextId, task, resolve, reject });
      this.nextId += 1;
      this.dispatch();
    });
  }

  dispatch() {
    this.workers.filter((worker) => !worker.busy).forEach((worker) => {
      const queued = this.queues[worker.poolIndex].shift();
      if (!queued) return;
      worker.busy = true;
      worker.taskId = queued.id;
      this.pending.set(queued.id, queued);
      worker.postMessage({ id: queued.id, task: queued.task });
    });
  }

  finish(worker, message) {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    worker.busy = false;
    worker.taskId = null;
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
    this.dispatch();
  }

  fail(worker, error) {
    const pending = this.pending.get(worker.taskId);
    if (pending) {
      this.pending.delete(worker.taskId);
      pending.reject(error);
    }
    worker.busy = false;
  }

  async close() {
    const persisted = await Promise.all(this.workers.map((worker) => new Promise((resolve, reject) => {
      const id = this.nextId;
      this.nextId += 1;
      worker.busy = true;
      worker.taskId = id;
      this.pending.set(id, { id, resolve, reject });
      worker.postMessage({ id, flush: true });
    })));
    await Promise.all(this.workers.map((worker) => worker.terminate()));
    return persisted.reduce((sum, result) => sum + result.persistedEntries, 0);
  }
}

const pool = new WorkerPool(workerCount);
const evaluate = async (policy, seedStart, runCount, battleLimit) => {
  const runs = await Promise.all(Array.from(
    { length: runCount },
    (_, index) => pool.run({ seed: seedStart + index, policy, battleLimit, starter }),
  ));
  const average = (key) => runs.reduce((sum, run) => sum + run[key], 0) / runs.length;
  return {
    fitness: average("fitness"),
    averageWins: average("wins"),
    averageFinalRound: average("finalRound"),
    averageFinalHp: average("finalHp"),
    averageFinalAssetValue: average("finalAssetValue"),
    averageFinalLevel: average("finalLevel"),
    averageFinalDevelopmentValue: average("finalDevelopmentValue"),
    averageFinalNetWorth: average("finalNetWorth"),
    averageEarlyLosses: average("earlyLosses"),
    perfectEarlyRate: runs.filter((run) => run.perfectEarly).length / runs.length,
    averageMargin: average("averageMargin"),
    averageInterest: average("averageInterest"),
    runs,
  };
};

const cache = new Map();
const evaluateTraining = (policy) => {
  const key = JSON.stringify(policy);
  if (!cache.has(key)) cache.set(key, evaluate(policy, baseSeed, trainingRuns, battles));
  return cache.get(key);
};
const compareCandidate = (left, right) => right.training.averageWins - left.training.averageWins
  || left.training.averageEarlyLosses - right.training.averageEarlyLosses
  || right.training.averageFinalRound - left.training.averageFinalRound
  || right.training.fitness - left.training.fitness;
const baselinePolicy = clampPolicy(DEFAULT_AUTOPILOT_POLICY);
let population = [baselinePolicy];
while (population.length < populationSize) population.push(mutatePolicy(baselinePolicy));
const history = [];

for (let generation = 0; generation < generations; generation += 1) {
  const ranked = (await Promise.all(population.map(async (policy) => ({
    policy,
    training: await evaluateTraining(policy),
  })))).sort(compareCandidate);
  history.push({
    generation: generation + 1,
    bestPolicy: ranked[0].policy,
    bestTraining: ranked[0].training,
  });
  console.log(JSON.stringify({
    generation: generation + 1,
    fitness: ranked[0].training.fitness,
    wins: ranked[0].training.averageWins,
    earlyLosses: ranked[0].training.averageEarlyLosses,
    perfectEarlyRate: ranked[0].training.perfectEarlyRate,
    round: ranked[0].training.averageFinalRound,
    netWorth: ranked[0].training.averageFinalNetWorth,
    policy: ranked[0].policy,
  }));
  const elites = ranked.slice(0, Math.min(2, ranked.length)).map(({ policy }) => policy);
  population = [...elites];
  while (population.length < populationSize) {
    population.push(mutatePolicy(elites[Math.floor(random() * elites.length)]));
  }
}

const finalists = (await Promise.all(population.map(async (policy) => ({
  policy,
  training: await evaluateTraining(policy),
})))).sort(compareCandidate);
const bestPolicy = finalists[0].policy;
const validationSeed = baseSeed + 10000;
const [baselineValidation, bestValidation] = await Promise.all([
  evaluate(baselinePolicy, validationSeed, validationRuns, validationBattles),
  evaluate(bestPolicy, validationSeed, validationRuns, validationBattles),
]);
const recommended = bestValidation.averageWins >= baselineValidation.averageWins
  && bestValidation.averageEarlyLosses <= baselineValidation.averageEarlyLosses
  && bestValidation.averageFinalRound >= baselineValidation.averageFinalRound
  && bestValidation.fitness > baselineValidation.fitness;
const [baselineTraining, bestTraining] = await Promise.all([
  evaluateTraining(baselinePolicy),
  evaluateTraining(bestPolicy),
]);
const cacheSnapshots = [...baselineValidation.runs, ...bestValidation.runs]
  .reduce((latest, run) => {
    const current = latest.get(run.cacheStats.worker);
    if (!current || current.hits + current.misses < run.cacheStats.hits + run.cacheStats.misses) {
      latest.set(run.cacheStats.worker, run.cacheStats);
    }
    return latest;
  }, new Map());
const rolloutCache = Array.from(cacheSnapshots.values()).reduce(
  (total, stats) => ({
    hits: total.hits + stats.hits,
    misses: total.misses + stats.misses,
    entries: total.entries + stats.entries,
  }),
  { hits: 0, misses: 0, entries: 0 },
);
rolloutCache.hitRate = rolloutCache.hits / Math.max(1, rolloutCache.hits + rolloutCache.misses);
const report = {
  generatedAt: new Date().toISOString(),
  config: {
    populationSize,
    generations,
    trainingRuns,
    validationRuns,
    baseSeed,
    validationSeed,
    battles,
    validationBattles,
    starter,
    workerCount,
    balanceCacheVersion,
    persistentCacheDirectory,
  },
  baselinePolicy,
  bestPolicy,
  baselineTraining,
  bestTraining,
  baselineValidation,
  bestValidation,
  recommended,
  rolloutCache,
  history,
};

report.rolloutCache.persistedEntries = await pool.close();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote autopilot training report to ${outputPath}`);
console.log(JSON.stringify({ recommended, baselineValidation, bestValidation, bestPolicy }, null, 2));
