import type { Action, AttackId, Effect, Enemy, EnemyKind, GameInput, GameState, Player, Vec3, WorldAccess } from './types';
import { canOccupy, REST_POINTS, ENEMY_SPAWNS, heightAt, LANDMARKS, lineClear, regionAt, SPAWN } from './world';

import { enemyAttack, ENEMY_STRIKE_TIME, ENEMY_CONTACT_TIME } from './enemyCombat';

import { ATTACKS, attackSpec, BUFFER_TIME, CHARGE_TIME, DASH_HOLD_TIME, PARRY_WINDOW } from './combat';

export { enemyAttack } from './enemyCombat';

// The simulation contains no browser, rendering, wall-clock or random state.
// All times are seconds, except the public stepGame argument (milliseconds).
const STATS: Record<EnemyKind, { hp: number; posture: number; damage: number; speed: number; reward: number }> = {
  prowler: { hp: 68, posture: 64, damage: 19, speed: 2.1, reward: 18 },
  guard: { hp: 112, posture: 94, damage: 25, speed: 1.65, reward: 30 },
  duelist: { hp: 144, posture: 100, damage: 24, speed: 2.65, reward: 45 },
  boss: { hp: 360, posture: 150, damage: 32, speed: 2.15, reward: 130 },
};
const DURATIONS: Record<Action, number> = { idle: 0, charge: 2, light: 0.5, heavy: 0.86, dodge: 0.64, parry: 0.52, guard: Infinity, guardRelease: 0.16, guardBreak: 0.9, hurt: 0.42, heal: 1.12, execute: 0.95, dead: Infinity };
const NEUTRAL: GameInput = { x: 0, z: 0 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const facingToward = (a: Vec3, b: Vec3) => Math.atan2(b.x - a.x, b.z - a.z);
const alive = (enemy: Enemy) => enemy.hp > 0 && enemy.action !== 'dead';
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

export function maxFlasks(s: GameState): number { return s.flaskUpgrade ? 4 : 3; }
export function healAmount(s: GameState): number { return s.charm ? 80 : 60; }
export function maxHp(s: GameState): number { return 100 + s.level * 12; }
export function maxStamina(s: GameState): number { return 100 + s.level * 5; }
export function upgradeCost(s: GameState): number { return 40 + s.level * 30; }

function makeEnemies(bossDefeated = false): Enemy[] {
  return ENEMY_SPAWNS.map(spawn => ({
    ...spawn,
spawn: { x: spawn.x, y: spawn.y, z: spawn.z },
hp: spawn.kind === 'boss' && bossDefeated ? 0 : STATS[spawn.kind].hp,
    maxHp: STATS[spawn.kind].hp,
posture: 0,
maxPosture: STATS[spawn.kind].posture,
    action: spawn.kind === 'boss' && bossDefeated ? 'dead' : 'idle',
timer: 0.65,
    attackIndex: 0,
hitDone: false,
phase: 1,
aggro: false,
flash: 0,
  }));
}

function combatDefaults() {
  return { attack: null, attackFacing: 0, charge: 0, combo: 0, comboUntil: 0, jumpHeight: 0, jumpVelocity: 0, airX: 0, airZ: 0, airAttackUsed: false, landing: 0, sprintTime: 0, dashDown: false, dashTime: 0, dashUsed: false, guardImpact: 0, parryFlash: 0, buffer: null };
}

function makePlayer(position: Vec3): Player {
  return { ...position, facing: -Math.PI / 2, hp: 100, stamina: 100, action: 'idle', actionTime: 0, hitDone: false, invulnerable: 0, staminaDelay: 0, flasks: 3, dodgeX: 0, dodgeZ: 0, ...combatDefaults() };
}

export function createGame(): GameState {
  return {
    version: 1,
hitstop: 0,
messageSerial: 0,
messageKind: 'hint',
interpretation: '',
mode: 'title',
paused: false,
player: makePlayer(SPAWN),
enemies: makeEnemies(),
effects: [],
nextEffectId: 1,
    time: 0,
deaths: 0,
kills: 0,
parries: 0,
executions: 0,
rice: 0,
bankedRice: 0,
level: 0,
charm: false,
shortcut: false,
    worldVersion: 3,
templeGate: false,
flaskUpgrade: false,
litLamps: [],
    checkpoint: 'room',
bossDefeated: false,
collected: [],
visited: ['旅馆 · 下播之后'],
lockedId: null,
    message: '新笔记本终于调好了。泰国旅居第一晚，直播结束，出去找点热乎的吃吧。',
messageTime: 9,
    prompt: '',
nearbyId: null,
region: regionAt(SPAWN.x, SPAWN.z),
bloodstain: null,
restCount: 0,
  };
}

export function startGame(s: GameState): void {
  if (s.mode !== 'title') return;
  s.mode = 'playing'; s.paused = false;
  updatePrompt(s);
}

function say(s: GameState, message: string, seconds = 4, kind: GameState['messageKind'] = 'hint', interpretation = ''): void { s.messageSerial += 1; s.message = message; s.messageTime = seconds; s.messageKind = kind; s.interpretation = interpretation; }
function effect(s: GameState, at: Vec3, kind: Effect['kind'], text?: string): void {
  s.effects.push({ x: at.x, y: at.y, z: at.z, id: s.nextEffectId++, kind, life: kind === 'reward' ? 1.8 : 0.65, text });
  if (s.effects.length > 30) s.effects.shift();
}

function move(s: GameState, entity: Vec3, dx: number, dz: number, radius = 0.33): void {
  // Resolve each axis separately so a diagonal stick slides along a wall.
  const blockedByBody = (x: number, z: number) => {
    if (entity === s.player) return s.enemies.some(e => alive(e) && Math.abs(e.y - entity.y) < 0.85 && Math.hypot(e.x - x, e.z - z) < 0.64);
    return Math.abs(s.player.y - entity.y) < 0.85 && Math.hypot(s.player.x - x, s.player.z - z) < 0.68;
  };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let i = 0; i < steps; i += 1) {
    const nx = entity.x + dx / steps;
    if (canOccupy(nx, entity.z, entity.y, s, radius) && !blockedByBody(nx, entity.z)) { entity.x = nx; entity.y = heightAt(nx, entity.z) ?? entity.y; }
    const nz = entity.z + dz / steps;
    if (canOccupy(entity.x, nz, entity.y, s, radius) && !blockedByBody(entity.x, nz)) { entity.z = nz; entity.y = heightAt(entity.x, nz) ?? entity.y; }
  }
}

function inCone(s: GameState, origin: Vec3 & { facing: number }, target: Vec3, range: number, arc: number): boolean {
  return distance(origin, target) <= range && Math.abs(origin.y - target.y) < 1.0
    && Math.abs(angleDiff(facingToward(origin, target), origin.facing)) <= arc && lineClear(origin, target, s);
}

function killEnemy(s: GameState, e: Enemy): void {
  if (e.action === 'dead') return;
  e.hp = 0; e.action = 'dead'; e.aggro = false; e.timer = 0; e.posture = 0;
  s.kills += 1; s.rice += STATS[e.kind].reward;
  effect(s, e, 'reward', `+${STATS[e.kind].reward} 夜市钱`);
  if (s.lockedId === e.id) s.lockedId = null;
  if (e.kind === 'boss') { s.bossDefeated = true; say(s, '铁伞已折', 5, 'event', '打赢啦！往夜市最里面的炉火走，找摊主点餐。'); }
}

function damageEnemy(s: GameState, e: Enemy, hp: number, posture: number): void {
  if (!alive(e)) return;
  e.hp = Math.max(0, e.hp - hp); e.posture = Math.min(e.maxPosture, e.posture + posture); e.flash = 0.18; e.aggro = true;
  effect(s, e, 'hit');
  if (e.hp <= 0) { killEnemy(s, e); return; }
  if (e.posture >= e.maxPosture) { e.action = 'stagger'; e.timer = 4.4; e.hitDone = true; say(s, '架势崩溃！靠近后轻击或交互，施展处决。', 2.8); }
}

function die(s: GameState): void {
  s.mode = 'dead'; s.player.hp = 0; s.player.action = 'dead'; s.deaths += 1;
  s.bloodstain = { x: s.player.x, y: s.player.y, z: s.player.z, rice: s.rice }; s.rice = 0; s.lockedId = null;
  effect(s, s.player, 'death'); say(s, '雨夜失足。夜市钱留在原地，回到雨灯后还能取回。', 99); s.prompt = ''; s.nearbyId = null;
}

function damagePlayer(s: GameState, e: Enemy): void {
  const p = s.player; const attack = enemyAttack(e);
  if (!inCone(s, e, p, attack.range, attack.arc)) return;
  if (!attack.parryable && p.jumpHeight > 0.55) { effect(s, p, 'dodge', '跃过'); return; }
  if (p.invulnerable > 0 || (p.action === 'dodge' && p.actionTime >= 0.07 && p.actionTime <= 0.4)) { effect(s, p, 'dodge', '闪避'); return; }
  if (attack.parryable && p.action === 'parry' && p.actionTime <= PARRY_WINDOW && inCone(s, p, e, attack.range + 0.2, 1.4)) {
    s.parries += 1; p.stamina = Math.min(maxStamina(s), p.stamina + 12); e.action = 'recover'; e.timer = 0.92;
    p.parryFlash = 0.3; s.hitstop = 0.06;
    damageEnemy(s, e, 3, e.kind === 'boss' ? 49 : 38); effect(s, p, 'parry', '弹反'); say(s, '铛！弹反成功 · 压住对手的架势', 1.5); return;
  }
  if (attack.parryable && p.action === 'guard' && inCone(s, p, e, attack.range + 0.2, 1.15)) {
    const cost = 10 + attack.damage * 0.9;
    const broken = p.stamina < cost;
    const damage = Math.ceil(attack.damage * (broken ? 0.6 : 0.15));
    p.stamina = Math.max(0, p.stamina - cost); p.staminaDelay = broken ? 1 : 0.65;
    p.hp = Math.max(0, p.hp - damage); p.guardImpact = 0.24; s.hitstop = 0.035;
    move(s, p, -Math.sin(p.facing) * (broken ? 0.45 : 0.16), -Math.cos(p.facing) * (broken ? 0.45 : 0.16));
    effect(s, { ...p, x: p.x + Math.sin(p.facing) * 0.65, z: p.z + Math.cos(p.facing) * 0.65 }, broken ? 'hit' : 'block');
    if (broken) { p.action = 'guardBreak'; p.actionTime = 0; p.buffer = null; say(s, '架势被击穿了！松开防御，退开恢复体力。', 3); }
    if (p.hp <= 0) die(s);
    return;
  }
  p.hp = Math.max(0, p.hp - attack.damage); p.action = 'hurt'; p.actionTime = 0; p.attack = null; p.buffer = null; p.combo = 0; p.charge = 0; p.invulnerable = 0.46;
  p.staminaDelay = 0.65; effect(s, p, 'hit', `−${attack.damage}`);
  if (p.hp <= 0) die(s);
}

function execute(s: GameState): boolean {
  const p = s.player;
  const e = s.enemies.find(enemy => enemy.action === 'stagger' && enemy.posture >= enemy.maxPosture && inCone(s, p, enemy, 2.55, 1.65));
  if (!e) return false;
  p.facing = facingToward(p, e); p.action = 'execute'; p.attack = null; p.buffer = null; p.combo = 0; p.actionTime = 0; p.hitDone = true; p.invulnerable = 1.05;
  p.stamina = Math.min(maxStamina(s), p.stamina + 30); s.executions += 1;
  e.posture = 0; e.action = 'recover'; e.timer = 1.5;
  damageEnemy(s, e, e.kind === 'boss' ? 102 + s.level * 5 : e.hp, 0);
  effect(s, e, 'parry', '破架处决'); return true;
}

function spend(s: GameState, amount: number): boolean {
  if (s.player.stamina + 0.001 < amount) { say(s, '体力不足，松开攻击，调整呼吸。', 1.4); return false; }
  s.player.stamina -= amount; s.player.staminaDelay = 0.75; return true;
}

function beginAttack(s: GameState, id: AttackId, paid = false): boolean {
  const p = s.player; const spec = ATTACKS[id];
  if (!paid && !spend(s, spec.cost)) return false;
  p.action = id === 'heavy' || id === 'charged' || id === 'sprintHeavy' || id === 'airHeavy' ? 'heavy' : 'light';
  p.attack = id; p.actionTime = 0; p.attackFacing = p.facing; p.hitDone = false; p.buffer = null;
  p.combo = id === 'light1' ? 1 : id === 'light2' ? 2 : id === 'light3' ? 3 : 0;
  p.comboUntil = s.time + spec.duration + 0.28;
  if (id.startsWith('air')) p.airAttackUsed = true;
  if (id === 'airHeavy') p.jumpVelocity = Math.min(p.jumpVelocity, -4.5);
  return true;
}

function actionInput(s: GameState, input: GameInput): void {
  const p = s.player;
  if (input.lock) {
    if (s.lockedId) s.lockedId = null;
    else s.lockedId = s.enemies.filter(e => alive(e) && distance(p, e) < 11 && Math.abs(p.y - e.y) < 2 && lineClear(p, e, s)).sort((a, b) => distance(a, p) - distance(b, p))[0]?.id ?? null;
  }
  // Tap is resolved on release, never waits out the hold threshold. A long hold never rolls on release.
  let { dodge } = input;
  if (input.dashHeld && !p.dashDown) { p.dashTime = 0; p.dashUsed = false; }
  if (!input.dashHeld && p.dashDown && p.dashTime < DASH_HOLD_TIME && !p.dashUsed) dodge = true;
  p.dashDown = !!input.dashHeld;
  if (input.jump || input.light || input.heavy || input.parry || input.heal) p.dashUsed = true;
  const requested = dodge ? 'dodge' : input.parry ? 'parry' : input.jump ? 'jump' : input.heavy ? 'heavy' : input.light ? 'light' : null;
  const spec = attackSpec(p);
  const canCancel = !!spec && p.actionTime >= spec.cancel;
  const airborne = p.jumpHeight > 0 || p.jumpVelocity > 0;
  const leaveGuard = p.action === 'guardRelease' || (p.action === 'guard' && p.guardImpact <= 0.12);
  if (p.action !== 'idle' && !leaveGuard && !(canCancel && requested) && !(p.action === 'charge' && (dodge || input.parry))) {
    if (requested && spec && spec.cancel - p.actionTime <= BUFFER_TIME) p.buffer = { action: requested, until: s.time + BUFFER_TIME };
    return;
  }
  if (input.interact && p.action === 'idle' && !airborne) { interact(s); return; }
  if (input.light && !airborne && p.action === 'idle' && execute(s)) return;
  if (requested === 'jump') {
    if (!airborne && spend(s, 10)) {
      p.action = 'idle'; p.attack = null; p.buffer = null; p.jumpVelocity = 6.3; p.airAttackUsed = false;
      const length = Math.max(1, Math.hypot(input.x, input.z)); const speed = p.sprintTime > 0.1 ? 5.4 : 3.55;
      p.airX = (input.x / length) * speed; p.airZ = (input.z / length) * speed;
    }
    return;
  }
  if (airborne && requested && !['light', 'heavy'].includes(requested)) return;
  if ((requested === 'light' || requested === 'heavy') && airborne && p.airAttackUsed) return;
  if (requested === 'light' || requested === 'heavy') {
    const isHeavy = requested === 'heavy';
    const running = p.sprintTime > 0.1 && Math.hypot(input.x, input.z) > 0.1;
    if (isHeavy && input.heavyHeld && !airborne && !running) {
      if (spend(s, ATTACKS.heavy.cost)) { p.action = 'charge'; p.attack = null; p.charge = 0; p.actionTime = 0; p.attackFacing = p.facing; p.buffer = null; p.combo = 0; }
    } else {
      const id: AttackId = airborne ? isHeavy ? 'airHeavy' : 'airLight' : running ? isHeavy ? 'sprintHeavy' : 'sprintLight' : isHeavy ? 'heavy' : s.time < p.comboUntil && p.combo === 1 ? 'light2' : s.time < p.comboUntil && p.combo === 2 ? 'light3' : 'light1';
      beginAttack(s, id);
    }
    return;
  }
  let action: Action = 'idle';
  if (dodge && spend(s, 25)) {
    action = 'dodge'; const length = Math.hypot(input.x, input.z);
    p.dodgeX = length > 0.1 ? input.x / length : -Math.sin(p.facing); p.dodgeZ = length > 0.1 ? input.z / length : -Math.cos(p.facing);
  } else if (input.parry && spend(s, 14)) action = 'parry';
  else if (input.heal && p.flasks > 0 && p.hp < maxHp(s)) { action = 'heal'; p.flasks -= 1; }
  if (action !== 'idle') { p.action = action; p.actionTime = 0; p.hitDone = false; p.attack = null; p.buffer = null; p.combo = 0; p.charge = 0; p.parryFlash = 0; p.guardImpact = 0; }
}

function updatePlayer(s: GameState, dt: number, input: GameInput): void {
  const p = s.player; p.invulnerable = Math.max(0, p.invulnerable - dt); p.staminaDelay = Math.max(0, p.staminaDelay - dt); p.landing = Math.max(0, p.landing - dt);
  p.guardImpact = Math.max(0, p.guardImpact - dt); p.parryFlash = Math.max(0, p.parryFlash - dt);
  if (p.action === 'guard' && !input.guardHeld) { p.action = 'guardRelease'; p.actionTime = 0; }
  if (p.action === 'parry' && p.actionTime >= PARRY_WINDOW && input.guardHeld) { p.action = 'guard'; p.actionTime = 0; }
  if (p.dashDown) p.dashTime = Math.min(10, p.dashTime + dt);
  const target = s.enemies.find(e => e.id === s.lockedId && alive(e));
  if (!target || distance(p, target) > 15 || Math.abs(p.y - target.y) > 3) s.lockedId = null;
  else if (p.action === 'idle' || p.action === 'parry' || p.action === 'guard' || p.action === 'heal') p.facing = facingToward(p, target);
  const length = Math.hypot(input.x, input.z); const x = length > 0 ? input.x / Math.max(1, length) : 0; const z = length > 0 ? input.z / Math.max(1, length) : 0;
  const airborne = p.jumpHeight > 0 || p.jumpVelocity > 0;
  const sprint = (input.sprint || (p.dashDown && p.dashTime >= DASH_HOLD_TIME)) && p.stamina > 4;
  if (p.action === 'idle' && length > 0.01 && !airborne) {
    if (!s.lockedId) p.facing = Math.atan2(x, z);
    move(s, p, x * (sprint ? 5.4 : 3.55) * dt, z * (sprint ? 5.4 : 3.55) * dt);
    p.sprintTime = sprint ? Math.min(1, p.sprintTime + dt) : 0;
    if (sprint) { p.stamina = Math.max(0, p.stamina - 10 * dt); p.staminaDelay = 0.35; p.dashUsed = true; }
  } else if (!airborne) p.sprintTime = 0;
  if (p.action === 'guard') {
    if (!s.lockedId && finite(input.aim, -100000, 100000)) p.facing += Math.max(-3.5 * dt, Math.min(3.5 * dt, angleDiff(input.aim, p.facing)));
    if (p.guardImpact <= 0.12) move(s, p, x * 1.45 * dt, z * 1.45 * dt);
  }
  if (airborne) {
    // Limited air steering, shared collision path: walls, locked doors and void stay solid.
    p.airX += (x * 3.55 - p.airX) * Math.min(1, dt * 1.8); p.airZ += (z * 3.55 - p.airZ) * Math.min(1, dt * 1.8);
    move(s, p, p.airX * dt, p.airZ * dt);
    p.jumpVelocity -= 18 * dt; p.jumpHeight = Math.max(0, p.jumpHeight + p.jumpVelocity * dt);
    if (!p.jumpHeight && p.jumpVelocity < 0) { p.jumpVelocity = 0; p.landing = 0.18; effect(s, p, 'dodge'); }
  }
  const spec = attackSpec(p);
  if (spec || p.action === 'charge') {
    const desired = length > 0.15 ? Math.atan2(x, z) : target && s.lockedId ? facingToward(p, target) : finite(input.aim, -100000, 100000) ? input.aim : p.facing;
    const limit = p.action === 'charge' ? 1.05 : spec!.turn;
    const goal = p.attackFacing + Math.max(-limit, Math.min(limit, angleDiff(desired, p.attackFacing)));
    const speed = p.action === 'charge' || p.actionTime < (spec?.impact ?? 0) ? 5 : 0.65;
    p.facing += Math.max(-speed * dt, Math.min(speed * dt, angleDiff(goal, p.facing)));
  }
  if (p.action === 'charge') {
    p.charge = Math.min(CHARGE_TIME, p.charge + dt); p.actionTime += dt;
    if (!input.heavyHeld || p.actionTime >= 1.5) {
      const charged = p.charge >= CHARGE_TIME && p.stamina >= ATTACKS.charged.cost;
      if (charged) spend(s, ATTACKS.charged.cost);
      const prep = p.charge;
      beginAttack(s, charged ? 'charged' : 'heavy', true);
      if (!charged) p.actionTime = Math.min(0.35, prep); // Holding has already paid part of the wind-up.
    }
  } else if (p.action !== 'idle') {
    const previousTime = p.actionTime; p.actionTime = p.action === 'guard' ? Math.min(1, p.actionTime + dt) : p.actionTime + dt;
    if (p.action === 'dodge' && p.actionTime < 0.43) move(s, p, p.dodgeX * 7.3 * dt, p.dodgeZ * 7.3 * dt);
    if (spec) {
      const from = Math.max(previousTime, spec.impact - 0.1); const to = Math.min(p.actionTime, spec.impact + spec.active);
      if (to > from && !airborne) move(s, p, Math.sin(p.facing) * spec.advance * ((to - from) / (0.1 + spec.active)), Math.cos(p.facing) * spec.advance * ((to - from) / (0.1 + spec.active)));
      // Plunges strike on landing. Air cuts can reach torsos, never a different floor.
      const canHit = p.attack !== 'airHeavy' || p.jumpHeight <= 0.12;
      if (!p.hitDone && p.actionTime >= spec.impact && canHit) {
        p.hitDone = true;
        let hits = 0;
        for (const e of s.enemies) {
          if (!alive(e) || !inCone(s, p, e, spec.range, spec.arc)) continue;
          const heavy = p.action === 'heavy';
          const guarded = e.kind === 'guard' && e.action !== 'stagger' && e.action !== 'recover' && Math.abs(angleDiff(facingToward(e, p), e.facing)) < 1.4;
          damageEnemy(s, e, (spec.damage + s.level * (heavy ? 5 : 3)) * (guarded && !heavy ? 0.4 : 1), spec.posture); hits += 1;
          if (alive(e) && e.action !== 'stagger' && e.kind !== 'boss' && (heavy || e.action !== 'windup')) { e.action = 'recover'; e.timer = heavy ? 0.55 : 0.28; }
        }
        if (hits) s.hitstop = p.action === 'heavy' ? 0.075 : 0.04;
        if (p.attack === 'charged' || p.attack === 'airHeavy') effect(s, { ...p, x: p.x + Math.sin(p.facing), z: p.z + Math.cos(p.facing) }, 'parry');
      }
    }
    if (p.action === 'heal' && !p.hitDone && p.actionTime >= 0.72) { p.hitDone = true; p.hp = Math.min(maxHp(s), p.hp + healAmount(s)); effect(s, p, 'heal', '椰子水'); }
    if (p.buffer && p.buffer.until < s.time) p.buffer = null;
    if (p.buffer && spec && p.actionTime >= spec.cancel) {
      const buffered = p.buffer.action; p.buffer = null;
      actionInput(s, { ...input, light: false, heavy: false, jump: false, dodge: false, parry: false, [buffered]: true });
    } else if (p.actionTime >= (spec?.duration ?? DURATIONS[p.action])) { p.action = 'idle'; p.actionTime = 0; p.attack = null; p.charge = 0; }
  }
  if (p.staminaDelay <= 0 && (p.action === 'idle' || p.action === 'parry' || p.action === 'heal')) p.stamina = Math.min(maxStamina(s), p.stamina + 27 * dt);
  if (p.staminaDelay <= 0 && p.action === 'guard') p.stamina = Math.min(maxStamina(s), p.stamina + 7 * dt);
}

function updateEnemy(s: GameState, e: Enemy, dt: number): void {
  e.flash = Math.max(0, e.flash - dt);
  if (!alive(e)) return;
  const p = s.player; const dist = distance(e, p); const homeDistance = distance(e, e.spawn);
  const sameLevel = Math.abs(e.y - p.y) < 1.8; const sees = sameLevel && lineClear(e, p, s);
  if (e.kind === 'boss' && e.hp <= e.maxHp * 0.5 && e.phase === 1) { e.phase = 2; say(s, '铁伞破裂 · 第二式。红色回旋不能弹反，向外闪开！', 5); }
  const inArena = e.kind !== 'boss' || (p.z < -36 && p.y < 0.2);
  if (!e.aggro && inArena && dist < (e.kind === 'boss' ? 8 : 6.3) && sees) { e.aggro = true; e.timer = 0.45; }
  // Enemies return to their posts rather than pursuing through floors or the entire level.
  if (e.aggro && (homeDistance > (e.kind === 'boss' ? 11 : 10) || dist > 15 || (e.kind === 'boss' && p.z > -35.5))) { e.aggro = false; e.action = 'idle'; e.timer = 0.8; e.posture = 0; }
  if (!e.aggro) {
    if (homeDistance > 0.15) {
      e.facing = facingToward(e, e.spawn); e.action = 'chase';
      move(s, e, Math.sin(e.facing) * STATS[e.kind].speed * dt, Math.cos(e.facing) * STATS[e.kind].speed * dt);
    } else { e.action = 'idle'; e.facing = ENEMY_SPAWNS.find(spawn => spawn.id === e.id)?.facing ?? 0; }
    return;
  }
  if (e.action === 'stagger') { e.timer -= dt; if (e.timer <= 0) { e.action = 'recover'; e.timer = 0.6; e.posture = e.maxPosture * 0.35; } return; }
  const attack = enemyAttack(e);
  if (e.action === 'windup') {
    // Commit to direction during the final quarter-second: circling and spacing work.
    if (e.timer > 0.25) e.facing = facingToward(e, p);
    e.timer -= dt;
    if (e.timer <= 0) { e.action = 'attack'; e.timer = ENEMY_STRIKE_TIME; e.hitDone = false; }
    return;
  }
  if (e.action === 'attack') {
    if (e.timer > 0.12) move(s, e, Math.sin(e.facing) * attack.lunge * dt * 5, Math.cos(e.facing) * attack.lunge * dt * 5);
    e.timer -= dt;
    if (!e.hitDone && e.timer <= ENEMY_STRIKE_TIME - ENEMY_CONTACT_TIME) { e.hitDone = true; damagePlayer(s, e); }
    if (e.action === 'attack' && e.timer <= 0) { e.action = 'recover'; e.timer = attack.recovery; }
    return;
  }
  if (e.action === 'recover') { e.timer -= dt; if (e.timer <= 0) { e.action = 'chase'; e.attackIndex += 1; e.timer = 0.1; } return; }
  e.timer = Math.max(0, e.timer - dt);
  e.posture = Math.max(0, e.posture - dt * (dist > 5 ? 10 : 2.2));
  if (dist <= attack.range - 0.25 && sees && e.timer <= 0) { e.facing = facingToward(e, p); e.action = 'windup'; e.timer = attack.windup; return; }
  e.action = 'chase';
  if (dist > 1.2 && sees) { e.facing = facingToward(e, p); move(s, e, Math.sin(e.facing) * STATS[e.kind].speed * dt, Math.cos(e.facing) * STATS[e.kind].speed * dt); }
}

function updatePrompt(s: GameState): void {
  s.region = regionAt(s.player.x, s.player.z);
  if (!s.visited.includes(s.region)) s.visited.push(s.region);
  s.prompt = ''; s.nearbyId = null;
  if (s.mode !== 'playing') return;
  if (s.bloodstain && distance(s.player, s.bloodstain) < 1.85 && Math.abs(s.player.y - s.bloodstain.y) < 0.8) { s.prompt = '取回遗落的夜市钱'; s.nearbyId = 'bloodstain'; return; }
  const broken = s.enemies.find(e => e.action === 'stagger' && inCone(s, s.player, e, 2.55, 1.65));
  if (broken) { s.prompt = '破架处决'; s.nearbyId = broken.id; return; }
  const landmark = LANDMARKS.filter(l => !s.collected.includes(l.id) || l.kind === 'note')
    .filter(l => !(l.kind === 'shortcut' && (l.id === 'temple-gate' ? s.templeGate : s.shortcut)) && distance(l, s.player) < 2.05 && Math.abs(l.y - s.player.y) < 0.8 && lineClear(s.player, l, s, l.id))
    .sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
  if (landmark) { s.nearbyId = landmark.id; s.prompt = landmark.kind === 'rest' ? (s.litLamps.includes(landmark.id) ? '中庭雨灯 · 免费休息' : '点燃中庭雨灯') : landmark.label; }
}

export function stepGame(s: GameState, dtMs: number, input: GameInput = NEUTRAL): void {
  if (s.mode !== 'playing' || s.paused || !Number.isFinite(dtMs) || dtMs <= 0) return;
  const safeInput = { ...input, x: finite(input.x, -1000, 1000) ? input.x : 0, z: finite(input.z, -1000, 1000) ? input.z : 0 };
  actionInput(s, safeInput);
  let remaining = Math.min(dtMs / 1000, 5);
  while (remaining > 0.000001 && s.mode === 'playing') {
    const dt = Math.min(1 / 120, remaining); remaining -= dt;
    if (s.hitstop > 0) { s.hitstop = Math.max(0, s.hitstop - dt); continue; }
    s.time += dt;
    s.messageTime = Math.max(0, s.messageTime - dt);
    for (const fx of s.effects) fx.life -= dt;
    s.effects = s.effects.filter(fx => fx.life > 0);
    updatePlayer(s, dt, safeInput);
    for (const enemy of s.enemies) { if (s.mode === 'playing') updateEnemy(s, enemy, dt); }
  }
  updatePrompt(s);
}

function safeToRest(s: GameState): boolean {
  return !s.enemies.some(e => alive(e) && e.aggro && distance(e, s.player) < 7 && Math.abs(e.y - s.player.y) < 1.8);
}

export function interact(s: GameState): void {
  if (s.mode !== 'playing' || s.paused || s.player.action !== 'idle' || s.player.jumpHeight > 0) return;
  if (execute(s)) return;
  updatePrompt(s);
  const { nearbyId } = s;
  if (nearbyId === 'bloodstain' && s.bloodstain) { s.rice += s.bloodstain.rice; s.bloodstain = null; effect(s, s.player, 'reward', '失物归还'); say(s, '找回了夜市钱。今晚还吃得起！'); updatePrompt(s); return; }
  const landmark = LANDMARKS.find(l => l.id === nearbyId);
  if (!landmark) return;
  if (landmark.kind === 'rest') {
    if (!s.litLamps.includes(landmark.id)) {
      s.litLamps.push(landmark.id); s.checkpoint = 'courtyard';
      effect(s, landmark, 'reward'); say(s, '雨灯初燃 · 归途已铭记', 4, 'event', '复活点记好了。点火不会回血、补药或刷新敌人；再交互才是免费休息。');
      updatePrompt(s); return;
    }
    if (!safeToRest(s)) { say(s, '敌人还在附近，先脱离战斗才能休息。'); return; }
    s.checkpoint = 'courtyard';
    s.player.hp = maxHp(s); s.player.stamina = maxStamina(s); s.player.flasks = maxFlasks(s); s.restCount += 1;
    s.enemies = makeEnemies(s.bossDefeated); s.lockedId = null;
    effect(s, landmark, 'heal');
    say(s, '歇息片刻 · 雨仍未停', 4, 'event', '免费休息，生命、体力和药瓶已补满；普通敌人会重生。旁边花钱的是强化装备，不是休息。');
  } else if (landmark.kind === 'cache' && !s.collected.includes(landmark.id)) {
    s.collected.push(landmark.id); s.rice += 35; effect(s, landmark, 'reward', '+35 夜市钱');
    say(s, '旧铜钱 ×35', 3, 'event', landmark.id === 'cloister-cache' ? '拿到了！回廊的矮阶通回中庭雨灯，不用原路返回。' : landmark.id === 'lookout-cache' ? '望台上能看到夜市和东侧运河，挑战首领前可以先绕去开近路。' : '这笔钱可以拿回雨灯整备，提高生命、体力和伤害。');
  } else if (landmark.kind === 'charm' && !s.charm) {
    s.charm = true; s.collected.push(landmark.id); effect(s, landmark, 'reward', '金铃护符'); say(s, '拾得 · 金铃护符', 4, 'event', '金铃会让椰子水恢复更多生命：现在一瓶恢复 80 点。绕路值得吧！');
  } else if (landmark.kind === 'flask' && !s.flaskUpgrade) {
    s.flaskUpgrade = true; s.collected.push(landmark.id); s.player.flasks = Math.min(maxFlasks(s), s.player.flasks + 1);
    effect(s, landmark, 'reward'); say(s, '刻露瓶 · 药瓶上限 +1', 5, 'event', '现在可以带四瓶回血药了。回中庭雨灯免费休息就能补满，R／手柄X喝药。');
  } else if (landmark.id === 'temple-gate') {
    if (s.player.z > -6.7) { say(s, '水向低处流，门向归人开。', 5, 'lore', '门闩在寺院一侧。先从高处的悬钟桥进雨寺，再沿石阶下到门后。'); return; }
    s.templeGate = true; effect(s, landmark, 'reward'); say(s, '闭水门已开', 4, 'event', '门外就是晾衣暗巷！雨寺和中庭连起来了，补给后可以直接回去。');
  } else if (landmark.kind === 'shortcut') {
    if (s.player.z > -8.8) { say(s, '门的另一面，铁仍记得手的温度。', 5, 'lore', '门闩在另一侧，我们得先走西边的高阶绕到夜市，再从里面开门。'); return; }
    s.shortcut = true; effect(s, landmark, 'reward', '捷径开启'); say(s, '侧门升起', 4, 'event', '近路通啦！沿运河回中庭就能补给，重试铁伞不用再爬屋脊。');
  } else if (landmark.kind === 'food') {
    if (!s.bossDefeated) { say(s, '伞不收，炉不迎客。', 5, 'lore', '摊主要我们先打败封街的铁伞，赢了再来点餐。'); return; }
    if (s.collected.includes('food')) return;
    s.collected.push('food'); s.mode = 'ending'; s.lockedId = null; s.prompt = ''; s.nearbyId = null;
    say(s, '下播后的第一份打抛饭。明天还要直播，今晚先好好吃饭。', 99);
  } else if (landmark.id === 'temple-lamp' || landmark.id === 'canal-lamp') {
    if (!s.collected.includes(landmark.id)) s.collected.push(landmark.id);
    say(s, '芯冷，灯空。归火尚在中庭。', 6, 'lore', '这只是旧灯，没有复活和补给功能。开好近路就能回中庭的雨灯，不必重绕整张地图。');
  } else if (landmark.kind === 'note') {
    if (!s.collected.includes(landmark.id)) s.collected.push(landmark.id);
    say(s, landmark.id === 'temple-note' ? '钟不为来者鸣。携空瓶过桥，循百灯归水。' : landmark.id === 'ferry-note' ? '渡者不渡伞。此灯守岸，前路留给归人。' : landmark.id === 'laptop' ? '屏光熄去，金塔下还有一盏不眠的火。' : '伞下无归客。逐水向东，归人自解旧闩。', 8, 'lore', landmark.id === 'temple-note' ? '寺里供着能增加药瓶数量的刻露瓶。拿到后沿寺院石阶下去，拉动门后的绞盘，就能走近路回中庭补给。' : landmark.id === 'ferry-note' ? '旧灯已经熄灭；去运河侧廊拉开门后的绞盘，就能直接回中庭雨灯补药。' : landmark.id === 'laptop' ? '这说的是金塔下面的深夜食堂。先从旅馆外梯下去，找到中庭的雨灯。' : '纸条在提醒我们：夜市东边的运河侧廊有一扇门，从里面能打开，通回中庭。');
  }
  updatePrompt(s);
}

export function upgrade(s: GameState): boolean {
  const lamp = LANDMARKS.find(l => l.kind === 'rest' && distance(s.player, l) <= 2.05 && Math.abs(s.player.y - l.y) <= 0.8);
  if (!lamp || !s.litLamps.includes(lamp.id)) return false;
  if (s.mode !== 'playing' || s.player.action !== 'idle' || distance(s.player, lamp) > 2.05 || Math.abs(s.player.y - lamp.y) > 0.8 || !safeToRest(s)) return false;
  if (s.level >= 5) { say(s, '这身行装已经整备完毕。'); return false; }
  const cost = upgradeCost(s);
  if (s.rice < cost) { say(s, `整备需要 ${cost} 夜市钱。沿暗巷和屋脊找找。`); return false; }
  s.rice -= cost; s.bankedRice += cost; s.level += 1; s.player.hp = Math.min(maxHp(s), s.player.hp + 12); s.player.stamina = Math.min(maxStamina(s), s.player.stamina + 5);
  effect(s, s.player, 'reward', `行装 +${s.level}`); say(s, '整备完成 · 最大生命、体力和武器伤害提升。'); return true;
}

export function continueExploring(s: GameState): void {
  if (s.mode !== 'ending') return;
  s.mode = 'playing'; s.paused = false; s.messageTime = 0; s.lockedId = null; clearHeldActions(s); updatePrompt(s);
}

export function respawn(s: GameState): void {
  if (s.mode !== 'dead') return;
  s.player = makePlayer(REST_POINTS[s.checkpoint]); s.player.hp = maxHp(s); s.player.stamina = maxStamina(s); s.player.flasks = maxFlasks(s);
  s.enemies = makeEnemies(s.bossDefeated); s.mode = 'playing'; s.paused = false; s.effects = []; s.lockedId = null;
  say(s, '雨灯仍亮着。观察起手，留一点体力；丢下的钱就在倒下的地方。', 5); updatePrompt(s);
}

export function clearHeldActions(s: GameState): void {
  const p = s.player; p.buffer = null; p.dashDown = false; p.dashUsed = true; p.sprintTime = 0;
  if (p.action === 'charge' || p.action === 'guard' || p.action === 'guardRelease' || p.action === 'parry') { p.action = 'idle'; p.attack = null; p.actionTime = 0; p.charge = 0; p.guardImpact = 0; p.parryFlash = 0; }
}
export function setPaused(s: GameState, paused: boolean): void { if (s.mode === 'playing') { s.paused = paused; if (paused) clearHeldActions(s); } }

export function getObjective(s: GameState): string {
  if (s.mode === 'ending') return '第一幕完成 · 这顿饭，来之不易';
  if (s.collected.includes('food')) return '雨夜未尽 · 自由探索旧城';
  if (s.bossDefeated) return '到夜市炉火旁，吃上今晚的第一顿饭';
  if (s.shortcut) return '挑战封街人 · 铁伞，抵达深夜食堂';
  if (s.charm) return '沿夜市长阶下行，找出回到中庭的近路';
  if (s.checkpoint !== 'room') return '穿过晾衣暗巷，登上金塔屋脊';
  return '合上笔记本，沿旅馆外梯寻找雨灯';
}

export function saveGame(s: GameState): string { return JSON.stringify(s); }

function validPosition(p: unknown, shortcut: WorldAccess): p is Vec3 {
  if (!p || typeof p !== 'object') return false;
  const v = p as Vec3;
  return finite(v.x, -40, 30) && finite(v.y, -1, 10) && finite(v.z, -60, 25)
    && canOccupy(v.x, v.z, v.y, shortcut, 0.05) && Math.abs((heightAt(v.x, v.z) ?? -100) - v.y) < 0.08;
}

// Only old saves may overlap the previously non-solid courtyard lamp.
// Move affected actors to its edge without changing their combat/progression state.
function migrateLampPosition(p: Vec3 | null | undefined, s: GameState): void {
  if (!p || !finite(p.x, -40, 30) || !finite(p.z, -60, 25) || !finite(p.y, -1, 10)) return;
  const lamp = LANDMARKS.find(l => l.id === 'courtyard');
  if (!lamp || Math.abs(p.y - lamp.y) > 0.08 || Math.abs(p.x - lamp.x) > 0.8 || Math.abs(p.z - lamp.z) > 0.8) return;
  if (canOccupy(p.x, p.z, p.y, s)) return;
  const facing = Math.atan2(p.x - lamp.x, p.z - lamp.z);
  const x = lamp.x + Math.sin(facing) * 1.2; const z = lamp.z + Math.cos(facing) * 1.2;
  if (canOccupy(x, z, p.y, s)) { p.x = x; p.z = z; }
}

export function loadGame(raw: string | null): GameState | null {
  if (!raw || raw.length > 60000) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    if (!s || s.version !== 1 || !['title', 'playing', 'dead', 'ending'].includes(s.mode) || typeof s.paused !== 'boolean') return null;
    const oldWorld = s.worldVersion === undefined;
    if (oldWorld) { s.worldVersion = 3; s.templeGate = false; s.flaskUpgrade = false; s.litLamps = s.checkpoint === 'courtyard' ? ['courtyard'] : []; }
    if ((s.worldVersion as number) === 2) {
      if (!Array.isArray(s.litLamps) || s.litLamps.some(id => !['courtyard', 'temple-lamp', 'canal-lamp'].includes(id)) || new Set(s.litLamps).size !== s.litLamps.length) return null;
      if (s.checkpoint !== 'room' && !s.litLamps.includes(s.checkpoint)) return null;
      if (['temple-lamp', 'canal-lamp'].includes(s.checkpoint)) s.checkpoint = 'courtyard';
      s.litLamps = s.checkpoint === 'courtyard' || s.litLamps.includes('courtyard') ? ['courtyard'] : [];
      s.worldVersion = 3;
    }
    if (s.mode === 'ending' && Array.isArray(s.collected) && !s.collected.includes('food')) s.collected.push('food');
    if (s.worldVersion !== 3 || typeof s.templeGate !== 'boolean' || typeof s.flaskUpgrade !== 'boolean') return null;
    if (!Array.isArray(s.litLamps) || new Set(s.litLamps).size !== s.litLamps.length || s.litLamps.some(id => !LANDMARKS.some(l => l.id === id && l.kind === 'rest'))) return null;
    if (s.checkpoint !== 'room' && !s.litLamps.includes(s.checkpoint)) return null;
    if (!Object.hasOwn(REST_POINTS, s.checkpoint) || !['charm', 'shortcut', 'bossDefeated'].every(k => typeof s[k as keyof GameState] === 'boolean')) return null;
    for (const k of ['deaths', 'kills', 'parries', 'executions', 'rice', 'bankedRice', 'restCount', 'nextEffectId'] as const) if (!finite(s[k], 0, 1000000) || !Number.isInteger(s[k])) return null;
    if (!finite(s.level, 0, 5) || !Number.isInteger(s.level) || !finite(s.time, 0, 10000000)) return null;
    if (!Array.isArray(s.collected) || s.collected.length > LANDMARKS.length || new Set(s.collected).size !== s.collected.length || s.collected.some(id => !LANDMARKS.some(l => l.id === id))) return null;
    if (!Array.isArray(s.visited) || s.visited.length > 30 || s.visited.some(v => typeof v !== 'string' || v.length > 100)) return null;
    const p = s.player;
    if (!p) return null;
    if (oldWorld) migrateLampPosition(p, s);
    const legacyCombat = !Object.hasOwn(p, 'attack');
    for (const [key, value] of Object.entries(combatDefaults())) if (!(key in p)) Object.assign(p, { [key]: value });
    if (legacyCombat && (p.action === 'light' || p.action === 'heavy')) { p.attack = p.action === 'light' ? 'light1' : 'heavy'; p.attackFacing = p.facing; }
    if (s.hitstop === undefined) s.hitstop = 0;
    if (s.messageSerial === undefined) s.messageSerial = 0;
    if (!finite(s.messageSerial, 0, 10000000)) return null;
    if (s.messageKind === undefined) s.messageKind = 'hint';
    if (s.interpretation === undefined) s.interpretation = '';
    if (!['hint', 'lore', 'event'].includes(s.messageKind) || typeof s.interpretation !== 'string' || s.interpretation.length > 500) return null;
    if (!finite(s.hitstop, 0, 0.1) || (p.attack !== null && !Object.hasOwn(ATTACKS, p.attack))) return null;
    for (const key of ['charge', 'jumpHeight', 'landing', 'sprintTime', 'guardImpact', 'parryFlash'] as const) if (!finite(p[key], 0, 2)) return null;
    if (!finite(p.jumpVelocity, -15, 7) || !finite(p.airX, -6, 6) || !finite(p.airZ, -6, 6) || !finite(p.attackFacing, -100, 100) || !finite(p.combo, 0, 3) || !Number.isInteger(p.combo) || !finite(p.comboUntil, 0, 10000010) || !finite(p.dashTime, 0, 10)) return null;
    if (typeof p.dashDown !== 'boolean' || typeof p.dashUsed !== 'boolean' || typeof p.airAttackUsed !== 'boolean') return null;
    if (p.buffer !== null && (!['light', 'heavy', 'dodge', 'parry', 'jump'].includes(p.buffer.action) || !finite(p.buffer.until, 0, 10000010))) return null;
    if (!validPosition(p, s) || !finite(p.hp, 0, maxHp(s)) || !finite(p.stamina, 0, maxStamina(s)) || !finite(p.facing, -100, 100)) return null;
    if (!Object.hasOwn(DURATIONS, p.action) || !finite(p.actionTime, 0, 5) || !finite(p.invulnerable, 0, 1.1) || !finite(p.staminaDelay, 0, 1)) return null;
    if (!finite(p.flasks, 0, maxFlasks(s)) || !Number.isInteger(p.flasks) || !finite(p.dodgeX, -1, 1) || !finite(p.dodgeZ, -1, 1) || typeof p.hitDone !== 'boolean') return null;
    if ((s.mode === 'dead') !== (p.hp === 0) || (s.mode === 'dead') !== (p.action === 'dead')) return null;
    if (oldWorld && Array.isArray(s.enemies) && s.enemies.length === 6) s.enemies.push(...makeEnemies().filter(e => e.id.startsWith('temple-')));
    if (!Array.isArray(s.enemies) || s.enemies.length !== ENEMY_SPAWNS.length) return null;
    for (let i = 0; i < s.enemies.length; i += 1) {
      const e = s.enemies[i]; const spawn = ENEMY_SPAWNS[i];
      if (oldWorld) migrateLampPosition(e, s);
      if (!e || e.id !== spawn.id || e.kind !== spawn.kind || e.name !== spawn.name || !validPosition(e, s)) return null;
      if (!e.spawn || e.spawn.x !== spawn.x || e.spawn.y !== spawn.y || e.spawn.z !== spawn.z) return null;
      if (e.maxHp !== STATS[e.kind].hp || e.maxPosture !== STATS[e.kind].posture || !finite(e.hp, 0, e.maxHp) || !finite(e.posture, 0, e.maxPosture)) return null;
      if (!['idle', 'chase', 'windup', 'attack', 'recover', 'stagger', 'dead'].includes(e.action) || (e.hp === 0) !== (e.action === 'dead')) return null;
      if (!finite(e.timer, -0.02, 5) || !finite(e.attackIndex, 0, 1000000) || !Number.isInteger(e.attackIndex) || ![1, 2].includes(e.phase) || !finite(e.facing, -100, 100) || !finite(e.flash, 0, 1)) return null;
      if (typeof e.hitDone !== 'boolean' || typeof e.aggro !== 'boolean') return null;
    }
    if (s.bossDefeated !== (s.enemies.find(e => e.kind === 'boss')?.hp === 0) || (s.mode === 'ending' && !s.bossDefeated)) return null;
    if (s.flaskUpgrade !== s.collected.includes('temple-flask')) return null;
    if (s.charm !== s.collected.includes('roof-charm')) return null;
    if (oldWorld) migrateLampPosition(s.bloodstain, s);
    if (s.bloodstain !== null && (!validPosition(s.bloodstain, s) || !finite(s.bloodstain.rice, 0, 1000000) || !Number.isInteger(s.bloodstain.rice))) return null;
    if (s.lockedId !== null && !s.enemies.some(e => e.id === s.lockedId && alive(e))) return null;
    if (typeof s.message !== 'string' || s.message.length > 500 || !finite(s.messageTime, 0, 100)) return null;
    // Preserve combat, health and enemy deaths exactly. A refresh cannot heal,
    // reset a losing boss fight, or award the same kill a second time.
    s.effects = []; s.paused = false; updatePrompt(s); return s;
  } catch { return null; }
}
