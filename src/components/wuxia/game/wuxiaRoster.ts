import { TRAITS } from "../../autoChessGame/core/data/traits";
import { UNIT_DEFS } from "../../autoChessGame/core/data/units";
import type { TraitId, UnitId } from "../../autoChessGame/core/data/types";

export type WuxiaFactionId = "huanzhen" | "xingyou" | "sixi" | "free";

export interface WuxiaFactionSource {
  id: WuxiaFactionId;
  name: string;
  sourceLabel: string;
  creed: string;
  publicFace: string;
  homeLocationId: string;
}

export interface WuxiaRosterEntry {
  id: string;
  unitId: UnitId;
  name: string;
  sourceName: string;
  title: string;
  factionId: WuxiaFactionId;
  portrait: string;
  circles: string[];
  traits: string[];
  signatureMove: string;
  signatureDescription: string;
  temperament: string[];
  desires: string[];
  secrets: string[];
}

export const WUXIA_FACTIONS: Record<WuxiaFactionId, WuxiaFactionSource> = {
  huanzhen: {
    id: "huanzhen",
    name: "幻真楼",
    sourceLabel: "由 VirtuaReal 武侠化",
    creed: "万象皆可入戏，真心不可作伪。",
    publicFace: "横跨数地的大门派，门下分院众多，联络与旧识也最多。",
    homeLocationId: "tower_huanzhen",
  },
  xingyou: {
    id: "xingyou",
    name: "星游社",
    sourceLabel: "由 PSPLive 武侠化",
    creed: "江湖无定席，今夜有同游。",
    publicFace: "规模不大却来去自由的艺侠结社，常在南市与渡口出没。",
    homeLocationId: "court_xingyou",
  },
  sixi: {
    id: "sixi",
    name: "四禧庄",
    sourceLabel: "由四禧丸子关系组武侠化",
    creed: "四时同席，一诺成阵。",
    publicFace: "以合舞身法和联手阵势闻名的年轻山庄。",
    homeLocationId: "manor_sixi",
  },
  free: {
    id: "free",
    name: "散游盟",
    sourceLabel: "由项目内独立角色与关系羁绊组成",
    creed: "无门可归，便以相逢为盟。",
    publicFace: "没有总舵的松散江湖网络，医者、术士和游侠皆可能借宿其中。",
    homeLocationId: "city_luoyang",
  },
};

const ROSTER_META: Partial<Record<UnitId, {
  name: string;
  title: string;
  factionId: WuxiaFactionId;
  temperament: string[];
  signatureDescription: string;
}>> = {
  sun_guard: {
    name: "灰泽满",
title: "果冻风纪",
factionId: "huanzhen",
temperament: ["认真", "怕生", "遇险先找退路"],
    signatureDescription: "她缩肩沉息，衣袖骤然收成灰甲虫般的轮廓，贴地从刀光最疏处滑出；余劲如薄雾护住周身，伤口也随呼吸渐缓。",
  },
  ember_blade: {
    name: "莉蔻",
title: "兔耳密探",
factionId: "huanzhen",
temperament: ["胆小", "好奇", "瞄得不太准"],
    signatureDescription: "她拈出一把胡萝卜形袖箭，慌里带巧地连环掷出；暗器轨迹看似飘忽，偏又从意料之外的角度逼人挪步。",
  },
  rift_brawler: {
    name: "克罗雅",
title: "辣锅睡侠",
factionId: "huanzhen",
temperament: ["慵懒", "混沌", "受激才出手"],
    signatureDescription: "她抬脚踢翻随身辣锅，赤油沿地泼开；她先借灼意逼醒筋骨，再把贴身之敌一并卷进辛烈火风。",
  },
  spark_mage: {
    name: "瑞娅",
title: "北境术师",
factionId: "huanzhen",
temperament: ["冷静", "爱控场", "话题跳脱"],
    signatureDescription: "她以指尖划出一道寒白圆界，界内雨丝、衣袂与兵刃仿佛同时凝住，唯有她的目光仍在静默中丈量下一步。",
  },
  clock_gunner: {
    name: "弥月",
title: "机巧兔使",
factionId: "huanzhen",
temperament: ["老练", "护短", "精于机关"],
    signatureDescription: "她抬手放出一对兔耳状机巧飞炮，两道银影绕身疾旋，火星连缀如雨；待杀机散尽，机关又倏然归于肩后。",
  },
  grove_mender: {
    name: "七海",
title: "鲨门凿阵客",
factionId: "huanzhen",
temperament: ["贪吃", "豪爽", "敢冲敢扛"],
    signatureDescription: "她扛起短镐迎面凿入阵中，借冲势把众人目光全引到自己身上；每挨一击，镐尖便从意想不到的角度震回一记。",
  },
  cinder_ram: {
    name: "阿梓",
title: "蛙火歌者",
factionId: "huanzhen",
temperament: ["锋利", "念旧", "嘴硬心软"],
    signatureDescription: "她把尾音压成一道赤线，先抚平同伴紊乱的气息，旋即弹指送出火星；歌声未歇，焰影已在敌阵间接连绽开。",
  },
  cog_scribe: {
    name: "轴伊",
title: "橘术司仪",
factionId: "huanzhen",
temperament: ["热心", "健谈", "擅长救场"],
    signatureDescription: "她从袖中接连抛出几枚温热青橘，每一枚都循着最虚弱的气息而去；橘香散开时，疲惫的同伴也重新提起一口真气。",
  },
  shiori: {
    name: "栞栞",
title: "海獭游侠",
factionId: "huanzhen",
temperament: ["灵动", "讲义气", "说走就走"],
    signatureDescription: "她伏身疾掠，身形如海獭破浪般撞进远处阵脚；落地时掌风四散，震开来敌，也替自己留下回身的余地。",
  },
  sui: {
    name: "岁己",
title: "小红帽拳师",
factionId: "huanzhen",
temperament: ["好胜", "直率", "越战越勇"],
    signatureDescription: "她压低红帽骤然抢攻，拳影一重追着一重，呼吸越急，步子反而越稳；对手只要退了半步，后续攻势便如骤雨压来。",
  },
  yua: {
    name: "悠亚",
title: "天外光使",
factionId: "huanzhen",
temperament: ["天真", "贪吃", "来历神秘"],
    signatureDescription: "她双掌合拢，从掌隙牵出一线异色天光；光芒贴地贯穿人群，所过之处衣袂翻卷，连背后的影子都被照得无处可藏。",
  },
  mitsuri: {
    name: "三理",
title: "试管术士",
factionId: "huanzhen",
temperament: ["爱实验", "不按常理", "擅破阵"],
    signatureDescription: "她把一管气味古怪的药液掷向人群，药雾贴地散开；踏入其中的人心神骤乱，只顾掩鼻退避，再难守住原来的阵脚。",
  },
  rift_stalker: {
    name: "未知夜",
title: "冷笑夜客",
factionId: "huanzhen",
temperament: ["嘴贫", "机敏", "见势不妙就撤"],
    signatureDescription: "他屈指弹出一枚刻着笑脸的薄刃，先以一句冷话乱人心神；若杀机逼近，脚下早已借势滑开，只留余音在原地打转。",
  },
  komichi: {
    name: "四时小路",
title: "路牌破阵人",
factionId: "huanzhen",
temperament: ["都市怪谈", "会偷袭", "不走寻常路"],
    signatureDescription: "她横举旧路牌撞进阵隙，借冲力掀开沿途兵刃；回身又以牌面横扫一圈，招路古怪得像一则刚刚成真的街谈。",
  },
  nightin: {
    name: "南町",
title: "绿衣烟客",
factionId: "xingyou",
temperament: ["洒脱", "嘴硬", "善用慢招"],
    signatureDescription: "他指间三点暗红烟火次第飞出，看似缓慢，却专追人群最密之处；火头沾衣便沿气息暗燃，逼得对手自乱步法。",
  },
  tiandou: {
    name: "恬豆",
title: "糖阵舞者",
factionId: "sixi",
temperament: ["甜软", "细心", "习惯照顾同伴"],
    signatureDescription: "她旋身撒下一把晶亮糖珠，甜香在脚边铺成小阵；同伴拾得便气息轻快，敌手误踏却会脚下一滞。",
  },
  youyi: {
    name: "又一",
title: "叛逆舞侠",
factionId: "sixi",
temperament: ["叛逆", "果断", "最爱挑战强者"],
    signatureDescription: "她踏着旁人想不到的拍子跃过人群，落脚便是两记利落连踢；前一脚破势，后一脚截住退路，像把场面硬生生换到下一幕。",
  },
  mumu: {
    name: "沐霂",
title: "舞带救场人",
factionId: "sixi",
temperament: ["稳重", "善主持", "总能拉人一把"],
    signatureDescription: "她扬袖甩出长长舞带，越过混乱缠住最危急的同伴；只一收腕，便把人带回身后，顺势拂去缠身乱劲。",
  },
  lian: {
    name: "梨安",
title: "终场乐师",
factionId: "sixi",
temperament: ["克制", "重仪式", "擅在最后落子"],
    signatureDescription: "她等喧声走到最高处才抬手落拍，琴音与掌风同时坠入人群中央；先前所有蓄势都在这一刻合成沉重回响。",
  },
  yukisyo: {
    name: "雪烛",
title: "白虎卜者",
factionId: "free",
temperament: ["神秘", "谨慎", "相信兆象"],
    signatureDescription: "她以烛泪在地上点出八门方位，淡白虎影循线而行；同伴站入门中，迎来的劲力便像撞上层层无形屏障。",
  },
  rutice: {
    name: "露蒂丝",
title: "咕咕医者",
factionId: "free",
temperament: ["仁心", "手劲很大", "医法看运气"],
    signatureDescription: "她袖中银针分向数名伤者，针路忽轻忽重，或封穴止血，或震开贴身追兵；手法虽出人意料，救人的心却没有半分迟疑。",
  },
  rei: {
    name: "病院坂灵",
title: "幽魂术士",
factionId: "free",
temperament: ["安静", "念旧", "能与亡者对话"],
    signatureDescription: "她俯身在冷却的兵刃旁低声唤名，几缕幽火便从旧影中站起；亡者不再流血，只循最后一念替生者挡住去路。",
  },
  pako: {
    name: "帕可",
title: "天使鱼医",
factionId: "free",
temperament: ["温和", "爱摸鱼", "擅群体疗伤"],
    signatureDescription: "她把一尾纸折天使鱼抛向伤者之间，鱼影落地化成柔和水光；被水纹拂过的人，紊乱气血随之慢慢安定。",
  },
  nori: {
    name: "能能",
title: "苹果派射手",
factionId: "free",
temperament: ["活泼", "爱投喂", "出手很快"],
    signatureDescription: "她从食盒里抖出一串苹果派形飞镖，甜香未到，薄刃已接连封住前路；招式不重，却胜在又快又密。",
  },
};

const ROSTER_IDS = Object.keys(ROSTER_META) as UnitId[];

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index)) % 4294967291;
    hash = (hash * 16777619) % 4294967291;
  }
  return hash || 1;
};

const relationshipCircles = (traitIds: TraitId[]) => traitIds
  .filter((traitId) => TRAITS[traitId]?.family === "关系")
  .map((traitId) => TRAITS[traitId].name);

const desiresFor = (entry: { name: string; factionId: WuxiaFactionId; circles: string[]; signatureMove: string }) => [
  `寻到能真正接住“${entry.signatureMove}”的人`,
  `替${WUXIA_FACTIONS[entry.factionId].name}解决一场正在扩大的误会`,
  entry.circles.length ? `护住${entry.circles[0]}旧识，不让一段关系被江湖传闻拆散` : "找到一位值得托付后背的同行者",
  `查清最近是谁在各地冒用${entry.name}的名号出手`,
];

const secretsFor = (entry: { name: string; factionId: WuxiaFactionId; circles: string[]; signatureMove: string }) => [
  `“${entry.signatureMove}”有一处从未向同门公开的破绽。`,
  `曾替${WUXIA_FACTIONS[entry.factionId].name}的对手挡过一次追杀，这笔人情至今无人知晓。`,
  entry.circles.length ? `与${entry.circles[0]}中的一位旧识有一笔没有说清的借招之债。` : "随身带着一封从未送出的结盟帖。",
  `真正想离开的不是江湖，而是别人替${entry.name}写好的位置。`,
];

const rosterEntry = (unitId: UnitId): WuxiaRosterEntry => {
  const unit = UNIT_DEFS[unitId];
  const meta = ROSTER_META[unitId];
  if (!meta) throw new Error(`缺少武侠角色映射: ${unitId}`);
  const circles = relationshipCircles(unit.traits);
  const base = {
    id: `roster_${unitId}`,
    unitId,
    name: meta.name,
    sourceName: unit.title.split(" · ")[0] || unit.name,
    title: meta.title,
    factionId: meta.factionId,
    portrait: unit.portrait || "/images/autochess/portraits/sui.png",
    circles,
    traits: unit.traits.map((traitId) => TRAITS[traitId]?.name || traitId),
    signatureMove: unit.abilityName,
    signatureDescription: meta.signatureDescription,
    temperament: meta.temperament,
  };
  return { ...base, desires: desiresFor(base), secrets: secretsFor(base) };
};

export const WUXIA_ROSTER = ROSTER_IDS.map(rosterEntry);

export const wuxiaRosterForSeed = (seed: number, count = 8) => {
  const ranked = WUXIA_ROSTER
    .map((entry) => ({ entry, rank: hashText(`${seed}:${entry.id}:active`) }))
    .sort((left, right) => left.rank - right.rank);
  const guaranteed = (["huanzhen", "xingyou", "sixi", "free"] as WuxiaFactionId[])
    .map((factionId) => ranked.find(({ entry }) => entry.factionId === factionId)?.entry)
    .filter((entry): entry is WuxiaRosterEntry => Boolean(entry));
  const selectedIds = new Set(guaranteed.map((entry) => entry.id));
  const remainder = ranked.map(({ entry }) => entry).filter((entry) => !selectedIds.has(entry.id));
  return [...guaranteed, ...remainder].slice(0, Math.max(guaranteed.length, count));
};

export const seedPick = <T,>(items: readonly T[], seed: number, salt: string) => (
  items[hashText(`${seed}:${salt}`) % items.length]
);
