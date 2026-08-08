import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const { AutoChessAutopilot } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);
const {
  SEER2_PRINCIPAL_VARIATIONS,
  SEER2_TERMINAL_TARGET_IDS,
  SEER2_TERMINAL_TARGETS,
  selectSeer2PlanningTargets,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/seer2Strategy.ts",
);
const {
  informationModeForAutopilotStyle,
  resolveAutopilotStylePolicy,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/autopilotPolicy.ts",
);

test("看穿2保留原 Go级的 oracle 托管策略", async () => {
  assert.equal(informationModeForAutopilotStyle("seer2"), "oracle");
  assert.equal(
    resolveAutopilotStylePolicy("seer2").safeWinRolloutScore,
    resolveAutopilotStylePolicy("seer").safeWinRolloutScore,
  );

  const bridge = new EngineBridge(152001);
  bridge.setConsoleLogging(false);
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer2");
  assert.equal(autopilot.strategyStyle, "seer");
  assert.equal(autopilot.strategyInformationMode, "oracle");
  assert.equal(bridge.autoplayStyle, "seer");
  assert.equal(bridge.autoplayInformationMode, "oracle");

  const hostSource = await readFile("src/components/autoChessGame/PhaserGame.tsx", "utf8");
  assert.match(hostSource, /\["seer", "看穿"\]/);
  assert.match(hostSource, /\["go", "Go级"\]/);
  assert.match(hostSource, /"survival", "balanced", "highroll", "seer"/);

  const trainingSource = await readFile("scripts/train-autochess-autopilot.mjs", "utf8");
  assert.match(trainingSource, /ai\/rolloutCacheSchema\.ts/);
  assert.doesNotMatch(trainingSource, /balanceSources[\s\S]*ai\/AutoChessAutopilot\.ts/);
});

test("看穿2计划完成后仍会清理满候补并购买当前终局目标牌", () => {
  const bridge = new EngineBridge(152005);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 46;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.gold = 1275;
  bridge.engine.state.shop = ["cog_scribe", "rutice", "sui_flower", "sui_cat", "sumi"];
  bridge.engine.state.board = [
    { uid: 1520050, id: "grove_mender", star: 3 },
    { uid: 1520051, id: "lian", star: 3 },
    { uid: 1520052, id: "rei", star: 3 },
    { uid: 1520053, id: "yua", star: 3 },
    { uid: 1520054, id: "cinder_ram", star: 3 },
    { uid: 1520055, id: "spark_mage", star: 2 },
    { uid: 1520056, id: "sui_flower", star: 2 },
    { uid: 1520057, id: "xuehui", star: 3 },
    { uid: 1520058, id: "yukisyo", star: 3 },
    { uid: 1520059, id: "rutice", star: 3 },
  ];
  bridge.engine.state.bench = [
    { uid: 1520060, id: "cog_scribe", star: 2 },
    { uid: 1520061, id: "zeyin", star: 1 },
    { uid: 1520062, id: "zeyin", star: 1 },
    { uid: 1520063, id: "sui_cat", star: 1 },
    { uid: 1520064, id: "mitsuri", star: 1 },
    { uid: 1520065, id: "biscuit_sui", star: 1 },
    { uid: 1520066, id: "yua", star: 1 },
    { uid: 1520067, id: "sui_bird", star: 1 },
  ];

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer2", "oracle", 20);
  const action = autopilot.seerEndgameInvestmentAction(autopilot.ownedEntries());
  assert.deepEqual(action, { type: "sell", location: { zone: "bench", index: 5 } });

  bridge.dispatch(action);
  const purchase = autopilot.seerEndgameInvestmentAction(autopilot.ownedEntries());
  assert.equal(purchase?.type, "shop");
  assert.ok(SEER2_TERMINAL_TARGET_IDS.includes(bridge.engine.state.shop[purchase.index]));
});

test("看穿2终局池由十二张三星目标和四条主变化组成", () => {
  assert.equal(SEER2_TERMINAL_TARGETS.length, 12);
  assert.equal(new Set(SEER2_TERMINAL_TARGET_IDS).size, 12);
  assert.equal(SEER2_TERMINAL_TARGETS.every(({ desiredStar }) => desiredStar === 3), true);
  assert.deepEqual(
    new Set(SEER2_TERMINAL_TARGET_IDS),
    new Set([
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
    ]),
  );
  assert.equal(SEER2_PRINCIPAL_VARIATIONS.length, 4);
  assert.equal(SEER2_PRINCIPAL_VARIATIONS.every((lineup) => lineup.length === 10), true);
  assert.equal(SEER2_PRINCIPAL_VARIATIONS.some((lineup) => (
    lineup.includes("cog_scribe") && !lineup.includes("yukisyo")
  )), true);
  assert.equal(SEER2_PRINCIPAL_VARIATIONS.some((lineup) => (
    lineup.includes("rutice") && !lineup.includes("yukisyo")
  )), true);
});

test("看穿2会按实际来牌速度转追更早三星的项目", () => {
  const shop = (...ids) => [...ids, ...Array(Math.max(0, 5 - ids.length)).fill(null)];
  const futureShops = [
    shop("cog_scribe", "cog_scribe", "cog_scribe", "cog_scribe"),
    shop("rutice", "rutice", "rutice", "rutice", "rutice"),
    shop("rutice", "rutice", "rutice", "rutice"),
  ];
  const targets = selectSeer2PlanningTargets({
    ownedTargets: [
      { id: "grove_mender", copies: 6, benchSlots: 2 },
      { id: "lian", copies: 6, benchSlots: 2 },
      { id: "rei", copies: 6, benchSlots: 2 },
      { id: "cog_scribe", copies: 0, benchSlots: 0 },
      { id: "rutice", copies: 0, benchSlots: 0 },
    ],
    currentShop: shop(
      "cog_scribe",
      "cog_scribe",
      "cog_scribe",
      "cog_scribe",
      "cog_scribe",
    ),
    futureShops,
  });
  const ids = new Set(targets.map(({ id }) => id));
  assert.equal(ids.has("cog_scribe"), true);
  assert.equal(ids.has("rutice"), true);
  assert.equal(
    ["grove_mender", "lian", "rei"].filter((id) => ids.has(id)).length < 3,
    true,
  );
  assert.equal(targets[0].completionShopIndex, 1);
});

test("看穿2项目切换有小幅滞后但密集当前店会立即压过旧目标", () => {
  const shop = (...ids) => [...ids, ...Array(Math.max(0, 5 - ids.length)).fill(null)];
  const forecast = [
    shop("rutice", "rutice"),
    shop("rutice", "rutice"),
    shop("rutice", "rutice", "lian", "lian", "lian"),
    shop("rutice", "rutice", "rutice", "lian", "lian"),
    shop("lian", "lian", "lian", "lian"),
  ];
  const retained = selectSeer2PlanningTargets({
    ownedTargets: [],
    currentShop: shop(),
    futureShops: forecast,
    previousFocusIds: new Set(["lian"]),
    limit: 1,
  });
  assert.equal(retained[0].id, "lian");

  const pivoted = selectSeer2PlanningTargets({
    ownedTargets: [],
    currentShop: shop("rutice", "rutice", "rutice", "rutice", "rutice"),
    futureShops: forecast,
    previousFocusIds: new Set(["lian"]),
    limit: 1,
  });
  assert.equal(pivoted[0].id, "rutice");
});

test("看穿2转追后释放低进度旧项目但继续保护三星", () => {
  const bridge = new EngineBridge(152003);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 18;
  bridge.engine.state.shop = Array(5).fill("rutice");
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.bench[0] = { uid: 1520031, id: "lian", star: 2 };
  bridge.engine.state.bench[1] = { uid: 1520032, id: "rei", star: 3 };

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer2", "oracle", 20);
  const roster = autopilot.ownedEntries();
  const futureShops = [
    Array(5).fill("rutice"),
    Array(4).fill("rutice"),
    Array(5).fill("cog_scribe"),
    Array(4).fill("cog_scribe"),
    Array(5).fill("yukisyo"),
    Array(4).fill("yukisyo"),
  ];
  const focus = new Set(autopilot.seer2PlanningTargets(roster, futureShops).map(({ id }) => id));
  assert.equal(focus.has("rutice"), true);
  assert.equal(focus.has("lian"), false);
  assert.equal(autopilot.upgradeProjectIds(roster, []).has("lian"), false);

  const reserves = autopilot.lateGameReserveUids(roster);
  assert.equal(reserves.has(1520031), false);
  assert.equal(reserves.has(1520032), true);

  bridge.engine.state.board.fill(null);
  SEER2_TERMINAL_TARGET_IDS.slice(0, 10).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1520100 + index, id, star: 1 };
  });
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.bench[0] = { uid: 1520200, id: "rei", star: 3 };
  autopilot.rolloutTargetLineup = (entries) => entries.filter(
    ({ location }) => location.zone === "board",
  );
  assert.equal(autopilot.benchCleanupAction(autopilot.ownedEntries()), null);
});

test("看穿2多步规划只按本轮动态目标校验并把其余终局牌视作过渡阵容", () => {
  const bridge = new EngineBridge(152004);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 19;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.bench[0] = { uid: 1520041, id: "rutice", star: 1 };
  bridge.engine.state.bench[1] = { uid: 1520042, id: "lian", star: 1 };

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer2", "oracle", 20);
  const currentStep = {
    targetLevel: 10,
    rerolls: 0,
    expectedGoldAfterPreparation: bridge.engine.state.gold,
    purchasesByShop: [],
    salesByShop: [],
    expectedPlayerLevel: 10,
    expectedShop: [...bridge.engine.state.shop],
    expectedTargetCopies: { rutice: 1 },
    expectedTransitionUnits: [{ id: "lian", star: 1 }],
    expectedBoardCount: 0,
    expectedRosterCount: 2,
  };
  autopilot.seerPlan = {
    firstStep: currentStep,
    startRound: 18,
    steps: [{ ...currentStep, expectedShop: [] }, currentStep],
    projectedRound: 20,
    projectedHp: bridge.engine.state.hp,
    projectedGold: bridge.engine.state.gold,
    projectedLevel: 10,
    projectedTargetCopies: { rutice: 1 },
    projectedBoardCount: 0,
    projectedRosterCount: 2,
    score: 1,
    exploredStates: 1,
    dominancePrunes: 0,
  };

  const reusable = autopilot.reusableSeerPlan(autopilot.ownedEntries());
  assert.ok(reusable);
  assert.equal(reusable.startRound, 19);
  assert.equal(reusable.steps.length, 1);
});

test("看穿2按六进三复筛阵容并独占真人记录站位", () => {
  const bridge = new EngineBridge(152002);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 19;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  SEER2_TERMINAL_TARGET_IDS.forEach((id, index) => {
    const unit = { uid: 1520020 + index, id, star: 3 };
    if (index < 10) bridge.engine.state.board[index] = unit;
    else bridge.engine.state.bench[index - 10] = unit;
  });

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer2", "oracle", 20);
  const calls = [];
  autopilot.rolloutLineupScore = (lineup, formation, stableOnly = false) => {
    const ids = lineup.map(({ unit }) => unit.id);
    calls.push({ ids, formation, stableOnly });
    const lineupScore = ids.includes("cog_scribe") && !ids.includes("yukisyo")
      ? 300
      : ids.includes("rutice") && !ids.includes("yukisyo") ? 200 : 100;
    return lineupScore + (stableOnly && formation === "human_recorded" ? 1000 : 0);
  };

  const roster = autopilot.ownedEntries();
  const principalLineups = autopilot.seer2PrincipalLineups(roster, 10);
  assert.equal(principalLineups.length, 4);
  const chosen = autopilot.rolloutTargetLineup(roster);
  assert.equal(chosen.length, 10);
  assert.equal(chosen.some(({ unit }) => unit.id === "cog_scribe"), true);
  assert.equal(autopilot.plannedFormation, "human_recorded");

  const robustCalls = calls.filter(({ stableOnly }) => stableOnly);
  assert.equal(robustCalls.length, 12);
  assert.deepEqual(
    new Set(robustCalls.map(({ formation }) => formation)),
    new Set(["human_recorded", "human_midline", "center_wedge", "split_flanks"]),
  );

  const seer = new AutoChessAutopilot(bridge, "evolution", {}, "seer", "oracle", 20);
  assert.deepEqual(
    seer.formationProfileIds(),
    ["human_recorded", "human_midline", "center_wedge", "split_flanks"],
  );
});
