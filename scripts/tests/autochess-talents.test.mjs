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
    if (!(specifier in dependencies)) throw new Error(`Unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  };
  Function("module", "exports", "require", compiled)(module, module.exports, require);
  return module.exports;
};

const gameData = await compileModule("src/components/autoChessGame/core/gameData.ts");
const gameTypes = await compileModule("src/components/autoChessGame/core/gameTypes.ts", {
  "./gameData": gameData,
});
const battleGeometry = await compileModule(
  "src/components/autoChessGame/core/battleGeometry.ts",
  { "./gameTypes": gameTypes },
);
const { AutoChessEngine } = await compileModule(
  "src/components/autoChessGame/core/gameEngine.ts",
  {
    "./battleGeometry": battleGeometry,
    "./gameData": gameData,
  },
);

const createEngine = (seed = 1, starter = "bastion") => {
  const engine = new AutoChessEngine(seed);
  engine.state.starterChoices = [starter];
  engine.startRun(starter);
  return engine;
};

const completeRound = (engine, round) => {
  engine.state.phase = "result";
  engine.state.round = round;
  engine.state.result = {
    won: true,
    headline: "",
    detail: "",
    income: 0,
    bounty: 0,
    defeatedEnemies: 0,
    defeatedByStar: { 1: 0, 2: 0, 3: 0 },
    upgradeDiscount: 0,
    damage: 0,
  };
  engine.continueAfterResult();
};

test("局中天赋固定分为六个小天赋与六个大天赋", () => {
  const minor = gameData.AUGMENTS.filter((augment) => augment.tier === "minor");
  const major = gameData.AUGMENTS.filter((augment) => augment.tier === "major");
  assert.equal(minor.length, 6);
  assert.equal(major.length, 6);
  assert.equal(minor.some((augment) => augment.id === "second_wind"), false);
  assert.equal(major.some((augment) => augment.id === "second_wind"), true);
  assert.match(
    major.find((augment) => augment.id === "second_wind").description,
    /\+12% 最大生命.*\+10 护甲.*恢复 18%/,
  );
});

test("主线与无限模式按轮次交替提供小天赋和大天赋", () => {
  assert.equal(gameData.augmentTierForRound(1), null);
  assert.equal(gameData.augmentTierForRound(2), "minor");
  assert.equal(gameData.augmentTierForRound(4), "major");
  assert.equal(gameData.augmentTierForRound(8), "minor");
  assert.equal(gameData.augmentTierForRound(12), "major");
  assert.equal(gameData.augmentTierForRound(16), "major");
  assert.equal(gameData.augmentTierForRound(22), "minor");
  assert.equal(gameData.augmentTierForRound(28), "major");
  assert.equal(gameData.augmentTierForRound(34), "minor");
});

test("同档未拿完前严格去重，全部拿完后才回补重复强化", () => {
  const engine = createEngine(44);
  completeRound(engine, 2);
  assert.equal(engine.state.phase, "augment");
  assert.equal(engine.state.augmentChoices.length, 3);
  engine.state.augmentChoices.forEach((id) => {
    assert.equal(gameData.AUGMENTS.find((augment) => augment.id === id).tier, "minor");
  });

  engine.state.augments = ["tempered", "sharp_edge"];
  completeRound(engine, 8);
  assert.equal(engine.state.augmentChoices.length, 3);
  assert.equal(engine.state.augmentChoices.includes("tempered"), false);
  assert.equal(engine.state.augmentChoices.includes("sharp_edge"), false);

  const allMinor = gameData.AUGMENTS
    .filter((augment) => augment.tier === "minor")
    .map((augment) => augment.id);
  engine.state.augments = [...allMinor];
  completeRound(engine, 8);
  assert.equal(engine.state.augmentChoices.length, 3);
  engine.state.augmentChoices.forEach((id) => assert.ok(allMinor.includes(id)));
});

test("开局协议补偿一费与二费起始棋子的资产差", () => {
  const expectations = {
    mature_start: { gold: 10, hp: 20, freeRerolls: 0 },
    blaze: { gold: 8, hp: 20, freeRerolls: 0 },
    traffic_start: { gold: 9, hp: 20, freeRerolls: 0 },
    bastion: { gold: 8, hp: 23, freeRerolls: 0 },
    dance_start: { gold: 9, hp: 20, freeRerolls: 0 },
    ranger_start: { gold: 8, hp: 20, freeRerolls: 1 },
  };
  Object.entries(expectations).forEach(([starter, expected], index) => {
    const engine = createEngine(100 + index, starter);
    assert.equal(engine.state.gold, expected.gold, starter);
    assert.equal(engine.state.maxHp, expected.hp, starter);
    assert.equal(engine.state.freeRerollCharges, expected.freeRerolls, starter);
  });
});

test("小天赋保持中等常驻增益并在极后期按层数强化", () => {
  const engine = createEngine(61);
  engine.state.board.fill(null);
  const unit = { uid: 1, id: "ember_blade", star: 1 };
  engine.state.board[0] = unit;
  const base = engine.getPlayerCombatStats(unit);

  engine.state.augments = ["tempered", "vitality", "sharp_edge", "momentum"];
  const once = engine.getPlayerCombatStats(unit);
  assert.equal(once.armor, base.armor + 10);
  assert.ok(Math.abs(once.maxHp / base.maxHp - 1.08) < 1e-9);
  assert.ok(Math.abs(once.attack / base.attack - 1.12) < 1e-9);
  assert.ok(Math.abs(base.attackInterval / once.attackInterval - 1.14) < 1e-9);

  engine.state.augments = ["sharp_edge", "sharp_edge"];
  const repeated = engine.getPlayerCombatStats(unit);
  assert.ok(Math.abs(repeated.attack / base.attack - 1.24) < 1e-9);
});

test("大天赋提供德川家康同档的显著战斗拐点", () => {
  const engine = createEngine(72, "ranger_start");
  engine.state.board.fill(null);
  const unit = { uid: 1, id: "ember_blade", star: 1 };
  engine.state.board[0] = unit;
  const base = engine.getPlayerCombatStats(unit);

  engine.state.augments = ["second_wind"];
  const durable = engine.getPlayerCombatStats(unit);
  assert.ok(Math.abs(durable.maxHp / base.maxHp - 1.12) < 1e-9);
  assert.equal(durable.armor, base.armor + 10);

  engine.state.augments = ["glass_cannon"];
  const overclocked = engine.getPlayerCombatStats(unit);
  assert.ok(Math.abs(overclocked.maxHp / base.maxHp - 0.85) < 1e-9);
  assert.ok(Math.abs(overclocked.attack / base.attack - 1.25) < 1e-9);
  assert.ok(Math.abs(base.attackInterval / overclocked.attackInterval - 1.2) < 1e-9);

  engine.state.augments = ["overclock", "united_front", "precision"];
  engine.startBattle();
  const fighter = engine.state.battle.player[0];
  assert.equal(fighter.energy, Math.min(fighter.maxEnergy, base.energy + 60));
  assert.ok(Math.abs(fighter.shield / fighter.maxHp - 0.25) < 1e-9);
  assert.ok(fighter.critChance >= 0.15);
  assert.ok(fighter.castRefund >= 10);
});

test("大天赋的持续治疗与斩杀增伤按标称数值结算", () => {
  const triageEngine = createEngine(81, "ranger_start");
  triageEngine.state.board.fill(null);
  triageEngine.state.board[0] = { uid: 1, id: "ember_blade", star: 1 };
  triageEngine.state.augments = ["triage"];
  triageEngine.startBattle();
  const triageBattle = triageEngine.state.battle;
  const patient = triageBattle.player[0];
  triageBattle.player.forEach((fighter) => { fighter.cooldown = 99; });
  triageBattle.enemy.forEach((fighter) => {
    fighter.cooldown = 99;
    fighter.attack = 0;
  });
  patient.hp = patient.maxHp * 0.5;
  const hpBefore = patient.hp;
  triageBattle.fieldMedicTimer = 0.01;
  triageEngine.update(0.05);
  assert.ok(Math.abs(patient.hp - hpBefore - patient.maxHp * 0.05) < 1e-9);

  const executionEngine = createEngine(82, "ranger_start");
  executionEngine.state.board.fill(null);
  executionEngine.state.board[0] = { uid: 1, id: "ember_blade", star: 1 };
  executionEngine.state.augments = ["execution"];
  executionEngine.startBattle();
  const source = executionEngine.state.battle.player[0];
  const target = executionEngine.state.battle.enemy[0];
  source.critChance = 0;
  source.lowHealthBonus = 0;
  target.armor = 0;
  target.shield = 0;
  target.hp = target.maxHp * 0.44;
  const dealt = executionEngine.damage(source, target, 10);
  assert.ok(Math.abs(dealt - 15) < 1e-9);
});
