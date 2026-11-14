/** ECHO ZERO — deterministic combat / AI simulation. No DOM, no three.js. */

import {
  ENEMY_STATS, FLASK_MAX, MOVES, PLAYER_MAX_HP, PLAYER_MAX_POSTURE, PLAYER_MAX_STAMINA,
  type Action, type EffectKind, type Enemy, type EnemyKind, type GameState, type Input, type Notice,
} from './types';
import { LEVEL, RADIO_LINES, SPAWNS, areaName, resolvePosition } from './world';

const { PI } = Math;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const distance = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const facing = (dx: number, dz: number) => Math.atan2(dx, -dz);
const angleDelta = (a: number, b: number) => {
  let d = (b - a + PI) % (PI * 2);
  if (d < 0) d += PI * 2;
  return d - PI;
};
const lerpAngle = (a: number, b: number, t: number) => a + angleDelta(a, b) * clamp(t, 0, 1);
const forward = (yaw: number) => ({ x: Math.sin(yaw), z: -Math.cos(yaw) });

function makeEnemy(id: number, kind: EnemyKind, x: number, z: number, time: number): Enemy {
  const stat = ENEMY_STATS[kind];
  return {
    id,
kind,
x,
z,
yaw: PI,
homeX: x,
homeZ: z,
    hp: stat.hp,
maxHp: stat.hp,
posture: 0,
maxPosture: stat.posture,
    state: 'dormant',
timer: 0,
attack: 'claw',
attackHit: false,
    aggro: stat.aggro,
staggerTime: 0,
flash: 0,
phase: 1,
    spawnAt: time,
dead: false,
active: false,
  };
}

export function createGame(): GameState {
  return {
    phase: 'title',
time: 0,
stage: 0,
    objective: '序章 · 雨落在第七区',
    areaName: areaName(LEVEL.startZ),
    player: {
      x: LEVEL.startX,
z: LEVEL.startZ,
yaw: 0,
vx: 0,
vz: 0,
      hp: PLAYER_MAX_HP,
maxHp: PLAYER_MAX_HP,
      stamina: PLAYER_MAX_STAMINA,
maxStamina: PLAYER_MAX_STAMINA,
      posture: 0,
maxPosture: PLAYER_MAX_POSTURE,
      action: 'idle',
actionTime: 0,
actionDuration: 0,
actionHit: false,
      combo: 0,
comboWindow: 0,
charge: 0,
invuln: 0,
staminaDelay: 0,
      guardHeld: false,
flasks: FLASK_MAX,
deaths: 0,
staggerTime: 0,
      speed: 0,
hurtFlash: 0,
    },
    enemies: [],
lockId: null,
    camera: { yaw: 0, pitch: 0.34, distance: 5.8, shake: 0, fov: 54, cinematic: 0, cinematicBlend: 0 },
    checkpoint: { x: LEVEL.checkpoint.x, z: LEVEL.checkpoint.z, lit: false },
    effects: [],
notices: [],
bossActive: false,
bossDefeated: false,
    hitStop: 0,
slowMo: 0,
fade: 1,
deadTimer: 0,
endingTimer: 0,
skipHeld: 0,
    hints: { move: false, attack: false, deflect: false, lock: false, checkpoint: false },
    stats: { hits: 0, deflects: 0, deathblows: 0, damageTaken: 0, deaths: 0 },
    nextId: 1,
tutorialKills: 0,
introLine: 0,
  };
}

function pushEffect(s: GameState, kind: EffectKind, x: number, z: number, yaw: number, ttl = 0.5, y = 1, power = 1) {
  s.effects.push({ id: s.nextId++, kind, x, z, y, yaw, at: s.time, ttl, power });
  if (s.effects.length > 90) s.effects.splice(0, s.effects.length - 90);
}

export function pushNotice(s: GameState, text: string, tone: Notice['tone'] = 'system', speaker?: string, ttl = 3.2) {
  s.notices.push({ id: s.nextId++, text, speaker, at: s.time, ttl, tone });
  if (s.notices.length > 8) s.notices.splice(0, s.notices.length - 8);
}

/** Begin the chapter: reset to the opening cinematic. */
export function startGame(s: GameState, continueFromCheckpoint = false) {
  const resume = continueFromCheckpoint && s.checkpoint.lit;
  const fresh = createGame();
  Object.assign(s, fresh);
  s.time = 0;
  s.fade = 0;
  if (resume) {
    s.checkpoint.lit = true;
    s.phase = 'play';
    s.player.x = s.checkpoint.x;
    s.player.z = s.checkpoint.z + 3;
    s.player.yaw = 0;
    s.stage = 4;
    s.objective = '穿过检疫封锁线';
    pushNotice(s, '信号塔坐标已恢复。', 'radio', '栞栞', 4);
  } else {
    s.phase = 'opening';
    s.camera.cinematicBlend = 1;
    pushNotice(s, '第七区 · 零日封锁  /  第 214 天', 'lore', undefined, 5.2);
  }
}

export function respawn(s: GameState) {
  const p = s.player;
  s.enemies = [];
  s.effects = [];
  s.notices = [];
  s.lockId = null;
  s.bossActive = false;
  s.hitStop = 0;
  s.slowMo = 0;
  s.deadTimer = 0;
  s.phase = 'play';
  s.fade = 0;
  s.stage = Math.max(3, s.stage);
  s.objective = s.checkpoint.lit ? '穿过检疫封锁线' : '点亮信号塔';
  p.x = s.checkpoint.lit ? s.checkpoint.x : LEVEL.startX;
  p.z = s.checkpoint.lit ? s.checkpoint.z + 3 : LEVEL.startZ;
  p.yaw = 0; p.vx = 0; p.vz = 0;
  p.hp = p.maxHp; p.stamina = p.maxStamina; p.posture = 0;
  p.action = 'getup'; p.actionTime = 0; p.actionDuration = 0.8; p.actionHit = false;
  p.invuln = 1.2; p.flasks = FLASK_MAX; p.staggerTime = 0;
  p.hurtFlash = 0; p.combo = 0; p.comboWindow = 0; p.guardHeld = false;
  s.camera.shake = 0;
  pushNotice(s, s.checkpoint.lit ? '信号塔 · 坐标重载' : '你在雨里醒来。', 'system', undefined, 3.4);
}

export function togglePause(s: GameState) {
  if (s.phase === 'play') s.phase = 'paused';
  else if (s.phase === 'paused') s.phase = 'play';
}

function isBusy(action: Action) {
  return !['idle', 'run', 'sprint', 'guard'].includes(action);
}

function isAttack(action: Action) {
  return ['light1', 'light2', 'light3', 'heavy', 'dashSlash'].includes(action);
}

function faceLock(s: GameState) {
  const e = s.enemies.find(en => en.id === s.lockId && !en.dead && en.state !== 'deathblow');
  if (!e) return;
  s.player.yaw = facing(e.x - s.player.x, e.z - s.player.z);
}

function startAction(s: GameState, action: Action, duration: number) {
  const p = s.player;
  p.action = action;
  p.actionTime = 0;
  p.actionDuration = duration;
  p.actionHit = false;
  p.guardHeld = action === 'guard';
}

function startAttack(s: GameState, key: keyof typeof MOVES) {
  const m = MOVES[key];
  const p = s.player;
  p.stamina = Math.max(0, p.stamina - m.stamina);
  p.staminaDelay = 0.62;
  p.combo = key === 'light1' ? 1 : key === 'light2' ? 2 : key === 'light3' ? 3 : 0;
  p.comboWindow = 0;
  faceLock(s);
  startAction(s, key as Action, m.windup + m.active + m.recovery);
  pushEffect(s, key === 'heavy' ? 'dust' : 'slash', p.x, p.z, p.yaw, 0.28, 0.9, 0.6);
}

function hurtEnemy(s: GameState, e: Enemy, damage: number, posture: number, heavy = false) {
  if (e.dead || e.state === 'deathblow') return;
  e.hp -= damage;
  e.posture += posture;
  e.flash = 1;
  s.stats.hits += 1;
  pushEffect(s, 'spark', e.x, e.z, s.player.yaw, 0.32, 1.15, heavy ? 1.6 : 1);
  s.hitStop = Math.max(s.hitStop, heavy ? 0.085 : 0.055);
  s.camera.shake += heavy ? 0.5 : 0.28;
  if (heavy && e.state === 'tell' && e.kind !== 'boss') {
    e.state = 'recover';
    e.timer = 0.5;
    e.attackHit = true;
  }
  if (e.posture >= e.maxPosture && e.state !== 'stagger') {
    e.state = 'stagger';
    e.staggerTime = e.kind === 'boss' ? 3.2 : 2.8;
    e.posture = e.maxPosture;
    pushEffect(s, 'guardBreak', e.x, e.z, e.yaw, 0.7, 1.5, 1.4);
    pushNotice(s, e.kind === 'boss' ? '架势已破 —— 靠近按 E 忍杀' : '架势已破 · E 忍杀', 'danger', undefined, 2.6);
    s.hitStop = Math.max(s.hitStop, 0.14);
  } else if (e.hp <= 0) {
    if (e.kind === 'boss') {
      e.state = 'stagger';
      e.staggerTime = 6;
      e.posture = e.maxPosture;
      pushNotice(s, '零号 · 回声 失去响应 —— 靠近按 E 终结', 'danger', undefined, 4);
    } else {
      e.dead = true;
      e.state = 'dead';
      s.tutorialKills += 1;
      pushEffect(s, 'dust', e.x, e.z, e.yaw, 0.7, 0.4, 1.2);
    }
  }
}

function resolvePlayerHit(s: GameState, key: keyof typeof MOVES) {
  const p = s.player;
  const m = MOVES[key];
  const f = forward(p.yaw);
  let landed = false;
  for (const e of s.enemies) {
    if (e.dead || e.state === 'deathblow') continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > m.reach + (e.kind === 'boss' ? 0.8 : 0.3)) continue;
    const dot = (dx * f.x + dz * f.z) / Math.max(0.001, d);
    if (Math.acos(clamp(dot, -1, 1)) > m.arc / 2) continue;
    hurtEnemy(s, e, m.damage, m.posture, key === 'heavy' || key === 'light3' || key === 'dashSlash');
    landed = true;
  }
  pushEffect(
s,
key === 'heavy' || key === 'light3' ? 'heavySlash' : 'slash',
p.x + f.x * 0.8,
p.z + f.z * 0.8,
p.yaw,
0.26,
1.05,
key === 'heavy' ? 1.7 : 1
);
  if (landed) p.stamina = Math.min(p.maxStamina, p.stamina + 4);
}

function hurtPlayer(s: GameState, damage: number, posture: number, source: Enemy) {
  const p = s.player;
  p.hp = Math.max(0, p.hp - damage);
  p.posture = Math.min(p.maxPosture, p.posture + posture);
  p.hurtFlash = 1;
  p.invuln = 0.42;
  p.staminaDelay = 0.8;
  s.stats.damageTaken += damage;
  s.camera.shake += 0.55;
  s.hitStop = Math.max(s.hitStop, 0.075);
  pushEffect(s, 'damage', p.x, p.z, source.yaw, 0.45, 1.1, 1);
  if (p.posture >= p.maxPosture && p.staggerTime <= 0) {
    p.posture = 0;
    p.staggerTime = 1.5;
    pushEffect(s, 'guardBreak', p.x, p.z, p.yaw, 0.6, 1.2, 1.2);
    pushNotice(s, '架势崩溃', 'danger', undefined, 2);
  }
  if (p.hp <= 0) {
    s.phase = 'dead';
    s.deadTimer = 0;
    p.action = 'dead';
    p.deaths += 1;
    s.stats.deaths += 1;
    pushEffect(s, 'damage', p.x, p.z, p.yaw, 1.2, 1, 2);
  } else {
    startAction(s, 'hit', 0.38);
  }
}

function resolveEnemyStrike(s: GameState, e: Enemy) {
  const p = s.player;
  const stat = ENEMY_STATS[e.kind];
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const d = Math.hypot(dx, dz);
  const wide = e.attack === 'shockwave' ? 7.2 : e.attack === 'slam' ? 3.7 : stat.range + 0.45;
  const ef = forward(e.yaw);
  const dot = (dx * ef.x + dz * ef.z) / Math.max(0.001, d);
  const inArc = e.attack === 'shockwave' || e.attack === 'slam' || Math.acos(clamp(dot, -1, 1)) < 1.05;
  if (d > wide || !inArc) {
    pushEffect(s, 'dust', e.x + ef.x * 1.2, e.z + ef.z * 1.2, e.yaw, 0.45, 0.15, 0.8);
    return;
  }
  const deflecting = p.action === 'deflect' && p.actionTime <= 0.24;
  const guarding = p.guardHeld || p.action === 'guard';
  if (deflecting && e.attack !== 'shockwave') {
    e.posture = Math.min(e.maxPosture, e.posture + (e.kind === 'boss' ? 34 : 48));
    e.state = 'recover';
    e.timer = Math.min(e.timer, 0.42);
    p.posture = Math.max(0, p.posture - 14);
    p.stamina = Math.min(p.maxStamina, p.stamina + 7);
    s.stats.deflects += 1;
    s.hitStop = Math.max(s.hitStop, 0.13);
    s.camera.shake += 0.62;
    pushEffect(s, 'deflect', p.x + ef.x * -0.8, p.z + ef.z * -0.8, p.yaw, 0.5, 1.15, 1.5);
    if (!s.hints.deflect) {
      s.hints.deflect = true;
      pushNotice(s, '在攻击命中前一瞬按 F —— 弹反能击碎对方架势。', 'radio', '栞栞', 4.6);
    }
    if (e.posture >= e.maxPosture) hurtEnemy(s, e, 0, 0);
    return;
  }
  const evading = p.action === 'dodge' && p.actionTime > 0.04 && p.actionTime < 0.35;
  if (p.invuln > 0 || evading) {
    pushEffect(s, 'dust', p.x, p.z, p.yaw, 0.3, 0.3, 0.6);
    return;
  }
  if (guarding && p.stamina > 8 && e.attack !== 'shockwave') {
    p.stamina = Math.max(0, p.stamina - 15);
    p.posture = Math.min(p.maxPosture, p.posture + stat.postureDamage * 0.75);
    p.hp = Math.max(0, p.hp - stat.damage * 0.16);
    p.staminaDelay = 0.9;
    s.camera.shake += 0.22;
    pushEffect(s, 'spark', p.x + ef.x * -0.6, p.z + ef.z * -0.6, p.yaw, 0.3, 1, 0.8);
    if (p.posture >= p.maxPosture) {
      p.posture = 0;
      p.staggerTime = 1.5;
      pushNotice(s, '防御崩溃', 'danger', undefined, 2);
      pushEffect(s, 'guardBreak', p.x, p.z, p.yaw, 0.6, 1.2, 1.2);
    }
    return;
  }
  hurtPlayer(s, stat.damage * (e.attack === 'shockwave' ? 1.15 : 1), stat.postureDamage, e);
}

function performDeathblow(s: GameState, target: Enemy) {
  const p = s.player;
  p.yaw = facing(target.x - p.x, target.z - p.z);
  startAction(s, 'deathblow', 1.15);
  target.state = 'deathblow';
  target.timer = 0;
  target.dead = true;
  target.hp = 0;
  s.stats.deathblows += 1;
  s.tutorialKills += target.kind === 'boss' ? 0 : 1;
  s.hitStop = 0.3;
  s.slowMo = 1;
  s.camera.shake += 1.1;
  s.camera.fov = 44;
  pushEffect(s, 'deathblow', target.x, target.z, p.yaw, 0.9, 1.2, 2.2);
  if (target.kind === 'boss') {
    s.bossDefeated = true;
    s.bossActive = false;
    s.lockId = null;
    s.stage = 5;
    s.objective = '序章 · 完成';
    pushNotice(s, '零号信号消失。第七区，安静了一秒。', 'radio', '栞栞', 5.5);
  } else {
    pushNotice(s, '忍杀', 'system', undefined, 1.1);
  }
}

function updatePlayer(s: GameState, dt: number, input: Input) {
  const p = s.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 2.6);
  p.staminaDelay = Math.max(0, p.staminaDelay - dt);
  p.comboWindow = Math.max(0, p.comboWindow - dt);
  if (p.staminaDelay <= 0) p.stamina = Math.min(p.maxStamina, p.stamina + 29 * dt);
  p.posture = Math.max(0, p.posture - (p.guardHeld ? 3 : 13) * dt);
  if (s.slowMo > 0) s.slowMo = Math.max(0, s.slowMo - dt * 1.7);

  if (p.staggerTime > 0) {
    p.staggerTime -= dt;
    p.vx = 0; p.vz = 0; p.speed = 0;
    if (p.staggerTime <= 0) startAction(s, 'idle', 0);
    return;
  }

  if (input.guard && !isBusy(p.action)) {
    if (p.action !== 'guard') startAction(s, 'guard', 0);
    p.guardHeld = true;
  } else if (!input.guard && p.action === 'guard') {
    p.guardHeld = false;
    startAction(s, 'idle', 0);
  }

  // Action state machine -------------------------------------------------
  if (p.action !== 'idle' && p.action !== 'run' && p.action !== 'sprint' && p.action !== 'guard') {
    p.actionTime += dt;
    const attacking = isAttack(p.action);
    if (attacking && !p.actionHit) {
      const m = MOVES[p.action as keyof typeof MOVES];
      if (p.actionTime >= m.windup) {
        p.actionHit = true;
        resolvePlayerHit(s, p.action as keyof typeof MOVES);
      }
    }
    if (p.action === 'dodge') {
      const t = clamp(p.actionTime / p.actionDuration, 0, 1);
      const impulse = t < 0.72 ? (1 - t / 0.72) * 7.4 : 0;
      const f = forward(p.yaw);
      const next = resolvePosition(p.x + f.x * impulse * dt, p.z + f.z * impulse * dt);
      p.x = next.x; p.z = next.z;
      if (Math.floor(p.actionTime * 20) !== Math.floor((p.actionTime - dt) * 20)) {
        pushEffect(s, 'dust', p.x, p.z, p.yaw, 0.36, 0.15, 0.55);
      }
    }
    if (p.action === 'heal' && !p.actionHit && p.actionTime >= 0.55) {
      p.actionHit = true;
      p.hp = Math.min(p.maxHp, p.hp + 58);
      p.flasks -= 1;
      pushEffect(s, 'heal', p.x, p.z, p.yaw, 0.85, 1, 1.4);
    }
    if (p.action === 'getup' || p.action === 'hit' || p.action === 'deathblow' || p.action === 'deflect' || p.action === 'heal') {
      p.vx = 0; p.vz = 0;
    }
    if (attacking) {
      const m = MOVES[p.action as keyof typeof MOVES];
      if (p.actionTime < m.windup + m.active) {
        const lunge = m.lunge * (p.actionTime < m.windup ? 0.35 : 2.4);
        const f = forward(p.yaw);
        const next = resolvePosition(p.x + f.x * lunge * dt, p.z + f.z * lunge * dt);
        p.x = next.x; p.z = next.z;
      }
    }
    if (p.actionTime >= p.actionDuration) {
      const finished = p.action;
      if (isAttack(finished)) p.comboWindow = 0.34;
      p.combo = isAttack(finished) ? p.combo : 0;
      startAction(s, 'idle', 0);
      p.guardHeld = input.guard;
    }
  }

  const canAct = !isBusy(s.player.action) || (isAttack(p.action) && p.actionTime > p.actionDuration * 0.52);
  if (canAct) {
    if (input.deflect && p.stamina >= 8 && p.action !== 'deflect') {
      p.stamina -= 8;
      p.staminaDelay = 0.5;
      faceLock(s);
      startAction(s, 'deflect', 0.38);
      pushEffect(s, 'deflect', p.x, p.z, p.yaw, 0.22, 1.05, 0.45);
      return;
    }
    if (input.dodge && p.stamina >= 20 && p.action !== 'dodge') {
      p.stamina -= 20;
      p.staminaDelay = 0.65;
      if (input.x === 0 && input.z === 0) {
        const e = s.enemies.find(en => en.id === s.lockId && !en.dead);
        if (e) p.yaw = facing(e.x - p.x, e.z - p.z) + PI;
      } else {
        p.yaw = moveYaw(input, s.camera.yaw);
      }
      startAction(s, 'dodge', 0.48);
      return;
    }
    if (input.heavy && p.stamina >= MOVES.heavy.stamina) {
      startAttack(s, input.sprint ? 'dashSlash' : 'heavy');
      return;
    }
    if (input.light && p.stamina >= 12) {
      const next = isAttack(p.action) && p.combo < 3 && p.combo > 0 ? `light${p.combo + 1}` as keyof typeof MOVES :
        p.comboWindow > 0 && p.combo === 1 ? 'light2' : 'light1';
      startAttack(s, input.sprint ? 'dashSlash' : next);
      s.hints.attack = true;
      return;
    }
    if (input.heal && p.flasks > 0 && p.hp < p.maxHp) {
      startAction(s, 'heal', 1.0);
      return;
    }
  }

  // Locomotion ------------------------------------------------------------
  const cam = s.camera.yaw;
  const f = { x: Math.sin(cam), z: -Math.cos(cam) };
  const r = { x: Math.cos(cam), z: Math.sin(cam) };
  let dx = r.x * input.x + f.x * -input.z;
  let dz = r.z * input.x + f.z * -input.z;
  const len = Math.hypot(dx, dz);
  if (len > 0.001) { dx /= len; dz /= len; }
  const sprinting = input.sprint && len > 0.01 && p.stamina > 6 && !isBusy(p.action);
  if (sprinting) {
    p.stamina = Math.max(0, p.stamina - 17 * dt);
    p.staminaDelay = 0.45;
  }
  const speed = isBusy(p.action) ? (isAttack(p.action) ? 0.7 : 0) : (sprinting ? 6.5 : len > 0.01 ? 3.6 : 0);
  const targetVx = dx * speed;
  const targetVz = dz * speed;
  const ease = Math.min(1, dt * 13);
  p.vx += (targetVx - p.vx) * ease;
  p.vz += (targetVz - p.vz) * ease;
  const next = resolvePosition(p.x + p.vx * dt, p.z + p.vz * dt);
  p.x = next.x; p.z = next.z;
  p.speed = Math.hypot(p.vx, p.vz);
  if (!isBusy(p.action)) {
    if (len > 0.01 && !s.lockId) p.yaw = lerpAngle(p.yaw, facing(dx, dz), dt * 9);
    const desired: Action = sprinting ? 'sprint' : len > 0.01 ? 'run' : 'idle';
    if (p.action !== desired) startAction(s, desired, 0);
    if (desired === 'idle') p.guardHeld = input.guard;
  }
  if (len > 0.01) s.hints.move = true;
}

function moveYaw(input: Input, camYaw: number) {
  const f = { x: Math.sin(camYaw), z: -Math.cos(camYaw) };
  const r = { x: Math.cos(camYaw), z: Math.sin(camYaw) };
  const dx = r.x * input.x + f.x * -input.z;
  const dz = r.z * input.x + f.z * -input.z;
  return facing(dx, dz);
}

function chooseBossAttack(e: Enemy, d: number): Enemy['attack'] {
  const cycle: Enemy['attack'][] = e.phase === 2
    ? ['lunge', 'sweep', 'shockwave', 'slam', 'sweep']
    : ['sweep', 'slam', 'lunge', 'sweep'];
  const pick = cycle[Math.floor(e.hp / 37) % cycle.length];
  if (d > 5.4) return 'lunge';
  return pick;
}

function updateEnemy(s: GameState, e: Enemy, dt: number) {
  if (e.dead && e.state !== 'deathblow') return;
  e.flash = Math.max(0, e.flash - dt * 3.4);
  e.posture = Math.max(0, e.posture - (e.state === 'stagger' ? 0 : 9) * dt);
  if (e.state === 'deathblow') {
    e.timer += dt;
    if (e.timer > 1.1) e.state = 'dead';
    return;
  }
  const p = s.player;
  const stat = ENEMY_STATS[e.kind];
  const d = distance(e.x, e.z, p.x, p.z);
  if (!e.active) {
    if (d < stat.aggro && s.phase === 'play') {
      e.active = true;
      e.state = 'chase';
      if (e.kind === 'boss') {
        s.bossActive = true;
        pushEffect(s, 'bossRoar', e.x, e.z, e.yaw, 1.2, 1.4, 2);
        pushNotice(s, '警告：零号个体已苏醒', 'danger', undefined, 3.5);
      } else {
        pushEffect(s, 'dust', e.x, e.z, e.yaw, 0.5, 0.4, 0.8);
      }
    } else return;
  }
  if (e.kind === 'boss' && e.phase === 1 && e.hp < e.maxHp * 0.5) {
    e.phase = 2;
    pushEffect(s, 'bossRoar', e.x, e.z, e.yaw, 1.4, 1.4, 2.4);
    pushNotice(s, '它的回声变了……小心地面。', 'radio', '栞栞', 4.2);
  }
  e.yaw = lerpAngle(e.yaw, facing(p.x - e.x, p.z - e.z), dt * (e.state === 'tell' ? 2.4 : 6));
  switch (e.state) {
    case 'stagger':
      e.staggerTime -= dt;
      if (e.staggerTime <= 0) {
        e.state = 'recover';
        e.timer = 0.55;
        e.posture = e.kind === 'boss' ? e.maxPosture * 0.45 : 0;
        e.hp = Math.max(e.hp, e.kind === 'boss' ? 1 : e.maxHp * 0.35);
      }
      break;
    case 'chase': {
      if (d > stat.range * (e.kind === 'boss' ? 0.92 : 0.86)) {
        const spd = stat.speed * (e.phase === 2 ? 1.18 : 1);
        const nx = (p.x - e.x) / Math.max(0.01, d);
        const nz = (p.z - e.z) / Math.max(0.01, d);
        const next = resolvePosition(e.x + nx * spd * dt, e.z + nz * spd * dt, 0.5);
        e.x = next.x; e.z = next.z;
      } else {
        e.state = 'tell';
        e.attack = e.kind === 'boss' ? chooseBossAttack(e, d) : e.kind === 'runner' ? 'lunge' : 'claw';
        e.timer = e.kind === 'boss' ? chooseBossTell(e) : stat.tell;
        e.attackHit = false;
        if (e.kind === 'boss' && (e.attack === 'shockwave' || e.attack === 'slam')) {
          pushEffect(s, 'shockwave', e.x, e.z, e.yaw, e.timer, 0.06, e.attack === 'shockwave' ? 7.2 : 3.7);
        }
        if (!s.hints.deflect && e.kind !== 'boss') {
          pushNotice(s, '红光是起手 —— 按 F 弹反，或空格闪开。', 'radio', '栞栞', 4.4);
        }
      }
      break;
    }
    case 'tell':
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'strike';
        e.timer = stat.strike * (e.attack === 'lunge' ? 1.5 : 1);
        e.attackHit = false;
      }
      break;
    case 'strike': {
      const total = stat.strike * (e.attack === 'lunge' ? 1.5 : 1);
      const elapsed = total - e.timer;
      if (e.attack === 'lunge') {
        const f = forward(e.yaw);
        const next = resolvePosition(e.x + f.x * 8.5 * dt, e.z + f.z * 8.5 * dt, 0.5);
        e.x = next.x; e.z = next.z;
      }
      if (!e.attackHit && elapsed >= total * 0.42) {
        e.attackHit = true;
        resolveEnemyStrike(s, e);
      }
      e.timer -= dt;
      if (e.timer <= 0) { e.state = 'recover'; e.timer = stat.recover; }
      break;
    }
    case 'recover':
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'chase';
      break;
    default:
      e.state = 'chase';
  }
}

function chooseBossTell(e: Enemy) {
  const base = ENEMY_STATS.boss.tell;
  if (e.attack === 'shockwave') return base + 0.42;
  if (e.attack === 'slam') return base + 0.2;
  if (e.attack === 'lunge') return base - 0.12;
  return base * (e.phase === 2 ? 0.78 : 1);
}

function updateSpawns(s: GameState) {
  for (const sp of SPAWNS) {
    if (s.enemies.some(e => e.id === sp.id)) continue;
    if (sp.kind === 'boss') {
      if (s.stage >= 4 && s.player.z < LEVEL.bossGate) s.enemies.push(makeEnemy(sp.id, sp.kind, sp.x, sp.z, s.time));
    } else if (s.player.z < sp.trigger && s.stage >= 1) {
      s.enemies.push(makeEnemy(sp.id, sp.kind, sp.x, sp.z, s.time));
    }
  }
}

function updateStages(s: GameState) {
  const p = s.player;
  const alive = s.enemies.filter(e => !e.dead && e.state !== 'deathblow');
  if (s.stage === 1 && s.tutorialKills >= 1) {
    s.stage = 2;
    s.objective = '沿霓虹长街北上';
    pushNotice(s, '干得漂亮。前面有两个，其中一个跑得很快。', 'radio', '栞栞', 4.4);
  } else if (s.stage === 2 && s.tutorialKills >= 3) {
    s.stage = 3;
    s.objective = '点亮信号塔';
    pushNotice(s, '看到了吗？那座还亮着的塔。靠近按 E。', 'radio', '栞栞', 4.8);
  }
  if (s.stage < 4 && p.z < LEVEL.streetEnd + 0.5) {
    p.z = LEVEL.streetEnd + 0.5;
    if (s.time - (s.notices.at(-1)?.at ?? -99) > 2.5 && s.stage < 3) {
      pushNotice(s, '检疫门还没通电。先点亮信号塔。', 'system', undefined, 2.4);
    }
  }
  if (s.stage >= 4 && s.checkpoint.lit && alive.some(e => e.kind === 'boss')) {
    s.objective = '击败 零号 · 回声';
  }
  s.areaName = areaName(p.z);
}

function interact(s: GameState) {
  const p = s.player;
  const target = s.enemies
    .filter(e => !e.dead && e.state === 'stagger' && distance(e.x, e.z, p.x, p.z) < (e.kind === 'boss' ? 3.4 : 2.7))
    .sort((a, b) => distance(a.x, a.z, p.x, p.z) - distance(b.x, b.z, p.x, p.z))[0];
  if (target) { performDeathblow(s, target); return; }
  if (!s.checkpoint.lit && distance(p.x, p.z, LEVEL.checkpoint.x, LEVEL.checkpoint.z) < 3.1) {
    s.checkpoint.lit = true;
    s.stage = 4;
    s.objective = '穿过检疫封锁线';
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.posture = 0;
    p.flasks = FLASK_MAX;
    s.hints.checkpoint = true;
    pushEffect(s, 'checkpoint', LEVEL.checkpoint.x, LEVEL.checkpoint.z, 0, 1.6, 0.4, 2);
    pushNotice(s, '坐标钉住了。就算倒下，你也会回到这里。', 'radio', '栞栞', 5);
    pushNotice(s, '信号塔已点亮 · 生命与应急针已补满', 'system', undefined, 3.4);
  }
}

function updateLock(s: GameState, input: Input) {
  if (input.lock) {
    if (s.lockId !== null) { s.lockId = null; return; }
    const candidates = s.enemies
      .filter(e => !e.dead && e.state !== 'deathblow' && e.active && distance(e.x, e.z, s.player.x, s.player.z) < 19)
      .sort((a, b) => distance(a.x, a.z, s.player.x, s.player.z) - distance(b.x, b.z, s.player.x, s.player.z));
    if (candidates[0]) {
      s.lockId = candidates[0].id;
      s.hints.lock = true;
      pushNotice(s, '锁定', 'system', undefined, 1);
    }
  }
  if (s.lockId !== null) {
    const e = s.enemies.find(en => en.id === s.lockId);
    if (!e || e.dead || e.state === 'deathblow') s.lockId = null;
  }
}

function updateCamera(s: GameState, dt: number, input: Input) {
  const c = s.camera;
  c.shake = Math.max(0, c.shake - dt * 3.4);
  c.fov += (54 - c.fov) * Math.min(1, dt * 3.2);
  if (s.lockId !== null) {
    const e = s.enemies.find(en => en.id === s.lockId);
    if (e) {
      const targetYaw = facing(e.x - s.player.x, e.z - s.player.z);
      c.yaw = lerpAngle(c.yaw, targetYaw, dt * 4.5);
      c.pitch += (0.27 - c.pitch) * Math.min(1, dt * 3);
      c.distance += ((e.kind === 'boss' ? 7.4 : 6.3) - c.distance) * Math.min(1, dt * 3);
    }
  } else {
    c.yaw += input.camX * dt * 2.6;
    c.pitch = clamp(c.pitch + input.camY * dt * 1.6, -0.12, 0.95);
    c.distance += (5.8 - c.distance) * Math.min(1, dt * 3);
  }
}

function updateOpening(s: GameState, dt: number, input: Input) {
  s.camera.cinematic = s.time;
  s.camera.cinematicBlend = Math.min(1, s.time * 1.6);
  s.fade = Math.min(1, s.time * 0.9);
  while (s.introLine < RADIO_LINES.length && s.time >= RADIO_LINES[s.introLine].at) {
    const line = RADIO_LINES[s.introLine];
    pushNotice(s, line.text, line.tone, line.speaker, line.ttl);
    s.introLine += 1;
  }
  s.skipHeld = input.skip ? s.skipHeld + dt : 0;
  if (s.skipHeld > 0.45 || s.time > 12.6 || (input.light && s.time > 1.2)) {
    s.phase = 'play';
    s.camera.cinematicBlend = 0;
    s.camera.cinematic = 0;
    s.stage = 1;
    s.objective = '离开末班站台';
    s.player.invuln = 1;
    s.fade = 1;
    pushNotice(s, 'WASD 移动 · 左键 / J 轻攻击 · Shift 冲刺 · Q 锁定', 'system', undefined, 5.5);
  }
}

/** Advance the simulation. `ms` should be a small fixed step (16–40 ms). */
export function stepGame(s: GameState, ms: number, input: Input) {
  const raw = Math.min(0.05, Math.max(0, ms / 1000));
  s.time += raw;
  s.effects = s.effects.filter(e => s.time - e.at < e.ttl);
  s.notices = s.notices.filter(n => s.time - n.at < n.ttl);
  if (s.phase === 'title') {
    s.camera.yaw += raw * 0.06;
    return;
  }
  if (s.phase === 'paused') return;
  if (s.phase === 'dead') { s.deadTimer += raw; s.camera.shake = Math.max(0, s.camera.shake - raw * 2); return; }
  if (s.phase === 'ending') {
    s.endingTimer += raw;
    s.camera.fov += (48 - s.camera.fov) * Math.min(1, raw * 2);
    s.camera.shake = Math.max(0, s.camera.shake - raw * 2);
    s.enemies.forEach(e => { e.flash = Math.max(0, e.flash - raw); });
    return;
  }
  if (s.phase === 'opening') { updateOpening(s, raw, input); return; }
  s.fade = Math.min(1, s.fade + raw * 1.6);
  if (s.hitStop > 0) {
    s.hitStop = Math.max(0, s.hitStop - raw);
    s.camera.shake = Math.max(0, s.camera.shake - raw * 1.5);
    return;
  }
  const dt = raw * (1 - s.slowMo * 0.55);
  updateLock(s, input);
  if (input.interact) interact(s);
  if (s.phase !== 'play') return;
  updateSpawns(s);
  updatePlayer(s, dt, input);
  for (const e of s.enemies) updateEnemy(s, e, dt);
  updateStages(s);
  updateCamera(s, dt, input);
  if (s.bossDefeated && s.phase === 'play' && s.player.action !== 'deathblow') {
    s.phase = 'ending';
    s.endingTimer = 0;
    s.fade = 0;
  }
}

/** Read-only snapshot used by browser verification. */
export function snapshot(s: GameState) {
  return {
    phase: s.phase,
time: Number(s.time.toFixed(2)),
stage: s.stage,
objective: s.objective,
    area: s.areaName,
    player: {
      x: Number(s.player.x.toFixed(2)),
z: Number(s.player.z.toFixed(2)),
      yaw: Number(s.player.yaw.toFixed(2)),
hp: Math.round(s.player.hp),
      stamina: Math.round(s.player.stamina),
posture: Math.round(s.player.posture),
      action: s.player.action,
flasks: s.player.flasks,
deaths: s.player.deaths,
    },
    enemies: s.enemies.map(e => ({
      id: e.id,
kind: e.kind,
x: Number(e.x.toFixed(2)),
z: Number(e.z.toFixed(2)),
      hp: Math.round(e.hp),
posture: Math.round(e.posture),
state: e.state,
dead: e.dead,
    })),
    lockId: s.lockId,
checkpointLit: s.checkpoint.lit,
bossActive: s.bossActive,
    bossDefeated: s.bossDefeated,
tutorialKills: s.tutorialKills,
    stats: s.stats,
hints: s.hints,
    notices: s.notices.filter(n => s.time - n.at < n.ttl).map(n => n.text),
  };
}
