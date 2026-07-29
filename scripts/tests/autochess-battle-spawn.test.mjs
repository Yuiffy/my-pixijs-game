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
const gameTypes = await compileModule("src/components/autoChessGame/core/gameTypes.ts", {
  "./gameData": gameData,
});
const battleGeometry = await compileModule(
  "src/components/autoChessGame/core/battleGeometry.ts",
  { "./gameTypes": gameTypes },
);
const { AutoChessEngine, mechanicalRabbitMuzzle } = await compileModule(
  "src/components/autoChessGame/core/gameEngine.ts",
  {
    "./battleGeometry": battleGeometry,
    "./gameData": gameData,
  },
);

const BOARD_SLOTS = [0, 4, 5, 6, 11, 12, 23];
const BATTLE_BOUNDS = { left: 52, right: 1068, top: 145, bottom: 625 };

const createEngine = (seed = 1) => {
  const engine = new AutoChessEngine(seed);
  engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  engine.startRun("bastion");
  return engine;
};

const stepBattle = (engine, ticks, dt = 0.05) => {
  for (let tick = 0; tick < ticks; tick += 1) engine.update(dt);
};

const clearance = (left, right) =>
  Math.hypot(left.x - right.x, left.y - right.y) - left.radius - right.radius;

const assertInsideBattleBounds = (fighter) => {
  assert.ok(fighter.x >= BATTLE_BOUNDS.left + fighter.radius);
  assert.ok(fighter.x <= BATTLE_BOUNDS.right - fighter.radius);
  assert.ok(fighter.y >= BATTLE_BOUNDS.top + fighter.radius);
  assert.ok(fighter.y <= BATTLE_BOUNDS.bottom - fighter.radius);
};

test("跨场上与备战席合成时保留场上棋子的位置", () => {
  const engine = createEngine(8);
  engine.state.board.fill(null);
  engine.state.bench.fill(null);
  engine.state.board[11] = { uid: 101, id: "sun_guard", star: 1 };
  engine.state.bench[0] = { uid: 102, id: "sun_guard", star: 1 };
  engine.state.bench[1] = { uid: 103, id: "sun_guard", star: 1 };

  assert.equal(engine.checkMerges(), true);
  assert.deepEqual(engine.state.board[11], { uid: 101, id: "sun_guard", star: 2 });
  assert.equal(engine.state.bench[0], null);
  assert.equal(engine.state.bench[1], null);
});

test("连锁合成三星时场上二星优先于新合成的备战席二星", () => {
  const engine = createEngine(9);
  engine.state.board.fill(null);
  engine.state.bench.fill(null);
  engine.state.board[11] = { uid: 201, id: "sun_guard", star: 2 };
  engine.state.bench[0] = { uid: 202, id: "sun_guard", star: 2 };
  engine.state.bench[1] = { uid: 203, id: "sun_guard", star: 1 };
  engine.state.bench[2] = { uid: 204, id: "sun_guard", star: 1 };
  engine.state.bench[3] = { uid: 205, id: "sun_guard", star: 1 };

  assert.equal(engine.checkMerges(), true);
  assert.deepEqual(engine.state.board[11], { uid: 201, id: "sun_guard", star: 3 });
  assert.ok(engine.state.bench.every((unit) => !unit));
});

test("已选择的天赋会按回合记入历史", () => {
  const engine = createEngine(9);
  engine.state.phase = "augment";
  engine.state.round = 2;
  engine.state.augmentChoices = ["tempered", "overclock", "sharp_edge"];
  engine.chooseAugment(1);
  assert.deepEqual(engine.state.augments, ["overclock"]);
  assert.deepEqual(engine.state.augmentHistory, [{ round: 2, id: "overclock" }]);
});

test("备战部署属性与战斗生成属性使用同一计算口径", () => {
  const engine = createEngine(10);
  engine.state.board.fill(null);
  const rabbit = { uid: 1, id: "ember_blade", star: 3 };
  engine.state.board[0] = rabbit;
  engine.state.augments = ["tempered", "second_wind"];

  const preview = engine.getPlayerCombatStats(rabbit);
  assert.equal(Math.round(preview.maxHp), 474);
  assert.equal(Math.round(preview.attack), 75);
  assert.equal(Math.round(preview.armor), 27);
  assert.equal(Math.round(preview.range), 230);

  engine.startBattle();
  const fighter = engine.state.battle?.player[0];
  assert.ok(fighter);
  assert.equal(fighter.maxHp, preview.maxHp);
  assert.equal(fighter.attack, preview.attack);
  assert.equal(fighter.armor, preview.armor);
  assert.equal(fighter.range, preview.range);
  assert.equal(fighter.attackInterval, preview.attackInterval);
  assert.equal(fighter.moveSpeed, preview.moveSpeed);
  assert.equal(fighter.energy, preview.energy);
});

test("克罗雅可同时触发 27期与粤帮关系", () => {
  const engine = createEngine(24);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rift_brawler", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.state.board[2] = { uid: 3, id: "mitsuri", star: 1 };
  engine.startBattle();
  const kloa = engine.state.battle?.player.find((fighter) => fighter.unitId === "rift_brawler");
  assert.equal(kloa?.gen27Member, true);
  assert.equal(kloa?.yueGangMember, true);
});

test("未达阈值的羁绊状态不会标记为已激活", () => {
  const engine = createEngine(18);
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  const status = engine.getTraitStatus("vanguard");
  assert.equal(status.count, 1);
  assert.equal(status.level, 0);
  assert.equal(status.active, false);
});

test("达到阈值的羁绊状态会标记为已激活", () => {
  const engine = createEngine(19);
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "mossback", star: 1 };
  const status = engine.getTraitStatus("vanguard");
  assert.equal(status.count, 2);
  assert.equal(status.level, 1);
  assert.equal(status.active, true);
});

test("怕死受击会在跳跃过程中真实位移，而不是落地瞬移", () => {
  const engine = createEngine(112);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "mossback", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const target = battle.player[0];
  const attacker = battle.enemy[0];
  battle.player.forEach((fighter) => { fighter.cooldown = 99; });
  battle.enemy.forEach((fighter) => { fighter.cooldown = 99; fighter.attack = 0; fighter.hp = 99_999; fighter.maxHp = 99_999; });
  target.x = 430; target.y = 320; target.cooldown = 99; target.baseMoveSpeed = 0; target.moveSpeed = 0;
  attacker.x = 490; attacker.y = 320; attacker.attack = 40; attacker.attackType = "ranged"; attacker.baseRange = 280; attacker.range = 280; attacker.baseMoveSpeed = 0; attacker.moveSpeed = 0; attacker.cooldown = 0;
  const start = { x: target.x, y: target.y };

  engine.update(0.05);
  assert.ok(target.jumpTime > 0);
  assert.notDeepEqual({ x: target.jumpToX, y: target.jumpToY }, start);

  const jumpTimeAfterHit = target.jumpTime;
  const mid = { x: target.x, y: target.y };
  engine.update(0.2);
  assert.ok(target.jumpTime < jumpTimeAfterHit);
  // 跳跃过程中逻辑坐标应持续靠近落点
  assert.ok(Math.hypot(target.x - start.x, target.y - start.y) > Math.hypot(mid.x - start.x, mid.y - start.y) - 0.01);
  assert.ok(Math.hypot(target.x - start.x, target.y - start.y) > 0.5);
  for (let tick = 0; tick < 9; tick += 1) engine.update(0.05);
  assert.equal(target.jumpTime, 0);
  assert.ok(Math.hypot(target.x - target.jumpToX, target.y - target.jumpToY) < 3);
});

test("怕死后跳会留在自身攻击距离内，越界时改为侧跳", () => {
  const engine = createEngine(113);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "mossback", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const target = battle.player[0];
  const attacker = battle.enemy[0];
  battle.player.forEach((fighter) => { fighter.cooldown = 99; });
  battle.enemy.forEach((fighter) => { fighter.cooldown = 99; fighter.attack = 0; fighter.hp = 99_999; fighter.maxHp = 99_999; });
  // 站位故意拉远，使一级后跳（28）仍会越出攻击距离，从而触发侧跳兜底
  target.x = 430; target.y = 320; target.cooldown = 99;
  attacker.x = 490; attacker.y = 320; attacker.attack = 40; attacker.attackType = "ranged"; attacker.range = 280; attacker.cooldown = 0;

  engine.update(0.05);
  assert.ok(target.jumpTime > 0);
  const attackDistance = Math.max(target.range, target.radius + attacker.radius + 12);
  const landingDistance = Math.hypot(target.jumpToX - attacker.x, target.jumpToY - attacker.y);
  assert.ok(landingDistance <= attackDistance + 2);
  assert.ok(Math.abs(target.jumpToY - target.y) > 1, "越界后应选择侧向落点");
  assertInsideBattleBounds({ ...target, x: target.jumpToX, y: target.jumpToY });
});

test("怕死后跳期间近战仍按原移速接近远程目标", () => {
  const engine = createEngine(114);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "mossback", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const target = battle.player[0];
  const attacker = battle.enemy[0];
  battle.player.slice(1).forEach((fighter) => { fighter.alive = false; });
  battle.enemy.slice(1).forEach((fighter) => { fighter.alive = false; });
  target.x = 300; target.y = 320; target.cooldown = 99; target.baseMoveSpeed = 160; target.moveSpeed = 160;
  attacker.x = 900; attacker.y = 320; attacker.attack = 40; attacker.attackType = "ranged"; attacker.baseRange = 700; attacker.range = 700; attacker.cooldown = 0;
  const start = { x: target.x, y: target.y };

  engine.update(0.05);
  assert.ok(target.jumpTime > 0);
  assert.equal(target.vanguardJumpAdvancing, true);
  const jumpFrom = { x: target.jumpFromX, y: target.jumpFromY };
  const jumpTo = { x: target.jumpToX, y: target.jumpToY };

  engine.update(0.2);
  const progress = 1 - target.jumpTime / target.jumpDuration;
  const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
  const jumpOnlyX = jumpFrom.x + (jumpTo.x - jumpFrom.x) * ease;
  assert.ok(target.x > jumpOnlyX + 5, "跳跃期间应叠加正常接敌移动，而不是停在跳跃轨迹上");
  assert.ok(target.x > start.x, "远程目标较远时，近战单位跳跃期间仍应向前推进");
});

test("怕死不会打断跳舞成员的冲刺", () => {
  const engine = createEngine(115);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "guangyi", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const dancer = battle.player[0];
  const vanguard = battle.player[1];
  const attacker = battle.enemy[0];
  battle.player.slice(2).forEach((fighter) => { fighter.alive = false; });
  battle.enemy.slice(1).forEach((fighter) => { fighter.alive = false; });
  dancer.danceDashTime = 0.3;
  dancer.abilityMotion = null;
  attacker.x = dancer.x + 80;
  attacker.y = dancer.y;
  attacker.attackType = "ranged";
  attacker.baseRange = 300;
  attacker.range = 300;
  attacker.attack = 40;
  attacker.cooldown = 0;
  vanguard.x = attacker.x - 120;
  vanguard.y = attacker.y + 80;
  vanguard.cooldown = 99;

  engine.update(0.05);

  assert.ok(dancer.damageTaken > 0, "冲刺中的跳舞成员应正常承受命中");
  assert.ok(dancer.danceDashTime > 0);
  assert.equal(dancer.jumpTime, 0, "冲刺中的跳舞成员不应被怕死跳跃打断");
});

test("主持为全队提供移速，贪吃定时与击杀成长会提高攻击和碰撞体积", () => {
  const engine = createEngine(23);
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_bird", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sui_blue", star: 1 };
  engine.state.board[2] = { uid: 3, id: "grove_mender", star: 1 };
  engine.state.board[3] = { uid: 4, id: "sui_blue", star: 1 };
  engine.state.board[4] = { uid: 5, id: "spark_mage", star: 1 };
  engine.state.board[5] = { uid: 6, id: "sumi", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  battle.enemy.forEach((fighter) => { fighter.hp = 99_999; fighter.maxHp = 99_999; fighter.attack = 0; fighter.armor = 99_999; });
  const hungry = battle.player.find((fighter) => fighter.unitId === "sui_blue");
  const sumi = battle.player.find((fighter) => fighter.unitId === "sumi");
  assert.equal(sumi?.gluttonyHolder, true);
  const beforeRadius = hungry?.radius;
  const beforeAttack = hungry?.attack;
  const beforeSumiGrowth = sumi?.growthStacks || 0;
  for (let tick = 0; tick < 61; tick += 1) {
    battle.player.forEach((fighter) => { fighter.hp = fighter.maxHp; });
    engine.update(0.05);
  }
  assert.ok((hungry?.growthStacks || 0) > 0);
  assert.ok((sumi?.growthStacks || 0) > beforeSumiGrowth);
  assert.ok((hungry?.radius || 0) > (beforeRadius || 0));
  assert.ok((hungry?.attack || 0) > (beforeAttack || 0));
  const stacksBeforeKill = hungry?.growthStacks || 0;
  const radiusBeforeKill = hungry?.radius || 0;
  const attackBeforeKill = hungry?.attack || 0;
  const victim = battle.enemy[0];
  victim.armor = 0;
  victim.hp = 1;
  engine["damage"](hungry, victim, 99_999);
  assert.equal(hungry?.growthStacks, stacksBeforeKill + 1);
  assert.ok((hungry?.radius || 0) > radiusBeforeKill);
  assert.ok((hungry?.attack || 0) > attackBeforeKill);
});

test("舞台梦携带小红帽，并为全队提供少量能量和跳舞攻速", () => {
  const engine = new AutoChessEngine(34);
  engine.state.starterChoices = ["dance_start", "bastion", "blaze"];
  engine.startRun("dance_start");
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui", star: 1 };
  engine.state.board[1] = { uid: 2, id: "zeyin", star: 1 };
  engine.state.board[2] = { uid: 3, id: "mossback", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const dancer = battle?.player.find((fighter) => fighter.unitId === "sui");
  const nonDancer = battle?.player.find((fighter) => fighter.unitId === "mossback");
  assert.ok(dancer && nonDancer);
  assert.equal(dancer.energy, 25);
  assert.equal(nonDancer.energy, 35);
  assert.equal(dancer.attackInterval, 1.12 / 1.12 / 1.08);
  assert.equal(nonDancer.attackInterval, 1.2);
});

test("成熟开战护盾和攻速每 4 秒降低 1 个百分点", () => {
  const engine = createEngine(35);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "gale_archer", star: 1 };
  engine.state.board[1] = { uid: 2, id: "zeyin", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const mature = battle?.player.find((fighter) => fighter.unitId === "gale_archer");
  assert.ok(battle && mature);
  assert.ok(Math.abs(mature.shield - mature.maxHp * 0.12) < 1e-9);
  assert.equal(mature.attackInterval, 1.05 / 1.08);
  battle.enemy.forEach((enemy) => {
    enemy.hp = 99_999;
    enemy.maxHp = 99_999;
    enemy.attack = 0;
    enemy.baseAttack = 0;
    enemy.armor = 99_999;
  });

  stepBattle(engine, 81);
  assert.ok(Math.abs(mature.matureAttackSpeedCurrent - 0.07) < 1e-9);
  assert.ok(Math.abs(mature.attackInterval - 1.05 / 1.07) < 1e-9);

  stepBattle(engine, 160);
  assert.ok(Math.abs(mature.matureAttackSpeedCurrent - 0.05) < 1e-9);
  assert.ok(Math.abs(mature.attackInterval - 1.05 / 1.05) < 1e-9);

  stepBattle(engine, 240);
  assert.ok(Math.abs(mature.matureAttackSpeedCurrent - 0.02) < 1e-9);
  assert.ok(Math.abs(mature.attackInterval - 1.05 / 1.02) < 1e-9);
  assert.ok(Math.abs(mature.moveSpeed - mature.baseMoveSpeed * 0.7) < 1e-9);
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
  engine.state.board[0] = { uid: 1, id: "spark_mage", star: 1 };
  engine.state.board[1] = { uid: 2, id: "grove_mender", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const fighter = battle?.player.find((entry) => entry.unitId === "spark_mage");
  assert.ok(battle && fighter);
  battle.enemy.forEach((enemy) => { enemy.hp = 99_999; enemy.maxHp = 99_999; enemy.attack = 0; enemy.armor = 99_999; });
  const initialAttack = fighter.attack;
  for (let tick = 0; tick < 61; tick += 1) {
    battle.player.forEach((entry) => { entry.hp = entry.maxHp; });
    engine.update(0.05);
  }
  assert.equal(fighter.emberAttackStacks, 1);
  assert.ok(fighter.attack > initialAttack);
});

test("攻击性为成员与全队分别提供攻击力", () => {
  const engine = createEngine(56);
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "xuehui", star: 1 };
  engine.state.board[1] = { uid: 2, id: "meme", star: 1 };
  engine.state.board[2] = { uid: 3, id: "sui", star: 1 };
  engine.state.board[3] = { uid: 4, id: "sui_cat", star: 1 };
  engine.state.board[4] = { uid: 5, id: "cinder_ram", star: 1 };
  engine.state.board[5] = { uid: 6, id: "mossback", star: 1 };
  engine.startBattle();
  const xuehui = engine.state.battle?.player.find((fighter) => fighter.unitId === "xuehui");
  const control = engine.state.battle?.player.find((fighter) => fighter.unitId === "mossback");
  assert.ok(xuehui && control);
  // 5 名攻击性成员 → 2 阶：成员 +30% / 全队 +10%
  assert.equal(xuehui.baseAttack, 37 * 1.15 * (1 + 0.1 + 0.3));
  assert.equal(control.baseAttack, 15 * 1.15 * (1 + 0.1));
});

test("同步视听按战力差线性调整属性且不影响移速", () => {
  const engine = createEngine(57);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "xuehui", star: 1 };
  engine.state.board[1] = { uid: 2, id: "meme", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const xuehui = battle?.player.find((fighter) => fighter.unitId === "xuehui");
  assert.ok(battle && xuehui);
  battle.enemy.forEach((fighter) => { fighter.hp = fighter.maxHp * 0.5; });
  engine.update(0.05);
  assert.equal(xuehui.range, xuehui.baseRange * 0.5);
  assert.equal(xuehui.moveSpeed, xuehui.baseMoveSpeed);
  assert.equal(xuehui.syncAvDirection, 1);
  assert.equal(xuehui.syncAvStrength, 1);
  engine.update(0.05);
  assert.equal(xuehui.range, xuehui.baseRange * 0.5);
  battle.player.forEach((fighter) => { fighter.hp = fighter.maxHp * 0.5; });
  battle.enemy.forEach((fighter) => { fighter.hp = fighter.maxHp; });
  engine.update(0.05);
  assert.equal(xuehui.range, xuehui.baseRange * 1.5);
  assert.equal(xuehui.moveSpeed, xuehui.baseMoveSpeed);
  assert.equal(xuehui.syncAvDirection, -1);
  assert.equal(xuehui.syncAvStrength, 1);
});

test("雪绘近战范围挥斩会灼烧身边敌人", () => {
  const engine = createEngine(58);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "xuehui", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  assert.ok(battle && source);
  battle.enemy.forEach((fighter, index) => {
    fighter.hp = fighter.maxHp = 9999;
    fighter.armor = 0;
    fighter.attack = 0;
    fighter.x = index === 0 ? 270 : 800;
    fighter.y = 360;
  });
  source.x = 220;
  source.y = 360;
  source.energy = source.maxEnergy;
  engine.update(0.05);
  const target = battle.enemy[0];
  assert.equal(source.attackType, "melee");
  assert.ok(target.hp < target.maxHp);
  assert.ok(target.burnTime > 0);
});

test("狍子偶像只能近距离发动捏捏摸摸，并同时定住双方、持续吸血", () => {
  const engine = createEngine(151);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "lovely", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  const target = battle?.enemy[0];
  assert.ok(battle && source && target);
  battle.enemy.forEach((fighter, index) => {
    fighter.x = index === 0 ? 360 : 900;
    fighter.y = 360;
    fighter.attack = 0;
    fighter.armor = 0;
    fighter.cooldown = 99;
    fighter.hp = fighter.maxHp = 9999;
  });
  source.x = 260;
  source.y = 360;
  source.hp = source.maxHp * 0.5;
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.equal(source.channelTargetFid, null, "远距离时狍子偶像不应发动捏捏摸摸");
  source.x = target.x - 50;
  source.energy = source.maxEnergy;
  source.cooldown = 0;
  engine.update(0.05);
  assert.equal(source.channelTargetFid, target.fid);
  assert.ok(source.channelTime > 3);
  source.energy = 0;
  source.energyPerSecond = 0;
  source.cooldown = 99;
  const sourceX = source.x;
  const targetX = target.x;
  const hpBefore = target.hp;
  const sourceHpBefore = source.hp;
  engine.update(0.1);
  assert.equal(source.x, sourceX);
  assert.equal(target.x, targetX);
  assert.ok(target.hp < hpBefore);
  assert.ok(source.hp > sourceHpBefore);
  assert.ok(target.stun > 0);
  for (let tick = 0; tick < 72; tick += 1) engine.update(0.1);
  assert.equal(source.channelTime, 0);
  assert.equal(source.channelTargetFid, null);
});

test("能量 profile 会落地为个体上限、持续回能与攻击分类", () => {
  const engine = createEngine(44);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "cog_scribe", star: 1 };
  engine.startBattle();
  const fighter = engine.state.battle?.player.find((entry) => entry.unitId === "cog_scribe");
  assert.ok(fighter);
  assert.equal(fighter.maxEnergy, 100);
  assert.equal(fighter.energyPerSecond, 7);
  assert.equal(fighter.attackType, "ranged");
  const before = fighter.energy;
  fighter.x = 72; fighter.y = 175;
  engine.state.battle.enemy.forEach((enemy) => { enemy.x = 1000; enemy.y = 600; enemy.attack = 0; enemy.armor = 99_999; });
  for (let tick = 0; tick < 20; tick += 1) engine.update(0.05);
  assert.ok(fighter.energy >= before + 6.9);
  assert.ok(fighter.energy <= fighter.maxEnergy);
});

test("紧贴碰撞体积的近战单位也能稳定攻击", () => {
  const engine = createEngine(46);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const source = battle.player[0];
  const target = battle.enemy[0];
  source.x = 300; source.y = 300; source.cooldown = 0; source.energy = 0;
  target.x = 363; target.y = 300; target.attack = 0; target.armor = 99_999; target.dodgeChance = 0;
  engine.update(0.05);
  assert.equal(source.energy, source.energyPerSecond * 0.05 + source.energyOnAttack);
});

test("绿冻护甲只保留贴身护盾，透明强度随剩余护盾下降", () => {
  const engine = createEngine(146);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const guard = battle?.player[0];
  const attacker = battle?.enemy[0];
  assert.ok(battle && guard && attacker);
  battle.effects.length = 0;
  guard.shield = 0;
  guard.shieldPeak = 0;

  engine.castAbility(guard, battle.enemy);

  assert.ok(guard.shield > 0);
  assert.ok(Math.abs(guard.shield - guard.maxHp * 0.3 * 1.2) < 0.001);
  assert.equal(guard.shieldPeak, guard.shield);
  assert.equal(battle.effects.filter((effect) => effect.text === "绿冻护甲").length, 1);
  assert.ok(!battle.effects.some((effect) => effect.kind === "ring" && effect.x === guard.x && effect.y === guard.y));

  attacker.dodgeChance = 0;
  engine.damage(attacker, guard, guard.shield);
  assert.ok(guard.shield > 0 && guard.shield < guard.shieldPeak);
  assert.ok(guard.shield / guard.shieldPeak < 1);

  engine.damage(attacker, guard, 99_999);
  assert.equal(guard.shield, 0);
  assert.equal(guard.shieldPeak, 0);
});

test("绿冻护甲同时按自动、攻击和受击三种来源回能", () => {
  const engine = createEngine(147);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const guard = battle?.player[0];
  assert.ok(battle && guard);
  assert.equal(guard.energyPerSecond, 8);
  assert.equal(guard.energyOnAttack, 6);
  assert.equal(guard.energyOnHit, 3);

  battle.player.forEach((fighter) => { fighter.cooldown = 99; });
  battle.enemy.forEach((enemy) => {
    enemy.attack = 0;
    enemy.dodgeChance = 0;
    enemy.cooldown = 99;
  });
  guard.energy = 0;
  for (let tick = 0; tick < 20; tick += 1) engine.update(0.05);
  assert.ok(Math.abs(guard.energy - 8) < 0.001);

  guard.energy = 0;
  const attacker = battle.enemy[0];
  attacker.x = guard.x + 1;
  attacker.y = guard.y;
  for (let hit = 0; hit < 3; hit += 1) engine.basicAttack(attacker, guard);
  assert.equal(guard.energy, 9);

  guard.cooldown = 0;
  engine.basicAttack(guard, attacker);
  assert.equal(guard.energy, 15);
});

test("一星绿冻护甲在三名一星敌人围攻下最多续盾两次且会被击破", () => {
  const engine = createEngine(148);
  engine.state.round = 2;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const guard = battle?.player[0];
  assert.ok(battle && guard);
  assert.equal(battle.enemy.length, 3);
  battle.enemy.forEach((fighter) => {
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
  });

  stepBattle(engine, 480);

  const oneShield = guard.maxHp * 0.3 * 1.2;
  assert.ok(guard.shieldingDone > oneShield);
  assert.ok(guard.shieldingDone <= oneShield * 2 + 0.001);
  assert.equal(guard.alive, false);
  assert.equal(guard.shield, 0);
  assert.equal(engine.state.phase, "result");
});

test("一星绒绒的狗在三名一星敌人围攻下不会靠受击无限续盾", () => {
  const engine = createEngine(149);
  engine.state.round = 2;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "mossback", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const mossback = battle?.player[0];
  assert.ok(battle && mossback);
  assert.equal(battle.enemy.length, 3);
  assert.equal(mossback.energyPerSecond, 8);
  assert.equal(mossback.energyOnAttack, 6);
  assert.equal(mossback.energyOnHit, 3);
  battle.enemy.forEach((fighter) => {
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
  });

  let castCount = 0;
  const castAbility = engine.castAbility.bind(engine);
  engine.castAbility = (source, targets) => {
    if (source === mossback) castCount += 1;
    return castAbility(source, targets);
  };
  stepBattle(engine, 480);

  assert.ok(castCount >= 1, "绒绒的狗仍应能正常施放技能");
  assert.ok(castCount <= 2, "三打一不应通过受击回能反复刷新护盾");
  assert.equal(mossback.alive, false);
  assert.equal(mossback.shield, 0);
  assert.equal(engine.state.phase, "result");
});

test("一星浣熊店员在三名一星敌人围攻下不会靠受击无限治疗", () => {
  const engine = createEngine(150);
  engine.state.round = 2;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "gale_archer", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const raccoon = battle?.player[0];
  assert.ok(battle && raccoon);
  assert.equal(battle.enemy.length, 3);
  assert.equal(raccoon.energyPerSecond, 8);
  assert.equal(raccoon.energyOnAttack, 6);
  assert.equal(raccoon.energyOnHit, 3);
  battle.enemy.forEach((fighter) => {
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
  });

  let castCount = 0;
  const castAbility = engine.castAbility.bind(engine);
  engine.castAbility = (source, targets) => {
    if (source === raccoon) castCount += 1;
    return castAbility(source, targets);
  };
  stepBattle(engine, 480);

  assert.ok(castCount >= 1, "浣熊店员仍应能正常施放治疗");
  assert.ok(castCount <= 2, "三打一不应通过受击回能反复刷新治疗");
  assert.equal(raccoon.alive, false);
  assert.equal(engine.state.phase, "result");
});

test("所有可重复护盾角色在三人持续集火下都能被击破", async (context) => {
  const shieldUnitIds = [
    "sun_guard",
    "rift_stalker",
    "mossback",
    "seki_boar_king",
    "mitsuri",
    "guangyi",
    "nagisa",
    "biscuit_sui",
    "rutice",
  ];

  for (const [index, unitId] of shieldUnitIds.entries()) {
    await context.test(unitId, () => {
      const engine = createEngine(160 + index);
      engine.state.round = 2;
      engine.state.playerLevel = 4;
      engine.state.starter = "blaze";
      engine.state.board.fill(null);
      engine.state.board[0] = { uid: 1, id: unitId, star: 1 };
      engine.startBattle();
      const battle = engine.state.battle;
      const shieldUnit = battle?.player[0];
      assert.ok(battle && shieldUnit);
      shieldUnit.x = 500;
      shieldUnit.y = 360;
      shieldUnit.moveSpeed = 0;
      shieldUnit.energy = shieldUnit.maxEnergy * 0.9;

      const normalizedAttack =
        (shieldUnit.maxHp / 5 / (3 / 0.8)) * ((100 + shieldUnit.armor) / 100);
      battle.enemy.forEach((attacker, attackerIndex) => {
        attacker.x = 560;
        attacker.y = 300 + attackerIndex * 60;
        attacker.hp = 99_999;
        attacker.maxHp = 99_999;
        attacker.armor = 99_999;
        attacker.attack = normalizedAttack;
        attacker.baseAttack = normalizedAttack;
        attacker.attackInterval = 0.8;
        attacker.baseAttackInterval = 0.8;
        attacker.cooldown = 0;
        attacker.moveSpeed = 180;
        attacker.baseMoveSpeed = 180;
        attacker.energy = 0;
        attacker.energyPerSecond = 0;
        attacker.energyOnAttack = 0;
        attacker.energyOnHit = 0;
        attacker.dodgeChance = 0;
      });

      let castCount = 0;
      const castAbility = engine.castAbility.bind(engine);
      engine.castAbility = (source, targets) => {
        if (source === shieldUnit) castCount += 1;
        return castAbility(source, targets);
      };
      stepBattle(engine, 480);

      assert.ok(
        castCount >= 1,
        `${unitId} should still cast its shield ability (elapsed ${battle.elapsed.toFixed(2)}, energy ${shieldUnit.energy.toFixed(1)}, damage ${shieldUnit.damageTaken.toFixed(1)})`,
      );
      assert.equal(
        shieldUnit.alive,
        false,
        `${unitId} should not sustain forever (elapsed ${battle.elapsed.toFixed(2)}, hp ${shieldUnit.hp.toFixed(1)}, shield ${shieldUnit.shield.toFixed(1)}, damage ${shieldUnit.damageTaken.toFixed(1)}, casts ${castCount})`,
      );
      assert.equal(shieldUnit.shield, 0, `${unitId} shield should be fully broken`);
      assert.equal(engine.state.phase, "result");
    });
  }
});

test("雪烛主动施法后提供固定值加生命比例的技能盾，普攻绕过且技能优先消耗", () => {
  const engine = createEngine(171);
  engine.state.starter = "blaze";
  engine.state.round = 2;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "yukisyo", star: 1 };
  engine.state.board[1] = { uid: 2, id: "nori", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player.find((fighter) => fighter.unitId === "yukisyo");
  const backliner = battle?.player.find((fighter) => fighter.unitId === "nori");
  const enemy = battle?.enemy[0];
  assert.ok(battle && source && backliner && enemy);
  source.x = 260;
  source.y = 330;
  backliner.x = 320;
  backliner.y = 330;
  backliner.armor = 0;
  backliner.dodgeChance = 0;
  enemy.x = 600;
  enemy.y = 330;
  enemy.critChance = 0;
  battle.enemy.forEach((fighter) => {
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.armor = 99_999;
    fighter.attack = 0;
    fighter.baseAttack = 0;
  });

  assert.equal(source.energy, 78);
  engine.update(0.05);
  assert.equal(backliner.abilityShield, 0, "高初始能量不等于开战自动触发");

  source.energy = source.maxEnergy;
  engine.castAbility(source, battle.enemy, true);
  const expectedShield = 70 + backliner.maxHp * 0.26;
  assert.ok(Math.abs(backliner.abilityShield - expectedShield) < 0.001);
  assert.equal(backliner.abilityShieldTime, 4);

  const shieldBeforeAttack = backliner.abilityShield;
  const hpBeforeAttack = backliner.hp;
  engine.damage(enemy, backliner, 30, true, "attack");
  assert.equal(backliner.abilityShield, shieldBeforeAttack);
  assert.equal(backliner.hp, hpBeforeAttack - 30);

  const hpBeforeAbility = backliner.hp;
  engine.damage(enemy, backliner, 40, true, "ability");
  assert.equal(backliner.hp, hpBeforeAbility);
  assert.ok(Math.abs(backliner.abilityShield - (shieldBeforeAttack - 40)) < 0.001);

  const shieldBeforeAbilityBurn = backliner.abilityShield;
  engine.applyBurn(enemy, backliner, 60, "ability");
  engine.update(0.05);
  assert.equal(backliner.hp, hpBeforeAbility);
  assert.ok(Math.abs(backliner.abilityShield - (shieldBeforeAbilityBurn - 1)) < 0.001);

  backliner.abilityShield = 20;
  backliner.abilityShieldPeak = 20;
  backliner.abilityShieldTime = 4;
  backliner.shield = 30;
  backliner.shieldPeak = 30;
  engine.damage(enemy, backliner, 40, true, "ability");
  assert.equal(backliner.abilityShield, 0);
  assert.equal(backliner.shield, 10);

  backliner.abilityShield = 250;
  backliner.abilityShieldPeak = 250;
  backliner.abilityShieldTime = 0.2;
  source.energy = source.maxEnergy;
  engine.castAbility(source, battle.enemy, true);
  assert.equal(backliner.abilityShield, 250, "重复技能盾只取较高值，不相加");
  assert.equal(backliner.abilityShieldTime, 4, "重复施法刷新四秒持续时间");
  stepBattle(engine, 81);
  assert.equal(backliner.abilityShield, 0);
  assert.equal(backliner.abilityShieldTime, 0);
});

test("沐霂按场地控制优先拉援，经过移动过程后拉出时停并打断持续压制", () => {
  const engine = createEngine(172);
  engine.state.starter = "blaze";
  engine.state.round = 2;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "mumu", star: 1 };
  engine.state.board[1] = { uid: 2, id: "nori", star: 1 };
  engine.state.board[2] = { uid: 3, id: "gale_archer", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player.find((fighter) => fighter.unitId === "mumu");
  const trapped = battle?.player.find((fighter) => fighter.unitId === "nori");
  const merelyLow = battle?.player.find((fighter) => fighter.unitId === "gale_archer");
  const controller = battle?.enemy[0];
  assert.ok(battle && source && trapped && merelyLow && controller);
  source.x = 360;
  source.y = 350;
  trapped.x = 620;
  trapped.y = 350;
  trapped.hp = trapped.maxHp * 0.8;
  trapped.stun = 2;
  merelyLow.x = 430;
  merelyLow.y = 430;
  merelyLow.hp = merelyLow.maxHp * 0.2;
  source.energy = source.maxEnergy;
  battle.enemy.forEach((fighter) => {
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.armor = 99_999;
    fighter.attack = 0;
    fighter.baseAttack = 0;
    fighter.energy = fighter.maxEnergy;
  });
  controller.channelTargetFid = trapped.fid;
  controller.channelTime = 3;
  controller.channelPulseTimer = 0;
  battle.chronospheres.push({
    sourceFid: controller.fid,
    x: trapped.x,
    y: trapped.y,
    radius: 96,
    life: 3,
    maxLife: 3,
    color: "#c9a0ff",
  });

  const startX = trapped.x;
  engine.update(0.05);
  assert.equal(trapped.abilityMotion?.kind, "pull");
  assert.equal(trapped.abilityMotion?.sourceFid, source.fid);
  assert.ok(trapped.x !== startX, "拉援首帧进入移动中间态");
  assert.ok(trapped.x !== trapped.abilityMotion.toX, "拉援不能同帧瞬移到终点");
  assert.equal(merelyLow.abilityMotion, null, "场地控制优先于普通低血");

  const hpBeforeLanding = trapped.hp;
  stepBattle(engine, 8);
  assert.equal(trapped.abilityMotion, null);
  assert.ok(Math.hypot(trapped.x - 620, trapped.y - 350) > 96, "目标必须离开时停范围");
  assert.equal(trapped.stun, 0);
  assert.equal(controller.channelTargetFid, null);
  assert.equal(controller.channelTime, 0);
  assert.ok(trapped.hp > hpBeforeLanding);
  assert.ok(trapped.shield > 0);
});

test("沐霂没有危险目标或自身处于时停时不会消耗能量", () => {
  const engine = createEngine(173);
  engine.state.starter = "blaze";
  engine.state.round = 2;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "mumu", star: 1 };
  engine.state.board[1] = { uid: 2, id: "nori", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player.find((fighter) => fighter.unitId === "mumu");
  const ally = battle?.player.find((fighter) => fighter.unitId === "nori");
  const zoneOwner = battle?.enemy[0];
  assert.ok(battle && source && ally && zoneOwner);
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.baseAttack = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.armor = 99_999;
  });
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.equal(source.energy, source.maxEnergy);
  assert.equal(ally.abilityMotion, null);

  ally.hp = ally.maxHp * 0.2;
  zoneOwner.energy = zoneOwner.maxEnergy;
  battle.chronospheres.push({
    sourceFid: zoneOwner.fid,
    x: source.x,
    y: source.y,
    radius: 90,
    life: 2,
    maxLife: 2,
    color: "#c9a0ff",
  });
  engine.update(0.05);
  assert.equal(source.energy, source.maxEnergy);
  assert.equal(ally.abilityMotion, null);
});

test("远程进攻技能超出技能距离会等待，进入技能距离后释放", () => {
  const engine = createEngine(140);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "yua", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  const target = battle?.enemy[0];
  assert.ok(battle && source && target);
  battle.enemy.forEach((fighter, index) => {
    fighter.attack = 0;
    fighter.armor = 99_999;
    fighter.hp = fighter.maxHp = 99_999;
    fighter.x = index === 0 ? 720 : 980;
    fighter.y = 360;
  });
  source.x = 200;
  source.y = 360;
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.equal(source.energy, source.maxEnergy, "超出技能距离时应保留满能量");
  assert.ok(!battle.effects.some((effect) => effect.kind === "line"), "超出技能距离不应生成攻击反馈");
  target.x = source.x + gameData.UNIT_DEFS.yua.abilityRange - 1;
  engine.update(0.05);
  assert.equal(source.energy, source.castRefund, "进入技能距离后应立即施法");
  assert.ok(battle.effects.some((effect) => effect.kind === "line"));
});

test("支援技能只影响技能距离内的友军", () => {
  const engine = createEngine(146);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rutice", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.state.board[2] = { uid: 3, id: "mossback", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player.find((fighter) => fighter.unitId === "rutice");
  const near = battle?.player.find((fighter) => fighter.unitId === "sun_guard");
  const far = battle?.player.find((fighter) => fighter.unitId === "mossback");
  assert.ok(battle && source && near && far);
  source.x = 250;
  source.y = 360;
  near.x = source.x + gameData.UNIT_DEFS.rutice.abilityRange - 10;
  near.y = 360;
  far.x = source.x + gameData.UNIT_DEFS.rutice.abilityRange + 80;
  far.y = 360;
  near.hp = near.maxHp * 0.4;
  far.hp = far.maxHp * 0.4;
  const nearHp = near.hp;
  const farHp = far.hp;
  engine["castAbility"](source, battle.enemy, true);
  assert.ok(near.hp > nearHp);
  assert.equal(far.hp, farHp);

  const songEngine = createEngine(147);
  songEngine.state.playerLevel = 4;
  songEngine.state.board.fill(null);
  songEngine.state.board[0] = { uid: 1, id: "cinder_ram", star: 1 };
  songEngine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  songEngine.state.board[2] = { uid: 3, id: "mossback", star: 1 };
  songEngine.startBattle();
  const songBattle = songEngine.state.battle;
  const singer = songBattle?.player.find((fighter) => fighter.unitId === "cinder_ram");
  const songNear = songBattle?.player.find((fighter) => fighter.unitId === "sun_guard");
  const songFar = songBattle?.player.find((fighter) => fighter.unitId === "mossback");
  assert.ok(songBattle && singer && songNear && songFar);
  singer.x = 260;
  singer.y = 360;
  songNear.x = singer.x + gameData.UNIT_DEFS.cinder_ram.abilityRange - 20;
  songNear.y = 360;
  songFar.x = singer.x + gameData.UNIT_DEFS.cinder_ram.abilityRange + 100;
  songFar.y = 360;
  songNear.hp = songNear.maxHp * 0.4;
  songFar.hp = songFar.maxHp * 0.4;
  const songNearHp = songNear.hp;
  const songFarHp = songFar.hp;
  songEngine["castAbility"](singer, songBattle.enemy, true);
  singer.cinderSongPulseTimer = 0;
  singer.cooldown = 99;
  songBattle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.cooldown = 99;
  });
  songEngine.update(0.05);
  assert.ok(songNear.hp > songNearHp, "持续治疗应覆盖技能距离内友军");
  assert.equal(songFar.hp, songFarHp, "持续治疗不应越过技能距离");
});

test("直接调用普攻不会跨攻击距离造成副作用", () => {
  const engine = createEngine(141);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  const target = battle?.enemy[0];
  assert.ok(battle && source && target);
  source.x = 180;
  source.y = 360;
  source.cooldown = 0;
  source.energy = 0;
  target.x = 720;
  target.y = 360;
  target.armor = 0;
  target.dodgeChance = 0;
  const hpBefore = target.hp;
  engine.basicAttack(source, target);
  assert.equal(source.cooldown, 0);
  assert.equal(source.energy, 0);
  assert.equal(target.hp, hpBefore);
});

test("跳舞冲刺只在一次冲刺可进入自身攻击范围时触发", () => {
  const engine = createEngine(142);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui", star: 1 };
  engine.state.board[1] = { uid: 2, id: "zeyin", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player.find((fighter) => fighter.unitId === "sui");
  const target = battle?.enemy[0];
  assert.ok(battle && source && target);
  assert.equal(source.danceMember, true);
  battle.enemy.forEach((fighter, index) => {
    fighter.attack = 0;
    fighter.armor = 99_999;
    fighter.hp = fighter.maxHp = 99_999;
    fighter.x = index === 0 ? 520 : 980;
    fighter.y = 360;
  });
  battle.player.forEach((fighter) => {
    fighter.cooldown = 99;
    fighter.energy = 0;
  });
  source.x = 200;
  source.y = 360;
  const preferredRange = Math.max(source.range, source.radius + target.radius + 12);
  const dashTravel = source.moveSpeed * 3.4 * 0.48;
  target.x = source.x + preferredRange + dashTravel + 8;
  target.y = source.y;
  engine.update(0.05);
  assert.equal(source.danceDashTime, 0, "距离过远时不应提前消耗冲刺");
  assert.equal(source.danceDashCooldown, 0);

  source.x = 200;
  source.y = 360;
  source.danceDashTime = 0;
  source.danceDashCooldown = 0;
  target.x = source.x + preferredRange + dashTravel - 2;
  engine.update(0.05);
  assert.ok(source.danceDashTime > 0, "最后一段接敌应触发冲刺");
  assert.ok(source.danceDashCooldown > 0);
});

test("小红帽满能量时按攻击释放，而不是等待受击", () => {
  const engine = createEngine(143);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  assert.ok(battle && source);
  battle.enemy.forEach((fighter, index) => {
    fighter.x = index === 0 ? 460 : 980;
    fighter.y = 360;
    fighter.attack = 0;
    fighter.cooldown = 99;
  });
  source.x = 180;
  source.y = 360;
  source.hitPulse = 0;
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.equal(source.barrageActive, true);
  assert.ok(battle.effects.some((effect) => effect.text === "攻击弹幕"));
});

test("近身范围主动技能只在进入攻击距离后释放", () => {
  ["rift_brawler", "meme"].forEach((unitId, index) => {
    const engine = createEngine(144 + index);
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: unitId, star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const source = battle?.player[0];
    const target = battle?.enemy[0];
    assert.ok(battle && source && target);
    battle.enemy.forEach((fighter, enemyIndex) => {
      fighter.x = enemyIndex === 0 ? 900 : 980;
      fighter.y = 360;
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.armor = 99_999;
      fighter.hp = fighter.maxHp = 99_999;
    });
    source.x = 180;
    source.y = 360;
    source.moveSpeed = 0;
    source.cooldown = 0;
    source.hitPulse = 0;
    source.energy = source.maxEnergy;
    engine.update(0.05);
    assert.equal(source.energy, source.maxEnergy, `${unitId} should wait outside attack range`);
    assert.equal(
      battle.effects.some((effect) => effect.text === gameData.UNIT_DEFS[unitId].abilityName),
      false,
      `${unitId} should not cast outside attack range`,
    );

    target.x = source.x + source.range - 1;
    target.y = source.y;
    engine.update(0.05);
    assert.ok(
      battle.effects.some((effect) => effect.text === gameData.UNIT_DEFS[unitId].abilityName),
      `${unitId} should cast after entering attack range`,
    );
  });
});

test("拥挤近战会侧移接敌并在时限前造成伤害", () => {
  const engine = createEngine(94);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.state.board[2] = { uid: 3, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const [source, blockerA, blockerB] = battle.player;
  const target = battle.enemy[0];
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.armor = 99_999;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.dodgeChance = 0;
    fighter.x = 770;
    fighter.y = 360;
  });
  source.x = 100;
  source.y = 360;
  blockerA.x = 180;
  blockerA.y = 330;
  blockerB.x = 180;
  blockerB.y = 390;
  const initialDistance = Math.hypot(target.x - source.x, target.y - source.y);
  stepBattle(engine, 160);
  assert.ok(source.damageDealt > 0 || Math.hypot(target.x - source.x, target.y - source.y) < initialDistance - 120);
  battle.player.concat(battle.enemy).filter((fighter) => fighter.alive).forEach(assertInsideBattleBounds);
});

test("同队挡路时会侧向让位而让移动者持续前进", () => {
  const engine = createEngine(101);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const [source, blocker] = battle.player;
  const target = battle.enemy[0];
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.armor = 99_999;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.x = 720;
    fighter.y = 360;
  });
  source.x = 300;
  source.y = 360;
  blocker.x = 355;
  blocker.y = 360;
  const initialDistance = Math.hypot(target.x - source.x, target.y - source.y);
  const initialBlockerY = blocker.y;
  stepBattle(engine, 20);
  assert.ok(Math.abs(blocker.y - initialBlockerY) > 5);
  assert.ok(Math.hypot(target.x - source.x, target.y - source.y) < initialDistance - 5);
  assert.ok(clearance(source, blocker) >= -0.01);
  [source, blocker].forEach(assertInsideBattleBounds);
});

test("让位不会推开敌人或递归推动第二个友军", () => {
  const engine = createEngine(102);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.state.board[2] = { uid: 3, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const [source, blocker, secondBlocker] = battle.player;
  const target = battle.enemy[0];
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.stun = 99;
    fighter.x = 720;
    fighter.y = 360;
  });
  source.x = 300;
  source.y = 360;
  blocker.x = 355;
  blocker.y = 360;
  blocker.stun = 99;
  secondBlocker.x = 355;
  secondBlocker.y = 417;
  secondBlocker.stun = 99;
  const secondBefore = { x: secondBlocker.x, y: secondBlocker.y };
  stepBattle(engine, 1);
  assert.ok(Math.hypot(secondBlocker.x - secondBefore.x, secondBlocker.y - secondBefore.y) < 12);
  assert.ok(clearance(blocker, secondBlocker) >= -0.01);
  battle.player.concat(battle.enemy).filter((fighter) => fighter.alive).forEach(assertInsideBattleBounds);
  assert.equal(target.team, "enemy");
});

test("贴边让位选择未被边界截断的一侧", () => {
  const engine = createEngine(103);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 2, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 4, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const [source, blocker] = battle.player;
  const target = battle.enemy[0];
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.armor = 99_999;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.x = 720;
    fighter.y = BATTLE_BOUNDS.top + fighter.radius;
  });
  source.x = 300;
  source.y = BATTLE_BOUNDS.top + source.radius;
  blocker.x = 355;
  blocker.y = BATTLE_BOUNDS.top + blocker.radius;
  const beforeY = blocker.y;
  stepBattle(engine, 4);
  assert.ok(blocker.y > beforeY + 5);
  [source, blocker].forEach(assertInsideBattleBounds);
  assert.ok(clearance(source, blocker) >= -0.01);
  assert.ok(target.alive);
});

test("横向晃动但不接近目标会触发恢复换边", () => {
  const engine = createEngine(104);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const [source, blocker] = battle.player;
  const target = battle.enemy[0];
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.armor = 99_999;
    fighter.x = 700;
    fighter.y = 360;
  });
  source.x = 100;
  source.y = 360;
  blocker.x = 155;
  blocker.y = 360;
  const initialSide = source.avoidSide;
  let recovered = false;
  for (let tick = 0; tick < 30; tick += 1) {
    source.x = 100;
    source.y = 360 + (tick % 2 ? 8 : -8);
    blocker.x = 155;
    blocker.y = 360;
    battle.enemy.forEach((fighter) => { fighter.x = 700 + tick * 20; });
    stepBattle(engine, 1);
    if (source.avoidSide !== initialSide) recovered = true;
  }
  assert.equal(recovered, true);
  battle.player.concat(battle.enemy).filter((fighter) => fighter.alive).forEach(assertInsideBattleBounds);
  assert.ok(target.alive);
});

test("近似等距目标不会每帧反复切换，失效后会重选", () => {
  const engine = createEngine(95);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const source = battle.player[0];
  const [first, second] = battle.enemy;
  source.x = 400;
  source.y = 360;
  [first, second].forEach((fighter) => {
    fighter.attack = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.armor = 99_999;
  });
  first.x = 650;
  first.y = 330;
  second.x = 650;
  second.y = 390;
  stepBattle(engine, 1);
  const lockedTarget = source.targetFid;
  for (let tick = 0; tick < 6; tick += 1) {
    first.y = tick % 2 ? 331 : 329;
    second.y = tick % 2 ? 389 : 391;
    stepBattle(engine, 1);
    assert.equal(source.targetFid, lockedTarget);
  }
  const selected = battle.enemy.find((fighter) => fighter.fid === lockedTarget);
  assert.ok(selected);
  selected.alive = false;
  selected.hp = 0;
  stepBattle(engine, 1);
  assert.notEqual(source.targetFid, lockedTarget);
});

test("拥堵边界会触发侧移恢复且始终留在战场内", () => {
  const engine = createEngine(96);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const [source, blocker] = battle.player;
  const target = battle.enemy[0];
  battle.enemy.forEach((fighter) => { fighter.attack = 0; fighter.hp = 99_999; fighter.maxHp = 99_999; fighter.armor = 99_999; });
  source.x = BATTLE_BOUNDS.left + source.radius;
  source.y = 360;
  blocker.x = source.x + source.radius + blocker.radius + 3;
  blocker.y = 360;
  target.x = 650;
  target.y = 360;
  const initialDistance = Math.hypot(target.x - source.x, target.y - source.y);
  stepBattle(engine, 30);
  assert.ok(Math.hypot(target.x - source.x, target.y - source.y) < initialDistance - 5 || source.damageDealt > 0);
  battle.player.concat(battle.enemy).filter((fighter) => fighter.alive).forEach(assertInsideBattleBounds);
});

test("被友军贴脸挡住时会物理推开队友并接敌", () => {
  const engine = createEngine(105);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "mossback", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sui", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const source = battle.player.find((fighter) => fighter.unitId === "mossback");
  const blocker = battle.player.find((fighter) => fighter.unitId === "sui");
  const target = battle.enemy[0];
  assert.ok(source);
  assert.ok(blocker);
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.armor = 0;
    fighter.x = 640;
    fighter.y = 360;
  });
  // 友军已贴脸占住正面，后方近战被挡住无法直线进攻击距离
  blocker.x = 640 - (blocker.radius + target.radius + 10);
  blocker.y = 360;
  blocker.stun = 99;
  source.x = blocker.x - (source.radius + blocker.radius + 4);
  source.y = 360;
  source.cooldown = 0;
  const preferredRange = Math.max(source.range, source.radius + target.radius + 12);
  const blockerStart = { x: blocker.x, y: blocker.y };
  assert.ok(Math.hypot(target.x - source.x, target.y - source.y) > preferredRange);
  let maxSourceStep = 0;
  let prev = { x: source.x, y: source.y };
  for (let tick = 0; tick < 90; tick += 1) {
    stepBattle(engine, 1);
    maxSourceStep = Math.max(maxSourceStep, Math.hypot(source.x - prev.x, source.y - prev.y));
    prev = { x: source.x, y: source.y };
  }
  assert.ok(maxSourceStep < 18, "接敌应靠逐步移动，不应闪现");
  assert.ok(
    Math.abs(blocker.y - blockerStart.y) > 8 || Math.abs(blocker.x - blockerStart.x) > 8,
    "挡路友军应被物理推开",
  );
  assert.ok(
    source.damageDealt > 0 || Math.hypot(target.x - source.x, target.y - source.y) <= preferredRange + 1,
    "推开队友后应进入攻击距离或完成输出",
  );
  assert.ok(clearance(source, blocker) >= -0.01);
  [source, blocker].forEach(assertInsideBattleBounds);
});

test("偷袭成员会在己方首个单位交战后提前起跳", () => {
  const engine = createEngine(98);
  engine.state.round = 6;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rift_stalker", star: 1 };
  engine.state.board[1] = { uid: 2, id: "akirinco", star: 1 };
  engine.state.board[2] = { uid: 3, id: "ember_blade", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const assassins = battle.player.filter((fighter) => fighter.jumpPending);
  const rangedAlly = battle.player.find((fighter) => fighter.unitId === "ember_blade");
  assert.equal(assassins.length, 2);
  assert.ok(rangedAlly);

  assassins.forEach((fighter, index) => {
    fighter.x = 170;
    fighter.y = 300 + index * 120;
    fighter.energy = 0;
    fighter.cooldown = 99;
  });
  rangedAlly.x = 300;
  rangedAlly.y = 360;
  rangedAlly.range = 280;
  rangedAlly.baseRange = 280;
  rangedAlly.energy = 0;
  rangedAlly.cooldown = 0;
  battle.enemy.forEach((fighter, index) => {
    fighter.x = index < 2 ? 900 : index === 2 ? 540 : 620;
    fighter.y = index === 0 ? 280 : index === 1 ? 460 : index === 2 ? 360 : 220 + index * 55;
    fighter.attack = 0;
    fighter.armor = 0;
    fighter.dodgeChance = 0;
    fighter.moveSpeed = 0;
    fighter.cooldown = 99;
    fighter.energy = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
  });
  battle.enemy[0].hp = 50_000;
  battle.enemy[1].hp = 75_000;
  const backlineTargetFids = new Set(
    battle.enemy.filter((fighter) => fighter.x === 900).map((fighter) => fighter.fid),
  );
  const focusTargetFid = battle.enemy[0].fid;

  engine.update(0.05);
  assert.equal(battle.engagedTeams.player, true, "远程队友首次出手后应记录己方已经交战");
  assert.ok(assassins.every((fighter) => fighter.jumpPending), "本帧先处理的偷袭成员要到下一帧响应交战信号");

  engine.update(0.05);
  assert.ok(assassins.every((fighter) => !fighter.jumpPending && fighter.jumpTime > 0));
  assert.ok(assassins.every((fighter) => fighter.jumpDelay > 3), "起跳时原等待时间应仍有大量剩余");
  assert.ok(battle.elapsed < 0.2, "不应继续等待原本约 3.4 秒的兜底倒计时");
  assert.ok(
    assassins.every((fighter) => fighter.targetFid === focusTargetFid),
    "多名偷袭成员应集中锁定最后排中最虚弱的目标",
  );
  assert.ok(
    assassins.every((fighter) => backlineTargetFids.has(fighter.targetFid)),
    "偷袭成员不应为了集火改跳前排",
  );
});

test("北欧时停覆盖施法距离内最密集人群", () => {
  const engine = createEngine(206);
  engine.state.round = 6;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "spark_mage", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const mage = battle?.player.find((fighter) => fighter.unitId === "spark_mage");
  assert.ok(battle && mage);

  mage.x = 240;
  mage.y = 260;
  battle.enemy.forEach((fighter, index) => {
    fighter.attack = 0;
    fighter.energy = 0;
    fighter.hp = fighter.maxHp = 99_999;
    if (index < 3) {
      fighter.x = 480 + index * 24;
      fighter.y = 270 + index * 22;
    } else {
      fighter.x = 920;
      fighter.y = 540 - (index - 3) * 130;
    }
  });

  engine.castAbility(mage, battle.enemy);
  const delivery = battle.projectiles.find(
    (projectile) => projectile.impactAbilityId === "spark_mage",
  );
  assert.ok(delivery);
  engine["updateProjectiles"](battle, 1);
  const zone = battle.chronospheres[0];
  assert.ok(zone);
  assert.equal(
    battle.enemy.filter((target) => Math.hypot(target.x - zone.x, target.y - zone.y) <= zone.radius).length,
    3,
    "北欧时停应落在能覆盖三人的密集区域",
  );
  assert.ok(zone.x < 750, "北欧时停不应跟随右侧孤立远敌");
});

test("饼干岁冲向最虚弱友军，治疗护盾并撞开沿途与落点敌人", () => {
  const engine = createEngine(207);
  engine.state.round = 6;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "biscuit_sui", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.state.board[2] = { uid: 3, id: "mossback", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const biscuit = battle?.player.find((fighter) => fighter.unitId === "biscuit_sui");
  const weakest = battle?.player.find((fighter) => fighter.unitId === "sun_guard");
  const healthy = battle?.player.find((fighter) => fighter.unitId === "mossback");
  const pathEnemy = battle?.enemy[0];
  const landingEnemy = battle?.enemy[1];
  assert.ok(battle && biscuit && weakest && healthy && pathEnemy && landingEnemy);

  biscuit.x = 220;
  biscuit.y = 360;
  weakest.x = 540;
  weakest.y = 360;
  weakest.hp = weakest.maxHp * 0.25;
  weakest.shield = 0;
  healthy.x = 300;
  healthy.y = 500;
  healthy.hp = healthy.maxHp;
  pathEnemy.x = 380;
  pathEnemy.y = 360;
  landingEnemy.x = 520;
  landingEnemy.y = 420;
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.cooldown = 99;
    fighter.hp = fighter.maxHp = 99_999;
  });
  const weakestHp = weakest.hp;
  const pathEnemyX = pathEnemy.x;
  const landingEnemyPosition = { x: landingEnemy.x, y: landingEnemy.y };

  biscuit.energy = biscuit.maxEnergy;
  engine["castAbility"](biscuit, battle.enemy, true);
  assert.equal(biscuit.abilityMotion?.targetFid, weakest.fid);
  assert.equal(biscuit.energy, biscuit.castRefund);
  for (let tick = 0; tick < 20 && biscuit.abilityMotion; tick += 1) engine.update(0.05);

  assert.ok(weakest.hp > weakestHp);
  assert.ok(weakest.shield > 0);
  assert.ok(pathEnemy.abilityMotion?.kind === "push" || pathEnemy.x > pathEnemyX);
  assert.ok(
    landingEnemy.abilityMotion?.kind === "push" ||
      Math.hypot(landingEnemy.x - landingEnemyPosition.x, landingEnemy.y - landingEnemyPosition.y) > 1,
  );
  assert.equal(pathEnemy.damageTaken, 0, "暖男回复的撞开效果不应额外造成伤害");
});

test("敌方偷袭成员会跳向我方后排，而不是跳回敌方阵地", () => {
  const engine = createEngine(98);
  engine.state.round = 17;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const target = battle.player[0];
  const assassin = battle.enemy.find((fighter) => fighter.unitId === "youyi");
  assert.ok(target && assassin);

  target.x = 300;
  target.y = 320;
  battle.player.forEach((fighter) => {
    fighter.cooldown = 99;
    fighter.moveSpeed = 0;
    fighter.energy = 0;
  });
  battle.enemy.forEach((fighter) => {
    fighter.x = fighter === assassin ? 900 : 950;
    fighter.y = 320;
    fighter.attack = 0;
    fighter.cooldown = 99;
    fighter.moveSpeed = 0;
    fighter.energy = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
  });
  battle.engagedTeams.enemy = true;

  engine.update(0.05);
  assert.equal(assassin.jumpPending, false);
  assert.ok(assassin.jumpTime > 0);
  assert.ok(assassin.jumpToX < target.x, "敌方偷袭落点应在我方目标的左侧");
  assert.ok(
    Math.hypot(assassin.jumpToX - target.x, assassin.jumpToY - target.y) < 100,
    "敌方偷袭落点应贴近我方后排目标",
  );
});

test("北欧时停按星级成长，并以不可回复的自身能量控制持续时间", () => {
  const expected = [
    { star: 1, radius: 108, duration: 1.8 },
    { star: 2, radius: 132, duration: 2.5 },
    { star: 3, radius: 162, duration: 3.4 },
  ];

  expected.forEach(({ star, radius, duration }) => {
    const engine = createEngine(120 + star);
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "spark_mage", star };
    engine.startBattle();
    const battle = engine.state.battle;
    const source = battle?.player[0];
    assert.ok(battle && source);
    const advance = (seconds) => {
      let remaining = seconds;
      while (remaining > 1e-9) {
        const step = Math.min(0.05, remaining);
        engine.update(step);
        remaining -= step;
      }
    };
    battle.enemy.forEach((fighter, index) => {
      fighter.attack = 0;
      fighter.energy = 0;
      fighter.hp = fighter.maxHp = 99_999;
      fighter.x = source.x + 250 + index * 12;
      fighter.y = source.y + (index - 1) * 20;
    });
    source.cooldown = 99;
    source.moveSpeed = 0;
    source.energy = source.maxEnergy;
    engine.update(0.05);

    const delivery = battle.projectiles.find((projectile) =>
      projectile.style === "aoe_orb" && projectile.impactAbilityId === "spark_mage",
    );
    assert.ok(delivery);
    assert.equal(source.energy, source.maxEnergy);
    assert.equal(battle.chronospheres.length, 0);
    assert.ok(!battle.effects.some((effect) => effect.kind === "chronosphere"));
    engine.update(0.05);
    assert.equal(
      battle.projectiles.filter((projectile) => projectile.impactAbilityId === "spark_mage").length,
      1,
      "时停弹飞行期间不能重复施法",
    );
    engine["updateProjectiles"](battle, 1);
    assert.equal(battle.chronospheres.length, 1);
    const zone = battle.chronospheres[0];
    assert.equal(zone.sourceFid, source.fid);
    assert.equal(zone.radius, radius);
    assert.equal(zone.maxLife, duration);
    assert.ok(Math.abs(zone.life - duration) < 1e-9);
    assert.ok(battle.effects.some((effect) => effect.kind === "chronosphere" && effect.size === radius));

    source.energyPerSecond = 100;
    source.energyOnAttack = 100;
    source.energyOnHit = 100;
    advance(duration * 0.4);
    assert.ok(Math.abs(source.energy - source.maxEnergy * 0.6) < 1e-6);
    assert.ok(Math.abs(zone.life - duration * 0.6) < 1e-6);
    engine["addEnergy"](source, source.maxEnergy);
    assert.ok(Math.abs(source.energy - source.maxEnergy * 0.6) < 1e-6);

    const textState = JSON.parse(engine.renderTextState());
    assert.deepEqual(textState.battle.visualEffects.chronospheres, [{
      x: Math.round(zone.x),
      y: Math.round(zone.y),
      radius,
      remaining: Number((duration * 0.6).toFixed(2)),
      duration,
    }]);

    advance(duration * 0.6);
    assert.equal(source.energy, 0);
    assert.equal(battle.chronospheres.length, 0);
    source.energyPerSecond = 10;
    engine.update(0.1);
    assert.ok(source.energy > 0, "时停结束后应恢复正常充能");
  });
});

test("非自身中心 AOE 弹幕抵达后才同步触发伤害与范围视觉", () => {
  const projectileAbilities = [
    "spark_mage",
    "sui_flower",
    "tower_god",
    "nightin",
    "lian",
  ];

  projectileAbilities.forEach((abilityId, index) => {
    const engine = createEngine(260 + index);
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: abilityId, star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const source = battle?.player[0];
    assert.ok(battle && source);
    source.x = 240;
    source.y = 360;
    battle.effects = [];
    battle.enemy.forEach((target, targetIndex) => {
      target.x = 620 + targetIndex * 28;
      target.y = 350 + targetIndex * 16;
      target.hp = target.maxHp = 99_999;
      target.armor = 0;
      target.dodgeChance = 0;
    });
    const hpBefore = battle.enemy.map((target) => target.hp);

    engine["castAbility"](source, battle.enemy);

    const delivery = battle.projectiles.find((projectile) =>
      projectile.style === "aoe_orb" && projectile.impactAbilityId === abilityId,
    );
    assert.ok(delivery, `${abilityId} 应创建 AOE 投送弹幕`);
    assert.ok(Math.hypot(delivery.x - source.x, delivery.y - source.y) < 1);
    assert.deepEqual(battle.enemy.map((target) => target.hp), hpBefore, `${abilityId} 不应在起手帧提前伤害`);
    assert.ok(!battle.effects.some((effect) =>
      ["ring", "chronosphere", "hotpot"].includes(effect.kind)
      && Math.hypot(effect.x - battle.enemy[0].x, effect.y - battle.enemy[0].y) < 160
    ), `${abilityId} 不应在弹幕抵达前提前显示 AOE`);

    engine["updateProjectiles"](battle, 1);

    assert.ok(!battle.projectiles.some((projectile) => projectile.impactAbilityId === abilityId));
    assert.ok(battle.effects.some((effect) =>
      ["ring", "chronosphere", "hotpot"].includes(effect.kind)
      && Math.hypot(effect.x - battle.enemy[0].x, effect.y - battle.enemy[0].y) < 40
    ), `${abilityId} 抵达后应在固定落点显示 AOE`);
    if (abilityId === "spark_mage") assert.equal(battle.chronospheres.length, 1);
    else assert.ok(battle.enemy.some((target, targetIndex) => target.hp < hpBefore[targetIndex]), `${abilityId} 抵达后应结算伤害`);
  });
});

test("病院坂灵仅缓慢自动回能，攻击与受击均不回能", () => {
  const engine = createEngine(270);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rei", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const rei = battle?.player[0];
  const enemy = battle?.enemy[0];
  assert.ok(battle && rei && enemy);
  assert.equal(rei.energy, 25);
  rei.x = 500;
  rei.y = 360;
  enemy.x = 520;
  enemy.y = 360;
  rei.energy = 0;
  rei.cooldown = 0;
  enemy.cooldown = 0;

  engine.basicAttack(rei, enemy);
  assert.equal(rei.energy, 0);
  engine.basicAttack(enemy, rei);
  assert.equal(rei.energy, 0);

  [...battle.player, ...battle.enemy].forEach((fighter) => {
    fighter.attack = 0;
    fighter.cooldown = 99;
  });
  for (let tick = 0; tick < 20; tick += 1) engine.update(0.05);
  assert.ok(Math.abs(rei.energy - 5) < 0.001);
});

test("病院坂灵按星级等待足量新尸体，并把敌我尸体以四分之一血复活为己方幽灵", () => {
  [
    { star: 1, expected: 2 },
    { star: 2, expected: 3 },
    { star: 3, expected: 5 },
  ].forEach(({ star, expected }, scenario) => {
    const engine = createEngine(272 + scenario);
    engine.state.round = 22;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "rei", star };
    engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
    engine.startBattle();
    const battle = engine.state.battle;
    const rei = battle?.player.find((fighter) => fighter.unitId === "rei");
    const fallenAlly = battle?.player.find((fighter) => fighter.unitId === "sun_guard");
    assert.ok(battle && rei && fallenAlly && battle.enemy.length >= 10);
    rei.x = 500;
    rei.y = 360;
    fallenAlly.x = 525;
    fallenAlly.y = 360;
    engine["killFighter"](fallenAlly);
    battle.enemy.slice(0, expected - 2).forEach((fighter, index) => {
      fighter.x = 590 + (index % 5) * 16;
      fighter.y = 290 + Math.floor(index / 5) * 100 + (index % 2) * 14;
      engine["killFighter"](fighter);
    });
    rei.energy = rei.maxEnergy;
    engine["castAbility"](rei, battle.enemy);
    assert.equal(rei.energy, rei.maxEnergy, "未达到当前星级尸体数量时不应消耗能量");
    assert.equal(battle.player.filter((fighter) => fighter.reiRevival).length, 0);

    const finalCorpse = battle.enemy[expected - 2];
    finalCorpse.x = 600;
    finalCorpse.y = 360;
    engine["killFighter"](finalCorpse);
    engine["castAbility"](rei, battle.enemy);
    const ghosts = battle.player.filter((fighter) => fighter.reiRevival);
    assert.equal(ghosts.length, expected);
    assert.ok(ghosts.every((fighter) => fighter.team === "player"));
    assert.ok(ghosts.every((fighter) => fighter.hp === fighter.maxHp * 0.25));
    assert.ok(ghosts.some((fighter) => fighter.unitId === "sun_guard"), "己方尸体也应能被返场");
    assert.equal(battle.corpses.filter((corpse) => corpse.consumed).length, expected);
    assert.match(battle.banner, new RegExp(`${expected} 名幽灵加入我方`));
    if (star === 1) {
      const corpseCount = battle.corpses.length;
      engine["killFighter"](ghosts[0]);
      assert.equal(battle.corpses.length, corpseCount, "Rei 复活的幽灵死亡后不能再次提供尸体");
    }
  });
});

test("多个病院坂灵会消费互不重复的尸体", () => {
  const engine = createEngine(276);
  engine.state.round = 22;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rei", star: 3 };
  engine.state.board[1] = { uid: 2, id: "rei", star: 3 };
  engine.startBattle();
  const battle = engine.state.battle;
  const [firstRei, secondRei] = battle?.player || [];
  assert.ok(battle && firstRei?.unitId === "rei" && secondRei?.unitId === "rei");
  assert.ok(battle.enemy.length >= 10);
  firstRei.x = 500;
  firstRei.y = 340;
  secondRei.x = 500;
  secondRei.y = 390;
  battle.enemy.slice(0, 10).forEach((fighter, index) => {
    fighter.x = 590 + (index % 5) * 16;
    fighter.y = 290 + Math.floor(index / 5) * 100 + (index % 2) * 14;
    engine["killFighter"](fighter);
  });

  firstRei.energy = firstRei.maxEnergy;
  engine["castAbility"](firstRei, battle.enemy);
  const firstConsumed = new Set(
    battle.corpses.filter((corpse) => corpse.consumed).map((corpse) => corpse.id),
  );
  assert.equal(firstConsumed.size, 5);

  secondRei.energy = secondRei.maxEnergy;
  engine["castAbility"](secondRei, battle.enemy);
  const allConsumed = battle.corpses
    .filter((corpse) => corpse.consumed)
    .map((corpse) => corpse.id);
  const secondConsumed = allConsumed.filter((corpseId) => !firstConsumed.has(corpseId));
  assert.equal(secondConsumed.length, 5);
  assert.equal(new Set(allConsumed).size, 10);
  assert.equal(battle.player.filter((fighter) => fighter.reiRevival).length, 10);
});

test("刺客在拥挤后排选择有界的最高空隙落点", () => {
  const engine = createEngine(97);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rift_stalker", star: 1 };
  engine.state.board[1] = { uid: 2, id: "akirinco", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const assassin = battle.player[0];
  battle.enemy.forEach((fighter, index) => {
    fighter.x = 970;
    fighter.y = 260 + index * 55;
    fighter.attack = 0;
  });
  stepBattle(engine, 70);
  assert.equal(assassin.jumpPending, false);
  assertInsideBattleBounds({ ...assassin, x: assassin.jumpToX, y: assassin.jumpToY });
  const plannedClearance = Math.min(...battle.enemy.map((enemy) =>
    Math.hypot(assassin.jumpToX - enemy.x, assassin.jumpToY - enemy.y) - assassin.radius - enemy.radius,
  ));
  assert.ok(plannedClearance > -assassin.radius);
});

test("能量按未闪避命中回收，护盾吸收仍会回能", () => {
  const engine = createEngine(45);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const source = battle.player[0];
  const target = battle.enemy[0];
  source.x = 300; source.y = 300; source.cooldown = 0; source.energy = 0;
  target.x = 345; target.y = 300; target.energy = 0; target.shield = 99_999; target.dodgeChance = 0;
  engine.update(0.05);
  assert.equal(source.energy, source.energyPerSecond * 0.05 + source.energyOnAttack);
  assert.equal(target.energy, target.energyPerSecond * 0.05 + target.energyOnHit);
});

test("能能弄你的苹果派会以节奏分离的 8 发子弹重定向目标", () => {
  const engine = createEngine(57);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "nori", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const nori = battle?.player.find((fighter) => fighter.unitId === "nori");
  assert.ok(battle && nori);
  const [firstTarget, secondTarget] = battle.enemy;
  assert.ok(firstTarget && secondTarget);
  battle.player.forEach((fighter) => { fighter.cooldown = 99; });
  battle.enemy.forEach((fighter, index) => {
    fighter.attack = 0;
    fighter.armor = 0;
    fighter.shield = 0;
    fighter.dodgeChance = 0;
    fighter.x = 900 + index * 20;
    fighter.y = 300;
  });
  nori.x = 300;
  nori.y = 300;
  nori.energy = nori.maxEnergy;
  firstTarget.x = 500;
  firstTarget.hp = 1;
  firstTarget.maxHp = 1;
  secondTarget.x = 700;
  secondTarget.hp = 9_999;
  secondTarget.maxHp = 9_999;

  engine.update(0.05);
  assert.equal(nori.applePieShotsRemaining, 8);
  assert.ok(battle.effects.some((effect) => effect.kind === "burst"));
  assert.ok(!battle.effects.some((effect) => effect.kind === "ring" && effect.x === nori.x && effect.y === nori.y));
  assert.equal(secondTarget.hp, 9_999);

  engine.update(0.05);
  assert.equal(nori.applePieShotsRemaining, 7);
  assert.ok(battle.projectiles.some((projectile) => projectile.sourceFid === nori.fid));

  for (let tick = 0; tick < 42; tick += 1) engine.update(0.05);
  assert.equal(nori.applePieShotsRemaining, 0);
  assert.equal(firstTarget.alive, false);
  assert.ok(secondTarget.hp < 9_999);
  assert.ok(nori.damageDealt > 1);
});

test("苹果派在眩晕期间暂停且施法者死亡后不再发射", () => {
  const engine = createEngine(58);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "nori", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const nori = battle?.player.find((fighter) => fighter.unitId === "nori");
  assert.ok(battle && nori);
  const target = battle.enemy[0];
  battle.player.forEach((fighter) => { fighter.cooldown = 99; });
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.armor = 0;
    fighter.shield = 0;
    fighter.dodgeChance = 0;
    fighter.hp = 9_999;
    fighter.maxHp = 9_999;
    fighter.x = 300 + nori.range - 1;
    fighter.y = 300;
  });
  nori.x = 300;
  nori.y = 300;
  nori.energy = nori.maxEnergy;

  engine.update(0.05);
  engine.update(0.05);
  assert.equal(nori.applePieShotsRemaining, 7);
  nori.stun = 0.3;
  for (let tick = 0; tick < 5; tick += 1) engine.update(0.05);
  assert.equal(nori.applePieShotsRemaining, 7);

  nori.alive = false;
  nori.hp = 0;
  const remainingShots = nori.applePieShotsRemaining;
  for (let tick = 0; tick < 5; tick += 1) engine.update(0.05);
  assert.equal(nori.applePieShotsRemaining, remainingShots);
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

test("精英关、主线通关与地狱入口会在备战前发出预警", () => {
  const engine = createEngine(74);
  const completeWonRound = (round) => {
    engine.state.round = round;
    engine.state.phase = "result";
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

  completeWonRound(3);
  assert.equal(engine.state.round, 4);
  assert.equal(engine.currentWave.tag, "elite");
  assert.equal(engine.state.toast?.text, gameData.ELITE_WARNING_TEXT);

  completeWonRound(16);
  assert.equal(engine.state.endlessUnlocked, true);
  assert.equal(engine.state.phase, "augment");
  assert.match(engine.state.toast?.text || "", /16 战通关.*31 战后/);
  engine.chooseAugment(0);
  assert.equal(engine.state.round, 17);

  completeWonRound(20);
  assert.equal(engine.state.round, 21);
  assert.equal(engine.state.toast?.text, gameData.BOSS_WARNING_TEXT);

  completeWonRound(31);
  assert.equal(engine.state.round, 32);
  assert.equal(engine.state.toast?.text, gameData.HELL_WARNING_TEXT);
});

test("敌方成熟与流量羁绊会实际写入战斗属性", () => {
  const matureEngine = createEngine(2);
  matureEngine.state.round = 3;
  matureEngine.startBattle();
  const cinderRam = matureEngine.state.battle.enemy.find((fighter) => fighter.unitId === "cinder_ram");
  const clockGunner = matureEngine.state.battle.enemy.find((fighter) => fighter.unitId === "clock_gunner");
  const sparkMage = matureEngine.state.battle.enemy.find((fighter) => fighter.unitId === "spark_mage");
  assert.equal(cinderRam.matureMember, true);
  assert.equal(clockGunner.matureMember, true);
  assert.ok(cinderRam.shield >= cinderRam.maxHp * 0.099);
  assert.ok(clockGunner.shield >= clockGunner.maxHp * 0.099);
  assert.equal(sparkMage.matureMember, false);
  assert.equal(sparkMage.shield, 0);

  const trafficEngine = createEngine(4);
  trafficEngine.state.round = 4;
  trafficEngine.startBattle();
  const trafficMembers = trafficEngine.state.battle.enemy.filter(
    (fighter) => gameData.UNIT_DEFS[fighter.unitId].traits.includes("traffic"),
  );
  assert.equal(trafficMembers.length, 2);
  trafficMembers.forEach((fighter) => assert.ok(fighter.lifesteal > 0));
});

test("第二战低费固定阵容不会压制正常投入的三人阵容", () => {
  const engine = new AutoChessEngine(121);
  engine.state.starterChoices = ["traffic_start"];
  engine.startRun("traffic_start");
  engine.state.round = 2;
  engine.state.playerLevel = 3;
  engine.state.board.fill(null);
  ["clock_gunner", "sui_blue", "dawn_duelist"].forEach((id, index) => {
    engine.state.board[[4, 10, 16][index]] = { uid: index + 1, id, star: 1 };
  });

  engine.startBattle();
  for (let tick = 0; tick < 600 && engine.state.phase === "battle"; tick += 1) {
    engine.update(0.05);
  }

  assert.equal(engine.state.result.won, true);
  assert.ok(engine.state.battle.player.some((fighter) => fighter.alive));
});

test("弥希双声道与初濑蝙蝠夜歌会完成控制和团队治疗", () => {
  const mikiEngine = createEngine(18);
  mikiEngine.state.board.fill(null);
  mikiEngine.state.board[0] = { uid: 1, id: "miki_guest", star: 1 };
  mikiEngine.startBattle();
  const mikiBattle = mikiEngine.state.battle;
  const miki = mikiBattle.player[0];
  mikiBattle.enemy.forEach((fighter, index) => {
    fighter.x = 720 + index * 28;
    fighter.y = 320;
    fighter.hp = fighter.maxHp = 2_000;
  });
  const mikiEnemyHp = mikiBattle.enemy.map((fighter) => fighter.hp);
  mikiEngine["castAbility"](miki, mikiBattle.enemy);
  mikiBattle.enemy.forEach((fighter, index) => {
    assert.ok(fighter.hp < mikiEnemyHp[index]);
    assert.ok(fighter.stun >= 0.62);
  });

  const hatsuseEngine = createEngine(19);
  hatsuseEngine.state.playerLevel = 4;
  hatsuseEngine.state.board.fill(null);
  hatsuseEngine.state.board[0] = { uid: 1, id: "hatsuse_guest", star: 1 };
  hatsuseEngine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  hatsuseEngine.startBattle();
  const hatsuseBattle = hatsuseEngine.state.battle;
  const hatsuse = hatsuseBattle.player.find((fighter) => fighter.unitId === "hatsuse_guest");
  const woundedAlly = hatsuseBattle.player.find((fighter) => fighter.unitId === "sun_guard");
  woundedAlly.hp = woundedAlly.maxHp * 0.4;
  hatsuseBattle.enemy.forEach((fighter) => {
    fighter.hp = fighter.maxHp = 2_000;
  });
  const allyHp = woundedAlly.hp;
  const enemyHp = hatsuseBattle.enemy.map((fighter) => fighter.hp);
  hatsuseEngine["castAbility"](hatsuse, hatsuseBattle.enemy);
  assert.ok(woundedAlly.hp > allyHp);
  hatsuseBattle.enemy.forEach((fighter, index) => {
    assert.ok(fighter.hp < enemyHp[index]);
  });
});

test("二星七海与三星饼干岁可帮助高存款七人阵容通过后段精英，但终局首领仍要求继续投入", () => {
  const slots = [4, 5, 10, 11, 16, 17, 22];
  const lineup = [
    ["spark_mage", 1],
    ["lian", 1],
    ["nori", 2],
    ["youyi", 2],
    ["grove_mender", 2],
    ["biscuit_sui", 3],
    ["yua", 1],
  ];
  const prepareScreenshotLineup = (engine, round) => {
    engine.state.round = round;
    engine.state.playerLevel = 7;
    engine.state.board.fill(null);
    slots.forEach((slot, index) => {
      const [id, star] = lineup[index];
      engine.state.board[slot] = { uid: index + 1, id, star };
    });
    engine.state.augments = ["sharp_edge", "execution"];
  };

  const eliteEngine = createEngine(2);
  prepareScreenshotLineup(eliteEngine, 12);
  eliteEngine.startBattle();
  for (let tick = 0; tick < 600 && eliteEngine.state.phase === "battle"; tick += 1) {
    eliteEngine.update(0.05);
  }
  assert.equal(
    eliteEngine.state.result.won,
    true,
    JSON.stringify({
      allies: eliteEngine.state.battle.player.map((unit) => ({
        id: unit.unitId,
        alive: unit.alive,
        hp: Math.round(unit.hp),
        damage: Math.round(unit.damageDealt),
        healing: Math.round(unit.healingDone),
        shielding: Math.round(unit.shieldingDone),
      })),
      enemies: eliteEngine.state.battle.enemy.map((unit) => ({
        id: unit.unitId,
        star: unit.star,
        alive: unit.alive,
        hp: Math.round(unit.hp),
        damage: Math.round(unit.damageDealt),
      })),
    }),
  );

  const bossEngine = createEngine(4);
  prepareScreenshotLineup(bossEngine, 16);
  bossEngine.startBattle();
  for (let tick = 0; tick < 600 && bossEngine.state.phase === "battle"; tick += 1) {
    bossEngine.update(0.05);
  }
  assert.equal(bossEngine.state.result.won, false);
  assert.ok(bossEngine.state.battle.enemy.some((unit) => unit.alive));
});

test("无限后段敌军突破十人后使用多行阵型且文本状态公开主题", () => {
  const engine = createEngine(42);
  engine.state.round = 32;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sun_guard", star: 3 };
  engine.startBattle();

  const battle = engine.state.battle;
  assert.equal(battle.enemy.length, 14);
  assert.equal(new Set(battle.enemy.map(({ x, y }) => `${x},${y}`)).size, 14);
  assert.equal(new Set(battle.enemy.map(({ y }) => y)).size, 5);
  battle.enemy.forEach(assertInsideBattleBounds);

  const textState = JSON.parse(engine.renderTextState());
  assert.equal(textState.wave.enemyCount, 14);
  assert.equal(textState.wave.formationTheme, "终焉守门人");
  assert.equal(textState.wave.units.length, textState.wave.enemyCount);
});

test("我方天赋不会成为敌方的隐藏天赋加成", () => {
  const createBossBattle = (augments) => {
    const engine = createEngine(43);
    engine.state.round = 21;
    engine.state.augments = augments;
    engine.startBattle();
    return engine;
  };
  const plain = createBossBattle([]);
  const augmented = createBossBattle([
    "tempered",
    "overclock",
    "sharp_edge",
    "united_front",
  ]);

  assert.equal(JSON.parse(plain.renderTextState()).wave.formationTheme, "时停合唱团");
  assert.deepEqual(
    augmented.state.battle.enemy.map(({ unitId, star, maxHp, attack, armor }) => ({
      unitId,
      star,
      maxHp,
      attack,
      armor,
    })),
    plain.state.battle.enemy.map(({ unitId, star, maxHp, attack, armor }) => ({
      unitId,
      star,
      maxHp,
      attack,
      armor,
    })),
  );
});

test("十名三星高费阵容会在三十二战后遇到终局压力", () => {
  const slots = [0, 4, 5, 6, 10, 11, 12, 16, 17, 23];
  const fiveCostLineup = [
    "grove_mender",
    "cinder_ram",
    "rei",
    "rutice",
    "lian",
  ];
  const fightRound = (round) => {
    const engine = createEngine(77);
    engine.state.round = round;
    engine.state.playerLevel = 10;
    engine.state.board.fill(null);
    slots.forEach((slot, index) => {
      engine.state.board[slot] = {
        uid: index + 1,
        id: fiveCostLineup[index % fiveCostLineup.length],
        star: 3,
      };
    });
    engine.state.augments = [
      "tempered",
      "overclock",
      "sharp_edge",
      "execution",
      "united_front",
    ];
    engine.startBattle();
    for (let tick = 0; tick < 600 && engine.state.phase === "battle"; tick += 1) {
      engine.update(0.05);
    }
    return engine;
  };

  const round32 = fightRound(32);
  assert.equal(round32.state.result.won, true);
  const round42 = fightRound(42);
  assert.equal(round42.state.result.won, false);
  assert.ok(round42.state.battle.enemy.some((unit) => unit.alive));
});

test("通过精英关的阵容可以连续三场普通关攒钱", () => {
  const slots = [4, 5, 10, 11, 16, 17, 22];
  const lineup = [
    "spark_mage",
    "lian",
    "nori",
    "youyi",
    "grove_mender",
    "mumu",
    "yua",
  ];

  [12, 13, 14, 15].forEach((round) => {
    const engine = createEngine(2);
    engine.state.round = round;
    engine.state.playerLevel = 7;
    engine.state.board.fill(null);
    slots.forEach((slot, index) => {
      engine.state.board[slot] = { uid: index + 1, id: lineup[index], star: 2 };
    });
    engine.state.augments = ["sharp_edge", "execution"];
    engine.startBattle();
    for (let tick = 0; tick < 600 && engine.state.phase === "battle"; tick += 1) {
      engine.update(0.05);
    }
    assert.equal(engine.state.result.won, true, `round ${round} should not require another spend`);
  });
});

test("普通利息每 5 金币提供 1 点并在 20 金币封顶", () => {
  const engine = createEngine(300);
  engine.state.gold = 19;
  assert.equal(engine.interestIncome, 3);
  engine.state.gold = 20;
  assert.equal(engine.interestIncome, 4);
  engine.state.gold = 35;
  assert.equal(engine.interestIncome, 4);
});

test("理财在结算增加收入，高档按每 4 金币计算并在 20 利息封顶", () => {
  const lowTierEngine = createEngine(301);
  lowTierEngine.state.playerLevel = 4;
  lowTierEngine.state.board.fill(null);
  lowTierEngine.state.board[0] = { uid: 1, id: "sui_blue", star: 1 };
  lowTierEngine.state.board[1] = { uid: 2, id: "shiori", star: 1 };
  lowTierEngine.state.gold = 20;
  assert.equal(lowTierEngine.getTraitStatus("finance").level, 1);
  assert.equal(lowTierEngine.interestIncome, 4);
  assert.equal(lowTierEngine.financeIncomeBonus, 2);
  lowTierEngine.startBattle();
  lowTierEngine.state.battle.enemy.forEach((fighter) => { fighter.hp = 0; fighter.alive = false; });
  lowTierEngine.update(0.05);
  assert.equal(lowTierEngine.state.result.income, 8);
  assert.equal(lowTierEngine.state.result.bounty, 2);
  assert.match(lowTierEngine.state.result.detail, /理财 2/);

  const highTierEngine = createEngine(302);
  highTierEngine.state.playerLevel = 6;
  highTierEngine.state.board.fill(null);
  ["sui_blue", "sui_flower", "shiori", "grove_mender"].forEach((id, index) => {
    highTierEngine.state.board[index] = { uid: index + 1, id, star: 1 };
  });
  highTierEngine.state.gold = 35;
  assert.equal(highTierEngine.getTraitStatus("finance").level, 2);
  assert.equal(highTierEngine.interestIncome, 8);
  highTierEngine.startBattle();
  highTierEngine.state.battle.enemy.forEach((fighter) => { fighter.hp = 0; fighter.alive = false; });
  highTierEngine.update(0.05);
  assert.equal(highTierEngine.state.result.income, 12);
  highTierEngine.state.gold = 79;
  assert.equal(highTierEngine.interestIncome, 19);
  highTierEngine.state.gold = 80;
  assert.equal(highTierEngine.interestIncome, 20);
  highTierEngine.state.gold = 200;
  assert.equal(highTierEngine.interestIncome, 20);
});

test("每颗敌方星级提供一金币结算金，失败也结算完整敌方阵容", () => {
  const engine = createEngine(304);
  engine.state.gold = 0;
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  battle.enemy[0].star = 2;
  battle.enemy[0].hp = 0;
  battle.enemy[0].alive = false;
  battle.player.forEach((fighter) => { fighter.hp = 0; fighter.alive = false; });
  engine.update(0.05);
  assert.equal(engine.state.result.won, false);
  assert.equal(engine.state.result.bounty, 3);
  assert.equal(engine.state.result.income, 3);
  assert.equal(engine.state.result.defeatedEnemies, 1);
  assert.deepEqual(engine.state.result.defeatedByStar, { 1: 0, 2: 1, 3: 0 });
  assert.match(engine.state.result.detail, /阵容结算 3（敌军1星×1、2星×1；击败 1\/2）/);
});

test("连续升本可以到达十本并上阵十人", () => {
  const engine = createEngine(306);
  engine.state.gold = 1000;
  while (!engine.isMaxPlayerLevel) engine.buyExperience();
  assert.equal(engine.state.playerLevel, 10);
  assert.equal(engine.boardCap, 10);
  assert.equal(engine.upgradeCost, null);
});

test("自然减费可降到零，溢出减费会结转并连续抵扣后续本级", () => {
  const engine = createEngine(307);
  engine.state.upgradeRemaining = 1;

  const finishRound = () => {
    engine.startBattle();
    assert.ok(engine.state.battle);
    engine.state.battle.enemy.forEach((fighter) => {
      fighter.hp = 0;
      fighter.alive = false;
    });
    engine.update(0.05);
    assert.equal(engine.state.result.upgradeDiscount, 1);
    engine.continueAfterResult();
    if (engine.state.phase === "augment") engine.chooseAugment(0);
  };

  finishRound();
  assert.equal(engine.upgradeCost, 0);
  assert.equal(engine.state.upgradeDiscountCarry, 0);

  finishRound();
  assert.equal(engine.upgradeCost, 0);
  assert.equal(engine.state.upgradeDiscountCarry, 1);

  engine.state.gold = 0;
  engine.buyExperience();
  assert.equal(engine.state.playerLevel, 4);
  assert.equal(engine.upgradeCost, 8);
  assert.equal(engine.state.upgradeDiscountCarry, 0);

  engine.state.upgradeRemaining = 0;
  engine.state.upgradeDiscountCarry = 25;
  engine.buyExperience();
  assert.equal(engine.state.playerLevel, 5);
  assert.equal(engine.upgradeCost, 0);
  assert.equal(engine.state.upgradeDiscountCarry, 11);
  engine.buyExperience();
  assert.equal(engine.state.playerLevel, 6);
  assert.equal(engine.upgradeCost, 9);
  assert.equal(engine.state.upgradeDiscountCarry, 0);

  const textState = JSON.parse(engine.renderTextState());
  assert.equal(textState.player.upgradeRemaining, 9);
  assert.equal(textState.player.upgradeDiscountCarry, 0);
});

test("敌方阵容为空时花呗只抵扣当回合收入，不会产生负金币", () => {
  const engine = createEngine(305);
  engine.state.gold = 0;
  engine.state.paydayDebtRounds = 1;
  engine.startBattle();
  engine.state.battle.enemy = [];
  engine["finishBattle"](false);
  assert.equal(engine.state.result.bounty, 0);
  assert.equal(engine.state.result.income, 0);
  assert.equal(engine.state.gold, 0);
  assert.equal(engine.state.paydayDebtRounds, 0);
});

test("流量在每个备战回合按羁绊等级重置免费刷新次数", () => {
  const engine = createEngine(303);
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  ["sun_guard", "dawn_duelist", "sui_blue", "meme", "zeyin", "tiandou"].forEach((id, index) => {
    engine.state.board[index] = { uid: index + 1, id, star: 1 };
  });
  engine.state.gold = 10;
  engine.state.freeRerollCharges = 0;
  engine["prepareNextRound"]();
  assert.equal(engine.getTraitStatus("traffic").level, 3);
  assert.equal(engine.state.freeRerollCharges, 3);
  engine.rerollShop();
  engine.rerollShop();
  engine.rerollShop();
  assert.equal(engine.state.gold, 10);
  assert.equal(engine.state.freeRerollCharges, 0);
  engine.rerollShop();
  assert.equal(engine.state.gold, 9);
});

test("四流量为全队提供技能可触发的全能吸血", () => {
  const engine = createEngine(304);
  engine.state.playerLevel = 6;
  engine.state.board.fill(null);
  ["sun_guard", "dawn_duelist", "sui_blue", "meme", "rift_stalker", "clock_gunner"].forEach((id, index) => {
    engine.state.board[index] = { uid: index + 1, id, star: 1 };
  });
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const trafficMember = battle.player.find((fighter) => fighter.unitId === "sui_blue");
  const meleeAlly = battle.player.find((fighter) => fighter.unitId === "rift_stalker");
  const rangedAlly = battle.player.find((fighter) => fighter.unitId === "clock_gunner");
  assert.ok(trafficMember && meleeAlly && rangedAlly);
  assert.ok(Math.abs(trafficMember.lifesteal - 0.28) < 0.0001);
  assert.equal(meleeAlly.lifesteal, 0.08);
  assert.equal(rangedAlly.lifesteal, 0.08);

  meleeAlly.hp = meleeAlly.maxHp * 0.5;
  battle.enemy.forEach((enemy) => {
    enemy.hp = enemy.maxHp = 9_999;
    enemy.armor = 0;
    enemy.dodgeChance = 0;
  });
  const hpBeforeAbility = meleeAlly.hp;
  engine["castAbility"](meleeAlly, battle.enemy);
  for (let tick = 0; tick < 10 && meleeAlly.abilityMotion; tick += 1) {
    engine["updateAbilityMotion"](meleeAlly, 0.05, battle);
  }
  assert.ok(meleeAlly.hp > hpBeforeAbility, "近战非流量友军的技能伤害应触发全能吸血");
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

test("老弥召唤的机械兔耳移动射击且伤害归属老弥", () => {
  const engine = createEngine(95);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "clock_gunner", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const owner = battle?.player[0];
  assert.ok(battle && owner);
  battle.enemy.forEach((fighter, index) => {
    fighter.hp = fighter.maxHp = 9_999;
    fighter.armor = 0;
    fighter.attack = 0;
    fighter.dodgeChance = 0;
    fighter.x = 300 + index * 100;
    fighter.y = owner.y;
  });
  const playerCount = battle.player.length;
  owner.energy = owner.maxEnergy;
  engine.update(0.05);
  assert.equal(battle.pets.length, 2);
  assert.equal(battle.player.length, playerCount);
  assert.ok(battle.pets.every((pet) => pet.ownerFid === owner.fid));
  assert.ok(battle.pets.every((pet) => pet.life <= 4));
  const firstPair = battle.pets.map((pet) => pet.id);
  owner.energy = owner.maxEnergy;
  engine.update(0.05);
  assert.equal(battle.pets.length, 2);
  assert.notDeepEqual(battle.pets.map((pet) => pet.id), firstPair);
  battle.projectiles = [];
  const petBeforeShot = battle.pets[0];
  engine.update(0.05);
  const projectile = battle.projectiles.find((entry) => entry.sourceFid === owner.fid);
  assert.ok(projectile);
  const currentMuzzle = mechanicalRabbitMuzzle(petBeforeShot);
  assert.ok(Math.hypot(currentMuzzle.x - petBeforeShot.x, currentMuzzle.y - petBeforeShot.y) > petBeforeShot.radius);
  assert.ok(Math.hypot(projectile.x - petBeforeShot.x, projectile.y - petBeforeShot.y) > petBeforeShot.radius);
  assert.notEqual(petBeforeShot.repositionX, null);
  const targetDistanceBeforeDash = Math.hypot(battle.enemy[0].x - petBeforeShot.x, battle.enemy[0].y - petBeforeShot.y);
  const positionBeforeDash = { x: petBeforeShot.x, y: petBeforeShot.y };
  const flankTarget = { x: petBeforeShot.repositionX, y: petBeforeShot.repositionY };
  engine.update(0.05);
  const targetDistanceAfterDash = Math.hypot(battle.enemy[0].x - petBeforeShot.x, battle.enemy[0].y - petBeforeShot.y);
  assert.ok(Math.hypot(petBeforeShot.x - flankTarget.x, petBeforeShot.y - flankTarget.y) < Math.hypot(positionBeforeDash.x - flankTarget.x, positionBeforeDash.y - flankTarget.y));
  assert.ok(Math.abs(targetDistanceAfterDash - targetDistanceBeforeDash) < 30);
  const diagonalPet = { ...petBeforeShot, x: 100, y: 200, radius: 10, aimX: 0.6, aimY: -0.8 };
  const diagonalMuzzle = mechanicalRabbitMuzzle(diagonalPet);
  const muzzleOffset = Math.hypot(diagonalMuzzle.x - diagonalPet.x, diagonalMuzzle.y - diagonalPet.y);
  assert.ok(Math.abs((diagonalMuzzle.x - diagonalPet.x) / muzzleOffset - 0.6) < 0.001);
  assert.ok(Math.abs((diagonalMuzzle.y - diagonalPet.y) / muzzleOffset + 0.8) < 0.001);
  battle.enemy[0].x = petBeforeShot.x + 120;
  battle.enemy[0].y = petBeforeShot.y - 160;
  engine.update(0.05);
  stepBattle(engine, 28);
  assert.ok(owner.damageDealt > 0);
  assert.equal(engine.getBattleRanking()[0].fighter.fid, owner.fid);
  owner.hp = 0;
  owner.alive = false;
  engine.update(0.05);
  assert.equal(battle.pets.length, 0);
});

test("邪恶外星人的贯穿光线沿目标方向发射并命中同线敌人", () => {
  const engine = createEngine(96);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "yua", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  assert.ok(battle && source);
  const target = battle.enemy[0];
  const aligned = { ...target, fid: "test-aligned", x: 500, y: 320 };
  const outside = { ...target, fid: "test-outside", x: 500, y: 440 };
  battle.enemy.push(aligned, outside);
  [target, aligned, outside].forEach((fighter) => {
    fighter.hp = fighter.maxHp = 9_999;
    fighter.armor = 0;
    fighter.attack = 0;
    fighter.dodgeChance = 0;
  });
  target.x = 400; target.y = 400;
  source.x = 200; source.y = 560;
  assert.equal(source.energyStyle, "alien");
  assert.equal(source.maxEnergy, 75);
  assert.equal(source.energy, 10);
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.ok(target.hp < target.maxHp);
  assert.ok(aligned.hp < aligned.maxHp);
  assert.equal(outside.hp, outside.maxHp);
  const beam = battle.effects.find((effect) => effect.kind === "line" && effect.size === 8);
  assert.ok(beam && beam.x2 !== undefined && beam.y2 !== undefined);
  const targetCrossProduct = (target.x - beam.x) * (beam.y2 - beam.y)
    - (target.y - beam.y) * (beam.x2 - beam.x);
  assert.ok(Math.abs(targetCrossProduct) < 0.001);
});

test("泽音涅槃有专属特效，重生后短时普攻后退且不会退出射程", () => {
  const engine = createEngine(97);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "zeyin", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const zeyin = battle?.player.find((fighter) => fighter.unitId === "zeyin");
  assert.ok(battle && zeyin);
  battle.enemy.forEach((fighter, index) => {
    fighter.hp = fighter.maxHp = 99_999;
    fighter.attack = 0;
    fighter.armor = 99_999;
    fighter.x = 500 + index * 80;
    fighter.y = 360;
  });
  zeyin.x = 280;
  zeyin.y = 360;
  const zeyinMaxHp = zeyin.maxHp;
  const zeyinBaseAttack = zeyin.baseAttack;
  const zeyinBaseInterval = zeyin.baseAttackInterval;
  engine["damage"](battle.enemy[0], zeyin, 99_999);
  assert.equal(zeyin.alive, true);
  assert.equal(zeyin.reborn, true);
  assert.equal(zeyin.attackType, "ranged");
  assert.equal(zeyin.range, 245);
  assert.equal(zeyin.maxHp, Math.round(zeyinMaxHp * 0.72));
  assert.equal(zeyin.hp, zeyin.maxHp);
  assert.ok(zeyin.baseAttack >= zeyinBaseAttack * 1.35);
  assert.ok(zeyin.baseAttackInterval < zeyinBaseInterval * 0.71);
  assert.equal(zeyin.rebirthRecoilTime, 4);
  assert.ok(battle.effects.some((effect) => effect.kind === "rebirth"));

  const target = battle.enemy[0];
  target.x = 400;
  target.y = 360;
  target.armor = 0;
  const distanceBeforeRecoil = Math.hypot(target.x - zeyin.x, target.y - zeyin.y);
  engine["basicAttack"](zeyin, target);
  const recoil = zeyin.abilityMotion;
  assert.equal(recoil?.kind, "push");
  assert.equal(recoil?.abilityId, null);
  assert.ok(recoil && recoil.toX < recoil.fromX);
  const recoilLandingDistance = Math.hypot(target.x - recoil.toX, target.y - recoil.toY);
  assert.ok(recoilLandingDistance > distanceBeforeRecoil);
  assert.ok(recoilLandingDistance <= zeyin.range - 3.9);

  engine["updateAbilityMotion"](zeyin, 0.08, battle);
  assert.ok(zeyin.x < recoil.fromX);
  engine["updateAbilityMotion"](zeyin, 0.08, battle);
  assert.equal(zeyin.abilityMotion, null);
  assert.ok(Math.hypot(target.x - zeyin.x, target.y - zeyin.y) > distanceBeforeRecoil);

  zeyin.x = 300;
  zeyin.y = 360;
  target.x = 543;
  target.y = 360;
  zeyin.rebirthRecoilTime = 4;
  engine["basicAttack"](zeyin, target);
  assert.equal(zeyin.abilityMotion, null, "接近射程边缘时不应继续后退");

  zeyin.x = 300;
  target.x = 400;
  zeyin.rebirthRecoilTime = 0;
  engine["basicAttack"](zeyin, target);
  assert.equal(zeyin.abilityMotion, null, "撤离窗口结束后不应再触发后坐力");
});

test("礼墨空气龙持续隐身，期间可攻击，能量耗尽发射礼小龙并触发社恐后坐力", () => {
  const engine = createEngine(198);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sumi", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sun_guard", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const sumi = battle?.player.find((fighter) => fighter.unitId === "sumi");
  const ally = battle?.player.find((fighter) => fighter.unitId === "sun_guard");
  const enemy = battle?.enemy[0];
  assert.ok(battle && sumi && ally && enemy);

  sumi.x = 200;
  sumi.y = 360;
  ally.x = 280;
  ally.y = 360;
  battle.enemy.forEach((fighter, index) => {
    fighter.x = 390 + index * 70;
    fighter.y = 360 + index * 18;
    fighter.hp = fighter.maxHp = 99_999;
    fighter.attack = 0;
    fighter.armor = 99_999;
    fighter.cooldown = 99;
    fighter.moveSpeed = 0;
  });
  sumi.energy = sumi.maxEnergy;
  sumi.cooldown = 99;
  engine.update(0.05);

  assert.ok(sumi.stealthTime > 4.1 && sumi.stealthTime <= 4.2);
  assert.equal(sumi.sumiDragonReady, true);
  assert.notEqual(enemy.targetFid, sumi.fid, "隐身后敌方应优先锁定其他可见友军");

  engine.update(0.05);
  const energyBeforeAttack = sumi.energy;
  assert.ok(sumi.moveSpeed > sumi.baseMoveSpeed, "隐身期间应提高移速");
  assert.ok(sumi.energy < sumi.maxEnergy, "隐身期间能量应持续下降");
  const target = battle.enemy[0];
  const beforeX = sumi.x;
  sumi.cooldown = 0;
  engine["basicAttack"](sumi, target);
  assert.ok(sumi.stealthTime > 0, "隐身期间普通攻击不应立即破隐");
  assert.equal(sumi.sumiDragonReady, true);
  assert.equal(sumi.energy, energyBeforeAttack, "隐身期间普攻不应回能");
  assert.equal(battle.projectiles.some((projectile) => projectile.style === "sumi_dragon"), false);
  assert.equal(sumi.abilityMotion?.kind, "push");
  engine.update(0.08);
  assert.ok(sumi.x < beforeX, "社恐后坐力应把礼墨推离目标");
  sumi.cooldown = 99;
  for (let step = 0; step < 77; step += 1) engine.update(0.05);
  assert.ok(sumi.stealthTime > 0 && sumi.energy > 0, "隐身不应在能量耗尽前结束");
  for (let step = 0; step < 6; step += 1) engine.update(0.05);
  assert.equal(sumi.stealthTime, 0);
  assert.equal(sumi.sumiDragonReady, false);
  assert.equal(sumi.energy, 0);
  assert.ok(battle.projectiles.some((projectile) => projectile.style === "sumi_dragon"));
  assert.ok(battle.effects.some((effect) => effect.text === "破隐一击"));
});

test("贪吃岁强化下一击吸血，椰子栞海獭冲击突进并范围控场", () => {
  const engine = createEngine(201);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_blue", star: 1 };
  engine.state.board[1] = { uid: 2, id: "shiori", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const hungry = battle?.player.find((fighter) => fighter.unitId === "sui_blue");
  const shiori = battle?.player.find((fighter) => fighter.unitId === "shiori");
  assert.ok(battle && hungry && shiori);
  battle.enemy.forEach((enemy, index) => {
    enemy.hp = enemy.maxHp = 9_999;
    enemy.armor = 0;
    enemy.dodgeChance = 0;
    enemy.x = 480 + index * 42;
    enemy.y = 360;
  });
  hungry.x = 280;
  hungry.y = 360;
  hungry.hp = hungry.maxHp * 0.5;
  engine["castAbility"](hungry, battle.enemy);
  assert.equal(hungry.abilityAttackBonus, 1.25);
  assert.equal(hungry.nextAttackLifesteal, 0.45);
  hungry.attack = hungry.baseAttack * 2.25;
  const hungryHpBefore = hungry.hp;
  engine["basicAttack"](hungry, battle.enemy[0]);
  assert.ok(hungry.hp > hungryHpBefore);
  assert.equal(hungry.nextAttackLifesteal, 0);
  assert.equal(hungry.abilityAttackBonus, 0);

  shiori.x = 300;
  shiori.y = 360;
  const farthestEnemy = battle.enemy.at(-1);
  const shioriShield = shiori.shield;
  engine["castAbility"](shiori, battle.enemy, true);
  assert.equal(shiori.abilityMotion?.targetFid, farthestEnemy.fid);
  assert.equal(shiori.attackType, "melee");
  for (let tick = 0; tick < 20 && shiori.abilityMotion; tick += 1) engine.update(0.05);
  assert.ok(shiori.shield > shioriShield);
  assert.ok(battle.enemy.every((enemy) => enemy.stun > 0.2));
  assert.ok(battle.enemy.every((enemy) => enemy.hp < enemy.maxHp));
  assert.ok(battle.effects.some((effect) => effect.text === "海獭冲击"));
  assert.ok(!battle.projectiles.some((projectile) => projectile.impactAbilityId === "shiori"));
});

test("好笑姐姐只在近距离起跳，并在落地后结算冷笑话伤害与护盾", () => {
  const engine = createEngine(211);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rift_stalker", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const michiya = battle?.player[0];
  const target = battle?.enemy[0];
  assert.ok(battle && michiya && target);

  battle.enemy.slice(1).forEach((enemy) => {
    enemy.alive = false;
    enemy.hp = 0;
  });
  michiya.jumpPending = false;
  michiya.jumpTime = 0;
  michiya.abilityMotion = null;
  michiya.x = 260;
  michiya.y = 360;
  michiya.moveSpeed = 0;
  michiya.cooldown = 0;
  michiya.energy = michiya.maxEnergy;
  target.x = michiya.x + 300;
  target.y = michiya.y;
  target.hp = target.maxHp = 9_999;
  target.armor = 0;
  target.dodgeChance = 0;
  target.attack = 0;
  target.cooldown = 99;

  engine.update(0.05);
  assert.equal(michiya.abilityMotion, null, "距离超过 240 时不应释放");
  assert.equal(michiya.energy, michiya.maxEnergy);

  target.x = michiya.x + 220;
  const startX = michiya.x;
  const targetHp = target.hp;
  const shieldBefore = michiya.shield;
  engine.update(0.05);
  const motion = michiya.abilityMotion;
  assert.equal(motion?.kind, "jump");
  assert.equal(motion?.abilityId, "rift_stalker");
  assert.equal(motion?.targetFid, target.fid);
  assert.equal(michiya.x, startX, "施法帧不应直接改写到落点");
  assert.equal(target.hp, targetHp, "跳跃途中不应提前结算伤害");
  assert.equal(michiya.shield, shieldBefore, "跳跃途中不应提前获得护盾");

  engine["updateAbilityMotion"](michiya, 0.21, battle);
  assert.ok(michiya.x > startX && michiya.x < motion.toX);
  assert.equal(target.hp, targetHp);
  assert.equal(michiya.shield, shieldBefore);

  engine["updateAbilityMotion"](michiya, 0.21, battle);
  assert.equal(michiya.abilityMotion, null);
  assert.ok(target.hp < targetHp);
  assert.ok(michiya.shield > shieldBefore);
  assert.ok(battle.effects.some((effect) => effect.text === "冷笑话落地"));
});

test("小岁鸟连续三次肘击会反复冲撞、击退并短暂眩晕敌人", () => {
  const engine = createEngine(201);
  engine.state.round = 6;
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_bird", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const bird = battle?.player[0];
  assert.ok(battle && bird && battle.enemy.length >= 2);
  bird.x = 240;
  bird.y = 360;
  battle.enemy.forEach((enemy, index) => {
    enemy.x = 430 + index * 65;
    enemy.y = 340 + (index % 2) * 40;
    enemy.hp = enemy.maxHp = 99_999;
    enemy.armor = 0;
    enemy.dodgeChance = 0;
    enemy.attack = 0;
    enemy.cooldown = 99;
  });
  const enemyStarts = new Map(
    battle.enemy.map((enemy) => [enemy.fid, { x: enemy.x, y: enemy.y }]),
  );

  bird.energy = bird.maxEnergy;
  engine["castAbility"](bird, battle.enemy, true);
  assert.equal(bird.suiBirdChargesRemaining, 2);
  assert.equal(bird.abilityMotion?.abilityId, "sui_bird");
  let sawStun = false;
  let sawPush = false;
  const elbowLabels = new Set();
  for (let tick = 0; tick < 40 && (bird.abilityMotion || bird.suiBirdChargesRemaining > 0); tick += 1) {
    engine.update(0.05);
    sawStun ||= battle.enemy.some((enemy) => enemy.stun > 0);
    sawPush ||= battle.enemy.some((enemy) => enemy.abilityMotion?.kind === "push");
    battle.effects
      .filter((effect) => effect.text?.startsWith("肘击 "))
      .forEach((effect) => elbowLabels.add(effect.text));
  }

  const hitEnemies = battle.enemy.filter((enemy) => enemy.damageTaken > 0);
  assert.equal(bird.suiBirdChargesRemaining, 0);
  assert.equal(bird.abilityMotion, null);
  assert.ok(hitEnemies.length >= 1);
  assert.equal(sawStun, true);
  assert.equal(sawPush, true);
  assert.ok(
    hitEnemies.some((enemy) => {
      const start = enemyStarts.get(enemy.fid);
      return start && Math.hypot(enemy.x - start.x, enemy.y - start.y) > 10;
    }),
  );
  assert.ok(
    elbowLabels.size >= 3,
    "三次冲撞都应生成独立的肘击反馈",
  );
});

test("七海凿凿冲击、恬豆地面棒棒糖与三理理嘲讽均按碰撞和锁敌结算", () => {
  const nanaEngine = createEngine(202);
  nanaEngine.state.playerLevel = 4;
  nanaEngine.state.board.fill(null);
  nanaEngine.state.board[0] = { uid: 1, id: "grove_mender", star: 1 };
  nanaEngine.startBattle();
  const nanaBattle = nanaEngine.state.battle;
  const nana = nanaBattle?.player[0];
  assert.ok(nanaBattle && nana && nanaBattle.enemy.length >= 2);
  const nanaNear = nanaBattle.enemy[0];
  const nanaTarget = nanaBattle.enemy[1];
  nana.x = 260;
  nana.y = 360;
  nanaNear.x = 400;
  nanaNear.y = 360;
  nanaTarget.x = 620;
  nanaTarget.y = 360;
  nanaBattle.enemy.forEach((fighter) => {
    fighter.hp = fighter.maxHp = 9_999;
    fighter.armor = 0;
    fighter.attack = 0;
    fighter.cooldown = 99;
  });
  const baseArmor = nana.armor;
  nanaEngine["castAbility"](nana, nanaBattle.enemy);
  assert.equal(nana.abilityMotion?.targetFid, nanaTarget.fid);
  assert.equal(nana.barrageActive, false, "冲锋落地前不应提前进入持续状态");
  stepBattle(nanaEngine, 14);
  assert.equal(nana.abilityMotion, null);
  assert.equal(nana.barrageActive, true);
  assert.equal(nana.abilityArmorBonus, 42);
  assert.equal(nana.armor, baseArmor + 42);
  assert.equal(nanaTarget.tauntedByFid, nana.fid);
  assert.ok(nana.energy > 0 && nana.energy < nana.maxEnergy);
  nanaNear.alive = false;
  nanaTarget.stun = 0;
  const counterTargetHp = nanaTarget.hp;
  nanaEngine["damage"](nanaTarget, nana, 80);
  const pickaxe = nanaBattle.projectiles.find((projectile) => projectile.emoji === "⛏️");
  assert.ok(pickaxe, "持续状态受击时应立即发射矿镐");
  nanaEngine["updateProjectiles"](nanaBattle, 0.5);
  assert.ok(nanaTarget.hp < counterTargetHp);
  assert.ok(nanaTarget.stun >= 0.24);

  const candyEngine = createEngine(203);
  candyEngine.state.playerLevel = 4;
  candyEngine.state.board.fill(null);
  candyEngine.state.board[0] = { uid: 1, id: "tiandou", star: 1 };
  candyEngine.state.board[1] = { uid: 2, id: "sui", star: 1 };
  candyEngine.startBattle();
  const candyBattle = candyEngine.state.battle;
  const tiandou = candyBattle?.player.find((fighter) => fighter.unitId === "tiandou");
  const ally = candyBattle?.player.find((fighter) => fighter.unitId === "sui");
  const candyTarget = candyBattle?.enemy[0];
  assert.ok(candyBattle && tiandou && ally && candyTarget);
  tiandou.x = 260;
  tiandou.y = 360;
  ally.x = 355;
  ally.y = 360;
  ally.hp = ally.maxHp * 0.5;
  candyTarget.x = 480;
  candyTarget.y = 360;
  candyTarget.hp = candyTarget.maxHp = 9_999;
  candyTarget.armor = 0;
  candyEngine["castAbility"](tiandou, candyBattle.enemy);
  const launchedLollipops = candyBattle.projectiles.filter((projectile) => projectile.style === "lollipop");
  assert.equal(launchedLollipops.length, 5);
  assert.ok(launchedLollipops.every((projectile) => !projectile.grounded));
  assert.ok(launchedLollipops.every((projectile) => Math.hypot(projectile.x - tiandou.x, projectile.y - tiandou.y) < 1));
  assert.ok(launchedLollipops.every((projectile) => projectile.remainingRange <= 108));
  ally.x = 368;
  ally.y = 360;
  const allyHpBefore = ally.hp;
  candyEngine["updateProjectiles"](candyBattle, 0.5);
  assert.ok(candyBattle.projectiles.filter((projectile) => projectile.style === "lollipop").every((projectile) => projectile.grounded));
  assert.equal(ally.hp, allyHpBefore);
  candyEngine["updateProjectiles"](candyBattle, 0.05);
  assert.ok(ally.hp > allyHpBefore);
  assert.ok(ally.abilityMoveSpeed >= 16);
  candyBattle.projectiles = [];
  ally.x = 260;
  ally.y = 550;
  candyTarget.x = 368;
  candyTarget.y = 360;
  candyEngine["castAbility"](tiandou, candyBattle.enemy);
  candyEngine["updateProjectiles"](candyBattle, 0.5);
  assert.ok(candyBattle.projectiles.some((projectile) => projectile.style === "lollipop" && projectile.grounded));
  const groundedCountBeforeWait = candyBattle.projectiles.filter((projectile) => projectile.grounded).length;
  candyTarget.x = 600;
  candyTarget.y = 550;
  candyEngine["updateProjectiles"](candyBattle, 5);
  assert.equal(candyBattle.projectiles.filter((projectile) => projectile.grounded).length, groundedCountBeforeWait);
  candyTarget.x = 368;
  candyTarget.y = 360;
  const enemyHpBefore = candyTarget.hp;
  candyEngine["updateProjectiles"](candyBattle, 0.05);
  assert.ok(candyTarget.hp < enemyHpBefore);
  assert.ok(candyTarget.slowTime >= 2.4);

  const tauntEngine = createEngine(204);
  tauntEngine.state.playerLevel = 4;
  tauntEngine.state.board.fill(null);
  tauntEngine.state.board[0] = { uid: 1, id: "mitsuri", star: 1 };
  tauntEngine.state.board[1] = { uid: 2, id: "sui", star: 1 };
  tauntEngine.startBattle();
  const tauntBattle = tauntEngine.state.battle;
  const mitsuri = tauntBattle?.player.find((fighter) => fighter.unitId === "mitsuri");
  const closerAlly = tauntBattle?.player.find((fighter) => fighter.unitId === "sui");
  const tauntedEnemy = tauntBattle?.enemy[0];
  assert.ok(tauntBattle && mitsuri && closerAlly && tauntedEnemy);
  mitsuri.x = 330;
  mitsuri.y = 360;
  closerAlly.x = 430;
  closerAlly.y = 360;
  tauntedEnemy.x = 460;
  tauntedEnemy.y = 360;
  tauntEngine["castAbility"](mitsuri, tauntBattle.enemy);
  assert.ok(mitsuri.shield > 0);
  assert.equal(tauntedEnemy.tauntedByFid, mitsuri.fid);
  assert.ok(tauntedEnemy.tauntTime >= 3.2);
  assert.equal(tauntEngine["resolveCombatTarget"](tauntedEnemy, tauntBattle.player, 0.05)?.fid, mitsuri.fid);
});

test("蛙梓终场歌唱持续治疗施法距离内友军，并将单体激光切换为范围灼烧火焰弹", () => {
  const engine = createEngine(205);
  engine.state.playerLevel = 5;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "cinder_ram", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sui", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const cinder = battle?.player.find((fighter) => fighter.unitId === "cinder_ram");
  const ally = battle?.player.find((fighter) => fighter.unitId === "sui");
  assert.ok(battle && cinder && ally);
  const [primary, nearby] = battle.enemy;
  assert.ok(primary && nearby);
  battle.enemy.forEach((enemy, index) => {
    enemy.x = index === 0 ? 480 : 530;
    enemy.y = 360;
    enemy.hp = enemy.maxHp = 9_999;
    enemy.armor = 0;
    enemy.dodgeChance = 0;
    enemy.attack = 0;
    enemy.cooldown = 99;
  });
  cinder.x = 260;
  cinder.y = 360;
  ally.x = 300;
  ally.y = 430;
  ally.hp = ally.maxHp * 0.5;
  assert.equal(cinder.attackType, "ranged");
  const normalRange = cinder.range;
  cinder.energy = cinder.maxEnergy;
  engine["castAbility"](cinder, battle.enemy);
  assert.equal(cinder.barrageActive, true);
  assert.ok(cinder.range > normalRange);
  const allyHpBefore = ally.hp;
  engine.update(0.05);
  assert.ok(ally.hp > allyHpBefore);
  cinder.cooldown = 0;
  engine["basicAttack"](cinder, primary);
  assert.equal(battle.projectiles[0]?.style, "fireball");
  engine["updateProjectiles"](battle, 0.5);
  assert.ok(primary.hp < primary.maxHp);
  assert.ok(nearby.hp < nearby.maxHp);
  assert.ok(primary.burnTime > 0 && nearby.burnTime > 0);
  for (let tick = 0; tick < 120; tick += 1) engine.update(0.05);
  assert.equal(cinder.barrageActive, false);
  assert.equal(cinder.range, cinder.baseRange);
});

test("露蒂丝咕咕诊所治疗施法距离内友军并只保护其中生命比例最低的两名友军", () => {
  const engine = createEngine(205);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "rutice", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sui", star: 1 };
  engine.state.board[2] = { uid: 3, id: "ember_blade", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const rutice = battle?.player.find((fighter) => fighter.unitId === "rutice");
  const ally = battle?.player.find((fighter) => fighter.unitId === "sui");
  const healthiest = battle?.player.find((fighter) => fighter.unitId === "ember_blade");
  const enemy = battle?.enemy[0];
  assert.ok(battle && rutice && ally && healthiest && enemy);

  const allies = [rutice, ally, healthiest];
  allies.forEach((fighter) => {
    fighter.hp = fighter.maxHp * (fighter === rutice ? 0.4 : fighter === ally ? 0.25 : 0.75);
    fighter.shield = 0;
  });
  const hpBefore = allies.map((fighter) => fighter.hp);
  const enemyHpBefore = enemy.hp;
  engine["castAbility"](rutice, battle.enemy);

  allies.forEach((fighter, index) => assert.ok(fighter.hp > hpBefore[index]));
  assert.ok(rutice.shield > 0);
  assert.ok(ally.shield > 0);
  assert.equal(healthiest.shield, 0);
  assert.equal(enemy.hp, enemyHpBefore);
  assert.equal(enemy.stun, 0);
});

test("大黑鼠迎客松会长出固定松树并向附近敌人发射松针", () => {
  const engine = createEngine(98);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "dawn_duelist", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const owner = battle?.player[0];
  assert.ok(battle && owner);
  battle.enemy.forEach((fighter, index) => {
    fighter.hp = fighter.maxHp = 9_999;
    fighter.armor = 0;
    fighter.attack = 0;
    fighter.dodgeChance = 0;
    fighter.x = 340 + index * 40;
    fighter.y = 360;
  });
  owner.x = 260;
  owner.y = 360;
  battle.enemy[0].x = owner.x + Math.max(owner.range, owner.radius + battle.enemy[0].radius + 12) - 1;
  owner.energy = owner.maxEnergy;
  engine.update(0.05);
  assert.equal(battle.pineTrees.length, 1);
  const tree = battle.pineTrees[0];
  assert.equal(tree.ownerFid, owner.fid);
  const treeX = tree.x;
  const treeY = tree.y;
  battle.projectiles = [];
  battle.enemy[0].x = tree.x + 120;
  battle.enemy[0].y = tree.y;
  stepBattle(engine, 5);
  assert.equal(tree.x, treeX);
  assert.equal(tree.y, treeY);
  const needle = battle.projectiles.find((entry) => entry.style === "pine_needle" && entry.sourceFid === owner.fid);
  assert.ok(needle);
  assert.ok(owner.damageDealt >= 0);
  stepBattle(engine, 40);
  assert.ok(owner.damageDealt > 0);
  owner.hp = 0;
  owner.alive = false;
  engine.update(0.05);
  assert.equal(battle.pineTrees.length, 0);
});

test("莉蔻近视射击依次发出带随机偏移的胡萝卜弹幕", () => {
  const engine = createEngine(99);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "ember_blade", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  assert.ok(battle && source);
  battle.enemy.forEach((fighter) => {
    fighter.hp = fighter.maxHp = 9_999;
    fighter.armor = 0;
    fighter.attack = 0;
    fighter.dodgeChance = 0;
  });
  const target = battle.enemy[0];
  source.x = 280;
  source.y = 360;
  target.x = 500;
  target.y = 360;
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.equal(battle.projectileVolley.length, 5);
  assert.ok(battle.projectileVolley.every((shot) => shot.emoji === "🥕"));
  assert.ok(battle.projectileVolley.every((shot) => typeof shot.angleOffset === "number"));
  const offsets = new Set(battle.projectileVolley.map((shot) => shot.angleOffset));
  assert.ok(offsets.size >= 2);
  stepBattle(engine, 20);
  const carrots = battle.projectiles.filter((entry) => entry.emoji === "🥕" || entry.style === "carrot");
  assert.ok(carrots.length >= 1);
  const angles = carrots.map((entry) => Math.atan2(entry.velocityY, entry.velocityX));
  const baseAim = Math.atan2(target.y - source.y, target.x - source.x);
  assert.ok(angles.some((angle) => Math.abs(angle - baseAim) > 0.05));
});

test("原胆小成员合并为怕死并获得怕死加成", () => {
  const engine = createEngine(71);
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sui_cat", star: 1 };
  engine.state.board[2] = { uid: 3, id: "mossback", star: 1 };
  const status = engine.getTraitStatus("vanguard");
  assert.equal(status.count, 3);
  assert.equal(status.level, 1);
  engine.startBattle();
  const mergedMember = engine.state.battle?.player.find((fighter) => fighter.unitId === "sui_cat");
  const ally = engine.state.battle?.player.find((fighter) => fighter.unitId === "mossback");
  assert.ok(mergedMember && ally);
  assert.equal(mergedMember.range, gameData.UNIT_DEFS.sui_cat.range + 36);
  assert.equal(mergedMember.dodgeChance, 0);
  assert.equal(mergedMember.baseMoveSpeed, gameData.UNIT_DEFS.sui_cat.moveSpeed);
  assert.equal(ally.dodgeChance, 0);
});

test("滑跪会沿直线路径移动并逐个撞开沿途敌人", () => {
  const engine = createEngine(73);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "guangyi", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  assert.ok(battle && source && battle.enemy.length >= 2);
  const middle = battle.enemy[0];
  const far = battle.enemy[1];
  battle.enemy.forEach((fighter) => {
    fighter.x = 300;
    fighter.y = 560;
    fighter.attack = 0;
    fighter.armor = 0;
    fighter.dodgeChance = 0;
    fighter.moveSpeed = 0;
    fighter.cooldown = 99;
    fighter.energy = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
  });
  source.x = 220;
  source.y = 360;
  middle.x = 420;
  middle.y = 360;
  far.x = 550;
  far.y = 360;
  source.energy = source.maxEnergy;
  const expectedSkillDamage = source.attack * 1.1;

  engine.update(0.05);
  assert.equal(source.abilityMotion?.kind, "dash");
  assert.equal(source.abilityMotion?.abilityId, "guangyi");
  assert.equal(source.x, 220, "施法帧只建立运动状态，不应直接抵达终点");
  assert.ok((source.abilityMotion?.toX || 0) > 500);

  source.cooldown = 99;
  source.energy = 0;
  const sampledX = [];
  let collisionStun = 0;
  let previousMiddleDamage = middle.damageTaken;
  for (let tick = 0; tick < 16; tick += 1) {
    engine.update(0.05);
    sampledX.push(source.x);
    if (middle.damageTaken > previousMiddleDamage && collisionStun === 0) collisionStun = middle.stun;
    previousMiddleDamage = middle.damageTaken;
  }
  assert.ok(new Set(sampledX.map((x) => Math.round(x))).size >= 6, "滑跪过程应经过多个中间坐标");
  const earlyStep = sampledX[1] - sampledX[0];
  const lateStep = sampledX[5] - sampledX[4];
  assert.ok(earlyStep > lateStep * 1.4, "滑跪应在前段快速冲刺、末段逐渐减速");
  assert.equal(source.abilityMotion, null);
  assert.ok(source.x > 500);
  assert.ok(Math.abs(middle.damageTaken - expectedSkillDamage) < 0.01, "沿途目标应只受到一次滑跪伤害");
  assert.ok(Math.abs(far.damageTaken - expectedSkillDamage) < 0.01, "终点目标也应只受到一次滑跪伤害");
  assert.ok(collisionStun >= 0.39 && collisionStun <= 0.45, "被滑跪撞到的敌人应短暂眩晕");
  assert.ok(middle.x > 420 || Math.abs(middle.y - 360) > 1, "沿途目标应被短位移撞开");
  assert.ok(far.x > 550 || Math.abs(far.y - 360) > 1, "终点目标应被短位移撞开");
  assert.ok(source.shield > 0);
  assertInsideBattleBounds(source);
  assertInsideBattleBounds(middle);
  assertInsideBattleBounds(far);
});

test("跃击技能会经过空中过程并在落地后结算伤害", () => {
  const engine = createEngine(74);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "youyi", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  assert.ok(battle && source);
  battle.enemy.forEach((fighter, index) => {
    fighter.x = 500 + index * 24;
    fighter.y = 360 + index * 90;
    fighter.attack = 0;
    fighter.armor = 0;
    fighter.dodgeChance = 0;
    fighter.moveSpeed = 0;
    fighter.cooldown = 99;
    fighter.energy = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
  });
  source.x = 220;
  source.y = 360;
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.equal(source.abilityMotion?.kind, "jump");
  assert.equal(source.abilityMotion?.abilityId, "youyi");
  const target = battle.enemy.find((fighter) => fighter.fid === source.abilityMotion?.targetFid);
  assert.ok(target);
  const startHp = target.hp;
  assert.equal(target.hp, startHp, "起跳时不应提前结算落地伤害");
  engine.update(0.05);
  assert.ok(source.x > 220 && source.x < (source.abilityMotion?.toX || Infinity));
  assert.equal(target.hp, startHp, "空中阶段不应提前结算伤害");

  source.cooldown = 99;
  source.energy = 0;
  stepBattle(engine, 11);
  assert.equal(source.abilityMotion, null);
  assert.ok(target.hp < startHp);
  assert.ok(target.stun > 0);
  assertInsideBattleBounds(source);
});

test("小猫拳会先闪现到最远敌人身后，再与目标同步推进并击晕", () => {
  const engine = createEngine(72);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_cat", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  assert.ok(battle && source);

  // 布置近远两个敌人，技能应锁定更远者
  const near = battle.enemy[0];
  const far = battle.enemy[1] || battle.enemy[0];
  battle.enemy.forEach((fighter) => {
    fighter.attack = 0;
    fighter.armor = 0;
    fighter.dodgeChance = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.energy = 0;
  });
  near.x = 400;
  near.y = 360;
  if (far !== near) {
    far.x = 540;
    far.y = 360;
  }
  source.x = 220;
  source.y = 360;
  source.jumpPending = false;
  source.jumpTime = 0;
  source.energy = source.maxEnergy;

  const target = far !== near ? far : near;
  const beforeTargetX = target.x;
  engine.update(0.05);

  assert.ok(source.x > target.x, "应闪现到敌人身后（更靠敌方半场）");
  assert.equal(source.abilityMotion?.kind, "push");
  assert.equal(target.abilityMotion?.kind, "push");
  const hadPushLine = battle.effects.some((effect) => effect.kind === "line");
  assert.ok(target.x < beforeTargetX, "敌方更新阶段可以开始推进");
  assert.ok(target.x > target.abilityMotion.toX, "施法帧不应把目标瞬间推到终点");
  assert.equal(target.stun, 0, "三连击应在推进完成后结算");

  engine.update(0.05);
  assert.ok(target.x < beforeTargetX, "推进过程应在后续帧逐步移动目标");
  assert.ok(target.x > (target.abilityMotion?.toX || -Infinity), "推进中途不应提前抵达终点");
  source.cooldown = 99;
  source.energy = 0;
  stepBattle(engine, 7);
  assert.equal(source.abilityMotion, null);
  assert.equal(target.abilityMotion, null);
  assert.ok(target.x < beforeTargetX - 80, "敌人应被往己方半场推开");
  assert.ok(target.stun > 0.8, "推进结束后目标应被三连击晕");
  assert.ok(battle.effects.some((effect) => effect.kind === "burst"));
  assert.ok(hadPushLine);
  assert.ok(battle.effects.some((effect) => effect.text === "猫拳三连" || effect.text === "闪"));
});

test("星汐山猪冲阵持续耗能、缓慢转向、撞飞敌人并在边缘反弹", () => {
  const engine = createEngine(140);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "seki_boar_king", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const seki = battle?.player[0];
  const target = battle?.enemy[0];
  assert.ok(battle && seki && target);

  battle.enemy.forEach((fighter, index) => {
    fighter.x = index === 0 ? 360 : 820 + index * 34;
    fighter.y = index === 0 ? 360 : 180 + index * 86;
    fighter.moveSpeed = 0;
    fighter.attack = 0;
    fighter.cooldown = 99;
    fighter.armor = 0;
    fighter.dodgeChance = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
  });
  seki.x = 240;
  seki.y = 360;
  seki.cooldown = 0;
  const targetStartX = target.x;
  const targetStartHp = target.hp;

  engine.castAbility(seki, battle.enemy);
  assert.equal(seki.sekiChargeActive, true);
  assert.equal(seki.energy, seki.maxEnergy);
  assert.equal(seki.abilityMotion, null);

  stepBattle(engine, 8);
  assert.ok(seki.energy < seki.maxEnergy && seki.energy > 0, "冲锋期间能量应持续下降");
  assert.ok(target.x > targetStartX, "撞到敌人时应沿冲锋方向击退");
  assert.ok(target.stun > 0, "撞到敌人时应短暂眩晕");
  assert.equal(target.hp, targetStartHp, "山猪冲阵不应复用海獭冲击的伤害");
  assert.equal(seki.damageDealt, 0, "冲锋期间不能通过普攻造成伤害");
  assert.equal(seki.attackPulse, 0, "冲锋期间不能普攻");
  assert.equal(seki.sekiChargeHitCount, 1);

  seki.x = 240;
  seki.y = 360;
  target.x = 520;
  target.y = 360;
  target.abilityMotion = null;
  engine.update(0.05);
  assert.equal(seki.sekiChargeHitFids.includes(target.fid), false, "目标被撞开后应退出当前接触集合");

  target.x = 360;
  target.y = 360;
  target.abilityMotion = null;
  target.stun = 0;
  seki.x = 240;
  seki.y = 360;
  seki.sekiChargeDirectionX = 1;
  seki.sekiChargeDirectionY = 0;
  stepBattle(engine, 8);
  assert.equal(seki.sekiChargeHitCount, 2, "离开后再次撞上同一目标应重新触发");

  seki.x = 500;
  seki.y = 500;
  seki.sekiChargeDirectionX = 1;
  seki.sekiChargeDirectionY = 0;
  target.x = 500;
  target.y = 170;
  engine.update(0.05);
  assert.ok(seki.sekiChargeDirectionX > 0.99, "单帧不能瞬间转向目标");
  assert.ok(seki.sekiChargeDirectionY < 0 && seki.sekiChargeDirectionY > -0.08);

  seki.x = BATTLE_BOUNDS.right - seki.radius - 1;
  seki.y = 500;
  seki.sekiChargeDirectionX = 1;
  seki.sekiChargeDirectionY = 0;
  engine.update(0.05);
  assert.ok(seki.sekiChargeDirectionX < 0, "撞到右侧边缘后应反向弹回");
  assert.ok(seki.x < BATTLE_BOUNDS.right - seki.radius);
  assert.ok(battle.effects.some((effect) => effect.text === "反弹"));

  for (let tick = 0; tick < 120 && seki.sekiChargeActive; tick += 1) engine.update(0.05);
  assert.equal(seki.sekiChargeActive, false);
  assert.equal(seki.energy, 0);
  assert.equal(seki.sekiChargeDirectionX, 0);
  assert.equal(seki.sekiChargeDirectionY, 0);
});

test("礼墨与塔神完成空气龙和尖塔压顶结算", () => {
  const engine = createEngine(141);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 2, id: "sumi", star: 1 };
  engine.state.board[1] = { uid: 3, id: "tower_god", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  const sumi = battle.player.find((fighter) => fighter.unitId === "sumi");
  const tower = battle.player.find((fighter) => fighter.unitId === "tower_god");
  assert.ok(sumi && tower);

  assert.equal(Math.round(sumi.maxHp), gameData.UNIT_DEFS.sumi.hp);
  assert.equal(tower.energy, gameData.UNIT_DEFS.tower_god.energyProfile.start + 20);

  battle.enemy.forEach((fighter, index) => {
    fighter.x = 650 + index * 32;
    fighter.y = 360 + index * 18;
    fighter.attack = 0;
    fighter.armor = 0;
    fighter.dodgeChance = 0;
    fighter.hp = 99_999;
    fighter.maxHp = 99_999;
    fighter.cooldown = 99;
  });
  const target = battle.enemy[0];
  sumi.stealthTime = 0;
  sumi.sumiDragonReady = false;
  sumi.energy = sumi.maxEnergy;
  target.armor = 20;
  target.stun = 0;
  engine.castAbility(sumi, battle.enemy);
  assert.ok(sumi.stealthTime > 4.1, "空气龙应立即进入隐身");
  assert.equal(sumi.sumiDragonReady, true);
  assert.equal(target.stun, 0, "空气龙不应在施放时直接控制敌人");
  assert.equal(target.armor, 20, "空气龙不应在施放时削弱敌人护甲");

  target.stun = 0;
  const hpBeforeTower = target.hp;
  engine.castAbility(tower, battle.enemy);
  assert.equal(target.hp, hpBeforeTower, "尖塔弹幕抵达前不应提前伤害");
  assert.ok(battle.projectiles.some((projectile) => projectile.impactAbilityId === "tower_god"));
  engine["updateProjectiles"](battle, 1);
  assert.ok(target.hp < hpBeforeTower, "尖塔压顶应伤害最密集区域");
  assert.ok(target.stun > 0, "尖塔压顶应眩晕区域内敌人");
});

test("帕可天使摸鱼按自身属性落地治疗，并留下可进出的持续治疗区", () => {
  const engine = createEngine(173);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "pako", star: 1 };
  engine.state.board[1] = { uid: 2, id: "cog_scribe", star: 1 };
  engine.state.board[2] = { uid: 3, id: "mossback", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const pako = battle?.player.find((fighter) => fighter.unitId === "pako");
  const host = battle?.player.find((fighter) => fighter.unitId === "cog_scribe");
  const nonHost = battle?.player.find((fighter) => fighter.unitId === "mossback");
  assert.ok(battle && pako && host && nonHost);
  pako.x = 300;
  pako.y = 350;
  host.x = 650;
  host.y = 340;
  nonHost.x = 710;
  nonHost.y = 370;
  host.hp = host.maxHp * 0.35;
  nonHost.maxHp = 10_000;
  nonHost.hp = 5_000;
  const hostHpBefore = host.hp;
  const nonHostHpBefore = nonHost.hp;
  const enemyHpBefore = battle.enemy.map((fighter) => fighter.hp);

  engine.castAbility(pako, battle.enemy);

  const angelFish = battle.projectiles.find((projectile) => projectile.impactAbilityId === "pako");
  assert.ok(angelFish);
  assert.equal(angelFish.emoji, "🐟");
  assert.equal(host.hp, hostHpBefore, "治疗弹抵达前不应提前回血");
  assert.equal(nonHost.hp, nonHostHpBefore, "治疗弹抵达前不应提前回血");

  engine["updateProjectiles"](battle, 1);

  const hostInitialHeal = host.hp - hostHpBefore;
  const highCostInitialHeal = nonHost.hp - nonHostHpBefore;
  assert.ok(hostInitialHeal > 35);
  assert.ok(hostInitialHeal < 50);
  assert.ok(Math.abs(hostInitialHeal - highCostInitialHeal) < 0.001, "治疗量不应按目标最大生命放大");
  assert.deepEqual(battle.enemy.map((fighter) => fighter.hp), enemyHpBefore);
  assert.ok(pako.healingDone > 0);
  assert.ok(battle.effects.some((effect) => effect.text === "天使摸鱼"));
  assert.ok(battle.effects.some(
    (effect) =>
      effect.kind === "healing_field"
      && effect.size === 145
      && effect.color === "#6ff0b5",
  ));
  assert.ok(battle.effects.some(
    (effect) =>
      effect.kind === "healing_pulse"
      && effect.size === 68
      && effect.color === "#6ff0b5",
  ));
  assert.ok(!battle.effects.some(
    (effect) => effect.kind === "ring" && effect.x === host.x && effect.y === host.y,
  ), "帕可落地不应再使用攻击感强烈的大型扩张圆环");
  assert.equal(battle.healingZones.length, 1);
  assert.equal(battle.healingZones[0].radius, 145);
  assert.equal(battle.healingZones[0].maxLife, 3.2);
  assert.equal(battle.healingZones[0].color, "#6ff0b5");

  const zone = battle.healingZones[0];
  host.x = zone.x + zone.radius + 20;
  const hostHpOutside = host.hp;
  pako.x = zone.x;
  pako.y = zone.y;
  pako.hp = pako.maxHp * 0.4;
  const pakoHpBeforePulse = pako.hp;
  const nonHostHpBeforePulse = nonHost.hp;

  engine["updateHealingZones"](battle, 0.7);

  const pakoPulseHeal = pako.hp - pakoHpBeforePulse;
  const highCostPulseHeal = nonHost.hp - nonHostHpBeforePulse;
  assert.ok(pakoPulseHeal > 14);
  assert.ok(pakoPulseHeal < hostInitialHeal);
  assert.ok(Math.abs(pakoPulseHeal - highCostPulseHeal) < 0.001);
  assert.equal(host.hp, hostHpOutside, "走出治疗区后不应继续回血");
  assert.ok(battle.effects.some(
    (effect) =>
      effect.kind === "healing_pulse"
      && effect.color === "#6ff0b5"
      && effect.size === 60,
  ));
  assert.ok(!battle.effects.some(
    (effect) => effect.kind === "ring" && effect.size >= zone.radius,
  ), "持续治疗脉冲不应重新生成覆盖完整范围的攻击圆环");

  engine["updateHealingZones"](battle, 2.5);
  assert.equal(battle.healingZones.length, 0);
  assert.ok(pako.hp > pakoHpBeforePulse + pakoPulseHeal * 3.9, "治疗区应完整触发四次脉冲");
});

test("轴伊连续扔出五个治疗逐次减弱的橘子", () => {
  const engine = createEngine(174);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "cog_scribe", star: 1 };
  engine.state.board[1] = { uid: 2, id: "mossback", star: 1 };
  engine.state.board[2] = { uid: 3, id: "pako", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const joi = battle?.player.find((fighter) => fighter.unitId === "cog_scribe");
  const weakest = battle?.player.find((fighter) => fighter.unitId === "mossback");
  const other = battle?.player.find((fighter) => fighter.unitId === "pako");
  assert.ok(battle && joi && weakest && other);
  weakest.maxHp = 10_000;
  weakest.hp = 100;
  other.hp = other.maxHp;

  engine.castAbility(joi, battle.enemy);

  const scheduled = battle.projectileVolley.filter((shot) => shot.supportHealMultiplier !== undefined);
  assert.equal(scheduled.length, 5);
  assert.deepEqual(
    scheduled.map((shot) => shot.supportHealMultiplier),
    [1, 0.82, 0.66, 0.54, 0.44],
  );

  const heals = [];
  for (let shot = 0; shot < 5; shot += 1) {
    engine["updateProjectileVolley"](battle, shot === 0 ? 0 : 0.201);
    const orange = battle.projectiles.find((projectile) => projectile.impactAbilityId === "cog_scribe");
    assert.ok(orange);
    assert.equal(orange.emoji, "🍊");
    assert.equal(orange.impactTargetFid, weakest.fid);
    const hpBefore = weakest.hp;
    engine["updateProjectiles"](battle, 1);
    heals.push(weakest.hp - hpBefore);
  }

  assert.equal(battle.projectileVolley.filter((shot) => shot.supportHealMultiplier !== undefined).length, 0);
  assert.equal(heals.length, 5);
  heals.slice(1).forEach((amount, index) => {
    assert.ok(amount < heals[index], `第 ${index + 2} 个橘子的治疗量应低于前一颗`);
  });
  assert.ok(joi.healingDone > 0);
});
