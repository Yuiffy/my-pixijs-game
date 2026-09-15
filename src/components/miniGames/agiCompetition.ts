import { clamp, log, round } from "./core";
import { aiCompany, AiCompanyId } from "./agiIndustry";
import type { AiRival, AiState } from "./agiEngine";

export const AI_DIFFICULTIES = [
  { id: "relaxed", name: "悠闲研究", description: "对手每季 2 次行动，研发节奏较慢。适合熟悉经营与结局。", rivalCash: 100, rivalCompute: 2, rivalActions: 2, aggression: 0.15 },
  { id: "standard", name: "行业竞速", description: "对手每季 3 次行动，主动融资、抢发模型与蒸馏。需要兼顾速度和交付。", rivalCash: 135, rivalCompute: 3, rivalActions: 3, aggression: 0.55 },
  { id: "hard", name: "巨头围猎", description: "对手拥有更多启动资金与算力，积极追赶与质疑。尽早建立可持续的领先。", rivalCash: 155, rivalCompute: 4, rivalActions: 3, aggression: 0.85 },
] as const;
export type AiDifficulty = (typeof AI_DIFFICULTIES)[number]["id"];
export const aiDifficulty = (id: AiDifficulty) => AI_DIFFICULTIES.find(d => d.id === id)!;
export type AiCompetitionEntry = {
  id: string;
  turn: number;
  actor: AiCompanyId;
  target: AiCompanyId;
  kind: string;
  text: string;
  amount: number;
  effect: string;
  response: string;
  basis: string;
};
export type AiCompetition = { target: AiCompanyId; sequence: number; publishedOpen: boolean; openCapability: number; feed: AiCompetitionEntry[] };
export const initialCompetition = (company: AiCompanyId): AiCompetition => ({ target: company === "anthropic" ? "openai" : "anthropic", sequence: 0, publishedOpen: aiCompany(company).open, openCapability: 0, feed: [] });
export const rivalCompetitionDefaults = (difficulty: AiDifficulty, company: AiCompanyId) => ({
  cash: aiDifficulty(difficulty).rivalCash,
  compute: aiDifficulty(difficulty).rivalCompute,
  efficiency: 0,
  funding: 0,
  reputation: company === "openai" ? 24 : 20,
  lastIncome: 0,
  lastCosts: 0,
  lastActions: [] as string[],
  lastChallengeTurn: -3,
});
export function recordAiCompetition(s: AiState, entry: Omit<AiCompetitionEntry, "id" | "turn" | "response"> & { response?: string }) {
  s.competition.sequence++;
  const result: AiCompetitionEntry = { ...entry, id: `competition-${s.competition.sequence}`, turn: s.turn, response: entry.response || (entry.kind === "criticize" && entry.target === s.industry.company && entry.actor !== s.industry.company ? "pending" : "") };
  s.competition.feed = [result, ...s.competition.feed].slice(0, 160);
  if (["distill", "criticize", "response", "protect"].includes(entry.kind)) log(s, entry.text);
  return result;
}
function evidence(product: number, reliability: number, safety: number, hype = 0) {
  if (!product) return "";
  if (reliability < 65) return `已发布能力 ${product}，交付可靠性仅 ${reliability}（低于 65）`;
  if (safety < 40) return `已发布能力 ${product}，安全余量仅 ${safety}（低于 40）`;
  if (hype > reliability + 15) return `宣传预期 ${hype}，超过交付可靠性 ${reliability} + 15`;
  return "";
}
export function aiCriticismPreview(s: AiState) {
  const rival = s.rivals.find(r => r.company === s.competition.target);
  const basis = rival ? evidence(rival.product, rival.reliability, rival.safety) : "";
  return {
    target: s.competition.target,
    supported: !!basis,
    basis: basis || "当前没有交付或安全缺口的公开证据；开放许可下的蒸馏本身不构成违规。",
    effect: basis ? "对方信誉 −12、复核支出最多 8 M；己方信誉 +3。对方会优先整改。" : "无据指控反噬：己方信誉 −10、社区 −6；对方不受处罚。",
  };
}
export function setAiCompetitionTarget(state: AiState, target: AiCompanyId) {
  if (state.ending || state.competition.target === target || !state.rivals.some(r => r.company === target)) return state;
  return { ...state, competition: { ...state.competition, target } };
}
export function applyAiCriticism(s: AiState) {
  const preview = aiCriticismPreview(s);
  const r = s.rivals.find(rival => rival.company === preview.target)!;
  if (preview.supported) {
    r.reputation = clamp(r.reputation - 12);
    const expense = Math.min(8, r.cash);
    r.cash = round(r.cash - expense);
    s.reputation = clamp(s.reputation + 3);
    r.latest = `受到${aiCompany(s.industry.company).name}公开质疑，正在安排复核与整改`;
  } else {
    s.reputation = clamp(s.reputation - 10);
    s.community = clamp(s.community - 6);
  }
  recordAiCompetition(s, { actor: s.industry.company, target: r.company, kind: "criticize", amount: preview.supported ? 12 : -10, basis: preview.basis, effect: preview.effect, text: `${aiCompany(s.industry.company).name}发文质疑${r.name}：${preview.basis}；${preview.effect}` });
}
export const AI_CHALLENGE_RESPONSES = [
  { id: "audit", name: "公开评测", detail: "12 M · 信誉 +8、社区 +3；公开测评流程，原有技术缺口仍需修复。", cost: 12 },
  { id: "fix", name: "承认并整改", detail: "24 M · 占 1 次行动；可靠性 +10、安全 +6、信誉 +4。", cost: 24 },
  { id: "ignore", name: "不回应", detail: "免费 · 保留已经发生的影响，继续本季经营。", cost: 0 },
] as const;
export type AiChallengeResponse = (typeof AI_CHALLENGE_RESPONSES)[number]["id"];
export function aiChallengeBlocked(s: AiState, id: string, response: AiChallengeResponse) {
  if (s.ending) return "本局已结束";
  const entry = s.competition.feed.find(e => e.id === id);
  if (!entry || entry.kind !== "criticize" || entry.target !== s.industry.company || entry.actor === s.industry.company) return "这不是针对你的质疑";
  if (entry.response !== "pending") return "已经回应过这条质疑";
  const option = AI_CHALLENGE_RESPONSES.find(r => r.id === response);
  if (!option) return "未知回应方式";
  if (response === "fix" && !s.industry.eventResolved) return "先处理本季事件";
  if (response === "fix" && !s.actions) return "本季行动已用完，可公开评测或不回应";
  if (s.cash < option.cost) return "资金不足";
  return "";
}
export function respondAiChallenge(state: AiState, id: string, response: AiChallengeResponse): AiState {
  if (aiChallengeBlocked(state, id, response)) return state;
  const s = structuredClone(state);
  const entry = s.competition.feed.find(e => e.id === id)!;
  const option = AI_CHALLENGE_RESPONSES.find(r => r.id === response)!;
  s.cash -= option.cost;
  entry.response = response;
  if (response === "audit") { s.reputation = clamp(s.reputation + 8); s.community = clamp(s.community + 3); }
  if (response === "fix") { s.actions--; s.industry.reliability = clamp(s.industry.reliability + 10); s.safety = clamp(s.safety + 6); s.reputation = clamp(s.reputation + 4); }
  recordAiCompetition(s, { actor: s.industry.company, target: entry.actor, kind: "response", amount: option.cost, basis: entry.id, effect: option.detail, text: `回应${aiCompany(entry.actor).name}的质疑：${option.name}。${option.detail}` });
  return s;
}
export function rivalIncome(r: AiRival) {
  return round((r.product * 0.30 * (0.65 + r.reliability * 0.005) * (0.8 + r.reputation * 0.01) + r.video * 0.14 + r.ecosystem * 0.05 + r.efficiency * 1.5) * (aiCompany(r.company).open ? 0.82 : 1.15));
}
export const rivalUpkeep = (r: AiRival) => 4 + r.compute * 2 + 3 + r.defense;
export const aiTransferRate = (open: boolean, defense: number) => (open ? Math.max(0.25, 0.6 / (1 + defense * 0.5)) : defense >= 2 ? 0 : 0.6 / (1 + defense * 0.5));
export function advanceAiRival(s: AiState, r: AiRival, roll: number) {
  const company = aiCompany(r.company);
  const difficulty = aiDifficulty(s.difficulty);
  const competitive = s.difficulty !== "relaxed";
  r.lastActions = [];
  const used = new Set<string>();
  const emit = (kind: string, description: string, amount = 0, target = r.company, basis = "") => {
    const text = `${r.name}：${description}`;
    r.lastActions.push(text); r.latest = text;
    recordAiCompetition(s, { actor: r.company, target, kind, text, amount, effect: description, basis });
    used.add(kind);
  };
  const spend = (cost: number) => { r.cash = round(r.cash - cost); };
  const train = () => {
    const cost = Math.max(10, 25 - r.efficiency * 3);
    const gain = round(Math.min(100 - r.capability, 6 + r.compute * 2 + (company.lane === "research" ? 2 : 0)));
    spend(cost); r.capability = clamp(round(r.capability + gain)); r.safety = clamp(r.safety - 7); r.reliability = clamp(r.reliability - 4);
    emit("train", `投入 ${cost} M 预训练：能力 +${gain} → ${r.capability}、安全 −7、可靠性 −4`, gain);
  };
  for (let action = 0; action < difficulty.rivalActions; action++) {
    const cashBuffer = rivalUpkeep(r) + 12;
    if (r.capability >= 100 && r.compute >= 5 && r.reliability >= 70 && r.safety >= 40) {
      emit("agi", "完成自研能力、算力、可靠性与安全验证，启动 AGI", 100);
      if (!s.ending) s.ending = { title: `${r.name}率先抵达`, text: `${r.name}凭借已公开的研发与融资行动率先完成 AGI 验证。你的能力 ${s.capability}，其能力 ${r.capability}、算力 ${r.compute}、可靠性 ${r.reliability}、安全 ${r.safety}。尝试更早发布、蒸馏领先模型，并用公开质疑迫使对手整改。`, won: false };
      break;
    }
    const trainingCost = Math.max(10, 25 - r.efficiency * 3);
    const trainingGain = Math.min(100 - r.capability, 6 + r.compute * 2 + (company.lane === "research" ? 2 : 0));
    // Finish a viable AGI sprint before optional publicity or fundraising.
    if (competitive && r.capability < 100 && r.capability + trainingGain >= 100 && r.compute >= 5
      && r.reliability >= 74 && r.safety >= 47 && !used.has("train") && r.cash >= trainingCost) {
      train(); continue;
    }
    if (r.cash < cashBuffer + 20 && r.funding < 3 && !used.has("fund")) {
      r.cash += 48; r.funding++; emit("fund", `融资 +48 M（${r.funding}/3），用于维持研发与运营`, 48); continue;
    }
    const underReview = s.competition.feed.some(e => e.kind === "criticize" && e.actor === s.industry.company && e.target === r.company && e.amount > 0 && e.turn >= s.turn - 2);
    const needPost = r.reliability < (r.capability >= 85 ? 70 : underReview ? 65 : 57);
    const needSafety = r.safety < (r.capability >= 85 || underReview ? 40 : 26);
    if (needPost && !used.has("posttrain") && r.cash >= 15) {
      spend(15); const gain = company.id === "zai" ? 28 : 20; const before = r.capability; r.reliability = clamp(r.reliability + gain); r.capability = clamp(r.capability + 3);
      emit("posttrain", `投入 15 M 后训练：可靠性 +${gain}、能力 +${round(r.capability - before)}`, gain); continue;
    }
    if (needSafety && !used.has("safety") && r.cash >= 14) {
      spend(14); r.safety = clamp(r.safety + 18); r.reputation = clamp(r.reputation + 4);
      emit("safety", "投入 14 M 对齐研究：安全 +18、信誉 +4", 18); continue;
    }
    if (r.capability >= 25 && (r.product === 0 || r.capability - r.product >= (company.lane === "coding" ? 17 : 23)) && !used.has("release") && r.cash >= 8) {
      spend(8); r.product = r.capability;
      if (company.open) { r.ecosystem = clamp(r.ecosystem + 10); r.safety = clamp(r.safety + 6); } else r.reputation = clamp(r.reputation + 8);
      emit("release", `花费 8 M 发布能力 ${r.product} 的模型${company.open ? "，生态 +10、安全 +6；允许许可蒸馏" : "，信誉 +8；按防线审核训练许可"}`, r.product); continue;
    }
    const teachers = [
      { company: s.industry.company, name: aiCompany(s.industry.company).name, product: s.product, defense: s.industry.defense, open: s.competition.publishedOpen },
      { company: s.industry.company, name: `${aiCompany(s.industry.company).name}的历史开放版`, product: s.competition.openCapability, defense: s.industry.defense, open: true },
      ...s.rivals.filter(t => t.company !== r.company).map(t => ({ ...t, open: aiCompany(t.company).open })),
    ].map(t => ({ ...t, gain: round((t.product - r.capability) * aiTransferRate(t.open, t.defense)), cost: t.open ? 17 : 23 }))
      .filter(t => t.product > r.capability + 10 && (t.open || t.defense < 2) && (!competitive || (t.gain >= 8 && r.cash >= t.cost)));
    teachers.sort((a, b) => (competitive ? b.gain - a.gain || a.cost - b.cost : (b.product - r.capability) / (1 + b.defense) - (a.product - r.capability) / (1 + a.defense)));
    const teacher = teachers[0];
    const lastResearchAction = action === difficulty.rivalActions - 1 && !used.has("train") && r.cash >= trainingCost;
    if (teacher && !used.has("distill") && r.cash >= teacher.cost
      && (competitive ? !lastResearchAction || teacher.gain >= trainingGain : !used.has("train") && (teacher.product - r.capability >= 20 || company.lane === "ecosystem"))) {
      const distillCost = teacher.cost;
      spend(distillCost);
      const gain = Math.min(teacher.product - r.capability, round((teacher.product - r.capability) * aiTransferRate(teacher.open, teacher.defense)));
      r.capability = round(Math.min(teacher.product, r.capability + gain));
      if (!teacher.open) {
        if (teacher.company === s.industry.company) s.cash = round(s.cash + 6);
        else { const owner = s.rivals.find(t => t.company === teacher.company)!; owner.cash = round(owner.cash + 6); }
      }
      emit("distill", `支付 ${distillCost} M ${teacher.open ? "依开放许可蒸馏" : "购买训练许可并蒸馏"}${teacher.name}的已发布模型 ${teacher.product}：能力 +${gain} → ${r.capability}${teacher.defense ? `（防线 ${teacher.defense} 降低采样效率）` : ""}${teacher.open ? "" : "；老师获得 6 M 许可费"}`, gain, teacher.company, "licensed"); continue;
    }
    const basis = evidence(s.product, s.industry.reliability, s.safety, s.industry.hype);
    const alreadyChallenged = s.competition.feed.some(e => e.turn === s.turn && e.kind === "criticize" && e.target === s.industry.company);
    if (basis && s.turn >= 3 && !alreadyChallenged && s.turn - r.lastChallengeTurn >= 3 && !used.has("criticize") && action > 0 && roll < difficulty.aggression && r.cash >= 10) {
      spend(10); r.lastChallengeTurn = s.turn; r.reputation = clamp(r.reputation + 3);
      s.reputation = clamp(s.reputation - 8); s.community = clamp(s.community - 5);
      emit("criticize", `投入 10 M 发文质疑${aiCompany(s.industry.company).name}：${basis}。你信誉 −8、社区 −5；可选择公开评测、整改或不回应`, 8, s.industry.company, basis); continue;
    }
    if (r.compute < 5 && !used.has("compute") && r.cash >= (company.id === "google" ? 22 : 27) + cashBuffer
      && (r.capability >= 35 || s.difficulty === "hard")) {
      spend(company.id === "google" ? 22 : 27); r.compute++;
      emit("compute", `扩建算力至 ${r.compute}，支出 ${company.id === "google" ? 22 : 27} M；每季运营 +2 M`, 1); continue;
    }
    if (r.capability < 100 && !used.has("train") && (competitive || !used.has("distill")) && r.cash >= trainingCost) {
      train(); continue;
    }
    if (r.capability >= 30 && r.efficiency < 5 && !used.has("optimize") && r.cash >= 17) {
      spend(17); const gain = company.style === "efficient" ? 2 : 1; const before = r.capability; r.efficiency = Math.min(5, r.efficiency + gain); r.capability = clamp(r.capability + 4);
      emit("optimize", `投入 17 M 架构优化：效率提升至 ${r.efficiency}、能力 +${round(r.capability - before)}`, round(r.capability - before)); continue;
    }
    if (company.id === "anthropic" && r.defense < 4 && !used.has("protect") && r.cash >= 18 + cashBuffer) {
      spend(18); r.defense = Math.min(5, r.defense + 1); r.safety = clamp(r.safety + 5);
      emit("protect", `投入 18 M 加强准入：防线 ${r.defense}、安全 +5`, 1); continue;
    }
    if (company.lane === "creative" && r.video < 100 && !used.has("video") && r.cash >= 20 + cashBuffer) {
      spend(20); const gain = Math.min(100 - r.video, (company.id === "minimax" ? 28 : 18) + (s.industry.videoOpen ? 2 : 0)); r.video = clamp(r.video + gain);
      emit("video", `投入 20 M 视频研发：视频 +${gain}${s.industry.videoOpen ? "（含公开视频生态收益 +2）" : ""}`, gain); continue;
    }
    break;
  }
  r.lastIncome = rivalIncome(r); r.lastCosts = rivalUpkeep(r);
  r.cash = round(r.cash + r.lastIncome - r.lastCosts);
  if (r.cash < 0) {
    const oldCompute = r.compute; r.compute = Math.max(1, r.compute - 1); r.cash = 0;
    emit("restructure", `现金流不足，暂停研发并${oldCompute > r.compute ? `缩减算力 ${oldCompute} → ${r.compute}` : "维持最低算力 1"}`, r.compute - oldCompute);
  }
  recordAiCompetition(s, { actor: r.company, target: r.company, kind: "settlement", text: `${r.name}本季收入 ${r.lastIncome} M、运营 ${r.lastCosts} M，现金 ${r.cash} M`, amount: round(r.lastIncome - r.lastCosts), effect: `现金 ${r.cash} M`, basis: "" });
}
