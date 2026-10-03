import { restoreGame, SAVE_KEY, V4_SAVE_KEY, V3_SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY, type Game } from './engine';

export const BACKUP_KEY = `${SAVE_KEY}.previous`;
export const RECOVERY_PREFIX = `${SAVE_KEY}.unread.`;
const KEYS = [SAVE_KEY, BACKUP_KEY, V4_SAVE_KEY, V3_SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY];
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export type UnreadSave = { key: string; raw: string };
export type SaveIssue = {
  kind: 'damaged' | 'unavailable';
  unread: UnreadSave[];
  candidate: Game | null;
};
export type SaveRead = { game: Game | null; issue: SaveIssue | null };

/** A present but unreadable newer save must never silently fall back and be overwritten. */
export function readResetSave(store: Pick<Store, 'getItem'>): SaveRead {
  const unread: UnreadSave[] = [];
  try {
    for (const key of KEYS) {
      const raw = store.getItem(key);
      if (raw === null) continue;
      const game = restoreGame(raw);
      if (game) return unread.length
        ? { game: null, issue: { kind: 'damaged', unread, candidate: game } }
        : { game, issue: null };
      unread.push({ key, raw });
    }
    return { game: null, issue: unread.length ? { kind: 'damaged', unread, candidate: null } : null };
  } catch {
    return { game: null, issue: { kind: 'unavailable', unread, candidate: null } };
  }
}

export type SaveWrite = { ok: true } | { ok: false; issue: SaveIssue | null };
/** Copy the previous valid position before replacement; preserve unreadable text only after explicit recovery. */
export function writeResetSave(store: Store, game: Game, replaceDamaged = false): SaveWrite {
  const current = readResetSave(store);
  if (current.issue && (current.issue.kind === 'unavailable' || !replaceDamaged)) return { ok: false, issue: current.issue };
  try {
    const raw = JSON.stringify(game);
    if (!restoreGame(raw)) return { ok: false, issue: null };
    if (current.issue?.unread.length) {
      // Keep each original byte-for-byte; a failed preservation write must stop replacement.
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      current.issue.unread.forEach((entry, index) => {
        store.setItem(`${RECOVERY_PREFIX}${id}-${index}-${entry.key}`, entry.raw);
      });
    }
    const previous = current.game ?? current.issue?.candidate;
    if (previous && JSON.stringify(previous) !== raw) store.setItem(BACKUP_KEY, JSON.stringify(previous));
    store.setItem(SAVE_KEY, raw);
    return { ok: true };
  } catch {
    return { ok: false, issue: current.issue };
  }
}
