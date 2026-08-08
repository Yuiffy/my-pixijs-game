import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};
const ALL_STYLES = ["survival", "balanced", "highroll", "seer", "go"];
const requestedStyles = option("--styles", "")
  .split(",")
  .map((style) => style.trim())
  .map((style) => style === "seer2" ? "seer" : style)
  .filter(Boolean);
const STYLES = requestedStyles.length > 0 ? [...new Set(requestedStyles)] : ALL_STYLES;
if (STYLES.some((style) => !ALL_STYLES.includes(style))) {
  throw new Error(`Unknown style in --styles: ${STYLES.join(",")}`);
}
const runs = Math.max(1, Math.min(32, Number(option("--runs", "8")) || 8));
const baseSeed = Math.max(1, Number(option("--seed", "122000")) || 122000);
const battles = Math.max(4, Math.min(64, Number(option("--battles", "60")) || 60));
const planningMode = option("--planning", "fast");
const rolloutHz = Math.max(
  20,
  Math.min(60, Number(option("--rollout-hz", planningMode === "exact" ? "60" : "20")) || 20),
);
const battleStepHz = Math.max(
  20,
  Math.min(60, Number(option("--battle-hz", planningMode === "exact" ? "60" : "20")) || 20),
);
const starterOption = option("--starter", "auto");
const starter = starterOption === "auto" ? "" : starterOption;
const outputPath = option("--output", "artifacts/autochess-style-benchmark.json");
const workerCount = Math.max(1, Math.min(
  16,
  Number(option("--workers", String(Math.min(8, availableParallelism())))) || 1,
));
if (!["fast", "exact"].includes(planningMode)) {
  throw new Error(`Unknown planning mode: ${planningMode}`);
}

class WorkerPool {
  constructor(size) {
    this.pending = new Map();
    this.queue = [];
    this.nextId = 1;
    this.workers = Array.from({ length: size }, (_, workerIndex) => {
      const worker = new Worker(
        new URL("./autochess-autopilot-training-worker.mjs", import.meta.url),
        {
          stdout: true,
          stderr: true,
          workerData: {
            workerIndex,
            cachePath: path.resolve(
              ".tmp/autochess-style-benchmark-cache",
              `worker-${workerIndex}.json`,
            ),
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
      const queued = { id: this.nextId, task, resolve, reject };
      this.nextId += 1;
      this.queue.push(queued);
      this.dispatch();
    });
  }

  dispatch() {
    this.workers.filter((worker) => !worker.busy).forEach((worker) => {
      const queued = this.queue.shift();
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
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}

const distribution = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / Math.max(1, sorted.length);
  return {
    mean,
    standardDeviation: Math.sqrt(variance),
    minimum: sorted[0] || 0,
    median: sorted[Math.floor(sorted.length / 2)] || 0,
    maximum: sorted.at(-1) || 0,
  };
};

const summarize = (styleRuns) => ({
  finalRound: distribution(styleRuns.map((run) => run.finalRound)),
  wins: distribution(styleRuns.map((run) => run.wins)),
  averageEarlyLosses: styleRuns.reduce((sum, run) => sum + run.earlyLosses, 0)
    / styleRuns.length,
  perfectEarlyRate: styleRuns.filter((run) => run.perfectEarly).length / styleRuns.length,
  averageFinalHp: styleRuns.reduce((sum, run) => sum + run.finalHp, 0) / styleRuns.length,
  averageFinalNetWorth: styleRuns.reduce((sum, run) => sum + run.finalNetWorth, 0)
    / styleRuns.length,
  averageInterest: styleRuns.reduce((sum, run) => sum + run.averageInterest, 0)
    / styleRuns.length,
  averageTerminalOwnedTargets: styleRuns.reduce(
    (sum, run) => sum + run.finalTerminalOwnedTargets,
    0,
  ) / styleRuns.length,
  averageTerminalThreeStars: styleRuns.reduce(
    (sum, run) => sum + run.finalTerminalThreeStarTargets,
    0,
  ) / styleRuns.length,
  averageTerminalCopyCompletion: styleRuns.reduce(
    (sum, run) => sum + run.finalTerminalCopyCompletion,
    0,
  ) / styleRuns.length,
  averageDurationMs: styleRuns.reduce((sum, run) => sum + run.durationMs, 0)
    / styleRuns.length,
  selectedStarters: styleRuns.reduce((counts, run) => {
    counts[run.starter] = (counts[run.starter] || 0) + 1;
    return counts;
  }, {}),
});

const pool = new WorkerPool(workerCount);
const startedAt = performance.now();
let results;
try {
  results = await Promise.all(STYLES.flatMap((style) => Array.from(
    { length: runs },
    (_, index) => pool.run({
      seed: baseSeed + index,
      policy: {},
      battleLimit: battles,
      starter,
      mode: planningMode === "fast" ? "training" : "validation",
      battleStepHz,
      rolloutHz,
      style,
      informationMode: style === "seer" || style === "go" ? "oracle" : "normal",
    }),
  )));
} finally {
  await pool.close();
}

const elapsedMs = performance.now() - startedAt;
const styles = Object.fromEntries(STYLES.map((style) => [
  style,
  summarize(results.filter((run) => run.style === style)),
]));
const ranking = STYLES.map((style) => ({ style, ...styles[style] }))
  .sort((left, right) => right.finalRound.mean - left.finalRound.mean
    || right.finalRound.minimum - left.finalRound.minimum
    || right.finalRound.maximum - left.finalRound.maximum
    || right.wins.mean - left.wins.mean)
  .map(({ style }) => style);
const report = {
  generatedAt: new Date().toISOString(),
  configuration: {
    styles: STYLES,
    runs,
    baseSeed,
    battles,
    planningMode,
    rolloutHz,
    battleStepHz,
    starter: starter || "auto",
    workerCount,
  },
  throughput: {
    campaigns: results.length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    campaignsPerMinute: Number((results.length * 60000 / elapsedMs).toFixed(2)),
  },
  ranking,
  styles,
  runs: results,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote style benchmark to ${outputPath}`);
console.log(JSON.stringify({
  configuration: report.configuration,
  throughput: report.throughput,
  ranking,
  styles,
}, null, 2));
