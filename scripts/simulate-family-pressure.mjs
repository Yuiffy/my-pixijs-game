import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const e = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
const { CANDIDATES } = await loadTypescriptModule("src/components/marriagePressureGame/content.ts");

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

export function runCampaign(seed, difficulty = "realistic", mode = "child") {
  let s = e.gameReducer(e.createInitialState(), { type: "start", seed, difficulty, mode });
  const history = [];
  for (let i = 0; i < 160 && s.phase !== "ended"; i++) {
    let action;
    if (s.phase === "candidate") {
      const best = s.candidateOptions.map(id => CANDIDATES.find(c => c.id === id)).sort((a, b) => b.initialIntent - a.initialIntent)[0];
      action = { type: "candidate", id: best.id };
    } else if (s.activeActor === "parent") {
      const ids = e.getAvailableParentActions(s);
      action = { type: "parent-action", id: s.savings < 25 && ids.includes("support") ? "support" : "listen" };
    } else action = { type: "child-action", id: chooseAction(s) };
    const next = e.gameReducer(s, action);
    assert.notEqual(next, s, `Stall at seed ${seed}, ${mode}: ${JSON.stringify(action)}`);
    assert.ok(e.validateSave(next), `Invalid save at seed ${seed}`);
    history.push({ turn: s.turn, ...action, candidate: s.candidateId, stage: next.stage });
    s = next;
  }
  assert.equal(s.phase, "ended", `Never ended: ${seed}/${mode}/${difficulty}`);
  return { state: s, history };
}

if (process.argv[1]?.endsWith("simulate-family-pressure.mjs")) {
  const results = {};
  const witnesses = {};
  let total = 0;
  for (const mode of ["child", "parent", "duel"]) for (const difficulty of ["gentle", "realistic", "holiday"]) {
    const tally = {};
    for (let seed = 1; seed <= 100; seed++) {
      const run = runCampaign(seed, difficulty, mode);
      tally[run.state.ending] = (tally[run.state.ending] || 0) + 1;
      if (!witnesses[run.state.ending]) witnesses[run.state.ending] = { seed, difficulty, mode, ...run };
      total++;
    }
    results[`${mode}/${difficulty}`] = tally;
  }
  mkdirSync("tmp/family-v4", { recursive: true });
  writeFileSync("tmp/family-v4/simulation.json", JSON.stringify({ total, results, witnesses }, null, 2));
  console.log(JSON.stringify({ total, results }, null, 2));
}
