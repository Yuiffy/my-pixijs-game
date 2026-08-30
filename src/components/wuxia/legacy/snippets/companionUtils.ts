import { Person } from "../logic/types";

export const getCompanion = (world: any): Person | undefined => {
  return world.companionId
    ? world.npcs?.find((n: Person) => n.id === world.companionId)
    : undefined;
};

export const getRelationValue = (hero: Person, targetId: string): number => {
  const relation = hero.relations?.find(r => r.targetId === targetId);
  return relation?.value || 0;
};

export const getCompanionState = (hero: Person, world: any) => {
  const companion = getCompanion(world);
  if (!companion) return null;

  const relation = hero.relations?.find(r => r.targetId === companion.id) ||
    { targetId: companion.id, type: 'friend', value: 0 };

  return {
    companion,
    relation,
    relationValue: relation.value
  };
};
