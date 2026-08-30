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
  const additions = asArray(result.addNpc).filter((npc): npc is Person => Boolean(npc));
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
      relations: npc.relations ? [...npc.relations] : [...existing.relations],
      inventory: npc.inventory ? [...npc.inventory] : [...existing.inventory],
      flags: npc.flags ? { ...npc.flags } : { ...existing.flags },
      arts: npc.arts ? [...npc.arts] : [...existing.arts],
      knowledge: npc.knowledge ? [...npc.knowledge] : [...existing.knowledge],
    };
  });

  const sects = world.sects.map((sect) => {
    const members = new Set(sect.members || []);
    additions
      .filter((npc) => npc.sectId === sect.id)
      .forEach((npc) => members.add(npc.id));
    return members.size === (sect.members || []).length
      ? sect
      : { ...sect, members: Array.from(members) };
  });
  return { ...world, npcs, sects };
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
  const relationUpdates = [
    ...(result.addRelation ? [result.addRelation] : []),
    ...(result.addRelations || []),
  ];
  relationUpdates.forEach((relation) => updateRelation(relations, relation));
  const flagUpdates = {
    ...(result.addFlag ? { [result.addFlag]: true } : {}),
    ...(result.addFlags || {}),
  };
  Object.entries(flagUpdates).forEach(([key, value]) => {
    flags[key] = value ?? true;
  });
  result.removeFlags?.forEach((flag) => {
    delete flags[flag];
  });
  if (result.addArt && !arts.includes(result.addArt)) arts.push(result.addArt);
  if (result.addKnowledge && !knowledge.includes(result.addKnowledge)) knowledge.push(result.addKnowledge);

  const currentExp = Number.isFinite(hero.exp) ? hero.exp || 0 : Number(hero.flags.exp) || 0;
  const currentMaxHp = Number.isFinite(hero.maxHp) ? hero.maxHp || 100 : Number(hero.flags.maxHp) || 100;
  const exp = Math.max(0, currentExp + (result.addExp || 0));
  const maxHp = Math.max(1, currentMaxHp + (result.addMaxHp || 0));

  return {
    ...hero,
    inventory,
    arts,
    knowledge,
    relations,
    flags,
    locationId: result.newLocationId || hero.locationId,
    exp,
    maxHp,
  };
}

export interface AppliedSnippetResult {
  world: WuxiaWorld;
  advancedStage: StoryStage | null;
  endGame: boolean;
}

export function applySnippetWorldResult(
  world: WuxiaWorld,
  result: SnippetResult,
): AppliedSnippetResult {
  let npcs = world.npcs.map((npc) => (npc.id === world.heroId ? updateHero(npc, result) : npc));

  asArray(result.setNpcStatus).forEach((update) => {
    npcs = npcs.map((npc) => (npc.id === update.id
      ? {
        ...npc,
        status: update.status,
        flags: (() => {
          const flags = { ...npc.flags };
          if (update.status === "dead") flags.isDead = true;
          else delete flags.isDead;
          return flags;
        })(),
      }
      : npc));
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
  if (result.removeCompanion && world.companionId) {
    party = party.filter((memberId) => memberId !== world.companionId);
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
  const turnDelta = Number.isFinite(result.addTurn) && (result.addTurn || 0) > 0
    ? Math.floor(result.addTurn as number)
    : 1;
  const flags = { ...world.flags };
  if (result.endGame) flags.gameOver = true;

  return {
    world: {
      ...world,
      npcs,
      party,
      companionId: result.removeCompanion ? undefined : legacyCompanion || world.companionId,
      flags,
      ended: world.ended || Boolean(result.endGame),
      stage,
      turn: world.turn + turnDelta,
      turnInStage: result.advanceStage ? turnDelta : world.turnInStage + turnDelta,
    },
    advancedStage: result.advanceStage ? stage : null,
    endGame: Boolean(result.endGame),
  };
}
