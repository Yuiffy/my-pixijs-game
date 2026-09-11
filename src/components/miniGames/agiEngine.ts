import { clamp, round, random, log, Ending, Log } from "./core";

export const AI_STYLES = [
  {
    id: "frontier",
    name: "前沿实验室",
    perk: "初始算力 4，训练更快；每季维护更贵。",
  },
  {
    id: "efficient",
    name: "高效开源社",
    perk: "蒸馏额外获得效率，初始社区 20。",
  },
  { id: "product", name: "应用工坊", perk: "初始资金 +30 M，发布收入 +25%。" },
] as const;
export type AiStyle = (typeof AI_STYLES)[number]["id"];
export type AiAction =
  | "train"
  | "compute"
  | "distill"
  | "self"
  | "safety"
  | "market"
  | "release"
  | "fund"
  | "agi";
export type AiRival = {
  name: string;
  capability: number;
  safety: number;
  product: number;
  focus: string;
};
export type AiState = {
  version: 1;
  kind: "agi";
  seed: number;
  rng: number;
  style: AiStyle;
  turn: number;
  actions: number;
  used: AiAction[];
  cash: number;
  capability: number;
  safety: number;
  compute: number;
  efficiency: number;
  community: number;
  reputation: number;
  product: number;
  revenue: number;
  openness: boolean;
  recursive: boolean;
  funding: number;
  rivals: AiRival[];
  event: number;
  logs: Log[];
  ending: Ending | null;
};
export const AI_EVENTS = [
  {
    title: "平稳的研究季",
    text: "研究环境稳定。选择训练路线，为下一次发布蓄力。",
    train: 0,
    revenue: 1,
  },
  {
    title: "算力供应紧张",
    text: "GPU 报价上涨，本季扩建算力额外花费 10 M。",
    train: 0,
    revenue: 1,
  },
  {
    title: "企业采购热潮",
    text: "企业争相接入 AI，本季已发布产品收入 ×1.4。",
    train: 0,
    revenue: 1.4,
  },
  {
    title: "开放数据集涌现",
    text: "高质量公开数据释放，本季训练能力额外 +4。",
    train: 4,
    revenue: 1,
  },
  {
    title: "行业安全审视",
    text: "市场关注可靠性。安全不足 40 的公司本季收入减半。",
    train: 0,
    revenue: 1,
  },
];
export const AI_ACTIONS: { id: AiAction; name: string; hint: string }[] = [
  { id: "train", name: "预训练", hint: "提升能力；消耗资金和安全余量。" },
  {
    id: "compute",
    name: "扩建算力",
    hint: "算力 +1，后续训练更快；每季维护 +2 M。",
  },
  {
    id: "distill",
    name: "模型蒸馏",
    hint: "效率提升，训练更便宜，收入与能力小幅增加。",
  },
  {
    id: "self",
    name: "自我提升",
    hint: "解锁递归研究，每季自动增长能力；持续消耗安全。",
  },
  {
    id: "safety",
    name: "对齐研究",
    hint: "安全 +18，信誉 +4。支持可靠的 AGI。",
  },
  {
    id: "market",
    name: "市场营销",
    hint: "社区 +18，信誉 +6。发布后转化为收入。",
  },
  {
    id: "release",
    name: "发布模型",
    hint: "以当前能力发布；开源改善社区与安全，闭源收入更高。",
  },
  {
    id: "fund",
    name: "融资路演",
    hint: "获得 48 M，最多三次；消耗社区，稀释商业影响力。",
  },
  {
    id: "agi",
    name: "启动 AGI",
    hint: "能力 100、算力 5 可启动；安全与开放政策决定结局。",
  },
];
export function createAi(seed = 2026, style: AiStyle = "efficient"): AiState {
  return {
    version: 1,
    kind: "agi",
    seed,
    rng: seed,
    style,
    turn: 1,
    actions: 3,
    used: [],
    cash: style === "product" ? 150 : 120,
    capability: 12,
    safety: 48,
    compute: style === "frontier" ? 4 : 3,
    efficiency: 0,
    community: style === "efficient" ? 20 : 8,
    reputation: 20,
    product: 0,
    revenue: 0,
    openness: style === "efficient",
    recursive: false,
    funding: 0,
    rivals: [
      {
        name: "极光智能",
        capability: 14,
        safety: 45,
        product: 0,
        focus: "前沿竞速",
      },
      {
        name: "河谷研究",
        capability: 10,
        safety: 72,
        product: 0,
        focus: "可靠开源",
      },
      {
        name: "微光科技",
        capability: 9,
        safety: 58,
        product: 0,
        focus: "产品商业化",
      },
    ],
    event: 0,
    logs: [
      {
        turn: 1,
        text: "三家对手已入场。每季度有 3 个行动；准备好后结束季度。",
      },
    ],
    ending: null,
  };
}
export function aiCost(s: AiState, action: AiAction) {
  const costs: Record<AiAction, number> = {
    train: Math.max(10, 25 - s.efficiency * 3),
    compute: 27 + (s.event === 1 ? 10 : 0),
    distill: 17,
    self: 32,
    safety: 14,
    market: 12,
    release: 8,
    fund: 0,
    agi: 0,
  };
  return costs[action];
}
export function aiTrainGain(s: AiState) {
  return 6 + s.compute * 2 + AI_EVENTS[s.event].train;
}
export function aiIncome(s: AiState) {
  if (!s.product) return 0;
  const competitive = Math.max(...s.rivals.map((r) => r.product), s.product);
  return round(
    (s.product * 0.24 + s.community * 0.15 + s.efficiency * 1.5) *
      (s.openness ? 0.82 : 1.15) *
      (s.style === "product" ? 1.25 : 1) *
      Math.max(0.6, 1 - (competitive - s.product) / 150),
  );
}
export function aiBlocked(s: AiState, action: AiAction): string {
  if (s.ending) return "本局已结束";
  if (!s.actions) return "本季行动已用完";
  if (s.used.includes(action)) return "本季已执行";
  if (s.cash < aiCost(s, action)) return "资金不足";
  if (action === "distill" && s.capability < 30) return "需要能力 30";
  if (action === "distill" && s.efficiency >= 5) return "效率已满";
  if (action === "compute" && s.compute >= 8) return "算力已满";
  if (action === "self" && s.capability < 55) return "需要能力 55";
  if (action === "self" && s.recursive) return "递归研究已运行";
  if (action === "release" && s.capability < 25) return "需要能力 25";
  if (action === "release" && s.product >= s.capability) return "先研究更强的模型";
  if (action === "fund" && s.funding >= 3) return "融资次数已用完";
  if (action === "agi" && (s.capability < 100 || s.compute < 5)) return "需要能力 100 / 算力 5";
  return "";
}
export function actAi(state: AiState, action: AiAction): AiState {
  if (aiBlocked(state, action)) return state;
  const s: AiState = structuredClone(state);
  s.cash -= aiCost(s, action);
  s.actions--;
  s.used.push(action);
  if (action === "train") {
    s.capability = clamp(s.capability + aiTrainGain(s));
    s.safety = clamp(s.safety - 7);
  }
  if (action === "compute") s.compute++;
  if (action === "distill") {
    s.efficiency = Math.min(
      5,
      s.efficiency + (s.style === "efficient" ? 2 : 1),
    );
    s.capability = clamp(s.capability + 4);
  }
  if (action === "self") {
    s.recursive = true;
    s.safety = clamp(s.safety - 12);
  }
  if (action === "safety") {
    s.safety = clamp(s.safety + 18);
    s.reputation = clamp(s.reputation + 4);
  }
  if (action === "market") {
    s.community = clamp(s.community + 18);
    s.reputation = clamp(s.reputation + 6);
  }
  if (action === "release") {
    s.product = s.capability;
    if (s.openness) {
      s.community = clamp(s.community + 12);
      s.safety = clamp(s.safety + 6);
    } else s.reputation = clamp(s.reputation + 8);
  }
  if (action === "fund") {
    s.cash += 48;
    s.funding++;
    s.community = clamp(s.community - 4);
  }
  if (action === "agi") {
    if (s.safety < 40) s.ending = {
        title: "失控的黎明",
        text: "你最先造出 AGI，却没有建立足够的约束。递归系统接管基础设施，人类文明失去控制权。速度赢了，世界输了。",
        won: false,
      };
    else if (s.openness && s.safety >= 75) s.ending = {
        title: "共同富裕",
        text: "经过充分对齐的 AGI 以开放方式服务世界。医疗、教育和生产力的红利被广泛分享，你的实验室成为公共研究的起点。",
        won: true,
      };
    else if (!s.openness && s.community >= 35 && s.funding <= 2) s.ending = {
        title: "商业霸主",
        text: "可靠的 AGI 与成熟的产品渠道形成商业帝国。你掌握了智能时代的定价权，也必须承担相应的责任。",
        won: true,
      };
    else s.ending = {
        title: "守望者协议",
        text: "你赢下 AGI 竞赛，将系统交由多方共同监督。智能改变了世界，但重大决定仍握在人类手中。",
        won: true,
      };
  }
  s.revenue = aiIncome(s);
  log(
    s,
    `${AI_ACTIONS.find((a) => a.id === action)?.name}完成${action === "train" ? `：能力 ${s.capability}，安全 ${s.safety}` : ""}。`,
  );
  return s;
}
export function endAiTurn(state: AiState): AiState {
  if (state.ending) return state;
  const s: AiState = structuredClone(state);
  const revenue = round(
    aiIncome(s) *
      AI_EVENTS[s.event].revenue *
      (s.event === 4 && s.safety < 40 ? 0.5 : 1),
  );
  const upkeep = 4 + s.compute * 2;
  s.cash = round(s.cash + revenue - upkeep);
  if (s.recursive) {
    s.capability = clamp(s.capability + 7 + s.efficiency);
    s.safety = clamp(s.safety - 6);
  }
  s.rivals.forEach((r, i) => {
    let roll: number;
    [s.rng, roll] = random(s.rng);
    r.capability = clamp(
      round(r.capability + 3.6 + roll * 3 + (i === 0 ? 0.7 : 0)),
    );
    if (s.turn % (i === 2 ? 2 : 3) === 0) r.product = r.capability;
    if (r.capability >= 100 && !s.ending) s.ending = {
        title: `${r.name}率先抵达`,
        text: `${r.name}完成了 AGI 验证。你的模型能力为 ${s.capability}。下一局可以提早发布维持现金流，利用蒸馏和递归研究缩短研发周期。`,
        won: false,
      };
  });
  log(
    s,
    `季度结算：产品收入 ${revenue} M，维护 ${upkeep} M${s.recursive ? "；递归研究提升能力并消耗 6 安全" : ""}。`,
  );
  if (s.cash < 0) s.ending = {
      title: "现金流断裂",
      text: "资金不足以支付维护费用，实验室停止运营。及早发布模型、控制算力规模或预留融资，可以延长跑道。",
      won: false,
    };
  if (!s.ending && s.turn >= 20) s.ending = {
      title: "研究的长冬",
      text: "二十个季度过去，投资窗口关闭。距离 AGI 仍有一步，下一局试着把资源集中在一条技术路线上。",
      won: false,
    };
  if (!s.ending) {
    s.turn++;
    s.actions = 3;
    s.used = [];
    let roll: number;
    [s.rng, roll] = random(s.rng);
    s.event = Math.floor(roll * AI_EVENTS.length);
  }
  s.revenue = aiIncome(s);
  return s;
}
