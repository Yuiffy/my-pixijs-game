export type RpgMode = 'title' | 'explore' | 'dialogue' | 'battle' | 'result' | 'ending';
export interface Point { x: number; y: number }
export interface CharacterDef {
  id: string; name: string; role: string; color: number; portrait: string;
  hp: number; attack: number; defense: number; range: number; speed: number;
  skill: string; skillDescription: string;
}
export interface WorldEntity extends Point {
  id: string; name: string; kind: 'npc' | 'encounter' | 'camp' | 'chest' | 'portal' | 'door' | 'exit' | 'lore';
  description: string; characterId?: string; requires?: string;
  enemies?: string[]; power?: number; gold?: number; xp?: number; shard?: boolean;
  area?: string; destination?: string; storyId?: string; requiresFlag?: string;
}
export interface InteriorProp extends Point { w: number; h: number; kind: 'table' | 'shelf' | 'bed' | 'forge' | 'crystal' }
export interface InteriorDef {
  id: string; name: string; subtitle: string; width: number; height: number;
  style: 'inn' | 'archive' | 'forge' | 'ruin'; spawn: Point; props: InteriorProp[];
}
export interface StoryState {
  flags: string[]; choices: Record<string, string>; bonds: Record<string, number>; journal: string[]; tracked: string | null;
}
export interface QuestEntry {
  id: string; title: string; companion: string; status: 'unknown' | 'available' | 'active' | 'complete';
  text: string; location: string; targetId?: string;
}
export interface Region extends Point { id: string; name: string; subtitle: string; color: number }
export interface PartyMember { id: string; hp: number }
export interface BattleUnit extends Point {
  uid: string; characterId: string; name: string; side: 'ally' | 'enemy';
  hp: number; maxHp: number; attack: number; defense: number; range: number; speed: number;
  cooldown: number; skillCooldown: number; flash: number; damage: number;
}
export interface BattleEffect extends Point { id: number; kind: 'hit' | 'heal' | 'skill'; text: string; life: number; color: number; targetX?: number; targetY?: number }
export interface BattleState {
  encounterId: string; elapsed: number; units: BattleUnit[]; effects: BattleEffect[]; effectCounter: number;
}
export interface Dialogue { entityId: string; speaker: string; text: string; choices: { id: string; label: string; disabled?: boolean }[] }
export interface BattleResult { won: boolean; title: string; text: string; gold: number; xp: number; shard: boolean }
export interface RpgState {
  version: 2; mode: RpgMode; player: Point; party: PartyMember[]; active: string[];
  level: number; xp: number; gold: number; potions: number; weapon: number;
  completed: string[]; opened: string[]; visited: string[]; shards: number;
  dialogue: Dialogue | null; battle: BattleState | null; result: BattleResult | null;
  manual: boolean; paused: boolean; playTime: number; message: string; facing: number;
  area: string; worldReturn: Point | null; story: StoryState;
}
export interface RpgInput { x: number; y: number; skill?: boolean; target?: Point | null }
export interface SceneBridge {
  getState: () => RpgState;
  moveTarget: (point: Point) => void;
  interact: (id: string) => void;
}
