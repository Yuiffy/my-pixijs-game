import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  createGoCombatScorer,
  GO_COMBAT_MODEL_SCHEMA,
  GO_COMBAT_MODEL_VERIFICATION,
  scoreGoCombatCandidate,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/goValueModel.ts",
);
const {
  goCombatRandomPanelSignature,
  goCombatScenarioSeed,
  goCombatScenarioSignature,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/goCombatScenario.ts",
);
const {
  selectGoOpportunityTargets,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/goStrategy.ts",
);
const { scorePreparedAutoChessCombat } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/rolloutCombat.ts",
);

test("Go级机会项目允许密集来牌压过旧固定目标", () => {
  const shop = (...ids) => [...ids, ...Array(Math.max(0, 5 - ids.length)).fill(null)];
  const targets = selectGoOpportunityTargets({
    candidates: [
      {
        id: "lian",
        priority: 96,
        desiredStar: 3,
        role: "terminal",
        learnedValue: 2.5,
      },
      {
        id: "zeyin",
        priority: 72,
        desiredStar: 3,
        role: "terminal",
        learnedValue: 2,
      },
    ],
    ownedTargets: [
      { id: "lian", copies: 3, benchSlots: 1 },
      { id: "zeyin", copies: 1, benchSlots: 1 },
    ],
    currentShop: shop("zeyin", "zeyin", "zeyin", "zeyin", "zeyin"),
    futureShops: [shop("zeyin", "zeyin", "zeyin")],
    previousFocusIds: new Set(["lian"]),
    limit: 1,
  });

  assert.equal(targets[0].id, "zeyin");
  assert.equal(targets[0].completionShopIndex, 1);
});

test("Go级二星项目按三份完成并可由密集来牌动态接管", () => {
  const shop = (...ids) => [...ids, ...Array(Math.max(0, 5 - ids.length)).fill(null)];
  const targets = selectGoOpportunityTargets({
    candidates: [{
      id: "zeyin",
      priority: 72,
      desiredStar: 2,
      role: "transition",
      learnedValue: 2,
    }],
    ownedTargets: [{ id: "zeyin", copies: 0, benchSlots: 0 }],
    currentShop: shop("zeyin", "zeyin"),
    futureShops: [shop("zeyin")],
  });

  assert.equal(targets[0].id, "zeyin");
  assert.equal(targets[0].desiredStar, 2);
  assert.equal(targets[0].completionShopIndex, 1);
  assert.equal(targets[0].remainingAfterForecast, 0);
});

test("Go级会提前追逐九十次刷新后才能完成的机会项目", () => {
  const bridge = new EngineBridge(162119);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 54;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.gold = 1_000;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  [
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
  ].forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1621300 + index, id, star: 3 };
  });
  bridge.engine.state.shop = Array(5).fill("lian");
  const futureShops = Array.from({ length: 128 }, (_, index) => (
    index >= 90 && index <= 98
      ? ["zeyin", "lian", "lian", "lian", "lian"]
      : Array(5).fill("lian")
  ));
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  let requestedLookahead = 0;
  autopilot.seerFutureShopForecast = (lookahead) => {
    requestedLookahead = lookahead;
    return futureShops;
  };
  autopilot.goModelScore = (lineup) => (
    lineup.some(({ unit }) => unit.id === "zeyin" && unit.star === 3) ? 10 : 0
  );
  autopilot.rolloutConfidence = () => -100;

  assert.deepEqual(
    autopilot.goOpportunityInvestmentAction(autopilot.ownedEntries()),
    { type: "reroll" },
  );
  assert.equal(requestedLookahead, 128);
  assert.equal(autopilot.seer2FocusIds.has("zeyin"), true);
});

test("Go级残血高金币时用升星工坊完成模型高价值项目", () => {
  const bridge = new EngineBridge(162122);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 54;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.hp = 8;
  bridge.engine.state.gold = 1_000;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 1621220, id: "lian", star: 3 };
  bridge.engine.state.bench[0] = { uid: 1621221, id: "youyi", star: 2 };
  bridge.engine.state.shop = [null, null, null, null, null];
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.seerFutureShopForecast = () => [];
  autopilot.goCompletedUnitModelGain = (_roster, id) => (id === "youyi" ? 3 : -3);
  let rolloutCalls = 0;
  autopilot.rolloutConfidence = () => {
    rolloutCalls += 1;
    return -100;
  };

  assert.deepEqual(
    autopilot.goOpportunityInvestmentAction(autopilot.ownedEntries()),
    { type: "starForge" },
  );
  bridge.dispatch({ type: "starForge" });
  assert.equal(bridge.engine.isStarForgeUnlocked, true);
  assert.deepEqual(
    autopilot.goOpportunityInvestmentAction(autopilot.ownedEntries()),
    { type: "starForge", location: { zone: "bench", index: 0 } },
  );
  bridge.dispatch({ type: "starForge", location: { zone: "bench", index: 0 } });
  assert.equal(bridge.engine.state.bench[0].star, 3);
  assert.equal(bridge.engine.state.gold, 1_000 - 40 - 48);
  assert.equal(rolloutCalls, 0);
});

test("Go级健康状态的连续投资只计算一次安全储备", () => {
  const bridge = new EngineBridge(162124);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 54;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.gold = 1_000;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 1621240, id: "lian", star: 3 };
  bridge.engine.state.bench[0] = { uid: 1621241, id: "youyi", star: 2 };
  bridge.engine.state.shop = [null, null, null, null, null];
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.seerFutureShopForecast = () => [];
  autopilot.goCompletedUnitModelGain = (_roster, id) => (id === "youyi" ? 3 : -3);
  let rolloutCalls = 0;
  autopilot.rolloutConfidence = () => {
    rolloutCalls += 1;
    return 1_000_000;
  };

  assert.deepEqual(
    autopilot.continueGoOpportunityInvestment(autopilot.ownedEntries()),
    { type: "starForge" },
  );
  bridge.dispatch({ type: "starForge" });
  assert.deepEqual(
    autopilot.continueGoOpportunityInvestment(autopilot.ownedEntries()),
    { type: "starForge", location: { zone: "bench", index: 0 } },
  );
  assert.equal(rolloutCalls, 1);
});

test("Go级投资尚未安全时继续复核并在转安全后恢复储备", () => {
  const bridge = new EngineBridge(162125);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 54;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.gold = 1_000;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 1621250, id: "lian", star: 3 };
  bridge.engine.state.bench[0] = { uid: 1621251, id: "youyi", star: 2 };
  bridge.engine.state.shop = [null, null, null, null, null];
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.seerFutureShopForecast = () => [];
  autopilot.goCompletedUnitModelGain = (_roster, id) => (id === "youyi" ? 3 : -3);
  const rolloutScores = [-100, 1_000_000];
  let rolloutCalls = 0;
  autopilot.rolloutConfidence = () => rolloutScores[rolloutCalls++];

  assert.deepEqual(
    autopilot.continueGoOpportunityInvestment(autopilot.ownedEntries()),
    { type: "starForge" },
  );
  bridge.dispatch({ type: "starForge" });
  assert.deepEqual(
    autopilot.continueGoOpportunityInvestment(autopilot.ownedEntries()),
    { type: "starForge", location: { zone: "bench", index: 0 } },
  );
  assert.equal(rolloutCalls, 2);
  assert.equal(autopilot.goOpportunitySafeInvestment, true);
});

test("Go级当前商店有可购买目标时先买牌再使用工坊", () => {
  const bridge = new EngineBridge(162123);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 54;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.hp = 8;
  bridge.engine.state.gold = 1_000;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 1621230, id: "lian", star: 3 };
  bridge.engine.state.bench[0] = { uid: 1621231, id: "youyi", star: 2 };
  bridge.engine.state.shop = ["youyi", null, null, null, null];
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.seerFutureShopForecast = () => Array.from({ length: 6 }, () => (
    ["youyi", null, null, null, null]
  ));
  autopilot.goPlanningTargets = () => [{
    id: "youyi",
    priority: 100,
    desiredStar: 3,
    role: "terminal",
    learnedValue: 3,
    copies: 3,
    benchSlots: 1,
    currentShopHits: 1,
    forecastHits: 6,
    completionShopIndex: 5,
    remainingAfterForecast: 0,
    score: 100,
  }];

  assert.deepEqual(
    autopilot.goOpportunityInvestmentAction(autopilot.ownedEntries()),
    { type: "shop", index: 0 },
  );
});

test("Go级满候补席会释放低进度旧项目并买入新机会项目", () => {
  const bridge = new EngineBridge(162117);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 20;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.starForgeUnlocked = true;
  bridge.engine.state.gold = 4;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const boardIds = [
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
  ];
  boardIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1621170 + index, id, star: 2 };
  });
  const benchIds = [
    "zeyin",
    "meme",
    "mossback",
    "pako",
    "sun_guard",
    "rift_brawler",
    "sui_blue",
    "shiori",
  ];
  benchIds.forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 1621190 + index, id, star: 1 };
  });
  bridge.engine.state.shop = Array(5).fill("zeyin");

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.goModelScore = (lineup) => (
    lineup.some(({ unit }) => unit.id === "zeyin" && unit.star === 3) ? 10 : 0
  );
  autopilot.rolloutConfidence = () => -100;
  autopilot.seerFutureShopForecast = () => [Array(5).fill("zeyin")];
  const roster = autopilot.ownedEntries();
  const targets = autopilot.goPlanningTargets(roster, [Array(5).fill("zeyin")]);
  assert.equal(targets.some(({ id }) => id === "zeyin"), true);
  assert.equal(autopilot.targetDesiredCopies("zeyin"), 9);
  assert.equal(autopilot.lateGameReserveUids(roster).has(1621190), true);

  const sale = autopilot.goOpportunityInvestmentAction(roster);
  assert.equal(sale.type, "sell");
  assert.notEqual(bridge.engine.state.bench[sale.location.index].id, "zeyin");
  bridge.dispatch(sale);
  assert.deepEqual(autopilot.pendingPurchaseAction(), { type: "shop", index: 0 });
});

test("Go级会同时保留多个未来终局项目，避免后段卖掉关键替补", () => {
  const bridge = new EngineBridge(1621172);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 20;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  [
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
  ].forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 16211720 + index, id, star: 2 };
  });
  bridge.engine.state.shop = ["spark_mage", "yukisyo", null, null, null];
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.goUnitModelGain = () => 0;
  autopilot.seerFutureShopForecast = () => Array.from({ length: 16 }, () => (
    ["spark_mage", "yukisyo", "xuehui", "sui_bird", "cog_scribe"]
  ));

  const targets = autopilot.goPlanningTargets(autopilot.ownedEntries(), autopilot.seerFutureShopForecast());

  assert.ok(targets.length >= 6, `expected broad target cover, got ${targets.length}`);
  assert.ok(autopilot.seer2FocusIds.size >= 6);
  assert.equal(autopilot.targetDesiredCopies("spark_mage"), 9);
  assert.equal(autopilot.targetDesiredCopies("yukisyo"), 9);
});

test("Go级在核心阵容成熟前不拆阵追全棋池机会", () => {
  const bridge = new EngineBridge(162118);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 20;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  [
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
  ].forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1621210 + index, id, star: 1 };
  });
  bridge.engine.state.shop = Array(5).fill("zeyin");
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const roster = autopilot.ownedEntries();
  assert.equal(autopilot.goOpportunityWindowOpen(roster), false);
  const targets = autopilot.seer2PlanningTargets(roster, [Array(5).fill("zeyin")]);
  assert.equal(targets.some(({ id }) => id === "zeyin"), false);

  bridge.engine.state.board.slice(0, 6).forEach((unit) => {
    unit.star = 2;
  });
  assert.equal(autopilot.goOpportunityWindowOpen(autopilot.ownedEntries()), true);
});

test("Go级当前战稳胜但下一战必败时会提前进入稳定化", () => {
  const bridge = new EngineBridge(162126);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 15;
  bridge.engine.state.board[0] = { uid: 1621260, id: "lian", star: 2 };
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.rolloutConfidence = () => 11_000;
  autopilot.rolloutLineupScoreAtRound = () => -100;

  assert.equal(autopilot.rerollStrategy(autopilot.ownedEntries()).mode, "stabilize");
});

test("Go级不会让下一战前瞻扰动前十三战经济", () => {
  const bridge = new EngineBridge(162127);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 13;
  bridge.engine.state.board[0] = { uid: 1621270, id: "lian", star: 2 };
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.rolloutConfidence = () => 11_000;
  let futureCalls = 0;
  autopilot.rolloutLineupScoreAtRound = () => {
    futureCalls += 1;
    return -100;
  };

  assert.equal(autopilot.rerollStrategy(autopilot.ownedEntries()).mode, "bank");
  assert.equal(futureCalls, 0);
});

test("Go级浏览器推理与 CUDA 导出的留出样本一致", () => {
  assert.equal(GO_COMBAT_MODEL_SCHEMA, "go-combat-ranker-v3");
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

test("未知棋子 ID 仍通过实时属性投影与纯 unk 区分", async () => {
  const model = JSON.parse(await readFile(
    "src/components/autoChessGame/ai/goCombatModel.json",
    "utf8",
  ));
  const komichiIndex = model.vocab.units.indexOf("komichi");
  assert.ok(komichiIndex > 0);
  model.vocab.units.splice(komichiIndex, 1);
  model.state["unit_embedding.weight"].splice(komichiIndex, 1);
  model.state.unit_features.splice(komichiIndex, 1);
  const scorer = createGoCombatScorer(model);
  const base = {
    starter: "bastion",
    augments: [],
    waveTag: "normal",
    modifier: 1,
    enemies: [{ id: "rift_tyrant", star: 1, position: 0 }],
  };
  const komichiScore = scorer({
    ...base,
    players: [{ id: "komichi", star: 1, position: 0 }],
  });
  const zeroFeatureUnknownScore = scorer({
    ...base,
    players: [{ id: "future_unknown_unit", star: 1, position: 0 }],
  });
  assert.notEqual(komichiScore, zeroFeatureUnknownScore);
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
  assert.ok(robust.length <= 16);
  assert.ok(robust.length >= 12);
  assert.equal(modelCalls.some(({ formation }) => formation === "human_recorded"), false);
  assert.equal(modelCalls.every(({ formation }) => formation === "go_canonical"), true);
});

test("Go级真实复核候选按棋种与星级去重", () => {
  const bridge = new EngineBridge(162114);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 3;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  ["spark_mage", "cog_scribe", "yua"].forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1621140 + index, id, star: 2 };
  });
  bridge.engine.state.bench[0] = { uid: 1621150, id: "spark_mage", star: 2 };
  bridge.engine.state.bench[1] = { uid: 1621151, id: "cog_scribe", star: 2 };
  bridge.engine.state.bench[2] = { uid: 1621152, id: "rei", star: 3 };
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const exploratoryKeys = [];
  autopilot.goModelScore = (lineup) => lineup.reduce(
    (score, { unit }) => score + unit.uid % 17,
    0,
  );
  autopilot.rolloutLineupScore = (lineup, _formation, stableOnly = false) => {
    if (!stableOnly) {
      exploratoryKeys.push(lineup
        .map(({ unit }) => `${unit.id}:${unit.star}`)
        .sort()
        .join("|"));
    }
    return 10000 + lineup.reduce((score, { unit }) => score + unit.uid % 13, 0);
  };

  autopilot.rolloutTargetLineup(autopilot.ownedEntries());
  assert.ok(exploratoryKeys.length > 1);
  assert.equal(new Set(exploratoryKeys).size, exploratoryKeys.length);
});

test("Go级残血时会用60Hz覆盖复核被低频误判的启发式候选", () => {
  const bridge = new EngineBridge(162116);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 31;
  bridge.engine.state.hp = 8;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  [
    "grove_mender",
    "lian",
    "yua",
    "cinder_ram",
    "spark_mage",
    "sui_flower",
    "xuehui",
    "sui_bird",
    "yukisyo",
    "cog_scribe",
  ].forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1621160 + index, id, star: 3 };
  });
  [
    "rei",
    "rutice",
    "tower_god",
    "lovely",
    "sumi",
    "pako",
    "mossback",
    "mumu",
  ].forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 1621170 + index, id, star: 3 };
  });

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.finalizingEconomy = true;
  const exactCalls = [];
  autopilot.goModelScore = () => 0;
  autopilot.rolloutLineupScore = (lineup, _formation, stableOnly = false, combatHz = 20) => {
    const hasRescue = lineup.some(({ unit }) => unit.id === "mumu");
    if (stableOnly) exactCalls.push({ hasRescue, combatHz });
    return stableOnly && combatHz === 60
      ? (hasRescue ? 10060 : -100)
      : (hasRescue ? -500 : 0);
  };

  const chosen = autopilot.rolloutTargetLineup(autopilot.ownedEntries());
  assert.equal(chosen.some(({ unit }) => unit.id === "mumu"), true);
  assert.ok(exactCalls.length > 5, `expected expanded exact coverage, got ${exactCalls.length}`);
  assert.ok(exactCalls.some(({ hasRescue, combatHz }) => hasRescue && combatHz === 60));
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

test("稳健与搏上限使用 Go v4 模型和规范站位但不读取未来信息", () => {
  const ids = [
    "lian",
    "rei",
    "cinder_ram",
    "spark_mage",
    "grove_mender",
    "yua",
    "xuehui",
    "yukisyo",
  ];
  for (const [style, seed] of [
    ["survival", 162131],
    ["highroll", 162132],
    ["fair", 162134],
  ]) {
    const bridge = new EngineBridge(seed);
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.playerLevel = 6;
    bridge.engine.state.board.fill(null);
    bridge.engine.state.bench.fill(null);
    const cap = bridge.engine.boardCap;
    ids.slice(0, cap).forEach((id, index) => {
      bridge.engine.state.board[index] = { uid: seed * 10 + index, id, star: index % 2 ? 2 : 1 };
    });
    ids.slice(cap, cap + 2).forEach((id, index) => {
      bridge.engine.state.bench[index] = { uid: seed * 10 + cap + index, id, star: 2 };
    });

    let modelCalls = 0;
    let futureShopCalls = 0;
    let nextRoundCalls = 0;
    const autopilot = new AutoChessAutopilot(
      bridge,
      "evolution",
      {},
      style,
      "oracle",
      20,
      ({ players }) => {
        modelCalls += 1;
        return players.reduce((score, player) => score + player.star, 0);
      },
    );
    bridge.engine.previewFutureShops = () => {
      futureShopCalls += 1;
      throw new Error(`${style} 不应读取未来商店`);
    };
    bridge.engine.previewFutureShopsAtLevels = () => {
      futureShopCalls += 1;
      throw new Error(`${style} 不应读取未来等级商店`);
    };
    autopilot.rolloutLineupScoreAtRound = () => {
      nextRoundCalls += 1;
      throw new Error(`${style} 不应读取下一关`);
    };
    autopilot.rolloutLineupScore = (lineup) => 10_000 + lineup.reduce(
      (score, { unit }) => score + unit.star,
      0,
    );

    const roster = autopilot.ownedEntries();
    const lineup = autopilot.rolloutTargetLineup(roster);
    autopilot.resetPreparation(bridge.engine.state.round);
    autopilot.oracleHasFutureCandidate(roster);
    autopilot.rerollStrategy(roster);

    assert.equal(autopilot.strategyStyle, style);
    assert.equal(autopilot.strategyInformationMode, "normal");
    assert.equal(bridge.autoplayStyle, style);
    assert.equal(bridge.autoplayInformationMode, "normal");
    assert.deepEqual(autopilot.formationProfileIds(), ["go_canonical"]);
    assert.equal(lineup.length, cap);
    assert.ok(modelCalls > 0);
    assert.equal(futureShopCalls, 0);
    assert.equal(nextRoundCalls, 0);
  }
});

test("同信息策略不映射敌方战役种子且开战不固定 RNG", () => {
  for (const [style, seed] of [
    ["survival", 162133],
    ["highroll", 162135],
    ["fair", 162137],
  ]) {
    const bridge = new EngineBridge(seed);
    bridge.setConsoleLogging(false);
    new AutoChessAutopilot(bridge, "evolution", {}, style, "oracle", 20);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.dispatch({ type: "starter", id: "bastion" });
    assert.equal(bridge.engine.state.enemySeed, seed);
    assert.equal(bridge.autoplayInformationMode, "normal");

    bridge.engine.state.board[0] = { uid: seed * 10, id: "lian", star: 2 };
    let restoreCalls = 0;
    const restoreRandomState = bridge.engine.restoreRandomState.bind(bridge.engine);
    bridge.engine.restoreRandomState = (randomState) => {
      restoreCalls += 1;
      return restoreRandomState(randomState);
    };
    bridge.dispatch({ type: "battle" });

    assert.equal(restoreCalls, 0);
    assert.equal(bridge.engine.state.phase, "battle");
  }
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

test("Go级缓存保留完整阵容键，并把公共随机分支与实际 RNG 分开", () => {
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
  assert.equal(added.every((key) => key.startsWith("combat-go-v5/hz:20/")), true);
  assert.equal(added.every((key) => key.includes(`/enemy:${bridge.engine.state.enemySeed}/round:37/`)), true);
  assert.match(added[0].split("/").at(-1), /^actual:/);
  assert.equal(added[1].split("/").at(-1), "rollout:0");

  const entryCount = snapshotAutopilotRolloutCache().length;
  bridge.engine.restoreRandomState(987654321);
  autopilot.rolloutLineupScore(lineup, "go_canonical", false, 20);
  assert.equal(snapshotAutopilotRolloutCache().length, entryCount + 1);
});

test("不同候选共享同一随机面板种子但保留不同缓存签名", () => {
  const bridge = new EngineBridge(162107);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 24;
  const base = {
    enemySeed: bridge.engine.state.enemySeed,
    round: 24,
    starter: bridge.engine.state.starter,
    augments: bridge.engine.state.augments,
    wave: bridge.engine.currentWave,
  };
  const first = {
    ...base,
    placements: [{ slot: 0, id: "komichi", star: 2 }],
  };
  const second = {
    ...base,
    placements: [{ slot: 0, id: "lian", star: 2 }],
  };
  assert.notEqual(goCombatScenarioSignature(first), goCombatScenarioSignature(second));
  assert.equal(goCombatRandomPanelSignature(first), goCombatRandomPanelSignature(second));
  assert.equal(
    goCombatScenarioSeed(goCombatRandomPanelSignature(first), 1),
    goCombatScenarioSeed(goCombatRandomPanelSignature(second), 1),
  );
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

test("Go级真实开战保留本局 RNG，不为缓存强行固定", () => {
  const source = new EngineBridge(162108, 1, { simulation: true, battleStepHz: 60 });
  source.setConsoleLogging(false);
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
  assert.notEqual(first.engine.getRandomState(), second.engine.getRandomState());
});

test("Go级预演显式恢复当前实际 RNG，分数与实际开战一致", () => {
  const bridge = new EngineBridge(162112, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "go",
    "oracle",
    20,
  );
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 24;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.board[23] = { uid: 1621120, id: "rei", star: 2 };
  bridge.engine.state.board[10] = { uid: 1621121, id: "spark_mage", star: 2 };

  const predicted = autopilot.rolloutLineupScore(
    autopilot.ownedEntries(),
    "go_canonical",
    false,
    60,
  );
  bridge.dispatch({ type: "battle" });
  const actual = scorePreparedAutoChessCombat(bridge.engine, 60);

  assert.ok(Number.isFinite(predicted));
  assert.ok(Math.abs(predicted - actual) < 1e-9, `${predicted} !== ${actual}`);
});

test("学习型策略即使经济动作很多也必须完成规范站位再开战", () => {
  for (const [index, style] of ["survival", "highroll", "fair", "go"].entries()) {
    const bridge = new EngineBridge(162109 + index);
    const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, style);
    autopilot.preparationActions = 1000;
    assert.equal(autopilot.formationBudgetAvailable(), true);
  }

  const legacy = new AutoChessAutopilot(
    new EngineBridge(162114),
    "evolution",
    {},
    "balanced",
  );
  legacy.preparationActions = 1000;
  assert.equal(legacy.formationBudgetAvailable(), false);
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

test("Go级救援不会让已提交的60Hz胜解退回20Hz重筛", () => {
  const bridge = new EngineBridge(162118);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.hp = 7;
  bridge.engine.state.playerLevel = 3;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  ["lian", "xuehui", "zeyin"].forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1621180 + index, id, star: 2 };
  });
  bridge.engine.state.bench[0] = { uid: 1621199, id: "tower_god", star: 1 };
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const roster = autopilot.ownedEntries();
  const target = [roster[0], roster[1], roster.at(-1)];
  let coarseCalls = 0;
  autopilot.rolloutLineupScore = () => {
    coarseCalls += 1;
    return -1000;
  };
  autopilot.rolloutConfidence = () => -1000;
  autopilot.rolloutTargetLineup = () => {
    autopilot.plannedLineupUids = target.map(({ unit }) => unit.uid);
    autopilot.plannedLineupScore = 10123;
    autopilot.plannedFormation = "go_canonical";
    autopilot.plannedBoardSlots = new Map(target.map(({ unit }, index) => [unit.uid, index]));
    return target;
  };

  assert.equal(autopilot.searchRescueLineup(roster), true);
  assert.equal(autopilot.rescueLineupLocked, true);
  assert.equal(autopilot.plannedLineupScore, 10123);
  assert.equal(coarseCalls, 1);
});

test("Go级已锁定胜阵落盘后仍先执行安全机会投资", () => {
  const bridge = new EngineBridge(162120);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 54;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const unit = { uid: 1621200, id: "sui_flower", star: 3 };
  bridge.engine.state.board[0] = unit;

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  autopilot.plannedRound = bridge.engine.state.round;
  autopilot.plannedLineupUids = [unit.uid];
  autopilot.plannedBoardSlots = new Map([[unit.uid, 0]]);
  autopilot.rescueLineupLocked = true;
  let investmentCalls = 0;
  let rescueSearchCalls = 0;
  autopilot.goOpportunityInvestmentAction = () => {
    investmentCalls += 1;
    return investmentCalls === 1 ? { type: "reroll" } : null;
  };
  autopilot.searchRescueLineup = () => {
    rescueSearchCalls += 1;
    return false;
  };

  assert.deepEqual(autopilot.nextPreparationAction(), { type: "reroll" });
  assert.equal(investmentCalls, 1);
  assert.equal(rescueSearchCalls, 0);
  assert.equal(autopilot.rescueLineupLocked, true);
  assert.equal(autopilot.goOpportunityInvestmentInProgress, true);
  assert.deepEqual(autopilot.nextPreparationAction(), { type: "battle" });
  assert.equal(investmentCalls, 2);
  assert.equal(rescueSearchCalls, 1);
  assert.equal(autopilot.goOpportunityInvestmentInProgress, false);
});

test("非Go策略已锁定胜阵落盘后仍立即开战", () => {
  const bridge = new EngineBridge(162121);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const unit = { uid: 1621210, id: "sui_flower", star: 3 };
  bridge.engine.state.board[0] = unit;

  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "survival",
    "normal",
    20,
  );
  autopilot.plannedRound = bridge.engine.state.round;
  autopilot.plannedLineupUids = [unit.uid];
  autopilot.plannedBoardSlots = new Map([[unit.uid, 0]]);
  autopilot.rescueLineupLocked = true;
  let investmentCalls = 0;
  autopilot.goOpportunityInvestmentAction = () => {
    investmentCalls += 1;
    return { type: "reroll" };
  };

  assert.deepEqual(autopilot.nextPreparationAction(), { type: "battle" });
  assert.equal(investmentCalls, 0);
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
  autopilot.preparationActions = 1000;
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

test("Go级预览阵容不会把临时UID槽位泄漏到正式计划", () => {
  const bridge = new EngineBridge(162116);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const roster = autopilot.ownedEntries();
  const plannedUid = roster[0].unit.uid;
  autopilot.plannedLineupKey = "formal-plan";
  autopilot.plannedLineupUids = [plannedUid];
  autopilot.plannedLineupUnits = new Map([[
    plannedUid,
    { id: roster[0].unit.id, star: roster[0].unit.star },
  ]]);
  autopilot.plannedLineupScore = 10100;
  autopilot.plannedBoardSlots = new Map([[plannedUid, 11]]);
  autopilot.rescueLineupLocked = true;
  autopilot.rolloutTargetLineup = () => {
    autopilot.plannedLineupUids = [999999];
    autopilot.plannedBoardSlots = new Map([[999999, 23]]);
    autopilot.rescueLineupLocked = false;
    autopilot.plannedLineupScore = -500;
    return roster;
  };

  autopilot.previewRosterRollout(roster);
  assert.deepEqual(autopilot.plannedLineupUids, [plannedUid]);
  assert.deepEqual(Array.from(autopilot.plannedBoardSlots.entries()), [[plannedUid, 11]]);
  assert.equal(autopilot.rescueLineupLocked, true);
  assert.equal(autopilot.plannedLineupScore, 10100);
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

test("Go级神经beam能保留启发式与20Hz都排除的三换胜解", () => {
  const bridge = new EngineBridge(162119);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 30;
  bridge.engine.state.hp = 7;
  bridge.engine.state.playerLevel = 4;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  ["sun_guard", "sui", "rift_brawler", "meme"].forEach((id, index) => {
    bridge.engine.state.board[[11, 17, 10, 16][index]] = {
      uid: 1621190 + index,
      id,
      star: 2,
    };
  });
  ["mossback", "shiori", "nagisa", "rutice", "gale_archer"].forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 1621200 + index, id, star: 2 };
  });

  const targetIds = new Set(["sun_guard", "nagisa", "rutice", "gale_archer"]);
  const isTarget = (lineup) => (
    lineup.length === 4 && lineup.every(({ unit }) => targetIds.has(unit.id))
  );
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const current = autopilot.ownedEntries().filter(({ location }) => location.zone === "board");
  const exactKeys = [];
  autopilot.rolloutTargetLineup = () => current;
  autopilot.rolloutConfidence = () => Number.NEGATIVE_INFINITY;
  autopilot.goModelScore = (lineup) => lineup.reduce(
    (score, { unit }) => score + (targetIds.has(unit.id) ? 100 : 0),
    0,
  );
  autopilot.lineupHeuristicScore = (lineup) => -lineup.reduce(
    (score, { unit }) => score + (targetIds.has(unit.id) ? 100 : 0),
    0,
  );
  autopilot.rolloutLineupScore = (lineup, _formation, stableOnly = false, combatHz = 20) => {
    if (stableOnly && combatHz === 60) {
      exactKeys.push(lineup.map(({ unit }) => unit.id).sort().join("|"));
      return isTarget(lineup) ? 10140 : -500;
    }
    return isTarget(lineup) ? -1000 : 0;
  };

  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), true);
  assert.deepEqual(
    Array.from(autopilot.plannedLineupUnits.values()).map(({ id }) => id).sort(),
    Array.from(targetIds).sort(),
  );
  assert.equal(exactKeys.includes(Array.from(targetIds).sort().join("|")), true);
});

test("Go级低血量预测败局会提前用60Hz复核直接单换", () => {
  const bridge = new EngineBridge(162115);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 30;
  bridge.engine.state.hp = 7;
  bridge.engine.state.playerLevel = 3;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  ["spark_mage", "cog_scribe", "yua"].forEach((id, index) => {
    bridge.engine.state.board[[10, 16, 9][index]] = {
      uid: 1621150 + index,
      id,
      star: 2,
    };
  });
  const reserveIds = ["sui_flower", "cinder_ram", "sumi", "kioi", "nightin"];
  reserveIds.forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 1621160 + index, id, star: 2 };
  });
  const winningUid = 1621160;
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 20);
  const current = autopilot.ownedEntries().filter(({ location }) => location.zone === "board");
  const exactCalls = [];
  autopilot.rolloutTargetLineup = () => current;
  autopilot.rolloutConfidence = () => Number.NEGATIVE_INFINITY;
  autopilot.lineupHeuristicScore = (lineup) => (
    lineup.some(({ unit }) => unit.uid === winningUid) ? 100000 : 1000
  );
  autopilot.rolloutLineupScore = (lineup, _formation, stableOnly = false, combatHz = 20) => {
    const includesWinner = lineup.some(({ unit }) => unit.uid === winningUid);
    if (stableOnly && combatHz === 60) {
      exactCalls.push(includesWinner);
      return includesWinner ? 10120 : -500;
    }
    if (includesWinner) return -1000;
    if (lineup.every(({ location }) => location.zone === "board")) return -600;
    return 10400;
  };

  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), true);
  assert.equal(autopilot.plannedLineupUids.includes(winningUid), true);
  assert.equal(exactCalls.includes(true), true);
});

test("Go级宏观出售按同棋种最低星级绑定UID且绝不出售三星", () => {
  const bridge = new EngineBridge(162117);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 45;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 1621170, id: "lian", star: 3 };
  bridge.engine.state.bench[0] = { uid: 1621171, id: "lian", star: 1 };
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "go", "oracle", 60);
  const firstStep = {
    targetLevel: bridge.engine.state.playerLevel,
    rerolls: 0,
    expectedGoldAfterPreparation: bridge.engine.state.gold,
    salesByShop: [["lian"]],
  };
  autopilot.seerPlan = {
    firstStep,
    steps: [firstStep],
    startRound: 45,
    projectedRound: 46,
    projectedTargetCopies: {},
    complete: true,
  };

  assert.deepEqual(autopilot.seerPlannedSaleAction(), {
    type: "sell",
    location: { zone: "bench", index: 0 },
  });

  bridge.engine.state.bench[0] = null;
  autopilot.seerSaleOffsets[0] = 0;
  autopilot.seerPlan = {
    firstStep,
    steps: [firstStep],
    startRound: 45,
    projectedRound: 46,
    projectedTargetCopies: {},
    complete: true,
  };
  assert.equal(autopilot.seerPlannedSaleAction(), null);
  assert.equal(autopilot.seerPlan, null);
  assert.equal(bridge.engine.state.board[0].star, 3);
});
