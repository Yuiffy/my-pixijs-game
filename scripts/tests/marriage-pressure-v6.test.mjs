import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const engine = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
const inbox = await loadTypescriptModule("src/components/marriagePressureGame/inbox.ts");
const activities = await loadTypescriptModule("src/components/marriagePressureGame/activities.ts");
const interests = await loadTypescriptModule("src/components/marriagePressureGame/interests.ts");
const { CANDIDATES } = await loadTypescriptModule("src/components/marriagePressureGame/content.ts");
const { createInitialState, gameReducer, resolveGameAction, validateSave } = engine;

function start(mode = "child", seed = 20260929, difficulty = "realistic") {
  let state = gameReducer(createInitialState(), { type: "start", mode, difficulty, seed });
  if (state.phase === "candidate") state = gameReducer(state, { type: "candidate", id: state.candidateOptions[0] });
  return state;
}

// 固定一个对象与关系阶段，方便比较约会结果
function situation(overrides = {}) {
  const base = start("child", 7);
  return { ...base, candidateId: "komichi", stage: "chatting", meetings: 2, chemistry: 80, relation: 20, mutualIntent: 50, understanding: 30, savings: 60, stress: 30, pressure: 20, knownInterests: [], knownDislikes: [], playerHobbies: [], matchClosed: false, ...overrides };
}

function withInbox(state, kinds) {
  return {
    ...state,
    week: {
      actor: state.activeActor,
      slot: state.activeActor === "parent" ? "morning" : "work",
      inbox: kinds.map(kind => ({ id: `t-${kind}`, kind, from: inbox.MESSAGE_KINDS[kind].from, slot: inbox.MESSAGE_KINDS[kind].slot, urgent: inbox.MESSAGE_KINDS[kind].urgent })),
      handled: {},
      micro: {},
    },
  };
}

test("every candidate has authored interests that never include the neutral meal", () => {
  assert.equal(CANDIDATES.length, 40);
  for (const candidate of CANDIDATES) {
    const entry = interests.CANDIDATE_INTERESTS[candidate.id];
    assert.ok(entry, candidate.id);
    assert.ok(entry.likes.length >= 2 && entry.likes.length <= 3, candidate.id);
    assert.ok(!entry.likes.includes("meal") && entry.dislike !== "meal", candidate.id);
    assert.ok(!entry.likes.includes(entry.dislike), candidate.id);
    for (const id of [...entry.likes, entry.dislike]) assert.ok(activities.isActivityId(id), `${candidate.id}:${id}`);
  }
  for (const id of interests.HOBBY_OPTIONS) assert.ok(activities.isActivityId(id));
});

test("each week opens a deterministic inbox without touching the engine rng", () => {
  const a = start("child", 11);
  const b = start("child", 11);
  assert.equal(a.week.actor, "child");
  assert.equal(a.week.slot, "work");
  assert.ok(a.week.inbox.length >= 1 && a.week.inbox.length <= 4);
  assert.deepEqual(a.week.inbox, b.week.inbox);
  const message = a.week.inbox[0];
  const reply = inbox.MESSAGE_KINDS[message.kind].replies[0];
  const replied = gameReducer(a, { type: "reply", messageId: message.id, choice: reply.id });
  assert.equal(replied.rng, a.rng);
  assert.equal(replied.turn, a.turn);
  assert.equal(replied.week.handled[message.id], reply.id);
  assert.equal(gameReducer(replied, { type: "reply", messageId: message.id, choice: reply.id }), replied, "a message can only be answered once");
  const advanced = gameReducer(replied, { type: "advance-slot" });
  assert.equal(advanced.week.slot, "commute");
  assert.equal(advanced.rng, a.rng);
  const evening = gameReducer(advanced, { type: "advance-slot" });
  assert.equal(evening.week.slot, "evening");
  assert.equal(gameReducer(evening, { type: "advance-slot" }), evening, "no slot after the evening");
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(evening))), evening);
});

test("micro replies are capped per message and per quarter", () => {
  const state = withInbox(situation({ familyBond: 50 }), ["mom-meet", "mom-support", "mom-listen", "family-care"]);
  let next = state;
  for (const item of state.week.inbox) {
    const best = inbox.MESSAGE_KINDS[item.kind].replies.reduce((top, reply) => ((reply.effects.familyBond ?? 0) > (top.effects.familyBond ?? 0) ? reply : top));
    next = gameReducer(next, { type: "reply", messageId: item.id, choice: best.id });
  }
  assert.equal(next.familyBond - state.familyBond, inbox.MICRO_TURN_LIMIT);
  for (const kind of Object.values(inbox.MESSAGE_KINDS)) {
    for (const reply of kind.replies) for (const delta of Object.values(reply.effects)) assert.ok(Math.abs(delta) <= inbox.MICRO_MESSAGE_LIMIT, `${kind.id}:${reply.id}`);
    for (const delta of Object.values(kind.ignored?.effects ?? {})) assert.ok(Math.abs(delta) <= inbox.MICRO_MESSAGE_LIMIT, kind.id);
  }
});

test("only urgent messages are settled as read-but-unanswered", () => {
  const state = withInbox(situation({ familyBond: 50, pressure: 20 }), ["mom-meet", "mom-listen"]);
  const result = resolveGameAction(state, { type: "child-action", id: "rest" });
  assert.equal(result.steps[0].kind, "message");
  assert.equal(result.steps[0].changes.find(c => c.key === "familyBond").delta, -1);
  const calm = withInbox(situation({ familyBond: 50 }), ["mom-listen"]);
  assert.ok(!resolveGameAction(calm, { type: "child-action", id: "rest" }).steps.some(step => step.kind === "message"));
  const leaving = gameReducer(withInbox(situation({ familyBond: 50 }), ["mom-meet"]), { type: "advance-slot" });
  assert.equal(leaving.week.handled["t-mom-meet"], "ignored");
  assert.equal(leaving.familyBond, 49);
});

test("messages cannot create attraction that the match does not have", () => {
  const cold = withInbox(situation({ chemistry: 5, stage: "chatting", relation: 10, mutualIntent: 30 }), ["candidate-home"]);
  const replied = gameReducer(cold, { type: "reply", messageId: "t-candidate-home", choice: "reply" });
  assert.equal(replied.relation, cold.relation);
});

test("activities are gated by stage, cost differently, and AA halves the same outcome", () => {
  const chatting = situation();
  assert.equal(gameReducer(chatting, { type: "child-action", id: "meet-aa", activity: "cook" }), chatting, "cooking at home needs dating");
  const dating = situation({ stage: "dating", relation: 60, mutualIntent: 60 });
  assert.notEqual(gameReducer(dating, { type: "child-action", id: "meet-aa", activity: "cook" }), dating);
  const komichi = CANDIDATES.find(c => c.id === "komichi");
  const walk = activities.getActivityCost(komichi.cityCost, "walk");
  const western = activities.getActivityCost(komichi.cityCost, "western");
  assert.ok(walk < komichi.cityCost && western > komichi.cityCost);
  const aa = gameReducer(situation(), { type: "child-action", id: "meet-aa", activity: "museum" });
  const treat = gameReducer(situation(), { type: "child-action", id: "meet", activity: "museum" });
  for (const key of ["relation", "mutualIntent", "understanding", "meetings", "stage"]) assert.equal(aa[key], treat[key], key);
  assert.ok(aa.savings > treat.savings);
  assert.equal(gameReducer(chatting, { type: "child-action", id: "rest", activity: "walk" }), chatting, "activities only apply to meetings and hobbies");
});

test("the default meal matches the v5 meeting exactly", () => {
  const before = situation();
  const plain = gameReducer(before, { type: "child-action", id: "meet-aa" });
  const meal = gameReducer(before, { type: "child-action", id: "meet-aa", activity: "meal" });
  assert.deepEqual(meal, plain);
});

test("liked activities amplify only an existing mutual attraction", () => {
  // komichi 喜欢散步、爬山、看展；不喜欢西餐
  const warm = situation({ chemistry: 80 });
  const liked = gameReducer(warm, { type: "child-action", id: "meet-aa", activity: "museum" });
  const neutral = gameReducer(warm, { type: "child-action", id: "meet-aa", activity: "cafe" });
  assert.ok(liked.relation > neutral.relation);
  assert.ok(liked.knownInterests.includes("museum"));
  const cold = situation({ chemistry: 5, meetings: 0 });
  const coldLiked = gameReducer(cold, { type: "child-action", id: "meet-aa", activity: "museum" });
  const coldMeal = gameReducer(cold, { type: "child-action", id: "meet-aa" });
  assert.equal(coldLiked.relation, coldMeal.relation);
  const disliked = gameReducer(warm, { type: "child-action", id: "meet-aa", activity: "western" });
  assert.ok(disliked.relation < neutral.relation);
  assert.ok(disliked.knownDislikes.includes("western"));
});

test("long private activities feel early before two meetings", () => {
  const first = situation({ meetings: 0 });
  assert.ok(activities.isEarlyForActivity(first, "hike"));
  assert.ok(!activities.isEarlyForActivity(situation({ meetings: 2 }), "hike"));
  const early = gameReducer(first, { type: "child-action", id: "meet-aa", activity: "karting" });
  const later = gameReducer(situation({ meetings: 0 }), { type: "child-action", id: "meet-aa", activity: "movie" });
  assert.ok(early.mutualIntent < later.mutualIntent);
  assert.match(early.datingFeedback, /拘谨/);
});

test("low fitness makes hiking more tiring", () => {
  const unfit = gameReducer(situation({ fitness: 30 }), { type: "child-action", id: "meet-aa", activity: "hike" });
  const fit = gameReducer(situation({ fitness: 60 }), { type: "child-action", id: "meet-aa", activity: "hike" });
  assert.ok(unfit.stress > fit.stress);
});

test("chats and moments reveal interests; hobbies create shared topics", () => {
  const listened = gameReducer(situation(), { type: "child-action", id: "chat-listen" });
  assert.deepEqual(listened.knownInterests, [interests.CANDIDATE_INTERESTS.komichi.likes[0]]);
  const checked = gameReducer(situation({ understanding: 50 }), { type: "child-action", id: "chat-checklist" });
  assert.deepEqual(checked.knownDislikes, ["western"]);
  const hobby = gameReducer(situation(), { type: "child-action", id: "hobby", activity: "hike" });
  assert.deepEqual(hobby.playerHobbies, ["hike"]);
  const plainState = situation();
  assert.equal(gameReducer(plainState, { type: "child-action", id: "hobby", activity: "karting" }), plainState, "only listed hobby directions");
  const shared = gameReducer({ ...situation(), playerHobbies: ["hike"] }, { type: "child-action", id: "chat-share" });
  const plain = gameReducer(situation(), { type: "child-action", id: "chat-share" });
  assert.equal(shared.understanding - plain.understanding, 4);
  assert.ok(shared.knownInterests.includes("hike"));
  const moments = gameReducer(withInbox(situation(), ["candidate-moments"]), { type: "reply", messageId: "t-candidate-moments", choice: "look" });
  assert.equal(moments.knownInterests.length, 1);
});

test("duel and parent modes open the right week for each actor", () => {
  const duel = start("duel", 5);
  assert.equal(duel.activeActor, "parent");
  assert.equal(duel.week.actor, "parent");
  assert.equal(duel.week.slot, "morning");
  const handed = gameReducer(duel, { type: "parent-action", id: "listen" });
  assert.equal(handed.activeActor, "child");
  assert.equal(handed.week.actor, "child");
  assert.ok(handed.week.inbox.some(item => item.kind === "mom-listen"));
  const parent = start("parent", 5);
  const played = gameReducer(parent, { type: "parent-action", id: "listen" });
  assert.equal(played.activeActor, "parent");
  assert.equal(played.turn, parent.turn + 1);
  assert.equal(played.week.actor, "parent");
});

test("v5 saves migrate into the evening of the same quarter without penalties", () => {
  const current = start("child", 9);
  const legacy = JSON.parse(JSON.stringify(current));
  for (const key of ["week", "knownInterests", "knownDislikes", "playerHobbies", "lastActivity", "dateLog"]) delete legacy[key];
  legacy.version = 5;
  const migrated = validateSave(legacy);
  assert.equal(migrated.version, 6);
  assert.equal(migrated.week.slot, "evening");
  assert.deepEqual(migrated.week.inbox, []);
  for (const key of ["turn", "stress", "familyBond", "rng", "candidateId"]) assert.equal(migrated[key], current[key]);
  assert.equal(validateSave({ ...current, week: { ...current.week, slot: "morning" } }), null);
  assert.equal(validateSave({ ...current, knownInterests: ["flying"] }), null);
  assert.equal(validateSave({ ...current, week: { ...current.week, inbox: [{ id: "x", kind: "nope", urgent: true }] } }), null);
});
