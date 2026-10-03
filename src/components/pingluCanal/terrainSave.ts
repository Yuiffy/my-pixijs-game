import { restoreTerrain } from './terrainEngine';
import type { TerrainGame } from './terrainEngine';

export const SAVE_KEY = 'pinglu-geography-v3';
export const BACKUP_KEY = `${SAVE_KEY}-backup`;
export const RECOVERY_KEY = `${SAVE_KEY}-unreadable`;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export interface Recovery {
  raw: string | null;
  backup: TerrainGame | null;
}

// Reads never change storage. The caller must explicitly resolve recovery.
export function readTerrainSave(storage: Storage): { game: TerrainGame | null; recovery: Recovery | null } {
  const raw = storage.getItem(SAVE_KEY);
  const game = raw === null ? null : restoreTerrain(raw);
  if (game) return { game, recovery: null };
  const backupRaw = storage.getItem(BACKUP_KEY);
  const backup = backupRaw === null ? null : restoreTerrain(backupRaw);
  return { game: null, recovery: raw !== null || backupRaw !== null ? { raw: raw ?? backupRaw, backup } : null };
}

export function writeTerrainSave(storage: Storage, game: TerrainGame) {
  const next = JSON.stringify(game);
  const previous = storage.getItem(SAVE_KEY);
  if (previous === next) return;
  // A failed backup/quarantine write must leave the primary untouched.
  if (previous !== null) {
    storage.setItem(restoreTerrain(previous) ? BACKUP_KEY : RECOVERY_KEY, previous);
  }
  storage.setItem(SAVE_KEY, next);
}
