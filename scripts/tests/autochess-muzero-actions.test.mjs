import assert from "node:assert/strict";
import test from "node:test";
import { applyRoundDecision } from "../lib/autochess-muzero-actions.mjs";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";
const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { AutoChessAutopilot, getAutopilotRolloutCacheStats } = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");
const { AUTOPILOT_THINKING_BUDGETS } = await loadTypescriptModule("src/components/autoChessGame/ai/autopilotPolicy.ts");

test("探索补强动作确实能动用利息存款，恢复正常动作后原留钱线不变", () => {
  const budgets = JSON.stringify(AUTOPILOT_THINKING_BUDGETS);
  for (const level of ["novice", "veteran", "deep", "oracle"]) {
    const bridge = new EngineBridge(84998, 1, { simulation: true });
    bridge.engine.state.starterChoices = ["bastion"];
    bridge.engine.startRun("bastion");
    Object.assign(bridge.engine.state, { round: 8, hp: 12, gold: 40 });
    const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal", 20,
      undefined, false, level);
    const base = { ...pilot.policy };
    const reserve = pilot.goldReserve(false, 0);
    const rollouts = getAutopilotRolloutCacheStats().misses;
    // Reducing the ordinary reserve alone leaves anchored interest untouched.
    pilot.policy = { ...base, reserveCap: 0, reserveFloor: 0, woundedReserve: 0 };
    assert.equal(pilot.goldReserve(false, 0), reserve);
    applyRoundDecision(pilot, base, 4);
    assert.ok(pilot.goldReserve(false, 0) < reserve);
    applyRoundDecision(pilot, base, 2);
    assert.equal(pilot.goldReserve(false, 20), reserve);
    applyRoundDecision(pilot, base, 0);
    assert.equal(pilot.goldReserve(false, 0), reserve);
    assert.deepEqual(pilot.policy, base);
    assert.equal(getAutopilotRolloutCacheStats().misses, rollouts);
  }
  assert.equal(JSON.stringify(AUTOPILOT_THINKING_BUDGETS), budgets);
});
