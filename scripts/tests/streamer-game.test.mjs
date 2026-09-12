import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const engine = await loadTypescriptModule(
  "src/components/streamerGame/engine.ts",
);
const { TOPICS, PERKS } = await loadTypescriptModule(
  "src/components/streamerGame/content.ts",
);
const {
  createInitialState,
  gameReducer,
  getViewers,
  getSupportRate,
  getReplyPreview,
  getNextBeatRisk,
  getEnding,
  validateSave,
} = engine;

function start(seed = 42, timed = false, perk) {
  return gameReducer(createInitialState(), {
    type: "start",
    seed,
    timed,
    perk,
  });
}

function choose(state, id = state.topicOptions[0]) {
  return gameReducer(state, { type: "topic", id });
}

function reply(state, kind = "rational", style = "explain") {
  const beat = TOPICS.find((topic) => topic.id === state.activeTopic).beats[
    state.beat
  ];
  const index = beat.comments.findIndex((comment) => comment.kind === kind);
  assert.ok(
    index >= 0,
    `Missing ${kind} comment in ${state.activeTopic}:${state.beat}`,
  );
  return gameReducer(state, { type: "reply", index, style });
}

function roundTrip(state) {
  assert.deepEqual(
    validateSave(JSON.parse(JSON.stringify(state))),
    state,
    `Save rejected at ${state.phase}, ${state.completedTopics} topics`,
  );
}

function pilot(seed, strategy = "balanced", startPerk, lowRisk = false) {
  let state = start(seed, false, startPerk);
  const seen = new Set();
  for (let step = 0; step < 100 && state.phase !== "ended"; step += 1) {
    roundTrip(state);
    if (state.phase === "topic") {
      const candidates = state.topicOptions.map((id) =>
        TOPICS.find((topic) => topic.id === id),
      );
      // Every policy sees the same draft; higher-risk selections stress the response mechanics.
      const id = candidates.sort(
        (a, b) =>
          (b.beats.reduce((sum, beat) => sum + beat.risk, 0) -
          a.beats.reduce((sum, beat) => sum + beat.risk, 0)) * (lowRisk ? -1 : 1),
      )[0].id;
      assert.ok(!seen.has(id));
      seen.add(id);
      state = choose(state, id);
    } else if (state.phase === "continue") {
      state = gameReducer(state, { type: "continue" });
    } else if (state.phase === "reward") {
      state = gameReducer(state, {
        type: "reward",
        id: state.rewardOptions.includes("empathetic")
          ? "empathetic"
          : state.rewardOptions[0],
      });
    } else if (state.phase === "reply") {
      if (strategy === "balanced") {
        const style =
          state.energy > 28 && state.risk > 22 ? "explain" : "agree";
        state = reply(state, "rational", style);
      } else if (strategy === "explain")
        state = reply(state, "rational", "explain");
      else if (strategy === "echo") state = reply(state, "support", "agree");
      else if (strategy === "fight")
        state = reply(state, "rational", "confront");
      else if (strategy === "boundary")
        state = reply(state, "chaos", "confront");
      else if (strategy === 'casual') state = reply(state, 'casual', 'agree');
      else if (strategy === 'overexplain') state = reply(state, 'chaos', 'explain');
      else if (strategy === 'mixed') state = state.resolvedBeats % 3 === 0 ? reply(state, 'support', 'agree') : reply(state, 'rational', 'explain');
    }
  }
  assert.equal(state.phase, "ended");
  roundTrip(state);
  return state;
}

test("content offers unique three-beat topics with all four audience perspectives", () => {
  assert.ok(TOPICS.length >= 12);
  assert.equal(new Set(TOPICS.map((topic) => topic.id)).size, TOPICS.length);
  assert.equal(new Set(PERKS.map((perk) => perk.id)).size, 8);
  for (const topic of TOPICS) {
    assert.equal(topic.beats.length, 3);
    for (const beat of topic.beats) {
      assert.ok(beat.text.length > 15);
      assert.ok(beat.risk >= 0 && beat.risk <= 30);
      assert.deepEqual(
        [...new Set(beat.comments.map((comment) => comment.kind))].sort(),
        ["casual", "chaos", "rational", "support"],
      );
    }
  }
});

test("same seed produces identical states, fresh arrays, and repeatable draft choices", () => {
  const lobby = createInitialState();
  const snapshot = structuredClone(lobby);
  const a = gameReducer(lobby, { type: "start", seed: 831, timed: false });
  const b = gameReducer(lobby, { type: "start", seed: 831, timed: false });
  assert.deepEqual(a, b);
  assert.deepEqual(lobby, snapshot);
  assert.notEqual(a.fans, lobby.fans);
  assert.ok(a.topicOptions.includes("laptop"));
  assert.equal(new Set(a.topicOptions).size, 3);
  assert.deepEqual(choose(a), choose(b));
  const seedOptions = new Set(
    [2, 3, 4, 5, 6].map((seed) => start(seed).topicOptions.join(",")),
  );
  assert.ok(seedOptions.size > 1);
  assert.equal(start(Number.NaN).seed, 1);
  assert.equal(start(Infinity).seed, 1);
});

test("replies resolve once, explicit continuation reveals the next consequence, final reply finishes topic", () => {
  const state = choose(start(), "laptop");
  const before = structuredClone(state);
  const replied = reply(state);
  assert.equal(replied.phase, "continue");
  assert.equal(replied.beat, 0);
  assert.equal(replied.resolvedBeats, 1);
  assert.deepEqual(state, before);
  assert.equal(
    gameReducer(replied, { type: "reply", index: 0, style: "agree" }),
    replied,
  );
  const next = gameReducer(replied, { type: "continue" });
  assert.equal(next.beat, 1);
  assert.equal(next.phase, "reply");
  assert.ok(next.heat > replied.heat);
  assert.ok(next.risk >= replied.risk);
  const third = gameReducer(reply(next), { type: "continue" });
  const completed = reply(third);
  assert.equal(completed.phase, "topic");
  assert.equal(completed.completedTopics, 1);
  assert.equal(completed.resolvedBeats, 3);
  assert.equal(completed.activeTopic, null);
  assert.ok(!completed.topicOptions.includes("laptop"));
});

test("targeting context matters: explanation costs energy; confronting good-faith criticism harms trust", () => {
  const state = choose(start());
  const explained = reply(state, "rational", "explain");
  const agreed = reply(state, "support", "agree");
  const fought = reply(state, "rational", "confront");
  const boundary = reply(state, "chaos", "confront");
  assert.ok(explained.trust > agreed.trust);
  assert.ok(explained.energy < agreed.energy);
  assert.ok(agreed.control > explained.control);
  assert.ok(agreed.fans.support > explained.fans.support);
  assert.ok(fought.risk > boundary.risk);
  assert.ok(fought.trust < boundary.trust);
  assert.ok(boundary.heat > explained.heat);
  const weakBoundary = reply({ ...state, trust: 35 }, "chaos", "confront");
  assert.ok(weakBoundary.risk > state.risk);
  const ignored = reply({ ...state, ignoredConcerns: 5 }, "support", "agree");
  assert.ok(ignored.risk > agreed.risk);
  const index = TOPICS.find(
    (topic) => topic.id === state.activeTopic,
  ).beats[0].comments.findIndex((comment) => comment.kind === "rational");
  const frozen = JSON.stringify(state);
  assert.equal(
    getReplyPreview(state, index, "explain"),
    "热度-4 · 观众+54 · 风险-12 · 信任+7 · 精力-9 · 脑控+1",
  );
  assert.equal(
    getReplyPreview(state, index, "explain"),
    getReplyPreview(state, index, "explain"),
  );
  assert.equal(JSON.stringify(state), frozen);
});

test("action charges cannot be farmed; room moderation is limited to one use per beat", () => {
  const state = choose(start());
  const moderated = gameReducer(state, { type: "action", id: "moderate" });
  assert.equal(moderated.phase, "reply");
  assert.equal(moderated.actions.moderate, 1);
  assert.equal(moderated.resolvedBeats, 0);
  assert.equal(
    gameReducer(moderated, { type: "action", id: "moderate" }),
    moderated,
  );
  const nextBeat = gameReducer(reply(moderated), { type: "continue" });
  const secondModeration = gameReducer(nextBeat, {
    type: "action",
    id: "moderate",
  });
  assert.equal(secondModeration.actions.moderate, 0);
  const interrupted = gameReducer(secondModeration, {
    type: "action",
    id: "sing",
  });
  assert.equal(interrupted.completedTopics, 1);
  assert.equal(interrupted.interruptions, 1);
  assert.equal(interrupted.actions.sing, 0);
  assert.equal(interrupted.phase, "topic");
  const another = choose(interrupted);
  assert.equal(gameReducer(another, { type: "action", id: "sing" }), another);
  const breakState = gameReducer(another, { type: "action", id: "game" });
  assert.equal(breakState.phase, "reward");
  assert.equal(breakState.act, 1);
  const rewarded = gameReducer(breakState, {
    type: "reward",
    id: breakState.rewardOptions[0],
  });
  assert.equal(rewarded.act, 2);
  assert.equal(
    rewarded.actions.sing,
    breakState.rewardOptions[0] === "encore" ? 2 : 1,
  );
  assert.equal(rewarded.actions.moderate, 1);
  assert.equal(
    gameReducer(rewarded, { type: "reward", id: breakState.rewardOptions[0] }),
    rewarded,
  );
  assert.equal(
    gameReducer(rewarded, { type: "reward", id: "not-a-perk" }),
    rewarded,
  );
});

test("timer grants a decision window, penalizes silence, pauses between acts, and eventually ends a stream", () => {
  const state = start(31, true);
  assert.equal(gameReducer(state, { type: "tick", ms: NaN }), state);
  assert.equal(gameReducer(state, { type: "tick", ms: -100 }), state);
  assert.equal(gameReducer(state, { type: "tick", ms: Infinity }), state);
  const near = gameReducer(state, { type: "tick", ms: 44999 });
  assert.equal(near.silenceCount, 0);
  const silence = gameReducer(near, { type: "tick", ms: 1 });
  assert.equal(silence.silenceCount, 1);
  assert.equal(silence.remainingMs, 45000);
  assert.equal(silence.energy, state.energy - 8);
  assert.ok(getViewers(silence) < getViewers(state));
  const relaxed = start(31, false);
  assert.equal(gameReducer(relaxed, { type: "tick", ms: 200000 }), relaxed);
  const slow = start(31, true, "slow-chat");
  assert.equal(slow.remainingMs, 60000);
  assert.equal(gameReducer(slow, { type: "tick", ms: 45000 }).silenceCount, 0);
  const failed = gameReducer(state, { type: "tick", ms: 600000 });
  assert.equal(failed.phase, "ended");
  assert.equal(failed.ending, "empty-room");
  assert.ok(failed.energy > 0);
  assert.equal(gameReducer(failed, { type: "tick", ms: 45000 }), failed);
  roundTrip(failed);
  let reward = gameReducer(choose(state), { type: "action", id: "sing" });
  reward = gameReducer(choose(reward), { type: "action", id: "game" });
  assert.equal(reward.phase, "reward");
  assert.equal(gameReducer(reward, { type: "tick", ms: 600000 }), reward);
});

test("all six topics and three acts complete; repeated high-risk confrontation collapses", () => {
  const balanced = pilot(4301);
  assert.equal(balanced.completedTopics, 6);
  assert.equal(balanced.act, 3);
  assert.equal(balanced.resolvedBeats, 18);
  assert.equal(balanced.perks.length, 2);
  assert.ok(balanced.score > 1000);
  assert.equal(getEnding(balanced).id, balanced.ending);
  const fight = pilot(4301, "fight");
  assert.equal(fight.ending, "collapse");
  assert.ok(fight.completedTopics < 6);
  assert.ok(fight.score < balanced.score);
});

test("several seeds expose strategy tradeoffs instead of a universal cheap response", () => {
  const runs = [17, 42, 4301, 7602, 83192].map((seed) => ({
    balanced: pilot(seed),
    explain: pilot(seed, "explain"),
    echo: pilot(seed, "echo"),
    fight: pilot(seed, "fight"),
    boundary: pilot(seed, "boundary"),
  }));
  assert.ok(runs.every((run) => run.balanced.completedTopics === 6));
  assert.ok(runs.every((run) => run.fight.ending === "collapse"));
  assert.ok(runs.every((run) => run.echo.control > run.balanced.control));
  assert.ok(runs.every((run) => run.explain.trust > run.echo.trust));
  assert.ok(runs.every((run) => run.boundary.heat > run.explain.heat));
  assert.ok(runs.some((run) => run.explain.energy < run.balanced.energy));
  assert.ok(runs.every((run) => run.balanced.score > run.fight.score));
});

test('repeated small talk remains safe but loses audience growth and score to a mixed strategy on identical topics', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const casual = pilot(seed, 'casual', undefined, true);
    const mixed = pilot(seed, 'mixed', undefined, true);
    assert.equal(casual.completedTopics, 6);
    assert.equal(mixed.completedTopics, 6);
    assert.deepEqual(casual.usedTopics, mixed.usedTopics);
    assert.ok(casual.energy > mixed.energy, `Relaxed small talk should conserve energy, seed ${seed}`);
    assert.ok(casual.score + 300 < mixed.score, `Mixed replies must meaningfully outperform routine small talk, seed ${seed}`);
    assert.ok(getViewers(casual) < getViewers(mixed));
    assert.ok(casual.heat < mixed.heat);
  }
});

test('next-beat risk preview matches the actual reveal including both perks and echo pressure', () => {
  for (const perk of [undefined, 'fact-check']) {
    const state = reply(choose(start(17, false, perk), 'laptop'));
    for (const echo of [false, true]) {
      const current = echo ? { ...state, control: 80, fans: { ...state.fans, rational: 90 } } : state;
      const before = JSON.stringify(current);
      const predicted = getNextBeatRisk(current);
      const next = gameReducer(current, { type: 'continue' });
      assert.equal(next.risk - current.risk, predicted);
      assert.equal(JSON.stringify(current), before);
    }
  }
  assert.equal(getNextBeatRisk(createInitialState()), 0);
});

test('normal choices can reach community, spectacle, quiet success, and burnout endings', () => {
  assert.equal(pilot(17, 'explain', undefined, true).ending, 'community');
  assert.equal(pilot(17, 'boundary', undefined, true).ending, 'tightrope');
  assert.equal(pilot(17, 'casual', undefined, true).ending, 'steady');
  assert.equal(pilot(17, 'overexplain', undefined, true).ending, 'burnout');
});

test("perks have immediate and mechanical effects without duplicate rewards", () => {
  assert.equal(start(7, false, "encore").actions.sing, 2);
  assert.equal(start(7, false, "invalid").perks.length, 0);
  const base = choose(start(7));
  const fact = choose(start(7, false, "fact-check"));
  assert.equal(base.risk - fact.risk, 3);
  const empathetic = reply(choose(start(7, false, "empathetic")));
  const plain = reply(base);
  assert.equal(empathetic.trust - plain.trust, 2);
  assert.equal(plain.risk - empathetic.risk, 2);
  const thick = reply(
    choose(start(7, false, "thick-skin")),
    "chaos",
    "confront",
  );
  const regular = reply(base, "chaos", "confront");
  assert.equal(thick.energy - regular.energy, 2);
  const landing = gameReducer(choose(start(7, false, "soft-landing")), {
    type: "action",
    id: "game",
  });
  const rough = gameReducer(base, { type: "action", id: "game" });
  assert.equal(rough.risk - landing.risk, 5);
  assert.equal(landing.trust - rough.trust, 2);
});

test("an adaptive purification route can reach its distinct ending without being a free win", () => {
  let state = start(17, false, 'fact-check');
  for (let step = 0; step < 100 && state.phase !== 'ended'; step += 1) {
    if (state.phase === 'topic') {
      const candidates = state.topicOptions.map(id => TOPICS.find(topic => topic.id === id));
      candidates.sort((a, b) => a.beats.reduce((sum, beat) => sum + beat.risk, 0) - b.beats.reduce((sum, beat) => sum + beat.risk, 0));
      state = choose(state, candidates[0].id);
    } else if (state.phase === 'continue') state = gameReducer(state, { type: 'continue' });
    else if (state.phase === 'reward') state = gameReducer(state, { type: 'reward', id: state.rewardOptions.includes('soft-landing') ? 'soft-landing' : state.rewardOptions[0] });
    else if (state.phase === 'reply') {
      if (state.risk > 35 && state.actions.moderate && state.moderatedBeat !== `${state.activeTopic}:${state.beat}`) state = gameReducer(state, { type: 'action', id: 'moderate' });
      else if (state.risk > 70 && state.actions.sing) state = gameReducer(state, { type: 'action', id: 'sing' });
      else state = reply(state, 'support', 'agree');
    }
    roundTrip(state);
  }
  assert.equal(state.ending, 'echo-chamber');
  assert.equal(state.completedTopics, 6);
  assert.ok(state.fans.support / getViewers(state) >= 0.6);
  assert.ok(state.control >= 65);
  assert.ok(state.trust < 40);
  assert.ok(state.interruptions > 0);
  assert.ok(state.score < pilot(17, 'explain').score);
});

test("all failure boundaries trigger before a free recovery and support rate remains bounded", () => {
  const state = choose(start());
  const exhausted = reply({ ...state, energy: 1 });
  assert.equal(exhausted.ending, "burnout");
  assert.equal(exhausted.energy, 0);
  const scandal = reply({ ...state, risk: 99 }, "rational", "confront");
  assert.equal(scandal.ending, "collapse");
  assert.equal(scandal.risk, 100);
  const empty = reply({
    ...state,
    fans: { support: 10, rational: 10, chaos: 10, casual: 10 },
  });
  assert.equal(empty.ending, "empty-room");
  assert.equal(
    getSupportRate({
      ...state,
      fans: { support: 0, rational: 0, chaos: 0, casual: 0 },
    }),
    0,
  );
  const supportive = getSupportRate({
    ...state,
    fans: { support: 20, rational: 0, chaos: 0, casual: 0 },
  });
  assert.ok(supportive >= 85 && supportive <= 100);
  assert.ok(getSupportRate({ ...state, trust: 100, risk: 0 }) > getSupportRate({ ...state, trust: 30, risk: 80 }));
});

test("save validator rejects malformed numeric fields, catalog ids, phases, and impossible relationships", () => {
  roundTrip(createInitialState());
  const state = choose(start(42, true));
  roundTrip(state);
  roundTrip(reply(state));
  const mutations = [
    null,
    [],
    {},
    { ...state, version: 2 },
    { ...state, rng: NaN },
    { ...state, seed: Infinity },
    { ...state, fans: { ...state.fans, rational: -1 } },
    { ...state, energy: "90" },
    { ...state, actions: { ...state.actions, sing: 9000 } },
    { ...state, act: 5 },
    { ...state, activeTopic: "missing" },
    { ...state, perks: ["made-up"] },
    { ...state, perks: ["encore", "encore"] },
    { ...state, phase: "continue", beat: 2 },
    { ...state, phase: "topic", topicOptions: [] },
    { ...state, remainingMs: 60001 },
    { ...state, ending: "community" },
    { ...state, phase: 'ended', ending: 'toString', energy: 0 },
    { ...state, moderatedBeat: "laptop:9" },
    { ...state, usedTopics: [] },
    { ...state, rewardOptions: ["encore"] },
    { ...state, score: 5 },
    { ...state, log: [null] },
    { ...state, extra: "field" },
    { ...state, phase: "ended", ending: "community" },
    { ...state, resolvedBeats: 0, confrontations: 1 },
  ];
  for (const mutation of mutations)
    assert.equal(validateSave(mutation), null, JSON.stringify(mutation));
  const restored = validateSave(state);
  assert.notEqual(restored, state);
  assert.notEqual(restored.fans, state.fans);
  assert.notEqual(restored.log, state.log);
});
