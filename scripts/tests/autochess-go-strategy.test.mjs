import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const {
  EngineBridge,
  GO_ENEMY_SEEDS,
  goEnemySeedForShopSeed,
} = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const {
  AutoChessAutopilot,
  snapshotAutopilotRolloutCache,
} = await loadTypescriptModule(
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
  assert.equal(GO_COMBAT_MODEL_SCHEMA, "go-combat-ranker-v2");
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
    ["go_canonical"],
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
  assert.equal(modelCalls.every(({ formation }) => formation === "go_canonical"), true);
});

test("Go级规范站位不依赖 UID、购买顺序或当前棋盘顺序", () => {
  const bridge = new EngineBridge(162003);
  bridge.setConsoleLogging(false);
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const units = [
    ["rei", 3],
    ["lian", 2],
    ["cinder_ram", 3],
    ["spark_mage", 1],
    ["grove_mender", 2],
    ["yua", 3],
  ];
  const makeLineup = (ordered, uidBase) => ordered.map(([id, star], index) => ({
    unit: { uid: uidBase + index * 17, id, star },
    location: { zone: "board", index: (index * 5) % 24 },
  }));
  const signatures = [];
  autopilot.rolloutPlacementsScore = (placements) => {
    signatures.push(placements
      .map(({ entry, slot }) => `${slot}:${entry.unit.id}:${entry.unit.star}`)
      .sort()
      .join(","));
    return 0;
  };

  autopilot.rolloutLineupScore(makeLineup(units, 1000), "go_canonical");
  autopilot.rolloutLineupScore(makeLineup([...units].reverse(), 9000), "go_canonical");

  assert.equal(signatures.length, 2);
  assert.equal(signatures[0], signatures[1]);
  assert.equal(new Set(signatures[0].split(",").map((token) => token.split(":")[0])).size, units.length);
});

test("Go级将商店种子映射到两套固定敌方战役且不改变商店", () => {
  assert.deepEqual(GO_ENEMY_SEEDS, [152100, 152102]);
  const evenBridge = new EngineBridge(162100);
  evenBridge.setConsoleLogging(false);
  new AutoChessAutopilot(evenBridge, "evolution", {}, "go", "oracle", 20);
  evenBridge.engine.state.starterChoices = ["bastion"];
  evenBridge.dispatch({ type: "starter", id: "bastion" });

  const oddBridge = new EngineBridge(162101);
  oddBridge.setConsoleLogging(false);
  new AutoChessAutopilot(oddBridge, "evolution", {}, "go", "oracle", 20);
  oddBridge.engine.state.starterChoices = ["bastion"];
  oddBridge.dispatch({ type: "starter", id: "bastion" });

  assert.equal(evenBridge.engine.state.seed, 162100);
  assert.equal(evenBridge.engine.state.enemySeed, goEnemySeedForShopSeed(162100));
  assert.equal(oddBridge.engine.state.enemySeed, goEnemySeedForShopSeed(162101));
  assert.notEqual(evenBridge.engine.state.enemySeed, oddBridge.engine.state.enemySeed);

  const first = new EngineBridge(162105);
  const second = new EngineBridge(162105);
  first.engine.state.enemySeed = GO_ENEMY_SEEDS[0];
  second.engine.state.enemySeed = GO_ENEMY_SEEDS[1];
  first.engine.state.starterChoices = ["bastion"];
  second.engine.state.starterChoices = ["bastion"];
  first.engine.startRun("bastion");
  second.engine.startRun("bastion");
  assert.deepEqual(first.engine.state.shop, second.engine.state.shop);
  assert.equal(first.engine.state.enemySeed, GO_ENEMY_SEEDS[0]);
  assert.equal(second.engine.state.enemySeed, GO_ENEMY_SEEDS[1]);
  const differingRound = Array.from({ length: 60 }, (_, index) => index + 1).find((round) => {
    first.engine.state.round = round;
    second.engine.state.round = round;
    return JSON.stringify(first.engine.currentWave) !== JSON.stringify(second.engine.currentWave);
  });
  assert.ok(differingRound, "expected the two fixed enemy campaigns to diverge");
});

test("Go级战斗缓存只使用固定公共分支并跨实际 RNG 状态命中", () => {
  const bridge = new EngineBridge(162104);
  bridge.setConsoleLogging(false);
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.dispatch({ type: "starter", id: "bastion" });
  bridge.engine.state.round = 37;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  const ids = ["sun_guard", "rift_stalker", "cog_scribe", "pako"];
  ids.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1621040 + index, id, star: index % 2 ? 2 : 1 };
  });
  const lineup = autopilot.ownedEntries();
  autopilot.rolloutVariantLimit = 2;
  const before = new Set(snapshotAutopilotRolloutCache().map(([key]) => key));

  autopilot.rolloutLineupScore(lineup, "go_canonical", true, 20);
  const added = snapshotAutopilotRolloutCache()
    .map(([key]) => key)
    .filter((key) => !before.has(key));
  assert.equal(added.length, 2);
  assert.equal(added.every((key) => key.startsWith("combat-go-v2/hz:20/")), true);
  assert.equal(added.every((key) => key.includes(`/enemy:${bridge.engine.state.enemySeed}/round:37/`)), true);
  assert.deepEqual(added.map((key) => key.split("/").at(-1)).sort(), ["rollout:0", "rollout:1"]);
  assert.equal(added.some((key) => key.includes("actual:")), false);

  const entryCount = snapshotAutopilotRolloutCache().length;
  bridge.engine.restoreRandomState(987654321);
  autopilot.rolloutLineupScore(lineup, "go_canonical", false, 20);
  assert.equal(snapshotAutopilotRolloutCache().length, entryCount);
});

test("Go级第18战后优先存钱升到10人口", () => {
  const bridge = new EngineBridge(162106);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 18;
  bridge.engine.state.playerLevel = 9;
  bridge.engine.state.gold = bridge.engine.upgradeCost;
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.rolloutConfidence = () => Number.NEGATIVE_INFINITY;

  assert.deepEqual(autopilot.upgradeAction(), { type: "buyXp" });
});

test("Go级实际战斗固定到与缓存一致的公共 rollout:0 分支", () => {
  const source = new EngineBridge(162108, 1, { simulation: true, battleStepHz: 60 });
  source.setConsoleLogging(false);
  new AutoChessAutopilot(source, "evolution", {}, "go", "oracle", 20);
  source.engine.state.starterChoices = ["bastion"];
  source.dispatch({ type: "starter", id: "bastion" });
  source.engine.state.round = 24;
  source.engine.state.playerLevel = 10;
  source.engine.state.board.fill(null);
  ["rei", "lian", "cinder_ram", "spark_mage"].forEach((id, index) => {
    source.engine.state.board[[11, 17, 10, 16][index]] = {
      uid: 1621080 + index,
      id,
      star: 2,
    };
  });
  const snapshot = structuredClone(source.engine.state);
  const createBattle = (randomState) => {
    const bridge = new EngineBridge(1, 1, { simulation: true, battleStepHz: 60 });
    bridge.setConsoleLogging(false);
    bridge.setAutopilotStrategy("go", "oracle");
    bridge.engine.state = structuredClone(snapshot);
    bridge.engine.restoreRandomState(randomState);
    bridge.dispatch({ type: "battle" });
    return bridge;
  };

  const first = createBattle(123456);
  const second = createBattle(987654321);
  assert.equal(first.engine.getRandomState(), second.engine.getRandomState());
  assert.deepEqual(
    first.engine.state.battle.player.map(({ unitId, x, y }) => ({ unitId, x, y })),
    second.engine.state.battle.player.map(({ unitId, x, y }) => ({ unitId, x, y })),
  );
  first.skipBattle();
  second.skipBattle();
  assert.deepEqual(first.engine.state.result, second.engine.state.result);
});

test("Go级即使经济动作很多也必须完成规范站位再开战", () => {
  const goBridge = new EngineBridge(162109);
  const go = new AutoChessAutopilot(goBridge, "evolution", {}, "go", "oracle", 20);
  go.preparationActions = 1000;
  assert.equal(go.formationBudgetAvailable(), true);

  const ordinaryBridge = new EngineBridge(162110);
  const ordinary = new AutoChessAutopilot(
    ordinaryBridge,
    "evolution",
    {},
    "survival",
    "normal",
    20,
  );
  ordinary.preparationActions = 1000;
  assert.equal(ordinary.formationBudgetAvailable(), false);
});

test("Go级小阵容冠军也使用60Hz公共分支提交最终分数", () => {
  const bridge = new EngineBridge(162113);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const calls = [];
  autopilot.rolloutLineupScore = (lineup, _formation, stableOnly = false, combatHz = 20) => {
    calls.push({ stableOnly, combatHz });
    return stableOnly && combatHz === 60 ? 10000 + lineup.length : -1000;
  };

  const chosen = autopilot.rolloutTargetLineup(autopilot.ownedEntries());
  assert.equal(autopilot.plannedLineupScore, 10000 + chosen.length);
  assert.equal(calls.length > 0, true);
  assert.equal(calls.every(({ stableOnly, combatHz }) => stableOnly && combatHz === 60), true);
});

test("Go级开战棋盘必须逐格等于冠军评估时的规范站位", () => {
  const bridge = new EngineBridge(162111);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 36;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const ids = [
    "yua",
    "cog_scribe",
    "cinder_ram",
    "lian",
    "grove_mender",
    "cog_scribe",
    "yukisyo",
    "rutice",
    "sui_flower",
    "rei",
    "spark_mage",
    "sui_bird",
  ];
  ids.slice(0, 10).forEach((id, index) => {
    bridge.engine.state.board[index] = {
      uid: 1621110 + index,
      id,
      star: index >= 3 ? 3 : 2,
    };
  });
  ids.slice(10).forEach((id, index) => {
    bridge.engine.state.bench[index] = {
      uid: 1621130 + index,
      id,
      star: 3,
    };
  });

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const originalRolloutLineupScore = autopilot.rolloutLineupScore.bind(autopilot);
  autopilot.goModelScore = (lineup) => lineup.reduce(
    (sum, { unit }) => sum + unit.uid % 19,
    0,
  );
  autopilot.rolloutLineupScore = (lineup, _formation, stableOnly = false) => (
    lineup.reduce((sum, { unit }) => sum + unit.uid % 23, 0)
      + (stableOnly ? 1000 : 0)
  );

  const chosen = autopilot.rolloutTargetLineup(autopilot.ownedEntries());
  assert.equal(autopilot.plannedBoardSlots.size, chosen.length);
  let evaluatedPlacements = "";
  autopilot.rolloutPlacementsScore = (placements) => {
    evaluatedPlacements = placements
      .map(({ entry, slot }) => `${slot}:${entry.unit.id}:${entry.unit.star}`)
      .sort()
      .join(",");
    return 0;
  };
  originalRolloutLineupScore(chosen, autopilot.plannedFormation);

  let moves = 0;
  let finalAction = null;
  autopilot.plannedRound = bridge.engine.state.round;
  autopilot.preparationActions = 96;
  while (moves < 32) {
    const action = autopilot.nextPreparationAction();
    if (action?.type === "battle") {
      finalAction = action;
      break;
    }
    assert.equal(action.type, "move");
    bridge.dispatch(action);
    moves += 1;
  }
  assert.ok(moves < 32, "canonical formation should converge without cycling");
  assert.deepEqual(finalAction, { type: "battle" });
  const actualPlacements = bridge.engine.state.board
    .flatMap((unit, slot) => (unit ? [`${slot}:${unit.id}:${unit.star}`] : []))
    .sort()
    .join(",");
  assert.equal(actualPlacements, evaluatedPlacements);
});

test("Go级救援只锁定通过60Hz公共分支复核的候选", () => {
  const bridge = new EngineBridge(162112);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 24;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  ["sun_guard", "rift_stalker", "spark_mage"].forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1621200 + index, id, star: 2 };
  });
  const reserveUid = 1621299;
  bridge.engine.state.bench[0] = { uid: reserveUid, id: "rei", star: 3 };
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const current = autopilot.ownedEntries().filter(({ location }) => location.zone === "board");
  const calls = [];
  autopilot.rolloutTargetLineup = () => current;
  autopilot.rolloutConfidence = () => Number.NEGATIVE_INFINITY;
  autopilot.rolloutLineupScore = (lineup, _formation, stableOnly = false, combatHz = 20) => {
    const includesReserve = lineup.some(({ unit }) => unit.uid === reserveUid);
    calls.push({ includesReserve, stableOnly, combatHz });
    if (stableOnly && combatHz === 60) return includesReserve ? 10120 : -300;
    return includesReserve ? 10400 : 10500;
  };

  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), true);
  assert.equal(autopilot.plannedLineupUids.includes(reserveUid), true);
  assert.equal(autopilot.plannedLineupScore, 10120);
  assert.equal(calls.some(({ stableOnly, combatHz }) => stableOnly && combatHz === 60), true);
});
