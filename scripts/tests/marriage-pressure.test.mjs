import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const engine = await loadTypescriptModule(
  "src/components/marriagePressureGame/engine.ts",
);
const content = await loadTypescriptModule(
  "src/components/marriagePressureGame/content.ts",
);

const {
  createInitialState,
  gameReducer,
  getAvailableChildActions,
  getAvailableParentActions,
  getAgeAtTurn,
  getEnding,
  getScores,
  resolveGameAction,
  validateSave,
} = engine;
const { CANDIDATES, ECONOMY_EVENTS } = content;

function start(mode = "child", difficulty = "realistic", seed = 20260920) {
  return gameReducer(createInitialState(), {
    type: "start",
    mode,
    difficulty,
    seed,
  });
}

function chooseBestCandidate(state) {
  const candidates = state.candidateOptions
    .map(id => CANDIDATES.find(candidate => candidate.id === id))
    .sort((a, b) => b.compatibility + b.initialIntent - (a.compatibility + a.initialIntent));
  return gameReducer(state, { type: "candidate", id: candidates[0].id });
}

function playChild(seed, policy = "balanced") {
  let state = start("child", "realistic", seed);
  for (let step = 0; step < 40 && state.phase !== "ended"; step += 1) {
    assert.equal(state.activeActor, "child");
    const available = getAvailableChildActions(state);
    let id = "boundary";
    if (policy === "work") id = available.includes("work") ? "work" : available[0];
    else if (state.stress > 78) id = available.includes("boundary") ? "boundary" : available[0];
    else if (state.stage === "married") id = state.savings + state.support > 85 ? "baby" : "delay";
    else if (state.stage === "dating" && state.relation >= 62 && state.mutualIntent >= 56 && state.savings + state.support >= 60) id = "marry";
    else if (available.includes("invest") && state.mutualIntent >= 35) id = "invest";
    else if (available.includes("meet")) id = "meet";
    state = gameReducer(state, { type: "child-action", id });
  }
  assert.equal(state.phase, "ended");
  return state;
}

function playParent(seed) {
  let state = chooseBestCandidate(start("parent", "realistic", seed));
  for (let step = 0; step < 50 && state.phase !== "ended"; step += 1) {
    if (state.phase === "candidate") {
      state = chooseBestCandidate(state);
      continue;
    }
    assert.equal(state.activeActor, "parent");
    const available = getAvailableParentActions(state);
    let id = "listen";
    if (state.support < 34 && available.includes("support")) id = "support";
    else if (state.stress > 65) id = "listen";
    else if (state.stage === "married" && available.includes("push-baby")) id = "push-baby";
    else if (state.stage === "dating" && available.includes("push-marriage")) id = "push-marriage";
    else if (available.includes("encourage")) id = "encourage";
    else id = available[0];
    state = gameReducer(state, { type: "parent-action", id });
  }
  assert.equal(state.phase, "ended");
  return state;
}

test("candidate catalog has varied incentives and fictional boundary text", () => {
  assert.equal(CANDIDATES.length, 9);
  assert.equal(new Set(CANDIDATES.map(candidate => candidate.id)).size, 9);
  assert.ok(CANDIDATES.some(candidate => candidate.id === "nana7mi"));
  assert.ok(CANDIDATES.some(candidate => candidate.id === "azi"));
  assert.ok(!CANDIDATES.some(candidate => candidate.id === "jiajia"));
  assert.ok(CANDIDATES.some(candidate => candidate.resume >= 90));
  assert.ok(CANDIDATES.some(candidate => candidate.compatibility >= 88));
  assert.ok(CANDIDATES.some(candidate => candidate.initialIntent <= 35));
  for (const candidate of CANDIDATES) {
    assert.ok(candidate.image.startsWith("/"));
    assert.ok(candidate.boundary.length >= 15);
    assert.equal(candidate.tags.length, 3);
  }
  assert.equal(ECONOMY_EVENTS.length, 14);
  assert.ok(ECONOMY_EVENTS.filter(event => event.stress <= 0).length >= 6);
});

test("stressful reality events are always followed by a breather", () => {
  let transitions = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    let state = start("child", "realistic", seed);
    let previous = ECONOMY_EVENTS.find(event => event.id === state.currentEventId);
    for (let turn = 0; turn < 8 && state.phase !== "ended"; turn += 1) {
      const available = getAvailableChildActions(state);
      const action = available.includes("boundary") ? "boundary" : available[0];
      state = gameReducer(state, { type: "child-action", id: action });
      if (state.phase === "ended") break;
      const current = ECONOMY_EVENTS.find(event => event.id === state.currentEventId);
      assert.ok(current);
      if (previous?.stress > 0) assert.ok(current.stress <= 0, `${previous.id} was followed by ${current.id}`);
      assert.notEqual(current.id, previous?.id);
      previous = current;
      transitions += 1;
    }
  }
  assert.ok(transitions >= 250);
});

test("high pressure makes the parent AI de-escalate instead of comparing again", () => {
  const base = start("child", "realistic", 33);
  const result = resolveGameAction(
    {
      ...base,
      turn: 4,
      stress: 78,
      pressure: 58,
      familyBond: 70,
      currentEventId: "rent",
      lastParentAction: "compare",
    },
    { type: "child-action", id: "work" },
  );
  const reality = result.steps.find(step => step.kind === "reality");
  const family = result.steps.find(step => step.kind === "family");
  assert.ok(reality);
  assert.ok(family);
  assert.match(family.title, /我先听孩子说|我拿出真金白银/);
  assert.doesNotMatch(family.title, /比较/);
  assert.ok(family.changes.find(change => change.key === "stress")?.delta < 0);
  assert.ok(result.state.stress < 78, JSON.stringify(result.steps));
});

test("all modes start deterministically with a legal actor and candidate draft", () => {
  for (const mode of ["child", "parent", "duel"]) {
    const first = start(mode, "realistic", 88);
    const second = start(mode, "realistic", 88);
    assert.deepEqual(first, second);
    assert.equal(first.turn, 1);
    if (mode === "child") {
      assert.equal(first.phase, "turn");
      assert.equal(first.activeActor, "child");
      assert.ok(first.candidateId);
      assert.ok(getAvailableChildActions(first).includes("meet"));
    } else {
      assert.equal(first.phase, "candidate");
      assert.equal(first.activeActor, "parent");
      assert.equal(first.candidateOptions.length, 3);
    }
  }
});

test("duel alternates parent and child, including a player-selected replacement", () => {
  let state = chooseBestCandidate(start("duel", "gentle", 51));
  assert.equal(state.activeActor, "parent");
  const oldCandidate = state.candidateId;
  state = gameReducer(state, { type: "parent-action", id: "next" });
  assert.equal(state.phase, "candidate");
  assert.ok(!state.candidateOptions.includes(oldCandidate));
  state = chooseBestCandidate(state);
  assert.equal(state.activeActor, "child");
  state = gameReducer(state, { type: "child-action", id: "meet" });
  assert.equal(state.turn, 2);
  assert.equal(state.activeActor, "parent");
});

test("pressure tactics and material support produce meaningfully different households", () => {
  let harsh = chooseBestCandidate(start("duel", "realistic", 97));
  let support = structuredClone(harsh);
  harsh = gameReducer(harsh, { type: "parent-action", id: "compare" });
  support = gameReducer(support, { type: "parent-action", id: "support" });
  assert.ok(harsh.stress > support.stress + 15);
  assert.ok(harsh.familyBond < support.familyBond);
  assert.ok(harsh.parentFace > support.parentFace);
  assert.ok(support.savings > harsh.savings);
  assert.ok(support.support > harsh.support);
});

test("round resolution separates my choice, reality event, and family response", () => {
  let explained = null;
  for (let seed = 1; seed <= 120 && !explained; seed += 1) {
    const before = start("child", "realistic", seed);
    const result = resolveGameAction(before, { type: "child-action", id: "boundary" });
    const choice = result.steps.find(step => step.kind === "choice");
    const laterStress = result.steps
      .filter(step => step.kind !== "choice")
      .flatMap(step => step.changes)
      .filter(change => change.key === "stress")
      .reduce((total, change) => total + change.delta, 0);
    const choiceStress = choice?.changes.find(change => change.key === "stress")?.delta || 0;
    if (choiceStress < 0 && laterStress > 0) explained = { before, result, choiceStress, laterStress };
  }
  assert.ok(explained, "Expected a seed where later events visibly offset a pressure-reducing choice");
  const { before, result, choiceStress, laterStress } = explained;
  assert.deepEqual(result.state, gameReducer(before, { type: "child-action", id: "boundary" }));
  assert.deepEqual(result.steps.map(step => step.kind), ["choice", "reality", "family"]);
  assert.ok(choiceStress < 0);
  assert.ok(laterStress > 0);
  assert.match(result.steps[1].title, /^现实事件：/);
  assert.match(result.steps[2].title, /^家长回应：/);
  for (const step of result.steps) {
    for (const change of step.changes) {
      assert.equal(change.after - change.before, change.delta);
    }
  }
  assert.equal(
    result.state.stress - before.stress,
    result.steps.flatMap(step => step.changes)
      .filter(change => change.key === "stress")
      .reduce((total, change) => total + change.delta, 0),
  );
});

test("low intent punishes forced initiative while compatible mutual interest can grow", () => {
  let low = {
    ...chooseBestCandidate(start("duel", "realistic", 12)),
    stage: "chatting",
    mutualIntent: 18,
    relation: 24,
  };
  const before = structuredClone(low);
  low = gameReducer(low, { type: "parent-action", id: "encourage" });
  assert.ok(low.stress >= before.stress + 15);
  assert.ok(low.relation < before.relation);
  let mutual = { ...before, mutualIntent: 62, relation: 40 };
  mutual = gameReducer(mutual, { type: "parent-action", id: "encourage" });
  assert.ok(mutual.relation > before.relation);
  assert.ok(mutual.stress < low.stress);
});

test("normal policies finish fourteen rounds in both solo roles", () => {
  for (const seed of [7, 31, 88, 2026]) {
    const child = playChild(seed);
    const parent = playParent(seed);
    assert.ok(child.ending);
    assert.ok(parent.ending);
    assert.ok(child.turn <= child.maxTurns);
    assert.ok(parent.turn <= parent.maxTurns);
    assert.deepEqual(child.scores, getScores(child));
    assert.deepEqual(parent.scores, getScores(parent));
  }
});

test("marriage continues into a later-life phase instead of reopening matchmaking", () => {
  const selected = chooseBestCandidate(start("duel", "realistic", 71));
  let state = {
    ...selected,
    stage: "married",
    activeActor: "child",
    relation: 48,
    mutualIntent: 46,
    weddingDebt: 35,
    savings: 54,
    stress: 58,
  };
  assert.equal(state.maxTurns, 14);
  const actions = getAvailableChildActions(state);
  assert.ok(actions.includes("build-home"));
  assert.ok(actions.includes("baby"));
  assert.ok(actions.includes("childfree"));
  assert.ok(!actions.includes("meet"));
  assert.ok(!actions.includes("next"));
  const before = structuredClone(state);
  state = gameReducer(state, { type: "child-action", id: "build-home" });
  assert.ok(state.relation > before.relation);
  assert.ok(state.mutualIntent > before.mutualIntent);
  assert.ok(state.weddingDebt < before.weddingDebt);

  const parentTurn = { ...before, activeActor: "parent" };
  const parentActions = getAvailableParentActions(parentTurn);
  assert.ok(parentActions.includes("push-baby"));
  assert.ok(!parentActions.includes("push-meet"));
  assert.ok(!parentActions.includes("next"));

  let lateMarriage = {
    ...selected,
    stage: "dating",
    activeActor: "child",
    turn: 14,
    maxTurns: 14,
    relation: 74,
    mutualIntent: 70,
    savings: 76,
    support: 24,
    stress: 36,
  };
  lateMarriage = gameReducer(lateMarriage, { type: "child-action", id: "marry" });
  assert.equal(lateMarriage.stage, "married");
  assert.equal(lateMarriage.marriedAtTurn, 14);
  assert.equal(getAgeAtTurn(lateMarriage, lateMarriage.marriedAtTurn), lateMarriage.startAge + 13);
  assert.equal(lateMarriage.phase, "turn");
  assert.equal(lateMarriage.turn, 15);
  assert.equal(lateMarriage.maxTurns, 18);

  let childfree = {
    ...lateMarriage,
    activeActor: "child",
    turn: 18,
    maxTurns: 18,
    childPlan: "delay",
  };
  childfree = gameReducer(childfree, { type: "child-action", id: "childfree" });
  assert.equal(childfree.childPlan, "childfree");
  assert.equal(childfree.turn, 19);
  assert.equal(childfree.maxTurns, 20);
});

test("the four requested endings and healthier alternatives are reachable", () => {
  const base = createInitialState();
  assert.equal(getEnding({ ...base, stage: "parenthood", relation: 80, mutualIntent: 75, stress: 30, savings: 55, familyBond: 70 }).id, "happy");
  assert.equal(getEnding({ ...base, stage: "parenthood", nextGenStress: 100 }).id, "depressed");
  assert.equal(getEnding({ ...base, stress: 100, familyBond: 50 }).id, "burnout");
  assert.equal(getEnding({ ...base, stage: "married", savings: -2, weddingDebt: 60 }).id, "exploited");
  assert.equal(getEnding({ ...base, stress: 100, familyBond: 12 }).id, "ruin");
  assert.equal(getEnding({ ...base, stage: "dating", relation: 72, mutualIntent: 65 }).id, "love");
  assert.equal(getEnding({ ...base, autonomy: 86, stress: 30 }).id, "independent");
  assert.equal(getEnding({ ...base, familyBond: 82, pressure: 18, autonomy: 50 }).id, "ceasefire");
  assert.equal(getEnding({
    ...base,
    stage: "married",
    childPlan: "childfree",
    relation: 82,
    mutualIntent: 76,
    stress: 63,
    savings: 64,
    familyBond: 68,
    weddingDebt: 8,
  }).id, "happy");
  assert.equal(getEnding({
    ...base,
    stage: "married",
    childPlan: "childfree",
    relation: 34,
    mutualIntent: 30,
    weddingDebt: 48,
    coerciveMoves: 5,
  }).id, "runaway");
});

test("invalid actions are inert and saves round-trip without shared arrays", () => {
  const draft = start("parent", "realistic", 4);
  assert.equal(gameReducer(draft, { type: "parent-action", id: "compare" }), draft);
  const selected = chooseBestCandidate(draft);
  assert.equal(gameReducer(selected, { type: "child-action", id: "meet" }), selected);
  const restored = validateSave(JSON.parse(JSON.stringify(selected)));
  assert.deepEqual(restored, selected);
  assert.notEqual(restored, selected);
  assert.notEqual(restored.log, selected.log);
  assert.equal(validateSave({ ...selected, version: 4 }), null);
  assert.equal(validateSave({ ...selected, candidateId: "missing" }), null);
  assert.equal(validateSave({ ...selected, stress: Number.NaN }), null);
  assert.equal(validateSave({ ...selected, extra: true }), null);
});

test("repeated coercion can end early instead of being a free winning strategy", () => {
  let state = chooseBestCandidate(start("parent", "holiday", 302));
  for (let step = 0; step < 20 && state.phase !== "ended"; step += 1) {
    if (state.phase === "candidate") state = chooseBestCandidate(state);
    else {
      const available = getAvailableParentActions(state);
      const id = available.includes("compare") ? "compare" : available[0];
      state = gameReducer(state, { type: "parent-action", id });
    }
  }
  assert.equal(state.phase, "ended");
  assert.ok(["burnout", "ruin"].includes(state.ending));
  assert.ok(state.turn < state.maxTurns);
});

test("high-pressure education harms the next generation and can be resisted", () => {
  let state = {
    ...chooseBestCandidate(start("duel", "realistic", 99)),
    stage: "parenthood",
    activeActor: "parent",
    nextGenStress: 45,
    stress: 42,
  };
  state = gameReducer(state, { type: "parent-action", id: "push-education" });
  assert.equal(state.activeActor, "child");
  assert.ok(state.nextGenStress >= 75);
  const pressured = state.nextGenStress;
  state = gameReducer(state, { type: "child-action", id: "protect-child" });
  assert.ok(state.nextGenStress < pressured);
  assert.ok(state.familyBond > 60);
});

test("v1 saves migrate without preserving the old ending meaning", () => {
  const current = chooseBestCandidate(start("parent", "realistic", 15));
  const legacy = { ...current, version: 1 };
  delete legacy.nextGenStress;
  delete legacy.startAge;
  delete legacy.marriedAtTurn;
  delete legacy.parenthoodAtTurn;
  legacy.phase = "ended";
  legacy.ending = "depressed";
  const restored = validateSave(legacy);
  assert.equal(restored.version, 3);
  assert.equal(restored.nextGenStress, 0);
  assert.equal(restored.ending, "burnout");
  assert.equal(restored.startAge, 26);
  assert.equal(restored.marriedAtTurn, null);
});

test("v2 saves replace the cat candidate and gain age fields", () => {
  const current = chooseBestCandidate(start("parent", "realistic", 21));
  const legacy = { ...current, version: 2, candidateId: "jiajia" };
  delete legacy.startAge;
  delete legacy.marriedAtTurn;
  delete legacy.parenthoodAtTurn;
  const restored = validateSave(legacy);
  assert.equal(restored.version, 3);
  assert.equal(restored.candidateId, "nana7mi");
  assert.equal(restored.startAge, 26);
});

test("in-progress ten-round saves extend to the later-life rules", () => {
  const oldSave = chooseBestCandidate(start("parent", "realistic", 19));
  oldSave.maxTurns = 10;
  const restored = validateSave(JSON.parse(JSON.stringify(oldSave)));
  assert.equal(restored.maxTurns, 14);
});
