import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const data = await loadTypescriptModule('src/components/autoChessGame/core/gameData.ts');
const { AutoChessEngine } = await loadTypescriptModule('src/components/autoChessGame/core/gameEngine.ts');
const { RunSaveStore, createRunCheckpoint } = await loadTypescriptModule('src/components/autoChessGame/core/engine/runSave.ts');
const { createGoCombatScorer } = await loadTypescriptModule('src/components/autoChessGame/ai/goValueModel.ts');
const ids = ['viridis', 'sumire', 'chu2u', 'komichi'];
const setup = (specs = ids.map(id => [id, 1]), seed = 287) => {
  const engine = new AutoChessEngine(seed);
  engine.state.starterChoices = ['blaze'];
  engine.startRun('blaze');
  engine.state.playerLevel = 10;
  engine.state.board.fill(null);
  specs.forEach(([id, star], index) => { engine.state.board[index] = { uid: 2870 + index, id, star }; });
  engine.startBattle();
  return engine;
};
const inert = fighter => {
  fighter.energy = 0; fighter.energyPerSecond = 0; fighter.energyOnAttack = 0;
  fighter.energyOnHit = 0; fighter.moveSpeed = 0; fighter.baseMoveSpeed = 0;
  fighter.cooldown = 100; fighter.dodgeChance = 0; fighter.shield = 0;
};
const step = (engine, seconds) => { for (let t = 0; t < seconds - 1e-8; t += 0.025) engine.update(0.025); };

test('287 四人同场，实际费用池与技能成长、所有头像资源完整', async () => {
  assert.equal(data.SHOP_UNITS.length, 44);
  assert.deepEqual(data.SHOP_TIER_COUNTS, [7, 9, 11, 11, 6]);
  assert.deepEqual(data.SHOP_UNITS.filter(id => data.UNIT_DEFS[id].traits.includes('gen287')).sort(), [...ids].sort());
  assert.deepEqual(ids.map(id => data.UNIT_DEFS[id].cost), [2, 4, 4, 5]);
  for (const id of ids.slice(0, 3)) {
    const def = data.UNIT_DEFS[id];
    assert.equal(def.abilityLevels.length, 3);
    for (const star of [1, 2, 3]) assert.ok(data.abilityDescriptionForStar(def, star).length > 10);
    await access(`public${def.portrait}`);
  }
  assert.equal(data.SHOP_UNITS.includes('yua'), false);
});

test('287 同名去重，开战加能与护甲只作用于成员，两档接力不回给自身', () => {
  for (const count of [1, 2, 4]) {
    const engine = setup([...ids.slice(0, count).map(id => [id, 1]), ['viridis', 1], ['nori', 1]]);
    assert.equal(engine.getTraitCounts().gen287, count);
    const member = engine.state.battle.player[0];
    const level = count === 1 ? 0 : count === 2 ? 1 : 2;
    assert.equal(member.energy, data.UNIT_DEFS.viridis.energyProfile.start + [0, 10, 20][level]);
    assert.equal(member.armor, data.UNIT_DEFS.viridis.armor + (level === 2 ? 12 : 0));
    const nonmember = engine.state.battle.player.find(f => f.unitId === 'nori');
    assert.equal(nonmember.armor, data.UNIT_DEFS.nori.armor);
    engine.state.battle.player.forEach(inert);
    const partner = engine.state.battle.player[1];
    engine.state.battle.player.filter(f => f !== member && f !== partner && f !== nonmember).forEach(f => { f.energy = f.maxEnergy; });
    partner.energy = 2;
    member.hp -= 80;
    engine.castAbility(member, engine.state.battle.enemy, true);
    assert.equal(partner.energy, 2 + [0, 8, 14][level]);
    assert.equal(member.energy, member.castRefund);
    assert.equal(nonmember.energy, 0);
  }
});

test('小松绿敌我各星无需受击或附近目标，回满能量自动种圈，消耗能量后不连放', () => {
  for (const star of [1, 2, 3]) for (const team of ['player', 'enemy']) {
    const engine = setup([['viridis', star]]);
    if (team === 'enemy') {
      Object.defineProperty(engine, 'currentWave', { get: () => ({ round: 1, name: '植物', tag: '植物', modifier: 1, units: [{ id: 'viridis', star }] }) });
      engine.state.phase = 'preparation'; engine.startBattle();
    }
    const battle = engine.state.battle;
    [...battle.player, ...battle.enemy].forEach(inert);
    const source = battle[team][0];
    source.x = team === 'player' ? 100 : 1000; source.y = 300;
    const opponents = battle[team === 'player' ? 'enemy' : 'player'];
    opponents.forEach(f => { f.x = team === 'player' ? 1000 : 100; f.y = 300; });
    source.energy = source.maxEnergy - .5; source.energyPerSecond = 7;
    step(engine, .025); assert.equal(battle.healingZones.length, 0);
    step(engine, .1);
    assert.equal(source.damageTaken, 0); assert.equal(source.hp, source.maxHp);
    assert.equal(battle.healingZones.length, 1);
    const zone = battle.healingZones[0];
    assert.equal(zone.team, team); assert.equal(zone.x, source.x); assert.equal(zone.y, source.y);
    assert.ok(Math.abs(source.shield - source.maxHp * [0, .12, .16, .2][star]) < 1e-6);
    assert.ok(source.energy < 1);
    step(engine, 1.05); assert.equal(battle.healingZones.length, 1);
    source.energy = source.maxEnergy; step(engine, .025);
    assert.equal(battle.healingZones.length, 2);
  }
});

test('小松绿各星固定养护圈：四次回血，越界／敌人不受益，溢出不削现有大盾', () => {
  for (const star of [1, 2, 3]) {
    const engine = setup([['viridis', star], ['nori', 1], ['sui', 1]]);
    const { battle } = engine.state;
    [...battle.player, ...battle.enemy].forEach(inert);
    const [source, ally, outside] = battle.player;
    source.x = 210; source.y = 300;
    ally.x = 300; ally.y = 300; ally.hp = ally.maxHp * 0.2;
    outside.x = 460; outside.y = 300; outside.hp = outside.maxHp * 0.9;
    engine.castAbility(source, battle.enemy, true);
    const zone = battle.healingZones[0];
    assert.equal(zone.kind, 'plant'); assert.equal(zone.x, 210);
    const initial = ally.hp;
    const outsideHp = outside.hp;
    const enemyHp = battle.enemy[0].hp;
    source.alive = false; // 已种下的圈继续工作。
    step(engine, 4.05);
    assert.ok(Math.abs(ally.hp - Math.min(ally.maxHp, initial + ally.maxHp * [0, .03, .04, .05][star] * 4)) < 1e-6);
    assert.equal(outside.hp, outsideHp); assert.equal(battle.enemy[0].hp, enemyHp);
    assert.equal(battle.healingZones.length, 0);
    // 重新种植，用大盾覆盖的满血单位检验不会被低上限反向削盾。
    source.alive = true; ally.hp = ally.maxHp * 0.5;
    engine.castAbility(source, battle.enemy, true);
    ally.hp = ally.maxHp; ally.shield = ally.maxHp * 0.4;
    step(engine, 1.05);
    assert.equal(ally.shield, ally.maxHp * 0.4);
    ally.shield = 0;
    step(engine, 1);
    assert.ok(ally.shield > 0 && ally.shield <= ally.maxHp * .18);
    const shield = ally.shield;
    ally.x = 480;
    step(engine, 1);
    assert.equal(ally.shield, shield);
  }
});

test('枝堇三档范围真实伤害、扣能量下限、固定圈减速与离开恢复', () => {
  for (const star of [1, 2, 3]) {
    const engine = setup([['sumire', star]]);
    const { battle } = engine.state;
    [...battle.player, ...battle.enemy].forEach(inert);
    const source = battle.player[0]; source.x = 300; source.y = 300;
    const target = battle.enemy[0]; target.x = 540; target.y = 300;
    target.hp = target.maxHp = 10000; target.energy = 10;
    const before = target.hp;
    engine.castAbility(source, battle.enemy, true);
    assert.ok(target.hp < before); assert.equal(target.energy, 0);
    assert.equal(battle.controlZones[0].maxLife, [0, 3, 3.5, 4][star]);
    assert.equal(target.slowMultiplier, .45);
    target.x = 820;
    step(engine, .3);
    assert.equal(target.slowTime, 0); assert.equal(target.slowMultiplier, 1);
    step(engine, 4);
    assert.equal(battle.controlZones.length, 0);
  }
});

test('羽啾锁定最高攻击，三段飞行与末段控制，死亡重选及施法者倒下取消待发卡', () => {
  for (const star of [1, 2, 3]) {
    const engine = setup([['chu2u', star], ['nori', 1]]);
    const { battle } = engine.state;
    const copy = structuredClone(battle.enemy[0]); copy.fid += '-high';
    battle.enemy.push(copy);
    [...battle.player, ...battle.enemy].forEach(inert);
    const source = battle.player[0]; source.x = 300; source.y = 300;
    const low = battle.enemy[0]; low.x = 450; low.y = 440; low.attack = 1;
    copy.x = 600; copy.y = 300; copy.attack = 100; copy.hp = copy.maxHp = 10000;
    engine.castAbility(source, battle.enemy, true);
    assert.equal(battle.projectileVolley.length, 3);
    assert.ok(battle.projectileVolley.every(s => s.targetFid === copy.fid));
    const hp = copy.hp;
    step(engine, .2); assert.equal(copy.hp, hp); assert.equal(copy.stun, 0);
    assert.ok(battle.projectiles.some(p => p.emoji === '📡'));
    step(engine, 1.25);
    assert.ok(copy.hp < hp && copy.stun > 0);
    assert.ok(copy.x > 600);
    engine.castAbility(source, battle.enemy, true);
    copy.alive = false;
    step(engine, .025);
    assert.ok(battle.projectiles.some(p => p.sourceFid === source.fid && p.velocityY > 0));
    source.alive = false;
    step(engine, .9);
    assert.equal(battle.projectileVolley.length, 0);
  }
});

test('新角色能真实购买、三合一、备战续档，现有 Go 权重投影保持有限分数', async () => {
  const engine = setup(); engine.state.phase = 'preparation'; engine.state.battle = null;
  engine.state.board.fill(null); engine.state.bench.fill(null); engine.state.gold = 100;
  for (const id of ids.slice(0, 3)) {
    for (let n = 0; n < 3; n++) { engine.state.shop[0] = id; engine.buyShopUnit(0); }
    assert.ok([...engine.state.board, ...engine.state.bench].some(u => u?.id === id && u.star === 2));
  }
  const entries = new Map();
  const store = new RunSaveStore({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) });
  store.write(createRunCheckpoint(engine.getSimulationSnapshot(), false));
  const saved = store.load(); assert.ok(saved);
  assert.ok(saved.snapshot.state.board.some(u => u?.id === 'sumire'));
  const model = JSON.parse(await readFile('src/components/autoChessGame/ai/goCombatModel.json', 'utf8'));
  const score = createGoCombatScorer(model)({ starter: null, augments: [], waveTag: '287', modifier: 1, players: ids.map((id, index) => ({ id, star: 2, position: index })), enemies: [{ id: 'sun_guard', star: 2, position: 0 }] });
  assert.ok(Number.isFinite(score));
});

test('敌方 287 使用相同开战与接力规则，不给对手传能，死亡／满能成员排除', () => {
  const engine = setup([['nori', 1]]);
  Object.defineProperty(engine, 'currentWave', { get: () => ({ round: 1, name: '287', tag: '287', modifier: 1, units: ids.map(id => ({ id, star: 1 })) }) });
  engine.state.phase = 'preparation'; engine.startBattle();
  const { battle } = engine.state;
  const source = battle.enemy.find(f => f.unitId === 'viridis');
  assert.equal(source.energy, data.UNIT_DEFS.viridis.energyProfile.start + 20);
  assert.equal(source.armor, data.UNIT_DEFS.viridis.armor + 12);
  [...battle.player, ...battle.enemy].forEach(inert);
  const partner = battle.enemy.find(f => f.unitId === 'chu2u');
  battle.enemy.find(f => f.unitId === 'sumire').alive = false;
  const full = battle.enemy.find(f => f.unitId === 'komichi'); full.energy = full.maxEnergy;
  source.hp -= 80;
  engine.castAbility(source, battle.player, true);
  assert.equal(partner.energy, 14);
  assert.equal(full.energy, full.maxEnergy);
  assert.equal(battle.player[0].energy, 0);
});
