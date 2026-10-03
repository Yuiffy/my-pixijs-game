import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
const engine = await load('src/components/nightRain/engine.ts');
const weapons = await load('src/components/nightRain/weapons.ts');
const motion = await load('src/components/nightRain/playerMotion.ts');
const fresh = () => { const s = engine.createGame(); engine.startGame(s); return s; };
const step = (s, ms, input = {}) => engine.stepGame(s, ms, { x: 0, z: 0, ...input });
const difference = (a, b) => Math.max(...Object.keys(a).map(k => Math.abs(a[k] - b[k])));
const duel = () => { const s = fresh(); const foe = s.enemies[0]; Object.assign(s.player, { x: foe.x, y: foe.y, z: foe.z + 1.8, facing: Math.PI }); Object.assign(foe, { action: 'recover', timer: 4, aggro: true }); return { s, foe }; };

test('starting heavy has a real windup, weaker impact and an unskippable offensive recovery', () => {
  const { s, foe } = duel(); step(s, 690, { heavy: true }); assert.equal(foe.hp, foe.maxHp);
  step(s, 50); assert.equal(foe.maxHp - foe.hp, 36); assert.equal(s.player.stamina, 65);
  for (const input of [{ heavy: true }, { light: true }, { jump: true }, { parry: true }, { dodge: true }]) {
    const copy = engine.loadGame(engine.saveGame(s)); step(copy, 20, input); assert.equal(copy.player.attack, 'heavy'); assert.equal(copy.player.jumpVelocity, 0);
  }
  step(s, 280); step(s, 20, { heavy: true }); assert.equal(s.player.attack, 'heavy'); assert.ok(s.player.actionTime > 0.9);
  step(s, 490); assert.equal(s.player.action, 'idle');
});
test('late defense can cancel heavy, but jumping or chaining must wait for its complete recovery', () => {
  for (const input of [{ light: true }, { heavy: true }, { jump: true }, { dodge: true }, { parry: true }]) {
    const s = fresh(); step(s, 1220, { heavy: true }); step(s, 10, input);
    if (input.dodge || input.parry) assert.equal(s.player.attack, null);
    else { assert.equal(s.player.attack, 'heavy'); assert.equal(s.player.jumpHeight, 0); }
  }
});
test('partial charge preserves preparation and still needs at least 0.28 seconds to release', () => {
  for (const weapon of ['umbrella', 'ironUmbrella', 'graveSpear', 'reedDaggers', 'stoneMaul']) {
    const { s, foe } = duel(); s.weapon = weapon; const held = weapons.chargeTime(s) - 0.02;
    step(s, held * 1000, { heavy: true, heavyHeld: true }); const before = motion.samplePlayerMotion(s);
    assert.equal(foe.hp, foe.maxHp); step(s, 1); assert.equal(s.player.attack, 'heavy');
    assert.ok(difference(before, motion.samplePlayerMotion(s)) < 0.01, weapon);
    step(s, 260); assert.equal(foe.hp, foe.maxHp, weapon); step(s, 70); assert.ok(foe.hp < foe.maxHp, weapon);
  }
});
test('full charge connects continuously and holding the button only emits one strike', () => {
  for (const weapon of Object.keys(weapons.WEAPONS)) {
    const s = fresh(); s.weapon = weapon; const limit = weapons.chargeTime(s);
    s.player.action = 'charge'; s.player.charge = limit; const before = motion.samplePlayerMotion(s);
    s.player.action = 'heavy'; s.player.attack = 'charged'; s.player.actionTime = 0;
    assert.ok(difference(before, motion.samplePlayerMotion(s)) < 1e-8, weapon);
  }
  const s = fresh(); step(s, 2300, { heavy: true, heavyHeld: true }); assert.equal(s.player.stamina, 48); step(s, 400, { heavyHeld: true }); assert.equal(s.player.action, 'idle');
  step(s, 2500, { heavyHeld: true }); assert.equal(s.player.attack, null); assert.equal(s.player.action, 'idle');
});
test('every equipped clip contacts forward on its own combat clock and settles continuously', () => {
  const ids = ['light1', 'light2', 'light3', 'heavy', 'charged', 'sprintLight', 'sprintHeavy', 'airLight', 'airHeavy'];
  for (const weapon of Object.keys(weapons.WEAPONS)) for (const id of ids) {
    const s = fresh(); s.weapon = weapon; const spec = weapons.weaponAttack(s, id);
    const point = motion.weaponPoint(motion.samplePlayerAttack(s, id, spec.impact), motion.WEAPON_LENGTHS[weapon]);
    assert.ok(point[2] > 0.65 && point[1] > 0.15, `${weapon} ${id}: ${point}`);
    assert.ok(difference(motion.samplePlayerAttack(s, id, spec.duration), motion.PLAYER_NEUTRAL) < 1e-8);
    let previous = motion.samplePlayerAttack(s, id, 0);
    for (let t = 0.002; t <= spec.duration; t += 0.002) {
      const now = motion.samplePlayerAttack(s, id, t); assert.ok(Object.values(now).every(Number.isFinite));
      assert.ok(difference(previous, now) < 0.13, `${weapon} ${id} discontinuity ${t}`); previous = now;
      assert.ok(now.footLY >= 0.13 && now.footRY >= 0.13);
    }
  }
});
test('grounded heavy moves knees and waist, keeps feet planted, and uses both hands', () => {
  const s = fresh(); const spec = weapons.weaponAttack(s, 'heavy'); const wind = motion.samplePlayerAttack(s, 'heavy', spec.impact * 0.8); const hit = motion.samplePlayerAttack(s, 'heavy', spec.impact);
  assert.ok(wind.waistY < -0.08 && wind.handY > 1.5); assert.ok(hit.chestX > 0.2 && hit.waistY < -0.12); assert.equal(hit.support, 1);
  const [x, y, z] = motion.supportingHand(hit); assert.ok(Math.abs(Math.hypot(x - hit.handX, y - hit.handY, z - hit.handZ) - 0.16) < 1e-8);
});
test('walking and running keep ankle targets within leg reach throughout the complete stride', () => {
  for (const speed of [0.4, 1.5, 3.55, 5.4]) for (const direction of [[0, 1], [1, 0], [0.71, 0.71], [0, -1]]) {
    const s = fresh(); s.player.sprintTime = speed > 4 ? 1 : 0;
    for (let phase = 0; phase < Math.PI * 2; phase += 0.04) {
      const p = motion.samplePlayerMotion(s, speed, phase, ...direction);
      for (const [x, y, z, side] of [[p.footLX, p.footLY, p.footLZ, -1], [p.footRX, p.footRY, p.footRZ, 1]]) {
        const reach = Math.hypot(x - side * 0.16 - p.waistX, y - 0.8 - p.waistY, z - p.waistZ);
        assert.ok(reach < 0.7, `speed ${speed}, phase ${phase}, reach ${reach}`); assert.ok(y >= 0.13);
      }
    }
  }
});
test('authored hands stay within shoulder and elbow reach so weapons do not detach from the grip', () => {
  for (const weapon of Object.keys(weapons.WEAPONS)) for (const attack of ['light1', 'light2', 'light3', 'heavy', 'charged', 'sprintHeavy', 'airHeavy']) {
    const s = fresh(); s.weapon = weapon; const spec = weapons.weaponAttack(s, attack);
    for (let t = 0; t < spec.duration; t += 0.015) {
      const p = motion.samplePlayerAttack(s, attack, t); const right = [p.handX, p.handY, p.handZ]; const left = motion.supportingHand(p);
      for (const [side, hand] of [[-1, left], [1, right]]) {
        const shoulder = motion.rotateWeapon(side * 0.34, 0.25, 0, { ...p, weaponX: p.chestX, weaponY: p.chestY, weaponZ: p.chestZ });
        const reach = Math.hypot(hand[0] - shoulder[0] - p.waistX, hand[1] - shoulder[1] - 1 - p.waistY, hand[2] - shoulder[2] - p.waistZ);
        assert.ok(reach < 0.57, `${weapon} ${attack} ${t} ${side}: ${reach}`);
      }
    }
  }
});
test('the former fast heavy module belongs to the earned katana; slow and short weapons differ', () => {
  const s = fresh(); assert.equal(weapons.weaponMotion(s), 'grounded'); assert.equal(weapons.weaponUnlocked(s, 'katana'), false);
  const umbrella = weapons.weaponAttack(s, 'heavy'); s.weapon = 'katana'; assert.equal(weapons.weaponMotion(s), 'rainCut'); const katana = weapons.weaponAttack(s, 'heavy');
  assert.ok(katana.impact < umbrella.impact && katana.duration < umbrella.duration * 0.7);
  s.weapon = 'stoneMaul'; assert.ok(weapons.weaponAttack(s, 'heavy').duration > umbrella.duration);
  s.weapon = 'reedDaggers'; assert.ok(weapons.weaponAttack(s, 'light1').range < umbrella.range);
});
test('legacy player swings finish safely at neutral; current saves preserve hit-once and equipment', () => {
  const { s, foe } = duel(); s.gear.armor = 'reedCape'; s.collected.push('reed-cape'); step(s, 740, { heavy: true });
  const loaded = engine.loadGame(engine.saveGame(s)); assert.equal(loaded.player.hitDone, true); const hp = loaded.enemies[0].hp; step(loaded, 400); assert.equal(loaded.enemies[0].hp, hp);
  for (const version of [undefined, 1]) {
    const old = JSON.parse(engine.saveGame(s)); if (version === undefined) delete old.motionVersion; else old.motionVersion = version;
    const safe = engine.loadGame(JSON.stringify(old)); assert.equal(safe.motionVersion, 2); assert.equal(safe.player.action, 'idle'); assert.equal(safe.player.attack, null);
    assert.equal(safe.player.hp, s.player.hp); assert.equal(safe.player.stamina, s.player.stamina); assert.equal(safe.gear.armor, 'reedCape'); assert.equal(safe.enemies[0].hp, foe.hp);
  }
});
test('pause and hitstop freeze the simulation and therefore the authored pose', () => {
  const { s } = duel(); step(s, 740, { heavy: true }); assert.ok(s.hitstop > 0); const time = s.time; const pose = motion.samplePlayerMotion(s);
  step(s, 15); assert.equal(s.time, time); assert.deepEqual(motion.samplePlayerMotion(s), pose);
  engine.setPaused(s, true); step(s, 4000); assert.deepEqual(motion.samplePlayerMotion(s), pose);
});
test('swing audio follows the release, sounds once per attack and supports uninterrupted light combos silently', async () => {
  const { NightAudio } = await load('src/components/nightRain/audio.ts'); const sound = Object.create(NightAudio.prototype); const heard = [];
  Object.assign(sound, { quiet: false, lastAction: '', lastSwing: '', lastPosition: null, music() {}, sound(name) { heard.push(name); } });
  const s = fresh(); s.player.action = 'heavy'; s.player.attack = 'heavy'; s.player.comboUntil = 2; s.player.actionTime = 0.05;
  sound.observe(s); assert.deepEqual(heard, []); s.player.actionTime = 0.62; sound.observe(s); sound.observe(s); assert.deepEqual(heard, ['heavy']);
  for (const attack of ['light1', 'light2', 'light3']) { s.player.action = 'light'; s.player.attack = attack; s.player.actionTime = weapons.weaponAttack(s, attack).impact; sound.observe(s); sound.observe(s); }
  assert.deepEqual(heard, ['heavy', 'light', 'light', 'light']);
});
