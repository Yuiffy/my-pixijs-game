import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const { AutoChessAutopilot } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);
const {
  GO_COMBAT_MODEL_SCHEMA,
  GO_COMBAT_MODEL_VERIFICATION,
  scoreGoCombatCandidate,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/goValueModel.ts",
);

test("Go级浏览器推理与 CUDA 导出的留出样本一致", () => {
  assert.equal(GO_COMBAT_MODEL_SCHEMA, "go-combat-ranker-v1");
  assert.equal(GO_COMBAT_MODEL_VERIFICATION.length, 5);
  GO_COMBAT_MODEL_VERIFICATION.forEach((fixture) => {
    const actual = scoreGoCombatCandidate(fixture);
    assert.equal(Number.isFinite(actual), true);
    assert.ok(
      Math.abs(actual - fixture.modelScore) < 0.0002,
      `expected ${fixture.modelScore}, received ${actual}`,
    );
  });
});

test("真正 Go级保留动态商店规划但不继承看穿2的固定阵容搜索", () => {
  const bridge = new EngineBridge(162001);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 20;
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);

  assert.equal(autopilot.usesSeer2Foundation(), false);
  assert.equal(autopilot.usesSeer2Economy(), true);
  assert.equal(autopilot.usesOraclePlanner(), true);
  assert.deepEqual(
    autopilot.formationProfileIds(),
    ["human_midline", "center_wedge", "split_flanks"],
  );
  assert.equal(autopilot.seer2PrincipalLineups([], 10).length, 0);
  assert.equal(autopilot.terminalTargets().length, 12);
});

test("Go级用神经模型扩展候选并只真实复核 Top-K", () => {
  const bridge = new EngineBridge(162002);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 24;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const ids = [
    "grove_mender",
    "lian",
    "rei",
    "yua",
    "cinder_ram",
    "spark_mage",
    "sui_flower",
    "xuehui",
    "sui_bird",
    "yukisyo",
    "cog_scribe",
    "rutice",
    "tower_god",
    "lovely",
  ];
  ids.slice(0, 10).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1620020 + index, id, star: 3 };
  });
  ids.slice(10).forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 1620030 + index, id, star: 3 };
  });

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const modelCalls = [];
  const rolloutCalls = [];
  autopilot.goModelScore = (lineup, formation) => {
    modelCalls.push({ lineup, formation });
    return lineup.reduce((sum, { unit }) => sum + unit.uid % 17, 0)
      + (formation === "split_flanks" ? 100 : 0);
  };
  autopilot.rolloutLineupScore = (lineup, formation, stableOnly = false) => {
    rolloutCalls.push({ lineup, formation, stableOnly });
    return lineup.reduce((sum, { unit }) => sum + unit.uid % 13, 0)
      + (stableOnly ? 100 : 0);
  };

  const chosen = autopilot.rolloutTargetLineup(autopilot.ownedEntries());
  const exploratory = rolloutCalls.filter(({ stableOnly }) => !stableOnly);
  const robust = rolloutCalls.filter(({ stableOnly }) => stableOnly);
  assert.equal(chosen.length, 10);
  assert.ok(modelCalls.length > rolloutCalls.length * 3);
  assert.ok(exploratory.length <= 24);
  assert.ok(robust.length <= 5);
  assert.ok(robust.length >= 4);
  assert.equal(modelCalls.some(({ formation }) => formation === "human_recorded"), false);
});
