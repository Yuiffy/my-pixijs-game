import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
import { playFirstLevel, walkTo } from './helpers/night-rain-pilot.mjs';
const e = await load('src/components/nightRain/engine.ts');
const w = await load('src/components/nightRain/world.ts');
const c = await load('src/components/nightRain/companion.ts');
const d = await load('src/components/nightRain/dungeons.ts');
const gear = await load('src/components/nightRain/equipment.ts');
const weapons = await load('src/components/nightRain/weapons.ts');
const encounters = await load('src/components/nightRain/encounters.ts');
const slots = await load('src/components/nightRain/saveSlots.ts');
const travel = await load('src/components/nightRain/dungeonTravel.ts');
const fresh = () => { const s = e.createGame(); e.startGame(s); return s; };
const place = (s, p) => { Object.assign(s.player, p, { lastGround: { ...p }, fallPeak: p.y }); e.stepGame(s, 1); };
function route(s, target) { const path = c.findPath(s.player, target, s); assert.ok(path.length, JSON.stringify(target)); for (const p of path.slice(1)) walkTo(e, s, p, 120000); }

test('each dungeon post, lamp, branch and portal has legal support; portal routes are connected locally', () => {
  const s = fresh();
  for (const x of [...d.DUNGEON_ENEMIES, ...Object.values(d.DUNGEON_REST_POINTS), ...Object.values(d.DUNGEON_PORTALS).map(p => p.destination)]) assert.ok(w.canOccupy(x.x, x.z, x.y, s), JSON.stringify(x));
  for (const l of d.DUNGEON_LANDMARKS.filter(l => l.y < -10)) {
    const entry = d.DUNGEON_PORTALS[`${d.undergroundId(l)}-entrance`].destination;
    assert.ok(c.findPath(entry, w.interactionPoint(l), s).length, l.id);
  }
});

test('ordinary inputs complete the crypt loop, defeat its giant and retain unique equipment after rest/reload', () => {
  const s = fresh(); place(s, d.DUNGEON_PORTALS['crypt-entrance'].destination);
  for (const id of ['crypt-lamp', 'crypt-note', 'ossuary-mail', 'grave-spear', 'grave-seal']) {
    const l = w.LANDMARKS.find(l => l.id === id); route(s, w.interactionPoint(l)); e.interact(s);
    assert.ok(id === 'crypt-lamp' ? s.litLamps.includes(id) : s.collected.includes(id), id);
  }
  assert.ok(s.defeatedGuests.includes('crypt-colossus')); assert.ok(s.bestiary.includes('boss:colossus'));
  route(s, d.DUNGEON_REST_POINTS['crypt-lamp']); e.interact(s);
  assert.ok(e.equipWeapon(s, 'graveSpear')); assert.ok(gear.equipArmor(s, 'ossuaryMail')); assert.ok(gear.equipTalisman(s, 'graveSeal'));
  assert.equal(e.maxHp(s), 120); assert.ok(weapons.weaponAttack(s, 'light1').range > 3);
  const loaded = e.loadGame(e.saveGame(s)); assert.ok(loaded); assert.deepEqual(loaded.gear, s.gear); assert.equal(loaded.weapon, 'graveSpear'); assert.equal(loaded.enemies.find(x => x.id === 'crypt-colossus').hp, 0);
});

test('ordinary inputs finish the cavern and its optional crystal branch with no main-quest dependency', () => {
  const s = fresh(); place(s, d.DUNGEON_PORTALS['cave-entrance'].destination);
  for (const id of ['cave-lamp', 'cave-note', 'reed-cape', 'cave-daggers', 'stone-maul', 'tide-knot']) {
    if (id === 'stone-maul') { route(s, d.dungeonPoint('cave', { x: 91, y: 0, z: 125 })); route(s, d.dungeonPoint('cave', { x: 100, y: 0, z: 133 })); }
    const l = w.LANDMARKS.find(l => l.id === id); route(s, w.interactionPoint(l)); e.interact(s);
    assert.ok(id === 'cave-lamp' ? s.litLamps.includes(id) : s.collected.includes(id), id);
  }
  assert.ok(s.defeatedGuests.includes('cave-sentinel')); assert.equal(s.deaths, 0); assert.ok(e.loadGame(e.saveGame(s)));
  assert.ok(s.bestiary.includes('giant:guard')); assert.ok(s.bestiary.includes('boss:sentinel'));
  assert.ok(gear.equipTalisman(s, 'tideKnot')); assert.equal(e.maxStamina(s), 118);
});

test('ranged sentries release travelling shots, lose tracking before release and cover blocks their projectiles', () => {
  const s = fresh(); const bow = s.enemies.find(x => x.id === 'canal-guard'); place(s, { x: 12, y: 0, z: -29 });
  for (let i = 0; i < 85 && !s.projectiles.length; i++) e.stepGame(s, 40, { x: 0, z: 0 });
  assert.ok(s.projectiles.length); const bolt = { ...s.projectiles[0] }; const hp = s.player.hp;
  e.stepGame(s, 80, { x: 0, z: 0 }); assert.notEqual(s.projectiles[0]?.z, bolt.z); assert.equal(s.player.hp, hp);
  for (let i = 0; i < 30 && s.player.hp === hp; i++) e.stepGame(s, 40, { x: 0, z: 0 }); assert.ok(s.player.hp < hp);
  const wall = fresh(); wall.projectiles.push({ id: 1, owner: bow.id, x: 12, y: 1, z: -8.6, vx: 0, vy: 0, vz: 10, life: 2, damage: 22, kind: 'bolt' }); place(wall, { x: 12, y: 0, z: -6.5 });
  e.stepGame(wall, 300, { x: 0, z: 0 }); assert.equal(wall.projectiles.length, 0); assert.equal(wall.player.hp, 100);
});

test('all bosses resist heavy hit interruption and charge auto-releases once while held', () => {
  for (const kind of ['boss', 'nana', 'azi', 'colossus', 'sentinel']) {
    const s = fresh(); const enemy = s.enemies.find(x => x.kind === kind); s.enemies = [enemy];
    place(s, { x: enemy.x, y: enemy.y, z: enemy.z + 2, facing: Math.PI }); Object.assign(enemy, { action: 'windup', timer: 2.1, aggro: true, attackIndex: 1, facing: 0 });
    e.stepGame(s, 500, { x: 0, z: 0, heavy: true }); assert.equal(enemy.action, 'windup'); assert.ok(enemy.posture < 20); assert.ok(enemy.hp < enemy.maxHp);
  }
  const s = fresh(); e.stepGame(s, 800, { x: 0, z: 0, heavy: true, heavyHeld: true }); assert.equal(s.player.attack, 'charged');
  e.stepGame(s, 1000, { x: 0, z: 0, heavyHeld: true }); assert.equal(s.player.action, 'idle');
});

test('continuous charged pressure takes hits from a live boss; a timing-based mixed pilot still wins', () => {
  const spam = fresh(); const boss = spam.enemies.find(x => x.kind === 'boss'); place(spam, { x: 4, y: 0, z: -39, facing: Math.PI });
  for (let i = 0; i < 800 && spam.mode === 'playing' && boss.hp > 0; i++) e.stepGame(spam, 40, { x: 0, z: 0, heavy: spam.player.action === 'idle', heavyHeld: true, aim: Math.PI });
  assert.ok(spam.player.hp < 100, 'holding heavy cannot keep the boss harmless'); assert.ok(spam.parries === 0);
  const { state: mixed } = playFirstLevel(e); const foe = mixed.enemies.find(x => x.kind === 'boss');
  assert.equal(foe.hp, 0); assert.ok(mixed.parries > 0); assert.equal(mixed.deaths, 0);
});

test('save slots isolate players and migrate a legacy save only once', () => {
  const memory = new Map([['night-rain-v1', 'old-player']]); const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  slots.migrateLegacy(storage); assert.equal(storage.getItem(slots.slotKey(1)), 'old-player'); storage.setItem(slots.slotKey(2), 'second-player'); storage.setItem(slots.slotKey(1), 'new-progress'); slots.migrateLegacy(storage);
  assert.equal(storage.getItem(slots.slotKey(1)), 'new-progress'); assert.equal(storage.getItem(slots.slotKey(2)), 'second-player');
  storage.setItem('night-rain-v1-active-slot', '2'); assert.equal(slots.selectedSlot(storage), 2);
});

test('runtime narration has no OS speech calls and every shipped local voice file exists', async () => {
  const sources = await Promise.all(['NightRain.tsx', 'audio.ts'].map(f => fs.readFile(`src/components/nightRain/${f}`, 'utf8')));
  assert.ok(sources.every(s => !/speechSynthesis|SpeechSynthesisUtterance/.test(s)));
  const manifest = JSON.parse(await fs.readFile('src/components/nightRain/voiceManifest.json', 'utf8'));
  for (const id of new Set(Object.values(manifest))) assert.ok((await fs.stat(`public/games/night-rain/audio/voice/${id}.mp3`)).size > 1000);
});

test('optional entrances connect to their local streets and discover a separate map layer', () => {
  const s = fresh();
  for (const [id, from] of [['crypt', { x: -29, y: 6, z: -24 }], ['cave', { x: -137, y: 2, z: -323 }]]) {
    const upper = d.DUNGEONS[id].upper;
    assert.ok(c.findPath(from, upper, s).length, id);
    place(s, upper); assert.ok(s.discoveredDungeons.includes(id));
    const bottom = { ...upper, y: d.DUNGEONS[id].floor };
    assert.equal(c.findPath(upper, bottom, s).length, 0);
    assert.equal(w.supportAt(bottom.x, bottom.z, bottom.y + .6), bottom.y);
  }
});

test('lift travel moves continuously on one shaft, freezes combat, pauses, reloads midride and returns', () => {
  const s = fresh(); const upper = d.DUNGEONS.crypt.upper;
  place(s, upper); s.player.hp = 71; s.player.flasks = 1; e.interact(s);
  assert.equal(s.liftRide.direction, 'down');
  e.stepGame(s, 2000, { x: 1, z: 1, heavy: true, jump: true, heal: true });
  assert.equal(s.player.x, upper.x); assert.equal(s.player.z, upper.z);
  assert.ok(s.player.y < upper.y && s.player.y > -24); assert.equal(s.player.hp, 71); assert.equal(s.player.flasks, 1);
  const mid = s.player.y; const timer = s.liftRide.elapsed;
  e.setPaused(s, true); e.stepGame(s, 1000); assert.equal(s.player.y, mid); assert.equal(s.liftRide.elapsed, timer);
  const paused = e.loadGame(e.saveGame(s)); assert.ok(paused); e.setPaused(paused, false);
  const saved = e.loadGame(e.saveGame(paused)); assert.ok(saved); assert.equal(saved.player.y, mid);
  const enemies = structuredClone(saved.enemies); e.stepGame(saved, 4999);
  assert.ok(saved.player.y < mid); assert.deepEqual(saved.enemies, enemies);
  e.stepGame(saved, 1); assert.equal(saved.liftRide, null); assert.equal(saved.player.y, -24);
  e.interact(saved); assert.equal(saved.liftRide.direction, 'up');
  e.stepGame(saved, 3500); assert.ok(saved.player.y > -24 && saved.player.y < upper.y);
  e.stepGame(saved, 3500); assert.equal(saved.liftRide, null); assert.equal(saved.player.y, upper.y);
  assert.equal(saved.player.hp, 71); assert.equal(saved.player.flasks, 1); assert.ok(e.loadGame(e.saveGame(saved)));
  const invalid = JSON.parse(e.saveGame(paused)); invalid.player.y += 1; assert.equal(e.loadGame(JSON.stringify(invalid)), null);
  invalid.player.y -= 1; invalid.liftRide.elapsed = 99; assert.equal(e.loadGame(JSON.stringify(invalid)), null);
  assert.deepEqual(travel.liftPosition({ dungeon: 'cave', direction: 'down', elapsed: 8 }), { ...d.DUNGEONS.cave.upper, y: -36 });
});

test('v9 underground saves migrate once, retaining health, equipment, enemy state and bloodstain', () => {
  const current = fresh(); const lower = d.DUNGEON_PORTALS['crypt-entrance'].destination;
  place(current, lower); current.player.hp = 43; current.player.flasks = 1;
  current.litLamps.push('crypt-lamp'); current.checkpoint = 'crypt-lamp'; current.collected.push('ossuary-mail'); current.gear.armor = 'ossuaryMail';
  current.bloodstain = { ...lower, rice: 58 }; current.enemies.find(x => x.id === 'crypt-blade').hp = 30;
  const raw = JSON.parse(e.saveGame(current)); raw.worldVersion = 9; delete raw.liftRide; delete raw.discoveredDungeons;
  const back = p => { if (!p || p.y >= -10) return; const id = d.undergroundId(p); const offset = d.DUNGEONS[id].offset; p.x -= offset.x; p.y -= offset.y; p.z -= offset.z; };
  back(raw.player); back(raw.player.lastGround); raw.player.fallPeak = 0; back(raw.bloodstain);
  for (const enemy of raw.enemies) { back(enemy); back(enemy.spawn); }
  for (const fx of raw.effects) back(fx);
  const migrated = e.loadGame(JSON.stringify(raw)); assert.ok(migrated);
  assert.equal(migrated.worldVersion, 10); assert.deepEqual(migrated.player, current.player);
  assert.deepEqual(migrated.enemies, current.enemies); assert.deepEqual(migrated.bloodstain, current.bloodstain);
  assert.deepEqual(migrated.gear, current.gear); assert.ok(migrated.discoveredDungeons.includes('crypt'));
  assert.deepEqual(e.loadGame(e.saveGame(migrated)), migrated);
});

test('underground checkpoints respawn locally and lamp travel retains supplies across map layers', () => {
  const s = fresh(); place(s, d.DUNGEON_REST_POINTS['crypt-lamp']); e.interact(s);
  assert.equal(s.checkpoint, 'crypt-lamp');
  const blade = s.enemies.find(x => x.id === 'crypt-blade');
  place(s, { x: blade.x, y: blade.y, z: blade.z + 1.8 }); s.player.hp = 1;
  for (let i = 0; i < 120 && s.mode === 'playing'; i++) e.stepGame(s, 40);
  assert.equal(s.mode, 'dead'); assert.ok(e.loadGame(e.saveGame(s)));
  e.respawn(s); assert.equal(s.player.y, -24); assert.equal(s.liftRide, null);
  assert.ok(e.loadGame(e.saveGame(s))); assert.ok(s.discoveredDungeons.includes('crypt'));
  s.litLamps.push('courtyard'); s.player.hp = 61; s.player.flasks = 1;
  assert.ok(e.travelToLamp(s, 'courtyard')); assert.equal(s.player.y, 0);
  assert.ok(e.travelToLamp(s, 'crypt-lamp')); assert.equal(s.player.y, -24);
  assert.equal(s.player.hp, 61); assert.equal(s.player.flasks, 1); assert.ok(e.loadGame(e.saveGame(s)));
});
