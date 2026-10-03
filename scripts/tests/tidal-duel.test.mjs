import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { createGame, startGame, skipTransition, stepGame, emptyInput, resetTraining, describeGame, STEP, FLOOR } = await loadTypescriptModule("src/components/tidalDuel/engine.ts");
const { FIGHTERS, getFighter } = await loadTypescriptModule("src/components/tidalDuel/roster.ts");
const input = actions => ({ ...emptyInput(), ...actions });
const tick = (game, actions = {}, defender = {}, frames = 1) => {
  for (let n = 0; n < frames; n++) stepGame(game, [input(actions), input(defender)]);
};
const match = (options = {}, seed = 1107) => {
  const game = createGame({ mode: "local", ...options }, seed);
  startGame(game); skipTransition(game);
  return game;
};
const close = options => {
  const game = match(options);
  game.fighters[0].x = 565; game.fighters[1].x = 674;
  return game;
};

test("roster registers both identities, unique complete moves, and safely validates unknown choices", () => {
  assert.deepEqual(FIGHTERS.map(f => f.id), ["sui", "shiori"]);
  for (const f of FIGHTERS) {
    assert.equal(f.frames.length, 8);
    for (const action of ["punch", "kick", "lowPunch", "lowKick", "throw", "super", "launcher"]) assert.ok(f.moves[action]);
    for (const move of Object.values(f.moves)) {
      assert.ok(move.startup > 0 && move.active > 0 && move.recovery > 0);
      for (const next of Object.values(move.followups ?? {})) assert.ok(f.moves[next]);
    }
  }
  assert.equal(createGame({ character: "missing" }).fighters[0].character, "sui");
  assert.equal(createGame({ roundSeconds: NaN }).roundTimer, 60);
  assert.notEqual(getFighter("sui").moves.super.name, getFighter("shiori").moves.super.name);
});

test("a third registered fighter plays using configured speed, a new followup and a signature super without engine edits", () => {
  const base = getFighter("sui");
  const entry = {
    ...base, id: "test-third-fighter", name: "扩展测试选手", speed: 401, power: 1.1, superName: "落日光刃",
    moves: {
      ...base.moves,
      punch: { ...base.moves.punch, damage: 20, followups: { kick: "sunPalm" } },
      sunPalm: { ...base.moves.punch2, id: "sunPalm", name: "落日掌", damage: 40, reach: 220 },
      super: { ...base.moves.super, name: "落日光刃", damage: 80, reach: 280 },
    },
  };
  // The loader shares the same roster module instance with the running engine.
  FIGHTERS.push(entry);
  try {
    const movement = match({ character: entry.id });
    assert.equal(movement.fighters[0].character, entry.id);
    movement.fighters[0].x = 200; movement.fighters[1].x = 1100;
    tick(movement, { right: true }, {}, 120);
    assert.ok(Math.abs(movement.fighters[0].x - 601) < 1e-7);

    const combo = close({ character: entry.id });
    tick(combo, { punch: true }, {}, 20); tick(combo);
    assert.equal(combo.fighters[1].hp, 278, "custom punch damage and power are applied");
    tick(combo, { kick: true }, {}, 35);
    assert.equal(combo.fighters[0].move, "sunPalm", "new move IDs resolve through the registered followup");
    assert.equal(combo.fighters[0].combo, 2);
    assert.ok(combo.fighters[1].hp < 250);

    const special = close({ character: entry.id }); special.fighters[0].meter = 100;
    tick(special, { special: true }, {}, 80);
    assert.equal(special.fighters[1].hp, 212, "custom super damage and power are applied");
    assert.ok(special.events.some(event => event.type === "super" && event.text === entry.superName));
    assert.ok(describeGame(special).roster.some(f => f.id === entry.id && f.name === entry.name));
  } finally {
    FIGHTERS.splice(FIGHTERS.indexOf(entry), 1);
  }
  assert.deepEqual(FIGHTERS.map(f => f.id), ["sui", "shiori"], "test registration does not alter the shipped roster");
});

test("fixed simulation is identical at 30, 60 and 120Hz", () => {
  const run = hz => {
    const game = match();
    for (let n = 0; n < hz; n++) stepGame(game, [input({ right: true, jump: true }), emptyInput()], 1 / hz);
    return game;
  };
  assert.deepEqual(run(30), run(120));
  assert.deepEqual(run(60), run(120));
});

test("sub-tick taps remain buffered when released before the next physics tick", () => {
  const game = close();
  stepGame(game, [input({ punch: true }), emptyInput()], STEP * 0.4);
  assert.equal(game.fighters[0].move, null);
  stepGame(game, [emptyInput(), emptyInput()], STEP * 0.6);
  assert.equal(game.fighters[0].move, "punch");
  tick(game, {}, {}, 30); assert.equal(game.fighters[1].hp, 288);
});

test("movement approaches and retreats, faces the opponent, and stays within arena", () => {
  const game = match();
  tick(game, { left: true }, {}, 600);
  assert.equal(game.fighters[0].x, 88);
  assert.equal(game.fighters[0].facing, 1);
  tick(game, { right: true }, { right: true }, 600);
  assert.ok(game.fighters[0].x > 88);
  assert.ok(game.fighters[1].x <= 1192);
  assert.ok(Math.abs(game.fighters[1].x - game.fighters[0].x) >= 98.99);
});

test("jump is an edge input, lands naturally, and clears a low sweep", () => {
  const game = close();
  tick(game, {}, { jump: true });
  assert.equal(game.fighters[1].state, "jump", "first airborne tick preserves the jump animation state");
  tick(game);
  game.fighters[1].y = FLOOR; game.fighters[1].vy = 0; game.fighters[1].state = "idle";
  tick(game, { crouch: true, kick: true }, { jump: true }, 50);
  assert.equal(game.fighters[1].hp, 300);
  assert.ok(game.fighters[1].y < FLOOR);
  tick(game, {}, { jump: true }, 120);
  assert.equal(game.fighters[1].y, FLOOR);
  assert.equal(game.fighters[1].state, "idle");
  tick(game); tick(game, {}, { jump: true });
  assert.ok(game.fighters[1].vy < 0);
});

test("strikes connect once and generate meter; holding a punch never repeats or chains", () => {
  const game = close();
  tick(game, { punch: true }, {}, 90);
  assert.equal(game.fighters[1].hp, 288);
  assert.equal(game.fighters[0].combo, 1);
  assert.ok(game.fighters[0].meter > 0 && game.fighters[1].meter > 0);
  tick(game, { punch: true }, {}, 100);
  assert.equal(game.fighters[1].hp, 288);
});

test("simultaneous attack buttons select one action instead of creating an unintended automatic combo", () => {
  const game = close(); tick(game, { punch: true, kick: true }, {}, 100);
  assert.equal(game.fighters[1].hp, 288); assert.equal(game.fighters[0].combo, 1);
  const defense = close(); tick(defense, { hold: true, punch: true }, {}, 90);
  assert.equal(defense.fighters[1].hp, 300);
});

test("standing guard blocks high/mid, crouching guard blocks low, and wrong height gets hit", () => {
  const high = close(); tick(high, { punch: true }, { guard: true }, 35);
  assert.equal(high.fighters[1].hp, 300); assert.ok(high.events.some(e => e.type === "block"));
  const mid = close(); tick(mid, { kick: true }, { guard: true }, 35); assert.equal(mid.fighters[1].hp, 300);
  const low = close(); tick(low, { crouch: true, kick: true }, { guard: true, crouch: true }, 45); assert.equal(low.fighters[1].hp, 300);
  const wrong = close(); tick(wrong, { crouch: true, kick: true }, { guard: true }, 45); assert.ok(wrong.fighters[1].hp < 300);
  const duck = close(); tick(duck, { punch: true }, { crouch: true }, 35); assert.equal(duck.fighters[1].hp, 300);
});

test("three directional holds reverse the correct heights; wrong height and late hold lose", () => {
  for (const [attacker, defender] of [[{ punch: true }, { hold: true, jump: true }], [{ kick: true }, { hold: true }], [{ crouch: true, punch: true }, { hold: true, crouch: true }]]) {
    const game = close(); tick(game, attacker, defender, 40);
    assert.equal(game.fighters[1].hp, 300);
    assert.ok(game.fighters[0].hp < 300);
    assert.ok(game.events.some(e => e.type === "hold"));
    assert.equal(game.fighters[1].y, FLOOR, "high hold chord does not accidentally jump");
  }
  const wrong = close(); tick(wrong, { punch: true }, { hold: true }, 35); assert.ok(wrong.fighters[1].hp < 300);
  const late = close(); tick(late, {}, { hold: true }, 31); tick(late, { punch: true }, { hold: true }, 35); assert.ok(late.fighters[1].hp < 300);
});

test("human-paced upper hold chords work in either key order without accidental jump", () => {
  for (const first of ["jump", "hold"]) {
    const game = close();
    tick(game, {}, { [first]: true }, 6);
    tick(game, {}, { jump: true, hold: true }, 1);
    assert.equal(game.fighters[1].state, "hold"); assert.equal(game.fighters[1].holdHeight, "high"); assert.equal(game.fighters[1].y, FLOOR);
    tick(game, { punch: true }, { jump: true, hold: true }, 25);
    assert.equal(game.fighters[1].hp, 300); assert.ok(game.fighters[0].hp < 300);
  }
  const late = close(); tick(late, {}, { jump: true }, 20); tick(late, {}, { jump: true, hold: true });
  assert.equal(late.fighters[1].state, "jump", "ordinary established jumps cannot be cancelled into counters");
});

test("blockstun prevents immediate guard-to-hold cancellation while preserving a later buffered hold", () => {
  const game = close(); tick(game, { punch: true }, { guard: true }, 12);
  const defender = game.fighters[1]; assert.ok(defender.stun > 0);
  tick(game, {}, { guard: true, hold: true }, 6);
  assert.equal(defender.state, "guard");
  tick(game, {}, { guard: true, hold: true }, 30);
  assert.equal(defender.state, "hold");
});

test("strike/hold/throw triangle works independently of player slot", () => {
  for (const side of [0, 1]) {
    const game = close(); const attacks = side === 0 ? [{ throw: true }, { guard: true }] : [{ guard: true }, { throw: true }];
    tick(game, attacks[0], attacks[1], 50);
    assert.ok(game.fighters[1 - side].hp < 300);
    assert.equal(game.fighters[1 - side].state, "down");
  }
  const punish = close(); tick(punish, { throw: true }, { hold: true }, 50);
  assert.equal(punish.fighters[1].hp, 247, "failed holds incur increased throw damage");
  const strike = close(); tick(strike, { punch: true }, { throw: true }, 30);
  assert.equal(strike.fighters[0].hp, 300); assert.ok(strike.fighters[1].hp < 300);
  const reverse = close(); tick(reverse, { throw: true }, { punch: true }, 30);
  assert.equal(reverse.fighters[1].hp, 300); assert.ok(reverse.fighters[0].hp < 300);
});

test("sidestep evades linear punches while tracking kicks catch it", () => {
  const linear = close(); tick(linear, {}, { sidestep: true }, 10); tick(linear, { punch: true }, {}, 30);
  assert.equal(linear.fighters[1].hp, 300);
  const tracking = close(); tick(tracking, {}, { sidestep: true }, 10); tick(tracking, { kick: true }, {}, 30);
  assert.ok(tracking.fighters[1].hp < 300);
});

test("recovery input buffer creates real punch-punch-launcher chain and critical stun", () => {
  const game = close(); tick(game, { punch: true }, {}, 18); tick(game);
  tick(game, { punch: true }, {}, 21);
  assert.equal(game.fighters[0].move, "punch2");
  assert.ok(game.fighters[1].hp < 288);
  assert.equal(game.fighters[1].state, "critical");
  tick(game); tick(game, { kick: true }, {}, 40);
  assert.equal(game.fighters[0].move, "launcher");
  assert.equal(game.fighters[1].state, "launch");
  assert.ok(game.fighters[0].combo >= 3);
  assert.ok(game.fighters[1].y < FLOOR);
});

test("critical stun can be escaped by a correctly timed hold", () => {
  const game = close();
  const target = game.fighters[1]; target.state = "critical"; target.stun = 0.5; target.critical = 0.6;
  tick(game, { kick: true }, { hold: true }, 32);
  assert.equal(target.hp, 300);
  assert.ok(game.fighters[0].hp < 300);
  assert.equal(target.critical, 0);
});

test("limited airborne juggles give guaranteed knockdown and protected wakeup", () => {
  const game = close(); const target = game.fighters[1];
  target.state = "launch"; target.y = FLOOR - 100; target.vy = -60; target.juggle = 2;
  tick(game, { punch: true }, {}, 28);
  assert.equal(target.juggle, 3);
  tick(game, {}, {}, 100);
  assert.ok(["down", "wake", "idle"].includes(target.state));
  const down = close(); down.fighters[1].state = "down"; down.fighters[1].stateDuration = 0.5; down.fighters[1].invincible = 0.5;
  tick(down, { kick: true }, {}, 35); assert.equal(down.fighters[1].hp, 300);
  tick(down, {}, {}, 100); assert.equal(down.fighters[1].state, "idle");
});

test("supers require full meter, spend once, have character identity, can be guarded", () => {
  const none = close(); tick(none, { special: true }, {}, 60); assert.equal(none.fighters[1].hp, 300); assert.equal(none.fighters[0].move, null);
  for (const character of ["sui", "shiori"]) {
    const game = close({ character, opponent: character === "sui" ? "shiori" : "sui" }); game.fighters[0].meter = 100;
    tick(game, { special: true }, {}, 90);
    assert.ok(game.fighters[1].hp <= 236);
    assert.equal(game.fighters[0].meter, 0);
    assert.ok(game.events.some(e => e.type === "super" && e.text === getFighter(character).superName));
  }
  const guard = close(); guard.fighters[0].meter = 100; tick(guard, { special: true }, { guard: true }, 90);
  assert.equal(guard.fighters[1].hp, 292);
});

test("hitstop freezes fighter motion and round timer; pause freezes every field including AI", () => {
  const game = close(); tick(game, { punch: true }, {}, 12);
  assert.ok(game.freeze > 0);
  const timer = game.roundTimer; const x = game.fighters[1].x; tick(game, {}, { right: true }, 3);
  assert.equal(game.roundTimer, timer); assert.equal(game.fighters[1].x, x);
  game.paused = true; const before = structuredClone(game); tick(game, { right: true, kick: true }, {}, 600); assert.deepEqual(game, before);
});

test("60 second timeout chooses remaining health, ties replay, and two wins finish a set", () => {
  const game = match(); tick(game, {}, {}, 7201);
  assert.equal(game.phase, "roundEnd"); assert.equal(game.winner, null); assert.deepEqual(game.wins, [0, 0]);
  skipTransition(game); assert.equal(game.round, 2); skipTransition(game);
  game.fighters[1].hp = 250; game.roundTimer = STEP; tick(game);
  assert.equal(game.winner, 0); assert.deepEqual(game.wins, [1, 0]);
  skipTransition(game); skipTransition(game); game.fighters[1].hp = 0; tick(game);
  assert.deepEqual(game.wins, [2, 0]); skipTransition(game);
  assert.equal(game.phase, "result"); assert.equal(game.winner, 0);
});

test("airborne knockouts settle safely into the round result; natural transitions reach the next fight", () => {
  const game = close(); game.fighters[1].hp = 1; game.fighters[1].state = "launch"; game.fighters[1].y = FLOOR - 60; game.fighters[1].vy = 30;
  tick(game, { punch: true }, {}, 20);
  assert.equal(game.phase, "roundEnd"); assert.equal(game.fighters[1].state, "defeat"); assert.equal(game.fighters[1].y, FLOOR);
  tick(game, {}, {}, 470);
  assert.equal(game.phase, "fight"); assert.equal(game.round, 2); assert.equal(game.fighters[1].hp, 300);
});

test("training freezes the match clock, restores knocked out dummies, tracks and resets damage", () => {
  const game = close({ mode: "training" }); tick(game, { punch: true }, {}, 60);
  assert.equal(game.roundTimer, 60); assert.equal(game.training.hits, 1); assert.equal(game.training.damage, 12);
  game.fighters[1].hp = 0; tick(game, {}, {}, 200);
  assert.equal(game.phase, "fight"); assert.equal(game.fighters[1].hp, 300); assert.equal(game.fighters[0].meter, 100);
  assert.equal(game.training.damage, 12);
  resetTraining(game); assert.equal(game.training.damage, 0);
  const guard = close({ mode: "training", dummy: "guard" }); tick(guard, { crouch: true, kick: true }, {}, 40); assert.equal(guard.fighters[1].hp, 300);
});

test("all three seeded AI levels move, fight, complete rounds and reproduce exactly", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const run = seed => {
      const game = match({ mode: "solo", difficulty }, seed);
      for (let n = 0; n < 7200; n++) {
        const f = game.fighters[0], target = game.fighters[1];
        tick(game, { right: target.x > f.x + 120, left: target.x < f.x - 120, punch: n % 41 < 3, kick: n % 73 < 3 });
      }
      return game;
    };
    const game = run(2737); assert.deepEqual(game, run(2737));
    assert.ok(game.wins.some(w => w > 0), difficulty);
    assert.ok(game.fighters.every(f => Number.isFinite(f.hp) && Number.isFinite(f.x)), difficulty);
  }
});

test("public description captures combat state and registered expansion identities", () => {
  const game = close(); tick(game, { kick: true }, {}, 24); const state = describeGame(game);
  assert.equal(state.fighters.length, 2); assert.equal(state.fighters[1].hp, game.fighters[1].hp);
  assert.equal(state.timeRemaining, Math.round(game.roundTimer * 100) / 100);
  assert.equal(state.roster.length, 2); assert.ok(state.coordinates.includes("610"));
  assert.ok(state.events.some(e => e.type === "hit"));
});
