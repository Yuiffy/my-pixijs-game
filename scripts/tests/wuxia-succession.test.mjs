import assert from "node:assert/strict";
import test from "node:test";

import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const engine = await loadTypescriptModule("src/components/wuxia/game/novelEngine.ts");
const succession = await loadTypescriptModule("src/components/wuxia/game/wuxiaSuccession.ts");

const { createNovelState } = engine;
const { archiveCurrentProtagonist, createSuccessorState } = succession;

const endingFor = (state, title) => ({
  ...state,
  turn: Math.max(6, state.turn),
  life: {
    ...state.life,
    age: state.life.age + 7,
    status: "ending_preview",
    chosenEndingId: "wandering_volume",
  },
  ending: {
    title,
    subtitle: "旧卷有尾，江湖无终",
    summary: `${state.hero.name}收住此生行路，却仍留在原来的江湖。`,
    rank: "传世",
    score: 88,
    tags: ["同世相承"],
    epilogue: ["后来者仍可循旧路来访。"],
  },
  history: [...state.history, {
    turn: Math.max(6, state.turn),
    eventId: "succession-test-ending",
    title: "旧卷封笔",
    choiceId: "archive-life",
    choice: "把这一生留在江湖年鉴里",
    success: true,
  }],
});

const uniqueIds = (entries, label) => {
  const ids = entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, `${label} ID 不应冲突`);
};

const assertSingleActiveHero = (state) => {
  assert.equal(state.world.heroActorId, "hero");
  assert.equal(state.world.actors.filter((actor) => actor.id === "hero").length, 1);
};

const createEstablishedFirstLife = () => {
  const original = createNovelState({
    heroName: "顾前尘",
    origin: "wanderer",
    ambition: "freedom",
    seed: "succession-world",
  });
  const friend = original.world.actors.find((actor) => actor.id !== "hero");
  assert.ok(friend);
  const npcRelation = original.world.relations.find((relation) => (
    relation.fromActorId !== "hero" && relation.toActorId !== "hero"
  ));
  assert.ok(npcRelation);
  const project = original.chronicle.projects[0];
  const worldDay = 812;
  return endingFor({
    ...original,
    world: {
      ...original.world,
      day: worldDay,
      relations: [...original.world.relations, {
        id: `rel-hero-${friend.id}-friend`,
        fromActorId: "hero",
        toActorId: friend.id,
        type: "friend",
        strength: 76,
        knownToHero: true,
        secret: false,
        description: `${original.hero.name}与${friend.name}曾共历险境。`,
        sinceDay: 180,
      }],
    },
    chronicle: {
      ...original.chronicle,
      projects: original.chronicle.projects.map((entry) => (entry.id === project.id ? {
        ...entry,
        status: "active",
        progress: 57,
        stage: "战局正急",
        contributions: [{
          protagonistId: original.life.protagonistId,
          actorName: original.hero.name,
          day: 700,
          amount: 24,
          description: "亲赴关外查清粮道。",
        }],
      } : entry)),
      ranking: {
        ...original.chronicle.ranking,
        holderActorId: "hero",
        holderName: original.hero.name,
        sinceYear: 2,
        heroBest: "夺魁",
      },
    },
  }, "《前尘留名》");
};

test("结局归档后可在同一世界继任，旧主角作为 legend NPC 与旧关系继续存在", () => {
  const firstLife = createEstablishedFirstLife();
  const before = structuredClone(firstLife);
  const firstLifeId = firstLife.life.protagonistId;
  const legendId = `legend_${firstLifeId}`;
  const friendRelation = firstLife.world.relations.find((relation) => relation.fromActorId === "hero");
  const preservedNpcRelation = structuredClone(firstLife.world.relations.find((relation) => (
    relation.fromActorId !== "hero" && relation.toActorId !== "hero"
  )));
  const preservedProject = structuredClone(firstLife.chronicle.projects[0]);

  const archived = archiveCurrentProtagonist(firstLife);
  assert.deepEqual(firstLife, before, "归档纯函数不应改写传入状态");
  assert.equal(archived.world.heroActorId, legendId);
  assert.equal(archived.world.actors.some((actor) => actor.id === "hero"), false);
  const archivedHero = archived.world.actors.find((actor) => actor.id === legendId);
  assert.ok(archivedHero);
  assert.equal(archivedHero.activity, "停留");
  assert.ok(archivedHero.traits.includes("可被后人拜访"));
  assert.ok(archived.world.relations.some((relation) => (
    relation.fromActorId === legendId
    && relation.toActorId === friendRelation.toActorId
    && relation.type === friendRelation.type
  )));

  const successor = createSuccessorState(archived, {
    heroName: "沈后来",
    origin: "sect_disciple",
    ambition: "protect",
    seed: "succession-second-life",
  });
  assertSingleActiveHero(successor);
  assert.equal(successor.ending, undefined);
  assert.equal(successor.life.status, "active");
  assert.equal(successor.life.generation, 2);
  assert.equal(successor.world.day, firstLife.world.day);
  assert.ok(successor.world.actors.some((actor) => actor.id === legendId));
  assert.ok(successor.world.relations.some((relation) => relation.fromActorId === legendId));
  assert.deepEqual(
    successor.world.relations.find((relation) => relation.id === preservedNpcRelation.id),
    preservedNpcRelation,
    "NPC 之间已经发生的关系事实不应被新主角重置",
  );
  assert.deepEqual(successor.chronicle.projects[0], preservedProject);
  assert.equal(successor.chronicle.ranking.holderActorId, legendId);
  assert.equal(successor.chronicle.ranking.holderName, firstLife.hero.name);
  assert.equal(successor.chronicle.protagonists.length, 1);
  assert.equal(successor.chronicle.protagonists[0].actorId, legendId);
  assert.equal(successor.chronicle.protagonists[0].endingTitle, "《前尘留名》");
  assert.equal(successor.chronicle.protagonists[0].importantHistory.at(-1).title, "旧卷封笔");
});

test("连续两次继任始终只有一个 active hero，历代 legend 与世界 ID 均不冲突", () => {
  const firstLife = createEstablishedFirstLife();
  const secondLife = createSuccessorState(firstLife, {
    heroName: "沈后来",
    origin: "escort_guard",
    ambition: "protect",
    seed: "succession-second-life",
  });
  const firstLegendId = `legend_${firstLife.life.protagonistId}`;
  assertSingleActiveHero(secondLife);
  assert.ok(secondLife.world.actors.some((actor) => actor.id === firstLegendId));

  const secondEnding = endingFor({
    ...secondLife,
    world: { ...secondLife.world, day: secondLife.world.day + 360 },
    chronicle: {
      ...secondLife.chronicle,
      ranking: {
        ...secondLife.chronicle.ranking,
        holderActorId: "hero",
        holderName: secondLife.hero.name,
        sinceYear: 4,
      },
    },
  }, "《后来成峰》");
  const thirdLife = createSuccessorState(secondEnding, {
    heroName: "林又新",
    origin: "wanderer",
    ambition: "truth",
    seed: "succession-third-life",
  });
  const secondLegendId = `legend_${secondLife.life.protagonistId}`;

  assertSingleActiveHero(thirdLife);
  assert.equal(thirdLife.life.generation, 3);
  assert.equal(thirdLife.chronicle.protagonists.length, 2);
  assert.deepEqual(
    thirdLife.chronicle.protagonists.map((archive) => archive.actorId),
    [firstLegendId, secondLegendId],
  );
  assert.ok(thirdLife.world.actors.some((actor) => actor.id === firstLegendId));
  assert.ok(thirdLife.world.actors.some((actor) => actor.id === secondLegendId));
  assert.equal(thirdLife.chronicle.ranking.holderActorId, secondLegendId);
  assert.ok(thirdLife.world.actors
    .find((actor) => actor.id === "hero")
    .techniques.every((known) => known.techniqueId.startsWith(`${thirdLife.life.protagonistId}_`)));

  uniqueIds(thirdLife.world.actors, "人物");
  uniqueIds(thirdLife.world.relations, "关系");
  uniqueIds(thirdLife.world.martialArts, "武学");
  uniqueIds(thirdLife.world.techniques, "招式");
  uniqueIds(thirdLife.world.manuals, "秘籍");
  assert.equal(new Set(thirdLife.campaign.opportunities.map((entry) => entry.id)).size, thirdLife.campaign.opportunities.length);
});

test("继任者可从人物线索拜访前代主角与已经成年的家门后辈", () => {
  const firstLife = createEstablishedFirstLife();
  const childId = `child_${firstLife.life.protagonistId}_1`;
  const childCharacterId = `family_${childId}`;
  const childActor = {
    ...structuredClone(firstLife.world.actors.find((actor) => actor.id !== "hero")),
    id: childId,
    characterId: childCharacterId,
    name: "顾听澜",
    title: "家门后辈",
    traits: ["初入江湖"],
    birthDay: firstLife.world.day - 18 * 360,
  };
  const childCharacter = {
    ...structuredClone(firstLife.narrative.cast[0]),
    id: childCharacterId,
    rosterId: childCharacterId,
    name: childActor.name,
    sourceName: "顾家后辈",
    romanceable: false,
  };
  const withAdultChild = {
    ...firstLife,
    life: {
      ...firstLife.life,
      household: {
        ...firstLife.life.household,
        children: [{
          actorId: childId,
          name: childActor.name,
          parentActorIds: ["hero", firstLife.world.actors.find((actor) => actor.id !== "hero").id],
          birthDay: childActor.birthDay,
          homeLocationId: childActor.homeLocationId,
        }],
      },
    },
    world: { ...firstLife.world, actors: [...firstLife.world.actors, childActor] },
    narrative: { ...firstLife.narrative, cast: [...firstLife.narrative.cast, childCharacter] },
  };

  const successor = createSuccessorState(withAdultChild, {
    heroName: "沈续章",
    seed: "succession-visits",
  });
  const legendId = `legend_${firstLife.life.protagonistId}`;
  const legend = successor.world.actors.find((actor) => actor.id === legendId);
  const descendant = successor.world.actors.find((actor) => actor.id === childId);
  const legendLead = successor.campaign.leads.find((lead) => lead.targetActorId === legendId);
  const descendantLead = successor.campaign.leads.find((lead) => lead.targetActorId === childId);

  assert.ok(legend);
  assert.ok(descendant);
  assert.ok(successor.narrative.cast.some((character) => character.id === legend.characterId));
  assert.ok(successor.narrative.cast.some((character) => character.id === descendant.characterId));
  assert.equal(legendLead?.kind, "person");
  assert.equal(legendLead?.status, "paused");
  assert.equal(legendLead?.targetLocationId, legend.locationId);
  assert.equal(descendantLead?.kind, "person");
  assert.equal(descendantLead?.status, "paused");
  assert.equal(descendantLead?.targetLocationId, descendant.locationId);
});

test("赛事记录跨代保留原参赛人生归属，新一代排名从旁观重新起步", () => {
  const firstLife = createEstablishedFirstLife();
  const firstLifeId = firstLife.life.protagonistId;
  const recorded = {
    opportunityId: "huashan_sword_summit_y2_c1",
    title: "华山论剑",
    year: 2,
    result: "夺魁",
    championActorId: "hero",
    roundsWon: 3,
  };
  const successor = createSuccessorState({
    ...firstLife,
    chronicle: { ...firstLife.chronicle, tournaments: [recorded] },
  }, {
    heroName: "陆新锋",
    seed: "succession-tournament-attribution",
  });
  const preserved = successor.chronicle.tournaments[0];

  assert.equal(preserved.protagonistId, firstLifeId);
  assert.equal(preserved.championActorId, `legend_${firstLifeId}`);
  assert.equal(preserved.result, "夺魁");
  assert.equal(successor.chronicle.ranking.heroBest, "旁观");
  assert.notEqual(successor.life.protagonistId, firstLifeId);
});
