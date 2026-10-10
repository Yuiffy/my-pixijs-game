import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const data = await loadTypescriptModule("src/components/autoChessGame/core/gameData.ts");
const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { RunSaveStore, RUN_SAVE_KEY, createRunCheckpoint } = await loadTypescriptModule("src/components/autoChessGame/core/engine/runSave.ts");
const { AUTOPILOT_TERMINAL_TARGET_IDS } = await loadTypescriptModule("src/components/autoChessGame/ai/lateGamePlan.ts");
const { SEER2_PRINCIPAL_VARIATIONS, SEER2_TERMINAL_TARGET_IDS } = await loadTypescriptModule("src/components/autoChessGame/ai/seer2Strategy.ts");

const create = (round = 26, seed = 101015) => {
  const bridge = new EngineBridge(seed);
  bridge.setConsoleLogging(false);
  const engine = bridge.engine;
  engine.state.starterChoices = ["bastion"];
  engine.startRun("bastion");
  engine.state.round = round;
  engine.state.endlessUnlocked = round > data.CAMPAIGN_ROUNDS;
  return { bridge, engine };
};

test("三位毕业核心只在各自固定关出现，所有种子有相同星级、阵容和站位", () => {
  const leaders = new Map([[21, ["yua", 3]], [12, ["hatsuse_guest", 2]], [26, ["miki_guest", 2]]]);
  const names = new Map([[21, "邪恶外星人"], [12, "蝙蝠夜歌"], [26, "肾虚萌音脑控"]]);
  for (let round = 1; round <= 64; round += 1) {
    for (const seed of [0, 1, 3, 152100, 152102, -17]) {
      const wave = data.waveForRound(round, seed);
      const guests = wave.units.filter(({ id }) => data.ENEMY_GUEST_IDS.includes(id));
      const leader = leaders.get(round);
      assert.deepEqual(guests.map(({ id, star }) => [id, star]), leader ? [leader] : []);
      if (!leader) continue;
      assert.deepEqual(wave, data.waveForRound(round, 0));
      assert.equal(wave.name, names.get(round));
      assert.ok(guests[0].formationIndex < 3, "核心应位于后排");
      assert.equal(new Set(wave.units.map(({ formationIndex }) => formationIndex)).size, wave.units.length);
      assert.ok(data.enemyTraitActivations(wave.units).length >= 2);
      assert.equal(data.waveEffectiveValue(wave), round === 26 ? 315 : data.enemyBudgetForRound(round));
      assert.ok(wave.units.every(({ id, star = 1 }) => id === leader[0] || star <= 2));
    }
  }
});

test("所有等级的未来商店、购买入口和托管推荐都排除毕业角色", () => {
  const { engine } = create();
  for (const level of data.PLAYER_LEVELS) {
    engine.previewFutureShopsAtLevels(Array(100).fill(level)).flat().forEach((id) => {
      assert.ok(!data.ENEMY_GUEST_IDS.includes(id));
    });
  }
  for (const id of data.ENEMY_GUEST_IDS) {
    assert.equal(data.UNIT_DEFS[id].shop, false);
    assert.ok(!data.SHOP_UNITS.includes(id));
    assert.ok(!AUTOPILOT_TERMINAL_TARGET_IDS.includes(id));
    assert.ok(!SEER2_TERMINAL_TARGET_IDS.includes(id));
    assert.ok(SEER2_PRINCIPAL_VARIATIONS.every((lineup) => !lineup.includes(id)));
    engine.state.shop[0] = id;
    engine.state.gold = 100;
    const board = structuredClone(engine.state.board);
    engine.buyShopUnit(0);
    assert.equal(engine.state.gold, 100);
    assert.deepEqual(engine.state.board, board);
  }
});

test("固定关的预览站位与实战出生点完全一致，核心星级和攻击居首", () => {
  for (const round of [12, 21, 26]) {
    const { engine } = create(round);
    const preview = JSON.parse(engine.renderTextState()).wave;
    assert.equal(preview.enemyBudget, data.waveEffectiveValue(engine.currentWave));
    engine.startBattle();
    engine.state.battle.enemy.forEach((fighter, index) => {
      assert.equal(fighter.x, preview.units[index].formation.x);
      assert.equal(fighter.y, preview.units[index].formation.y);
      assert.equal(fighter.star, preview.units[index].star);
    });
    const [leader, ...guards] = engine.state.battle.enemy;
    assert.ok(guards.every((guard) => leader.star >= guard.star));
    assert.ok(guards.every((guard) => leader.attack > guard.attack));
  }
});

test("两星弥希留出蓄能与恢复窗口，混星阵容可通关且护卫不因降星增强", () => {
  const wave = data.waveForRound(26);
  const originalComposition = data.waveCompositionValue({ units: wave.units.map((unit) => unit.id === "miki_guest" ? { ...unit, star: 3 } : unit) });
  assert.ok(wave.modifier < Math.sqrt(data.enemyBudgetForRound(26) / originalComposition), "护卫属性不应超过原三星首领版本");
  for (const seed of [1, 77, 101015]) {
    const { engine } = create(26, seed);
    engine.state.playerLevel = 10;
    engine.state.board.fill(null);
    const specs = [["mossback", 5], ["shiori", 11], ["sui_bird", 17], ["sumi", 0], ["spark_mage", 6], ["sui_flower", 12], ["rei", 18], ["cog_scribe", 1], ["lian", 19], ["cinder_ram", 7]];
    specs.forEach(([id, slot], index) => { engine.state.board[slot] = { id, star: ["sumi", "sui_bird", "spark_mage", "lian"].includes(id) ? 3 : 2, uid: index + 1 }; });
    engine.state.augments = ["tempered", "execution", "precision", "second_wind", "overclock", "sharp_edge"];
    engine.startBattle();
    const miki = engine.state.battle.enemy[0];
    assert.ok(miki.energy < miki.maxEnergy, "开场羁绊能量不应直接填满脑控");
    const casts = [];
    const castAbility = engine.castAbility.bind(engine);
    engine.castAbility = (source, targets, ...args) => {
      const result = castAbility(source, targets, ...args);
      if (source === miki) {
        casts.push(engine.state.battle.elapsed);
        targets.filter((target) => target.mindControlSourceFid === miki.fid).forEach((target) => assert.ok(target.mindControlTime <= 1.6));
      }
      return result;
    };
    for (let tick = 0; tick < 1800 && engine.state.phase === "battle"; tick += 1) engine.update(1 / 60);
    assert.equal(engine.state.phase, "result");
    assert.equal(engine.state.result.won, true, `seed ${seed}: 无需全队三星`);
    assert.ok(casts.length >= 1 && casts.length <= 2, "保留脑控特色但不连续压制");
    assert.ok(casts[0] >= 3, "玩家应有几秒时间接战或切入核心");
    assert.ok(casts.slice(1).every((time, index) => time - casts[index] > 1.6), "两次脑控之间应有恢复窗口");
  }
});

test("无限首领三星悠亚能持续贯穿多人，两星基准需强化后才能过关", () => {
  const specs = [["mossback", 5], ["shiori", 11], ["sui_bird", 17], ["sumi", 0], ["spark_mage", 6], ["sui_flower", 12], ["rei", 18], ["cog_scribe", 1], ["lian", 19], ["cinder_ram", 7]];
  for (const invested of [false, true]) {
    const { engine } = create(21);
    engine.state.playerLevel = 10;
    engine.state.board.fill(null);
    specs.forEach(([id, slot], index) => {
      engine.state.board[slot] = { id, star: invested && ["sumi", "sui_bird", "spark_mage", "lian"].includes(id) ? 3 : 2, uid: index + 20 };
    });
    engine.state.augments = ["tempered", "execution", "precision", "second_wind", "overclock"];
    engine.startBattle();
    const yua = engine.state.battle.enemy.find(({ unitId }) => unitId === "yua");
    const castAbility = engine.castAbility.bind(engine);
    let casts = 0;
    let maxBeamHits = 0;
    engine.castAbility = (source, targets, ...args) => {
      const before = targets.map((target) => target.damageTaken);
      const result = castAbility(source, targets, ...args);
      if (source === yua) {
        casts += 1;
        maxBeamHits = Math.max(maxBeamHits, targets.filter((target, index) => target.damageTaken > before[index]).length);
      }
      return result;
    };
    for (let tick = 0; tick < 1800 && engine.state.phase === "battle"; tick += 1) engine.update(1 / 60);
    assert.equal(engine.state.phase, "result");
    assert.equal(engine.state.result.won, invested);
    assert.ok(casts >= 3, "悠亚应存活到多次释放光线");
    assert.ok(maxBeamHits >= 2, "贯穿必须实际命中多人");
    assert.ok(yua.damageDealt > 1500, "核心应产生实战火力压力");
  }
});

const mindControlBattle = (star = 3) => {
  const { engine } = create();
  engine.state.board.fill(null);
  engine.state.board[4] = { uid: 200, id: "nori", star: 2 };
  engine.state.board[10] = { uid: 201, id: "mossback", star: 2 };
  engine.startBattle();
  const battle = engine.state.battle;
  const caster = battle.enemy.find(({ unitId }) => unitId === "miki_guest");
  const [target, ally] = battle.player;
  for (const fighter of [...battle.player, ...battle.enemy]) {
    fighter.energy = 0;
    fighter.energyPerSecond = 0;
    fighter.cooldown = 100;
    fighter.moveSpeed = 0;
    fighter.dodgeChance = 0;
    fighter.jumpPending = false;
    fighter.jumpTime = 0;
    fighter.hp = 5000;
    fighter.maxHp = 5000;
  }
  caster.star = star;
  caster.x = 650;
  caster.y = 345;
  target.x = 500;
  target.y = 345;
  target.attack = 100;
  target.baseAttack = 100;
  target.range = 300;
  ally.x = 400;
  ally.y = 345;
  ally.attack = 10;
  engine.castAbility(caster, battle.player, true);
  return { engine, battle, caster, target, ally };
};

test("妖女脑控按星级锁定最高攻击敌人，其他近邻恐惧，远处单位不受影响", () => {
  for (const star of [1, 2, 3]) {
    const { engine, caster, target, ally } = mindControlBattle(star);
    assert.equal(target.mindControlTime, data.abilityStatForStar(data.UNIT_DEFS.miki_guest, star, "controlDuration", 0));
    assert.equal(target.mindControlSourceFid, caster.fid);
    assert.equal(target.team, "player");
    assert.equal(target.fearTime, 0);
    assert.equal(ally.mindControlTime, 0);
    assert.ok(ally.fearTime > 0);
    assert.ok(target.hp < 5000);
    ally.fearTime = 0;
    ally.x = 250;
    engine.castAbility(caster, [target, ally], true);
    assert.equal(ally.fearTime, 0);
  }
});

test("脑控期间实际反打队友且不施法，持续时间结束后重新攻击敌方", () => {
  const { engine, caster, target, ally } = mindControlBattle();
  target.cooldown = 0;
  target.energy = target.maxEnergy;
  const allyHp = ally.hp;
  const casterHp = caster.hp;
  const casterDamageTaken = caster.damageTaken;
  engine.update(1 / 60);
  assert.ok(ally.hp < allyHp, "队友必须受到真实生命伤害");
  assert.equal(caster.hp, casterHp);
  assert.equal(target.energy, target.maxEnergy, "不能释放苹果派技能");
  assert.equal(target.targetFid, ally.fid);
  target.mindControlTime = 0.001;
  target.cooldown = 0;
  target.energy = 0;
  engine.update(1 / 60);
  assert.equal(target.mindControlTime, 0);
  assert.equal(target.mindControlSourceFid, null);
  assert.equal(target.targetFid, caster.fid, "恢复后应重新瞄准敌方");
  for (let index = 0; index < 45; index += 1) engine.update(1 / 60);
  assert.ok(caster.damageTaken > casterDamageTaken, "恢复后应重新攻击敌方并消耗护盾或生命");
  assert.equal(target.team, "player");
});

test("弥希倒下立即解除脑控，孤立棋子不会攻击自己或被永久改阵营", () => {
  const { engine, battle, caster, target, ally } = mindControlBattle();
  ally.alive = false;
  target.cooldown = 0;
  const hp = target.hp;
  engine.update(1 / 60);
  assert.equal(target.hp, hp);
  assert.equal(target.team, "player");
  caster.alive = false;
  caster.hp = 0;
  engine.update(1 / 60);
  assert.equal(target.mindControlTime, 0);
  assert.equal(target.mindControlSourceFid, null);
  assert.ok(battle.player.includes(target));
});

test("脑控打断隐身破隐蓄力、山猪冲锋和苹果派连射，避免继续释放旧攻击技能", () => {
  const { engine, battle, caster, target } = mindControlBattle();
  target.stealthTime = 4;
  target.sumiDragonReady = true;
  target.sekiChargeActive = true;
  target.applePieShotsRemaining = 6;
  target.channelTime = 2;
  engine.castAbility(caster, battle.player, true);
  assert.equal(target.stealthTime, 0);
  assert.equal(target.sumiDragonReady, false);
  assert.equal(target.sekiChargeActive, false);
  assert.equal(target.applePieShotsRemaining, 0);
  assert.equal(target.channelTime, 0);
});

test("旧存档悠亚按星级完整退款，清空己方和锁定商店，迁移后重载不重复退款", () => {
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  const store = new RunSaveStore(storage);
  const { engine } = create(9);
  const snapshot = engine.getSimulationSnapshot();
  snapshot.state.board[0] = { uid: 1, id: "yua", star: 2 };
  snapshot.state.bench[0] = { uid: 2, id: "yua", star: 3 };
  snapshot.state.board[1] = { uid: 3, id: "sumi", star: 1 };
  snapshot.state.board.fill(null, 2);
  snapshot.uid = 4;
  snapshot.state.shop = ["yua", "sumi", null, null, null];
  snapshot.state.shopLocked = true;
  const gold = snapshot.state.gold;
  store.write(createRunCheckpoint(snapshot));
  assert.ok(entries.has(RUN_SAVE_KEY));
  const loaded = store.load();
  assert.ok(loaded);
  assert.equal(loaded.retiredRefund, 48);
  assert.equal(loaded.snapshot.state.gold, gold + 48);
  assert.equal(loaded.snapshot.state.board[0], null);
  assert.equal(loaded.snapshot.state.bench[0], null);
  assert.equal(loaded.snapshot.state.board[1].id, "sumi");
  assert.equal(loaded.snapshot.state.shop[0], null);
  assert.equal(loaded.snapshot.state.shopLocked, true);
  store.write(createRunCheckpoint(loaded.snapshot));
  assert.equal(store.load().snapshot.state.gold, gold + 48);
  store.write(createRunCheckpoint(snapshot, true));
  const resumed = new EngineBridge(99);
  resumed.setConsoleLogging(false);
  resumed.attachRunStorage(storage);
  resumed.dispatch({ type: "resume" });
  assert.equal(resumed.engine.state.phase, "battle");
  assert.equal(resumed.battlePaused, true);
  assert.equal(resumed.engine.state.gold, gold + 48);
  assert.ok(resumed.engine.state.battle.player.every(({ unitId }) => unitId !== "yua"));
  assert.match(resumed.engine.state.toast.text, /悠亚.*返还 48 金币/);
  snapshot.state.board[1] = null;
  store.write(createRunCheckpoint(snapshot, true));
  const empty = new EngineBridge(100);
  empty.setConsoleLogging(false);
  empty.attachRunStorage(storage);
  empty.dispatch({ type: "resume" });
  assert.equal(empty.engine.state.phase, "preparation");
  assert.equal(empty.battlePaused, false);
  assert.equal(empty.engine.state.gold, gold + 48);
});
