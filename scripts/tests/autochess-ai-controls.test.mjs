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
const { SHOP_UNITS, UNIT_DEFS } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);
const hostSource = await readFile("src/components/autoChessGame/PhaserGame.tsx", "utf8");
const hudSource = await readFile("src/components/autoChessGame/RiftHud.tsx", "utf8");
const hudStyles = await readFile("src/components/autoChessGame/RiftHud.css", "utf8");

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

test("相同战局会跨托管实例复用预演，并把天赋计入缓存键", () => {
  const makePilot = (seed, augments = [], battleSeed = seed) => {
    const bridge = new EngineBridge(seed);
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    bridge.engine.state.seed = battleSeed;
    bridge.engine.state.augments = [...augments];
    const pilot = new AutoChessAutopilot(bridge);
    return { pilot, roster: pilot.ownedEntries() };
  };

  const before = getAutopilotRolloutCacheStats();
  const first = makePilot(13136);
  const firstScore = first.pilot.rolloutLineupScore(first.roster, "human_midline");
  const afterFirst = getAutopilotRolloutCacheStats();
  const second = makePilot(13136);
  const secondScore = second.pilot.rolloutLineupScore(second.roster, "human_midline");
  const afterSecond = getAutopilotRolloutCacheStats();
  const differentAugment = makePilot(13136, ["vitality"]);
  differentAugment.pilot.rolloutLineupScore(differentAugment.roster, "human_midline");
  const afterDifferentAugment = getAutopilotRolloutCacheStats();
  const ordered = makePilot(13137, ["vitality", "momentum"]);
  ordered.pilot.rolloutLineupScore(ordered.roster, "human_midline");
  const afterOrdered = getAutopilotRolloutCacheStats();
  const reordered = makePilot(13137, ["momentum", "vitality"]);
  reordered.pilot.rolloutLineupScore(reordered.roster, "human_midline");
  const afterReordered = getAutopilotRolloutCacheStats();
  const crossSeed = makePilot(13138, [], 88138);
  crossSeed.pilot.rolloutLineupScore(crossSeed.roster, "human_midline");
  const afterCrossSeedFirst = getAutopilotRolloutCacheStats();
  const sameBoardsDifferentSeed = makePilot(13139, [], 88138);
  sameBoardsDifferentSeed.pilot.rolloutLineupScore(
    sameBoardsDifferentSeed.roster,
    "human_midline",
  );
  const afterCrossSeedSecond = getAutopilotRolloutCacheStats();
  const differentEnemyBoard = makePilot(13139);
  differentEnemyBoard.pilot.bridge.engine.state.round = 2;
  differentEnemyBoard.pilot.rolloutLineupScore(differentEnemyBoard.roster, "human_midline");
  const afterDifferentBoard = getAutopilotRolloutCacheStats();

  assert.equal(secondScore, firstScore);
  assert.equal(
    afterFirst.hits + afterFirst.misses,
    before.hits + before.misses + 2,
  );
  assert.equal(afterSecond.hits, afterFirst.hits + 2);
  assert.equal(afterDifferentAugment.misses, afterSecond.misses + 2);
  assert.equal(afterOrdered.misses, afterDifferentAugment.misses + 2);
  assert.equal(afterReordered.hits, afterOrdered.hits + 2);
  assert.equal(afterCrossSeedSecond.hits, afterCrossSeedFirst.hits + 2);
  assert.equal(afterDifferentBoard.misses, afterCrossSeedSecond.misses + 2);
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

  bridge.engine.state.board.fill(null);
  expensiveIds.slice(0, bridge.engine.boardCap).forEach((id, index) => {
    bridge.engine.state.board[index] = { uid: uid += 1, id, star: 2 };
  });
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
  const swap = autopilot.tick(2000);

  assert.equal(swap?.type, "move");
  assert.equal(swap?.from.zone, "bench");
  assert.equal(swap?.to.zone, "board");
  assert.ok(bridge.engine.state.board[swap.to.index]);
  assert.equal(originalBoardUids.has(bridge.engine.state.board[swap.to.index].uid), false);
  assert.equal(bridge.engine.state.selected, null);
  assert.doesNotMatch(bridge.engine.state.toast?.text || "", /当前只能上阵/);

  let now = 2000;
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
      healthyPaidRerolls: 10,
      bankRerollInterestTiersAtRisk: tiersAtRisk,
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
    bankRerollInterestTiersAtRisk: 0,
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

test("四理财使用四金币利息档，并在低血量稳血模式扩大可牺牲档数", () => {
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
    criticalPaidRerolls: 20,
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
  assert.equal(rerolls.length, 16);
  assert.equal(bridge.engine.state.gold, 64);
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
    healthyPaidRerolls: 0,
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
  const autopilot = new AutoChessAutopilot(bridge);
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
      ? 10400
      : 10600
  );
  const financeLineup = selectionPilot.rolloutTargetLineup(selectionPilot.ownedEntries());
  assert.equal(financeLineup.length, 4);
  assert.equal(new Set(financeLineup.map(({ unit }) => unit.id)).size, 4);
  assert.ok(financeLineup.every(({ unit }) => UNIT_DEFS[unit.id].traits.includes("finance")));

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

test("标题页和局内都公开托管选择，设置面板公开后台开关", () => {
  assert.match(hudSource, /亲自指挥/);
  assert.match(hudSource, /AI 观战/);
  assert.match(hudSource, /由 AI 自选协议并开局/);
  assert.match(hudSource, /rift-mobile-session-controls/);
  assert.match(hostSource, /后台继续战斗/);
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
