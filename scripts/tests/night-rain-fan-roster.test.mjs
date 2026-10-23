import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { engine, world, riverCompleted } from './helpers/night-rain-sky.mjs';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
const { fanOf, FAN_ENEMIES, fanAttack } = await load('src/components/nightRain/fanEnemies.ts');
const { isBoss, enemyRole, ROLE_NAMES } = await load('src/components/nightRain/encounters.ts');
const { bestiaryKey, bestiaryDescription, bestiaryName } = await load('src/components/nightRain/bestiary.ts');

test('every ordinary enemy in every chapter and dungeon has a fan appearance', () => {
  const s = engine.createGame();
  for (const e of s.enemies) {
    if (isBoss(e)) { assert.equal(fanOf(e), undefined, e.id); continue; }
    assert.ok(fanOf(e), e.id + ' must not fall back to the old human head');
    assert.equal(e.name, FAN_ENEMIES[e.id].name);
  }
  for (const prefix of ['sky-', 'bell-']) {
    assert.ok(new Set(s.enemies.filter(e => e.id.startsWith(prefix) && !isBoss(e)).map(fanOf)).size >= 4);
  }
});

test('existing v13 saves keep combat, deaths, progress and role discoveries when uniforms change', () => {
  const s = riverCompleted(); const watch = s.enemies.find(e => e.id === 'sky-tower-guard');
  watch.hp -= 7; watch.action = 'recover'; watch.timer = 1.03;
  const defeated = s.enemies.find(e => e.id === 'sky-salt-blade'); defeated.hp = 0; defeated.action = 'dead';
  s.bestiary.push('role:blade');
  const raw = JSON.parse(engine.saveGame(s));
  for (const e of raw.enemies) if (FAN_ENEMIES[e.id]?.cosmeticOnly) e.name = world.ENEMY_SPAWNS.find(p => p.id === e.id).name;
  const loaded = engine.loadGame(JSON.stringify(raw)); assert.ok(loaded);
  assert.deepEqual(loaded.player, s.player); assert.deepEqual(loaded.bestiary, s.bestiary);
  assert.deepEqual(loaded.enemies, s.enemies);
  assert.equal(bestiaryKey(defeated), 'role:blade');
  assert.doesNotMatch(bestiaryDescription(watch), /方块重凿|施工镐/);
  raw.enemies.find(e => e.id === watch.id).name = 'unrecognized name';
  assert.equal(engine.loadGame(JSON.stringify(raw)), null);
});

test('new uniforms retain existing role attacks and giant discovery', () => {
  const s = engine.createGame();
  const uniforms = s.enemies.filter(e => FAN_ENEMIES[e.id]?.cosmeticOnly);
  assert.ok(uniforms.length > 50);
  for (const e of uniforms) for (let attackIndex = 0; attackIndex < 3; attackIndex++) {
    assert.equal(fanAttack({ ...e, attackIndex }), null, e.id + ' keeps its weapon role');
    if (e.id !== 'cave-hulk') {
      assert.equal(bestiaryKey(e), `role:${enemyRole(e)}`);
      const entry = s.enemies.find(other => bestiaryKey(other) === bestiaryKey(e));
      assert.equal(bestiaryName(entry), ROLE_NAMES[enemyRole(e)], e.id + ' shares a role title instead of another fan name');
    }
  }
  assert.equal(bestiaryKey(s.enemies.find(e => e.id === 'cave-hulk')), 'giant:guard');
});

test('both downloadable test saves remain loadable', async () => {
  for (const file of ['after-two.json', 'after-three.json']) {
    assert.ok(engine.loadGame(await readFile(`public/games/night-rain/test-saves/${file}`, 'utf8')), file);
  }
});
