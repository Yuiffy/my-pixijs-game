import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { createGame, startGame, skipTransition, stepGame, emptyInput, resetTraining, describeGame, FLOOR } = await loadTypescriptModule("src/components/tidalDuel/engine.ts");
const { getFighter } = await loadTypescriptModule("src/components/tidalDuel/roster.ts");
const { pixelFrame } = await loadTypescriptModule("src/components/tidalDuel/renderer.ts");
const input = value => ({ ...emptyInput(), ...value });
function game(side = 0, gap = 109, options = {}) {
  const g = createGame({ mode: "local", character: side ? "sui" : "mizuki", opponent: side ? "mizuki" : "shiori", ...options }, 1004);
  startGame(g); skipTransition(g);
  g.fighters[0].x = 565; g.fighters[1].x = 565 + gap;
  return g;
}
function drive(g, side, action = {}, count = 1, defender = {}) {
  for (let i = 0; i < count; i++) stepGame(g, side ? [input(defender), input(action)] : [input(action), input(defender)]);
}
function until(g, side, condition, action = {}, defender = {}, count = 240) {
  for (let i = 0; !condition() && i < count; i++) drive(g, side, action, 1, defender);
  assert.ok(condition(), "bounded gameplay transition");
}

test("Mizuki retains her only requested costume in either slot, mirrors and training resets", () => {
  for (const side of [0, 1]) {
    const g = game(side, 109, { mode: "training", skin: "resort", opponentSkin: "resort" });
    assert.equal(g.fighters[side].skin, "original");
    assert.equal(side ? g.options.opponentSkin : g.options.skin, "original");
    resetTraining(g);
    assert.equal(g.fighters[side].character, "mizuki");
    assert.equal(g.fighters[side].skin, "original");
    assert.ok(describeGame(g).roster.some(f => f.id === "mizuki" && f.name === "弥月"));
  }
  const mirror = game(0, 109, { character: "mizuki", opponent: "mizuki", skin: "missing", opponentSkin: "resort" });
  assert.ok(mirror.fighters.every(f => f.character === "mizuki" && f.skin === "original"));
  const mizuki = getFighter("mizuki");
  assert.equal(mizuki.skins[0].name, "黑丝 · 原皮");
  assert.ok(Object.values(mizuki.moves).every(m => !/猫步|潮波/.test(m.name)));
});

test("Mizuki's advancing lunar kick hits or blocks once and leaves punishable recovery on both sides", () => {
  for (const side of [0, 1]) for (const block of [false, true]) {
    const g = game(side, 250), f = g.fighters[side], target = g.fighters[1 - side], x = f.x;
    const defense = block ? { guard: true } : {};
    drive(g, side, { ability: true }, 1, defense);
    assert.equal(f.move, "signature");
    until(g, side, () => f.contact !== "none", { ability: true }, defense);
    assert.equal(f.contact, block ? "block" : "hit");
    assert.ok((f.x - x) * f.facing > 25, "the actual attacker advances before contact");
    assert.equal(target.hp < 300, !block);
    assert.equal(g.projectiles.length, 0);
    if (block) assert.ok(target.guardGauge < 100);
    until(g, side, () => f.move === null, { ability: true }, defense);
    assert.equal(f.moveSerial, 1, "holding the button cannot replay a hit");
    assert.ok(getFighter("mizuki").moves.signature.recovery > getFighter("mizuki").moves.signature.blockStun);
  }
});

test("Mizuki ground attacks and 25-meter anti-air use her distinct combat rows in both slots", () => {
  for (const side of [0, 1]) for (const [action, move, row] of [
    [{ light: true }, "punch", 0], [{ medium: true }, "kick", 4],
    [{ crouch: true, medium: true }, "lowKick", 8], [{ ability: true }, "signature", 12],
    [{ crouch: true, ability: true }, "reversal", 16],
  ]) {
    const g = game(side, 550), f = g.fighters[side]; f.meter = 100;
    drive(g, side, action);
    until(g, side, () => f.move === move, action);
    assert.deepEqual(pixelFrame(f), { sheet: "combat", index: row });
    assert.equal(f.meter, move === "reversal" ? 75 : 100);
    drive(g, side, action, 100);
    assert.equal(f.moveSerial, 1);
    assert.equal(g.fighters[1 - side].hp, 300, "wide-spaced whiffs do not damage the opponent");
  }
});

test("Mizuki's physical roundhouse tracks sidesteps while her straight punch can be evaded", () => {
  for (const side of [0, 1]) for (const ability of [false, true]) {
    const g = game(side, 160), target = g.fighters[1 - side];
    drive(g, side, {}, 10, { sidestep: true });
    drive(g, side, ability ? { ability: true } : { light: true }, 40);
    assert.equal(target.hp < 300, ability);
    if (ability) assert.equal(g.fighters[side].contact, "hit");
  }
});

test("Mizuki's two-kick signature requires contact and a fresh second press; its finisher knocks down", () => {
  for (const side of [0, 1]) for (const block of [false, true]) {
    const g = game(side, 250), f = g.fighters[side], target = g.fighters[1 - side], defense = block ? { guard: true } : {};
    drive(g, side, { ability: true });
    until(g, side, () => f.contact !== "none", {}, defense);
    const hp = target.hp;
    drive(g, side, { ability: true }, 1, defense);
    until(g, side, () => f.move === "signature2", {}, defense);
    assert.equal(getFighter("mizuki").moves[f.move].name, "回月追踢");
    until(g, side, () => f.contact !== "none", {}, defense);
    assert.equal(f.contact, block ? "block" : "hit");
    if (!block) { assert.ok(target.hp < hp); assert.equal(target.state, "down"); }
    drive(g, side, {}, 90, defense); assert.equal(f.moveSerial, 2);
  }
  const whiff = game(0, 550), f = whiff.fighters[0];
  drive(whiff, 0, { ability: true }); drive(whiff, 0, {}, 34); drive(whiff, 0, { ability: true }); drive(whiff, 0, {}, 90);
  assert.equal(f.moveSerial, 1); assert.equal(whiff.fighters[1].hp, 300);
});

test("Mizuki's three assisted routes confirm into real combo hits for both slots", () => {
  for (const side of [0, 1]) for (const [strength, expected] of [
    ["light", ["punch", "punch2", "punch3"]],
    ["medium", ["kick", "kickPunch", "signature"]],
    ["heavy", ["punch", "punch2", "launcher", "super"]],
  ]) {
    const g = game(side), f = g.fighters[side]; f.meter = 100;
    const seen = []; let serial = 0, combo = 0;
    for (let i = 0; i < 210; i++) {
      drive(g, side, { assist: true, [strength]: i % 8 === 0 });
      if (f.moveSerial !== serial) { serial = f.moveSerial; seen.push(f.move); }
      combo = Math.max(combo, f.combo);
      if (seen.length >= expected.length && f.contact === "hit") break;
    }
    assert.deepEqual(seen.slice(0, expected.length), expected);
    assert.ok(combo >= expected.length && g.fighters[1 - side].hp < 260);
  }
});

test("Mizuki's four airborne attacks keep their own phases and dive velocity without spending reversal meter", () => {
  for (const side of [0, 1]) for (const [button, move, row] of [["light", "airPunch", 0], ["medium", "airKick", 1], ["heavy", "airHeavy", 2], ["ability", "airSignature", 3]]) {
    const g = game(side, 550), f = g.fighters[side];
    Object.assign(f, { y: FLOOR - 160, vy: -100, vx: f.facing * 160, state: "jump" });
    drive(g, side, { [button]: true });
    assert.equal(f.move, move); assert.equal(f.airAttacks, 1); assert.equal(f.meter, 0);
    if (button === "ability") {
      assert.equal(f.vx, f.facing * 415);
      assert.ok(f.vy < 0, "legal-height startup retains its jump momentum");
      for (let i = 0; i < 24 && f.moveTime < getFighter("mizuki").moves.airSignature.startup; i++) drive(g, side);
      assert.ok(f.vy >= 550 && f.state === "attack");
    } else assert.ok(Math.abs(f.vx) >= 150, "jump inertia persists through a normal");
    const m = getFighter("mizuki").moves[move];
    for (const [time, phase] of [[0, 0], [m.startup, 1], [m.startup + m.active, 2], [m.startup + m.active + m.recovery * 0.8, 3]]) {
      f.moveTime = time;
      assert.deepEqual(pixelFrame(f), { sheet: "air", index: row * 4 + phase });
    }
  }
});

test("Mizuki's late jump-in confirms into a fresh ground attack and stale low dives are dropped", () => {
  for (const side of [0, 1]) {
    const g = game(side), f = g.fighters[side];
    Object.assign(f, { y: FLOOR - 85, vy: 210, state: "jump" });
    drive(g, side, { medium: true });
    until(g, side, () => f.contact === "hit");
    until(g, side, () => f.state === "landing");
    drive(g, side, { light: true });
    until(g, side, () => f.move === "punch");
    until(g, side, () => f.contact === "hit");
    assert.ok(f.combo >= 2);
    const low = game(side, 550), lowFighter = low.fighters[side];
    Object.assign(lowFighter, { y: FLOOR - 18, vy: 300, state: "jump" });
    drive(low, side, { ability: true }, 60);
    assert.equal(lowFighter.moveSerial, 0);
    assert.equal(lowFighter.move, null);
  }
});

test("Mizuki's full-meter super spends once, advertises her name and finishes a real set", () => {
  for (const side of [0, 1]) {
    const g = game(side), f = g.fighters[side]; f.meter = 100;
    drive(g, side, { heavy: true, ability: true });
    until(g, side, () => f.move === "super", { heavy: true, ability: true });
    assert.ok(g.events.some(e => e.type === "super" && e.text === "满月回旋"));
    drive(g, side, { heavy: true, ability: true }, 100);
    assert.equal(f.meter, 0);
    assert.equal(f.moveSerial, 1);
    assert.ok(g.fighters[1 - side].hp < 235);
    while (g.phase !== "result") {
      g.fighters[0].x = 565; g.fighters[1].x = 674;
      g.fighters[1 - side].hp = 10;
      drive(g, side, {}, 150);
      drive(g, side, { ability: true }, 110);
      if (g.phase === "roundEnd") skipTransition(g);
      if (g.phase === "intro") skipTransition(g);
      assert.ok(g.round <= 3);
    }
    assert.equal(g.winner, side);
    assert.equal(f.character, "mizuki");
  }
});
