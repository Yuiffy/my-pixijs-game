import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const inputPath = path.resolve(valueAfter("--input", "artifacts/autochess-human-recovered-latest.json"));
const outputPath = path.resolve(valueAfter(
  "--output",
  "artifacts/autochess-human-run-analysis.json",
));

const trace = JSON.parse(await readFile(inputPath, "utf8"));
const actionsByRound = new Map();
for (const entry of trace.actions || []) {
  const round = entry.before?.round ?? entry.after?.round ?? 0;
  if (!actionsByRound.has(round)) actionsByRound.set(round, []);
  actionsByRound.get(round).push(entry);
}
const battlesByRound = new Map((trace.battles || []).map((battle) => [battle.round, battle]));
const allRounds = [...new Set([...actionsByRound.keys(), ...battlesByRound.keys()])]
  .filter((round) => round > 0)
  .sort((left, right) => left - right);

const countActions = (entries) => entries.reduce((counts, entry) => {
  const type = entry.action?.type || "unknown";
  counts[type] = (counts[type] || 0) + 1;
  return counts;
}, {});
const unitSummary = (units = []) => units.map((unit) => ({
  slot: unit.slot,
  id: unit.id,
  name: unit.name,
  star: unit.star,
}));

const rounds = allRounds.map((round) => {
  const entries = actionsByRound.get(round) || [];
  const battle = battlesByRound.get(round) || null;
  const start = entries[0]?.before || null;
  const end = entries.at(-1)?.after || start;
  const battleAction = entries.find((entry) => entry.action?.type === "battle") || null;
  const continueAction = entries.find((entry) => entry.action?.type === "resultContinue") || null;
  const battleState = battleAction?.before || end;
  const formation = battle ? unitSummary(battle.formation?.player) : [];
  const actionCounts = countActions(entries);
  const goldDelta = start && end ? end.gold - start.gold : null;
  return {
    round,
    phase: end?.phase || null,
    hp: end?.hp ?? null,
    hpStart: start?.hp ?? null,
    hpAtBattle: battleState?.hp ?? null,
    hpAfter: continueAction?.after?.hp ?? end?.hp ?? null,
    goldStart: start?.gold ?? null,
    goldEnd: end?.gold ?? null,
    goldAtBattle: battleState?.gold ?? null,
    goldDelta,
    interestStart: start?.interest ?? null,
    interestEnd: end?.interest ?? null,
    interestAtBattle: battleState?.interest ?? null,
    levelStart: start?.level ?? null,
    levelEnd: end?.level ?? null,
    levelAtBattle: battleState?.level ?? null,
    boardCount: end?.board?.length ?? battle?.formation?.player?.length ?? 0,
    benchCount: end?.bench?.length ?? 0,
    benchAtBattle: battleState?.bench?.length ?? null,
    traits: end?.traits || [],
    actions: actionCounts,
    actionSequence: entries.map((entry) => entry.action),
    formation,
    threeStarCount: formation.filter((unit) => unit.star === 3).length,
    enemyFormation: battle ? unitSummary(battle.formation?.enemy) : [],
    won: battle?.result?.won ?? null,
    battleResult: battle?.result || null,
  };
});

const firstRoundWith = (predicate) => rounds.find(predicate)?.round ?? null;
const lossRounds = rounds.filter((round) => round.won === false).map((round) => round.round);
const rollDownRounds = rounds
  .filter((round) => (round.actions.reroll || 0) >= 5)
  .map((round) => ({
    round: round.round,
    rerolls: round.actions.reroll,
    buys: round.actions.shop || 0,
    sells: round.actions.sell || 0,
    goldStart: round.goldStart,
    goldAtBattle: round.goldAtBattle,
    interestAtBattle: round.interestAtBattle,
    threeStarCount: round.threeStarCount,
    won: round.won,
  }));
const finalPlayer = trace.state?.player || {};
const report = {
  source: path.relative(process.cwd(), inputPath).replaceAll("\\", "/"),
  capturedAt: trace.capturedAt || null,
  version: trace.version || null,
  finalState: trace.state || null,
  totals: {
    actions: trace.actions?.length || 0,
    battles: trace.battles?.length || 0,
    battleEvents: trace.trace?.battleEvents || 0,
    actionTypes: countActions(trace.actions || []),
    wins: (trace.battles || []).filter((battle) => battle.result?.won).length,
    losses: lossRounds.length,
    lossRounds,
    finalRound: trace.state?.round ?? null,
    finalHp: finalPlayer.hp ?? trace.state?.hp ?? null,
    finalScore: finalPlayer.score ?? trace.state?.score ?? null,
    firstTenUnitRound: firstRoundWith((round) => round.boardCount >= 10),
    firstMaxInterestRound: firstRoundWith((round) => (round.interestEnd || 0) >= 20),
    firstFourFinanceRound: firstRoundWith((round) => (
      round.traits.some((trait) => trait.id === "finance" && trait.level >= 2)
    )),
    firstTenThreeStarRound: firstRoundWith((round) => (
      round.formation.length >= 10 && round.formation.every((unit) => unit.star === 3)
    )),
    maximumRerollsInRound: Math.max(0, ...rounds.map((round) => round.actions.reroll || 0)),
  },
  finalLineup: {
    board: (trace.state?.board || []).map((unit) => ({
      slot: unit.index,
      id: unit.id,
      name: unit.name,
      star: unit.star,
    })),
    bench: (trace.state?.bench || []).map((unit) => ({
      slot: unit.index,
      id: unit.id,
      name: unit.name,
      star: unit.star,
    })),
    traits: trace.state?.activeTraits || [],
    augments: trace.state?.augmentHistory || [],
  },
  rollDownRounds,
  rounds,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, ...report.totals }, null, 2));
