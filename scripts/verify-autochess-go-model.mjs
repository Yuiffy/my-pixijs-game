import { readFile } from "node:fs/promises";
import { computeAutoChessRolloutSourceFingerprint } from "./lib/autochess-rollout-cache.mjs";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const modelPath = process.argv[2] || "src/components/autoChessGame/ai/goCombatModel.json";
const model = JSON.parse(await readFile(modelPath, "utf8"));
const { hash } = await computeAutoChessRolloutSourceFingerprint();
const { SHOP_UNIT_IDS } = await loadTypescriptModule("src/components/autoChessGame/core/gameData.ts");
const { UNIT_COMBAT_FEATURE_NAMES } = await loadTypescriptModule("src/components/autoChessGame/ai/unitCombatFeatures.ts");
const missingUnits = SHOP_UNIT_IDS.filter((id) => !model.vocab.units.includes(id));
const missingFeatures = UNIT_COMBAT_FEATURE_NAMES.filter((name) => !model.unitFeatureNames.includes(name));
const current = model.sourceFingerprint === hash && missingUnits.length === 0 && missingFeatures.length === 0;
console.log(JSON.stringify({
  modelPath,
  trainedAt: model.trainedAt,
  current,
  sourceFingerprint: model.sourceFingerprint || null,
  expectedFingerprint: hash,
  missingUnits,
  missingFeatures,
}, null, 2));
if (!current) process.exitCode = 1;
