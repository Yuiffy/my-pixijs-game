import { AUGMENTS, CAMPAIGN_ROUNDS, PLAYER_LEVELS, SHOP_UNITS, STARTERS, UNIT_DEFS } from "../gameData";
import type { AutoChessEngineSnapshot } from "./AutoChessEngine";
import { BENCH_SIZE, BOARD_SIZE, SHOP_SIZE, createInitialState } from "./state";

export const RUN_SAVE_KEY = "rift-line-active-run";
export const RUN_SAVE_SCHEMA = 1;
// Bump when gameplay state or deterministic replay semantics become incompatible.
export const RUN_SAVE_RULESET = 1;
const MAX_SAVE_LENGTH = 2_000_000;

export type RunStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type RunCheckpoint = {
  savedAt: number;
  resumeBattle: boolean;
  snapshot: AutoChessEngineSnapshot;
};
export type RunSaveInfo = {
  round: number;
  hp: number;
  phase: "preparation" | "result" | "augment" | "battle";
  savedAt: number;
};
export type RunSaveIssue = "invalid" | "incompatible" | "unavailable" | null;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);
const isNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value) && value >= 0
);
const isInteger = (value: unknown): value is number => isNumber(value) && Number.isSafeInteger(value);
const unitIds = new Set<string>(SHOP_UNITS);
const starterIds = new Set<string>(STARTERS.map(({ id }) => id));
const augmentIds = new Set<string>(AUGMENTS.map(({ id }) => id));

// Detect incomplete or accidentally modified payloads before restoring engine state.
const checksum = (payload: string) => {
  let value = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    value = (value * 31 + payload.charCodeAt(index)) % 4294967296;
  }
  return value;
};

const validCheckpoint = (value: unknown): value is RunCheckpoint => {
  if (!isRecord(value) || !isNumber(value.savedAt) || typeof value.resumeBattle !== "boolean") return false;
  const { snapshot } = value;
  if (!isRecord(snapshot) || !isRecord(snapshot.state)) return false;
  const { state } = snapshot;
  if (!["preparation", "result", "augment"].includes(String(state.phase))) return false;
  if (value.resumeBattle && state.phase !== "preparation") return false;
  if (!Object.entries(createInitialState(1, 0)).every(([key, initial]) => {
    if (!(key in state)) return false;
    if (typeof initial === "number") return isNumber(state[key]);
    if (typeof initial === "boolean") return typeof state[key] === "boolean";
    if (Array.isArray(initial)) return Array.isArray(state[key]);
    return true;
  })) return false;
  if (!isInteger(state.round) || state.round < 1 || state.maxRounds !== CAMPAIGN_ROUNDS) return false;
  if (state.round > CAMPAIGN_ROUNDS && !state.endlessUnlocked) return false;
  if (!PLAYER_LEVELS.includes(state.playerLevel as (typeof PLAYER_LEVELS)[number])) return false;
  if (typeof state.starter !== "string" || !starterIds.has(state.starter)) return false;
  if (!isInteger(snapshot.uid) || !isInteger(snapshot.randomState) || !isInteger(snapshot.shopRandomState)) return false;
  if (snapshot.randomState > 0xffffffff || snapshot.shopRandomState > 0xffffffff) return false;
  const cursors = snapshot.shopSequenceCounts;
  if (!isRecord(cursors) || !PLAYER_LEVELS.every(level => isInteger(cursors[level]))) return false;
  const uids = new Set<number>();
  const validSlots = (slots: unknown, size: number) => Array.isArray(slots) && slots.length === size && slots.every(unit => {
    if (unit === null) return true;
    if (!isRecord(unit) || typeof unit.id !== "string" || !unitIds.has(unit.id)) return false;
    if (!isInteger(unit.star) || ![1, 2, 3].includes(unit.star) || !isInteger(unit.uid) || unit.uid < 1 || unit.uid >= Number(snapshot.uid) || uids.has(unit.uid)) return false;
    uids.add(unit.uid);
    return true;
  });
  if (!validSlots(state.board, BOARD_SIZE) || !validSlots(state.bench, BENCH_SIZE)) return false;
  if (!Array.isArray(state.shop) || state.shop.length !== SHOP_SIZE || !state.shop.every(id => id === null || (typeof id === "string" && unitIds.has(id)))) return false;
  if (![state.augments, state.augmentChoices].every(ids => Array.isArray(ids) && ids.every(id => augmentIds.has(id)))) return false;
  if (!Array.isArray(state.augmentHistory) || !state.augmentHistory.every(entry => isRecord(entry) && isInteger(entry.round) && augmentIds.has(String(entry.id)))) return false;
  if (!Array.isArray(state.starterHistory) || !state.starterHistory.every(entry => isRecord(entry) && starterIds.has(String(entry.id)))) return false;
  if (!isRecord(state.runStats) || !Object.entries(state.runStats).every(([id, stats]) => (
    id in UNIT_DEFS && isRecord(stats) && stats.unitId === id
    && ["maxStar", "battles", "damageDealt", "healingDone", "shieldingDone", "damageTaken"].every(key => isNumber(stats[key]))
  ))) return false;
  if (state.phase === "augment" && ((state.augmentChoices as unknown[]).length < 1 || (state.augmentChoices as unknown[]).length > 3)) return false;
  if (state.phase !== "result") return state.battle === null && state.result === null && Number(state.hp) > 0;
  const { result, battle } = state;
  return isRecord(result) && typeof result.won === "boolean"
    && ["income", "bounty", "defeatedEnemies", "upgradeDiscount", "damage"].every(key => isNumber(result[key]))
    && typeof result.headline === "string" && typeof result.detail === "string"
    && isRecord(result.defeatedByStar)
    && isRecord(battle) && isNumber(battle.elapsed) && isNumber(battle.limit)
    && ["damage", "support", "taken"].includes(String(battle.rankingMetric))
    && [battle.player, battle.enemy].every(fighters => Array.isArray(fighters) && fighters.every(fighter => (
      isRecord(fighter) && typeof fighter.unitId === "string" && fighter.unitId in UNIT_DEFS
      && typeof fighter.fid === "string" && typeof fighter.alive === "boolean"
      && ["hp", "maxHp", "damageDealt", "damageTaken", "healingDone", "shieldingDone"].every(key => isNumber(fighter[key]))
    )));
};

export const createRunCheckpoint = (
  snapshot: AutoChessEngineSnapshot,
  resumeBattle = false,
): RunCheckpoint => {
  const saved = structuredClone(snapshot);
  saved.state.selected = null;
  saved.state.toast = null;
  if (saved.state.battle) {
    saved.state.battle.eventLog = saved.state.battle.eventLog.slice(-256);
    saved.state.battle.effects = [];
    saved.state.battle.projectiles = [];
    saved.state.battle.projectileVolley = [];
    saved.state.battle.pets = [];
    saved.state.battle.corpses = [];
    saved.state.battle.chronospheres = [];
    saved.state.battle.healingZones = [];
    saved.state.battle.controlZones = [];
  }
  return { savedAt: Date.now(), resumeBattle, snapshot: saved };
};

export const runSaveInfo = (save: RunCheckpoint | null): RunSaveInfo | null => save && ({
  round: save.snapshot.state.round,
  hp: save.snapshot.state.hp,
  phase: save.resumeBattle ? "battle" : save.snapshot.state.phase as RunSaveInfo["phase"],
  savedAt: save.savedAt,
});

export class RunSaveStore {
  public issue: RunSaveIssue = null;

  constructor(private readonly storage: RunStorage) {}

  public load(): RunCheckpoint | null {
    let serialized: string | null;
    try {
      serialized = this.storage.getItem(RUN_SAVE_KEY);
      this.issue = null;
    } catch {
      this.issue = "unavailable";
      return null;
    }
    try {
      if (!serialized) return null;
      if (serialized.length > MAX_SAVE_LENGTH) throw new Error("Save too large");
      const envelope = JSON.parse(serialized);
      if (envelope?.schema !== RUN_SAVE_SCHEMA || envelope.rules !== RUN_SAVE_RULESET) {
        this.issue = "incompatible";
        return null;
      }
      if (typeof envelope.payload !== "string" || checksum(envelope.payload) !== envelope.checksum) throw new Error("Invalid checksum");
      const save: unknown = JSON.parse(envelope.payload);
      if (!validCheckpoint(save)) throw new Error("Invalid checkpoint");
      this.issue = null;
      return save;
    } catch {
      this.issue = "invalid";
      return null;
    }
  }

  public write(save: RunCheckpoint) {
    try {
      const payload = JSON.stringify(save);
      const serialized = JSON.stringify({ schema: RUN_SAVE_SCHEMA, rules: RUN_SAVE_RULESET, payload, checksum: checksum(payload) });
      if (serialized.length > MAX_SAVE_LENGTH) throw new Error("Save too large");
      this.storage.setItem(RUN_SAVE_KEY, serialized);
      this.issue = null;
      return true;
    } catch {
      this.issue = "unavailable";
      return false;
    }
  }

  public clear() {
    try {
      this.storage.removeItem(RUN_SAVE_KEY);
      this.issue = null;
    } catch {
      this.issue = "unavailable";
    }
  }
}
