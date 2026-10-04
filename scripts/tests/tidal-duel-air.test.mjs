import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const {
  createGame,
  startGame,
  skipTransition,
  stepGame,
  emptyInput,
  FLOOR,
  STEP,
  fighterBoxes,
} = await loadTypescriptModule("src/components/tidalDuel/engine.ts");
const { getFighter } = await loadTypescriptModule(
  "src/components/tidalDuel/roster.ts",
);
const { pixelFrame } = await loadTypescriptModule(
  "src/components/tidalDuel/renderer.ts",
);
function game(character = "sui", gap = 130) {
  const g = createGame({ mode: "local", character });
  startGame(g);
  skipTransition(g);
  g.fighters[0].x = 550;
  g.fighters[1].x = 550 + gap;
  return g;
}
function ticks(g, a = {}, b = {}, count = 1) {
  for (let i = 0; i < count; i++)
    stepGame(g, [
      { ...emptyInput(), ...a },
      { ...emptyInput(), ...b },
    ]);
}
function sideTicks(g, side, input = {}, count = 1, defense = {}) {
  ticks(g, side === 0 ? input : defense, side === 1 ? input : defense, count);
}
function airborne(g, side = 0, patch = {}) {
  Object.assign(g.fighters[side], {
    y: FLOOR - 130,
    vy: -100,
    vx: 0,
    state: "jump",
    ...patch,
  });
  return g.fighters[side];
}
function until(g, condition, a = {}, b = {}, limit = 240) {
  for (let n = 0; n < limit && !condition(); n++) ticks(g, a, b);
  assert.ok(
    condition(),
    "expected combat transition occurs within two seconds",
  );
}

test("jump plus each modern normal launches in either key order and both player slots", () => {
  for (const side of [0, 1])
    for (const [button, move] of [
      ["light", "airPunch"],
      ["medium", "airKick"],
      ["heavy", "airHeavy"],
    ]) {
      for (const first of [null, "jump", button]) {
        const g = game("sui", 550);
        if (first) sideTicks(g, side, { [first]: true }, 4);
        sideTicks(g, side, { jump: true, [button]: true }, 4);
        assert.equal(g.fighters[side].move, move, `${side} ${button} ${first}`);
        assert.ok(g.fighters[side].y < FLOOR);
        assert.equal(g.fighters[side].airAttacks, 1);
      }
    }
});

test("attacking and releasing direction preserve forward and backward jump momentum", () => {
  for (const side of [0, 1])
    for (const direction of ["left", "right"]) {
      const g = game("sui", 550),
        f = g.fighters[side];
      sideTicks(g, side, { jump: true, [direction]: true }, 12);
      const velocity = f.vx,
        x = f.x;
      sideTicks(g, side, { medium: true }, 15);
      assert.ok(Math.abs(f.vx - velocity) < 0.001);
      assert.ok(Math.abs(f.x - x) > 30);
      assert.equal(Math.sign(f.x - x), direction === "left" ? -1 : 1);
    }
});

test("air steering is gradual and facing remains locked through a cross-over", () => {
  const g = game("sui", 550),
    f = airborne(g, 0, { vx: 300, facing: 1 });
  ticks(g, { left: true }, {}, 10);
  assert.ok(f.vx > 200 && f.vx < 300);
  g.fighters[1].x = f.x - 300;
  ticks(g, { heavy: true });
  assert.equal(
    f.facing,
    1,
    "air attacks do not auto-turn towards the crossed opponent",
  );
});

test("assist in the air selects the corresponding jump normal without a ground route", () => {
  for (const [button, move] of [
    ["light", "airPunch"],
    ["medium", "airKick"],
    ["heavy", "airHeavy"],
  ]) {
    const g = game("sui", 550),
      f = airborne(g);
    ticks(g, { assist: true, [button]: true });
    assert.equal(f.move, move);
    assert.equal(f.assisted, null);
    ticks(g, { assist: true, [button]: true }, {}, 30);
    assert.equal(
      f.moveSerial,
      1,
      "holding attack does not automatically repeat",
    );
  }
});

test("confirmed light-medium-heavy air chains hit and stop at three attacks", () => {
  for (const character of ["sui", "shiori"]) {
    const g = game(character),
      f = airborne(g, 0, { y: FLOOR - 160, vy: -160 });
    airborne(g, 1, { y: FLOOR - 160, vy: -160 });
    ticks(g, { light: true });
    until(g, () => f.contact === "hit");
    ticks(g, { medium: true });
    until(g, () => f.move === "airKick" && f.contact === "hit");
    ticks(g, { heavy: true });
    until(g, () => f.move === "airHeavy" && f.contact === "hit");
    assert.equal(f.airAttacks, 3);
    const serial = f.moveSerial;
    ticks(g, { ability: true });
    ticks(g, {}, {}, 10);
    assert.equal(
      f.moveSerial,
      serial,
      "a fourth aerial action cannot be added",
    );
    assert.ok(g.fighters[1].hp < 260);
  }
});

test("blocked or whiffed air attacks cannot cancel or restart before landing", () => {
  for (const block of [false, true]) {
    const g = game("sui", block ? 130 : 550),
      f = airborne(g, 0, { y: FLOOR - 85, vy: 120 });
    const defense = block ? { right: true } : {};
    ticks(g, { light: true }, defense);
    if (block) until(g, () => f.contact === "block", {}, defense);
    else ticks(g, {}, defense, 14);
    ticks(g, { medium: true }, defense);
    ticks(g, {}, defense, 25);
    assert.equal(f.moveSerial, 1);
    assert.equal(g.fighters[1].hp, 300);
  }
});

test("crouching evades elevated horizontal air attacks; descending and very low kicks follow the body contour", () => {
  for (const side of [0, 1])
    for (const button of ["light", "medium", "heavy"]) for (const height of [130, 70]) {
      const g = game("sui", 109);
      airborne(g, side, { y: FLOOR - height, vy: 0 });
      sideTicks(g, side, { [button]: true }, 40, { crouch: true });
      assert.equal(g.fighters[1 - side].hp < 300,
        button === "heavy" || (button === "medium" && height === 70), `${side}/${button}/${height}`);
    }
});

test("both aerial signatures dive once with character identity and no ground reversal charge", () => {
  for (const character of ["sui", "shiori"])
    for (const crouch of [false, true]) {
      const g = game(character, 550),
        f = airborne(g, 0, { y: FLOOR - 160 });
      ticks(g, { ability: true, crouch });
      assert.equal(f.move, "airSignature");
      assert.equal(f.meter, 0);
      assert.ok(f.vx > 300 && f.vy < 0, 'startup retains the jump; diving begins with the active pose');
      until(g, () => f.moveTime >= getFighter(character).moves.airSignature.startup);
      assert.ok(f.vy > 400);
      assert.match(
        getFighter(character).moves[f.move].name,
        character === "sui" ? /猫袭/ : /落潮/,
      );
      ticks(g, { ability: true, crouch }, {}, 18);
      assert.equal(f.moveSerial, 1);
      assert.equal(f.meter, 0);
    }
});

test("landing interrupts an air hitbox and drops stale air normals, specials and super chords", () => {
  for (const late of [
    { medium: true },
    { ability: true },
    { heavy: true, ability: true },
  ]) {
    const g = game(),
      f = airborne(g, 0, { y: FLOOR - 12, vy: 600 });
    f.meter = 100;
    ticks(g, { light: true });
    ticks(g, late);
    until(g, () => f.state === "landing");
    assert.equal(f.y, FLOOR);
    assert.equal(f.move, null);
    assert.equal(fighterBoxes(f).attack, null);
    ticks(g, {}, {}, 24);
    assert.equal(f.moveSerial, 1);
    assert.equal(f.meter, 100);
    assert.equal(g.fighters[1].hp, 300);
  }
});

test("a low-altitude signature cannot become an instant overhead or a ground special on landing", () => {
  const g = game(),
    f = airborne(g, 0, { y: FLOOR - 18, vy: 300 });
  ticks(g, { ability: true });
  ticks(g, {}, {}, 35);
  assert.equal(f.moveSerial, 0);
  assert.equal(g.fighters[1].hp, 300);
});

test("a late jump-in can land and confirm into a fresh ground light attack", () => {
  for (const character of ["sui", "shiori"]) {
    const g = game(character, 110),
      f = airborne(g, 0, { y: FLOOR - 85, vy: 210 });
    ticks(g, { medium: true });
    until(g, () => f.contact === "hit");
    until(g, () => f.state === "landing");
    assert.ok(g.fighters[1].stun > 0);
    ticks(g, { light: true });
    until(g, () => f.move === "punch");
    until(g, () => f.contact === "hit");
    assert.ok(f.combo >= 2, "jump normal to ground normal keeps a real combo");
  }
});

test("air-to-air hits launch the target and settle into protected knockdown", () => {
  const g = game(),
    f = airborne(g),
    target = airborne(g, 1);
  ticks(g, { medium: true }, { guard: true });
  until(g, () => f.contact === "hit", {}, { guard: true });
  assert.equal(target.state, "launch");
  assert.equal(target.juggle, 1);
  assert.ok(target.hp < 300);
  until(g, () => target.state === "down");
  assert.equal(target.y, FLOOR);
  assert.ok(target.invincible > 0);
  ticks(g, {}, {}, 150);
  assert.notEqual(target.state, "launch");
});

test("all aerial attacks animate in their own row and freeze with hitstop", () => {
  const g = game("sui", 550),
    f = airborne(g);
  for (const id of ["airPunch", "airKick", "airHeavy", "airSignature"]) {
    const m = getFighter(f.character).moves[id];
    Object.assign(f, { state: "attack", move: id });
    for (const [time, phase] of [
      [0, 0],
      [m.startup + 0.001, 1],
      [m.startup + m.active + 0.001, 2],
      [m.startup + m.active + m.recovery * 0.9, 3],
    ]) {
      f.moveTime = time;
      assert.deepEqual(pixelFrame(f), {
        sheet: "air",
        index: m.air.row * 4 + phase,
      });
    }
  }
  g.freeze = 0.1;
  const before = { x: f.x, y: f.y, time: f.moveTime, frame: pixelFrame(f) };
  ticks(g, {}, {}, 4);
  assert.deepEqual(
    { x: f.x, y: f.y, time: f.moveTime, frame: pixelFrame(f) },
    before,
  );
});

test("jump attacks and landing timing agree at 30, 60 and 120 Hz", () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const g = game("sui", 550);
    for (let n = 0; n < hz * 2; n++)
      stepGame(
        g,
        [
          { ...emptyInput(), jump: true, right: true, medium: true },
          emptyInput(),
        ],
        1 / hz,
      );
    const f = g.fighters[0];
    results.push({
      x: f.x,
      y: f.y,
      vy: f.vy,
      state: f.state,
      serial: f.moveSerial,
      attacks: f.airAttacks,
    });
    assert.equal(g.accumulator, 0);
    assert.equal(f.y, FLOOR);
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  assert.equal(STEP, 1 / 120);
});
