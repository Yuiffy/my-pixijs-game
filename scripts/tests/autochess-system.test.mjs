import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { RUN_SAVE_KEY, RunSaveStore } = await loadTypescriptModule("src/components/autoChessGame/core/engine/runSave.ts");
const { previewTraitAddition } = await loadTypescriptModule("src/components/autoChessGame/core/rosterPlanning.ts");
const { AutoChessAIController } = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAI.ts");
const { AUGMENTS } = await loadTypescriptModule("src/components/autoChessGame/core/gameData.ts");
const memoryStorage = () => {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
};
const create = (storage = memoryStorage(), seed = 90601) => {
  const bridge = new EngineBridge(seed);
  bridge.setConsoleLogging(false);
  bridge.attachRunStorage(storage);
  return bridge;
};
const start = bridge => bridge.dispatch({ type: "starter", id: bridge.engine.state.starterChoices[0] });
const finishBattle = bridge => {
  for (let step = 0; step < 12000 && bridge.engine.state.phase === "battle"; step += 1) bridge.update(1 / 60);
  assert.equal(bridge.engine.state.phase, "result");
};

test("终关失败且仍有生命，结束远征且不能领取终关天赋或进入无限", () => {
  const storage = memoryStorage();
  const bridge = create(storage, 90616);
  start(bridge);
  bridge.engine.state.round = 16;
  bridge.engine.state.hp = 20;
  bridge.dispatch({ type: "battle" });
  finishBattle(bridge);
  assert.equal(bridge.engine.state.result.won, false);
  assert.ok(bridge.engine.state.hp > 0);
  assert.equal(bridge.engine.resultEndsRun, true);
  bridge.dispatch({ type: "resultContinue" });
  assert.equal(bridge.engine.state.phase, "gameover");
  assert.equal(bridge.engine.state.round, 16);
  assert.equal(bridge.engine.state.endlessUnlocked, false);
  assert.equal(bridge.engine.state.finalWon, false);
  assert.equal(storage.getItem(RUN_SAVE_KEY), null);
  const score = bridge.engine.state.score;
  bridge.dispatch({ type: "resultContinue" });
  bridge.dispatch({ type: "augment", index: 0 });
  assert.equal(bridge.engine.state.score, score);
  assert.equal(bridge.engine.state.phase, "gameover");
});

test("购买、合成再卖出均不能提高成绩或终局资产", () => {
  const bridge = create();
  start(bridge);
  const { engine } = bridge;
  const beforeGold = engine.state.gold;
  const beforeScore = engine.state.score;
  engine.state.shop = ["nori", "nori", "nori", null, null];
  for (let index = 0; index < 3; index += 1) bridge.dispatch({ type: "shop", index });
  const unitIndex = engine.state.board.findIndex(unit => unit?.id === "nori");
  assert.equal(engine.state.board[unitIndex].star, 2);
  bridge.dispatch({ type: "sell", location: { zone: "board", index: unitIndex } });
  assert.equal(engine.state.gold, beforeGold);
  assert.equal(engine.state.score, beforeScore);
});

test("准备阶段续局保留金币、阵容、商店锁定、双随机流和未来商店", () => {
  const storage = memoryStorage();
  const first = create(storage);
  start(first);
  first.dispatch({ type: "shop", index: 0 });
  first.dispatch({ type: "lock" });
  const before = first.engine.getSimulationSnapshot();
  const restored = create(storage, 42);
  assert.equal(restored.engine.state.phase, "title");
  assert.equal(restored.savedRun.phase, "preparation");
  restored.dispatch({ type: "resume" });
  const after = restored.engine.getSimulationSnapshot();
  for (const key of ["gold", "board", "bench", "shop", "shopLocked", "score", "seed", "enemySeed"]) {
    assert.deepEqual(after.state[key], before.state[key], key);
  }
  for (const key of ["uid", "randomState", "shopRandomState", "shopSequenceCounts"]) assert.deepEqual(after[key], before[key], key);
  first.dispatch({ type: "reroll" });
  restored.dispatch({ type: "reroll" });
  assert.deepEqual(restored.engine.state.shop, first.engine.state.shop);
  assert.equal(restored.engine.state.gold, first.engine.state.gold);
});

test("战斗中续局从开战点重演，同一战结算和随机流一致", () => {
  const storage = memoryStorage();
  const first = create(storage, 90603);
  start(first);
  first.dispatch({ type: "battle" });
  first.advance(700);
  assert.equal(first.engine.state.phase, "battle");
  const restored = create(storage);
  assert.equal(restored.savedRun.phase, "battle");
  restored.dispatch({ type: "resume" });
  assert.equal(restored.engine.state.battle.elapsed, 0);
  assert.equal(restored.battlePaused, true);
  restored.setBattlePaused(false);
  finishBattle(first);
  finishBattle(restored);
  assert.deepEqual(restored.engine.state.result, first.engine.state.result);
  assert.equal(restored.engine.state.score, first.engine.state.score);
  assert.equal(restored.engine.getRandomState(), first.engine.getRandomState());
});

test("结算和天赋续局不重发收入、不重抽选项或推进两次", () => {
  const storage = memoryStorage();
  const first = create(storage, 90604);
  start(first);
  first.engine.state.round = 2;
  first.dispatch({ type: "battle" });
  finishBattle(first);
  const result = structuredClone(first.engine.state.result);
  const gold = first.engine.state.gold;
  const restoredResult = create(storage);
  restoredResult.dispatch({ type: "resume" });
  assert.equal(restoredResult.engine.state.phase, "result");
  assert.equal(restoredResult.engine.state.gold, gold);
  assert.deepEqual(restoredResult.engine.state.result, result);
  assert.doesNotThrow(() => restoredResult.renderTextState());
  restoredResult.dispatch({ type: "resultContinue" });
  assert.equal(restoredResult.engine.state.phase, "augment");
  const choices = [...restoredResult.engine.state.augmentChoices];
  const restoredAugment = create(storage);
  restoredAugment.dispatch({ type: "resume" });
  assert.deepEqual(restoredAugment.engine.state.augmentChoices, choices);
  assert.equal(restoredAugment.engine.state.gold, gold);
  restoredAugment.dispatch({ type: "augment", index: 0 });
  assert.equal(restoredAugment.engine.state.round, 3);
  restoredAugment.dispatch({ type: "augment", index: 0 });
  assert.equal(restoredAugment.engine.state.round, 3);
});

test("损坏、旧版本和不可写的存储不会阻断开局", () => {
  const storage = memoryStorage();
  storage.setItem(RUN_SAVE_KEY, "{broken");
  const damaged = create(storage);
  assert.equal(damaged.savedRun, null);
  assert.equal(damaged.saveIssue, "invalid");
  start(damaged);
  assert.equal(damaged.engine.state.phase, "preparation");
  const envelope = JSON.parse(storage.getItem(RUN_SAVE_KEY));
  storage.setItem(RUN_SAVE_KEY, JSON.stringify({ ...envelope, schema: 999 }));
  const incompatible = new RunSaveStore(storage);
  assert.equal(incompatible.load(), null);
  assert.equal(incompatible.issue, "incompatible");
  storage.setItem(RUN_SAVE_KEY, JSON.stringify({ ...envelope, payload: envelope.payload.replace('"gold":', '"invalidGold":') }));
  const corrupted = new RunSaveStore(storage);
  assert.equal(corrupted.load(), null);
  assert.equal(corrupted.issue, "invalid");
  const unavailable = create({ ...memoryStorage(), setItem: () => { throw new Error("quota"); } });
  start(unavailable);
  assert.equal(unavailable.engine.state.phase, "preparation");
  assert.equal(unavailable.saveIssue, "unavailable");
});

test("另启远征覆盖当前存档，重新开始清除旧检查点", () => {
  const storage = memoryStorage();
  const first = create(storage);
  start(first);
  const second = create(storage, 75);
  start(second);
  assert.equal(new RunSaveStore(storage).load().snapshot.state.seed, 75);
  second.dispatch({ type: "restart" });
  assert.equal(second.savedRun, null);
  assert.equal(storage.getItem(RUN_SAVE_KEY), null);
});

test("羁绊购买预览区分升档、重复成员与只能进入替补席", () => {
  const board = Array(24).fill(null);
  ["rift_stalker", "pako", "nightin"].forEach((id, index) => { board[index] = { id, uid: index + 1, star: 1 }; });
  const open = previewTraitAddition(board, "sui_bird", 4).find(entry => entry.id === "mystic");
  assert.deepEqual([open.count, open.nextCount, open.level, open.nextLevel, open.advances, open.deploysImmediately], [3, 4, 1, 2, true, true]);
  const full = previewTraitAddition(board, "sui_bird", 3).find(entry => entry.id === "mystic");
  assert.equal(full.advances, true);
  assert.equal(full.deploysImmediately, false);
  assert.equal(previewTraitAddition(board, "pako", 4).find(entry => entry.id === "mystic").advances, false);
});

test("角色战况忽略无效目标，切换统计或离开战斗时关闭", () => {
  const bridge = create();
  start(bridge);
  bridge.dispatch({ type: "battle" });
  const fid = bridge.engine.state.battle.player[0].fid;
  bridge.inspectFighter("missing");
  assert.equal(bridge.inspectedFighterId, null);
  bridge.inspectFighter(fid);
  assert.equal(bridge.inspectedFighterId, fid);
  bridge.dispatch({ type: "rankingToggle" });
  assert.equal(bridge.inspectedFighterId, null);
  bridge.inspectFighter(fid);
  assert.equal(bridge.engine.state.battle.rankingOpen, false);
  finishBattle(bridge);
  assert.equal(bridge.inspectedFighterId, null);
});

test("无限模式同档仅剩一个新天赋时仍可保存并续局", () => {
  const storage = memoryStorage();
  const first = create(storage);
  start(first);
  first.engine.state.round = 22;
  first.engine.state.endlessUnlocked = true;
  first.engine.state.augments = AUGMENTS.filter(augment => augment.tier === "minor").slice(0, 5).map(augment => augment.id);
  first.dispatch({ type: "battle" });
  finishBattle(first);
  first.dispatch({ type: "resultContinue" });
  assert.equal(first.engine.state.augmentChoices.length, 1);
  const restored = create(storage);
  assert.equal(restored.saveIssue, null);
  restored.dispatch({ type: "resume" });
  assert.deepEqual(restored.engine.state.augmentChoices, first.engine.state.augmentChoices);
});

test("控制台续局入口拒绝无存档或重复恢复，并公开标题页操作", () => {
  const storage = memoryStorage();
  const first = create(storage);
  const freshAi = new AutoChessAIController(first);
  assert.equal(freshAi.continueRun().ok, false);
  start(first);
  const restored = create(storage);
  const ai = new AutoChessAIController(restored);
  assert.ok(ai.help().flow.includes("continueRun()"));
  assert.ok(JSON.parse(restored.renderTextState()).availableActions.some(action => action.includes("继续远征")));
  assert.equal(ai.continueRun().ok, true);
  assert.equal(ai.continueRun().ok, false);
});
