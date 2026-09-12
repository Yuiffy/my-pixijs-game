import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const {
  createGame, startGame, stepGame, interact, chooseDialogue, continueResult,
  toggleMember, usePotion, saveGame, loadGame, maxHp, findPath,
} = await loadTypescriptModule('src/components/overworldRpg/engine.ts');
const { TILE, WORLD_WIDTH, WORLD_HEIGHT, ENTITIES, CHARACTERS, isWalkable } =
  await loadTypescriptModule('src/components/overworldRpg/content.ts');

const idle = { x: 0, y: 0 };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const entity = id => {
  const found = ENTITIES.find(item => item.id === id);
  assert.ok(found, `Missing world entity ${id}`);
  return found;
};
const fresh = () => {
  const state = createGame();
  assert.equal(state.mode, 'title');
  startGame(state);
  assert.equal(state.mode, 'explore');
  return state;
};
const tilePoint = (x, y) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
const cellKey = (x, y) => `${x},${y}`;

// Independent four-way BFS: every travel action below goes through real movement,
// without changing the player's coordinates or granting progression resources.
const reachable = origin => {
  const x = Math.floor(origin.x / TILE); const y = Math.floor(origin.y / TILE);
  const start = cellKey(x, y); const queue = [[x, y]];
  const parents = new Map([[start, null]]);
  for (let index = 0; index < queue.length; index += 1) {
    const [cx, cy] = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx; const ny = cy + dy; const key = cellKey(nx, ny);
      const point = tilePoint(nx, ny);
      if (nx < 0 || ny < 0 || point.x >= WORLD_WIDTH || point.y >= WORLD_HEIGHT
        || parents.has(key) || !isWalkable(point.x, point.y)) continue;
      parents.set(key, cellKey(cx, cy)); queue.push([nx, ny]);
    }
  }
  return { queue, parents };
};
const walkTo = (state, target) => {
  assert.equal(state.mode, 'explore');
  if (distance(state.player, target) <= 72) return;
  const { queue, parents } = reachable(state.player);
  const goal = queue.find(([x, y]) => distance(tilePoint(x, y), target) <= 72);
  assert.ok(goal, `No walkable approach to ${target.id ?? JSON.stringify(target)}`);
  const route = [];
  for (let key = cellKey(...goal); key !== null; key = parents.get(key)) {
    const [x, y] = key.split(',').map(Number); route.push(tilePoint(x, y));
  }
  for (const point of route.reverse()) {
    let steps = 0;
    while (distance(state.player, point) > 2 && steps < 120) {
      stepGame(state, 25, { ...idle, target: point }); steps += 1;
    }
    assert.ok(distance(state.player, point) <= 2, `Movement stuck at ${JSON.stringify(state.player)} toward ${JSON.stringify(point)}`);
  }
  assert.ok(distance(state.player, target) <= 100);
};
const open = (state, id) => {
  walkTo(state, entity(id)); interact(state, id);
  assert.equal(state.mode, 'dialogue', `Expected dialogue for ${id}: ${state.message}`);
  assert.equal(state.dialogue?.entityId, id);
};
const choice = (state, id) => {
  const option = state.dialogue?.choices.find(item => item.id === id);
  assert.ok(option, `Missing choice ${id}: ${JSON.stringify(state.dialogue)}`);
  assert.ok(!option.disabled, `Disabled choice ${id}: ${JSON.stringify(state.dialogue)}`);
  chooseDialogue(state, id);
};
const close = state => {
  if (state.mode === 'dialogue') choice(state, 'leave');
  assert.equal(state.mode, 'explore');
};
const recruit = (state, id) => {
  open(state, id); choice(state, 'recruit'); close(state);
  assert.ok(state.party.some(member => member.id === entity(id).characterId));
};
const camp = (state, id, upgrade = false) => {
  open(state, id); choice(state, 'rest');
  if (upgrade) {
    for (let count = 0; count < 8; count += 1) {
      if (state.mode !== 'dialogue') interact(state, id);
      const option = state.dialogue?.choices.find(item => item.id === 'upgrade');
      if (!option || option.disabled) break;
      const before = state.weapon; choice(state, 'upgrade');
      assert.ok(state.weapon > before, 'An affordable upgrade must improve the weapon');
    }
  }
  close(state);
  assert.ok(state.party.every(member => member.hp === maxHp(state, member.id)), 'Rest restores the entire recruited party');
};
const beginBattle = (state, id) => {
  open(state, id); choice(state, 'fight');
  assert.equal(state.mode, 'battle', `Could not begin ${id}`);
  assert.equal(state.battle?.encounterId, id);
};
const resolveBattle = state => {
  for (let elapsed = 0; state.mode === 'battle' && elapsed < 120000; elapsed += 50) stepGame(state, 50, idle);
  assert.equal(state.mode, 'result', `Battle did not resolve: ${JSON.stringify(state.battle)}`);
  return state.result;
};
const win = (state, id) => {
  beginBattle(state, id);
  const result = resolveBattle(state);
  assert.equal(result?.won, true, `Expected prepared party to defeat ${id}: ${JSON.stringify({ level: state.level, weapon: state.weapon, active: state.active, result })}`);
  assert.ok(state.completed.includes(id));
  continueResult(state); assert.equal(state.mode, 'explore');
};

test('all world encounters, recruits, camps and the return portal have a reachable approach from the start', () => {
  const state = fresh(); const { queue } = reachable(state.player);
  assert.ok(queue.length > 300, 'The explorable world should contain substantial connected space');
  assert.equal(new Set(ENTITIES.map(item => item.id)).size, ENTITIES.length);
  for (const item of ENTITIES) {
    assert.ok(queue.some(([x, y]) => distance(tilePoint(x, y), item) <= 100), `${item.id} is cut off by terrain`);
    if (item.characterId) assert.ok(CHARACTERS[item.characterId], `${item.id} references a missing character`);
    for (const enemy of item.enemies ?? []) assert.ok(CHARACTERS[enemy], `${item.id} references a missing enemy`);
  }
  assert.equal(isWalkable(-1, -1), false);
  assert.equal(isWalkable(WORLD_WIDTH + TILE, WORLD_HEIGHT + TILE), false);
});

test('remote interaction and an unearned final challenge cannot bypass exploration or seals', () => {
  const state = fresh(); const before = saveGame(state);
  interact(state, 'rift_tyrant');
  assert.equal(state.mode, 'explore');
  assert.deepEqual(state.completed, []); assert.equal(state.shards, 0);
  assert.equal(loadGame(before)?.party.length, 1);
  open(state, 'shiori'); chooseDialogue(state, 'recruit');
  assert.ok(!state.party.some(member => member.id === 'shiori'), 'A recruitment quest must be earned'); close(state);
  open(state, 'rift_tyrant');
  chooseDialogue(state, 'fight');
  assert.notEqual(state.mode, 'battle');
  close(state);
  open(state, 'home'); chooseDialogue(state, 'return');
  assert.notEqual(state.mode, 'ending');
});

test('click-navigation routes with the UI waypoint tolerance reach every entity without crossing blocked terrain', () => {
  for (const target of ENTITIES) {
    const state = fresh(); const route = findPath(state.player, target);
    assert.ok(route.length > 0, `No click route to ${target.id}`);
    for (let steps = 0; route.length && steps < 6000; steps += 1) {
      // The DOM simulation bridge changes waypoint at <9px, before reaching its
      // exact center. Exercise that same handoff so collision corners are real.
      if (distance(state.player, route[0]) < 9) route.shift();
      stepGame(state, 25, { ...idle, target: route[0] });
      assert.ok(isWalkable(state.player.x, state.player.y), `Route to ${target.id} crossed a collision`);
    }
    assert.equal(route.length, 0, `Click route stuck before ${target.id} at ${JSON.stringify(state.player)} toward ${JSON.stringify(route[0])}`);
    assert.ok(distance(state.player, target) < 9, `Click route did not arrive at ${target.id}`);
  }
});

test('world supplies are collected once and fast travel only reaches discovered camps', () => {
  const state = fresh(); const gold = state.gold; const potions = state.potions;
  open(state, 'town_cache'); choice(state, 'open');
  assert.equal(state.gold, gold + entity('town_cache').gold); assert.equal(state.potions, potions + 2);
  assert.deepEqual(state.opened, ['town_cache']);
  open(state, 'town_cache'); chooseDialogue(state, 'open'); close(state);
  assert.equal(state.gold, gold + entity('town_cache').gold); assert.equal(state.potions, potions + 2);
  open(state, 'town_camp'); const origin = { ...state.player };
  chooseDialogue(state, 'travel:ruins_camp'); assert.deepEqual(state.player, origin); close(state);
  open(state, 'grove_camp'); assert.ok(state.visited.includes('grove_camp'));
  choice(state, 'travel:town_camp'); assert.equal(state.mode, 'explore');
  assert.ok(distance(state.player, entity('town_camp')) < 100);
  open(state, 'town_camp'); choice(state, 'travel:grove_camp');
  assert.ok(distance(state.player, entity('grove_camp')) < 100);
  assert.ok(isWalkable(state.player.x, state.player.y));
});

test('a full campaign earns its party, experience, seals and ending through legal world actions', () => {
  let state = fresh(); const heroId = state.party[0].id; const startingHp = maxHp(state, heroId);
  recruit(state, 'sui');
  win(state, 'bamboo_echo'); camp(state, 'town_camp', true);
  recruit(state, 'shiori');
  win(state, 'reed_beast'); camp(state, 'grove_camp', true);
  recruit(state, 'pako');
  win(state, 'pass_guard'); camp(state, 'pass_camp', true);
  recruit(state, 'seki_boar_king');
  assert.equal(state.party.length, 5, 'All four recruitable companions can join the wider party');
  assert.equal(state.active.length, 4, 'Only four party members can be on the battlefield');
  assert.equal(state.active[0], heroId);
  const reserve = state.party.find(member => !state.active.includes(member.id));
  toggleMember(state, reserve.id); assert.equal(state.active.length, 4, 'Full active roster rejects a fifth fighter');
  const removed = state.active[3]; toggleMember(state, removed); toggleMember(state, reserve.id);
  assert.ok(state.active.includes(reserve.id)); assert.ok(!state.active.includes(removed));
  toggleMember(state, heroId); assert.ok(state.active.includes(heroId), 'The player remains in the party');
  toggleMember(state, reserve.id); toggleMember(state, removed);

  for (const [boss, rest] of [['grove_warden', 'grove_camp'], ['bell_keeper', 'pass_camp'], ['ruin_sentinel', 'ruins_camp']]) {
    camp(state, rest, true); const shards = state.shards; win(state, boss);
    assert.equal(state.shards, shards + 1, `${boss} awards exactly one seal`);
    const completed = [...state.completed]; const gold = state.gold; const xp = state.xp;
    state = loadGame(saveGame(state)); assert.ok(state); assert.equal(state.mode, 'explore');
    assert.deepEqual(state.completed, completed); assert.equal(state.gold, gold); assert.equal(state.xp, xp);
    open(state, boss); chooseDialogue(state, 'fight'); assert.notEqual(state.mode, 'battle'); close(state);
    assert.equal(state.gold, gold); assert.equal(state.shards, shards + 1, 'A defeated boss cannot be farmed by reopening its dialogue');
  }
  assert.equal(state.shards, 3); assert.ok(state.level > 1); assert.ok(state.weapon > 0);
  assert.ok(maxHp(state, heroId) > startingHp, 'Experience provides tangible party growth');
  camp(state, 'ruins_camp', true); beginBattle(state, 'rift_tyrant');
  assert.equal(resolveBattle(state)?.won, true);
  const finalGold = state.gold;
  state = loadGame(saveGame(state)); assert.ok(state); assert.equal(state.mode, 'explore');
  assert.equal(state.gold, finalGold, 'Reloading the final result retains earned rewards');
  open(state, 'home'); choice(state, 'return'); assert.equal(state.mode, 'ending');
  const restored = loadGame(saveGame(state));
  assert.ok(restored); assert.equal(restored.mode, 'ending');
  assert.ok(restored.completed.includes('rift_tyrant')); assert.equal(restored.shards, 3);
});

test('an underprepared party can lose, recover and retry without receiving victory rewards', () => {
  const state = fresh(); const gold = state.gold;
  beginBattle(state, 'grove_warden'); const result = resolveBattle(state);
  assert.equal(result?.won, false); assert.equal(state.shards, 0);
  assert.ok(!state.completed.includes('grove_warden')); assert.ok(state.gold <= gold);
  continueResult(state); assert.equal(state.mode, 'explore');
  assert.ok(state.party.every(member => member.hp > 0));
  camp(state, 'grove_camp'); beginBattle(state, 'grove_warden');
  assert.equal(state.battle.encounterId, 'grove_warden');
});

test('battle saves restore an operable world and never grant unfinished encounter rewards', () => {
  const state = fresh(); recruit(state, 'sui');
  beginBattle(state, 'bamboo_echo'); stepGame(state, 2400, idle);
  assert.equal(state.mode, 'battle');
  const restored = loadGame(saveGame(state));
  assert.ok(restored); assert.equal(restored.mode, 'explore');
  assert.equal(restored.battle, null); assert.equal(restored.dialogue, null);
  assert.equal(restored.result, null); assert.equal(restored.shards, 0);
  assert.deepEqual(restored.completed, []); assert.ok(isWalkable(restored.player.x, restored.player.y));
  beginBattle(restored, 'bamboo_echo'); assert.equal(resolveBattle(restored)?.won, true);
  const gold = restored.gold; const xp = restored.xp;
  const resultSave = loadGame(saveGame(restored)); assert.ok(resultSave);
  assert.equal(resultSave.gold, gold); assert.equal(resultSave.xp, xp);
  continueResult(resultSave); continueResult(resultSave);
  assert.equal(resultSave.gold, gold); assert.equal(resultSave.xp, xp);
});

test('pause freezes combat and manual movement and skill input control the protagonist while allies still fight', () => {
  const state = fresh(); recruit(state, 'sui'); beginBattle(state, 'bamboo_echo');
  state.paused = true; const frozen = JSON.stringify(state.battle);
  stepGame(state, 3000, { x: 1, y: 0, skill: true });
  assert.equal(JSON.stringify(state.battle), frozen);
  state.paused = false; state.manual = true;
  const hero = state.battle.units.find(unit => unit.side === 'ally' && unit.characterId === state.party[0].id);
  const x = hero.x; stepGame(state, 200, { x: -1, y: 0 }); assert.ok(hero.x < x);
  for (let elapsed = 0; state.mode === 'battle' && elapsed < 3000; elapsed += 50) {
    const foe = state.battle.units.filter(unit => unit.side === 'enemy' && unit.hp > 0).sort((a, b) => distance(a, hero) - distance(b, hero))[0];
    stepGame(state, 50, { ...idle, target: distance(hero, foe) > 50 ? { x: foe.x, y: foe.y } : null });
  }
  assert.equal(state.mode, 'battle'); assert.equal(hero.skillCooldown, 0, 'Manual mode holds the hero skill until input');
  stepGame(state, 50, { ...idle, skill: true });
  assert.ok(hero.skillCooldown > 0, 'Skill input spends the ready hero skill');
  assert.ok(state.battle.effects.some(effect => effect.kind === 'skill' && effect.text === CHARACTERS[hero.characterId].skill), 'Manual skill creates readable battle feedback');
  assert.ok(state.battle.units.some(unit => unit.side === 'ally' && unit.characterId !== hero.characterId && unit.damage > 0), 'Companions continue automatic combat in manual mode');
});

test('healing consumes inventory only when useful and camp resources cannot go negative', () => {
  const state = fresh(); const potions = state.potions;
  usePotion(state); assert.equal(state.potions, potions, 'Full-health party should retain supplies');
  beginBattle(state, 'grove_warden');
  const hero = state.battle.units.find(unit => unit.side === 'ally');
  for (let ms = 0; hero.hp === hero.maxHp && state.mode === 'battle' && ms < 15000; ms += 50) stepGame(state, 50, idle);
  assert.ok(hero.hp > 0 && hero.hp < hero.maxHp, 'An actual enemy hit injures the hero');
  const health = hero.hp; const stock = state.potions;
  usePotion(state); assert.ok(hero.hp > health); assert.equal(state.potions, stock - 1);
  for (let ms = 0; hero.hp === hero.maxHp && state.mode === 'battle' && ms < 15000; ms += 50) {
    stepGame(state, 50, idle);
  }
  assert.ok(hero.hp <= hero.maxHp, 'Healing cannot overfill health');
  resolveBattle(state); continueResult(state);
  camp(state, 'grove_camp', true);
  for (let i = 0; i < 30; i += 1) {
    open(state, 'grove_camp'); chooseDialogue(state, 'potion'); close(state);
  }
  assert.ok(state.gold >= 0); assert.ok(state.potions >= 0);
});

test('malformed and incompatible saves are rejected or normalized to valid gameplay invariants', () => {
  for (const raw of ['{', 'null', '[]', '{}', '{"version":999}', 'false']) assert.equal(loadGame(raw), null, raw);
  const state = fresh(); const baseline = JSON.parse(saveGame(state));
  const corruptions = [
    { ...baseline, player: { x: 1e12, y: -100 } },
    { ...baseline, gold: -1000, potions: -4, shards: 999, level: 0 },
    { ...baseline, party: [{ id: 'missing-character', hp: 100 }] },
    { ...baseline, active: ['missing-character', 'missing-character'] },
  ];
  for (const broken of corruptions) {
    const restored = loadGame(JSON.stringify(broken));
    if (!restored) continue;
    assert.ok(Number.isFinite(restored.player.x) && Number.isFinite(restored.player.y));
    assert.ok(isWalkable(restored.player.x, restored.player.y));
    assert.ok(restored.gold >= 0 && restored.potions >= 0 && restored.level >= 1);
    assert.ok(restored.shards >= 0 && restored.shards <= 3);
    assert.ok(restored.party.length > 0 && restored.party.every(member => CHARACTERS[member.id]));
    assert.ok(restored.active.length > 0 && restored.active.length <= 4);
    assert.equal(new Set(restored.active).size, restored.active.length);
    assert.ok(restored.active.every(id => restored.party.some(member => member.id === id)));
  }
});
