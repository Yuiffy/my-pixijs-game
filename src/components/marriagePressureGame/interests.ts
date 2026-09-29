import type { ActivityId, CandidateId } from "./types";

export interface CandidateInterests {
  likes: ActivityId[];
  dislike: ActivityId;
  // 聊天里会提到的忌口，吃饭时记得会有回应台词
  avoidFood: string;
}

// 虚构的游戏配置：每位角色固定 2–3 个喜欢的活动、1 个不太喜欢的活动。
// 「吃顿家常便饭」保持中性，不出现在任何喜好里。
export const CANDIDATE_INTERESTS: Record<CandidateId, CandidateInterests> = {
  sui: { likes: ["hotpot", "karting", "livehouse"], dislike: "western", avoidFood: "香菜" },
  shiori: { likes: ["nightmarket", "hotpot", "walk"], dislike: "museum", avoidFood: "苦瓜" },
  kloa: { likes: ["museum", "western", "trip"], dislike: "nightmarket", avoidFood: "太辣的菜" },
  liko: { likes: ["boardgame", "cafe", "archery"], dislike: "livehouse", avoidFood: "肥肉" },
  izayoi: { likes: ["museum", "boardgame", "cafe"], dislike: "karting", avoidFood: "生冷海鲜" },
  xuehui: { likes: ["museum", "walk", "catcafe"], dislike: "karting", avoidFood: "葱" },
  hazel: { likes: ["western", "archery", "trip"], dislike: "comicon", avoidFood: "甜食" },
  nana7mi: { likes: ["shopping", "livehouse", "hotpot"], dislike: "hike", avoidFood: "芹菜" },
  azi: { likes: ["comicon", "karting", "catcafe"], dislike: "museum", avoidFood: "胡萝卜" },
  rift_stalker: { likes: ["livehouse", "nightmarket", "boardgame"], dislike: "museum", avoidFood: "羊肉" },
  cog_scribe: { likes: ["museum", "cafe", "boardgame"], dislike: "livehouse", avoidFood: "辣椒" },
  mossback: { likes: ["catcafe", "hike", "walk"], dislike: "karting", avoidFood: "内脏" },
  spark_mage: { likes: ["trip", "cafe", "museum"], dislike: "boardgame", avoidFood: "生姜" },
  clock_gunner: { likes: ["archery", "boardgame", "karting"], dislike: "shopping", avoidFood: "香菜" },
  dawn_duelist: { likes: ["movie", "livehouse", "comicon"], dislike: "hike", avoidFood: "冰饮" },
  yua: { likes: ["comicon", "boardgame", "catcafe"], dislike: "hike", avoidFood: "青椒" },
  seki_boar_king: { likes: ["hike", "archery", "hotpot"], dislike: "movie", avoidFood: "油炸食品" },
  sumi: { likes: ["museum", "shopping", "walk"], dislike: "karting", avoidFood: "大蒜" },
  mitsuri: { likes: ["walk", "cafe", "movie"], dislike: "livehouse", avoidFood: "太咸的菜" },
  guangyi: { likes: ["karting", "boardgame", "comicon"], dislike: "museum", avoidFood: "茄子" },
  nagisa: { likes: ["walk", "catcafe", "nightmarket"], dislike: "karting", avoidFood: "辣椒" },
  tower_god: { likes: ["livehouse", "movie", "cafe"], dislike: "hike", avoidFood: "牛奶" },
  nori: { likes: ["trip", "nightmarket", "hike"], dislike: "boardgame", avoidFood: "香菜" },
  meme: { likes: ["hotpot", "nightmarket", "karting"], dislike: "western", avoidFood: "甜辣口" },
  zeyin: { likes: ["livehouse", "museum", "trip"], dislike: "shopping", avoidFood: "鱼腥味" },
  kioi: { likes: ["movie", "museum", "walk"], dislike: "livehouse", avoidFood: "洋葱" },
  nightin: { likes: ["shopping", "western", "livehouse"], dislike: "hike", avoidFood: "蒜苗" },
  tiandou: { likes: ["cafe", "catcafe", "nightmarket"], dislike: "karting", avoidFood: "苦瓜" },
  youyi: { likes: ["livehouse", "shopping", "walk"], dislike: "boardgame", avoidFood: "油腻的菜" },
  akirinco: { likes: ["cafe", "boardgame", "museum"], dislike: "karting", avoidFood: "海鲜" },
  lovely: { likes: ["comicon", "livehouse", "shopping"], dislike: "hike", avoidFood: "芹菜" },
  komichi: { likes: ["walk", "hike", "museum"], dislike: "western", avoidFood: "香菜" },
  mumu: { likes: ["hike", "archery", "karting"], dislike: "movie", avoidFood: "甜点" },
  yukisyo: { likes: ["walk", "museum", "catcafe"], dislike: "shopping", avoidFood: "辣的" },
  rei: { likes: ["museum", "cafe", "movie"], dislike: "livehouse", avoidFood: "葱花" },
  rutice: { likes: ["walk", "hike", "catcafe"], dislike: "livehouse", avoidFood: "冰的东西" },
  lian: { likes: ["boardgame", "karting", "nightmarket"], dislike: "museum", avoidFood: "苦的" },
  pako: { likes: ["boardgame", "comicon", "karting"], dislike: "western", avoidFood: "香菇" },
  miki_guest: { likes: ["livehouse", "comicon", "cafe"], dislike: "hike", avoidFood: "芥末" },
  hatsuse_guest: { likes: ["livehouse", "nightmarket", "archery"], dislike: "shopping", avoidFood: "生姜" },
};

// 玩家可以培养的爱好方向
export const HOBBY_OPTIONS: ActivityId[] = ["hike", "boardgame", "archery", "museum", "comicon", "livehouse", "cook"];

export function getCandidateInterests(id: CandidateId | null) {
  return id ? CANDIDATE_INTERESTS[id] ?? null : null;
}

// 按固定顺序揭示下一个尚未知道的喜好，不消耗随机数
export function nextUnknownLike(id: CandidateId | null, known: ActivityId[]) {
  return getCandidateInterests(id)?.likes.find(like => !known.includes(like)) ?? null;
}
