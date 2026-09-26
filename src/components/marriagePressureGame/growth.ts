import type { ChildActionId, MarriageGameState } from "./types";

export const GROWTH_DEFAULTS = {
  fitness: 40,
  grooming: 40,
  interests: 40,
  relationshipBalance: 65,
  growthNote: "先给自己的生活留一点时间。成长会保留，换对象也不会清零。",
};

export const GROWTH_COSTS = { exercise: 0, groom: 2, hobby: 1, study: 4 } as const;
export type GrowthAction = keyof typeof GROWTH_COSTS;
export const isGrowthAction = (id: ChildActionId): id is GrowthAction => Object.prototype.hasOwnProperty.call(GROWTH_COSTS, id);

// Authored game balance, not an empirical formula for desirability.
export function getAttractionBonus(state: MarriageGameState) {
  return Math.min(10, Math.floor(
    Math.max(0, state.fitness - 40) / 20 +
    Math.max(0, state.grooming - 40) / 15 +
    Math.max(0, state.interests - 40) / 20 +
    Math.max(0, state.career - 58) / 20,
  ));
}

export function hasMutualAttraction(state: MarriageGameState) {
  return !state.matchClosed && (["dating", "married", "parenthood"].includes(state.stage) || state.chemistry + getAttractionBonus(state) >= 45);
}

export function getGrowthAdvice(state: MarriageGameState) {
  if (state.stress >= 85) return "已经很累了，先休整；成长不用靠透支。";
  if (state.relationshipBalance < 40) return "付出开始失衡。先谈时间、预算和分工，再决定是否继续。";
  if (state.fitness < 60) return `体能 ${state.fitness}/60 · 规律运动达标后，每季额外减压 2。`;
  if (state.interests < 60) return `生活内容 ${state.interests}/60 · 发展爱好达标后，分享日常更自然。`;
  return "运动、仪容、爱好与技能各有作用。留时间相处，也保留自己的生活。";
}

export function getBalanceLabel(state: MarriageGameState) {
  return state.relationshipBalance < 35 ? "长期单方面承担" : state.relationshipBalance < 55 ? "需要重新分工" : "双方都有空间";
}

export function getRelationshipSituation(state: MarriageGameState) {
  if (state.relationshipBalance < 35 && state.relation < 35 && state.mutualIntent < 35) return {
    title: "分歧变成了贬低",
    detail: "争执中出现了“这点事都做不好”的话。继续兜底只能暂时停下争执；可以指出不尊重，也可以离开。",
  };
  if (state.turn % 2 === 0) return {
    title: "临时安排撞上自己的计划",
    detail: "对方想让你取消原定的运动、见朋友或学习，再由你安排这次见面。谈谈能否轮流协调。",
  };
  return {
    title: "约会预算越加越多",
    detail: "原本说好的普通周末，又加了礼物和额外消费。你可以先全包，也可以把各自能承担的范围说清。",
  };
}

export function applyGrowthAction(state: MarriageGameState, id: GrowthAction) {
  state.savings -= GROWTH_COSTS[id];
  state.autonomy += 4;
  if (id === "exercise") {
    state.fitness = Math.min(100, state.fitness + (state.fitness < 70 ? 10 : 5));
    state.stress -= 8;
    state.growthNote = "这一季每周留出散步或力量训练的时间，睡眠和精神慢慢稳下来。体能达到 60 后，每季额外减压 2。";
  } else if (id === "groom") {
    state.grooming = Math.min(100, state.grooming + (state.grooming < 70 ? 24 : 10));
    state.stress -= 4;
    state.growthNote = "剪了合适的发型，整理衣物与日常仪容。整洁让初见更从容；额外的打理状态每季回落 6，最低回到 40。";
  } else if (id === "hobby") {
    state.interests = Math.min(100, state.interests + (state.interests < 70 ? 12 : 6));
    state.stress -= 10;
    state.growthNote = "重新捡起喜欢的事，也和朋友见了面。生活内容达到 60 后，分享日常更自然；这些经历不随关系结束消失。";
  } else {
    state.career += state.career < 70 ? 12 : 6;
    state.stress += 3;
    state.growthNote = "拿出固定时间补技能、做作品并争取工作机会。事业提高会改善每季收入，但这次学习需要预算和精力。";
  }
}
