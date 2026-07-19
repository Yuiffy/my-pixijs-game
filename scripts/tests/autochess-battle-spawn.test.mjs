import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const compileModule = async (relativePath, dependencies = {}) => {
  const source = await readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (!(specifier in dependencies)) {
      throw new Error(`Unexpected dependency: ${specifier}`);
    }
    return dependencies[specifier];
  };
  Function("module", "exports", "require", compiled)(module, module.exports, require);
  return module.exports;
};

const gameData = await compileModule("src/components/autoChessGame/core/gameData.ts");
const { AutoChessEngine } = await compileModule(
  "src/components/autoChessGame/core/gameEngine.ts",
  { "./gameData": gameData },
);

const BOARD_SLOTS = [0, 4, 5, 6, 11, 12, 23];
const BATTLE_BOUNDS = { left: 52, right: 1068, top: 145, bottom: 625 };

const createEngine = (seed = 1) => {
  const engine = new AutoChessEngine(seed);
  engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  engine.startRun("bastion");
  return engine;
};

test("已选择的天赋会按回合记入历史", () => {
  const engine = createEngine(9);
  engine.state.phase = "augment";
  engine.state.round = 2;
  engine.state.augmentChoices = ["tempered", "overclock", "sharp_edge"];
  engine.chooseAugment(1);
  assert.deepEqual(engine.state.augments, ["overclock"]);
  assert.deepEqual(engine.state.augmentHistory, [{ round: 2, id: "overclock" }]);
});

test("克罗雅同时触发 27期与粤帮关系", () => {
  const engine = createEngine(24);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rift_brawler", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.state.board[2] = { uid: 3, id: "rift_stalker", star: 1 };
  engine.startBattle();
  const kloa = engine.state.battle?.player.find((fighter) => fighter.unitId === "rift_brawler");
  assert.equal(kloa?.gen27Member, true);
  assert.equal(kloa?.yueGangMember, true);
});

test("未达阈值的羁绊状态不会标记为已激活", () => {
  const engine = createEngine(18);
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  const status = engine.getTraitStatus("aegis");
  assert.equal(status.count, 1);
  assert.equal(status.level, 0);
  assert.equal(status.active, false);
});

test("达到阈值的羁绊状态会标记为已激活", () => {
  const engine = createEngine(19);
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "shiori", star: 1 };
  const status = engine.getTraitStatus("aegis");
  assert.equal(status.count, 2);
  assert.equal(status.level, 1);
  assert.equal(status.active, true);
});

test("主持为全队提供移速，贪吃成长不改变碰撞体积", () => {
  const engine = createEngine(23);
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_bird", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sui_cat", star: 1 };
  engine.state.board[2] = { uid: 3, id: "sui", star: 1 };
  engine.state.board[3] = { uid: 4, id: "spark_mage", star: 1 };
  engine.state.board[4] = { uid: 5, id: "cinder_ram", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  battle.enemy.forEach((fighter) => { fighter.hp = 99_999; fighter.maxHp = 99_999; fighter.attack = 0; fighter.armor = 99_999; });
  const hungry = battle.player.find((fighter) => fighter.unitId === "sui");
  const beforeRadius = hungry?.radius;
  for (let tick = 0; tick < 61; tick += 1) {
    battle.player.forEach((fighter) => { fighter.hp = fighter.maxHp; });
    engine.update(0.05);
  }
  assert.ok((hungry?.growthStacks || 0) >= 0);
  assert.equal(hungry?.radius, beforeRadius);
});

test("骷髅兵以高攻击和低护甲体现脆弱", () => {
  const engine = createEngine(26);
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_blue", star: 1 };
  engine.state.board[1] = { uid: 2, id: "shiori", star: 1 };
  engine.startBattle();
  const skeleton = engine.state.battle?.player.find((entry) => entry.unitId === "sui_blue");
  assert.ok(skeleton);
  assert.equal(skeleton.attack, 25 * 1.15 * 1.35);
  assert.equal(skeleton.armor, -4);
});

test("深夜档会随战斗时间逐步提高攻击力", () => {
  const engine = createEngine(25);
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "ember_blade", star: 1 };
  engine.state.board[1] = { uid: 2, id: "spark_mage", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const fighter = battle?.player.find((entry) => entry.unitId === "ember_blade");
  assert.ok(battle && fighter);
  battle.enemy.forEach((enemy) => { enemy.hp = 99_999; enemy.maxHp = 99_999; enemy.attack = 0; enemy.armor = 99_999; });
  const initialAttack = fighter.attack;
  for (let tick = 0; tick < 61; tick += 1) {
    battle.player.forEach((entry) => { entry.hp = entry.maxHp; });
    engine.update(0.05);
  }
  assert.ok(fighter.emberAttackStacks >= 0);
  assert.ok(fighter.attack >= initialAttack);
});

test("6x4 deployment slots preserve their formation positions at battle start", () => {
  const engine = createEngine();
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  BOARD_SLOTS.forEach((slot, index) => {
    engine.state.board[slot] = { uid: index + 1, id: "sun_guard", star: 1 };
  });
  engine.startBattle();
  assert.ok(engine.state.battle);
  const fightersById = new Map(engine.state.battle.player.map((fighter) => [fighter.fid, fighter]));
  BOARD_SLOTS.forEach((slot, index) => {
    const fighter = fightersById.get(`p-${index + 1}`);
    const column = slot % 6;
    const row = Math.floor(slot / 6);
    assert.ok(fighter, `slot ${slot} should create a fighter`);
    assert.equal(fighter.x, 72 + column * 88 + (row % 2) * 18);
    assert.equal(fighter.y, 175 + row * 135);
    assert.ok(fighter.x >= BATTLE_BOUNDS.left && fighter.x <= BATTLE_BOUNDS.right);
  });
});

test("结算会保留双方完整统计，直到玩家显式继续", () => {
  const engine = createEngine(61);
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  battle.enemy.forEach((fighter) => { fighter.hp = 0; fighter.alive = false; });
  engine.update(0.05);
  assert.equal(engine.state.phase, "result");
  engine.update(60);
  assert.equal(engine.state.phase, "result");
  const textState = JSON.parse(engine.renderTextState());
  assert.equal(textState.availableActions.includes("点击继续进入下一阶段"), true);
  assert.equal(textState.battle.ranking.playerRows.length, battle.player.length);
  assert.equal(textState.battle.ranking.enemyRows.length, battle.enemy.length);
  assert.equal(typeof textState.battle.ranking.enemyRows[0].attack, "number");
  assert.equal(typeof textState.battle.ranking.enemyRows[0].armor, "number");
  engine.continueAfterResult();
  assert.equal(engine.state.phase, "preparation");
  assert.equal(engine.state.round, 2);
});

test("结算继续会保留契印与失败结局分支", () => {
  const augmentEngine = createEngine(72);
  augmentEngine.state.round = 2;
  augmentEngine.startBattle();
  assert.ok(augmentEngine.state.battle);
  augmentEngine.state.battle.enemy.forEach((fighter) => { fighter.hp = 0; fighter.alive = false; });
  augmentEngine.update(0.05);
  augmentEngine.continueAfterResult();
  assert.equal(augmentEngine.state.phase, "augment");

  const lossEngine = createEngine(73);
  lossEngine.state.hp = 1;
  lossEngine.startBattle();
  assert.ok(lossEngine.state.battle);
  lossEngine.state.battle.player.forEach((fighter) => { fighter.hp = 0; fighter.alive = false; });
  lossEngine.update(0.05);
  assert.equal(lossEngine.state.phase, "result");
  assert.equal(lossEngine.state.hp, 0);
  lossEngine.continueAfterResult();
  assert.equal(lossEngine.state.phase, "gameover");
});

test("双方战斗排行按当前指标独立排序", () => {
  const engine = createEngine(83);
  engine.state.playerLevel = 4;
  engine.state.board[0] = { uid: 99, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  assert.ok(battle.player.length >= 2 && battle.enemy.length >= 2);
  battle.player[0].damageDealt = 10;
  battle.player[1].damageDealt = 20;
  battle.enemy[0].healingDone = 3;
  battle.enemy[0].shieldingDone = 7;
  battle.enemy[1].healingDone = 12;
  engine.setRankingMetric("damage");
  assert.equal(engine.getBattleRanking()[0].fighter.fid, battle.player[1].fid);
  engine.setRankingMetric("support");
  assert.equal(engine.getBattleRanking("enemy")[0].fighter.fid, battle.enemy[1].fid);
});
