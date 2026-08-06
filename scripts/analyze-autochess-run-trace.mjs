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
  const goldDelta = start && end ? end.gold - start.gold : null;
  return {
    round,
    phase: end?.phase || null,
    hp: end?.hp ?? null,
    goldStart: start?.gold ?? null,
    goldEnd: end?.gold ?? null,
    goldDelta,
    interestStart: start?.interest ?? null,
    interestEnd: end?.interest ?? null,
    levelStart: start?.level ?? null,
    levelEnd: end?.level ?? null,
    boardCount: end?.board?.length ?? battle?.formation?.player?.length ?? 0,
    benchCount: end?.bench?.length ?? 0,
    traits: end?.traits || [],
    actions: countActions(entries),
    actionSequence: entries.map((entry) => entry.action),
    formation: battle ? unitSummary(battle.formation?.player) : [],
    enemyFormation: battle ? unitSummary(battle.formation?.enemy) : [],
    battleResult: battle?.result || null,
  };
});

const firstRoundWith = (predicate) => rounds.find(predicate)?.round ?? null;
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
    firstTenUnitRound: firstRoundWith((round) => round.boardCount >= 10),
    firstMaxInterestRound: firstRoundWith((round) => (round.interestEnd || 0) >= 20),
    firstFourFinanceRound: firstRoundWith((round) => (
      round.traits.some((trait) => trait.id === "finance" && trait.level >= 2)
    )),
  },
  rounds,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, ...report.totals }, null, 2));
