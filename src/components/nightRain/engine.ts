import type { Action, AttackId, Effect, Enemy, EnemyKind, GameInput, GameState, Player, Vec3, WorldAccess } from './types';
import { ceilingAt, deckBlocks, playerBlocked, projectileBlocked, supportAt, canOccupy, REST_POINTS, ENEMY_SPAWNS, AMBUSH_ENEMIES, LANDMARKS, lineClear, regionAt, SPAWN, WORLD_BOUNDS } from './world';
import { enemyRole, isBoss } from './encounters';
import { DUNGEON_BOSSES, DUNGEON_ENEMIES, DUNGEON_PORTALS, DUNGEONS, giantScale, undergroundId } from './dungeons';
import { discoverDungeon, liftPosition, migrateUnderground, updateLift, validLift } from './dungeonTravel';
import { ARMORS, validEquipment } from './equipment';
import { bestiaryKey } from './bestiary';
import { freshHaven, HAVEN_ENEMIES, HAVEN_FERRIES, HAVEN_GATES, HAVEN_LORE, havenAvailable } from './haven';
import { applyConversation, validHaven } from './havenStory';
import { CHAPTER_ENEMIES, CHAPTER_GATES, CHAPTER_LORE } from './chapter';
import { FERRY_DESTINATIONS, riverSeals, VALLEY_BOSSES, VALLEY_ENEMIES, VALLEY_GATES, VALLEY_LORE } from './valley';

import { enemyAttack, enemyTiming, ENEMY_STRIKE_TIME, ENEMY_CONTACT_TIME } from './enemyCombat';

import { BOSS_ROSTER } from './bossRoster';
import { WEAPONS, weaponAttack, weaponUnlocked } from './weapons';

import { ATTACKS, BUFFER_TIME, CHARGE_TIME, DASH_HOLD_TIME, PARRY_WINDOW } from './combat';

export { enemyAttack } from './enemyCombat';

// The simulation contains no browser, rendering, wall-clock or random state.
// All times are seconds, except the public stepGame argument (milliseconds).
const STATS: Record<EnemyKind, { hp: number; posture: number; damage: number; speed: number; reward: number }> = {
  colossus: { hp: 530, posture: 190, damage: 34, speed: 1.45, reward: 220 },
  sentinel: { hp: 720, posture: 220, damage: 39, speed: 1.3, reward: 300 },
  prowler: { hp: 68, posture: 64, damage: 19, speed: 2.1, reward: 18 },
  guard: { hp: 112, posture: 94, damage: 25, speed: 1.65, reward: 30 },
  duelist: { hp: 144, posture: 100, damage: 24, speed: 2.65, reward: 45 },
  nana: { hp: 440, posture: 165, damage: 36, speed: 2.4, reward: 180 },
  azi: { hp: 260, posture: 130, damage: 27, speed: 2.8, reward: 110 },
  boss: { hp: 360, posture: 150, damage: 32, speed: 2.15, reward: 130 },
  lancer: { hp: 150, posture: 108, damage: 28, speed: 2, reward: 48 },
  captain: { hp: 430, posture: 170, damage: 34, speed: 2.1, reward: 220 },
  regent: { hp: 780, posture: 220, damage: 42, speed: 2.5, reward: 400 },
  reaver: { hp: 196, posture: 116, damage: 32, speed: 2.4, reward: 68 },
  monk: { hp: 230, posture: 126, damage: 34, speed: 2.7, reward: 80 },
  warden: { hp: 660, posture: 190, damage: 40, speed: 2.1, reward: 300 },
  abbot: { hp: 620, posture: 180, damage: 38, speed: 2.8, reward: 300 },
  elegist: { hp: 980, posture: 240, damage: 45, speed: 2.4, reward: 480 },
  serpent: { hp: 1120, posture: 260, damage: 49, speed: 2.6, reward: 600 },
};
const DURATIONS: Record<Action, number> = { idle: 0, charge: 2, light: 0.5, heavy: 0.86, dodge: 0.64, parry: 0.52, guard: Infinity, guardRelease: 0.16, guardBreak: 0.9, hurt: 0.42, heal: 1.12, execute: 0.95, dead: Infinity };
const NEUTRAL: GameInput = { x: 0, z: 0 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const facingToward = (a: Vec3, b: Vec3) => Math.atan2(b.x - a.x, b.z - a.z);
const alive = (enemy: Enemy) => enemy.hp > 0 && enemy.action !== 'dead';
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

export function maxFlasks(s: GameState): number { return 3 + Number(s.flaskUpgrade) + Number(s.collected.includes('cistern-flask')) + Number(s.collected.includes('valley-flask')); }
export function healAmount(s: GameState): number { return (s.gear.talisman === 'goldBell' ? 80 : 60) + (s.collected.includes('bamboo-dew') ? 30 : 0) + (s.haven.ending === 'release' ? 15 : 0); }
export function maxHp(s: GameState): number { return 100 + s.level * 12 + (s.gear.talisman === 'graveSeal' ? 20 : 0); }
export function maxStamina(s: GameState): number { return 100 + s.level * 5 + (s.haven.ending === 'remember' ? 15 : 0) + (s.gear.talisman === 'tideKnot' ? 18 : 0); }
export function upgradeCost(s: GameState): number { return 40 + s.level * 30; }

function makeEnemies(bossDefeated = false, defeatedGuests: string[] = []): Enemy[] {
  return ENEMY_SPAWNS.map(spawn => ({
    ...spawn,
spawn: { x: spawn.x, y: spawn.y, z: spawn.z },
hp: ((spawn.kind === 'boss' && bossDefeated) || defeatedGuests.includes(spawn.id)) ? 0 : STATS[spawn.kind].hp,
    maxHp: STATS[spawn.kind].hp,
posture: 0,
maxPosture: STATS[spawn.kind].posture,
    action: ((spawn.kind === 'boss' && bossDefeated) || defeatedGuests.includes(spawn.id)) ? 'dead' : 'idle',
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
  return { ...position, facing: -Math.PI / 2, hp: 100, stamina: 100, action: 'idle', actionTime: 0, hitDone: false, invulnerable: 0, staminaDelay: 0, flasks: 3, fallPeak: position.y, lastGround: { ...position }, dodgeX: 0, dodgeZ: 0, ...combatDefaults() };
}

export function createGame(): GameState {
  return {
    version: 1,
motionVersion: 1,
hitstop: 0,
messageSerial: 0,
messageKind: 'hint',
interpretation: '',
mode: 'title',
paused: false,
player: makePlayer(SPAWN),
enemies: makeEnemies(),
projectiles: [],
bestiary: [],
liftRide: null,
discoveredDungeons: [],
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
    worldVersion: 10,
gear: { armor: 'traveler', talisman: 'none' },
weaponLevel: 0,
weapon: 'umbrella',
haven: freshHaven(),
valleyGates: [],
valleyComplete: false,
chapterGates: [],
chapterComplete: false,
harborGate: false,
defeatedGuests: [],
playerSkin: 'sui',
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

export const isAirborne = (p: Player) => p.jumpHeight !== 0 || p.jumpVelocity !== 0;
export function fallDamage(drop:number):number { return drop <= 3.5 ? 0 : drop >= 10 ? 10000 : Math.ceil((drop - 3.5) * 14); }
function movePlayer(s:GameState, dx:number, dz:number):void {
  const p = s.player; const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
  for (let i = 0; i < count; i++) for (const axis of ['x', 'z'] as const) {
    const x = p.x + (axis === 'x' ? dx / count : 0); const z = p.z + (axis === 'z' ? dz / count : 0); const
feet = p.y + p.jumpHeight;
    const ground = supportAt(x, z, feet + 0.6);
    if (playerBlocked(x, z, feet, s, 0.24, isAirborne(p) ? 0.03 : 0.6) || s.enemies.some(e => alive(e) && feet > e.y - 0.85 && feet < e.y + 0.85 * giantScale(e.id) && Math.hypot(e.x - x, e.z - z) < 0.31 + 0.33 * giantScale(e.id))) continue;
    // A deck has a real side; approaching a higher floor does not phase through it.
    if (deckBlocks(x, z, feet)) continue;
    p.x = x; p.z = z;
    if (!isAirborne(p)) {
      if (ground !== null && Math.abs(ground - p.y) <= 0.6) { p.y = ground; p.lastGround = { x, y: ground, z }; p.fallPeak = ground; } else { p.jumpVelocity = -0.001; p.fallPeak = p.y; p.airX = 0; p.airZ = 0; p.airAttackUsed = false; }
    }
  }
}
function updateFall(s:GameState, dt:number):void {
  const p = s.player; const
before = p.y + p.jumpHeight;
  p.jumpVelocity -= 18 * dt; let after = before + p.jumpVelocity * dt;
  if (p.jumpVelocity > 0) {
    const ceiling = ceilingAt(p.x, p.z, before + 1.65, after + 1.65);
    if (ceiling !== null) { after = ceiling - 1.65 - 0.002; p.jumpVelocity = 0; }
  }
  p.fallPeak = Math.max(p.fallPeak, before);
  const floor = supportAt(p.x, p.z, before + 0.001);
  if (p.jumpVelocity < 0 && floor !== null && after <= floor) {
    const damage = fallDamage(p.fallPeak - floor);
    p.y = floor; p.jumpHeight = 0; p.jumpVelocity = 0; p.landing = 0.18;
    p.lastGround = { x: p.x, y: floor, z: p.z }; p.fallPeak = floor;
    if (damage) { p.hp = Math.max(0, p.hp - damage); p.action = 'hurt'; p.actionTime = 0; p.attack = null; p.buffer = null; effect(s, p, 'hit', `−${damage}`); if (p.hp === 0)die(s); } else effect(s, p, 'dodge');
  } else { p.jumpHeight = after - p.y; if (after < (undergroundId(p.lastGround) ? p.lastGround.y - 8 : -8)) { die(s); } }
}
function move(s: GameState, entity: Vec3, dx: number, dz: number, radius = 0.33): void {
  if (entity === s.player) { movePlayer(s, dx, dz); return; }
  radius *= giantScale((entity as Enemy).id);
  // Resolve each axis separately so a diagonal stick slides along a wall.
  const blockedByBody = (x: number, z: number) => {
    return Math.abs(s.player.y - entity.y) < 0.85 && Math.hypot(s.player.x - x, s.player.z - z) < 0.35 + radius;
  };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let i = 0; i < steps; i += 1) {
    const nx = entity.x + dx / steps;
    if (canOccupy(nx, entity.z, entity.y, s, radius) && !blockedByBody(nx, entity.z)) { entity.x = nx; entity.y = supportAt(nx, entity.z, entity.y + 0.6) ?? entity.y; }
    const nz = entity.z + dz / steps;
    if (canOccupy(entity.x, nz, entity.y, s, radius) && !blockedByBody(entity.x, nz)) { entity.z = nz; entity.y = supportAt(entity.x, nz, entity.y + 0.6) ?? entity.y; }
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
  const entry = bestiaryKey(e); if (!s.bestiary.includes(entry)) s.bestiary.push(entry);
  effect(s, e, 'reward', `+${STATS[e.kind].reward} 夜市钱`);
  if (DUNGEON_BOSSES.includes(e.id)) { s.defeatedGuests.push(e.id); say(s, `${e.name} · 守望已息`, 8, 'event', '守望者身后的金光遗物已经可以收下。副本入口仍可返回，也可以在雨灯旁行旅。'); }
  if (s.lockedId === e.id) s.lockedId = null;
  if (e.kind === 'nana' || e.kind === 'azi') { s.defeatedGuests.push(e.id); say(s, e.kind === 'nana' ? '七潮归寂 · 晨钟有路' : '苔灯谢幕 · 余音仍在', 6, 'event', e.kind === 'nana' ? '潮门安静了。登上后面的石阶，可以敲响黎明钟，也可以继续探索。' : '阿梓留下了戏匣。戏台南边落雨檐可以跳到低码头，再走回灯市。'); }
  if (e.kind === 'captain' || e.kind === 'regent') {
    s.defeatedGuests.push(e.id);
    say(s, e.kind === 'captain' ? '米汀收刀 · 拾得象纹铜印' : '弥月停炮 · 长夜将尽', 7, 'event', e.kind === 'captain' ? '铜印可以打开高墙另一边的藏经院。门楼东侧还有回到织坊的近路。' : '大殿后面的归夜钟已经可以敲响。先回夜市吃饭，再以钟声结束这一晚。');
  }
  if (e.kind === 'elegist') { s.defeatedGuests.push(e.id); say(s, '礼墨落笔 · 末灯已静', 8, 'event', '库底的无名灯在等你的回答。先读守灯簿，再决定记名或放灯；东侧归廊可以开近路回庭。'); }
  if (VALLEY_BOSSES.includes(e.id)) {
    s.defeatedGuests.push(e.id);
    const hint = e.kind === 'warden' ? '转动院北的西岸水闸，再到东边渡埠修好系缆。渡船会重新连通旧城。' : e.kind === 'abbot' ? '瑞娅身后的东岸水闸可以转动了。西侧下山阶通向双流汇灯台。' : '河心安静了。走到殿后的灯台，放出第一盏归水灯。';
    say(s, e.kind === 'warden' ? '花礼解缆 · 西岸已静' : e.kind === 'abbot' ? '瑞娅归寂 · 东岸已静' : '悠亚归海 · 愿灯可行', 8, 'event', hint);
  }
  if (e.kind === 'boss') { s.bossDefeated = true; say(s, '雨切收刃 · 栞栞让路', 5, 'event', '打赢啦！往夜市最里面的炉火走，找摊主点餐。'); }
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
  s.bloodstain = { ...(isAirborne(s.player) ? s.player.lastGround : { x: s.player.x, y: s.player.y, z: s.player.z }), rice: s.rice };
  if (isAirborne(s.player)) { Object.assign(s.player, s.player.lastGround); s.player.jumpHeight = 0; s.player.jumpVelocity = 0; } s.rice = 0; s.lockedId = null;
  effect(s, s.player, 'death'); say(s, '雨夜失足。夜市钱留在原地，回到雨灯后还能取回。', 99); s.prompt = ''; s.nearbyId = null;
}

function damagePlayer(s: GameState, e: Enemy, projectileSource?: Vec3 & { facing: number; damage: number }): void {
  const p = s.player; const attack = enemyAttack(e);
  const source = projectileSource ?? e;
  if (!projectileSource && !inCone(s, e, p, attack.range, attack.arc)) return;
  const damageAmount = projectileSource?.damage ?? attack.damage;
  if (!attack.parryable && p.jumpHeight > 0.55) { effect(s, p, 'dodge', '跃过'); return; }
  if (p.invulnerable > 0 || (p.action === 'dodge' && p.actionTime >= 0.07 && p.actionTime <= 0.4)) { effect(s, p, 'dodge', '闪避'); return; }
  if (attack.parryable && p.action === 'parry' && p.actionTime <= PARRY_WINDOW && inCone(s, p, source, attack.range + 0.2, 1.4)) {
    s.parries += 1; p.stamina = Math.min(maxStamina(s), p.stamina + 12); e.action = 'recover'; e.timer = 0.92;
    p.parryFlash = 0.3; s.hitstop = 0.06;
    damageEnemy(s, e, 3, e.kind === 'boss' ? 49 : 38); effect(s, { x: (p.x + e.x) / 2, y: p.y + 0.25, z: (p.z + e.z) / 2 }, 'parry', '弹反'); say(s, '铛！弹反成功 · 压住对手的架势', 1.5); return;
  }
  if (attack.parryable && p.action === 'guard' && inCone(s, p, source, attack.range + 0.2, 1.15)) {
    const cost = (10 + damageAmount * 0.9) * WEAPONS[s.weapon].guard;
    const broken = p.stamina < cost;
    const damage = Math.ceil(damageAmount * (broken ? 0.6 : 0.15) * ARMORS[s.gear.armor].defense);
    p.stamina = Math.max(0, p.stamina - cost); p.staminaDelay = broken ? 1 : 0.65;
    p.hp = Math.max(0, p.hp - damage); p.guardImpact = 0.24; s.hitstop = 0.035;
    move(s, p, -Math.sin(p.facing) * (broken ? 0.45 : 0.16), -Math.cos(p.facing) * (broken ? 0.45 : 0.16));
    effect(s, { ...p, x: p.x + Math.sin(p.facing) * 0.65, z: p.z + Math.cos(p.facing) * 0.65 }, broken ? 'hit' : 'block');
    if (broken) { p.action = 'guardBreak'; p.actionTime = 0; p.buffer = null; say(s, '架势被击穿了！松开防御，退开恢复体力。', 3); }
    if (p.hp <= 0) die(s);
    return;
  }
  p.hp = Math.max(0, p.hp - Math.ceil(damageAmount * ARMORS[s.gear.armor].defense)); p.action = 'hurt'; p.actionTime = 0; p.attack = null; p.buffer = null; p.combo = 0; p.charge = 0; p.invulnerable = 0.46;
  p.staminaDelay = 0.65; effect(s, p, 'hit', `−${damageAmount}`);
  if (p.hp <= 0) die(s);
}

function execute(s: GameState): boolean {
  const p = s.player;
  const e = s.enemies.find(enemy => enemy.action === 'stagger' && enemy.posture >= enemy.maxPosture && inCone(s, p, enemy, 2.55, 1.65));
  if (!e) return false;
  p.facing = facingToward(p, e); p.action = 'execute'; p.attack = null; p.buffer = null; p.combo = 0; p.actionTime = 0; p.hitDone = true; p.invulnerable = 1.05;
  p.stamina = Math.min(maxStamina(s), p.stamina + 30); s.executions += 1;
  e.posture = 0; e.action = 'recover'; e.timer = 1.5;
  damageEnemy(s, e, isBoss(e) ? 102 + s.level * 5 : e.hp, 0);
  effect(s, e, 'parry', '破架处决'); return true;
}

function spend(s: GameState, amount: number): boolean {
  if (s.player.stamina + 0.001 < amount) { say(s, '体力不足，松开攻击，调整呼吸。', 1.4); return false; }
  s.player.stamina -= amount; s.player.staminaDelay = 0.75; return true;
}

function beginAttack(s: GameState, id: AttackId, paid = false): boolean {
  const p = s.player; const spec = weaponAttack(s, id);
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
  const spec = p.attack ? weaponAttack(s, p.attack) : null;
  const canCancel = !!spec && p.actionTime >= spec.cancel;
  const airborne = isAirborne(p);
  const leaveGuard = p.action === 'guardRelease' || (p.action === 'guard' && p.guardImpact <= 0.12);
  if (p.action !== 'idle' && !leaveGuard && !(canCancel && requested) && !(p.action === 'charge' && (dodge || input.parry))) {
    if (requested && spec && spec.cancel - p.actionTime <= BUFFER_TIME) p.buffer = { action: requested, until: s.time + BUFFER_TIME };
    return;
  }
  if (input.interact && p.action === 'idle' && !airborne) { interact(s); return; }
  if (input.light && !airborne && p.action === 'idle' && execute(s)) return;
  if (requested === 'jump') {
    if (!airborne && spend(s, 10)) {
      p.action = 'idle'; p.attack = null; p.buffer = null; p.jumpVelocity = 6.3; p.fallPeak = p.y; p.lastGround = { x: p.x, y: p.y, z: p.z }; p.airAttackUsed = false;
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
      if (spend(s, weaponAttack(s, 'heavy').cost)) { p.action = 'charge'; p.attack = null; p.charge = 0; p.actionTime = 0; p.attackFacing = p.facing; p.buffer = null; p.combo = 0; }
    } else {
      const id: AttackId = airborne ? isHeavy ? 'airHeavy' : 'airLight' : running ? isHeavy ? 'sprintHeavy' : 'sprintLight' : isHeavy ? 'heavy' : s.time < p.comboUntil && p.combo === 1 ? 'light2' : s.time < p.comboUntil && p.combo === 2 ? 'light3' : 'light1';
      beginAttack(s, id);
    }
    return;
  }
  let action: Action = 'idle';
  if (dodge && spend(s, 25 + ARMORS[s.gear.armor].dodgeCost)) {
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
  const airborne = isAirborne(p);
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
  if (isAirborne(p)) {
    // Air steering retains horizontal momentum while real parapets/doors remain solid.
    p.airX += (x * 3.55 - p.airX) * Math.min(1, dt * 1.8); p.airZ += (z * 3.55 - p.airZ) * Math.min(1, dt * 1.8);
    move(s, p, p.airX * dt, p.airZ * dt);
    updateFall(s, dt);
    if (s.mode !== 'playing') return;
  }
  const spec = p.attack ? weaponAttack(s, p.attack) : null;
  if (spec || p.action === 'charge') {
    const desired = length > 0.15 ? Math.atan2(x, z) : target && s.lockedId ? facingToward(p, target) : finite(input.aim, -100000, 100000) ? input.aim : p.facing;
    const limit = p.action === 'charge' ? 1.05 : spec!.turn;
    const goal = p.attackFacing + Math.max(-limit, Math.min(limit, angleDiff(desired, p.attackFacing)));
    const speed = p.action === 'charge' || p.actionTime < (spec?.impact ?? 0) ? 5 : 0.65;
    p.facing += Math.max(-speed * dt, Math.min(speed * dt, angleDiff(goal, p.facing)));
  }
  if (p.action === 'charge') {
    p.charge = Math.min(CHARGE_TIME, p.charge + dt); p.actionTime += dt;
    if (!input.heavyHeld || p.charge >= CHARGE_TIME) {
      const charged = p.charge >= CHARGE_TIME && p.stamina >= weaponAttack(s, 'charged').cost;
      if (charged) spend(s, weaponAttack(s, 'charged').cost);
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
      const canHit = p.attack !== 'airHeavy' || !isAirborne(p);
      if (!p.hitDone && p.actionTime >= spec.impact && canHit) {
        p.hitDone = true;
        let hits = 0;
        for (const e of s.enemies) {
          if (!alive(e) || !inCone(s, p, e, spec.range, spec.arc)) continue;
          const heavy = p.action === 'heavy';
          const guarded = enemyRole(e) === 'bulwark' && e.action !== 'stagger' && e.action !== 'recover' && Math.abs(angleDiff(facingToward(e, p), e.facing)) < 1.4;
          // Boss poise resists charged pressure; punishing a committed recovery is still rewarding.
          const pressure = heavy && isBoss(e) ? (e.action === 'recover' ? 0.62 : 0.38) : 1;
          damageEnemy(s, e, (spec.damage + s.level * (heavy ? 5 : 3)) * (guarded && !heavy ? 0.4 : 1), spec.posture * pressure); hits += 1;
          if (alive(e) && e.action !== 'stagger' && !isBoss(e) && (heavy || e.action !== 'windup')) { e.action = 'recover'; e.timer = heavy ? 0.55 : 0.28; }
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
  if (p.staminaDelay <= 0 && (p.action === 'idle' || p.action === 'parry' || p.action === 'heal')) p.stamina = Math.min(maxStamina(s), p.stamina + 42 * dt * (s.enemies.some(e => e.kind === 'abbot' && e.hp > 0 && e.aggro && e.phase === 2 && distance(e, p) < 4 && Math.abs(e.y - p.y) < 1) ? 0.7 : 1));
  if (p.staminaDelay <= 0 && p.action === 'guard') p.stamina = Math.min(maxStamina(s), p.stamina + 10 * dt);
}

function updateEnemy(s: GameState, e: Enemy, dt: number): void {
  e.flash = Math.max(0, e.flash - dt);
  if (!alive(e)) return;
  const p = s.player; const dist = distance(e, p); const homeDistance = distance(e, e.spawn);
  // Distant idle actors do not trace hundreds of metres through the expanded city.
  if (!e.aggro && dist > 17 && homeDistance < 0.15) return;
  const role = enemyRole(e); const ranged = role === 'crossbow' || role === 'slinger';
  const sameLevel = Math.abs(e.y - p.y) < 1.8; const sees = sameLevel && dist < 17 && lineClear(e, p, s);
  if (isBoss(e) && e.hp <= e.maxHp * 0.5 && e.phase === 1 && !['windup', 'attack'].includes(e.action)) { e.phase = 2; say(s, BOSS_ROSTER[e.kind] ? `${BOSS_ROSTER[e.kind]!.name.split(' · ')[0]} · ${BOSS_ROSTER[e.kind]!.second}` : e.kind === 'nana' ? '七海 · 七潮叠浪' : '阿梓 · 夜曲变奏', 5, 'event', BOSS_ROSTER[e.kind]?.tip ?? '红色横扫不能弹反，跳过或退开，等收招再反击。'); }
  const inArena = e.kind !== 'boss' || (p.z < -36 && p.y < 0.2);
  const ambush = AMBUSH_ENEMIES.some(a => a.id === e.id);
  const refuge = s.litLamps.includes('courtyard') && Math.abs(p.y) < 0.8 && Math.hypot(p.x + 1, p.z - 7) < 3.5;
  if (refuge && e.aggro && e.kind !== 'boss') { e.aggro = false; e.action = 'idle'; e.timer = 0.8; e.posture = 0; }
  if (!e.aggro && homeDistance < 1.5 && inArena && !refuge && dist < (ambush ? 3.6 : ranged ? 11 : e.kind === 'boss' ? 8 : 6.3) && sees) { e.aggro = true; e.timer = ranged ? 0.9 : 0.45; }
  // Enemies return to their posts rather than pursuing through floors or the entire level.
  if (e.aggro && (homeDistance > (['regent', 'serpent', 'elegist'].includes(e.kind) ? 22 : e.kind === 'captain' ? 18 : e.kind === 'boss' ? 11 : 10) || dist > 15 || (e.kind === 'boss' && p.z > -35.5))) { e.aggro = false; e.action = 'idle'; e.timer = 0.8; e.posture = 0; }
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
    // The loaded stance turns gradually, then plants its feet before release.
    if (e.timer > enemyTiming(e).commit) {
      const turn = facingToward(e, p) - e.facing;
      const angle = Math.atan2(Math.sin(turn), Math.cos(turn));
      e.facing += Math.max(-2.7 * dt, Math.min(2.7 * dt, angle));
    }
    e.timer -= dt;
    if (e.timer <= 0) { e.action = 'attack'; e.timer = ENEMY_STRIKE_TIME; e.hitDone = false; }
    return;
  }
  if (e.action === 'attack') {
    if (e.timer > ENEMY_STRIKE_TIME - 0.12) move(s, e, Math.sin(e.facing) * attack.lunge * dt * 5, Math.cos(e.facing) * attack.lunge * dt * 5);
    e.timer -= dt;
    if (!e.hitDone && e.timer <= ENEMY_STRIKE_TIME - ENEMY_CONTACT_TIME) {
      e.hitDone = true;
      if (attack.projectile) {
        const speed = role === 'crossbow' ? 10 : 7.5;
        const y = e.y + 1.15;
        s.projectiles.push({ id: s.nextEffectId++, owner: e.id, x: e.x + Math.sin(e.facing) * 0.6, y, z: e.z + Math.cos(e.facing) * 0.6, vx: Math.sin(e.facing) * speed, vz: Math.cos(e.facing) * speed, vy: (p.y + 0.95 - y) / Math.max(0.1, dist / speed), life: 2, damage: attack.damage, kind: role === 'crossbow' ? 'bolt' : 'stone' });
        if (s.projectiles.length > 12) s.projectiles.shift();
      } else damagePlayer(s, e);
    }
    if (e.action === 'attack' && e.timer <= 0) { e.action = 'recover'; e.timer = attack.recovery; }
    return;
  }
  if (e.action === 'recover') { if (e.kind === 'captain' && e.phase === 2 && e.timer > 0.5 && e.timer < 0.95) move(s, e, Math.cos(e.facing) * dt * 1.8, -Math.sin(e.facing) * dt * 1.8); e.timer -= dt; if (e.timer <= 0) { e.action = 'chase'; e.attackIndex += 1; e.timer = 0.1; } return; }
  e.timer = Math.max(0, e.timer - dt);
  e.posture = Math.max(0, e.posture - dt * (dist > 5 ? 10 : 2.2));
  if (ranged && e.timer <= 0) {
    // Close pressure forces a slow short blade; the ranged post does not kite forever.
    if (dist < 2.7) e.attackIndex = Math.floor(e.attackIndex / 3) * 3 + 2;
    else if (e.attackIndex % 3 === 2) e.attackIndex += 1;
  }
  const nextAttack = enemyAttack(e);
  if (dist <= nextAttack.range - 0.25 && sees && e.timer <= 0) { e.facing = facingToward(e, p); e.action = 'windup'; e.timer = nextAttack.windup; return; }
  e.action = 'chase';
  if (ranged && dist < 4 && homeDistance < 2.5 && sees) { e.facing = facingToward(e, p); move(s, e, -Math.sin(e.facing) * dt, -Math.cos(e.facing) * dt); } else if (dist > (ranged ? 9 : 1.2) && sees) { e.facing = facingToward(e, p); move(s, e, Math.sin(e.facing) * STATS[e.kind].speed * dt, Math.cos(e.facing) * STATS[e.kind].speed * dt); }
}

function updateProjectiles(s: GameState, dt: number) {
  for (const bolt of s.projectiles) {
    const old = { ...bolt };
    bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt; bolt.z += bolt.vz * dt; bolt.life -= dt;
    if (projectileBlocked(bolt, s)) { bolt.life = 0; effect(s, bolt, 'block'); continue; }
    const p = s.player;
    if (Math.hypot(p.x - bolt.x, p.z - bolt.z) < 0.46 && bolt.y > p.y + p.jumpHeight + 0.12 && bolt.y < p.y + p.jumpHeight + 1.7) {
      const owner = s.enemies.find(e => e.id === bolt.owner);
      if (owner) damagePlayer(s, owner, { x: old.x, y: p.y, z: old.z, facing: Math.atan2(bolt.vx, bolt.vz), damage: bolt.damage });
      bolt.life = 0;
    }
  }
  s.projectiles = s.projectiles.filter(b => b.life > 0);
}

const BASE_DOORS = [
  { id: 'shortcut', x: 12, z: -8, y: 0, w: 4.1, d: 0.7, side: 'north' },
  { id: 'temple-gate', x: -30.5, z: -6, y: 0, w: 9, d: 0.7, side: 'north' },
  { id: 'harbor-gate', x: 29, z: -8, y: 0, w: 4.1, d: 0.7, side: 'north' },
] as const;
export function closedDoor(s: GameState, id: string) {
  if ((id === 'shortcut' && s.shortcut) || (id === 'temple-gate' && s.templeGate) || (id === 'harbor-gate' && s.harborGate) || s.chapterGates.includes(id) || s.valleyGates.includes(id) || s.haven.gates.includes(id)) return undefined;
  return [...BASE_DOORS, ...CHAPTER_GATES, ...VALLEY_GATES, ...HAVEN_GATES].find(d => d.id === id);
}
export function wrongDoorSide(s: GameState, id: string): boolean {
  const gate = closedDoor(s, id); const p = s.player;
  return !!gate && ((gate.side === 'north' && p.z > gate.z - 0.7) || (gate.side === 'south' && p.z < gate.z + 0.7) || (gate.side === 'west' && p.x > gate.x - 0.7) || (gate.side === 'east' && p.x < gate.x + 0.7));
}
function nearLandmark(s: GameState, l: typeof LANDMARKS[number]): boolean {
  const door = closedDoor(s, l.id);
  if (!door) return distance(l, s.player) < 2.05 && Math.abs(l.y - s.player.y) < 0.8 && lineClear(s.player, l, s, l.id);
  // Interact with the visible door from either face, including its full width.
  const point = { x: Math.max(door.x - door.w / 2, Math.min(door.x + door.w / 2, s.player.x)), y: door.y, z: Math.max(door.z - door.d / 2, Math.min(door.z + door.d / 2, s.player.z)) };
  const access = { ...s, shortcut: s.shortcut || l.id === 'shortcut', templeGate: s.templeGate || l.id === 'temple-gate', harborGate: s.harborGate || l.id === 'harbor-gate', chapterGates: [...s.chapterGates, l.id], valleyGates: [...s.valleyGates, l.id], haven: { ...s.haven, gates: [...s.haven.gates, l.id] } };
  return (distance(l, s.player) < 2.05 && Math.abs(l.y - s.player.y) < 0.8 && lineClear(s.player, l, s, l.id)) || (distance(point, s.player) < 1.7 && Math.abs(door.y - s.player.y) < 0.8 && lineClear(s.player, point, access));
}

function updatePrompt(s: GameState): void {
  discoverDungeon(s);
  s.region = regionAt(s.player.x, s.player.z, s.player.y + s.player.jumpHeight);
  if (!s.visited.includes(s.region)) s.visited.push(s.region);
  s.prompt = ''; s.nearbyId = null;
  if (s.mode !== 'playing' || s.liftRide) return;
  if (s.bloodstain && distance(s.player, s.bloodstain) < 1.85 && Math.abs(s.player.y - s.bloodstain.y) < 0.8) { s.prompt = '取回遗落的夜市钱'; s.nearbyId = 'bloodstain'; return; }
  const broken = s.enemies.find(e => e.action === 'stagger' && inCone(s, s.player, e, 2.55, 1.65));
  if (broken) { s.prompt = '破架处决'; s.nearbyId = broken.id; return; }
  const landmark = LANDMARKS.filter(l => havenAvailable(s, l.id) && (!s.collected.includes(l.id) || l.kind === 'note' || l.kind === 'npc'))
    .filter(l => !(l.kind === 'shortcut' && (HAVEN_GATES.some(g => g.id === l.id) ? s.haven.gates.includes(l.id) : VALLEY_GATES.some(g => g.id === l.id) ? s.valleyGates.includes(l.id) : CHAPTER_GATES.some(g => g.id === l.id) ? s.chapterGates.includes(l.id) : l.id === 'harbor-gate' ? s.harborGate : l.id === 'temple-gate' ? s.templeGate : s.shortcut)) && nearLandmark(s, l))
    .sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
  if (landmark) { s.nearbyId = landmark.id; s.prompt = landmark.kind === 'rest' ? (s.litLamps.includes(landmark.id) ? `${landmark.label} · 免费休息` : `点燃${landmark.label}`) : wrongDoorSide(s, landmark.id) ? '无法从这一侧打开' : landmark.label; }
}

export function stepGame(s: GameState, dtMs: number, input: GameInput = NEUTRAL): void {
  if (s.mode !== 'playing' || s.paused || !Number.isFinite(dtMs) || dtMs <= 0) return;
  const safeInput = { ...input, x: finite(input.x, -1000, 1000) ? input.x : 0, z: finite(input.z, -1000, 1000) ? input.z : 0 };
  if (!s.liftRide) actionInput(s, safeInput);
  if (s.paused) return;
  let remaining = Math.min(dtMs / 1000, 5);
  while (remaining > 0.000001 && s.mode === 'playing') {
    const dt = Math.min(1 / 120, remaining); remaining -= dt;
    if (s.hitstop > 0) { s.hitstop = Math.max(0, s.hitstop - dt); continue; }
    s.time += dt;
    s.messageTime = Math.max(0, s.messageTime - dt);
    for (const fx of s.effects) fx.life -= dt;
    s.effects = s.effects.filter(fx => fx.life > 0);
    if (s.liftRide) { updateLift(s, dt); continue; }
    updatePlayer(s, dt, safeInput);
    for (const enemy of s.enemies) { if (s.mode === 'playing') updateEnemy(s, enemy, dt); }
    if (s.mode === 'playing') updateProjectiles(s, dt);
  }
  updatePrompt(s);
}

function safeToRest(s: GameState): boolean {
  return !s.enemies.some(e => alive(e) && e.aggro && distance(e, s.player) < 7 && Math.abs(e.y - s.player.y) < 1.8);
}

export function interact(s: GameState): void {
  if (s.mode !== 'playing' || s.paused || s.liftRide || s.player.action !== 'idle' || isAirborne(s.player)) return;
  if (execute(s)) return;
  updatePrompt(s);
  const { nearbyId } = s;
  if (nearbyId === 'bloodstain' && s.bloodstain) { s.rice += s.bloodstain.rice; s.bloodstain = null; effect(s, s.player, 'reward', '失物归还'); say(s, '找回了夜市钱。今晚还吃得起！'); updatePrompt(s); return; }
  const landmark = LANDMARKS.find(l => l.id === nearbyId);
  if (!landmark) return;
  const portal = DUNGEON_PORTALS[landmark.id];
  if (portal) {
    if (!safeToRest(s)) { say(s, '先甩开追兵，再踏上升降台。'); return; }
    if (portal.chapter && !s.chapterComplete) { say(s, '先听王寺钟声，再循雾河找到洞窟。'); return; }
    const id = landmark.id.startsWith('crypt') ? 'crypt' : 'cave';
    if (distance(s.player, landmark) > 1.35) { say(s, '站到中央的石质踏板上，再压下机关。'); return; }
    s.liftRide = { dungeon: id, direction: landmark.id.endsWith('entrance') ? 'down' : 'up', elapsed: 0 };
    Object.assign(s.player, liftPosition(s.liftRide), { attack: null, charge: 0, buffer: null, combo: 0 });
    s.lockedId = null; s.projectiles = [];
    say(s, s.liftRide.direction === 'down' ? '铁链缓缓松开，雨声留在了头顶。' : '踏板回升，地面的微光越来越近。', 8, 'event'); updatePrompt(s); return;
  }
  const guardedLoot = ['grave-spear', 'grave-seal'].includes(landmark.id) ? 'crypt-colossus' : ['stone-maul', 'tide-knot'].includes(landmark.id) ? 'cave-sentinel' : null;
  if (guardedLoot && !s.defeatedGuests.includes(guardedLoot)) { say(s, '金光仍被守望者护着，先回应它的挑战。'); return; }
  if (wrongDoorSide(s, landmark.id)) { say(s, '无法从这一侧打开 · 门闩在另一侧', 4, 'event', '沿支路绕到门后，开启后近路会永久保留。'); return; }
  if (landmark.kind === 'rest') {
    if (!s.litLamps.includes(landmark.id)) {
      if (!safeToRest(s)) { say(s, '敌人还在附近，先脱离战斗才能点灯。'); return; }
      s.litLamps.push(landmark.id); s.checkpoint = landmark.id as GameState['checkpoint'];
      effect(s, landmark, 'reward'); say(s, '雨灯初燃 · 归途已铭记', 4, 'event', '复活点记好了。点火不会回血、补药或刷新敌人；再交互才是免费休息。');
      updatePrompt(s); return;
    }
    if (!safeToRest(s)) { say(s, '敌人还在附近，先脱离战斗才能休息。'); return; }
    s.checkpoint = landmark.id as GameState['checkpoint'];
    s.player.hp = maxHp(s); s.player.stamina = maxStamina(s); s.player.flasks = maxFlasks(s); s.restCount += 1;
    s.enemies = makeEnemies(s.bossDefeated, s.defeatedGuests); s.lockedId = null; s.projectiles = [];
    effect(s, landmark, 'heal');
    say(s, '歇息片刻 · 雨仍未停', 4, 'event', '免费休息，生命、体力和药瓶已补满；普通敌人会重生。旁边花钱的是强化装备，不是休息。');
  } else if (['ossuary-mail', 'grave-spear', 'grave-seal', 'reed-cape', 'cave-daggers', 'stone-maul', 'tide-knot'].includes(landmark.id)) {
    if (!s.collected.includes(landmark.id)) { s.collected.push(landmark.id); effect(s, landmark, 'reward', '独一遗物'); say(s, `${landmark.label} · 已收入行囊`, 7, 'event', '打开行囊更换武器、防具或护符。独一遗物会在休息、死亡与传送后保留。'); }
  } else if (landmark.id === 'crypt-note' || landmark.id === 'cave-note') {
    if (!s.collected.includes(landmark.id)) s.collected.push(landmark.id);
    say(s, landmark.id === 'crypt-note' ? '箭廊正对墓门，藏骨侧廊却绕过弩弦。露缇替无人记名者守着最后一块石印。' : '风苇落在水右岸，岩心只留给愿意等一记重槌的人。沐石没有催过任何渡客。', 12, 'lore', '白光为补给，紫光为稀有遗物，金光为永久能力或独一武器；支路有不同奖励。');
  } else if (interactHaven(s, landmark.id)) {
    updatePrompt(s); return;
  } else if (landmark.id === 'bamboo-dew' && !s.collected.includes(landmark.id)) {
    s.collected.push(landmark.id); effect(s, landmark, 'reward');
    say(s, '灵竹露 · 每瓶恢复量 +30', 6, 'event', `现在每瓶椰露恢复 ${healAmount(s)} 生命。与金铃护符叠加，休息和死亡后保留。`);
  } else if (landmark.kind === 'cache' && !s.collected.includes(landmark.id)) {
    s.collected.push(landmark.id); s.rice += 35; effect(s, landmark, 'reward', '+35 夜市钱');
    say(s, '旧铜钱 ×35', 3, 'event', landmark.id === 'cloister-cache' ? '拿到了！回廊的矮阶通回中庭雨灯，不用原路返回。' : landmark.id === 'lookout-cache' ? '望台上能看到夜市和东侧运河，挑战首领前可以先绕去开近路。' : '这笔钱可以拿回雨灯整备，提高生命、体力和伤害。');
  } else if (landmark.kind === 'charm' && !s.charm) {
    s.charm = true; s.gear.talisman = 'goldBell'; s.collected.push(landmark.id); effect(s, landmark, 'reward', '金铃护符'); say(s, '拾得 · 金铃护符', 4, 'event', '金铃会让椰子水恢复更多生命：现在一瓶恢复 80 点。绕路值得吧！');
  } else if (['cistern-flask', 'valley-flask'].includes(landmark.id) && !s.collected.includes(landmark.id)) {
    s.collected.push(landmark.id); s.player.flasks = Math.min(maxFlasks(s), s.player.flasks + 1);
    effect(s, landmark, 'reward'); say(s, `${landmark.id === 'valley-flask' ? '听瀑露瓶' : '莲纹露瓶'} · 药瓶上限 +1`, 5, 'event', `现在可携带 ${maxFlasks(s)} 瓶椰露。回到已经点亮的雨灯休息后补满。`);
  } else if (landmark.kind === 'flask' && !s.flaskUpgrade) {
    s.flaskUpgrade = true; s.collected.push(landmark.id); s.player.flasks = Math.min(maxFlasks(s), s.player.flasks + 1);
    effect(s, landmark, 'reward'); say(s, '刻露瓶 · 药瓶上限 +1', 5, 'event', `现在可以带 ${maxFlasks(s)} 瓶回血药了。回雨灯免费休息就能补满，R／手柄X喝药。`);
  } else if (VALLEY_GATES.some(g => g.id === landmark.id)) {
    const gate = VALLEY_GATES.find(g => g.id === landmark.id)!;
    if ((gate.side === 'north' && s.player.z > gate.z - 0.7) || (gate.side === 'south' && s.player.z < gate.z + 0.7) || (gate.side === 'west' && s.player.x > gate.x - 0.7)) { say(s, '门闩在另一侧，先沿两岸前行。'); return; }
    if (gate.id === 'valley-entry' && !s.chapterComplete) { say(s, '归夜钟响，后山门才迎归人。', 6, 'lore', '先完成第一关：击败弥月、吃过晚饭，再敲响旁边的归夜钟。'); return; }
    if (gate.id === 'river-door' && riverSeals(s) < 2) { say(s, `双流尚未汇合 · 已开水闸 ${riverSeals(s)} / 2`, 6, 'lore', '西岸沉舟水车院、东岸无声山寺各有一个水闸。击败守闸者后，需要亲手转动机关。'); return; }
    if (!s.valleyGates.includes(gate.id)) s.valleyGates.push(gate.id);
    effect(s, landmark, 'reward'); say(s, `${gate.name}已开`, 6, 'event', gate.id === 'valley-entry' ? '第二关 · 雾河回响。顺着钟后崖廊下山，渡村的雨灯在等你。随时可以沿原路返回王寺。' : '通路永久保留，休息或死亡不会关门。');
  } else if (landmark.kind === 'ferry') {
    if (!Object.hasOwn(HAVEN_FERRIES, landmark.id) && !s.collected.includes('ferry-winch')) { say(s, '渡船系缆还未修复。', 6, 'lore', '从王寺后山进入雾河，击败西岸的花礼，在水车院东边渡埠修好系缆。'); return; }
    if (!safeToRest(s)) { say(s, '先摆脱追兵，才能乘船。'); return; }
    const destination = HAVEN_FERRIES[landmark.id] ?? FERRY_DESTINATIONS[landmark.id];
    if (!destination) return;
    const { hp, stamina, flasks, staminaDelay } = s.player;
    s.player = { ...makePlayer(destination.position), hp, stamina, flasks, staminaDelay };
    s.lockedId = null; s.effects = []; s.projectiles = []; s.hitstop = 0;
    say(s, `渡船靠岸 · ${destination.label}`, 6, 'event', '渡船往返已经恢复。血量、药瓶与原先的复活雨灯保留。');
  } else if (['mill-sluice', 'monastery-sluice', 'ferry-winch'].includes(landmark.id)) {
    const guardian = landmark.id === 'monastery-sluice' ? 'silent-abbot' : 'drowned-warden';
    if (!s.defeatedGuests.includes(guardian)) { say(s, '守闸者还没有离开。', 5, 'lore', guardian === 'silent-abbot' ? '先击败无声寺的瑞娅。' : '先击败水车院的花礼。'); return; }
    if (!s.collected.includes(landmark.id)) { s.collected.push(landmark.id); effect(s, landmark, 'reward'); }
    say(s, landmark.id === 'ferry-winch' ? '系缆重连 · 归城渡船已恢复' : `水闸转动 · 双流 ${riverSeals(s)} / 2`, 7, 'event', landmark.id === 'ferry-winch' ? '水车院、渡村和第一关摆渡庵现在可以乘船往返，不消耗夜市钱。' : riverSeals(s) === 2 ? '双闸都已开启。去上游汇灯台休息，再解除北边锁桥，挑战悠亚。' : '另一岸仍有水闸未开。可经上游引水桥去对岸，也可回渡村再出发。');
  } else if (landmark.id === 'river-heart') {
    if (!s.defeatedGuests.includes('river-serpent')) { say(s, '那伽仍守着未归的愿灯。', 5, 'lore', '先击败沉殿里的悠亚，再来放灯。'); return; }
    if (s.valleyComplete) return;
    s.collected.push(landmark.id); s.valleyComplete = true; s.mode = 'interlude'; s.lockedId = null;
    say(s, '第二关 · 雾河回响。钟声翻过山，愿灯终于顺流回家。', 99, 'event');
  } else if (VALLEY_LORE[landmark.id]) {
    if (!s.collected.includes(landmark.id)) s.collected.push(landmark.id);
    const [lore, hint] = VALLEY_LORE[landmark.id]; say(s, lore, 8, 'lore', hint);
  } else if (CHAPTER_GATES.some(g => g.id === landmark.id)) {
    const gate = CHAPTER_GATES.find(g => g.id === landmark.id)!;
    if ((gate.side === 'north' && s.player.z > gate.z - 0.7) || (gate.side === 'south' && s.player.z < gate.z + 0.7) || (gate.side === 'west' && s.player.x > gate.x - 0.7) || (gate.side === 'east' && s.player.x < gate.x + 0.7)) { say(s, '机关在门的另一侧。'); return; }
    if (gate.id === 'archive-door' && !s.defeatedGuests.includes('gate-captain')) { say(s, '铜门上留着双象的印痕。', 5, 'lore', '需要米汀的象纹铜印。高墙西侧的蓄水院是可选支路。'); return; }
    if (!s.chapterGates.includes(gate.id)) s.chapterGates.push(gate.id);
    effect(s, landmark, 'reward'); say(s, `${gate.name}已开`, 5, 'event', '通路会一直保留，死亡和休息不会重新关门。');
  } else if (landmark.id === 'harbor-gate') {
    if (s.player.z > -8.8) return;
    s.harborGate = true; effect(s, landmark, 'reward'); say(s, '归灯长桥已开', 4, 'event', '长桥直通中庭，重试潮门不用绕夜市了。');
  } else if (landmark.id === 'temple-gate') {
    if (s.player.z > -6.7) { say(s, '水向低处流，门向归人开。', 5, 'lore', '门闩在寺院一侧。先从高处的悬钟桥进雨寺，再沿石阶下到门后。'); return; }
    s.templeGate = true; effect(s, landmark, 'reward'); say(s, '闭水门已开', 4, 'event', '门外就是晾衣暗巷！雨寺和中庭连起来了，补给后可以直接回去。');
  } else if (landmark.kind === 'shortcut') {
    if (s.player.z > -8.8) { say(s, '门的另一面，铁仍记得手的温度。', 5, 'lore', '门闩在另一侧，我们得先走西边的高阶绕到夜市，再从里面开门。'); return; }
    s.shortcut = true; effect(s, landmark, 'reward', '捷径开启'); say(s, '侧门升起', 4, 'event', '近路通啦！沿运河回中庭就能补给，重试栞栞不用再爬屋脊。');
  } else if (landmark.kind === 'food') {
    if (!s.bossDefeated) { say(s, '伞不收，炉不迎客。', 5, 'lore', '摊主要我们先打败守街的栞栞，赢了再来点餐。'); return; }
    if (s.collected.includes('food')) return;
    s.collected.push('food'); s.mode = 'interlude'; s.lockedId = null; s.prompt = ''; s.nearbyId = null;
    say(s, '下播后的第一份打抛饭。明天还要直播，今晚先好好吃饭。', 99);
  } else if (landmark.id === 'chapter-bell') {
    if (!s.defeatedGuests.includes('rain-regent')) { say(s, '弥月仍守长夜，钟声尚不能远行。', 5, 'lore', '先击败大殿里的弥月。'); return; }
    if (!s.collected.includes('food')) { say(s, '今晚还没有吃饭。先回夜市炉火，再来听钟。', 6, 'event', '雨灯旁可以在已经点亮的雨灯之间行旅。回中庭去夜市吃饭后，再返回王寺。'); return; }
    if (s.chapterComplete) return;
    s.collected.push('chapter-bell'); s.chapterComplete = true; s.mode = 'interlude'; s.lockedId = null;
    say(s, '第一关 · 长夜归灯。饭还温着，整座城终于等到了钟声。', 99, 'event');
  } else if (CHAPTER_LORE[landmark.id]) {
    if (!s.collected.includes(landmark.id)) s.collected.push(landmark.id);
    const [lore, hint] = CHAPTER_LORE[landmark.id]; say(s, lore, 8, 'lore', hint);
  } else if (landmark.id === 'temple-lamp' || landmark.id === 'canal-lamp') {
    if (!s.collected.includes(landmark.id)) s.collected.push(landmark.id);
    say(s, '芯冷，灯空。归火尚在中庭。', 6, 'lore', '这只是旧灯，没有复活和补给功能。开好近路就能回中庭的雨灯，不必重绕整张地图。');
  } else if (landmark.id === 'dawn-bell') {
    if (!s.defeatedGuests.includes('nana-tide')) { say(s, '七潮未息，钟心无声。', 5, 'lore', '先让七海守着的潮门平静下来，再来敲钟。'); return; }
    if (!s.collected.includes(landmark.id)) { s.collected.push(landmark.id); s.rice += 100; effect(s, landmark, 'reward'); }
    say(s, '晨钟一响 · 长夜将明', 9, 'event', '这一段旅程完成了，得到100夜市钱。世界仍然开放，可以找阿梓、收集支路宝箱，或者走长桥回雨灯。');
  } else if (['tide-note', 'drop-note', 'tide-seal'].includes(landmark.id)) {
    if (!s.collected.includes(landmark.id))s.collected.push(landmark.id);
    const text = landmark.id === 'tide-note' ? ['循暖灯而上，七潮尽处，钟见天光。', '暖色路灯沿着灯市和长阶通往七海的潮门。右侧绿灯是阿梓的支路，左手水巷能开回中庭的近路。'] : landmark.id === 'drop-note' ? ['风收旧网，落处便是来时灯。高者折骨，深者无归。', '破栏下面就是灯市，约四米落差会掉血；再高的落差更危险。先看清落脚地面，水里无法站立。'] : ['七声归海，留半拍予岸。', '七海有快刺、延迟重击和扫浪，抬镐蓄力后才是释放。保持距离可以诱出招式，抓收招反击。'];
    say(s, text[0], 8, 'lore', text[1]);
  } else if (landmark.kind === 'note') {
    if (!s.collected.includes(landmark.id)) s.collected.push(landmark.id);
    say(s, landmark.id === 'temple-note' ? '钟不为来者鸣。携空瓶过桥，循百灯归水。' : landmark.id === 'ferry-note' ? '空庵不载客，东桥自渡人。潮声深处，七声候钟。' : landmark.id === 'laptop' ? '屏光熄去，金塔下还有一盏不眠的火。' : '伞下无归客。逐水向东，归人自解旧闩。', 8, 'lore', landmark.id === 'temple-note' ? '寺里供着能增加药瓶数量的刻露瓶。拿到后沿寺院石阶下去，拉动门后的绞盘，就能走近路回中庭补给。' : landmark.id === 'ferry-note' ? '这里就是去潮汐港的入口。穿过庵堂东侧敞开的门，再过潮桥就到了，不用跳水。运河另一头的绞盘则通回中庭。' : landmark.id === 'laptop' ? '这说的是金塔下面的深夜食堂。先从旅馆外梯下去，找到中庭的雨灯。' : '纸条在提醒我们：夜市东边的运河侧廊有一扇门，从里面能打开，通回中庭。');
  }
  updatePrompt(s);
}

export function upgrade(s: GameState): boolean {
  const lamp = LANDMARKS.find(l => l.kind === 'rest' && distance(s.player, l) <= 2.05 && Math.abs(s.player.y - l.y) <= 0.8);
  if (!lamp || !s.litLamps.includes(lamp.id)) return false;
  if (s.mode !== 'playing' || s.player.action !== 'idle' || distance(s.player, lamp) > 2.05 || Math.abs(s.player.y - lamp.y) > 0.8 || !safeToRest(s)) return false;
  if (s.level >= 15) { say(s, '这身行装已经整备完毕。'); return false; }
  const cost = upgradeCost(s);
  if (s.rice < cost) { say(s, `整备需要 ${cost} 夜市钱。沿暗巷和屋脊找找。`); return false; }
  s.rice -= cost; s.bankedRice += cost; s.level += 1; s.player.hp = Math.min(maxHp(s), s.player.hp + 12); s.player.stamina = Math.min(maxStamina(s), s.player.stamina + 5);
  effect(s, s.player, 'reward', `行装 +${s.level}`); say(s, '整备完成 · 最大生命、体力和武器伤害提升。'); return true;
}

/** Forging and changing equipment only happen beside an encountered, safe lamp. */
export function forgeWeapon(s: GameState): boolean {
  const next = s.weaponLevel === 0 ? 'ironUmbrella' : 'katana'; const w = WEAPONS[next];
  if (!canForge(s) || s.weaponLevel >= 2) return false;
  if (next === 'katana' && !s.bossDefeated) { say(s, '先挑战栞栞，学会收伞拔刃。', 4, 'event'); return false; }
  if (s.rice < w.cost) { say(s, `锻造${w.name}需要 ${w.cost} 夜市钱。`, 4, 'event'); return false; }
  s.rice -= w.cost; s.weaponLevel += 1; s.weapon = next;
  effect(s, s.player, 'reward', w.name); say(s, `锻造完成 · ${w.name}`, 4, 'event', w.description); return true;
}
export function canForge(s: GameState): boolean {
  return s.mode === 'playing' && s.player.action === 'idle' && !isAirborne(s.player) && safeToRest(s) && LANDMARKS.some(l => l.kind === 'rest' && s.litLamps.includes(l.id) && distance(s.player, l) < 2.05 && Math.abs(s.player.y - l.y) < 0.8);
}
export function equipWeapon(s: GameState, weapon: GameState['weapon']): boolean {
  if (!Object.hasOwn(WEAPONS, weapon) || !weaponUnlocked(s, weapon) || !canForge(s)) return false;
  s.weapon = weapon; say(s, `握持 · ${WEAPONS[weapon].name}`, 3, 'event'); return true;
}

export function continueExploring(s: GameState): void {
  if (s.mode !== 'ending' && s.mode !== 'interlude') return;
  s.mode = 'playing'; s.paused = false; s.lockedId = null; clearHeldActions(s);
  say(s, s.haven.ending ? '灯有了归处，你也有。' : s.valleyComplete ? '灯随河流，路仍相连。' : s.chapterComplete ? '钟声翻过后山，雾河里的灯还在等你。' : '吃饱了。北口香料街尽头，王寺的灯还亮着。', 9, 'lore', s.haven.ending ? '沿灯库东侧归廊回庭，打开后门。阿莲、弥音和温叔都想听听你的回答。' : s.valleyComplete ? '旅馆南桥通向归灯庭。旧寺西侧书房和盐仓背后的船坞，还留着关于未归之人的线索。' : s.chapterComplete ? '从钟台东侧的后山门进入第二关「雾河回响」。新区域与王寺直接相连，原有战斗和探索进度保留。' : '从夜市西北角向北，沿香料水街进入织坊下城。榕树下有新的雨灯。'); updatePrompt(s);
}

/** Travel is available only beside a lit, safe lamp and never grants a free heal. */
export function travelToLamp(s: GameState, id: string): boolean {
  const origin = LANDMARKS.find(l => l.kind === 'rest' && s.litLamps.includes(l.id) && distance(l, s.player) < 2.05 && Math.abs(l.y - s.player.y) < 0.8);
  if (!origin || !s.litLamps.includes(id) || !REST_POINTS[id] || !safeToRest(s) || s.mode !== 'playing' || s.player.action !== 'idle' || isAirborne(s.player)) return false;
  const { hp, stamina, flasks } = s.player;
  s.player = { ...makePlayer(REST_POINTS[id]), hp, stamina, flasks };
  s.checkpoint = id as GameState['checkpoint']; s.lockedId = null; s.effects = []; s.projectiles = [];
  say(s, `抵达${LANDMARKS.find(l => l.id === id)?.label}`, 4, 'event'); updatePrompt(s); return true;
}

/** Explicit rescue changes location only; it is not a free rest or enemy reset. */
export function escapeStuck(s:GameState):boolean {
  if (s.mode !== 'playing') return false;
  const { hp, stamina, flasks, staminaDelay } = s.player;
  s.player = { ...makePlayer(REST_POINTS[s.checkpoint]), hp, stamina, flasks, staminaDelay };
  s.lockedId = null; s.hitstop = 0; s.effects = [];
  say(s, '旧灯牵回迷途之人。', 5, 'event', '已回到记录的落脚点；血量、药瓶和探索进度保留。需要补给时，再与雨灯交互休息。');
  updatePrompt(s); return true;
}

export function respawn(s: GameState): void {
  if (s.mode !== 'dead') return;
  s.player = makePlayer(REST_POINTS[s.checkpoint]); s.player.hp = maxHp(s); s.player.stamina = maxStamina(s); s.player.flasks = maxFlasks(s);
  s.enemies = makeEnemies(s.bossDefeated, s.defeatedGuests); s.mode = 'playing'; s.paused = false; s.effects = []; s.projectiles = []; s.lockedId = null;
  say(s, '雨灯仍亮着。观察起手，留一点体力；丢下的钱就在倒下的地方。', 5); updatePrompt(s);
}

export function clearHeldActions(s: GameState): void {
  const p = s.player; p.buffer = null; p.dashDown = false; p.dashUsed = true; p.sprintTime = 0;
  if (p.action === 'charge' || p.action === 'guard' || p.action === 'guardRelease' || p.action === 'parry') { p.action = 'idle'; p.attack = null; p.actionTime = 0; p.charge = 0; p.guardImpact = 0; p.parryFlash = 0; }
}
export function setPaused(s: GameState, paused: boolean): void { if (s.mode === 'playing') { s.paused = paused; if (paused) clearHeldActions(s); } }

export function getObjective(s: GameState): string {
  if (s.liftRide) return s.liftRide.direction === 'down' ? '升降台下行 · 雨声渐远' : '升降台上行 · 返回地面';
  const dungeon = undergroundId(s.player);
  if (dungeon) return `${DUNGEONS[dungeon].name} · 可自由探索支路，乘升降台返回地面`;
  if (s.haven.ending) return '灯下暗线已完成 · 回归灯庭听听归人的回应';
  if (s.valleyComplete) return '两关完成 · 长夜归灯 / 雾河回响 · 旅馆南桥的归灯庭还有人在等你';
  if (s.chapterComplete) {
    if (!s.valleyGates.includes('valley-entry')) return '第二关 · 从王寺钟台东侧的后山门进入雾河';
    if (!s.litLamps.includes('village-lamp')) return '沿钟后崖廊下山，点亮渡村雨灯';
    if (s.defeatedGuests.includes('river-serpent')) return '走到沉殿后方，放出第一盏归水灯';
    if (s.valleyGates.includes('river-door')) return '进入那伽沉殿，挑战悠亚 · 星河守愿';
    if (riverSeals(s) === 2) return '双流已汇 · 到汇灯台北边解除锁桥';
    return `雾河双岸 · 水闸 ${riverSeals(s)} / 2 · ${!s.collected.includes('mill-sluice') ? '西岸水车院' : '东岸无声寺'}（两岸可自由选择）`;
  }
  if (s.defeatedGuests.includes('rain-regent')) return s.collected.includes('food') ? '走到大殿后方，敲响王寺归夜钟' : '回到夜市吃饭，再敲响王寺归夜钟';
  if (s.litLamps.includes('royal-lamp')) return '进入雨冠大殿，挑战弥月 · 机巧雨冠';
  if (s.chapterGates.includes('archive-door')) return '藏经院 → 千灯朝圣桥 → 王寺天阶';
  if (s.defeatedGuests.includes('gate-captain')) return '登上金雨高墙，以铜印打开藏经院';
  if (s.litLamps.includes('lower-lamp')) return '织坊石阶 → 染布长廊 → 双象门楼 · 挑战米汀';
  if (s.collected.includes('food')) return '夜市北口 → 香料水街 → 织坊下城 · 榕树雨灯';
  if (s.bossDefeated) return '到夜市炉火旁，吃上今晚的第一顿饭';
  if (s.shortcut) return '挑战栞栞 · 雨切守街，抵达深夜食堂';
  if (s.charm) return '沿夜市长阶下行，找出回到中庭的近路';
  if (s.checkpoint !== 'room') return '穿过晾衣暗巷，登上金塔屋脊';
  return '合上笔记本，沿旅馆外梯寻找雨灯';
}

function interactHaven(s: GameState, id: string): boolean {
  const landmark = LANDMARKS.find(l => l.id === id);
  if (landmark?.kind === 'npc') {
    if (!safeToRest(s)) { say(s, '先摆脱附近的追兵，再慢慢交谈。'); return true; }
    if (id === 'well-choice' && !s.defeatedGuests.includes('last-lamplighter')) { say(s, '守簿人还没有放下最后一盏灯。'); return true; }
    clearHeldActions(s); s.haven.talking = id; s.paused = true; return true;
  }
  const gate = HAVEN_GATES.find(g => g.id === id);
  if (gate) {
    if ((gate.side === 'west' && s.player.x > gate.x - 0.7) || (gate.side === 'north' && s.player.z > gate.z - 0.7) || (gate.side === 'south' && s.player.z < gate.z + 0.7)) { say(s, '门闩在归路的另一侧。'); return true; }
    if (id === 'well-door' && s.haven.echoes !== 3) { say(s, '钟、水与名字，还没有一起响起。', 7, 'lore', '邀请弥音与温叔归庭，完成雾河归水灯，再按名册顺序回应庭南三座灯台。'); return true; }
    if (!s.haven.gates.includes(id)) s.haven.gates.push(id);
    say(s, `${gate.name}已开`, 6, 'event', id === 'well-door' ? '潮阶下的无名灯库可以进入了；准备好补给，再往深处走。' : '这条近路会在休息与死亡后保留。'); return true;
  }
  const index = ['haven-bell', 'haven-water', 'haven-name'].indexOf(id);
  if (index >= 0) {
    if (s.haven.recruits.length !== 2 || !s.valleyComplete) { say(s, '有回声，却还缺归人。', 6, 'lore', '先邀请书房的弥音和船坞的温叔回庭，并完成雾河的归水灯。'); return true; }
    if (s.haven.echoes === 3) { say(s, '三声已齐 · 庭南封门在等你。'); return true; }
    if (index === s.haven.echoes) {
      s.haven.echoes += 1;
      say(s, ['旧钟应答 · 第一声', '流水应答 · 第二声', '无名有声 · 三声封门可开'][index], 6, 'event', index === 2 ? '沿庭南潮阶下去，开启三声封门。' : '名册末页记着下一声。');
    } else { s.haven.echoes = 0; say(s, '回声散了，庭院仍在等。', 6, 'lore', '名册写着：先叩归钟，再听流水，最后呼名。顺序不对不会损失道具，可以重新试。'); }
    return true;
  }
  if (HAVEN_LORE[id]) {
    if (!safeToRest(s) && ['names-register', 'keel-rubbing'].includes(id)) { say(s, '追兵正近，先让这里安静下来。'); return true; }
    if (!s.collected.includes(id)) s.collected.push(id);
    const [text, hint] = HAVEN_LORE[id]; say(s, text, 12, 'lore', hint); return true;
  }
  return false;
}

export function chooseConversation(s: GameState, choice: string): boolean {
  const id = s.haven.talking; const l = LANDMARKS.find(landmark => landmark.id === id && landmark.kind === 'npc');
  if (s.mode !== 'playing' || !l || !havenAvailable(s, l.id) || distance(s.player, l) >= 2.05 || Math.abs(s.player.y - l.y) >= 0.8 || !lineClear(s.player, l, s, l.id) || !safeToRest(s)) return false;
  const result = applyConversation(s, choice); if (!result) return false;
  say(s, result, 8, 'event'); updatePrompt(s); return true;
}

export function saveGame(s: GameState): string { return JSON.stringify(s); }

function validPosition(p: unknown, shortcut: WorldAccess): p is Vec3 {
  if (!p || typeof p !== 'object') return false;
  const v = p as Vec3;
  return finite(v.x, WORLD_BOUNDS.x1, WORLD_BOUNDS.x2) && finite(v.y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY) && finite(v.z, WORLD_BOUNDS.z1, WORLD_BOUNDS.z2)
    && canOccupy(v.x, v.z, v.y, shortcut, 0.05) && Math.abs((supportAt(v.x, v.z, v.y + 0.1) ?? -100) - v.y) < 0.08;
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
  if (!raw || raw.length > 110000) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    if (!s || s.version !== 1 || !['title', 'playing', 'dead', 'ending', 'interlude'].includes(s.mode) || typeof s.paused !== 'boolean') return null;
    const legacyMotion = s.motionVersion === undefined;
    if (!legacyMotion && s.motionVersion !== 1) return null;
    if (s.worldVersion !== undefined && ![2, 3, 4, 5, 6, 7, 8, 9, 10].includes(s.worldVersion)) return null;
    const oldWorld = s.worldVersion === undefined; const oldDistrict = (s.worldVersion ?? 0) < 4; const oldChapter = (s.worldVersion ?? 0) < 5; const oldValley = (s.worldVersion ?? 0) < 6; const oldHaven = (s.worldVersion ?? 0) < 7;
    if (oldWorld) { s.templeGate = false; s.flaskUpgrade = false; s.litLamps = s.checkpoint === 'courtyard' ? ['courtyard'] : []; }
    if ((s.worldVersion as number) === 2) {
      if (!Array.isArray(s.litLamps) || s.litLamps.some(id => !['courtyard', 'temple-lamp', 'canal-lamp'].includes(id)) || new Set(s.litLamps).size !== s.litLamps.length) return null;
      if (s.checkpoint !== 'room' && !s.litLamps.includes(s.checkpoint)) return null;
      if (['temple-lamp', 'canal-lamp'].includes(s.checkpoint)) s.checkpoint = 'courtyard';
      s.litLamps = s.checkpoint === 'courtyard' || s.litLamps.includes('courtyard') ? ['courtyard'] : [];
    }
    if (s.mode === 'ending' && Array.isArray(s.collected) && !s.collected.includes('food')) s.collected.push('food');
    if (oldDistrict) { s.harborGate = false; s.defeatedGuests = []; }
    if (oldChapter) { s.chapterGates = []; s.chapterComplete = false; }
    if (oldValley) { s.valleyGates = []; s.valleyComplete = false; }
    if (oldHaven) s.haven = freshHaven();
    if (s.mode === 'ending' && !s.haven.ending) s.mode = 'interlude';
    const oldExperience = (s.worldVersion ?? 0) < 8;
    if (oldExperience) { s.weaponLevel = 0; s.weapon = 'umbrella'; }
    const oldJourneys = (s.worldVersion ?? 0) < 9;
    if (oldJourneys) { s.gear = { armor: 'traveler', talisman: s.charm ? 'goldBell' : 'none' }; s.bestiary = Array.isArray(s.enemies) ? Array.from(new Set(s.enemies.filter(e => e.hp === 0).map(bestiaryKey))) : []; }
    const oldUnderground = (s.worldVersion ?? 0) < 10;
    if (oldUnderground) migrateUnderground(s);
    s.worldVersion = 10;
    if (!finite(s.weaponLevel, 0, 2) || !Number.isInteger(s.weaponLevel) || !Object.hasOwn(WEAPONS, s.weapon) || !weaponUnlocked(s, s.weapon) || (s.weaponLevel === 2 && !s.bossDefeated)) return null;
    if (!Array.isArray(s.valleyGates) || new Set(s.valleyGates).size !== s.valleyGates.length || s.valleyGates.some(id => !VALLEY_GATES.some(g => g.id === id)) || typeof s.valleyComplete !== 'boolean') return null;
    if (!Array.isArray(s.chapterGates) || new Set(s.chapterGates).size !== s.chapterGates.length || s.chapterGates.some(id => !CHAPTER_GATES.some(g => g.id === id)) || typeof s.chapterComplete !== 'boolean') return null;
    if (typeof s.harborGate !== 'boolean' || !Array.isArray(s.defeatedGuests) || s.defeatedGuests.some(id => !['nana-tide', 'azi-stage', 'gate-captain', 'rain-regent', ...VALLEY_BOSSES, 'last-lamplighter', ...DUNGEON_BOSSES].includes(id)) || new Set(s.defeatedGuests).size !== s.defeatedGuests.length) return null;
    if (s.chapterGates.includes('archive-door') && !s.defeatedGuests.includes('gate-captain')) return null;
    if (s.chapterComplete !== s.collected?.includes('chapter-bell') || (s.chapterComplete && (!s.defeatedGuests.includes('rain-regent') || !s.collected.includes('food')))) return null;
    if (s.valleyGates.includes('valley-entry') && !s.chapterComplete) return null;
    if (s.valleyGates.some(id => id !== 'valley-entry') && !s.valleyGates.includes('valley-entry')) return null;
    if (s.valleyGates.includes('river-door') && riverSeals(s) !== 2) return null;
    if ((s.collected?.includes('mill-sluice') || s.collected?.includes('ferry-winch')) && !s.defeatedGuests.includes('drowned-warden')) return null;
    if (s.collected?.includes('monastery-sluice') && !s.defeatedGuests.includes('silent-abbot')) return null;
    if (s.defeatedGuests.some(id => VALLEY_BOSSES.includes(id)) && !s.valleyGates.includes('valley-entry')) return null;
    if (s.defeatedGuests.includes('river-serpent') && !s.valleyGates.includes('river-door')) return null;
    if (s.valleyComplete !== s.collected?.includes('river-heart') || (s.valleyComplete && (!s.chapterComplete || !s.defeatedGuests.includes('river-serpent')))) return null;
    if (s.playerSkin === undefined)s.playerSkin = 'sui';
    if (!['sui', 'shiori', 'nagisa'].includes(s.playerSkin)) return null;
    if (typeof s.templeGate !== 'boolean' || typeof s.flaskUpgrade !== 'boolean') return null;
    if (!Array.isArray(s.litLamps) || new Set(s.litLamps).size !== s.litLamps.length || s.litLamps.some(id => !LANDMARKS.some(l => l.id === id && l.kind === 'rest'))) return null;
    if (s.checkpoint !== 'room' && !s.litLamps.includes(s.checkpoint)) return null;
    if (!Object.hasOwn(REST_POINTS, s.checkpoint) || !['charm', 'shortcut', 'bossDefeated'].every(k => typeof s[k as keyof GameState] === 'boolean')) return null;
    for (const k of ['deaths', 'kills', 'parries', 'executions', 'rice', 'bankedRice', 'restCount', 'nextEffectId'] as const) if (!finite(s[k], 0, 1000000) || !Number.isInteger(s[k])) return null;
    if (!finite(s.level, 0, 15) || !Number.isInteger(s.level) || !finite(s.time, 0, 10000000)) return null;
    if (!Array.isArray(s.collected) || s.collected.length > LANDMARKS.length || new Set(s.collected).size !== s.collected.length || s.collected.some(id => !LANDMARKS.some(l => l.id === id))) return null;
    if (!Array.isArray(s.visited) || s.visited.length > 150 || s.visited.some(v => typeof v !== 'string' || v.length > 100)) return null;
    if (!validHaven(s) || !validEquipment(s)) return null;
    s.haven.talking = null;
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
    if (p.fallPeak === undefined)p.fallPeak = p.y + p.jumpHeight;
    if (p.lastGround === undefined)p.lastGround = { x: p.x, y: p.y, z: p.z };
    if (!Array.isArray(s.discoveredDungeons) || new Set(s.discoveredDungeons).size !== s.discoveredDungeons.length || s.discoveredDungeons.some(id => !Object.hasOwn(DUNGEONS, id)) || !validLift(s)) return null;
    if (!finite(p.fallPeak, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY + 10) || !validPosition(p.lastGround, s) || !finite(p.jumpHeight, -60, 2)) return null;
    for (const key of ['charge', 'landing', 'sprintTime', 'guardImpact', 'parryFlash'] as const) if (!finite(p[key], 0, 2)) return null;
    if (!finite(p.jumpVelocity, -40, 7) || !finite(p.airX, -6, 6) || !finite(p.airZ, -6, 6) || !finite(p.attackFacing, -100, 100) || !finite(p.combo, 0, 3) || !Number.isInteger(p.combo) || !finite(p.comboUntil, 0, 10000010) || !finite(p.dashTime, 0, 10)) return null;
    if (typeof p.dashDown !== 'boolean' || typeof p.dashUsed !== 'boolean' || typeof p.airAttackUsed !== 'boolean') return null;
    if (p.buffer !== null && (!['light', 'heavy', 'dodge', 'parry', 'jump'].includes(p.buffer.action) || !finite(p.buffer.until, 0, 10000010))) return null;
    if (!(s.liftRide ? validLift(s) : isAirborne(p) ? finite(p.x, WORLD_BOUNDS.x1, WORLD_BOUNDS.x2) && finite(p.z, WORLD_BOUNDS.z1, WORLD_BOUNDS.z2) && finite(p.y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY) && p.y + p.jumpHeight >= (undergroundId(p.lastGround) ? p.lastGround.y - 9 : -9) : validPosition(p, s)) || !finite(p.hp, 0, maxHp(s)) || !finite(p.stamina, 0, maxStamina(s)) || !finite(p.facing, -100, 100)) return null;
    if (!Object.hasOwn(DURATIONS, p.action) || !finite(p.actionTime, 0, 5) || !finite(p.invulnerable, 0, 1.1) || !finite(p.staminaDelay, 0, 1)) return null;
    if (!finite(p.flasks, 0, maxFlasks(s)) || !Number.isInteger(p.flasks) || !finite(p.dodgeX, -1, 1) || !finite(p.dodgeZ, -1, 1) || typeof p.hitDone !== 'boolean') return null;
    if ((s.mode === 'dead') !== (p.hp === 0) || (s.mode === 'dead') !== (p.action === 'dead')) return null;
    if (!Array.isArray(s.enemies)) return null;
    const addMissing = (ids: string[]) => s.enemies.push(...makeEnemies(s.bossDefeated, s.defeatedGuests).filter(e => ids.includes(e.id) && !s.enemies.some(old => old.id === e.id)));
    if (oldWorld) addMissing(['temple-duelist', 'temple-prowler']);
    if (oldDistrict) addMissing(ENEMY_SPAWNS.slice(8, 13).map(e => e.id));
    if (oldChapter) addMissing(CHAPTER_ENEMIES.map(e => e.id));
    if (oldValley) addMissing(VALLEY_ENEMIES.map(e => e.id));
    if (oldHaven) addMissing(HAVEN_ENEMIES.map(e => e.id));
    if (oldExperience) {
      addMissing(AMBUSH_ENEMIES.map(e => e.id));
      const prowler = s.enemies.find(e => e.id === 'courtyard-prowler');
      if (prowler?.spawn?.x === -4 && prowler.spawn.y === 0 && prowler.spawn.z === 2) {
        if (prowler.x === -4 && prowler.y === 0 && prowler.z === 2) Object.assign(prowler, { x: -6, y: 0, z: 0 });
        prowler.spawn = { x: -6, y: 0, z: 0 };
      }
      for (const enemy of s.enemies) { const role = BOSS_ROSTER[enemy.kind]; if (role && enemy.name === role.legacy) enemy.name = role.name; }
    }
    if (oldJourneys) addMissing(DUNGEON_ENEMIES.map(e => e.id));
    if (!Array.isArray(s.enemies) || s.enemies.length !== ENEMY_SPAWNS.length) return null;
    if (!Array.isArray(s.bestiary) || new Set(s.bestiary).size !== s.bestiary.length || s.bestiary.some(id => !s.enemies.some(e => bestiaryKey(e) === id))) return null;
    for (let i = 0; i < s.enemies.length; i += 1) {
      const e = s.enemies[i]; const spawn = ENEMY_SPAWNS[i];
      if (oldWorld) migrateLampPosition(e, s);
      if (!e || e.id !== spawn.id || e.kind !== spawn.kind || e.name !== spawn.name || !validPosition(e, s)) return null;
      if (!e.spawn || e.spawn.x !== spawn.x || e.spawn.y !== spawn.y || e.spawn.z !== spawn.z) return null;
      if (e.maxHp !== STATS[e.kind].hp || e.maxPosture !== STATS[e.kind].posture || !finite(e.hp, 0, e.maxHp) || !finite(e.posture, 0, e.maxPosture)) return null;
      if (!['idle', 'chase', 'windup', 'attack', 'recover', 'stagger', 'dead'].includes(e.action) || (e.hp === 0) !== (e.action === 'dead')) return null;
      if (!finite(e.timer, -0.02, 5) || !finite(e.attackIndex, 0, 1000000) || !Number.isInteger(e.attackIndex) || ![1, 2].includes(e.phase) || !finite(e.facing, -100, 100) || !finite(e.flash, 0, 1)) return null;
      if (typeof e.hitDone !== 'boolean' || typeof e.aggro !== 'boolean') return null;
      // The longer follow-through must not move an old saved strike past contact.
      if (legacyMotion && e.action === 'attack') {
        if (e.timer > 0.24 + 0.001) return null;
        e.timer += ENEMY_STRIKE_TIME - 0.24;
      }
    }
    s.motionVersion = 1;
    if (s.enemies.some(e => isBoss(e) && e.kind !== 'boss' && ((e.hp === 0) !== s.defeatedGuests.includes(e.id)))) return null;
    if (s.bossDefeated !== (s.enemies.find(e => e.kind === 'boss')?.hp === 0) || (['ending', 'interlude'].includes(s.mode) && !s.bossDefeated) || (s.mode === 'interlude' && !s.collected.includes('food'))) return null;
    if (s.flaskUpgrade !== s.collected.includes('temple-flask')) return null;
    if (s.charm !== s.collected.includes('roof-charm')) return null;
    if (oldWorld) migrateLampPosition(s.bloodstain, s);
    if (s.bloodstain !== null && (!validPosition(s.bloodstain, s) || !finite(s.bloodstain.rice, 0, 1000000) || !Number.isInteger(s.bloodstain.rice))) return null;
    if (s.lockedId !== null && !s.enemies.some(e => e.id === s.lockedId && alive(e))) return null;
    if (typeof s.message !== 'string' || s.message.length > 500 || !finite(s.messageTime, 0, 100)) return null;
    // Preserve combat, health and enemy deaths exactly. A refresh cannot heal,
    // reset a losing boss fight, or award the same kill a second time.
    s.effects = []; s.projectiles = []; s.paused = false; updatePrompt(s); return s;
  } catch { return null; }
}
