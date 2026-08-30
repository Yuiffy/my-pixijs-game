import type { Person, StorySnippet } from "../logic/types";
import { StoryStage } from "../logic/types";
import { SNIPPETS } from "../snippets";
import type { WuxiaWorld } from "./world";

export function advanceSnippetCooldowns(cooldowns: Map<string, number>) {
  Array.from(cooldowns.entries()).forEach(([id, turns]) => {
    if (turns > 0) cooldowns.set(id, turns - 1);
    else cooldowns.delete(id);
  });
}

function possibleTagsForHero(hero: Person, world: WuxiaWorld) {
  const location = world.locations.find(
    (entry) => entry.id === hero.locationId,
  );
  const tags: string[] = [];
  if (location?.type === "sect") tags.push("sect_daily");
  if (location?.type === "city") tags.push("city_daily");
  if (location?.type === "wild") tags.push("wild_daily");
  return tags;
}

export function selectSnippetForTurn(
  hero: Person,
  world: WuxiaWorld,
  cooldowns: Map<string, number>,
  random = Math.random,
): StorySnippet | null {
  advanceSnippetCooldowns(cooldowns);
  const possibleTags = possibleTagsForHero(hero, world);
  const candidates = SNIPPETS.filter((snippet) => {
    const hasTag = snippet.tags.some((tag) => possibleTags.includes(tag));
    const minimumStage = snippet.stageMin ?? StoryStage.BEGINNING;
    const maximumStage = snippet.stageMax ?? StoryStage.ENDING;
    return (
      hasTag &&
      world.stage >= minimumStage &&
      world.stage <= maximumStage &&
      !cooldowns.has(snippet.id) &&
      (snippet.req ? snippet.req(hero, world, world.turnInStage) : true)
    );
  });
  if (!candidates.length) return null;

  const totalWeight = candidates.reduce(
    (total, snippet) => total + (snippet.weight || 1),
    0,
  );
  let weightedRoll = random() * totalWeight;
  const selected =
    candidates.find((snippet) => {
      weightedRoll -= snippet.weight || 1;
      return weightedRoll <= 0;
    }) || candidates[0];

  if ((selected.weight || 0) < 100) cooldowns.set(selected.id, 2);
  return selected;
}

export function idleSnippet() {
  return SNIPPETS.find((snippet) => snippet.id === "idle_action_menu") || null;
}
