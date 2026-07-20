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

test("已选择的天赋会按回合记入历史", () => {
  const engine = createEngine(9);
  engine.state.phase = "augment";
  engine.state.round = 2;
  engine.state.augmentChoices = ["tempered", "overclock", "sharp_edge"];
  engine.chooseAugment(1);
  assert.deepEqual(engine.state.augments, ["overclock"]);
  assert.deepEqual(engine.state.augmentHistory, [{ round: 2, id: "overclock" }]);
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

test("怕死受击会在跳跃过程中移动，而不是瞬移", () => {
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
  target.x = 430; target.y = 320; target.cooldown = 99;
  attacker.x = 490; attacker.y = 320; attacker.attack = 40; attacker.attackType = "ranged"; attacker.range = 280; attacker.cooldown = 0;
  const start = { x: target.x, y: target.y };

  engine.update(0.05);
  assert.ok(target.jumpTime > 0);
  assert.deepEqual({ x: target.x, y: target.y }, start);
  assert.notDeepEqual({ x: target.jumpToX, y: target.jumpToY }, start);

  const jumpTimeAfterHit = target.jumpTime;
  engine.update(0.2);
  assert.ok(target.jumpTime < jumpTimeAfterHit);
  assert.deepEqual({ x: target.x, y: target.y }, start);
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

test("主持为全队提供移速，贪吃成长不改变碰撞体积", () => {
  const engine = createEngine(23);
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "sui_bird", star: 1 };
  engine.state.board[1] = { uid: 2, id: "sui_cat", star: 1 };
  engine.state.board[2] = { uid: 3, id: "grove_mender", star: 1 };
  engine.state.board[3] = { uid: 4, id: "sui_cat", star: 1 };
  engine.state.board[4] = { uid: 5, id: "spark_mage", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  assert.ok(battle);
  battle.enemy.forEach((fighter) => { fighter.hp = 99_999; fighter.maxHp = 99_999; fighter.attack = 0; fighter.armor = 99_999; });
  const hungry = battle.player.find((fighter) => fighter.unitId === "sui_cat");
  const beforeRadius = hungry?.radius;
  for (let tick = 0; tick < 61; tick += 1) {
    battle.player.forEach((fighter) => { fighter.hp = fighter.maxHp; });
    engine.update(0.05);
  }
  assert.ok((hungry?.growthStacks || 0) > 0);
  assert.equal(hungry?.radius, beforeRadius);
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
  assert.equal(nonDancer.energy, 25);
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
  assert.ok(Math.abs(mature.shield - mature.maxHp * 0.13) < 1e-9);
  assert.equal(mature.attackInterval, 1.05 / 1.08);
  battle.enemy.forEach((enemy) => { enemy.hp = 99_999; enemy.maxHp = 99_999; enemy.attack = 0; enemy.armor = 99_999; });

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
  engine.state.board[1] = { uid: 2, id: "yua", star: 1 };
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
  engine.state.board[3] = { uid: 4, id: "sui_blue", star: 1 };
  engine.state.board[4] = { uid: 5, id: "sui_flower", star: 1 };
  engine.state.board[5] = { uid: 6, id: "cinder_ram", star: 1 };
  engine.state.board[6] = { uid: 7, id: "mossback", star: 1 };
  engine.startBattle();
  const xuehui = engine.state.battle?.player.find((fighter) => fighter.unitId === "xuehui");
  const control = engine.state.battle?.player.find((fighter) => fighter.unitId === "mossback");
  assert.ok(xuehui && control);
  assert.equal(xuehui.baseAttack, 37 * 1.15 * 1.75);
  assert.equal(control.baseAttack, 15 * 1.15 * 1.2);
});

test("同步视听按战力差线性调整属性且不重复叠加", () => {
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
  assert.equal(xuehui.moveSpeed, xuehui.baseMoveSpeed * 0.5);
  engine.update(0.05);
  assert.equal(xuehui.range, xuehui.baseRange * 0.5);
  battle.player.forEach((fighter) => { fighter.hp = fighter.maxHp * 0.5; });
  battle.enemy.forEach((fighter) => { fighter.hp = fighter.maxHp; });
  engine.update(0.05);
  assert.equal(xuehui.range, xuehui.baseRange * 1.5);
  assert.equal(xuehui.moveSpeed, xuehui.baseMoveSpeed * 1.5);
});

test("雪绘固定方向子弹可被路径上的首个敌人拦截并施加灼烧", () => {
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
    fighter.x = index === 0 ? 460 : 800;
    fighter.y = source.y;
  });
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.ok(battle.projectileVolley.length > 0 || battle.projectiles.length > 0);
  for (let tick = 0; tick < 25; tick += 1) engine.update(0.05);
  const interceptor = battle.enemy[0];
  assert.ok(interceptor.hp < interceptor.maxHp);
  assert.ok(interceptor.burnTime > 0);
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
  assert.equal(source.energy, source.energyOnAttack);
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
  assert.equal(source.energy, source.energyOnAttack);
  assert.equal(target.energy, target.energyOnHit);
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
  assert.ok(battle.effects.some((effect) => effect.kind === "ring"));
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
    fighter.x = 650;
    fighter.y = 300;
  });
  nori.x = 300;
  nori.y = 300;
  nori.energy = nori.maxEnergy;

  engine.update(0.05);
  engine.update(0.05);
  assert.equal(nori.applePieShotsRemaining, 7);
  nori.stun = 0.3;
  const hpBeforeStun = target.hp;
  for (let tick = 0; tick < 5; tick += 1) engine.update(0.05);
  assert.equal(target.hp, hpBeforeStun);
  assert.equal(nori.applePieShotsRemaining, 7);

  nori.alive = false;
  nori.hp = 0;
  for (let tick = 0; tick < 5; tick += 1) engine.update(0.05);
  assert.equal(target.hp, hpBeforeStun);
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

test("邪恶外星人的贯穿光线命中同横排敌人", () => {
  const engine = createEngine(96);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "yua", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const source = battle?.player[0];
  assert.ok(battle && source);
  const target = battle.enemy[0];
  const aligned = { ...target, fid: "test-aligned", x: 760, y: 330 };
  const outside = { ...target, fid: "test-outside", x: 720, y: 361 };
  battle.enemy.push(aligned, outside);
  [target, aligned, outside].forEach((fighter) => {
    fighter.hp = fighter.maxHp = 9_999;
    fighter.armor = 0;
    fighter.attack = 0;
    fighter.dodgeChance = 0;
  });
  target.x = 500; target.y = 280;
  source.x = 200; source.y = 280;
  assert.equal(source.energyStyle, "alien");
  assert.equal(source.maxEnergy, 75);
  assert.equal(source.energy, 10);
  source.energy = source.maxEnergy;
  engine.update(0.05);
  assert.ok(target.hp < target.maxHp);
  assert.ok(aligned.hp < aligned.maxHp);
  assert.equal(outside.hp, outside.maxHp);
});

test("泽音与恬豆的技能强化会在动态属性刷新后持续到期满", () => {
  const engine = createEngine(97);
  engine.state.playerLevel = 4;
  engine.state.board.fill(null);
  engine.state.board[0] = { uid: 1, id: "zeyin", star: 1 };
  engine.state.board[1] = { uid: 2, id: "tiandou", star: 1 };
  engine.startBattle();
  const battle = engine.state.battle;
  const zeyin = battle?.player.find((fighter) => fighter.unitId === "zeyin");
  const tiandou = battle?.player.find((fighter) => fighter.unitId === "tiandou");
  assert.ok(battle && zeyin && tiandou);
  battle.enemy.forEach((fighter) => { fighter.hp = fighter.maxHp = 99_999; fighter.attack = 0; fighter.armor = 99_999; });
  const zeyinBaseInterval = zeyin.attackInterval;
  zeyin.energy = zeyin.maxEnergy;
  engine.update(0.05);
  assert.equal(zeyin.abilityAttackSpeed, 0.25);
  assert.ok(zeyin.abilityAttackSpeedTime > 3.9);
  engine.update(0.05);
  assert.ok(zeyin.attackInterval < zeyinBaseInterval / 1.2);

  const tiandouBaseSpeed = tiandou.moveSpeed;
  battle.player.forEach((fighter) => { fighter.hp = fighter.maxHp * 0.5; });
  tiandou.energy = tiandou.maxEnergy;
  engine.update(0.05);
  assert.equal(tiandou.abilityMoveSpeed, 16);
  assert.ok(tiandou.abilityMoveSpeedTime > 2.9);
  engine.update(0.05);
  assert.ok(tiandou.moveSpeed >= tiandouBaseSpeed + 15);
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
    fighter.x = 520 + index * 40;
    fighter.y = owner.y;
  });
  owner.x = 260;
  owner.y = 360;
  owner.energy = owner.maxEnergy;
  engine.update(0.05);
  assert.equal(battle.pineTrees.length, 1);
  const tree = battle.pineTrees[0];
  assert.equal(tree.ownerFid, owner.fid);
  const treeX = tree.x;
  const treeY = tree.y;
  battle.projectiles = [];
  stepBattle(engine, 16);
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
  target.x = 620;
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
