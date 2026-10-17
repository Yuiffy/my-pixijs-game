// Re-evaluate stored public combat compositions under the current battle rules.
// This creates standardized scenarios, not exact saved-run replays: old cache
// keys omit owned UIDs and explicit enemy formation indices.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";
import { computeAutoChessRolloutSourceFingerprint } from "./lib/autochess-rollout-cache.mjs";

const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
};
const input = option("--input");
const output = option("--output");
const source = JSON.parse(await readFile(input, "utf8"));
const fingerprint = (await computeAutoChessRolloutSourceFingerprint()).hash;
const { AutoChessEngine } = await loadTypescriptModule("src/components/autoChessGame/core/gameEngine.ts");
const { scorePreparedAutoChessCombat } = await loadTypescriptModule("src/components/autoChessGame/ai/rolloutCombat.ts");
const { currentUnitCombatFeatures, UNIT_COMBAT_FEATURE_NAMES } = await loadTypescriptModule("src/components/autoChessGame/ai/unitCombatFeatures.ts");
const entries = [];
const started = performance.now();
let changedOutcomes = 0;
for (const [key, oldScore] of source.entries) {
  const parts = key.split("/");
  if (![9, 11].includes(parts.length) || parts[1] !== "hz:60") {
    throw new Error(`Unsupported cache scenario: ${key}`);
  }
  const [starter, augmentText, tag, modifierText, enemies, players, branch] = parts.slice(-7);
  if (!branch.startsWith("actual:")) throw new Error(`Unsupported random branch: ${branch}`);
  const simulation = new AutoChessEngine(1, { telemetry: false, visualEffects: false });
  simulation.state.starterChoices = [starter];
  simulation.startRun(starter);
  simulation.state.round = parts.length === 11 ? Number(parts[3].slice("round:".length)) : 1;
  simulation.state.playerLevel = 10;
  simulation.state.augments = augmentText ? augmentText.split(",") : [];
  simulation.state.board.fill(null);
  simulation.state.bench.fill(null);
  for (const token of players.split(",")) {
    const [slotText, id, starText] = token.split(":");
    const slot = Number(slotText);
    simulation.state.board[slot] = { uid: 1000 + slot, id, star: Number(starText) };
  }
  simulation.previewWave = { ...simulation.currentWave, tag, modifier: Number(modifierText),
    units: enemies.split(",").map((token) => {
      const [id, star] = token.split(":");
      return { id, star: Number(star) };
    }) };
  simulation.restoreRandomState(Number(branch.slice("actual:".length)));
  const score = scorePreparedAutoChessCombat(simulation, 60);
  if (!Number.isFinite(score)) throw new Error(`Combat did not finish: ${key}`);
  changedOutcomes += Number((score >= 10000) !== (oldScore >= 10000));
  entries.push([key, score]);
  if (entries.length % 500 === 0) console.log(JSON.stringify({ count: entries.length,
    total: source.entries.length, changedOutcomes, seconds: (performance.now() - started) / 1000 }));
}
if ((await computeAutoChessRolloutSourceFingerprint()).hash !== fingerprint) {
  throw new Error("Battle rules changed while relabelling");
}
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ schema: "autochess-standardized-combat-v1",
  sourceFingerprint: fingerprint, input, inputFingerprint: source.sourceFingerprint,
  standardizedPlayerUids: true, defaultEnemyFormation: true, combatHz: 60,
  unitFeatureNames: [...UNIT_COMBAT_FEATURE_NAMES], unitFeatures: currentUnitCombatFeatures(),
  generatedAt: new Date().toISOString(), changedOutcomes, entries }));
console.log(JSON.stringify({ output, entries: entries.length, changedOutcomes,
  seconds: (performance.now() - started) / 1000 }));
