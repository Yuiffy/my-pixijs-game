import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const enginePath = fileURLToPath(new URL("../src/components/flickChess/engine.ts", import.meta.url));
const compiled = ts.transpileModule(readFileSync(enginePath, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const engineModule = new Module(enginePath);
engineModule.filename = enginePath;
engineModule.paths = Module._nodeModulePaths(path.dirname(enginePath));
engineModule._compile(compiled, enginePath);
const { createFlickGame, chooseAiShot } = engineModule.exports;

const MAX_STEPS_PER_SHOT = 1100;
const OPENINGS = [
  { pieceId: "red-13", angle: -Math.PI / 2, power: 0.66 },
  { pieceId: "red-11", angle: -1.33, power: 0.7 },
  { pieceId: "red-14", angle: -1.82, power: 0.78 },
];

// Frozen copy of the chooser before rollout search; this stays fixed as the baseline.
function legacyShot(snapshot) {
  if (snapshot.phase !== "aiming" || snapshot.winner) return null;
  const own = snapshot.pieces.filter((piece) => piece.inPlay && piece.side === snapshot.turn);
  const enemies = snapshot.pieces.filter((piece) => piece.inPlay && piece.side !== snapshot.turn);
  if (!own.length || !enemies.length) return null;

  let best = null;
  own.forEach((piece) => enemies.forEach((target) => {
    const dx = target.x - piece.x;
    const dz = target.z - piece.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) return;
    const directionX = dx / distance;
    const directionZ = dz / distance;
    const blockers = snapshot.pieces.filter((other) => {
      if (!other.inPlay || other.id === piece.id || other.id === target.id) return false;
      const along = (other.x - piece.x) * directionX + (other.z - piece.z) * directionZ;
      const across = Math.abs((other.x - piece.x) * directionZ - (other.z - piece.z) * directionX);
      return along > piece.radius && along < distance - target.radius
        && across < piece.radius + other.radius + 0.08;
    });
    const friendlyBlockers = blockers.filter((other) => other.side === piece.side).length;
    const edgeX = (snapshot.board.width / 2 - Math.abs(target.x)) / (snapshot.board.width / 2);
    const edgeZ = (snapshot.board.length / 2 - Math.abs(target.z)) / (snapshot.board.length / 2);
    const edgeBonus = 1 - Math.min(edgeX, edgeZ);
    const outward = ((target.x * directionX) / (snapshot.board.width / 2))
      + ((target.z * directionZ) / (snapshot.board.length / 2));
    const score = 4 / (1 + distance) + edgeBonus + outward * 0.45
      + ((piece.mass / (target.mass + 1)) * 0.4) - friendlyBlockers * 1.8 - blockers.length * 0.35;
    if (!best || score > best.score) {
      const neededSpeed = Math.sqrt(2 * 2.7 * Math.max(0, distance - piece.radius - target.radius));
      best = {
        shot: {
          pieceId: piece.id,
          angle: Math.atan2(dz, dx),
          power: Math.max(0.23, Math.min(1, (neededSpeed + 2.1 - 1) / 10)),
        },
        score,
      };
    }
  }));
  return best?.shot ?? null;
}

function settle(game) {
  let snapshot = game.snapshot();
  for (let step = 0; step < MAX_STEPS_PER_SHOT && snapshot.phase === "moving"; step++) {
    snapshot = game.step(1 / 60);
  }
  assert.notEqual(snapshot.phase, "moving", "shot did not settle");
  return snapshot;
}

async function play(opening, challengerSide, maxTurns) {
  const game = await createFlickGame();
  try {
    assert.equal(game.launch(opening.pieceId, opening.angle, opening.power), true);
    let snapshot = settle(game);
    const turns = [];
    for (let index = 0; index < maxTurns && snapshot.phase === "aiming"; index++) {
      const side = snapshot.turn;
      const controller = side === challengerSide ? "challenger" : "legacy";
      const started = performance.now();
      const shot = controller === "challenger" ? chooseAiShot(snapshot) : legacyShot(snapshot);
      const decisionMs = performance.now() - started;
      assert.ok(shot, `${controller} found no shot on turn ${index}`);
      const before = snapshot.remaining;
      assert.equal(game.launch(shot.pieceId, shot.angle, shot.power), true,
        `${controller} chose an illegal shot`);
      snapshot = settle(game);
      const opponent = side === "red" ? "blue" : "red";
      turns.push({
        controller,
        side,
        shot,
        decisionMs: Math.round(decisionMs * 100) / 100,
        captures: before[opponent] - snapshot.remaining[opponent],
        ownLosses: before[side] - snapshot.remaining[side],
      });
    }
    const opponent = challengerSide === "red" ? "blue" : "red";
    return {
      opening: opening.pieceId,
      challengerSide,
      turnsPlayed: turns.length,
      remaining: snapshot.remaining,
      challengerAdvantage: snapshot.remaining[challengerSide] - snapshot.remaining[opponent],
      winner: snapshot.winner,
      turns,
    };
  } finally {
    game.destroy();
  }
}

function summary(matches) {
  const turns = matches.flatMap((match) => match.turns);
  const byController = Object.fromEntries(["challenger", "legacy"].map((name) => {
    const selected = turns.filter((turn) => turn.controller === name);
    return [name, {
      shots: selected.length,
      captures: selected.reduce((total, turn) => total + turn.captures, 0),
      ownLosses: selected.reduce((total, turn) => total + turn.ownLosses, 0),
      averageDecisionMs: Math.round(selected.reduce((total, turn) => total + turn.decisionMs, 0)
        / Math.max(1, selected.length) * 100) / 100,
      slowestDecisionMs: Math.max(0, ...selected.map((turn) => turn.decisionMs)),
    }];
  }));
  return {
    matchCount: matches.length,
    averageChallengerAdvantage: matches.reduce((total, match) => total + match.challengerAdvantage, 0)
      / matches.length,
    byController,
  };
}

async function main() {
  const maxTurns = Number(process.argv.find((arg) => arg.startsWith("--turns="))?.slice(8) ?? 12);
  const seedCount = Number(process.argv.find((arg) => arg.startsWith("--seeds="))?.slice(8) ?? OPENINGS.length);
  assert.ok(Number.isInteger(maxTurns) && maxTurns > 0 && maxTurns <= 40);
  assert.ok(Number.isInteger(seedCount) && seedCount > 0 && seedCount <= OPENINGS.length);
  const started = performance.now();
  const matches = [];
  for (const opening of OPENINGS.slice(0, seedCount)) {
    for (const challengerSide of ["red", "blue"]) {
      matches.push(await play(opening, challengerSide, maxTurns));
    }
  }
  console.log(JSON.stringify({
    summary: summary(matches),
    durationSeconds: Math.round((performance.now() - started) / 10) / 100,
    matches: matches.map((match) => ({
      opening: match.opening,
      challengerSide: match.challengerSide,
      turnsPlayed: match.turnsPlayed,
      remaining: match.remaining,
      challengerAdvantage: match.challengerAdvantage,
      winner: match.winner,
    })),
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
