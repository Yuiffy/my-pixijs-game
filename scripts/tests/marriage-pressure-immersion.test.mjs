import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const root = "src/components/marriagePressureGame";
const e = await loadTypescriptModule(`${root}/engine.ts`);
const stories = await loadTypescriptModule(`${root}/immersive/dailyStories.ts`);
const d = await loadTypescriptModule(`${root}/immersive/dialogues.ts`);
const motion = await loadTypescriptModule(`${root}/immersive/scene/commuteMotion.ts`);
const memory = await loadTypescriptModule(`${root}/immersive/conversationMemory.ts`);
const { venueView } = await loadTypescriptModule(`${root}/immersive/scene/venueView.ts`);
const { ACTIVITIES } = await loadTypescriptModule(`${root}/activities.ts`);
const { INCOMING } = await loadTypescriptModule(`${root}/immersive/chatScripts.ts`);
function state() {
  const base = e.gameReducer(e.createInitialState(), { type: "start", mode: "child", difficulty: "realistic", seed: 11 });
  return { ...base, stage: "chatting", currentEventId: "quiet-week", chemistry: 80, mutualIntent: 65, relation: 40, understanding: 30,
    week: { ...base.week, slot: "work", inbox: [{ id: "share", kind: "candidate-share", from: "candidate", slot: "work", urgent: true }], handled: {}, micro: {} } };
}
const reply = (s, choice = "now") => e.gameReducer(s, { type: "reply", messageId: "share", choice });

test("daily stories form a stable non-repeating deck per candidate; feeds do not reroll after learning a preference", () => {
  const s = state();
  const ids = Array.from({ length: stories.DAILY_STORIES.length }, (_, n) => stories.candidateStory({ ...s, turn: n + 1 }).id);
  assert.equal(new Set(ids).size, stories.DAILY_STORIES.length);
  assert.deepEqual(stories.candidateStory(s), stories.candidateStory(JSON.parse(JSON.stringify(s))));
  assert.notDeepEqual(ids, Array.from({ length: ids.length }, (_, n) => stories.candidateStory({ ...s, candidateId: "pako", turn: n + 1 }).id));
  const candidate = e.getCandidate(s.candidateId);
  assert.deepEqual(stories.dailyMoments(s, candidate), stories.dailyMoments({ ...s, knownInterests: ["cafe"] }, candidate));
  for (const pool of Object.values(stories.MOMENT_POOLS)) {
    assert.equal(new Set(Array.from({ length: pool.length }, (_, n) => stories.dailyPick(pool, 11, n + 1, "test"))).size, pool.length);
  }
  assert.ok(INCOMING["boss-ping"].length >= 7 && INCOMING["mom-marriage"].length >= 7);
});

test("received story, reply, answer and conversation choices stay on the same subject across every variant", () => {
  for (let turn = 1; turn <= stories.DAILY_STORIES.length; turn++) {
    const s = { ...state(), turn };
    const story = stories.candidateStory(s);
    const answered = reply(s);
    const thread = d.buildThread(answered, "candidate");
    assert.ok(thread.some(b => b.text === story.reply && b.mine));
    assert.ok(thread.some(b => b.text === story.answer && !b.mine));
    assert.equal(d.candidateScript(s).nodes.start.choices.find(c => c.id === "ask").label, story.question);
    assert.equal(d.candidateScript(s).nodes.listen.lines[0].text, story.detail);
  }
});

test("promising to reply later gives no advance reward, survives reload, reappears at commute and cannot be farmed", () => {
  const initial = state();
  const promised = reply(initial, "later");
  assert.equal(promised.week.handled.share, "deferred");
  assert.equal(promised.understanding, initial.understanding);
  assert.equal(promised.career, initial.career);
  assert.equal(d.listChats(promised).find(c => c.id === "candidate").unread, 0);
  assert.deepEqual(reply(promised), promised);
  const restored = e.validateSave(JSON.parse(JSON.stringify(promised)));
  assert.ok(restored);
  const commute = e.gameReducer(restored, { type: "advance-slot" });
  assert.equal(commute.week.handled.share, "deferred", "work departure must not penalize a promise");
  assert.equal(d.listChats(commute).find(c => c.id === "candidate").unread, 1);
  const answered = reply(commute);
  assert.equal(answered.week.handled.share, "kept-promise");
  assert.equal(answered.understanding, commute.understanding + 2);
  assert.equal(answered.career, commute.career);
  assert.deepEqual(reply(answered), answered);
  assert.equal(answered.turn, initial.turn);
});

test("office replies interrupt work, commuting replies do not; unkept promises settle once at day end", () => {
  const s = state();
  assert.equal(reply(s).career, s.career - 1);
  assert.equal(reply({ ...s, week: { ...s.week, slot: "commute" } }).career, s.career);
  const promised = reply(s, "later");
  const result = e.resolveGameAction(promised, { type: "child-action", id: "rest" });
  assert.ok(result.steps.some(step => step.kind === "message" && step.detail.includes("答应下班再聊")));
});

test("date mood is settled once and recorded for subsequent memories without manufacturing attraction", () => {
  const s = state(); s.week = { ...s.week, slot: "evening", inbox: [] };
  const plain = e.resolveGameAction(s, { type: "child-action", id: "meet-aa", activity: "cafe" });
  const warm = e.resolveGameAction(s, { type: "child-action", id: "meet-aa", activity: "cafe", mood: "warm" });
  assert.equal(warm.state.understanding, plain.state.understanding + 2);
  assert.equal(warm.state.dateLog.at(-1).mood, "warm");
  assert.ok(warm.steps.find(step => step.kind === "choice").detail.includes("小习惯"));
  const cold = { ...s, chemistry: 5, mutualIntent: 15 };
  const normal = e.resolveGameAction(cold, { type: "child-action", id: "meet-aa", activity: "cafe" });
  const fun = e.resolveGameAction(cold, { type: "child-action", id: "meet-aa", activity: "cafe", mood: "fun" });
  assert.equal(fun.state.relation, normal.state.relation);
});

test("walking is frame-rate independent, pausable and recycles street behind the player", () => {
  const run = hz => { const s = { distance: 0, elapsed: 0, moving: true }; for (let i = 0; i < hz * 10; i++) motion.stepCommute(s, 1 / hz); return s; };
  assert.ok(Math.abs(run(30).distance - run(60).distance) < 0.0001);
  const s = { ...run(60), moving: false }; const before = s.distance;
  motion.stepCommute(s, 1); assert.equal(s.distance, before);
  s.moving = true; motion.stepCommute(s, 200); assert.ok(s.distance - before < .1);
  for (const distance of [0, 5, 59.99, 60, 1000]) {
    const positions = Array.from({ length: motion.STREET_SEGMENTS }, (_, i) => motion.streetPosition(i, distance)).sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i++) assert.ok(Math.abs(positions[i] - positions[i - 1] - motion.STREET_LENGTH) < .0001);
    assert.ok(positions.every(z => z > -42 && z <= 18));
  }
});

test("all date venues have human-height first-person views; malformed or another run's conversation memory is discarded", () => {
  for (const venue of new Set(Object.values(ACTIVITIES).map(a => a.venue))) {
    const view = venueView(venue);
    assert.ok(view.position[1] >= 1.2 && view.position[1] <= 1.7);
    assert.ok(view.partner[2] < view.position[2]);
  }
  const saved = { key: "run", chats: { candidate: { nodeId: "listen", sent: [{ id: "1", mine: true, kind: "text", text: "下班接着聊" }] } } };
  assert.deepEqual(memory.restoreConversations(JSON.stringify(saved), "run"), saved);
  assert.deepEqual(memory.restoreConversations(JSON.stringify(saved), "other").chats, {});
  assert.deepEqual(memory.restoreConversations('{"key":"run","chats":{"bad":null}}', "run").chats, {});
});
