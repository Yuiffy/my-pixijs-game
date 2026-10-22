import { ENEMIES, GROUND, HEIGHT, LEVELS, WIDTH } from "./content";
import type { EnemyKind, Platform, Pickup } from "./content";

export const SAVE_KEY = "sui-spring-platformer-v1";
export const PHYSICS = {
  walk: 235,
  run: 365,
  acceleration: 1900,
  airAcceleration: 1050,
  friction: 1750,
  gravity: 1720,
  jump: 590,
  coyote: 0.11,
  buffer: 0.13,
};
export interface Input {
  left: boolean;
  right: boolean;
  jump: boolean;
  run: boolean;
}
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  jump: false,
  run: false,
});
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
}
export interface Player extends Body {
  grounded: boolean;
  facing: number;
  invincible: number;
  coyote: number;
  buffered: number;
  jumpHeld: boolean;
  squash: number;
  health: number;
}
export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  left: number;
  right: number;
  homeY: number;
  timer: number;
  direction: number;
  alive: boolean;
  shell: boolean;
  hp: number;
  stun: number;
  grounded: boolean;
}
export interface Projectile extends Body {
  type: "arrow" | "bomb";
  life: number;
  fuse: number;
  target: number;
  targetY: number;
  exploded: boolean;
}
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}
export interface Save {
  unlocked: number;
  discovered: EnemyKind[];
  best: { stars: string[]; coins: number; time: number; deaths: number }[];
  sound: boolean;
  assist: boolean;
}
export interface Game {
  phase: "title" | "playing" | "paused" | "dead" | "clear";
  level: number;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  collected: string[];
  coins: number;
  stars: string[];
  time: number;
  clock: number;
  camera: number;
  checkpoint: number;
  deaths: number;
  deathTimer: number;
  checkpointStars: string[];
  checkpointCollected: string[];
  checkpointCoins: number;
  crumble: Record<number, number>;
  save: Save;
  toast: string;
  toastTimer: number;
  shake: number;
  events: string[];
  checkpointTime: number;
  bossLock: boolean;
}
export function freshSave(): Save {
  return { unlocked: 0, discovered: [], best: [], sound: true, assist: false };
}
export function readSave(raw: string | null): Save {
  const base = freshSave();
  try {
    const data = JSON.parse(raw || "null");
    if (!data || typeof data !== "object") return base;
    base.unlocked = Math.max(
      0,
      Math.min(3, Math.floor(Number(data.unlocked) || 0)),
    );
    base.sound = data.sound !== false;
    base.assist = data.assist === true;
    base.discovered = Array.isArray(data.discovered)
      ? Array.from(
          new Set<EnemyKind>(
            data.discovered.filter(
              (v: string) => typeof v === "string" &&
                Object.prototype.hasOwnProperty.call(ENEMIES, v),
            ),
          ),
        )
      : [];
    base.best = LEVELS.map((_, i) => {
      const b = data.best?.[i];
      return {
        stars: Array.isArray(b?.stars)
          ? ["star-0", "star-1", "star-2"].filter((s) => b.stars.includes(s))
          : [],
        coins: Math.max(0, Math.min(500, Math.floor(Number(b?.coins) || 0))),
        time: Math.max(0, Math.min(86400, Number(b?.time) || 0)),
        deaths: Math.max(
          0,
          Math.min(100000, Math.floor(Number(b?.deaths) || 0)),
        ),
      };
    });
  } catch {
    return base;
  }
  return base;
}
function playerAt(x: number): Player {
  return {
    x,
    y: GROUND - 44,
    vx: 0,
    vy: 0,
    w: 26,
    h: 44,
    grounded: true,
    facing: 1,
    invincible: 0,
    coyote: PHYSICS.coyote,
    buffered: 0,
    jumpHeld: false,
    squash: 0,
    health: 3,
  };
}
function spawnEnemies(level: number): Enemy[] {
  return LEVELS[level].enemies.map((e, id) => ({
    ...e,
    id,
    y: e.y - (e.kind === "director" ? 65 : 40),
    homeY: e.y - 40,
    vx: 0,
    vy: 0,
    w: e.kind === "director" ? 52 : 32,
    h: e.kind === "director" ? 65 : 40,
    timer: 1 + id * 0.31,
    direction: -1,
    alive: true,
    shell: false,
    hp: e.kind === "director" ? 3 : 1,
    stun: 0,
    grounded: true,
  }));
}
export function createGame(save = freshSave()): Game {
  return {
    phase: "title",
    level: 0,
    player: playerAt(130),
    enemies: spawnEnemies(0),
    projectiles: [],
    particles: [],
    collected: [],
    coins: 0,
    stars: [],
    time: 0,
    clock: 0,
    camera: 0,
    checkpoint: 130,
    deaths: 0,
    deathTimer: 0,
    checkpointStars: [],
    checkpointCollected: [],
    checkpointCoins: 0,
    crumble: {},
    save,
    toast: "",
    toastTimer: 0,
    shake: 0,
    events: [],
    checkpointTime: 0,
    bossLock: false,
  };
}
export function startLevel(s: Game, index: number) {
  if (index < 0 || index > s.save.unlocked || index >= LEVELS.length) return;
  const { save } = s;
  Object.assign(s, createGame(save), {
    level: index,
    phase: "playing",
    enemies: spawnEnemies(index),
  });
  toast(s, LEVELS[index].story, 6);
}
export function toast(s: Game, text: string, duration = 3) {
  s.toast = text;
  s.toastTimer = duration;
}
function event(s: Game, name: string) {
  s.events.push(name);
}
export function burst(
  s: Game,
  x: number,
  y: number,
  color: number,
  count = 12,
) {
  for (let i = 0; i < count; i++) {
    const a = (i * 2.399963 + s.clock) % (Math.PI * 2);
    const speed = 35 + (i % 5) * 22;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 50,
      life: 0.5 + (i % 4) * 0.1,
      max: 0.8,
      color,
      size: 2 + (i % 3),
    });
  }
}
export function platformPosition(p: Platform, time: number): Platform {
  return p.kind === "moving"
    ? { ...p, x: p.x + Math.sin(time * (p.speed || 0.8)) * (p.move || 45) }
    : p;
}
export function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
export function pendulumPosition(
  h: { x: number; y: number; length?: number; phase?: number },
  time: number,
) {
  const angle = Math.sin(time * 1.65 + (h.phase || 0)) * 0.95;
  return {
    x: h.x + Math.sin(angle) * (h.length || 180),
    y: h.y + Math.cos(angle) * (h.length || 180),
  };
}
function surfaces(s: Game) {
  return LEVELS[s.level].platforms
    .map((p, i) => ({ ...platformPosition(p, s.time), index: i }))
    .filter((p) => !(p.kind === "crumble" && (s.crumble[p.index] || 0) > 0.6));
}
function moveBody(
  body: Body,
  dt: number,
  blocks: ReturnType<typeof surfaces>,
  solidSides: boolean,
) {
  const previousBottom = body.y + body.h;
  const oldX = body.x;
  body.x += body.vx * dt;
  if (solidSides) for (const b of blocks) {
      if (b.kind !== "grass" && b.kind !== "brick") continue;
      if (!overlaps(body, b)) continue;
      if (oldX + body.w <= b.x + 1) body.x = b.x - body.w;
      else if (oldX >= b.x + b.w - 1) body.x = b.x + b.w;
      body.vx = 0;
    }
  body.y += body.vy * dt;
  let landed = -1;
  if (body.vy >= 0) {
    let top = Infinity;
    for (const b of blocks) {
      if (body.x + body.w <= b.x + 2 || body.x >= b.x + b.w - 2) continue;
      if (previousBottom <= b.y + 3 && body.y + body.h >= b.y && b.y < top) {
        top = b.y;
        landed = b.index;
      }
    }
    if (landed !== -1) {
      body.y = top - body.h;
      body.vy = 0;
    }
  } else if (solidSides) {
    for (const b of blocks) if (
        (b.kind === "brick" || b.kind === "grass") &&
        overlaps(body, b) &&
        previousBottom - body.h >= b.y + b.h - 3
      ) {
        body.y = b.y + b.h;
        body.vy = 0;
      }
  }
  return landed;
}
function discover(s: Game, kind: EnemyKind) {
  if (s.save.discovered.includes(kind)) return;
  s.save.discovered.push(kind);
  event(s, "save");
  toast(s, `图鉴已收录 · ${ENEMIES[kind].name} · ${ENEMIES[kind].tip}`, 4);
}
function die(s: Game) {
  if (s.phase !== "playing") return;
  s.phase = "dead";
  s.deaths++;
  s.deathTimer = 0.65;
  s.shake = 0.15;
  burst(s, s.player.x + 13, s.player.y + 22, 0xe59b91, 20);
  event(s, "hurt");
}
export function respawn(s: Game) {
  s.player = playerAt(s.checkpoint);
  s.player.invincible = 1.8;
  s.enemies = spawnEnemies(s.level);
  s.projectiles = [];
  s.crumble = {};
  s.stars = [...s.checkpointStars];
  s.collected = [...s.checkpointCollected];
  s.coins = s.checkpointCoins;
  s.phase = "playing";
  s.bossLock = false;
  s.camera = Math.max(
    0,
    Math.min(LEVELS[s.level].width - WIDTH, s.checkpoint - 250),
  );
  toast(s, "深呼吸，再来一次。检查点就在这里。", 2);
}
function hurt(s: Game, fromX: number) {
  const p = s.player;
  if (p.invincible > 0 || s.phase !== "playing") return;
  p.health--;
  p.invincible = s.save.assist ? 2.8 : 1.6;
  p.vx = p.x < fromX ? -180 : 180;
  p.vy = -240;
  s.shake = 0.18;
  event(s, "hurt");
  burst(s, p.x + 13, p.y + 22, 0xe9aa9d);
  if (p.health <= 0) die(s);
}
function killEnemy(s: Game, e: Enemy) {
  e.alive = false;
  burst(s, e.x + e.w / 2, e.y + 20, 0xf2d17b, 18);
  event(s, "stomp");
  s.coins += e.kind === "director" ? 20 : 2;
  if (e.kind === "director") {
    toast(s, "彩排通过！舞台的灯已经为你亮起。", 4);
    s.bossLock = false;
    s.projectiles = [];
  }
}
function shoot(s: Game, e: Enemy, target: number, bomb: boolean) {
  const sx = e.x + e.w / 2;
  const sy = e.y + 16;
  const duration = 1.15;
  const shot: Projectile = {
    x: sx,
    y: sy,
    w: bomb ? 14 : 30,
    h: bomb ? 14 : 8,
    vx: bomb ? (target - sx) / duration : s.player.x < sx ? -290 : 290,
    vy: bomb ? (GROUND - sy - 0.5 * 1050 * duration * duration) / duration : 0,
    type: bomb ? "bomb" : "arrow",
    life: bomb ? 4 : 4.5,
    fuse: -1,
    target,
    targetY: GROUND,
    exploded: false,
  };
  if (bomb) {
    const preview = { ...shot };
    const dt = 1 / 120;
    for (let i = 0; i < 240; i++) {
      const bottom = preview.y + preview.h;
      preview.vy += 1050 * dt;
      preview.x += preview.vx * dt;
      preview.y += preview.vy * dt;
      const floor = LEVELS[s.level].platforms
        .map((p) => platformPosition(p, s.time + i * dt))
        .find(
          (p) => preview.x + preview.w > p.x &&
            preview.x < p.x + p.w &&
            bottom <= p.y + 3 &&
            preview.y + preview.h >= p.y &&
            preview.vy > 0,
        );
      if (floor) {
        shot.target = preview.x;
        shot.targetY = floor.y;
        break;
      }
    }
  }
  s.projectiles.push(shot);
  event(s, bomb ? "cannon" : "arrow");
}
function updateEnemies(
  s: Game,
  dt: number,
  blocks: ReturnType<typeof surfaces>,
) {
  const p = s.player;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    if (Math.abs(e.x - p.x) > 850) continue;
    if (Math.abs(e.x - p.x) < 530) discover(s, e.kind);
    e.stun = Math.max(0, e.stun - dt);
    e.timer -= dt;
    const previousY = e.y;
    if (e.kind === "flyer") {
      e.x =
        e.left + (Math.sin(s.time * 1.1 + e.id) + 1) * 0.5 * (e.right - e.left);
      e.y = e.homeY + Math.sin(s.time * 2 + e.id) * 38;
    } else if (
      e.kind === "archer" ||
      e.kind === "mortar" ||
      e.kind === "director"
    ) {
      if (e.timer <= 0 && e.stun <= 0) {
        const bomb = e.kind !== "archer";
        const target = Math.max(
          e.x - 450,
          Math.min(e.x + 450, p.x + p.vx * 0.32),
        );
        shoot(s, e, target, bomb);
        e.timer = e.kind === "director" ? 2.8 : e.kind === "mortar" ? 3.2 : 2.5;
      }
      if (e.kind === "director") {
        e.x += Math.sin(s.time * 1.3) * 28 * dt;
        if (p.x > 6320) s.bossLock = true;
      }
    } else {
      if (e.kind === "hopper") {
        if (e.grounded && e.timer <= 0) {
          e.vy = -410;
          e.direction = p.x < e.x ? -1 : 1;
          e.vx = e.direction * 105;
          e.timer = 1.8;
        }
        if (e.grounded && e.timer > 0) e.vx *= 0.7;
      } else e.vx = e.shell ? e.vx : e.direction * (e.kind === "walker" ? 45 : 54);
      if (!e.shell && (e.x <= e.left || e.x >= e.right)) {
        e.direction *= -1;
        e.x = Math.max(e.left, Math.min(e.right, e.x));
      }
      if (e.grounded && e.vx !== 0 && !e.shell) {
        const ahead = e.x + (e.vx > 0 ? e.w + 7 : -7);
        if (
          !blocks.some(
            (b) => ahead >= b.x &&
              ahead <= b.x + b.w &&
              Math.abs(b.y - (e.y + e.h)) < 12,
          )
        ) {
          e.direction *= -1;
          e.vx *= -1;
        }
      }
      e.vy += PHYSICS.gravity * dt;
      const oldVx = e.vx;
      e.grounded = moveBody(e, dt, blocks, true) !== -1;
      if (oldVx !== 0 && e.vx === 0) {
        e.vx = -oldVx;
        e.direction *= -1;
      }
      if (e.y > HEIGHT + 80 || e.x < -80) {
        e.alive = false;
        continue;
      }
    }
    if (e.shell && Math.abs(e.vx) > 100) {
      for (const other of s.enemies) if (other !== e && other.alive && overlaps(e, other)) {
          if (other.kind !== "director") killEnemy(s, other);
        }
    }
    if (!overlaps(p, e) || e.stun > 0) continue;
    const stomp =
      p.vy >= 0 && p.y + p.h - p.vy * dt <= previousY + Math.max(14, e.h * 0.3);
    if (stomp) {
      if (e.kind === "director" && e.timer < 0.8) {
        hurt(s, e.x);
        continue;
      }
      p.y = e.y - p.h;
      p.vy = p.jumpHeld ? -560 : -390;
      p.grounded = false;
      p.squash = -0.2;
      event(s, "stomp");
      if (e.kind === "shell") {
        if (!e.shell) {
          e.shell = true;
          e.h = 24;
          e.y += 16;
          e.vx = 0;
        } else e.vx = Math.abs(e.vx) > 0 ? 0 : (p.x < e.x ? 1 : -1) * 380;
        e.stun = 0.18;
      } else if (e.kind === "director") {
        e.hp--;
        e.stun = 1.4;
        e.timer = 2.8;
        burst(s, e.x, e.y, 0xffd588, 20);
        if (e.hp <= 0) killEnemy(s, e);
      } else killEnemy(s, e);
    } else if (e.shell && Math.abs(e.vx) < 1) {
      e.vx = (p.x < e.x ? 1 : -1) * 380;
      e.stun = 0.25;
      event(s, "stomp");
    } else hurt(s, e.x);
  }
}
function collect(s: Game, item: Pickup) {
  s.collected.push(item.id);
  if (item.kind === "coin") {
    s.coins++;
    event(s, "coin");
  }
  if (item.kind === "star") {
    s.stars.push(item.id);
    toast(s, `星光信物 ${s.stars.length} / 3`, 2);
    event(s, "star");
  }
  if (item.kind === "heart") {
    s.player.health = Math.min(3, s.player.health + 1);
    event(s, "heart");
  }
  burst(s, item.x, item.y, item.kind === "heart" ? 0xe98e92 : 0xe9bb5e, 8);
}
function finish(s: Game) {
  s.phase = "clear";
  event(s, "clear");
  const old = s.save.best[s.level];
  const stars = Array.from(new Set([...(old?.stars || []), ...s.stars]));
  s.save.best[s.level] = {
    stars,
    coins: Math.max(old?.coins || 0, s.coins),
    time: old?.time ? Math.min(old.time, s.clock) : s.clock,
    deaths: old ? Math.min(old.deaths, s.deaths) : s.deaths,
  };
  s.save.unlocked = Math.max(s.save.unlocked, Math.min(3, s.level + 1));
  event(s, "save");
  burst(s, s.player.x, 250, 0xf9d678, 60);
}
export function stepGame(s: Game, input: Input, dt = 1 / 120) {
  if (s.phase === "paused" || s.phase === "title") return;
  s.time += dt;
  s.toastTimer = Math.max(0, s.toastTimer - dt);
  s.shake = Math.max(0, s.shake - dt);
  s.particles = s.particles.filter((v) => v.life > 0);
  for (const v of s.particles) {
    v.life -= dt;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.vy += 200 * dt;
  }
  if (s.phase === "clear") return;
  if (s.phase === "dead") {
    s.deathTimer -= dt;
    if (s.deathTimer <= 0) respawn(s);
    return;
  }
  s.clock += dt;
  const p = s.player;
  const level = LEVELS[s.level];
  const blocks = surfaces(s);
  for (const key of Object.keys(s.crumble)) {
    const i = Number(key);
    s.crumble[i] += dt;
    if (s.crumble[i] > 4.2) delete s.crumble[i];
  }
  p.invincible = Math.max(0, p.invincible - dt);
  p.squash *= Math.exp(-dt * 16);
  p.coyote = p.grounded ? PHYSICS.coyote : Math.max(0, p.coyote - dt);
  if (input.jump && !p.jumpHeld) p.buffered = PHYSICS.buffer;
  else p.buffered = Math.max(0, p.buffered - dt);
  if (!input.jump && p.jumpHeld && p.vy < -200) p.vy *= 0.48;
  p.jumpHeld = input.jump;
  const dir = Number(input.right) - Number(input.left);
  const max = input.run ? PHYSICS.run : PHYSICS.walk;
  if (dir !== 0) {
    const accel = p.grounded ? PHYSICS.acceleration : PHYSICS.airAcceleration;
    const difference = dir * max - p.vx;
    p.vx += Math.sign(difference) * Math.min(Math.abs(difference), accel * dt);
    p.facing = dir;
  } else if (p.grounded) {
    const decel = PHYSICS.friction * dt;
    p.vx = Math.abs(p.vx) < decel ? 0 : p.vx - Math.sign(p.vx) * decel;
  } else p.vx *= Math.exp(-0.3 * dt);
  if (p.buffered > 0 && p.coyote > 0) {
    p.vy = -PHYSICS.jump;
    p.grounded = false;
    p.coyote = 0;
    p.buffered = 0;
    p.squash = -0.18;
    event(s, "jump");
    burst(s, p.x + 13, p.y + 44, 0xf0e3bb, 5);
  }
  const gravity =
    p.vy < 0 && input.jump ? PHYSICS.gravity * 0.78 : PHYSICS.gravity * 1.12;
  p.vy = Math.min(830, p.vy + gravity * dt);
  const fallingSpeed = p.vy;
  const landed = moveBody(p, dt, blocks, true);
  const wasGrounded = p.grounded;
  p.grounded = landed !== -1;
  if (landed !== -1) {
    const surface = level.platforms[landed];
    if (surface.kind === "moving") p.x +=
        Math.cos(s.time * (surface.speed || 0.8)) *
        (surface.move || 45) *
        (surface.speed || 0.8) *
        dt;
    if (surface.kind === "crumble" && !s.crumble[landed]) s.crumble[landed] = dt;
    if (!wasGrounded && fallingSpeed > 200) {
      p.squash = 0.24;
      burst(s, p.x + 13, p.y + 44, 0xf1dfb0, 6);
      event(s, "land");
    }
  }
  p.x = Math.max(0, Math.min(level.width - p.w, p.x));
  if (s.bossLock) p.x = Math.max(6300, Math.min(7190, p.x));
  if (p.y > HEIGHT + 65) {
    die(s);
    return;
  }
  for (const spring of level.springs) if (
      p.vy >= 0 &&
      overlaps(p, { x: spring.x - 20, y: spring.y - 18, w: 40, h: 20 })
    ) {
      p.vy = -790;
      p.grounded = false;
      p.coyote = 0;
      event(s, "spring");
      burst(s, spring.x, spring.y - 15, 0x89b7a7, 14);
    }
  for (const item of level.pickups) if (
      !s.collected.includes(item.id) &&
      overlaps(p, { x: item.x - 12, y: item.y - 14, w: 24, h: 28 })
    ) collect(s, item);
  for (const cp of level.checkpoints) if (p.x >= cp && cp > s.checkpoint && p.grounded) {
      s.checkpoint = cp;
      s.checkpointStars = [...s.stars];
      s.checkpointCollected = [...s.collected];
      s.checkpointCoins = s.coins;
      s.checkpointTime = s.clock;
      p.health = 3;
      event(s, "checkpoint");
      toast(s, "检查点已点亮 · 爱心补满", 3);
      burst(s, cp, GROUND - 70, 0xffd46d, 25);
    }
  updateEnemies(s, dt, blocks);
  for (const h of level.hazards) {
    if (h.kind === "spikes") {
      if (overlaps(p, { x: h.x + 5, y: h.y - 18, w: h.w - 10, h: 18 })) hurt(s, h.x + h.w / 2);
    } else {
      const pos = pendulumPosition(h, s.time);
      if (Math.hypot(p.x + 13 - pos.x, p.y + 22 - pos.y) < 35) hurt(s, pos.x);
    }
  }
  for (const shot of s.projectiles) {
    shot.life -= dt;
    if (shot.type === "bomb") {
      if (shot.fuse < 0) {
        const beforeY = shot.y + shot.h;
        shot.vy += 1050 * dt;
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        const floor = blocks.find(
          (b) => shot.x + shot.w > b.x &&
            shot.x < b.x + b.w &&
            beforeY <= b.y + 3 &&
            shot.y + shot.h >= b.y &&
            shot.vy > 0,
        );
        if (floor) {
          shot.y = floor.y - shot.h;
          shot.fuse = 0.6;
          shot.vx = 0;
          shot.vy = 0;
        }
        if (shot.y > 620) shot.life = 0;
      } else {
        shot.fuse -= dt;
        if (shot.fuse <= 0 && !shot.exploded) {
          shot.exploded = true;
          shot.life = 0.2;
          burst(s, shot.x, shot.y, 0xf0ac69, 24);
          event(s, "boom");
          if (Math.hypot(p.x + 13 - shot.x, p.y + 22 - shot.y) < 66) hurt(s, shot.x);
        }
      }
    } else {
      shot.x += shot.vx * dt;
      if (
        blocks.some(
          (b) => (b.kind === "grass" || b.kind === "brick") && overlaps(shot, b),
        )
      ) shot.life = 0;
      if (shot.life > 0 && overlaps(shot, p)) {
        hurt(s, shot.x);
        shot.life = 0;
      }
    }
  }
  s.projectiles = s.projectiles.filter(
    (v) => v.life > 0 && Math.abs(v.x - p.x) < 1400,
  );
  if (
    p.x > level.goal &&
    !s.enemies.some((e) => e.kind === "director" && e.alive)
  ) finish(s);
  const target = Math.max(
    0,
    Math.min(level.width - WIDTH, p.x - WIDTH * (p.facing > 0 ? 0.33 : 0.48)),
  );
  s.camera += (target - s.camera) * (1 - Math.exp(-dt * 6));
}
export function publicState(s: Game) {
  return {
    title: "岁己 · 春日第一封信",
    coordinates: "origin top-left; +x right, +y down; pixels",
    phase: s.phase,
    level: LEVELS[s.level].id,
    player: {
      x: +s.player.x.toFixed(2),
      y: +s.player.y.toFixed(2),
      vx: +s.player.vx.toFixed(2),
      vy: +s.player.vy.toFixed(2),
      grounded: s.player.grounded,
      health: s.player.health,
      invincible: +s.player.invincible.toFixed(2),
    },
    camera: Math.round(s.camera),
    checkpoint: s.checkpoint,
    coins: s.coins,
    stars: s.stars,
    deaths: s.deaths,
    time: +s.clock.toFixed(2),
    goal: LEVELS[s.level].goal,
    unlocked: s.save.unlocked,
    discovered: s.save.discovered,
    enemies: s.enemies
      .filter((e) => e.alive && Math.abs(e.x - s.player.x) < 850)
      .map((e) => ({
        kind: e.kind,
        x: Math.round(e.x),
        y: Math.round(e.y),
        shell: e.shell,
        vx: Math.round(e.vx),
        hp: e.hp,
        telegraph: e.timer < 0.8,
      })),
    projectiles: s.projectiles.map((e) => ({
      type: e.type,
      x: Math.round(e.x),
      y: Math.round(e.y),
      target: Math.round(e.target),
      fuse: e.fuse,
    })),
    toast: s.toastTimer > 0 ? s.toast : "",
    bossLock: s.bossLock,
  };
}
