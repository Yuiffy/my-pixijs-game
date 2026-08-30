import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const { AutoChessAIController } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAI.ts",
);
const {
  aggregateAutopilotRolloutScores,
  AutoChessAutopilot,
  getAutopilotRolloutCacheStats,
  goCanonicalFormationPlacements,
  hydrateAutopilotRolloutCache,
  snapshotAutopilotRolloutCache,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);
const {
  AUTOPILOT_THINKING_BUDGETS,
  effectiveStyleForAutopilotConfiguration,
  informationModeForAutopilotStyle,
  informationModeForAutopilotThinkingLevel,
  oraclePlanningWindowForRound,
  resolveAutopilotStylePolicy,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/autopilotPolicy.ts",
);
const { AutopilotWorkerRuntime } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/autopilotWorkerRuntime.ts",
);
const { planSeerEconomy, forecastSeerWaves } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/seerPlanner.ts",
);
const {
  AUTOPILOT_LATE_GAME_TARGET_IDS,
  AUTOPILOT_TERMINAL_TARGET_IDS,
  desiredLateGameLevelForRound,
  lateGameTargetDesiredStar,
  lateGameTargetPriority,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/lateGamePlan.ts",
);
const { CAMPAIGN_ROUNDS, SHOP_UNITS, UNIT_DEFS } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);
const { AUTOCHESS_VERSION } = await loadTypescriptModule(
  "src/components/autoChessGame/version.ts",
);
const hostSource = await readFile("src/components/autoChessGame/PhaserGame.tsx", "utf8");
const workerClientSource = await readFile(
  "src/components/autoChessGame/ai/AutoChessAutopilotWorkerClient.ts",
  "utf8",
);
const workerSource = await readFile(
  "src/components/autoChessGame/ai/autopilot.worker.ts",
  "utf8",
);
const hudSource = await readFile("src/components/autoChessGame/RiftHud.tsx", "utf8");
const hudStyles = await readFile("src/components/autoChessGame/RiftHud.css", "utf8");

const makeLateSeerCase = (shop, bench = [], round = 20, style = "seer") => {
  const bridge = new EngineBridge(13161, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.round = round;
  state.playerLevel = 10;
  state.upgradeRemaining = 0;
  state.hp = 20;
  state.gold = 80;
  state.board.fill(null);
  state.bench.fill(null);
  state.shop = shop;
  for (let index = 0; index < 10; index += 1) {
    state.board[index] = { uid: 131610 + index, id: "mossback", star: 1 };
  }
  bench.forEach((unit, index) => {
    state.bench[index] = { uid: 131630 + index, ...unit };
  });
  const autopilot = new AutoChessAutopilot(
    bridge,
    "heuristic",
    {},
    style,
    style === "seer" ? "oracle" : "normal",
    20,
  );
  autopilot.plannedRound = state.round;
  autopilot.preparationStartGold = state.gold;
  autopilot.observeStabilizationStrength = () => {};
  autopilot.rolloutConfidence = () => 10400;
  autopilot.formationAction = () => null;
  const firstStep = {
    targetLevel: 10,
    rerolls: 0,
    expectedGoldAfterPreparation: 80,
    purchasesByShop: [[]],
    salesByShop: [[]],
  };
  autopilot.seerPlan = {
    firstStep,
    steps: [firstStep],
    startRound: state.round,
    projectedRound: state.round + 1,
    projectedTargetCopies: {},
    complete: true,
  };
  return { bridge, autopilot };
};

test("稳健与搏上限保持普通信息并使用不同的生存经济目标", () => {
  const survival = resolveAutopilotStylePolicy("survival");
  const balanced = resolveAutopilotStylePolicy("balanced");
  const highroll = resolveAutopilotStylePolicy("highroll");
  assert.equal(survival.safeWinRolloutScore, 10050);
  assert.equal(balanced.safeWinRolloutScore, 10010);
  assert.equal(highroll.safeWinRolloutScore, 10010);
  assert.deepEqual(
    resolveAutopilotStylePolicy("fair"),
    resolveAutopilotStylePolicy("balanced"),
  );
  assert.ok(survival.woundedHpThreshold > highroll.woundedHpThreshold);
  assert.ok(survival.financeActivationMaxRolloutDeficit < highroll.financeActivationMaxRolloutDeficit);
  assert.ok(survival.lateGamePurchaseStartRound > highroll.lateGamePurchaseStartRound);
  assert.ok(survival.financePurchaseInterestTiersAtRisk > highroll.financePurchaseInterestTiersAtRisk);
  assert.ok(survival.upgradeProjectLimit < highroll.upgradeProjectLimit);
  assert.ok(highroll.bankPurchaseInterestTiersAtRisk < balanced.bankPurchaseInterestTiersAtRisk);
  assert.ok(highroll.goodPurchaseInterestTiersAtRisk < balanced.goodPurchaseInterestTiersAtRisk);
  assert.ok(highroll.mergePurchaseInterestTiersAtRisk < balanced.mergePurchaseInterestTiersAtRisk);
  assert.ok(highroll.levelInterestTiersAtRisk < balanced.levelInterestTiersAtRisk);
  assert.ok(
    highroll.healthyStabilizeMaximumDryPaidRerolls < highroll.maximumDryPaidRerolls,
  );
  assert.ok(
    highroll.healthyStabilizeRerollInterestTiersAtRisk
      < highroll.stabilizeRerollInterestTiersAtRisk,
  );
  assert.equal(resolveAutopilotStylePolicy("seer").safeWinRolloutScore, 10050);
  assert.equal(informationModeForAutopilotStyle("survival"), "normal");
  assert.equal(informationModeForAutopilotStyle("highroll"), "normal");
  assert.equal(informationModeForAutopilotStyle("fair"), "normal");
  assert.equal(informationModeForAutopilotStyle("seer"), "oracle");
});

test("非看穿风格前期不把未拥有的终局一星牌塞满候补", () => {
  const bridge = new EngineBridge(13069);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 5;
  bridge.engine.state.playerLevel = 5;
  const traitPartner = SHOP_UNITS.find((id) => (
    id !== "xuehui"
    && !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id)
    && UNIT_DEFS[id].cost >= 4
    && UNIT_DEFS[id].traits.some((trait) => UNIT_DEFS.xuehui.traits.includes(trait))
  ));
  assert.ok(traitPartner);
  const transitionIds = [traitPartner, ...SHOP_UNITS.filter((id) => (
    id !== traitPartner
    && !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id)
    && UNIT_DEFS[id].cost >= 4
  ))].slice(0, 4);
  assert.equal(transitionIds.length, 4);
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  transitionIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130690 + index, id, star: 1 };
  });
  bridge.engine.state.shop = ["xuehui", null, null, null, null];
  bridge.engine.state.gold = 30;
  const autopilot = new AutoChessAutopilot(bridge, "heuristic", {}, "balanced", "normal");
  const candidate = autopilot.shopCandidates(autopilot.ownedEntries(), false);
  const targetCandidate = candidate.find(({ id }) => id === "xuehui");
  assert.ok(targetCandidate);
  assert.equal(targetCandidate.lateGamePriority, 0);
});

test("稳健长考只保留两个明确终局项目并在满席清理其余单卡", () => {
  const bridge = new EngineBridge(130691, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.round = 13;
  state.hp = 13;
  state.playerLevel = 7;
  state.gold = 15;
  state.board.fill(null);
  state.bench.fill(null);
  SHOP_UNITS.filter((id) => !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id))
    .slice(0, 7)
    .forEach((id, index) => {
      state.board[index] = { uid: 1306910 + index, id, star: 2 };
    });
  AUTOPILOT_TERMINAL_TARGET_IDS.slice(0, 8).forEach((id, index) => {
    state.bench[index] = { uid: 1306930 + index, id, star: 1 };
  });
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "survival",
    "normal",
    20,
    undefined,
    true,
    "deep",
  );
  autopilot.rolloutTargetLineup = (roster) => roster.filter(
    ({ location }) => location.zone === "board",
  );
  autopilot.rolloutConfidence = () => 10400;

  const focused = autopilot.seerProjectFocusIds(autopilot.ownedEntries());
  const reserves = autopilot.lateGameReserveUids(autopilot.ownedEntries());
  assert.equal(focused.size, 2);
  assert.deepEqual(
    new Set(autopilot.ownedEntries()
      .filter(({ unit, location }) => location.zone === "bench" && reserves.has(unit.uid))
      .map(({ unit }) => unit.id)),
    focused,
  );

  let sales = 0;
  for (let step = 0; step < 8; step += 1) {
    const sale = autopilot.benchCleanupAction(autopilot.ownedEntries());
    if (!sale) break;
    bridge.dispatch(sale);
    sales += 1;
  }
  assert.ok(sales >= 3);
  assert.ok(state.bench.filter(Boolean).length <= 5);
  assert.equal(Array.from(focused).every(
    (id) => state.bench.some((unit) => unit?.id === id),
  ), true);
});

test("稳健安全局不会为新一星长期项目跌破当前利息档", () => {
  const bridge = new EngineBridge(130692, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.round = 13;
  state.hp = 20;
  state.playerLevel = 7;
  state.gold = 20;
  state.board.fill(null);
  state.bench.fill(null);
  SHOP_UNITS.filter((id) => !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id))
    .slice(0, 7)
    .forEach((id, index) => {
      state.board[index] = { uid: 1306920 + index, id, star: 2 };
    });
  state.shop = ["yukisyo", null, null, null, null];
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "survival",
    "normal",
    20,
    undefined,
    true,
    "deep",
  );
  autopilot.rolloutTargetLineup = (roster) => roster.filter(
    ({ location }) => location.zone === "board",
  );
  autopilot.rolloutConfidence = () => 10400;
  autopilot.rerollStrategy = () => ({ mode: "bank", rolloutScore: 10400 });

  assert.equal(autopilot.purchaseAction(autopilot.ownedEntries(), false), null);
  state.gold = 23;
  assert.deepEqual(autopilot.purchaseAction(autopilot.ownedEntries(), false), {
    type: "shop",
    index: 0,
  });
});

test("理财候选只保护每个棋种最强的一枚而非整组候补", () => {
  const bridge = new EngineBridge(130693, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.round = 13;
  state.playerLevel = 7;
  state.board.fill(null);
  state.bench.fill(null);
  SHOP_UNITS.filter((id) => (
    !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id)
    && !UNIT_DEFS[id].traits.includes("finance")
  )).slice(0, 7).forEach((id, index) => {
    state.board[index] = { uid: 1306930 + index, id, star: 2 };
  });
  state.bench[0] = { uid: 1306941, id: "mitsuri", star: 1 };
  state.bench[1] = { uid: 1306940, id: "mitsuri", star: 1 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "survival",
    "normal",
    20,
    undefined,
    true,
    "deep",
  );
  autopilot.rolloutTargetLineup = (roster) => roster.filter(
    ({ location }) => location.zone === "board",
  );

  const reserves = autopilot.financeReserveUids(autopilot.ownedEntries());
  const expendable = autopilot.expendableInterestEntries(autopilot.ownedEntries());
  assert.deepEqual([...reserves], [1306940]);
  assert.deepEqual(
    expendable.filter(({ unit }) => unit.id === "mitsuri").map(({ unit }) => unit.uid),
    [1306941],
  );
});

test("稳健安全局满候补时无需连胜也会清理闲棋凑下一档利息", () => {
  const bridge = new EngineBridge(130694, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.round = 13;
  state.hp = 20;
  state.streak = 0;
  state.playerLevel = 7;
  state.gold = 17;
  state.board.fill(null);
  state.bench.fill(null);
  const ordinary = SHOP_UNITS.filter((id) => (
    !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id)
    && !UNIT_DEFS[id].traits.includes("finance")
  ));
  ordinary.slice(0, 7).forEach((id, index) => {
    state.board[index] = { uid: 1306950 + index, id, star: 2 };
  });
  ordinary.slice(7, 15).forEach((id, index) => {
    state.bench[index] = { uid: 1306970 + index, id, star: 1 };
  });
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "survival",
    "normal",
    20,
    undefined,
    true,
    "deep",
  );
  autopilot.rolloutTargetLineup = (roster) => roster.filter(
    ({ location }) => location.zone === "board",
  );
  autopilot.rolloutConfidence = () => 10400;

  assert.deepEqual(autopilot.interestSaleAction(autopilot.ownedEntries()), {
    type: "sell",
    location: { zone: "bench", index: 0 },
  });
});

test("后期目标采用真人长期连胜十人阵容并全部追三星", () => {
  assert.deepEqual(AUTOPILOT_LATE_GAME_TARGET_IDS, [
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
  ]);
  assert.equal(new Set(AUTOPILOT_LATE_GAME_TARGET_IDS).size, 10);
  assert.deepEqual(new Set(AUTOPILOT_TERMINAL_TARGET_IDS), new Set([
    "rei",
    "yua",
    "sui_flower",
    "lian",
    "grove_mender",
    "cinder_ram",
    "spark_mage",
    "xuehui",
    "sui_bird",
    "yukisyo",
  ]));
  assert.equal(AUTOPILOT_TERMINAL_TARGET_IDS.every(
    (id) => lateGameTargetDesiredStar(id) === 3,
  ), true);
  assert.equal(lateGameTargetDesiredStar("yukisyo"), 3);
  const financePlan = AUTOPILOT_LATE_GAME_TARGET_IDS.filter(
    (id) => UNIT_DEFS[id].traits.includes("finance"),
  );
  assert.deepEqual(new Set(financePlan), new Set([
    "sui_flower",
    "lian",
    "grove_mender",
    "yukisyo",
  ]));
  assert.ok(lateGameTargetPriority("grove_mender") > lateGameTargetPriority("xuehui"));
  assert.equal(desiredLateGameLevelForRound(9), 3);
  assert.equal(desiredLateGameLevelForRound(10), 3);
  assert.equal(desiredLateGameLevelForRound(12), 8);
  assert.equal(desiredLateGameLevelForRound(15), 9);
  assert.equal(desiredLateGameLevelForRound(18), 10);
});

test("看穿在候补席满时分流终局项目并为主项目让出复制位", () => {
  const bridge = new EngineBridge(13070);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.round = 20;
  bridge.engine.state.hp = 20;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.shop.fill(null);
  const targetIds = [
    AUTOPILOT_TERMINAL_TARGET_IDS[0],
    AUTOPILOT_TERMINAL_TARGET_IDS[1],
    AUTOPILOT_TERMINAL_TARGET_IDS[2],
    AUTOPILOT_TERMINAL_TARGET_IDS.at(-1),
  ];
  let uid = 130700;
  targetIds.slice(0, 3).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 2 };
  });
  SHOP_UNITS.filter((id) => !AUTOPILOT_TERMINAL_TARGET_IDS.includes(id))
    .slice(0, 7)
    .forEach((id, index) => {
      bridge.engine.state.board[index + 3] = { uid: uid += 1, id, star: 1 };
    });
  bridge.engine.state.bench[0] = { uid: uid += 1, id: targetIds[3], star: 1 };
  bridge.engine.state.bench[1] = { uid: uid += 1, id: targetIds[3], star: 1 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "heuristic",
    {},
    "seer",
    "oracle",
  );
  const roster = autopilot.ownedEntries();
  const focused = autopilot.seerProjectFocusIds(roster);
  const reserves = autopilot.lateGameReserveUids(roster);
  assert.equal(focused.has(targetIds[0]), true);
  assert.equal(focused.has(targetIds[3]), false);
  const secondaryCopies = roster.filter(({ unit }) => unit.id === targetIds[3]);
  assert.equal(secondaryCopies.filter(({ unit }) => reserves.has(unit.uid)).length, 0);
  assert.equal(secondaryCopies.filter(({ unit }) => !reserves.has(unit.uid)).length, 2);
});

test("训练桥接关闭战斗遥测、视觉特效和操作快照但仍能结算", () => {
  const bridge = new EngineBridge(90211, 1, {
    simulation: true,
    battleStepHz: 30,
  });
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.dispatch({ type: "battle" });

  assert.equal(bridge.engine.state.phase, "battle");
  assert.deepEqual(bridge.engine.state.battle.eventLog, []);
  bridge.engine.recordBattleControl("训练路径不应记录这条事件");
  assert.deepEqual(bridge.engine.state.battle.eventLog, []);

  const result = bridge.skipBattle();
  assert.equal(result.skipped, true);
  assert.equal(bridge.engine.state.phase, "result");
  assert.deepEqual(bridge.engine.state.battle.effects, []);
  assert.deepEqual(bridge.engine.state.battle.eventLog, []);
  assert.deepEqual(bridge.getActionHistory(), []);
  assert.equal("state" in result, false);
});

test("训练桥接支持 CPU 快进步长，精确审计仍可使用 60Hz", () => {
  const run = (battleStepHz) => {
    const bridge = new EngineBridge(90212, 1, {
      simulation: true,
      battleStepHz,
    });
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.dispatch({ type: "battle" });
    const result = bridge.skipBattle();
    return {
      ...result,
      won: bridge.engine.state.result?.won,
      phase: bridge.engine.state.phase,
    };
  };
  const turbo = run(20);
  const exact = run(60);
  assert.equal(turbo.phase, "result");
  assert.equal(exact.phase, "result");
  assert.equal(turbo.won, exact.won);
  assert.ok(turbo.steps < exact.steps);
  assert.equal(turbo.simulatedSeconds, Number((turbo.steps / 20).toFixed(2)));
  assert.equal(exact.simulatedSeconds, Number((exact.steps / 60).toFixed(2)));
});

test("粗筛推演不会把 exactOnly 候选误升到 60Hz", () => {
  const bridge = new EngineBridge(90212);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
  );
  const observed = [];
  pilot.rolloutLineupScore = (_lineup, _formation, _stableOnly) => {
    observed.push(pilot.rolloutCombatHz);
    return 10000;
  };
  pilot.previewRosterRollout(pilot.ownedEntries(), true);
  assert.ok(observed.length > 0);
  assert.equal(new Set(observed).size, 1);
  assert.equal(observed[0], 20);

  const exactPilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    60,
  );
  const exactObserved = [];
  exactPilot.rolloutLineupScore = (_lineup, _formation, _stableOnly) => {
    exactObserved.push(exactPilot.rolloutCombatHz);
    return 10000;
  };
  exactPilot.previewRosterRollout(exactPilot.ownedEntries(), true);
  assert.ok(exactObserved.length > 0);
  assert.equal(new Set(exactObserved).size, 1);
  assert.equal(exactObserved[0], 60);
});

test("浏览器托管默认使用20Hz快速推演而不是60Hz实时步长", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null } };
  try {
    const bridge = new EngineBridge(902121, 1, { simulation: true, battleStepHz: 20 });
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer", "oracle");
    assert.equal(pilot.rolloutCombatHz, 20);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("离线正式演练可以显式开启线上同款60Hz临战审计", () => {
  const bridge = new EngineBridge(902125, 1, { simulation: true, battleStepHz: 60 });
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    undefined,
    true,
  );
  pilot.phase = "preparation";
  pilot.plannedRound = 1;
  pilot.nextActionAt = 0;
  pilot.nextPreparationAction = () => ({ type: "battle" });
  pilot.setEnabled(true);
  const observedHz = [];
  pilot.battleConfidence = () => 10100;
  pilot.rolloutBoardScore = (_board, _stableOnly, combatHz = pilot.rolloutCombatHz) => {
    observedHz.push(combatHz);
    return combatHz === 60 ? -120 : 10100;
  };

  assert.equal(pilot.tick(1000), null);
  assert.equal(bridge.engine.state.phase, "preparation");
  assert.deepEqual(observedHz, [60]);
});

test("看穿浏览器终局重规划只验证短滚动前缀", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null } };
  try {
    const bridge = new EngineBridge(902122, 1, { simulation: true, battleStepHz: 20 });
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.round = 50;
    bridge.engine.state.hp = 13;
    bridge.engine.state.gold = 1325;
    bridge.engine.state.playerLevel = 10;
    bridge.engine.state.upgradeRemaining = 0;
    bridge.engine.state.board.fill(null);
    bridge.engine.state.bench.fill(null);
    SHOP_UNITS.slice(0, 10).forEach((id, index) => {
      bridge.engine.state.board[index] = { uid: 9021220 + index, id, star: 3 };
    });
    SHOP_UNITS.slice(10, 16).forEach((id, index) => {
      bridge.engine.state.bench[index] = { uid: 9021230 + index, id, star: 3 };
    });
    const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer", "oracle");
    pilot.validateSeerRoute = () => {
      throw new Error("interactive late planner must not replay a full route");
    };
    pilot.resetPreparation(50);
    assert.equal(pilot.rolloutCombatHz, 20);
    assert.ok(pilot.seerPlan);
    assert.ok(pilot.seerPlan.planningHorizon <= 6);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("看穿浏览器开战前会用60Hz审计20Hz假胜并重新决策一次", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null } };
  try {
    const bridge = new EngineBridge(902123, 1, { simulation: true, battleStepHz: 20 });
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.round = 50;
    bridge.engine.state.board[0] = { uid: 9021230, id: SHOP_UNITS[0], star: 3 };
    const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer", "oracle");
    pilot.phase = "preparation";
    pilot.plannedRound = 50;
    pilot.nextActionAt = 0;
    pilot.nextPreparationAction = () => ({ type: "battle" });
    pilot.setEnabled(true);
    const observedHz = [];
    pilot.rolloutBoardScore = (_board, _stableOnly, combatHz = pilot.rolloutCombatHz) => {
      observedHz.push(combatHz);
      return combatHz === 60 ? 9900 : 10100;
    };

    const rejected = pilot.tick(1000);
    assert.equal(rejected, null);
    assert.equal(bridge.engine.state.phase, "preparation");
    assert.deepEqual(observedHz, [20, 60]);

    const retried = pilot.tick(2000);
    assert.equal(retried?.type, "battle");
    assert.equal(bridge.engine.state.phase, "battle");
    assert.deepEqual(observedHz, [20, 60, 20]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("均衡浏览器开战前也不会直接相信20Hz假胜", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null } };
  try {
    const bridge = new EngineBridge(902124, 1, { simulation: true, battleStepHz: 60 });
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    const pilot = new AutoChessAutopilot(
      bridge,
      "evolution",
      {},
      "balanced",
      "normal",
      20,
    );
    pilot.phase = "preparation";
    pilot.plannedRound = 1;
    pilot.nextActionAt = 0;
    pilot.nextPreparationAction = () => ({ type: "battle" });
    pilot.setEnabled(true);
    const observedHz = [];
    pilot.battleConfidence = () => {
      observedHz.push(20);
      return 10100;
    };
    pilot.rolloutBoardScore = (_board, _stableOnly, combatHz = pilot.rolloutCombatHz) => {
      observedHz.push(combatHz);
      return combatHz === 60 ? -120 : 10100;
    };

    const rejected = pilot.tick(1000);
    assert.equal(rejected, null);
    assert.equal(bridge.engine.state.phase, "preparation");
    assert.deepEqual(observedHz, [20, 60]);

    const retried = pilot.tick(2000);
    assert.equal(retried?.type, "battle");
    assert.equal(bridge.engine.state.phase, "battle");
    assert.deepEqual(observedHz, [20, 60, 20]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("看穿2临界血量会用精确战斗复核并切入稳血", () => {
  const bridge = new EngineBridge(90213);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.hp = 8;
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    30,
  );
  pilot.rolloutTargetLineup = (roster) => roster.filter(
    ({ location }) => location.zone === "board",
  );
  pilot.rolloutConfidence = () => 10128;
  const observedHz = [];
  pilot.rolloutLineupScore = (_lineup, _formation, _stableOnly, combatHz) => {
    observedHz.push(combatHz);
    return combatHz === 60 ? 9900 : 10128;
  };

  const decision = pilot.rerollStrategy(pilot.ownedEntries(), true);
  assert.equal(decision.mode, "stabilize");
  assert.equal(decision.rolloutScore, 9900);
  assert.ok(observedHz.includes(60));
});

test("看穿开局会用60Hz首步验证淘汰抽象假胜并尝试备选", () => {
  const bridge = new EngineBridge(902131);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    20,
  );
  const makePlan = (id) => ({
    id,
    firstStep: { targetLevel: 3, rerolls: 0, expectedGoldAfterPreparation: 0 },
    steps: [{
      targetLevel: 3,
      rerolls: 0,
      expectedGoldAfterPreparation: 0,
      expectedBattleWon: true,
      expectedBattleMargin: 0,
    }],
    complete: false,
    projectedRound: 1,
    projectedHp: 20,
    projectedGold: 0,
    projectedLevel: 3,
    projectedTargetCopies: {},
    projectedBoardCount: 3,
    projectedRosterCount: 3,
    score: 0,
    exploredStates: 0,
    dominancePrunes: 0,
  });
  const calls = [];
  pilot.validateSeerRoute = (plan, limit, requireComplete) => {
    calls.push({ id: plan.id, limit, requireComplete });
    const won = plan.id === "backup";
    const step = {
      ...plan.steps[0],
      expectedBattleWon: won,
      expectedBattleMargin: won ? 2.5 : -18,
    };
    return { ...plan, firstStep: step, steps: [step] };
  };

  const selected = pilot.validateSeerOpeningCandidates([
    makePlan("abstract-best"),
    makePlan("backup"),
  ]);
  assert.equal(selected?.id, "backup");
  assert.deepEqual(calls, [
    { id: "abstract-best", limit: 1, requireComplete: false },
    { id: "backup", limit: 1, requireComplete: false },
  ]);
});

test("AI 控制台对象覆盖完整流程并使用 1 起始槽位", () => {
  const bridge = new EngineBridge(90210);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  const ai = new AutoChessAIController(bridge);

  assert.equal(ai.version, AUTOCHESS_VERSION);
  assert.match(ai.help().indexing, /1-based/);
  assert.ok(ai.help().read.includes("actions(count = 200)"));
  assert.ok(ai.help().read.includes("battles()"));
  assert.ok(ai.help().flow.includes("finishCampaign()"));
  assert.ok(ai.help().flow.includes("continueEndless()"));
  assert.equal(ai.starter(1).ok, true);
  assert.equal(bridge.engine.state.phase, "preparation");
  assert.ok(bridge.engine.state.board.some(Boolean));
  assert.equal(ai.select("board", 1).ok, true);
  assert.equal(ai.move("board", 1, "bench", 1).ok, true);
  assert.equal(ai.move("bench", 1, "board", 1).ok, true);
  assert.equal(ai.buy(0).ok, false);
  assert.equal(ai.move("board", 25, "bench", 1).ok, false);
  assert.equal(ai.battle().ok, true);
  assert.equal(bridge.engine.state.phase, "battle");
  const skipped = ai.skipBattle();
  assert.equal(skipped.skipped, true);
  assert.equal(bridge.engine.state.phase, "result");
  assert.ok(ai.logs().some((event) => event.type === "battle"));
  const actionTrace = ai.actions();
  assert.equal(actionTrace.at(-1).action.type, "skipBattle");
  assert.equal(actionTrace[0].action.type, "starter");
  assert.equal(actionTrace[0].before.phase, "title");
  assert.equal(actionTrace[0].after.phase, "preparation");
  assert.ok(actionTrace[0].after.board.some((unit) => unit.name && unit.slot >= 1));
  bridge.engine.state.phase = "gameover";
  assert.equal(ai.restart().ok, true);
  const restartedTrace = ai.actions();
  assert.equal(restartedTrace.at(-1).action.type, "restart");
  assert.equal(restartedTrace.at(-1).before.phase, "gameover");
  assert.equal(restartedTrace.at(-1).after.phase, "title");
  assert.ok(restartedTrace.some((entry) => entry.action.type === "starter"));
  const textState = JSON.parse(bridge.renderTextState());
  assert.equal(textState.version, AUTOCHESS_VERSION);
  assert.deepEqual(textState.recentActions, restartedTrace.slice(-12));
});

test("重开仅在显式固定时复用种子", () => {
  const unpinnedSeed = 4_294_967_296;
  const unpinned = new EngineBridge(unpinnedSeed, 1, { simulation: true });
  unpinned.dispatch({ type: "restart" });
  assert.notEqual(unpinned.engine.state.seed, unpinnedSeed);
  assert.ok(unpinned.engine.state.seed >= 0 && unpinned.engine.state.seed < unpinnedSeed);
  assert.equal(unpinned.engine.state.enemySeed, unpinned.engine.state.seed);

  const pinnedSeed = 907_101;
  const pinned = new EngineBridge(pinnedSeed, 1, {
    simulation: true,
    restartSeed: pinnedSeed,
  });
  const initialChoices = [...pinned.engine.state.starterChoices];
  pinned.engine.state.phase = "gameover";
  pinned.dispatch({ type: "restart" });
  assert.equal(pinned.engine.state.phase, "title");
  assert.equal(pinned.engine.state.seed, pinnedSeed);
  assert.equal(pinned.engine.state.enemySeed, pinnedSeed);
  assert.deepEqual(pinned.engine.state.starterChoices, initialChoices);
});

test("AI 控制台显式区分完成远征与继续无限", () => {
  const setupVictory = (bridge) => {
    bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.round = CAMPAIGN_ROUNDS;
    bridge.engine.state.phase = "result";
    bridge.engine.state.result = {
      won: true,
      headline: "裂隙封闭",
      detail: "终局首领已击败",
      income: 0,
      bounty: 0,
      defeatedEnemies: 1,
      defeatedByStar: { 1: 0, 2: 0, 3: 1 },
      upgradeDiscount: 0,
      damage: 0,
    };
  };

  const finishBridge = new EngineBridge(7403);
  finishBridge.setConsoleLogging(false);
  const finishAi = new AutoChessAIController(finishBridge);
  assert.equal(finishAi.finishCampaign().ok, false);
  setupVictory(finishBridge);
  assert.equal(finishAi.finishCampaign().ok, true);
  assert.equal(finishBridge.engine.state.phase, "gameover");
  assert.equal(finishBridge.engine.state.finalWon, true);
  assert.equal(finishAi.continueEndless().ok, false);

  const endlessBridge = new EngineBridge(7404);
  endlessBridge.setConsoleLogging(false);
  setupVictory(endlessBridge);
  const endlessAi = new AutoChessAIController(endlessBridge);
  assert.equal(endlessAi.continueEndless().ok, true);
  assert.equal(endlessBridge.engine.state.endlessUnlocked, true);
  assert.equal(endlessBridge.engine.state.phase, "augment");
  assert.equal(endlessBridge.getActionHistory().at(-1).action.type, "continueEndless");
});

test("长局日志跨战保留超过旧 320/500 上限并记录开战站位", () => {
  const bridge = new EngineBridge(7720);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");

  for (let round = 1; round <= 2; round += 1) {
    bridge.engine.state.round = round;
    bridge.engine.state.phase = "preparation";
    bridge.engine.startBattle();
    for (let event = 0; event < 700; event += 1) {
      bridge.engine.recordBattleControl(`round-${round}-event-${event}`);
    }
    bridge.advance(1);
    bridge.engine.state.phase = "preparation";
    bridge.engine.state.battle = null;
    bridge.advance(1);
  }

  const battles = bridge.getBattleHistory();
  const logs = bridge.getBattleLog(2_000);
  assert.equal(battles.length, 2);
  assert.ok(battles[0].events.length > 700);
  assert.ok(battles[1].events.length > 700);
  assert.equal(logs.length, battles[0].events.length + battles[1].events.length);
  assert.equal(logs[0].round, 1);
  assert.equal(logs.at(-1).round, 2);
  assert.ok(battles.every((battle) => battle.formation.player.every((unit) => (
    unit.slot >= 1 && Number.isFinite(unit.x) && Number.isFinite(unit.y)
  ))));
  assert.equal(bridge.getTraceStats().droppedBattleEvents, 0);
});

test("操作轨迹容量超过旧 640 条上限", () => {
  const bridge = new EngineBridge(7721);
  bridge.setConsoleLogging(false);
  for (let action = 0; action < 1_200; action += 1) {
    bridge.dispatch({ type: "clearSelection" });
  }
  assert.equal(bridge.getActionHistory(2_000).length, 1_200);
  assert.equal(bridge.getTraceStats().limits.actions, 10_000);
  assert.equal(bridge.getTraceStats().limits.battleEvents, 100_000);
});

test("战斗日志记录目标、施法、投射物命中方向与伤害", () => {
  const bridge = new EngineBridge(7711);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  bridge.engine.startBattle();
  const battle = bridge.engine.state.battle;
  assert.ok(battle);
  const source = battle.player[0];
  const target = battle.enemy[0];
  source.x = target.x - 110;
  source.y = target.y;
  source.targetFid = target.fid;
  bridge.engine.update(1 / 60);
  bridge.engine.castAbility(source, battle.enemy, true);
  bridge.engine.fireFixedProjectile(source, target, {
    sourceFid: source.fid,
    targetFid: target.fid,
    delay: 0,
    damage: 17,
    damageKind: "ability",
    burnPower: 0,
    speed: 900,
    color: "#ffffff",
    size: 6,
    style: "carrot",
  });
  for (let step = 0; step < 20 && battle.projectiles.length; step += 1) {
    bridge.engine.update(1 / 60);
  }

  assert.ok(battle.eventLog.some((event) => event.type === "target" && event.direction));
  assert.ok(battle.eventLog.some((event) => event.type === "ability" && event.ability));
  const hit = battle.eventLog.find((event) => event.type === "projectile" && event.projectile === "carrot");
  assert.ok(hit);
  assert.equal(hit.damageKind, "ability");
  assert.ok(hit.amount > 0);
  assert.ok(Number.isFinite(hit.impact.x) && Number.isFinite(hit.impact.y));
  assert.match(hit.message, /命中.*造成/);
  const textState = JSON.parse(bridge.engine.renderTextState());
  assert.ok(textState.battle.log.some((event) => event.id === hit.id));
});

test("AI 出售接口支持指定槽位和选中后点击式出售", () => {
  const bridge = new EngineBridge(7712);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  const ai = new AutoChessAIController(bridge);
  const boardIndex = bridge.engine.state.board.findIndex(Boolean);
  const boardUnit = bridge.engine.state.board[boardIndex];
  const directGold = bridge.engine.state.gold;

  assert.ok(boardUnit);
  assert.equal(ai.sell("board", boardIndex + 1).ok, true);
  assert.equal(bridge.engine.state.board[boardIndex], null);
  assert.equal(bridge.engine.state.gold, directGold + UNIT_DEFS[boardUnit.id].cost);

  bridge.engine.state.bench[0] = { uid: 771200, id: boardUnit.id, star: 1 };
  const selectedGold = bridge.engine.state.gold;
  assert.equal(ai.select("bench", 1).ok, true);
  assert.deepEqual(bridge.engine.state.selected, { zone: "bench", index: 0 });
  assert.equal(ai.sell().ok, true);
  assert.equal(bridge.engine.state.bench[0], null);
  assert.equal(bridge.engine.state.selected, null);
  assert.equal(bridge.engine.state.gold, selectedGold + UNIT_DEFS[boardUnit.id].cost);
});

test("满级托管会解锁工坊并用确定性直升替代目标刷新", () => {
  const { bridge, autopilot } = makeLateSeerCase([null, null, null, null, null], [], 21);
  const state = bridge.engine.state;
  state.board[0] = { uid: 771300, id: "grove_mender", star: 2 };
  state.gold = 500;

  const unlock = autopilot.nextPreparationAction();
  assert.deepEqual(unlock, {
    type: "starForge",
    location: { zone: "board", index: 0 },
  });
  bridge.dispatch(unlock);
  assert.equal(bridge.engine.isStarForgeUnlocked, true);
  assert.equal(state.board[0].star, 2);

  const upgrade = autopilot.nextPreparationAction();
  assert.deepEqual(upgrade, {
    type: "starForge",
    location: { zone: "board", index: 0 },
  });
  bridge.dispatch(upgrade);
  assert.equal(state.board[0].star, 3);
  assert.equal(state.gold, 500 - bridge.engine.starForgeUnlockCost - 72);
});

test("满级托管资金不足以承担解锁、直升和余量时不会启用工坊", () => {
  const { bridge, autopilot } = makeLateSeerCase([null, null, null, null, null], [], 21);
  bridge.engine.state.gold = 60;
  bridge.engine.state.board[0] = { uid: 771301, id: "grove_mender", star: 2 };

  assert.equal(autopilot.starForgeAction(autopilot.ownedEntries()), null);
});

test("濒死且预测失败时工坊会用稳定化储备直升精确场上主力", () => {
  const { bridge } = makeLateSeerCase(
    ["tower_god", null, null, null, null],
    [],
    25,
    "highroll",
  );
  const state = bridge.engine.state;
  state.hp = 4;
  state.gold = 60;
  state.starForgeUnlocked = false;
  state.board.forEach((unit) => {
    if (unit) unit.star = 3;
  });
  state.board[0] = { uid: 7713010, id: "grove_mender", star: 2 };
  state.board[1] = { uid: 7713011, id: "tower_god", star: 1 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.plannedRound = state.round;
  autopilot.preparationStartGold = state.gold;
  autopilot.rolloutConfidence = () => -100;
  autopilot.rolloutTargetLineup = (roster) => roster.filter(
    ({ location }) => location.zone === "board",
  );
  autopilot.targetDesiredCopies = (id) => id === "tower_god" ? 3 : 0;

  const unlock = autopilot.nextPreparationAction();
  assert.deepEqual(unlock, {
    type: "starForge",
    location: { zone: "board", index: 1 },
  });
  bridge.dispatch(unlock);
  assert.equal(state.starForgeUnlocked, true);
  assert.equal(state.gold, 20);

  const upgrade = autopilot.nextPreparationAction();
  assert.deepEqual(upgrade, {
    type: "starForge",
    location: { zone: "board", index: 1 },
  });
  bridge.dispatch(upgrade);
  assert.equal(state.board[1].star, 2);
  assert.equal(state.gold, 0);
});

test("满候补或余额不足时不会因商店目标牌跳过工坊", () => {
  const { bridge, autopilot } = makeLateSeerCase(["grove_mender", null, null, null, null], [], 32);
  const state = bridge.engine.state;
  state.playerLevel = 10;
  state.gold = 500;
  state.board.fill(null);
  state.bench.fill(null);
  state.board[0] = { uid: 771302, id: "grove_mender", star: 2 };
  ["lian", "rei", "yua", "cinder_ram", "spark_mage", "sui_flower", "xuehui", "sui_bird", "yukisyo"]
    .forEach((id, index) => {
      state.board[index + 1] = { uid: 771310 + index, id, star: 2 };
    });
  ["zeyin", "meme", "mossback", "pako", "sun_guard", "rift_brawler", "sui_blue", "shiori"]
    .forEach((id, index) => {
      state.bench[index] = { uid: 771330 + index, id, star: 1 };
    });

  assert.deepEqual(autopilot.starForgeAction(autopilot.ownedEntries()), {
    type: "starForge",
    location: { zone: "board", index: 0 },
  });
});

test("四种托管风格在后期高金币时都能优先使用工坊", () => {
  for (const [style, index] of [
    ["survival", 0],
    ["balanced", 1],
    ["highroll", 2],
    ["seer", 3],
  ]) {
    const { bridge, autopilot } = makeLateSeerCase(
      [null, null, null, null, null],
      [],
      32,
      style,
    );
    bridge.engine.state.gold = 500;
    bridge.engine.state.board[0] = {
      uid: 771305 + index,
      id: "grove_mender",
      star: 2,
    };

    assert.deepEqual(
      autopilot.nextPreparationAction(),
      { type: "starForge", location: { zone: "board", index: 0 } },
      `${style} should use the late-game forge`,
    );
  }
});

test("锁定可战阵容后仍会在开战前完成有余量的工坊直升", () => {
  for (const style of ["survival", "balanced", "highroll", "seer"]) {
    const { bridge, autopilot } = makeLateSeerCase(
      [null, null, null, null, null],
      [],
      32,
      style,
    );
    const state = bridge.engine.state;
    state.gold = 500;
    state.board[0] = { uid: 771350, id: "grove_mender", star: 2 };
    autopilot.plannedLineupUids = state.board.filter(Boolean).map((unit) => unit.uid);
    autopilot.plannedBoardSlots = new Map(
      state.board.flatMap((unit, slot) => unit ? [[unit.uid, slot]] : []),
    );
    autopilot.rescueLineupLocked = true;

    assert.deepEqual(
      autopilot.nextPreparationAction(),
      { type: "starForge", location: { zone: "board", index: 0 } },
      `${style} should forge before battling a locked lineup`,
    );
  }
});

test("整备动作达到保险上限时仍优先使用已负担得起的工坊升级", () => {
  const { bridge, autopilot } = makeLateSeerCase([null, null, null, null, null], [], 32);
  bridge.engine.state.gold = 500;
  bridge.engine.state.board[0] = { uid: 771302, id: "grove_mender", star: 2 };
  autopilot.preparationActions = 95;

  assert.deepEqual(autopilot.nextPreparationAction(), {
    type: "starForge",
    location: { zone: "board", index: 0 },
  });
});

test("搏上限看穿首战补人口和升本都保留至少五金币", () => {
  const bridge = new EngineBridge(153100, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["mature_start"];
  bridge.engine.startRun("mature_start");
  bridge.engine.state.shop = ["nightin", "sun_guard", "pako", "sui", "rift_stalker"];
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.setEnabled(true);

  const actions = [];
  for (let step = 0; step < 120 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(1000 + step * 1000);
    if (action) actions.push(action.type);
  }

  assert.equal(bridge.engine.state.phase, "battle");
  assert.equal(bridge.engine.state.gold >= 5, true);
  assert.equal(bridge.engine.interestIncome >= 1, true);
  assert.equal(actions.includes("buyXp"), false);
});

test("同回合卖出的棋子不会回购，除非当前购买会立即合成", () => {
  const { bridge, autopilot } = makeLateSeerCase([null, null, null, null, null], [], 20, "highroll");
  const targetId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 5);
  assert.ok(targetId);
  bridge.engine.state.shop = [targetId, null, null, null, null];
  autopilot.soldUnitIds.add(targetId);

  assert.equal(
    autopilot.shopCandidates(autopilot.ownedEntries(), false).some(({ id }) => id === targetId),
    false,
  );

  bridge.engine.state.bench[0] = { uid: 771390, id: targetId, star: 1 };
  bridge.engine.state.bench[1] = { uid: 771391, id: targetId, star: 1 };
  const merge = autopilot.shopCandidates(autopilot.ownedEntries(), false)
    .find(({ id }) => id === targetId);
  assert.equal(merge?.completesMerge, true);
});

test("经济收尾开始后只完成工坊、清理和落位，不再重新购物", () => {
  const { bridge, autopilot } = makeLateSeerCase(["grove_mender", null, null, null, null], [], 20, "highroll");
  let purchaseCalls = 0;
  let rescueSearchCalls = 0;
  autopilot.finalizingEconomy = true;
  autopilot.starForgeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.searchRescueLineup = () => {
    rescueSearchCalls += 1;
    return false;
  };
  autopilot.purchaseAction = () => {
    purchaseCalls += 1;
    return { type: "shop", index: 0 };
  };
  autopilot.formationAction = () => ({
    type: "move",
    from: { zone: "board", index: 0 },
    to: { zone: "board", index: 1 },
  });

  assert.equal(autopilot.nextPreparationAction()?.type, "move");
  assert.equal(purchaseCalls, 0);

  autopilot.formationAction = () => null;
  assert.equal(autopilot.nextPreparationAction()?.type, "battle");
  assert.equal(purchaseCalls, 0);
  assert.equal(rescueSearchCalls, 1);
  assert.equal(bridge.engine.state.phase, "preparation");
});

test("搏上限看穿满级后会在刷新前使用可负担的工坊直升", () => {
  const { bridge } = makeLateSeerCase([null, null, null, null, null], [], 21, "highroll");
  bridge.engine.state.gold = 500;
  bridge.engine.state.board[0] = { uid: 771392, id: "grove_mender", star: 2 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.plannedRound = bridge.engine.state.round;
  autopilot.preparationStartGold = bridge.engine.state.gold;

  assert.deepEqual(autopilot.nextPreparationAction(), {
    type: "starForge",
    location: { zone: "board", index: 0 },
  });
});

test("搏上限看穿会把入选阵容中的一星棋子作为工坊升级目标", () => {
  const { bridge } = makeLateSeerCase([null, null, null, null, null], [], 21, "highroll");
  bridge.engine.state.gold = 500;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.plannedRound = bridge.engine.state.round;
  autopilot.preparationStartGold = bridge.engine.state.gold;

  assert.deepEqual(autopilot.nextPreparationAction(), {
    type: "starForge",
    location: { zone: "board", index: 0 },
  });
});

test("工坊最优目标太贵时会改升当前可负担的一星主力", () => {
  const { bridge } = makeLateSeerCase([null, null, null, null, null], [], 21, "highroll");
  const state = bridge.engine.state;
  state.gold = 90;
  state.board[0] = { uid: 771393, id: "grove_mender", star: 2 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.plannedRound = state.round;
  autopilot.preparationStartGold = state.gold;

  assert.deepEqual(autopilot.starForgeAction(autopilot.ownedEntries()), {
    type: "starForge",
    location: { zone: "board", index: 1 },
  });
});

test("经济收尾后不再为商店项目跳过工坊", () => {
  const { bridge } = makeLateSeerCase(["grove_mender", null, null, null, null], [], 24, "highroll");
  const state = bridge.engine.state;
  state.gold = 500;
  state.board[0] = { uid: 771394, id: "grove_mender", star: 2 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.plannedRound = state.round;
  autopilot.preparationStartGold = state.gold;
  autopilot.finalizingEconomy = true;

  assert.deepEqual(autopilot.nextPreparationAction(), {
    type: "starForge",
    location: { zone: "board", index: 0 },
  });
});

test("满棋盘满候补时仍可购买会立即合成的商店棋", () => {
  const { bridge, autopilot } = makeLateSeerCase(["grove_mender", null, null, null, null], [], 21, "highroll");
  const state = bridge.engine.state;
  state.gold = 500;
  state.bench.fill(null);
  ["lian", "rei", "yua", "cinder_ram", "spark_mage", "sui_flower"]
    .forEach((id, index) => {
      state.bench[index] = { uid: 771400 + index, id, star: 1 };
    });
  state.bench[6] = { uid: 771406, id: "grove_mender", star: 1 };
  state.bench[7] = { uid: 771407, id: "grove_mender", star: 1 };

  assert.deepEqual(autopilot.purchaseAction(autopilot.ownedEntries(), false), {
    type: "shop",
    index: 0,
  });
});

test("搏上限看穿九本安全时会停止刷新并为十本存钱", () => {
  const { bridge } = makeLateSeerCase([null, null, null, null, null], [], 19, "highroll");
  const state = bridge.engine.state;
  state.playerLevel = 9;
  state.upgradeRemaining = 44;
  state.gold = 34;
  state.hp = 5;
  state.board[9] = null;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.plannedRound = state.round;
  autopilot.preparationStartGold = state.gold;
  autopilot.rolloutConfidence = () => 10400;
  autopilot.searchRescueLineup = () => false;
  autopilot.formationAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;

  const actions = [];
  for (let step = 0; step < 4; step += 1) {
    const action = autopilot.nextPreparationAction();
    if (action) actions.push(action);
    if (action?.type === "battle") break;
  }

  assert.equal(state.gold, 34);
  assert.equal(actions.some((action) => action.type === "reroll"), false);
  assert.equal(actions.at(-1)?.type, "battle");
});

test("搏上限看穿工坊资金不足时会先存钱而不是继续刷新", () => {
  const { bridge } = makeLateSeerCase([null, null, null, null, null], [], 21, "highroll");
  const state = bridge.engine.state;
  state.gold = 50;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.plannedRound = state.round;
  autopilot.preparationStartGold = state.gold;
  autopilot.rolloutConfidence = () => 10400;
  autopilot.searchRescueLineup = () => false;
  autopilot.formationAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;

  const actions = [];
  for (let step = 0; step < 4; step += 1) {
    const action = autopilot.nextPreparationAction();
    if (action) actions.push(action);
    if (action?.type === "battle") break;
  }

  assert.equal(state.gold, 50);
  assert.equal(state.starForgeUnlocked, false);
  assert.equal(actions.some((action) => action.type === "reroll"), false);
  assert.equal(actions.at(-1)?.type, "battle");
});

test("长考和看穿连续空刷后会先做精确阵容复核", () => {
  for (const thinkingLevel of ["deep", "oracle"]) {
    const { bridge } = makeLateSeerCase([null, null, null, null, null], [], 21, "highroll");
    const state = bridge.engine.state;
    state.hp = 5;
    state.gold = 20;
    state.board.forEach((unit) => {
      if (unit) unit.star = 3;
    });
    const autopilot = new AutoChessAutopilot(
      bridge,
      "evolution",
      {},
      "highroll",
      thinkingLevel === "oracle" ? "oracle" : "normal",
      20,
      undefined,
      false,
      thinkingLevel,
    );
    autopilot.plannedRound = state.round;
    autopilot.preparationStartGold = state.gold;
    autopilot.dryPaidRerolls = 4;
    autopilot.searchRescueLineup = () => false;
    autopilot.rolloutConfidence = () => -100;
    autopilot.rerollStrategy = () => ({
      mode: "stabilize",
      rolloutScore: -100,
      upgradeChaseIds: new Set(),
    });
    autopilot.populationAction = () => null;
    autopilot.fundingSaleAction = () => null;
    autopilot.upgradeAction = () => null;
    autopilot.replacementAction = () => null;
    autopilot.purchaseAction = () => null;
    autopilot.benchCleanupAction = () => null;
    autopilot.interestSaleAction = () => null;

    assert.equal(autopilot.nextPreparationAction(), null);
    assert.equal(autopilot.exactLineupSearchRequested, true);
    assert.equal(autopilot.rerolls, 0);
  }
});

test("精确复核后即使空刷计数被重置也只再付费刷新四次", () => {
  const { bridge } = makeLateSeerCase([null, null, null, null, null], [], 25, "highroll");
  const state = bridge.engine.state;
  state.hp = 4;
  state.gold = 50;
  state.freeRerollCharges = 0;
  state.board.forEach((unit) => {
    if (unit) unit.star = 3;
  });
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    { stabilizeRerollInterestTiersAtRisk: 20 },
    "highroll",
    "oracle",
    20,
    undefined,
    false,
    "oracle",
  );
  autopilot.rolloutConfidence = () => -100;
  autopilot.rerollStrategy = () => ({
    mode: "stabilize",
    rolloutScore: -100,
    upgradeChaseIds: new Set(),
  });
  autopilot.searchRescueLineup = () => false;
  autopilot.starForgeAction = () => null;
  autopilot.populationAction = () => null;
  autopilot.fundingSaleAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.purchaseAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;
  autopilot.oracleHasFutureCandidate = () => true;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  autopilot.paidRerolls = 4;
  autopilot.dryPaidRerolls = 4;

  const actions = [];
  let resetDryCount = false;
  for (let step = 0; step < 40 && state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 1000);
    if (action) actions.push(action);
    const rerolls = actions.filter(({ type }) => type === "reroll").length;
    if (rerolls === 2 && !resetDryCount) {
      // A bought project used to reset the dry counter and reopen the whole roll-down.
      autopilot.dryPaidRerolls = 0;
      resetDryCount = true;
    }
  }

  assert.equal(autopilot.exactAuditPaidRerollBaseline, 4);
  assert.equal(actions.filter(({ type }) => type === "reroll").length, 4);
  assert.equal(autopilot.paidRerolls, 8);
  assert.equal(state.gold, 46);
});

test("AI 控制台公开指定棋子工坊调用", () => {
  const bridge = new EngineBridge(77131, 1, { simulation: true });
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.gold = 160;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 771310, id: "grove_mender", star: 2 };
  const ai = new AutoChessAIController(bridge);

  assert.equal(ai.starForge().ok, true);
  assert.equal(bridge.engine.isStarForgeUnlocked, true);
  assert.equal(ai.starForge("board", 1).ok, true);
  assert.equal(bridge.engine.state.board[0].star, 3);
});

test("宿主公开 AI API、阶段快捷键和快速结算键", () => {
  assert.match(hostSource, /window\.autoChessAI = ai/);
  assert.match(hostSource, /delete window\.autoChessAI/);
  assert.match(hostSource, /window\.autoChessLastRun = trace/);
  assert.match(hostSource, /sessionStorage\.setItem\(LAST_RUN_TRACE_KEY/);
  assert.match(hostSource, /battles: bridge\.getBattleHistory\(\)/);
  assert.match(hostSource, /persistLastRun\(trace\)/);
  assert.match(hostSource, /event\.phase === "battle" \|\| event\.phase === "result"/);
  assert.match(hostSource, /window\.addEventListener\("pagehide", onPageHide\)/);
  assert.match(hostSource, /state\.phase === "title" && number >= 1/);
  assert.match(hostSource, /state\.phase === "preparation" && key === "r"/);
  assert.match(hostSource, /state\.phase === "preparation" && key === "l"/);
  assert.match(hostSource, /state\.phase === "preparation" && key === "u"/);
  assert.match(hostSource, /state\.phase === "battle" && key === "s"/);
  assert.match(hostSource, /state\.phase === "battle" && key === "p"/);
  assert.match(hostSource, /state\.phase === "result" && event\.key === "Enter"/);
  assert.match(hostSource, /state\.phase === "gameover" && event\.key === "Enter"/);
  assert.match(hudSource, /aria-label=\{battlePaused \? "继续战斗" : "暂停战斗"\}/);
});

test("后台战斗为可选设置，开启后按隐藏期间的墙钟时间推进", () => {
  const bridge = new EngineBridge(8021);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  bridge.engine.startBattle();
  const battle = bridge.engine.state.battle;
  assert.ok(battle);

  bridge.setHidden(true, 1000);
  assert.equal(bridge.updateBackground(4000), 0);
  assert.equal(battle.elapsed, 0);

  bridge.setBackgroundBattleEnabled(true, 4000);
  assert.equal(bridge.updateBackground(5500), 1500);
  assert.ok(battle.elapsed >= 1.49);
  const textState = JSON.parse(bridge.renderTextState());
  assert.deepEqual(textState.interface, {
    enemyFormationOpen: false,
    autoplayEnabled: false,
    autoplayPreferenceStyle: "balanced",
    autoplayThinkingLevel: "veteran",
    autoplayEffectiveStyle: "survival",
    autoplayStyle: "survival",
    autoplayInformationMode: "normal",
    backgroundBattleEnabled: true,
    battlePaused: false,
    pageHidden: true,
  });

  bridge.setHidden(false, 6500);
  assert.equal(bridge.hidden, false);
  assert.ok(battle.elapsed >= 2.49);
});

test("暂停会冻结前台与后台战斗，继续后恢复并在结算时清理", () => {
  const bridge = new EngineBridge(80210);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.startBattle();
  const battle = bridge.engine.state.battle;
  assert.ok(battle);
  bridge.update(1 / 30);
  const elapsedBeforePause = battle.elapsed;
  const ai = new AutoChessAIController(bridge);

  assert.equal(ai.pause().ok, true);
  assert.equal(bridge.battlePaused, true);
  for (let frame = 0; frame < 120; frame += 1) bridge.update(1 / 60);
  assert.equal(battle.elapsed, elapsedBeforePause);

  bridge.setBackgroundBattleEnabled(true, 1000);
  bridge.setHidden(true, 1000);
  assert.equal(bridge.updateBackground(4000), 0);
  assert.equal(battle.elapsed, elapsedBeforePause);
  const pausedState = JSON.parse(bridge.renderTextState());
  assert.equal(pausedState.interface.battlePaused, true);
  assert.ok(pausedState.availableActions.includes("P 暂停/继续"));

  bridge.setHidden(false, 4000);
  assert.equal(ai.resume().ok, true);
  bridge.update(1 / 30);
  assert.ok(battle.elapsed > elapsedBeforePause);

  assert.equal(ai.pause().ok, true);
  bridge.skipBattle();
  assert.notEqual(bridge.engine.state.phase, "battle");
  assert.equal(bridge.battlePaused, false);
  assert.equal(ai.pause().ok, false);
});

test("浏览器战斗用固定60Hz子步进，低帧和高帧结果一致", () => {
  const run = (frameHz) => {
    const bridge = new EngineBridge(80211);
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.startBattle();
    const frameSeconds = 1 / frameHz;
    for (let frame = 0; frame < frameHz * 26 && bridge.engine.state.phase === "battle"; frame += 1) {
      bridge.update(frameSeconds);
    }
    return {
      phase: bridge.engine.state.phase,
      won: bridge.engine.state.result?.won,
      elapsed: bridge.engine.state.battle?.elapsed,
      player: bridge.engine.state.battle?.player.map((fighter) => ({
        hp: fighter.hp,
        alive: fighter.alive,
      })),
      enemy: bridge.engine.state.battle?.enemy.map((fighter) => ({
        hp: fighter.hp,
        alive: fighter.alive,
      })),
    };
  };

  assert.deepEqual(run(20), run(60));
});

test("托管会完成开局、整备、布阵、开战和战后继续", () => {
  const bridge = new EngineBridge(13027);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["blaze", "mature_start", "bastion"];
  const autopilot = new AutoChessAutopilot(bridge);

  assert.equal(autopilot.startFromTitle(), true);
  assert.equal(autopilot.isEnabled, true);
  assert.ok(["blaze", "mature_start", "bastion"].includes(bridge.engine.state.starter));
  assert.equal(bridge.autoplayEnabled, true);

  let now = 1000;
  for (let step = 0; step < 160 && bridge.engine.state.phase === "preparation"; step += 1) {
    now += 500;
    autopilot.tick(now);
  }
  assert.equal(bridge.engine.state.phase, "battle");
  assert.ok(bridge.engine.boardCount > 0);

  bridge.setBackgroundBattleEnabled(true, now);
  bridge.setHidden(true, now);
  for (let step = 0; step < 30 && bridge.engine.state.phase === "battle"; step += 1) {
    now += 1000;
    bridge.updateBackground(now);
    autopilot.tick(now);
  }
  assert.equal(bridge.engine.state.phase, "result");

  for (let step = 0; step < 8 && bridge.engine.state.phase === "result"; step += 1) {
    now += 500;
    autopilot.tick(now);
  }
  assert.notEqual(bridge.engine.state.phase, "result");

  autopilot.setEnabled(false);
  const phase = bridge.engine.state.phase;
  now += 5000;
  assert.equal(autopilot.tick(now), null);
  assert.equal(bridge.engine.state.phase, phase);
  assert.equal(bridge.autoplayEnabled, false);
});

test("学习型托管以规范站位为种子并让优胜阵容逐代变异", () => {
  const bridge = new EngineBridge(13028);
  bridge.setConsoleLogging(false);
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    interestSaleMinimumBench: 0,
  });
  const roster = [
    { unit: { uid: 1, id: "rei", star: 1 }, location: { zone: "board", index: 0 } },
    { unit: { uid: 2, id: "rift_brawler", star: 1 }, location: { zone: "board", index: 1 } },
    { unit: { uid: 3, id: "shiori", star: 1 }, location: { zone: "board", index: 2 } },
    { unit: { uid: 4, id: "yua", star: 1 }, location: { zone: "bench", index: 0 } },
    { unit: { uid: 5, id: "yukisyo", star: 1 }, location: { zone: "bench", index: 1 } },
  ];
  autopilot.targetLineup = () => roster.slice(0, 3);
  autopilot.lineupHeuristicScore = (lineup) => lineup.reduce((sum, entry) => sum + entry.unit.uid, 0);
  autopilot.goModelScore = (lineup) => lineup.reduce((sum, entry) => sum + entry.unit.uid, 0);
  autopilot.rolloutLineupScore = (lineup, formation) => (
    lineup.filter((entry) => entry.unit.uid >= 4).length * 100
      + (formation === "split_flanks" ? 10 : 0)
  );

  const evolved = autopilot.rolloutTargetLineup(roster);
  assert.deepEqual(evolved.map((entry) => entry.unit.uid).sort(), [3, 4, 5]);
  assert.equal(autopilot.plannedFormation, "go_canonical");
  assert.deepEqual(autopilot.lineageUnitIds.sort(), ["shiori", "yua", "yukisyo"]);

  bridge.engine.state.round = 2;
  const nextGeneration = autopilot.rolloutTargetLineup(roster);
  assert.deepEqual(nextGeneration.map((entry) => entry.unit.uid).sort(), [3, 4, 5]);
  assert.equal(autopilot.plannedFormation, "go_canonical");

  const simulation = new EngineBridge(13029).engine;
  autopilot.setSimulationLineup(simulation, [roster[0], roster[1], roster[2], roster[3]], "human_midline");
  assert.equal(simulation.state.board.findIndex((unit) => unit?.id === "rei"), 23);
  assert.equal(simulation.state.board.findIndex((unit) => unit?.id === "yua"), 10);
  assert.ok(simulation.state.board.slice(0, 3).every((unit) => unit === null));
});

test("相同战局会复用稳健预演，精确分支会区分当前随机状态与天赋", () => {
  const makePilot = (seed, augments = [], battleSeed = seed) => {
    const bridge = new EngineBridge(seed);
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.seed = battleSeed;
    bridge.engine.state.augments = [...augments];
    const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "survival", "normal", 60);
    return { pilot, roster: pilot.ownedEntries() };
  };

  const before = getAutopilotRolloutCacheStats();
  const first = makePilot(13136);
  const firstScore = first.pilot.rolloutLineupScore(first.roster, "human_midline", true);
  const afterFirst = getAutopilotRolloutCacheStats();
  const second = makePilot(13136);
  const secondScore = second.pilot.rolloutLineupScore(second.roster, "human_midline", true);
  const afterSecond = getAutopilotRolloutCacheStats();
  const differentAugment = makePilot(13136, ["vitality"]);
  differentAugment.pilot.rolloutLineupScore(differentAugment.roster, "human_midline", true);
  const afterDifferentAugment = getAutopilotRolloutCacheStats();
  const ordered = makePilot(13137, ["vitality", "momentum"]);
  ordered.pilot.rolloutLineupScore(ordered.roster, "human_midline", true);
  const afterOrdered = getAutopilotRolloutCacheStats();
  const reordered = makePilot(13137, ["momentum", "vitality"]);
  reordered.pilot.rolloutLineupScore(reordered.roster, "human_midline", true);
  const afterReordered = getAutopilotRolloutCacheStats();
  const crossSeed = makePilot(13138, [], 88138);
  crossSeed.pilot.rolloutLineupScore(crossSeed.roster, "human_midline", true);
  const afterCrossSeedFirst = getAutopilotRolloutCacheStats();
  const sameBoardsDifferentSeed = makePilot(13139, [], 88138);
  sameBoardsDifferentSeed.pilot.rolloutLineupScore(
    sameBoardsDifferentSeed.roster,
    "human_midline",
    true,
  );
  const afterCrossSeedSecond = getAutopilotRolloutCacheStats();
  const differentEnemyBoard = makePilot(13139);
  differentEnemyBoard.pilot.bridge.engine.state.round = 2;
  differentEnemyBoard.pilot.rolloutLineupScore(
    differentEnemyBoard.roster,
    "human_midline",
    true,
  );
  const afterDifferentBoard = getAutopilotRolloutCacheStats();

  assert.equal(secondScore, firstScore);
  assert.equal(
    afterFirst.hits + afterFirst.misses,
    before.hits + before.misses + 3,
  );
  assert.equal(afterSecond.hits, afterFirst.hits + 3);
  assert.equal(afterDifferentAugment.misses, afterSecond.misses + 3);
  assert.equal(afterOrdered.misses, afterDifferentAugment.misses + 3);
  assert.equal(afterReordered.hits, afterOrdered.hits + 3);
  assert.equal(afterCrossSeedSecond.hits, afterCrossSeedFirst.hits + 2);
  assert.equal(afterCrossSeedSecond.misses, afterCrossSeedFirst.misses + 1);
  assert.equal(afterDifferentBoard.misses, afterCrossSeedSecond.misses + 3);
});

test("看穿计划分数在战斗随机状态变化后会重新精确复核", () => {
  const bridge = new EngineBridge(13139);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  for (let index = 0; index < bridge.engine.boardCap; index += 1) {
    bridge.engine.state.board[index] = {
      uid: 131390 + index,
      id: SHOP_UNITS[index % SHOP_UNITS.length],
      star: 1,
    };
  }
  for (let index = 0; index < bridge.engine.state.bench.length; index += 1) {
    bridge.engine.state.bench[index] = {
      uid: 131400 + index,
      id: SHOP_UNITS[(index + bridge.engine.boardCap) % SHOP_UNITS.length],
      star: 1,
    };
  }
  const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "seer", "oracle", 20);
  const roster = pilot.ownedEntries();
  const lineup = roster.slice(0, bridge.engine.boardCap);
  bridge.engine.state.round = 48;
  pilot.rolloutTargetLineup = () => lineup;
  pilot.plannedLineupUids = lineup.map(({ unit }) => unit.uid);
  pilot.plannedLineupUnits = new Map(lineup.map(({ unit }) => [
    unit.uid,
    { id: unit.id, star: unit.star },
  ]));
  pilot.plannedLineupScore = 10400;
  pilot.plannedBoardSlots = new Map(lineup.map(({ unit }, index) => [
    unit.uid,
    index,
  ]));
  pilot.plannedLineupRandomState = bridge.engine.getRandomState();
  let rolloutCalls = 0;
  pilot.rolloutLineupScore = () => {
    rolloutCalls += 1;
    return 9900;
  };

  assert.equal(pilot.rolloutConfidence(roster), 10400);
  assert.equal(rolloutCalls, 0);

  bridge.engine.restoreRandomState(bridge.engine.getRandomState() + 1);
  assert.equal(pilot.rolloutConfidence(roster), 9900);
  assert.equal(rolloutCalls, 1);
  assert.equal(pilot.rolloutConfidence(roster), 9900);
  assert.equal(rolloutCalls, 1);

  pilot.setStrategy("balanced", "normal");
  pilot.plannedLineupUids = lineup.map(({ unit }) => unit.uid);
  pilot.plannedLineupUnits = new Map(lineup.map(({ unit }) => [
    unit.uid,
    { id: unit.id, star: unit.star },
  ]));
  pilot.plannedLineupScore = 10400;
  pilot.plannedLineupRandomState = bridge.engine.getRandomState();
  rolloutCalls = 0;
  assert.equal(pilot.rolloutConfidence(roster), 10400);
  assert.equal(rolloutCalls, 0);
  bridge.engine.restoreRandomState(bridge.engine.getRandomState() + 1);
  assert.equal(pilot.rolloutConfidence(roster), 9900);
  assert.equal(rolloutCalls, 1);
});

test("未来商店预览不会推进真实随机状态且首个结果与下一次刷新一致", () => {
  const bridge = new EngineBridge(13140);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.gold = 20;
  const currentShop = [...bridge.engine.state.shop];
  const battleRandomState = bridge.engine.getRandomState();
  const shopRandomState = bridge.engine.getShopRandomState();
  const future = bridge.engine.previewFutureShops(3);

  assert.equal(future.length, 3);
  assert.deepEqual(bridge.engine.state.shop, currentShop);
  assert.equal(bridge.engine.getRandomState(), battleRandomState);
  assert.equal(bridge.engine.getShopRandomState(), shopRandomState);
  bridge.dispatch({ type: "reroll" });
  assert.deepEqual(bridge.engine.state.shop, future[0]);
  assert.equal(bridge.engine.getRandomState(), battleRandomState);
  assert.notEqual(bridge.engine.getShopRandomState(), shopRandomState);
});

test("每一本使用由种子导出的独立固定商店序列", () => {
  const bridge = new EngineBridge(13142);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.gold = 20;
  const initialLevel = bridge.engine.state.playerLevel;
  const initialShopState = bridge.engine.getShopRandomState();
  const level3 = bridge.engine.previewFutureShopsAtLevels([3, 3]);
  const level10 = bridge.engine.previewFutureShopsAtLevels([10, 10]);
  const interleaved = bridge.engine.previewFutureShopsAtLevels([3, 10, 3, 10]);

  assert.deepEqual(interleaved, [level3[0], level10[0], level3[1], level10[1]]);
  assert.equal(bridge.engine.state.playerLevel, initialLevel);
  assert.equal(bridge.engine.getShopRandomState(), initialShopState);

  bridge.dispatch({ type: "reroll" });
  assert.deepEqual(bridge.engine.state.shop, level3[0]);
  bridge.engine.state.playerLevel = 10;
  bridge.dispatch({ type: "reroll" });
  assert.deepEqual(bridge.engine.state.shop, level10[0]);
  bridge.engine.state.playerLevel = 3;
  bridge.dispatch({ type: "reroll" });
  assert.deepEqual(bridge.engine.state.shop, level3[1]);
});

test("看穿动态规划会为高本固定 key 牌序列提前升本并只返回首轮宏动作", () => {
  const targetId = AUTOPILOT_TERMINAL_TARGET_IDS.find(
    (id) => UNIT_DEFS[id].tier === 5,
  );
  assert.ok(targetId);
  const emptyShop = [null, null, null, null, null];
  const futureShops = Object.fromEntries(
    [3, 4, 5, 6, 7, 8, 9, 10].map((level) => [
      level,
      Array.from({ length: 32 }, () => [...emptyShop]),
    ]),
  );
  futureShops[10] = Array.from(
    { length: 32 },
    (_, index) => (index < 9 ? [targetId, null, null, null, null] : [...emptyShop]),
  );
  const plan = planSeerEconomy({
    round: 12,
    seed: 13143,
    hp: 20,
    gold: 240,
    playerLevel: 3,
    upgradeRemaining: 0,
    streak: 3,
    incomeBonus: 0,
    paydayDebtRounds: 0,
    freeRerolls: 0,
    financeActive: true,
    currentShop: emptyShop,
    currentCombatScore: 10100,
    targetCopies: {},
    targets: [{ id: targetId, priority: 100, desiredCopies: 9 }],
    futureShops,
    horizon: 3,
    beamWidth: 64,
  });

  assert.equal(plan.firstStep.targetLevel, 10);
  assert.equal(plan.firstStep.rerolls, 0);
  assert.equal(plan.projectedTargetCopies[targetId], 9);
  assert.ok(plan.exploredStates > 0);
  assert.ok(plan.dominancePrunes > 0);
  assert.equal(plan.projectedRound, 15);
});

test("看穿会把关键牌第六次刷新这样的非粗粒度节点纳入搜索", () => {
  const targetId = AUTOPILOT_TERMINAL_TARGET_IDS.find(
    (id) => UNIT_DEFS[id].tier === 5,
  );
  assert.ok(targetId);
  const emptyShop = [null, null, null, null, null];
  const futureShops = Object.fromEntries(
    [3, 4, 5, 6, 7, 8, 9, 10].map((level) => [
      level,
      Array.from({ length: 24 }, () => [...emptyShop]),
    ]),
  );
  futureShops[10][5] = [targetId, targetId, targetId, targetId, targetId];
  futureShops[10][6] = [targetId, targetId, targetId, targetId, null];
  const plan = planSeerEconomy({
    round: 12,
    seed: 131431,
    hp: 20,
    gold: 240,
    playerLevel: 3,
    upgradeRemaining: 0,
    streak: 3,
    incomeBonus: 0,
    paydayDebtRounds: 0,
    freeRerolls: 0,
    financeActive: true,
    currentShop: emptyShop,
    // The current board is deliberately losing, so the planner must spend
    // this preparation on the known seventh-shop completion instead of
    // banking at the scheduled seventh book.
    currentCombatScore: -1000,
    targetCopies: {},
    targets: [{ id: targetId, priority: 100, desiredCopies: 9 }],
    futureShops,
    horizon: 1,
    beamWidth: 64,
  });

  assert.equal(plan.firstStep.targetLevel, 10);
  assert.equal(plan.firstStep.rerolls, 7);
  assert.deepEqual(plan.firstStep.purchasesByShop?.slice(1).flat(), [
    targetId,
    targetId,
    targetId,
    targetId,
    targetId,
    targetId,
    targetId,
    targetId,
    targetId,
  ]);
});

test("看穿会一次建立第1至第60战的敌方时间表并规划完整前缀", () => {
  const waves = forecastSeerWaves(1, 13148, 60);
  assert.equal(waves.length, 60);
  assert.equal(waves[0].round, 1);
  assert.equal(waves.at(-1).round, 60);
  assert.equal(waves[15].tag, "boss");
  assert.equal(waves[30].tag, "boss");
  assert.ok(waves.every((wave) => wave.units.length > 0 && wave.threat > 0));

  const emptyShop = [null, null, null, null, null];
  const futureShops = Object.fromEntries(
    [3, 4, 5, 6, 7, 8, 9, 10].map((level) => [
      level,
      Array.from({ length: 64 }, () => [...emptyShop]),
    ]),
  );
  const plan = planSeerEconomy({
    round: 1,
    seed: 13148,
    hp: 100,
    gold: 0,
    playerLevel: 3,
    upgradeRemaining: 5,
    streak: 0,
    incomeBonus: 0,
    paydayDebtRounds: 0,
    freeRerolls: 0,
    financeActive: false,
    currentShop: emptyShop,
    currentCombatScore: 1_000_000,
    currentBoardCount: 1,
    currentBoardStrength: UNIT_DEFS.mossback.cost * 12,
    currentTransitionUnits: [{ id: "mossback", star: 1 }],
    targetCopies: {},
    targets: [{ id: "grove_mender", priority: 100, desiredCopies: 9 }],
    futureShops,
    horizon: 60,
    beamWidth: 8,
  });

  assert.equal(plan.planningHorizon, 60);
  assert.equal(plan.complete, true);
  assert.equal(plan.futureWaves.length, 60);
  assert.equal(plan.futureWaves.at(-1).round, 60);
  assert.equal(plan.steps.length, 60);
  assert.equal(plan.projectedRound, 61);
});

test("看穿先规划60战，精确通过后才把下一条路线扩到70战", () => {
  const bridge = new EngineBridge(131481, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const autopilot = new AutoChessAutopilot(
    bridge,
    "training",
    {},
    "seer",
    "oracle",
    20,
  );

  autopilot.resetPreparation(bridge.engine.state.round);
  assert.equal(autopilot.seerPlan?.planningHorizon, 60);

  autopilot.seerExtendedPlanningUnlocked = true;
  bridge.engine.state.round = 61;
  autopilot.resetPreparation(bridge.engine.state.round);
  assert.equal(autopilot.seerPlan?.planningHorizon, 10);
  assert.equal(autopilot.seerPlan?.startRound, 61);
});

test("看穿规划会保留当前败局的真实负分幅度", () => {
  const emptyShop = [null, null, null, null, null];
  const futureShops = Object.fromEntries(
    [3, 4, 5, 6, 7, 8, 9, 10].map((level) => [
      level,
      Array.from({ length: 2 }, () => [...emptyShop]),
    ]),
  );
  const makePlan = (currentCombatScore) => planSeerEconomy({
    round: 32,
    seed: 13150,
    hp: 20,
    gold: 0,
    playerLevel: 10,
    upgradeRemaining: 0,
    streak: 0,
    incomeBonus: 0,
    paydayDebtRounds: 0,
    freeRerolls: 0,
    financeActive: true,
    currentShop: emptyShop,
    currentCombatScore,
    currentBoardCount: 1,
    currentBoardStrength: 100,
    targetCopies: {},
    targets: [{ id: "grove_mender", priority: 100, desiredCopies: 9 }],
    futureShops,
    horizon: 1,
    beamWidth: 8,
  });
  const nearMiss = makePlan(-200);
  const deepLoss = makePlan(-1200);
  assert.ok(nearMiss.steps[0].expectedBattleMargin > deepLoss.steps[0].expectedBattleMargin);
  assert.equal(nearMiss.steps[0].expectedBattleWon, false);
  assert.equal(deepLoss.steps[0].expectedBattleWon, false);
});

test("看穿在完整未来不可达时仍返回最深可行前缀", () => {
  const emptyShop = [null, null, null, null, null];
  const futureShops = Object.fromEntries(
    [3, 4, 5, 6, 7, 8, 9, 10].map((level) => [
      level,
      Array.from({ length: 8 }, () => [...emptyShop]),
    ]),
  );
  const plan = planSeerEconomy({
    round: 1,
    seed: 13147,
    hp: 5,
    gold: 0,
    playerLevel: 3,
    upgradeRemaining: 5,
    streak: 0,
    incomeBonus: 0,
    paydayDebtRounds: 0,
    freeRerolls: 0,
    financeActive: false,
    currentShop: emptyShop,
    currentCombatScore: 9000,
    currentBoardCount: 0,
    currentBoardStrength: 0,
    targetCopies: {},
    targets: [{ id: "grove_mender", priority: 100, desiredCopies: 9 }],
    futureShops,
    horizon: 5,
    beamWidth: 8,
  });

  assert.ok(plan.steps?.length >= 1);
  assert.equal(plan.complete, false);
  assert.equal(plan.projectedRound, 2);
});

test("看穿低血量时不会执行精确预演已经判定必败的旧路线", () => {
  const bridge = new EngineBridge(13149);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 32;
  bridge.engine.state.gold = 100;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    20,
  );
  autopilot.resetPreparation(32);
  autopilot.rolloutConfidence = () => -1000;
  autopilot.populationAction = () => null;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;

  autopilot.seerPlan = {
    firstStep: { targetLevel: 3, rerolls: 0, expectedGoldAfterPreparation: 100 },
    steps: [{ expectedBattleWon: false }],
    projectedTargetCopies: {},
  };
  bridge.engine.state.hp = 20;
  autopilot.nextPreparationAction();
  assert.ok(autopilot.seerPlan);

  autopilot.resetPreparation(32);
  autopilot.seerPlan = {
    firstStep: { targetLevel: 3, rerolls: 0, expectedGoldAfterPreparation: 100 },
    steps: [{ expectedBattleWon: false }],
    projectedTargetCopies: {},
  };
  bridge.engine.state.hp = 12;
  autopilot.nextPreparationAction();
  assert.equal(autopilot.seerPlan, null);
});

test("看穿前期计划预期获胜但当前战力为负时会立即重规划", () => {
  const bridge = new EngineBridge(131492);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 12;
  bridge.engine.state.gold = 26;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    20,
  );
  autopilot.resetPreparation(12);
  autopilot.observeStabilizationStrength = () => {};
  autopilot.rolloutConfidence = () => -270;
  autopilot.populationAction = () => null;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;

  const firstStep = {
    targetLevel: 7,
    rerolls: 0,
    expectedGoldAfterPreparation: 26,
  };
  autopilot.seerPlan = {
    firstStep,
    steps: [{ ...firstStep, expectedBattleWon: true, expectedBattleMargin: 4155 }],
    projectedTargetCopies: {},
    complete: false,
  };

  bridge.engine.state.hp = 20;
  autopilot.nextPreparationAction();
  assert.equal(autopilot.seerPlan, null);
});

test("看穿明确规划卖血时不会因负分提前抢救", () => {
  const bridge = new EngineBridge(131493);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 12;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    20,
  );
  autopilot.resetPreparation(12);
  autopilot.observeStabilizationStrength = () => {};
  autopilot.rolloutConfidence = () => -270;
  autopilot.populationAction = () => null;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;

  const firstStep = {
    targetLevel: 7,
    rerolls: 0,
    expectedGoldAfterPreparation: 26,
  };
  autopilot.seerPlan = {
    firstStep,
    steps: [{ ...firstStep, expectedBattleWon: false, expectedBattleMargin: -270 }],
    projectedTargetCopies: {},
    complete: false,
  };

  bridge.engine.state.hp = 20;
  autopilot.nextPreparationAction();
  assert.ok(autopilot.seerPlan);
});

test("看穿开战预测不会使用仍在候补的未落盘正计划分数", () => {
  const bridge = new EngineBridge(131494, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 62;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const boardIds = SHOP_UNITS.slice(0, 10);
  boardIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1314940 + index, id, star: 3 };
  });
  const benchTarget = { uid: 1314950, id: SHOP_UNITS[10], star: 3 };
  bridge.engine.state.bench[0] = benchTarget;

  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    20,
  );
  const roster = autopilot.ownedEntries();
  const target = roster.filter(({ unit, location }) => (
    location.zone === "board" && unit.uid !== 1314940
  ));
  target.push(roster.find(({ unit }) => unit.uid === benchTarget.uid));
  const planned = target.filter(Boolean);
  autopilot.rolloutTargetLineup = () => planned;
  autopilot.plannedLineupUids = planned.map(({ unit }) => unit.uid);
  autopilot.plannedLineupUnits = new Map(planned.map(({ unit }) => [
    unit.uid,
    { id: unit.id, star: unit.star },
  ]));
  autopilot.plannedLineupScore = 11369;
  autopilot.plannedBoardSlots = new Map([
    [benchTarget.uid, 0],
    ...planned
      .filter(({ unit }) => unit.uid !== benchTarget.uid)
      .map(({ unit }, index) => [unit.uid, index + 1]),
  ]);
  autopilot.rolloutBoardScore = () => -6;

  assert.equal(autopilot.battleConfidence(roster), -6);
});

test("看穿达到整备动作上限时仍先完成满板满候补换位", () => {
  const bridge = new EngineBridge(131496, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 62;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const boardIds = SHOP_UNITS.slice(0, 10);
  boardIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1314960 + index, id, star: 3 };
  });
  const benchTarget = { uid: 1314970, id: SHOP_UNITS[10], star: 3 };
  bridge.engine.state.bench[0] = benchTarget;
  for (let index = 1; index < bridge.engine.state.bench.length; index += 1) {
    bridge.engine.state.bench[index] = {
      uid: 1314970 + index,
      id: SHOP_UNITS[10 + index],
      star: 1,
    };
  }

  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    20,
  );
  const roster = autopilot.ownedEntries();
  const target = roster.filter(({ unit, location }) => (
    location.zone === "board" && unit.uid !== 1314960
  ));
  target.push(roster.find(({ unit }) => unit.uid === benchTarget.uid));
  const planned = target.filter(Boolean);
  const plannedUids = new Set(planned.map(({ unit }) => unit.uid));
  autopilot.rolloutTargetLineup = () => autopilot.ownedEntries()
    .filter(({ unit }) => plannedUids.has(unit.uid));
  autopilot.plannedLineupUids = planned.map(({ unit }) => unit.uid);
  autopilot.plannedLineupUnits = new Map(planned.map(({ unit }) => [
    unit.uid,
    { id: unit.id, star: unit.star },
  ]));
  autopilot.plannedBoardSlots = new Map([
    [benchTarget.uid, 0],
    ...planned
      .filter(({ unit }) => unit.uid !== benchTarget.uid)
      .map(({ unit }, index) => [unit.uid, index + 1]),
  ]);
  autopilot.plannedRound = bridge.engine.state.round;
  autopilot.preparationActions = 96;

  const firstAction = autopilot.nextPreparationAction();
  assert.deepEqual(firstAction, {
    type: "move",
    from: { zone: "bench", index: 0 },
    to: { zone: "board", index: 0 },
  });
  bridge.dispatch(firstAction);

  const battleAction = autopilot.nextPreparationAction();
  assert.deepEqual(battleAction, { type: "battle" });
  assert.equal(bridge.engine.state.board[0]?.uid, benchTarget.uid);
});

test("相同棋种的规范落位按稳定身份完成且不会来回交换", () => {
  const bridge = new EngineBridge(131497, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.playerLevel = 10;
  state.board.fill(null);
  state.bench.fill(null);
  state.board[3] = { uid: 1314972, id: "cinder_ram", star: 1 };
  state.board[22] = { uid: 1314971, id: "cinder_ram", star: 1 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
  );
  autopilot.rolloutTargetLineup = () => autopilot.ownedEntries();
  autopilot.plannedFormation = "human_midline";

  const actions = [];
  for (let step = 0; step < 6; step += 1) {
    const action = autopilot.formationAction(autopilot.ownedEntries());
    if (!action) break;
    actions.push(action);
    bridge.dispatch(action);
  }

  assert.equal(actions.length, 2);
  assert.equal(state.board[10]?.uid, 1314971);
  assert.equal(state.board[16]?.uid, 1314972);
  assert.equal(autopilot.formationAction(autopilot.ownedEntries()), null);
});

test("落位开始后沿用已选阵容而不按中间棋盘重新选人", () => {
  const bridge = new EngineBridge(131498, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.board.fill(null);
  state.bench.fill(null);
  state.board[0] = { uid: 1314981, id: "cinder_ram", star: 1 };
  state.board[1] = { uid: 1314982, id: "cinder_ram", star: 1 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "survival",
    "normal",
    20,
    undefined,
    true,
    "deep",
  );
  const planned = state.board.filter(Boolean);
  autopilot.plannedLineupUids = planned.map(({ uid }) => uid);
  autopilot.plannedLineupUnits = new Map(planned.map(({ uid, id, star }) => [
    uid,
    { id, star },
  ]));
  autopilot.formationStartedThisPreparation = true;
  autopilot.rolloutTargetLineup = () => {
    throw new Error("formation must not reselect after its first move");
  };

  assert.equal(autopilot.formationAction(autopilot.ownedEntries())?.type, "move");
});

test("看穿规划会把普通过渡棋纳入人口和战力", () => {
  const emptyShop = [null, null, null, null, null];
  const futureShops = Object.fromEntries(
    [3, 4, 5, 6, 7, 8, 9, 10].map((level) => [
      level,
      Array.from({ length: 8 }, () => [...emptyShop]),
    ]),
  );
  const plan = planSeerEconomy({
    round: 1,
    seed: 13145,
    hp: 20,
    gold: 2,
    playerLevel: 3,
    upgradeRemaining: 5,
    streak: 0,
    incomeBonus: 0,
    paydayDebtRounds: 0,
    freeRerolls: 0,
    financeActive: false,
    currentShop: ["mossback", "gale_archer", null, null, null],
    currentCombatScore: 10000,
    currentBoardCount: 1,
    currentBoardStrength: UNIT_DEFS.mossback.cost * 12,
    currentTransitionUnits: [{ id: "mossback", star: 1 }],
    targetCopies: {},
    targets: [{ id: "grove_mender", priority: 100, desiredCopies: 9 }],
    futureShops,
    horizon: 1,
    beamWidth: 16,
  });

  assert.deepEqual(plan.firstStep.purchasesByShop?.[0], ["mossback", "gale_archer"]);
  assert.equal(plan.projectedBoardCount, 3);
  assert.equal(plan.projectedRosterCount, 3);
});

test("看穿规划会先卖过渡棋再为终局目标腾出候补位", () => {
  const emptyShop = [null, null, null, null, null];
  const futureShops = Object.fromEntries(
    [3, 4, 5, 6, 7, 8, 9, 10].map((level) => [
      level,
      Array.from({ length: 8 }, () => [...emptyShop]),
    ]),
  );
  const transitionIds = SHOP_UNITS
    .filter((id) => !AUTOPILOT_TERMINAL_TARGET_IDS.includes(id))
    .slice(0, 11);
  const plan = planSeerEconomy({
    round: 10,
    seed: 13146,
    hp: 20,
    gold: UNIT_DEFS.grove_mender.cost,
    playerLevel: 3,
    upgradeRemaining: 6,
    streak: 2,
    incomeBonus: 0,
    paydayDebtRounds: 0,
    freeRerolls: 0,
    financeActive: true,
    currentShop: ["grove_mender", null, null, null, null],
    currentCombatScore: 10000,
    currentBoardCount: 3,
    currentBoardStrength: 100,
    currentTransitionUnits: transitionIds.map((id) => ({ id, star: 1 })),
    targetCopies: {},
    targets: [{ id: "grove_mender", priority: 100, desiredCopies: 9 }],
    futureShops,
    horizon: 1,
    beamWidth: 16,
  });

  assert.deepEqual(plan.firstStep.purchasesByShop?.[0], ["grove_mender"]);
  assert.equal(plan.firstStep.salesByShop?.[0]?.length, 1);
  assert.equal(plan.projectedRosterCount, 11);
});

test("普通托管不会读取未来商店，看穿宏动作会连续升到规划等级", () => {
  const bridge = new EngineBridge(13144);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.previewFutureShopsAtLevels = () => {
    throw new Error("normal strategy accessed future shops");
  };
  const normal = new AutoChessAutopilot(bridge, "heuristic", {}, "survival");
  assert.doesNotThrow(() => normal.resetPreparation(bridge.engine.state.round));

  bridge.engine.state.gold = 100;
  const seer = new AutoChessAutopilot(bridge, "heuristic", {}, "seer");
  seer.seerPlan = {
    firstStep: { targetLevel: 5, rerolls: 0, expectedGoldAfterPreparation: 60 },
  };
  seer.rolloutConfidence = () => 10400;
  assert.equal(seer.upgradeAction()?.type, "buyXp");
  bridge.engine.state.playerLevel = 5;
  assert.equal(seer.upgradeAction(), null);
});

test("看穿作为第四种托管风格启用未来商店信息并停止无目标刷新", () => {
  const bridge = new EngineBridge(13141);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.setStrategy("seer");
  assert.equal(autopilot.strategyStyle, "seer");
  assert.equal(autopilot.strategyInformationMode, "oracle");

  bridge.engine.previewFutureShops = () => Array.from(
    { length: 24 },
    () => [null, null, null, null, null],
  );
  assert.equal(autopilot.oracleHasFutureCandidate(autopilot.ownedEntries()), false);
  autopilot.setStrategy("highroll");
  assert.equal(autopilot.strategyInformationMode, "normal");
  assert.equal(autopilot.oracleHasFutureCandidate(autopilot.ownedEntries()), true);
});

test("看穿终局宏动作完成但目标未三星时仍会买当前目标牌", () => {
  const { bridge, autopilot } = makeLateSeerCase(
    ["grove_mender", null, null, null, null],
  );
  const action = autopilot.nextPreparationAction();
  assert.deepEqual(action, { type: "shop", index: 0 });
  assert.equal(autopilot.seerRouteAbandoned, false);
});

test("看穿终局买目标牌前会先出售候补中的非目标过渡棋", () => {
  const { bridge, autopilot } = makeLateSeerCase(
    ["grove_mender", null, null, null, null],
    Array.from({ length: 8 }, (_, index) => ({
      id: index === 0 ? "mossback" : "nori",
      star: 1,
    })),
  );
  const sale = autopilot.nextPreparationAction();
  assert.equal(sale?.type, "sell");
  assert.equal(sale?.location.zone, "bench");
  bridge.dispatch(sale);
  const purchase = autopilot.nextPreparationAction();
  assert.deepEqual(purchase, { type: "shop", index: 0 });
});

test("看穿终局会刷新到短期已知目标店，但目标全三星后允许直接开战", () => {
  const future = makeLateSeerCase([null, null, null, null, null]);
  future.bridge.engine.previewFutureShops = () => [
    ["grove_mender", null, null, null, null],
  ];
  assert.deepEqual(future.autopilot.nextPreparationAction(), { type: "reroll" });

  const complete = makeLateSeerCase([null, null, null, null, null]);
  AUTOPILOT_TERMINAL_TARGET_IDS.forEach((id, index) => {
    complete.bridge.engine.state.board[index] = {
      uid: 131700 + index,
      id,
      star: 3,
    };
  });
  assert.deepEqual(complete.autopilot.nextPreparationAction(), { type: "battle" });
});

test("托管以四战真实前瞻选择协议而不是固定偏好", () => {
  const bridge = new EngineBridge(73042);
  bridge.setConsoleLogging(false);
  assert.deepEqual(bridge.engine.state.starterChoices, ["bastion", "traffic_start", "blaze"]);
  const autopilot = new AutoChessAutopilot(bridge);

  const preference = ["bastion", "traffic_start", "blaze"];
  const expected = bridge.engine.state.starterChoices
    .map((id) => ({ id, score: autopilot.starterRolloutScore(id) }))
    .sort((left, right) => right.score - left.score
      || preference.indexOf(left.id) - preference.indexOf(right.id))[0].id;
  assert.equal(autopilot.chooseStarter(), expected);
  assert.equal(autopilot.startFromTitle(), true);
  assert.equal(bridge.engine.state.starter, expected);
});

test("托管在棋盘与候选席全满时会出售低价值候选并买入目标棋", () => {
  const bridge = new EngineBridge(13028);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  const expensiveIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost === 5);
  const cheapIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost === 1);
  const candidateId = "grove_mender";
  const boardIds = expensiveIds.filter((id) => id !== candidateId);
  let uid = 130280;

  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.board.fill(null);
  for (let index = 0; index < bridge.engine.boardCap; index += 1) {
    bridge.engine.state.board[index] = {
      uid: uid += 1,
      id: expensiveIds[index % expensiveIds.length],
      star: 2,
    };
  }
  bridge.engine.state.bench = Array.from({ length: 8 }, (_, index) => ({
    uid: uid += 1,
    id: cheapIds[index % cheapIds.length],
    star: 1,
  }));
  bridge.engine.state.shop = [candidateId, null, null, null, null];
  bridge.engine.state.gold = 40;
  bridge.engine.state.round = 8;

  assert.equal(bridge.engine.boardCount, bridge.engine.boardCap);
  assert.equal(bridge.engine.state.bench.every(Boolean), true);
  const rosterCount = bridge.engine.boardCount + bridge.engine.state.bench.filter(Boolean).length;
  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);

  const sellAction = autopilot.tick(2000);
  assert.equal(sellAction?.type, "sell");
  assert.equal(sellAction?.location?.zone, "bench");
  assert.equal(bridge.engine.state.bench.filter(Boolean).length, 7);
  assert.ok(bridge.engine.state.toast?.text.startsWith("已回收"));

  const buyAction = autopilot.tick(2500);
  assert.deepEqual(buyAction, { type: "shop", index: 0 });
  assert.equal(bridge.engine.state.shop[0], null);
  assert.ok(bridge.engine.state.bench.some((unit) => unit?.id === candidateId));
  assert.equal(bridge.engine.boardCount + bridge.engine.state.bench.filter(Boolean).length, rosterCount);
});

test("候补未满但缺钱且预演失败时会卖闲棋为强牌腾出预算", () => {
  const bridge = new EngineBridge(1302801);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const expensiveIds = SHOP_UNITS.filter((id) => (
    UNIT_DEFS[id].cost >= 3 && !AUTOPILOT_TERMINAL_TARGET_IDS.includes(id)
  ));
  const cheapId = SHOP_UNITS.find((id) => (
    UNIT_DEFS[id].cost === 1
    && !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id)
    && !UNIT_DEFS[id].traits.includes("finance")
  ));
  const candidateId = "sui_bird";
  assert.ok(expensiveIds.length > 0);
  assert.ok(cheapId);
  const boardIds = expensiveIds;
  let uid = 13028010;

  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.round = 20;
  bridge.engine.state.hp = 5;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  for (let index = 0; index < bridge.engine.boardCap; index += 1) {
    bridge.engine.state.board[index] = {
      uid: uid += 1,
      id: boardIds[index % boardIds.length],
      star: 2,
    };
  }
  bridge.engine.state.bench[0] = { uid: uid += 1, id: cheapId, star: 1 };
  bridge.engine.state.shop = [candidateId, null, null, null, null];
  bridge.engine.state.gold = 2;

  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
  );
  autopilot.rolloutConfidence = () => 9900;
  autopilot.previewRosterRollout = (roster) => (
    roster.some(({ unit }) => unit.id === candidateId) ? 10400 : 9900
  );
  autopilot.rolloutTargetLineup = (roster) => (
    roster.filter(({ location }) => location.zone === "board")
  );
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);

  const sellAction = autopilot.tick(2000);
  assert.equal(sellAction?.type, "sell");
  assert.equal(sellAction?.location?.zone, "bench");
  assert.equal(bridge.engine.state.bench.filter(Boolean).length, 0);

  const buyAction = autopilot.tick(2500);
  assert.deepEqual(buyAction, { type: "shop", index: 0 });
  assert.ok(bridge.engine.state.bench.some((unit) => unit?.id === candidateId));
});

test("均衡在候补席接近满且战力不足时会先卖暂存棋再买直接替换牌", () => {
  const bridge = new EngineBridge(130281);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const weakIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost === 1);
  const candidateId = "grove_mender";
  const strongIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost === 5 && id !== candidateId);
  assert.ok(candidateId);
  let uid = 1302810;

  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.board.fill(null);
  for (let index = 0; index < bridge.engine.boardCap; index += 1) {
    bridge.engine.state.board[index] = {
      uid: uid += 1,
      id: strongIds[index % strongIds.length],
      star: 3,
    };
  }
  bridge.engine.state.bench = bridge.engine.state.bench.map((_, index) => (
    index < 6
      ? { uid: uid += 1, id: weakIds[(index + 3) % weakIds.length], star: 1 }
      : null
  ));
  bridge.engine.state.shop = [candidateId, null, null, null, null];
  bridge.engine.state.gold = 40;
  bridge.engine.state.round = 12;

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal");
  autopilot.rolloutConfidence = () => 9900;
  autopilot.previewRosterRollout = (roster) => (
    roster.some(({ unit }) => unit.id === candidateId) ? 10020 : 9900
  );
  autopilot.upgradeAction = () => ({ type: "buyXp" });
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);

  const sellAction = autopilot.tick(2000);
  assert.equal(sellAction?.type, "sell");
  assert.equal(sellAction?.location?.zone, "bench");
  assert.equal(bridge.engine.state.bench.filter(Boolean).length, 5);

  const buyAction = autopilot.tick(2500);
  assert.deepEqual(buyAction, { type: "shop", index: 0 });
  assert.equal(bridge.engine.state.shop[0], null);
  assert.ok(bridge.engine.state.bench.some((unit) => unit?.id === candidateId));
});

test("托管在有足够候补棋时先补满当前人口再升本或搜牌", () => {
  const bridge = new EngineBridge(130282);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const ids = SHOP_UNITS.slice(0, 10);
  ids.slice(0, 7).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1302820 + index, id, star: 1 };
  });
  ids.slice(7).forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 1302830 + index, id, star: 1 };
  });
  bridge.engine.state.shop.fill(null);

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal");
  autopilot.rolloutTargetLineup = (roster) => roster;
  autopilot.rolloutConfidence = () => 9900;
  autopilot.upgradeAction = () => ({ type: "buyXp" });
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);

  const action = autopilot.tick(2000);
  assert.equal(action?.type, "move");
  assert.equal(action?.from?.zone, "bench");
  assert.equal(action?.to?.zone, "board");
  assert.equal(bridge.engine.boardCount, 8);
  for (let step = 0; bridge.engine.boardCount < bridge.engine.boardCap; step += 1) {
    const next = autopilot.tick(2500 + step * 500);
    assert.equal(next?.type, "move");
  }
  assert.equal(bridge.engine.boardCount, bridge.engine.boardCap);
});

test("候补棋可直接上场时即使看起来安全也不会先升本", () => {
  const bridge = new EngineBridge(130284);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 6;
  bridge.engine.state.upgradeRemaining = bridge.engine.upgradeCost || 0;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const ids = SHOP_UNITS.slice(0, 6);
  ids.slice(0, 4).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1302840 + index, id, star: 1 };
  });
  ids.slice(4).forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 1302850 + index, id, star: 1 };
  });
  bridge.engine.state.gold = 100;

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal");
  autopilot.rolloutTargetLineup = (roster) => roster;
  autopilot.rolloutConfidence = () => 10400;
  autopilot.upgradeAction = () => ({ type: "buyXp" });
  autopilot.setEnabled(true);

  assert.equal(autopilot.tick(1000), null);
  const action = autopilot.tick(2000);
  assert.equal(action?.type, "move");
  assert.equal(action?.from?.zone, "bench");
  assert.equal(action?.to?.zone, "board");
  assert.equal(bridge.engine.boardCount, 5);
});

test("均衡残血且候补席满时会出售已有高星终局棋的低星重复件", () => {
  const bridge = new EngineBridge(130283);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.round = 23;
  bridge.engine.state.hp = 5;
  bridge.engine.state.gold = 8;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const boardIds = [
    "sui_flower", "xuehui", "sui_bird", "lian", "yua", "grove_mender", "spark_mage", "rei", "meme", "biscuit_sui",
  ];
  boardIds.forEach((id, index) => {
    bridge.engine.state.board[index] = {
      uid: 1302830 + index,
      id,
      star: index < 4 ? 2 : 1,
    };
  });
  const benchIds = ["sui_flower", "xuehui", "sui_bird", "lian", "yua", "grove_mender", "biscuit_sui", "meme"];
  benchIds.forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 1302840 + index, id, star: 1 };
  });
  bridge.engine.state.shop.fill(null);

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal");
  autopilot.rolloutConfidence = () => 9900;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);

  const action = autopilot.tick(2000);
  assert.equal(action?.type, "sell");
  assert.equal(action?.location?.zone, "bench");
  assert.ok(["sui_flower", "xuehui", "sui_bird", "lian"].includes(benchIds[action.location.index]));
  assert.equal(bridge.engine.state.bench.filter(Boolean).length, 7);
});

test("危险回合满席时会用真实预演决定是否牺牲低价值二星培养项目", () => {
  const bridge = new EngineBridge(13055);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const cheapIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost <= 2).slice(0, 11);
  const candidateId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 5);
  assert.equal(cheapIds.length, 11);
  assert.ok(candidateId);
  let uid = 130550;

  bridge.engine.state.board.fill(null);
  for (let index = 0; index < bridge.engine.boardCap; index += 1) {
    bridge.engine.state.board[index] = {
      uid: uid += 1,
      id: cheapIds[index % cheapIds.length],
      star: 2,
    };
  }
  bridge.engine.state.bench = bridge.engine.state.bench.map((_, index) => ({
    uid: uid += 1,
    id: cheapIds[bridge.engine.boardCap + index],
    star: 2,
  }));
  bridge.engine.state.shop = [candidateId, null, null, null, null];
  bridge.engine.state.gold = 40;
  bridge.engine.state.round = 11;

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    upgradeProjectLimit: 20,
  });
  autopilot.rolloutConfidence = () => 9900;
  autopilot.previewRosterRollout = (roster) => (
    roster.some(({ unit }) => unit.id === candidateId) ? 10400 : 10000
  );
  const roster = autopilot.ownedEntries();
  const projectIds = autopilot.upgradeProjectIds(roster);
  assert.ok(projectIds.size > 0);
  assert.ok(projectIds.size < cheapIds.length);

  const sale = autopilot.replacementAction(roster);
  assert.equal(sale?.type, "sell");
  const sacrificed = sale.location.zone === "board"
    ? bridge.engine.state.board[sale.location.index]
    : bridge.engine.state.bench[sale.location.index];
  assert.equal(sacrificed?.star, 2);
  assert.equal(cheapIds.includes(sacrificed.id), true);
  bridge.dispatch(sale);
  assert.deepEqual(autopilot.pendingPurchaseAction(), { type: "shop", index: 0 });
});

test("危险回合只在新增人口真实提升战力时允许升本突破现金储备", () => {
  const bridge = new EngineBridge(13056);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const ids = SHOP_UNITS.slice(0, 4);
  let uid = 130560;
  bridge.engine.state.board.fill(null);
  for (let index = 0; index < bridge.engine.boardCap; index += 1) {
    bridge.engine.state.board[index] = { uid: uid += 1, id: ids[index], star: 1 };
  }
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.bench[0] = { uid: uid += 1, id: ids[3], star: 2 };
  bridge.engine.state.round = 4;
  bridge.engine.state.gold = bridge.engine.upgradeCost + 2;

  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.rolloutConfidence = () => 9900;
  autopilot.previewRosterRollout = () => 10400;
  assert.deepEqual(autopilot.upgradeAction(), { type: "buyXp" });

  autopilot.previewRosterRollout = () => 9905;
  assert.equal(autopilot.upgradeAction(), null);
});

test("托管满席换阵会与场上非目标棋直接交换且不会重复非法上阵", () => {
  const bridge = new EngineBridge(13029);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  const expensiveIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost === 5);
  const cheapIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost === 1);
  let uid = 130290;

  bridge.engine.state.board.fill(null);
  cheapIds.slice(0, bridge.engine.boardCap).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 1 };
  });
  bridge.engine.state.bench = Array.from({ length: 8 }, (_, index) => ({
    uid: uid += 1,
    id: index < bridge.engine.boardCap ? expensiveIds[index] : cheapIds[index % cheapIds.length],
    star: index < bridge.engine.boardCap ? 2 : 1,
  }));
  bridge.engine.state.shop = [null, null, null, null, null];
  bridge.engine.state.gold = 0;
  bridge.engine.state.round = 10;

  const originalBoardUids = new Set(bridge.engine.state.board.filter(Boolean).map((unit) => unit.uid));
  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  let swap = null;
  let now = 1500;
  for (let step = 0; step < 24 && !swap; step += 1) {
    now += 500;
    const action = autopilot.tick(now);
    if (action?.type === "move" && action.from.zone === "bench" && action.to.zone === "board") {
      swap = action;
    }
  }

  assert.equal(swap?.type, "move");
  assert.equal(swap?.from.zone, "bench");
  assert.equal(swap?.to.zone, "board");
  assert.ok(bridge.engine.state.board[swap.to.index]);
  assert.equal(originalBoardUids.has(bridge.engine.state.board[swap.to.index].uid), false);
  assert.equal(bridge.engine.state.selected, null);
  assert.doesNotMatch(bridge.engine.state.toast?.text || "", /当前只能上阵/);

  let invalidMoves = 0;
  for (let step = 0; step < 24 && bridge.engine.state.phase === "preparation"; step += 1) {
    now += 500;
    const action = autopilot.tick(now);
    if (action?.type === "move" && bridge.engine.state.selected) invalidMoves += 1;
  }
  assert.equal(invalidMoves, 0);
  assert.equal(bridge.engine.state.phase, "battle");
});

test("托管只在推演明显稳胜时省下跨档付费刷新，且不会推迟立即合成", () => {
  const makeStrongBridge = (seed) => {
    const bridge = new EngineBridge(seed);
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
    bridge.engine.startRun("bastion");
    const cheapId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 1);
    const strongIds = SHOP_UNITS
      .filter((id) => UNIT_DEFS[id].cost >= 4)
      .sort((left, right) => UNIT_DEFS[right].cost - UNIT_DEFS[left].cost)
      .slice(0, 9);
    assert.ok(cheapId && strongIds.length === 9);
    bridge.engine.state.playerLevel = 10;
    bridge.engine.state.upgradeRemaining = 0;
    bridge.engine.state.round = 1;
    bridge.engine.state.streak = 2;
    bridge.engine.state.gold = 5;
    bridge.engine.state.board.fill(null);
    bridge.engine.state.bench.fill(null);
    let uid = seed * 100;
    bridge.engine.state.board[0] = { uid: uid += 1, id: cheapId, star: 2 };
    strongIds.forEach((id, index) => {
      bridge.engine.state.board[index + 1] = { uid: uid += 1, id, star: 3 };
    });
    bridge.engine.state.shop = [cheapId, null, null, null, null];
    return { bridge, cheapId, nextUid: uid + 1 };
  };

  const banked = makeStrongBridge(13030);
  const expensiveId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 5);
  assert.ok(expensiveId);
  banked.bridge.engine.state.shop = [expensiveId, null, null, null, null];
  const bankingAutopilot = new AutoChessAutopilot(banked.bridge, "evolution", {
    minimumWinningLineupMaxPrunes: 0,
  });
  bankingAutopilot.rolloutConfidence = () => 10400;
  bankingAutopilot.setEnabled(true);
  assert.equal(bankingAutopilot.tick(1000), null);
  const bankingActions = [];
  for (let step = 0; step < 80 && banked.bridge.engine.state.phase === "preparation"; step += 1) {
    const action = bankingAutopilot.tick(2000 + step * 500);
    if (action) bankingActions.push(action);
  }
  assert.equal(bankingActions.some((action) => action.type === "reroll"), false);
  assert.equal(banked.bridge.engine.state.gold, 5);
  assert.equal(banked.bridge.engine.state.phase, "battle");

  const merged = makeStrongBridge(13031);
  merged.bridge.engine.state.board[1] = { uid: merged.nextUid, id: merged.cheapId, star: 1 };
  merged.bridge.engine.state.board[2] = { uid: merged.nextUid + 1, id: merged.cheapId, star: 1 };
  const mergingAutopilot = new AutoChessAutopilot(merged.bridge);
  mergingAutopilot.setEnabled(true);
  assert.equal(mergingAutopilot.tick(1000), null);
  const mergePurchase = mergingAutopilot.tick(2000);
  assert.deepEqual(mergePurchase, { type: "shop", index: 0 });
  assert.equal(merged.bridge.engine.state.gold, 4);
  assert.ok(merged.bridge.engine.state.board.some((unit) => unit?.id === merged.cheapId && unit.star === 2));
});

test("托管按预演战力和追星进度在保息、稳血、追星刷新间切换", () => {
  const bridge = new EngineBridge(13039);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const duplicateId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 1);
  assert.ok(duplicateId);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.bench[0] = { uid: 130391, id: duplicateId, star: 1 };
  bridge.engine.state.bench[1] = { uid: 130392, id: duplicateId, star: 1 };
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    safeWinRolloutScore: 10300,
    stabilizeRolloutScore: 10150,
  });
  const roster = autopilot.ownedEntries();

  autopilot.rolloutConfidence = () => 10400;
  assert.equal(autopilot.rerollStrategy(roster).mode, "bank");
  autopilot.rolloutConfidence = () => 10000;
  assert.equal(autopilot.rerollStrategy(roster).mode, "stabilize");
  autopilot.rolloutConfidence = () => 10200;
  assert.equal(autopilot.rerollStrategy(roster).mode, "upgrade_chase");
});

test("托管估值不会让同名棋重复贡献羁绊", () => {
  const bridge = new EngineBridge(13045);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const autopilot = new AutoChessAutopilot(bridge, "heuristic");
  const grouped = new Map();
  SHOP_UNITS.forEach((id) => {
    UNIT_DEFS[id].traits.forEach((trait) => {
      const key = `${trait}/${UNIT_DEFS[id].attackType}`;
      grouped.set(key, [...(grouped.get(key) || []), id]);
    });
  });
  const [firstId, secondId] = Array.from(grouped.values()).find((ids) => ids.length >= 2);
  const duplicate = [
    { unit: { uid: 130451, id: firstId, star: 1 }, location: { zone: "board", index: 0 } },
    { unit: { uid: 130452, id: firstId, star: 1 }, location: { zone: "board", index: 1 } },
  ];
  const distinct = [
    duplicate[0],
    { unit: { uid: 130453, id: secondId, star: 1 }, location: { zone: "board", index: 1 } },
  ];
  autopilot.unitScore = () => 0;
  assert.ok(autopilot.lineupHeuristicScore(distinct) > autopilot.lineupHeuristicScore(duplicate));
});

test("托管会主动购买第三个不同理财成员推进四理财项目", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 3);
  assert.equal(financeIds.length, 3);
  const bridge = new EngineBridge(13046);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 130461, id: financeIds[0], star: 1 };
  bridge.engine.state.board[1] = { uid: 130462, id: financeIds[1], star: 1 };
  bridge.engine.state.shop = [financeIds[2], null, null, null, null];
  bridge.engine.state.gold = 20;
  bridge.engine.state.round = 6;
  const autopilot = new AutoChessAutopilot(bridge, "heuristic");
  const candidate = autopilot.shopCandidates(autopilot.ownedEntries(), false)[0];
  assert.equal(candidate?.id, financeIds[2]);
  assert.equal(candidate?.advancesFinance, true);
});

test("托管会为未拥有的后期核心牌牺牲一档利息并长期保留", () => {
  const bridge = new EngineBridge(13152);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const targetId = "rei";
  const cheapIds = SHOP_UNITS.filter((id) => (
    UNIT_DEFS[id].cost === 1 && !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id)
  ));
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  cheapIds.slice(0, bridge.engine.boardCap).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 131520 + index, id, star: 1 };
  });
  bridge.engine.state.shop = [targetId, cheapIds[3], null, null, null];
  bridge.engine.state.gold = 20;
  bridge.engine.state.round = 7;
  const autopilot = new AutoChessAutopilot(bridge, "heuristic");
  autopilot.rerollStrategy = () => ({ mode: "bank", rolloutScore: 10400, upgradeChaseIds: new Set() });
  const candidate = autopilot.shopCandidates(autopilot.ownedEntries(), false)[0];
  assert.equal(candidate?.id, targetId);
  assert.equal(candidate?.lateGamePriority, lateGameTargetPriority(targetId));
  assert.equal(candidate?.speculative, false);

  const strongIds = ["rei", "lian", "grove_mender"];
  bridge.engine.state.board.fill(null);
  strongIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 131530 + index, id, star: 3 };
  });
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.bench[0] = { uid: 131540, id: "xuehui", star: 1 };
  bridge.engine.state.bench[1] = { uid: 131541, id: cheapIds[0], star: 1 };
  const roster = autopilot.ownedEntries();
  const desired = roster.filter(({ location }) => location.zone === "board");
  const expendable = autopilot.expendableInterestEntries(roster, desired);
  assert.equal(expendable.some(({ unit }) => unit.id === "xuehui"), false);
  assert.equal(expendable.some(({ unit }) => unit.id === cheapIds[0]), true);
});

test("终局牌保留到九份且无归属的二星三星可以退役出售", () => {
  const bridge = new EngineBridge(13154);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 20;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  let uid = 131540;
  AUTOPILOT_TERMINAL_TARGET_IDS.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 2 };
  });
  const terminalId = AUTOPILOT_TERMINAL_TARGET_IDS[0];
  const unrelatedIds = SHOP_UNITS.filter((id) => (
    !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id)
    && !UNIT_DEFS[id].traits.includes("finance")
  ));
  bridge.engine.state.bench[0] = { uid: uid += 1, id: terminalId, star: 2 };
  bridge.engine.state.bench[1] = { uid: uid += 1, id: terminalId, star: 1 };
  bridge.engine.state.bench[2] = { uid: uid += 1, id: unrelatedIds[0], star: 2 };
  bridge.engine.state.bench[3] = { uid: uid += 1, id: unrelatedIds[1], star: 3 };

  const autopilot = new AutoChessAutopilot(bridge, "heuristic");
  autopilot.rolloutTargetLineup = (roster) => roster.filter(
    ({ location }) => location.zone === "board",
  );
  const roster = autopilot.ownedEntries();
  const reserves = autopilot.lateGameReserveUids(roster);
  assert.equal(reserves.has(bridge.engine.state.bench[0].uid), true);
  assert.equal(reserves.has(bridge.engine.state.bench[1].uid), true);

  const expendable = autopilot.expendableInterestEntries(roster);
  assert.equal(expendable.some(({ unit }) => unit.id === terminalId), false);
  assert.equal(expendable.some(({ unit }) => unit.id === unrelatedIds[0] && unit.star === 2), true);
  assert.equal(expendable.some(({ unit }) => unit.id === unrelatedIds[1] && unit.star === 3), true);
});

test("稳胜健康时会为寻找后期核心提前升到八本", () => {
  const bridge = new EngineBridge(13153);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const fillerId = SHOP_UNITS.find((id) => !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id));
  bridge.engine.state.playerLevel = 7;
  bridge.engine.state.upgradeRemaining = 10;
  bridge.engine.state.round = 12;
  bridge.engine.state.hp = 20;
  bridge.engine.state.gold = 30;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.board[0] = { uid: 131531, id: fillerId, star: 2 };
  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.rolloutConfidence = () => 10400;
  assert.deepEqual(autopilot.upgradeAction(), { type: "buyXp" });
});

test("托管会继续购买未上场的高进度追三星项目并阻止利息误售", () => {
  const bridge = new EngineBridge(13051);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const strongIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost === 5).slice(0, 3);
  const projectId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 1);
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  strongIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130510 + index, id, star: 3 };
  });
  bridge.engine.state.bench[0] = { uid: 130514, id: projectId, star: 2 };
  bridge.engine.state.bench[1] = { uid: 130515, id: projectId, star: 2 };
  bridge.engine.state.shop = [projectId, null, null, null, null];
  bridge.engine.state.gold = 20;
  const autopilot = new AutoChessAutopilot(bridge, "heuristic");
  autopilot.rolloutTargetLineup = (roster) => roster.filter(({ location }) => location.zone === "board");
  const roster = autopilot.ownedEntries();
  const candidate = autopilot.shopCandidates(roster, false)[0];
  assert.equal(candidate?.id, projectId);
  assert.equal(candidate?.targetDuplicate, true);
  assert.equal(
    autopilot.expendableInterestEntries(roster).some(({ unit }) => unit.id === projectId),
    false,
  );
});

test("托管在商店被买空后仍能刷新", () => {
  const bridge = new EngineBridge(13047);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.shop = [null, null, null, null, null];
  bridge.engine.state.gold = 6;
  bridge.engine.state.round = 1;
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    maximumExcessPaidRerolls: 0,
    stabilizeRerollInterestTiersAtRisk: 1,
  });
  autopilot.rolloutConfidence = () => 9900;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  let reroll = null;
  for (let step = 0; step < 8 && !reroll; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action?.type === "reroll") reroll = action;
  }
  assert.equal(reroll?.type, "reroll");
  assert.ok(bridge.engine.state.shop.some(Boolean));
});

test("四理财会用八十金以上余额搜索，但连续空搜达到上限后停手", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  const bridge = new EngineBridge(13048);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 4;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130480 + index, id, star: 1 };
  });
  bridge.engine.state.shop = [null, null, null, null, null];
  bridge.engine.state.gold = 100;
  bridge.engine.state.round = 12;
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    maximumExcessPaidRerolls: 64,
    maximumDryPaidRerolls: 12,
  });
  autopilot.rolloutConfidence = () => 10400;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  const actions = [];
  for (let step = 0; step < 40 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action) actions.push(action);
  }
  assert.equal(actions.filter((action) => action.type === "reroll").length, 12);
  assert.equal(bridge.engine.state.gold, 88);
  assert.equal(bridge.engine.interestIncome, 20);
});

test("托管逐档投入并在首次达到稳胜线时立即停止刷新", () => {
  const bridge = new EngineBridge(13049);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.gold = 40;
  bridge.engine.state.hp = 8;
  bridge.engine.state.round = 12;
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    maximumExcessPaidRerolls: 64,
    stabilizeRerollInterestTiersAtRisk: 20,
  });
  autopilot.rolloutConfidence = () => bridge.engine.state.gold <= 36 ? 10400 : 9900;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  const actions = [];
  for (let step = 0; step < 40 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action) actions.push(action);
  }
  assert.equal(actions.filter((action) => action.type === "reroll").length, 4);
  assert.equal(bridge.engine.state.gold, 36);
});

test("已知购买跨过多档后会逐档补记风险并继续稳血", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  const bridge = new EngineBridge(13054);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.gold = 19;
  bridge.engine.state.hp = 20;
  bridge.engine.state.round = 12;
  bridge.engine.state.playerLevel = 4;
  bridge.engine.state.board.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130540 + index, id, star: 1 };
  });
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    stabilizeRerollInterestTiersAtRisk: 4,
  });
  autopilot.rolloutConfidence = () => 9900;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  autopilot.preparationStartGold = 28;
  for (let step = 0; step < 3; step += 1) autopilot.tick(2000 + step * 500);
  assert.equal(autopilot.stabilizationInterestTiersAtRisk, 3);
  assert.equal(bridge.engine.state.gold, 19);
  assert.equal(autopilot.tick(4000)?.type, "reroll");
});

test("致命回合会扩大空搜次数，但仍受本轮可牺牲利息档约束", () => {
  const bridge = new EngineBridge(13053);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.gold = 40;
  bridge.engine.state.hp = 4;
  bridge.engine.state.round = 24;
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    maximumExcessPaidRerolls: 0,
    stabilizeRerollInterestTiersAtRisk: 2,
  });
  autopilot.rolloutConfidence = () => 9900;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  const actions = [];
  for (let step = 0; step < 32 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action) actions.push(action);
  }
  assert.equal(actions.filter((action) => action.type === "reroll").length, 30);
  assert.equal(autopilot.stabilizationInterestTiersAtRisk, 2);
  assert.equal(bridge.engine.state.gold, 10);
});

test("只有整队预演实际变强才会重置连续空搜额度", () => {
  const bridge = new EngineBridge(13057);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.dryPaidRerolls = 8;
  autopilot.stabilizationBestScore = 10000;
  autopilot.stabilizationRosterKey = "previous";
  autopilot.rolloutLineupScore = () => 10005;
  autopilot.observeStabilizationStrength(autopilot.ownedEntries());
  assert.equal(autopilot.dryPaidRerolls, 8);

  const id = SHOP_UNITS.find((unitId) => UNIT_DEFS[unitId].cost === 5);
  assert.ok(id);
  bridge.engine.state.bench[0] = { uid: 130571, id, star: 2 };
  autopilot.rolloutLineupScore = () => 10400;
  autopilot.observeStabilizationStrength(autopilot.ownedEntries());
  assert.equal(autopilot.dryPaidRerolls, 0);
});

test("准备结束仍预测失败时会枚举整队组合寻找当前战局胜解", () => {
  const bridge = new EngineBridge(13058);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const ids = SHOP_UNITS.slice(0, 5);
  ids.slice(0, 3).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130580 + index, id, star: 1 };
  });
  ids.slice(3).forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: 130583 + index, id, star: 1 };
  });
  const winningUids = new Set([130583, 130584]);
  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.rolloutConfidence = () => -100;
  autopilot.rolloutLineupScore = (lineup) => (
    lineup.filter(({ unit }) => winningUids.has(unit.uid)).length === 2 ? 10100 : -100
  );

  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), true);
  assert.equal(autopilot.plannedLineupUids.filter((uid) => winningUids.has(uid)).length, 2);
  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), false);
});

test("救援搜索按战斗局面去重，换棋后允许重新搜索", () => {
  const bridge = new EngineBridge(130581);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 48;
  bridge.engine.state.playerLevel = 3;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  SHOP_UNITS.slice(0, 3).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1305810 + index, id, star: 1 };
  });
  bridge.engine.state.bench[0] = { uid: 1305813, id: SHOP_UNITS[3], star: 1 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    20,
  );
  let boardCalls = 0;
  let lineupCalls = 0;
  autopilot.rolloutConfidence = () => -100;
  autopilot.rolloutBoardScore = () => {
    boardCalls += 1;
    return -100;
  };
  autopilot.rolloutLineupScore = () => {
    lineupCalls += 1;
    return -100;
  };

  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), false);
  const firstCalls = boardCalls + lineupCalls;
  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), false);
  assert.equal(boardCalls + lineupCalls, firstCalls);

  bridge.engine.state.bench[0].star = 2;
  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), false);
  assert.ok(boardCalls + lineupCalls > firstCalls);
});

test("救援方案锁定期间先完成换位，不继续买牌或刷新", () => {
  const bridge = new EngineBridge(130582);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 48;
  bridge.engine.state.playerLevel = 3;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  SHOP_UNITS.slice(0, 3).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1305820 + index, id, star: 1 };
  });
  const rescueUid = 1305823;
  bridge.engine.state.bench[0] = { uid: rescueUid, id: SHOP_UNITS[3], star: 1 };
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "seer",
    "oracle",
    20,
  );
  autopilot.rolloutConfidence = () => -100;
  autopilot.rolloutBoardScore = (board) => (
    board.some((entry) => entry?.unit.uid === rescueUid) ? 10100 : -100
  );
  autopilot.rolloutLineupScore = (lineup) => (
    lineup.some(({ unit }) => unit.uid === rescueUid) ? 10100 : -100
  );
  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), true);
  autopilot.plannedRound = 48;
  autopilot.purchaseAction = () => {
    throw new Error("rescue lock must not purchase before moving");
  };
  autopilot.seerPlannedPurchaseAction = () => {
    throw new Error("rescue lock must not execute the oracle purchase macro");
  };
  const action = autopilot.nextPreparationAction();
  assert.equal(action?.type, "move");
  assert.equal(action?.from.zone, "bench");
});

test("锁定救援阵容会先完成工坊升级再开始唯一一次落位", () => {
  const bridge = new EngineBridge(1305822);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal");
  pilot.plannedRound = bridge.engine.state.round;
  pilot.rescueLineupLocked = true;
  let formationCalls = 0;
  pilot.starForgeAction = () => ({ type: "starForge", location: { zone: "board", index: 0 } });
  pilot.formationAction = () => {
    formationCalls += 1;
    return { type: "move", from: { zone: "bench", index: 0 }, to: { zone: "board", index: 0 } };
  };

  assert.deepEqual(pilot.nextPreparationAction(), {
    type: "starForge",
    location: { zone: "board", index: 0 },
  });
  assert.equal(formationCalls, 0);
  assert.equal(pilot.formationStartedThisPreparation, false);
});

test("精确搜索新选中的主力会在落位前再检查一次工坊", () => {
  const bridge = new EngineBridge(1305823);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal");
  pilot.plannedRound = bridge.engine.state.round;
  pilot.finalizingEconomy = true;
  let forgeCalls = 0;
  let formationCalls = 0;
  pilot.starForgeAction = () => {
    forgeCalls += 1;
    return forgeCalls === 2
      ? { type: "starForge", location: { zone: "bench", index: 0 } }
      : null;
  };
  pilot.benchCleanupAction = () => null;
  pilot.interestSaleAction = () => null;
  pilot.searchRescueLineup = () => {
    pilot.rescueLineupLocked = true;
    return true;
  };
  pilot.formationAction = () => {
    formationCalls += 1;
    return { type: "move", from: { zone: "bench", index: 0 }, to: { zone: "board", index: 0 } };
  };

  assert.deepEqual(pilot.nextPreparationAction(), {
    type: "starForge",
    location: { zone: "bench", index: 0 },
  });
  assert.equal(forgeCalls, 2);
  assert.equal(formationCalls, 0);
  assert.equal(pilot.formationStartedThisPreparation, false);
});

test("锁定的精确主力会保留胜阵并把工坊花到正常利息储备线", () => {
  const { bridge, autopilot } = makeLateSeerCase(
    [null, null, null, null, null],
    [],
    44,
    "balanced",
  );
  const state = bridge.engine.state;
  state.board.forEach((unit) => {
    if (unit) unit.star = 3;
  });
  const tower = { uid: 13058240, id: "tower_god", star: 1 };
  state.bench[0] = tower;
  state.gold = 140;
  state.starForgeUnlocked = false;
  autopilot.goldReserve = () => 80;
  const plannedUnits = [...state.board.slice(0, 9).filter(Boolean), tower];
  autopilot.plannedLineupUids = plannedUnits.map((unit) => unit.uid);
  autopilot.plannedLineupUnits = new Map(plannedUnits.map((unit) => [
    unit.uid,
    { id: unit.id, star: unit.star },
  ]));
  autopilot.plannedBoardSlots = new Map(plannedUnits.map((unit, index) => [unit.uid, index]));
  autopilot.rescueLineupLocked = true;

  const unlock = autopilot.nextPreparationAction();
  assert.deepEqual(unlock, {
    type: "starForge",
    location: { zone: "bench", index: 0 },
  });
  assert.equal(autopilot.rescueLineupLocked, true);
  bridge.dispatch(unlock);
  assert.equal(state.starForgeUnlocked, true);
  assert.equal(state.gold, 100);

  const upgrade = autopilot.nextPreparationAction();
  assert.deepEqual(upgrade, {
    type: "starForge",
    location: { zone: "bench", index: 0 },
  });
  bridge.dispatch(upgrade);
  assert.equal(state.bench[0].star, 2);
  assert.equal(state.gold, 80);
});

test("锁定的精确救援阵容不会被后续置信度查询覆盖", () => {
  const bridge = new EngineBridge(1305820, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.board.fill(null);
  state.bench.fill(null);
  SHOP_UNITS.slice(0, bridge.engine.boardCap).forEach((id, index) => {
    state.board[index] = { uid: 13058200 + index, id, star: 1 };
  });
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => 0,
    true,
    "oracle",
  );
  const boardUnits = state.board.filter(Boolean);
  autopilot.plannedLineupKey = "stale-key-from-rescue-search";
  autopilot.plannedLineupUids = boardUnits.map(({ uid }) => uid);
  autopilot.plannedLineupUnits = new Map(boardUnits.map(({ uid, id, star }) => [
    uid,
    { id, star },
  ]));
  autopilot.plannedBoardSlots = new Map(boardUnits.map(({ uid }, index) => [uid, index]));
  autopilot.plannedLineupScore = 10137;
  autopilot.plannedLineupRandomState = bridge.engine.getRandomState();
  autopilot.rescueLineupLocked = true;
  autopilot.rolloutLineupScore = () => {
    throw new Error("locked rescue confidence must not launch another lineup search");
  };

  const roster = autopilot.ownedEntries();
  assert.deepEqual(
    autopilot.rolloutTargetLineup(roster).map(({ unit }) => unit.uid),
    boardUnits.map(({ uid }) => uid),
  );
  assert.equal(autopilot.rolloutConfidence(roster), 10137);
  assert.equal(autopilot.rescueLineupLocked, true);
});

test("均衡残血已有安全救援阵容时仍会用终局余钱搜牌", () => {
  const bridge = new EngineBridge(1305821);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.round = 24;
  state.hp = 13;
  state.playerLevel = 10;
  state.upgradeRemaining = 0;
  state.gold = 207;
  state.board.fill(null);
  state.bench.fill(null);
  state.shop.fill(null);
  const boardUnits = SHOP_UNITS.slice(0, 10).map((id, index) => ({
    uid: 13058210 + index,
    id,
    star: index < 2 ? 2 : 1,
  }));
  const benchUnits = SHOP_UNITS.slice(10, 13).map((id, index) => ({
    uid: 13058230 + index,
    id,
    star: 1,
  }));
  boardUnits.forEach((unit, index) => { state.board[index] = unit; });
  benchUnits.forEach((unit, index) => { state.bench[index] = unit; });
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
  );
  autopilot.plannedRound = state.round;
  autopilot.preparationStartGold = 212;
  autopilot.preparationActions = 0;
  autopilot.plannedLineupUids = boardUnits.map(({ uid }) => uid);
  autopilot.plannedLineupUnits = new Map(boardUnits.map(({ uid, id, star }) => [
    uid,
    { id, star },
  ]));
  autopilot.plannedBoardSlots = new Map(boardUnits.map(({ uid }, index) => [uid, index]));
  autopilot.plannedLineupScore = 10100;
  autopilot.rescueLineupLocked = true;
  autopilot.formationAction = () => null;
  autopilot.starForgeAction = () => null;
  autopilot.searchRescueLineup = () => false;
  autopilot.rolloutConfidence = () => 10100;
  autopilot.observeStabilizationStrength = () => {};
  autopilot.fundingSaleAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.purchaseAction = () => null;

  const action = autopilot.nextPreparationAction();
  assert.deepEqual(action, { type: "reroll" });
  assert.equal(autopilot.rescueLineupLocked, false);
  assert.equal(autopilot.plannedLineupUids.length, boardUnits.length);
});

test("搏上限在残血满场时会完成规范站位并换入候补胜解", () => {
  const bridge = new EngineBridge(130583);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 26;
  bridge.engine.state.hp = 5;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  SHOP_UNITS.slice(0, 4).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1305830 + index, id, star: 1 };
  });
  const rescueUid = 1305834;
  bridge.engine.state.bench[0] = { uid: rescueUid, id: SHOP_UNITS[4], star: 1 };
  bridge.engine.state.playerLevel = 4;
  assert.equal(bridge.engine.boardCount, bridge.engine.boardCap);
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "normal",
    20,
  );
  autopilot.rolloutConfidence = () => -100;
  autopilot.rolloutBoardScore = (board) => (
    board.some((entry) => entry?.unit.uid === rescueUid) ? 10100 : -100
  );
  autopilot.rolloutLineupScore = (lineup) => (
    lineup.some(({ unit }) => unit.uid === rescueUid) ? 10100 : -100
  );

  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), true);
  autopilot.setEnabled(true);
  const actions = [];
  for (let step = 1; step <= 20; step += 1) {
    const action = autopilot.tick(step * 1000);
    if (action) actions.push(action);
    const rescue = autopilot.ownedEntries().find(({ unit }) => unit.uid === rescueUid);
    if (rescue?.location.zone === "board") break;
  }
  assert.equal(autopilot.plannedLineupUids.includes(rescueUid), true);
  const rescue = autopilot.ownedEntries().find(({ unit }) => unit.uid === rescueUid);
  assert.equal(rescue?.location.zone, "board");
  assert.equal(actions.some((action) => action.type === "move" && action.from.zone === "bench"), true);
});

test("搏上限按当前血线动态止损，历史败局不会永久降档", () => {
  const bridge = new EngineBridge(1305831, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.round = 13;
  state.victories = 11;
  state.hp = 13;
  state.playerLevel = 7;
  state.board.fill(null);
  SHOP_UNITS.slice(0, 7).forEach((id, index) => {
    state.board[index] = { uid: 13058310 + index, id, star: 1 };
  });
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    true,
    "oracle",
  );
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  assert.equal(autopilot.recoveryPressureActive(), false);
  assert.equal(autopilot.rolloutPreferenceStyle(), "highroll");

  let exactAudits = 0;
  state.hp = 10;
  assert.equal(autopilot.recoveryPressureActive(), true);
  assert.equal(autopilot.rolloutPreferenceStyle(), "balanced");
  autopilot.exactLineupSearchRequested = true;
  autopilot.nextPreparationAction = () => ({ type: "battle" });
  autopilot.battleConfidence = () => -100;
  autopilot.exactBattleAudit = () => {
    exactAudits += 1;
    return { key: `known-loss-${exactAudits}`, score: -100 };
  };
  assert.equal(autopilot.tick(2000), null);
  assert.equal(exactAudits, 1);
  assert.equal(state.phase, "preparation");
  assert.equal(autopilot.tick(3000)?.type, "battle");
  assert.equal(exactAudits, 2);
  assert.equal(state.phase, "battle");

  state.hp = 5;
  assert.equal(autopilot.rolloutPreferenceStyle(), "survival");
  state.hp = 13;
  state.round = 13;
  state.victories = 8;
  assert.equal(autopilot.recoveryPressureActive(), false);
  assert.equal(autopilot.rolloutPreferenceStyle(), "highroll");
});

test("健康搏上限只小额止血，受伤后才放开完整稳定预算", () => {
  const bridge = new EngineBridge(1305833);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 12;
  bridge.engine.state.gold = 40;
  bridge.engine.state.hp = 20;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "normal",
    20,
  );
  autopilot.rolloutConfidence = () => 9900;
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  const healthyActions = [];
  for (let step = 0; step < 24 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action) healthyActions.push(action);
  }
  assert.equal(
    healthyActions.filter((action) => action.type === "reroll").length,
    autopilot.policy.healthyStabilizeMaximumDryPaidRerolls,
  );
  assert.ok(
    autopilot.stabilizationInterestTiersAtRisk
      <= autopilot.policy.healthyStabilizeRerollInterestTiersAtRisk,
  );

  bridge.engine.state.phase = "preparation";
  bridge.engine.state.hp = 10;
  bridge.engine.state.gold = 40;
  autopilot.resetPreparation(12);
  const woundedActions = [];
  for (let step = 0; step < 48 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(20_000 + step * 500);
    if (action) woundedActions.push(action);
  }
  assert.ok(
    woundedActions.filter((action) => action.type === "reroll").length
      > healthyActions.filter((action) => action.type === "reroll").length,
  );
  assert.ok(
    autopilot.stabilizationInterestTiersAtRisk
      > autopilot.policy.healthyStabilizeRerollInterestTiersAtRisk,
  );
});

test("健康搏上限看穿用60Hz复核20Hz假阴性后再决定是否止血", () => {
  const bridge = new EngineBridge(1305834);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 12;
  bridge.engine.state.hp = 20;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "oracle",
    20,
    undefined,
    true,
    "oracle",
  );
  autopilot.rolloutLineupScore = (_lineup, _formation, _stableOnly, combatHz) => (
    combatHz === 60 ? 10100 : 9900
  );
  const roster = autopilot.ownedEntries();
  assert.equal(autopilot.criticalExactRolloutConfidence(roster, 9900), 10100);

  bridge.engine.state.hp = 5;
  assert.equal(autopilot.criticalExactRolloutConfidence(roster, 9900), 9900);
});

test("搏上限四理财银行期优先保息，并为优质购买适度兑现战力", () => {
  const financeIds = SHOP_UNITS
    .filter((id) => UNIT_DEFS[id].traits.includes("finance"))
    .slice(0, 4);
  const bridge = new EngineBridge(1305832);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 4;
  bridge.engine.state.round = 10;
  bridge.engine.state.gold = 40;
  bridge.engine.state.board.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 13058320 + index, id, star: 1 };
  });
  const highroll = new AutoChessAutopilot(bridge, "evolution", {}, "highroll", "normal");
  highroll.resetPreparation(10);
  assert.equal(highroll.financeInterestActive(), true);
  assert.equal(
    highroll.goldReserve(false, highroll.policy.bankPurchaseInterestTiersAtRisk),
    36,
  );
  assert.equal(
    highroll.goldReserve(false, highroll.policy.goodPurchaseInterestTiersAtRisk),
    28,
  );
  assert.equal(
    highroll.goldReserve(false, highroll.policy.mergePurchaseInterestTiersAtRisk),
    20,
  );
});

test("残血救援不会被20Hz假阴性挡住，候补胜解用60Hz确认", () => {
  const bridge = new EngineBridge(130584);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 23;
  bridge.engine.state.hp = 8;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  SHOP_UNITS.slice(0, 4).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 1305840 + index, id, star: 1 };
  });
  const rescueUid = 1305844;
  bridge.engine.state.bench[0] = { uid: rescueUid, id: SHOP_UNITS[4], star: 1 };
  bridge.engine.state.playerLevel = 4;
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "survival",
    "normal",
    20,
  );
  autopilot.rolloutConfidence = () => -100;
  autopilot.rolloutBoardScore = (board, _stableOnly, combatHz = 20) => (
    board.some((entry) => entry?.unit.uid === rescueUid) && combatHz === 60
      ? 10100
      : -100
  );
  autopilot.rolloutLineupScore = (lineup, _formation, _stableOnly, combatHz = 20) => (
    lineup.some(({ unit }) => unit.uid === rescueUid) && combatHz === 60
      ? 10100
      : -100
  );

  assert.equal(autopilot.searchRescueLineup(autopilot.ownedEntries()), true);
  assert.equal(autopilot.plannedLineupUids.includes(rescueUid), true);
});

test("利息风险档锚定整轮起始金币，保息只花零头且降一档不会连续滑档", () => {
  const runRerollBudget = (seed, tiersAtRisk) => {
    const bridge = new EngineBridge(seed);
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.round = 1;
    bridge.engine.state.gold = 11;
    bridge.engine.state.shop = [SHOP_UNITS[0], null, null, null, null];
    const autopilot = new AutoChessAutopilot(bridge, "evolution", {
      stabilizeRerollInterestTiersAtRisk: tiersAtRisk,
    });
    autopilot.rolloutConfidence = () => 9900;
    autopilot.purchaseAction = () => null;
    autopilot.replacementAction = () => null;
    autopilot.upgradeAction = () => null;
    autopilot.benchCleanupAction = () => null;
    autopilot.interestSaleAction = () => null;
    autopilot.finalReinvestmentAction = () => null;
    autopilot.formationAction = () => null;
    autopilot.setEnabled(true);
    assert.equal(autopilot.tick(1000), null);
    const actions = [];
    for (let step = 0; step < 20 && bridge.engine.state.phase === "preparation"; step += 1) {
      const action = autopilot.tick(2000 + step * 500);
      if (action) actions.push(action);
    }
    return { bridge, actions };
  };

  const zeroRisk = runRerollBudget(13040, 0);
  assert.equal(zeroRisk.actions.filter((action) => action.type === "reroll").length, 1);
  assert.equal(zeroRisk.bridge.engine.state.gold, 10);

  const oneTierRisk = runRerollBudget(13041, 1);
  assert.equal(oneTierRisk.actions.filter((action) => action.type === "reroll").length, 6);
  assert.equal(oneTierRisk.bridge.engine.state.gold, 5);
});

test("已知好棋可比随机刷新多降一档，可逆合成允许先拿再清算", () => {
  const bridge = new EngineBridge(13042);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const expensiveId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 5);
  assert.ok(expensiveId);
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 130421, id: expensiveId, star: 1 };
  bridge.engine.state.gold = 10;
  bridge.engine.state.round = 1;
  bridge.engine.state.shop = [expensiveId, null, null, null, null];

  const buyingPilot = new AutoChessAutopilot(bridge, "heuristic", {
    goodPurchaseInterestTiersAtRisk: 1,
  });
  assert.equal(buyingPilot.goldReserve(false, 0), 10);
  assert.equal(buyingPilot.shopCandidates(buyingPilot.ownedEntries(), false)[0]?.id, expensiveId);

  bridge.engine.state.board[1] = { uid: 130422, id: expensiveId, star: 1 };
  const reversibleMergePilot = new AutoChessAutopilot(bridge, "heuristic", {
    mergePurchaseInterestTiersAtRisk: 0,
    speculativePurchaseMinimumEmptyBench: 9,
  });
  assert.equal(reversibleMergePilot.shopCandidates(reversibleMergePilot.ownedEntries(), false).length, 1);
});

test("四理财使用四金币利息档，未逐档放开时残血也不会跳档", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  assert.equal(financeIds.length, 4);
  const bridge = new EngineBridge(13043);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 4;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130430 + index, id, star: 1 };
  });
  bridge.engine.state.gold = 83;
  bridge.engine.state.round = 12;
  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.resetPreparation(12);
  assert.equal(autopilot.goldReserve(false, 0), 80);
  assert.equal(autopilot.goldReserve(false, 1), 76);
  bridge.engine.state.gold = 79;
  assert.equal(autopilot.goldReserve(false, 0), 80);

  bridge.engine.state.hp = 8;
  bridge.engine.state.gold = 80;
  bridge.engine.state.shop = [SHOP_UNITS[0], null, null, null, null];
  const criticalPilot = new AutoChessAutopilot(bridge, "evolution", {
    stabilizeRerollInterestTiersAtRisk: 0,
  });
  criticalPilot.rolloutConfidence = () => 10000;
  criticalPilot.purchaseAction = () => null;
  criticalPilot.replacementAction = () => null;
  criticalPilot.upgradeAction = () => null;
  criticalPilot.benchCleanupAction = () => null;
  criticalPilot.interestSaleAction = () => null;
  criticalPilot.finalReinvestmentAction = () => null;
  criticalPilot.formationAction = () => null;
  criticalPilot.setEnabled(true);
  assert.equal(criticalPilot.tick(1000), null);
  const rerolls = [];
  for (let step = 0; step < 24 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = criticalPilot.tick(2000 + step * 500);
    if (action?.type === "reroll") rerolls.push(action);
  }
  assert.equal(rerolls.length, 0);
  assert.equal(bridge.engine.state.gold, 80);
});

test("七本以上四理财只用八十以上余额升本且危险时不突破四档风险", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  const bridge = new EngineBridge(13052);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 7;
  bridge.engine.state.upgradeRemaining = 20;
  bridge.engine.state.round = 14;
  bridge.engine.state.hp = 20;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130520 + index, id, star: 2 };
  });
  bridge.engine.state.gold = 90;
  const autopilot = new AutoChessAutopilot(bridge, "heuristic", {
    levelInterestTiersAtRisk: 4,
  });
  autopilot.rolloutConfidence = () => 10400;
  assert.equal(autopilot.upgradeAction(), null);
  const upgradeCost = bridge.engine.upgradeCost;
  bridge.engine.state.gold = 80 + upgradeCost;
  assert.equal(autopilot.upgradeAction()?.type, "buyXp");

  bridge.engine.state.gold = upgradeCost + 12;
  bridge.engine.state.hp = 8;
  autopilot.rolloutConfidence = () => 9900;
  autopilot.previewRosterRollout = () => 10400;
  assert.equal(autopilot.upgradeAction(), null);
});

test("稳胜阵容会出售一个非目标单卡跨入下一档利息", () => {
  const bridge = new EngineBridge(13032);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  const strongIds = SHOP_UNITS
    .filter((id) => UNIT_DEFS[id].cost >= 4)
    .sort((left, right) => UNIT_DEFS[right].cost - UNIT_DEFS[left].cost)
    .slice(0, 10);
  const cheapId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 1 && !strongIds.includes(id));
  assert.ok(cheapId && strongIds.length === 10);
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.round = 1;
  bridge.engine.state.streak = 2;
  bridge.engine.state.gold = 4;
  bridge.engine.state.board.fill(null);
  let uid = 130320;
  strongIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 3 };
  });
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.bench[0] = { uid: uid += 1, id: cheapId, star: 1 };
  bridge.engine.state.shop = [null, null, null, null, null];

  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.rolloutTargetLineup = (roster) => roster.filter(({ location }) => location.zone === "board");
  autopilot.rolloutConfidence = () => 10400;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  let interestSale = null;
  for (let step = 0; step < 100 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action?.type === "sell") {
      interestSale = action;
      break;
    }
  }
  assert.equal(interestSale?.location?.zone, "bench");
  assert.equal(bridge.engine.state.bench.filter(Boolean).length, 0);
  assert.equal(bridge.engine.state.gold, 5);
  assert.equal(bridge.engine.interestIncome, 1);
});

test("托管本回合买入并合成的追星素材不会为了利息立即卖回", () => {
  const bridge = new EngineBridge(13034);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const strongIds = SHOP_UNITS
    .filter((id) => UNIT_DEFS[id].cost >= 4)
    .sort((left, right) => UNIT_DEFS[right].cost - UNIT_DEFS[left].cost)
    .slice(0, 10);
  const materialId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 1 && !strongIds.includes(id));
  assert.ok(materialId && strongIds.length === 10);
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.round = 8;
  bridge.engine.state.streak = 3;
  bridge.engine.state.gold = 6;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  let uid = 130340;
  strongIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 3 };
  });
  bridge.engine.state.bench[0] = { uid: uid += 1, id: materialId, star: 1 };
  bridge.engine.state.shop = [materialId, materialId, null, null, null];

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    maximumExcessPaidRerolls: 0,
    interestSaleMinimumBench: 0,
  });
  autopilot.rolloutTargetLineup = (roster) => roster.filter(({ location }) => location.zone === "board");
  autopilot.rolloutConfidence = () => 10400;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  assert.deepEqual(autopilot.tick(2000), { type: "shop", index: 0 });
  assert.deepEqual(autopilot.tick(2500), { type: "shop", index: 1 });
  assert.ok(bridge.engine.state.bench.some((unit) => unit?.id === materialId && unit.star === 2));

  let sale = null;
  for (let step = 0; step < 80 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(3000 + step * 500);
    if (action?.type === "sell") {
      sale = action;
      break;
    }
  }
  assert.equal(sale, null);
  assert.equal(bridge.engine.state.bench.some((unit) => (
    unit?.id === materialId && unit.star === 2
  )), true);
  assert.equal(bridge.engine.state.gold, 4);
  assert.equal(bridge.engine.interestIncome, 0);
});

test("投机购入即使没有连胜也会在开战前卖回当前利息档", () => {
  const bridge = new EngineBridge(13050);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const strongId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 5);
  const materialId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 1);
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.board[0] = { uid: 130501, id: strongId, star: 3 };
  bridge.engine.state.bench[0] = { uid: 130502, id: materialId, star: 1 };
  bridge.engine.state.gold = 4;
  bridge.engine.state.streak = 0;
  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.rolloutTargetLineup = (roster) => roster.filter(({ location }) => location.zone === "board");
  autopilot.rolloutConfidence = () => 10000;
  autopilot.speculativeUnitIds.add(materialId);
  const sale = autopilot.interestSaleAction(autopilot.ownedEntries());
  assert.equal(sale?.type, "sell");
  bridge.dispatch(sale);
  assert.equal(bridge.engine.state.gold, 5);
  assert.equal(bridge.engine.interestIncome, 1);
});

test("托管组合出售多张闲棋时会计算能够达到的最高利息档", () => {
  const bridge = new EngineBridge(13035);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const strongIds = SHOP_UNITS
    .filter((id) => UNIT_DEFS[id].cost >= 4)
    .sort((left, right) => UNIT_DEFS[right].cost - UNIT_DEFS[left].cost)
    .slice(0, 10);
  const cheapIds = SHOP_UNITS
    .filter((id) => UNIT_DEFS[id].cost === 1 && !strongIds.includes(id))
    .slice(0, 6);
  assert.equal(cheapIds.length, 6);
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.round = 8;
  bridge.engine.state.streak = 3;
  bridge.engine.state.gold = 4;
  bridge.engine.state.board.fill(null);
  let uid = 130350;
  strongIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 3 };
  });
  bridge.engine.state.bench.fill(null);
  cheapIds.forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: uid += 1, id, star: 1 };
  });
  bridge.engine.state.shop = [null, null, null, null, null];

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    interestSaleMinimumBench: 0,
  });
  autopilot.rolloutTargetLineup = (roster) => roster.filter(({ location }) => location.zone === "board");
  autopilot.rolloutConfidence = () => 10400;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  const sales = [];
  for (let step = 0; step < 100 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action?.type === "sell") sales.push(action);
  }
  assert.equal(sales.length, 6);
  assert.equal(bridge.engine.state.gold, 10);
  assert.equal(bridge.engine.interestIncome, 2);
});

test("托管用固定预演逐个剔除棋子并保留最小稳胜阵容", () => {
  const bridge = new EngineBridge(13036);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const ids = SHOP_UNITS.slice(0, 5);
  bridge.engine.state.playerLevel = 5;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  let uid = 130360;
  ids.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 1 };
  });
  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    minimumWinningLineupMaxPrunes: 5,
  });
  autopilot.rolloutLineupScore = (lineup) => lineup.length >= 3 ? 10400 + lineup.length : 9000;
  autopilot.finalizingEconomy = true;

  const minimumWinning = autopilot.rolloutTargetLineup(autopilot.ownedEntries());
  assert.equal(minimumWinning.length, 3);
  assert.ok(autopilot.plannedLineupScore >= 10400);
});

test("四理财阵容只要固定预演稳胜就优先，并可出售场上闲棋冲到八十金", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  const nonFinanceId = SHOP_UNITS.find((id) => !UNIT_DEFS[id].traits.includes("finance"));
  assert.equal(financeIds.length, 4);
  assert.ok(nonFinanceId);

  const selectionBridge = new EngineBridge(13037);
  selectionBridge.setConsoleLogging(false);
  selectionBridge.engine.state.starterChoices = ["bastion"];
  selectionBridge.engine.startRun("bastion");
  selectionBridge.engine.state.playerLevel = 4;
  selectionBridge.engine.state.board.fill(null);
  selectionBridge.engine.state.bench.fill(null);
  let uid = 130370;
  [...financeIds, nonFinanceId].forEach((id, index) => {
    const unit = { uid: uid += 1, id, star: 1 };
    if (index < 4) selectionBridge.engine.state.board[index] = unit;
    else selectionBridge.engine.state.bench[0] = unit;
  });
  const selectionPilot = new AutoChessAutopilot(selectionBridge, "evolution", {
    minimumWinningLineupMaxPrunes: 0,
  });
  selectionPilot.rolloutLineupScore = (lineup) => (
    new Set(lineup.filter(({ unit }) => UNIT_DEFS[unit.id].traits.includes("finance")).map(({ unit }) => unit.id)).size >= 4
      ? 10600
      : 10600
  );
  const financeLineup = selectionPilot.rolloutTargetLineup(selectionPilot.ownedEntries());
  assert.equal(financeLineup.length, 4);
  assert.equal(new Set(financeLineup.map(({ unit }) => unit.id)).size, 4);
  assert.ok(financeLineup.every(({ unit }) => UNIT_DEFS[unit.id].traits.includes("finance")));

  selectionBridge.engine.state.round = 2;
  selectionPilot.rolloutLineupScore = (lineup) => (
    new Set(lineup.filter(({ unit }) => UNIT_DEFS[unit.id].traits.includes("finance")).map(({ unit }) => unit.id)).size >= 4
      ? 10400
      : 10600
  );
  const strongerLineup = selectionPilot.rolloutTargetLineup(selectionPilot.ownedEntries());
  assert.ok(strongerLineup.some(({ unit }) => unit.id === nonFinanceId));

  const economyBridge = new EngineBridge(13038);
  economyBridge.setConsoleLogging(false);
  economyBridge.engine.state.starterChoices = ["bastion"];
  economyBridge.engine.startRun("bastion");
  economyBridge.engine.state.playerLevel = 10;
  economyBridge.engine.state.upgradeRemaining = 0;
  economyBridge.engine.state.round = 12;
  economyBridge.engine.state.streak = 3;
  economyBridge.engine.state.gold = 79;
  economyBridge.engine.state.board.fill(null);
  economyBridge.engine.state.bench.fill(null);
  const desiredUids = [];
  financeIds.forEach((id, index) => {
    const unit = { uid: uid += 1, id, star: 1 };
    desiredUids.push(unit.uid);
    economyBridge.engine.state.board[index] = unit;
  });
  economyBridge.engine.state.board[4] = { uid: uid += 1, id: nonFinanceId, star: 1 };
  economyBridge.engine.state.shop = [null, null, null, null, null];
  const economyPilot = new AutoChessAutopilot(economyBridge);
  economyPilot.rolloutTargetLineup = (roster) => roster.filter(({ unit }) => desiredUids.includes(unit.uid));
  economyPilot.rolloutConfidence = () => 10400;
  economyPilot.setEnabled(true);
  assert.equal(economyPilot.tick(1000), null);
  const sale = economyPilot.tick(2000);
  assert.equal(sale?.type, "sell");
  assert.equal(sale?.location.zone, "board");
  assert.equal(economyBridge.engine.state.gold, 80);
  assert.equal(economyBridge.engine.interestIncome, 20);
});

test("托管不再购买三星主力的无用同名棋并主动清理同名一星废件", () => {
  const bridge = new EngineBridge(13033);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  const strongIds = SHOP_UNITS
    .filter((id) => UNIT_DEFS[id].cost >= 4)
    .sort((left, right) => UNIT_DEFS[right].cost - UNIT_DEFS[left].cost)
    .slice(0, 10);
  assert.equal(strongIds.length, 10);
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.upgradeRemaining = 0;
  bridge.engine.state.round = 12;
  bridge.engine.state.streak = 3;
  bridge.engine.state.gold = 20;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  let uid = 130330;
  strongIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 3 };
  });
  Array.from({ length: 2 }).forEach((_, index) => {
    bridge.engine.state.bench[index] = { uid: uid += 1, id: strongIds[0], star: 1 };
  });
  bridge.engine.state.shop = [strongIds[0], null, null, null, null];
  const expectedSellValue = bridge.engine.getUnitSellValue(bridge.engine.state.bench[0]);

  const autopilot = new AutoChessAutopilot(bridge);
  autopilot.rolloutTargetLineup = (roster) => roster.filter(({ location }) => location.zone === "board");
  assert.equal(autopilot.shopCandidates(autopilot.ownedEntries()).length, 0);
  bridge.engine.state.shop = [null, null, null, null, null];
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);
  let cleanupSale = null;
  for (let step = 0; step < 80 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action?.type === "sell") {
      cleanupSale = action;
      break;
    }
  }
  assert.equal(cleanupSale?.location?.zone, "bench");
  assert.equal(bridge.engine.state.bench.filter(Boolean).length, 1);
  assert.equal(bridge.engine.state.gold, 20 + expectedSellValue);
});

test("十本四理财会在高存款回合集中搜牌并为后续购买预留五金币", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  const bridge = new EngineBridge(13061);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 20;
  bridge.engine.state.hp = 20;
  bridge.engine.state.gold = 105;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130610 + index, id, star: 3 };
  });
  bridge.engine.state.shop.fill(null);

  const autopilot = new AutoChessAutopilot(bridge, "evolution", {
    terminalRollDownMinimumRound: 18,
    terminalRollDownActivationGold: 100,
    terminalRollDownReserveGold: 40,
    terminalRollDownMaximumDryRerolls: 64,
    maximumExcessPaidRerolls: 64,
  });
  autopilot.rolloutConfidence = () => 10400;
  autopilot.observeStabilizationStrength = () => {};
  autopilot.purchaseAction = () => null;
  autopilot.replacementAction = () => null;
  autopilot.upgradeAction = () => null;
  autopilot.benchCleanupAction = () => null;
  autopilot.interestSaleAction = () => null;
  autopilot.finalReinvestmentAction = () => null;
  autopilot.formationAction = () => null;
  autopilot.searchRescueLineup = () => false;
  autopilot.setEnabled(true);
  assert.equal(autopilot.tick(1000), null);

  const actions = [];
  for (let step = 0; step < 90 && bridge.engine.state.phase === "preparation"; step += 1) {
    const action = autopilot.tick(2000 + step * 500);
    if (action) actions.push(action);
  }
  assert.equal(actions.filter((action) => action.type === "reroll").length, 60);
  assert.equal(bridge.engine.state.gold, 45);
  assert.equal(actions.at(-1)?.type, "battle");
});

test("终局集中搜牌只在高额存款安全窗口开启", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  const bridge = new EngineBridge(13062);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 20;
  bridge.engine.state.hp = 20;
  bridge.engine.state.gold = 120;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130620 + index, id, star: 3 };
  });
  const terminalId = AUTOPILOT_TERMINAL_TARGET_IDS.find((id) => !financeIds.includes(id));
  assert.ok(terminalId);
  bridge.engine.state.shop = [terminalId, null, null, null, null];
  const autopilot = new AutoChessAutopilot(bridge, "heuristic", {
    terminalRollDownActivationGold: 128,
    terminalRollDownReserveGold: 48,
  });
  autopilot.rolloutConfidence = () => 10400;
  autopilot.resetPreparation(20);
  bridge.engine.state.gold = 60;
  assert.equal(autopilot.terminalRollDownActive(autopilot.ownedEntries(), 10400), false);
  assert.equal(
    autopilot.shopCandidates(autopilot.ownedEntries(), false).some(({ id }) => id === terminalId),
    false,
  );
  bridge.engine.state.gold = 135;
  autopilot.resetPreparation(20);
  assert.equal(autopilot.terminalRollDownActive(autopilot.ownedEntries(), 10400), true);
  assert.equal(autopilot.terminalRollDownActive(autopilot.ownedEntries(), 9900), false);
});

test("三种风格在安全高额存款时都会正常转向终局项目", () => {
  for (const [style, gold] of [["balanced", 165], ["highroll", 125]]) {
    const { bridge, autopilot } = makeLateSeerCase(
      [null, null, null, null, null],
      [],
      24,
      style,
    );
    bridge.engine.state.hp = 13;
    bridge.engine.state.gold = gold;
    autopilot.rolloutConfidence = () => 10400;
    autopilot.resetPreparation(24);
    assert.equal(
      autopilot.terminalRollDownActive(autopilot.ownedEntries(), 10400),
      true,
      `${style} should use surplus cash without requiring four finance units`,
    );
  }

  const { bridge, autopilot } = makeLateSeerCase(
    [null, null, null, null, null],
    [],
    24,
    "survival",
  );
  bridge.engine.state.hp = 20;
  bridge.engine.state.gold = 220;
  autopilot.rolloutConfidence = () => 10400;
  autopilot.resetPreparation(24);
  assert.equal(
    autopilot.terminalRollDownActive(autopilot.ownedEntries(), 10400),
    true,
    "survival should transition once the current board is safe and cash is abundant",
  );
  bridge.engine.state.hp = 16;
  autopilot.resetPreparation(24);
  assert.equal(autopilot.terminalRollDownActive(autopilot.ownedEntries(), 10400), false);
});

test("多个六份终局项目会在较低存款触发冲刺并在下一回合停搜", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  const projectIds = AUTOPILOT_TERMINAL_TARGET_IDS
    .filter((id) => !financeIds.includes(id))
    .slice(0, 2);
  assert.equal(projectIds.length, 2);
  const bridge = new EngineBridge(13064);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 24;
  bridge.engine.state.hp = 20;
  bridge.engine.state.gold = 108;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130650 + index, id, star: 3 };
  });
  projectIds.forEach((id, projectIndex) => {
    bridge.engine.state.bench[projectIndex * 2] = {
      uid: 130660 + projectIndex * 2,
      id,
      star: 2,
    };
    bridge.engine.state.bench[projectIndex * 2 + 1] = {
      uid: 130661 + projectIndex * 2,
      id,
      star: 2,
    };
  });
  const autopilot = new AutoChessAutopilot(bridge, "heuristic", {
    terminalRollDownActivationGold: 128,
    terminalRollDownReserveGold: 48,
    terminalCompletionMinimumProjects: 2,
    terminalCompletionActivationGold: 104,
    terminalCompletionReserveGold: 16,
  });
  autopilot.rolloutConfidence = () => 10400;
  autopilot.resetPreparation(24);
  assert.equal(autopilot.terminalRollDownActive(autopilot.ownedEntries(), 10400), true);
  assert.equal(autopilot.terminalRollDownReserve(autopilot.ownedEntries(), 10400), 16);

  bridge.engine.state.gold = 60;
  autopilot.resetPreparation(25);
  assert.equal(autopilot.terminalRollDownActive(autopilot.ownedEntries(), 10400), false);
});

test("终局商店优先完成已有六份的三星项目", () => {
  const financeIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].traits.includes("finance")).slice(0, 4);
  const nonFinanceTargets = AUTOPILOT_TERMINAL_TARGET_IDS.filter((id) => !financeIds.includes(id));
  const freshTarget = nonFinanceTargets[0];
  const focusedTarget = nonFinanceTargets.at(-1);
  assert.ok(freshTarget && focusedTarget && freshTarget !== focusedTarget);
  const bridge = new EngineBridge(13063);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.round = 20;
  bridge.engine.state.hp = 20;
  bridge.engine.state.gold = 135;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  financeIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130630 + index, id, star: 3 };
  });
  bridge.engine.state.bench[0] = { uid: 130640, id: focusedTarget, star: 2 };
  bridge.engine.state.bench[1] = { uid: 130641, id: focusedTarget, star: 2 };
  bridge.engine.state.shop = [freshTarget, focusedTarget, null, null, null];
  const autopilot = new AutoChessAutopilot(bridge, "heuristic");
  autopilot.rolloutConfidence = () => 10400;
  autopilot.resetPreparation(20);
  const candidates = autopilot.shopCandidates(autopilot.ownedEntries(), false);
  const fresh = candidates.find(({ id }) => id === freshTarget);
  const focused = candidates.find(({ id }) => id === focusedTarget);
  assert.ok(fresh && focused);
  assert.ok(focused.score > fresh.score);
});

test("新手和老手不运行隐藏战斗，只有长考产生 rollout miss", () => {
  const makePilot = (seed, level, scorer) => {
    const bridge = new EngineBridge(seed, 1, { simulation: true, battleStepHz: 60 });
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.board.fill(null);
    ["mossback", "gale_archer", "grove_mender"].forEach((id, index) => {
      bridge.engine.state.board[index] = { uid: seed * 10 + index, id, star: 1 };
    });
    const pilot = new AutoChessAutopilot(
      bridge,
      "evolution",
      {},
      "balanced",
      "normal",
      20,
      scorer,
      true,
      level,
    );
    return { bridge, pilot };
  };

  let noviceModelCalls = 0;
  const novice = makePilot(991001, "novice", () => {
    noviceModelCalls += 1;
    return 10;
  });
  const beforeNovice = getAutopilotRolloutCacheStats().misses;
  const noviceRoster = novice.pilot.ownedEntries();
  novice.pilot.rolloutTargetLineup(noviceRoster);
  novice.pilot.rolloutLineupScore(noviceRoster);
  assert.equal(getAutopilotRolloutCacheStats().misses, beforeNovice);
  assert.equal(noviceModelCalls, 0);
  assert.equal(novice.pilot.chooseStarter(["blaze", "bastion"]), "bastion");

  let veteranModelCalls = 0;
  const veteran = makePilot(991002, "veteran", () => {
    veteranModelCalls += 1;
    return 2.5;
  });
  const beforeVeteran = getAutopilotRolloutCacheStats().misses;
  const veteranRoster = veteran.pilot.ownedEntries();
  veteran.pilot.rolloutTargetLineup(veteranRoster);
  assert.equal(veteran.pilot.rolloutLineupScore(veteranRoster), 10250);
  assert.equal(getAutopilotRolloutCacheStats().misses, beforeVeteran);
  assert.ok(veteranModelCalls > 0);
  assert.equal(veteran.pilot.shouldAuditLiveBattle(), false);
  assert.equal(veteran.bridge.autoplayPreferenceStyle, "balanced");
  assert.equal(veteran.bridge.autoplayThinkingLevel, "veteran");
  assert.equal(veteran.bridge.autoplayInformationMode, "normal");

  const deep = makePilot(991003, "deep", () => 2.5);
  const beforeDeep = getAutopilotRolloutCacheStats().misses;
  deep.pilot.rolloutTargetLineup(deep.pilot.ownedEntries());
  assert.equal(getAutopilotRolloutCacheStats().misses, beforeDeep);
  deep.pilot.exactLineupSearchRequested = true;
  deep.pilot.rolloutTargetLineup(deep.pilot.ownedEntries());
  assert.ok(getAutopilotRolloutCacheStats().misses > beforeDeep);
});

test("风格独立控制经济策略，等级独立控制信息和有效算法", () => {
  assert.equal(effectiveStyleForAutopilotConfiguration("survival", "veteran"), "survival");
  assert.equal(effectiveStyleForAutopilotConfiguration("highroll", "oracle"), "highroll");
  assert.equal(informationModeForAutopilotThinkingLevel("veteran"), "normal");
  assert.equal(informationModeForAutopilotThinkingLevel("oracle"), "oracle");

  const bridge = new EngineBridge(991004, 1, { simulation: true });
  bridge.setConsoleLogging(false);
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => 0,
    true,
    "veteran",
  );
  pilot.setConfiguration("survival", "oracle");
  assert.equal(pilot.strategyPreferenceStyle, "survival");
  assert.equal(pilot.strategyThinkingLevel, "oracle");
  assert.equal(pilot.strategyStyle, "survival");
  assert.equal(pilot.strategyInformationMode, "oracle");
  assert.equal(pilot.policy.safeWinRolloutScore, 10050);
  pilot.setConfiguration("highroll", "novice");
  assert.equal(pilot.strategyStyle, "highroll");
  assert.equal(pilot.strategyInformationMode, "normal");
  assert.equal(pilot.policy.reserveCap, resolveAutopilotStylePolicy("highroll").reserveCap);
});

test("四档能力预算严格递增且只有看穿读取未来", () => {
  const novice = AUTOPILOT_THINKING_BUDGETS.novice;
  const veteran = AUTOPILOT_THINKING_BUDGETS.veteran;
  const deep = AUTOPILOT_THINKING_BUDGETS.deep;
  const oracle = AUTOPILOT_THINKING_BUDGETS.oracle;
  assert.deepEqual([novice.rank, veteran.rank, deep.rank, oracle.rank], [0, 1, 2, 3]);
  assert.equal(novice.modelEnabled, false);
  assert.equal(novice.rolloutVariants, 0);
  assert.equal(novice.coarseRolloutCandidates, 0);
  assert.equal(veteran.modelEnabled, true);
  assert.equal(veteran.rolloutVariants, 0);
  assert.equal(veteran.coarseRolloutCandidates, 0);
  assert.equal(deep.rolloutVariants, 1);
  assert.ok(deep.coarseRolloutCandidates > 0);
  assert.ok(deep.exactRolloutCandidates > 0);
  assert.equal(deep.futureShopLookahead, 0);
  assert.equal(deep.futureCombatHorizon, 0);
  assert.equal(oracle.rolloutVariants, deep.rolloutVariants);
  assert.ok(oracle.coarseRolloutCandidates > deep.coarseRolloutCandidates);
  assert.ok(oracle.exactRolloutCandidates > deep.exactRolloutCandidates);
  assert.ok(oracle.futureShopLookahead > 0);
  assert.equal(oracle.futureCombatHorizon, 6);
});

test("现代看穿按回合逐步扩展商店与敌人窗口", () => {
  assert.deepEqual(oraclePlanningWindowForRound(1), {
    futureShopLookahead: 16,
    futureCombatHorizon: 1,
  });
  assert.deepEqual(oraclePlanningWindowForRound(4), {
    futureShopLookahead: 32,
    futureCombatHorizon: 2,
  });
  assert.deepEqual(oraclePlanningWindowForRound(7), {
    futureShopLookahead: 64,
    futureCombatHorizon: 3,
  });
  assert.deepEqual(oraclePlanningWindowForRound(10), {
    futureShopLookahead: 96,
    futureCombatHorizon: 4,
  });
  assert.deepEqual(oraclePlanningWindowForRound(13), {
    futureShopLookahead: 128,
    futureCombatHorizon: 6,
  });
});

test("现代看穿退出旧宏路线并在启用首轮扩大当前战预算", () => {
  const bridge = new EngineBridge(9910041, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 7;
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => 0,
    true,
    "oracle",
  );
  const observedLookaheads = [];
  pilot.goPlanningTargets = (_roster, futureShops) => {
    observedLookaheads.push(futureShops.length);
    return [];
  };

  assert.equal(pilot.usesOraclePlanner(), false);
  pilot.setEnabled(true);
  assert.equal(pilot.thinkingBudget().exactRolloutCandidates, 6);
  assert.equal(pilot.rescueThinkingBudget().exactRolloutCandidates, 6);
  pilot.resetPreparation(7);
  assert.equal(pilot.seerPlan, null);
  assert.deepEqual(observedLookaheads, [64]);
  bridge.engine.state.round = 8;
  assert.equal(pilot.thinkingBudget().exactRolloutCandidates, 4);
  assert.equal(pilot.rescueThinkingBudget().exactRolloutCandidates, 2);
  bridge.engine.state.round = 18;
  assert.equal(pilot.oracleExpandedSearchActive(), true);
  assert.equal(pilot.oracleWideSearchActive(), false);
  assert.equal(pilot.rescueThinkingBudget().exactRolloutCandidates, 2);
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.gold = 100;
  assert.equal(pilot.oracleWideSearchActive(), true);
  assert.equal(pilot.rescueThinkingBudget().exactRolloutCandidates, 4);
});

test("现代看穿的首轮精确候选全败时会扩大到看穿预算", () => {
  const bridge = new EngineBridge(99100412, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 7;
  bridge.engine.state.playerLevel = 3;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  SHOP_UNITS.slice(0, 7).forEach((id, index) => {
    const unit = { uid: 991004120 + index, id, star: index < 2 ? 2 : 1 };
    if (index < 3) bridge.engine.state.board[index] = unit;
    else bridge.engine.state.bench[index - 3] = unit;
  });
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => 0,
    true,
    "oracle",
  );
  let exactCalls = 0;
  pilot.exactLineupSearchRequested = true;
  pilot.rolloutLineupScore = (_lineup, _formation, stableOnly, combatHz) => {
    if (stableOnly && combatHz === 60) exactCalls += 1;
    return -100;
  };

  const lineup = pilot.rolloutTargetLineup(pilot.ownedEntries());

  assert.equal(lineup.length, 3);
  assert.ok(
    exactCalls >= AUTOPILOT_THINKING_BUDGETS.deep.exactRolloutCandidates
      + AUTOPILOT_THINKING_BUDGETS.oracle.exactRolloutCandidates,
  );
});

test("现代看穿精算全败后会从完整阵容池救回非局部胜解", () => {
  const bridge = new EngineBridge(99100413, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 17;
  bridge.engine.state.hp = 5;
  bridge.engine.state.playerLevel = 4;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  Array.from({ length: 8 }, (_, index) => SHOP_UNITS[index % 4]).forEach((id, index) => {
    const unit = { uid: 991004130 + index, id, star: index < 4 ? 3 : 1 };
    if (index < 4) bridge.engine.state.board[index] = unit;
    else bridge.engine.state.bench[index - 4] = unit;
  });
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => 0,
    true,
    "oracle",
  );
  const initialBoard = pilot.ownedEntries().filter(({ location }) => location.zone === "board");
  bridge.engine.state.board.fill(null);
  goCanonicalFormationPlacements(initialBoard).forEach(({ entry, slot }) => {
    bridge.engine.state.board[slot] = entry.unit;
  });
  const current = pilot.ownedEntries().filter(({ location }) => location.zone === "board");
  const winningUids = new Set(
    pilot.ownedEntries()
      .filter(({ location }) => location.zone === "bench")
      .map(({ unit }) => unit.uid),
  );
  const winningCount = (lineup) => lineup
    .filter(({ unit }) => winningUids.has(unit.uid)).length;
  pilot.exactLineupSearchRequested = true;
  pilot.plannedLineupScore = -100;
  pilot.rolloutTargetLineup = () => current;
  pilot.rolloutConfidence = () => -100;
  pilot.goModelScore = (lineup) => (
    winningCount(lineup) === 4 ? 1000 : 100 - winningCount(lineup) * 100
  );
  pilot.rolloutLineupScore = (lineup) => (
    winningCount(lineup) === 4 ? 10100 : -100
  );

  assert.equal(pilot.searchRescueLineup(pilot.ownedEntries()), true);
  assert.deepEqual(new Set(pilot.plannedLineupUids), winningUids);
  assert.equal(pilot.plannedLineupScore, 10100);
});

test("现代看穿在线终局候选池过宽时不会重新穷举完整阵容", () => {
  const bridge = new EngineBridge(99100414, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 47;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  SHOP_UNITS.slice(0, 18).forEach((id, index) => {
    const unit = { uid: 991004140 + index, id, star: 3 };
    if (index < 10) bridge.engine.state.board[index] = unit;
    else bridge.engine.state.bench[index - 10] = unit;
  });
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "normal",
    20,
    () => 0,
    true,
    "oracle",
    true,
  );
  pilot.exactLineupSearchRequested = true;
  pilot.plannedLineupScore = -100;
  pilot.rolloutLineupScore = () => {
    throw new Error("oversized interactive rescue pool must remain bounded");
  };

  assert.equal(pilot.searchRescueLineup(pilot.ownedEntries()), false);
  assert.equal(pilot.rescueSearchCompleted, true);
});

test("长考和看穿不会为未成三星的新项目卖掉唯一三星成品", () => {
  for (const thinkingLevel of ["deep", "oracle"]) {
    const bridge = new EngineBridge(9910045, 1, { simulation: true, battleStepHz: 60 });
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.round = 41;
    bridge.engine.state.playerLevel = 10;
    bridge.engine.state.gold = 180;
    bridge.engine.state.board.fill(null);
    bridge.engine.state.bench.fill(null);
    const candidateId = "mumu";
    const completedIds = SHOP_UNITS.filter((id) => id !== candidateId).slice(0, 18);
    completedIds.slice(0, 10).forEach((id, index) => {
      bridge.engine.state.board[index] = { uid: 9910100 + index, id, star: 3 };
    });
    completedIds.slice(10).forEach((id, index) => {
      bridge.engine.state.bench[index] = { uid: 9910200 + index, id, star: 3 };
    });
    bridge.engine.state.shop = [candidateId, null, null, null, null];
    const pilot = new AutoChessAutopilot(
      bridge,
      "evolution",
      {},
      "balanced",
      "normal",
      20,
      () => 0,
      true,
      thinkingLevel,
    );
    pilot.shopCandidates = () => [{
      index: 0,
      id: candidateId,
      score: 1_000,
      speculative: false,
      advancesFinance: false,
      targetDuplicate: true,
      completesMerge: false,
      completesTrait: false,
      clearUpgrade: false,
      lateGamePriority: 100,
    }];
    pilot.rolloutConfidence = () => 9_000;
    pilot.rolloutTargetLineup = (roster) => roster.slice(0, 10);
    pilot.previewRosterRollout = () => 11_000;

    assert.equal(pilot.replacementAction(pilot.ownedEntries()), null);
    const expendable = pilot.expendableInterestEntries(
      pilot.ownedEntries(),
      pilot.ownedEntries().slice(0, 10),
    );
    assert.equal(expendable.some(({ unit }) => unit.star === 3), false);
  }
});

test("现代看穿满席时只为预算内可执行的未来购买刷新", () => {
  const bridge = new EngineBridge(9910046, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 48;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.gold = 500;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  const candidateId = "mumu";
  SHOP_UNITS.filter((id) => id !== candidateId).slice(0, 18).forEach((id, index) => {
    const unit = { uid: 9910300 + index, id, star: 3 };
    if (index < 10) bridge.engine.state.board[index] = unit;
    else bridge.engine.state.bench[index - 10] = unit;
  });
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => 0,
    true,
    "oracle",
  );
  pilot.shopCandidates = () => bridge.engine.state.shop.includes(candidateId)
    ? [{
      index: 0,
      id: candidateId,
      score: 1_000,
      speculative: false,
      advancesFinance: false,
      targetDuplicate: true,
      completesMerge: false,
      completesTrait: false,
      clearUpgrade: false,
      lateGamePriority: 100,
    }]
    : [];
  bridge.engine.previewFutureShops = (lookahead) => Array.from(
    { length: lookahead },
    (_, index) => [index === 5 ? candidateId : null, null, null, null, null],
  );

  const roster = pilot.ownedEntries();
  assert.equal(pilot.oracleHasFutureCandidate(roster, 12), false);
  bridge.engine.state.bench[7] = { uid: 9910400, id: SHOP_UNITS.at(-1), star: 1 };
  assert.equal(pilot.oracleHasFutureCandidate(pilot.ownedEntries(), 4), false);
  assert.equal(pilot.oracleHasFutureCandidate(pilot.ownedEntries(), 6), true);
});

test("交互看穿终局不重复运行无界全组合救援", () => {
  const bridge = new EngineBridge(9910047, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 63;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.hp = 4;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  SHOP_UNITS.slice(0, 18).forEach((id, index) => {
    const unit = { uid: 9910500 + index, id, star: 3 };
    if (index < 10) bridge.engine.state.board[index] = unit;
    else bridge.engine.state.bench[index - 10] = unit;
  });
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => 0,
    true,
    "oracle",
    true,
  );
  pilot.exactLineupSearchRequested = true;
  pilot.rolloutLineupScore = () => {
    throw new Error("interactive late rescue must reuse the bounded exact selector");
  };

  assert.equal(pilot.searchRescueLineup(pilot.ownedEntries()), false);
  assert.equal(pilot.rescueSearchCompleted, true);
});

test("现代看穿用小模型批量查看渐进敌人窗口", () => {
  const bridge = new EngineBridge(9910042, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 7;
  bridge.engine.state.board[0] = { uid: 99100420, id: SHOP_UNITS[0], star: 1 };
  let modelCalls = 0;
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => {
      modelCalls += 1;
      return modelCalls;
    },
    true,
    "oracle",
  );
  pilot.oracleFutureModelScore(pilot.ownedEntries(), "go_canonical");
  assert.equal(modelCalls, 3);
});

test("浏览器托管通过 Worker 推演并显示非阻塞思考状态", () => {
  assert.match(hostSource, /AutoChessAutopilotWorkerClient/);
  assert.doesNotMatch(hostSource, /new AutoChessAutopilot\s*\(/);
  assert.match(workerClientSource, /new Worker\s*\(/);
  assert.match(workerClientSource, /autopilot\.worker\.ts/);
  assert.match(workerClientSource, /type: "prewarm"/);
  assert.match(workerClientSource, /snapshot: initial \?/);
  assert.match(workerClientSource, /"prewarm"/);
  assert.match(workerSource, /AutopilotWorkerRuntime/);
  assert.match(workerSource, /runtime\.prewarm/);
  assert.match(hostSource, /rift-autopilot-thinking/);
  assert.match(hostSource, /下一回合预演中/);
  assert.match(hudStyles, /rift-autopilot-spin/);
});

test("战斗中首次开启看穿把扩大预算留给下一次整备", () => {
  const bridge = new EngineBridge(9910043, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.round = 7;
  bridge.engine.state.phase = "battle";
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    undefined,
    true,
    "oracle",
  );
  pilot.setEnabled(true);
  assert.equal(pilot.oracleActivationRound, 8);

  pilot.setEnabled(false);
  bridge.engine.state.phase = "preparation";
  pilot.setEnabled(true);
  assert.equal(pilot.oracleActivationRound, 7);
});

test("Worker 战斗预热按续片运行且不向真实对局派发操作", () => {
  const bridge = new EngineBridge(9910044, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.dispatch({ type: "starter", id: "bastion" });
  bridge.dispatch({ type: "battle" });
  assert.equal(bridge.engine.state.phase, "battle");
  const liveSnapshot = bridge.engine.getSimulationSnapshot();
  const liveElapsed = bridge.engine.state.battle?.elapsed;
  const runtime = new AutopilotWorkerRuntime();
  const baseRequest = {
    type: "prewarm",
    now: 1000,
    enabled: true,
    configuration: { style: "balanced", level: "deep" },
    prewarmKey: "9910044/round-1/deep",
    expandOracleOnTargetRound: false,
  };
  const first = runtime.prewarm({
    ...baseRequest,
    id: 1,
    snapshot: liveSnapshot,
  });
  assert.equal(first.type, "prewarmed");
  assert.equal(first.targetRound, 2);
  assert.equal(first.error, undefined);
  assert.equal("action" in first, false);
  assert.equal(bridge.engine.state.phase, "battle");
  assert.equal(bridge.engine.state.battle?.elapsed, liveElapsed);

  let continuation = runtime.prewarm({
    ...baseRequest,
    id: 2,
    now: 3400,
    snapshot: null,
  });
  assert.equal(continuation.type, "prewarmed");
  assert.equal(continuation.error, undefined);
  assert.equal("action" in continuation, false);
  assert.equal(bridge.engine.state.phase, "battle");

  let chunks = 2;
  while (!continuation.complete && chunks < 130) {
    chunks += 1;
    continuation = runtime.prewarm({
      ...baseRequest,
      id: chunks,
      now: 1000 + chunks * 2400,
      snapshot: null,
    });
    assert.equal(continuation.error, undefined);
    assert.equal("action" in continuation, false);
  }
  assert.equal(continuation.complete, true);
  assert.ok(continuation.simulatedActions > 0);
  assert.ok(chunks < 130);
  assert.equal(bridge.engine.state.phase, "battle");
});

test("三种风格用不同风险分位且不改变看穿能力", () => {
  const samples = [300, 100, 200];
  assert.equal(aggregateAutopilotRolloutScores(samples, "survival"), 100);
  assert.equal(aggregateAutopilotRolloutScores(samples, "balanced"), 200);
  assert.equal(aggregateAutopilotRolloutScores(samples, "highroll"), 300);
});

test("现代看穿从全棋池选择项目并能追四时小路", () => {
  const bridge = new EngineBridge(991005, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 18;
  bridge.engine.state.playerLevel = 10;
  bridge.engine.state.gold = 100;
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  bridge.engine.state.shop = Array(5).fill("komichi");
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "highroll",
    "normal",
    20,
    () => 0,
    true,
    "oracle",
  );
  pilot.goCompletedUnitModelGain = (_roster, id) => (id === "komichi" ? 5 : -5);
  const futureShops = [["komichi", "komichi", "komichi", "komichi", null]];
  const targets = pilot.seer2PlanningTargets(pilot.ownedEntries(), futureShops);
  assert.equal(pilot.usesLearnedCombatPlanner(), true);
  assert.equal(pilot.usesSeer2Foundation(), false);
  assert.equal(targets[0]?.id, "komichi");
  assert.equal(pilot.targetDesiredCopies("komichi"), 3);
  bridge.engine.state.round = 20;
  assert.equal(pilot.targetDesiredCopies("komichi"), 9);
  assert.equal(pilot.strategyPreferenceStyle, "highroll");
  assert.equal(pilot.policy.woundedHpThreshold, 10);
});

test("rollout 缓存快照支持按前缀限量读取", () => {
  const prefix = "test-modern-autopilot-cache/";
  hydrateAutopilotRolloutCache([
    [`${prefix}1`, 1],
    [`${prefix}2`, 2],
    [`${prefix}3`, 3],
  ]);
  assert.deepEqual(
    snapshotAutopilotRolloutCache({ prefix, limit: 2 }),
    [[`${prefix}2`, 2], [`${prefix}3`, 3]],
  );
});

test("标题页和局内都公开托管选择，设置面板分离风格与等级并隐藏研究模式", () => {
  assert.match(hudSource, /亲自指挥/);
  assert.match(hudSource, /AI 观战/);
  assert.match(hudSource, /由 AI 自选协议并开局/);
  assert.match(hudSource, /rift-mobile-session-controls/);
  assert.match(hostSource, /后台继续战斗/);
  assert.match(hostSource, /托管风格/);
  assert.match(hostSource, /\["survival", "稳健"\]/);
  assert.match(hostSource, /\["balanced", "平衡"\]/);
  assert.match(hostSource, /\["highroll", "搏上限"\]/);
  assert.match(hostSource, /\["novice", "新手"\]/);
  assert.match(hostSource, /\["veteran", "老手"\]/);
  assert.match(hostSource, /\["deep", "长考"\]/);
  assert.match(hostSource, /\["oracle", "看穿"\]/);
  assert.doesNotMatch(hostSource, /Go测试|研究模式/);
  assert.match(hostSource, /stored\?\.style === "go"/);
  assert.match(hostSource, /stored\?\.version >= 3 \? "go" : "oracle"/);
  assert.doesNotMatch(hostSource, /\["fair", "实战"\]/);
  assert.match(hostSource, /AUTOPILOT_STRATEGY_VERSION = 6/);
  assert.match(hostSource, /style: "balanced",\s*level: "veteran"/);
  assert.match(hostSource, /stored\?\.style === "fair".*stored\?\.style === "balanced".*level: "deep"/s);
  assert.match(hostSource, /GO_ROLLOUT_PERSIST_LIMIT = 5_000/);
  assert.match(hostSource, /snapshotAutopilotRolloutCache\(\{\s*prefix: goKeyPrefix/s);
  assert.doesNotMatch(hostSource, /天眼商店/);
  assert.match(hostSource, /role="radiogroup"/);
  assert.match(hostSource, /AUTOPILOT_STRATEGY_KEY/);
  assert.match(hostSource, /BACKGROUND_BATTLE_KEY/);
  assert.match(hostSource, /bridge\.updateBackground\(\)/);
});

test("桌面工具栏公开音量控制，版本入口归入设置且移动端保留音频设置", () => {
  const toolbarStart = hostSource.indexOf('className="rift-toolbar"');
  const toolbarEnd = hostSource.indexOf("ref={gameHostRef}", toolbarStart);
  const toolbarSource = hostSource.slice(toolbarStart, toolbarEnd);

  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
  assert.match(toolbarSource, /rift-toolbar-audio/);
  assert.match(toolbarSource, /aria-label="音乐音量"/);
  assert.match(toolbarSource, /aria-label="音效音量"/);
  assert.doesNotMatch(toolbarSource, /setReleaseOpen\(true\)/);
  assert.match(hostSource, /className="rift-setting-version"/);
  assert.match(hostSource, /版本与更新/);
  assert.match(hostSource, /setSettingsOpen\(false\); setReleaseOpen\(true\)/);
  assert.match(hostSource, /rift-setting-audio-mobile/);
  assert.match(hudStyles, /\.rift-setting-audio-mobile \{ display: none; \}/);
  assert.match(hudStyles, /\.rift-setting-audio-mobile \{ display: flex; \}/);
});
