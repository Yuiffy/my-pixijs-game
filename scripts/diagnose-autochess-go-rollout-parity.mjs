import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { AutoChessEngine } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameEngine.ts",
);
const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const {
  goCombatScenarioSeed,
  goCombatScenarioSignature,
} = await loadTypescriptModule(
  "src/components/autoChessGame/ai/goCombatScenario.ts",
);
const { scorePreparedAutoChessCombat } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/rolloutCombat.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const snapshotPath = path.resolve(option(
  "--snapshot",
  ".tmp/autochess-go-v3-before-round46.resume.json",
));
const outputPath = path.resolve(option(
  "--output",
  "artifacts/autochess-go-rollout-parity.json",
));
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const sourceState = structuredClone(snapshot.engine.state);
const placements = sourceState.board.flatMap((unit, slot) => (unit ? [{
  slot,
  id: unit.id,
  star: unit.star,
}] : []));
const signature = goCombatScenarioSignature({
  enemySeed: sourceState.enemySeed,
  round: sourceState.round,
  starter: sourceState.starter,
  augments: sourceState.augments,
  wave: (() => {
    const engine = new AutoChessEngine(sourceState.seed);
    engine.state = structuredClone(sourceState);
    return engine.currentWave;
  })(),
  placements,
});
const combatSeed = goCombatScenarioSeed(signature, 0);

const fighterSnapshot = (engine) => {
  const battle = engine.state.battle;
  if (!battle) return null;
  return [...battle.player, ...battle.enemy].map((fighter) => ({
    fid: fighter.fid,
    unitId: fighter.unitId,
    star: fighter.star,
    x: fighter.x,
    y: fighter.y,
    hp: fighter.hp,
    maxHp: fighter.maxHp,
    attack: fighter.attack,
    armor: fighter.armor,
    range: fighter.range,
    attackInterval: fighter.attackInterval,
    moveSpeed: fighter.moveSpeed,
    cooldown: fighter.cooldown,
    energy: fighter.energy,
  }));
};

const combatSummary = (engine, score) => {
  const battle = engine.state.battle;
  const health = (fighters) => fighters.reduce(
    (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
    0,
  );
  return {
    score,
    won: engine.state.result?.won === true,
    elapsed: battle?.elapsed || 0,
    healthMargin: battle ? health(battle.player) - health(battle.enemy) : null,
    playerSurvivors: battle?.player.filter(({ alive }) => alive).length || 0,
    enemySurvivors: battle?.enemy.filter(({ alive }) => alive).length || 0,
    randomState: engine.getRandomState(),
  };
};

const createFreshEngine = ({ normalizeUids, fullRuntime }) => {
  const engine = new AutoChessEngine(
    combatSeed,
    fullRuntime ? undefined : { telemetry: false, visualEffects: false },
  );
  engine.state = structuredClone(sourceState);
  engine.restoreRandomState(combatSeed);
  engine.state.phase = "preparation";
  engine.state.selected = null;
  engine.state.battle = null;
  engine.state.result = null;
  if (normalizeUids) {
    engine.state.board = engine.state.board.map((unit, slot) => (
      unit ? { ...unit, uid: 1000 + slot } : null
    ));
  }
  engine.startBattle();
  const initial = fighterSnapshot(engine);
  const initialRandomState = engine.getRandomState();
  const score = scorePreparedAutoChessCombat(engine, 60);
  return {
    initial,
    initialRandomState,
    result: combatSummary(engine, score),
  };
};

const actualBridge = new EngineBridge(snapshot.seed, 1, { battleStepHz: 60 });
actualBridge.setConsoleLogging(false);
actualBridge.engine.restoreSimulationSnapshot(snapshot.engine);
actualBridge.setAutopilotStrategy("go", "oracle");
const actualSignature = goCombatScenarioSignature({
  enemySeed: actualBridge.engine.state.enemySeed,
  round: actualBridge.engine.state.round,
  starter: actualBridge.engine.state.starter,
  augments: actualBridge.engine.state.augments,
  wave: actualBridge.engine.currentWave,
  placements: actualBridge.engine.state.board.flatMap((unit, slot) => (unit ? [{
    slot,
    id: unit.id,
    star: unit.star,
  }] : [])),
});
let actualRestoredRandomState = null;
const restoreActualRandomState = actualBridge.engine.restoreRandomState.bind(actualBridge.engine);
actualBridge.engine.restoreRandomState = (randomState) => {
  actualRestoredRandomState = randomState;
  restoreActualRandomState(randomState);
};
actualBridge.dispatch({ type: "battle" });
const actualInitial = fighterSnapshot(actualBridge.engine);
const actualInitialRandomState = actualBridge.engine.getRandomState();
actualBridge.skipBattle();
const actualBattle = actualBridge.engine.state.battle;
const actualHealth = (fighters) => fighters.reduce(
  (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
  0,
);
const actualHealthMargin = actualBattle
  ? actualHealth(actualBattle.player) - actualHealth(actualBattle.enemy)
  : 0;
const actualScore = (actualBridge.engine.state.result?.won ? 10000 : 0)
  + actualHealthMargin * 100
  - (actualBridge.engine.state.result?.won ? actualBattle?.elapsed || 0 : 0);

const report = {
  generatedAt: new Date().toISOString(),
  snapshotPath,
  signature,
  combatSeed,
  placements,
  actualBridge: {
    signature: actualSignature,
    restoredRandomState: actualRestoredRandomState,
    initial: actualInitial,
    initialRandomState: actualInitialRandomState,
    result: combatSummary(actualBridge.engine, actualScore),
  },
  freshFullRuntimeOriginalUids: createFreshEngine({
    normalizeUids: false,
    fullRuntime: true,
  }),
  freshFullRuntimeNormalizedUids: createFreshEngine({
    normalizeUids: true,
    fullRuntime: true,
  }),
  freshLeanRuntimeOriginalUids: createFreshEngine({
    normalizeUids: false,
    fullRuntime: false,
  }),
  freshLeanRuntimeNormalizedUids: createFreshEngine({
    normalizeUids: true,
    fullRuntime: false,
  }),
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  combatSeed,
  actual: report.actualBridge.result,
  fullOriginal: report.freshFullRuntimeOriginalUids.result,
  fullNormalized: report.freshFullRuntimeNormalizedUids.result,
  leanOriginal: report.freshLeanRuntimeOriginalUids.result,
  leanNormalized: report.freshLeanRuntimeNormalizedUids.result,
}, null, 2));
