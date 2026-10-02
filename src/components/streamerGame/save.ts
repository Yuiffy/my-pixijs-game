import { validateSave } from "./engine";
import { SAVE_KEY, parseCareer } from "./persistence";
import type { Career } from "./persistence";
import type { StreamState } from "./types";

export const BACKUP_KEY = "streamer-run-backup-v1";
export const MAX_ARCHIVE_BYTES = 256 * 1024;
export interface SavedRun { state: StreamState; runKey: string }
export interface Archive { format: "sui-streamer"; version: 1; run: SavedRun; career: Career }
type Store = Pick<Storage, "getItem" | "setItem">;

function validateRun(value: unknown): SavedRun | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<SavedRun>;
  const state = validateSave(input.state);
  if (!state || state.phase === "lobby") return null;
  if (input.runKey !== undefined && (typeof input.runKey !== "string" || !input.runKey || input.runKey.length > 200)) return null;
  return { state, runKey: input.runKey || `restored-${state.seed}` };
}

export function parseRun(raw: string | null): SavedRun | null {
  if (!raw || raw.length > MAX_ARCHIVE_BYTES) return null;
  try { return validateRun(JSON.parse(raw)); } catch { return null; }
}

export function loadRun(storage: Store): { run: SavedRun | null; status: "ok" | "empty" | "recovered" | "corrupt" } {
  // Access errors deliberately escape; malformed JSON is a separate, recoverable condition.
  const primary = storage.getItem(SAVE_KEY);
  const run = parseRun(primary);
  if (run) return { run, status: "ok" };
  const backup = storage.getItem(BACKUP_KEY);
  const recovered = parseRun(backup);
  if (recovered) return { run: recovered, status: "recovered" };
  return { run: null, status: primary !== null || backup !== null ? "corrupt" : "empty" };
}

export function writeRun(storage: Store, run: SavedRun): void {
  const next = JSON.stringify(run);
  const previous = storage.getItem(SAVE_KEY);
  if (previous === next) return;
  // Never replace the recovery checkpoint with damaged data.
  if (parseRun(previous)) storage.setItem(BACKUP_KEY, previous!);
  storage.setItem(SAVE_KEY, next);
}

export function createArchive(run: SavedRun, career: Career): string {
  return JSON.stringify({ format: "sui-streamer", version: 1, run, career }, null, 2);
}

export function parseArchive(raw: string): Archive {
  if (new TextEncoder().encode(raw).length > MAX_ARCHIVE_BYTES) throw new Error("存档文件过大（最多 256 KB）");
  let input;
  try { input = JSON.parse(raw); } catch { throw new Error("文件不是有效的 JSON 存档"); }
  const run = validateRun(input?.run);
  const career = parseCareer(input?.career);
  if (input?.format !== "sui-streamer" || input?.version !== 1 || !run || !career) throw new Error("存档格式或游戏进度无效，当前进度未更改");
  return { format: "sui-streamer", version: 1, run, career };
}

export function mergeCareer(current: Career, incoming: Career): Career {
  return {
    runs: Math.max(current.runs, incoming.runs),
    best: Math.max(current.best, incoming.best),
    endings: Array.from(new Set([...current.endings, ...incoming.endings])),
    recorded: Array.from(new Set([...current.recorded, ...incoming.recorded])).slice(-100),
    skin: incoming.skin,
  };
}
