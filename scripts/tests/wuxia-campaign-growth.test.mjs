import assert from "node:assert/strict";
import test from "node:test";

import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const engine = await loadTypescriptModule("src/components/wuxia/game/novelEngine.ts");
const exampleModule = await loadTypescriptModule("src/components/wuxia/game/exampleContentPack.ts");
const saveModule = await loadTypescriptModule("src/components/wuxia/game/wuxiaSave.ts");

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
  assert.match(authored.id, new RegExp(`^authored_${result.life.protagonistId}_`));
  assert.ok(result.world.techniques.some((technique) => technique.id === authored.id && technique.tags.includes("自创")));
  assert.ok(result.world.martialArts.some((art) => art.id === `art_authored_${result.life.protagonistId}` && art.techniqueIds.includes(authored.id)));
  assert.ok(result.world.actors.find((actor) => actor.id === "hero").techniques.some((known) => known.techniqueId === authored.id && known.source === "自创"));
  assert.ok(result.narrative.martial.techniques.some((technique) => technique.id === authored.id && technique.status === "初悟"));
  assert.deepEqual(entered.world, beforeWorld, "创招不应回写选择前的世界状态");
  assert.deepEqual(JSON.parse(JSON.stringify(result)).campaign.legacy.authoredTechniques, result.campaign.legacy.authoredTechniques);
});

test("跨回合与读档重走创招路径会精进原招，不会重复创招或误报另一式", () => {
  const first = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:break");
  const authored = first.campaign.legacy.authoredTechniques[0];
  const second = chooseSuccessfully(enterActivity(continueNovelAction(first), "invent"), "campaign-invent:guard");
  const saved = saveModule.parseWuxiaSaveRoot(saveModule.serializeWuxiaSaveRoot(saveModule.createSaveRoot(second)));
  const entered = enterActivity(continueNovelAction(saved.worlds[0].game), "invent");
  assert.match(entered.currentEvent.choices.find((entry) => entry.id === "campaign-invent:break").label, /精进.*截流一式/);
  const snapshot = structuredClone(entered);
  const result = chooseSuccessfully(entered, "campaign-invent:break");
  const known = result.world.actors.find((actor) => actor.id === "hero").techniques;

  assert.equal(result.campaign.legacy.authoredTechniques.length, 2);
  assert.deepEqual(result.campaign.legacy.authoredTechniques[0], authored);
  assert.equal(known.filter((entry) => entry.techniqueId === authored.id).length, 1);
  assert.equal(known.find((entry) => entry.techniqueId === authored.id).mastery, 40);
  assert.match(result.pendingOutcome.discovery, /精进.*截流一式/);
  assert.doesNotMatch(result.pendingOutcome.discovery, /你自创|同路回锋/);
  assert.ok(result.pendingOutcome.changes.some((entry) => entry.label === "熟练" && entry.value === "截流一式 +12"));
  assert.ok(!result.pendingOutcome.changes.some((entry) => entry.label === "新招"));
  assert.deepEqual(entered, snapshot);
});

test("温习自创招式时，正文武学与战斗熟练度一同增长，其他招式不冒领", () => {
  const invented = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:flow");
  const authored = invented.campaign.legacy.authoredTechniques[0];
  const entered = enterActivity(continueNovelAction(invented), "train");
  const choiceId = `campaign-train:${authored.id}:foundation`;
  assert.ok(entered.currentEvent.choices.some((entry) => entry.id === choiceId));
  const result = chooseNovelAction(entered, choiceId);
  const before = entered.world.actors.find((actor) => actor.id === "hero").techniques;
  const after = result.world.actors.find((actor) => actor.id === "hero").techniques;
  assert.equal(after.find((entry) => entry.techniqueId === authored.id).mastery, 36);
  for (const known of after) {
    assert.equal(result.narrative.martial.techniques.find((entry) => entry.id === known.techniqueId).mastery, known.mastery);
    if (known.techniqueId !== authored.id) assert.deepEqual(known, before.find((entry) => entry.techniqueId === known.techniqueId));
  }
  assert.deepEqual(result.pendingOutcome.scene.techniqueIds, [authored.id]);
});

test("创招失败保留原招与火候，不伪造新招或精进成果", () => {
  const invented = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:guard");
  const entered = enterActivity(continueNovelAction(invented), "invent");
  const selected = entered.currentEvent.choices.find((entry) => entry.id === "campaign-invent:guard");
  selected.check.odds = 0;
  const result = chooseNovelAction(entered, selected.id);
  assert.equal(result.pendingOutcome.success, false);
  assert.deepEqual(result.campaign.legacy.authoredTechniques, entered.campaign.legacy.authoredTechniques);
  assert.deepEqual(result.world.actors.find((actor) => actor.id === "hero").techniques, entered.world.actors.find((actor) => actor.id === "hero").techniques);
  assert.doesNotMatch(result.pendingOutcome.discovery || "", /你自创|你精进/);
});

test("圆熟招式不可重复领取推演收益，三路圆熟后停用闭关活动", () => {
  const invented = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:break");
  const authored = invented.campaign.legacy.authoredTechniques[0];
  const planning = continueNovelAction(invented);
  planning.world.actors.find((actor) => actor.id === "hero").techniques.find((entry) => entry.techniqueId === authored.id).mastery = 100;
  planning.narrative.martial.techniques.find((entry) => entry.id === authored.id).mastery = 100;
  const entered = enterActivity(withActivities(planning), "invent");
  assert.match(entered.currentEvent.choices.find((entry) => entry.id === "campaign-invent:break").unavailableReason || "", /圆熟/);
  assert.equal(chooseNovelAction(entered, "campaign-invent:break"), entered);
  const guarded = chooseSuccessfully(entered, "campaign-invent:guard");
  const flowed = chooseSuccessfully(enterActivity(continueNovelAction(guarded), "invent"), "campaign-invent:flow");
  const all = continueNovelAction(continueNovelAction(flowed));
  for (const entry of all.world.actors.find((actor) => actor.id === "hero").techniques) {
    if (all.campaign.legacy.authoredTechniques.some((technique) => technique.id === entry.techniqueId)) entry.mastery = 100;
  }
  assert.ok(!generatePlayerActivities(all).some((activity) => activity.kind === "invent" && activity.enabled));
  all.currentEvent = entered.currentEvent;
  all.campaign.phase = "scene";
  all.campaign.availableActivities = entered.campaign.availableActivities;
  all.campaign.selectedActivityId = entered.campaign.selectedActivityId;
  const restored = saveModule.parseWuxiaSaveRoot(all).worlds[0].game;
  const exitChoice = restored.currentEvent.choices.find((entry) => !entry.unavailableReason);
  assert.equal(exitChoice.id, "campaign-invent-leave");
  const exited = chooseNovelAction(restored, exitChoice.id);
  assert.ok(exited.pendingOutcome);
  assert.deepEqual(exited.campaign.legacy.authoredTechniques, restored.campaign.legacy.authoredTechniques);
});

test("临近圆熟时只增加剩余火候，名望回落仍可精进旧招但不能另创新路", () => {
  const invented = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:break");
  const authored = invented.campaign.legacy.authoredTechniques[0];
  const planning = continueNovelAction(invented);
  planning.hero.stats.fame = 0;
  planning.world.actors.find((actor) => actor.id === "hero").techniques.find((entry) => entry.techniqueId === authored.id).mastery = 96;
  planning.narrative.martial.techniques.find((entry) => entry.id === authored.id).mastery = 96;
  const entered = enterActivity(withActivities(planning), "invent");
  assert.ok(entered.currentEvent.choices.find((entry) => entry.id === "campaign-invent:guard").unavailableReason);
  const result = chooseSuccessfully(entered, "campaign-invent:break");
  assert.equal(result.world.actors.find((actor) => actor.id === "hero").techniques.find((entry) => entry.techniqueId === authored.id).mastery, 100);
  assert.match(result.pendingOutcome.discovery, /圆熟/);
  assert.equal(result.hero.stats.fame, 0);
  assert.ok(result.pendingOutcome.changes.some((entry) => entry.label === "熟练" && entry.value === "截流一式 +4"));
});

test("读入旧版待选择的闭关场景时，会按已学招式刷新选项", () => {
  const invented = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:guard");
  const entered = enterActivity(continueNovelAction(invented), "invent");
  entered.currentEvent.choices.find((entry) => entry.id === "campaign-invent:guard").label = "以护人为意";
  const restored = saveModule.parseWuxiaSaveRoot(entered).worlds[0].game;
  assert.match(restored.currentEvent.choices.find((entry) => entry.id === "campaign-invent:guard").label, /精进.*同路回锋/);
  assert.equal(restored.world.day, entered.world.day);
  assert.equal(restored.turn, entered.turn);
});

test("日常练功与创招结算不再套入旧主线潮声与退路", () => {
  const state = growthReadyState();
  const invent = chooseSuccessfully(enterActivity(state, "invent"), "campaign-invent:break");
  const training = enterActivity(state, "train");
  const trained = chooseNovelAction(training, training.currentEvent.choices[0].id);
  for (const result of [invent, trained]) {
    assert.doesNotMatch(result.pendingOutcome.resultParagraphs.join("\n"), /潮声|少了一条退路|归潮阁|沉星渡/);
    assert.doesNotMatch(result.pendingOutcome.revealTitle, /这一念落下/);
  }
});

test("旧档同源重复招式合并最高火候并修复传承引用，不合并异代同名武学", () => {
  const original = chooseSuccessfully(enterActivity(growthReadyState(), "invent"), "campaign-invent:break");
  const game = structuredClone(original);
  const authored = game.campaign.legacy.authoredTechniques[0];
  const duplicateId = `authored_${game.life.protagonistId}_break_23`;
  const definition = game.world.techniques.find((entry) => entry.id === authored.id);
  const narrativeTechnique = game.narrative.martial.techniques.find((entry) => entry.id === authored.id);
  const otherId = "authored_previous_life_break_12";
  game.campaign.legacy.authoredTechniques.push({ ...authored, id: duplicateId, createdTurn: 23 });
  game.world.techniques.push({ ...definition, id: duplicateId }, { ...definition, id: otherId, artId: "art_authored_previous_life" });
  game.world.martialArts.find((entry) => entry.id === definition.artId).techniqueIds.push(duplicateId);
  game.world.actors.find((actor) => actor.id === "hero").techniques.push({ techniqueId: duplicateId, mastery: 64, source: "自创", learnedDay: 30 });
  game.narrative.martial.techniques.push({ ...narrativeTechnique, id: duplicateId, mastery: 64 });
  game.campaign.legacy.foundedSect = { id: "saved_sect", name: "照水门", creed: "守约", foundedTurn: 24, headquartersLocationId: game.currentLocationId, founderTechniqueId: duplicateId };
  game.campaign.legacy.authoredTechniques[0].inspirationTechniqueIds.push(duplicateId);
  const snapshot = structuredClone(game);
  const restored = saveModule.parseWuxiaSaveRoot(game).worlds[0].game;
  assert.equal(restored.campaign.legacy.authoredTechniques.length, 1);
  assert.equal(restored.campaign.legacy.foundedSect.founderTechniqueId, authored.id);
  assert.ok(!restored.campaign.legacy.authoredTechniques[0].inspirationTechniqueIds.includes(authored.id));
  assert.equal(restored.world.techniques.filter((entry) => entry.artId === definition.artId).length, 1);
  assert.ok(restored.world.techniques.some((entry) => entry.id === otherId));
  assert.equal(restored.world.actors.find((actor) => actor.id === "hero").techniques.find((entry) => entry.techniqueId === authored.id).mastery, 64);
  assert.equal(restored.narrative.martial.techniques.find((entry) => entry.id === authored.id).mastery, 64);
  assert.ok(!JSON.stringify(restored.world).includes(duplicateId));
  assert.deepEqual(saveModule.parseWuxiaSaveRoot(restored).worlds[0].game, restored);
  assert.deepEqual(game, snapshot);
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
  const authoredArtId = `art_authored_${entered.life.protagonistId}`;
  const previousArt = structuredClone(entered.world.martialArts.find((art) => art.id === authoredArtId));
  const result = chooseNovelAction(entered, "campaign-found-sect:open");
  const founded = result.campaign.legacy.foundedSect;

  assert.equal(result.pendingOutcome.success, true);
  assert.ok(founded);
  assert.equal(result.hero.sectId, founded.id);
  assert.equal(result.hero.sectName, founded.name);
  assert.equal(result.hero.epithet, `${founded.name}开山人`);
  assert.doesNotMatch(founded.name, /驻地|门驻/);
  assert.ok(result.narrative.factions.some((faction) => faction.id === founded.id && faction.sourceLabel === "玩家创立"));
  assert.match(founded.id, new RegExp(`^player_sect_${result.life.protagonistId}_`));
  assert.equal(result.world.martialArts.find((art) => art.id === authoredArtId).factionId, founded.id);
  assert.deepEqual(entered.world.martialArts.find((art) => art.id === authoredArtId), previousArt, "立派不应回写选择前的传承归属");
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
