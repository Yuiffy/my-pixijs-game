import {
  createNovelState,
  type NovelSetup,
  type NovelState,
} from "./novelEngine";
import {
  ensureWorldOpportunities,
  refreshOpportunityStatuses,
  type CampaignLead,
  type WorldOpportunity,
} from "./wuxiaCampaign";
import {
  DAYS_PER_YEAR,
  createLifeState,
  wuxiaDateFromDay,
  type ProtagonistArchive,
  type WuxiaLifeState,
} from "./wuxiaLife";
import type {
  MartialTechniqueDef,
  WorldActor,
  WorldLocation,
  WorldManual,
  WorldMartialArt,
  WorldRelation,
  WuxiaWorldState,
} from "./worldSimulation";
import type { StoryCharacter } from "./storyArchitecture";

const ACTIVE_HERO_ID = "hero";
const MAX_ARCHIVED_HISTORY = 24;

const legendActorIdFor = (lifeId: string) => `legend_${lifeId}`;
const legendCharacterIdFor = (lifeId: string) => `protagonist_${lifeId}`;

const remapActorId = (actorId: string, legendActorId: string) => (
  actorId === ACTIVE_HERO_ID ? legendActorId : actorId
);

const relationKey = (relation: Pick<WorldRelation, "fromActorId" | "toActorId" | "type">) => (
  `${relation.fromActorId}|${relation.toActorId}|${relation.type}`
);

const cloneActor = (actor: WorldActor): WorldActor => ({
  ...actor,
  route: [...actor.route],
  routineLocationIds: [...actor.routineLocationIds],
  goals: actor.goals.map((goal) => ({ ...goal })),
  traits: [...actor.traits],
  techniques: actor.techniques.map((technique) => ({ ...technique })),
  memories: actor.memories.map((memory) => ({ ...memory, actorIds: [...memory.actorIds] })),
});

const cloneLocation = (location: WorldLocation): WorldLocation => ({
  ...location,
  connections: [...location.connections],
  tags: [...location.tags],
});

const cloneMartialArt = (art: WorldMartialArt): WorldMartialArt => ({
  ...art,
  techniqueIds: [...art.techniqueIds],
});

const cloneTechnique = (technique: MartialTechniqueDef): MartialTechniqueDef => ({
  ...technique,
  tags: [...technique.tags],
  counters: [...technique.counters],
});

const cloneManual = (manual: WorldManual): WorldManual => ({
  ...manual,
  techniqueIds: [...manual.techniqueIds],
});

const remapHousehold = (life: WuxiaLifeState, legendActorId: string): WuxiaLifeState => ({
  ...life,
  household: {
    swornSiblingActorIds: life.household.swornSiblingActorIds.map((actorId) => remapActorId(actorId, legendActorId)),
    partners: life.household.partners.map((partner) => ({
      ...partner,
      actorId: remapActorId(partner.actorId, legendActorId),
    })),
    children: life.household.children.map((child) => ({
      ...child,
      actorId: remapActorId(child.actorId, legendActorId),
      parentActorIds: child.parentActorIds.map((actorId) => remapActorId(actorId, legendActorId)) as [string, string],
    })),
    rites: life.household.rites.map((rite) => ({
      ...rite,
      actorIds: rite.actorIds.map((actorId) => remapActorId(actorId, legendActorId)),
    })),
  },
  annualMilestones: life.annualMilestones.map((milestone) => ({
    ...milestone,
    highlights: [...milestone.highlights],
  })),
  ...(life.pendingYearMilestone ? {
    pendingYearMilestone: {
      ...life.pendingYearMilestone,
      highlights: [...life.pendingYearMilestone.highlights],
    },
  } : {}),
});

const householdRelations = (
  game: NovelState,
  life: WuxiaLifeState,
  legendActorId: string,
): WorldRelation[] => {
  const relations: WorldRelation[] = [];
  const add = (
    fromActorId: string,
    toActorId: string,
    type: WorldRelation["type"],
    description: string,
    sinceDay: number,
  ) => {
    relations.push({
      id: `rel-${fromActorId}-${toActorId}-${type}`,
      fromActorId,
      toActorId,
      type,
      strength: 88,
      knownToHero: true,
      secret: false,
      description,
      sinceDay,
    });
  };

  life.household.swornSiblingActorIds.forEach((actorId) => {
    const actor = game.world.actors.find((entry) => entry.id === actorId);
    const description = `${game.hero.name}与${actor?.name || "一位故人"}曾在江湖中结为异姓手足。`;
    add(legendActorId, actorId, "sworn_sibling", description, game.world.day);
    add(actorId, legendActorId, "sworn_sibling", description, game.world.day);
  });

  life.household.partners.forEach((partner) => {
    const description = partner.kind === "spouse"
      ? `${game.hero.name}与${partner.name}曾合写婚书，共立家门。`
      : `${game.hero.name}与${partner.name}曾当面议定侧室名分。`;
    const relationType = partner.kind === "spouse" ? "spouse" : "concubine";
    add(legendActorId, partner.actorId, relationType, description, partner.sinceDay);
    add(partner.actorId, legendActorId, relationType, description, partner.sinceDay);
  });

  life.household.children.forEach((child) => {
    const parentIds = child.parentActorIds.map((actorId) => remapActorId(actorId, legendActorId));
    parentIds.forEach((parentActorId) => {
      const parent = parentActorId === legendActorId
        ? game.hero.name
        : game.world.actors.find((entry) => entry.id === parentActorId)?.name || "家中长辈";
      const description = `${child.name}是${parent}写入家门簿的子女。`;
      add(parentActorId, child.actorId, child.adopted ? "adoptive_parent" : "parent", description, child.birthDay);
      add(child.actorId, parentActorId, child.adopted ? "adoptive_child" : "child", description, child.birthDay);
    });
  });

  return relations;
};

const protagonistArchive = (
  game: NovelState,
  legendActorId: string,
  relations: WorldRelation[],
): ProtagonistArchive => ({
  id: `archive_${game.life.protagonistId}`,
  actorId: legendActorId,
  name: game.hero.name,
  epithet: game.hero.epithet,
  generation: game.life.generation,
  startedDay: game.life.startedDay,
  endedDay: game.world.day,
  age: game.life.age,
  endingId: game.life.chosenEndingId || "wandering_volume",
  endingTitle: game.ending?.title || "《路仍在人间》",
  endingSummary: game.ending?.summary || `${game.hero.name}暂时收住这一生的行路，作为旧日人物留在江湖中。`,
  ...(game.campaign.legacy.foundedSect ? { foundedSectName: game.campaign.legacy.foundedSect.name } : {}),
  partnerActorIds: game.life.household.partners.map((partner) => remapActorId(partner.actorId, legendActorId)),
  childActorIds: game.life.household.children.map((child) => remapActorId(child.actorId, legendActorId)),
  importantHistory: game.history.slice(-MAX_ARCHIVED_HISTORY).map((entry) => ({
    turn: entry.turn,
    title: entry.title,
    choice: entry.choice,
    success: entry.success,
  })),
  knownRelationIds: relations
    .filter((relation) => relation.knownToHero && (
      relation.fromActorId === legendActorId || relation.toActorId === legendActorId
    ))
    .map((relation) => relation.id),
});

export const archiveCurrentProtagonist = (game: NovelState): NovelState => {
  const legendActorId = legendActorIdFor(game.life.protagonistId);
  const legendCharacterId = legendCharacterIdFor(game.life.protagonistId);
  const stableHomeFactionId = game.setup.sectId === "none" || game.setup.sectId === "home"
    ? `home_${game.life.protagonistId}`
    : game.setup.sectId;
  const alreadyArchived = game.chronicle.protagonists.some((entry) => entry.actorId === legendActorId);
  const activeHero = game.world.actors.find((actor) => actor.id === ACTIVE_HERO_ID);
  if (alreadyArchived && !activeHero) return game;

  const actors = game.world.actors.map((sourceActor) => {
    const actor = cloneActor(sourceActor);
    actor.id = remapActorId(actor.id, legendActorId);
    actor.factionId = actor.factionId === "home" ? stableHomeFactionId : actor.factionId;
    actor.goals = actor.goals.map((goal) => ({
      ...goal,
      ...(goal.targetActorId !== undefined ? {
        targetActorId: remapActorId(goal.targetActorId, legendActorId),
      } : {}),
    }));
    actor.techniques = actor.techniques.map((technique) => ({
      ...technique,
      ...(technique.witnessedFromActorId !== undefined ? {
        witnessedFromActorId: remapActorId(technique.witnessedFromActorId, legendActorId),
      } : {}),
    }));
    actor.memories = actor.memories.map((memory) => ({
      ...memory,
      actorIds: memory.actorIds.map((actorId) => remapActorId(actorId, legendActorId)),
    }));
    if (sourceActor.id !== ACTIVE_HERO_ID) return actor;

    const endingTitle = game.ending?.title || "这一生暂且封卷";
    return {
      ...actor,
      characterId: legendCharacterId,
      title: game.hero.epithet || "前代侠客",
      role: `上一代执卷人，曾以“${endingTitle}”为自己的行路收笔，如今仍可被后来者拜访。`,
      factionId: game.hero.sectId === "none" || game.hero.sectId === "hero" ? legendActorId : stableHomeFactionId,
      locationId: game.currentLocationId,
      homeLocationId: actor.homeLocationId || game.currentLocationId,
      destinationId: undefined,
      route: [],
      activity: "停留" as const,
      stayUntilDay: game.world.day + 30,
      routineLocationIds: Array.from(new Set([game.currentLocationId, actor.homeLocationId, ...actor.routineLocationIds])),
      goals: [{
        kind: "归家" as const,
        targetLocationId: actor.homeLocationId || game.currentLocationId,
        reason: "封卷之后留在旧日江湖，偶尔见故人，也等待后来者来访",
        priority: 48,
      }],
      traits: Array.from(new Set([...actor.traits, "前代主角", "可被后人拜访"])),
      memories: [...actor.memories, {
        day: game.world.day,
        kind: "离别" as const,
        text: `${game.hero.name}以“${endingTitle}”为这一生收笔，却没有从世界中消失。`,
        actorIds: [legendActorId],
        locationId: game.currentLocationId,
      }],
    };
  });

  const remappedRelations = game.world.relations.map((relation) => {
    const fromActorId = remapActorId(relation.fromActorId, legendActorId);
    const toActorId = remapActorId(relation.toActorId, legendActorId);
    return {
      ...relation,
      id: fromActorId === relation.fromActorId && toActorId === relation.toActorId
        ? relation.id
        : `rel-${fromActorId}-${toActorId}-${relation.type}`,
      fromActorId,
      toActorId,
    };
  });
  const relationKeys = new Set(remappedRelations.map(relationKey));
  householdRelations(game, game.life, legendActorId).forEach((relation) => {
    const key = relationKey(relation);
    if (!relationKeys.has(key)) {
      remappedRelations.push(relation);
      relationKeys.add(key);
    }
  });

  const archive = protagonistArchive(game, legendActorId, remappedRelations);
  const protagonists = alreadyArchived
    ? game.chronicle.protagonists.map((entry) => (entry.actorId === legendActorId ? archive : { ...entry }))
    : [...game.chronicle.protagonists.map((entry) => ({ ...entry })), archive];

  const legendCharacter: StoryCharacter = {
    id: legendCharacterId,
    rosterId: legendCharacterId,
    sourcePackId: "open-jianghu-life",
    name: game.hero.name,
    sourceName: game.hero.name,
    title: game.hero.epithet || "前代侠客",
    factionId: game.hero.sectId === "none" || game.hero.sectId === "hero" ? legendActorId : stableHomeFactionId,
    circles: ["历代主角", "江湖故人"],
    role: "已经封卷、仍生活在同一江湖中的前代主角",
    desire: "看后来者如何续写这个世界，而不替他们作答",
    fear: "旧日声名遮住后来者自己的选择",
    secret: game.ending?.summary || "这位旧人仍保留一些未向后辈讲完的往事。",
    signatureMove: game.campaign.legacy.authoredTechniques[0]?.name || game.hero.art,
    signatureDescription: game.campaign.legacy.authoredTechniques[0]?.description || `${game.hero.name}把一生所学收在这一式里。`,
    secretRevealed: false,
    portrait: "/images/autochess/portraits/sui.png",
    romanceable: false,
    status: "未谋面",
    relationship: { trust: 8, affection: 0, debt: 0, grievance: 0, loyalty: 6, label: "陌路" },
  };

  return {
    ...game,
    life: remapHousehold(game.life, legendActorId),
    campaign: {
      ...game.campaign,
      opportunities: game.campaign.opportunities.map((opportunity) => ({
        ...opportunity,
        ...(opportunity.championActorId === ACTIVE_HERO_ID ? { championActorId: legendActorId } : {}),
      })),
      factionKnowledge: Object.fromEntries(Object.entries(game.campaign.factionKnowledge).map(([factionId, knowledge]) => {
        const nextFactionId = factionId === "home" ? stableHomeFactionId : factionId;
        return [nextFactionId, { ...knowledge, factionId: nextFactionId }];
      })),
    },
    world: {
      ...game.world,
      // The world type still models only an active run; this archived transition has no active hero.
      heroActorId: legendActorId as WuxiaWorldState["heroActorId"],
      actors,
      relations: remappedRelations,
      locations: game.world.locations.map(cloneLocation),
      martialArts: game.world.martialArts.map((art) => ({
        ...cloneMartialArt(art),
        factionId: art.factionId === ACTIVE_HERO_ID
          ? legendActorId
          : art.factionId === "home" ? stableHomeFactionId : art.factionId,
      })),
      techniques: game.world.techniques.map(cloneTechnique),
      manuals: game.world.manuals.map((manual) => ({
        ...cloneManual(manual),
        ...(manual.ownerActorId !== undefined ? {
          ownerActorId: remapActorId(manual.ownerActorId, legendActorId),
        } : {}),
      })),
      movements: game.world.movements.map((movement) => ({
        ...movement,
        actorId: remapActorId(movement.actorId, legendActorId),
      })),
      encounters: game.world.encounters.map((encounter) => ({
        ...encounter,
        actorIds: encounter.actorIds.map((actorId) => remapActorId(actorId, legendActorId)),
      })),
      rumors: game.world.rumors.map((rumor) => ({ ...rumor, reachedLocationIds: [...rumor.reachedLocationIds] })),
      ...(game.world.lastTransition ? {
        lastTransition: {
          ...game.world.lastTransition,
          heroPath: [...game.world.lastTransition.heroPath],
          presentActorIds: game.world.lastTransition.presentActorIds.map((actorId) => remapActorId(actorId, legendActorId)),
          movementIds: game.world.lastTransition.movementIds.map((movementId) => (
            movementId.replace(/(^|-)hero(?=-|$)/g, `$1${legendActorId}`)
          )),
        },
      } : {}),
    },
    chronicle: {
      ...game.chronicle,
      projects: game.chronicle.projects.map((project) => ({
        ...project,
        ...(project.targetActorId !== undefined ? {
          targetActorId: remapActorId(project.targetActorId, legendActorId),
        } : {}),
        contributions: project.contributions.map((contribution) => ({ ...contribution })),
      })),
      tournaments: game.chronicle.tournaments.map((record) => ({
        ...record,
        protagonistId: record.protagonistId || game.life.protagonistId,
        ...(record.championActorId !== undefined ? {
          championActorId: remapActorId(record.championActorId, legendActorId),
        } : {}),
      })),
      ranking: {
        ...game.chronicle.ranking,
        ...(game.chronicle.ranking.holderActorId !== undefined ? {
          holderActorId: remapActorId(game.chronicle.ranking.holderActorId, legendActorId),
        } : {}),
      },
      protagonists,
    },
    narrative: {
      ...game.narrative,
      cast: game.narrative.cast.some((character) => character.id === legendCharacterId)
        ? game.narrative.cast.map((character) => ({
          ...character,
          factionId: character.factionId === "home" ? stableHomeFactionId : character.factionId,
          relationship: { ...character.relationship },
        }))
        : [...game.narrative.cast.map((character) => ({
          ...character,
          factionId: character.factionId === "home" ? stableHomeFactionId : character.factionId,
          relationship: { ...character.relationship },
        })), legendCharacter],
      factions: game.narrative.factions.map((faction) => ({
        ...faction,
        id: faction.id === "home" ? stableHomeFactionId : faction.id,
      })),
    },
  };
};

const mergeLocations = (existing: WorldLocation[], additions: WorldLocation[]) => {
  const additionsById = new Map(additions.map((location) => [location.id, location]));
  const merged = existing.map((location) => {
    const addition = additionsById.get(location.id);
    if (!addition) return cloneLocation(location);
    additionsById.delete(location.id);
    return {
      ...cloneLocation(location),
      connections: Array.from(new Set([...location.connections, ...addition.connections])),
      tags: Array.from(new Set([...location.tags, ...addition.tags])),
    };
  });
  return [...merged, ...Array.from(additionsById.values(), cloneLocation)];
};

const mergeById = <T extends { id: string }>(existing: T[], additions: T[], clone: (entry: T) => T) => {
  const ids = new Set(existing.map((entry) => entry.id));
  return [
    ...existing.map(clone),
    ...additions.filter((entry) => !ids.has(entry.id)).map(clone),
  ];
};

const opportunityLead = (opportunity: WorldOpportunity, worldDay: number): CampaignLead => ({
  id: `lead_${opportunity.id}`,
  kind: "opportunity",
  title: opportunity.title,
  summary: `${opportunity.description}地点在${opportunity.locationId}，第${opportunity.startDay}日至第${opportunity.endDay}日开放。`,
  source: `${opportunity.organizer}传出的新一届名帖`,
  status: "paused",
  progress: 0,
  discoveredTurn: 0,
  discoveredDay: worldDay,
  targetLocationId: opportunity.locationId,
  opportunityId: opportunity.id,
  deadlineDay: opportunity.endDay,
});

const legendLead = (actor: WorldActor, worldDay: number): CampaignLead => ({
  id: `lead_person_${actor.id}`,
  kind: "person",
  title: `拜访${actor.name}`,
  summary: `${actor.name}是仍生活在这个世界里的前代执卷人；可以寻访、讨教，也可以只听一段旧事。`,
  source: "历代人物谱",
  status: "paused",
  progress: 0,
  discoveredTurn: 0,
  discoveredDay: worldDay,
  targetActorId: actor.id,
  targetLocationId: actor.locationId,
  intent: "observe",
});

const descendantLead = (actor: WorldActor, worldDay: number): CampaignLead => ({
  id: `lead_person_${actor.id}`,
  kind: "person",
  title: `寻访${actor.name}`,
  summary: `${actor.name}是这个世界里真实长成的家门后辈，如今已有自己的住处、行程与志向。`,
  source: "家门旧簿",
  status: "paused",
  progress: 0,
  discoveredTurn: 0,
  discoveredDay: worldDay,
  targetActorId: actor.id,
  targetLocationId: actor.locationId,
  intent: "observe",
});

const resetLegacyCharacter = (character: NovelState["narrative"]["cast"][number]) => ({
  ...character,
  status: "未谋面" as const,
  secretRevealed: false,
  firstSeenTurn: undefined,
  lastSeenTurn: undefined,
  relationship: {
    trust: 8,
    affection: 4,
    debt: 0,
    grievance: 0,
    loyalty: 4,
    label: "陌路" as const,
  },
});

export const createSuccessorState = (
  previous: NovelState,
  setup: Partial<NovelSetup> = {},
): NovelState => {
  const archived = previous.world.actors.some((actor) => actor.id === ACTIVE_HERO_ID)
    ? archiveCurrentProtagonist(previous)
    : previous;
  const generation = archived.life.generation + 1;
  const stableSetup: Partial<NovelSetup> = {
    heroName: setup.heroName || `承世${generation}`,
    origin: setup.origin || archived.setup.origin,
    ambition: setup.ambition || archived.setup.ambition,
    ...(setup.sectId ? { sectId: setup.sectId } : {}),
    seed: setup.seed || `${archived.setup.seed}:generation:${generation}`,
  };
  const fresh = createNovelState(stableSetup);
  const worldDay = Math.max(1, archived.world.day);
  const life = createLifeState(fresh.seed, worldDay, generation);
  const idPrefix = `${life.protagonistId}_`;
  const heroTechniqueIds = new Set(fresh.narrative.martial.techniques.map((technique) => technique.id));
  const heroArtIds = new Set(fresh.world.martialArts
    .filter((art) => art.id.startsWith("art_hero") || art.techniqueIds.some((techniqueId) => heroTechniqueIds.has(techniqueId)))
    .map((art) => art.id));
  const techniqueId = (id: string) => (heroTechniqueIds.has(id) ? `${idPrefix}${id}` : id);
  const artId = (id: string) => (heroArtIds.has(id) ? `${idPrefix}${id}` : id);

  const freshHero = fresh.world.actors.find((actor) => actor.id === ACTIVE_HERO_ID);
  if (!freshHero) throw new Error("创建继任主角时缺少 active hero actor");
  const successorHero: WorldActor = {
    ...cloneActor(freshHero),
    id: ACTIVE_HERO_ID,
    stayUntilDay: worldDay,
    birthDay: worldDay - life.age * DAYS_PER_YEAR,
    techniques: freshHero.techniques.map((technique) => ({
      ...technique,
      techniqueId: techniqueId(technique.techniqueId),
      learnedDay: worldDay,
    })),
    memories: [],
  };

  const rekeyedFreshActors = fresh.world.actors
    .filter((actor) => actor.id !== ACTIVE_HERO_ID)
    .map((actor) => ({
      ...cloneActor(actor),
      stayUntilDay: Math.max(worldDay, actor.stayUntilDay),
      techniques: actor.techniques.map((known) => ({
        ...known,
        techniqueId: techniqueId(known.techniqueId),
        learnedDay: known.learnedDay || worldDay,
      })),
      memories: actor.memories.map((memory) => ({ ...memory, actorIds: [...memory.actorIds] })),
    }));
  const actors = mergeById(archived.world.actors, rekeyedFreshActors, cloneActor);
  actors.unshift(successorHero);

  const freshRelations = fresh.world.relations.map((relation) => ({ ...relation }));
  const existingRelationKeys = new Set(archived.world.relations.map(relationKey));
  const relations = [
    ...archived.world.relations.map((relation) => ({ ...relation })),
    ...freshRelations.filter((relation) => !existingRelationKeys.has(relationKey(relation))),
  ];

  const freshTechniques = fresh.world.techniques.map((technique) => ({
    ...cloneTechnique(technique),
    id: techniqueId(technique.id),
    artId: artId(technique.artId),
  }));
  const freshArts = fresh.world.martialArts.map((art) => ({
    ...cloneMartialArt(art),
    id: artId(art.id),
    techniqueIds: art.techniqueIds.map(techniqueId),
  }));
  const freshManuals = fresh.world.manuals.map((manual) => ({
    ...cloneManual(manual),
    artId: artId(manual.artId),
    techniqueIds: manual.techniqueIds.map(techniqueId),
  }));
  const locations = mergeLocations(archived.world.locations, fresh.world.locations);
  const world: WuxiaWorldState = {
    ...archived.world,
    heroActorId: ACTIVE_HERO_ID,
    day: worldDay,
    locations,
    actors,
    relations,
    martialArts: mergeById(archived.world.martialArts, freshArts, cloneMartialArt),
    techniques: mergeById(archived.world.techniques, freshTechniques, cloneTechnique),
    manuals: mergeById(archived.world.manuals, freshManuals, cloneManual),
    movements: archived.world.movements.map((movement) => ({ ...movement })),
    encounters: archived.world.encounters.map((encounter) => ({ ...encounter, actorIds: [...encounter.actorIds] })),
    rumors: archived.world.rumors.map((rumor) => ({ ...rumor, reachedLocationIds: [...rumor.reachedLocationIds] })),
    lastTransition: undefined,
  };

  const currentYear = wuxiaDateFromDay(worldDay, archived.chronicle.eraName).year;
  const participantActorIds = world.actors
    .filter((actor) => actor.id !== ACTIVE_HERO_ID && !["死亡", "失踪"].includes(actor.activity))
    .map((actor) => actor.id);
  const opportunities = refreshOpportunityStatuses(ensureWorldOpportunities(
    archived.content,
    archived.seed,
    participantActorIds,
    archived.campaign.opportunities,
    currentYear + 1,
  ), worldDay);
  const leadOpportunityIds = new Set(fresh.campaign.leads
    .map((lead) => lead.opportunityId)
    .filter((id): id is string => Boolean(id)));
  const leads = [
    ...fresh.campaign.leads.map((lead) => ({ ...lead })),
    ...actors.filter((actor) => actor.traits.includes("前代主角")).map((actor) => legendLead(actor, worldDay)),
    ...actors.filter((actor) => (
      actor.id.startsWith("child_")
      && !actor.traits.includes("年幼")
      && Boolean(actor.characterId)
    )).map((actor) => descendantLead(actor, worldDay)),
    ...opportunities
      .filter((opportunity) => !leadOpportunityIds.has(opportunity.id))
      .map((opportunity) => opportunityLead(opportunity, worldDay)),
  ];

  const freshCharacterIds = new Set(fresh.narrative.cast.map((character) => character.id));
  const cast = [
    ...fresh.narrative.cast.map((character) => ({ ...character, relationship: { ...character.relationship } })),
    ...archived.narrative.cast
      .filter((character) => !freshCharacterIds.has(character.id))
      .map(resetLegacyCharacter),
  ];
  const freshFactionIds = new Set(fresh.narrative.factions.map((faction) => faction.id));
  const factions = [
    ...fresh.narrative.factions.map((faction) => ({ ...faction })),
    ...archived.narrative.factions
      .filter((faction) => !freshFactionIds.has(faction.id))
      .map((faction) => ({ ...faction })),
  ];
  const narrative = {
    ...fresh.narrative,
    cast,
    factions,
    martial: {
      ...fresh.narrative.martial,
      signatureTechniqueId: techniqueId(fresh.narrative.martial.signatureTechniqueId),
      techniques: fresh.narrative.martial.techniques.map((technique) => ({
        ...technique,
        id: techniqueId(technique.id),
      })),
    },
  };

  return {
    ...fresh,
    version: 7,
    seed: archived.seed,
    currentLocationId: successorHero.locationId,
    locations,
    discoveredLocationIds: [successorHero.locationId],
    content: archived.content,
    campaign: {
      ...fresh.campaign,
      phase: "choose_agenda",
      leads,
      opportunities,
      availableActivities: [],
      installedPackIds: [...archived.campaign.installedPackIds],
    },
    life,
    chronicle: {
      ...archived.chronicle,
      projects: archived.chronicle.projects.map((project) => ({
        ...project,
        contributions: project.contributions.map((contribution) => ({ ...contribution })),
      })),
      tournaments: archived.chronicle.tournaments.map((record) => ({ ...record })),
      ranking: { ...archived.chronicle.ranking, heroBest: "旁观" },
      protagonists: archived.chronicle.protagonists.map((entry) => ({
        ...entry,
        partnerActorIds: [...entry.partnerActorIds],
        childActorIds: [...entry.childActorIds],
        importantHistory: entry.importantHistory.map((history) => ({ ...history })),
        knownRelationIds: [...entry.knownRelationIds],
      })),
    },
    world,
    narrative,
    currentEvent: null,
    eventDirector: undefined,
    pendingOutcome: undefined,
    ending: undefined,
  };
};
