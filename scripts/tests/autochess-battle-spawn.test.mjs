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

test("已选择的天赋会按回合记入历史", () => {
  const engine = new AutoChessEngine(9);
  engine.startRun("bastion");
  engine.state.phase = "augment";
  engine.state.round = 2;
  engine.state.augmentChoices = ["tempered", "overclock", "sharp_edge"];

  engine.chooseAugment(1);

  assert.deepEqual(engine.state.augments, ["overclock"]);
  assert.deepEqual(engine.state.augmentHistory, [{ round: 2, id: "overclock" }]);
  engine.state.phase = "augment";
  engine.state.round = 5;
  engine.state.augmentChoices = ["tempered", "sharp_edge", "momentum"];
  engine.chooseAugment(1);

  assert.deepEqual(engine.state.augments, ["overclock", "sharp_edge"]);
  assert.deepEqual(engine.state.augmentHistory, [
    { round: 2, id: "overclock" },
    { round: 5, id: "sharp_edge" },
  ]);
  const textState = JSON.parse(engine.renderTextState());
  assert.deepEqual(textState.augmentHistory, [
    {
      round: 2,
      name: "栞栞书签",
      description: "所有友军开战时额外获得 35 能量。",
    },
    {
      round: 5,
      name: "炽焰磨刃",
      description: "所有友军攻击力提高 15%。",
    },
  ]);
});

test("克罗雅同时触发 27期与粤帮关系", () => {
  const engine = new AutoChessEngine(24);
  engine.startRun("bastion");
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rift_brawler", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.state.board[2] = { uid: 3, id: "rift_stalker", star: 1 };

  assert.equal(engine.getActiveTraits().find((trait) => trait.id === "gen27")?.level, 1);
  assert.equal(engine.getActiveTraits().find((trait) => trait.id === "yue_gang")?.level, 1);
  engine.startBattle();
  const kloa = engine.state.battle?.player.find((fighter) => fighter.unitId === "rift_brawler");
  assert.equal(kloa?.gen27Member, true);
  assert.equal(kloa?.yueGangMember, true);
});

test("主持为全队提供移速，贪吃成长不改变碰撞体积", () => {
  const engine = new AutoChessEngine(23);
  engine.startRun("bastion");
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_bird", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sui_cat", star: 1 };
  engine.state.board[2] = { uid: 3, id: "sui", star: 1 };
  engine.state.board[3] = { uid: 4, id: "spark_mage", star: 1 };
  engine.state.board[4] = { uid: 5, id: "cinder_ram", star: 1 };

  assert.equal(engine.getActiveTraits().find((trait) => trait.id === "host")?.level, 1);
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const hungry = battle.player.find((fighter) => fighter.unitId === "sui");
  const host = battle.player.find((fighter) => fighter.unitId === "sui_bird");
  const beforeRadius = hungry?.radius;
  assert.equal(hungry?.moveSpeed, 62);
  assert.equal(host?.moveSpeed, 96);
  for (let tick = 0; tick < 61; tick += 1) engine.update(0.05);
  assert.equal(hungry?.growthStacks, 1);
  assert.equal(hungry?.radius, beforeRadius);
});

test("骷髅兵以高攻击和低护甲体现脆弱", () => {
  const engine = new AutoChessEngine(26);
  engine.startRun("bastion");
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_blue", star: 1 };
  engine.state.board[1] = { uid: 2, id: "shiori", star: 1 };
  engine.startBattle();

  const skeleton = engine.state.battle?.player.find((entry) => entry.unitId === "sui_blue");
  assert.ok(skeleton);
  assert.equal(skeleton.attack, 25 * 1.15 * 1.35);
  assert.equal(skeleton.armor, -4);
  assert.equal(skeleton.dodgeChance, 0);
});

test("深夜档会随战斗时间逐步提高攻击力", () => {
  const engine = new AutoChessEngine(25);
  engine.startRun("bastion");
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "ember_blade", star: 1 };
  engine.state.board[1] = { uid: 2, id: "spark_mage", star: 1 };
  engine.startBattle();

  const fighter = engine.state.battle?.player.find((entry) => entry.unitId === "ember_blade");
  assert.ok(fighter);
  const initialAttack = fighter.attack;
  for (let tick = 0; tick < 61; tick += 1) engine.update(0.05);
  assert.equal(fighter.emberAttackStacks, 1);
  assert.equal(fighter.attack, initialAttack * 1.05);
});

test("6x4 deployment slots preserve their formation positions at battle start", () => {
  const engine = new AutoChessEngine(1);
  engine.startRun("bastion");
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);

  BOARD_SLOTS.forEach((slot, index) => {
    engine.state.board[slot] = {
      uid: index + 1,
      id: "sun_guard",
      star: 1,
    };
  });

  engine.startBattle();

  assert.equal(engine.state.phase, "battle");
  assert.ok(engine.state.battle);
  assert.ok(engine.state.battle.player.every((fighter) => fighter.facingX === 1));
  assert.ok(engine.state.battle.enemy.every((fighter) => fighter.facingX === -1));

  const fightersById = new Map(
    engine.state.battle.player.map((fighter) => [fighter.fid, fighter]),
  );

  BOARD_SLOTS.forEach((slot, index) => {
    const fighter = fightersById.get(`p-${index + 1}`);
    const column = slot % 6;
    const row = Math.floor(slot / 6);

    assert.ok(fighter, `slot ${slot} should create a fighter`);
    assert.equal(fighter.x, 72 + column * 88 + (row % 2) * 18);
    assert.equal(fighter.y, 175 + row * 135);
    assert.ok(fighter.x >= BATTLE_BOUNDS.left && fighter.x <= BATTLE_BOUNDS.right);
    assert.ok(fighter.y >= BATTLE_BOUNDS.top && fighter.y <= BATTLE_BOUNDS.bottom);
  });

  const slot4 = fightersById.get("p-2");
  const slot5 = fightersById.get("p-3");
  const slot6 = fightersById.get("p-4");
  const slot23 = fightersById.get("p-7");

  assert.equal(slot4.y, 175);
  assert.equal(slot5.y, 175);
  assert.equal(slot6.y, 310);
  assert.equal(slot23.x, 530);
  assert.equal(slot23.y, 580);
});
