import assert from "node:assert/strict";
import test from "node:test";

import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const engine = await loadTypescriptModule("src/components/wuxia/game/novelEngine.ts");
const exampleModule = await loadTypescriptModule("src/components/wuxia/game/exampleContentPack.ts");

const {
  chooseNovelAction,
  choosePlayerActivity,
  continueNovelAction,
  createNovelState,
  generatePlayerActivities,
  getPlayerAgendaOptions,
  selectPlayerAgenda,
} = engine;
const { EXAMPLE_RIVER_LANTERN_PACK } = exampleModule;

const withActivities = (state) => {
  const prepared = { ...state, campaign: { ...state.campaign, availableActivities: [] } };
  return {
    ...prepared,
    campaign: {
      ...prepared.campaign,
      availableActivities: generatePlayerActivities(prepared),
    },
  };
};

const growthReadyState = () => {
  const selected = selectPlayerAgenda(createNovelState({
    heroName: "顾知微",
    origin: "sect_disciple",
    ambition: "truth",
    seed: "campaign-growth-test",
  }), "sect_mastery");
  return withActivities({
    ...selected,
    hero: {
      ...selected.hero,
      stats: { ...selected.hero.stats, martial: 100, insight: 100, fortune: 100, chivalry: 100, fame: 100 },
    },
    narrative: {
      ...selected.narrative,
      martial: { ...selected.narrative.martial, mastery: 100 },
    },
    campaign: {
      ...selected.campaign,
      legacy: { ...selected.campaign.legacy, martialInsights: 4 },
    },
  });
};

const enterActivity = (state, kind) => {
  const activity = state.campaign.availableActivities.find((entry) => entry.kind === kind && entry.enabled);
  assert.ok(activity, `没有可用的 ${kind} 活动`);
  const entered = choosePlayerActivity(state, activity.id);
  assert.equal(entered.campaign.phase, "scene");
  return entered;
};

const chooseSuccessfully = (state, choiceId) => {
  for (let rngState = 1; rngState <= 256; rngState += 1) {
    const candidate = chooseNovelAction(structuredClone({ ...state, rngState }), choiceId);
    if (candidate.pendingOutcome?.success) return candidate;
  }
  assert.fail(`无法为 ${choiceId} 找到成功检定`);
};

test("自创武学会写入传承、世界招式与主角习得记录，且不污染选择前状态", () => {
  const entered = enterActivity(growthReadyState(), "invent");
  const beforeWorld = structuredClone(entered.world);
  const result = chooseSuccessfully(entered, "campaign-invent:guard");
  const authored = result.campaign.legacy.authoredTechniques.at(-1);

  assert.equal(result.pendingOutcome.success, true);
  assert.equal(authored.name, "同路回锋");
  assert.ok(authored.inspirationTechniqueIds.length > 0);
  assert.ok(result.world.techniques.some((technique) => technique.id === authored.id && technique.tags.includes("自创")));
  assert.ok(result.world.martialArts.some((art) => art.id === "art_hero_authored" && art.techniqueIds.includes(authored.id)));
  assert.ok(result.world.actors.find((actor) => actor.id === "hero").techniques.some((known) => known.techniqueId === authored.id && known.source === "自创"));
  assert.ok(result.narrative.martial.techniques.some((technique) => technique.id === authored.id && technique.status === "初悟"));
  assert.deepEqual(entered.world, beforeWorld, "创招不应回写选择前的世界状态");
  assert.deepEqual(JSON.parse(JSON.stringify(result)).campaign.legacy.authoredTechniques, result.campaign.legacy.authoredTechniques);
});

test("秘籍传闻会成为可主动安排行程的追查，而不必等待随机事件", () => {
  const entered = enterActivity(growthReadyState(), "investigate");
  const manualId = entered.campaign.availableActivities
    .find((activity) => activity.id === entered.campaign.selectedActivityId)?.targetManualId;
  assert.ok(manualId);
  assert.match(entered.currentEvent.id, new RegExp(`^sandbox-manual:${manualId}:`));

  const result = chooseSuccessfully(entered, `sandbox-manual-learn:${manualId}`);
  const lead = result.campaign.leads.find((entry) => entry.targetManualId === manualId);
  assert.equal(result.world.manuals.find((manual) => manual.id === manualId).state, "携带");
  assert.equal(lead.status, "resolved");
  assert.equal(lead.progress, 100);
});

test("活动再多也不会挤掉受伤时的基本休整", () => {
  const state = growthReadyState();
  const crowded = withActivities({
    ...state,
    hero: { ...state.hero, health: state.hero.maxHealth - 1 },
  });
  assert.equal(crowded.campaign.availableActivities.length, crowded.content.rules.maxVisibleActivities);
  assert.ok(crowded.campaign.availableActivities.some((activity) => activity.kind === "rest" && activity.enabled));
});

test("传艺馆会收录真实已相识人物 ID，并在继续与序列化后保留", () => {
  const invented = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:guard");
  let planning = continueNovelAction(invented);
  assert.equal(planning.campaign.legacy.followers, 0);

  const first = chooseNovelAction(enterActivity(planning, "found_sect"), "campaign-found-sect:school");
  const firstFollowerId = first.campaign.legacy.followerActorIds[0];
  const firstFollower = first.world.actors.find((actor) => actor.id === firstFollowerId);
  assert.equal(first.pendingOutcome.success, true);
  assert.ok(firstFollower);
  assert.equal(first.campaign.legacy.followers, 1);
  assert.match(first.pendingOutcome.discovery, new RegExp(firstFollower.name));

  planning = continueNovelAction(JSON.parse(JSON.stringify(first)));
  const second = chooseNovelAction(enterActivity(planning, "found_sect"), "campaign-found-sect:school");
  const secondFollowerId = second.campaign.legacy.followerActorIds.find((actorId) => actorId !== firstFollowerId);
  const secondFollower = second.world.actors.find((actor) => actor.id === secondFollowerId);
  assert.equal(second.pendingOutcome.success, true);
  assert.ok(secondFollower);
  assert.equal(second.campaign.legacy.followers, 2);
  assert.match(second.pendingOutcome.discovery, new RegExp(secondFollower.name));

  const continued = continueNovelAction(JSON.parse(JSON.stringify(second)));
  assert.deepEqual(continued.campaign.legacy.followerActorIds, [firstFollowerId, secondFollowerId]);
  assert.equal(continued.campaign.legacy.followers, continued.campaign.legacy.followerActorIds.length);
});

test("正式立派会建立势力、改写主角身份与自创传承归属", () => {
  const invented = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:break");
  let planning = continueNovelAction(invented);
  const followerIds = planning.world.actors.filter((actor) => actor.id !== "hero" && actor.characterId).slice(0, 2).map((actor) => actor.id);
  planning = withActivities({
    ...planning,
    campaign: {
      ...planning.campaign,
      legacy: { ...planning.campaign.legacy, followers: followerIds.length, followerActorIds: followerIds },
    },
  });
  const entered = enterActivity(planning, "found_sect");
  const previousArt = structuredClone(entered.world.martialArts.find((art) => art.id === "art_hero_authored"));
  const result = chooseNovelAction(entered, "campaign-found-sect:open");
  const founded = result.campaign.legacy.foundedSect;

  assert.equal(result.pendingOutcome.success, true);
  assert.ok(founded);
  assert.equal(result.hero.sectId, founded.id);
  assert.equal(result.hero.sectName, founded.name);
  assert.equal(result.hero.epithet, `${founded.name}开山人`);
  assert.doesNotMatch(founded.name, /驻地|门驻/);
  assert.ok(result.narrative.factions.some((faction) => faction.id === founded.id && faction.sourceLabel === "玩家创立"));
  assert.equal(result.world.martialArts.find((art) => art.id === "art_hero_authored").factionId, founded.id);
  assert.deepEqual(entered.world.martialArts.find((art) => art.id === "art_hero_authored"), previousArt, "立派不应回写选择前的传承归属");
  assert.deepEqual(JSON.parse(JSON.stringify(result)).campaign.legacy.foundedSect, founded);
});

test("示例内容包通过 createNovelState 接入真实人物、机会、路线与规则", () => {
  const state = createNovelState({
    heroName: "林照水",
    origin: "wanderer",
    ambition: "freedom",
    seed: "example-pack-integration",
  }, [EXAMPLE_RIVER_LANTERN_PACK]);

  assert.ok(state.campaign.installedPackIds.includes("example.river-lanterns"));
  assert.equal(state.content.rules.maxVisibleActivities, 10);
  assert.equal(state.content.rules.inventTechnique.martialInsights, 2);
  assert.equal(state.content.rules.foundSect.followers, 1);
  assert.ok(state.narrative.cast.some((character) => character.rosterId === "example_luo_zhen" && character.sourcePackId === "example.river-lanterns"));
  assert.ok(state.world.locations.some((location) => location.id === "example_river_lantern_pier" && location.connections.includes("inn_tingyu")));
  assert.ok(state.world.locations.find((location) => location.id === "inn_tingyu").connections.includes("example_river_lantern_pier"));
  assert.ok(state.world.actors.some((actor) => actor.characterId === "character_example_luo_zhen" && actor.locationId === "example_river_lantern_pier"));
  assert.ok(state.campaign.opportunities.some((opportunity) => opportunity.templateId === "example_lantern_fair" && opportunity.locationId === "example_river_lantern_pier"));
  assert.ok(getPlayerAgendaOptions(state).some((agenda) => agenda.id === "example.river-letters"));
  const selected = selectPlayerAgenda(state, "example.river-letters");
  assert.equal(selected.campaign.agenda.id, "example.river-letters");
  assert.equal(selected.campaign.phase, "planning");
  assert.ok(selected.campaign.availableActivities.length > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(selected)).campaign.installedPackIds, selected.campaign.installedPackIds);
});

test("内容包的孤立地点和悬空人物地点会在建世界时被拒绝", () => {
  const base = {
    id: "example.invalid-location",
    version: "1.0.0",
    label: "无效地点示例",
  };
  assert.throws(() => createNovelState({ seed: "isolated-location" }, [{
    ...base,
    locations: [{
      id: "isolated_cliff",
      name: "孤崖",
      type: "wild",
      descriptor: "没有道路通往这里。",
      region: "界外",
      x: 90,
      y: 90,
      connections: [],
      danger: 80,
      tags: ["孤绝"],
    }],
  }]), /无法从江湖路网抵达/);

  assert.throws(() => createNovelState({ seed: "missing-character-location" }, [{
    ...base,
    id: "example.invalid-character-location",
    characters: [{
      ...EXAMPLE_RIVER_LANTERN_PACK.characters[0],
      id: "invalid_character",
      sourcePackId: "example.invalid-character-location",
      homeLocationId: "missing_place",
      routineLocationIds: ["missing_place"],
    }],
  }]), /人物 invalid_character 指向不存在的地点 missing_place/);
});
