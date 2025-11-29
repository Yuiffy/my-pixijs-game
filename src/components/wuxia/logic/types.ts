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

export interface Person {
  id: string;
  name: string;
  sectId: string;
  role: 'leader' | 'disciple' | 'hero' | 'villager' | 'merchant' | 'bandit' | 'mystery' | 'boss';
  gender: 'male' | 'female';
  age: number;
  birthYear?: number;
  status: 'alive' | 'dead' | 'missing';
  relations: Relation[];
  locationId: string;
  inventory: string[];
  flags: Record<string, any>;
  arts: string[];
  knowledge: string[];
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

export enum StoryStage {
  BEGINNING = 0,
  RISING = 1,
  CRISIS = 2,
  CLIMAX = 3,
  ENDING = 4,
}

export type SnippetTag = 'sect_daily' | 'city_daily' | 'wild_daily' | 'quest' | 'relationship' | 'main_story';

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
  addRelation?: Relation;
  addRelations?: Relation[]; // 🆕 新增：支持批量添加/更新关系
  addFlag?: string;
  addFlags?: Record<string, any>;
  addArt?: string;
  addKnowledge?: string;
  setCompanion?: string;
  removeCompanion?: boolean;
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
