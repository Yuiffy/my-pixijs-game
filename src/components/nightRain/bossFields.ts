import type { BossField, BossSkill, Enemy, GameState, Vec3 } from './types';
import { bossCharacter } from './bossRoster';
import { bossAttack } from './bossCombat';
import { canOccupy, lineClear, projectileBlocked, supportAt, WORLD_BOUNDS } from './world';

export const MAX_BOSS_FIELDS = 16;
export const FIELD_COLORS: Record<BossSkill, string> = { starfall: '#ffd287', starcards: '#92deff', pine: '#8fce78', shield: '#79d9ef', drones: '#d7aaff', leap: '#ffad67', freeze: '#98ddff', counter: '#ffc75b', song: '#ff905b', beam: '#df91ff', crossbeam: '#df91ff', dragon: '#78d2b9', quake: '#efa590', gust: '#d3dba8' };
export const FIELD_HINTS: Record<BossSkill, string> = { starfall: '落点已锁定 · 离开金圈', starcards: '三次迟发 · 横移 / 弹反 · 第三发后反击', pine: '离开松苗 · 跳跃可脱离缠绕', shield: '重击破盾 / 绕背', drones: '横移躲弹 · 近身重击打断', leap: '离开落点 · 落地后反击', freeze: '离开冻域 · 敌我同时停止', counter: '镐亮别贪刀 · 绕背反击', song: '侧翼接近 · 重击打断歌唱', beam: '向侧面走 · 跳跃躲不开光束', crossbeam: '两道光束错开发射 · 向侧面走', dragon: '追踪墨迹 · 留出闪避体力', quake: '跳过扩散震波', gust: '观察风弹 · 侧移或弹反' };
const gap = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
export const fieldActive = (f: BossField) => f.age >= f.delay && f.age < f.delay + f.duration;
export const inField = (f: BossField, p: Vec3) => Math.abs(p.y - f.y) < 1 && gap(f, p) <= f.radius;
export const frozenByBoss = (s: GameState, p: Vec3) => s.bossFields.some(f => f.kind === 'freeze' && fieldActive(f) && inField(f, p));
export const snaredByBoss = (s: GameState) => s.player.jumpHeight < 0.55 && s.bossFields.some(f => f.kind === 'pine' && fieldActive(f) && inField(f, s.player));
export const bossLeapHeight = (s: GameState, e: Enemy) => {
  const f = s.bossFields.find(field => field.owner === e.id && field.kind === 'leap' && field.age < field.delay);
  return f ? Math.sin((f.age / f.delay) * Math.PI) * 1.8 : 0;
};
export const bossCloaked = (s: GameState, e: Enemy) => s.bossFields.some(f => f.owner === e.id && f.kind === 'dragon' && f.age < f.delay);

export function bossBolt(s: GameState, e: Enemy, origin: Vec3, angle: number, damage: number, speed = 7, tint = '#d7aaff', parryable = true) {
  const distance = Math.max(1, gap(origin, s.player));
  s.projectiles.push({ id: s.nextEffectId++, owner: e.id, ...origin, vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed, vy: ((s.player.y + 0.9 - origin.y) * speed) / distance, life: 2.5, damage, kind: 'bolt', parryable, jumpable: false, tint });
  if (s.projectiles.length > 24) s.projectiles.shift();
}

export function castBossSkill(s: GameState, e: Enemy): boolean {
  const attack = bossAttack(e); if (!attack?.skill) return false;
  const kind = attack.skill;
  const targeted = ['pine', 'leap', 'freeze', 'starfall'].includes(kind);
  const p = s.player;
  const position = targeted && canOccupy(p.x, p.z, p.y, s) && lineClear(e, p, s) ? p : e;
  const field: BossField = { id: s.nextEffectId++, owner: e.id, kind, x: position.x, y: position.y, z: position.z, facing: e.facing, age: 0, delay: 0.9, duration: 0.5, radius: 1.8, length: attack.range, damage: attack.damage, next: 0, hit: false };
  if (kind === 'starfall') { field.radius = e.phase === 2 ? 2.8 : 2.1; field.delay = 1.5; field.duration = 0.35; }
  if (kind === 'starcards') { field.delay = 0.5; field.duration = 2.6; field.next = 0.5; }
  if (kind === 'pine') { field.radius = 1.55; field.duration = 3.2; }
  if (kind === 'freeze') { field.radius = 2.6; field.delay = 1.35; field.duration = 1.7; }
  if (kind === 'shield' || kind === 'counter') { field.radius = 1.15; field.delay = 0; field.duration = 2.4; }
  if (kind === 'drones') { field.radius = 1.25; field.delay = 0.45; field.duration = 2.8; field.next = 0.45; }
  if (kind === 'song') { field.radius = 1.2; field.delay = 0.8; field.duration = 2.5; field.next = 0.8; }
  if (kind === 'dragon') { field.delay = 1.6; field.duration = 0.4; }
  if (kind === 'quake') { field.delay = 0.65; field.duration = 1.25; field.radius = 5.2; }
  if (kind === 'gust') { field.delay = 0.7; field.duration = 0.3; }
  if (kind === 'beam' || kind === 'crossbeam') {
    field.delay = 1.1; field.duration = 0.45; field.radius = 0.65;
  }
  const fields = kind === 'crossbeam'
    ? [{ ...field, kind: 'beam' as const, facing: field.facing - 0.42 }, { ...field, kind: 'beam' as const, id: s.nextEffectId++, facing: field.facing + 0.42, delay: 1.6 }]
    : [field];
  for (const f of fields) {
    if (f.kind === 'beam') for (let distance = 0.3; distance < f.length; distance += 0.2) {
      if (projectileBlocked({ x: f.x + Math.sin(f.facing) * distance, y: f.y + 1, z: f.z + Math.cos(f.facing) * distance }, s)) { f.length = distance; break; }
    }
    s.bossFields.push(f);
  }
  if (s.bossFields.length > MAX_BOSS_FIELDS) s.bossFields.splice(0, s.bossFields.length - MAX_BOSS_FIELDS);
  return true;
}

/** Returns the damage multiplier after a readable guard/counter response. */
export function bossDefense(s: GameState, e: Enemy, damage: number): number {
  const field = s.bossFields.find(f => f.owner === e.id && ['shield', 'counter'].includes(f.kind) && fieldActive(f));
  if (!field || damage <= 3 || s.player.action === 'execute') return 1;
  const angle = Math.atan2(s.player.x - e.x, s.player.z - e.z) - e.facing;
  if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) > 1.35) return 1;
  if (field.kind === 'shield' && s.player.action === 'heavy') {
    field.age = field.delay + field.duration; e.action = 'recover'; e.timer = 1.8;
    return 1;
  }
  if (field.kind === 'counter' && field.age >= field.next) {
    field.next = field.age + 0.8;
    bossBolt(s, e, { x: e.x + Math.sin(e.facing) * 0.8, y: e.y + 1, z: e.z + Math.cos(e.facing) * 0.8 }, e.facing, field.damage, 5, FIELD_COLORS.counter, false);
  }
  return field.kind === 'shield' ? 0.25 : 0.45;
}

export function interruptBossChannel(s: GameState, e: Enemy) {
  if (s.player.action !== 'heavy') return;
  const channel = s.bossFields.find(f => f.owner === e.id && ['song', 'drones'].includes(f.kind) && f.age < f.delay + f.duration);
  if (!channel) return;
  channel.age = channel.delay + channel.duration; e.action = 'recover'; e.timer = 2;
  s.effects.push({ id: s.nextEffectId++, x: e.x, y: e.y + 1, z: e.z, kind: 'parry', life: 0.6, text: '打断' });
}

type Callbacks = { hit: (e: Enemy, f: BossField, jumpable: boolean) => void; move: (e: Enemy, x: number, z: number) => void };
export function updateBossFields(s: GameState, dt: number, callbacks: Callbacks) {
  for (const f of s.bossFields) {
    const e = s.enemies.find(enemy => enemy.id === f.owner);
    if (!e || e.hp <= 0 || !e.aggro) { f.age = f.delay + f.duration; continue; }
    f.age += dt;
    if (['shield', 'counter', 'drones'].includes(f.kind)) { f.x = e.x; f.y = e.y; f.z = e.z; f.facing = e.facing; }
    if (f.kind === 'leap' && f.age < f.delay) {
      const left = Math.max(dt, f.delay - f.age);
      callbacks.move(e, ((f.x - e.x) * dt) / left, ((f.z - e.z) * dt) / left);
    }
    if (f.kind === 'dragon' && f.age < f.delay) {
      callbacks.move(e, Math.cos(f.facing) * dt * 1.6, -Math.sin(f.facing) * dt * 1.6);
      if (f.age >= f.next) {
        f.next += 0.25;
        s.effects.push({ id: s.nextEffectId++, x: e.x, y: e.y, z: e.z, kind: 'dodge', life: 0.65, text: '墨迹' });
      }
    }
    if (!fieldActive(f) || (f.kind !== 'freeze' && frozenByBoss(s, e))) continue;
    if (f.kind === 'starcards' && f.age >= f.next && f.next < 2.7) {
      f.next += 1.05;
      const origin = { x: e.x, y: e.y + 1.3, z: e.z };
      bossBolt(s, e, origin, Math.atan2(s.player.x - e.x, s.player.z - e.z), f.damage, 6.5, FIELD_COLORS.starcards);
    }
    if (f.kind === 'drones' && f.age >= f.next) {
      const side = Math.round((f.next - f.delay) / 0.4) % 2 ? -1 : 1; f.next += 0.4;
      const origin = { x: e.x + Math.cos(e.facing) * side, y: e.y + 1.5, z: e.z - Math.sin(e.facing) * side };
      bossBolt(s, e, origin, Math.atan2(s.player.x - origin.x, s.player.z - origin.z), f.damage);
    }
    if (f.kind === 'song' && f.age >= f.next) {
      f.next += 0.8;
      for (const angle of [-0.34, 0, 0.34]) bossBolt(s, e, { x: e.x, y: e.y + 1.1, z: e.z }, f.facing + angle, f.damage, 5.5, FIELD_COLORS.song);
      e.hp = Math.min(e.maxHp, e.hp + 7);
    }
    if (['dragon', 'gust'].includes(f.kind) && !f.hit) {
      f.hit = true;
      for (const angle of f.kind === 'gust' ? [-0.4, 0, 0.4] : [0]) bossBolt(s, e, { x: e.x, y: e.y + 1, z: e.z }, f.facing + angle, f.damage, f.kind === 'gust' ? 6 : 8, FIELD_COLORS[f.kind]);
    }
    const p = s.player; let hits = false;
    if (f.kind === 'pine' && f.age >= f.next) { hits = inField(f, p); if (hits) f.next = f.age + 1.2; }
    if (f.kind === 'shield') hits = !f.hit && inField(f, p);
    if (f.kind === 'starfall') hits = !f.hit && inField(f, p);
    if (f.kind === 'leap') hits = !f.hit && inField(f, p);
    if (f.kind === 'quake') {
      const radius = ((f.age - f.delay) / f.duration) * f.radius;
      hits = !f.hit && Math.abs(gap(f, p) - radius) < 0.4 && Math.abs(f.y - p.y) < 1;
    }
    if (f.kind === 'beam') {
      const dx = p.x - f.x; const dz = p.z - f.z;
      const along = dx * Math.sin(f.facing) + dz * Math.cos(f.facing);
      const across = dx * Math.cos(f.facing) - dz * Math.sin(f.facing);
      hits = !f.hit && along >= 0 && along <= f.length && Math.abs(across) < f.radius && Math.abs(p.y - f.y) < 1;
    }
    if (hits && lineClear(f, p, s)) { f.hit = true; callbacks.hit(e, f, f.kind === 'quake' || f.kind === 'pine'); }
  }
  s.bossFields = s.bossFields.filter(f => f.age < f.delay + f.duration);
}

export function validBossFields(s: GameState): boolean {
  if (!Array.isArray(s.bossFields) || s.bossFields.length > MAX_BOSS_FIELDS) return false;
  const ids = new Set<number>();
  return s.bossFields.every(f => {
    if (!f || !Object.hasOwn(FIELD_COLORS, f.kind) || ids.has(f.id)) return false;
    ids.add(f.id);
    const owner = s.enemies.find(enemy => enemy.id === f.owner);
    return !!owner && (!!bossCharacter(owner.kind) || owner.kind === 'sentinel')
      && [f.id, f.x, f.y, f.z, f.facing, f.age, f.delay, f.duration, f.radius, f.length, f.damage, f.next].every(Number.isFinite)
      && Number.isInteger(f.id) && f.id >= 0 && typeof f.hit === 'boolean'
      && f.x >= WORLD_BOUNDS.x1 && f.x <= WORLD_BOUNDS.x2 && f.z >= WORLD_BOUNDS.z1 && f.z <= WORLD_BOUNDS.z2
      && f.y >= WORLD_BOUNDS.minY && f.y <= WORLD_BOUNDS.maxY && Math.abs(f.facing) <= 100
      && f.age >= 0 && f.age <= f.delay + f.duration && f.delay >= 0 && f.delay <= 5 && f.duration > 0 && f.duration <= 8
      && f.radius > 0 && f.radius <= 10 && f.length > 0 && f.length <= 15 && f.damage >= 0 && f.damage <= 100 && f.next >= 0 && f.next <= 15
      && supportAt(f.x, f.z, f.y + 0.6) !== null;
  });
}
