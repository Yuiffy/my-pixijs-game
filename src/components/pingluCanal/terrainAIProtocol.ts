import type { HaulPlan, Survey, TerrainAction, TerrainGame } from './terrainEngine';

export interface AIRequest {
  id: number;
  game?: TerrainGame;
  mode: 'prepare' | 'execute' | 'haul' | 'pause';
  managed?: number[];
  action?: TerrainAction;
}
export type AIResponse =
  | { id: number; kind: 'prepared'; players: number[] }
  | { id: number; kind: 'haul-preview'; plan: HaulPlan }
  | { id: number; kind: 'applied'; game: TerrainGame; survey: Survey; action: TerrainAction; reused: boolean; elapsed: number }
  | { id: number; kind: 'error'; message: string };
