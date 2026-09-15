import { GameState } from "./scene";
import { createAi, AI_STYLES, AiRival } from "./agiEngine";
import { AI_DIFFICULTIES, initialCompetition, rivalCompetitionDefaults, AiCompetitionEntry } from './agiCompetition';
import { AI_COMPANIES, AI_INDUSTRY_EVENTS, AiCompanyId, aiCompany, normalizeAiDisplayText } from "./agiIndustry";
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
      value.length <= 200 &&
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
      const defaults = createAi(value.seed, value.style, undefined, 'relaxed');
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
    if (kind === 'agi' && value?.version === 2 && value.industry && value.industry.distillTeacher === undefined) {
      value.industry.distillTeacher = value.industry.teacher;
    }
    if (kind === 'agi' && value?.kind === 'agi' && value.version === 2) {
      if (!value.industry || !AI_COMPANIES.some(c => c.id === value.industry.company) || !Array.isArray(value.rivals)
        || !value.rivals.every((r: AiRival) => AI_COMPANIES.some(c => c.id === r.company))) return null;
      value = { ...value,
version: 3,
difficulty: 'relaxed',
        competition: { ...initialCompetition(value.industry.company), publishedOpen: value.openness, openCapability: value.openness ? value.product : 0 },
        rivals: value.rivals.map((r: AiRival) => ({ ...r, ...rivalCompetitionDefaults('relaxed', r.company) })),
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
        !value.rivals.some((r: { company: AiCompanyId }) => r.company === i.distillTeacher) ||
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
      const { competition } = value;
      if (!AI_DIFFICULTIES.some(d => d.id === value.difficulty)
        || !value.rivals.some((r: AiRival) => r.company === competition.target)
        || !Number.isInteger(competition.sequence) || competition.sequence < 0
        || competition.openCapability < 0 || competition.openCapability > 100
        || competition.feed.length > 160
        || new Set(competition.feed.map((entry: AiCompetitionEntry) => entry.id)).size !== competition.feed.length
        || competition.feed.some((entry: AiCompetitionEntry) => !entry || typeof entry.id !== 'string' || !entry.id
          || !Number.isInteger(entry.turn) || entry.turn < 1 || entry.turn > value.turn
          || !AI_COMPANIES.some(c => c.id === entry.actor) || !AI_COMPANIES.some(c => c.id === entry.target)
          || !['kind', 'text', 'effect', 'response', 'basis'].every(field => typeof entry[field as keyof AiCompetitionEntry] === 'string')
          || typeof entry.amount !== 'number' || !Number.isFinite(entry.amount))
        || value.rivals.some((r: AiRival) => r.cash < 0 || r.compute < 1 || r.compute > 8 || r.efficiency < 0 || r.efficiency > 5 || r.funding < 0 || r.funding > 3 || r.reputation < 0 || r.reputation > 100)) return null;
      value.rivals = value.rivals.map((r: AiRival) => ({ ...r, name: aiCompany(r.company).name, focus: aiCompany(r.company).playstyle, latest: normalizeAiDisplayText(r.latest) }));
      value.logs = value.logs.map((entry: { turn: number; text: string }) => ({ ...entry, text: normalizeAiDisplayText(entry.text) }));
      value.industry.statement = normalizeAiDisplayText(value.industry.statement);
      value.industry.eventChoice = normalizeAiDisplayText(value.industry.eventChoice);
      value.competition.feed = value.competition.feed.map((entry: AiCompetitionEntry) => ({ ...entry, text: normalizeAiDisplayText(entry.text), effect: normalizeAiDisplayText(entry.effect), basis: normalizeAiDisplayText(entry.basis) }));
      if (value.ending) value.ending = { ...value.ending, title: normalizeAiDisplayText(value.ending.title), text: normalizeAiDisplayText(value.ending.text) };
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
