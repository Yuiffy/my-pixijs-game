export enum BattleOutcome {
  VICTORY = 'victory',
  DEFEAT = 'defeat',
  ESCAPE = 'escape',
  COMPANION_ESCAPE = 'companion_escape'
}

export type RelationType = 'master' | 'apprentice' | 'friend' | 'enemy' | 'acquaintance' | 'crush' | 'spouse' | 'rival';

export interface Relation {
  targetId: string;
  type: RelationType;
  value: number;
}

export interface MartialArt {
  id: string;
  name: string;
  type: 'inner' | 'outer';
  weapon: 'fist' | 'sword' | 'blade' | 'stick' | 'hidden';
  desc: string;
  moves: string[];
}

export type Personality = 'gentle' | 'bold' | 'cunning' | 'righteous' | 'mysterious' | 'playful' | 'serious' | 'passionate';

export type Appearance = {
  face: string;
  build: string;
  clothing: string;
  weapon?: string;
};

// 熟悉度等级
export type Familiarity = 'stranger' | 'met_once' | 'acquaintance' | 'friend' | 'close_friend' | 'intimate';

export interface Person {
  id: string;
  name: string;
  sectId: string;
  role: 'leader' | 'disciple' | 'hero' | 'villager' | 'merchant' | 'bandit' | 'mystery' | 'boss' | 'npc';
  gender: 'male' | 'female';
  age: number;
  birthYear?: number;
  status: 'alive' | 'dead' | 'missing';
  relations: Relation[];
  locationId: string;
  // 目标地点ID（用于任务或旅行）
  targetLocationId?: string;
  // 人物实力描述（替代数值）
  powerLevelDesc?: string;
  // 与玩家的熟悉度
  familiarity?: Familiarity;
  inventory: string[];
  flags: Record<string, any>;
  arts: string[];
  knowledge: string[];
  // NPC的意向目的地 (用于判定是否顺路)
  desiredLocationId?: string;
  personality?: Personality;
  appearance?: Appearance;
  identity?: {
    type: 'traitor' | 'retired_elder' | 'wandering_hero';
    originalSect?: string;
    relatedNpcId?: string;
    relationDesc?: string;
  };
  lastSeenAppearance?: Appearance;
  lastUsedMove?: string;
  meetCount?: number;
  sectHistory?: Array<{
    sectId: string;
    action: 'join' | 'expel' | 'leave';
    time: number;
    reason?: string;
  }>;
  expelled?: boolean;
  joinSectTime?: number;
  leaveSectTime?: number;
}

export interface Sect {
  id: string;
  name: string;
  type: 'good' | 'evil';
  locationId: string;
  recruitGender?: 'male' | 'female' | 'both';
  history?: string;
  description?: string;
  leader?: string;
  members?: string[];
  reputation?: number;
  relations?: Record<string, number>;
}

export interface LocationInfo {
  id: string;
  name: string;
  type: 'sect' | 'city' | 'wild' | 'village' | 'inn' | 'government';
  x?: number;
  y?: number;
  parentId?: string;
  connections?: string[];
}

// 🆕 Travel Mode Type
export type TravelMode = 'road' | 'wild' | 'water';

// 旅行状态接口
export interface TravelState {
  isTraveling: boolean;
  destinationId: string; // 最终目的地ID
  destinationName: string; // 最终目的地名称
  route: string[]; // 规划的路径节点ID列表 [current, next, ..., end]
  daysPerNode: number; // 两个节点间需要走几天
  daysToNextNode: number;// 距离下一个节点还剩几天
  mode: 'road' | 'wild';
  supplies: number;
}

export enum StoryStage {
  BEGINNING = 0,
  RISING = 1,
  CRISIS = 2,
  CLIMAX = 3,
  ENDING = 4,
}

export type SnippetTag =
  | 'sect_daily' | 'city_daily' | 'wild_daily' | 'inn_daily' | 'game_over' | 'battle'
  | 'sect_join' | 'sect_leave' | 'sect_promote' | 'sect_demote' | 'sect_quest'
  | 'sect_training' | 'sect_meeting' | 'sect_decision' | 'sect_crisis' | 'sect_attack'
  | 'sect_defend' | 'sect_ally' | 'sect_enemy' | 'sect_peace' | 'sect_war' | 'sect_tournament'
  | 'sect_mission' | 'sect_treasure' | 'sect_artifact' | 'sect_technique' | 'sect_elder'
  | 'sect_disciple' | 'sect_leader' | 'sect_master' | 'sect_apprentice' | 'sect_rival'
  | 'travel_daily' // 🆕 旅途日常事件
  | 'travel_arrival' // 🆕 到达目的地事件
  | 'travel_departure'; // 🆕 出发事件

export interface StoryLine {
  text: string;
  type: 'narrative' | 'dialogue' | 'action' | 'inner' | 'time-pass';
  speaker?: string;
}

export interface StoryChoice {
  text: string;
  desc?: string; // Add optional description
  result: SnippetResult;
}

export interface SnippetResult {
  lines: StoryLine[];
  addItem?: string;
  removeItem?: string;
  newLocationId?: string;
  addNpc?: Person | Person[];
  addRelations?: Relation[]; // 🆕 新增：支持批量添加/更新关系
  addFlags?: Record<string, any>; // 添加多个标志
  removeFlags?: string[]; // 移除多个标志
  setNpcStatus?: { id: string; status: 'alive' | 'dead' | 'missing' } | Array<{ id: string; status: 'alive' | 'dead' | 'missing' }>; // 设置单个或多个NPC状态
  removeFromWorld?: string | string[]; // 从世界中移除NPC
  addArt?: string;
  addKnowledge?: string;
  addToParty?: string | string[]; // 🆕 支持单个或批量加入队伍 (ID)
  removeFromParty?: string | string[]; // 🆕 支持单个或批量离开队伍 (ID)
  // 🆕 新增：开始旅行
  startTravel?: {
    targetId: string;
    days: number;
    mode: TravelMode;
  };
  // 🆕 新增：物资变动
  addSupplies?: number; // 🆕 支持单个或批量离开队伍 (ID)
  advanceStage?: boolean;
  addTurn?: number;
  addExp?: number;
  addMaxHp?: number;
  endGame?: boolean;
  choices?: StoryChoice[];
}

export interface StorySnippet {
  id: string;
  tags: SnippetTag[];
  weight?: number;
  stageMin?: StoryStage;
  stageMax?: StoryStage;
  req?: (hero: Person, world: any, turnInStage: number) => boolean;
  run: (hero: Person, world: any) => SnippetResult;
}
