import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { createGame, startGame, skipTransition, stepGame, emptyInput, FLOOR } =
  await loadTypescriptModule("src/components/tidalDuel/engine.ts");
function game(options = {}, gap = 109) {
  const g = createGame({ mode: "local", ...options });
  startGame(g);
  skipTransition(g);
  g.fighters[0].x = 600 - gap / 2;
  g.fighters[1].x = 600 + gap / 2;
  return g;
}
function ticks(g, a = {}, b = {}, n = 1) {
  for (let i = 0; i < n; i++)
    stepGame(g, [
      { ...emptyInput(), ...a },
      { ...emptyInput(), ...b },
    ]);
}
function sideTicks(g, side, attack, frames = 1, defense = {}) {
  ticks(
    g,
    side === 0 ? attack : defense,
    side === 1 ? attack : defense,
    frames,
  );
}
function away(g, side) {
  return g.fighters[side].x > g.fighters[1 - side].x ? "right" : "left";
}

test("holding back blocks grounded strikes for both players and after switching sides, while still retreating at range", () => {
  for (const side of [0, 1])
    for (const crossed of [false, true]) {
      const g = game();
      if (crossed)
        [g.fighters[0].x, g.fighters[1].x] = [g.fighters[1].x, g.fighters[0].x];
      sideTicks(g, side, { light: true }, 35, { [away(g, 1 - side)]: true });
      assert.equal(g.fighters[1 - side].hp, 300);
      assert.ok(g.events.some((e) => e.type === "block"));
    }
  const far = game({}, 700),
    x = far.fighters[0].x;
  ticks(far, { left: true }, {}, 30);
  assert.ok(far.fighters[0].x < x - 50);
  assert.equal(far.fighters[0].state, "walk");
});

test("down-back blocks low sweeps and ground mids; standing back loses to lows and down alone cannot guard", () => {
  for (const side of [0, 1]) {
    for (const attack of [{ crouch: true, medium: true }, { medium: true }]) {
      const g = game();
      sideTicks(g, side, attack, 50, {
        crouch: true,
        [away(g, 1 - side)]: true,
      });
      assert.equal(g.fighters[1 - side].hp, 300);
      assert.ok(g.events.some((e) => e.type === "block"));
    }
    const low = game();
    sideTicks(low, side, { crouch: true, medium: true }, 50, {
      [away(low, 1 - side)]: true,
    });
    assert.ok(low.fighters[1 - side].hp < 300);
    const crouch = game();
    sideTicks(crouch, side, { medium: true }, 50, { crouch: true });
    assert.ok(crouch.fighters[1 - side].hp < 300);
  }
});

test("standing back defends jump-in attacks while crouch-back loses, and attacking is not automatic guard", () => {
  for (const crouching of [false, true]) {
    const g = game();
    Object.assign(g.fighters[0], { y: FLOOR - 70, vy: 0, state: "jump" });
    ticks(g, { medium: true }, { right: true, crouch: crouching }, 40);
    assert.equal(g.fighters[1].hp < 300, crouching);
    if (!crouching) assert.ok(g.events.some((e) => e.type === "block"));
  }
  const g = game();
  ticks(g, { light: true }, { right: true, heavy: true }, 40);
  assert.ok(g.fighters[1].hp < 300);
});

test("back and crouch-back defend a real travelling wave on both sides", () => {
  for (const side of [0, 1])
    for (const crouch of [false, true]) {
      const g = game(
        {
          character: side ? "sui" : "shiori",
          opponent: side ? "shiori" : "sui",
        },
        330,
      );
      sideTicks(g, side, { ability: true }, 110, {
        crouch,
        [away(g, 1 - side)]: true,
      });
      assert.equal(g.fighters[1 - side].hp, 300);
      assert.ok(g.events.some((e) => e.type === "block"));
    }
});

test("modern light, medium and heavy are distinct; neutral and down plus special choose signature and paid reversal", () => {
  for (const side of [0, 1])
    for (const [button, move] of [
      ["light", "punch"],
      ["medium", "kick"],
      ["heavy", "kick2"],
      ["ability", "signature"],
    ]) {
      const g = game();
      sideTicks(g, side, { [button]: true });
      assert.equal(g.fighters[side].move, move);
    }
  for (const side of [0, 1]) {
    const g = game();
    g.fighters[side].meter = 25;
    sideTicks(g, side, { crouch: true, ability: true });
    assert.equal(g.fighters[side].move, "reversal");
    assert.equal(g.fighters[side].meter, 0);
    const empty = game();
    sideTicks(empty, side, { crouch: true, ability: true });
    assert.equal(empty.fighters[side].move, null);
  }
});

test("light-medium throws tolerate either press order within startup and never leave a stray normal on release", () => {
  for (const first of ["light", "medium"])
    for (const side of [0, 1]) {
      const g = game();
      sideTicks(g, side, { [first]: true }, 3);
      sideTicks(g, side, { light: true, medium: true });
      assert.equal(g.fighters[side].move, "throw");
      sideTicks(g, side, { light: true, medium: true }, 85);
      assert.ok(g.events.some((e) => e.type === "throw"));
      const hp = g.fighters[1 - side].hp;
      sideTicks(g, side, { [first]: true }, 100);
      assert.equal(g.fighters[1 - side].hp, hp);
      assert.equal(g.fighters[side].move, null);
    }
});

test("light-medium breaks a grab on either side within the real tech window", () => {
  for (const side of [0, 1]) {
    const g = game();
    sideTicks(g, side, { light: true, medium: true });
    ticks(g, {}, {}, 16);
    assert.equal(g.fighters[1 - side].state, "grabbed");
    sideTicks(g, 1 - side, { light: true, medium: true });
    ticks(g, {}, {}, 30);
    assert.equal(g.grabs.length, 0);
    assert.ok(g.events.some((e) => e.type === "tech"));
    assert.equal(g.fighters[0].hp, 300);
    assert.equal(g.fighters[1].hp, 300);
  }
});

test("heavy-special selects one super regardless of press order, refunds an uncommitted reversal and spends exactly once", () => {
  for (const first of ["heavy", "ability"])
    for (const crouch of [false, true]) {
      const g = game();
      g.fighters[0].meter = 100;
      ticks(g, { [first]: true, crouch }, {}, 3);
      ticks(g, { heavy: true, ability: true, crouch });
      assert.equal(g.fighters[0].move, "super");
      assert.equal(g.fighters[0].meter, 0);
      assert.equal(g.events.filter((e) => e.type === "super").length, 1);
      const serial = g.fighters[0].moveSerial;
      ticks(g, { heavy: true, ability: true, crouch }, {}, 180);
      assert.equal(g.fighters[0].moveSerial, serial);
    }
  const g = game();
  g.fighters[0].meter = 99;
  ticks(g, { heavy: true, ability: true });
  assert.equal(g.fighters[0].move, null);
  assert.equal(g.fighters[0].meter, 99);
});

test("assist-special escapes eligible stun once and never fires a neutral move or an unaffordable escape", () => {
  const g = game();
  Object.assign(g.fighters[0], { state: "hit", stun: 0.6, meter: 50 });
  ticks(g, { assist: true, ability: true });
  assert.equal(g.fighters[0].meter, 0);
  assert.equal(g.fighters[0].burstReady, false);
  assert.ok(g.events.some((e) => e.type === "burst"));
  const neutral = game();
  neutral.fighters[0].meter = 100;
  ticks(neutral, { assist: true, ability: true });
  assert.equal(neutral.fighters[0].move, null);
  assert.equal(neutral.fighters[0].meter, 100);
  const poor = game();
  Object.assign(poor.fighters[0], { state: "hit", stun: 0.6, meter: 49 });
  ticks(poor, { assist: true, ability: true });
  assert.equal(poor.fighters[0].state, "hit");
});

test("modern defensive chords select holds and sidesteps without jumping or queuing constituent attacks", () => {
  for (const direction of [{}, { crouch: true }, { jump: true }]) {
    const g = game();
    ticks(g, { light: true, heavy: true, ...direction });
    assert.equal(g.fighters[0].state, "hold");
    assert.equal(
      g.fighters[0].holdHeight,
      direction.crouch ? "low" : direction.jump ? "high" : "mid",
    );
    assert.equal(g.fighters[0].move, null);
    assert.equal(g.fighters[0].y, FLOOR);
  }
  const g = game();
  ticks(g, { medium: true, heavy: true }, {}, 90);
  assert.equal(g.fighters[0].state, "idle");
  assert.equal(g.fighters[1].hp, 300);
});

function assisted(strength, options = {}) {
  const g = game({}, options.gap ?? 109);
  g.fighters[0].meter = options.meter ?? 100;
  const seen = [];
  let serial = 0;
  let maxCombo = 0;
  for (let i = 0; i < 190; i++) {
    ticks(
      g,
      { assist: true, [strength]: i % 8 === 0 },
      options.block ? { guard: true } : {},
    );
    const f = g.fighters[0];
    maxCombo = Math.max(maxCombo, f.combo);
    if (f.moveSerial !== serial) {
      serial = f.moveSerial;
      seen.push(f.move);
    }
    if (
      strength === "heavy" &&
      seen.includes("launcher") &&
      f.state !== "attack" &&
      !g.freeze
    )
      break;
  }
  return { g, seen, maxCombo };
}

test("repeating the same assisted attack executes all three distinct confirmed combo routes", () => {
  for (const [strength, expected] of [
    ["light", ["punch", "punch2", "punch3"]],
    ["medium", ["kick", "kickPunch", "signature"]],
    ["heavy", ["punch", "punch2", "launcher", "super"]],
  ]) {
    const { g, seen, maxCombo } = assisted(strength);
    assert.deepEqual(seen.slice(0, expected.length), expected);
    assert.ok(g.fighters[1].hp < 260);
    assert.ok(maxCombo >= expected.length);
  }
});

test("assisted routes stop on block or whiff, and a low-meter heavy route never spends a super", () => {
  for (const options of [{ block: true }, { gap: 700 }])
    for (const strength of ["light", "medium", "heavy"]) {
      const { g, seen } = assisted(strength, options);
      assert.ok(
        seen.every((m) => m === (strength === "medium" ? "kick" : "punch")),
      );
      assert.equal(g.fighters[1].hp, 300);
      assert.ok(!g.events.some((e) => e.type === "super"));
    }
  const { g, seen } = assisted("heavy", { meter: 20 });
  assert.ok(seen.includes("launcher"));
  assert.ok(!seen.includes("super"));
  assert.ok(g.fighters[0].meter >= 20);
});

test("holding an attack never repeats and normal attacks remain independent of the assist modifier", () => {
  for (const button of ["light", "medium", "heavy"]) {
    const g = game();
    ticks(g, { [button]: true, assist: true }, {}, 140);
    assert.equal(g.fighters[0].moveSerial, 1);
    assert.equal(g.fighters[0].assisted, null);
  }
  const g = game();
  ticks(g, { light: true });
  ticks(g, {}, {}, 20);
  ticks(g, { light: true }, {}, 8);
  assert.equal(g.fighters[0].move, "punch2");
  assert.equal(g.fighters[0].assisted, null);
});

test("manual direction motions remain available on modern light and medium relative to either facing", () => {
  for (const side of [0, 1])
    for (const [sequence, attack, move] of [
      [[2, 3, 6], "light", "signature"],
      [[6, 2, 3], "medium", "reversal"],
    ]) {
      const g = game({}, 600);
      g.fighters[side].meter = 100;
      for (const d of sequence)
        sideTicks(
          g,
          side,
          {
            crouch: d === 2 || d === 3,
            ...(d === 3 || d === 6 ? { [side ? "left" : "right"]: true } : {}),
          },
          3,
        );
      sideTicks(g, side, { [attack]: true });
      assert.equal(g.fighters[side].move, move);
    }
});
