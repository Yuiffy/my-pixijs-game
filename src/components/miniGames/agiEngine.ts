import { clamp, round, random, log, Ending, Log } from "./core";
import {
  AI_COMPANIES,
  AI_INDUSTRY_EVENTS,
  aiCompany,
  industryEvent,
  initialIndustry,
  AiCompanyId,
  AiIndustry,
  AiService,
  AiDeltas,
} from "./agiIndustry";
import { advanceAiRival, aiTransferRate, applyAiCriticism, initialCompetition, recordAiCompetition, respondAiChallenge as respondAiChallengeState, rivalCompetitionDefaults, AiChallengeResponse, AiCompetition, AiDifficulty } from "./agiCompetition";

export { AI_DIFFICULTIES, AI_CHALLENGE_RESPONSES, aiCriticismPreview, setAiCompetitionTarget, aiChallengeBlocked } from "./agiCompetition";
export type { AiDifficulty } from "./agiCompetition";

export const AI_STYLES = [
  {
    id: "frontier",
    name: "前沿实验室",
    perk: "初始算力 4，训练更快；每季维护更贵。",
  },
  {
    id: "efficient",
    name: "高效开源社",
    perk: "架构优化额外获得效率，初始社区 20。",
  },
  { id: "product", name: "应用工坊", perk: "初始资金 +30 M，发布收入 +25%。" },
] as const;
export type AiStyle = (typeof AI_STYLES)[number]["id"];
export type AiAction =
  | "train"
  | "compute"
  | "distill"
  | "optimize"
  | "self"
  | "safety"
  | "market"
  | "release"
  | "fund"
  | "posttrain"
  | "video"
  | "openvideo"
  | "learn"
  | "special"
  | "criticize"
  | "protect"
  | "agi";
export type AiRival = {
  name: string;
  capability: number;
  safety: number;
  product: number;
  focus: string;
  company: AiCompanyId;
  reliability: number;
  video: number;
  ecosystem: number;
  defense: number;
  latest: string;
  cash: number;
  compute: number;
  efficiency: number;
  funding: number;
  reputation: number;
  lastIncome: number;
  lastCosts: number;
  lastActions: string[];
  lastChallengeTurn: number;
};
export type AiState = {
  version: 3;
  difficulty: AiDifficulty;
  competition: AiCompetition;
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
  industry: AiIndustry;
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
    hint: "选择已发布的更强同行模型，获得授权样本，追近约 60% 能力差距。",
  },
  {
    id: "optimize",
    name: "架构优化",
    hint: "压缩自己的模型，效率提升、能力 +4；降低训练费用，提高收入。",
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
    hint: "自研能力 100、算力 5、可靠性 70 可启动；安全与开放政策决定结局。",
  },
  {
    id: "posttrain",
    name: "后训练",
    hint: "可靠性 +20、能力 +3；让同一个基座更会完成任务。",
  },
  { id: "video", name: "视频研发", hint: "视频能力 +18，形成独立的创意收入。" },
  {
    id: "openvideo",
    name: "开放视频权重",
    hint: "需要视频 30；生态 +20，并降低竞品的追赶门槛。",
  },
  {
    id: "learn",
    name: "学习授权样本",
    hint: "消耗 8 份授权样本，能力 +6、可靠性 +10。",
  },
  { id: "special", name: "厂商专长", hint: "执行当前厂商的独有经营行动。" },
  { id: "criticize", name: "点名质疑", hint: "基于交付或安全缺口公开批评；迫使对手支出复核，无据指控会反噬。" },
  { id: "protect", name: "反蒸馏防线", hint: "防线 +2、社区 −3；维护每级 +1 M。闭源 2 级封闭训练许可，开放权重仍可被学习。" },
];
export function createAi(
  seed = 2026,
  style: AiStyle = "efficient",
  company?: AiCompanyId,
  difficulty: AiDifficulty = "standard",
): AiState {
  const selected =
    company ||
    (style === "efficient"
      ? "deepseek"
      : style === "frontier"
        ? "anthropic"
        : "openai");
  return {
    version: 3,
    difficulty,
    competition: initialCompetition(selected),
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
    openness: aiCompany(selected).open,
    recursive: false,
    funding: 0,
    rivals: AI_COMPANIES.filter((c) => c.id !== selected).map((c, i) => ({
      ...rivalCompetitionDefaults(difficulty, c.id),
      name: c.name,
      company: c.id,
      capability: 10 + (i % 3) * 2,
      safety: c.id === "anthropic" ? 72 : 48,
      product: 0,
      focus: c.playstyle,
      reliability: 65,
      video: c.lane === "creative" ? 15 : 0,
      ecosystem: c.open ? 12 : 0,
      defense: c.id === "anthropic" ? 2 : 0,
      latest: c.slogan,
    })),
    event: 0,
    logs: [
      {
        turn: 1,
        text: "十家风格各异的对手入场。每季处理行业事件，再分配 3 个行动；能力与可靠性都要过关。",
      },
    ],
    ending: null,
    industry: initialIndustry(selected),
  };
}
export function aiCost(s: AiState, action: AiAction) {
  const distillTeacher = aiDistillTarget(s);
  const costs: Record<AiAction, number> = {
    train: Math.max(10, 25 - s.efficiency * 3),
    compute:
      27 + (s.event === 1 ? 10 : 0) - (s.industry.company === "google" ? 5 : 0),
    distill: 17 + (distillTeacher && !aiCompany(distillTeacher.company).open ? 6 : 0),
    optimize: 17,
    self: 32 - (s.industry.company === "kimi" ? 6 : 0),
    safety: 14,
    market: 12,
    release: 8,
    fund: 0,
    criticize: 10,
    protect: 18,
    agi: 0,
    posttrain: 15,
    video: 20,
    openvideo: 12,
    learn: 10,
    special: {
      deepseek: 8,
      anthropic: 18,
      openai: 16,
      xai: 12,
      zai: 10,
      minimax: 20,
      google: 18,
      qwen: 14,
      kimi: 17,
      meta: 15,
      router: 12,
    }[s.industry.company],
  };
  return costs[action];
}
export function aiTrainGain(s: AiState) {
  return (
    6 +
    s.compute * 2 +
    AI_EVENTS[s.event].train +
    (s.industry.service === "research"
      ? 2
      : s.industry.service === "consumer"
        ? -2
        : 0) +
    (s.industry.company === "deepseek" && s.industry.service === "research"
      ? 2
      : 0)
  );
}
export function aiEffectiveProduct(s: AiState) {
  const teacher = s.rivals.find((r) => r.company === s.industry.teacher);
  return Math.max(s.product, s.industry.route && teacher && teacher.defense < 4 ? teacher.product : 0);
}
export function aiDistillTarget(s: AiState): AiRival | undefined {
  return s.rivals.find((r) => r.company === s.industry.distillTeacher);
}
function aiDistillBlock(s: AiState): string {
  const teacher = aiDistillTarget(s);
  if (!teacher) return "请选择其他厂商的模型作为蒸馏目标";
  if (!teacher.product) return "目标尚未发布模型，请选择已发布的同行模型";
  if (!aiCompany(teacher.company).open && teacher.defense >= 4) return "目标防线已关闭调用，无法获取蒸馏样本";
  if (!aiCompany(teacher.company).open && teacher.defense >= 2) return "目标仅允许调用，不授予蒸馏训练许可";
  if (teacher.product <= s.capability) return `目标已发布能力 ${teacher.product}，未领先自研能力 ${s.capability}`;
  return "";
}
export function aiDistillGain(s: AiState): number {
  if (aiDistillBlock(s)) return 0;
  const gap = aiDistillTarget(s)!.product - s.capability;
  const teacher = aiDistillTarget(s)!;
  return Math.min(gap, round(gap * aiTransferRate(aiCompany(teacher.company).open, teacher.defense)));
}
export function setAiDistillTarget(state: AiState, target: AiCompanyId): AiState {
  if (
    state.ending || target === state.industry.distillTeacher ||
    target === state.industry.company ||
    !state.rivals.some((r) => r.company === target)
  ) return state;
  return {
    ...state,
    industry: { ...state.industry, distillTeacher: target },
  };
}
export const aiValuation = (s: AiState) => round(80 + s.capability * 2 + s.industry.hype * 3 + s.reputation + aiIncome(s) * 8);
export function respondAiChallenge(state: AiState, id: string, response: AiChallengeResponse): AiState {
  const s = respondAiChallengeState(state, id, response);
  if (s !== state) s.revenue = aiIncome(s);
  return s;
}
export function aiIncome(s: AiState) {
  const product = aiEffectiveProduct(s);
  if (!product && !s.industry.video) return 0;
  const competitive = Math.max(...s.rivals.map((r) => r.product), s.product);
  const { service } = s.industry;
  const { company } = s.industry;
  const textRevenue = product
    ? (product * 0.24 + s.community * 0.15 + s.efficiency * 1.5) *
      (s.openness ? 0.82 : 1.15) *
      (s.style === "product" ? 1.25 : 1) *
      Math.max(0.6, 1 - (competitive - product) / 150)
    : 0;
  const quality = 0.65 + s.industry.reliability * 0.005;
  const positioning =
    service === "consumer" ? 1.2 : service === "research" ? 0.8 : 1;
  const bonus =
    company === "anthropic" && service !== "consumer"
      ? 1.2
      : company === "openai" && service !== "research"
        ? 1.15
        : 1;
  const videoRevenue =
    s.industry.video *
    0.14 *
    (company === "minimax" ? 1.3 : company === "xai" ? 1.2 : 1);
  return round(
    (textRevenue * quality * positioning * bonus +
      videoRevenue +
      s.industry.ecosystem * (company === "qwen" ? 0.08 : 0.03)) *
      (s.industry.promotion ? 1.2 : 1),
  );
}
export const aiUpkeep = (s: AiState) => 4 +
  s.compute * 2 +
  (s.industry.service === "research"
    ? 2
    : s.industry.service === "consumer"
      ? 6
      : 3) +
  (s.industry.route
    ? (s.industry.company === "router" ? 4 : 8) +
      (s.industry.licensedData ? 4 : 0)
    : 0) +
  (s.industry.scrutiny > 0 ? 6 : 0) + s.industry.defense;
export function aiBlocked(s: AiState, action: AiAction): string {
  if (s.ending) return "本局已结束";
  if (!AI_ACTIONS.some((a) => a.id === action)) return "未知经营行动";
  if (!s.actions) return "本季行动已用完";
  if (s.used.includes(action)) return "本季已执行";
  if (action === "distill" && aiDistillBlock(s)) return aiDistillBlock(s);
  if (s.cash < aiCost(s, action)) return "资金不足";
  if (action === "optimize" && s.capability < 30) return "需要能力 30";
  if (action === "optimize" && s.efficiency >= 5) return "效率已满";
  if (action === "compute" && s.compute >= 8) return "算力已满";
  if (action === "protect" && s.industry.defense >= 5) return "防线已满";
  if (action === "criticize" && !s.rivals.some(r => r.company === s.competition.target)) return "请选择质疑对象";
  if (action === "self" && s.capability < 55) return "需要能力 55";
  if (action === "self" && s.recursive) return "递归研究已运行";
  if (action === "release" && s.capability < 25) return "需要能力 25";
  if (action === "release" && s.product >= s.capability) return "先研究更强的模型";
  if (action === "fund" && s.funding >= 3) return "融资次数已用完";
  if (action === "agi" && (s.capability < 100 || s.compute < 5)) return "需要能力 100 / 算力 5";
  if (action === "agi" && s.industry.reliability < 70) return "需要可靠性 70（后训练）";
  if (action === "video" && s.industry.video >= 100) return "视频能力已满";
  if (action === "openvideo" && s.industry.video < 30) return "需要视频能力 30";
  if (action === "openvideo" && s.industry.videoOpen) return "视频权重已开放";
  if (action === "learn" && s.industry.samples < 8) return "需要 8 份授权样本";
  if (
    action === "posttrain" &&
    s.industry.reliability >= 100 &&
    s.capability >= 100
  ) return "后训练已达上限";
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
    s.industry.reliability = clamp(s.industry.reliability - 4);
  }
  if (action === "compute") s.compute++;
  if (action === "distill") {
    const teacher = aiDistillTarget(s)!;
    const gain = aiDistillGain(s);
    s.capability = Math.min(teacher.product, clamp(round(s.capability + gain)));
    if (!aiCompany(teacher.company).open) teacher.cash = round(teacher.cash + 6);
    recordAiCompetition(s, { actor: s.industry.company, target: teacher.company, kind: "distill", amount: gain, basis: "licensed", effect: `自研能力 +${gain}；${aiCompany(teacher.company).open ? "开放许可" : "老师获得 6 M 许可费"}`, text: `${aiCompany(s.industry.company).name}依许可蒸馏${teacher.name}的已发布模型 ${teacher.product}，能力 +${gain}。` });
    log(s, `蒸馏 ${teacher.name} 的已发布模型（能力 ${teacher.product}）：自研能力 +${round(gain)} → ${s.capability}；需再次发布才能升级自家产品。`);
  }
  if (action === "optimize") {
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
    s.competition.publishedOpen = s.openness;
    if (s.openness) s.competition.openCapability = Math.max(s.competition.openCapability, s.product);
    if (s.openness) {
      s.community = clamp(s.community + 12);
      s.safety = clamp(s.safety + 6);
    } else s.reputation = clamp(s.reputation + 8);
    if (s.openness) s.industry.ecosystem = clamp(
        s.industry.ecosystem +
          5 +
          (s.industry.company === "qwen"
            ? 6
            : s.industry.company === "meta"
              ? 10
              : 0),
      );
    if (s.industry.reliability < 50) log(s, "预览版进入市场：低可靠性会影响留存，继续后训练可以修复口碑。");
  }
  if (action === "fund") {
    s.cash += 48 + Math.floor(s.industry.hype / 10);
    s.funding++;
    s.community = clamp(s.community - 4);
  }
  if (action === "posttrain") {
    s.industry.reliability = clamp(
      s.industry.reliability + 20 + (s.industry.company === "zai" ? 8 : 0),
    );
    s.capability = clamp(
      s.capability + 3 + (s.industry.company === "zai" ? 2 : 0),
    );
    s.industry.hype = clamp(s.industry.hype - 6);
  }
  if (action === "video") {
    s.industry.video = clamp(
      s.industry.video + (s.industry.company === "minimax" ? 28 : 18),
    );
    if (s.industry.company === "google") s.capability = clamp(s.capability + 2);
  }
  if (action === "openvideo") {
    s.industry.videoOpen = true;
    s.industry.ecosystem = clamp(s.industry.ecosystem + 20);
    s.community = clamp(s.community + 8);
  }
  if (action === "learn") {
    s.industry.samples -= 8;
    s.capability = clamp(s.capability + 6);
    s.industry.reliability = clamp(s.industry.reliability + 10);
  }
  if (action === "special") applySpecialty(s);
  if (action === "criticize") applyAiCriticism(s);
  if (action === "protect") {
    s.industry.defense = Math.min(5, s.industry.defense + 2);
    s.community = clamp(s.community - 3);
    recordAiCompetition(s, { actor: s.industry.company, target: s.industry.company, kind: "protect", amount: 2, basis: "", effect: "防线 +2、社区 −3，维护每级 +1 M", text: `投入 18 M 部署反蒸馏防线至 ${s.industry.defense}：${s.competition.publishedOpen ? "已开放权重无法收回，但额外采样受到限制" : "闭源模型不再授予新训练许可"}。` });
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
    `${action === "special" ? aiCompany(s.industry.company).specialty : AI_ACTIONS.find((a) => a.id === action)?.name}完成${action === "train" ? `：能力 ${s.capability}，安全 ${s.safety}` : ""}。`,
  );
  return s;
}
export function endAiTurn(state: AiState): AiState {
  if (state.ending) return state;
  if (!state.industry.eventResolved) return state;
  const s: AiState = structuredClone(state);
  for (const entry of s.competition.feed) {
    if (entry.response === "pending" && entry.turn < s.turn) entry.response = "expired";
  }
  const revenue = round(
    aiIncome(s) *
      AI_EVENTS[s.event].revenue *
      (s.event === 4 && s.safety < 40 ? 0.5 : 1),
  );
  const upkeep = aiUpkeep(s);
  s.industry.lastIncome = revenue;
  s.industry.lastCosts = upkeep;
  s.cash = round(s.cash + revenue - upkeep);
  if (s.recursive) {
    s.capability = clamp(
      s.capability + 7 + s.efficiency + (s.industry.company === "kimi" ? 2 : 0),
    );
    s.safety = clamp(s.safety - 6);
  }
  settleIndustry(s);
  s.rivals.forEach((r) => {
    let roll: number;
    [s.rng, roll] = random(s.rng);
    advanceAiRival(s, r, roll);
  });
  log(
    s,
    `季度结算：产品收入 ${revenue} M，运营 ${upkeep} M${s.recursive ? "；递归研究提升能力并消耗 6 安全" : ""}。`,
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
    chooseNextIndustryEvent(s);
  }
  s.revenue = aiIncome(s);
  return s;
}

function applyDeltas(s: AiState, deltas: AiDeltas) {
  for (const [key, value] of Object.entries(deltas)) {
    if (
      ["cash", "capability", "safety", "community", "reputation"].includes(key)
    ) {
      const field = key as
        | "cash"
        | "capability"
        | "safety"
        | "community"
        | "reputation";
      s[field] =
        field === "cash" ? round(s[field] + value) : clamp(s[field] + value);
    } else {
      const field = key as
        | "reliability"
        | "video"
        | "ecosystem"
        | "hype"
        | "samples"
        | "defense";
      s.industry[field] = clamp(
        s.industry[field] + value,
        0,
        field === "defense" ? 5 : 100,
      );
    }
  }
}
export function decideAiEvent(state: AiState, choiceId: string): AiState {
  if (state.ending || state.industry.eventResolved) return state;
  const event = industryEvent(state.industry.eventId);
  const choice = choiceId === 'defer' ? { id: 'defer', title: '暂缓回应', detail: '本季不额外投入', deltas: {} as AiDeltas } : event?.choices.find((c) => c.id === choiceId);
  if (!choice || state.cash + (choice.deltas.cash || 0) < 0) return state;
  const s: AiState = structuredClone(state);
  applyDeltas(s, choice.deltas);
  s.industry.eventResolved = true;
  s.industry.eventChoice = choice.title;
  s.industry.seenEvents = [...s.industry.seenEvents, event.id].slice(-24);
  s.industry.statement = choice.title;
  log(s, `行业事件「${event.title}」：${choice.title}；${choice.detail}。`);
  s.revenue = aiIncome(s);
  return s;
}
function chooseNextIndustryEvent(s: AiState) {
  const own = AI_INDUSTRY_EVENTS.filter(
    (e) => e.company === s.industry.company && !s.industry.seenEvents.includes(e.id),
  );
  const recent = s.industry.seenEvents.slice(-6);
  const candidates = own.length
    ? own
    : AI_INDUSTRY_EVENTS.filter((e) => !recent.includes(e.id));
  let roll: number;
  [s.rng, roll] = random(s.rng);
  s.industry.eventId = candidates[Math.floor(roll * candidates.length)].id;
  s.industry.eventResolved = false;
  s.industry.eventChoice = "";
}
export function aiTeacherBlock(s: AiState, samples = false) {
  const teacher = s.rivals.find((r) => r.company === s.industry.teacher);
  if (!teacher || !teacher.product) return "上游尚未发布产品";
  if (teacher.defense >= 4) return "上游严格准入，本季合作入口关闭";
  if (samples && !aiCompany(teacher.company).open && teacher.defense >= 2) return "上游只允许调用，不授予样本训练许可";
  return "";
}
export function setAiOperating(
  state: AiState,
  patch: Partial<
    Pick<AiIndustry, "service" | "teacher" | "route" | "licensedData">
  >,
): AiState {
  if (state.ending) return state;
  const s: AiState = structuredClone(state);
  if (
    !s.used.length && patch.service &&
    ["research", "balanced", "consumer"].includes(patch.service)
  ) s.industry.service = patch.service as AiService;
  if (patch.teacher && s.rivals.some((r) => r.company === patch.teacher)) {
    s.industry.teacher = patch.teacher;
    s.industry.route = false;
    s.industry.licensedData = false;
  }
  if (typeof patch.route === "boolean") s.industry.route = patch.route && !aiTeacherBlock(s);
  if (typeof patch.licensedData === "boolean") s.industry.licensedData =
      patch.licensedData && s.industry.route && !aiTeacherBlock(s, true);
  if (!s.industry.route) s.industry.licensedData = false;
  s.revenue = aiIncome(s);
  return s;
}
function applySpecialty(s: AiState) {
  const d: Record<AiCompanyId, AiDeltas> = {
    deepseek: { community: 12, reliability: 8 },
    anthropic: { defense: 2, safety: 10, community: -5 },
    openai: { community: 22, reputation: 5 },
    xai: { community: 24, safety: -8 },
    zai: { hype: 25, community: 10 },
    minimax: { video: 30, reliability: 6 },
    google: { capability: 5, reliability: 10, video: 10 },
    qwen: { ecosystem: 18, community: 8 },
    kimi: { capability: 6, reliability: 12 },
    meta: { ecosystem: 22, community: 8 },
    router: { reliability: 8, community: 6 },
  };
  applyDeltas(s, d[s.industry.company]);
  if (s.industry.company === "openai") s.industry.promotion = true;
  if (s.industry.company === "xai") s.industry.scrutiny = 2;
  if (["qwen", "router"].includes(s.industry.company)) s.efficiency = Math.min(5, s.efficiency + 1);
  s.industry.statement = aiCompany(s.industry.company).specialty;
}
function settleIndustry(s: AiState) {
  const i = s.industry;
  if (i.route) {
    const block = aiTeacherBlock(s);
    if (block) {
      i.route = false;
      i.licensedData = false;
      log(s, `合作暂停：${block}。`);
    } else if (i.licensedData && !aiTeacherBlock(s, true)) {
      i.samples = clamp(i.samples + 8);
      log(s, "合作产生 8 份授权任务样本；后训练学习后才计入自研能力。");
    } else if (i.licensedData) {
      i.licensedData = false;
      log(s, "上游不再提供训练许可，本季没有新增样本。");
    }
  }
  if (s.product && i.service !== "research") s.community = clamp(s.community + (i.service === "consumer" ? 4 : 1));
  if (s.product && i.reliability < 50) {
    const lost = 6 + Math.floor(i.hype / 10);
    s.community = clamp(s.community - lost);
    s.reputation = clamp(s.reputation - 4);
    log(s, `交付不稳引发退订：社区 −${lost}、信誉 −4；后训练可提高可靠性。`);
  }
  if (i.hype > i.reliability + 15) {
    s.cash = round(s.cash - 8);
    i.hype = clamp(i.hype - 12);
    s.reputation = clamp(s.reputation - 6);
    log(s, "市场预期反噬：宣传超过交付能力，退款支出 8 M、信誉 −6。");
  }
  i.promotion = false;
  i.scrutiny = Math.max(0, i.scrutiny - 1);
}
