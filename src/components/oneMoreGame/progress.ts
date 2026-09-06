import {
  BOSSES,
  CHARMS,
  CONTENT_VERSION,
  CONTROLS,
  DEFAULT_BINDINGS,
  DIFFICULTIES,
  KEY_OPTIONS,
  VOWS,
} from "./content";
import type { BossId, Charm, ControlAction, Difficulty, Vow } from "./content";

export const SAVE_KEY = "sui-sparring-v2";
export const LEGACY_SAVE_KEY = "sui-sparring-v1";
export interface FightStats {
  parries: number;
  guards: number;
  dodges: number;
  hits: number;
  damage: number;
  triple: boolean;
  breaks: number;
  counters: number;
  blockedAttacks: number;
}
export interface BattleRecord {
  bossId: BossId;
  bossIndex: number;
  elapsed: number;
  health: number;
  attempts: number;
  stats: FightStats;
  vow: Vow;
  vowMet: boolean;
  difficulty: Difficulty;
  charm: Charm;
}
export interface Campaign {
  seed: number;
  bossIndex: number;
  checkpoint: "ready" | "won" | "ending";
  cleared: BattleRecord[];
  attempts: [number, number, number];
  mode: "chapter" | "rematch";
  challengeKey: string | null;
}
export interface Progress {
  version: 2;
  attempts: number;
  wins: number;
  chapterWins: number;
  bestDamage: number;
  bestParries: number;
  bestTime: number | null;
  stamps: string[];
  vow: Vow;
  assist: boolean;
  muted: boolean;
  volume: number;
  bindings: Record<ControlAction, string>;
  difficulties: [Difficulty, Difficulty, Difficulty];
  charm: Charm;
  layout: "none" | "left" | "right";
  campaign: Campaign;
}
export const freshCampaign = (
  seed = 90601,
  mode: Campaign["mode"] = "chapter",
): Campaign => ({
  seed: Math.abs(Math.floor(seed)) % 4294967296 || 90601,
  bossIndex: 0,
  checkpoint: "ready",
  cleared: [],
  attempts: [0, 0, 0],
  mode,
  challengeKey: null,
});
export const freshProgress = (): Progress => ({
  version: 2,
  attempts: 0,
  wins: 0,
  chapterWins: 0,
  bestDamage: 0,
  bestParries: 0,
  bestTime: null,
  stamps: [],
  vow: "clear",
  assist: false,
  muted: true,
  volume: 0.35,
  bindings: { ...DEFAULT_BINDINGS },
  difficulties: ["standard", "standard", "standard"],
  charm: "none",
  layout: "none",
  campaign: freshCampaign(),
});
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0);
const isDifficulty = (value: unknown): value is Difficulty => typeof value === "string" && Object.hasOwn(DIFFICULTIES, value);

export function readProgress(raw: string | null): Progress {
  const fresh = freshProgress();
  if (!raw) return fresh;
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 && data?.version !== 2) return fresh;
    const bindings = Object.fromEntries(
      CONTROLS.map((control) => [
        control.id,
        data.bindings?.[control.id] ?? DEFAULT_BINDINGS[control.id],
      ]),
    ) as Record<ControlAction, string>;
    const codes = Object.values(bindings);
    const validKeys =
      codes.every((code) => KEY_OPTIONS.includes(code)) &&
      new Set(codes).size === CONTROLS.length;
    const progress: Progress = {
      ...fresh,
      attempts: count(data.attempts),
      wins: count(data.wins),
      chapterWins: count(data.chapterWins),
      bestDamage: Math.min(100, count(data.bestDamage)),
      bestParries: count(data.bestParries),
      bestTime: count(data.bestTime) || null,
      stamps: Array.isArray(data.stamps)
        ? data.stamps
            .filter(
              (s: unknown) => typeof s === "string" &&
                s.length < 100 &&
                /^[a-z:0-9-]+$/.test(s),
            )
            .slice(0, 100)
        : [],
      vow: VOWS.some((v) => v.id === data.vow) ? data.vow : "clear",
      muted: data.muted !== false,
      volume:
        typeof data.volume === "number" && Number.isFinite(data.volume)
          ? Math.max(0, Math.min(1, data.volume))
          : 0.35,
      bindings: validKeys ? bindings : { ...DEFAULT_BINDINGS },
      charm: CHARMS.some((charm) => charm.id === data.charm)
        ? data.charm
        : "none",
      layout:
        data.layout === "left" || data.layout === "right"
          ? data.layout
          : "none",
    };
    if (data.version === 1) {
      progress.difficulties = data.assist
        ? ["relaxed", "relaxed", "relaxed"]
        : [...fresh.difficulties];
    } else {
      progress.difficulties = [0, 1, 2].map((index) => (isDifficulty(data.difficulties?.[index])
          ? data.difficulties[index]
          : "standard"),) as Progress["difficulties"];
      const saved = data.campaign;
      if (saved && typeof saved === "object") {
        const campaign = freshCampaign(
          count(saved.seed),
          saved.mode === "rematch" ? "rematch" : "chapter",
        );
        campaign.attempts = [0, 1, 2].map((index) => count(saved.attempts?.[index]),) as Campaign["attempts"];
        campaign.challengeKey = typeof saved.challengeKey === 'string' && saved.challengeKey.length < 500 ? saved.challengeKey : null;
        for (let i = 0; i < 3; i += 1) {
          const record = saved.cleared?.[i];
          if (
            !record ||
            record.bossId !== BOSSES[i].id ||
            record.bossIndex !== i ||
            !count(record.elapsed) ||
            !isDifficulty(record.difficulty)
          ) break;
          const stats: FightStats = {
            parries: count(record.stats?.parries),
            guards: count(record.stats?.guards),
            dodges: count(record.stats?.dodges),
            hits: count(record.stats?.hits),
            damage: count(record.stats?.damage),
            triple: record.stats?.triple === true,
            breaks: count(record.stats?.breaks),
            counters: count(record.stats?.counters),
            blockedAttacks: count(record.stats?.blockedAttacks),
          };
          const vow: Vow = VOWS.some((v) => v.id === record.vow)
            ? record.vow
            : "clear";
          campaign.cleared.push({
            bossId: BOSSES[i].id,
            bossIndex: i,
            elapsed: count(record.elapsed),
            health: Math.min(5, count(record.health)),
            attempts: count(record.attempts),
            stats,
            vow,
            vowMet:
              vow === "clear" ||
              (vow === "combo" && stats.triple) ||
              (vow === "perfect" && stats.damage === 0),
            difficulty: record.difficulty,
            charm: CHARMS.some((charm) => charm.id === record.charm)
              ? record.charm
              : "none",
          });
        }
        const requested = Math.min(2, count(saved.bossIndex));
        campaign.bossIndex = Math.min(requested, campaign.cleared.length);
        campaign.checkpoint =
          campaign.cleared.length === 3
            ? "ending"
            : saved.checkpoint === "won" && campaign.cleared[campaign.bossIndex]
              ? "won"
              : "ready";
        if (campaign.checkpoint === "ending") campaign.bossIndex = 2;
        progress.campaign = campaign;
      }
    }
    progress.assist =
      progress.difficulties[progress.campaign.bossIndex] === "relaxed";
    return progress;
  } catch {
    return fresh;
  }
}

export interface Challenge {
  revision: string;
  seed: number;
  difficulties: Progress["difficulties"];
  charm: Charm;
}
export function parseChallenge(url: URL): Challenge | null {
  if (url.searchParams.get("v") !== "2") return null;
  if (url.searchParams.get("rev") !== CONTENT_VERSION) return null;
  const seedText = url.searchParams.get("seed");
  if (!seedText || !/^\d{1,10}$/.test(seedText)) return null;
  const seed = Number(seedText);
  if (seed < 1 || seed > 4294967295) return null;
  const options = (url.searchParams.get("d") ?? "standard").split(",");
  const difficulties =
    options.length === 1 ? [options[0], options[0], options[0]] : options;
  if (difficulties.length !== 3 || !difficulties.every(isDifficulty)) return null;
  const charm = url.searchParams.get("charm") ?? "none";
  if (!CHARMS.some((item) => item.id === charm)) return null;
  return {
    revision: CONTENT_VERSION,
    seed,
    difficulties: difficulties as Progress["difficulties"],
    charm: charm as Charm,
  };
}
export function challengeUrl(origin: string, progress: Progress) {
  const url = new URL("/game/one-more", origin);
  url.searchParams.set("v", "2");
  url.searchParams.set("rev", CONTENT_VERSION);
  url.searchParams.set("seed", String(progress.campaign.seed));
  url.searchParams.set("d", progress.difficulties.join(","));
  url.searchParams.set("charm", progress.charm);
  return url.toString();
}
