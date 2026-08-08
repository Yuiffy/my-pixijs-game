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
  TRAIT_IDS,
  UNIT_DEFS,
} = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const contexts = Math.max(1, Number(option("--contexts", "64")) || 64);
const candidatesPerContext = Math.max(
  2,
  Number(option("--candidates", "12")) || 12,
);
const seedBase = Math.max(1, Number(option("--seed", "160000")) || 160000);
const combatHz = Math.max(20, Math.min(60, Number(option("--combat-hz", "20")) || 20));
const outputPath = path.resolve(option(
  "--output",
  `artifacts/autochess-go-combat-dataset-seed-${seedBase}-c${contexts}-hz${combatHz}.json`,
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
const FORMATIONS = [
  "human_recorded",
  "human_midline",
  "center_wedge",
  "split_flanks",
];
const AUGMENT_IDS = AUGMENTS.map(({ id }) => id);
const ABILITY_TIMINGS = [
  "selfOnHit",
  "supportShield",
  "supportHeal",
  "supportRescue",
  "selfBuff",
  "engage",
  "offenseInRange",
  "offenseReady",
  "passive",
];
const UNIT_FEATURE_NAMES = [
  "cost",
  "hp",
  "attack",
  "armor",
  "range",
  "abilityRange",
  "attackInterval",
  "moveSpeed",
  "ranged",
  "energyMax",
  "energyStart",
  "energyPerSecond",
  "energyOnAttack",
  "energyOnHit",
  "castRefund",
  ...TRAIT_IDS.map((id) => `trait:${id}`),
  ...ABILITY_TIMINGS.map((id) => `cast:${id}`),
];
const UNIT_FEATURES = Object.fromEntries(Object.values(UNIT_DEFS).map((definition) => [
  definition.id,
  [
    definition.cost / 5,
    definition.hp / 500,
    definition.attack / 60,
    definition.armor / 60,
    definition.range / 320,
    definition.abilityRange / 520,
    definition.attackInterval / 2,
    definition.moveSpeed / 120,
    definition.attackType === "ranged" ? 1 : 0,
    definition.energyProfile.max / 120,
    definition.energyProfile.start / 120,
    definition.energyProfile.perSecond / 20,
    definition.energyProfile.onAttack / 24,
    definition.energyProfile.onHit / 20,
    definition.energyProfile.castRefund / 20,
    ...TRAIT_IDS.map((id) => definition.traits.includes(id) ? 1 : 0),
    ...ABILITY_TIMINGS.map((id) => definition.abilityCastTiming === id ? 1 : 0),
  ],
]));

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

const randomLineup = (round, rng, uidBase) => shuffled(SHOP_UNIT_IDS, rng)
  .slice(0, 10)
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
for (let context = 0; context < contexts; context += 1) {
  const seed = seedBase + context;
  const rng = makeRng(seed * 2654435761);
  const round = 8 + ((context * 17 + rng.integer(57)) % 57);
  const starter = STARTERS[context % STARTERS.length];
  const bridge = new EngineBridge(seed);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = [starter];
  bridge.engine.startRun(starter);
  bridge.engine.state.round = round;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.phase = "preparation";
  const augmentCount = Math.min(AUGMENT_IDS.length, Math.max(1, Math.floor(round / 6)));
  bridge.engine.state.augments = shuffled(AUGMENT_IDS, rng).slice(0, augmentCount);

  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "go",
    "oracle",
    combatHz,
  );
  autopilot.rolloutVariantLimit = 2;
  const lineups = new Map();
  const base = randomLineup(round, rng, seed * 1000);
  lineups.set(lineupKey(base), base);
  let attempts = 0;
  while (lineups.size < candidatesPerContext && attempts < candidatesPerContext * 20) {
    attempts += 1;
    const lineup = attempts % 4 === 0
      ? randomLineup(round, rng, seed * 1000 + attempts * 20)
      : mutateLineup(base, round, rng, seed * 1000 + attempts * 20);
    lineups.set(lineupKey(lineup), lineup);
  }

  for (const lineup of lineups.values()) {
    for (const formation of FORMATIONS) {
      autopilot.rolloutLineupScore(lineup, formation, true, combatHz);
    }
  }
  if (progress && ((context + 1) % 4 === 0 || context + 1 === contexts)) {
    const entries = snapshotAutopilotRolloutCache().length;
    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    console.error(JSON.stringify({
      contexts: context + 1,
      entries,
      elapsedSeconds,
      combatsPerSecond: entries / Math.max(0.001, elapsedSeconds),
    }));
  }
}

const entries = snapshotAutopilotRolloutCache();
const payload = {
  schema: "go-combat-dataset-v1",
  generatedAt: new Date().toISOString(),
  seedBase,
  contexts,
  candidatesPerContext,
  formations: FORMATIONS,
  branchesPerCandidate: 2,
  combatHz,
  elapsedSeconds: (performance.now() - startedAt) / 1000,
  unitFeatureNames: UNIT_FEATURE_NAMES,
  unitFeatures: UNIT_FEATURES,
  entries,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(payload), "utf8");
console.log(JSON.stringify({
  outputPath,
  entries: entries.length,
  elapsedSeconds: payload.elapsedSeconds,
}, null, 2));
