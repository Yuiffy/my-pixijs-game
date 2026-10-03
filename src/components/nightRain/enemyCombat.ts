import type { Enemy } from './types';
import type { Pose } from './combat';

// Keep the quick contact, but give the weapon enough time to follow through.
export const ENEMY_STRIKE_TIME = 0.36;
export const ENEMY_CONTACT_TIME = 0.08;
export type EnemyStyle = 'thrust' | 'overhead' | 'sweep' | 'draw' | 'shot';
export type EnemyPose = Pose & { weaponPitch: number; elbow: number; leftElbow: number; side: number; advance: number; stance: number };
export const ENEMY_NEUTRAL: EnemyPose = { lean: 0, twist: 0, crouch: 0, ax: 0, ay: 0, az: -0.08, lx: 0, lz: 0, legL: 0, legR: 0, weaponPitch: Math.PI / 2, elbow: 0, leftElbow: 0, side: 0, advance: 0, stance: 0 };
const key = (p: Partial<EnemyPose>): EnemyPose => ({ ...ENEMY_NEUTRAL, ...p });
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function mix(a: EnemyPose, b: EnemyPose, amount: number, fast = false): EnemyPose {
  const t = clamp(amount); const eased = fast ? 1 - (1 - t) ** 3 : t * t * (3 - 2 * t);
  const p = { ...a };
  for (const name of Object.keys(p) as (keyof EnemyPose)[]) p[name] += (b[name] - a[name]) * eased;
  return p;
}

export function enemyStyle(e: Enemy): EnemyStyle {
  const index = e.attackIndex % 3;
  if (e.kind === 'regent' && index === 0) return 'shot';
  if ((e.kind === 'boss' || e.kind === 'duelist') && index === 1) return 'draw';
  if (e.kind === 'guard' || (index === 1 && e.kind !== 'lancer')) return 'overhead';
  if (e.kind === 'prowler' || e.kind === 'duelist' || e.kind === 'reaver' || enemyAttack(e).arc > 1) return 'sweep';
  return 'thrust';
}

export function enemyTiming(e: Enemy) {
  const style = enemyStyle(e); const { windup } = enemyAttack(e);
  return { raise: Math.min(windup * 0.3, style === 'overhead' ? 0.24 : 0.2), commit: Math.min(windup * 0.35, style === 'overhead' || style === 'draw' ? 0.3 : 0.24) };
}

/** Readout and weapon glint use the same countdown as damage and steering. */
export function enemyTell(e: Enemy) {
  const spec = enemyAttack(e); const timing = enemyTiming(e);
  const toImpact = e.action === 'windup' ? Math.max(0, e.timer) + ENEMY_CONTACT_TIME : e.action === 'attack' && !e.hitDone ? Math.max(0, e.timer - (ENEMY_STRIKE_TIME - ENEMY_CONTACT_TIME)) : null;
  const stage = e.action === 'windup' ? spec.windup - e.timer < timing.raise ? 'raise' : e.timer > timing.commit ? 'hold' : 'release' : e.action === 'attack' ? 'strike' : e.action === 'recover' ? 'recover' : 'idle';
  return { style: enemyStyle(e), stage, toImpact, committed: (e.action === 'windup' && e.timer <= timing.commit) || e.action === 'attack', parryNow: spec.parryable && toImpact !== null && toImpact > 0 && toImpact <= 0.21, dangerous: !spec.parryable };
}

export function enemyWeaponLength(e: Pick<Enemy, 'kind'>) {
  if (e.kind === 'lancer' || e.kind === 'monk') return 2.1;
  if (e.kind === 'regent') return 1.7;
  if (['warden', 'abbot', 'serpent', 'elegist'].includes(e.kind)) return 1.65;
  return e.kind === 'boss' || e.kind === 'captain' || e.kind === 'duelist' ? 1.2 : 1.35;
}

const KEYS: Record<EnemyStyle, [EnemyPose, EnemyPose]> = {
  thrust: [
    key({ ax: -0.65, ay: -0.35, az: -0.65, weaponPitch: 3.05, elbow: -0.95, lx: -0.95, leftElbow: -0.65, lz: 0.25, twist: -0.48, lean: -0.16, crouch: -0.07, advance: -0.16, side: -0.06, stance: 0.14, legL: 0.18, legR: -0.2 }),
    key({ ax: -1.5, weaponPitch: 3.05, elbow: -0.05, lx: -0.75, leftElbow: -0.4, twist: 0.35, lean: 0.25, advance: 0.15, stance: 0.13, legL: -0.25, legR: 0.2 }),
  ],
  overhead: [
    key({ ax: -2.65, az: -0.3, weaponPitch: 3.1, elbow: -0.55, lx: -2.45, leftElbow: -0.55, lz: 0.32, lean: -0.22, twist: -0.18, crouch: -0.12, advance: -0.14, stance: 0.19, legL: -0.1, legR: 0.26 }),
    key({ ax: -0.75, weaponPitch: 2.55, elbow: -0.04, lx: -0.8, leftElbow: -0.15, lean: 0.42, twist: 0.15, crouch: -0.14, advance: 0.2, stance: 0.18, legL: -0.3, legR: 0.18 }),
  ],
  sweep: [
    key({ ax: -1.05, ay: -1.5, az: -1.08, elbow: -0.65, lx: -0.6, lz: -0.55, leftElbow: -0.6, twist: -0.95, lean: -0.1, crouch: -0.1, side: -0.12, advance: -0.06, stance: 0.22, legL: 0.12, legR: -0.15 }),
    key({ ax: -1.05, ay: 1.45, az: -0.22, weaponPitch: 2.5, elbow: -0.04, lx: 0.65, lz: -0.2, leftElbow: -0.3, twist: 1.05, lean: 0.2, side: 0.12, advance: 0.1, stance: 0.2, legL: -0.2, legR: 0.13 }),
  ],
  draw: [
    key({ ax: -0.3, ay: -1.12, az: -0.7, elbow: -0.28, weaponPitch: 0.65, lx: -0.6, lz: 0.55, leftElbow: -1, twist: -0.8, lean: -0.1, crouch: -0.14, side: -0.09, advance: -0.1, stance: 0.2, legL: 0.16, legR: -0.12 }),
    key({ ax: -1.18, ay: 1.2, az: -0.3, weaponPitch: 2.7, elbow: -0.08, lx: 0.3, lz: 0.4, leftElbow: -0.35, twist: 0.9, lean: 0.22, side: 0.09, advance: 0.15, stance: 0.18, legL: -0.2, legR: 0.13 }),
  ],
  shot: [
    key({ ax: -1.2, ay: -0.12, az: -0.3, weaponPitch: 3.05, elbow: -0.35, lx: -1.2, lz: 0.25, leftElbow: -0.55, lean: -0.08, crouch: -0.1, twist: -0.18, advance: -0.1, stance: 0.2, legL: 0.1, legR: -0.12 }),
    key({ ax: -1.45, az: -0.22, weaponPitch: 3.05, elbow: -0.1, lx: -1.4, leftElbow: -0.15, lz: 0.2, lean: -0.18, crouch: -0.07, twist: 0.12, advance: -0.16, stance: 0.18, legL: 0.06, legR: -0.1 }),
  ],
};

/** Quick raise, planted loaded silhouette, a distinct release, contact and weighty recovery.
 * No wall-clock animation: pause and hitstop freeze every joint and cue together. */
export function enemyMotion(e: Enemy): EnemyPose | null {
  const spec = enemyAttack(e); const timing = enemyTiming(e); const style = enemyStyle(e);
  const [loaded, contact] = KEYS[style];
  const gathered = { ...loaded, twist: loaded.twist - 0.09, lean: loaded.lean - 0.055, elbow: loaded.elbow - 0.12, crouch: loaded.crouch - 0.025 };
  const release = mix(gathered, contact, 0.16);
  const follow = { ...contact, ax: contact.ax + (style === 'shot' ? -0.15 : 0.45), twist: contact.twist + (style === 'sweep' ? 0.22 : 0.12), elbow: -0.3, leftElbow: -0.45, lean: contact.lean + (style === 'shot' ? 0.06 : 0.04), advance: contact.advance + 0.025 };
  if (e.action === 'windup') {
    const t = spec.windup - e.timer;
    if (t < timing.raise) return mix(ENEMY_NEUTRAL, loaded, t / timing.raise, true);
    if (e.timer > timing.commit) return mix(loaded, gathered, (t - timing.raise) / (spec.windup - timing.raise - timing.commit));
    return mix(gathered, release, 1 - e.timer / timing.commit);
  }
  if (e.action === 'attack') {
    const t = ENEMY_STRIKE_TIME - e.timer;
    return t < ENEMY_CONTACT_TIME ? mix(release, contact, t / ENEMY_CONTACT_TIME, true) : mix(contact, follow, (t - ENEMY_CONTACT_TIME) / (ENEMY_STRIKE_TIME - ENEMY_CONTACT_TIME));
  }
  if (e.action === 'recover') {
    const progress = clamp(1 - e.timer / spec.recovery);
    const recoil = mix(follow, { ...follow, elbow: -0.9, leftElbow: -0.8, lean: follow.lean * 0.6, advance: follow.advance * 0.8 }, Math.min(1, progress / 0.18));
    return progress < 0.18 ? recoil : mix(recoil, ENEMY_NEUTRAL, (progress - 0.18) / 0.82);
  }
  return null;
}

export function enemyAttack(e: Enemy) {
  const index = e.attackIndex % 3;
  if (e.kind === 'elegist') {
    if (index === 1) return { name: '礼墨 · 迟落墨笔', windup: e.phase === 2 ? 2.05 : 1.65, range: 3.7, arc: 0.8, damage: 50, recovery: 1.7, parryable: true, lunge: 1 };
    if (index === 2) return { name: '危 · 千纸归灯', windup: e.phase === 2 ? 0.98 : 1.3, range: 4.4, arc: Math.PI, damage: 42, recovery: 1.4, parryable: false, lunge: 0 };
    return { name: '墨笔点名', windup: e.phase === 2 ? 0.66 : 0.95, range: 3.4, arc: 0.5, damage: 38, recovery: 1.05, parryable: true, lunge: 1.6 };
  }
  if (e.kind === 'serpent') {
    if (index === 1) return { name: '悠亚 · 迟落星杖', windup: e.phase === 2 ? 1.95 : 1.65, range: 4.1, arc: 0.7, damage: 55, recovery: 1.8, parryable: true, lunge: 1.2 };
    if (index === 2) return { name: '危 · 天外环流', windup: e.phase === 2 ? 0.94 : 1.3, range: 5.1, arc: Math.PI, damage: 46, recovery: 1.55, parryable: false, lunge: 0 };
    return { name: '星杖穿云', windup: e.phase === 2 ? 0.62 : 0.96, range: 3.7, arc: 0.45, damage: 42, recovery: e.phase === 2 ? 0.82 : 1.05, parryable: true, lunge: 2.1 };
  }
  if (e.kind === 'warden') {
    if (index === 1) return { name: '花礼 · 落花重桨', windup: 1.8, range: 3.5, arc: 0.8, damage: 48, recovery: 1.8, parryable: true, lunge: 0.7 };
    if (index === 2) return { name: '危 · 落花起浪', windup: e.phase === 2 ? 0.95 : 1.3, range: 4.2, arc: Math.PI, damage: 38, recovery: 1.4, parryable: false, lunge: 0 };
    return { name: '花舟迎雨', windup: e.phase === 2 ? 0.78 : 1.08, range: 3.4, arc: 0.5, damage: 36, recovery: 1.1, parryable: true, lunge: 1.3 };
  }
  if (e.kind === 'abbot') {
    if (index === 1) return { name: '瑞娅 · 迟落霜钟', windup: e.phase === 2 ? 1.9 : 1.55, range: 3.1, arc: 0.75, damage: 43, recovery: 1.5, parryable: true, lunge: 0.8 };
    if (index === 2) return { name: '危 · 静界霜环', windup: 1.1, range: 3.8, arc: Math.PI, damage: 34, recovery: 1.25, parryable: false, lunge: 0 };
    return { name: '霜杖凝雨', windup: e.phase === 2 ? 0.61 : 0.85, range: 3, arc: 0.5, damage: 33, recovery: 0.9, parryable: true, lunge: 1.5 };
  }
  if (e.kind === 'monk') {
    if (index === 2) return { name: '危 · 扫叶杖', windup: 1.2, range: 3.1, arc: 2.5, damage: 28, recovery: 1.25, parryable: false, lunge: 0 };
    return { name: index === 1 ? '听雨迟杖' : '竹杖连云', windup: index === 1 ? 1.5 : 0.82, range: 2.8, arc: 0.8, damage: 32, recovery: 1.05, parryable: true, lunge: 0.6 };
  }
  if (e.kind === 'reaver') {
    if (index === 2) return { name: '危 · 钩镰割苇', windup: 1.15, range: 3.3, arc: 2.8, damage: 30, recovery: 1.3, parryable: false, lunge: 0 };
    return { name: index === 1 ? '收网迟钩' : '钩镰探雨', windup: index === 1 ? 1.45 : 1, range: 3, arc: 0.6, damage: 32, recovery: 1.1, parryable: true, lunge: 0.85 };
  }
  if (e.kind === 'regent') {
    if (index === 1) return { name: '弥月 · 迟落双炮', windup: e.phase === 2 ? 1.85 : 1.55, range: 3.65, arc: 0.85, damage: 48, recovery: 1.65, parryable: true, lunge: 1.1 };
    if (index === 2) return { name: '危 · 双月齐鸣', windup: e.phase === 2 ? 0.98 : 1.28, range: 4.5, arc: Math.PI, damage: 40, recovery: 1.5, parryable: false, lunge: 0 };
    return { name: '兔耳 · 星火点射', windup: e.phase === 2 ? 0.66 : 0.96, range: 5.6, arc: 0.28, damage: 36, recovery: 1.1, parryable: true, lunge: 0 };
  }
  if (e.kind === 'captain') {
    if (index === 1) return { name: '米汀 · 双刃迟切', windup: 1.5, range: 3.1, arc: 0.8, damage: 39, recovery: 1.45, parryable: true, lunge: 0.8 };
    if (index === 2) return { name: '危 · 断潮换步', windup: 1.2, range: 3.65, arc: Math.PI, damage: 32, recovery: 1.25, parryable: false, lunge: 0 };
    return { name: '双刀破潮', windup: e.phase === 2 ? 0.76 : 1.1, range: 3.2, arc: 0.5, damage: 30, recovery: 1.05, parryable: true, lunge: 1.2 };
  }
  if (e.kind === 'lancer') return { name: index === 1 ? '沉枪迟刺' : '长枪直刺', windup: index === 1 ? 1.45 : 1, range: 3.25, arc: 0.42, damage: 28, recovery: 1.15, parryable: true, lunge: 0.75 };
  if (e.kind === 'nana') {
    if (index === 1) return { name: '沉镐 · 延迟落潮', windup: 1.65, range: 3.5, arc: 0.75, damage: 43, recovery: 1.4, parryable: true, lunge: 1.2 };
    if (index === 2) return { name: '危 · 七重返潮', windup: e.phase === 2 ? 0.92 : 1.25, range: 4.0, arc: Math.PI, damage: 34, recovery: 1.35, parryable: false, lunge: 0 };
    return { name: '破浪镐击', windup: e.phase === 2 ? 0.68 : 0.94, range: 3.1, arc: 0.6, damage: 31, recovery: e.phase === 2 ? 0.55 : 0.9, parryable: true, lunge: 1.7 };
  }
  if (e.kind === 'azi') {
    if (index === 1) return { name: '休止符 · 迟落拍', windup: e.phase === 2 ? 1.8 : 1.4, range: 2.9, arc: 0.8, damage: 34, recovery: 1.35, parryable: true, lunge: 0.8 };
    if (index === 2) return { name: '危 · 蛙鸣圆舞', windup: 1.12, range: 3.3, arc: Math.PI, damage: 27, recovery: 1.1, parryable: false, lunge: 0 };
    return { name: '青杖切分', windup: 0.75, range: 2.65, arc: 1.3, damage: 25, recovery: 0.7, parryable: true, lunge: 0.7 };
  }
  if (e.kind === 'boss') {
    if (index === 1) return { name: '栞铃 · 迟拍拔刀', windup: e.phase === 2 ? 1.9 : 1.58, range: 3.4, arc: 0.72, damage: 40, recovery: 1.45, parryable: true, lunge: 1.35 };
    if (index === 2 && e.phase === 2) return { name: '危 · 花返横切', windup: 1.16, range: 3.9, arc: Math.PI, damage: 36, recovery: 1.5, parryable: false, lunge: 0 };
    if (index === 2) return { name: '收伞 · 回身斩', windup: 1.02, range: 3.1, arc: 1.45, damage: 30, recovery: 1.15, parryable: true, lunge: 0.4 };
    return { name: e.phase === 2 ? '雨切 · 穿花步' : '栞铃 · 点雨刺', windup: e.phase === 2 ? 0.72 : 0.94, range: 2.95, arc: 0.5, damage: 32, recovery: 0.95, parryable: true, lunge: e.phase === 2 ? 2 : 1.5 };
  }
  if (e.kind === 'duelist') return { name: index === 1 ? '居合蓄斩' : '快刀横斩', windup: index === 1 ? 1.15 : 0.65, range: 2.35, arc: 1.13, damage: 24, recovery: 0.85, parryable: true, lunge: 0.6 };
  if (e.kind === 'guard') return { name: '举棍重击', windup: 1.06, range: 2.3, arc: 0.9, damage: 25, recovery: 1.2, parryable: true, lunge: 0.25 };
  return { name: '短棍挥打', windup: 0.88, range: 1.95, arc: 1.15, damage: 19, recovery: 1.05, parryable: true, lunge: 0.3 };
}
