import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";
import { computeAutoChessRolloutSourceFingerprint } from "./lib/autochess-rollout-cache.mjs";

const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { AutoChessAutopilot, snapshotAutopilotRolloutCache } = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");
const { scoreGoCombatCandidate } = await loadTypescriptModule("src/components/autoChessGame/ai/goValueModel.ts");
const { UNIT_COMBAT_FEATURE_NAMES, currentUnitCombatFeatures } = await loadTypescriptModule("src/components/autoChessGame/ai/unitCombatFeatures.ts");
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const seedBase = Number(option("--seed", "78000"));
const runs = Number(option("--runs", "16"));
const candidates = Number(option("--candidates", "24"));
const output = path.resolve(option("--output", "artifacts/autochess-on-policy.json"));
const sourceFingerprint = (await computeAutoChessRolloutSourceFingerprint()).hash;
const startedAt = performance.now();
let contexts = 0;

for (let run = 0; run < runs; run += 1) {
  const bridge = new EngineBridge(seedBase + run, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  const seen = new Map();
  const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal", 20, (evaluation) => {
    const tokens = evaluation.players;
    const key = tokens.map(({ id, star, position }) => `${position}:${id}:${star}`).join(",");
    seen.set(key, tokens);
    return scoreGoCombatCandidate(evaluation);
  }, false, "veteran");
  const teacher = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal", 60);
  teacher.rolloutVariantLimit = 1;
  pilot.startFromTitle();
  let now = 1000;
  for (let tick = 0; tick < 5000 && bridge.engine.state.phase !== "gameover" && bridge.engine.state.round <= 32; tick += 1) {
    now += 2400;
    if (bridge.engine.state.phase === "battle") {
      const all = [...seen.values()];
      const sampled = Array.from({ length: Math.min(candidates, all.length) }, (_, index) => (
        all[Math.floor(index * all.length / Math.min(candidates, all.length))]
      ));
      sampled.push(bridge.engine.state.board.flatMap((unit, position) => unit ? [{ ...unit, position }] : []));
      for (const tokens of sampled) {
        teacher.rolloutPlacementsScore(tokens.map(({ id, star, position }, index) => ({
          entry: { unit: { uid: 1000 + index, id, star }, location: { zone: "board", index: position } },
          slot: position,
        })), true, 60);
      }
      contexts += 1;
      seen.clear();
      bridge.skipBattle();
    } else pilot.tick(now);
  }
  console.error(JSON.stringify({ run: run + 1, runs, contexts, entries: snapshotAutopilotRolloutCache().length }));
}
if ((await computeAutoChessRolloutSourceFingerprint()).hash !== sourceFingerprint) {
  throw new Error("Game rules changed during on-policy label generation");
}
const payload = {
  schema: "go-combat-dataset-v2", sourceFingerprint,
  generatedAt: new Date().toISOString(), labelMode: "on-policy-current-combat",
  seedBase, runs, contexts, candidatesPerContext: candidates, combatHz: 60,
  elapsedSeconds: (performance.now() - startedAt) / 1000,
  unitFeatureNames: [...UNIT_COMBAT_FEATURE_NAMES], unitFeatures: currentUnitCombatFeatures(),
  entries: snapshotAutopilotRolloutCache(),
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(payload));
console.log(JSON.stringify({ output, contexts, entries: payload.entries.length, elapsedSeconds: payload.elapsedSeconds }));
