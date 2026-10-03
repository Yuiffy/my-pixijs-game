import { createGame, shuffleRemaining, strike, type GameState } from './engine';

export const SESSION_KEY = 'brick-excavation-session-v1';
export type ExcavationAction = number | 'shuffle';
export interface ExcavationSave {
  version: 1;
  seed: number;
  actions: ExcavationAction[];
  previewFirst: boolean;
}

/** Rebuild from legal moves rather than trusting a saved board or treasure data. */
export function restoreExcavation(raw: string): {
  save: ExcavationSave;
  game: GameState;
  history: GameState[];
} | null {
  try {
    if (raw.length > 4096) return null;
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !Number.isSafeInteger(value.seed) || value.seed < 0
      || !Array.isArray(value.actions) || value.actions.length > 52 || typeof value.previewFirst !== 'boolean') return null;
    let game = createGame(value.seed);
    const history: GameState[] = [];
    for (const action of value.actions) {
      if (action !== 'shuffle' && (!Number.isInteger(action) || action < 0 || action >= game.board.length)) return null;
      const next = action === 'shuffle' ? shuffleRemaining(game) : strike(game, action);
      if (next === game) return null;
      history.push(game);
      game = next;
    }
    return { save: { version: 1, seed: value.seed, actions: value.actions, previewFirst: value.previewFirst }, game, history };
  } catch {
    return null;
  }
}
