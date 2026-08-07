import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { AutoChessEngine } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameEngine.ts",
);
const {
  AUGMENTS,
  SHOP_UNITS,
  TRAITS,
  UNIT_DEFS,
  augmentTierForRound,
  traitLevelForCount,
} = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const RECORDED_HUMAN_LINEUP = [
  "rei",
  "yua",
  "sui_flower",
  "lian",
  "grove_mender",
  "yukisyo",
  "shiori",
  "xuehui",
  "spark_mage",
];

const RESEARCH_SEED_LINEUP = [
  "rei",
  "yua",
  "sui_flower",
  "lian",
  "grove_mender",
  "yukisyo",
  "cog_scribe",
  "rutice",
  "spark_mage",
  "sui_bird",
];

const FORMATIONS = {
  human_recorded: {
    rei: 23,
    units: {
      yua: [4],
      lian: [5],
      sui_bird: [9],
      yukisyo: [10],
      cinder_ram: [11],
      xuehui: [15],
      sui_flower: [16],
      grove_mender: [17],
      spark_mage: [22],
      rei: [23],
    },
    melee: [11, 17, 5, 10, 16, 4, 22, 9, 15, 3],
    ranged: [10, 16, 4, 22, 9, 15, 3, 21, 8, 14],
  },
  human_midline: {
    rei: 23,
    melee: [11, 17, 5, 10, 16, 4, 22, 9, 15, 3],
    ranged: [10, 16, 4, 22, 9, 15, 3, 21, 8, 14],
  },
  center_wedge: {
    rei: 23,
    melee: [11, 17, 10, 16, 5, 23, 9, 15, 4, 22],
    ranged: [10, 16, 9, 15, 4, 22, 3, 21, 8, 14],
  },
  split_flanks: {
    rei: 23,
    melee: [5, 23, 11, 17, 4, 22, 10, 16, 3, 21],
    ranged: [4, 22, 10, 16, 3, 21, 9, 15, 2, 20],
  },
};

const COMBAT_AUGMENT_PREFERENCE = {
  minor: ["vitality", "momentum", "tempered", "precision", "sharp_edge", "payday"],
  major: ["overclock", "united_front", "second_wind", "execution", "triage", "glass_cannon"],
};

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const rounds = option("--rounds", "40,45,50")
  .split(",")
  .map(Number)
  .filter((round) => Number.isInteger(round) && round >= 1 && round <= 64);
const seedCount = Math.max(1, Math.min(12, Number(option("--seeds", "3")) || 3));
const baseSeed = Math.max(1, Number(option("--seed", "75000")) || 75000);
const baseStar = Math.max(1, Math.min(3, Number(option("--star", "2")) || 2));
const threeStarCount = Math.max(
  0,
  Math.min(10, Number(option("--three-stars", "4")) || 0),
);
const passes = Math.max(0, Math.min(4, Number(option("--passes", "2")) || 0));
const candidateLimit = Math.max(
  12,
  Math.min(120, Number(option("--candidate-limit", "36")) || 36),
);
const outputPath = option("--output", "");
const compareOnly = process.argv.includes("--compare-only");
const initialLineup = option("--lineup", RESEARCH_SEED_LINEUP.join(","))
  .split(",")
  .filter((id) => SHOP_UNITS.includes(id));
const formationIds = Object.keys(FORMATIONS);
const searchFormationId = option("--search-formation", "human_midline");
const scenarios = rounds.flatMap((round) => Array.from(
  { length: seedCount },
  (_, index) => ({ round, seed: baseSeed + round * 101 + index * 7919 }),
));
const evaluationCache = new Map();

if (rounds.length === 0) throw new Error("At least one valid round is required.");
if (![9, 10].includes(initialLineup.length) || new Set(initialLineup).size !== initialLineup.length) {
  throw new Error("The initial lineup must contain 9 or 10 unique shop unit ids.");
}
if (!formationIds.includes(searchFormationId)) {
  throw new Error(`Unknown search formation: ${searchFormationId}`);
}

const canonicalLineupKey = (lineup) => [...lineup].sort().join(",");
const copiesForStar = (star) => (star === 3 ? 9 : star === 2 ? 3 : 1);
const normalizeStars = (lineup, stars = {}) => Object.fromEntries(
  lineup.map((id) => [id, Math.max(1, Math.min(3, stars[id] || baseStar))]),
);
const starSignature = (lineup, stars) => [...lineup]
  .sort()
  .map((id) => `${id}:${stars[id] || baseStar}`)
  .join(",");
const lineupCopyCost = (lineup, stars) => lineup.reduce(
  (sum, id) => sum + UNIT_DEFS[id].cost * copiesForStar(stars[id] || baseStar),
  0,
);

const augmentCountsBeforeRound = (round) => {
  const counts = { minor: 0, major: 0 };
  for (let completedRound = 1; completedRound < round; completedRound += 1) {
    const tier = augmentTierForRound(completedRound);
    if (tier) counts[tier] += 1;
  }
  return counts;
};

const augmentsForRound = (round) => {
  const counts = augmentCountsBeforeRound(round);
  return Object.entries(counts).flatMap(([tier, count]) => {
    const pool = COMBAT_AUGMENT_PREFERENCE[tier]
      .filter((id) => AUGMENTS.some((augment) => augment.id === id && augment.tier === tier));
    return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
  });
};

const placeLineup = (engine, lineup, stars, formationId) => {
  const formation = FORMATIONS[formationId];
  const used = new Set();
  let meleeIndex = 0;
  let rangedIndex = 0;
  engine.state.board.fill(null);
  lineup.forEach((id) => {
    const definition = UNIT_DEFS[id];
    const preferred = [
      ...(formation.units?.[id] || []),
      ...(id === "rei"
        ? [formation.rei, ...formation.melee]
        : definition.attackType === "melee"
          ? formation.melee.slice(meleeIndex++)
          : formation.ranged.slice(rangedIndex++)),
    ];
    const slot = preferred.find((candidate) => !used.has(candidate));
    if (slot === undefined) throw new Error(`No placement available for ${id}`);
    used.add(slot);
    engine.state.board[slot] = { uid: 1000 + slot, id, star: stars[id] || baseStar };
  });
};

const playBattle = (lineup, stars, formationId, scenario) => {
  const engine = new AutoChessEngine(
    scenario.seed,
    { telemetry: false, visualEffects: false },
  );
  engine.state.starterChoices = ["bastion"];
  engine.startRun("bastion");
  engine.state.starter = null;
  engine.state.augments = augmentsForRound(scenario.round);
  engine.state.round = scenario.round;
  engine.state.playerLevel = lineup.length === 10 ? 10 : 9;
  placeLineup(engine, lineup, stars, formationId);
  engine.startBattle();
  for (let step = 0; step < 1600 && engine.state.phase === "battle"; step += 1) {
    engine.update(1 / 60);
  }
  if (engine.state.phase === "battle") {
    throw new Error(`Battle did not finish for round ${scenario.round}, seed ${scenario.seed}`);
  }
  const battle = engine.state.battle;
  const healthRatio = (fighters) => fighters.reduce(
    (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
    0,
  );
  const margin = battle ? healthRatio(battle.player) - healthRatio(battle.enemy) : -100;
  return {
    won: engine.state.result?.won === true,
    margin,
    elapsed: battle?.elapsed || 0,
    playerSurvivors: battle?.player.filter((fighter) => fighter.alive).length || 0,
    enemySurvivors: battle?.enemy.filter((fighter) => fighter.alive).length || 0,
  };
};

const compareReports = (left, right) => right.wins - left.wins
  || right.worstRoundWins - left.worstRoundWins
  || right.worstMargin - left.worstMargin
  || right.averageMargin - left.averageMargin
  || left.averageElapsed - right.averageElapsed;

const evaluateLineup = (lineup, inputStars, formation) => {
  const stars = normalizeStars(lineup, inputStars);
  const key = `${starSignature(lineup, stars)}/${formation}`;
  const cached = evaluationCache.get(key);
  if (cached) return cached;
  const outcomes = scenarios.map((scenario) => ({
    ...scenario,
    formation,
    ...playBattle(lineup, stars, formation, scenario),
  }));
  const roundWins = rounds.map((round) => outcomes.filter(
    (outcome) => outcome.round === round && outcome.won,
  ).length);
  const report = {
    ids: lineup,
    names: lineup.map((id) => UNIT_DEFS[id].name),
    stars,
    formation,
    copyCost: lineupCopyCost(lineup, stars),
    wins: outcomes.filter((outcome) => outcome.won).length,
    battles: outcomes.length,
    winRate: outcomes.filter((outcome) => outcome.won).length / outcomes.length,
    worstRoundWins: Math.min(...roundWins),
    averageMargin: outcomes.reduce((sum, outcome) => sum + outcome.margin, 0) / outcomes.length,
    worstMargin: Math.min(...outcomes.map((outcome) => outcome.margin)),
    averageElapsed: outcomes.reduce((sum, outcome) => sum + outcome.elapsed, 0) / outcomes.length,
    outcomes,
  };
  evaluationCache.set(key, report);
  return report;
};

const evaluateBestFormation = (lineup, stars) => formationIds
  .map((formation) => evaluateLineup(lineup, stars, formation))
  .sort(compareReports)[0];

const uniqueLineups = (lineups) => Array.from(
  new Map(lineups.map((lineup) => [canonicalLineupKey(lineup), lineup])).values(),
);

const staticLineupScore = (lineup) => {
  const uniqueIds = new Set(lineup);
  const traitCounts = {};
  uniqueIds.forEach((id) => UNIT_DEFS[id].traits.forEach((trait) => {
    traitCounts[trait] = (traitCounts[trait] || 0) + 1;
  }));
  const traitScore = Object.entries(traitCounts).reduce((score, [trait, count]) => {
    const level = traitLevelForCount(TRAITS[trait], count);
    return score + level * 30 + count * level * 4;
  }, 0);
  const melee = lineup.filter((id) => UNIT_DEFS[id].attackType === "melee").length;
  const ranged = lineup.length - melee;
  const roleScore = melee >= 2 && ranged >= 2 ? 24 : -80;
  return lineup.reduce((score, id) => score + UNIT_DEFS[id].cost * 18, 0)
    + traitScore
    + roleScore;
};

const replacementNeighbors = (lineup) => uniqueLineups(lineup.flatMap((removed, index) => (
  SHOP_UNITS
    .filter((id) => id !== removed && !lineup.includes(id))
    .map((id) => lineup.map((existing, existingIndex) => existingIndex === index ? id : existing))
)));

const baseStarsFor = (lineup) => normalizeStars(lineup);
if (compareOnly) {
  const comparison = evaluateBestFormation(initialLineup, baseStarsFor(initialLineup));
  const report = {
    generatedAt: new Date().toISOString(),
    method: "Focused fixed-lineup comparison across the requested late-game rounds and formations.",
    configuration: {
      rounds,
      seedCount,
      baseSeed,
      baseStar,
      formationIds,
      initialLineup,
      augmentsByRound: Object.fromEntries(rounds.map((round) => [round, augmentsForRound(round)])),
    },
    comparison,
    evaluations: evaluationCache.size,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
    console.log(`Wrote focused autochess lineup benchmark to ${outputPath}`);
  }
  console.log(JSON.stringify({
    ids: comparison.ids,
    names: comparison.names,
    formation: comparison.formation,
    wins: comparison.wins,
    battles: comparison.battles,
    winRate: comparison.winRate,
    worstRoundWins: comparison.worstRoundWins,
    averageMargin: comparison.averageMargin,
    worstMargin: comparison.worstMargin,
    averageElapsed: comparison.averageElapsed,
    evaluations: evaluationCache.size,
  }, null, 2));
  process.exit(0);
}
const baselineSearch = evaluateLineup(
  initialLineup,
  baseStarsFor(initialLineup),
  searchFormationId,
);
const searchSteps = [];
let champion = baselineSearch;
for (let pass = 1; pass <= passes; pass += 1) {
  const candidates = replacementNeighbors(champion.ids)
    .sort((left, right) => staticLineupScore(right) - staticLineupScore(left))
    .slice(0, candidateLimit)
    .map((lineup) => evaluateLineup(lineup, baseStarsFor(lineup), searchFormationId))
    .sort(compareReports);
  const next = [champion, ...candidates].sort(compareReports)[0];
  searchSteps.push({
    pass,
    previous: champion.ids,
    champion: next.ids,
    improved: canonicalLineupKey(next.ids) !== canonicalLineupKey(champion.ids),
    top: candidates.slice(0, 12),
  });
  console.log(`Composition pass ${pass}: ${next.wins}/${next.battles}, ${next.ids.join(",")}`);
  if (canonicalLineupKey(next.ids) === canonicalLineupKey(champion.ids)) break;
  champion = next;
}

const compositionFinalists = uniqueLineups([
  initialLineup,
  champion.ids,
  ...searchSteps.flatMap((step) => step.top.slice(0, 4).map((candidate) => candidate.ids)),
]).map((lineup) => evaluateBestFormation(lineup, baseStarsFor(lineup))).sort(compareReports);
const compositionChampion = compositionFinalists[0];

const nineUnitCandidates = compositionChampion.ids.length === 9
  ? compositionFinalists.filter((candidate) => candidate.ids.length === 9)
  : uniqueLineups(compositionFinalists.slice(0, 5).flatMap((candidate) => (
      candidate.ids.map((_, index) => candidate.ids.filter((__, candidateIndex) => candidateIndex !== index))
    )))
    .map((lineup) => evaluateBestFormation(lineup, baseStarsFor(lineup)))
    .sort(compareReports);
const tenUnitCandidates = compositionChampion.ids.length === 10
  ? compositionFinalists.filter((candidate) => candidate.ids.length === 10)
  : uniqueLineups(compositionFinalists.slice(0, 5).flatMap((candidate) => (
      SHOP_UNITS
        .filter((id) => !candidate.ids.includes(id))
        .map((id) => [...candidate.ids, id])
    )))
    .sort((left, right) => staticLineupScore(right) - staticLineupScore(left))
    .slice(0, candidateLimit)
    .map((lineup) => evaluateBestFormation(lineup, baseStarsFor(lineup)))
    .sort(compareReports);

const terminalBase = tenUnitCandidates[0] || compositionChampion;
const singleUpgradeMarginals = baseStar < 3
  ? terminalBase.ids.map((id) => {
      const stars = { ...terminalBase.stars, [id]: 3 };
      const upgraded = evaluateLineup(terminalBase.ids, stars, terminalBase.formation);
      return {
        id,
        name: UNIT_DEFS[id].name,
        extraCopyCost: UNIT_DEFS[id].cost * (9 - copiesForStar(baseStar)),
        wins: upgraded.wins,
        winDelta: upgraded.wins - terminalBase.wins,
        averageMargin: upgraded.averageMargin,
        averageMarginDelta: upgraded.averageMargin - terminalBase.averageMargin,
        worstMarginDelta: upgraded.worstMargin - terminalBase.worstMargin,
      };
    }).sort((left, right) => right.winDelta - left.winDelta
      || right.worstMarginDelta - left.worstMarginDelta
      || right.averageMarginDelta - left.averageMarginDelta
      || left.extraCopyCost - right.extraCopyCost)
  : [];

const starSearchSteps = [];
let starChampion = terminalBase;
for (let step = 1; step <= threeStarCount && baseStar < 3; step += 1) {
  const candidates = starChampion.ids
    .filter((id) => starChampion.stars[id] < 3)
    .map((id) => {
      const stars = { ...starChampion.stars, [id]: 3 };
      return evaluateLineup(starChampion.ids, stars, starChampion.formation);
    })
    .sort(compareReports);
  const next = candidates[0];
  if (!next) break;
  const promotedId = next.ids.find((id) => (
    next.stars[id] === 3 && starChampion.stars[id] !== 3
  ));
  const promotedChampion = evaluateBestFormation(next.ids, next.stars);
  starSearchSteps.push({
    step,
    promotedId,
    promotedName: promotedId ? UNIT_DEFS[promotedId].name : null,
    previousWins: starChampion.wins,
    wins: promotedChampion.wins,
    averageMarginGain: promotedChampion.averageMargin - starChampion.averageMargin,
    worstMarginGain: promotedChampion.worstMargin - starChampion.worstMargin,
    report: promotedChampion,
  });
  starChampion = promotedChampion;
  console.log(`Star step ${step}: ${promotedId}, ${starChampion.wins}/${starChampion.battles}`);
}

const baseline = evaluateBestFormation(
  RECORDED_HUMAN_LINEUP,
  baseStarsFor(RECORDED_HUMAN_LINEUP),
);

const summarize = (report) => ({
  ids: report.ids,
  names: report.names,
  stars: report.stars,
  formation: report.formation,
  copyCost: report.copyCost,
  wins: report.wins,
  battles: report.battles,
  winRate: report.winRate,
  worstRoundWins: report.worstRoundWins,
  averageMargin: report.averageMargin,
  worstMargin: report.worstMargin,
  averageElapsed: report.averageElapsed,
});

const report = {
  generatedAt: new Date().toISOString(),
  method: "Fixed-formation late-game search over unit replacements, followed by realistic mixed-star allocation. Battles use the combat augments available before each tested round.",
  configuration: {
    rounds,
    seedCount,
    baseSeed,
    baseStar,
    threeStarCount,
    passes,
    candidateLimit,
    formationIds,
    searchFormationId,
    initialLineup,
    augmentsByRound: Object.fromEntries(rounds.map((round) => [round, augmentsForRound(round)])),
  },
  recordedHumanBaseline: summarize(baseline),
  compositionBaseline: summarize(evaluateBestFormation(initialLineup, baseStarsFor(initialLineup))),
  searchSteps: searchSteps.map((step) => ({
    pass: step.pass,
    previous: step.previous,
    champion: step.champion,
    improved: step.improved,
    top: step.top.map(summarize),
  })),
  topNine: nineUnitCandidates.slice(0, 12).map(summarize),
  topTen: tenUnitCandidates.slice(0, 12).map(summarize),
  singleUpgradeMarginals,
  starSearchSteps: starSearchSteps.map((step) => ({
    ...step,
    report: summarize(step.report),
  })),
  terminalRecommendation: summarize(starChampion),
  evaluations: evaluationCache.size,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Wrote autochess lineup benchmark to ${outputPath}`);
}
console.log(JSON.stringify({
  configuration: report.configuration,
  recordedHumanBaseline: report.recordedHumanBaseline,
  bestNine: report.topNine[0] || null,
  bestTen: report.topTen[0] || null,
  singleUpgradeMarginals: report.singleUpgradeMarginals,
  terminalRecommendation: report.terminalRecommendation,
  evaluations: report.evaluations,
}, null, 2));
