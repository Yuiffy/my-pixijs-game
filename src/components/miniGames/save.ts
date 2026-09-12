import { GameState } from "./scene";
import { createAi, AI_STYLES } from "./agiEngine";
import { AI_COMPANIES, AI_INDUSTRY_EVENTS, AiCompanyId } from "./agiIndustry";
import { createFab, FAB_STYLES } from "./fabEngine";
import { createSnack, SNACK_LEVELS } from "./snackEngine";

function shape(value: unknown, reference: unknown): boolean {
  if (reference === null) return (
      value === null ||
      (!!value &&
        typeof value === "object" &&
        "title" in value &&
        typeof value.title === "string" &&
        "text" in value &&
        typeof value.text === "string" &&
        "won" in value &&
        typeof value.won === "boolean")
    );
  if (typeof reference === "number") return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Math.abs(value) < Number.MAX_SAFE_INTEGER
    );
  if (Array.isArray(reference)) return (
      Array.isArray(value) &&
      value.length <= 100 &&
      (!reference.length || value.every((item) => shape(item, reference[0])))
    );
  if (typeof reference === "object") return (
      !!value &&
      typeof value === "object" &&
      Object.entries(reference).every(([key, item]) => shape((value as Record<string, unknown>)[key], item),)
    );
  return typeof value === typeof reference;
}
export function readGameSave(
  raw: string | null,
  kind: GameState["kind"],
): GameState | null {
  if (!raw) return null;
  try {
    let value = JSON.parse(raw);
    if (
      kind === "agi" &&
      value?.kind === "agi" &&
      value.version === 1 &&
      AI_STYLES.some((s) => s.id === value.style)
    ) {
      if (!Array.isArray(value.rivals) || value.rivals.length !== 3) return null;
      const defaults = createAi(value.seed, value.style);
      value = {
        ...defaults,
        ...value,
        version: 2,
        industry: defaults.industry,
        rivals: defaults.rivals.map((r, index) => ({
          ...r,
          capability: value.rivals[index % 3].capability,
          product: value.rivals[index % 3].product,
          safety: value.rivals[index % 3].safety,
        })),
      };
    }
    const reference =
      kind === "agi"
        ? createAi()
        : kind === "fab"
          ? createFab()
          : createSnack();
    if (
      value.kind !== kind ||
      value.version !== reference.version ||
      !shape(value, reference)
    ) return null;
    if (kind === "agi") {
      if (
        !AI_STYLES.some((s) => s.id === value.style) ||
        value.rivals.length !== AI_COMPANIES.length - 1 ||
        value.turn < 1 ||
        value.turn > 20 ||
        value.event < 0 ||
        value.event > 4 ||
        !Number.isInteger(value.event) ||
        value.compute < 1 ||
        value.compute > 8
      ) return null;
      const i = value.industry;
      if (
        !AI_COMPANIES.some((c) => c.id === i.company) ||
        !["research", "balanced", "consumer"].includes(i.service) ||
        !AI_INDUSTRY_EVENTS.some((e) => e.id === i.eventId) ||
        !value.rivals.some(
          (r: { company: AiCompanyId }) => r.company === i.teacher,
        ) ||
        value.rivals.some(
          (r: { company: AiCompanyId }) => r.company === i.company ||
            !AI_COMPANIES.some((c) => c.id === r.company),
        ) ||
        new Set(value.rivals.map((r: { company: AiCompanyId }) => r.company))
          .size !== value.rivals.length ||
        ["reliability", "video", "ecosystem", "hype", "samples"].some(
          (key) => i[key] < 0 || i[key] > 100,
        ) ||
        i.defense < 0 ||
        i.defense > 5 ||
        i.scrutiny < 0 ||
        i.scrutiny > 2
      ) return null;
    } else if (kind === "fab") {
      if (
        !FAB_STYLES.some((s) => s.id === value.player.style) ||
        value.rivals.length !== 3 ||
        value.turn < 1 ||
        value.turn > 24 ||
        !Number.isInteger(value.cycle) ||
        value.cycle < 0 ||
        value.cycle > 3 ||
        value.player.fabs < 1 ||
        value.player.fabs > 5
      ) return null;
      if (
        ![0, 0.5, 1].includes(value.production) ||
        ![0, 0.5, 1].includes(value.shipment) ||
        ![0.85, 1, 1.2].includes(value.pricing)
      ) return null;
    } else {
      if (
        !Number.isInteger(value.level) ||
        value.level < 0 ||
        value.level >= SNACK_LEVELS.length ||
        value.remaining.length !== 4 ||
        value.best.length !== 5 ||
        !["ready", "playing", "paused", "won", "lost", "ending"].includes(
          value.phase,
        )
      ) return null;
      if (
        !Number.isInteger(value.selected) ||
        value.selected < 0 ||
        value.selected >= 4 ||
        value.remaining.some(
          (n: number, i: number) => !Number.isInteger(n) ||
            n < 0 ||
            n > SNACK_LEVELS[value.level].counts[i],
        )
      ) return null;
      if (value.phase === "playing") value.phase = "paused";
      value.inputs = { talk: false, eat: false, mute: false };
    }
    return value;
  } catch {
    return null;
  }
}
