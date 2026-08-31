import {
  createNovelState,
  type NovelSetup,
  type NovelState,
} from "./novelEngine";
import {
  ensureWorldOpportunities,
  WorldOpportunity,
  type WuxiaCampaignState,
  type WuxiaContentRegistry,
} from "./wuxiaCampaign";
import { wuxiaDateFromDay } from "./wuxiaLife";

export const WUXIA_STORAGE_KEY_V7 = "wuxia-novel-save-v7";
export const WUXIA_STORAGE_KEY_V6 = "wuxia-novel-save-v6";

const SAVE_VERSION = 7 as const;
const MAX_WORLD_MOVEMENTS = 360;
const MAX_WORLD_ENCOUNTERS = 80;
const MAX_WORLD_RUMORS = 80;
const MAX_ACTOR_MEMORIES = 40;
const MAX_PROJECT_CONTRIBUTIONS = 80;
const MAX_TOURNAMENT_RECORDS = 120;
const MAX_ARCHIVE_HISTORY = 80;
const MAX_LOG_ENTRIES = 240;
const MAX_HISTORY_ENTRIES = 240;
const MAX_NARRATIVE_CHAPTERS = 80;
const MAX_ANNUAL_MILESTONES = 120;
const MAX_CAMPAIGN_LEADS = 120;
const MAX_WORLD_OPPORTUNITIES = 96;
const MAX_WORLD_SLOTS = 8;

export interface WuxiaWorldSlotV7 {
  id: string;
  label: string;
  activeProtagonistId: string;
  createdAt: number;
  updatedAt: number;
  game: NovelState;
}

export interface WuxiaSaveRootV7 {
  version: typeof SAVE_VERSION;
  activeWorldId?: string;
  worlds: WuxiaWorldSlotV7[];
}

type LegacyWorldOpportunityV6 = Omit<
  WorldOpportunity,
  "year" | "cycle" | "roundsWon" | "roundsRequired" | "eliminated" | "championActorId"
> & Partial<Pick<
  WorldOpportunity,
  "year" | "cycle" | "roundsWon" | "roundsRequired" | "eliminated" | "championActorId"
>>;

type LegacyCampaignStateV6 = Omit<WuxiaCampaignState, "opportunities"> & {
  opportunities: LegacyWorldOpportunityV6[];
};

type LegacyNovelStateV6 = Omit<NovelState, "version" | "life" | "chronicle" | "campaign"> & {
  version: 6;
  campaign: LegacyCampaignStateV6;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === "string" && value.length > 0
);

const isSetup = (value: unknown): value is NovelSetup => {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.heroName)
    && isNonEmptyString(value.origin)
    && isNonEmptyString(value.ambition)
    && isNonEmptyString(value.sectId)
    && typeof value.seed === "string";
};

const hasContentShape = (value: unknown) => {
  if (!isRecord(value)) return false;
  return Array.isArray(value.packs)
    && Array.isArray(value.agendas)
    && Array.isArray(value.activities)
    && Array.isArray(value.opportunities)
    && Array.isArray(value.characters)
    && Array.isArray(value.locations)
    && isRecord(value.rules);
};

const hasCampaignShape = (value: unknown) => {
  if (!isRecord(value)) return false;
  return value.version === 1
    && typeof value.phase === "string"
    && Array.isArray(value.leads)
    && Array.isArray(value.opportunities)
    && Array.isArray(value.availableActivities)
    && isRecord(value.factionKnowledge)
    && isRecord(value.legacy)
    && Array.isArray(value.installedPackIds);
};

const hasWorldShape = (value: unknown) => {
  if (!isRecord(value)) return false;
  return value.version === 2
    && isFiniteNumber(value.day)
    && Array.isArray(value.locations)
    && Array.isArray(value.actors)
    && Array.isArray(value.relations)
    && Array.isArray(value.martialArts)
    && Array.isArray(value.techniques)
    && Array.isArray(value.manuals)
    && Array.isArray(value.movements)
    && Array.isArray(value.encounters)
    && Array.isArray(value.rumors);
};

const hasNarrativeShape = (value: unknown) => {
  if (!isRecord(value)) return false;
  return value.mode === "emergent_sandbox"
    && isRecord(value.bible)
    && Array.isArray(value.cast)
    && Array.isArray(value.factions)
    && isRecord(value.martial)
    && Array.isArray(value.threads)
    && Array.isArray(value.chapters);
};

const hasLifeShape = (value: unknown) => {
  if (!isRecord(value)) return false;
  return value.version === 1
    && isNonEmptyString(value.protagonistId)
    && isFiniteNumber(value.generation)
    && isFiniteNumber(value.age)
    && isFiniteNumber(value.startedDay)
    && isRecord(value.household)
    && Array.isArray(value.annualMilestones);
};

const hasChronicleShape = (value: unknown) => {
  if (!isRecord(value)) return false;
  return value.version === 1
    && isNonEmptyString(value.worldId)
    && isNonEmptyString(value.label)
    && Array.isArray(value.projects)
    && Array.isArray(value.tournaments)
    && isRecord(value.ranking)
    && Array.isArray(value.protagonists);
};

const hasSharedNovelShape = (value: Record<string, unknown>) => (
  isSetup(value.setup)
  && isFiniteNumber(value.seed)
  && isFiniteNumber(value.rngState)
  && isFiniteNumber(value.turn)
  && isFiniteNumber(value.chapter)
  && isNonEmptyString(value.currentLocationId)
  && Array.isArray(value.locations)
  && Array.isArray(value.discoveredLocationIds)
  && isRecord(value.hero)
  && Array.isArray(value.companions)
  && isRecord(value.flags)
  && hasContentShape(value.content)
  && hasCampaignShape(value.campaign)
  && hasWorldShape(value.world)
  && hasNarrativeShape(value.narrative)
  && Array.isArray(value.log)
  && Array.isArray(value.history)
  && (value.currentEvent === null || isRecord(value.currentEvent))
);

const isNovelStateV7 = (value: unknown): value is NovelState => {
  if (!isRecord(value) || value.version !== 7) return false;
  return hasSharedNovelShape(value)
    && hasLifeShape(value.life)
    && hasChronicleShape(value.chronicle);
};

const isLegacyNovelStateV6 = (value: unknown): value is LegacyNovelStateV6 => {
  if (!isRecord(value) || value.version !== 6) return false;
  return hasSharedNovelShape(value);
};

const decodeJson = (raw: unknown): unknown => {
  if (typeof raw !== "string") return raw;
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const mergeById = <T extends { id: string }>(preferred: T[], additions: T[]) => {
  const ids = new Set(preferred.map((entry) => entry.id));
  return [
    ...preferred,
    ...additions.filter((entry) => !ids.has(entry.id)),
  ];
};

const mergeContent = (
  current: WuxiaContentRegistry,
  legacy: WuxiaContentRegistry,
): WuxiaContentRegistry => ({
  packs: mergeById(current.packs, legacy.packs),
  agendas: mergeById(current.agendas, legacy.agendas),
  activities: mergeById(current.activities, legacy.activities),
  opportunities: mergeById(current.opportunities, legacy.opportunities),
  characters: mergeById(current.characters, legacy.characters),
  locations: mergeById(current.locations, legacy.locations),
  rules: {
    ...current.rules,
    ...legacy.rules,
    inventTechnique: {
      ...current.rules.inventTechnique,
      ...legacy.rules.inventTechnique,
    },
    foundSect: {
      ...current.rules.foundSect,
      ...legacy.rules.foundSect,
    },
  },
});

const opportunityForV7 = (
  opportunity: LegacyWorldOpportunityV6,
  content: WuxiaContentRegistry,
): WorldOpportunity => {
  const template = content.opportunities.find((entry) => entry.id === opportunity.templateId);
  const startDay = Math.max(1, Math.floor(opportunity.startDay));
  const year = opportunity.year || Math.floor((startDay - 1) / 360) + 1;
  const repeatEveryYears = Math.max(1, template?.repeatEveryYears || 1);
  const cycle = opportunity.cycle || Math.floor((year - 1) / repeatEveryYears) + 1;
  const roundsRequired = opportunity.roundsRequired || template?.tournamentRounds;
  return {
    ...opportunity,
    year,
    cycle,
    ...(roundsRequired ? {
      roundsWon: opportunity.roundsWon || 0,
      roundsRequired,
    } : {}),
  };
};

const migrateLegacyGame = (legacy: LegacyNovelStateV6): NovelState => {
  const current = createNovelState(legacy.setup);
  const content = mergeContent(current.content, legacy.content);
  const migratedOpportunities = legacy.campaign.opportunities.map((opportunity) => (
    opportunityForV7(opportunity, content)
  ));
  const actorBirthdays = new Map(current.world.actors.map((actor) => [actor.id, actor.birthDay]));
  const world = {
    ...legacy.world,
    actors: legacy.world.actors.map((actor, index) => ({
      ...actor,
      birthDay: actor.birthDay
        ?? actorBirthdays.get(actor.id)
        ?? Math.max(1, legacy.world.day) - (18 + ((legacy.seed + index * 7) % 35)) * 360,
    })),
  };
  const currentYear = wuxiaDateFromDay(Math.max(1, legacy.world.day)).year;
  const participantActorIds = world.actors
    .filter((actor) => actor.id !== "hero" && !["死亡", "失踪"].includes(actor.activity))
    .map((actor) => actor.id);
  const opportunities = ensureWorldOpportunities(
    content,
    legacy.seed,
    participantActorIds,
    migratedOpportunities,
    currentYear + 1,
  );
  const knownOpportunityIds = new Set(legacy.campaign.leads.map((lead) => lead.opportunityId).filter(Boolean));
  const addedLeads = opportunities.filter((opportunity) => !knownOpportunityIds.has(opportunity.id)).map((opportunity) => ({
    id: `lead_${opportunity.id}`,
    kind: "opportunity" as const,
    title: opportunity.title,
    summary: `${opportunity.description}承平${opportunity.year}年开放。`,
    source: `${opportunity.organizer}传出的名帖`,
    status: "paused" as const,
    progress: 0,
    discoveredTurn: legacy.turn,
    discoveredDay: Math.max(1, legacy.world.day),
    targetLocationId: opportunity.locationId,
    opportunityId: opportunity.id,
    deadlineDay: opportunity.endDay,
  }));
  const life = {
    ...current.life,
    age: current.life.age + Math.max(0, currentYear - 1),
    startedDay: 1,
    startedYear: 1,
    status: legacy.ending ? "ending_preview" as const : "active" as const,
    ...(legacy.ending ? { chosenEndingId: "wandering_volume" } : {}),
  };
  return {
    ...current,
    ...legacy,
    version: 7,
    content,
    campaign: {
      ...current.campaign,
      ...legacy.campaign,
      opportunities,
      leads: [...legacy.campaign.leads, ...addedLeads],
    },
    life,
    chronicle: current.chronicle,
    world,
    narrative: legacy.narrative,
    log: legacy.log,
    history: legacy.history,
  };
};

const compactCampaignLeads = (leads: NovelState["campaign"]["leads"]) => {
  const ongoing = leads.filter((lead) => ["active", "paused"].includes(lead.status));
  if (ongoing.length >= MAX_CAMPAIGN_LEADS) return ongoing.slice(-MAX_CAMPAIGN_LEADS);
  const finished = leads.filter((lead) => !["active", "paused"].includes(lead.status));
  return [...ongoing, ...finished.slice(-(MAX_CAMPAIGN_LEADS - ongoing.length))];
};

export const compactWuxiaGame = (game: NovelState): NovelState => ({
  ...game,
  log: game.log.slice(-MAX_LOG_ENTRIES),
  history: game.history.slice(-MAX_HISTORY_ENTRIES),
  campaign: {
    ...game.campaign,
    leads: compactCampaignLeads(game.campaign.leads),
    opportunities: game.campaign.opportunities.slice(-MAX_WORLD_OPPORTUNITIES),
  },
  life: {
    ...game.life,
    annualMilestones: game.life.annualMilestones.slice(-MAX_ANNUAL_MILESTONES),
  },
  narrative: {
    ...game.narrative,
    chapters: game.narrative.chapters.slice(-MAX_NARRATIVE_CHAPTERS),
  },
  world: {
    ...game.world,
    actors: game.world.actors.map((actor) => ({
      ...actor,
      memories: actor.memories.slice(-MAX_ACTOR_MEMORIES),
    })),
    movements: game.world.movements.slice(-MAX_WORLD_MOVEMENTS),
    encounters: game.world.encounters.slice(-MAX_WORLD_ENCOUNTERS),
    rumors: game.world.rumors.slice(-MAX_WORLD_RUMORS),
  },
  chronicle: {
    ...game.chronicle,
    projects: game.chronicle.projects.map((project) => ({
      ...project,
      contributions: project.contributions.slice(-MAX_PROJECT_CONTRIBUTIONS),
    })),
    tournaments: game.chronicle.tournaments.slice(-MAX_TOURNAMENT_RECORDS),
    protagonists: game.chronicle.protagonists.map((protagonist) => ({
      ...protagonist,
      importantHistory: protagonist.importantHistory.slice(-MAX_ARCHIVE_HISTORY),
      knownRelationIds: Array.from(new Set(protagonist.knownRelationIds)),
    })),
  },
});

const normalizedTimestamp = (timestamp: number) => (
  Number.isFinite(timestamp) && timestamp >= 0 ? Math.floor(timestamp) : 0
);

const slotForGame = (
  game: NovelState,
  timestamp: number,
  previous?: WuxiaWorldSlotV7,
): WuxiaWorldSlotV7 => ({
  id: game.chronicle.worldId,
  label: game.chronicle.label,
  activeProtagonistId: game.life.protagonistId,
  createdAt: previous?.createdAt ?? normalizedTimestamp(timestamp),
  updatedAt: normalizedTimestamp(timestamp),
  game: compactWuxiaGame(game),
});

const isWorldSlotV7 = (value: unknown): value is WuxiaWorldSlotV7 => {
  if (!isRecord(value) || !isNovelStateV7(value.game)) return false;
  return isNonEmptyString(value.id)
    && value.id === value.game.chronicle.worldId
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.activeProtagonistId)
    && value.activeProtagonistId === value.game.life.protagonistId
    && isFiniteNumber(value.createdAt)
    && isFiniteNumber(value.updatedAt);
};

export const createSaveRoot = (
  game: NovelState,
  timestamp = Date.now(),
): WuxiaSaveRootV7 => {
  const world = slotForGame(game, timestamp);
  return {
    version: SAVE_VERSION,
    activeWorldId: world.id,
    worlds: [world],
  };
};

export const compactWuxiaSaveRoot = (root: WuxiaSaveRootV7): WuxiaSaveRootV7 => ({
  ...root,
  worlds: root.worlds.slice(0, MAX_WORLD_SLOTS).map((world) => ({
    ...world,
    game: compactWuxiaGame(world.game),
  })),
});

export const serializeWuxiaSaveRoot = (root: WuxiaSaveRootV7) => (
  JSON.stringify(compactWuxiaSaveRoot(root))
);

export const parseWuxiaSaveRoot = (
  raw: unknown,
  legacyRaw?: unknown,
): WuxiaSaveRootV7 | null => {
  const candidate = decodeJson(raw);
  if (isRecord(candidate) && candidate.version === SAVE_VERSION && Array.isArray(candidate.worlds)) {
    const worlds = candidate.worlds.filter(isWorldSlotV7);
    const uniqueWorlds = worlds.filter((world, index) => worlds.findIndex((entry) => entry.id === world.id) === index);
    if (uniqueWorlds.length) {
      const activeWorldId = typeof candidate.activeWorldId === "string" && uniqueWorlds.some((world) => world.id === candidate.activeWorldId)
        ? candidate.activeWorldId
        : uniqueWorlds[0].id;
      return compactWuxiaSaveRoot({ version: SAVE_VERSION, activeWorldId, worlds: uniqueWorlds });
    }
  }
  if (isNovelStateV7(candidate)) return createSaveRoot(candidate);
  if (isLegacyNovelStateV6(candidate)) return createSaveRoot(migrateLegacyGame(candidate));

  const legacyCandidate = decodeJson(legacyRaw);
  if (!isLegacyNovelStateV6(legacyCandidate)) return null;
  return createSaveRoot(migrateLegacyGame(legacyCandidate));
};

export const upsertWorldGame = (
  root: WuxiaSaveRootV7,
  game: NovelState,
  timestamp = Date.now(),
): WuxiaSaveRootV7 => {
  const id = game.chronicle.worldId;
  const previous = root.worlds.find((world) => world.id === id);
  const world = slotForGame(game, timestamp, previous);
  return {
    version: SAVE_VERSION,
    activeWorldId: id,
    worlds: [world, ...root.worlds.filter((entry) => entry.id !== id)],
  };
};

export const selectWorld = (
  root: WuxiaSaveRootV7,
  id: string,
): WuxiaSaveRootV7 => {
  if (!root.worlds.some((world) => world.id === id)) return root;
  return { ...root, activeWorldId: id };
};

export const removeWorld = (
  root: WuxiaSaveRootV7,
  id: string,
): WuxiaSaveRootV7 => {
  const worlds = root.worlds.filter((world) => world.id !== id);
  if (worlds.length === root.worlds.length) return root;
  const activeWorldId = root.activeWorldId === id ? worlds[0]?.id : root.activeWorldId;
  return {
    version: SAVE_VERSION,
    ...(activeWorldId ? { activeWorldId } : {}),
    worlds,
  };
};
