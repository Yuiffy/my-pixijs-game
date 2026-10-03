export const WORLD = { width: 1100, height: 700 };
export const DAYS = 5;
export const DAY_SECONDS = 40;
export const TARGET_WEIGHT = 62;
export const TARGET_MUSCLE = 55;
export const OVERLOAD_WEIGHT = 72;
export const MIN_MUSCLE = 20;
export const PLAYER_RADIUS = 22;

export type Exercise = "gym" | "swim" | "home";
export type FoodKind = "dq" | "jerky" | "tea";
export type Phase = "ready" | "playing" | "paused" | "upgrade" | "won" | "lost";
export interface FitnessInput {
  x: number;
  y: number;
  dash?: boolean;
  pulse?: boolean;
  exercise?: boolean;
}
export interface Food {
  id: number;
  kind: FoodKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  age: number;
  charge: number;
  telegraph: number;
  rush: number;
  vx: number;
  vy: number;
}
export interface Pickup {
  id: number;
  kind: "motivation" | "protein";
  x: number;
  y: number;
  life: number;
}
export interface ExerciseZone {
  kind: Exercise;
  x: number;
  y: number;
  radius: number;
}
export interface FitnessEffect {
  id: number;
  kind: "hit" | "dash" | "exercise" | "pickup";
  x: number;
  y: number;
  life: number;
}
export interface FitnessState {
  seed: number;
  random: number;
  phase: Phase;
  day: number;
  time: number;
  elapsed: number;
  player: { x: number; y: number };
  foods: Food[];
  pickups: Pickup[];
  zones: ExerciseZone[];
  effects: FitnessEffect[];
  weight: number;
  muscle: number;
  motivation: number;
  stamina: number;
  defeats: number;
  combo: number;
  bestCombo: number;
  comboTime: number;
  workouts: Record<Exercise, number>;
  exercise: { kind: Exercise; progress: number } | null;
  buffs: { attack: number; speed: number; guard: number };
  message: string;
  messageTime: number;
  dashCooldown: number;
  pulseCooldown: number;
  invincible: number;
  upgrades: string[];
  choices: string[];
  resultReason: string;
  score: number;
  attackAngle: number;
  attackRange: number;
  attackFlash: number;
  attackCooldown: number;
  dashTime: number;
  dashDirection: { x: number; y: number };
  facing: { x: number; y: number };
  lastDash: boolean;
  lastPulse: boolean;
  spawnTimer: number;
  proteinTimer: number;
  nextId: number;
}

export const EXERCISE_DEFS: Record<
  Exercise,
  { name: string; description: string; color: string }
> = {
  gym: {
    name: "健身房",
    description: "消耗 24 动力 · 2 秒：肌肉 +9，体重 −0.45，哑铃强化 16 秒",
    color: "#efab60",
  },
  swim: {
    name: "游泳池",
    description: "消耗 24 动力 · 2 秒：体重 −1.4，肌肉 +2，游泳步伐加速 14 秒",
    color: "#58c5d6",
  },
  home: {
    name: "居家健身",
    description: "消耗 24 动力 · 2 秒：肌肉 +6，体重 −0.75，碰撞负担减轻 16 秒",
    color: "#a3b985",
  },
};

export const UPGRADE_DEFS = [
  {
    id: "strong",
    name: "哑铃加片",
    description: "自动攻击伤害 +1，DQ 也扛不住",
  },
  {
    id: "reach",
    name: "舒展肩背",
    description: "哑铃攻击范围 +24，更早击退诱惑",
  },
  {
    id: "shoes",
    name: "轻盈跑鞋",
    description: "移动速度 +15%，游泳加速仍可叠加",
  },
  {
    id: "focus",
    name: "自我鼓励",
    description: "训练动力消耗 −25%，动力拾取 +3",
  },
  { id: "guard", name: "稳定核心", description: "食物碰撞的体重负担 −30%" },
  {
    id: "breath",
    name: "呼吸节奏",
    description: "闪避冷却 −0.7 秒，体力恢复更快",
  },
  { id: "protein", name: "蛋白补给", description: "蛋白补给额外恢复 3 肌肉" },
  {
    id: "magnet",
    name: "好心情磁铁",
    description: "从更远处吸收动力和蛋白补给",
  },
] as const;

const EMPTY_INPUT: FitnessInput = { x: 0, y: 0 };
const clamp = (value: number, low: number, high: number) => (
  Math.max(low, Math.min(high, value))
);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => (
  Math.hypot(a.x - b.x, a.y - b.y)
);
const hasUpgrade = (state: FitnessState, id: string) => state.upgrades.includes(id);
function random(state: FitnessState) {
  state.random =
    (Math.imul(state.random, 1664525) + 1013904223 + 4294967296) % 4294967296;
  return state.random / 4294967296;
}
function say(state: FitnessState, message: string, duration = 2.5) {
  state.message = message;
  state.messageTime = duration;
}
function effect(
  state: FitnessState,
  kind: FitnessEffect["kind"],
  x: number,
  y: number,
) {
  state.effects.push({
    id: state.nextId++,
    kind,
    x,
    y,
    life: kind === "exercise" ? 0.85 : 0.45,
  });
  if (state.effects.length > 70) state.effects.shift();
}
function spawnFood(state: FitnessState) {
  const edge = Math.floor(random(state) * 4);
  const roll = random(state);
  const kind: FoodKind = roll < 0.35 ? "dq" : roll < 0.7 ? "jerky" : "tea";
  const radius = kind === "dq" ? 25 : kind === "tea" ? 20 : 17;
  const hp = kind === "dq" ? 3 : kind === "tea" ? 2 : 1;
  const along = random(state);
  state.foods.push({
    id: state.nextId++,
    kind,
    radius,
    hp,
    maxHp: hp,
    x:
      edge === 0
        ? -30
        : edge === 1
          ? WORLD.width + 30
          : 40 + along * (WORLD.width - 80),
    y:
      edge === 2
        ? -30
        : edge === 3
          ? WORLD.height + 30
          : 50 + along * (WORLD.height - 100),
    age: 0,
    charge: 2.5 + random(state) * 1.5,
    telegraph: 0,
    rush: 0,
    vx: 0,
    vy: 0,
  });
}
function defeatFood(state: FitnessState, food: Food) {
  state.defeats += 1;
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.comboTime = 3.5;
  state.score += 14 + Math.min(state.combo, 10);
  state.pickups.push({
    id: state.nextId++,
    kind: "motivation",
    x: food.x,
    y: food.y,
    life: 18,
  });
  effect(state, "hit", food.x, food.y);
}
function checkLoss(state: FitnessState) {
  if (state.weight >= OVERLOAD_WEIGHT) {
    state.phase = "lost";
    state.resultReason = "诱惑负担达到上限，下次用闪避和决心波为训练腾出空间。";
  } else if (state.muscle <= MIN_MUSCLE) {
    state.phase = "lost";
    state.resultReason = "肌肉储备耗尽了。去健身房或做居家训练，别只盯着体重。";
  }
  if (state.phase === "lost") state.exercise = null;
}
function workout(state: FitnessState, kind: Exercise) {
  state.workouts[kind] += 1;
  state.score += 85;
  if (kind === "gym") {
    state.muscle += 9;
    state.weight -= 0.45;
    state.buffs.attack = 16;
    say(state, "练到了！肌肉 +9，哑铃强化。", 2.2);
  } else if (kind === "swim") {
    state.muscle += 2;
    state.weight -= 1.4;
    state.buffs.speed = 14;
    say(state, "游完一圈，体重 −1.4！步伐更轻快。", 2.2);
  } else {
    state.muscle += 6;
    state.weight -= 0.75;
    state.buffs.guard = 16;
    say(state, "在家也能练！肌肉 +6，核心更稳。", 2.2);
  }
  state.muscle = Math.min(100, state.muscle);
  state.weight = Math.max(50, state.weight);
  effect(state, "exercise", state.player.x, state.player.y);
}
function finishDay(state: FitnessState) {
  state.time = DAY_SECONDS;
  state.score += 250;
  state.exercise = null;
  state.lastDash = false;
  state.lastPulse = false;
  if (state.day === DAYS) {
    const weightMet = state.weight <= TARGET_WEIGHT + 1e-9;
    const muscleMet = state.muscle >= TARGET_MUSCLE - 1e-9;
    if (!weightMet || !muscleMet) {
      state.phase = "lost";
      if (!weightMet && !muscleMet) {
        state.resultReason =
          "五天坚持完成，但体重和肌肉都还没达到目标。下次多安排游泳与力量训练，让减脂和保肌一起达标。";
      } else if (!weightMet) {
        state.resultReason =
          "五天坚持完成，但体重仍高于 62 kg。下次用游泳降低负担，再用闪避躲开食物诱惑。";
      } else {
        state.resultReason =
          "五天坚持完成，但肌肉储备还不足 55。下次多安排健身房或居家训练，减脂也要保住肌肉。";
      }
      return;
    }
    state.phase = "won";
    state.resultReason = "五天计划完成！躲过了诱惑，也把肌肉好好留住了。";
    state.score += Math.round(
      state.muscle * 6 + Math.max(0, TARGET_WEIGHT - state.weight) * 40,
    );
    return;
  }
  state.phase = "upgrade";
  const available = UPGRADE_DEFS.filter(
    (upgrade) => !hasUpgrade(state, upgrade.id),
  ).map((upgrade) => upgrade.id);
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  state.choices = available.slice(0, 3);
  say(state, "今天也坚持了！选一份明天的动力。", 4);
}

export function createFitness(seed = 10203): FitnessState {
  const safeSeed = Number.isFinite(seed)
    ? ((Math.trunc(seed) % 4294967296) + 4294967296) % 4294967296
    : 10203;
  return {
    seed: safeSeed,
    random: safeSeed,
    phase: "ready",
    day: 1,
    time: 0,
    elapsed: 0,
    player: { x: WORLD.width / 2, y: WORLD.height / 2 },
    foods: [],
    effects: [],
    pickups: [
      { id: 1, kind: "motivation", x: 485, y: 365, life: 18 },
      { id: 2, kind: "motivation", x: 615, y: 365, life: 18 },
    ],
    zones: [
      { kind: "gym", x: 215, y: 200, radius: 84 },
      { kind: "swim", x: 885, y: 210, radius: 84 },
      { kind: "home", x: 550, y: 540, radius: 84 },
    ],
    weight: 62,
    muscle: 65,
    motivation: 40,
    stamina: 100,
    defeats: 0,
    combo: 0,
    bestCombo: 0,
    comboTime: 0,
    workouts: { gym: 0, swim: 0, home: 0 },
    exercise: null,
    buffs: { attack: 0, speed: 0, guard: 0 },
    message: "今天也要动！靠近训练区，按住训练 2 秒。",
    messageTime: 5,
    dashCooldown: 0,
    pulseCooldown: 0,
    invincible: 0,
    upgrades: [],
    choices: [],
    resultReason: "",
    score: 0,
    attackAngle: 0,
    attackRange: 104,
    attackFlash: 0,
    attackCooldown: 0,
    dashTime: 0,
    dashDirection: { x: 0, y: -1 },
    facing: { x: 0, y: -1 },
    lastDash: false,
    lastPulse: false,
    spawnTimer: 0.8,
    proteinTimer: 10,
    nextId: 3,
  };
}

export function startFitness(state: FitnessState) {
  if (state.phase !== "ready" && state.phase !== "paused") return;
  state.phase = "playing";
  state.lastDash = false;
  state.lastPulse = false;
}
export function pauseFitness(state: FitnessState) {
  if (state.phase !== "playing") return;
  state.phase = "paused";
  state.lastDash = false;
  state.lastPulse = false;
}
export function chooseUpgrade(state: FitnessState, id: string) {
  if (state.phase !== "upgrade" || !state.choices.includes(id)) return;
  state.upgrades.push(id);
  state.choices = [];
  state.day += 1;
  state.time = 0;
  state.foods = [];
  state.pickups = [];
  state.effects = [];
  state.spawnTimer = 0.7;
  state.proteinTimer = 7;
  state.motivation = Math.min(100, state.motivation + 18);
  state.stamina = 100;
  state.invincible = 1;
  state.dashTime = 0;
  state.dashCooldown = 0;
  state.pulseCooldown = 0;
  state.phase = "playing";
  say(state, `第 ${state.day} 天，加油！诱惑会更密集。`, 3);
}

function tick(state: FitnessState, dt: number, input: FitnessInput) {
  checkLoss(state);
  if (state.phase !== "playing") return;
  state.time = Math.min(DAY_SECONDS, state.time + dt);
  state.elapsed += dt;
  state.weight = Math.max(50, state.weight - dt * 0.026);
  state.muscle -= dt * 0.34;
  state.stamina = Math.min(
    100,
    state.stamina + dt * (hasUpgrade(state, "breath") ? 25 : 17),
  );
  state.motivation = Math.min(100, state.motivation + dt * 1.1);
  state.messageTime = Math.max(0, state.messageTime - dt);
  state.invincible = Math.max(0, state.invincible - dt);
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  state.pulseCooldown = Math.max(0, state.pulseCooldown - dt);
  state.attackCooldown = Math.max(0, state.attackCooldown - dt);
  state.attackFlash = Math.max(0, state.attackFlash - dt);
  state.attackAngle = (state.attackAngle + dt * 4) % (Math.PI * 2);
  state.buffs.attack = Math.max(0, state.buffs.attack - dt);
  state.buffs.speed = Math.max(0, state.buffs.speed - dt);
  state.buffs.guard = Math.max(0, state.buffs.guard - dt);
  state.comboTime = Math.max(0, state.comboTime - dt);
  if (state.comboTime === 0) state.combo = 0;
  for (const item of state.effects) item.life -= dt;
  state.effects = state.effects.filter((item) => item.life > 0);

  const rawX = Number.isFinite(input.x) ? input.x : 0;
  const rawY = Number.isFinite(input.y) ? input.y : 0;
  const length = Math.hypot(rawX, rawY);
  const movement = {
    x: rawX / Math.max(1, length),
    y: rawY / Math.max(1, length),
  };
  if (length > 0.05) state.facing = { x: rawX / length, y: rawY / length };
  if (
    input.dash &&
    !state.lastDash &&
    state.dashCooldown === 0 &&
    state.stamina >= 30
  ) {
    state.stamina -= 30;
    state.dashTime = 0.24;
    state.invincible = Math.max(state.invincible, 0.36);
    state.dashCooldown = hasUpgrade(state, "breath") ? 1.7 : 2.4;
    state.dashDirection = { ...state.facing };
    state.exercise = null;
    effect(state, "dash", state.player.x, state.player.y);
  }
  if (
    input.pulse &&
    !state.lastPulse &&
    state.pulseCooldown === 0 &&
    state.motivation >= 25
  ) {
    state.motivation -= 25;
    state.pulseCooldown = 5;
    effect(state, "exercise", state.player.x, state.player.y);
    for (const food of state.foods) {
      const away = distance(food, state.player);
      if (away <= 160) food.hp -= 3;
      else if (away < 235) {
        food.x += ((food.x - state.player.x) / away) * 100;
        food.y += ((food.y - state.player.y) / away) * 100;
      }
    }
    say(state, "我有自己的节奏！决心波清场。", 1.5);
  }
  state.lastDash = Boolean(input.dash);
  state.lastPulse = Boolean(input.pulse);
  const zone = state.zones.find(
    (item) => distance(item, state.player) <= item.radius - 8,
  );
  const workoutCost = hasUpgrade(state, "focus") ? 18 : 24;
  const continuingWorkout = Boolean(zone && state.exercise?.kind === zone.kind);
  const motivationReady = continuingWorkout
    ? state.motivation > 0.25
    : state.motivation >= workoutCost;
  const training = Boolean(
    input.exercise &&
    zone &&
    state.dashTime <= 0 &&
    motivationReady &&
    length < 0.15,
  );
  let speed =
    218 *
    (hasUpgrade(state, "shoes") ? 1.15 : 1) *
    (state.buffs.speed > 0 ? 1.25 : 1);
  if (training) speed *= 0.3;
  if (state.dashTime > 0) {
    state.player.x += state.dashDirection.x * 620 * dt;
    state.player.y += state.dashDirection.y * 620 * dt;
    state.dashTime = Math.max(0, state.dashTime - dt);
  } else {
    state.player.x += movement.x * speed * dt;
    state.player.y += movement.y * speed * dt;
  }
  state.player.x = clamp(state.player.x, 35, WORLD.width - 35);
  state.player.y = clamp(state.player.y, 35, WORLD.height - 35);

  if (training && zone) {
    if (state.exercise?.kind !== zone.kind) {
      state.exercise = { kind: zone.kind, progress: 0 };
    }
    const cost = workoutCost / 2;
    const usedTime = Math.min(dt, state.motivation / cost);
    state.motivation -= usedTime * cost;
    state.exercise.progress += usedTime / 2;
    if (state.exercise.progress >= 1 - 1e-9) {
      workout(state, zone.kind);
      state.exercise = null;
    }
  } else {
    state.exercise = null;
    if (
      input.exercise &&
      zone &&
      state.motivation < workoutCost &&
      state.messageTime === 0
    ) {
      say(state, `动力不足：需要 ${workoutCost} 动力才能开始训练，先收集金色动力。`, 2);
    }
  }

  state.spawnTimer -= dt;
  while (state.spawnTimer <= 0) {
    if (state.foods.length < 70) spawnFood(state);
    state.spawnTimer +=
      (1.12 - (state.day - 1) * 0.125) * (0.88 + random(state) * 0.24);
  }
  state.proteinTimer -= dt;
  if (state.proteinTimer <= 0) {
    state.pickups.push({
      id: state.nextId++,
      kind: "protein",
      x: 150 + random(state) * 800,
      y: 140 + random(state) * 430,
      life: 22,
    });
    state.proteinTimer += 14;
  }
  for (const food of state.foods) {
    if (food.hp <= 0) continue;
    food.age += dt;
    const toward = distance(food, state.player);
    const dx = toward > 0 ? (state.player.x - food.x) / toward : 0;
    const dy = toward > 0 ? (state.player.y - food.y) / toward : 0;
    let foodSpeed =
      (food.kind === "dq" ? 57 : food.kind === "jerky" ? 87 : 74) +
      state.day * 4;
    if (food.kind === "jerky" && food.age % 2.6 > 1.95) foodSpeed *= 1.8;
    if (food.kind === "tea") {
      if (food.rush > 0) {
        food.rush = Math.max(0, food.rush - dt);
        food.x += food.vx * dt;
        food.y += food.vy * dt;
        continue;
      }
      if (food.telegraph > 0) {
        food.telegraph = Math.max(0, food.telegraph - dt);
        if (food.telegraph === 0) {
          food.rush = 0.65;
          food.charge = 3.3;
        }
        continue;
      }
      food.charge -= dt;
      if (food.charge <= 0 && toward < 430) {
        food.telegraph = 0.7;
        food.vx = dx * (270 + state.day * 10);
        food.vy = dy * (270 + state.day * 10);
        continue;
      }
    }
    food.x += dx * foodSpeed * dt;
    food.y += dy * foodSpeed * dt;
  }

  state.attackRange = 104 + (hasUpgrade(state, "reach") ? 24 : 0);
  if (state.attackCooldown === 0) {
    const targets = state.foods.filter(
      (food) => (
        food.hp > 0 &&
        distance(food, state.player) <= state.attackRange + food.radius
      ),
    );
    targets.sort(
      (a, b) => (
        distance(a, state.player) - distance(b, state.player) || a.id - b.id
      ),
    );
    if (targets[0]) {
      const target = targets[0];
      state.attackAngle = Math.atan2(
        target.y - state.player.y,
        target.x - state.player.x,
      );
      target.hp -=
        1 +
        (hasUpgrade(state, "strong") ? 1 : 0) +
        (state.buffs.attack > 0 ? 1 : 0);
      state.attackCooldown = 0.5;
      state.attackFlash = 0.16;
      effect(state, "hit", target.x, target.y);
    }
  }
  const remaining: Food[] = [];
  for (const food of state.foods) {
    if (food.hp <= 0) {
      defeatFood(state, food);
      continue;
    }
    if (
      state.invincible === 0 &&
      distance(food, state.player) < food.radius + PLAYER_RADIUS
    ) {
      const weight =
        food.kind === "dq" ? 0.6 : food.kind === "jerky" ? 0.32 : 0.42;
      state.weight +=
        weight *
        (hasUpgrade(state, "guard") ? 0.7 : 1) *
        (state.buffs.guard > 0 ? 0.65 : 1);
      state.invincible = 0.7;
      state.combo = 0;
      state.comboTime = 0;
      state.exercise = null;
      effect(state, "hit", state.player.x, state.player.y);
      say(
        state,
        `${food.kind === "dq" ? "DQ" : food.kind === "jerky" ? "牛肉干" : "西西里柠檬柚"}的诱惑！体重负担增加。`,
        1.4,
      );
      continue;
    }
    remaining.push(food);
  }
  state.foods = remaining;
  const pickupRadius = hasUpgrade(state, "magnet") ? 112 : 44;
  state.pickups = state.pickups.filter((item) => {
    item.life -= dt;
    if (distance(item, state.player) < pickupRadius) {
      if (item.kind === "motivation") {
        state.motivation = Math.min(
          100,
          state.motivation + (hasUpgrade(state, "focus") ? 11 : 8),
        );
      } else {
        state.muscle = Math.min(
          100,
          state.muscle + (hasUpgrade(state, "protein") ? 6 : 3),
        );
        say(state, "蛋白补给到位，肌肉恢复！", 1.5);
      }
      effect(state, "pickup", item.x, item.y);
      return false;
    }
    return item.life > 0;
  });
  state.motivation = clamp(state.motivation, 0, 100);
  checkLoss(state);
  if (state.phase === "playing" && state.time >= DAY_SECONDS - 1e-9) {
    finishDay(state);
  }
}

/** Uses seconds. Large frames are subdivided so collisions cannot skip through enemies. */
export function stepFitness(
  state: FitnessState,
  dt: number,
  input: FitnessInput = EMPTY_INPUT,
) {
  if (state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
  let remaining = Math.min(dt, 0.25);
  while (remaining > 1e-9 && state.phase === "playing") {
    const slice = Math.min(remaining, 1 / 60, DAY_SECONDS - state.time);
    if (slice <= 1e-9) {
      finishDay(state);
      break;
    }
    tick(state, slice, input);
    remaining -= slice;
  }
}

/** Public simulation helper using the same input and rules as live gameplay. */
export function advanceFitness(
  state: FitnessState,
  ms: number,
  input: FitnessInput = EMPTY_INPUT,
) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  let remaining = ms / 1000;
  while (remaining > 1e-9 && state.phase === "playing") {
    const slice = Math.min(remaining, 1 / 60);
    stepFitness(state, slice, input);
    remaining -= slice;
  }
}
