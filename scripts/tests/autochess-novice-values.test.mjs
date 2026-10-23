import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { loadTypescriptModule } = await import(new URL("./helpers/load-typescript-module.mjs", import.meta.url));

const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { AutoChessAutopilot } = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");
const { UNIT_DEFS } = await loadTypescriptModule("src/components/autoChessGame/core/gameData.ts");
const { default: values } = await loadTypescriptModule("src/components/autoChessGame/ai/chromeUnitValues.json");

test("快速档单位值来自有记录的训练器，并保持费用基准上下50%的边界", async () => {
  assert.match(values.sourceFingerprint, /^[a-f0-9]{64}$/);
  const learner = await readFile("scripts/train-autochess-unit-values.py");
  assert.equal(values.learnerSha256, createHash("sha256").update(learner).digest("hex"));
  for (const [id, value] of Object.entries(values.values)) {
    assert.ok(Number.isFinite(value) && value > 0, id);
    const base = UNIT_DEFS[id].cost * 12;
    assert.ok(value >= base * 0.5 - 0.001 && value <= base * 1.5 + 0.001, id);
  }
});

test("新手和老手只在战斗估值使用新表，经济估值和高档保持原值", () => {
  const id = Object.keys(values.values).find((key) => Math.abs(values.values[key] - UNIT_DEFS[key].cost * 12) > 1);
  assert.ok(id, "训练表应有实际学习的差异");
  const bridge = new EngineBridge(90200, 1, { simulation: true });
  bridge.setConsoleLogging(false);
  const roster = [{ unit: { uid: 1, id, star: 1 }, location: { zone: "board", index: 0 } }];
  const makePilot = (level) => new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => { throw new Error("Static values must not request model inference"); },
    true,
    level
  );
  const novice = makePilot("novice");
  const original = novice.unitScore(roster[0].unit, roster);
  for (const level of ["novice", "veteran"]) {
    const pilot = makePilot(level);
    assert.notEqual(pilot.unitScore(roster[0].unit, roster, true), original, level);
    assert.equal(pilot.unitScore(roster[0].unit, roster), original, level);
    assert.equal(pilot.unitScore(roster[0].unit, roster, false), original, level);
  }
  for (const level of ["deep", "oracle", "go"]) {
    const pilot = makePilot(level);
    assert.equal(pilot.unitScore(roster[0].unit, roster, true), original, level);
    assert.equal(pilot.unitScore(roster[0].unit, roster, false), original, level);
  }
});
