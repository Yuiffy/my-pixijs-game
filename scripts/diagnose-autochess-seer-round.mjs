import { readFile, writeFile } from "node:fs/promises";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const { AutoChessAutopilot } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAutopilot.ts",
);
const { UNIT_DEFS } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const seed = Math.max(1, Number(option("--seed", "73020")) || 73020);
const targetRound = Math.max(1, Number(option("--round", "47")) || 47);
const rolloutHz = Math.max(20, Math.min(60, Number(option("--rollout-hz", "60")) || 60));
const battleStepHz = Math.max(20, Math.min(60, Number(option("--battle-hz", "60")) || 60));
const requestedStyle = option("--style", "seer");
const style = requestedStyle === "seer2" ? "seer" : requestedStyle;
const informationMode = option(
  "--information",
  style === "seer" || style === "go" ? "oracle" : "normal",
);
const liveBattleAudit = process.argv.includes("--live-audit");
if (!["survival", "balanced", "highroll", "fair", "seer", "go"].includes(style)) {
  throw new Error(`Unknown autopilot style: ${style}`);
}
const outputPath = option(
  "--output",
  `artifacts/autochess-${style}-round-${seed}-${targetRound}-diagnostic.json`,
);
const snapshotPath = option("--snapshot-output", "");
const snapshotInputPath = option("--snapshot-input", "");
const snapshotOnly = process.argv.includes("--snapshot-only");
const inspectPlan = process.argv.includes("--inspect-plan");
const simulateFormation = process.argv.includes("--simulate-formation");
const includeTwoSwaps = process.argv.includes("--two-swaps");

const describeUnit = (unit) => unit && { uid: unit.uid, id: unit.id, star: unit.star };
const describeEntries = (entries) => entries.flatMap((unit, index) => (
  unit ? [{ index, ...describeUnit(unit) }] : []
));

const FORMATIONS = {
  human_recorded: {
    rei: 23,
    units: {
      yua: [4],
      lian: [5],
      sui_bird: [9],
      yukisyo: [10],
      cinder_ram: [11],
      xuehui: [15],
      sui_flower: [16],
      grove_mender: [17],
      spark_mage: [22],
      rei: [23],
    },
    melee: [11, 17, 5, 10, 16, 4, 22, 9, 15, 3],
    ranged: [10, 16, 4, 22, 9, 15, 3, 21, 8, 14],
  },
  human_midline: {
    rei: 23,
    units: {},
    melee: [11, 17, 5, 10, 16, 4, 22, 9, 15, 3],
    ranged: [10, 16, 4, 22, 9, 15, 3, 21, 8, 14],
  },
  center_wedge: {
    rei: 23,
    units: {},
    melee: [11, 17, 10, 16, 5, 23, 9, 15, 4, 22],
    ranged: [10, 16, 9, 15, 4, 22, 3, 21, 8, 14],
  },
  split_flanks: {
    rei: 23,
    units: {},
    melee: [5, 23, 11, 17, 4, 22, 10, 16, 3, 21],
    ranged: [4, 22, 10, 16, 3, 21, 9, 15, 2, 20],
  },
};

const isMelee = (unit) => unit.id === "rei" || UNIT_DEFS[unit.id].attackType === "melee";

const applyFormation = (board, profileName) => {
  const profile = FORMATIONS[profileName];
  const entries = board.flatMap((unit, index) => (
    unit ? [{ unit, index }] : []
  ));
  const used = new Set();
  const placed = new Set();
  const output = Array.from({ length: board.length }, () => null);
  const place = (entry, slots) => {
    const slot = slots.find((candidate) => !used.has(candidate));
    if (slot === undefined) return false;
    used.add(slot);
    placed.add(entry.unit.uid);
    output[slot] = { ...entry.unit };
    return true;
  };
  entries.forEach((entry) => {
    const preferred = profile.units[entry.unit.id];
    if (preferred) place(entry, preferred);
  });
  entries
    .filter(({ unit }) => unit.id === "rei" && !placed.has(unit.uid))
    .forEach((entry) => place(entry, [profile.rei, ...profile.melee]));
  entries
    .filter(({ unit }) => unit.id !== "rei" && isMelee(unit) && !placed.has(unit.uid))
    .forEach((entry) => place(entry, profile.melee));
  entries
    .filter(({ unit }) => !isMelee(unit) && !placed.has(unit.uid))
    .forEach((entry) => place(entry, profile.ranged));
  return output;
};

const routeToRound = () => {
  const bridge = new EngineBridge(seed, 1, { simulation: true, battleStepHz });
  bridge.setConsoleLogging(false);
  const autopilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    style,
    informationMode,
    rolloutHz,
    undefined,
    liveBattleAudit,
  );
  if (!autopilot.startFromTitle()) throw new Error(`Could not start seed ${seed}`);

  let snapshot = null;
  const roundActions = [];
  const originalDispatch = bridge.dispatch.bind(bridge);
  bridge.dispatch = (action) => {
    if (bridge.engine.state.round === targetRound) {
      roundActions.push({ ...action });
    }
    if (
      !snapshot &&
      action.type === "battle" &&
      bridge.engine.state.phase === "preparation" &&
      bridge.engine.state.round === targetRound
    ) {
      snapshot = {
        state: structuredClone(bridge.engine.state),
        randomState: bridge.engine.getRandomState(),
        route: {
          actions: roundActions.map((entry) => ({ ...entry })),
          plannedFormation: autopilot.plannedFormation,
          lineageFormation: autopilot.lineageFormation,
          plannedLineupUids: [...autopilot.plannedLineupUids],
          plannedLineupUnits: Array.from(autopilot.plannedLineupUnits.entries()),
          preparationActions: autopilot.preparationActions,
          rescueSearchCompleted: autopilot.rescueSearchCompleted,
        },
      };
    }
    return originalDispatch(action);
  };

  let now = 1000;
  let safety = 0;
  while (!snapshot && safety < 10000 && bridge.engine.state.phase !== "gameover") {
    safety += 1;
    now += 1000;
    if (bridge.engine.state.phase === "battle") bridge.skipBattle();
    else autopilot.tick(now);
  }
  if (!snapshot) {
    throw new Error(
      `Could not reach preparation for round ${targetRound}; phase=${bridge.engine.state.phase} round=${bridge.engine.state.round}`,
    );
  }
  return snapshot;
};

const runBattle = (snapshot, board, label, metadata = {}) => {
  const bridge = new EngineBridge(seed, 1, { simulation: true, battleStepHz });
  bridge.setConsoleLogging(false);
  bridge.engine.state = structuredClone(snapshot.state);
  bridge.engine.restoreRandomState(snapshot.randomState);
  bridge.engine.state.board = board.map((unit) => (unit ? { ...unit } : null));
  bridge.engine.startBattle();
  const battleBefore = bridge.engine.state.battle;
  const enemy = battleBefore?.enemy.map((fighter) => ({
    id: fighter.unitId,
    star: fighter.star,
    maxHp: fighter.maxHp,
    attack: fighter.attack,
    armor: fighter.armor,
  })) || [];
  const skipped = bridge.skipBattle();
  const battleAfter = bridge.engine.state.battle;
  const player = battleAfter?.player.map((fighter) => ({
    id: fighter.unitId,
    star: fighter.star,
    alive: fighter.alive,
    hp: Number(fighter.hp.toFixed(2)),
    maxHp: fighter.maxHp,
    damageDealt: Number(fighter.damageDealt.toFixed(2)),
    damageTaken: Number(fighter.damageTaken.toFixed(2)),
  })) || [];
  const enemyAfter = battleAfter?.enemy.map((fighter) => ({
    id: fighter.unitId,
    star: fighter.star,
    alive: fighter.alive,
    hp: Number(fighter.hp.toFixed(2)),
    maxHp: fighter.maxHp,
  })) || [];
  const playerRatio = player.reduce(
    (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
    0,
  );
  const enemyRatio = enemyAfter.reduce(
    (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
    0,
  );
  return {
    label,
    ...metadata,
    board: describeEntries(board),
    enemy,
    skipped,
    result: bridge.engine.state.result,
    player,
    enemyAfter,
    playerRatio: Number(playerRatio.toFixed(5)),
    enemyRatio: Number(enemyRatio.toFixed(5)),
    margin: Number((playerRatio - enemyRatio).toFixed(5)),
  };
};

const snapshot = snapshotInputPath
  ? JSON.parse(await readFile(snapshotInputPath, "utf8"))
  : routeToRound();
if (snapshotPath) {
  await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`, "utf8");
}
if (snapshotOnly) {
  console.log(`Wrote seer round snapshot to ${snapshotPath || snapshotInputPath || "stdout"}`);
  process.exit(0);
}
if (inspectPlan) {
  const bridge = new EngineBridge(seed, 1, { simulation: true, battleStepHz });
  bridge.setConsoleLogging(false);
  bridge.engine.state = structuredClone(snapshot.state);
  bridge.engine.restoreRandomState(snapshot.randomState);
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    style,
    informationMode,
    rolloutHz,
    undefined,
    liveBattleAudit,
  );
  const lineup = pilot.rolloutTargetLineup(pilot.ownedEntries());
  console.log(JSON.stringify({
    plannedFormation: pilot.plannedFormation,
    lineageFormation: pilot.lineageFormation,
    plannedLineup: lineup.map(({ unit }) => describeUnit(unit)),
    plannedScore: pilot.plannedLineupScore,
  }, null, 2));
  process.exit(0);
}
if (simulateFormation) {
  const bridge = new EngineBridge(seed, 1, { simulation: true, battleStepHz });
  bridge.setConsoleLogging(false);
  bridge.engine.state = structuredClone(snapshot.state);
  bridge.engine.restoreRandomState(snapshot.randomState);
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    style,
    informationMode,
    rolloutHz,
    undefined,
    liveBattleAudit,
  );
  pilot.rolloutTargetLineup(pilot.ownedEntries());
  const actions = [];
  for (let step = 0; step < 32; step += 1) {
    const action = pilot.formationAction(pilot.ownedEntries());
    if (!action) break;
    actions.push({
      ...action,
      board: describeEntries(bridge.engine.state.board),
      bench: describeEntries(bridge.engine.state.bench),
    });
    bridge.dispatch(action);
  }
  console.log(JSON.stringify({
    plannedFormation: pilot.plannedFormation,
    actionCount: actions.length,
    actions,
    finalBoard: describeEntries(bridge.engine.state.board),
  }, null, 2));
  process.exit(0);
}
const baseBoard = snapshot.state.board;
const baseBench = snapshot.state.bench;
const boardEntries = baseBoard.flatMap((unit, index) => (
  unit ? [{ unit, index }] : []
));
const benchEntries = baseBench.flatMap((unit, index) => (
  unit ? [{ unit, index }] : []
));
const candidates = [{ label: "current", board: baseBoard.map((unit) => unit && { ...unit }) }];
const signatures = new Set(candidates.map(({ board }) => board.map(describeUnit).map(JSON.stringify).join("|")));

Object.keys(FORMATIONS).forEach((profileName) => {
  const board = applyFormation(baseBoard, profileName);
  const signature = board.map(describeUnit).map(JSON.stringify).join("|");
  if (signatures.has(signature)) return;
  signatures.add(signature);
  candidates.push({
    label: `formation:${profileName}`,
    board,
    metadata: { formation: profileName },
  });
});

for (const boardEntry of boardEntries) {
  for (const benchEntry of benchEntries) {
    const board = baseBoard.map((unit) => unit && { ...unit });
    board[boardEntry.index] = { ...benchEntry.unit };
    const signature = board.map(describeUnit).map(JSON.stringify).join("|");
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    candidates.push({
      label: `swap:${benchEntry.unit.id}${benchEntry.unit.star}>${boardEntry.unit.id}${boardEntry.unit.star}@${boardEntry.index}`,
      board,
      metadata: {
        benchIndex: benchEntry.index,
        replacedBoardIndex: boardEntry.index,
        replacedUnit: describeUnit(boardEntry.unit),
        incomingUnit: describeUnit(benchEntry.unit),
      },
    });
  }
}

if (includeTwoSwaps) {
  for (let leftBench = 0; leftBench < benchEntries.length; leftBench += 1) {
    for (let rightBench = leftBench + 1; rightBench < benchEntries.length; rightBench += 1) {
      for (let leftBoard = 0; leftBoard < boardEntries.length; leftBoard += 1) {
        for (let rightBoard = leftBoard + 1; rightBoard < boardEntries.length; rightBoard += 1) {
          const incomingLeft = benchEntries[leftBench];
          const incomingRight = benchEntries[rightBench];
          const replacedLeft = boardEntries[leftBoard];
          const replacedRight = boardEntries[rightBoard];
          const board = baseBoard.map((unit) => unit && { ...unit });
          board[replacedLeft.index] = { ...incomingLeft.unit };
          board[replacedRight.index] = { ...incomingRight.unit };
          const signature = board.map(describeUnit).map(JSON.stringify).join("|");
          if (signatures.has(signature)) continue;
          signatures.add(signature);
          candidates.push({
            label: `two-swap:${incomingLeft.unit.id}${incomingLeft.unit.star}+${incomingRight.unit.id}${incomingRight.unit.star}`
              + `>${replacedLeft.unit.id}${replacedLeft.unit.star}+${replacedRight.unit.id}${replacedRight.unit.star}`
              + `@${replacedLeft.index},${replacedRight.index}`,
            board,
            metadata: {
              benchIndices: [incomingLeft.index, incomingRight.index],
              replacedBoardIndices: [replacedLeft.index, replacedRight.index],
              replacedUnits: [describeUnit(replacedLeft.unit), describeUnit(replacedRight.unit)],
              incomingUnits: [describeUnit(incomingLeft.unit), describeUnit(incomingRight.unit)],
            },
          });
        }
      }
    }
  }
}

const results = candidates.map((candidate, index) => {
  if (index > 0 && index % 20 === 0) console.error(`tested ${index}/${candidates.length} candidates`);
  return runBattle(snapshot, candidate.board, candidate.label, candidate.metadata);
});
results.sort((left, right) => (
  Number(right.result?.won || false) - Number(left.result?.won || false) ||
  right.margin - left.margin
));

const report = {
  seed,
  targetRound,
  style,
  informationMode,
  liveBattleAudit,
  rolloutHz,
  battleStepHz,
  state: {
    hp: snapshot.state.hp,
    gold: snapshot.state.gold,
    playerLevel: snapshot.state.playerLevel,
    board: describeEntries(snapshot.state.board),
    bench: describeEntries(snapshot.state.bench),
    shop: snapshot.state.shop,
  },
  candidateCount: results.length,
  enemy: results[0]?.enemy || [],
  results,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote seer round diagnostic to ${outputPath}`);
console.log(JSON.stringify({
  candidateCount: results.length,
  wins: results.filter((result) => result.result?.won).length,
  best: results.slice(0, 12).map((result) => ({
    label: result.label,
    won: result.result?.won || false,
    margin: result.margin,
  })),
}, null, 2));
