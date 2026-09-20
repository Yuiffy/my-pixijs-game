import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
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
const household = await loadTypescriptModule("src/components/marriagePressureGame/household.ts");
const roster = await loadTypescriptModule("src/components/marriagePressureGame/roster.ts");
const progression = await loadTypescriptModule("src/components/marriagePressureGame/progression.ts");

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
    if (state.matchClosed) id = "next";
    else if (policy === "work") id = available.includes("work") ? "work" : available[0];
    else if (state.stress > 78) id = available.includes("boundary") ? "boundary" : available[0];
    else if (state.stage === "married") id = available.includes("baby") && state.savings > 85 ? "baby" : "build-home";
    else if (available.includes("marry") && state.stage === "dating" && state.relation >= 62 && state.mutualIntent >= 56 && state.savings + state.support >= 60) id = "marry";
    else if (available.includes("invest") && state.mutualIntent >= 35) id = "invest";
    else if (available.includes("meet")) id = "meet";
    if (!available.includes(id)) id = available[0];
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
  assert.equal(CANDIDATES.length, 40);
  assert.equal(new Set(CANDIDATES.map(candidate => candidate.id)).size, 40);
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
  assert.deepEqual(result.steps.map(step => step.kind), ["choice", "household", "reality", "family"]);
  assert.ok(choiceStress < 0);
  assert.ok(laterStress > 0);
  assert.match(result.steps[2].title, /^现实事件：/);
  assert.match(result.steps[3].title, /^家长回应：/);
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

test("normal policies finish a complete campaign in both solo roles", () => {
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
  assert.equal(state.maxTurns, 24);
  const actions = getAvailableChildActions(state);
  assert.ok(actions.includes("build-home"));
  assert.ok(!actions.includes("baby"), "low mutual intent must not offer parenthood");
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
  assert.equal(getAgeAtTurn(lateMarriage, lateMarriage.marriedAtTurn), lateMarriage.startAge + 3);
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
  const base = { ...createInitialState(), candidateId: "sui", seed: 3, career: 100 };
  assert.equal(getEnding({ ...base, stage: "parenthood", relation: 80, mutualIntent: 75, stress: 30, savings: 55, familyBond: 70 }).id, "happy");
  assert.equal(getEnding({ ...base, stage: "parenthood", nextGenStress: 100 }).id, "depressed");
  assert.equal(getEnding({ ...base, stress: 100, burnoutTurns: 2, familyBond: 50 }).id, "burnout");
  assert.equal(getEnding({ ...base, stage: "married", savings: -2, weddingDebt: 60, moneyStrainTurns: 3 }).id, "exploited");
  assert.equal(getEnding({ ...base, stress: 100, familyBond: 4 }).id, "ruin");
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
    conflictTurns: 3,
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
  assert.equal(validateSave({ ...selected, version: 99 }), null);
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
  assert.equal(restored.version, 4);
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
  assert.equal(restored.version, 4);
  assert.equal(restored.candidateId, "nana7mi");
  assert.equal(restored.startAge, 26);
});

test("in-progress ten-round saves extend to the later-life rules", () => {
  const oldSave = chooseBestCandidate(start("parent", "realistic", 19));
  oldSave.maxTurns = 10;
  const restored = validateSave(JSON.parse(JSON.stringify(oldSave)));
  assert.equal(restored.maxTurns, 14);
});

test("autochess named cast including guests is complete and assets exist", async () => {
  const { UNIT_DEFS } = await loadTypescriptModule("src/components/autoChessGame/core/data/units.ts");
  const expected = Object.keys(UNIT_DEFS).filter(id => id !== "rift_tyrant");
  assert.deepEqual(Object.keys(roster.AUTOCHESS_CANDIDATE_MAP).sort(), expected.sort());
  for (const id of Object.values(roster.AUTOCHESS_CANDIDATE_MAP)) assert.ok(CANDIDATES.some(c => c.id === id), id);
  for (const candidate of CANDIDATES) assert.ok(existsSync(`public${candidate.image}`), candidate.image);
});

function situation(overrides = {}) {
  return { ...start("duel", "gentle", 3), phase: "turn", candidateOptions: [], candidateId: "sui", activeActor: "child", stage: "dating", relation: 77, mutualIntent: 76, chemistry: 80, savings: 40, stress: 35, ...overrides };
}

function childYear(state, id) {
  return gameReducer({ ...state, activeActor: "child" }, { type: "child-action", id });
}

test("the screenshot marriage creates a recoverable crisis, not an immediate ending", () => {
  const before = situation({ stress: 82, savings: 32, relation: 77, mutualIntent: 76, familyBond: 97, support: 36 });
  const result = resolveGameAction(before, { type: "child-action", id: "marry" });
  assert.equal(result.state.stage, "married");
  assert.equal(result.state.phase, "turn");
  assert.equal(result.state.ending, null);
  assert.equal(result.state.burnoutTurns, 1);
  assert.ok(getAvailableChildActions(result.state).includes("rest"));
  const recovered = childYear(result.state, "rest");
  assert.equal(recovered.phase, "turn");
  assert.equal(recovered.burnoutTurns, 0);
});

test("household income and repayments reconcile without printing money", () => {
  const before = situation({ stage: "married", weddingDebt: 20, savings: 50 });
  const result = resolveGameAction(before, { type: "child-action", id: "build-home" });
  const action = result.steps[0];
  assert.equal(action.changes.find(c => c.key === "savings").delta, -11);
  assert.equal(action.changes.find(c => c.key === "weddingDebt").delta, -5);
  for (const key of ["savings", "weddingDebt", "stress", "relation", "familyReserve"]) {
    assert.equal(result.state[key] - before[key], result.steps.flatMap(s => s.changes).filter(c => c.key === key).reduce((sum, c) => sum + c.delta, 0));
  }
});

test("family aid has a finite transferable reserve for both actors", () => {
  let state = situation({ familyReserve: 18, savings: 0, familyBond: 80 });
  state = childYear(state, "ask-help");
  assert.equal(state.familyReserve, 4);
  const result = resolveGameAction({ ...state, savings: 0, activeActor: "parent" }, { type: "parent-action", id: "support" });
  assert.equal(result.state.familyReserve, 0);
  assert.equal(result.steps[0].changes.find(c => c.key === "savings").delta, 4);
  assert.ok(!getAvailableChildActions(result.state).includes("ask-help"));
  assert.ok(!getAvailableParentActions(result.state).includes("support"));
});

test("AA and treating have identical relationship outcomes and different costs", () => {
  const state = situation({ stage: "chatting", meetings: 0, relation: 20 });
  const aa = resolveGameAction(state, { type: "child-action", id: "meet-aa" });
  const treat = resolveGameAction(state, { type: "child-action", id: "meet" });
  assert.equal(aa.state.relation, treat.state.relation);
  assert.equal(aa.state.mutualIntent, treat.state.mutualIntent);
  assert.equal(aa.state.rng, treat.state.rng);
  assert.ok(aa.state.savings > treat.state.savings);
});

test("polite chatting cannot buy chemistry and repeated meetings can end a match", () => {
  let state = situation({ stage: "single", chemistry: 20, relation: 4, mutualIntent: 26, meetings: 0 });
  state = childYear(state, "chat-listen");
  state = childYear(state, "chat-share");
  assert.equal(state.stage, "chatting");
  state = childYear(state, "meet-aa");
  assert.equal(state.matchClosed, false);
  state = childYear(state, "meet-aa");
  assert.equal(state.matchClosed, true);
  assert.match(state.datingFeedback, /不太有恋爱/);
  assert.ok(!getAvailableChildActions(state).includes("invest"));
  const next = childYear(state, "next");
  assert.equal(next.phase, "candidate");
  assert.ok(!next.candidateOptions.includes("sui"));
  const selected = chooseBestCandidate(next);
  assert.equal(selected.meetings, 0);
  assert.equal(selected.matchClosed, false);
  assert.equal(selected.understanding, 0);
});

test("chat timing matters and a willing match requires real meetings", () => {
  const before = situation({ stage: "single", relation: 4, meetings: 0 });
  const rushed = childYear(before, "chat-checklist");
  const listened = childYear(before, "chat-listen");
  assert.ok(rushed.understanding > listened.understanding);
  assert.ok(rushed.mutualIntent < listened.mutualIntent);
  let state = listened;
  for (let i = 0; i < 7; i++) state = childYear(state, "chat-share");
  assert.equal(state.stage, "chatting");
  state = childYear(state, "meet-aa");
  state = childYear(state, "meet-aa");
  assert.equal(state.stage, "dating");
});

test("low funds can become a modest shared life rather than divorce", () => {
  let state = situation({ stage: "married", savings: 4, weddingDebt: 28, turn: 20 });
  state = childYear(state, "budget");
  assert.equal(state.budgetAgreed, true);
  assert.ok(household.getHouseholdBudget(state).net >= 0);
  assert.equal(state.phase, "turn");
  while (state.phase !== "ended") state = childYear(state, state.stress >= 70 ? "rest" : state.savings <= 20 ? "work" : "build-home");
  assert.ok(["modest", "happy"].includes(state.ending), state.ending);
});

test("consumption preference alone never means divorce; persistent disconnection does", () => {
  const seed = 3;
  const base = situation({ seed, candidateId: "hazel", stage: "married", savings: 3 });
  const connected = childYear(base, "budget");
  assert.equal(connected.budgetAgreed, true);
  let disconnected = childYear({ ...base, relation: 28, mutualIntent: 26 }, "budget");
  assert.equal(disconnected.budgetAgreed, false);
  assert.equal(disconnected.phase, "turn");
  disconnected = childYear(disconnected, "work");
  assert.equal(disconnected.phase, "turn");
  disconnected = childYear(disconnected, "work");
  assert.equal(disconnected.ending, "runaway");
});

test("financial hardship needs repeated deficits and does not imply relationship breakup", () => {
  let state = situation({ stage: "parenthood", savings: 0, weddingDebt: 65, career: 0, familyReserve: 0, relation: 80, mutualIntent: 80 });
  state = childYear(state, "boundary");
  assert.equal(state.phase, "turn");
  state = childYear(state, "boundary");
  assert.equal(state.phase, "turn");
  state = childYear(state, "boundary");
  assert.equal(state.ending, "exploited");
  assert.ok(state.relation > 65);
});

test("married and parenting households never get a single ending", () => {
  for (const stage of ["married", "parenthood"]) {
    for (const relation of [0, 35, 60, 90]) {
      assert.notEqual(getEnding(situation({ stage, relation, autonomy: 100 })).id, "independent");
    }
  }
});

test("new quarterly age and genuine v3 saves retain separate time scales", () => {
  const state = situation({ turn: 9 });
  assert.equal(getAgeAtTurn(state), state.startAge + 2);
  const old = { ...state, version: 3 };
  for (const key of ["familyReserve", "monthsPerTurn", "understanding", "chemistry", "matchClosed", "datingFeedback", "lifestyle", "budgetAgreed", "moneyStrainTurns", "burnoutTurns", "conflictTurns", "recoveryGranted", "partnerNote"]) delete old[key];
  const migrated = validateSave(old);
  assert.equal(migrated.version, 4);
  assert.equal(getAgeAtTurn(migrated), state.startAge + 8);
  assert.equal(migrated.burnoutTurns, 0);
  assert.deepEqual(validateSave(migrated), migrated);
  for (const broken of [null, { ...state, scores: null }, { ...state, turn: -1 }, { ...state, chemistry: 101 }, { ...state, familyReserve: 99 }]) assert.equal(validateSave(broken), null);
});

test("parents cannot manufacture romantic feelings or force past refusal", () => {
  const before = situation({ activeActor: "parent", stage: "chatting", relation: 20, mutualIntent: 65 });
  const result = gameReducer(before, { type: "parent-action", id: "encourage" });
  assert.equal(result.relation, before.relation);
  assert.equal(result.mutualIntent, before.mutualIntent);
  const noConsent = situation({ mutualIntent: 25 });
  assert.ok(!getAvailableChildActions(noConsent).includes("marry"));
  assert.ok(!getAvailableChildActions(noConsent).includes("simple-wedding"));
  assert.equal(gameReducer(noConsent, { type: "child-action", id: "marry" }), noConsent);
});

test("unseen candidates are not discarded when only two remain", () => {
  const remaining = CANDIDATES.slice(-2).map(c => c.id);
  const current = CANDIDATES[0].id;
  let state = situation({ candidateId: current, rejectedCandidates: CANDIDATES.map(c => c.id).filter(id => id !== current && !remaining.includes(id)) });
  state = childYear(state, "next");
  assert.deepEqual([...state.candidateOptions].sort(), remaining.sort());
  assert.equal(state.rejectedCandidates.length, CANDIDATES.length - 2);
});

test("solo budget decisions are renegotiated when a household forms", () => {
  const seed = 3;
  const state = situation({ seed, candidateId: "hazel", relation: 46, mutualIntent: 53, lifestyle: "lean", budgetAgreed: true });
  const married = childYear(state, "simple-wedding");
  assert.equal(married.budgetAgreed, false);
  assert.equal(married.stage, "married");
});

test("wedding debt reflects the selected plan, not an arbitrary stress multiplier", () => {
  const prepared = resolveGameAction(situation(), { type: "child-action", id: "marry" }).steps[0];
  const stressed = resolveGameAction(situation({ stress: 85 }), { type: "child-action", id: "marry" }).steps[0];
  for (const key of ["savings", "weddingDebt"]) assert.equal(prepared.changes.find(c => c.key === key).delta, stressed.changes.find(c => c.key === key).delta);
  const simple = resolveGameAction(situation(), { type: "child-action", id: "simple-wedding" }).steps[0];
  assert.ok(!simple.changes.some(c => c.key === "weddingDebt"));
});

test("meeting topics trade understanding for closeness and respect timing", () => {
  const before = situation({ stage: "chatting", meetings: 0, understanding: 0, relation: 20 });
  const everyday = gameReducer(before, { type: "child-action", id: "meet-aa", topic: "everyday" });
  const listening = gameReducer(before, { type: "child-action", id: "meet-aa", topic: "listen" });
  const rushed = gameReducer(before, { type: "child-action", id: "meet-aa", topic: "plans" });
  const prepared = gameReducer({ ...before, understanding: 45 }, { type: "child-action", id: "meet-aa", topic: "plans" });
  assert.ok(listening.understanding > everyday.understanding);
  assert.ok(listening.relation < everyday.relation);
  assert.ok(listening.stress < everyday.stress);
  assert.ok(rushed.mutualIntent < everyday.mutualIntent);
  assert.ok(prepared.mutualIntent > everyday.mutualIntent);
  assert.equal(everyday.savings, listening.savings);
  assert.equal(gameReducer(before, { type: "child-action", id: "meet-aa", topic: "invalid" }), before);
});

test("previews do not leak undiscovered attraction or the next candidate", () => {
  const before = situation({ stage: "chatting", relation: 20 });
  assert.equal(engine.getActionPreview({ ...before, chemistry: 15 }, "child", "meet-aa"), engine.getActionPreview({ ...before, chemistry: 85 }, "child", "meet-aa"));
  const next = engine.getActionPreview(before, "child", "next");
  assert.match(next, /再认识下一位/);
  assert.doesNotMatch(next, /对方意愿|伴侣感情/);
});

test("core character preferences are stable and Komichi accepts frugal living", () => {
  for (const candidate of CANDIDATES) {
    const first = household.getPartnerProfile({ seed: 1, candidateId: candidate.id });
    assert.ok(first);
    for (const seed of [2, 3, 4, 728, 20260921]) assert.deepEqual(household.getPartnerProfile({ seed, candidateId: candidate.id }), first);
  }
  const komichi = household.getPartnerProfile({ seed: 4, candidateId: "komichi" });
  assert.ok(komichi.spending <= 5 && komichi.flexibility >= 85);
  const state = childYear(situation({ candidateId: "komichi", stage: "married", savings: 2, relation: 45, mutualIntent: 45 }), "budget");
  assert.equal(state.budgetAgreed, true);
  assert.equal(state.phase, "turn");
});

test("meeting no longer has a duplicate invest action and old action history loads", () => {
  const state = situation({ meetings: 2, lastChildAction: "invest" });
  assert.ok(!getAvailableChildActions(state).includes("invest"));
  assert.ok(getAvailableChildActions(state).includes("meet"));
  assert.deepEqual(validateSave(state), state);
});

test("early guidance explains meetings and visible gaps without revealing chemistry", () => {
  const state = situation({ stage: "chatting", meetings: 1, relation: 30, mutualIntent: 40 });
  const guide = progression.getProgressionGuide(state);
  assert.deepEqual(guide.requirements.map(r => r.remaining), [1, 12, 8]);
  assert.match(guide.explanation, /一次见面结算.*自动确认交往/);
  assert.equal(guide.suggested, "meet");
  assert.deepEqual(progression.getProgressionGuide({ ...state, chemistry: 0 }), progression.getProgressionGuide({ ...state, chemistry: 100 }));
  const visibleReady = progression.getProgressionGuide({ ...state, meetings: 2, relation: 50, mutualIntent: 60 });
  assert.match(visibleReady.advice, /下次见面/);
  assert.equal(visibleReady.unlocked, false);
});

test("marriage guidance and actual unlocks agree at every boundary", () => {
  for (const relation of [44, 45, 57, 58]) for (const mutualIntent of [51, 52, 60]) {
    const state = situation({ relation, mutualIntent, savings: 0, stress: 90 });
    const guide = progression.getProgressionGuide(state);
    assert.equal(guide.unlocked, getAvailableChildActions(state).includes("marry"));
    assert.equal(guide.unlocked, guide.requirements.every(r => r.met));
    assert.equal(guide.suggested, "rest");
    assert.equal(guide.preparation.every(r => r.met), progression.readyForMarriage(state));
  }
  const ready = progression.getProgressionGuide(situation({ relation: 58, mutualIntent: 52, savings: 26, stress: 75 }));
  assert.ok(ready.preparation.every(r => r.met));
  assert.equal(progression.readyForMarriage(situation({ stress: 76 })), false);
});

test("guidance respects refusal and optional parenting rather than endless advancement", () => {
  const rejected = progression.getProgressionGuide(situation({ stage: "chatting", matchClosed: true }));
  assert.equal(rejected.suggested, "next");
  assert.equal(rejected.requirements.length, 0);
  const childfree = progression.getProgressionGuide(situation({ stage: "married", childPlan: "childfree" }));
  assert.equal(childfree.requirements.length, 0);
  assert.equal(childfree.preparation.length, 0);
  assert.equal(childfree.suggested, "build-home");
  const parenting = situation({ stage: "married", childPlan: "delay", relation: 50, mutualIntent: 60 });
  assert.ok(progression.getProgressionGuide(parenting).requirements.every(r => r.met));
  assert.ok(getAvailableChildActions(parenting).includes("baby"));
});

test("removed original candidates migrate without losing an active or completed life", () => {
  const aliases = { lin: "xuehui", qiao: "liko", chen: "shiori", zhou: "nana7mi", xu: "izayoi", tang: "sui" };
  assert.ok(CANDIDATES.every(c => !(c.id in aliases)));
  for (const [oldId, replacement] of Object.entries(aliases)) {
    const before = situation({ candidateId: oldId, turn: 8, relation: 73, mutualIntent: 67, savings: 19, weddingDebt: 12, meetings: 3 });
    const after = validateSave(JSON.parse(JSON.stringify(before)));
    assert.equal(after.candidateId, replacement);
    for (const key of ["turn", "stage", "relation", "mutualIntent", "savings", "weddingDebt", "meetings", "rng"]) assert.equal(after[key], before[key]);
    assert.deepEqual(validateSave(after), after);
    const completed = validateSave({ ...before, stage: "married", phase: "ended", ending: "happy", marriedAtTurn: 4 });
    assert.equal(completed.ending, "happy");
    assert.equal(completed.marriedAtTurn, 4);
  }
});

test("legacy draft aliases deduplicate and narrative names follow the real portraits", () => {
  const save = { ...start("parent"), candidateOptions: ["xu", "izayoi", "lin"], rejectedCandidates: ["qiao", "liko"], lastEvent: "许青愿意见面", datingFeedback: "许青想先了解", log: ["许青来到饭桌", "乔安已经翻篇"] };
  const restored = validateSave(save);
  assert.deepEqual(restored.candidateOptions, ["izayoi", "xuehui"]);
  assert.deepEqual(restored.rejectedCandidates, ["liko"]);
  assert.equal(restored.lastEvent, "十六萤愿意见面");
  assert.equal(restored.datingFeedback, "十六萤想先了解");
  assert.deepEqual(restored.log, ["十六萤来到饭桌", "莉蔻已经翻篇"]);
  assert.equal(gameReducer(restored, { type: "candidate", id: "izayoi" }).candidateId, "izayoi");
  assert.equal(validateSave({ ...restored, candidateOptions: ["izayoi", "izayoi"] }), null);
});
