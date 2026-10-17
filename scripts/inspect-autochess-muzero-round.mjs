// Capture decisions at a failed round; diagnostics run after the real result.
import { writeFile } from "node:fs/promises";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";
const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { AutoChessAutopilot } = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");
const option = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const seed = Number(option("--seed", "86125"));
const level = option("--level", "novice");
const round = Number(option("--round", "16"));
const output = option("--output", "tmp/muzero/round-inspection.json");
const bridge = new EngineBridge(seed, 1, { simulation: true, battleStepHz: 60 });
bridge.setConsoleLogging(false);
const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal", 20,
  undefined, true, level, true);
const actions = [];
const audits = [];
const audit = pilot.exactBattleAudit.bind(pilot);
pilot.exactBattleAudit = (roster) => {
  const result = audit(roster);
  if (bridge.engine.state.round === round) audits.push({ ...result,
    finalizing: pilot.finalizingEconomy, gold: bridge.engine.state.gold,
    actions: pilot.preparationActions });
  return result;
};
let snapshot, counters, result;
const dispatch = bridge.dispatch.bind(bridge);
bridge.dispatch = (action) => {
  const s = bridge.engine.state;
  const gold = s.gold;
  if (s.round === round && action.type === "battle") {
    snapshot = bridge.engine.getSimulationSnapshot();
    counters = { preparationActions: pilot.preparationActions, paidRerolls: pilot.paidRerolls,
      dryPaidRerolls: pilot.dryPaidRerolls, finalizingEconomy: pilot.finalizingEconomy,
      finalReinvestments: pilot.finalReinvestments, prediction: pilot.lastBattlePredictionScore,
      policy: pilot.policy, preparationStartGold: pilot.preparationStartGold };
  }
  const response = dispatch(action);
  if (s.round === round) actions.push({ action, goldBefore: gold, goldAfter: s.gold,
    dry: pilot.dryPaidRerolls, paid: pilot.paidRerolls });
  return response;
};
pilot.startFromTitle();
let now = 1000;
for (let tick = 0; tick < 10000; tick += 1) {
  const s = bridge.engine.state;
  if (s.phase === "gameover" || s.round > round) break;
  if (s.phase === "battle") {
    bridge.skipBattle();
    if (s.round === round) { result = structuredClone(s.result); break; }
  } else { now += 2400; pilot.tick(now); }
}
let diagnostics = null;
if (snapshot) {
  const replay = new EngineBridge(seed, 1, { simulation: true, battleStepHz: 60 });
  replay.setConsoleLogging(false);
  replay.engine.restoreSimulationSnapshot(snapshot);
  const inspector = new AutoChessAutopilot(replay, "evolution", {}, "balanced", "normal", 20,
    undefined, true, level, true);
  const roster = inspector.ownedEntries();
  diagnostics = { roster, shop: replay.engine.state.shop,
    confidence: inspector.rolloutConfidence(roster),
    candidates: inspector.shopCandidates(roster, false),
    longTermSearch: inspector.shouldSearchLongTermDevelopment(roster),
    projects: [...inspector.upgradeProjectIds(roster)],
    reserve: inspector.goldReserve(false, 0), upgradeCost: replay.engine.upgradeCost };
}
const report = { seed, level, round, snapshot, counters, actions, audits, result, diagnostics };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ seed, level, round, counters, result, diagnostics, actions: actions.slice(-20) }));
