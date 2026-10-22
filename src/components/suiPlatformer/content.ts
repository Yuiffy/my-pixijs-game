export const WIDTH = 960;
export const HEIGHT = 540;
export const GROUND = 456;
export type EnemyKind =
  | "walker"
  | "shell"
  | "hopper"
  | "archer"
  | "mortar"
  | "flyer"
  | "director";
export const ENEMIES: Record<
  EnemyKind,
  {
    name: string;
    character: string;
    art: string;
    role: string;
    tip: string;
    color: string;
  }
> = {
  walker: {
    name: "散步小绿",
    character: "小松绿",
    art: "viridis",
    role: "沿着花坛慢慢巡逻。到了边缘会转身。",
    tip: "从头顶踩一下，借反弹继续往前。按住跳跃，反弹更高。",
    color: "#74a680",
  },
  shell: {
    name: "抱枕绒绒",
    character: "犬绒Mofu",
    art: "mossback",
    role: "第一次踩踏会抱紧饼干枕缩成一团。再碰一下，饼干壳就会滑出去。",
    tip: "飞奔的壳也会伤到你！从上方踩住它，或让它替你清路。",
    color: "#789587",
  },
  hopper: {
    name: "弹簧棒棒糖",
    character: "恬豆",
    art: "tiandou",
    role: "先蹲下蓄力，再向你的方向跳一小步。",
    tip: "等她落地再跳过去。头顶依然是弱点。",
    color: "#d18cb0",
  },
  archer: {
    name: "发条弓手",
    character: "浣熊店员",
    art: "raccoon-archer",
    role: "拉弓时亮起红光，随后水平射出一支箭。",
    tip: "箭会被墙挡住。观察蓄力，跳过箭或从高处绕行。",
    color: "#bc945e",
  },
  mortar: {
    name: "礼花炮手",
    character: "又一",
    art: "youyi",
    role: "抛出一颗有弧线的礼花弹，落地前标出爆炸位置。",
    tip: "圈亮起时离开。炮弹爆炸前有短暂引信，不必慌张。",
    color: "#cc8464",
  },
  flyer: {
    name: "逆风羽啾",
    character: "羽啾",
    art: "chu2u",
    role: "沿固定路线上下飞行，不会突然追踪你。",
    tip: "在低点踩她借力，也可以从下方通过。",
    color: "#85a7be",
  },
  director: {
    name: "首播场务长",
    character: "四时小路",
    art: "komichi",
    role: "举着路牌守在最后的舞台。三轮礼花考验之间会低头检查设备。",
    tip: "躲开礼花，在橙色蓄力圈消失时踩头。踩中三次就能开播。",
    color: "#c48d54",
  },
};
export type PlatformKind =
  | "grass"
  | "wood"
  | "brick"
  | "cloud"
  | "moving"
  | "crumble";
export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PlatformKind;
  move?: number;
  speed?: number;
}
export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  y: number;
  left: number;
  right: number;
}
export interface Hazard {
  kind: "spikes" | "pendulum";
  x: number;
  y: number;
  w: number;
  length?: number;
  phase?: number;
}
export interface Pickup {
  x: number;
  y: number;
  kind: "coin" | "star" | "heart";
  id: string;
}
export interface Sign {
  x: number;
  y: number;
  text: string;
}
export interface Level {
  id: string;
  name: string;
  subtitle: string;
  story: string;
  ending: string;
  palette: number;
  width: number;
  platforms: Platform[];
  enemies: EnemySpawn[];
  hazards: Hazard[];
  pickups: Pickup[];
  signs: Sign[];
  checkpoints: number[];
  springs: { x: number; y: number }[];
  goal: number;
}
const ground = (x: number, w: number, y = GROUND): Platform => ({
  x,
  y,
  w,
  h: 560 - y,
  kind: "grass",
});
const ledge = (
  x: number,
  y: number,
  w: number,
  kind: PlatformKind = "wood",
  move?: number,
): Platform => ({ x, y, w, h: 18, kind, move, speed: 0.8 });
const foe = (
  kind: EnemyKind,
  x: number,
  left: number,
  right: number,
  y = GROUND,
): EnemySpawn => ({ kind, x, y, left, right });
const spikes = (x: number, w = 64, y = GROUND): Hazard => ({
  kind: "spikes",
  x,
  y,
  w,
});
const pendulum = (x: number, y: number, length = 180, phase = 0): Hazard => ({
  kind: "pendulum",
  x,
  y,
  length,
  w: 30,
  phase,
});
function coins(
  x: number,
  y: number,
  n: number,
  prefix: string,
  arc = false,
): Pickup[] {
  return Array.from({ length: n }, (_, i) => ({
    x: x + i * 36,
    y: y - (arc ? Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 60 : 0),
    kind: "coin",
    id: `${prefix}-${i}`,
  }));
}
const star = (x: number, y: number, id: string): Pickup => ({
  x,
  y,
  id,
  kind: "star",
});
const heart = (x: number, y: number, id: string): Pickup => ({
  x,
  y,
  id,
  kind: "heart",
});
export const LEVELS: Level[] = [
  {
    id: "1-1",
    name: "一封春天的信",
    subtitle: "花田 · 报名的小路",
    palette: 0,
    width: 6200,
    goal: 5970,
    story: "春风把一张招募启事吹进了窗。带上写好的信，去小镇另一头的邮局吧。",
    ending: "信寄出去了。原来，迈出第一步也没有想象中那么难。",
    platforms: [
      ground(0, 1450),
      ground(1580, 1150),
      ground(2890, 1360),
      ground(4430, 1770),
      ledge(500, 370, 180),
      ledge(760, 290, 170),
      ledge(1050, 350, 160),
      ledge(1455, 395, 115),
      ledge(1880, 375, 170),
      ledge(2110, 300, 180),
      ledge(2370, 350, 140),
      ledge(2740, 375, 130),
      ledge(3100, 370, 160),
      ledge(3340, 290, 170),
      ledge(3600, 215, 160),
      ledge(3860, 325, 190),
      ledge(4260, 375, 150),
      ledge(4720, 375, 150),
      ledge(4980, 300, 180),
      ledge(5290, 350, 160),
    ],
    enemies: [
      foe("walker", 1020, 940, 1300),
      foe("walker", 2030, 1690, 2440),
      foe("shell", 3260, 3020, 3570),
      foe("walker", 3900, 3690, 4150),
      foe("walker", 5140, 4820, 5500),
    ],
    hazards: [spikes(3690, 64)],
    pickups: [
      ...coins(300, 407, 5, "a"),
      ...coins(540, 332, 3, "b"),
      ...coins(1350, 390, 10, "c", true),
      ...coins(2125, 260, 4, "d"),
      ...coins(2680, 390, 9, "e", true),
      ...coins(3100, 410, 5, "f"),
      ...coins(4190, 380, 9, "g", true),
      ...coins(5480, 403, 9, "h"),
      star(840, 245, "star-0"),
      star(3670, 170, "star-1"),
      star(5050, 250, "star-2"),
      heart(2420, 310, "heart-0"),
      heart(4530, 405, "heart-1"),
    ],
    signs: [
      { x: 240, y: 410, text: "← → / A D 移动\n空格跳跃 · 按得久，跳得高" },
      { x: 720, y: 410, text: "试试高处的小路\n星星只奖励探索，不挡通关" },
      { x: 1240, y: 410, text: "Shift / X 加速跑\n金币会告诉你起跳的方向" },
      { x: 3020, y: 410, text: "小龟先缩壳，再踢走\n滑动的壳也要小心！" },
    ],
    checkpoints: [1800, 4435],
    springs: [{ x: 3500, y: GROUND }],
  },
  {
    id: "1-2",
    name: "风铃与试音室",
    subtitle: "风车坡 · 听一听节拍",
    palette: 1,
    width: 6800,
    goal: 6560,
    story:
      "回信里夹着一张试音邀请。风车、木桥和风铃，都在替你练习第一声「你好」。",
    ending: "风铃声停下来，门里传来一句：欢迎加入。",
    platforms: [
      ground(0, 1000),
      ground(1150, 1030),
      ground(2360, 990),
      ground(3570, 1220),
      ground(5030, 1770),
      ledge(530, 365, 180),
      ledge(820, 300, 170),
      ledge(1005, 390, 135, "moving", 36),
      ledge(1420, 355, 180),
      ledge(1690, 270, 170),
      ledge(1950, 350, 140),
      ledge(2200, 360, 140, "moving", 45),
      ledge(2580, 365, 200),
      ledge(2910, 290, 200),
      ledge(3370, 375, 170, "moving", 50),
      ledge(3810, 365, 170),
      ledge(4080, 280, 170),
      ledge(4390, 355, 150),
      ledge(4810, 370, 190, "moving", 38),
      ledge(5230, 365, 170),
      ledge(5490, 290, 200),
      ledge(5790, 345, 180),
      ledge(6100, 370, 150),
    ],
    enemies: [
      foe("walker", 700, 500, 940),
      foe("archer", 1580, 1580, 1580),
      foe("hopper", 2760, 2500, 3260),
      foe("archer", 4180, 4180, 4180, 280),
      foe("shell", 5500, 5200, 5800),
      foe("hopper", 6110, 5930, 6400),
    ],
    hazards: [
      pendulum(1950, 180, 220),
      spikes(3020, 85),
      pendulum(3930, 155, 225, 1),
      pendulum(5650, 130, 230, 2),
    ],
    pickups: [
      ...coins(330, 405, 5, "a"),
      ...coins(950, 355, 8, "b", true),
      ...coins(1420, 315, 5, "c"),
      ...coins(2130, 340, 9, "d", true),
      ...coins(2940, 250, 5, "e"),
      ...coins(3280, 345, 10, "f", true),
      ...coins(4430, 310, 4, "g"),
      ...coins(4770, 345, 9, "h", true),
      ...coins(5940, 400, 8, "i"),
      star(1770, 220, "star-0"),
      star(4170, 225, "star-1"),
      star(5590, 240, "star-2"),
      heart(2450, 400, "heart-0"),
      heart(5180, 400, "heart-1"),
    ],
    signs: [
      { x: 220, y: 410, text: "风车坡\n先看摆锤，再挑空隙过去" },
      { x: 1280, y: 410, text: "弓手拉弓会先亮红光\n跳过箭，或走上面" },
      { x: 2480, y: 410, text: "跳跳糖会先蹲一下\n落地时再靠近她" },
    ],
    checkpoints: [2400, 5080],
    springs: [{ x: 4020, y: GROUND }],
  },
  {
    id: "1-3",
    name: "把星光搬进来",
    subtitle: "屋顶花园 · 开播前的准备",
    palette: 2,
    width: 7200,
    goal: 6960,
    story:
      "灯串、话筒、还有一点点紧张。沿着屋顶花园，把开播用的星光带回直播间。",
    ending: "设备都接好了。窗外天色渐暖，舞台已经在前面等你。",
    platforms: [
      ground(0, 1050),
      ground(1270, 930),
      ground(2430, 1150),
      ground(3820, 1100),
      ground(5180, 2020),
      ledge(470, 370, 180),
      ledge(740, 285, 180),
      ledge(1070, 380, 160, "crumble"),
      ledge(1450, 355, 170),
      ledge(1730, 270, 200),
      ledge(2210, 365, 190, "moving", 42),
      ledge(2620, 360, 180),
      ledge(2900, 275, 170),
      ledge(3160, 190, 180),
      ledge(3590, 365, 200, "crumble"),
      ledge(4000, 360, 180),
      ledge(4290, 280, 160),
      ledge(4550, 350, 180),
      ledge(4940, 360, 200, "moving", 45),
      ledge(5360, 365, 170),
      ledge(5610, 280, 170),
      ledge(5880, 200, 180),
      ledge(6160, 300, 180),
      ledge(6490, 365, 170),
    ],
    enemies: [
      foe("mortar", 810, 810, 810, 285),
      foe("flyer", 1650, 1460, 2010, 335),
      foe("shell", 1920, 1470, 2130),
      foe("archer", 2780, 2780, 2780),
      foe("mortar", 3240, 3240, 3240, 190),
      foe("hopper", 4140, 3920, 4530),
      foe("flyer", 4620, 4270, 4780, 290),
      foe("mortar", 5700, 5700, 5700, 280),
      foe("archer", 6370, 6370, 6370),
      foe("shell", 6640, 6490, 6840),
    ],
    hazards: [
      spikes(1790, 90),
      spikes(2920, 90),
      pendulum(4510, 155, 220),
      spikes(6040, 88),
    ],
    pickups: [
      ...coins(320, 405, 4, "a"),
      ...coins(980, 350, 10, "b", true),
      ...coins(1480, 310, 4, "c"),
      ...coins(2120, 340, 10, "d", true),
      ...coins(2910, 235, 4, "e"),
      ...coins(3500, 340, 10, "f", true),
      ...coins(4280, 235, 4, "g"),
      ...coins(4850, 335, 10, "h", true),
      ...coins(6490, 320, 5, "i"),
      star(1820, 220, "star-0"),
      star(3260, 135, "star-1"),
      star(5960, 150, "star-2"),
      heart(2510, 405, "heart-0"),
      heart(5240, 400, "heart-1"),
    ],
    signs: [
      { x: 230, y: 410, text: "屋顶礼花演练\n地上的红圈会预告爆点" },
      { x: 900, y: 410, text: "裂纹木板踩久会掉下去\n保持移动，几秒后会复原" },
      { x: 3920, y: 410, text: "飞鸟只沿固定路线飞\n试试踩着它跳高一点" },
    ],
    checkpoints: [2460, 5220],
    springs: [
      { x: 3040, y: GROUND },
      { x: 5800, y: GROUND },
    ],
  },
  {
    id: "1-4",
    name: "今晚，第一次开播",
    subtitle: "暮色舞台 · 把灯点亮",
    palette: 3,
    width: 7800,
    goal: 7570,
    story: "试音通过，灯光就位。穿过最后一段后台，和认真过头的场务长打个招呼。",
    ending:
      "「晚上好呀，我是岁己。」\n小镇的每一扇窗，都为这句问候亮起了灯。第一大关 · 完。",
    platforms: [
      ground(0, 1120),
      ground(1300, 1100),
      ground(2640, 1150),
      ground(4020, 1150),
      ground(5420, 2380),
      ledge(470, 365, 170),
      ledge(760, 280, 170),
      ledge(1130, 370, 150, "moving", 30),
      ledge(1500, 355, 180),
      ledge(1790, 270, 180),
      ledge(2070, 355, 170),
      ledge(2420, 365, 190, "crumble"),
      ledge(2820, 355, 180),
      ledge(3120, 270, 180),
      ledge(3430, 345, 180),
      ledge(3810, 365, 180, "moving", 40),
      ledge(4200, 355, 170),
      ledge(4490, 270, 190),
      ledge(4780, 345, 180),
      ledge(5190, 360, 200, "moving", 45),
      ledge(5600, 365, 170),
      ledge(5880, 280, 180),
      ledge(6230, 355, 140),
      ledge(6960, 355, 160),
    ],
    enemies: [
      foe("shell", 870, 650, 1060),
      foe("archer", 1690, 1690, 1690),
      foe("hopper", 2220, 2010, 2330),
      foe("flyer", 2980, 2750, 3320, 330),
      foe("mortar", 3520, 3520, 3520, 345),
      foe("archer", 4520, 4520, 4520, 270),
      foe("hopper", 4820, 4650, 5100),
      foe("shell", 5690, 5500, 6060),
      foe("director", 6660, 6450, 6900),
    ],
    hazards: [
      pendulum(2030, 145, 235),
      spikes(3180, 90),
      pendulum(4330, 155, 215, 0.5),
      pendulum(4900, 140, 235, 2),
      spikes(6070, 90),
    ],
    pickups: [
      ...coins(300, 405, 4, "a"),
      ...coins(1050, 345, 8, "b", true),
      ...coins(1800, 225, 5, "c"),
      ...coins(2330, 340, 10, "d", true),
      ...coins(3140, 225, 4, "e"),
      ...coins(3710, 340, 10, "f", true),
      ...coins(4790, 300, 4, "g"),
      ...coins(5100, 335, 10, "h", true),
      star(840, 230, "star-0"),
      star(4580, 215, "star-1"),
      star(5970, 225, "star-2"),
      heart(2740, 405, "heart-0"),
      heart(5480, 405, "heart-1"),
      heart(6290, 310, "heart-2"),
    ],
    signs: [
      { x: 230, y: 410, text: "最后一次彩排\n你已经学会了所有动作" },
      { x: 6320, y: 410, text: "场务长有三点耐心\n礼花停下时，踩头打招呼！" },
    ],
    checkpoints: [2690, 6270],
    springs: [{ x: 5750, y: GROUND }],
  },
];
