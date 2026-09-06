export type Input = "left" | "right" | "attack" | "guard" | "dodge";
export type ControlAction = Input | "pause";
export type Difficulty = "relaxed" | "standard" | "challenge";
export type Charm = "none" | "breath" | "steady" | "wind" | "breaker";
export type Vow = "clear" | "combo" | "perfect";
export type BossId = "coach" | "keeper" | "master";
export type Move =
  | "sweep"
  | "triple"
  | "slam"
  | "bellThrust"
  | "bellChain"
  | "bellCrash"
  | "crossCut"
  | "finalChain"
  | "redCrash";

export const CONTENT_VERSION = "0.3.0";
export const WIDTH = 1280;
export const HEIGHT = 720;
export const FLOOR = 564;
export const CONTROLS: { id: ControlAction; label: string }[] = [
  { id: "left", label: "向左移动" },
  { id: "right", label: "向右移动" },
  { id: "attack", label: "挥剑" },
  { id: "guard", label: "格挡 / 弹反" },
  { id: "dodge", label: "闪避" },
  { id: "pause", label: "暂停" },
];
export const DEFAULT_BINDINGS: Record<ControlAction, string> = {
  left: "KeyA",
  right: "KeyD",
  attack: "KeyJ",
  guard: "KeyK",
  dodge: "Space",
  pause: "Escape",
};
export const KEY_OPTIONS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
  .map((letter) => `Key${letter}`)
  .concat([
    "Space",
    "Escape",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "ShiftLeft",
    "Enter",
  ]);
export const keyLabel = (code: string) => (
    ({
      Space: "Space",
      Escape: "Esc",
      ArrowLeft: "←",
      ArrowRight: "→",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ShiftLeft: "Shift",
      Enter: "Enter",
    }) as Record<string, string>
  )[code] ?? code.replace("Key", "");
export const VOWS: { id: Vow; name: string; target: string }[] = [
  { id: "clear", name: "这把拿下", target: "击败眼前的对手" },
  { id: "combo", name: "三招全接", target: "完整弹反一组三连，并获胜" },
  { id: "perfect", name: "一滴不掉", target: "不受伤，赢下这一场" },
];
export const DIFFICULTIES: Record<
  Difficulty,
  { name: string; speed: number; parry: number; cost: number }
> = {
  relaxed: { name: "舒缓", speed: 0.78, parry: 250, cost: 0.8 },
  standard: { name: "标准", speed: 1, parry: 170, cost: 1 },
  challenge: { name: "挑战", speed: 1.13, parry: 135, cost: 1.1 },
};
export const CHARMS: { id: Charm; name: string; effect: string }[] = [
  { id: "none", name: "不带护符", effect: "原初试炼" },
  { id: "breath", name: "回气符", effect: "体力恢复 +30%" },
  { id: "steady", name: "稳心结", effect: "格挡耗力 -35%" },
  { id: "wind", name: "追风绳", effect: "闪避耗力 -25%，闪避后首击更强" },
  { id: "breaker", name: "破阵佩", effect: "攻击造成的架势压力 +30%" },
];

export interface AttackDefinition {
  kind: 'slash' | 'slam' | 'bell' | 'ward' | 'rush' | 'spin' | 'leap';
  name: string;
  hits: number[];
  recovery: number;
  range: number;
  tracking: number;
  heavy: boolean;
  reach: number;
  projectileSpeed?: number;
  motion?: { start: number; end: number; height: number };
}
export const MOVES: Record<Move, AttackDefinition> = {
  sweep: {
    kind: 'slash',
    name: "试探横挥",
    hits: [1100],
    recovery: 1100,
    range: 248,
    tracking: 350,
    heavy: false,
    reach: 184,
  },
  triple: {
    kind: 'slash',
    name: "三连敲击",
    hits: [1100, 1730, 2360],
    recovery: 1250,
    range: 254,
    tracking: 300,
    heavy: false,
    reach: 182,
  },
  slam: {
    kind: 'slam',
    name: "举势重击",
    hits: [1500],
    recovery: 1450,
    range: 162,
    tracking: 1500,
    heavy: true,
    reach: 186,
  },
  bellThrust: {
    kind: 'bell',
    name: "引铃回响",
    hits: [900],
    recovery: 1700,
    range: 24,
    tracking: 350,
    heavy: false,
    reach: 420,
    projectileSpeed: 400,
  },
  bellChain: {
    kind: 'bell',
    name: "三叠飞铃",
    hits: [700, 1500, 2300],
    recovery: 1750,
    range: 24,
    tracking: 320,
    heavy: false,
    reach: 420,
    projectileSpeed: 365,
  },
  bellCrash: {
    kind: 'ward',
    name: "空心钟域",
    hits: [2100, 2950],
    recovery: 1450,
    range: 155,
    tracking: 2100,
    heavy: true,
    reach: 420,
  },
  crossCut: {
    kind: 'rush',
    name: "穿庭回锋",
    hits: [980, 1770],
    recovery: 1100,
    range: 175,
    tracking: 340,
    heavy: false,
    reach: 340,
    motion: { start: 650, end: 1120, height: 0 },
  },
  finalChain: {
    kind: 'spin',
    name: "旋身三斩",
    hits: [1050, 1740, 2430],
    recovery: 1320,
    range: 235,
    tracking: 320,
    heavy: false,
    reach: 180,
  },
  redCrash: {
    kind: 'leap',
    name: "跃空坠刃",
    hits: [1510],
    recovery: 1400,
    range: 115,
    tracking: 1510,
    heavy: true,
    reach: 330,
    motion: { start: 650, end: 1510, height: 180 },
  },
};

export interface BossDefinition {
  id: BossId;
  name: string;
  title: string;
  stage: string;
  health: number;
  speed: number;
  moves: Move[];
  background: string;
  accent: number;
  intro: string;
  victory: string;
}
export const BOSSES: BossDefinition[] = [
  {
    id: "coach",
    name: "饼师傅",
    title: "竹庭守门人",
    stage: "竹庭",
    health: 100,
    speed: 180,
    moves: ["sweep", "triple", "slam"],
    background: "/games/one-more/dojo.webp",
    accent: 0x267a6f,
    intro: "“想敲收场钟？先接住我这把木剑。”",
    victory: "“好。门开了，去听一听山上的钟。”",
  },
  {
    id: "keeper",
    name: "听钟人",
    title: "山门执铃",
    stage: "钟台",
    health: 135,
    speed: 195,
    moves: ["bellThrust", "bellChain", "bellCrash"],
    background: "/games/one-more/bell-court.webp",
    accent: 0x447b9a,
    intro: "“飞铃会回头。能不能送回我手里？”",
    victory: "“这次，你听见了。馆主已在等你。”",
  },
  {
    id: "master",
    name: "赤绶馆主",
    title: "收场之约",
    stage: "终庭",
    health: 165,
    speed: 218,
    moves: ["crossCut", "finalChain", "redCrash"],
    background: "/games/one-more/final-court.webp",
    accent: 0xb53953,
    intro: "“我的剑，可不会只停在原地。”",
    victory: "“钟归你敲。这一夜，记你的名字。”",
  },
];
