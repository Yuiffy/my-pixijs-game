import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { UNIT_DEFS, SHOP_UNITS, TRAITS } = await loadTypescriptModule('src/components/autoChessGame/core/gameData.ts');
const { AutoChessEngine } = await loadTypescriptModule('src/components/autoChessGame/core/gameEngine.ts');
const { contributeSinging } = await loadTypescriptModule('src/components/autoChessGame/core/engine/singing.ts');
const singers = ['cinder_ram', 'zeyin', 'komichi', 'lovely', 'clock_gunner', 'grove_mender', 'rift_brawler', 'sui', 'tower_god'];
const roster = ['clock_gunner', 'rift_brawler', 'grove_mender', 'sui', 'cinder_ram', 'tower_god'];
function setup(ids = roster) {
  const engine = new AutoChessEngine(8021);
  engine.state.starterChoices = ['blaze']; engine.startRun('blaze');
  engine.state.playerLevel = 10; engine.state.board.fill(null);
  ids.forEach((id, i) => { engine.state.board[i] = { uid: i + 100, id, star: 1 }; });
  engine.startBattle();
  for (const f of [...engine.state.battle.player, ...engine.state.battle.enemy]) {
    f.energy = f.energyPerSecond = f.energyOnAttack = f.energyOnHit = 0;
    f.cooldown = 100; f.moveSpeed = f.baseMoveSpeed = 0;
    f.dodgeChance = f.critChance = f.lifesteal = 0;
    f.shield = f.abilityShield = 0; f.hitPulse = 0;
  }
  return engine;
}
const host = engine => ({
  heal: (s, t, a) => engine.heal(s, t, a),
  grantAbilityShield: (s, t, a, d, b) => engine.grantAbilityShield(s, t, a, d, b),
  addEffect: effect => engine.addEffect(effect),
});
const sing = (engine, f) => contributeSinging(engine.state.battle, f, host(engine));
const step = (engine, seconds) => { for (let t = 0; t < seconds - 1e-8; t += .025) engine.update(.025); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('合唱严格采用指定九人名单，岁己仅小红帽加入，小松绿仍为怕死受击自保', () => {
  assert.deepEqual(Object.values(UNIT_DEFS).filter(u => u.traits.includes('singer')).map(u => u.id).sort(), [...singers].sort());
  assert.equal(singers.filter(id => SHOP_UNITS.includes(id)).length, 9);
  assert.equal(TRAITS.singer.name, '合唱');
  assert.deepEqual(TRAITS.singer.thresholds, [2, 4, 6]);
  assert.deepEqual(Object.values(UNIT_DEFS).filter(u => u.title.includes('岁己') && u.traits.includes('singer')).map(u => u.id), ['sui']);
  for (const id of ['seki_boar_king', 'miki_guest', 'hatsuse_guest', 'spark_mage', 'cog_scribe']) assert.equal(UNIT_DEFS[id].traits.includes('singer'), false);
  assert.deepEqual(UNIT_DEFS.viridis.traits, ['gen287', 'vanguard']);
  assert.equal(UNIT_DEFS.viridis.abilityName, '裸子植物');
  assert.equal(UNIT_DEFS.viridis.abilityCastTiming, 'selfOnHit');
});

test('2/4/6 开战档位按不同姓名计数；技能增伤真实结算，普攻及非成员不增幅', () => {
  for (const [count, level, bonus] of [[1, 0, 0], [2, 1, .12], [4, 2, .2], [6, 3, .3]]) {
    const engine = setup([...roster.slice(0, count), roster[0], 'nori']);
    const b = engine.state.battle; assert.equal(b.singing.player.level, level);
    const target = b.enemy[0]; target.armor = 0; target.hp = target.maxHp = 100000;
    const source = b.player[0];
    const ability = engine.damage(source, target, 100, false, 'ability');
    b.singing.player.level = 0;
    const base = engine.damage(source, target, 100, false, 'ability');
    near(ability / base, 1 + bonus);
    b.singing.player.level = level;
    near(engine.damage(source, target, 100), base);
    const other = b.player.at(-1);
    const boosted = engine.damage(other, target, 100, false, 'ability');
    b.singing.player.level = 0;
    near(engine.damage(other, target, 100, false, 'ability'), boosted);
  }
});

test('不同声部轮唱，同名和同一施法者不能刷；6 秒过期，4 秒休息不能预存', () => {
  const e = setup([roster[0], roster[1], roster[0]]); const b = e.state.battle;
  sing(e, b.player[0]); sing(e, b.player[0]); sing(e, b.player[2]);
  assert.deepEqual(b.singing.player.voices, [roster[0]]);
  b.elapsed = 6; sing(e, b.player[1]);
  assert.deepEqual(b.singing.player.voices, [roster[1]]);
  b.elapsed = 7; sing(e, b.player[0]); assert.equal(b.singing.player.choruses, 1);
  b.elapsed = 10.99; sing(e, b.player[0]); assert.deepEqual(b.singing.player.voices, []);
  b.elapsed = 11; sing(e, b.player[0]); assert.deepEqual(b.singing.player.voices, [roster[0]]);
});

test('2/4/6 和声治疗生命比例最低的受伤友军，高档仅为合唱授予术盾', () => {
  for (const [count, needed, ratio, shield] of [[2, 2, .04, 0], [4, 3, .06, .04], [6, 4, .08, .06]]) {
    const e = setup([...roster.slice(0, count), 'nori', 'mossback']); const b = e.state.battle;
    const patients = b.player.slice(-2); patients.forEach((f, i) => { f.hp = f.maxHp * (.1 + i * .1); });
    const before = patients.map(f => f.hp);
    for (let i = 0; i < needed - 1; i++) sing(e, b.player[i]);
    assert.equal(b.singing.player.choruses, 0);
    sing(e, b.player[needed - 1]); assert.equal(b.singing.player.choruses, 1);
    near(patients[0].hp, before[0] + patients[0].maxHp * ratio);
    near(patients[1].hp, before[1] + (count === 6 ? patients[1].maxHp * ratio : 0));
    b.player.slice(0, count).forEach(f => { near(f.abilityShield, f.maxHp * shield); if (shield) assert.equal(f.abilityShieldTime, 3); });
    assert.equal(patients[0].abilityShield, 0);
    assert.equal(patients[1].abilityShield, 0);
    assert.ok(b.enemy.every(f => f.abilityShield === 0));
  }
});

test('术盾只挡技能，三秒后消失，和声不削弱或缩短已有强盾', () => {
  const e = setup(roster.slice(0, 4)); const b = e.state.battle; const target = b.player[0];
  sing(e, target); sing(e, b.player[1]); sing(e, b.player[2]);
  const shield = target.abilityShield; target.armor = 0;
  e.damage(b.enemy[0], target, 10); assert.equal(target.abilityShield, shield);
  e.damage(b.enemy[0], target, 10, false, 'ability'); assert.ok(target.abilityShield < shield);
  step(e, 3.05); assert.equal(target.abilityShield, 0);
  target.abilityShield = target.maxHp * .4; target.abilityShieldTime = 8;
  b.elapsed = b.singing.player.readyAt;
  sing(e, target); sing(e, b.player[1]); sing(e, b.player[2]);
  near(target.abilityShield, target.maxHp * .4); assert.equal(target.abilityShieldTime, 8);
});

test('阵亡和脑控不能贡献声部，失效声部被清除；治疗排除阵亡和脑控友军', () => {
  const e = setup([...roster.slice(0, 4), 'nori', 'mossback']); const b = e.state.battle;
  sing(e, b.player[0]); b.player[0].alive = false;
  sing(e, b.player[1]); assert.deepEqual(b.singing.player.voices, [roster[1]]);
  b.player[1].mindControlTime = 3; sing(e, b.player[2]);
  assert.deepEqual(b.singing.player.voices, [roster[2]]);
  sing(e, b.player[1]); assert.deepEqual(b.singing.player.voices, [roster[2]]);
  b.player[0].hp = 0; b.player[1].hp = 1;
  b.player.at(-1).hp = 1; b.player.at(-1).mindControlTime = 3;
  b.player.at(-2).hp = b.player.at(-2).maxHp * .5;
  const patient = b.player.at(-2); const hp = patient.hp;
  b.player[1].mindControlTime = 0; b.player[1].hp = b.player[1].maxHp;
  sing(e, b.player[1]); sing(e, b.player[3]);
  near(patient.hp, hp + patient.maxHp * .06);
  assert.equal(b.player[0].abilityShield, 0); assert.equal(b.player.at(-1).hp, 1);
});

test('敌我分别轮唱并享受相同增伤，敌方同名成员可合唱', () => {
  const e = setup(roster.slice(0, 2));
  Object.defineProperty(e, 'currentWave', { get: () => ({ round: 1, name: '演唱', tag: '演唱', modifier: 1, units: ['clock_gunner', 'rift_brawler'].map(id => ({ id, star: 1 })) }) });
  e.state.phase = 'preparation'; e.startBattle(); const b = e.state.battle;
  assert.equal(b.singing.enemy.level, 1);
  sing(e, b.player[0]); sing(e, b.enemy[0]); sing(e, b.enemy[1]);
  assert.equal(b.singing.enemy.choruses, 1); assert.equal(b.singing.player.choruses, 0);
  assert.deepEqual(b.singing.player.voices, [roster[0]]);
  const target = b.player[0]; target.hp = target.maxHp = 100000; target.shield = target.abilityShield = target.dodgeChance = target.critChance = 0;
  const value = e.damage(b.enemy[0], target, 100, false, 'ability');
  b.singing.enemy.level = 0; near(value / e.damage(b.enemy[0], target, 100, false, 'ability'), 1.12);
});

test('真实施法 hook 计声一次，阿梓持续歌唱不额外计声；小松绿满能受击才放原地植物', () => {
  const e = setup(['cinder_ram', 'clock_gunner', 'viridis']); const b = e.state.battle;
  e.castAbility(b.player[0], b.enemy, true);
  assert.deepEqual(b.singing.player.voices, ['cinder_ram']);
  step(e, 1.1); assert.equal(b.singing.player.choruses, 0);
  assert.deepEqual(b.singing.player.voices, ['cinder_ram']);
  const green = b.player[2]; green.energy = green.maxEnergy; green.x = 250; green.y = 300;
  step(e, .05); assert.equal(b.healingZones.length, 0);
  e.damage(b.enemy[0], green, 10); step(e, .025);
  assert.equal(b.healingZones.length, 1);
  const zone = b.healingZones[0]; assert.equal(zone.x, 250); assert.equal(zone.y, 300);
  assert.ok(green.shield >= green.maxHp * .12);
  green.x += 200; green.y += 100; step(e, .1);
  assert.equal(zone.x, 250); assert.equal(zone.y, 300);
  assert.deepEqual(b.singing.player.voices, ['cinder_ram']);
});
