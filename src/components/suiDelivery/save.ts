import { ORDER } from "./content";
import { LEVELS, levelSwitches, levelUnlocked } from "./levels";
import type { DeliverySave } from "./types";
import { restoreHome } from "./home";

export function freshDeliverySave(): DeliverySave {
  return {
    version: 2,
    found: [],
    delivered: [],
    kindness: false,
    money: 0,
    home: { owned: [], displayed: [] },
    tray: "quick",
    hotBest: 0,
    hotMedal: false,
    records: {},
    resume: null,
    settings: { sound: true, assist: false, reducedMotion: false },
  };
}
export function readDeliverySave(raw: string | null): DeliverySave {
  const base = freshDeliverySave();
  try {
    const data = JSON.parse(raw || "null");
    if (!data || data.version !== 2) return base;
    base.found = LEVELS.flatMap((v) => v.pickups)
      .filter(
        (p) => p.kind !== "bread" &&
          Array.isArray(data.found) &&
          data.found.includes(p.id),
      )
      .map((p) => p.id);
    for (const level of LEVELS) {
      if (
        Array.isArray(data.delivered) &&
        data.delivered.includes(level.id) &&
        levelUnlocked(base, level.id)
      ) base.delivered.push(level.id);
      else break;
    }
    base.kindness = data.kindness === true;
    // Currency is derived from one-time discoveries, never trusted from storage.
    base.money =
      base.found.filter((id) => id.includes("coin")).length +
      LEVELS.filter((v) => base.delivered.includes(v.id)).reduce(
        (sum, v) => sum + v.reward,
        0,
      ) +
      (base.kindness ? 8 : 0);
    restoreHome(base, data.home);
    base.tray =
      data.tray === "wide" && base.found.includes("old-sign")
        ? "wide"
        : "quick";
    base.hotBest =
      typeof data.hotBest === "number" &&
      Number.isFinite(data.hotBest) &&
      data.hotBest > 0
        ? Math.min(86400, data.hotBest)
        : 0;
    base.hotMedal =
      base.delivered.length > 0 && base.hotBest > 0 && base.hotBest <= 95;
    for (const level of LEVELS) {
      if (!base.delivered.includes(level.id)) continue;
      const best =
        data.records?.[level.id]?.best ??
        (level.id === ORDER ? base.hotBest : 0);
      if (typeof best === "number" && Number.isFinite(best) && best > 0) base.records[level.id] = {
          best: Math.min(86400, best),
          medal: best <= level.hotLimit,
        };
    }
    base.settings = {
      sound: data.settings?.sound !== false,
      assist: data.settings?.assist === true,
      reducedMotion: data.settings?.reducedMotion === true,
    };
    const resumed = LEVELS.find((v) => v.id === (data.resume?.level || ORDER));
    if (
      resumed &&
      levelUnlocked(base, resumed.id) &&
      resumed.checkpoints.some((p) => p.id === data.resume?.checkpoint)
    ) base.resume = {
        checkpoint: data.resume.checkpoint,
        carrying: data.resume.carrying === true,
        level: resumed.id,
        switches: levelSwitches(resumed).filter((id) => Array.isArray(data.resume?.switches) && data.resume.switches.includes(id)),
        bossOff: !!(resumed.boss === "oven-crab" && data.resume.bossOff === true),
      };
    if (resumed?.boss === "serving-machine" && base.resume) {
      const switches = base.resume.switches || [];
      const firstMissing = resumed.gates.findIndex((gate) => !switches.includes(gate.id));
      base.resume.switches = resumed.gates.slice(0, firstMissing < 0 ? resumed.gates.length : firstMissing).map((gate) => gate.id);
    }
    if (resumed?.theater?.banquet && base.resume) {
      const order = ["banquet-heat", "banquet-crank", "banquet-crown", "banquet-served"];
      const firstMissing = order.findIndex(id => !base.resume?.switches?.includes(id));
      base.resume.switches = order.slice(0, firstMissing < 0 ? order.length : firstMissing);
    }
  } catch {
    return base;
  }
  return base;
}

/** Read the old record without ever writing it into the new campaign. */
export function legacyRecord(
  raw: string | null,
): { levels: number; stars: number } | null {
  try {
    const data = JSON.parse(raw || "null");
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const best = Array.isArray(data.best) ? data.best.slice(0, 4) : [];
    return {
      levels: best.filter(
        (b: { time?: number }) => typeof b?.time === "number" && b.time > 0,
      ).length,
      stars: best.reduce(
        (n: number, b: { stars?: string[] }) => n +
          new Set(
            Array.isArray(b?.stars)
              ? b.stars.filter((v) => ["star-0", "star-1", "star-2"].includes(v),)
              : [],
          ).size,
        0,
      ),
    };
  } catch {
    return null;
  }
}
