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
const { AutoChessAutopilot, getAutopilotRolloutCacheStats } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);
const { informationModeForAutopilotStyle, resolveAutopilotStylePolicy } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/autopilotPolicy.ts",
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
const { SHOP_UNITS, UNIT_DEFS } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);
const hostSource = await readFile("src/components/autoChessGame/PhaserGame.tsx", "utf8");
const hudSource = await readFile("src/components/autoChessGame/RiftHud.tsx", "utf8");
const hudStyles = await readFile("src/components/autoChessGame/RiftHud.css", "utf8");

const makeLateSeerCase = (shop, bench = []) => {
  const bridge = new EngineBridge(13161, 1, { simulation: true, battleStepHz: 20 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const state = bridge.engine.state;
  state.round = 20;
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
    "seer",
    "oracle",
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

test("稳健采用留出验证晋级阈值并保留其他三种风格的风险差异", () => {
  assert.equal(resolveAutopilotStylePolicy("survival").safeWinRolloutScore, 10050);
  assert.equal(resolveAutopilotStylePolicy("balanced").safeWinRolloutScore, 10010);
  assert.equal(resolveAutopilotStylePolicy("highroll").safeWinRolloutScore, 10010);
  assert.equal(resolveAutopilotStylePolicy("seer").safeWinRolloutScore, 10050);
  assert.equal(informationModeForAutopilotStyle("survival"), "normal");
  assert.equal(informationModeForAutopilotStyle("seer"), "oracle");
});

test("非看穿风格前期不把未拥有的终局一星牌塞满候补", () => {
  const bridge = new EngineBridge(13069);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  bridge.engine.state.round = 5;
  bridge.engine.state.playerLevel = 5;
  const transitionIds = SHOP_UNITS.filter((id) => (
    !AUTOPILOT_LATE_GAME_TARGET_IDS.includes(id) && UNIT_DEFS[id].cost >= 4
  )).slice(0, 4);
  assert.equal(transitionIds.length, 4);
  bridge.engine.state.board.fill(null);
  bridge.engine.state.bench.fill(null);
  transitionIds.forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: 130690 + index, id, star: 1 };
  });
  bridge.engine.state.shop = ["xuehui", null, null, null, null];
  bridge.engine.state.gold = 20;
  const autopilot = new AutoChessAutopilot(bridge, "heuristic", {}, "balanced", "normal");
  const candidate = autopilot.shopCandidates(autopilot.ownedEntries(), false);
  const targetCandidate = candidate.find(({ id }) => id === "xuehui");
  assert.ok(targetCandidate);
  assert.equal(targetCandidate.lateGamePriority, 0);
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

test("AI 控制台对象覆盖完整流程并使用 1 起始槽位", () => {
  const bridge = new EngineBridge(90210);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  const ai = new AutoChessAIController(bridge);

  assert.equal(ai.version, "0.2.3");
  assert.match(ai.help().indexing, /1-based/);
  assert.ok(ai.help().read.includes("actions(count = 200)"));
  assert.ok(ai.help().read.includes("battles()"));
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
  assert.equal(textState.version, "0.2.3");
  assert.deepEqual(textState.recentActions, restartedTrace.slice(-12));
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
  assert.match(hostSource, /state\.phase === "result" && event\.key === "Enter"/);
  assert.match(hostSource, /state\.phase === "gameover" && event\.key === "Enter"/);
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
    autoplayStyle: "survival",
    autoplayInformationMode: "normal",
    backgroundBattleEnabled: true,
    pageHidden: true,
  });

  bridge.setHidden(false, 6500);
  assert.equal(bridge.hidden, false);
  assert.ok(battle.elapsed >= 2.49);
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

test("托管以真人中线为种子并让优胜阵容与站位逐代变异", () => {
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
  autopilot.rolloutLineupScore = (lineup, formation) => (
    lineup.filter((entry) => entry.unit.uid >= 4).length * 100
      + (formation === "split_flanks" ? 10 : 0)
  );

  const evolved = autopilot.rolloutTargetLineup(roster);
  assert.deepEqual(evolved.map((entry) => entry.unit.uid).sort(), [3, 4, 5]);
  assert.equal(autopilot.plannedFormation, "human_midline");
  assert.deepEqual(autopilot.lineageUnitIds.sort(), ["shiori", "yua", "yukisyo"]);

  bridge.engine.state.round = 2;
  const nextGeneration = autopilot.rolloutTargetLineup(roster);
  assert.deepEqual(nextGeneration.map((entry) => entry.unit.uid).sort(), [3, 4, 5]);
  assert.equal(autopilot.plannedFormation, "split_flanks");

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
    before.hits + before.misses + 4,
  );
  assert.equal(afterSecond.hits, afterFirst.hits + 4);
  assert.equal(afterDifferentAugment.misses, afterSecond.misses + 4);
  assert.equal(afterOrdered.misses, afterDifferentAugment.misses + 4);
  assert.equal(afterReordered.hits, afterOrdered.hits + 4);
  assert.equal(afterCrossSeedSecond.hits, afterCrossSeedFirst.hits + 3);
  assert.equal(afterCrossSeedSecond.misses, afterCrossSeedFirst.misses + 1);
  assert.equal(afterDifferentBoard.misses, afterCrossSeedSecond.misses + 4);
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
  const candidateId = expensiveIds[3];
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
  const cheapId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 1);
  const candidateId = "sui_bird";
  assert.ok(expensiveIds.length > 0);
  assert.ok(cheapId);
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
      id: expensiveIds[index % expensiveIds.length],
      star: 2,
    };
  }
  bridge.engine.state.bench[0] = { uid: uid += 1, id: cheapId, star: 1 };
  bridge.engine.state.shop = [candidateId, null, null, null, null];
  bridge.engine.state.gold = 3;

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
      star: 2,
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

test("托管刷新前暂购追星素材，刷新结束后仅为提高利息出售未采用升级", () => {
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
  assert.equal(sale?.location.zone, "bench");
  assert.equal(bridge.engine.state.bench.some((unit) => unit?.id === materialId), false);
  assert.equal(bridge.engine.state.gold, 7);
  assert.equal(bridge.engine.interestIncome, 1);
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

test("标题页和局内都公开托管选择，设置面板公开四种风格和后台开关", () => {
  assert.match(hudSource, /亲自指挥/);
  assert.match(hudSource, /AI 观战/);
  assert.match(hudSource, /由 AI 自选协议并开局/);
  assert.match(hudSource, /rift-mobile-session-controls/);
  assert.match(hostSource, /后台继续战斗/);
  assert.match(hostSource, /托管风格/);
  assert.match(hostSource, /看穿/);
  assert.doesNotMatch(hostSource, /看穿2/);
  assert.match(hostSource, /Go测试/);
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
