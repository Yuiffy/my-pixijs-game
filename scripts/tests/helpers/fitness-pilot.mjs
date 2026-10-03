// Shared by rule campaigns and browser QA. Produces only normal movement/ability inputs.
// All decisions read public game state; no teleporting, stat changes or forced drops.
export function fitnessDecision(s, memo, mode = "active") {
  if (mode === "idle") return { x: 0, y: 0 };
  const cost = 24 - s.upgrades.filter(id => id === "focus").length * 4;
  const distance = p => Math.hypot(p.x - s.player.x, p.y - s.player.y);
  if (memo.goal && !s.exercise && s.motivation < cost) memo.goal = null;
  if (s.exercise) memo.goal = s.exercise.kind;
  if (!memo.goal && mode !== "no-training" && s.motivation >= cost + 1) {
    memo.goal = memo.forceKind ||
      (s.muscle < 67 ? "gym" : s.talent === "rhythm"
        ? (s.lastWorkout === "home" ? "swim" : "home")
        : s.talent === "swimmer" ? "swim" : "home");
  }
  let destination;
  let training = false;
  if (memo.goal) {
    destination = s.zones.find(z => z.kind === memo.goal);
    training = distance(destination) < 32;
  } else {
    const pickups = s.pickups.filter(p => p.kind === "motivation" || s.muscle < 75);
    pickups.sort((a, b) => distance(a) - distance(b));
    destination = pickups.find(p => distance(p) < 430);
    if (!destination) {
      const points = [{ x: 400, y: 420 }, { x: 730, y: 400 }, { x: 700, y: 550 }, { x: 390, y: 550 }];
      memo.waypoint ??= 0;
      destination = points[memo.waypoint];
      if (distance(destination) < 38) { memo.waypoint = (memo.waypoint + 1) % points.length; destination = points[memo.waypoint]; }
    }
  }
  const close = s.foods.filter(f => distance(f) < 95);
  const input = {
    x: training ? 0 : destination.x - s.player.x > 7 ? 1 : destination.x - s.player.x < -7 ? -1 : 0,
    y: training ? 0 : destination.y - s.player.y > 7 ? 1 : destination.y - s.player.y < -7 ? -1 : 0,
    exercise: training,
    dash: !training && close.length >= 2 && s.dashCooldown <= 0 && s.stamina >= 30,
    pulse: close.length >= 3 && s.pulseCooldown <= 0 && s.motivation >= cost + 28,
  };
  const total = Object.values(s.workouts).reduce((a, b) => a + b, 0);
  if (memo.completed !== total) { memo.completed = total; if (total > 0) memo.goal = null; }
  return input;
}

export function fitnessUpgrade(s) {
  const main = s.talent === "swimmer" ? "water" : s.talent === "rhythm" ? "rope" : "dumbbell";
  const slots = Object.values(s.weapons).filter(value => value > 0).length;
  const preference = [];
  if (!s.upgrades.includes("magnet")) preference.push("magnet");
  if (!s.upgrades.includes("metabolism")) preference.push("metabolism");
  if (slots < 3) preference.push("weapon_aura", "weapon_rope", "weapon_water", "weapon_dumbbell");
  if (s.weapons[main] < 3) preference.push(`weapon_${main}`);
  preference.push("focus", "metabolism", "magnet", "strong", `weapon_${main}`, "weapon_aura", "weapon_rope", "weapon_water", "weapon_dumbbell", "discipline", "guard", "protein", "shoes", "breath", "reach");
  return preference.find(id => s.choices.includes(id)) || s.choices[0];
}

export function playFitnessCampaign(engine, seed, talent, mode = "active", limitSeconds = Infinity) {
  const s = engine.createFitness(seed, talent);
  const memo = {};
  const trace = [];
  engine.startFitness(s);
  let previousStage = 0;
  for (let frame = 0; frame < 25000; frame++) {
    if (s.phase === "upgrade") { engine.chooseUpgrade(s, fitnessUpgrade(s)); continue; }
    if (s.phase !== "playing" || s.elapsed >= limitSeconds) break;
    if (s.day !== previousStage) {
      trace.push({ day: s.day, elapsed: s.elapsed, weight: s.weight, muscle: s.muscle, level: s.level, workouts: { ...s.workouts } });
      previousStage = s.day;
    }
    engine.stepFitness(s, 1 / 60, fitnessDecision(s, memo, mode));
  }
  return { state: s, trace };
}
