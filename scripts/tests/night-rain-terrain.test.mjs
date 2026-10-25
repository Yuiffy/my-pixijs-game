import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');
const world = await loadTypescriptModule('src/components/nightRain/world.ts');
const terrain = await loadTypescriptModule('src/components/nightRain/terrain.ts');
const quiet = s => { for (const enemy of s.enemies) { enemy.hp = 0; enemy.action = 'dead'; } };

// Isolate navigation from combat. Every route below still advances the actual
// engine with ordinary directional input, including gravity and body collision.
const fresh = () => {
  const s = engine.createGame(); engine.startGame(s);
  quiet(s);
  return s;
};
const place = (s, x, y, z) => Object.assign(s.player, { x, y, z, lastGround: { x, y, z }, fallPeak: y, jumpHeight: 0, jumpVelocity: 0 });
const walk = (s, target) => {
  for (let frame = 0; frame < 1500; frame++) {
    const dx = target.x - s.player.x; const dz = target.z - s.player.z; const d = Math.hypot(dx, dz);
    if (d < .12) {
      assert.ok(Math.abs(s.player.y - target.y) < .12, `wrong floor at ${JSON.stringify(target)}: ${s.player.y}`);
      return;
    }
    engine.stepGame(s, 20, { x: dx / d, z: dz / d });
    assert.equal(s.mode, 'playing', `route died toward ${JSON.stringify(target)}`);
    assert.equal(s.player.jumpHeight, 0, `unexpected fall toward ${JSON.stringify(target)}`);
  }
  assert.fail(`blocked toward ${JSON.stringify(target)} at ${JSON.stringify(s.player)}`);
};

test('ordinary inputs descend into the sunken court, pass beneath the old route, collect loot, ascend and return', () => {
  const s = fresh();
  for (const p of [
    { x: 10, y: 6, z: 15 }, { x: 10, y: 0, z: 0 },
    { x: 8.4, y: 0, z: 0 }, { x: 8.4, y: -3, z: -16 },
    { x: -1.6, y: -3, z: -23.5 },
  ]) walk(s, p);
  engine.interact(s); assert.ok(s.collected.includes('sunken-cache'));
  assert.ok(world.supportAt(s.player.x, s.player.z, Infinity) > s.player.y + 5);
  // Restore the untouched encounter records before validating a real save;
  // test-only dead bosses intentionally have no matching progression flags.
  s.enemies = engine.createGame().enemies;
  const restored = engine.loadGame(engine.saveGame(s));
  assert.ok(restored); assert.deepEqual(restored.player, s.player);
  quiet(restored);
  for (const p of [
    { x: 7, y: -3, z: -24 }, { x: 7, y: 0, z: -38 },
    { x: 12, y: 0, z: -38 }, { x: 11.3, y: 0, z: -10 },
  ]) walk(restored, p);
  restored.shortcut = true;
  walk(restored, { x: 11.3, y: 0, z: -5 });
  walk(restored, { x: 7, y: 0, z: -1 });
  assert.equal(restored.player.hp, s.player.hp);
});

test('earth foundations stop bodies and projectiles while preserving real underpasses and overhead clearance', () => {
  const s = fresh();
  const courtyard = world.SURFACES.find(surface => surface.id === 'courtyard');
  assert.ok(world.deckBottom(courtyard, 0, 0) <= -10);
  assert.equal(world.deckBlocks(0, 0, -3), true);
  assert.equal(world.projectileBlocked({ x: 0, y: -2, z: 0 }, s), true);
  assert.equal(world.projectileBlocked({ x: 7, y: -1.5, z: -20 }, s), false);
  assert.equal(world.deckBlocks(7, -20, -3), false);
  assert.equal(world.ceilingAt(2.5, -26, -1, 5), world.deckBottom(world.SURFACES.find(surface => surface.id === 'market-stairs'), 2.5, -26));
  place(s, 7, -3, -16);
  engine.stepGame(s, 2500, { x: 1, z: 0 });
  assert.ok(s.player.x < 9, 'court side parapet prevents walking through the bank');
  assert.equal(s.player.y, -3); assert.equal(s.mode, 'playing');
  for (const [x, z] of [[1.5, -16], [6, -23]]) {
    assert.equal(world.playerBlocked(x, z, -3, s), true);
    assert.equal(world.projectileBlocked({ x, y: -1.6, z }, s), true);
    assert.equal(world.playerBlocked(x + 1.3, z, -3, s), false);
  }
});

test('offset natural banks have walkable slopes and solid earth, and connect back to the courtyard', () => {
  const s = fresh(); place(s, -3, 0, 9);
  walk(s, { x: -3, y: -5 / 6, z: 12 });
  assert.equal(world.projectileBlocked({ x: -3, y: -2, z: 12 }, s), true);
  walk(s, { x: -3, y: 0, z: 9 });
  walk(s, { x: 1, y: 0, z: 9 });
  walk(s, { x: 1, y: -.6, z: 11.5 });
  walk(s, { x: 1, y: 0, z: 9 });
  assert.equal(s.player.hp, 100);
});

test('ramps sharing a low landing preserve the original passages underneath their high ends', () => {
  const s = fresh(); place(s, 7, 0, 8);
  walk(s, { x: 11, y: 0, z: 8 });
  walk(s, { x: 7, y: 0, z: 8 });
  place(s, -56, 16, -821);
  walk(s, { x: -49, y: 16, z: -821 });
  walk(s, { x: -56, y: 16, z: -821 });
  assert.equal(s.player.hp, 100);
});

test('old stairs, rooftop main route, cloister shortcut and underground corridors retain ordinary input passage', () => {
  const s = fresh(); place(s, -13, 0, 1);
  for (const p of [
    [-15.5, 0, -5], [-15.5, 6, -22.5], [-11, 6, -22],
    [-6, 6, -22], [2.5, 6, -22.5], [2.5, .25, -36.5],
    [4, .25, -36.5], [12, 0, -36.5],
  ]) walk(s, { x: p[0], y: p[1], z: p[2] });
  place(s, -6, .3, -5.5);
  walk(s, { x: -6, y: 3, z: -12 });
  walk(s, { x: -6, y: 3, z: -14.3 });
  walk(s, { x: -6, y: .3, z: -5.5 });
  place(s, -37, -24, -20);
  walk(s, { x: -36.5, y: -24, z: -3 });
  walk(s, { x: -32, y: -24, z: 5 });
  place(s, -147, -36, -310);
  walk(s, { x: -147, y: -36, z: -300 });
  walk(s, { x: -137, y: -36, z: -296 });
  assert.equal(s.mode, 'playing');
});

test('foundations leave headroom above every existing lower surface that overlaps an upper street', () => {
  let checked = 0;
  for (const upper of world.SURFACES.filter(s => !terrain.isSpanningDeck(s) && Math.min(s.y, s.endY ?? s.y) >= -10)) {
    for (const lower of world.SURFACES) {
      if (Math.max(lower.y, lower.endY ?? lower.y) >= Math.min(upper.y, upper.endY ?? upper.y) - 3) continue;
      const x1 = Math.max(upper.x1, lower.x1); const x2 = Math.min(upper.x2, lower.x2);
      const z1 = Math.max(upper.z1, lower.z1); const z2 = Math.min(upper.z2, lower.z2);
      if (x1 >= x2 || z1 >= z2) continue;
      const x = (x1 + x2) / 2; const z = (z1 + z2) / 2;
      assert.ok(world.deckBottom(upper, x, z) - terrain.surfaceHeight(lower, z) >= 1.65, `${lower.id} underneath ${upper.id}`);
      checked++;
    }
  }
  assert.ok(checked > 10, `checked ${checked} overlapping routes`);
});
