import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { AutoChessAutopilot } = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");
const { SHOP_UNITS } = await loadTypescriptModule("src/components/autoChessGame/core/gameData.ts");

const makeCase = () => {
  const bridge = new EngineBridge(9918048, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const { state } = bridge.engine;
  Object.assign(state, { round: 48, playerLevel: 10, gold: 111, hp: 6 });
  state.board.fill(null);
  state.bench.fill(null);
  SHOP_UNITS.filter(id => id !== "mumu").slice(0, 18).forEach((id, index) => {
    const unit = { uid: 1000 + index, id, star: 3 };
    if (index < 10) state.board[index] = unit;
    else state.bench[index - 10] = unit;
  });
  state.shop = ["mumu", null, null, null, null];
  const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal", 20, () => 0, true, "oracle", true);
  pilot.resetPreparation(48);
  return { bridge, state, pilot };
};

// Controlled combat values test execution gates independently of model quality.
const controlledScores = (pilot, incomingScore, targetStar = 1) => {
  pilot.rolloutTargetLineup = roster => roster.filter(entry => entry.location.zone === "board");
  pilot.goModelScore = lineup => lineup.some(entry => entry.unit.id === "mumu" && entry.unit.star === targetStar) ? 10 : 0;
  pilot.oracleFutureModelScore = lineup => lineup.some(entry => entry.unit.uid === 1017) ? -100 : 1;
  pilot.seerFutureShopForecast = () => [];
  pilot.exactBattleAudit = () => ({ key: "controlled-terminal", score: 9000 });
  pilot.rolloutLineupScore = (lineup, formation, stable, hz) => {
    assert.equal(hz, 60, "terminal decisions must use the live timestep");
    return lineup.some(entry => entry.unit.id === "mumu" && entry.unit.star === targetStar) ? incomingScore : 9000;
  };
};

test("满场满候补三星先复核已有阵容，确定胜利不刷新也不出售", () => {
  const { state, pilot } = makeCase();
  controlledScores(pilot, 11000);
  pilot.rolloutLineupScore = (_lineup, _formation, _stable, hz) => {
    assert.equal(hz, 60);
    return 10020;
  };
  pilot.seerFutureShopForecast = () => { throw new Error("winning roster must not inspect shops"); };
  pilot.exactBattleAudit = () => ({ key: "controlled-win", score: 10020 });
  pilot.rolloutTargetLineup = () => { throw new Error("winning deployed board needs no formation search"); };
  assert.deepEqual(pilot.nextPreparationAction(), { type: "battle" });
  assert.equal(pilot.rerolls, 0);
  assert.equal(state.gold, 111);
  assert.ok(state.bench.every(unit => unit.star === 3));
});

test("满三星败局可出售未来价值最低的闲置三星，买一星配件并保留已验证阵容", () => {
  const { bridge, state, pilot } = makeCase();
  controlledScores(pilot, 11000);
  const sale = pilot.nextPreparationAction();
  assert.deepEqual(sale, { type: "sell", location: { zone: "bench", index: 7 } });
  bridge.dispatch(sale);
  const buy = pilot.nextPreparationAction();
  assert.deepEqual(buy, { type: "shop", index: 0 });
  bridge.dispatch(buy);
  assert.equal(pilot.nextPreparationAction(), null);
  assert.equal(pilot.oracleTerminalProject, null);
  assert.ok(pilot.plannedLineupUids.includes(state.bench[7].uid));
  assert.equal(state.bench[7].id, "mumu");
  assert.equal(state.bench[7].star, 1);
  assert.equal(pilot.rescueLineupLocked, true);
  assert.equal(pilot.exactLineupSearchRequested, true);
  assert.equal(pilot.formationStartedThisPreparation, true, "do not auto-forge a verified one-star accessory");
});

test("只凭模型看好不卖三星、不刷新", () => {
  const { pilot } = makeCase();
  controlledScores(pilot, 8990);
  assert.equal(pilot.nextPreparationAction(), null);
  assert.equal(pilot.finalizingEconomy, true);
  assert.equal(pilot.oracleTerminalProject, null);
  assert.equal(pilot.rerolls, 0);
});

test("只为预算内可完成的三星补件刷新，执行购买解锁与直升后再布阵", () => {
  const { bridge, state, pilot } = makeCase();
  state.gold = 300;
  state.shop.fill(null);
  state.freeRerollCharges = 1;
  controlledScores(pilot, 11000, 3);
  pilot.seerFutureShopForecast = () => [[null, null, null, null, null], ["mumu", null, null, null, null]];
  const first = pilot.nextPreparationAction();
  assert.equal(first.type, "reroll");
  assert.equal(pilot.oracleTerminalProject.rerolls, 1);
  bridge.dispatch(first);
  const second = pilot.nextPreparationAction();
  assert.equal(second.type, "reroll");
  bridge.dispatch(second);
  // Forecast fixture: inject the known target at its predicted cursor.
  state.shop = ["mumu", null, null, null, null];
  assert.equal(pilot.nextPreparationAction().type, "sell");
  bridge.dispatch({ type: "sell", location: { zone: "bench", index: 7 } });
  bridge.dispatch(pilot.nextPreparationAction());
  for (let step = 0; step < 3; step += 1) {
    const action = pilot.nextPreparationAction();
    assert.equal(action.type, "starForge");
    bridge.dispatch(action);
  }
  assert.equal(state.bench[7].star, 3);
  assert.equal(pilot.nextPreparationAction(), null);
  assert.equal(pilot.rescueLineupLocked, true);
  assert.equal(pilot.rerolls, 2);
  assert.equal(pilot.paidRerolls, 1);
});

test("无法承担已验证补件完整费用时不刷新、不卖三星", () => {
  const { state, pilot } = makeCase();
  state.gold = 0;
  state.shop.fill(null);
  controlledScores(pilot, 11000, 3);
  pilot.seerFutureShopForecast = () => [["mumu", null, null, null, null]];
  assert.equal(pilot.nextPreparationAction(), null);
  assert.equal(pilot.oracleTerminalProject, null);
  assert.equal(pilot.rerolls, 0);
});

test("商店被外部操作改变后不为过期项目卖三星", () => {
  const { state, pilot } = makeCase();
  controlledScores(pilot, 11000);
  pilot.oracleTerminalReviewAction(pilot.ownedEntries());
  state.shop.fill(null);
  assert.equal(pilot.continueOracleTerminalProject(pilot.ownedEntries()), null);
  assert.ok(state.bench.every(Boolean));
  assert.equal(pilot.oracleTerminalProject, null);
});

test("验证阵容中仍在候补的三星不会被当作待售闲棋", () => {
  const { pilot } = makeCase();
  controlledScores(pilot, 11000);
  pilot.rolloutTargetLineup = roster => [...roster.slice(0, 9), roster.find(entry => entry.unit.uid === 1017)];
  const sale = pilot.nextPreparationAction();
  assert.equal(sale.type, "sell");
  assert.notEqual(sale.location.index, 7);
});

test("真实调度把已验证的减损换阵落实到棋盘，不被旧的必胜门控撤销", () => {
  const { state, pilot } = makeCase();
  controlledScores(pilot, 9500);
  pilot.setEnabled(true);
  const actions = [];
  for (let step = 0; step < 80 && state.phase === "preparation"; step += 1) {
    const action = pilot.tick(10000 + step * 3000);
    if (action) actions.push(action);
  }
  assert.equal(state.phase, "battle");
  assert.equal(actions.filter(action => action.type === "shop").length, 1);
  assert.equal(actions.filter(action => action.type === "sell").length, 1);
  assert.equal(actions.filter(action => action.type === "reroll").length, 0);
  assert.ok(state.board.some(unit => unit?.id === "mumu" && unit.star === 1));
  assert.equal(pilot.oracleTerminalCommitted, true);
  assert.equal(pilot.exactBattleAuditRejectedKey, "");
});

test("换阵预算失效时保留满席三星并结束项目", () => {
  const { state, pilot } = makeCase();
  controlledScores(pilot, 11000, 3);
  pilot.oracleTerminalReviewAction(pilot.ownedEntries());
  state.gold = 0;
  assert.equal(pilot.continueOracleTerminalProject(pilot.ownedEntries()), null);
  assert.ok(state.bench.every(unit => unit?.star === 3));
  assert.equal(pilot.oracleTerminalProject, null);
});
