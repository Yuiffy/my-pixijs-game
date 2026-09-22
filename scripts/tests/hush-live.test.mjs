import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const e = await loadTypescriptModule("src/components/hushLive/engine.ts");
const {
  createGame,
  step,
  emptyInput,
  travel,
  action,
  signal,
  broadcast,
  SPOTS,
} = e;
const advance = (s, seconds, input = emptyInput()) => step(s, seconds, input);
const hold = (s, seconds = action(s).seconds + 0.08) => {
  advance(s, seconds, { ...emptyInput(), act: true });
  advance(s, 0.02);
};
function walk(s, spot) {
  travel(s, spot);
  for (let n = 0; s.path.length && n < 500 && s.phase === "playing"; n++)
    advance(s, 0.05);
  if (
    s.doorClosed &&
    e.distance(s.player, SPOTS[spot]) >= 65 &&
    e.nearest(s) === "door"
  ) {
    hold(s);
    return walk(s, spot);
  }
  assert.ok(
    e.distance(s.player, SPOTS[spot]) < 65,
    `walk ${spot}: ${JSON.stringify(s)}`,
  );
}
function cover(s) {
  if (e.nearest(s) === "partner" && s.cooldown === 0) {
    signal(s);
    return;
  }
  for (
    let n = 0;
    (!broadcast(s).music || broadcast(s).remaining < action(s).seconds + 0.2) &&
    n < 600;
    n++
  )
    advance(s, 0.05);
}
function solve(level, seed = 1, unlocked = level) {
  const s = createGame(level, seed, unlocked);
  s.phase = "playing";
  for (const task of s.tasks) {
    if (task === "charger") {
      walk(s, "shelf");
      cover(s);
      hold(s);
      walk(s, "sofa");
      hold(s);
    }
    if (task === "food") {
      walk(s, "entry");
      hold(s);
      walk(s, "partner");
      cover(s);
      hold(s);
    }
    if (task === "delta") {
      walk(s, "desk");
      walk(s, "door");
      if (!s.doorClosed) hold(s);
      walk(s, "desk");
      assert.equal(s.doorClosed, true);
      hold(s);
    }
    if (task === "hug" || task === "kiss") {
      walk(s, "partner");
      cover(s);
      hold(s);
    }
    assert.equal(s.phase, "playing", JSON.stringify(s));
  }
  walk(s, "partner");
  if (!s.bonus) {
    cover(s);
    hold(s);
  }
  walk(s, "sofa");
  hold(s);
  return s;
}

test("five designed nights and seeded encore can be completed with only legal movement/actions", () => {
  for (const seed of [1, 42, 99, 20260922])
    for (let level = 0; level <= 5; level++) {
      const s = solve(level, seed);
      assert.equal(s.won, true, JSON.stringify(s));
      assert.equal(s.done.length, s.tasks.length);
      assert.ok(s.totalScore > 2000);
    }
});
test("closed doors stop crossing; walls cannot be crossed above the opening", () => {
  const s = createGame();
  s.phase = "playing";
  s.player = { x: 480, y: 200 };
  advance(s, 2, { ...emptyInput(), x: 1 });
  assert.ok(s.player.x <= 506);
  s.player = { x: 480, y: 410 };
  s.doorClosed = true;
  advance(s, 2, { ...emptyInput(), x: 1 });
  assert.ok(s.player.x <= 506);
  s.doorClosed = false;
  advance(s, 2, { ...emptyInput(), x: 1 });
  assert.ok(s.player.x > 534);
});
test("door action is latched until release instead of oscillating under a held E", () => {
  const s = createGame();
  s.phase = "playing";
  walk(s, "door");
  advance(s, 4, { ...emptyInput(), act: true });
  assert.equal(s.doorClosed, true);
  advance(s, 0.05);
  hold(s);
  assert.equal(s.doorClosed, false);
});
test("music, walls, a closed door and eye-contact mute each attenuate real noise", () => {
  const sample = (spot, time, closed = false, muted = 0) => {
    const s = createGame(4);
    s.phase = "playing";
    s.player = { ...SPOTS[spot] };
    s.elapsed = time;
    s.doorClosed = closed;
    s.muted = muted;
    s.quiet = false;
    advance(s, 0.5, { ...emptyInput(), act: true });
    return s;
  };
  const raw = sample("partner", 1);
  const music = sample("partner", 13);
  const mute = sample("partner", 1, false, 7);
  assert.ok(raw.noise > music.noise * 5);
  assert.equal(mute.noise, 0);
  assert.ok(sample("desk", 1).noise > sample("desk", 1, true).noise * 3);
});
test("reckless voice exposes the secret; idle timeout fails; neither awards progression", () => {
  const s = createGame(2);
  s.phase = "playing";
  s.player = { ...SPOTS.desk };
  s.quiet = false;
  s.suspicion = 50;
  hold(s, 6);
  assert.equal(s.reason, "caught");
  assert.equal(s.won, false);
  assert.deepEqual(e.record(e.freshSave(), s), e.freshSave());
  const idle = createGame();
  idle.phase = "playing";
  advance(idle, 111);
  assert.equal(idle.reason, "timeout");
});
test("paused states freeze all simulation and clear routes; resume allows actions", () => {
  const s = createGame();
  s.phase = "playing";
  travel(s, "shelf");
  e.togglePause(s);
  const before = JSON.stringify(s);
  advance(s, 50, { ...emptyInput(), act: true, x: 1 });
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.path.length, 0);
  e.togglePause(s);
  advance(s, 1);
  assert.equal(s.elapsed.toFixed(1), "1.0");
});
test("signal requires proximity and cooldown, bonus affection can only be earned once", () => {
  const s = createGame();
  s.phase = "playing";
  signal(s);
  assert.equal(s.muted, 0);
  walk(s, "partner");
  signal(s);
  assert.equal(s.muted, 7);
  advance(s, 2);
  signal(s);
  assert.ok(s.muted < 6);
  hold(s);
  assert.equal(s.love, 25);
  hold(s, 2);
  assert.equal(s.love, 25);
});
test("progression unlocks nights and equipment, keeps personal bests and validates storage", () => {
  let save = e.freshSave();
  for (let i = 0; i < 5; i++) {
    const s = solve(i);
    save = e.record(save, s);
    assert.equal(save.unlocked, i + 1);
    assert.ok(save.best[i] > 0);
  }
  assert.equal(createGame(5, 42, save.unlocked).slippers, true);
  assert.equal(createGame(5, 42, save.unlocked).seal, true);
  assert.deepEqual(e.parseSave(JSON.stringify(save)), save);
  for (const raw of [
    "{",
    "{}",
    "null",
    JSON.stringify({ ...save, best: [0] }),
    JSON.stringify({ ...save, unlocked: 99 }),
  ])
    assert.deepEqual(e.parseSave(raw), e.freshSave());
});
test("seeded encore repeats exactly and different seeds change the challenge", () => {
  assert.deepEqual(solve(5, 79), solve(5, 79));
  assert.notDeepEqual(createGame(5, 1), createGame(5, 12));
});
test("foreground large steps match fine simulation, sprint route reaches target without oscillation", () => {
  const a = createGame();
  a.phase = "playing";
  const b = structuredClone(a);
  advance(a, 4);
  for (let i = 0; i < 80; i++) advance(b, 0.05);
  assert.ok(Math.abs(a.elapsed - b.elapsed) < 0.00001);
  travel(a, "shelf");
  for (let i = 0; i < 100; i++)
    advance(a, 0.05, { ...emptyInput(), sprint: true });
  assert.ok(e.distance(a.player, SPOTS.shelf) < 5);
});
