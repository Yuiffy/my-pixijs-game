export const WORLD = { width: 1100, height: 700 };
export const DAYS = 5;
export const DAY_SECONDS = 60;
export const START_WEIGHT = 48;
export const TARGET_WEIGHT = 40;
export const TARGET_BODY_FAT = 22;
export const TARGET_MUSCLE = 55;
export const OVERLOAD_WEIGHT = 54;
export const MIN_MUSCLE = 20;
export const PLAYER_RADIUS = 22;
export const MAX_WEAPONS = 3;

export type Exercise = "gym" | "swim" | "home";
export type Talent = "strength" | "swimmer" | "rhythm";
export type WeaponKind = "dumbbell" | "water" | "rope" | "aura";
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
  ropeGrace?: number;
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
  kind: "hit" | "dash" | "exercise" | "pickup" | "aura";
  x: number;
  y: number;
  life: number;
  radius?: number;
}
export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  pierce: number;
  hitIds: number[];
}
export interface FitnessState {
  seed: number;
  random: number;
  phase: Phase;
  talent: Talent;
  day: number;
  time: number;
  elapsed: number;
  player: { x: number; y: number };
  foods: Food[];
  pickups: Pickup[];
  projectiles: Projectile[];
  zones: ExerciseZone[];
  effects: FitnessEffect[];
  weight: number;
  fatMass: number;
  leanMass: number;
  bodyFat: number;
  burnReserve: number;
  burnRate: number;
  muscle: number;
  motivation: number;
  stamina: number;
  level: number;
  xp: number;
  nextXp: number;
  totalXp: number;
  weapons: Record<WeaponKind, number>;
  weaponTimers: Record<WeaponKind, number>;
  weaponDamage: Record<WeaponKind, number>;
  defeats: number;
  combo: number;
  bestCombo: number;
  comboTime: number;
  workouts: Record<Exercise, number>;
  lastWorkout: Exercise | null;
  buffs: { attack: number; speed: number; guard: number };
  exercise: { kind: Exercise; progress: number } | null;
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
  dashTime: number;
  dashDirection: { x: number; y: number };
  facing: { x: number; y: number };
  lastDash: boolean;
  lastPulse: boolean;
  spawnTimer: number;
  proteinTimer: number;
  nextId: number;
}
export const WEAPON_DEFS: Record<
  WeaponKind,
  { name: string; icon: string; description: string }
> = {
  dumbbell: {
    name: "哑铃横扫",
    icon: "⌁",
    description: "扇形近战，一次横扫多只食物；升级加伤害和范围",
  },
  water: {
    name: "泳圈水弹",
    icon: "◒",
    description: "自动瞄准远处，水弹可穿透；升级增加弹数和穿透",
  },
  rope: {
    name: "跳绳环绕",
    icon: "∞",
    description: "绳结绕身连续打击；升级增加绳结和环绕范围",
  },
  aura: {
    name: "瑜伽气场",
    icon: "◎",
    description: "定期释放范围震波并击退；升级扩大范围、缩短间隔",
  },
};
export const TALENT_DEFS: Record<
  Talent,
  { name: string; weapon: WeaponKind; description: string; color: string }
> = {
  strength: {
    name: "力量派",
    weapon: "dumbbell",
    description: "哑铃开局 · 健身房经验 +35%，力量增益更久",
    color: "#da8d72",
  },
  swimmer: {
    name: "游泳派",
    weapon: "water",
    description: "水弹开局 · 移速 +10%，游泳燃脂储备 +30%",
    color: "#58b9ca",
  },
  rhythm: {
    name: "节奏派",
    weapon: "rope",
    description: "跳绳开局 · 换训练区多得经验，居家防护更久",
    color: "#98ae7c",
  },
};
export const EXERCISE_DEFS: Record<
  Exercise,
  { name: string; description: string; color: string }
> = {
  gym: {
    name: "健身房",
    description:
      "24 动力 / 2 秒 · 肌肉 +2.2 · 燃脂储备 +0.28 kg · 经验 +12 · 强攻",
    color: "#efab60",
  },
  swim: {
    name: "游泳池",
    description:
      "24 动力 / 2 秒 · 肌肉 +0.6 · 燃脂储备 +0.36 kg · 经验 +12 · 加速",
    color: "#58c5d6",
  },
  home: {
    name: "居家健身",
    description:
      "24 动力 / 2 秒 · 肌肉 +1.6 · 燃脂储备 +0.30 kg · 经验 +12 · 防护",
    color: "#a3b985",
  },
};
interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  max: number;
  weapon?: WeaponKind;
}
export const UPGRADE_DEFS: UpgradeDef[] = [
  ...Object.entries(WEAPON_DEFS).map(([weapon, def]) => ({
    id: `weapon_${weapon}`,
    name: def.name,
    description: def.description,
    max: 4,
    weapon: weapon as WeaponKind,
  })),
  {
    id: "strong",
    name: "力量适应",
    description: "所有武器伤害 +20%（可叠 3 次）",
    max: 3,
  },
  {
    id: "reach",
    name: "舒展肩背",
    description: "近战、环绕与气场范围 +12；水弹射程增加",
    max: 2,
  },
  {
    id: "shoes",
    name: "轻盈跑鞋",
    description: "移动速度 +10%，训练间赶路更快",
    max: 2,
  },
  {
    id: "focus",
    name: "自我鼓励",
    description: "训练消耗 −4 动力，星星动力 +2",
    max: 2,
  },
  {
    id: "guard",
    name: "稳定核心",
    description: "接触食物增加的脂肪 −20%",
    max: 2,
  },
  {
    id: "breath",
    name: "呼吸节奏",
    description: "冲刺冷却 −0.4 秒，体力恢复更快",
    max: 2,
  },
  {
    id: "protein",
    name: "蛋白补给",
    description: "瓶装补给额外恢复 1.5 肌肉",
    max: 2,
  },
  {
    id: "magnet",
    name: "好心情磁铁",
    description: "拾取范围 +38，移动时吸收附近星星",
    max: 2,
  },
  {
    id: "metabolism",
    name: "有氧适应",
    description: "训练储备 +10%，储备兑现速度 +15%",
    max: 3,
  },
  {
    id: "discipline",
    name: "训练日志",
    description: "拾取和训练获得的经验 +20%",
    max: 2,
  },
];
const EMPTY_INPUT: FitnessInput = { x: 0, y: 0 };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export const upgradeRank = (s: FitnessState, id: string) => s.upgrades.filter((value) => value === id).length;
export const workoutCost = (s: FitnessState) => 24 - upgradeRank(s, "focus") * 4;
export function refreshBody(s: FitnessState) {
  s.muscle = clamp(s.muscle, 0, 100);
  s.leanMass = 30.42 + s.muscle * 0.012;
  s.fatMass = Math.max(0, s.fatMass);
  s.weight = s.leanMass + s.fatMass;
  s.bodyFat = (s.fatMass / s.weight) * 100;
}
function random(s: FitnessState) {
  s.random = (Math.imul(s.random, 1664525) + 1013904223 + 4294967296) % 4294967296;
  return s.random / 4294967296;
}
function say(s: FitnessState, message: string, duration = 2.5) {
  s.message = message;
  s.messageTime = duration;
}
function effect(
  s: FitnessState,
  kind: FitnessEffect["kind"],
  x: number,
  y: number,
  radius?: number,
) {
  s.effects.push({
    id: s.nextId++,
    kind,
    x,
    y,
    radius,
    life: kind === "exercise" ? 0.85 : 0.45,
  });
  if (s.effects.length > 70) s.effects.shift();
}
function gainXp(s: FitnessState, amount: number) {
  const gained = amount * (1 + upgradeRank(s, "discipline") * 0.2);
  s.xp += gained;
  s.totalXp += gained;
}
function availableUpgrades(s: FitnessState) {
  const slots = Object.values(s.weapons).filter((rank) => rank > 0).length;
  return UPGRADE_DEFS.filter(def => {
    if (def.weapon) {
      return s.weapons[def.weapon] < def.max &&
        (s.weapons[def.weapon] > 0 || slots < MAX_WEAPONS);
    }
    return upgradeRank(s, def.id) < def.max;
  });
}
function offerLevel(s: FitnessState) {
  if (s.xp < s.nextXp || s.phase !== "playing") return;
  const available = availableUpgrades(s);
  if (!available.length) return;
  s.xp -= s.nextXp;
  s.level += 1;
  s.nextXp = 12 + (s.level - 1) * 7;
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  // Every level offers an actual attack option while one remains to improve.
  const weapon = available.find((def) => def.weapon);
  s.choices = [weapon, ...available.filter((def) => def !== weapon)]
    .filter((def): def is UpgradeDef => !!def)
    .slice(0, 3)
    .map((def) => def.id);
  s.phase = "upgrade";
  s.exercise = null;
  s.lastDash = false;
  s.lastPulse = false;
}
function spawnFood(s: FitnessState) {
  const edge = Math.floor(random(s) * 4);
    const roll = random(s);
  const kind: FoodKind = roll < 0.35 ? "dq" : roll < 0.7 ? "jerky" : "tea";
  const hp =
    (kind === "dq" ? 4 : kind === "tea" ? 3 : 1) + Math.floor((s.day - 1) / 2);
  const along = random(s);
  s.foods.push({
    id: s.nextId++,
    kind,
    radius: kind === "dq" ? 25 : kind === "tea" ? 20 : 17,
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
    charge: 2.5 + random(s) * 1.5,
    telegraph: 0,
    rush: 0,
    vx: 0,
    vy: 0,
  });
}
function defeatFood(s: FitnessState, food: Food) {
  s.defeats += 1;
  s.combo += 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  s.comboTime = 3.5;
  s.score += 14 + Math.min(s.combo, 10);
  s.pickups.push({
    id: s.nextId++,
    kind: "motivation",
    x: food.x,
    y: food.y,
    life: 24,
  });
  effect(s, "hit", food.x, food.y);
}
function checkOutcome(s: FitnessState) {
  refreshBody(s);
  if (s.weight >= OVERLOAD_WEIGHT) {
    s.phase = "lost";
    s.resultReason = "诱惑负担达到 54.00 kg。多留意果茶预警，给训练腾出空间。";
  } else if (s.muscle <= MIN_MUSCLE) {
    s.phase = "lost";
    s.resultReason = "肌肉储备耗尽。健身房和居家训练能保肌，别只盯着秤。";
  } else if (
    s.weight <= TARGET_WEIGHT + 1e-9 &&
    s.bodyFat <= TARGET_BODY_FAT + 1e-9 &&
    s.muscle >= TARGET_MUSCLE - 1e-9
  ) {
    s.phase = "won";
    s.resultReason =
      "40.00 kg 计划达成！体脂也降了，肌肉好好留住了。努力让你提前完成！";
    s.score +=
      1200 +
      Math.round(
        s.muscle * 6 + Math.max(0, DAYS * DAY_SECONDS - s.elapsed) * 5,
      );
  }
  if (s.phase === "won" || s.phase === "lost") s.exercise = null;
}
function workout(s: FitnessState, kind: Exercise) {
  s.workouts[kind] += 1;
  s.score += 85;
  const varied =
    s.talent === "rhythm" && s.lastWorkout !== null && s.lastWorkout !== kind;
  const reserve = kind === "gym" ? 0.28 : kind === "swim" ? 0.36 : 0.3;
  const added =
    (reserve + (varied ? 0.08 : 0)) *
    (1 + upgradeRank(s, "metabolism") * 0.1) *
    (s.talent === "swimmer" && kind === "swim" ? 1.3 : 1);
  const credited = Math.min(5 - s.burnReserve, added);
  s.burnReserve += credited;
  const xp =
    (12 + (varied ? 6 : 0)) *
    (s.talent === "strength" && kind === "gym" ? 1.35 : 1);
  gainXp(s, xp);
  if (kind === "gym") {
    s.muscle += 2.2;
    s.buffs.attack = s.talent === "strength" ? 24 : 16;
  } else if (kind === "swim") {
    s.muscle += 0.6;
    s.buffs.speed = 16;
  } else {
    s.muscle += 1.6;
    s.buffs.guard = s.talent === "rhythm" ? 24 : 16;
  }
  s.lastWorkout = kind;
  refreshBody(s);
  const earned = Math.round(xp * (1 + upgradeRank(s, "discipline") * 0.2));
  say(s, `${EXERCISE_DEFS[kind].name}完成 · 经验 +${earned} · 燃脂储备 +${credited.toFixed(2)} kg`, 2.3);
  effect(s, "exercise", s.player.x, s.player.y);
}
function finishDay(s: FitnessState) {
  s.exercise = null;
  if (s.day === DAYS) {
    checkOutcome(s);
    if (s.phase === "playing") {
      s.phase = "lost";
      const missing = [
        s.weight > TARGET_WEIGHT + 1e-9 ? "体重 ≤40.00 kg" : "",
        s.bodyFat > TARGET_BODY_FAT + 1e-9 ? "体脂 ≤22%" : "",
        s.muscle < TARGET_MUSCLE - 1e-9 ? "肌肉 ≥55" : "",
      ].filter(Boolean);
      s.resultReason = `五阶段完成，还差：${missing.join("、")}。训练积累燃脂储备，拾取和训练能加快升级。`;
    }
    return;
  }
  s.day += 1;
  s.time = 0;
  s.score += 250;
  s.foods = [];
  s.projectiles = [];
  s.spawnTimer = 0.5;
  s.stamina = 100;
  s.motivation = Math.min(100, s.motivation + 12);
  s.invincible = 1;
  say(
    s,
    `第 ${s.day} 阶段 · 诱惑更密集。经验随行动增长，不用等阶段结束升级。`,
    3,
  );
}
export function createFitness(
  seed = 10203,
  talent: Talent = "strength",
): FitnessState {
  const safeSeed = Number.isFinite(seed) ? ((Math.trunc(seed) % 4294967296) + 4294967296) % 4294967296 : 10203;
  const safeTalent = Object.keys(TALENT_DEFS).includes(talent) ? talent : "strength";
  const weapons = { dumbbell: 0, water: 0, rope: 0, aura: 0 };
  weapons[TALENT_DEFS[safeTalent].weapon] = 1;
  return {
    seed: safeSeed,
    random: safeSeed,
    phase: "ready",
    talent: safeTalent,
    day: 1,
    time: 0,
    elapsed: 0,
    player: { x: WORLD.width / 2, y: WORLD.height / 2 },
    foods: [],
    effects: [],
    projectiles: [],
    pickups: [
      { id: 1, kind: "motivation", x: 485, y: 365, life: 24 },
      { id: 2, kind: "motivation", x: 615, y: 365, life: 24 },
    ],
    zones: [
      { kind: "gym", x: 215, y: 200, radius: 84 },
      { kind: "swim", x: 885, y: 210, radius: 84 },
      { kind: "home", x: 550, y: 540, radius: 84 },
    ],
    weight: START_WEIGHT,
    fatMass: 16.8,
    leanMass: 31.2,
    bodyFat: 35,
    burnReserve: 0,
    burnRate: 0,
    muscle: 65,
    motivation: 40,
    stamina: 100,
    level: 1,
    xp: 0,
    nextXp: 12,
    totalXp: 0,
    weapons,
    weaponTimers: { dumbbell: 0, water: 0, rope: 0, aura: 0 },
    weaponDamage: { dumbbell: 0, water: 0, rope: 0, aura: 0 },
    defeats: 0,
    combo: 0,
    bestCombo: 0,
    comboTime: 0,
    workouts: { gym: 0, swim: 0, home: 0 },
    lastWorkout: null,
    exercise: null,
    buffs: { attack: 0, speed: 0, guard: 0 },
    message: "48.00 → 40.00 kg · 拾取星星和训练得经验，升级随时发生。",
    messageTime: 5,
    dashCooldown: 0,
    pulseCooldown: 0,
    invincible: 0,
    upgrades: [],
    choices: [],
    resultReason: "",
    score: 0,
    attackAngle: 0,
    attackRange: 105,
    attackFlash: 0,
    dashTime: 0,
    dashDirection: { x: 0, y: -1 },
    facing: { x: 0, y: -1 },
    lastDash: false,
    lastPulse: false,
    spawnTimer: 0.8,
    proteinTimer: 8,
    nextId: 3,
  };
}
export function startFitness(s: FitnessState) {
  if (s.phase !== "ready" && s.phase !== "paused") return;
  s.phase = "playing";
  s.lastDash = false;
  s.lastPulse = false;
}
export function pauseFitness(s: FitnessState) {
  if (s.phase !== "playing") return;
  s.phase = "paused";
  s.lastDash = false;
  s.lastPulse = false;
}
export function chooseUpgrade(s: FitnessState, id: string) {
  if (s.phase !== "upgrade" || !s.choices.includes(id)) return;
  const def = availableUpgrades(s).find((item) => item.id === id);
  if (!def) return;
  if (def.weapon) s.weapons[def.weapon] += 1;
  s.upgrades.push(id);
  s.choices = [];
  s.phase = "playing";
  s.invincible = Math.max(s.invincible, 0.65);
  s.lastDash = false;
  s.lastPulse = false;
  say(s, `${def.name}已装备 · Lv.${s.level} · 继续积累经验！`, 2);
}
function hit(s: FitnessState, food: Food, amount: number, weapon: WeaponKind) {
  if (food.hp <= 0) return;
  s.weaponDamage[weapon] += Math.min(food.hp, amount);
  food.hp -= amount;
  effect(s, "hit", food.x, food.y);
}
function attack(s: FitnessState, dt: number) {
  const power =
    (1 + upgradeRank(s, "strong") * 0.2) * (s.buffs.attack > 0 ? 1.35 : 1);
  const reach = upgradeRank(s, "reach") * 12;
  for (const kind of Object.keys(s.weaponTimers) as WeaponKind[]) {
    s.weaponTimers[kind] = Math.max(0, s.weaponTimers[kind] - dt);
  }
  const near = s.foods
    .filter((food) => food.hp > 0)
    .sort(
      (a, b) => distance(a, s.player) - distance(b, s.player) || a.id - b.id,
    );
  const level = s.weapons.dumbbell;
  s.attackRange = 105 + reach + Math.max(0, level - 1) * 9;
  if (
    level > 0 &&
    s.weaponTimers.dumbbell === 0 &&
    near[0] &&
    distance(near[0], s.player) < s.attackRange + near[0].radius
  ) {
    s.attackAngle = Math.atan2(near[0].y - s.player.y, near[0].x - s.player.x);
    for (const food of near) {
      const angle = Math.atan2(food.y - s.player.y, food.x - s.player.x);
      const gap = Math.atan2(
        Math.sin(angle - s.attackAngle),
        Math.cos(angle - s.attackAngle),
      );
      if (
        distance(food, s.player) <= s.attackRange + food.radius &&
        Math.abs(gap) < 0.85
      ) hit(s, food, (2 + (level - 1) * 0.8) * power, "dumbbell");
    }
    s.weaponTimers.dumbbell = 0.62 - level * 0.025;
    s.attackFlash = 0.18;
  }
  const { water } = s.weapons;
  if (
    water > 0 &&
    s.weaponTimers.water === 0 &&
    near[0] &&
    distance(near[0], s.player) < 620 + reach * 3
  ) {
    const angle = Math.atan2(near[0].y - s.player.y, near[0].x - s.player.x);
    const count = water >= 4 ? 3 : water >= 2 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const spread = angle + (i - (count - 1) / 2) * 0.12;
      s.projectiles.push({
        id: s.nextId++,
        x: s.player.x,
        y: s.player.y - 4,
        vx: Math.cos(spread) * 450,
        vy: Math.sin(spread) * 450,
        life: 1.5 + reach * 0.005,
        damage: (2 + (water - 1) * 0.65) * power,
        pierce: water >= 3 ? 2 : 1,
        hitIds: [],
      });
    }
    s.weaponTimers.water = 0.72 - water * 0.035;
  }
  for (const p of s.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    for (const food of near) {
      if (p.pierce <= 0 || food.hp <= 0 || p.hitIds.includes(food.id)) continue;
      if (distance(p, food) < food.radius + 8) {
        hit(s, food, p.damage, "water");
        p.hitIds.push(food.id);
        p.pierce -= 1;
      }
    }
  }
  s.projectiles = s.projectiles.filter((p) => p.life > 0 && p.pierce > 0);
  const { rope } = s.weapons;
  if (rope > 0) {
    const count = rope + 1;
      const radius = 74 + reach + (rope - 1) * 8;
    for (const food of near) {
      food.ropeGrace = Math.max(0, (food.ropeGrace || 0) - dt);
      if (food.ropeGrace > 0 || food.hp <= 0) continue;
      for (let i = 0; i < count; i++) {
        const angle = s.elapsed * 4 + (Math.PI * 2 * i) / count;
        if (
          distance(food, {
            x: s.player.x + Math.cos(angle) * radius,
            y: s.player.y + Math.sin(angle) * radius,
          }) <=
          food.radius + 14
        ) {
          hit(s, food, (1.2 + (rope - 1) * 0.45) * power, "rope");
          food.ropeGrace = 0.32;
          break;
        }
      }
    }
  }
  const { aura } = s.weapons;
  if (
    aura > 0 &&
    s.weaponTimers.aura === 0 &&
    near.some((food) => distance(food, s.player) < 110 + reach + aura * 12)
  ) {
    const radius = 110 + reach + aura * 12;
    for (const food of near) {
      const away = distance(food, s.player);
      if (away < radius + food.radius) {
        hit(s, food, (1.6 + (aura - 1) * 0.65) * power, "aura");
        if (away > 0) {
          food.x += ((food.x - s.player.x) / away) * 24;
          food.y += ((food.y - s.player.y) / away) * 24;
        }
      }
    }
    effect(s, "aura", s.player.x, s.player.y, radius);
    s.weaponTimers.aura = 1.3 - aura * 0.12;
  }
}
function tick(s: FitnessState, dt: number, input: FitnessInput) {
  checkOutcome(s);
  if (s.phase !== "playing") return;
  s.time = Math.min(DAY_SECONDS, s.time + dt);
  s.elapsed += dt;
  s.muscle -= dt * 0.1;
  s.stamina = Math.min(
    100,
    s.stamina + dt * (17 + upgradeRank(s, "breath") * 5),
  );
  s.motivation = Math.min(100, s.motivation + dt * 0.65);
  for (const field of [
    "messageTime",
    "invincible",
    "dashCooldown",
    "pulseCooldown",
    "attackFlash",
    "comboTime",
  ] as const) s[field] = Math.max(0, s[field] - dt);
  for (const kind of ["attack", "speed", "guard"] as const) s.buffs[kind] = Math.max(0, s.buffs[kind] - dt);
  if (s.comboTime === 0) s.combo = 0;
  for (const item of s.effects) item.life -= dt;
  s.effects = s.effects.filter((item) => item.life > 0);
  const rawX = Number.isFinite(input.x) ? input.x : 0;
    const rawY = Number.isFinite(input.y) ? input.y : 0;
  const length = Math.hypot(rawX, rawY);
    const movement = { x: rawX / Math.max(1, length), y: rawY / Math.max(1, length) };
  if (length > 0.05) s.facing = { x: rawX / length, y: rawY / length };
  if (input.dash && !s.lastDash && s.dashCooldown === 0 && s.stamina >= 30) {
    s.stamina -= 30;
    s.dashTime = 0.24;
    s.invincible = Math.max(s.invincible, 0.36);
    s.dashCooldown = 2.4 - upgradeRank(s, "breath") * 0.4;
    s.dashDirection = { ...s.facing };
    s.exercise = null;
    effect(s, "dash", s.player.x, s.player.y);
  }
  if (
    input.pulse &&
    !s.lastPulse &&
    s.pulseCooldown === 0 &&
    s.motivation >= 25
  ) {
    s.motivation -= 25;
    s.pulseCooldown = 5;
    effect(s, "aura", s.player.x, s.player.y, 160);
    for (const food of s.foods) {
      const away = distance(food, s.player);
      if (away <= 160) food.hp -= 3;
      else if (away < 235) {
        food.x += ((food.x - s.player.x) / away) * 100;
        food.y += ((food.y - s.player.y) / away) * 100;
      }
    }
    say(s, "拒绝诱惑！给训练留一点空间。", 1.5);
  }
  s.lastDash = Boolean(input.dash);
  s.lastPulse = Boolean(input.pulse);
  const zone = s.zones.find(
    (item) => distance(item, s.player) <= item.radius - 8,
  );
  const cost = workoutCost(s);
  const training = Boolean(
    input.exercise &&
    zone &&
    s.dashTime <= 0 &&
    length < 0.15 &&
    (s.exercise?.kind === zone.kind
      ? s.motivation > 0.25
      : s.motivation >= cost),
  );
  const speed =
    218 *
    (1 + upgradeRank(s, "shoes") * 0.1) *
    (s.talent === "swimmer" ? 1.1 : 1) *
    (s.buffs.speed > 0 ? 1.25 : 1);
  if (s.dashTime > 0) {
    s.player.x += s.dashDirection.x * 620 * dt;
    s.player.y += s.dashDirection.y * 620 * dt;
    s.dashTime = Math.max(0, s.dashTime - dt);
  } else {
    s.player.x += movement.x * speed * dt;
    s.player.y += movement.y * speed * dt;
  }
  s.player.x = clamp(s.player.x, 35, WORLD.width - 35);
  s.player.y = clamp(s.player.y, 35, WORLD.height - 35);
  if (training && zone) {
    if (s.exercise?.kind !== zone.kind) s.exercise = { kind: zone.kind, progress: 0 };
    const usedTime = Math.min(dt, s.motivation / (cost / 2));
    s.motivation -= (usedTime * cost) / 2;
    s.exercise.progress += usedTime / 2;
    if (s.exercise.progress >= 1 - 1e-9) {
      workout(s, zone.kind);
      s.exercise = null;
    }
  } else {
    s.exercise = null;
    if (input.exercise && zone && s.motivation < cost && s.messageTime === 0) say(s, `需要 ${cost} 动力开始训练，拾取金色星星也能得经验。`, 2);
  }
  // Exercise supplies a reserve, consumed gradually. Waiting supplies neither fat loss nor XP.
  const reserveRate = Math.min(
    0.042,
    0.032 * (1 + upgradeRank(s, "metabolism") * 0.15),
  );
  const reserved = Math.min(s.burnReserve, dt * reserveRate);
  const active = dt * (training ? 0.004 : length > 0.15 ? 0.006 : 0);
  const availableFat = Math.max(
    0,
    s.fatMass - Math.max(0, TARGET_WEIGHT - (30.42 + s.muscle * 0.012)),
  );
  const burned = Math.min(availableFat, reserved + active);
  s.fatMass -= burned;
  s.burnReserve = Math.max(0, s.burnReserve - Math.min(reserved, burned));
  s.burnRate = burned / dt;
  s.spawnTimer -= dt;
  while (s.spawnTimer <= 0) {
    if (s.foods.length < 85) spawnFood(s);
    s.spawnTimer += (0.9 - (s.day - 1) * 0.08) * (0.88 + random(s) * 0.24);
  }
  s.proteinTimer -= dt;
  if (s.proteinTimer <= 0) {
    s.pickups.push({
      id: s.nextId++,
      kind: "protein",
      x: 150 + random(s) * 800,
      y: 140 + random(s) * 430,
      life: 26,
    });
    s.proteinTimer += 13;
  }
  for (const food of s.foods) {
    if (food.hp <= 0) continue;
    food.age += dt;
    const toward = distance(food, s.player);
      const dx = toward > 0 ? (s.player.x - food.x) / toward : 0;
      const dy = toward > 0 ? (s.player.y - food.y) / toward : 0;
    let foodSpeed =
      (food.kind === "dq" ? 57 : food.kind === "jerky" ? 87 : 74) + s.day * 4;
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
        food.vx = dx * (270 + s.day * 10);
        food.vy = dy * (270 + s.day * 10);
        continue;
      }
    }
    food.x += dx * foodSpeed * dt;
    food.y += dy * foodSpeed * dt;
  }
  attack(s, dt);
  const remaining: Food[] = [];
  for (const food of s.foods) {
    if (food.hp <= 0) {
      defeatFood(s, food);
      continue;
    }
    if (
      s.invincible === 0 &&
      distance(food, s.player) < food.radius + PLAYER_RADIUS
    ) {
      s.fatMass +=
        (food.kind === "dq" ? 0.14 : food.kind === "jerky" ? 0.07 : 0.1) *
        (1 - upgradeRank(s, "guard") * 0.2) *
        (s.buffs.guard > 0 ? 0.6 : 1);
      s.invincible = 0.7;
      s.combo = 0;
      s.comboTime = 0;
      s.exercise = null;
      effect(s, "hit", s.player.x, s.player.y);
      say(
        s,
        `${food.kind === "dq"
          ? "DQ"
          : food.kind === "jerky"
            ? "牛肉干"
            : "西西里柠檬柚"}贴身！脂肪负担增加，闪开再训练。`,
        1.3,
      );
      continue;
    }
    remaining.push(food);
  }
  s.foods = remaining;
  const pickupRadius = 50 + upgradeRank(s, "magnet") * 38;
  s.pickups = s.pickups.filter((item) => {
    item.life -= dt;
    if (distance(item, s.player) < pickupRadius) {
      if (item.kind === "motivation") {
        s.motivation = Math.min(
          100,
          s.motivation + 8 + upgradeRank(s, "focus") * 2,
        );
        gainXp(s, 5);
      } else {
        s.muscle = Math.min(
          100,
          s.muscle + 2.5 + upgradeRank(s, "protein") * 1.5,
        );
        say(s, "蛋白补给到位，肌肉恢复！", 1.5);
      }
      effect(s, "pickup", item.x, item.y);
      return false;
    }
    return item.life > 0;
  });
  s.motivation = clamp(s.motivation, 0, 100);
  checkOutcome(s);
  if (s.phase === "playing" && s.time >= DAY_SECONDS - 1e-9) finishDay(s);
  offerLevel(s);
}
/** Uses seconds; fixed substeps preserve collision and training behavior on slow frames. */
export function stepFitness(
  s: FitnessState,
  dt: number,
  input: FitnessInput = EMPTY_INPUT,
) {
  if (s.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
  let remaining = Math.min(dt, 0.25);
  while (remaining > 1e-9 && s.phase === "playing") {
    const slice = Math.min(remaining, 1 / 60, DAY_SECONDS - s.time);
    if (slice <= 1e-9) {
      finishDay(s);
      break;
    }
    tick(s, slice, input);
    remaining -= slice;
  }
}
export function advanceFitness(
  s: FitnessState,
  ms: number,
  input: FitnessInput = EMPTY_INPUT,
) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  let remaining = ms / 1000;
  while (remaining > 1e-9 && s.phase === "playing") {
    const slice = Math.min(remaining, 1 / 60);
    stepFitness(s, slice, input);
    remaining -= slice;
  }
}
