import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";
const { createGame, startGame, skipTransition, stepGame, emptyInput, resetTraining, describeGame, fighterBoxes, aiInput, FLOOR } = await loadTypescriptModule("src/components/tidalDuel/engine.ts");
const { getFighter } = await loadTypescriptModule("src/components/tidalDuel/roster.ts");
const { pixelFrame } = await loadTypescriptModule("src/components/tidalDuel/renderer.ts");
const input = actions => ({ ...emptyInput(), ...actions });
function game(options = {}, gap = 109) {
  const g = createGame({ mode: "local", ...options }); startGame(g); skipTransition(g);
  g.fighters[0].x = 600 - gap / 2; g.fighters[1].x = 600 + gap / 2;
  return g;
}
function ticks(g, a = {}, b = {}, n = 1) {
  for (let i = 0; i < n; i++) stepGame(g, [input(a), input(b)]);
}
function sideTicks(g, side, a, n = 1, defense = {}) { ticks(g, side === 0 ? a : defense, side === 1 ? a : defense, n); }
function until(g, condition, a = {}, b = {}, max = 180) {
  for (let i = 0; !condition() && i < max; i++) ticks(g, a, b);
  assert.ok(condition(), "expected combat state is reached within the bounded window");
}
function motion(g, side, sequence, attack) {
  const facing = g.fighters[side].facing;
  for (const value of sequence) {
    const horizontal = value === 6 || value === 3 ? facing > 0 ? "right" : "left" : null;
    sideTicks(g, side, { ...(horizontal ? { [horizontal]: true } : {}), crouch: value === 2 || value === 3 }, 3);
  }
  sideTicks(g, side, { [attack]: true });
}
test("four skins select independently, safely fall back, and leave combat deterministic", () => {
  const a = game({ skin: "original", opponentSkin: "original" });
  const b = game({ skin: "resort", opponentSkin: "resort" });
  ticks(a, { skill: true }, { guard: true }, 70); ticks(b, { skill: true }, { guard: true }, 70);
  for (const g of [a, b]) { delete g.options.skin; delete g.options.opponentSkin; g.fighters.forEach(f => delete f.skin); }
  assert.deepEqual(a, b);
  const mirror = game({ character: "sui", opponent: "sui", skin: "resort", opponentSkin: "original" });
  assert.deepEqual(mirror.fighters.map(f => f.skin), ["resort", "original"]);
  assert.equal(createGame({ skin: "missing" }).fighters[0].skin, "original");
});
test("236P and 623K work relative to facing on both sides; expired and airborne inputs cannot grant specials", () => {
  for (const side of [0, 1]) {
    const qcf = game({}, 550); motion(qcf, side, [2, 3, 6], "punch");
    assert.equal(qcf.fighters[side].move, "signature");
    const dp = game({}, 550); dp.fighters[side].meter = 50; motion(dp, side, [6, 2, 3], "kick");
    assert.equal(dp.fighters[side].move, "reversal"); assert.equal(dp.fighters[side].meter, 25);
    const expired = game({}, 550); motion(expired, side, [2, 3, 6], "guard"); sideTicks(expired, side, {}, 65); sideTicks(expired, side, { punch: true });
    assert.equal(expired.fighters[side].move, "punch");
  }
  const air = game({}, 550); air.fighters[0].y = FLOOR - 100; air.fighters[0].vy = -80; air.fighters[0].state = "jump";
  motion(air, 0, [2, 3, 6], "punch"); assert.equal(air.fighters[0].move, "airPunch");
});
test("cat rekka confirms all three hits; a whiff cannot bypass its recovery", () => {
  const g = game(); ticks(g, { skill: true });
  until(g, () => g.fighters[0].contact === "hit"); ticks(g);
  ticks(g, { skill: true }); until(g, () => g.fighters[0].move === "signature2");
  until(g, () => g.fighters[0].contact === "hit"); ticks(g);
  ticks(g, { skill: true }); until(g, () => g.fighters[0].move === "signature3");
  until(g, () => g.fighters[1].state === "down");
  assert.equal(g.fighters[0].combo, 3); assert.ok(g.fighters[1].hp < 240);
  const whiff = game({}, 650); ticks(whiff, { skill: true }, {}, 33); ticks(whiff); ticks(whiff, { skill: true }, {}, 20);
  assert.notEqual(whiff.fighters[0].move, "signature2"); assert.equal(whiff.fighters[1].hp, 300);
});
test("normal-to-special cancel requires a confirmed hit; block and whiff retain recovery", () => {
  const hit = game(); ticks(hit, { punch: true }, {}, 12); ticks(hit); ticks(hit, { skill: true });
  until(hit, () => hit.fighters[0].move === "signature");
  const block = game(); ticks(block, { punch: true }, { guard: true }, 12); ticks(block, {}, { guard: true }); ticks(block, { skill: true }, { guard: true });
  assert.equal(block.fighters[0].move, "punch");
  const whiff = game({}, 600); ticks(whiff, { punch: true }, {}, 12); ticks(whiff); ticks(whiff, { skill: true });
  assert.equal(whiff.fighters[0].move, "punch");
});
test("drive cancel spends 50 only on hit and cannot cancel a super or blocked attack", () => {
  for (const defense of [{}, { guard: true }]) {
    const g = game(); g.fighters[0].meter = 50; ticks(g, { punch: true }, defense, 12); ticks(g, {}, defense);
    const before = g.fighters[0].meter; ticks(g, { sidestep: true }, defense);
    if (!defense.guard) until(g, () => g.events.some(e => e.type === "cancel"));
    assert.equal(g.fighters[0].meter, defense.guard ? before : before - 50);
    assert.equal(g.events.some(e => e.type === "cancel"), !defense.guard);
  }
  const noMeter = game(); ticks(noMeter, { punch: true }, {}, 12); ticks(noMeter); ticks(noMeter, { sidestep: true });
  assert.equal(noMeter.fighters[0].move, "punch");
  const superGame = game(); superGame.fighters[0].meter = 100; ticks(superGame, { special: true });
  until(superGame, () => superGame.fighters[0].contact === "hit"); superGame.fighters[0].meter = 100; ticks(superGame, { sidestep: true });
  assert.equal(superGame.fighters[0].move, "super");
});
test("both player slots can tech during the grab window; a late tech fails and does not queue a revenge throw", () => {
  for (const side of [0, 1]) {
    const g = game(); sideTicks(g, side, { throw: true });
    until(g, () => g.grabs.length === 1); ticks(g, {}, {}, 8);
    sideTicks(g, 1 - side, { throw: true });
    assert.equal(g.grabs.length, 0); assert.ok(g.fighters.every(f => f.hp === 300 && f.buffer.length === 0));
    assert.ok(g.events.some(e => e.type === "tech")); ticks(g, {}, {}, 25);
    assert.ok(g.fighters.every(f => f.move !== "throw"));
  }
  const late = game(); ticks(late, { throw: true }, {}, 35); ticks(late, {}, { throw: true }, 8);
  assert.ok(late.fighters[1].hp < 300); assert.equal(late.fighters[1].state, "down");
});
test("a projectile interrupts a pending throw and releases its victim without throw damage", () => {
  const g = game({ opponent: "shiori" }); ticks(g, { throw: true });
  until(g, () => g.grabs.length === 1);
  const attacker = g.fighters[0]; const victim = g.fighters[1];
  g.projectiles.push({ id: 99, side: 1, sourceSide: 1, sourceCharacter: 'shiori', reflections: 0, move: "signature", serial: 0, x: attacker.x + 3, y: FLOOR - 155, velocity: -100, radius: 35, ttl: 1 });
  ticks(g, {}, {}, 50);
  assert.equal(victim.hp, 300); assert.ok(attacker.hp < 300); assert.equal(g.grabs.length, 0); assert.notEqual(victim.state, "grabbed");
});
test("burst is a once-per-round stun escape, requires 50 energy and ignores neutral guard", () => {
  for (const state of ["hit", "critical", "launch", "guard"]) {
    const g = game(); const f = g.fighters[0]; f.state = state; f.stun = 0.6; f.meter = 100;
    if (state === "launch") { f.y -= 100; f.vy = -200; }
    ticks(g, { burst: true, guard: state === "guard" });
    assert.equal(f.meter, 50); assert.equal(f.burstReady, false); assert.equal(f.y, FLOOR); assert.ok(f.invincible > 0);
    ticks(g, {}, {}, 15); f.state = "hit"; f.stun = 0.6; ticks(g, { burst: true });
    assert.equal(f.meter, 50, "a second burst in the same round is denied");
  }
  const neutral = game(); neutral.fighters[0].meter = 100; ticks(neutral, { guard: true, burst: true });
  assert.equal(neutral.fighters[0].meter, 100); assert.equal(neutral.fighters[0].burstReady, true);
  const poor = game(); poor.fighters[0].state = "hit"; poor.fighters[0].stun = 0.6; poor.fighters[0].meter = 49; ticks(poor, { burst: true });
  assert.equal(poor.fighters[0].burstReady, true);
});
test("reversal costs 25, protects startup and hits a jumping approach; blocked recovery is punishable", () => {
  const g = game(); g.fighters[0].meter = 50; ticks(g, { rise: true }, { punch: true }, 20);
  assert.equal(g.fighters[0].hp, 300); assert.ok(g.fighters[1].hp < 300);
  const air = game(); air.fighters[0].meter = 25; air.fighters[1].y = FLOOR - 250; air.fighters[1].state = "jump"; air.fighters[1].vy = -100;
  ticks(air, { rise: true }, {}, 30); assert.ok(air.fighters[1].hp < 300);
  const block = game({ mode: "training", dummy: "guard" }); block.fighters[0].meter = 25; ticks(block, { rise: true }, {}, 25);
  assert.ok(block.training.lastContact.advantage <= -20); assert.equal(block.fighters[1].hp, 300);
  ticks(block, {}, {}, 10); block.options.mode = "local"; ticks(block, {}, { punch: true }, 35);
  assert.ok(block.fighters[0].hp < 300, "guarded reversal can be punished by a fast strike");
});
test("guard gauge breaks without health chip, then regenerates only after the delay and releasing guard", () => {
  const g = game(); g.fighters[1].guardGauge = 4; ticks(g, { kick: true }, { guard: true }, 25);
  assert.equal(g.fighters[1].hp, 300); assert.equal(g.fighters[1].state, "critical"); assert.ok(g.events.some(e => e.type === "guardBreak"));
  const gauge = g.fighters[1].guardGauge; ticks(g, {}, { guard: true }, 110); assert.equal(g.fighters[1].guardGauge, gauge);
  ticks(g, {}, {}, 150); assert.ok(g.fighters[1].guardGauge > gauge);
});
test("projectile has real travel, one-wave limit, jump/step/guard/hold counters and opposing cancellation", () => {
  for (const defense of [{}, { guard: true }, { crouch: true, guard: true }, { jump: true }, { sidestep: true }, { hold: true }]) {
    const g = game({ character: "shiori", opponent: "sui" }, 420); ticks(g, { skill: true }, {}, 35);
    assert.equal(g.projectiles.length, 1); const x = g.projectiles[0].x;
    ticks(g, {}, {}, 1); assert.ok(g.projectiles[0].x > x);
    // Position a live wave near the defender so all responses share the same timing.
    const target = g.fighters[1]; g.projectiles[0].x = target.x - 180;
    ticks(g, {}, defense, 55);
    if (defense.guard || defense.jump || defense.sidestep || defense.hold) assert.equal(target.hp, 300, JSON.stringify(defense));
    else assert.ok(target.hp < 300, JSON.stringify(defense));
  }
  const stack = game({ character: "shiori" }, 700); ticks(stack, { skill: true }); until(stack, () => stack.fighters[0].move === null); ticks(stack); ticks(stack, { skill: true }, {}, 10);
  assert.equal(stack.projectiles.length, 1); assert.equal(stack.fighters[0].move, null);
  const clash = game({ character: "shiori", opponent: "shiori" }, 600); ticks(clash, { skill: true }, { skill: true }, 100);
  assert.equal(clash.projectiles.length, 0); assert.ok(clash.fighters.every(f => f.hp === 300));
});
test("a late projectile cannot confirm an unrelated move, and projectile guard-break frame data uses current recovery", () => {
  const g = game({ character: "shiori", mode: "training", dummy: "idle" }, 550);
  ticks(g, { skill: true }); until(g, () => g.fighters[0].move === null);
  ticks(g, { punch: true }); g.projectiles[0].x = g.fighters[1].x - 20;
  ticks(g); assert.equal(g.fighters[0].contact, "none"); g.fighters[0].meter = 100; ticks(g, { sidestep: true });
  assert.equal(g.fighters[0].move, "punch"); assert.equal(g.fighters[0].meter, 100);
  const guard = game({ character: "shiori", mode: "training", dummy: "guard" }, 400); guard.fighters[1].guardGauge = 1;
  ticks(guard, { skill: true }, {}, 100);
  assert.equal(guard.training.lastContact.result, "破防"); assert.ok(guard.training.lastContact.advantage > 0);
});
test("projectile juggles respect the existing limit and round end clears outstanding hits and grabs", () => {
  const g = game({ character: "shiori" }); const t = g.fighters[1]; t.state = "launch"; t.y -= 110; t.vy = 100; t.juggle = 2;
  g.projectiles.push({ id: 1, side: 0, sourceSide: 0, sourceCharacter: 'shiori', reflections: 0, move: "signature", serial: 0, x: t.x, y: t.y - 90, velocity: 100, radius: 35, ttl: 1 });
  ticks(g); assert.equal(t.juggle, 3); ticks(g, {}, {}, 120); assert.notEqual(t.state, "launch");
  const ko = game({ character: "shiori" }); ko.fighters[1].hp = 1;
  ticks(ko, { skill: true }, {}, 65); assert.equal(ko.phase, "roundEnd"); assert.equal(ko.projectiles.length, 0); assert.equal(ko.grabs.length, 0);
});
test("training reset restores burst and skins, preserves boxes, and reports real attack box windows and pixel phases", () => {
  const g = game({ mode: "training", skin: "resort" }); g.training.showBoxes = true; g.fighters[0].burstReady = false;
  resetTraining(g); assert.equal(g.fighters[0].skin, "resort"); assert.equal(g.training.showBoxes, true); assert.equal(g.fighters[0].burstReady, true);
  const f = g.fighters[0]; ticks(g, { kick: true }); assert.equal(fighterBoxes(f).attack, null); assert.equal(pixelFrame(f).index, 4);
  until(g, () => fighterBoxes(f).attack !== null); assert.equal(pixelFrame(f).index, 5); assert.equal(pixelFrame(f).sheet, "combat");
  until(g, () => f.moveTime > getFighter(f.character).moves.kick.startup + getFighter(f.character).moves.kick.active);
  assert.equal(fighterBoxes(f).attack, null); assert.equal(pixelFrame(f).index, 6);
  assert.ok(describeGame(g).fighters[0].boxes.hurt.length);
});
test("CPU uses its character's signature and reproduces resource choices at each difficulty", () => {
  for (const character of ["sui", "shiori"]) for (const difficulty of ["easy", "normal", "hard"]) {
    const run = () => {
      const g = game({ character, opponent: character === "sui" ? "shiori" : "sui", difficulty }, character === "sui" ? 260 : 420);
      const used = [];
      for (let i = 0; i < 400; i++) { const a = aiInput(g, 0); if (a.skill) used.push(i); stepGame(g, [a, emptyInput()]); }
      return { g, used };
    };
    const a = run(); assert.ok(a.used.length > 0); assert.deepEqual(a, run());
  }
});
