import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const optionValues = (name) => process.argv.flatMap((value, index, values) => (
  value === name && values[index + 1] ? [values[index + 1]] : []
));
const option = (name, fallback) => optionValues(name).at(-1) || fallback;
const modelPaths = optionValues("--model").map((value) => path.resolve(value));
const datasetPaths = optionValues("--dataset").map((value) => path.resolve(value));
const resolvedModels = modelPaths.length > 0 ? modelPaths : [
  path.resolve("src/components/autoChessGame/ai/goCombatModel.json"),
  path.resolve(".tmp/goCombatModel-hz60-holdout.json"),
];
const resolvedDatasets = datasetPaths.length > 0 ? datasetPaths : [
  path.resolve("artifacts/autochess-go-combat-enemy-152100-r60-hz60-b4.json"),
  path.resolve("artifacts/autochess-go-combat-enemy-152102-r60-hz60-b4.json"),
];
const outputPath = path.resolve(option(
  "--output",
  "artifacts/autochess-go-model-comparison-hz60.json",
));
const { createGoCombatScorer } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/goValueModel.ts",
);

const parseUnits = (raw, positioned) => {
  if (!raw) return [];
  return raw.split(",").map((token, ordinal) => {
    const parts = token.split(":");
    if (positioned) {
      const [position, id, star] = parts;
      return { id, star: Number(star), position: Number(position) };
    }
    const [id, star] = parts;
    return { id, star: Number(star), position: ordinal };
  });
};

const parseExample = ([cacheKey, score], source) => {
  const parts = cacheKey.split("/");
  if (
    parts.length !== 11
    || !["combat-go-v2", "combat-go-v3", "combat-go-v4"].includes(parts[0])
    || parts[1] !== "hz:60"
  ) {
    return null;
  }
  const [
    schema,
    hz,
    enemySeed,
    round,
    starter,
    augments,
    waveTag,
    modifier,
    enemies,
    players,
    branch,
  ] = parts;
  return {
    source,
    contextKey: [schema, hz, enemySeed, round, starter, augments, waveTag,
      modifier, enemies, branch].join("/"),
    score: Number(score),
    evaluation: {
      starter: starter || null,
      augments: augments ? augments.split(",") : [],
      waveTag,
      modifier: Number(modifier),
      players: parseUnits(players, true),
      enemies: parseUnits(enemies, false),
    },
  };
};

const datasets = await Promise.all(resolvedDatasets.map(async (datasetPath) => {
  const payload = JSON.parse(await readFile(datasetPath, "utf8"));
  const examples = payload.entries
    .map((entry) => parseExample(entry, datasetPath))
    .filter(Boolean);
  return {
    path: datasetPath,
    enemySeeds: payload.enemySeeds,
    combatHz: payload.combatHz,
    examples,
  };
}));
const examples = datasets.flatMap(({ examples: entries }) => entries);

const percentile = (ordered, fraction) => (
  ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] || 0
);
const evaluate = (scorer, selectedExamples) => {
  const predictions = selectedExamples.map(({ evaluation }) => scorer(evaluation));
  const groups = new Map();
  selectedExamples.forEach((example, index) => {
    const indices = groups.get(example.contextKey) || [];
    indices.push(index);
    groups.set(example.contextKey, indices);
  });
  let pairCount = 0;
  let pairCorrect = 0;
  let winCorrect = 0;
  const regrets = [];
  const topKLimits = [1, 4, 8, 12, 24];
  const topK = Object.fromEntries(topKLimits.map((limit) => [limit, {
    retained: 0,
    regrets: [],
  }]));
  selectedExamples.forEach((example, index) => {
    winCorrect += Number((predictions[index] >= 0) === (example.score >= 5000));
  });
  groups.forEach((indices) => {
    for (let left = 0; left < indices.length; left += 1) {
      for (let right = left + 1; right < indices.length; right += 1) {
        const leftIndex = indices[left];
        const rightIndex = indices[right];
        const actualDifference = selectedExamples[leftIndex].score
          - selectedExamples[rightIndex].score;
        if (Math.abs(actualDifference) < 1e-9) continue;
        pairCount += 1;
        const predictedDifference = predictions[leftIndex] - predictions[rightIndex];
        pairCorrect += Number(
          (predictedDifference > 0 && actualDifference > 0)
          || (predictedDifference < 0 && actualDifference < 0),
        );
      }
    }
    const actualBest = Math.max(...indices.map((index) => selectedExamples[index].score));
    const ranked = [...indices].sort((left, right) => predictions[right] - predictions[left]);
    const regret = actualBest - selectedExamples[ranked[0]].score;
    regrets.push(regret);
    topKLimits.forEach((limit) => {
      const retainedScore = Math.max(
        ...ranked.slice(0, limit).map((index) => selectedExamples[index].score),
      );
      const retainedRegret = actualBest - retainedScore;
      topK[limit].regrets.push(retainedRegret);
      topK[limit].retained += Number(retainedRegret < 5);
    });
  });
  const orderedRegrets = [...regrets].sort((left, right) => left - right);
  return {
    examples: selectedExamples.length,
    contexts: groups.size,
    pairs: pairCount,
    pairwiseAccuracy: pairCorrect / Math.max(1, pairCount),
    winAccuracy: winCorrect / Math.max(1, selectedExamples.length),
    meanTop1Regret: regrets.reduce((sum, value) => sum + value, 0)
      / Math.max(1, regrets.length),
    medianTop1Regret: percentile(orderedRegrets, 0.5),
    p90Top1Regret: percentile(orderedRegrets, 0.9),
    topK: Object.fromEntries(topKLimits.map((limit) => [limit, {
      bestRetainedRate: topK[limit].retained / Math.max(1, groups.size),
      meanRegret: topK[limit].regrets.reduce((sum, value) => sum + value, 0)
        / Math.max(1, topK[limit].regrets.length),
    }])),
  };
};

const startedAt = performance.now();
const models = [];
for (const modelPath of resolvedModels) {
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  const scorer = createGoCombatScorer(model);
  models.push({
    path: modelPath,
    trainedAt: model.trainedAt,
    exportedMetrics: model.metrics,
    combined: evaluate(scorer, examples),
    datasets: datasets.map((dataset) => ({
      path: dataset.path,
      enemySeeds: dataset.enemySeeds,
      metrics: evaluate(scorer, dataset.examples),
    })),
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  elapsedMs: performance.now() - startedAt,
  datasets: datasets.map(({ path: datasetPath, enemySeeds, combatHz, examples: entries }) => ({
    path: datasetPath,
    enemySeeds,
    combatHz,
    examples: entries.length,
  })),
  models,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote Go model comparison to ${outputPath}`);
console.log(JSON.stringify(models.map(({ path: modelPath, combined, datasets: results }) => ({
  model: modelPath,
  combined,
  datasets: results.map(({ enemySeeds, metrics }) => ({ enemySeeds, metrics })),
})), null, 2));
