import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { AutoChessEngine } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameEngine.ts",
);
const {
  SHOP_UNITS,
  TRAITS,
  UNIT_DEFS,
  traitLevelForCount,
} = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};

const integerList = (value, minimum, maximum) => [...new Set(value
  .split(/[\s,]+/)
  .map(Number)
  .filter((item) => Number.isInteger(item) && item >= minimum && item <= maximum))];
const idList = (value) => [...new Set(value
  .split(/[\s,]+/)
  .map((item) => item.trim())
  .filter((id) => SHOP_UNITS.includes(id)))];
const average = (values) => values.length > 0
  ? values.reduce((total, value) => total + value, 0) / values.length
  : 0;
const roundTo = (value, digits = 4) => Number(value.toFixed(digits));

const rounds = integerList(option("--rounds", "4,8,12"), 1, 16);
const stars = integerList(option("--stars", "1,2"), 1, 3);
const focusIds = idList(option(
  "--focus",
  "rift_brawler,dawn_duelist,tiandou,youyi",
));
const contextsPerPair = Math.max(
  1,
  Math.min(100, Number(option("--contexts", "16")) || 16),
);
const seedsPerContext = Math.max(
  1,
  Math.min(10, Number(option("--seeds", "3")) || 3),
);
const requestedLineupSize = Math.max(
  0,
  Math.min(10, Number(option("--lineup-size", "0")) || 0),
);
const baseSeed = Math.max(1, Number(option("--seed", "174000")) || 174000);
const outputPath = option("--output", "");
const sameRoleOnly = process.argv.includes("--same-role");
const sameCastTimingOnly = process.argv.includes("--same-cast-timing");

if (rounds.length === 0) throw new Error("At least one valid round is required.");
if (stars.length === 0) throw new Error("At least one valid star level is required.");
if (focusIds.length === 0) throw new Error("At least one valid focus unit is required.");

const meleeSlots = [5, 11, 17, 23, 4, 10, 16, 22, 3, 9];
const rangedSlots = [0, 6, 12, 18, 1, 7, 13, 19, 2, 8];
const slotsByType = { melee: meleeSlots, ranged: rangedSlots };
const lineupSizeForRound = (round) => requestedLineupSize || (
  round <= 2 ? 3 : round <= 4 ? 4 : round <= 8 ? 6 : round <= 12 ? 8 : 10
);
const maximumCostForRound = (round) => (
  round <= 4 ? 2 : round <= 8 ? 3 : round <= 12 ? 4 : 5
);

const roleGroup = (definition) => {
  if (definition.abilityCastTiming.startsWith("support")) return "support";
  if (definition.abilityCastTiming === "selfOnHit") return "survival";
  if (definition.abilityCastTiming === "engage") return "engage";
  return "offense";
};

const hashString = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const shuffled = (values, random) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const traitLevels = (lineup) => {
  const counts = {};
  lineup.forEach((id) => UNIT_DEFS[id].traits.forEach((trait) => {
    counts[trait] = (counts[trait] || 0) + 1;
  }));
  return Object.fromEntries(Object.keys(TRAITS).map((id) => [
    id,
    traitLevelForCount(TRAITS[id], counts[id] || 0),
  ]));
};

const controlledTraitContext = (background, leftId, rightId) => {
  const leftLevels = traitLevels([leftId, ...background]);
  const rightLevels = traitLevels([rightId, ...background]);
  if (Object.keys(TRAITS).some((id) => leftLevels[id] !== rightLevels[id])) return null;

  const leftTraits = new Set(UNIT_DEFS[leftId].traits);
  const rightTraits = new Set(UNIT_DEFS[rightId].traits);
  const exclusiveTraits = new Set([
    ...[...leftTraits].filter((id) => !rightTraits.has(id)),
    ...[...rightTraits].filter((id) => !leftTraits.has(id)),
  ]);
  if ([...exclusiveTraits].some((id) => leftLevels[id] > 0 || rightLevels[id] > 0)) {
    return null;
  }

  return Object.entries(leftLevels)
    .filter(([, level]) => level > 0)
    .map(([id, level]) => ({ id, name: TRAITS[id].name, level }));
};

const generateContexts = (round, star, leftId, rightId) => {
  const lineupSize = lineupSizeForRound(round);
  const backgroundSize = lineupSize - 1;
  const maximumCost = maximumCostForRound(round);
  const pool = SHOP_UNITS.filter((id) => (
    id !== leftId &&
    id !== rightId &&
    UNIT_DEFS[id].cost <= maximumCost
  ));
  const random = createRandom(hashString([
    baseSeed,
    round,
    star,
    leftId,
    rightId,
  ].join(":")));
  const contexts = [];
  const seen = new Set();
  const attemptLimit = Math.max(2000, contextsPerPair * 800);

  for (let attempt = 0; attempt < attemptLimit && contexts.length < contextsPerPair; attempt += 1) {
    const background = shuffled(pool, random).slice(0, backgroundSize).sort();
    if (background.length !== backgroundSize) break;
    const key = background.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const activeTraits = controlledTraitContext(background, leftId, rightId);
    if (!activeTraits) continue;
    contexts.push({ background, activeTraits });
  }

  return contexts;
};

const placeMatchedLineup = (engine, candidateId, background, star) => {
  const counters = { melee: 0, ranged: 0 };
  const candidateType = UNIT_DEFS[candidateId].attackType;
  const candidateSlot = slotsByType[candidateType][counters[candidateType]++];
  engine.state.board[candidateSlot] = { uid: 1, id: candidateId, star };
  background.forEach((id, index) => {
    const attackType = UNIT_DEFS[id].attackType;
    const slot = slotsByType[attackType][counters[attackType]++];
    if (slot === undefined) throw new Error(`No ${attackType} slot available for ${id}`);
    engine.state.board[slot] = { uid: index + 2, id, star };
  });
  return candidateSlot;
};

const remainingPower = (fighters) => fighters.reduce((total, fighter) => {
  if (!fighter.alive) return total;
  return total + (
    Math.max(0, fighter.hp) +
    Math.max(0, fighter.shield || 0) +
    Math.max(0, fighter.abilityShield || 0)
  ) / Math.max(1, fighter.maxHp);
}, 0);

const playBattle = (round, star, candidateId, context, seed) => {
  const engine = new AutoChessEngine(seed, { telemetry: false, visualEffects: false });
  engine.state.starterChoices = ["bastion"];
  engine.startRun("bastion");
  engine.state.starter = null;
  engine.state.round = round;
  engine.state.playerLevel = lineupSizeForRound(round);
  engine.state.board.fill(null);
  const candidateSlot = placeMatchedLineup(engine, candidateId, context.background, star);
  engine.startBattle();
  for (let step = 0; step < 1600 && engine.state.phase === "battle"; step += 1) {
    engine.update(1 / 60);
  }
  if (engine.state.phase === "battle") {
    throw new Error(`Round ${round} replacement benchmark did not finish`);
  }
  const battle = engine.state.battle;
  if (!battle) throw new Error("Battle state was not retained after combat.");
  const candidate = battle.player.find((fighter) => fighter.unitId === candidateId);
  if (!candidate) throw new Error(`Candidate ${candidateId} was not present after combat.`);
  const playerPower = remainingPower(battle.player);
  const enemyPower = remainingPower(battle.enemy);
  return {
    won: engine.state.result?.won || false,
    margin: playerPower - enemyPower,
    elapsed: battle.elapsed,
    timedOut: battle.elapsed >= battle.limit - 0.01,
    candidateSlot,
    candidateSurvived: candidate.alive,
    candidateContribution: {
      damage: candidate.damageDealt,
      healing: candidate.healingDone,
      shielding: candidate.shieldingDone,
      taken: candidate.damageTaken,
      pendingGroundEffects: battle.projectiles.filter((projectile) => (
        projectile.sourceFid === candidate.fid && projectile.grounded
      )).length,
    },
  };
};

const averageContribution = (outcomes) => ({
  damage: roundTo(average(outcomes.map((outcome) => outcome.candidateContribution.damage))),
  healing: roundTo(average(outcomes.map((outcome) => outcome.candidateContribution.healing))),
  shielding: roundTo(average(outcomes.map((outcome) => outcome.candidateContribution.shielding))),
  support: roundTo(average(outcomes.map((outcome) => (
    outcome.candidateContribution.healing + outcome.candidateContribution.shielding
  )))),
  taken: roundTo(average(outcomes.map((outcome) => outcome.candidateContribution.taken))),
  pendingGroundEffects: roundTo(average(outcomes.map(
    (outcome) => outcome.candidateContribution.pendingGroundEffects,
  ))),
});

const pairKeys = new Set();
const pairs = focusIds.flatMap((focusId) => {
  const focus = UNIT_DEFS[focusId];
  return SHOP_UNITS
    .filter((peerId) => {
      const peer = UNIT_DEFS[peerId];
      return peerId !== focusId &&
        peer.cost === focus.cost &&
        peer.attackType === focus.attackType &&
        (!sameRoleOnly || roleGroup(peer) === roleGroup(focus)) &&
        (!sameCastTimingOnly || peer.abilityCastTiming === focus.abilityCastTiming);
    })
    .map((peerId) => {
      const ids = [focusId, peerId].sort();
      const key = ids.join(":");
      if (pairKeys.has(key)) return null;
      pairKeys.add(key);
      return { leftId: focusId, rightId: peerId };
    })
    .filter(Boolean);
});

const comparisons = [];
for (const round of rounds) {
  for (const star of stars) {
    for (const { leftId, rightId } of pairs) {
      const left = UNIT_DEFS[leftId];
      const right = UNIT_DEFS[rightId];
      if (left.cost > maximumCostForRound(round)) continue;
      const contexts = generateContexts(round, star, leftId, rightId);
      const observations = [];
      contexts.forEach((context, contextIndex) => {
        for (let seedIndex = 0; seedIndex < seedsPerContext; seedIndex += 1) {
          const seed = baseSeed + round * 10000 + star * 1000 + contextIndex * 31 + seedIndex;
          const leftOutcome = playBattle(round, star, leftId, context, seed);
          const rightOutcome = playBattle(round, star, rightId, context, seed);
          observations.push({
            contextIndex,
            seed,
            left: leftOutcome,
            right: rightOutcome,
            winDelta: Number(leftOutcome.won) - Number(rightOutcome.won),
            marginDelta: leftOutcome.margin - rightOutcome.margin,
          });
        }
      });
      const leftExclusiveWins = observations.filter((item) => item.winDelta > 0).length;
      const rightExclusiveWins = observations.filter((item) => item.winDelta < 0).length;
      comparisons.push({
        round,
        star,
        lineupSize: lineupSizeForRound(round),
        left: {
          id: leftId,
          name: left.name,
          cost: left.cost,
          attackType: left.attackType,
          castTiming: left.abilityCastTiming,
          roleGroup: roleGroup(left),
        },
        right: {
          id: rightId,
          name: right.name,
          cost: right.cost,
          attackType: right.attackType,
          castTiming: right.abilityCastTiming,
          roleGroup: roleGroup(right),
        },
        sameCastTiming: left.abilityCastTiming === right.abilityCastTiming,
        sameRoleGroup: roleGroup(left) === roleGroup(right),
        requestedContexts: contextsPerPair,
        matchedContexts: contexts.length,
        observations: observations.length,
        leftWinRate: roundTo(average(observations.map((item) => Number(item.left.won)))),
        rightWinRate: roundTo(average(observations.map((item) => Number(item.right.won)))),
        pairedWinRateDelta: roundTo(average(observations.map((item) => item.winDelta))),
        averageMarginDelta: roundTo(average(observations.map((item) => item.marginDelta))),
        leftExclusiveWins,
        rightExclusiveWins,
        sameResult: observations.length - leftExclusiveWins - rightExclusiveWins,
        leftSurvivalRate: roundTo(average(observations.map(
          (item) => Number(item.left.candidateSurvived),
        ))),
        rightSurvivalRate: roundTo(average(observations.map(
          (item) => Number(item.right.candidateSurvived),
        ))),
        leftContribution: averageContribution(observations.map((item) => item.left)),
        rightContribution: averageContribution(observations.map((item) => item.right)),
        timeoutRate: roundTo(average(observations.flatMap((item) => [
          Number(item.left.timedOut),
          Number(item.right.timedOut),
        ]))),
        contextExamples: contexts.slice(0, 3).map((context) => ({
          ids: context.background,
          names: context.background.map((id) => UNIT_DEFS[id].name),
          activeTraits: context.activeTraits,
        })),
      });
    }
  }
}

const focusSummary = focusIds.map((id) => {
  const relevant = comparisons.flatMap((comparison) => {
    if (comparison.left.id === id) return [{ comparison, direction: 1 }];
    if (comparison.right.id === id) return [{ comparison, direction: -1 }];
    return [];
  });
  const observationCount = relevant.reduce(
    (total, item) => total + item.comparison.observations,
    0,
  );
  const weighted = (selector) => observationCount > 0
    ? relevant.reduce(
      (total, item) => total + selector(item) * item.comparison.observations,
      0,
    ) / observationCount
    : 0;
  return {
    id,
    name: UNIT_DEFS[id].name,
    cost: UNIT_DEFS[id].cost,
    comparisons: relevant.length,
    observations: observationCount,
    averagePairedWinRateDelta: roundTo(weighted(
      ({ comparison, direction }) => comparison.pairedWinRateDelta * direction,
    )),
    averageMarginDelta: roundTo(weighted(
      ({ comparison, direction }) => comparison.averageMarginDelta * direction,
    )),
    exclusiveWins: relevant.reduce((total, { comparison, direction }) => total + (
      direction > 0 ? comparison.leftExclusiveWins : comparison.rightExclusiveWins
    ), 0),
    exclusiveLosses: relevant.reduce((total, { comparison, direction }) => total + (
      direction > 0 ? comparison.rightExclusiveWins : comparison.leftExclusiveWins
    ), 0),
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  method: [
    "Paired unit replacements use the same cost, star level, attack type, board slot, background roster, enemy wave, and battle seed.",
    "Contexts are accepted only when both lineups activate identical trait tiers and neither unit's exclusive traits are active.",
    "Win flips are the primary signal; remaining health and shields provide a continuous same-result margin.",
    "Candidate damage, healing, shielding, damage taken, and unresolved grounded effects are reported to diagnose role-specific contribution.",
  ].join(" "),
  configuration: {
    rounds,
    stars,
    focusIds,
    contextsPerPair,
    seedsPerContext,
    requestedLineupSize,
    baseSeed,
    sameRoleOnly,
    sameCastTimingOnly,
  },
  focusSummary,
  comparisons,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Wrote autochess replacement benchmark to ${outputPath}`);
  console.table(focusSummary);
} else {
  console.log(serialized.trimEnd());
}
