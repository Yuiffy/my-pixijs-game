import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const { AutoChessEngine } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameEngine.ts",
);
const {
  AUGMENTS,
  STARTERS,
  TRAITS,
  UNIT_DEFS,
  WAVES,
  traitLevelForCount,
} = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const STRATEGIES = ["tempo", "economy", "traits"];
const STAR_VALUE = { 1: 1, 2: 2.35, 3: 5.5 };
const MELEE_SLOTS = [5, 11, 17, 23, 4, 10, 16, 22, 3, 9];
const RANGED_SLOTS = [0, 6, 12, 18, 1, 7, 13, 19, 2, 8];

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const runsPerStrategy = Math.max(1, Math.min(100, Number(option("--runs", "12")) || 12));
const baseSeed = Math.max(1, Number(option("--seed", "42000")) || 42000);
const outputPath = option("--output", "");
const balanceProfile = option("--balance-profile", "current");

if (balanceProfile === "legacy") {
  const legacyBudgets = [2, 5, 9, 18, 16, 17, 21, 32];
  WAVES.forEach((wave, index) => {
    if (index >= legacyBudgets.length) return;
    const compositionValue = wave.units.reduce(
      (sum, unit) => sum + UNIT_DEFS[unit.id].cost * (unit.star === 2 ? 3 : unit.star === 3 ? 9 : 1),
      0,
    );
    wave.modifier = Math.sqrt(legacyBudgets[index] / compositionValue);
  });
} else if (balanceProfile !== "current") {
  throw new Error(`Unknown balance profile: ${balanceProfile}`);
}

const ownedLocations = (engine) => [
  ...engine.state.board.flatMap((unit, index) => unit ? [{ unit, zone: "board", index }] : []),
  ...engine.state.bench.flatMap((unit, index) => unit ? [{ unit, zone: "bench", index }] : []),
];

const boardSnapshot = (engine) => {
  const board = engine.state.board.flatMap((unit, slot) => unit ? [{
    id: unit.id,
    name: UNIT_DEFS[unit.id].name,
    star: unit.star,
    slot,
  }] : []);
  const uniqueIds = new Set(board.map((unit) => unit.id));
  const traits = Object.values(TRAITS).flatMap((trait) => {
    const count = [...uniqueIds].filter((id) => UNIT_DEFS[id].traits.includes(trait.id)).length;
    const level = traitLevelForCount(trait, count);
    return level ? [{ id: trait.id, name: trait.name, count, level }] : [];
  });
  return { board, traits };
};

const unitScore = (unit, strategy, roster, round) => {
  const definition = UNIT_DEFS[unit.id];
  const duplicateCount = roster.filter(({ unit: owned }) => owned.id === unit.id).length;
  const traitPartners = definition.traits.reduce(
    (sum, trait) => sum + roster.filter(({ unit: owned }) => owned.id !== unit.id && UNIT_DEFS[owned.id].traits.includes(trait)).length,
    0,
  );
  const base = definition.cost * 12 * STAR_VALUE[unit.star] + unit.star * 5;
  if (strategy === "tempo") return base + (round <= 5 ? (6 - definition.cost) * 3 : 0) + duplicateCount * 7;
  if (strategy === "economy") return base + definition.cost * 4 + (round >= 7 ? definition.tier * 3 : 0);
  return base + traitPartners * 7 + duplicateCount * 5;
};

const lineupScore = (entries, strategy) => {
  const uniqueIds = new Set(entries.map(({ unit }) => unit.id));
  const base = entries.reduce((sum, { unit }) => {
    const definition = UNIT_DEFS[unit.id];
    return sum + definition.cost * 12 * STAR_VALUE[unit.star] + unit.star * 5;
  }, 0);
  const traitScore = Object.values(TRAITS).reduce((sum, trait) => {
    const count = [...uniqueIds].filter((id) => UNIT_DEFS[id].traits.includes(trait.id)).length;
    const level = traitLevelForCount(trait, count);
    if (!level) return sum;
    const strategyMultiplier = strategy === "traits" ? 1.55 : strategy === "economy" && trait.id === "finance" ? 1.35 : 1;
    return sum + (7 + count * 2 + level * 4) * level * strategyMultiplier;
  }, 0);
  const meleeCount = entries.filter(({ unit }) => UNIT_DEFS[unit.id].attackType === "melee").length;
  const rangedCount = entries.length - meleeCount;
  const desiredMelee = Math.max(1, Math.ceil(entries.length * 0.4));
  const roleScore = -Math.max(0, desiredMelee - meleeCount) * 22 - (rangedCount ? 0 : 12);
  const supportCount = entries.filter(({ unit }) => UNIT_DEFS[unit.id].abilityCastTiming.startsWith("support")).length;
  const supportPenalty = Math.max(0, supportCount - Math.max(1, Math.floor(entries.length / 3))) * 14;
  const duplicates = entries.length - uniqueIds.size;
  return base + traitScore + roleScore - supportPenalty - duplicates * 11;
};

const bestLineup = (roster, cap, strategy) => {
  if (roster.length <= cap) return roster;
  let best = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  const current = [];
  const search = (start) => {
    if (current.length === cap) {
      const score = lineupScore(current, strategy);
      if (score > bestScore) {
        bestScore = score;
        best = [...current];
      }
      return;
    }
    const remaining = cap - current.length;
    for (let index = start; index <= roster.length - remaining; index += 1) {
      current.push(roster[index]);
      search(index + 1);
      current.pop();
    }
  };
  search(0);
  return best;
};

const deployBest = (engine, strategy) => {
  const roster = ownedLocations(engine);
  const desired = bestLineup(roster, engine.boardCap, strategy)
    .map(({ unit }) => unit.uid);
  const desiredSet = new Set(desired);

  engine.state.board.forEach((unit, index) => {
    if (!unit || desiredSet.has(unit.uid)) return;
    const emptyBench = engine.state.bench.findIndex((slot) => !slot);
    if (emptyBench >= 0) engine.moveUnit({ zone: "board", index }, "bench", emptyBench);
    else engine.sellUnit("board", index);
  });

  const melee = desired.filter((uid) => {
    const entry = ownedLocations(engine).find(({ unit }) => unit.uid === uid);
    return entry && UNIT_DEFS[entry.unit.id].attackType === "melee";
  });
  const ranged = desired.filter((uid) => !melee.includes(uid));
  const placements = [
    ...melee.map((uid, index) => ({ uid, slot: MELEE_SLOTS[index] })),
    ...ranged.map((uid, index) => ({ uid, slot: RANGED_SLOTS[index] })),
  ];
  placements.forEach(({ uid, slot }) => {
    const current = ownedLocations(engine).find(({ unit }) => unit.uid === uid);
    if (!current || (current.zone === "board" && current.index === slot)) return;
    engine.moveUnit({ zone: current.zone, index: current.index }, "board", slot);
  });
};

const trimBench = (engine, strategy, reserveSlots = 2) => {
  while (engine.state.bench.filter(Boolean).length > engine.state.bench.length - reserveSlots) {
    const roster = ownedLocations(engine);
    const candidate = engine.state.bench
      .flatMap((unit, index) => unit ? [{ unit, index }] : [])
      .sort((left, right) => unitScore(left.unit, strategy, roster, engine.state.round) - unitScore(right.unit, strategy, roster, engine.state.round))[0];
    if (!candidate) break;
    engine.sellUnit("bench", candidate.index);
  }
};

const buyShop = (engine, strategy, friction, rerollLimit = null, fillOnly = false) => {
  const reserve = strategy === "economy" ? Math.min(20, engine.state.round * 2) : strategy === "traits" ? 5 : 2;
  const rerolls = rerollLimit ?? (strategy === "tempo" ? 2 : strategy === "traits" ? 1 : 0);
  for (let pass = 0; pass <= rerolls; pass += 1) {
    trimBench(engine, strategy);
    const roster = ownedLocations(engine);
    const populationShortage = roster.length < engine.boardCap;
    const candidates = engine.state.shop
      .flatMap((id, index) => id ? [{ id, index, definition: UNIT_DEFS[id] }] : [])
      .map((candidate) => ({
        ...candidate,
        score: unitScore({ id: candidate.id, star: 1 }, strategy, roster, engine.state.round),
      }))
      .sort((left, right) => populationShortage
        ? left.definition.cost - right.definition.cost || right.score - left.score
        : right.score - left.score);
    candidates.forEach(({ index, definition }) => {
      const needsPopulation = ownedLocations(engine).length < engine.boardCap;
      const duplicate = ownedLocations(engine).some(({ unit }) => unit.id === definition.id);
      const partnered = ownedLocations(engine).some(({ unit }) => UNIT_DEFS[unit.id].traits.some((trait) => definition.traits.includes(trait)));
      const shouldBuy = needsPopulation || (strategy === "tempo"
        ? definition.cost <= Math.max(2, Math.ceil(engine.state.round / 4)) || duplicate
        : strategy === "economy"
          ? definition.cost >= 3 || duplicate
          : partnered || duplicate || definition.cost <= 2);
      const effectiveReserve = needsPopulation ? 0 : reserve;
      if ((fillOnly && !needsPopulation) || !shouldBuy || engine.state.gold - definition.cost < effectiveReserve) return;
      const before = engine.state.shop[index];
      engine.buyShopUnit(index);
      if (before && engine.state.shop[index] === before) friction.failedPurchases += 1;
    });
    deployBest(engine, strategy);
    if (pass === rerolls) break;
    if (!engine.state.freeRerollCharges && engine.state.gold <= reserve + 1) break;
    engine.rerollShop();
  }
};

const upgrade = (engine, strategy) => {
  const targetLevel = Math.min(
    10,
    strategy === "economy"
      ? 3 + Math.floor((engine.state.round + 2) / 2)
      : strategy === "tempo"
        ? 3 + Math.floor(engine.state.round / 3)
        : 3 + Math.floor((engine.state.round + 1) / 3),
  );
  const reserve = strategy === "economy" ? Math.min(20, engine.state.round * 2) : 2;
  while (
    engine.state.playerLevel < targetLevel &&
    engine.upgradeCost !== null &&
    engine.state.gold - engine.upgradeCost >= reserve
  ) engine.buyExperience();
};

const chooseStarter = (engine, strategy) => {
  const preference = strategy === "tempo"
    ? ["ranger_start", "dance_start", "mature_start", "bastion", "traffic_start", "blaze"]
    : strategy === "economy"
      ? ["mature_start", "traffic_start", "dance_start", "ranger_start", "bastion", "blaze"]
      : ["mature_start", "dance_start", "ranger_start", "bastion", "traffic_start", "blaze"];
  return preference.find((id) => engine.state.starterChoices.includes(id)) || engine.state.starterChoices[0];
};

const chooseAugment = (engine, strategy) => {
  const preferred = strategy === "economy"
    ? ["payday", "vitality", "tempered", "momentum", "second_wind", "united_front", "triage", "execution"]
    : strategy === "tempo"
      ? ["sharp_edge", "momentum", "vitality", "precision", "execution", "second_wind", "united_front", "overclock"]
      : ["vitality", "momentum", "tempered", "precision", "united_front", "triage", "second_wind", "overclock"];
  const index = engine.state.augmentChoices.findIndex((id) => preferred.includes(id));
  engine.chooseAugment(index >= 0 ? index : 0);
};

const playRun = (seed, strategy) => {
  const engine = new AutoChessEngine(seed);
  const friction = { failedPurchases: 0, fullBenchRounds: 0, underfilledRounds: 0 };
  engine.startRun(chooseStarter(engine, strategy));
  const rounds = [];
  let safety = 0;
  while (engine.state.phase !== "gameover" && safety < 60) {
    safety += 1;
    if (engine.state.phase === "augment") {
      chooseAugment(engine, strategy);
      continue;
    }
    if (engine.state.phase === "result") {
      engine.continueAfterResult();
      continue;
    }
    if (engine.state.phase !== "preparation") break;

    // Fill the current cap before spending on a level, then fill any newly
    // opened slot. This mirrors competent play and avoids false difficulty
    // caused by an underfilled board.
    buyShop(engine, strategy, friction, 0, true);
    upgrade(engine, strategy);
    buyShop(engine, strategy, friction);
    deployBest(engine, strategy);
    if (engine.state.bench.every(Boolean)) friction.fullBenchRounds += 1;
    if (engine.boardCount < engine.boardCap) friction.underfilledRounds += 1;
    const snapshot = boardSnapshot(engine);
    const preparation = {
      round: engine.state.round,
      gold: engine.state.gold,
      level: engine.state.playerLevel,
      boardCount: engine.boardCount,
      boardValue: engine.state.board.reduce((sum, unit) => sum + (unit ? UNIT_DEFS[unit.id].cost * STAR_VALUE[unit.star] : 0), 0),
      benchCount: engine.state.bench.filter(Boolean).length,
      roster: snapshot.board,
      traits: snapshot.traits,
    };
    engine.startBattle();
    let steps = 0;
    while (engine.state.phase === "battle" && steps < 1600) {
      engine.update(1 / 60);
      steps += 1;
    }
    if (engine.state.phase === "battle") throw new Error(`battle did not finish for seed ${seed}, round ${engine.state.round}`);
    const battle = engine.state.battle;
    rounds.push({
      ...preparation,
      won: engine.state.result?.won || false,
      hpAfter: engine.state.hp,
      elapsed: battle ? Number(battle.elapsed.toFixed(2)) : 0,
      timedOut: Boolean(battle && battle.elapsed >= battle.limit - 0.01),
      playerSurvivors: battle?.player.filter((fighter) => fighter.alive).length || 0,
      enemySurvivors: battle?.enemy.filter((fighter) => fighter.alive).length || 0,
      lossDamage: engine.state.result?.damage || 0,
      income: engine.state.result?.income || 0,
      units: battle?.player.map((fighter) => ({
        id: fighter.unitId,
        star: fighter.star,
        damage: Number(fighter.damageDealt.toFixed(1)),
        support: Number((fighter.healingDone + fighter.shieldingDone).toFixed(1)),
        survived: fighter.alive,
      })) || [],
    });
  }
  return {
    seed,
    strategy,
    rounds,
    wins: rounds.filter((round) => round.won).length,
    losses: rounds.filter((round) => !round.won).length,
    finalRound: rounds.at(-1)?.round || 0,
    finalHp: engine.state.hp,
    campaignCleared: engine.state.endlessUnlocked,
    friction,
  };
};

const runs = STRATEGIES.flatMap((strategy, strategyIndex) =>
  Array.from({ length: runsPerStrategy }, (_, index) => playRun(baseSeed + strategyIndex * 1000 + index, strategy)),
);

const aggregateStrategy = (strategy) => {
  const matches = runs.filter((run) => run.strategy === strategy);
  const roundNumbers = [...new Set(matches.flatMap((run) => run.rounds.map((round) => round.round)))].sort((a, b) => a - b);
  return {
    runs: matches.length,
    campaignClearRate: matches.filter((run) => run.campaignCleared).length / matches.length,
    averageFinalRound: matches.reduce((sum, run) => sum + run.finalRound, 0) / matches.length,
    averageWins: matches.reduce((sum, run) => sum + run.wins, 0) / matches.length,
    averageFinalHp: matches.reduce((sum, run) => sum + run.finalHp, 0) / matches.length,
    failedPurchases: matches.reduce((sum, run) => sum + run.friction.failedPurchases, 0),
    fullBenchRounds: matches.reduce((sum, run) => sum + run.friction.fullBenchRounds, 0),
    underfilledRounds: matches.reduce((sum, run) => sum + run.friction.underfilledRounds, 0),
    rounds: roundNumbers.map((round) => {
      const samples = matches.flatMap((run) => run.rounds.filter((entry) => entry.round === round));
      return {
        round,
        samples: samples.length,
        winRate: samples.filter((sample) => sample.won).length / samples.length,
        timeoutRate: samples.filter((sample) => sample.timedOut).length / samples.length,
        averageGold: samples.reduce((sum, sample) => sum + sample.gold, 0) / samples.length,
        averageBoardCount: samples.reduce((sum, sample) => sum + sample.boardCount, 0) / samples.length,
        averageBoardValue: samples.reduce((sum, sample) => sum + sample.boardValue, 0) / samples.length,
        averageEnemySurvivorsOnLoss: (() => {
          const losses = samples.filter((sample) => !sample.won);
          return losses.length
            ? losses.reduce((sum, sample) => sum + sample.enemySurvivors, 0) / losses.length
            : 0;
        })(),
      };
    }),
  };
};

const unitRows = Object.keys(UNIT_DEFS).flatMap((id) => {
  const appearances = runs.flatMap((run) => run.rounds.flatMap((round) => round.units.map((unit) => ({ ...unit, won: round.won })))).filter((unit) => unit.id === id);
  if (appearances.length < Math.max(3, Math.floor(runsPerStrategy / 2))) return [];
  return [{
    id,
    name: UNIT_DEFS[id].name,
    cost: UNIT_DEFS[id].cost,
    appearances: appearances.length,
    winRate: appearances.filter((entry) => entry.won).length / appearances.length,
    averageDamage: appearances.reduce((sum, entry) => sum + entry.damage, 0) / appearances.length,
    averageSupport: appearances.reduce((sum, entry) => sum + entry.support, 0) / appearances.length,
    survivalRate: appearances.filter((entry) => entry.survived).length / appearances.length,
  }];
}).sort((left, right) => right.appearances - left.appearances);

const report = {
  generatedAt: new Date().toISOString(),
  configuration: { runsPerStrategy, baseSeed, balanceProfile, strategies: STRATEGIES },
  strategies: Object.fromEntries(STRATEGIES.map((strategy) => [strategy, aggregateStrategy(strategy)])),
  units: unitRows,
  runs,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Wrote autochess simulation report to ${outputPath}`);
} else {
  console.log(serialized.trimEnd());
}
