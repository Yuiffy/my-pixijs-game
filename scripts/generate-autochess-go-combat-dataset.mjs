import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const {
  AutoChessAutopilot,
  snapshotAutopilotRolloutCache,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);
const {
  AUGMENTS,
  SHOP_UNIT_IDS,
} = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);
const {
  UNIT_COMBAT_FEATURE_NAMES,
  currentUnitCombatFeatures,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/unitCombatFeatures.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const candidatesPerContext = Math.max(
  2,
  Number(option("--candidates", "24")) || 24,
);
const seedBase = Math.max(1, Number(option("--seed", "160000")) || 160000);
const maximumRound = Math.max(1, Math.min(60, Number(option("--rounds", "60")) || 60));
const minimumRound = Math.max(
  1,
  Math.min(maximumRound, Number(option("--minimum-round", "1")) || 1),
);
const futureHorizon = Math.max(
  0,
  Math.min(8, Number(option("--future-horizon", "0")) || 0),
);
const enemySeeds = [...new Set(option("--enemy-seeds", "152100,152102")
  .split(",")
  .map((value) => Math.max(1, Math.trunc(Number(value))))
  .filter(Number.isFinite))];
if (enemySeeds.length === 0) throw new Error("--enemy-seeds must contain at least one seed");
const branchesPerCandidate = 1;
const combatHz = Math.max(20, Math.min(60, Number(option("--combat-hz", "20")) || 20));
const campaignLabel = enemySeeds.join("-");
const outputPath = path.resolve(option(
  "--output",
  `artifacts/autochess-go-combat-enemy-${campaignLabel}`
    + `-r${minimumRound}-${maximumRound}-h${futureHorizon}-hz${combatHz}.json`,
));
const progress = process.argv.includes("--progress");

const STARTERS = [
  "mature_start",
  "blaze",
  "traffic_start",
  "bastion",
  "dance_start",
  "ranger_start",
];
const FORMATION = "go_canonical";
const AUGMENT_IDS = AUGMENTS.map(({ id }) => id);
const UNIT_FEATURE_NAMES = [...UNIT_COMBAT_FEATURE_NAMES];
const UNIT_FEATURES = currentUnitCombatFeatures();

const makeRng = (initialSeed) => {
  let state = initialSeed >>> 0 || 1;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    },
    integer(limit) {
      return Math.floor(this.next() * Math.max(1, limit));
    },
  };
};

const shuffled = (values, rng) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = rng.integer(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

const starForRound = (round, rng) => {
  const roll = rng.next();
  if (round >= 28) return roll < 0.8 ? 3 : roll < 0.96 ? 2 : 1;
  if (round >= 18) return roll < 0.35 ? 3 : roll < 0.82 ? 2 : 1;
  if (round >= 10) return roll < 0.08 ? 3 : roll < 0.58 ? 2 : 1;
  return roll < 0.18 ? 2 : 1;
};

const lineupKey = (lineup) => lineup
  .map(({ unit }) => `${unit.id}:${unit.star}`)
  .sort()
  .join("|");

const lineupSizeForRound = (round) => Math.min(10, 3 + Math.floor((round + 1) / 3));

const randomLineup = (round, rng, uidBase) => shuffled(SHOP_UNIT_IDS, rng)
  .slice(0, lineupSizeForRound(round))
  .map((id, index) => ({
    unit: { uid: uidBase + index, id, star: starForRound(round, rng) },
    location: { zone: "board", index },
  }));

const mutateLineup = (source, round, rng, uidBase) => {
  const result = source.map(({ unit }, index) => ({
    unit: { ...unit, uid: uidBase + index },
    location: { zone: "board", index },
  }));
  const replacements = 1 + rng.integer(3);
  const usedIds = new Set(result.map(({ unit }) => unit.id));
  for (let mutation = 0; mutation < replacements; mutation += 1) {
    const index = rng.integer(result.length);
    const available = SHOP_UNIT_IDS.filter((id) => !usedIds.has(id));
    if (available.length === 0) break;
    usedIds.delete(result[index].unit.id);
    const id = available[rng.integer(available.length)];
    usedIds.add(id);
    result[index] = {
      unit: { uid: uidBase + index, id, star: starForRound(round, rng) },
      location: { zone: "board", index },
    };
  }
  return result;
};

const startedAt = performance.now();
let completedContexts = 0;
const totalContexts = enemySeeds.length * (maximumRound - minimumRound + 1);
const campaignEntries = [];
for (const [enemyIndex, enemySeed] of enemySeeds.entries()) {
  for (let round = minimumRound; round <= maximumRound; round += 1) {
    const seed = seedBase + enemyIndex * 10000 + round;
    const rng = makeRng((seed * 2654435761) ^ enemySeed ^ (round * 104729));
    const starter = STARTERS[(round + enemyIndex) % STARTERS.length];
    const bridge = new EngineBridge(seed);
    bridge.setConsoleLogging(false);
    bridge.engine.state.enemySeed = enemySeed;
    bridge.engine.state.starterChoices = [starter];
    bridge.engine.startRun(starter);
    bridge.engine.state.round = round;
    bridge.engine.state.playerLevel = lineupSizeForRound(round);
    bridge.engine.state.phase = "preparation";
    const augmentCount = Math.min(AUGMENT_IDS.length, Math.max(0, Math.floor((round + 1) / 6)));
    bridge.engine.state.augments = shuffled(AUGMENT_IDS, rng).slice(0, augmentCount);

    const autopilot = new AutoChessAutopilot(
      bridge,
      "evolution",
      {},
      "go",
      "oracle",
      combatHz,
    );
    autopilot.rolloutVariantLimit = branchesPerCandidate;
    const lineups = new Map();
    const bases = Array.from({ length: Math.min(4, candidatesPerContext) }, (_, index) => (
      randomLineup(round, rng, seed * 1000 + index * 100)
    ));
    bases.forEach((lineup) => lineups.set(lineupKey(lineup), lineup));
    let attempts = 0;
    while (lineups.size < candidatesPerContext && attempts < candidatesPerContext * 30) {
      attempts += 1;
      const base = bases[attempts % bases.length];
      const lineup = attempts % 5 === 0
        ? randomLineup(round, rng, seed * 1000 + attempts * 20)
        : mutateLineup(base, round, rng, seed * 1000 + attempts * 20);
      lineups.set(lineupKey(lineup), lineup);
    }

    for (const lineup of lineups.values()) {
      const currentScore = autopilot.rolloutLineupScore(
        lineup,
        FORMATION,
        true,
        combatHz,
      );
      if (futureHorizon > 0) {
        const currentEntry = snapshotAutopilotRolloutCache().at(-1);
        if (!currentEntry || !currentEntry[0].includes(`/round:${round}/`)) {
          throw new Error(`Could not resolve current-round cache key for round ${round}`);
        }
        const futureScores = Array.from(
          { length: Math.min(futureHorizon, 60 - round) },
          (_, offset) => autopilot.rolloutLineupScoreAtRound(
            lineup,
            round + offset + 1,
            FORMATION,
            combatHz,
          ),
        );
        campaignEntries.push([
          currentEntry[0],
          Math.min(currentScore, ...futureScores),
        ]);
      }
    }
    completedContexts += 1;
    if (progress && (completedContexts % 4 === 0 || completedContexts === totalContexts)) {
      const entries = snapshotAutopilotRolloutCache().length;
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      console.error(JSON.stringify({
        contexts: completedContexts,
        totalContexts,
        enemySeed,
        round,
        entries,
        elapsedSeconds,
        combatsPerSecond: entries / Math.max(0.001, elapsedSeconds),
      }));
    }
  }
}

const entries = snapshotAutopilotRolloutCache();
const payload = {
  schema: "go-combat-dataset-v2",
  generatedAt: new Date().toISOString(),
  seedBase,
  enemySeeds,
  minimumRound,
  maximumRound,
  futureHorizon,
  labelMode: futureHorizon > 0 ? "future-window-minimum" : "current-combat",
  contexts: totalContexts,
  candidatesPerContext,
  formation: FORMATION,
  branchesPerCandidate,
  combatHz,
  elapsedSeconds: (performance.now() - startedAt) / 1000,
  unitFeatureNames: UNIT_FEATURE_NAMES,
  unitFeatures: UNIT_FEATURES,
  exactCombatEntries: entries.length,
  entries: futureHorizon > 0 ? campaignEntries : entries,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(payload), "utf8");
console.log(JSON.stringify({
  outputPath,
  entries: payload.entries.length,
  exactCombatEntries: entries.length,
  elapsedSeconds: payload.elapsedSeconds,
}, null, 2));
