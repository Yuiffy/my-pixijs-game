import type { Person, Relation, SnippetResult } from "../logic/types";
import { StoryStage } from "../logic/types";
import type { WuxiaWorld } from "./world";

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

export function mergeSnippetNpcs(
  world: WuxiaWorld,
  result: SnippetResult,
): WuxiaWorld {
  const additions = asArray(result.addNpc).filter((npc): npc is Person => Boolean(npc),);
  if (!additions.length) return world;

  const npcs = [...world.npcs];
  additions.forEach((npc) => {
    const existingIndex = npcs.findIndex((existing) => existing.id === npc.id);
    if (existingIndex < 0) {
      npcs.push(npc);
      return;
    }
    const existing = npcs[existingIndex];
    npcs[existingIndex] = {
      ...existing,
      ...npc,
      relations: npc.relations || existing.relations,
      inventory: npc.inventory || existing.inventory,
      flags: npc.flags || existing.flags,
      arts: npc.arts || existing.arts,
      knowledge: npc.knowledge || existing.knowledge,
    };
  });
  return { ...world, npcs };
}

function updateRelation(relations: Relation[], relation: Relation) {
  const existingIndex = relations.findIndex(
    (entry) => entry.targetId === relation.targetId,
  );
  if (existingIndex >= 0) relations[existingIndex] = relation;
  else relations.push(relation);
}

function updateHero(hero: Person, result: SnippetResult): Person {
  const inventory = [...hero.inventory];
  const arts = [...hero.arts];
  const knowledge = [...hero.knowledge];
  const relations = [...hero.relations];
  const flags = { ...hero.flags };

  if (result.addItem) inventory.push(result.addItem);
  if (result.removeItem) {
    const index = inventory.indexOf(result.removeItem);
    if (index >= 0) inventory.splice(index, 1);
  }
  result.addRelations?.forEach((relation) => updateRelation(relations, relation),);
  Object.entries(result.addFlags || {}).forEach(([key, value]) => {
    flags[key] = value ?? true;
  });
  result.removeFlags?.forEach((flag) => {
    delete flags[flag];
  });
  if (result.addArt) arts.push(result.addArt);
  if (result.addKnowledge) knowledge.push(result.addKnowledge);

  return {
    ...hero,
    inventory,
    arts,
    knowledge,
    relations,
    flags,
    locationId: result.newLocationId || hero.locationId,
  };
}

export interface AppliedSnippetResult {
  world: WuxiaWorld;
  advancedStage: StoryStage | null;
}

export function applySnippetWorldResult(
  world: WuxiaWorld,
  result: SnippetResult,
): AppliedSnippetResult {
  let npcs = world.npcs.map((npc) => (npc.id === world.heroId ? updateHero(npc, result) : npc),);

  asArray(result.setNpcStatus).forEach((update) => {
    npcs = npcs.map((npc) => (npc.id === update.id
        ? {
            ...npc,
            status: update.status,
            flags: {
              ...npc.flags,
              isDead: update.status === "dead" ? true : undefined,
            },
          }
        : npc),);
  });

  let party = [...world.party];
  asArray(result.addToParty).forEach((memberId) => {
    if (!party.includes(memberId)) party.push(memberId);
  });

  const legacyCompanion = (result as SnippetResult & { setCompanion?: string })
    .setCompanion;
  if (legacyCompanion && !party.includes(legacyCompanion)) {
    party.push(legacyCompanion);
  }

  const removedNpcIds = asArray(result.removeFromWorld);
  if (removedNpcIds.length) {
    npcs = npcs.filter((npc) => !removedNpcIds.includes(npc.id));
    party = party.filter((memberId) => !removedNpcIds.includes(memberId));
  }

  const leavingMemberIds = asArray(result.removeFromParty);
  if (leavingMemberIds.length) {
    party = party.filter((memberId) => !leavingMemberIds.includes(memberId));
  }

  const stage = result.advanceStage
    ? (Math.min(world.stage + 1, StoryStage.ENDING) as StoryStage)
    : world.stage;

  return {
    world: {
      ...world,
      npcs,
      party,
      stage,
      turnInStage: result.advanceStage ? 1 : world.turnInStage + 1,
    },
    advancedStage: result.advanceStage ? stage : null,
  };
}
