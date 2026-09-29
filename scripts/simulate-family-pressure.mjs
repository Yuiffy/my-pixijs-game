import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const e = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
const { CANDIDATES } = await loadTypescriptModule("src/components/marriagePressureGame/content.ts");
const inbox = await loadTypescriptModule("src/components/marriagePressureGame/inbox.ts");
const activities = await loadTypescriptModule("src/components/marriagePressureGame/activities.ts");

export function chooseAction(s) {
  const ids = e.getAvailableChildActions(s);
  const can = id => ids.includes(id);
  if (s.matchClosed) return "next";
  if (s.stress >= 75 && can("rest")) return "rest";
  if (s.savings < 24 && can("budget")) return "budget";
  if (s.savings < 16 && can("ask-help")) return "ask-help";
  if (s.savings < 25) return "work";
  if (s.stage === "married" || s.stage === "parenthood") {
    if (s.nextGenStress >= 50) return "protect-child";
    if (s.pressure > 65) return "boundary";
    if (can("childfree") && s.relation >= 75) return "childfree";
    return "build-home";
  }
  if (can("simple-wedding") && s.relation >= 65 && s.mutualIntent >= 60 && s.stress < 65) return "simple-wedding";
  if (s.understanding < 18) return "chat-listen";
  if (can("meet-aa")) return "meet-aa";
  return ids[0];
}

// 小回应策略：none 从不回；first 选温和的第一项；greedy 专挑能涨亲情/感情的回复
function chooseReply(kind, policy) {
  const replies = inbox.MESSAGE_KINDS[kind]?.replies ?? [];
  if (policy === "greedy") {
    const score = reply => (reply.effects.familyBond ?? 0) + (reply.effects.relation ?? 0) * 2 + (reply.effects.understanding ?? 0) - (reply.effects.stress ?? 0) - (reply.effects.pressure ?? 0);
    return [...replies].sort((a, b) => score(b) - score(a))[0];
  }
  return replies[0];
}

function chooseActivity(s, policy) {
  if (policy === "meal") return undefined;
  const liked = s.knownInterests.find(id => activities.isActivityUnlocked(s, id) && !activities.isEarlyForActivity(s, id));
  if (liked) return liked;
  return policy === "liked" ? undefined : "cafe";
}

export function runCampaign(seed, difficulty = "realistic", mode = "child", policy = {}) {
  const replies = policy.replies ?? "first";
  const activity = policy.activity ?? "liked";
  let s = e.gameReducer(e.createInitialState(), { type: "start", seed, difficulty, mode });
  const history = [];
  for (let i = 0; i < 400 && s.phase !== "ended"; i++) {
    let action;
    const pending = s.phase === "turn" && s.week.actor === s.activeActor && replies !== "none"
      ? s.week.inbox.find(item => !s.week.handled[item.id])
      : null;
    if (pending) {
      action = { type: "reply", messageId: pending.id, choice: chooseReply(pending.kind, replies).id };
    } else if (s.phase === "candidate") {
      const best = s.candidateOptions.map(id => CANDIDATES.find(c => c.id === id)).sort((a, b) => b.initialIntent - a.initialIntent)[0];
      action = { type: "candidate", id: best.id };
    } else if (s.activeActor === "parent") {
      const ids = e.getAvailableParentActions(s);
      action = { type: "parent-action", id: s.savings < 25 && ids.includes("support") ? "support" : "listen" };
    } else {
      const id = chooseAction(s);
      const picked = id === "meet-aa" || id === "meet" ? chooseActivity(s, activity) : undefined;
      action = { type: "child-action", id, ...(picked ? { activity: picked } : {}) };
    }
    const next = e.gameReducer(s, action);
    assert.notEqual(next, s, `Stall at seed ${seed}, ${mode}: ${JSON.stringify(action)}`);
    assert.ok(e.validateSave(next), `Invalid save at seed ${seed}`);
    if (action.type !== "reply") history.push({ turn: s.turn, ...action, candidate: s.candidateId, stage: next.stage });
    s = next;
  }
  assert.equal(s.phase, "ended", `Never ended: ${seed}/${mode}/${difficulty}`);
  return { state: s, history };
}

function simulate(policy) {
  const results = {};
  const witnesses = {};
  const totals = {};
  let total = 0;
  let savings = 0;
  for (const mode of ["child", "parent", "duel"]) for (const difficulty of ["gentle", "realistic", "holiday"]) {
    const tally = {};
    for (let seed = 1; seed <= 100; seed++) {
      const run = runCampaign(seed, difficulty, mode, policy);
      tally[run.state.ending] = (tally[run.state.ending] || 0) + 1;
      totals[run.state.ending] = (totals[run.state.ending] || 0) + 1;
      savings += run.state.savings;
      if (!witnesses[run.state.ending]) witnesses[run.state.ending] = { seed, difficulty, mode, ...run };
      total++;
    }
    results[`${mode}/${difficulty}`] = tally;
  }
  return { total, totals, averageSavings: Math.round(savings / total), results, witnesses };
}

if (process.argv[1]?.endsWith("simulate-family-pressure.mjs")) {
  const policies = {
    default: { replies: "first", activity: "liked" },
    silent: { replies: "none", activity: "meal" },
    greedy: { replies: "greedy", activity: "liked" },
    cafe: { replies: "first", activity: "cafe" },
  };
  const report = {};
  for (const [name, policy] of Object.entries(policies)) {
    const run = simulate(policy);
    report[name] = { totals: run.totals, averageSavings: run.averageSavings };
    if (name === "default") {
      mkdirSync("tmp/family-v6", { recursive: true });
      writeFileSync("tmp/family-v6/simulation.json", JSON.stringify(run, null, 2));
    }
  }
  const baselineFile = "tmp/family-v6/v5-baseline.json";
  if (existsSync(baselineFile)) {
    const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
    const totals = {};
    for (const tally of Object.values(baseline.results)) for (const [ending, count] of Object.entries(tally)) totals[ending] = (totals[ending] || 0) + count;
    report.v5Baseline = { totals };
  }
  console.log(JSON.stringify(report, null, 2));
}
