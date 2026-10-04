import { AIR_MOVES } from "./airCombat";
import type { AirAttack } from "./airCombat";

export type HitHeight = "high" | "mid" | "low";
export type MoveKind = "strike" | "throw" | "super" | "skill";
export type Animation =
  | "idle"
  | "walk"
  | "crouch"
  | "guard"
  | "jump"
  | "punch"
  | "kick"
  | "low"
  | "skill"
  | "rise"
  | "hurt"
  | "down"
  | "victory";
export interface SkinDefinition {
  id: string;
  name: string;
  seed: string;
  motion: string;
  combat: string;
  air?: string;
}
export interface MoveDefinition {
  id: string;
  name: string;
  kind: MoveKind;
  height: HitHeight;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  reach: number;
  stun: number;
  push: number;
  tracking?: boolean;
  launcher?: boolean;
  knockdown?: boolean;
  critical?: boolean;
  meter?: number;
  advance?: number;
  followups?: Partial<Record<"punch" | "kick" | "skill", string>>;
  animation?: Animation;
  blockStun?: number;
  guardDamage?: number;
  invulnerability?: number;
  projectile?: { speed: number; radius: number; lifetime: number };
  overhead?: boolean;
  air?: AirAttack;
}
export interface CharacterDefinition {
  id: string;
  name: string;
  subtitle: string;
  style: string;
  color: string;
  secondary: string;
  portrait: string;
  atlas: string;
  frames: readonly (readonly number[])[];
  combatAtlas?: string;
  combatFrames?: readonly (readonly number[])[];
  combatReferenceHeight?: number;
  scale: number;
  speed: number;
  power: number;
  superName: string;
  specialEffect?: "cat" | "wave" | "moon";
  moves: Readonly<Record<string, MoveDefinition>>;
  skins?: readonly SkinDefinition[];
  role?: string;
  strengths?: string;
  weakness?: string;
}

// Frame data is expressed in seconds and game-world pixels, independent of the renderer.
const COMMON: Record<string, MoveDefinition> = {
  ...AIR_MOVES,
  punch: {
    id: "punch",
    name: "直拳",
    kind: "strike",
    height: "high",
    startup: 0.0833,
    active: 0.0667,
    recovery: 0.2,
    damage: 12,
    reach: 142,
    stun: 0.21,
    push: 17,
    followups: { punch: "punch2", kick: "punchKick" },
  },
  punch2: {
    id: "punch2",
    name: "连掌",
    kind: "strike",
    height: "mid",
    startup: 0.0917,
    active: 0.0667,
    recovery: 0.2167,
    damage: 16,
    reach: 148,
    stun: 0.28,
    push: 12,
    critical: true,
    followups: { punch: "punch3", kick: "launcher" },
  },
  punch3: {
    id: "punch3",
    name: "崩掌",
    kind: "strike",
    height: "mid",
    startup: 0.15,
    active: 0.075,
    recovery: 0.325,
    damage: 25,
    reach: 166,
    stun: 0.34,
    push: 69,
    knockdown: true,
  },
  kick: {
    id: "kick",
    name: "旋踢",
    kind: "strike",
    height: "mid",
    startup: 0.1583,
    active: 0.0917,
    recovery: 0.3,
    damage: 24,
    reach: 201,
    stun: 0.3,
    push: 36,
    tracking: true,
    critical: true,
    followups: { kick: "kick2", punch: "kickPunch" },
  },
  kick2: {
    id: "kick2",
    name: "回旋踢",
    kind: "strike",
    height: "high",
    startup: 0.1833,
    active: 0.1,
    recovery: 0.35,
    damage: 28,
    reach: 214,
    stun: 0.34,
    push: 62,
    tracking: true,
    knockdown: true,
  },
  kickPunch: {
    id: "kickPunch",
    name: "进身掌",
    kind: "strike",
    height: "mid",
    startup: 0.1,
    active: 0.075,
    recovery: 0.25,
    damage: 18,
    reach: 157,
    stun: 0.28,
    push: 18,
    advance: 42,
    critical: true,
  },
  punchKick: {
    id: "punchKick",
    name: "突进踢",
    kind: "strike",
    height: "mid",
    startup: 0.1167,
    active: 0.0917,
    recovery: 0.3167,
    damage: 23,
    reach: 201,
    stun: 0.33,
    push: 45,
    advance: 45,
    critical: true,
  },
  lowPunch: {
    id: "lowPunch",
    name: "下段掌",
    kind: "strike",
    height: "low",
    startup: 0.1083,
    active: 0.075,
    recovery: 0.225,
    damage: 13,
    reach: 139,
    stun: 0.23,
    push: 18,
    followups: { kick: "lowKick" },
  },
  lowKick: {
    id: "lowKick",
    name: "扫腿",
    kind: "strike",
    height: "low",
    startup: 0.2,
    active: 0.1083,
    recovery: 0.4,
    damage: 26,
    reach: 187,
    stun: 0.34,
    push: 45,
    tracking: true,
    knockdown: true,
  },
  launcher: {
    id: "launcher",
    name: "升空踢",
    kind: "strike",
    height: "mid",
    startup: 0.1667,
    active: 0.0833,
    recovery: 0.3083,
    damage: 22,
    reach: 178,
    stun: 0.32,
    push: 14,
    launcher: true,
  },
  throw: {
    id: "throw",
    name: "近身摔",
    kind: "throw",
    height: "mid",
    startup: 0.1,
    active: 0.0583,
    recovery: 0.4,
    damage: 35,
    reach: 118,
    stun: 0.5,
    push: 75,
    tracking: true,
    knockdown: true,
  },
  super: {
    id: "super",
    name: "必杀",
    kind: "super",
    height: "mid",
    startup: 0.225,
    active: 0.15,
    recovery: 0.65,
    damage: 64,
    reach: 245,
    stun: 0.62,
    push: 110,
    meter: 100,
    advance: 64,
    tracking: true,
    knockdown: true,
  },
  signature: {
    id: "signature",
    name: "猫步连掌",
    kind: "skill",
    height: "mid",
    startup: 11 / 60,
    active: 4 / 60,
    recovery: 20 / 60,
    damage: 20,
    reach: 172,
    stun: 0.36,
    push: 14,
    advance: 78,
    blockStun: 0.23,
    guardDamage: 17,
    animation: "skill",
    followups: { skill: "signature2" },
  },
  signature2: {
    id: "signature2",
    name: "破浪连掌",
    kind: "skill",
    height: "mid",
    startup: 9 / 60,
    active: 4 / 60,
    recovery: 21 / 60,
    damage: 23,
    reach: 176,
    stun: 0.39,
    push: 12,
    advance: 34,
    blockStun: 0.21,
    guardDamage: 20,
    animation: "skill",
    followups: { skill: "signature3" },
  },
  signature3: {
    id: "signature3",
    name: "夜猫破浪",
    kind: "skill",
    height: "mid",
    startup: 14 / 60,
    active: 5 / 60,
    recovery: 31 / 60,
    damage: 31,
    reach: 194,
    stun: 0.34,
    push: 90,
    advance: 36,
    blockStun: 0.21,
    guardDamage: 24,
    animation: "skill",
    knockdown: true,
  },
  reversal: {
    id: "reversal",
    name: "猫跃升击",
    kind: "skill",
    height: "mid",
    startup: 7 / 60,
    active: 7 / 60,
    recovery: 31 / 60,
    damage: 28,
    reach: 160,
    stun: 0.34,
    push: 10,
    blockStun: 0.23,
    guardDamage: 16,
    animation: "rise",
    launcher: true,
    meter: 25,
    invulnerability: 10 / 60,
  },
};
function moves(
  overrides: Partial<Record<string, Partial<MoveDefinition>>>,
): Readonly<Record<string, MoveDefinition>> {
  return Object.fromEntries(
    Object.entries(COMMON).map(([id, move]) => [
      id,
      { ...move, ...overrides[id] },
    ]),
  );
}

// Adding a roster entry registers a playable fighter without editing engine branching.
export const FIGHTERS: readonly CharacterDefinition[] = [
  {
    id: "sui",
    name: "岁己",
    subtitle: "猫步 · 破浪",
    style: "迅捷连掌 / 空中追击",
    color: "#b7a4ff",
    secondary: "#ffb9ce",
    portrait: "/images/livers/sui.png",
    atlas: "/games/beach-volley/sui-atlas.webp",
    scale: 0.585,
    speed: 294,
    power: 1,
    combatAtlas: "/games/tidal-duel/sui-combat.webp",
    frames: [
      [90, 2, 214, 540],
      [461, 5, 253, 521],
      [836, 5, 240, 523],
      [1183, 79, 303, 457],
      [50, 521, 292, 467],
      [438, 550, 325, 397],
      [846, 533, 246, 491],
      [1264, 590, 206, 427],
    ],
    superName: "月下猫步",
    specialEffect: "cat",
    role: "近身 · 连掌",
    strengths: "快拳与猫步突进，命中后连掌压制",
    weakness: "远距吃亏，终段落空容易被反击",
    skins: [
      {
        id: "original",
        name: "小猫帽 · 原皮",
        seed: "/games/tidal-duel/pixel/sui-original-seed.webp",
        motion: "/games/tidal-duel/pixel/sui-original-motion.webp",
        combat: "/games/tidal-duel/pixel/sui-original-combat.webp",
        air: "/games/tidal-duel/pixel/sui-original-air.webp",
      },
      {
        id: "resort",
        name: "晴海 · 轻装",
        seed: "/games/tidal-duel/pixel/sui-seed.webp",
        motion: "/games/tidal-duel/pixel/sui-resort-motion.webp",
        combat: "/games/tidal-duel/pixel/sui-resort-combat.webp",
        air: "/games/tidal-duel/pixel/sui-resort-air.webp",
      },
    ],
    moves: moves({
      super: { name: "月下猫步", damage: 64, reach: 255 },
      launcher: { name: "猫跃升踢" },
      punch3: { name: "破浪崩掌" },
    }),
  },
  {
    id: "shiori",
    name: "栞栞",
    subtitle: "潮汐 · 流心",
    style: "回旋腿法 / 反击控制",
    color: "#7fe0e3",
    secondary: "#fff0c5",
    portrait: "/images/livers/shiori.png",
    atlas: "/games/beach-volley/shiori-atlas.webp",
    scale: 0.626,
    speed: 275,
    power: 1.04,
    combatAtlas: "/games/tidal-duel/shiori-combat.webp",
    frames: [
      [87, 7, 196, 502],
      [472, 8, 234, 496],
      [838, 10, 234, 481],
      [1187, 74, 326, 433],
      [34, 492, 286, 522],
      [419, 546, 356, 407],
      [859, 514, 247, 510],
      [1253, 591, 214, 431],
    ],
    superName: "白昼潮汐",
    specialEffect: "wave",
    role: "控距 · 迎击",
    strengths: "长腿牵制与潮波，升潮踢迎击跳入",
    weakness: "招式收招较长，贴身容易被抢招",
    skins: [
      {
        id: "original",
        name: "月色 · 旅装",
        seed: "/games/tidal-duel/pixel/shiori-original-seed.webp",
        motion: "/games/tidal-duel/pixel/shiori-original-motion.webp",
        combat: "/games/tidal-duel/pixel/shiori-original-combat.webp",
        air: "/games/tidal-duel/pixel/shiori-original-air.webp",
      },
      {
        id: "resort",
        name: "晴海 · 轻装",
        seed: "/games/tidal-duel/pixel/shiori-seed.webp",
        motion: "/games/tidal-duel/pixel/shiori-resort-motion.webp",
        combat: "/games/tidal-duel/pixel/shiori-resort-combat.webp",
        air: "/games/tidal-duel/pixel/shiori-resort-air.webp",
      },
    ],
    moves: moves({
      kick: { name: "潮汐旋踢", reach: 215 },
      airKick: { name: "流心飞踢", reach: 215 },
      airHeavy: { name: "潮汐下劈", reach: 220 },
      airSignature: {
        name: "流心落潮踢",
        reach: 194,
        damage: 28,
        startup: 9 / 60,
        air: { ...AIR_MOVES.airSignature.air!, velocity: 355, descent: 520 },
      },
      kick2: { name: "流心回旋", reach: 225 },
      super: { name: "白昼潮汐", damage: 67, reach: 237 },
      throw: { name: "流心摔", damage: 37 },
      signature: {
        name: "流心潮波",
        startup: 13 / 60,
        active: 4 / 60,
        recovery: 25 / 60,
        damage: 22,
        reach: 720,
        advance: 0,
        push: 40,
        stun: 0.28,
        blockStun: 0.22,
        projectile: { speed: 590, radius: 28, lifetime: 1.55 },
        followups: {},
        animation: "skill",
      },
      reversal: { name: "升潮踢", reach: 188, damage: 30, recovery: 34 / 60 },
    }),
  },
  {
    id: "mizuki",
    name: "弥月",
    subtitle: "月弧 · 逐影",
    style: "进身踢击 / 斜向落踢",
    color: "#d9b3ff",
    secondary: "#ffe0a6",
    portrait: "/images/livers/mizuki.png",
    atlas: "/games/tidal-duel/pixel/mizuki-original-motion.webp",
    combatAtlas: "/games/tidal-duel/pixel/mizuki-original-combat.webp",
    scale: 2,
    speed: 286,
    power: 1.02,
    frames: [
      [0, 0, 448, 448],
      [448, 0, 448, 448],
      [896, 0, 448, 448],
      [1344, 0, 448, 448],
      [0, 448, 448, 448],
      [448, 448, 448, 448],
      [896, 448, 448, 448],
      [1344, 448, 448, 448],
    ],
    superName: "满月回旋",
    specialEffect: "moon",
    role: "进身 · 踢击",
    strengths: "月弧踢进身接追踢，长腿牵制与斜向落踢",
    weakness: "终段落空收招长，落踢需要高度",
    skins: [
      {
        id: "original",
        name: "黑丝 · 原皮",
        seed: "/games/tidal-duel/pixel/mizuki-original-seed.webp",
        motion: "/games/tidal-duel/pixel/mizuki-original-motion.webp",
        combat: "/games/tidal-duel/pixel/mizuki-original-combat.webp",
        air: "/games/tidal-duel/pixel/mizuki-original-air.webp",
      },
    ],
    moves: moves({
      punch: { name: "逐影直拳" },
      punch2: { name: "月步连拳" },
      punch3: { name: "逐影崩拳" },
      kick: { name: "月弧横踢", reach: 214, startup: 10 / 60 },
      kick2: { name: "回月旋踢", reach: 220 },
      kickPunch: { name: "逐影进身拳" },
      punchKick: { name: "逐月突进踢" },
      lowPunch: { name: "低身直拳" },
      lowKick: { name: "月影扫腿", reach: 195 },
      launcher: { name: "月轮升空踢", reach: 184 },
      throw: { name: "逐影摔" },
      super: { name: "满月回旋", damage: 66, reach: 242, advance: 70 },
      signature: {
        name: "月弧踢",
        startup: 12 / 60,
        active: 5 / 60,
        recovery: 24 / 60,
        damage: 25,
        reach: 218,
        advance: 82,
        push: 12,
        stun: 0.37,
        blockStun: 0.22,
        guardDamage: 20,
        tracking: true,
        followups: { skill: "signature2" },
      },
      signature2: {
        name: "回月追踢",
        startup: 11 / 60,
        active: 4 / 60,
        recovery: 30 / 60,
        damage: 28,
        reach: 216,
        advance: 28,
        push: 75,
        stun: 0.35,
        blockStun: 0.2,
        guardDamage: 22,
        animation: "kick",
        tracking: true,
        knockdown: true,
        followups: {},
      },
      signature3: { name: "逐影终踢" },
      reversal: {
        name: "月轮升踢",
        startup: 9 / 60,
        active: 6 / 60,
        recovery: 33 / 60,
        reach: 184,
        damage: 29,
      },
      airPunch: { name: "逐影空拳" },
      airKick: { name: "月弧飞踢", reach: 212 },
      airHeavy: { name: "月影下劈", reach: 216 },
      airSignature: {
        name: "蚀月落踢",
        startup: 11 / 60,
        damage: 29,
        reach: 190,
        air: { ...AIR_MOVES.airSignature.air!, velocity: 415, descent: 550 },
      },
    }),
  },
];
export function getFighter(id: string): CharacterDefinition {
  return FIGHTERS.find((fighter) => fighter.id === id) ?? FIGHTERS[0];
}
export function getSkin(
  character: CharacterDefinition,
  id = "original",
): SkinDefinition | undefined {
  return (
    character.skins?.find((skin) => skin.id === id) ?? character.skins?.[0]
  );
}
