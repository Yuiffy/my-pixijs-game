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
const { AutoChessAutopilot } = await loadTypescriptModule(
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

  assert.equal(ai.version, "0.2.2");
  assert.match(ai.help().indexing, /1-based/);
  assert.ok(ai.help().read.includes("actions(count = 200)"));
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
  assert.equal(textState.version, "0.2.2");
  assert.deepEqual(textState.recentActions, restartedTrace.slice(-12));
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

test("托管以三战真实前瞻选择协议而不是固定偏好", () => {
  const bridge = new EngineBridge(73042);
  bridge.setConsoleLogging(false);
  assert.deepEqual(bridge.engine.state.starterChoices, ["bastion", "traffic_start", "blaze"]);
  const autopilot = new AutoChessAutopilot(bridge);

  assert.equal(autopilot.chooseStarter(), "traffic_start");
  assert.equal(autopilot.startFromTitle(), true);
  assert.equal(bridge.engine.state.starter, "traffic_start");
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
    bridge.engine.state.board[0] = { uid: uid += 1, id: cheapId, star: 3 };
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
  const bankingAutopilot = new AutoChessAutopilot(banked.bridge);
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

test("稳胜阵容会出售一个非目标单卡跨入下一档利息", () => {
  const bridge = new EngineBridge(13032);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  const strongIds = SHOP_UNITS
    .filter((id) => UNIT_DEFS[id].cost >= 4)
    .sort((left, right) => UNIT_DEFS[right].cost - UNIT_DEFS[left].cost)
    .slice(0, 10);
  const cheapIds = SHOP_UNITS.filter((id) => UNIT_DEFS[id].cost === 1 && !strongIds.includes(id));
  assert.ok(cheapIds.length > 1 && strongIds.length === 10);
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
  cheapIds.forEach((id, index) => {
    bridge.engine.state.bench[index] = { uid: uid += 1, id, star: 1 };
  });
  const fillerId = SHOP_UNITS.find((id) => UNIT_DEFS[id].cost === 2 && !strongIds.includes(id));
  assert.ok(fillerId);
  bridge.engine.state.bench[7] = { uid: uid += 1, id: fillerId, star: 1 };
  bridge.engine.state.shop = [null, null, null, null, null];

  const autopilot = new AutoChessAutopilot(bridge);
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
  assert.equal(bridge.engine.state.bench.filter(Boolean).length, 7);
  assert.equal(bridge.engine.state.gold, 5);
  assert.equal(bridge.engine.interestIncome, 1);
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
