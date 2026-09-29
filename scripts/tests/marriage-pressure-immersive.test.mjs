import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const root = "src/components/marriagePressureGame";
const engine = await loadTypescriptModule(`${root}/engine.ts`);
const { ACTIVITIES } = await loadTypescriptModule(`${root}/activities.ts`);
const { MESSAGE_KINDS } = await loadTypescriptModule(`${root}/inbox.ts`);
const router = await loadTypescriptModule(`${root}/immersive/sceneRouter.ts`);
const dialogues = await loadTypescriptModule(`${root}/immersive/dialogues.ts`);
const scripts = await loadTypescriptModule(`${root}/immersive/activityScripts.ts`);
const reunion = await loadTypescriptModule(`${root}/immersive/reunionDinner.ts`);
const { detectCutscenes } = await loadTypescriptModule(`${root}/immersive/cutscenes.ts`);
const { getAvailableChildActions, getAvailableParentActions } = engine;

function start(mode = "child", seed = 11) {
  let state = engine.gameReducer(engine.createInitialState(), { type: "start", mode, difficulty: "realistic", seed });
  if (state.phase === "candidate") state = engine.gameReducer(state, { type: "candidate", id: state.candidateOptions[0] });
  return state;
}

const child = start("child");
const at = (slot, extra = {}) => ({ ...child, ...extra, week: { ...child.week, slot, ...(extra.week ?? {}) } });

test("场景路由：按阶段、行动方、时段与现实事件选场景", () => {
  const draft = engine.gameReducer(engine.createInitialState(), { type: "start", mode: "parent", difficulty: "realistic", seed: 11 });
  assert.equal(router.routeScene(draft).id, "matchmaking");
  assert.equal(router.routeScene(at("work", { currentEventId: "quiet-week" })).id, "office");
  assert.equal(router.routeScene(at("work", { currentEventId: "layoff-rumor" })).id, "meeting-room");
  const overtime = router.routeScene(at("work", { currentEventId: "overtime" }));
  assert.equal(overtime.id, "office");
  assert.equal(overtime.night, true);
  assert.equal(router.routeScene(at("commute", { currentEventId: "quiet-week" })).id, "commute");
  assert.equal(router.routeScene(at("commute", { currentEventId: "hospital" })).id, "hospital");
  assert.equal(router.routeScene(at("evening")).id, "room");
  assert.equal(router.routeScene(at("evening", { stage: "married" })).id, "home");
  // 精简节奏直接停在晚上
  assert.equal(router.routeScene(at("work"), null, true).id, "room");
  assert.equal(router.routeScene(at("work"), null, false, true).id, "reunion");
  const date = router.routeScene(at("evening"), "archery");
  assert.equal(date.id, "venue");
  assert.equal(date.venue, "archery");

  const parent = start("parent", 12);
  assert.equal(router.routeScene(parent).id, "park");
  assert.equal(router.routeScene({ ...parent, week: { ...parent.week, slot: "afternoon" } }).id, "parent-home");
});

test("场景热点：可用状态与引擎动作一致，约会和年夜饭时没有热点", () => {
  for (const state of [at("work"), at("commute"), at("evening"), at("evening", { stage: "married" }), start("parent", 12)]) {
    const route = router.routeScene(state);
    const hotspots = router.getHotspots(state, route);
    assert.ok(hotspots.length > 0, `${route.id} 应该有热点`);
    const childIds = new Set(getAvailableChildActions(state));
    const parentIds = new Set(getAvailableParentActions(state));
    for (const spot of hotspots) {
      if (spot.target.kind === "child-action") assert.equal(spot.enabled, state.activeActor === "child" && childIds.has(spot.target.id), spot.id);
      if (spot.target.kind === "parent-action") assert.equal(spot.enabled, state.activeActor === "parent" && parentIds.has(spot.target.id), spot.id);
    }
  }
  const room = at("evening");
  assert.ok(router.getHotspots(room, router.routeScene(room)).some(spot => spot.id === "calendar"));
  assert.ok(router.getHotspots(at("work"), router.routeScene(at("work"))).some(spot => spot.target.kind === "advance"));
  assert.equal(router.getHotspots(at("work"), router.routeScene(at("work"), null, true), true).some(spot => spot.target.kind === "advance"), false);
  assert.deepEqual(router.getHotspots(at("work"), router.routeScene(at("work"), null, false, true)), []);
  assert.deepEqual(router.getHotspots(at("evening"), router.routeScene(at("evening"), "walk")), []);
  const hospital = at("commute", { currentEventId: "hospital" });
  assert.deepEqual(router.getHotspots(hospital, router.routeScene(hospital)).map(spot => spot.id).filter(id => id.startsWith("hospital")), ["hospital-phone", "hospital-call", "hospital-bench"]);
});

test("年夜饭与节日：每年第一季回老家，七夕只在交往后提醒", () => {
  assert.equal(router.isReunionTurn({ turn: 1, monthsPerTurn: 3, currentEventId: null }), true);
  assert.equal(router.isReunionTurn({ turn: 5, monthsPerTurn: 3, currentEventId: null }), true);
  assert.equal(router.isReunionTurn({ turn: 2, monthsPerTurn: 3, currentEventId: null }), false);
  assert.equal(router.isReunionTurn({ turn: 2, monthsPerTurn: 3, currentEventId: "holiday-table" }), true);
  assert.equal(router.isReunionTurn({ turn: 2, monthsPerTurn: 12, currentEventId: null }), true);
  assert.deepEqual(router.getFestivalReminders({ ...child, stage: "single", turn: 3 }), []);
  assert.ok(router.getFestivalReminders({ ...child, stage: "dating", turn: 3 }).some(line => line.includes("七夕")));
  assert.equal(router.getFestivalReminders({ ...child, stage: "dating", turn: 3, matchClosed: true }).length, 0);
});

test("年夜饭连环问：确定性抽题、按阶段换题库、不消耗引擎随机数", () => {
  const before = JSON.stringify(child);
  const first = reunion.getReunionQuestions(child);
  assert.deepEqual(reunion.getReunionQuestions(child), first);
  assert.equal(JSON.stringify(child), before);
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map(question => question.id)).size, 3);
  for (const question of first) {
    assert.ok(reunion.RELATIVES.includes(question.asker));
    assert.deepEqual(question.answers.map(answer => answer.id), ["honest", "deflect", "joke"]);
    assert.ok(question.silence.length > 0);
  }
  const married = reunion.getReunionQuestions({ ...child, stage: "married" }).map(question => question.id);
  assert.ok(married.includes("baby") || married.includes("money"));
  const parentIds = reunion.getReunionQuestions(start("parent", 12)).map(question => question.id);
  assert.ok(parentIds.includes("child-partner") || parentIds.includes("child-money"));
  assert.match(reunion.reunionSummary(["silent", "silent", "honest"]), /说得不多/);
  assert.match(reunion.reunionSummary(["honest", "honest", "joke"]), /想法说清楚/);
  assert.match(reunion.reunionSummary(["joke", "joke", "deflect"]), /玩笑/);
  assert.match(reunion.reunionSummary(["honest", "deflect", "joke"]), /饺子/);
});

test("对话脚本：所有提交的动作都是当前可用的引擎动作", () => {
  const states = [
    { ...child, stage: "chatting" },
    { ...child, stage: "dating", meetings: 3, understanding: 60, relation: 60, mutualIntent: 70 },
    { ...child, stage: "married", marriedAtTurn: 1, relation: 60 },
    start("parent", 12),
  ];
  for (const state of states) {
    const childIds = new Set(getAvailableChildActions(state));
    const parentIds = new Set(getAvailableParentActions(state));
    for (const chat of ["candidate", "mom", "work", "child", "sisters"]) {
      const script = dialogues.buildScript(state, chat);
      if (!script) continue;
      assert.ok(script.nodes[script.start], `${chat} 缺少起始节点`);
      for (const node of Object.values(script.nodes)) {
        for (const choice of node.choices) {
          if (choice.next) assert.ok(script.nodes[choice.next], `${chat}.${choice.id} 指向不存在的节点`);
          const { action } = choice;
          if (action?.type === "child-action") assert.ok(childIds.has(action.id), `${state.stage}/${chat}: ${action.id} 当前不可用`);
          if (action?.type === "parent-action") assert.ok(parentIds.has(action.id), `${chat}: ${action.id} 当前不可用`);
          if (choice.confirm) assert.ok(childIds.has(choice.confirm), `${chat}: 决定 ${choice.confirm} 当前不可用`);
        }
      }
    }
  }
});

test("会话列表与消息线程", () => {
  const ids = dialogues.listChats(child, "阿川").map(entry => entry.id);
  assert.ok(ids.includes("candidate") && ids.includes("mom") && ids.includes("work"));
  assert.ok(dialogues.listChats(start("parent", 12), "阿川").some(entry => entry.id === "child"));
  const kind = Object.keys(MESSAGE_KINDS).find(key => MESSAGE_KINDS[key].from === "mom" && MESSAGE_KINDS[key].slot === "work");
  const message = { id: "t-1", kind, from: "mom", slot: "work", urgent: false };
  const state = { ...child, week: { ...child.week, inbox: [message], handled: {} } };
  const entry = dialogues.listChats(state, "阿川").find(item => item.id === "mom");
  assert.ok(entry.unread >= 1);
  assert.ok(dialogues.buildThread(state, "mom").length >= 1);
  assert.equal(dialogues.stripSpeaker("妈妈：“周末回来吃饭吗？”"), "周末回来吃饭吗？");
  assert.equal(dialogues.stripSpeaker("对方：今天好累"), "今天好累");
});

test("手机消息是真实的聊天内容，而不是旁白", async () => {
  const chat = await loadTypescriptModule(`${root}/immersive/chatScripts.ts`);
  const narration = /发来|后面跟着|打来|转来|分享了|更新了|（|\(/;
  for (const [kind, definition] of Object.entries(MESSAGE_KINDS)) {
    const variants = chat.INCOMING[kind];
    assert.ok(variants?.length, `${kind} 缺少聊天剧本`);
    for (const specs of variants) {
      for (const spec of specs) {
        if (spec.kind === "system" || spec.kind === "moment") continue;
        assert.doesNotMatch(spec.text, narration, `${kind}: “${spec.text}” 像旁白`);
      }
    }
    for (const reply of definition.replies) {
      const script = chat.OUTGOING[`${kind}.${reply.id}`];
      assert.ok(script, `${kind}.${reply.id} 缺少我方发出的内容`);
      for (const spec of script.mine) if (spec.kind === "text") assert.doesNotMatch(spec.text, /^发个|^请半小时|^转发给/, `${kind}.${reply.id}: 发出去的是按钮文案`);
    }
  }
  const message = { id: "t-meet", kind: "mom-meet", from: "mom", slot: "work", urgent: true };
  const state = { ...child, week: { ...child.week, inbox: [message], handled: { "t-meet": "emoji" } } };
  const thread = dialogues.buildThread(state, "mom", "阿川");
  assert.ok(thread.some(bubble => bubble.kind === "card"), "妈妈推名片应是名片气泡");
  assert.ok(thread.some(bubble => bubble.mine && bubble.kind === "sticker"), "“收到”应该真的发出一个表情");
  assert.equal(thread.some(bubble => bubble.text.includes("发个")), false);
  const group = { ...child, week: { ...child.week, inbox: [{ id: "t-cmp", kind: "mom-compare", from: "family-group", slot: "work", urgent: false }], handled: {} } };
  assert.ok(dialogues.buildThread(group, "family", "阿川").every(bubble => bubble.kind === "system" || bubble.speaker), "群聊消息应带发言人");
});

test("场馆小互动覆盖所有活动场馆，并随已知信息与性格调整", () => {
  const venues = new Set(Object.values(ACTIVITIES).map(activity => activity.venue));
  for (const venue of venues) {
    const mini = scripts.VENUE_MINIS[venue];
    assert.ok(mini, `${venue} 缺少小互动`);
    assert.ok(mini.options.length >= 3);
    assert.equal(new Set(mini.options.map(option => option.id)).size, mini.options.length);
  }
  for (const [venue, skill] of Object.entries(scripts.VENUE_SKILLS)) {
    assert.ok(venues.has(venue));
    assert.equal(skill.rounds.length, 3);
    assert.equal(skill.results.length, 3);
  }
  for (const [venue, mini] of Object.entries(scripts.VENUE_STEPS)) {
    assert.ok(venues.has(venue));
    assert.equal(mini.steps.length, 3);
    assert.equal(scripts.summarizeSteps(mini, ["care", "care", "push"]).id, "steps-care");
    assert.equal(scripts.summarizeSteps(mini, ["push", "push", "care"]).id, "steps-push");
    assert.equal(scripts.summarizeSteps(mini, ["care", "push"]).id, "steps-mixed");
  }
  assert.equal(scripts.getVenueOptions("hotpot", { knowsDislikes: true, tags: [] })[0].id, "remember");
  assert.equal(scripts.getVenueOptions("hotpot", { knowsDislikes: false, tags: [] }).some(option => option.id === "remember"), false);
  assert.equal(scripts.getVenueOptions("boardgame", { knowsDislikes: false, tags: ["行动派"] }).find(option => option.id === "rush").mood, "fun");
  assert.equal(scripts.getVenueOptions("boardgame", { knowsDislikes: false, tags: ["慢热"] }).find(option => option.id === "rush").mood, "awkward");
});

test("关键过场：确认交往、领证、育儿、家庭对弈交接", () => {
  const names = { player: "阿川", candidate: "米汀", image: null };
  const chatting = { ...child, stage: "chatting" };
  assert.deepEqual(detectCutscenes(chatting, { ...chatting, stage: "dating" }, names).map(scene => scene.kind), ["official"]);
  const dating = { ...child, stage: "dating" };
  const simple = detectCutscenes(dating, { ...dating, stage: "married", lastChildAction: "simple-wedding" }, names);
  assert.equal(simple[0].kind, "wedding");
  assert.equal(simple[0].place, "民政局门口");
  assert.equal(detectCutscenes({ ...child, stage: "married" }, { ...child, stage: "parenthood" }, names)[0].kind, "baby");
  assert.deepEqual(detectCutscenes(child, child, names), []);

  const duelStart = engine.gameReducer(engine.createInitialState(), { type: "start", mode: "duel", difficulty: "realistic", seed: 11 });
  const duel = engine.gameReducer(duelStart, { type: "candidate", id: duelStart.candidateOptions[0] });
  const handed = engine.resolveGameAction(duel, { type: "parent-action", id: "listen" }).state;
  const handoff = detectCutscenes(duel, handed, names).find(scene => scene.kind === "handoff");
  assert.ok(handoff);
  assert.match(handoff.title, /阿川/);
});
