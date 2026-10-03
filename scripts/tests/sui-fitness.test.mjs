import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const {
  createFitness, startFitness, stepFitness, advanceFitness, pauseFitness,
  chooseUpgrade, DAY_SECONDS, DAYS, OVERLOAD_WEIGHT, MIN_MUSCLE, TARGET_WEIGHT, TARGET_MUSCLE,
} = await loadTypescriptModule("src/components/suiFitness/engine.ts");
const playing = (seed = 1) => { const s = createFitness(seed); startFitness(s); return s; };
const atZone = (kind) => {
  const s = playing();
  const zone = s.zones.find((item) => item.kind === kind);
  s.player = { x: zone.x, y: zone.y };
  s.spawnTimer = 100;
  return s;
};
const foodAt = (s, kind, extra = {}) => ({
  id: s.nextId++, kind, x: s.player.x, y: s.player.y, radius: 20,
  hp: 3, maxHp: 3, age: 0, charge: 3, telegraph: 0, rush: 0, vx: 0, vy: 0,
  ...extra,
});

test("seeded worlds and enemy waves reproduce, while different seeds change waves", () => {
  assert.deepEqual(createFitness(1984), createFitness(1984));
  const a = playing(1984), b = playing(1984), c = playing(1985);
  for (const s of [a, b, c]) advanceFitness(s, 5000, { x: 1, y: 0 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.foods, c.foods);
  assert.deepEqual(createFitness(Number.NaN), createFitness(10203));
});

test("diagonal and malformed movement cannot bypass speed or world bounds", () => {
  const a = playing(), b = playing();
  const start = { ...a.player };
  advanceFitness(a, 1000, { x: 1, y: 0 });
  advanceFitness(b, 1000, { x: 1, y: 1 });
  assert.ok(Math.abs(Math.hypot(b.player.x - start.x, b.player.y - start.y) - (a.player.x - start.x)) < 0.001);
  advanceFitness(a, 3000, { x: 1e100, y: 0 });
  assert.equal(a.player.x, 1065);
  const position = { ...a.player };
  advanceFitness(a, 100, { x: Number.NaN, y: Number.POSITIVE_INFINITY });
  assert.deepEqual(a.player, position);
});

test("each food collision applies its own burden, grants grace, and consumes only the hit food", () => {
  for (const [kind, burden] of [["dq", 0.6], ["jerky", 0.32], ["tea", 0.42]]) {
    const s = playing(); s.attackCooldown = 1;
    s.foods = [foodAt(s, kind), foodAt(s, "dq")];
    stepFitness(s, 1 / 60, { x: 0, y: 0 });
    assert.ok(Math.abs(s.weight - (62 + burden - 0.026 / 60)) < 1e-8);
    assert.equal(s.foods.length, 1);
    assert.ok(s.invincible > 0);
    const weight = s.weight;
    stepFitness(s, 1 / 60, { x: 0, y: 0 });
    assert.ok(s.weight < weight, "contact grace prevents a second immediate hit");
  }
});

test("DQ tanks several attacks, jerky bursts, and tea forecasts a locked direction before rushing", () => {
  const s = playing(); s.spawnTimer = 100;
  s.foods = [foodAt(s, "dq", { x: s.player.x + 118 })];
  stepFitness(s, 1 / 60);
  assert.equal(s.foods[0].hp, 2); assert.ok(s.attackFlash > 0);
  const tea = foodAt(s, "tea", { x: 750, charge: 0.001 });
  s.foods = [tea]; s.attackCooldown = 10;
  stepFitness(s, 1 / 60);
  assert.ok(tea.telegraph > 0); assert.equal(tea.rush, 0);
  const originalVx = tea.vx;
  advanceFitness(s, 700, { x: 0, y: 1 });
  assert.ok(tea.rush > 0); assert.equal(tea.vx, originalVx, "rush direction stays dodgeable");
  const a = playing(), b = playing(); a.attackCooldown = 10; b.attackCooldown = 10;
  a.foods = [foodAt(a, "jerky", { x: 800, age: 0 })];
  b.foods = [foodAt(b, "jerky", { x: 800, age: 2 })];
  stepFitness(a, 1 / 60); stepFitness(b, 1 / 60);
  assert.ok(800 - b.foods[0].x > (800 - a.foods[0].x) * 1.7);
});

test("two-second held workouts spend motivation and provide distinct muscle, weight, and combat benefits", () => {
  const gym = atZone("gym"), swim = atZone("swim"), home = atZone("home");
  for (const s of [gym, swim, home]) advanceFitness(s, 2000, { x: 0, y: 0, exercise: true });
  assert.equal(gym.workouts.gym, 1); assert.equal(swim.workouts.swim, 1); assert.equal(home.workouts.home, 1);
  assert.ok(gym.muscle > home.muscle && home.muscle > swim.muscle);
  assert.ok(swim.weight < home.weight && home.weight < gym.weight);
  assert.ok(gym.buffs.attack > 15); assert.ok(swim.buffs.speed > 13); assert.ok(home.buffs.guard > 15);
  assert.ok(Math.abs(gym.motivation - 18.2) < 0.001);
  const outside = playing(); advanceFitness(outside, 2000, { x: 0, y: 0, exercise: true });
  assert.equal(outside.exercise, null); assert.equal(outside.workouts.gym, 0);
  assert.ok(outside.motivation > 40, "holding outside a zone never spends motivation");
});

test("leaving, moving, low motivation, and getting hit interrupt training without granting a workout", () => {
  const s = atZone("gym"); advanceFitness(s, 1000, { x: 0, y: 0, exercise: true });
  assert.ok(s.exercise.progress > 0.49);
  stepFitness(s, 1 / 60, { x: 1, y: 0, exercise: true }); assert.equal(s.exercise, null);
  const low = atZone("home"); low.motivation = 1;
  advanceFitness(low, 2000, { x: 0, y: 0, exercise: true }); assert.equal(low.workouts.home, 0);
  assert.equal(low.exercise, null); assert.ok(Math.abs(low.motivation - 3.2) < 0.001, "insufficient starting motivation is not spent");
  const hit = atZone("gym"); advanceFitness(hit, 1000, { x: 0, y: 0, exercise: true });
  hit.attackCooldown = 10; hit.foods = [foodAt(hit, "dq")];
  stepFitness(hit, 1 / 60, { x: 0, y: 0, exercise: true });
  assert.equal(hit.exercise, null); assert.equal(hit.workouts.gym, 0);
});

test("held training waits for a full workout cost and never wastes motivation on an unaffordable restart", () => {
  const s = atZone("gym");
  advanceFitness(s, 5000, { x: 0, y: 0, exercise: true });
  assert.equal(s.workouts.gym, 1); assert.equal(s.exercise, null);
  assert.ok(Math.abs(s.motivation - 21.5) < 0.001, "only the completed 24-point workout was spent");
  assert.match(s.message, /动力不足：需要 24/);
  const focus = atZone("home"); focus.upgrades = ["focus"]; focus.motivation = 17.9; focus.messageTime = 0;
  stepFitness(focus, 1 / 60, { x: 0, y: 0, exercise: true });
  assert.equal(focus.exercise, null); assert.match(focus.message, /动力不足：需要 18/);
  focus.motivation = 18;
  advanceFitness(focus, 2000, { x: 0, y: 0, exercise: true });
  assert.equal(focus.workouts.home, 1, "an exactly funded focus workout starts and completes despite its declining resource");
  assert.ok(Math.abs(focus.motivation - 2.2) < 0.001);
});

test("dash is edge-triggered, consumes stamina, and protects against touching food", () => {
  const s = playing(); s.attackCooldown = 10; s.foods = [foodAt(s, "dq")];
  stepFitness(s, 1 / 60, { x: 1, y: 0, dash: true });
  assert.ok(s.stamina < 71); assert.ok(s.dashCooldown > 2); assert.ok(s.invincible > 0);
  assert.ok(s.weight < 62); assert.equal(s.foods.length, 1);
  s.foods = [];
  advanceFitness(s, 3000, { x: 1, y: 0, dash: true });
  assert.equal(s.dashCooldown, 0); assert.equal(s.dashTime, 0, "holding does not automatically dash again");
  stepFitness(s, 1 / 60, { x: -1, y: 0 });
  stepFitness(s, 1 / 60, { x: -1, y: 0, dash: true });
  assert.ok(s.dashCooldown > 2);
});

test("decision pulse spends exactly 25 motivation, defeats nearby foods, and cannot repeat while held", () => {
  const s = playing(); s.spawnTimer = 100;
  s.foods = [foodAt(s, "dq", { x: s.player.x + 80 }), foodAt(s, "tea", { x: s.player.x - 100 })];
  stepFitness(s, 1 / 60, { x: 0, y: 0, pulse: true });
  assert.equal(s.defeats, 2); assert.equal(s.foods.length, 0);
  assert.ok(Math.abs(s.motivation - (15 + 1.1 / 60)) < 0.001);
  advanceFitness(s, 5500, { x: 0, y: 0, pulse: true });
  assert.equal(s.pulseCooldown, 0);
  assert.ok(s.motivation > 20);
});

test("defeating food produces collectible motivation; protein restores muscle and pickup life is bounded", () => {
  const s = playing(); s.spawnTimer = 100;
  s.foods = [foodAt(s, "jerky", { x: s.player.x + 100, hp: 1 })];
  stepFitness(s, 1 / 60); assert.equal(s.defeats, 1);
  const motivation = s.motivation;
  advanceFitness(s, 350, { x: 1, y: 0 }); assert.ok(s.motivation > motivation + 7);
  const muscle = s.muscle;
  s.pickups.push({ id: s.nextId++, kind: "protein", ...s.player, life: 10 });
  stepFitness(s, 1 / 60); assert.ok(s.muscle > muscle + 2.9);
  s.pickups = [{ id: 999, kind: "motivation", x: 40, y: 40, life: 0.01 }];
  stepFitness(s, 1 / 60); assert.equal(s.pickups.length, 0);
});

test("pause freezes all rules and timers; resume and terminal phases cannot skip upgrade choices", () => {
  const s = atZone("gym"); advanceFitness(s, 500, { x: 0, y: 0, exercise: true }); pauseFitness(s);
  const snapshot = structuredClone(s); advanceFitness(s, 3000, { x: 1, y: 1, pulse: true });
  assert.deepEqual(s, snapshot);
  startFitness(s); assert.equal(s.phase, "playing"); stepFitness(s, 1 / 60); assert.ok(s.time > snapshot.time);
  s.time = DAY_SECONDS - 0.01; stepFitness(s, 1 / 60);
  assert.equal(s.phase, "upgrade"); assert.equal(s.choices.length, 3); assert.equal(new Set(s.choices).size, 3);
  const intermission = structuredClone(s); startFitness(s); advanceFitness(s, 10000); chooseUpgrade(s, "not-a-choice");
  assert.deepEqual(s, intermission);
  const id = s.choices[0]; chooseUpgrade(s, id); assert.equal(s.day, 2); assert.equal(s.phase, "playing");
  assert.deepEqual(s.upgrades, [id]); assert.equal(s.time, 0); assert.equal(s.foods.length, 0);
  const once = structuredClone(s); chooseUpgrade(s, id); assert.deepEqual(s, once);
});

test("selected upgrades change actual movement, combat, workout economics, and collision rules", () => {
  const a = playing(), b = playing(); b.upgrades = ["shoes", "strong", "reach"];
  advanceFitness(a, 1000, { x: 1, y: 0 }); advanceFitness(b, 1000, { x: 1, y: 0 });
  assert.ok(b.player.x > a.player.x + 30);
  b.foods = [foodAt(b, "dq", { x: b.player.x - 140 })]; stepFitness(b, 1 / 60);
  assert.equal(b.foods[0].hp, 1); assert.equal(b.attackRange, 128);
  const base = atZone("home"), focus = atZone("home"); focus.upgrades = ["focus"];
  advanceFitness(base, 2000, { x: 0, y: 0, exercise: true }); advanceFitness(focus, 2000, { x: 0, y: 0, exercise: true });
  assert.ok(focus.motivation > base.motivation + 5.9);
  const guard = playing(); guard.upgrades = ["guard"]; guard.attackCooldown = 10; guard.foods = [foodAt(guard, "dq")];
  stepFitness(guard, 1 / 60); assert.ok(guard.weight < 62.42);
});

test("support upgrades change pickup reach, protein recovery, dash cooldown, and stamina recovery", () => {
  const a = playing(), b = playing(); b.upgrades = ["magnet", "protein", "breath"];
  for (const s of [a, b]) {
    s.pickups = [{ id: s.nextId++, kind: "protein", x: s.player.x + 90, y: s.player.y, life: 10 }];
    stepFitness(s, 1 / 60, { x: 0, y: 0, dash: true });
  }
  assert.equal(a.pickups.length, 1); assert.equal(b.pickups.length, 0);
  assert.ok(b.muscle > a.muscle + 5.9);
  assert.ok(b.dashCooldown < a.dashCooldown - 0.69);
  advanceFitness(a, 1000); advanceFitness(b, 1000);
  assert.ok(b.stamina > a.stamina + 7.9);
});

test("overload and depleted muscle lose at the exact boundary, and all terminal results freeze", () => {
  for (const [field, value] of [["weight", OVERLOAD_WEIGHT], ["muscle", MIN_MUSCLE]]) {
    const s = playing(); s[field] = value; stepFitness(s, 1 / 60);
    assert.equal(s.phase, "lost"); assert.ok(s.resultReason.length > 10);
    const snapshot = structuredClone(s); advanceFitness(s, 10000, { x: 1, y: 1, exercise: true });
    assert.deepEqual(s, snapshot);
  }
  const s = playing(); s.muscle = MIN_MUSCLE + 0.001;
  stepFitness(s, 1 / 60); assert.equal(s.phase, "lost", "baseline muscle loss must be addressed");
});

test("standing idle through the campaign is a losing strategy rather than a free win", () => {
  for (const seed of [1, 3, 41, 7919]) {
    const s = playing(seed);
    for (let day = 0; day < DAYS && s.phase !== "lost"; day++) {
      advanceFitness(s, DAY_SECONDS * 1000);
      if (s.phase === "upgrade") chooseUpgrade(s, s.choices[0]);
    }
    assert.equal(s.phase, "lost");
    assert.equal(Object.values(s.workouts).reduce((sum, count) => sum + count, 0), 0);
  }
});

test("finishing day five requires both weight and muscle targets, with inclusive goal boundaries", () => {
  const finish = (weight, muscle) => {
    const s = playing();
    s.day = DAYS; s.time = DAY_SECONDS - 1 / 60; s.spawnTimer = 100; s.pickups = [];
    s.weight = weight + 0.026 / 60; s.muscle = muscle + 0.34 / 60;
    s.score = 700; s.workouts = { gym: 2, swim: 3, home: 4 };
    stepFitness(s, 1 / 60);
    return s;
  };
  const boundary = finish(TARGET_WEIGHT, TARGET_MUSCLE);
  assert.equal(boundary.phase, "won", "exactly 62 kg and 55 muscle meet both goals");
  assert.ok(boundary.score > 950);
  for (const [weight, muscle, reason] of [
    [TARGET_WEIGHT + 0.01, TARGET_MUSCLE, "体重仍高于"],
    [TARGET_WEIGHT, TARGET_MUSCLE - 0.01, "肌肉储备"],
    [70, 21, "体重和肌肉"],
  ]) {
    const s = finish(weight, muscle);
    assert.equal(s.phase, "lost"); assert.match(s.resultReason, /五天坚持完成，但/);
    assert.ok(s.resultReason.includes(reason)); assert.ok(s.resultReason.includes("下次"));
    assert.equal(s.score, 950, "completed days and workouts retain their earned score");
    assert.deepEqual(s.workouts, { gym: 2, swim: 3, home: 4 });
    const snapshot = structuredClone(s); advanceFitness(s, 1000); assert.deepEqual(s, snapshot);
  }
  const snapshot = structuredClone(boundary); advanceFitness(boundary, 1000); assert.deepEqual(boundary, snapshot);
});

// A normal-input route: no teleports, state edits, resource grants, or accelerated campaign timer.
function runCampaign(seed) {
  const s = playing(seed);
  const waypoints = [{ x: 215, y: 200 }, { x: 885, y: 210 }, { x: 550, y: 540 }];
  let waypoint = 0, trainingTarget = null, pulses = 0, dashes = 0;
  let previousWorkoutCount = 0;
  for (let frame = 0; frame < DAYS * DAY_SECONDS * 60 + 1000; frame++) {
    if (s.phase === "upgrade") {
      const priority = ["strong", "reach", "focus", "shoes", "magnet", "guard", "breath", "protein"];
      chooseUpgrade(s, priority.find((id) => s.choices.includes(id)));
      trainingTarget = null;
    }
    if (s.phase !== "playing") break;
    const workoutCount = Object.values(s.workouts).reduce((sum, count) => sum + count, 0);
    if (workoutCount > previousWorkoutCount) { trainingTarget = null; waypoint = (waypoint + 1) % waypoints.length; }
    if (trainingTarget && !s.exercise && s.motivation < 23) { trainingTarget = null; waypoint = (waypoint + 1) % waypoints.length; }
    previousWorkoutCount = workoutCount;
    if (!trainingTarget && s.motivation >= 27) {
      const kind = s.workouts.gym === 0 ? "gym" : s.workouts.swim === 0 ? "swim" : s.workouts.home === 0 ? "home" : s.muscle < 62 ? "gym" : s.weight > 60 ? "swim" : "home";
      trainingTarget = s.zones.find((zone) => zone.kind === kind);
    }
    let target = trainingTarget || waypoints[waypoint];
    if (!trainingTarget && s.motivation < 27) {
      const nearby = s.pickups.filter((item) => item.kind === "motivation" && Math.hypot(item.x - s.player.x, item.y - s.player.y) < 260);
      nearby.sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y));
      if (nearby[0]) target = nearby[0];
    }
    if (!trainingTarget && Math.hypot(s.player.x - target.x, s.player.y - target.y) < 35) {
      waypoint = (waypoint + 1) % waypoints.length;
      target = waypoints[waypoint];
    }
    const dx = target.x - s.player.x, dy = target.y - s.player.y, away = Math.hypot(dx, dy);
    const exercise = Boolean(trainingTarget && away < 30 && s.motivation > 0.5);
    const enemies = s.foods.filter((food) => Math.hypot(food.x - s.player.x, food.y - s.player.y) < 120);
    const pulse = enemies.length >= 3 && s.motivation > 48 && s.pulseCooldown === 0 && frame % 2 === 0;
    const dash = !exercise && enemies.length >= 2 && s.dashCooldown === 0 && s.stamina >= 30 && frame % 2 === 0;
    if (pulse) pulses++; if (dash) dashes++;
    stepFitness(s, 1 / 60, { x: exercise || away < 8 ? 0 : dx / away, y: exercise || away < 8 ? 0 : dy / away, exercise, pulse, dash });
  }
  return { state: s, pulses, dashes };
}

test("full five-day campaigns are achievable with ordinary inputs across 51 varied seeds", () => {
  const seeds = [...Array.from({ length: 24 }, (_, index) => (index + 1) * 7919), ...Array.from({ length: 24 }, (_, index) => index + 1), 41, 10203, 20261003];
  for (const seed of seeds) {
    const { state: s } = runCampaign(seed);
    assert.equal(s.phase, "won", `seed ${seed}: day ${s.day}, weight ${s.weight}, muscle ${s.muscle}, workouts ${JSON.stringify(s.workouts)}`);
    assert.equal(s.day, DAYS); assert.equal(s.upgrades.length, DAYS - 1);
    assert.ok(Math.abs(s.elapsed - DAYS * DAY_SECONDS) < 0.0001);
    assert.ok(s.weight <= TARGET_WEIGHT && s.muscle >= TARGET_MUSCLE);
    assert.ok(s.workouts.gym > 0 && s.workouts.swim > 0 && s.workouts.home > 0);
    assert.ok(s.defeats > 25 && s.score > 2000);
  }
});

export { runCampaign };
