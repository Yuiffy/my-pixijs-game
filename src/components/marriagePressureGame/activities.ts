import { getCandidateInterests } from "./interests";
import type { ActivityId, MarriageGameState } from "./types";

// 场馆决定沉浸版使用哪个 3D 场景
export type VenueId =
  | "restaurant"
  | "hotpot"
  | "western"
  | "cafe"
  | "riverside"
  | "museum"
  | "mall"
  | "boardgame"
  | "cinema"
  | "nightmarket"
  | "catcafe"
  | "mountain"
  | "karting"
  | "archery"
  | "comicon"
  | "livehouse"
  | "kitchen"
  | "trip";

export interface ActivityDefinition {
  id: ActivityId;
  title: string;
  venue: VenueId;
  summary: string;
  // 在对象所在城市约会成本上的系数
  costFactor: number;
  // 能聊多少：加到本次相互了解的增长上
  talk: number;
  // 放松程度：抵消见面本身的压力
  ease: number;
  // 对方喜欢这项活动、且双方有吸引时的额外心动
  spark: number;
  // 0 初见合适；1 见过面更自然；2 更熟之后；3 确认交往后
  level: 0 | 1 | 2 | 3;
  noisy: boolean;
  physical: boolean;
}

export const ACTIVITIES: Record<ActivityId, ActivityDefinition> = {
  meal: { id: "meal", title: "吃顿家常便饭", venue: "restaurant", summary: "最普通的见面方式，节奏可控。", costFactor: 1, talk: 0, ease: 0, spark: 0, level: 0, noisy: false, physical: false },
  hotpot: { id: "hotpot", title: "吃火锅", venue: "hotpot", summary: "热气腾腾，边涮边聊不容易冷场。", costFactor: 1.2, talk: 0, ease: 2, spark: 4, level: 0, noisy: false, physical: false },
  western: { id: "western", title: "西餐厅", venue: "western", summary: "安静正式，适合认真聊，也更贵。", costFactor: 1.6, talk: 2, ease: -1, spark: 4, level: 0, noisy: false, physical: false },
  cafe: { id: "cafe", title: "喝杯咖啡", venue: "cafe", summary: "时间短、花费低，随时可以结束。", costFactor: 0.6, talk: 4, ease: 1, spark: 3, level: 0, noisy: false, physical: false },
  walk: { id: "walk", title: "江边散步", venue: "riverside", summary: "几乎不花钱，并肩走路更好聊。", costFactor: 0.2, talk: 6, ease: 3, spark: 3, level: 0, noisy: false, physical: false },
  museum: { id: "museum", title: "看展 / 博物馆", venue: "museum", summary: "有现成的话题，也不用一直找话说。", costFactor: 0.5, talk: 3, ease: 2, spark: 4, level: 0, noisy: false, physical: false },
  shopping: { id: "shopping", title: "逛街", venue: "mall", summary: "能看出彼此的审美和消费习惯。", costFactor: 1, talk: 1, ease: 1, spark: 4, level: 1, noisy: false, physical: false },
  boardgame: { id: "boardgame", title: "德式重策桌游", venue: "boardgame", summary: "规划、合作与竞争，一局就能看出性格。", costFactor: 0.7, talk: 2, ease: 1, spark: 5, level: 1, noisy: false, physical: false },
  movie: { id: "movie", title: "看电影", venue: "cinema", summary: "两小时不用说话，散场后才有话题。", costFactor: 0.8, talk: -8, ease: 3, spark: 3, level: 1, noisy: true, physical: false },
  nightmarket: { id: "nightmarket", title: "逛夜市", venue: "nightmarket", summary: "烟火气足，边走边吃很放松。", costFactor: 0.6, talk: 0, ease: 3, spark: 4, level: 1, noisy: true, physical: false },
  catcafe: { id: "catcafe", title: "猫咖", venue: "catcafe", summary: "有小动物在，紧张感会少很多。", costFactor: 0.7, talk: 2, ease: 4, spark: 3, level: 1, noisy: false, physical: false },
  hike: { id: "hike", title: "爬山", venue: "mountain", summary: "半天的路程，聊得深，也考验体力。", costFactor: 0.4, talk: 6, ease: 2, spark: 5, level: 2, noisy: false, physical: true },
  karting: { id: "karting", title: "卡丁车", venue: "karting", summary: "刺激热闹，聊得少，笑得多。", costFactor: 1.5, talk: -6, ease: 4, spark: 6, level: 2, noisy: true, physical: false },
  archery: { id: "archery", title: "射箭馆", venue: "archery", summary: "安静专注，轮流射几组很有意思。", costFactor: 1.1, talk: -2, ease: 3, spark: 5, level: 2, noisy: false, physical: false },
  comicon: { id: "comicon", title: "逛漫展", venue: "comicon", summary: "人多热闹，同好会非常开心。", costFactor: 1.2, talk: -4, ease: 3, spark: 6, level: 2, noisy: true, physical: false },
  livehouse: { id: "livehouse", title: "Livehouse", venue: "livehouse", summary: "现场很燃，几乎没法说话。", costFactor: 1.3, talk: -10, ease: 4, spark: 6, level: 2, noisy: true, physical: false },
  cook: { id: "cook", title: "到家一起做饭", venue: "kitchen", summary: "私密的日常，需要足够的信任。", costFactor: 0.5, talk: 6, ease: 3, spark: 5, level: 3, noisy: false, physical: false },
  trip: { id: "trip", title: "短途旅行", venue: "trip", summary: "两天一夜，看清一起生活的样子。", costFactor: 3, talk: 8, ease: 4, spark: 6, level: 3, noisy: false, physical: true },
};

export const ACTIVITY_IDS = Object.keys(ACTIVITIES) as ActivityId[];

export const isActivityId = (value: unknown): value is ActivityId => typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTIVITIES, value);

export function getActivityCost(cityCost: number, id: ActivityId) {
  const activity = ACTIVITIES[id] || ACTIVITIES.meal;
  return Math.max(1, Math.round(cityCost * activity.costFactor));
}

export function isActivityUnlocked(state: Pick<MarriageGameState, "stage">, id: ActivityId) {
  const activity = ACTIVITIES[id];
  return Boolean(activity) && (activity.level < 3 || state.stage === "dating");
}

// 初见（见面不足两次）就去更久、更私密的活动，对方会拘谨
export function isEarlyForActivity(state: Pick<MarriageGameState, "stage" | "meetings">, id: ActivityId) {
  return ACTIVITIES[id].level >= 2 && state.meetings < 2 && state.stage !== "dating";
}

export function getAvailableActivities(state: MarriageGameState) {
  return ACTIVITY_IDS.filter(id => isActivityUnlocked(state, id)).map(id => ({
    ...ACTIVITIES[id],
    liked: state.knownInterests.includes(id),
    disliked: state.knownDislikes.includes(id),
    early: isEarlyForActivity(state, id),
  }));
}

export function getActivityFit(state: Pick<MarriageGameState, "candidateId" | "playerHobbies">, id: ActivityId) {
  const interests = getCandidateInterests(state.candidateId);
  const liked = Boolean(interests && interests.likes.includes(id));
  const disliked = Boolean(interests && interests.dislike === id);
  return { liked, disliked, shared: liked && state.playerHobbies.includes(id) };
}
