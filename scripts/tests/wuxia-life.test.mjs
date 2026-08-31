import assert from "node:assert/strict";
import test from "node:test";

import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const engine = await loadTypescriptModule("src/components/wuxia/game/novelEngine.ts");
const lifeModule = await loadTypescriptModule("src/components/wuxia/game/wuxiaLife.ts");
const worldModule = await loadTypescriptModule("src/components/wuxia/game/worldSimulation.ts");

const {
  chooseNovelAction,
  choosePlayerActivity,
  closeNovelYearAction,
  concludeNovelAction,
  continueNovelAction,
  createNovelState,
  generatePlayerActivities,
  getLifeEndingOptions,
  resumeNovelAfterEndingAction,
  selectPlayerAgenda,
} = engine;
const { DAYS_PER_YEAR, formatWuxiaDate, wuxiaDateFromDay } = lifeModule;
const { advanceWorldToScene } = worldModule;

const withActivities = (state) => {
  const campaign = { ...state.campaign, phase: "planning", availableActivities: [] };
  const prepared = { ...state, currentEvent: null, pendingOutcome: undefined, campaign };
  return { ...prepared, campaign: { ...campaign, availableActivities: generatePlayerActivities(prepared) } };
};

const startedState = (seed = "life-system-test") => selectPlayerAgenda(createNovelState({
  heroName: "沈见山",
  origin: "sect_disciple",
  ambition: "protect",
  seed,
}), "sect_bonds");

const chooseSuccessfully = (state, choiceId) => {
  for (let rngState = 1; rngState <= 512; rngState += 1) {
    const result = chooseNovelAction(structuredClone({ ...state, rngState }), choiceId);
    if (result.pendingOutcome?.success) return result;
  }
  assert.fail(`无法为 ${choiceId} 找到成功检定`);
};

const chooseUnsuccessfully = (state, choiceId) => {
  for (let rngState = 1; rngState <= 512; rngState += 1) {
    const result = chooseNovelAction(structuredClone({ ...state, rngState }), choiceId);
    if (result.pendingOutcome && !result.pendingOutcome.success) return result;
  }
  assert.fail(`无法为 ${choiceId} 找到失败检定`);
};

test("三十日十二月历法在年界处保持单一绝对时间", () => {
  assert.deepEqual(wuxiaDateFromDay(1), { eraName: "承平", year: 1, month: 1, day: 1, absoluteDay: 1 });
  assert.deepEqual(wuxiaDateFromDay(DAYS_PER_YEAR), { eraName: "承平", year: 1, month: 12, day: 30, absoluteDay: DAYS_PER_YEAR });
  assert.deepEqual(wuxiaDateFromDay(DAYS_PER_YEAR + 1), { eraName: "承平", year: 2, month: 1, day: 1, absoluteDay: DAYS_PER_YEAR + 1 });
  assert.equal(formatWuxiaDate(wuxiaDateFromDay(217)), "承平1年 · 八月初七");
});

test("家门子女幼年不会按普通人物四处赶路，长成后才开始自己的行程", () => {
  const state = startedState("child-grows-in-world");
  const hero = state.world.actors.find((actor) => actor.id === "hero");
  const home = state.world.locations.find((location) => location.id === hero.homeLocationId);
  const firstRoad = home.connections[0];
  const child = {
    id: "child_growth_test",
    name: "沈照微",
    title: "幼子",
    role: "在家门中长大的下一代",
    factionId: hero.factionId,
    locationId: home.id,
    homeLocationId: home.id,
    route: [],
    activity: "停留",
    stayUntilDay: 30,
    routineLocationIds: [home.id, firstRoad],
    goals: [{ kind: "访友", targetLocationId: firstRoad, reason: "去邻地访友", priority: 1000 }],
    traits: ["年幼", "家传"],
    techniques: [],
    memories: [],
    birthDay: 1,
  };
  const world = {
    ...state.world,
    actors: [
      ...state.world.actors.map((actor) => (actor.id === "hero" ? actor : { ...actor, activity: "死亡" })),
      child,
    ],
  };
  const childhood = advanceWorldToScene(world, {
    turn: 1,
    eventId: "childhood-years",
    targetLocationId: hero.locationId,
    companionActorIds: [],
    minimumElapsedDays: DAYS_PER_YEAR * 14 - 1,
    suppressEncounter: true,
  });
  const stillYoung = childhood.actors.find((actor) => actor.id === child.id);
  assert.equal(stillYoung.locationId, home.id);
  assert.equal(stillYoung.title, "家门少年");
  assert.ok(stillYoung.traits.includes("年幼"));

  const grownWorld = advanceWorldToScene(childhood, {
    turn: 2,
    eventId: "coming-of-age",
    targetLocationId: hero.locationId,
    companionActorIds: [],
    minimumElapsedDays: 1,
    suppressEncounter: true,
  });
  const grown = grownWorld.actors.find((actor) => actor.id === child.id);
  assert.equal(grown.title, "家门后辈");
  assert.equal(grown.traits.includes("年幼"), false);
  assert.ok(grown.traits.includes("初入江湖"));
  assert.ok(grown.memories.some((memory) => memory.text.includes("第一次独自离开家门")));
});

test("今年就这样吧会推进人物世界、年龄和下一届盛事，再由玩家继续", () => {
  const state = startedState("manual-year-close");
  const prepared = {
    ...state,
    turn: 6,
    world: { ...state.world, day: 42 },
    life: { ...state.life, scenesThisYear: 6 },
  };
  const next = closeNovelYearAction(prepared);
  assert.equal(next.campaign.phase, "year_break");
  assert.equal(wuxiaDateFromDay(next.world.day).year, 2);
  assert.equal(wuxiaDateFromDay(next.world.day).month, 1);
  assert.equal(wuxiaDateFromDay(next.world.day).day, 1);
  assert.equal(next.life.age, state.life.age + 1);
  assert.equal(next.life.pendingYearMilestone.year, 1);
  assert.ok(next.campaign.opportunities.some((opportunity) => opportunity.year === 2));
  assert.ok(next.campaign.leads.some((lead) => lead.opportunityId?.endsWith("_y2")));
  assert.ok(next.world.movements.length <= 360);

  const continued = continueNovelAction(next);
  assert.equal(continued.campaign.phase, "planning");
  assert.equal(continued.life.pendingYearMilestone, undefined);
  assert.ok(continued.campaign.availableActivities.length > 0);
});

test("新世界首日直接收年也会进入次年正月，而不是停在当年岁末", () => {
  const state = startedState("fresh-world-year-close");
  assert.equal(state.world.day, 1);
  const next = closeNovelYearAction(state);
  assert.equal(next.campaign.phase, "year_break");
  assert.equal(wuxiaDateFromDay(next.world.day).year, 2);
  assert.equal(wuxiaDateFromDay(next.world.day).month, 1);
  assert.equal(wuxiaDateFromDay(next.world.day).day, 1);
});

test("连续过多幕会在结果之后自动进入岁末，而不会悄悄跳过新正文", () => {
  let state = withActivities({
    ...startedState("automatic-year-close"),
    life: { ...startedState("automatic-year-close").life, maxScenesPerYear: 1, scenesThisYear: 0 },
  });
  const activity = state.campaign.availableActivities.find((entry) => entry.enabled);
  assert.ok(activity);
  state = choosePlayerActivity(state, activity.id);
  const result = chooseNovelAction(state, state.currentEvent.choices[0].id);
  assert.equal(result.campaign.phase, "outcome");
  assert.ok(result.pendingOutcome);
  const yearEnd = continueNovelAction(result);
  assert.equal(yearEnd.campaign.phase, "year_break");
  assert.equal(yearEnd.life.age, state.life.age + 1);
  assert.ok(yearEnd.life.pendingYearMilestone);
});

test("成熟情意可由玩家选择成婚，婚后可选择收养真实子女", () => {
  let state = startedState("family-rites");
  const actor = state.world.actors.find((entry) => entry.id !== "hero" && entry.characterId);
  assert.ok(actor);
  state = withActivities({
    ...state,
    currentLocationId: actor.locationId,
    world: {
      ...state.world,
      actors: state.world.actors.map((entry) => (entry.id === "hero" ? { ...entry, locationId: actor.locationId } : entry)),
    },
    narrative: {
      ...state.narrative,
      cast: state.narrative.cast.map((character) => (
        character.id === actor.characterId
          ? {
            ...character,
            firstSeenTurn: 1,
            status: "在局中",
            romanceable: true,
            relationship: { ...character.relationship, trust: 78, affection: 78, loyalty: 66, label: "情愫" },
          }
          : character
      )),
    },
  });
  const marriage = state.campaign.availableActivities.find((entry) => entry.riteKind === "marriage" && entry.targetActorId === actor.id);
  assert.ok(marriage);
  const enteredMarriage = choosePlayerActivity(state, marriage.id);
  const married = chooseNovelAction(enteredMarriage, `life-rite:marriage:${actor.id}`);
  assert.equal(married.pendingOutcome.success, true);
  assert.equal(married.life.household.partners[0].actorId, actor.id);
  assert.equal(married.life.household.partners[0].kind, "spouse");
  assert.ok(married.world.relations.some((relation) => relation.fromActorId === "hero" && relation.toActorId === actor.id && relation.type === "spouse"));

  state = continueNovelAction(married);
  state = withActivities({
    ...state,
    life: {
      ...state.life,
      household: {
        ...state.life.household,
        partners: state.life.household.partners.map((partner) => ({ ...partner, sinceDay: state.world.day - 40 })),
      },
    },
  });
  const childActivity = state.campaign.availableActivities.find((entry) => entry.riteKind === "child" && entry.targetActorId === actor.id);
  assert.ok(childActivity);
  const enteredChild = choosePlayerActivity(state, childActivity.id);
  const adopted = chooseNovelAction(enteredChild, `life-rite:child:${actor.id}:adopt`);
  assert.equal(adopted.pendingOutcome.success, true);
  assert.equal(adopted.life.household.children.length, 1);
  const child = adopted.world.actors.find((entry) => entry.id === adopted.life.household.children[0].actorId);
  assert.ok(child);
  assert.equal(child.birthDay, adopted.world.day);
  assert.equal(adopted.life.household.children[0].adopted, true);
  assert.ok(adopted.world.relations.some((relation) => relation.fromActorId === "hero" && relation.toActorId === child.id && relation.type === "adoptive_parent"));
  assert.deepEqual(JSON.parse(JSON.stringify(adopted)).life.household.children, adopted.life.household.children);
});

test("结义只会写入一次，继续游历后不会反复举行同一场仪式", () => {
  let state = startedState("idempotent-sworn-oath");
  const actor = state.world.actors.find((entry) => entry.id !== "hero" && entry.characterId);
  assert.ok(actor);
  state = withActivities({
    ...state,
    currentLocationId: actor.locationId,
    world: {
      ...state.world,
      actors: state.world.actors.map((entry) => (entry.id === "hero" ? { ...entry, locationId: actor.locationId } : entry)),
    },
    narrative: {
      ...state.narrative,
      cast: state.narrative.cast.map((character) => (
        character.id === actor.characterId
          ? {
            ...character,
            firstSeenTurn: 1,
            status: "在局中",
            relationship: { ...character.relationship, trust: 72, loyalty: 48, label: "知己" },
          }
          : character
      )),
    },
  });
  const oath = state.campaign.availableActivities.find((entry) => entry.riteKind === "sworn_oath" && entry.targetActorId === actor.id);
  assert.ok(oath);
  const entered = choosePlayerActivity(state, oath.id);
  const sworn = chooseNovelAction(entered, `life-rite:oath:${actor.id}`);
  assert.equal(sworn.life.household.swornSiblingActorIds.filter((actorId) => actorId === actor.id).length, 1);
  assert.equal(sworn.life.household.rites.filter((rite) => rite.kind === "sworn_oath" && rite.actorIds.includes(actor.id)).length, 1);

  const continued = withActivities(continueNovelAction(sworn));
  assert.equal(continued.campaign.availableActivities.some((entry) => entry.riteKind === "sworn_oath" && entry.targetActorId === actor.id), false);
  assert.equal(continued.world.relations.filter((relation) => relation.fromActorId === "hero" && relation.toActorId === actor.id && relation.type === "sworn_sibling").length, 1);
});

test("大型项目跨章保留贡献并在最后一役解锁对应结局", () => {
  let state = startedState("world-project-resolution");
  const project = state.chronicle.projects.find((entry) => entry.kind === "invasion");
  assert.ok(project);
  state = withActivities({
    ...state,
    chronicle: {
      ...state.chronicle,
      projects: state.chronicle.projects.map((entry) => (
        entry.id === project.id ? { ...entry, progress: 90, stage: "最后一役" } : entry
      )),
    },
    hero: {
      ...state.hero,
      stats: { ...state.hero.stats, chivalry: 100, insight: 100, fame: 100 },
    },
  });
  const activity = state.campaign.availableActivities.find((entry) => entry.projectId === project.id);
  assert.ok(activity);
  const entered = choosePlayerActivity(state, activity.id);
  const resolved = chooseSuccessfully(entered, `life-project:defend:${project.id}`);
  const finishedProject = resolved.chronicle.projects.find((entry) => entry.id === project.id);
  assert.equal(finishedProject.status, "resolved");
  assert.equal(finishedProject.stage, "尘埃落定");
  assert.ok(finishedProject.contributions.some((entry) => entry.protagonistId === resolved.life.protagonistId));
  const ending = getLifeEndingOptions(resolved).find((entry) => entry.id === "guardian_of_realm");
  assert.equal(ending.unlocked, true);
});

test("大型项目失败或只查证都不能越过最后一役，也不会冒领本代专属结局", () => {
  let state = startedState("world-project-must-finish-decisively");
  const project = state.chronicle.projects.find((entry) => entry.kind === "invasion");
  assert.ok(project);
  state = withActivities({
    ...state,
    hero: { ...state.hero, stats: { ...state.hero.stats, chivalry: 0 } },
    chronicle: {
      ...state.chronicle,
      projects: state.chronicle.projects.map((entry) => (
        entry.id === project.id ? { ...entry, status: "active", progress: 99, stage: "最后一役" } : entry
      )),
    },
  });
  const activity = state.campaign.availableActivities.find((entry) => entry.projectId === project.id);
  assert.ok(activity);
  const entered = choosePlayerActivity(state, activity.id);
  const failed = chooseUnsuccessfully(entered, `life-project:defend:${project.id}`);
  const afterFailure = failed.chronicle.projects.find((entry) => entry.id === project.id);
  assert.equal(afterFailure.status, "active");
  assert.equal(afterFailure.progress, 99);
  assert.equal(afterFailure.contributions.at(-1).success, false);

  const investigated = chooseSuccessfully(entered, `life-project:investigate:${project.id}`);
  const afterInvestigation = investigated.chronicle.projects.find((entry) => entry.id === project.id);
  assert.equal(afterInvestigation.status, "active");
  assert.equal(afterInvestigation.progress, 99);

  const worldResolved = {
    ...investigated,
    chronicle: {
      ...investigated.chronicle,
      projects: investigated.chronicle.projects.map((entry) => (
        entry.id === project.id
          ? { ...entry, status: "resolved", contributions: [{ protagonistId: "world", actorName: "江湖诸派", day: entry.startYear, amount: 100, description: "诸派平定", success: true }] }
          : entry
      )),
    },
  };
  assert.equal(getLifeEndingOptions(worldResolved).find((entry) => entry.id === "guardian_of_realm").unlocked, false);
});

test("关系仪式再多也不会挤掉已开放盛事与天下大事", () => {
  let state = startedState("activity-category-guarantees");
  const championship = state.campaign.opportunities.find((entry) => entry.templateId === "world_first_championship");
  assert.ok(championship);
  state = withActivities({
    ...state,
    world: { ...state.world, day: championship.startDay },
    campaign: {
      ...state.campaign,
      opportunities: state.campaign.opportunities.map((entry) => (
        entry.id === championship.id ? { ...entry, status: "open", endDay: championship.startDay + 40 } : entry
      )),
    },
    narrative: {
      ...state.narrative,
      cast: state.narrative.cast.map((character) => ({
        ...character,
        firstSeenTurn: 1,
        status: "在局中",
        romanceable: true,
        relationship: { ...character.relationship, trust: 90, affection: 90, loyalty: 80, label: "情愫" },
      })),
    },
  });
  assert.ok(state.campaign.availableActivities.some((entry) => entry.opportunityId === championship.id && entry.enabled));
  assert.ok(state.campaign.availableActivities.some((entry) => entry.kind === "world_project"));
  assert.ok(state.campaign.availableActivities.some((entry) => entry.kind === "rite"));
  assert.ok(state.campaign.availableActivities.some((entry) => entry.kind === "train"));
  assert.ok(state.campaign.availableActivities.some((entry) => entry.kind === "free_event"));
});

test("死亡同行者不会在下一段行程中被传送复活", () => {
  const state = startedState("dead-companion-stays-dead");
  const actor = state.world.actors.find((entry) => entry.id !== "hero");
  const hero = state.world.actors.find((entry) => entry.id === "hero");
  assert.ok(actor);
  assert.ok(hero);
  const world = {
    ...state.world,
    actors: state.world.actors.map((entry) => entry.id === actor.id ? { ...entry, activity: "死亡" } : entry),
  };
  const advanced = advanceWorldToScene(world, {
    turn: 1,
    eventId: `sandbox-challenge:${actor.id}:1`,
    targetLocationId: hero.locationId,
    companionActorIds: [actor.id],
    minimumElapsedDays: 6,
  });
  assert.equal(advanced.actors.find((entry) => entry.id === actor.id).activity, "死亡");
});

test("结局是可继续的预览，不会强制删除正在运转的江湖", () => {
  const state = withActivities({ ...startedState("resumable-ending"), turn: 3 });
  const preview = concludeNovelAction(state, "wandering_volume");
  assert.ok(preview.ending);
  assert.equal(preview.life.status, "ending_preview");
  assert.equal(preview.campaign.phase, "ending");
  assert.equal(preview.world.day, state.world.day);

  const resumed = resumeNovelAfterEndingAction(preview);
  assert.equal(resumed.ending, undefined);
  assert.equal(resumed.life.status, "active");
  assert.equal(resumed.campaign.phase, "planning");
  assert.ok(resumed.campaign.availableActivities.length > 0);
  assert.deepEqual(resumed.chronicle.projects, state.chronicle.projects);
});

test("错过一届华山论剑后，下一届仍会在同一江湖按期重开", () => {
  let state = startedState("recurring-huashan");
  const firstSummit = state.campaign.opportunities.find((entry) => entry.templateId === "huashan_sword_summit");
  assert.ok(firstSummit);
  state = {
    ...state,
    world: { ...state.world, day: firstSummit.endDay + 1 },
  };

  for (let year = 1; year <= 3; year += 1) {
    state = closeNovelYearAction(state);
    assert.equal(state.campaign.phase, "year_break");
    state = continueNovelAction(state);
  }

  const missed = state.campaign.opportunities.find((entry) => entry.id === firstSummit.id);
  const nextSummit = state.campaign.opportunities.find((entry) => (
    entry.templateId === "huashan_sword_summit" && entry.year === 4
  ));
  assert.equal(missed.status, "resolved");
  assert.ok(missed.championActorId, "玩家缺席后本届仍应产生 NPC 冠军");
  assert.ok(nextSummit);
  assert.notEqual(nextSummit.id, firstSummit.id);
  assert.ok(["announced", "open"].includes(nextSummit.status));
});

test("天下第一武道会要逐轮取胜，第三轮之后才改写天下排名", () => {
  let state = startedState("three-round-world-first");
  const championship = state.campaign.opportunities.find((entry) => entry.templateId === "world_first_championship");
  assert.ok(championship);
  const contestDay = championship.startDay;
  state = withActivities({
    ...state,
    hero: {
      ...state.hero,
      level: 30,
      health: 1200,
      maxHealth: 1200,
      stats: Object.fromEntries(Object.keys(state.hero.stats).map((key) => [key, 200])),
    },
    world: {
      ...state.world,
      day: contestDay,
      actors: state.world.actors.map((actor) => ({
        ...actor,
        locationId: championship.locationId,
        techniques: actor.techniques.map((technique) => ({
          ...technique,
          mastery: actor.id === "hero" ? 100 : 1,
        })),
      })),
    },
    campaign: {
      ...state.campaign,
      opportunities: state.campaign.opportunities.map((entry) => (
        entry.id === championship.id
          ? { ...entry, status: "open", startDay: contestDay, endDay: contestDay + 100, roundsWon: 0, roundsRequired: 3 }
          : { ...entry, status: "attended" }
      )),
    },
  });

  for (let round = 1; round <= 3; round += 1) {
    const activity = state.campaign.availableActivities.find((entry) => entry.opportunityId === championship.id && entry.enabled);
    assert.ok(activity, `第 ${round} 轮应可继续报名`);
    const entered = choosePlayerActivity(state, activity.id);
    const duel = entered.currentEvent.choices.find((choice) => choice.id.startsWith("sandbox-duel:"));
    assert.ok(duel, `第 ${round} 轮应有真实对手`);
    const result = chooseNovelAction(entered, duel.id);
    assert.equal(result.pendingOutcome.success, true, `第 ${round} 轮应由强化后的主角取胜`);
    const updated = result.campaign.opportunities.find((entry) => entry.id === championship.id);
    assert.equal(updated.roundsWon, round);
    if (round < 3) {
      assert.equal(updated.status, "open");
      assert.notEqual(result.chronicle.ranking.holderActorId, "hero");
      state = continueNovelAction(result);
    } else {
      assert.equal(updated.status, "resolved");
      assert.equal(result.chronicle.ranking.holderActorId, "hero");
      assert.equal(result.chronicle.ranking.heroBest, "夺魁");
    }
  }
});
