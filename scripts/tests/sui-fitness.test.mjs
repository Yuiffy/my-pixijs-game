import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";
import { playFitnessCampaign, fitnessUpgrade } from "./helpers/fitness-pilot.mjs";

const engine = await loadTypescriptModule("src/components/suiFitness/engine.ts");
const { createFitness, startFitness, stepFitness, advanceFitness, pauseFitness,
  chooseUpgrade, refreshBody, DAY_SECONDS, DAYS, TARGET_WEIGHT, TARGET_MUSCLE,
  TARGET_BODY_FAT, OVERLOAD_WEIGHT, MIN_MUSCLE, workoutCost } = engine;
const playing = (seed = 1, talent = "strength") => {
  const s = createFitness(seed, talent); startFitness(s); return s;
};
const isolated = (talent = "strength") => {
  const s = playing(41, talent);
  s.spawnTimer = 10000; s.proteinTimer = 10000; s.pickups = [];
  return s;
};
const atZone = (kind, talent = "strength") => {
  const s = isolated(talent);
  const zone = s.zones.find(z => z.kind === kind);
  s.player = { x: zone.x, y: zone.y };
  return s;
};
const foodAt = (s, extra = {}) => ({
  id: s.nextId++, kind: "dq", x: s.player.x + 100, y: s.player.y,
  radius: 25, hp: 50, maxHp: 50, age: 0, charge: 3, telegraph: 0,
  rush: 0, vx: 0, vy: 0, ...extra,
});
function run(s, seconds, input = { x: 0, y: 0 }) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    if (s.phase === "upgrade") chooseUpgrade(s, fitnessUpgrade(s));
    stepFitness(s, 1 / 60, input);
  }
}

test("48.00kg and 35% fat are consistent; three talents start with distinct weapons", () => {
  for (const [talent, weapon] of [["strength", "dumbbell"], ["swimmer", "water"], ["rhythm", "rope"]]) {
    const s = createFitness(41, talent);
    assert.equal(s.weight, 48); assert.equal(s.bodyFat, 35);
    assert.ok(Math.abs(s.weight - s.fatMass - s.leanMass) < 1e-9);
    assert.deepEqual(Object.entries(s.weapons).filter(([,n]) => n > 0), [[weapon, 1]]);
    assert.equal(s.level, 1); assert.equal(s.totalXp, 0);
    assert.deepEqual(s, createFitness(41, talent));
  }
  assert.deepEqual(createFitness(NaN), createFitness(10203));
  assert.equal(createFitness(1, "toString").talent, "strength");
});

test("waiting burns no fat and earns no experience; movement loses grams gradually", () => {
  const wait = isolated(), moving = isolated();
  run(wait, 30); run(moving, 30, { x: 1, y: 0 });
  assert.equal(wait.fatMass, 16.8); assert.equal(wait.totalXp, 0); assert.equal(wait.level, 1);
  assert.ok(moving.weight > 47.7 && moving.weight < 48);
  assert.ok(moving.fatMass < wait.fatMass);
});

test("training stores gradual fat loss and grants a level during the first wave", () => {
  const s = atZone("swim", "swimmer");
  advanceFitness(s, 2000, { x: 0, y: 0, exercise: true });
  assert.equal(s.workouts.swim, 1);
  assert.equal(s.phase, "upgrade"); assert.equal(s.level, 2); assert.equal(s.day, 1);
  assert.ok(s.elapsed < 3, "action grants an upgrade before a timed wave break");
  assert.ok(s.burnReserve > 0.4);
  assert.ok(s.weight > 47.97, "completing a workout cannot drop kilograms instantly");
  const fat = s.fatMass;
  chooseUpgrade(s, s.choices[0]); run(s, 4);
  assert.ok(s.fatMass < fat - 0.1 && s.fatMass > fat - 0.2);
});

test("gym/home preserve more muscle; swimming adds more reserve, each with its own buff", () => {
  const states = ["gym", "swim", "home"].map(kind => atZone(kind));
  for (const s of states) run(s, 2, { x: 0, y: 0, exercise: true });
  const [gym, swim, home] = states;
  assert.ok(gym.muscle > home.muscle && home.muscle > swim.muscle);
  assert.ok(swim.burnReserve > home.burnReserve && home.burnReserve > gym.burnReserve);
  assert.ok(gym.buffs.attack > 20 && swim.buffs.speed > 15 && home.buffs.guard > 15);
  assert.ok(gym.totalXp > home.totalXp, "strength talent specifically rewards gym effort");
});

test("training actually accelerates levels and improves composition versus waiting", () => {
  const train = atZone("gym"), wait = atZone("gym");
  run(train, 60, { x: 0, y: 0, exercise: true }); run(wait, 60);
  assert.ok(train.level >= 3 && wait.level === 1);
  assert.ok(train.totalXp >= 45 && wait.totalXp === 0);
  assert.ok(train.muscle > wait.muscle + 5);
  assert.ok(train.fatMass < wait.fatMass - 0.8);
});

test("rhythm talent rewards alternating stations and swimmer rewards swimming reserve", () => {
  const regular = atZone("swim"), swimmer = atZone("swim", "swimmer");
  run(regular, 2, { x: 0, y: 0, exercise: true });
  run(swimmer, 2, { x: 0, y: 0, exercise: true });
  assert.ok(swimmer.burnReserve > regular.burnReserve * 1.25);
  const rhythm = atZone("home", "rhythm");
  rhythm.lastWorkout = "swim";
  run(rhythm, 2, { x: 0, y: 0, exercise: true });
  assert.ok(rhythm.totalXp > 17); assert.ok(rhythm.burnReserve > 0.37);
  assert.ok(rhythm.buffs.guard > 20);
});

test("training needs full motivation, is interrupted by movement/contact, and spends no resources outside", () => {
  const low = atZone("gym"); low.motivation = 10;
  run(low, 2, { x: 0, y: 0, exercise: true });
  assert.equal(low.workouts.gym, 0); assert.ok(low.motivation > 10);
  const s = atZone("home");
  run(s, 1, { x: 0, y: 0, exercise: true }); assert.ok(s.exercise.progress > 0.49);
  stepFitness(s, 1 / 60, { x: 1, y: 0, exercise: true }); assert.equal(s.exercise, null);
  s.weapons.dumbbell = 0; s.foods = [foodAt(s, { x: s.player.x, y: s.player.y })];
  stepFitness(s, 1 / 60, { x: 0, y: 0, exercise: true });
  assert.equal(s.exercise, null); assert.equal(s.workouts.home, 0);
  const outside = isolated(); run(outside, 2, { x: 0, y: 0, exercise: true });
  assert.equal(outside.exercise, null); assert.ok(outside.motivation > 40);
});

test("star pickups reward experience and motivation; protein restores muscle without destroying fat", () => {
  const star = isolated();
  star.pickups.push({ id: 99, kind: "motivation", ...star.player, life: 10 });
  stepFitness(star, 1 / 60);
  assert.equal(star.totalXp, 5); assert.ok(star.motivation > 48);
  const protein = isolated(); protein.muscle = 50; refreshBody(protein);
  const previous = protein.weight;
  protein.pickups.push({ id: 100, kind: "protein", ...protein.player, life: 10 });
  stepFitness(protein, 1 / 60);
  assert.equal(protein.fatMass, 16.8); assert.ok(protein.muscle > 52);
  assert.ok(protein.weight > previous, "lean mass is part of weight");
});

test("pause and level selection freeze the entire simulation, and picking preserves the current wave", () => {
  const s = atZone("gym"); run(s, 2, { x: 0, y: 0, exercise: true });
  assert.equal(s.phase, "upgrade"); const before = structuredClone(s);
  advanceFitness(s, 5000, { x: 1, y: 0 }); assert.deepEqual(s, before);
  chooseUpgrade(s, "not-offered"); assert.deepEqual(s, before);
  chooseUpgrade(s, s.choices[0]);
  assert.equal(s.time, before.time); assert.equal(s.day, before.day);
  pauseFitness(s); const paused = structuredClone(s);
  advanceFitness(s, 5000, { x: 1, y: 0, exercise: true }); assert.deepEqual(s, paused);
  startFitness(s); stepFitness(s, 1 / 60); assert.ok(s.time > before.time);
});

test("all offers respect three weapon slots, repeatable ranks and weapon caps", () => {
  const s = isolated();
  for (let n = 0; n < 50; n++) {
    s.xp = s.nextXp; stepFitness(s, 1 / 60);
    if (s.phase !== "upgrade") break;
    const slots = Object.values(s.weapons).filter(rank => rank > 0).length;
    for (const id of s.choices) {
      const def = engine.UPGRADE_DEFS.find(value => value.id === id);
      if (def.weapon) {
        assert.ok(s.weapons[def.weapon] < 4);
        assert.ok(s.weapons[def.weapon] || slots < 3);
      } else assert.ok(engine.upgradeRank(s, id) < def.max);
    }
    if (Object.values(s.weapons).some(rank => rank < 4 && rank > 0) || slots < 3) {
      assert.ok(s.choices.some(id => id.startsWith("weapon_")));
    }
    chooseUpgrade(s, fitnessUpgrade(s));
  }
  assert.ok(Object.values(s.weapons).filter(rank => rank > 0).length <= 3);
  assert.ok(Object.values(s.weapons).every(rank => rank <= 4));
  assert.ok(workoutCost(s) >= 16);
});

test("dumbbell sweeps several front targets and leaves the opposite direction untouched", () => {
  const s = isolated();
  s.foods = [foodAt(s), foodAt(s, { y: s.player.y + 25 }), foodAt(s, { x: s.player.x - 100 })];
  stepFitness(s, 1 / 60);
  assert.ok(s.foods[0].hp < 50 && s.foods[1].hp < 50);
  assert.equal(s.foods[2].hp, 50); assert.ok(s.attackFlash > 0);
});

test("water travels to distant targets and rank three pierces without re-hitting a target", () => {
  const s = isolated("swimmer"); s.weapons.water = 3;
  s.foods = [foodAt(s, { x: 820 }), foodAt(s, { x: 920 })];
  stepFitness(s, 1 / 60); assert.equal(s.projectiles.length, 2);
  assert.equal(s.foods[0].hp, 50, "ranged damage waits for projectile arrival");
  run(s, 0.9);
  assert.ok(s.foods[0].hp < 50 && s.foods[1].hp < 50);
  assert.ok(s.projectiles.every(p => new Set(p.hitIds).size === p.hitIds.length));
  assert.ok(s.weaponDamage.water > 6);
});

test("rope damages around the player over time, while aura knocks several directions back", () => {
  const rope = isolated("rhythm");
  rope.foods = [foodAt(rope, { x: rope.player.x + 74 }), foodAt(rope, { x: rope.player.x - 74 })];
  run(rope, 0.35);
  assert.ok(rope.weaponDamage.rope > 2);
  const aura = isolated(); aura.weapons.dumbbell = 0; aura.weapons.aura = 1;
  aura.foods = [foodAt(aura, { x: aura.player.x + 80 }), foodAt(aura, { x: aura.player.x - 80 })];
  stepFitness(aura, 1 / 60);
  assert.ok(aura.foods.every(f => f.hp < 50));
  assert.ok(aura.foods[0].x > aura.player.x + 100);
  assert.ok(aura.foods[1].x < aura.player.x - 100);
  assert.ok(aura.effects.some(e => e.kind === "aura"));
});

test("food contacts add distinct fat burdens and grace prevents double contact", () => {
  for (const [kind, burden] of [["dq", 0.14], ["jerky", 0.07], ["tea", 0.1]]) {
    const s = isolated(); s.weapons.dumbbell = 0;
    s.foods = [foodAt(s, { kind, x: s.player.x }), foodAt(s, { x: s.player.x })];
    stepFitness(s, 1 / 60);
    assert.ok(Math.abs(s.fatMass - 16.8 - burden) < 1e-9);
    assert.ok(s.bodyFat > 35); assert.equal(s.foods.length, 1);
    const fat = s.fatMass; stepFitness(s, 1 / 60); assert.equal(s.fatMass, fat);
  }
});

test("tea locks a telegraphed direction, jerky bursts and seeded waves differ", () => {
  const s = isolated(); s.weapons.dumbbell = 0;
  s.foods = [foodAt(s, { kind: "tea", x: 750, charge: 0.001 })];
  stepFitness(s, 1 / 60); const tea = s.foods[0], vx = tea.vx;
  assert.ok(tea.telegraph > 0); assert.equal(tea.rush, 0);
  run(s, 0.7, { x: 0, y: 1 }); assert.ok(tea.rush > 0); assert.equal(tea.vx, vx);
  const a = playing(1984), b = playing(1985);
  run(a, 5, { x: 0, y: 1 }); run(b, 5, { x: 0, y: 1 });
  assert.notDeepEqual(a.foods, b.foods);
});

test("40kg alone fails at high fat or low muscle, and near misses are never rounded into wins", () => {
  const highFat = isolated(); highFat.muscle = 60; refreshBody(highFat);
  highFat.fatMass = 40 - highFat.leanMass; refreshBody(highFat);
  assert.ok(highFat.bodyFat > TARGET_BODY_FAT);
  stepFitness(highFat, 1 / 60); assert.equal(highFat.phase, "playing");
  const lowMuscle = isolated(); lowMuscle.muscle = 50; lowMuscle.fatMass = 8.5; refreshBody(lowMuscle);
  stepFitness(lowMuscle, 1 / 60); assert.equal(lowMuscle.phase, "playing");
  const near = isolated(); near.fatMass = 8.804; refreshBody(near);
  stepFitness(near, 1 / 60); assert.ok(near.weight > 40); assert.equal(near.phase, "playing");
  const goal = isolated(); goal.fatMass = 8.79; refreshBody(goal);
  stepFitness(goal, 1 / 60); assert.equal(goal.phase, "won");
  assert.ok(goal.day < DAYS && goal.elapsed < DAY_SECONDS, "goals can end a campaign early");
});

test("overload, depleted muscle and the five-stage deadline produce explicit losses", () => {
  const overload = isolated(); overload.fatMass = OVERLOAD_WEIGHT - overload.leanMass;
  stepFitness(overload, 1 / 60); assert.equal(overload.phase, "lost");
  const depleted = isolated(); depleted.muscle = MIN_MUSCLE;
  stepFitness(depleted, 1 / 60); assert.equal(depleted.phase, "lost");
  const deadline = isolated(); deadline.day = DAYS; deadline.time = DAY_SECONDS - 1 / 60;
  stepFitness(deadline, 1 / 60); assert.equal(deadline.phase, "lost");
  assert.match(deadline.resultReason, /40.00/);
});

test("directional movement stays normalized, malformed time/input is ignored, dash is edge-triggered", () => {
  const a = isolated(), b = isolated(), start = { ...a.player };
  run(a, 1, { x: 1, y: 0 }); run(b, 1, { x: 1, y: 1 });
  assert.ok(Math.abs(Math.hypot(b.player.x - start.x, b.player.y - start.y) - (a.player.x - start.x)) < 0.001);
  const before = structuredClone(a); stepFitness(a, NaN); stepFitness(a, -1); assert.deepEqual(a, before);
  stepFitness(a, 1 / 60, { x: NaN, y: Infinity }); assert.deepEqual(a.player, before.player);
  const dash = isolated(); run(dash, 5, { x: 1, y: 0, dash: true }); assert.equal(dash.dashCooldown, 0);
  assert.ok(dash.stamina === 100, "holding dash never repeatedly activates it");
});

test("63 normal-input campaigns across three talents win slowly, with mixed attacks and early completion", () => {
  for (const talent of ["strength", "swimmer", "rhythm"]) {
    for (const seed of [20261003, ...Array.from({length:20}, (_,i) => i + 1)]) {
      const {state:s,trace} = playFitnessCampaign(engine, seed, talent);
      assert.equal(s.phase, "won", JSON.stringify({talent,seed,weight:s.weight,muscle:s.muscle,reason:s.resultReason}));
      assert.ok(s.weight <= TARGET_WEIGHT + 1e-9 && s.muscle >= TARGET_MUSCLE && s.bodyFat <= TARGET_BODY_FAT);
      assert.ok(s.elapsed > 150 && s.elapsed < DAYS * DAY_SECONDS);
      assert.ok(s.level > 10); assert.ok(Object.values(s.weapons).filter(n => n > 0).length >= 2);
      assert.ok(Object.values(s.workouts).reduce((a,b)=>a+b,0) >= 20);
      assert.ok(trace[1].weight > 44, "the target cannot be reached during the first minute");
    }
  }
});

test("the same seed without training cannot meet the goal and grows slower than an active route", () => {
  const active = playFitnessCampaign(engine, 41, "strength").state;
  const passive = playFitnessCampaign(engine, 41, "strength", "no-training").state;
  const idle = playFitnessCampaign(engine, 41, "strength", "idle").state;
  assert.equal(active.phase, "won"); assert.equal(passive.phase, "lost"); assert.equal(idle.phase, "lost");
  assert.ok(passive.weight > active.weight + 5);
  const activeAtTwoMinutes = playFitnessCampaign(engine, 41, "strength", "active", 120).state;
  const noTrainingAtTwoMinutes = playFitnessCampaign(engine, 41, "strength", "no-training", 120).state;
  assert.ok(activeAtTwoMinutes.totalXp > noTrainingAtTwoMinutes.totalXp);
  assert.ok(activeAtTwoMinutes.level > noTrainingAtTwoMinutes.level);
  assert.deepEqual(passive.workouts, { gym: 0, swim: 0, home: 0 });
});
