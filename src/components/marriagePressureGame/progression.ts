import type { ChildActionId, MarriageGameState } from "./types";

export const RELATIONSHIP_RULES = {
  dating: { meetings: 2, relation: 42, intent: 48, chemistry: 45 },
  marriage: { relation: 45, intent: 52 },
  weddingPreparation: { relation: 58, intent: 52, savings: 26, maxStress: 75 },
  parenting: { relation: 50, intent: 60 },
  parentingPreparation: { relation: 66, intent: 60, savings: 32, maxStress: 65 },
} as const;

export function canConfirmDating(state: MarriageGameState) {
  const rule = RELATIONSHIP_RULES.dating;
  return state.meetings >= rule.meetings && state.relation >= rule.relation && state.mutualIntent >= rule.intent && state.chemistry >= rule.chemistry;
}

export function canMarry(state: MarriageGameState) {
  return state.stage === "dating" && state.relation >= RELATIONSHIP_RULES.marriage.relation && state.mutualIntent >= RELATIONSHIP_RULES.marriage.intent;
}

export function readyForMarriage(state: MarriageGameState) {
  const rule = RELATIONSHIP_RULES.weddingPreparation;
  return state.stage === "dating" && state.relation >= rule.relation && state.mutualIntent >= rule.intent && state.savings >= rule.savings && state.stress < rule.maxStress + 1;
}

export function canHaveChild(state: MarriageGameState) {
  return state.stage === "married" && state.childPlan !== "childfree" && state.relation >= RELATIONSHIP_RULES.parenting.relation && state.mutualIntent >= RELATIONSHIP_RULES.parenting.intent;
}

export function readyForChild(state: MarriageGameState) {
  const rule = RELATIONSHIP_RULES.parentingPreparation;
  return state.stage === "married" && state.childPlan !== "childfree" && state.relation >= rule.relation && state.mutualIntent >= rule.intent && state.savings >= rule.savings && state.stress < rule.maxStress + 1;
}

interface Requirement { label: string; value: number; target: number; met: boolean; remaining: number; lower?: boolean }
function requirement(label: string, value: number, target: number, lower = false): Requirement {
  return { label, value, target, met: lower ? value <= target : value >= target, remaining: Math.max(0, lower ? value - target : target - value), lower };
}

export function getProgressionGuide(state: MarriageGameState) {
  const { dating } = RELATIONSHIP_RULES;
  const { marriage } = RELATIONSHIP_RULES;
  let title = "确认交往";
  let advice = "先微信聊聊日常，再约见面；恋爱至少需要两次见面。";
  let explanation = "在一次见面结算时满足以下条件，且双方有恋爱感觉，就会自动确认交往。微信聊天能增加了解和感情，不能直接跳过见面。";
  let suggested: ChildActionId = "chat-listen";
  let unlocked = false;
  let requirements: Requirement[] = [
    requirement("实际见面", state.meetings, dating.meetings),
    requirement("伴侣感情", state.relation, dating.relation),
    requirement("对方继续意愿", state.mutualIntent, dating.intent),
  ];
  let preparation: Requirement[] = [];
  let preparationNote = "好感要看对方的真实回应；可见数值达标也不保证彼此有恋爱感觉。";

  if (state.meetings > 0) {
    suggested = "meet";
    advice = state.meetings < dating.meetings
      ? `还需至少见 ${dating.meetings - state.meetings} 次，再看双方是否愿意交往。`
      : requirements.every(item => item.met)
        ? "可见条件已满足，下次见面时确认双方的感觉。"
        : "继续分享日常或见面，看看感情与意愿能否靠近。";
  }
  if (state.matchClosed && (state.stage === "single" || state.stage === "chatting")) {
    title = "结束这次了解";
    advice = "对方已明确没有恋爱感觉，可以认识下一位。";
    explanation = "这次回应已经明确，无需继续提高数值。结束了解后，会从新的候选人开始。";
    requirements = [];
    preparationNote = "拒绝和被拒绝都是相亲的一部分，不代表这局失败。";
    suggested = "next";
  } else if (state.stage === "dating") {
    title = canMarry(state) ? "可以选择结婚了" : "从恋爱到结婚";
    unlocked = canMarry(state);
    advice = unlocked ? "去关系决定看看两种方案，也可以继续恋爱。" : `感情达到 ${marriage.relation}、对方意愿达到 ${marriage.intent}，就会出现结婚选项。`;
    explanation = "已经确认恋爱，以下两项同时满足时，“关系决定”会出现简单领证和办婚礼两种选择。结婚时机由当事人与对象决定。";
    requirements = [requirement("伴侣感情", state.relation, marriage.relation), requirement("对方继续意愿", state.mutualIntent, marriage.intent)];
    const rule = RELATIONSHIP_RULES.weddingPreparation;
    preparation = [requirement("伴侣感情", state.relation, rule.relation), requirement("对方意愿", state.mutualIntent, rule.intent), requirement("存款", state.savings, rule.savings), requirement("压力", state.stress, rule.maxStress, true)];
    preparationNote = "简单领证花费 6。办婚礼支出 26、分期 12；下方准备充分时，婚礼带来的额外压力更低。家庭累计支援不会重复计入预算。";
    suggested = unlocked ? "simple-wedding" : "chat-share";
  } else if (state.stage === "married" || state.stage === "parenthood") {
    title = "经营共同生活";
    advice = state.stage === "parenthood" ? "照顾彼此，也给孩子留出喘息的空间。" : "先把预算和分工谈稳；生育是可选决定。";
    suggested = state.nextGenStress >= 70 ? "protect-child" : "build-home";
    requirements = state.stage === "married" && state.childPlan !== "childfree" ? [requirement("伴侣感情", state.relation, RELATIONSHIP_RULES.parenting.relation), requirement("对方意愿", state.mutualIntent, RELATIONSHIP_RULES.parenting.intent)] : [];
    explanation = requirements.length ? "下列条件解锁育儿选择；可以暂缓或决定不生，不影响获得良好的共同生活结局。" : "按双方已经作出的决定继续生活。维持感情、照顾身心和收支，比继续推进阶段更重要。";
    const rule = RELATIONSHIP_RULES.parentingPreparation;
    preparation = requirements.length ? [requirement("伴侣感情", state.relation, rule.relation), requirement("对方意愿", state.mutualIntent, rule.intent), requirement("存款", state.savings, rule.savings), requirement("压力", state.stress, rule.maxStress, true)] : [];
    preparationNote = preparation.length ? "准备充分再进入育儿，压力和经济负担更可控。" : "遇到困难可以缩减开支、求助或休整，婚姻不靠继续升级维持。";
  }
  if (state.stress >= 85) { advice = "现在压力很高，先休整一下，再考虑下一步。"; suggested = "rest"; } else if (state.savings <= 8) { advice = "先稳住手头的钱，再安排见面或婚育。"; suggested = "work"; }
  if (state.activeActor === "parent") advice = state.stress >= 85
    ? "先减轻催促、听完担忧，让当事人有余力相处。"
    : unlocked ? "双方已能讨论结婚；你可以支持，把决定交给他们。"
      : state.stage === "married" || state.stage === "parenthood" ? "帮忙分担生活，尊重当事人的婚育选择。"
        : "先让双方了解；你可以倾听或支持，不替他们确认关系。";
  return { title, advice, explanation, requirements, preparation, preparationNote, suggested, unlocked };
}
