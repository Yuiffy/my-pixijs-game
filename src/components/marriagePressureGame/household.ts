import type { CandidateId, MarriageGameState } from "./types";

// Authored fictional character preferences stay consistent across runs.
const PROFILES = [
  { title: "小日子也认真过", spending: 5, income: 7, flexibility: 85, wish: "愿意缩减消费，更在意有人一起做饭、分担家务。" },
  { title: "想一起看看世界", spending: 13, income: 13, flexibility: 75, wish: "想攒钱出国旅行，也愿意自己出钱；遇到困难可以改期。" },
  { title: "习惯宽裕的生活", spending: 15, income: 9, flexibility: 25, wish: "希望保留旅行和品质消费，是否愿意降标准，要看感情与沟通。" },
  { title: "安全感需要存款", spending: 8, income: 8, flexibility: 60, wish: "愿意共担，但对透支很不安，希望先攒下应急钱。" },
];

const PROFILE_IDS: Record<CandidateId, number> = {
  sui: 0,
shiori: 0,
kloa: 1,
liko: 3,
izayoi: 3,
xuehui: 0,
hazel: 2,
nana7mi: 2,
azi: 2,
  rift_stalker: 1,
cog_scribe: 0,
mossback: 0,
spark_mage: 1,
clock_gunner: 3,
  dawn_duelist: 0,
yua: 1,
seki_boar_king: 0,
sumi: 0,
mitsuri: 3,
guangyi: 3,
  nagisa: 0,
tower_god: 0,
nori: 1,
meme: 3,
zeyin: 1,
kioi: 0,
nightin: 2,
  tiandou: 0,
youyi: 1,
akirinco: 3,
lovely: 1,
komichi: 0,
mumu: 0,
  yukisyo: 3,
rei: 0,
rutice: 0,
lian: 3,
pako: 0,
miki_guest: 1,
hatsuse_guest: 1,
};

export function getPartnerProfile(state: Pick<MarriageGameState, "seed" | "candidateId">) {
  if (state.candidateId === "komichi") return {
    title: "日子苦一点，也能一起过",
spending: 3,
income: 7,
flexibility: 95,
    wish: "能接受朴素甚至艰苦的生活，愿意一起省钱、分担难处；更在意彼此是否真心相待。",
  };
  return PROFILES[state.candidateId ? PROFILE_IDS[state.candidateId] : 0];
}

export function getCandidateProfile(seed: number, candidateId: CandidateId) {
  return getPartnerProfile({ seed, candidateId });
}

export function isHousehold(state: MarriageGameState) {
  return state.stage === "married" || state.stage === "parenthood";
}

export function willAgreeBudget(state: MarriageGameState) {
  return getPartnerProfile(state).flexibility + state.relation * 0.5 + state.mutualIntent * 0.3 >= 75;
}

export function getHouseholdBudget(state: MarriageGameState) {
  const partnered = isHousehold(state);
  const profile = getPartnerProfile(state);
  const income = 8 + Math.floor(state.career / 10);
  const partnerIncome = partnered ? profile.income : 0;
  const essentials = partnered ? 14 + (state.stage === "parenthood" ? 6 : 0) : 10;
  const extras = state.lifestyle === "lean" ? 2 : partnered ? profile.spending : 3;
  const repayment = Math.min(state.weddingDebt, 4);
  const net = income + partnerIncome - essentials - extras - repayment;
  return { income, partnerIncome, essentials, extras, repayment, net };
}

export function getLifeWarnings(state: MarriageGameState) {
  const warnings: string[] = [];
  if (state.savings <= 8 || state.moneyStrainTurns > 0) warnings.push(`钱有点紧 · 已连续 ${state.moneyStrainTurns} 回合入不敷出。先缩减开支、工作或向家里求助；连续 3 回合缺口且债务达到 45 才会进入困顿结局。`);
  if (state.stress >= 85 || state.burnoutTurns > 0) warnings.push(`需要喘口气 · 已连续 ${state.burnoutTurns} 回合压力 ≥95。休整或说清边界；连续 2 回合才会暂停这段生活。`);
  if (state.conflictTurns > 0) warnings.push(`伴侣正在疏远 · 连续 ${state.conflictTurns}/3 回合感情与意愿都低于 35。可以修复、谈预算，也可以选择分开。`);
  return warnings;
}
