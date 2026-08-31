import assert from "node:assert/strict";
import test from "node:test";

import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const engine = await loadTypescriptModule("src/components/wuxia/game/novelEngine.ts");
const saveModule = await loadTypescriptModule("src/components/wuxia/game/wuxiaSave.ts");

const { createNovelState } = engine;
const {
  compactWuxiaSaveRoot,
  createSaveRoot,
  parseWuxiaSaveRoot,
  removeWorld,
  selectWorld,
  serializeWuxiaSaveRoot,
  upsertWorldGame,
} = saveModule;

const createWorld = (heroName, seed) => createNovelState({
  heroName,
  origin: "wanderer",
  ambition: "freedom",
  seed,
});

test("v7 江湖册可增删选择两个独立世界，更新一方不会串写另一方", () => {
  const first = createWorld("顾行舟", "save-world-first");
  const second = createWorld("林问潮", "save-world-second");
  const firstRoot = createSaveRoot(first, 100);
  const firstSnapshot = structuredClone(firstRoot);

  const both = upsertWorldGame(firstRoot, second, 200);
  const firstId = first.chronicle.worldId;
  const secondId = second.chronicle.worldId;

  assert.deepEqual(firstRoot, firstSnapshot, "upsert 不应回写输入江湖册");
  assert.equal(both.worlds.length, 2);
  assert.equal(both.activeWorldId, secondId);
  assert.deepEqual(new Set(both.worlds.map((world) => world.id)), new Set([firstId, secondId]));
  assert.equal(both.worlds.find((world) => world.id === firstId).game.hero.name, "顾行舟");
  assert.equal(both.worlds.find((world) => world.id === secondId).game.hero.name, "林问潮");
  assert.notEqual(
    both.worlds.find((world) => world.id === firstId).game.world.seed,
    both.worlds.find((world) => world.id === secondId).game.world.seed,
  );

  const selectedFirst = selectWorld(both, firstId);
  assert.equal(selectedFirst.activeWorldId, firstId);
  assert.equal(both.activeWorldId, secondId, "selectWorld 不应回写原江湖册");

  const changedFirst = {
    ...first,
    hero: { ...first.hero, silver: first.hero.silver + 77 },
    history: [{
      turn: 1,
      eventId: "save-isolation-first",
      title: "只属于第一方江湖的旧事",
      choiceId: "keep-apart",
      choice: "收进第一本年鉴",
      success: true,
    }],
  };
  const secondBeforeUpdate = structuredClone(both.worlds.find((world) => world.id === secondId).game);
  const updated = upsertWorldGame(selectedFirst, changedFirst, 300);

  assert.equal(updated.activeWorldId, firstId);
  assert.equal(updated.worlds.find((world) => world.id === firstId).game.hero.silver, changedFirst.hero.silver);
  assert.equal(updated.worlds.find((world) => world.id === firstId).game.history[0].eventId, "save-isolation-first");
  assert.deepEqual(
    updated.worlds.find((world) => world.id === secondId).game,
    secondBeforeUpdate,
    "更新第一方世界不能改变第二方世界",
  );

  const removedFirst = removeWorld(updated, firstId);
  assert.equal(removedFirst.worlds.length, 1);
  assert.equal(removedFirst.worlds[0].id, secondId);
  assert.equal(removedFirst.activeWorldId, secondId);
  assert.equal(updated.worlds.length, 2, "removeWorld 不应回写原江湖册");

  const removedLast = removeWorld(removedFirst, secondId);
  assert.equal(removedLast.worlds.length, 0);
  assert.equal(removedLast.activeWorldId, undefined);
});

test("v7 江湖册紧凑序列化后可完整解析往返", () => {
  const first = createWorld("谢停云", "save-roundtrip-first");
  const second = createWorld("楚照野", "save-roundtrip-second");
  const root = upsertWorldGame(createSaveRoot(first, 111), second, 222);
  const serialized = serializeWuxiaSaveRoot(root);
  const parsed = parseWuxiaSaveRoot(serialized);

  assert.equal(typeof serialized, "string");
  assert.ok(serialized.length > 0);
  assert.deepEqual(parsed, root);
  assert.equal(parseWuxiaSaveRoot("{not-json"), null);
});

test("v7 江湖册会隔离损坏的世界槽，并保留仍然有效的世界", () => {
  const first = createWorld("陆青崖", "save-partial-corruption-first");
  const second = createWorld("苏照雪", "save-partial-corruption-second");
  const root = upsertWorldGame(createSaveRoot(first, 100), second, 200);
  const payload = structuredClone(root);
  const damaged = payload.worlds.find((world) => world.id === second.chronicle.worldId);
  assert.ok(damaged);
  damaged.activeProtagonistId = "life_damaged_slot";
  payload.activeWorldId = damaged.id;

  const parsed = parseWuxiaSaveRoot(JSON.stringify(payload));

  assert.ok(parsed);
  assert.equal(parsed.worlds.length, 1);
  assert.equal(parsed.worlds[0].id, first.chronicle.worldId);
  assert.equal(parsed.worlds[0].game.hero.name, "陆青崖");
  assert.equal(parsed.activeWorldId, first.chronicle.worldId);
});

test("v7 长局存档会限制流水记录与世界槽数量，同时保留活跃线索", () => {
  const source = createWorld("闻潮生", "save-compaction");
  const filled = structuredClone(source);
  const repeat = (count, entry) => Array.from({ length: count }, (_, index) => ({ ...entry, id: `${entry.id || "entry"}_${index}` }));
  const activeLead = { ...filled.campaign.leads[0], id: "lead_active_kept", status: "active" };
  const resolvedLead = { ...filled.campaign.leads[0], id: "lead_resolved", status: "resolved" };
  const project = filled.chronicle.projects[0];
  assert.ok(project);

  filled.log = repeat(300, { id: "log", turn: 1, title: "旧日志" });
  filled.history = repeat(300, { id: "history", turn: 1, eventId: "event", title: "旧事", choiceId: "choice", choice: "记下", success: true });
  filled.campaign.leads = [activeLead, ...repeat(150, resolvedLead)];
  filled.campaign.opportunities = repeat(120, filled.campaign.opportunities[0]);
  filled.life.annualMilestones = repeat(150, { id: "year", year: 1, age: 18, endedDay: 360, scenes: 1, title: "岁末", summary: "一年旧事", highlights: [] });
  filled.narrative.chapters = repeat(100, { id: "chapter", number: 1, title: "旧章", summary: "旧章摘要", scenes: [] });
  filled.world.actors[0].memories = repeat(50, { id: "memory", day: 1, kind: "相遇", text: "旧忆", actorIds: ["hero"], locationId: filled.currentLocationId });
  filled.world.movements = repeat(400, { id: "movement", actorId: "hero", fromLocationId: filled.currentLocationId, toLocationId: filled.currentLocationId, day: 1, reason: "旧路" });
  filled.world.encounters = repeat(90, { id: "encounter", day: 1, locationId: filled.currentLocationId, actorIds: ["hero"], dramaticProbability: 10, reason: "旧遇" });
  filled.world.rumors = repeat(90, { id: "rumor", day: 1, text: "旧闻", originLocationId: filled.currentLocationId, reachedLocationIds: [filled.currentLocationId], credibility: 50 });
  project.contributions = repeat(100, { id: "contribution", protagonistId: filled.life.protagonistId, actorName: filled.hero.name, day: 1, amount: 1, description: "旧功" });
  filled.chronicle.tournaments = repeat(130, { id: "tournament", opportunityId: "old_match", protagonistId: filled.life.protagonistId, title: "旧会", year: 1, result: "旁观", roundsWon: 0 });
  filled.chronicle.protagonists = [{
    id: "archive_old",
    actorId: "legend_old",
    name: "旧人",
    epithet: "旧侠",
    generation: 0,
    startedDay: 1,
    endedDay: 360,
    age: 60,
    endingId: "old",
    endingTitle: "《旧卷》",
    endingSummary: "旧事仍在。",
    partnerActorIds: [],
    childActorIds: [],
    importantHistory: repeat(100, { id: "archive-history", turn: 1, title: "旧事", choice: "记下", success: true }),
    knownRelationIds: ["rel_a", "rel_a", "rel_b"],
  }];

  const worlds = Array.from({ length: 10 }, (_, index) => {
    const game = structuredClone(filled);
    game.chronicle.worldId = `world_compact_${index}`;
    return {
      id: game.chronicle.worldId,
      label: `江湖 ${index}`,
      activeProtagonistId: game.life.protagonistId,
      createdAt: index,
      updatedAt: index,
      game,
    };
  });
  const compacted = compactWuxiaSaveRoot({ version: 7, activeWorldId: worlds[0].id, worlds });
  const game = compacted.worlds[0].game;

  assert.equal(compacted.worlds.length, 8);
  assert.equal(game.log.length, 240);
  assert.equal(game.history.length, 240);
  assert.equal(game.campaign.leads.length, 120);
  assert.ok(game.campaign.leads.some((lead) => lead.id === activeLead.id));
  assert.equal(game.campaign.opportunities.length, 96);
  assert.equal(game.life.annualMilestones.length, 120);
  assert.equal(game.narrative.chapters.length, 80);
  assert.equal(game.world.actors[0].memories.length, 40);
  assert.equal(game.world.movements.length, 360);
  assert.equal(game.world.encounters.length, 80);
  assert.equal(game.world.rumors.length, 80);
  assert.equal(game.chronicle.projects[0].contributions.length, 80);
  assert.equal(game.chronicle.tournaments.length, 120);
  assert.equal(game.chronicle.protagonists[0].importantHistory.length, 80);
  assert.deepEqual(game.chronicle.protagonists[0].knownRelationIds, ["rel_a", "rel_b"]);
  assert.equal(worlds.length, 10, "紧凑存档不应改写调用方的世界槽数组");
});

test("v6 单档迁移保留世界、叙事和历史，并补齐人生、年鉴与盛事循环字段", () => {
  const source = createWorld("裴知微", "save-v6-migration");
  const legacyHistory = [{
    turn: 7,
    eventId: "legacy-preserved-event",
    title: "旧卷留下的一场雨",
    choiceId: "legacy-preserved-choice",
    choice: "把旧事带进新年鉴",
    success: false,
  }];
  const legacyRumor = {
    id: "legacy-rumor",
    day: 27,
    text: "旧版存档里确实传过这句话。",
    originLocationId: source.currentLocationId,
    reachedLocationIds: [source.currentLocationId],
    credibility: 63,
  };
  const legacyOpportunityIds = new Set([
    "luoyang_matchmaking",
    "hundred_arts_assembly",
    "bailu_secret_realm",
    "sixi_joint_practice",
  ]);
  const legacyOpportunities = source.campaign.opportunities
    .filter((opportunity) => legacyOpportunityIds.has(opportunity.templateId))
    .map((opportunity) => {
      const legacyOpportunity = structuredClone(opportunity);
      [
        "year",
        "cycle",
        "roundsWon",
        "roundsRequired",
        "eliminated",
        "championActorId",
      ].forEach((key) => delete legacyOpportunity[key]);
      return legacyOpportunity;
    });
  const legacyTemplates = source.content.opportunities
    .filter((opportunity) => legacyOpportunityIds.has(opportunity.id))
    .map((opportunity) => {
      const legacyTemplate = structuredClone(opportunity);
      delete legacyTemplate.repeatEveryYears;
      delete legacyTemplate.tournamentRounds;
      return legacyTemplate;
    });
  const {
    life: _discardedLife,
    chronicle: _discardedChronicle,
    ...legacyBase
  } = source;
  const legacy = {
    ...legacyBase,
    version: 6,
    turn: 7,
    history: legacyHistory,
    narrative: {
      ...source.narrative,
      bible: { ...source.narrative.bible, title: "《旧卷不应被重写》" },
    },
    world: {
      ...source.world,
      day: 27,
      rumors: [...source.world.rumors, legacyRumor],
    },
    content: {
      ...source.content,
      opportunities: legacyTemplates,
    },
    campaign: {
      ...source.campaign,
      opportunities: legacyOpportunities,
    },
  };

  const migratedRoot = parseWuxiaSaveRoot(null, JSON.stringify(legacy));
  const migrated = migratedRoot?.worlds[0]?.game;
  const migratedAssembly = migrated?.campaign.opportunities.find((opportunity) => (
    opportunity.templateId === "hundred_arts_assembly"
  ));

  assert.ok(migratedRoot);
  assert.equal(migratedRoot.version, 7);
  assert.equal(migratedRoot.worlds.length, 1);
  assert.ok(migrated);
  assert.equal(migrated.version, 7);
  assert.deepEqual(migrated.history, legacyHistory);
  assert.deepEqual(migrated.narrative, legacy.narrative);
  assert.equal(migrated.world.day, 27);
  assert.equal(migrated.world.rngState, legacy.world.rngState);
  assert.deepEqual(migrated.world.relations, legacy.world.relations);
  assert.deepEqual(migrated.world.manuals, legacy.world.manuals);
  assert.ok(migrated.world.rumors.some((rumor) => rumor.id === legacyRumor.id));
  assert.deepEqual(
    migrated.world.actors.map((actor) => ({ id: actor.id, locationId: actor.locationId })),
    legacy.world.actors.map((actor) => ({ id: actor.id, locationId: actor.locationId })),
  );

  assert.equal(migrated.life.version, 1);
  assert.equal(migrated.life.generation, 1);
  assert.ok(migrated.life.protagonistId);
  assert.equal(migrated.chronicle.version, 1);
  assert.ok(migrated.chronicle.worldId);
  assert.ok(migrated.chronicle.projects.length > 0);
  assert.equal(migratedRoot.activeWorldId, migrated.chronicle.worldId);

  assert.ok(migrated.campaign.opportunities.length > 0);
  assert.ok(migrated.campaign.opportunities.every((opportunity) => (
    Number.isInteger(opportunity.year)
    && opportunity.year >= 1
    && Number.isInteger(opportunity.cycle)
    && opportunity.cycle >= 1
  )));
  assert.ok(migratedAssembly);
  assert.equal(migratedAssembly.roundsWon, 0);
  assert.equal(migratedAssembly.roundsRequired, 3);
  assert.ok(migrated.content.opportunities.some((opportunity) => opportunity.id === "huashan_sword_summit"));
  assert.ok(migrated.content.opportunities.some((opportunity) => opportunity.id === "world_first_championship"));
  assert.equal("year" in legacy.campaign.opportunities[0], false, "迁移不得回写旧对象");
});
