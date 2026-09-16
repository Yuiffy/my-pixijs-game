import type { Action, Effect, Enemy, EnemyKind, GameInput, GameState, Player, Vec3 } from './types';
import { canOccupy, CHECKPOINT, ENEMY_SPAWNS, heightAt, LANDMARKS, lineClear, regionAt, SPAWN } from './world';

// The simulation contains no browser, rendering, wall-clock or random state.
// All times are seconds, except the public stepGame argument (milliseconds).
const STATS: Record<EnemyKind, { hp: number; posture: number; damage: number; speed: number; reward: number }> = {
  prowler: { hp: 68, posture: 64, damage: 19, speed: 2.1, reward: 18 },
  guard: { hp: 112, posture: 94, damage: 25, speed: 1.65, reward: 30 },
  duelist: { hp: 144, posture: 100, damage: 24, speed: 2.65, reward: 45 },
  boss: { hp: 360, posture: 150, damage: 32, speed: 2.15, reward: 130 },
};
const DURATIONS: Record<Action, number> = { idle: 0, light: 0.5, heavy: 0.86, dodge: 0.64, parry: 0.52, hurt: 0.42, heal: 1.12, execute: 0.95, dead: Infinity };
const NEUTRAL: GameInput = { x: 0, z: 0 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const facingToward = (a: Vec3, b: Vec3) => Math.atan2(b.x - a.x, b.z - a.z);
const alive = (enemy: Enemy) => enemy.hp > 0 && enemy.action !== 'dead';
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

export function maxHp(s: GameState): number { return 100 + s.level * 12; }
export function maxStamina(s: GameState): number { return 100 + s.level * 5; }
export function upgradeCost(s: GameState): number { return 40 + s.level * 30; }

export function enemyAttack(e: Enemy) {
  const index = e.attackIndex % 3;
  if (e.kind === 'boss') {
    if (index === 1) return { name: '拖伞重砸', windup: 1.38, range: 3.1, arc: 0.85, damage: 40, recovery: 1.16, parryable: true, lunge: 1.1 };
    if (index === 2 && e.phase === 2) return { name: '危 · 回旋扫街', windup: 1.1, range: 3.65, arc: Math.PI, damage: 36, recovery: 1.25, parryable: false, lunge: 0 };
    return { name: e.phase === 2 ? '疾伞突刺' : '铁伞突刺', windup: e.phase === 2 ? 0.67 : 0.88, range: 2.85, arc: 0.66, damage: 32, recovery: 0.95, parryable: true, lunge: 1.7 };
  }
  if (e.kind === 'duelist') return { name: index === 1 ? '居合蓄斩' : '快刀横斩', windup: index === 1 ? 1.15 : 0.65, range: 2.35, arc: 1.13, damage: 24, recovery: 0.85, parryable: true, lunge: 0.6 };
  if (e.kind === 'guard') return { name: '举棍重击', windup: 1.06, range: 2.3, arc: 0.9, damage: 25, recovery: 1.2, parryable: true, lunge: 0.25 };
  return { name: '短棍挥打', windup: 0.88, range: 1.95, arc: 1.15, damage: 19, recovery: 1.05, parryable: true, lunge: 0.3 };
}

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

function makePlayer(position: Vec3): Player {
  return { ...position, facing: -Math.PI / 2, hp: 100, stamina: 100, action: 'idle', actionTime: 0, hitDone: false, invulnerable: 0, staminaDelay: 0, flasks: 3, dodgeX: 0, dodgeZ: 0 };
}

export function createGame(): GameState {
  return {
    version: 1,
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

function say(s: GameState, message: string, seconds = 4): void { s.message = message; s.messageTime = seconds; }
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
    if (canOccupy(nx, entity.z, entity.y, s.shortcut, radius) && !blockedByBody(nx, entity.z)) { entity.x = nx; entity.y = heightAt(nx, entity.z) ?? entity.y; }
    const nz = entity.z + dz / steps;
    if (canOccupy(entity.x, nz, entity.y, s.shortcut, radius) && !blockedByBody(entity.x, nz)) { entity.z = nz; entity.y = heightAt(entity.x, nz) ?? entity.y; }
  }
}

function inCone(s: GameState, origin: Vec3 & { facing: number }, target: Vec3, range: number, arc: number): boolean {
  return distance(origin, target) <= range && Math.abs(origin.y - target.y) < 1.0
    && Math.abs(angleDiff(facingToward(origin, target), origin.facing)) <= arc && lineClear(origin, target, s.shortcut);
}

function killEnemy(s: GameState, e: Enemy): void {
  if (e.action === 'dead') return;
  e.hp = 0; e.action = 'dead'; e.aggro = false; e.timer = 0; e.posture = 0;
  s.kills += 1; s.rice += STATS[e.kind].reward;
  effect(s, e, 'reward', `+${STATS[e.kind].reward} 夜市钱`);
  if (s.lockedId === e.id) s.lockedId = null;
  if (e.kind === 'boss') { s.bossDefeated = true; say(s, '铁伞落地，封街人退入雨里。炉火还亮着——终于能吃晚饭了。', 8); }
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
  if (p.invulnerable > 0 || (p.action === 'dodge' && p.actionTime >= 0.07 && p.actionTime <= 0.4)) { effect(s, p, 'dodge', '闪避'); return; }
  if (attack.parryable && p.action === 'parry' && p.actionTime <= 0.25 && inCone(s, p, e, attack.range + 0.2, 1.4)) {
    s.parries += 1; p.stamina = Math.min(maxStamina(s), p.stamina + 12); e.action = 'recover'; e.timer = 0.92;
    damageEnemy(s, e, 3, e.kind === 'boss' ? 49 : 38); effect(s, p, 'parry', '弹反'); say(s, '铛！弹反成功 · 压住对手的架势', 1.5); return;
  }
  p.hp = Math.max(0, p.hp - attack.damage); p.action = 'hurt'; p.actionTime = 0; p.invulnerable = 0.46;
  p.staminaDelay = 0.65; effect(s, p, 'hit', `−${attack.damage}`);
  if (p.hp <= 0) die(s);
}

function execute(s: GameState): boolean {
  const p = s.player;
  const e = s.enemies.find(enemy => enemy.action === 'stagger' && enemy.posture >= enemy.maxPosture && inCone(s, p, enemy, 2.55, 1.65));
  if (!e) return false;
  p.facing = facingToward(p, e); p.action = 'execute'; p.actionTime = 0; p.hitDone = true; p.invulnerable = 1.05;
  p.stamina = Math.min(maxStamina(s), p.stamina + 30); s.executions += 1;
  e.posture = 0; e.action = 'recover'; e.timer = 1.5;
  damageEnemy(s, e, e.kind === 'boss' ? 102 + s.level * 5 : e.hp, 0);
  effect(s, e, 'parry', '破架处决'); return true;
}

function spend(s: GameState, amount: number): boolean {
  if (s.player.stamina + 0.001 < amount) { say(s, '体力不足，松开攻击，调整呼吸。', 1.4); return false; }
  s.player.stamina -= amount; s.player.staminaDelay = 0.75; return true;
}

function actionInput(s: GameState, input: GameInput): void {
  const p = s.player;
  if (input.lock) {
    if (s.lockedId) s.lockedId = null;
    else s.lockedId = s.enemies.filter(e => alive(e) && distance(p, e) < 11 && Math.abs(p.y - e.y) < 2 && lineClear(p, e, s.shortcut)).sort((a, b) => distance(a, p) - distance(b, p))[0]?.id ?? null;
  }
  const canCancel = (p.action === 'light' && p.actionTime > 0.31) || (p.action === 'heavy' && p.actionTime > 0.64);
  if (p.action !== 'idle' && !(canCancel && (input.dodge || input.parry))) return;
  if (input.interact && p.action === 'idle') { interact(s); return; }
  if (input.light && execute(s)) return;
  let action: Action = 'idle';
  if (input.dodge && spend(s, 25)) {
    action = 'dodge'; const length = Math.hypot(input.x, input.z);
    p.dodgeX = length > 0.1 ? input.x / length : -Math.sin(p.facing); p.dodgeZ = length > 0.1 ? input.z / length : -Math.cos(p.facing);
  } else if (input.parry && spend(s, 14)) action = 'parry';
  else if (input.heal && p.flasks > 0 && p.hp < maxHp(s)) { action = 'heal'; p.flasks -= 1; } else if (input.heavy && spend(s, 31)) action = 'heavy';
  else if (input.light && spend(s, 17)) action = 'light';
  if (action !== 'idle') { p.action = action; p.actionTime = 0; p.hitDone = false; }
}

function updatePlayer(s: GameState, dt: number, input: GameInput): void {
  const p = s.player; p.invulnerable = Math.max(0, p.invulnerable - dt); p.staminaDelay = Math.max(0, p.staminaDelay - dt);
  const target = s.enemies.find(e => e.id === s.lockedId && alive(e));
  if (!target || distance(p, target) > 15 || Math.abs(p.y - target.y) > 3) s.lockedId = null;
  else if (p.action === 'idle' || p.action === 'parry' || p.action === 'heal') p.facing = facingToward(p, target);
  const length = Math.hypot(input.x, input.z); const x = length > 0 ? input.x / Math.max(1, length) : 0; const z = length > 0 ? input.z / Math.max(1, length) : 0;
  if (p.action === 'idle' && length > 0.01) {
    const sprint = input.sprint && p.stamina > 4;
    if (!s.lockedId) p.facing = Math.atan2(x, z);
    move(s, p, x * (sprint ? 5.4 : 3.55) * dt, z * (sprint ? 5.4 : 3.55) * dt);
    if (sprint) { p.stamina = Math.max(0, p.stamina - 10 * dt); p.staminaDelay = 0.35; }
  }
  if (p.action === 'dodge' && p.actionTime < 0.43) move(s, p, p.dodgeX * 7.3 * dt, p.dodgeZ * 7.3 * dt);
  if (p.action !== 'idle') {
    p.actionTime += dt;
    const impact = p.action === 'heavy' ? 0.49 : 0.22;
    if ((p.action === 'light' || p.action === 'heavy') && !p.hitDone && p.actionTime >= impact) {
      p.hitDone = true; const heavy = p.action === 'heavy';
      for (const e of s.enemies) {
        if (!alive(e) || !inCone(s, p, e, heavy ? 2.7 : 2.25, heavy ? 1.2 : 1.05)) continue;
        const guarded = e.kind === 'guard' && e.action !== 'stagger' && e.action !== 'recover' && Math.abs(angleDiff(facingToward(e, p), e.facing)) < 1.4;
        damageEnemy(s, e, (heavy ? 41 + s.level * 5 : 24 + s.level * 3) * (guarded && !heavy ? 0.4 : 1), heavy ? 45 : 21);
      }
    }
    if (p.action === 'heal' && !p.hitDone && p.actionTime >= 0.72) {
      p.hitDone = true; p.hp = Math.min(maxHp(s), p.hp + (s.charm ? 80 : 60)); effect(s, p, 'heal', '椰子水');
    }
    if (p.actionTime >= DURATIONS[p.action]) { p.action = 'idle'; p.actionTime = 0; }
  }
  if (p.staminaDelay <= 0 && (p.action === 'idle' || p.action === 'parry' || p.action === 'heal')) p.stamina = Math.min(maxStamina(s), p.stamina + 27 * dt);
}

function updateEnemy(s: GameState, e: Enemy, dt: number): void {
  e.flash = Math.max(0, e.flash - dt);
  if (!alive(e)) return;
  const p = s.player; const dist = distance(e, p); const homeDistance = distance(e, e.spawn);
  const sameLevel = Math.abs(e.y - p.y) < 1.8; const sees = sameLevel && lineClear(e, p, s.shortcut);
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
    if (e.timer <= 0) { e.action = 'attack'; e.timer = 0.24; e.hitDone = false; }
    return;
  }
  if (e.action === 'attack') {
    if (e.timer > 0.12) move(s, e, Math.sin(e.facing) * attack.lunge * dt * 5, Math.cos(e.facing) * attack.lunge * dt * 5);
    e.timer -= dt;
    if (!e.hitDone && e.timer <= 0.16) { e.hitDone = true; damagePlayer(s, e); }
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
    .filter(l => !(l.kind === 'shortcut' && s.shortcut) && distance(l, s.player) < 2.05 && Math.abs(l.y - s.player.y) < 0.8 && lineClear(s.player, l, s.shortcut))
    .sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
  if (landmark) { s.nearbyId = landmark.id; s.prompt = landmark.label; }
}

export function stepGame(s: GameState, dtMs: number, input: GameInput = NEUTRAL): void {
  if (s.mode !== 'playing' || s.paused || !Number.isFinite(dtMs) || dtMs <= 0) return;
  const safeInput = { ...input, x: finite(input.x, -1000, 1000) ? input.x : 0, z: finite(input.z, -1000, 1000) ? input.z : 0 };
  actionInput(s, safeInput);
  let remaining = Math.min(dtMs / 1000, 5);
  while (remaining > 0.000001 && s.mode === 'playing') {
    const dt = Math.min(1 / 120, remaining); remaining -= dt; s.time += dt;
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
  if (s.mode !== 'playing' || s.paused || s.player.action !== 'idle') return;
  if (execute(s)) return;
  updatePrompt(s);
  const { nearbyId } = s;
  if (nearbyId === 'bloodstain' && s.bloodstain) { s.rice += s.bloodstain.rice; s.bloodstain = null; effect(s, s.player, 'reward', '失物归还'); say(s, '找回了夜市钱。今晚还吃得起！'); updatePrompt(s); return; }
  const landmark = LANDMARKS.find(l => l.id === nearbyId);
  if (!landmark) return;
  if (landmark.kind === 'rest') {
    if (!safeToRest(s)) { say(s, '敌人还在附近，先脱离战斗才能休息。'); return; }
    s.checkpoint = 'courtyard'; s.player.hp = maxHp(s); s.player.stamina = maxStamina(s); s.player.flasks = 3; s.restCount += 1;
    s.enemies = makeEnemies(s.bossDefeated); s.lockedId = null;
    say(s, '雨灯已点亮。体力、生命与椰子水补满；巷中的敌人也回到了岗位。', 5);
  } else if (landmark.kind === 'cache' && !s.collected.includes(landmark.id)) {
    s.collected.push(landmark.id); s.rice += 35; effect(s, landmark, 'reward', '+35 夜市钱'); say(s, '遗落的钱袋 · 35 夜市钱。回雨灯可用来整备。');
  } else if (landmark.kind === 'charm' && !s.charm) {
    s.charm = true; s.collected.push(landmark.id); effect(s, landmark, 'reward', '金铃护符'); say(s, '金铃护符 · 椰子水恢复量提升至 80。屋脊的远路没有白走。');
  } else if (landmark.kind === 'shortcut') {
    if (s.player.z > -8.8) { say(s, '门闩在另一侧。沿西边高阶绕到夜市。'); return; }
    s.shortcut = true; effect(s, landmark, 'reward', '捷径开启'); say(s, '门闩松开。雨灯到夜市的路连成了一个环。', 5);
  } else if (landmark.kind === 'food') {
    if (!s.bossDefeated) { say(s, '摊主压低声音：先过铁伞那一关，再给你盛饭。'); return; }
    s.mode = 'ending'; s.lockedId = null; s.prompt = ''; s.nearbyId = null;
    say(s, '下播后的第一份打抛饭。明天还要直播，今晚先好好吃饭。', 99);
  } else if (landmark.kind === 'note') {
    if (!s.collected.includes(landmark.id)) s.collected.push(landmark.id);
    say(s, landmark.id === 'laptop' ? '“新笔记本带来泰国，第一晚直播顺利结束！听说金塔下面有家深夜食堂……出门觅食！”' : '便签：夜市长阶通往铁伞的地盘。东边侧廊尽头有道门，从里面能拉开，回来会近很多。', 8);
  }
  updatePrompt(s);
}

export function upgrade(s: GameState): boolean {
  const lamp = LANDMARKS.find(l => l.id === 'courtyard')!;
  if (s.mode !== 'playing' || s.player.action !== 'idle' || distance(s.player, lamp) > 2.05 || Math.abs(s.player.y - lamp.y) > 0.8 || !safeToRest(s)) return false;
  if (s.level >= 5) { say(s, '这身行装已经整备完毕。'); return false; }
  const cost = upgradeCost(s);
  if (s.rice < cost) { say(s, `整备需要 ${cost} 夜市钱。沿暗巷和屋脊找找。`); return false; }
  s.rice -= cost; s.bankedRice += cost; s.level += 1; s.player.hp = Math.min(maxHp(s), s.player.hp + 12); s.player.stamina = Math.min(maxStamina(s), s.player.stamina + 5);
  effect(s, s.player, 'reward', `行装 +${s.level}`); say(s, '整备完成 · 最大生命、体力和武器伤害提升。'); return true;
}

export function respawn(s: GameState): void {
  if (s.mode !== 'dead') return;
  s.player = makePlayer(s.checkpoint === 'courtyard' ? CHECKPOINT : SPAWN); s.player.hp = maxHp(s); s.player.stamina = maxStamina(s);
  s.enemies = makeEnemies(s.bossDefeated); s.mode = 'playing'; s.paused = false; s.effects = []; s.lockedId = null;
  say(s, '雨灯仍亮着。观察起手，留一点体力；丢下的钱就在倒下的地方。', 5); updatePrompt(s);
}

export function setPaused(s: GameState, paused: boolean): void { if (s.mode === 'playing') s.paused = paused; }

export function getObjective(s: GameState): string {
  if (s.mode === 'ending') return '第一幕完成 · 这顿饭，来之不易';
  if (s.bossDefeated) return '到夜市炉火旁，吃上今晚的第一顿饭';
  if (s.shortcut) return '挑战封街人 · 铁伞，抵达深夜食堂';
  if (s.charm) return '沿夜市长阶下行，找出回到中庭的近路';
  if (s.checkpoint === 'courtyard') return '穿过晾衣暗巷，登上金塔屋脊';
  return '合上笔记本，沿旅馆外梯寻找雨灯';
}

export function saveGame(s: GameState): string { return JSON.stringify(s); }

function validPosition(p: unknown, shortcut: boolean): p is Vec3 {
  if (!p || typeof p !== 'object') return false;
  const v = p as Vec3;
  return finite(v.x, -30, 30) && finite(v.y, -1, 10) && finite(v.z, -60, 25)
    && canOccupy(v.x, v.z, v.y, shortcut, 0.05) && Math.abs((heightAt(v.x, v.z) ?? -100) - v.y) < 0.08;
}

export function loadGame(raw: string | null): GameState | null {
  if (!raw || raw.length > 60000) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    if (!s || s.version !== 1 || !['title', 'playing', 'dead', 'ending'].includes(s.mode) || typeof s.paused !== 'boolean') return null;
    if (!['room', 'courtyard'].includes(s.checkpoint) || !['charm', 'shortcut', 'bossDefeated'].every(k => typeof s[k as keyof GameState] === 'boolean')) return null;
    for (const k of ['deaths', 'kills', 'parries', 'executions', 'rice', 'bankedRice', 'restCount', 'nextEffectId'] as const) if (!finite(s[k], 0, 1000000) || !Number.isInteger(s[k])) return null;
    if (!finite(s.level, 0, 5) || !Number.isInteger(s.level) || !finite(s.time, 0, 10000000)) return null;
    if (!Array.isArray(s.collected) || s.collected.length > LANDMARKS.length || new Set(s.collected).size !== s.collected.length || s.collected.some(id => !LANDMARKS.some(l => l.id === id))) return null;
    if (!Array.isArray(s.visited) || s.visited.length > 30 || s.visited.some(v => typeof v !== 'string' || v.length > 100)) return null;
    const p = s.player;
    if (!validPosition(p, s.shortcut) || !finite(p.hp, 0, maxHp(s)) || !finite(p.stamina, 0, maxStamina(s)) || !finite(p.facing, -100, 100)) return null;
    if (!Object.hasOwn(DURATIONS, p.action) || !finite(p.actionTime, 0, 5) || !finite(p.invulnerable, 0, 1.1) || !finite(p.staminaDelay, 0, 1)) return null;
    if (!finite(p.flasks, 0, 3) || !Number.isInteger(p.flasks) || !finite(p.dodgeX, -1, 1) || !finite(p.dodgeZ, -1, 1) || typeof p.hitDone !== 'boolean') return null;
    if ((s.mode === 'dead') !== (p.hp === 0) || (s.mode === 'dead') !== (p.action === 'dead')) return null;
    if (!Array.isArray(s.enemies) || s.enemies.length !== ENEMY_SPAWNS.length) return null;
    for (let i = 0; i < s.enemies.length; i += 1) {
      const e = s.enemies[i]; const spawn = ENEMY_SPAWNS[i];
      if (!e || e.id !== spawn.id || e.kind !== spawn.kind || e.name !== spawn.name || !validPosition(e, s.shortcut)) return null;
      if (!e.spawn || e.spawn.x !== spawn.x || e.spawn.y !== spawn.y || e.spawn.z !== spawn.z) return null;
      if (e.maxHp !== STATS[e.kind].hp || e.maxPosture !== STATS[e.kind].posture || !finite(e.hp, 0, e.maxHp) || !finite(e.posture, 0, e.maxPosture)) return null;
      if (!['idle', 'chase', 'windup', 'attack', 'recover', 'stagger', 'dead'].includes(e.action) || (e.hp === 0) !== (e.action === 'dead')) return null;
      if (!finite(e.timer, -0.02, 5) || !finite(e.attackIndex, 0, 1000000) || !Number.isInteger(e.attackIndex) || ![1, 2].includes(e.phase) || !finite(e.facing, -100, 100) || !finite(e.flash, 0, 1)) return null;
      if (typeof e.hitDone !== 'boolean' || typeof e.aggro !== 'boolean') return null;
    }
    if (s.bossDefeated !== (s.enemies.find(e => e.kind === 'boss')?.hp === 0) || (s.mode === 'ending' && !s.bossDefeated)) return null;
    if (s.charm !== s.collected.includes('roof-charm')) return null;
    if (s.bloodstain !== null && (!validPosition(s.bloodstain, s.shortcut) || !finite(s.bloodstain.rice, 0, 1000000) || !Number.isInteger(s.bloodstain.rice))) return null;
    if (s.lockedId !== null && !s.enemies.some(e => e.id === s.lockedId && alive(e))) return null;
    if (typeof s.message !== 'string' || s.message.length > 500 || !finite(s.messageTime, 0, 100)) return null;
    // Preserve combat, health and enemy deaths exactly. A refresh cannot heal,
    // reset a losing boss fight, or award the same kill a second time.
    s.effects = []; s.paused = false; updatePrompt(s); return s;
  } catch { return null; }
}
