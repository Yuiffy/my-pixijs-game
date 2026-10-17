import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { AutoChessAutopilot, getAutopilotRolloutCacheStats } = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");

const setup = (level = "deep") => {
  const bridge = new EngineBridge(86200, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion"];
  bridge.engine.startRun("bastion");
  const pilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal", 20,
    undefined, true, level, true);
  pilot.setEnabled(true);
  pilot.tick(1000);
  return { bridge, pilot };
};

test("开战审计拒绝败局后恢复运营，允许剩余预算用于补强", () => {
  for (const level of ["deep", "oracle"]) {
    const { bridge, pilot } = setup(level);
    pilot.finalizingEconomy = true;
    pilot.formationStartedThisPreparation = true;
    pilot.exactLineupSearchRequested = true;
    pilot.battleConfidence = () => 10100;
    pilot.exactBattleAudit = () => ({ key: "losing-board", score: -20 });
    let reopened = false;
    pilot.nextPreparationAction = () => {
      if (!pilot.finalizingEconomy && !pilot.formationStartedThisPreparation) {
        reopened = true;
        return null;
      }
      return { type: "battle" };
    };
    assert.equal(pilot.tick(2000), null);
    assert.equal(bridge.engine.state.phase, "preparation");
    pilot.tick(3000);
    assert.equal(reopened, true);
    assert.equal(bridge.engine.state.phase, "preparation");
  }
});

test("已知败局约束同一实际阵容的信心缓存，不新增预演", () => {
  const { bridge, pilot } = setup();
  const roster = pilot.ownedEntries();
  pilot.plannedLineupUids = roster.map(({ unit }) => unit.uid);
  pilot.plannedBoardSlots = new Map(roster.map(({ unit, location }) => [unit.uid, location.index]));
  pilot.plannedLineupUnits = new Map(roster.map(({ unit }) => [unit.uid, { id: unit.id, star: unit.star }]));
  pilot.plannedLineupScore = 10100;
  pilot.exactBattleAuditKey = pilot.currentBattleAuditKey();
  pilot.exactBattleAuditRejectedKey = pilot.exactBattleAuditKey;
  pilot.exactBattleAuditScore = -20;
  pilot.rolloutTargetLineup = () => roster;
  const misses = getAutopilotRolloutCacheStats().misses;
  assert.equal(pilot.rolloutConfidence(roster), -20);
  assert.equal(pilot.rolloutConfidence(roster), -20);
  assert.equal(getAutopilotRolloutCacheStats().misses, misses);

  const slot = roster[0].location.index;
  bridge.engine.state.board[slot].star = 2;
  assert.equal(pilot.confidenceAfterBattleAudit(pilot.ownedEntries(), 10200), 10200);
  bridge.engine.state.board[slot].star = 1;
  bridge.engine.restoreRandomState(123);
  assert.equal(pilot.confidenceAfterBattleAudit(roster, 10200), 10200);
});

test("已知败局不能误用到尚未部署的换人方案或新回合", () => {
  const { bridge, pilot } = setup();
  const roster = pilot.ownedEntries();
  pilot.exactBattleAuditKey = pilot.currentBattleAuditKey();
  pilot.exactBattleAuditRejectedKey = pilot.exactBattleAuditKey;
  pilot.exactBattleAuditScore = -20;
  pilot.plannedLineupUids = [99999];
  pilot.plannedBoardSlots = new Map([[99999, 0]]);
  assert.equal(pilot.confidenceAfterBattleAudit(roster, 10200), 10200);
  pilot.resetPreparation(bridge.engine.state.round + 1);
  assert.equal(pilot.exactBattleAuditRejectedKey, "");
  assert.equal(pilot.confidenceAfterBattleAudit(roster, 10200), 10200);
});
