import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const enginePath = fileURLToPath(new URL("../../src/components/flickChess/engine.ts", import.meta.url));
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

function settle(game, maxSteps = 1100) {
  let snapshot = game.snapshot();
  for (let step = 0; step < maxSteps && snapshot.phase === "moving"; step++) {
    snapshot = game.step(1 / 60);
  }
  assert.notEqual(snapshot.phase, "moving", "shot must settle or hit its time limit");
  return snapshot;
}

function moveOutside(game, predicate) {
  game.pieces.filter(predicate).forEach((piece, index) => {
    assert.ok(piece.body);
    piece.body.setTranslation({ x: 12 + index * 2, y: piece.y, z: 0 }, true);
  });
}

function placeScenario(game, positions) {
  game.pieces.forEach((piece, index) => {
    const position = positions[piece.id] ?? { x: 12 + index * 2, z: 0 };
    piece.body.setTranslation({ x: position.x, y: piece.height / 2 + 0.01, z: position.z }, true);
    piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  game.step(1 / 60);
  return game.snapshot();
}

function assertCoordinates(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 0.00001, `${value} differs from ${expected[index]}`);
  });
}

test("concurrent games initialize one WASM instance and release worlds on repeated resets", async () => {
  const instantiate = WebAssembly.instantiate;
  let instantiations = 0;
  WebAssembly.instantiate = function countInstantiations(...args) {
    instantiations++;
    return instantiate.apply(WebAssembly, args);
  };
  const games = [];
  try {
    games.push(...await Promise.all(Array.from({ length: 8 }, () => createFlickGame())));
    assert.equal(instantiations, 1, "concurrent creation must not replace the WASM instance");
    for (const game of games) {
      for (let index = 0; index < 5; index++) {
        const oldWorld = game.world;
        const free = oldWorld.free.bind(oldWorld);
        let freeCount = 0;
        oldWorld.free = () => {
          freeCount++;
          free();
        };
        const snapshot = game.reset();
        assert.equal(freeCount, 1);
        assert.notEqual(game.world, oldWorld);
        assert.equal(snapshot.pieces.length, 32);
        game.step(1 / 60);
      }
      const lastWorld = game.world;
      const free = lastWorld.free.bind(lastWorld);
      let freeCount = 0;
      lastWorld.free = () => {
        freeCount++;
        free();
      };
      game.destroy();
      game.destroy();
      assert.equal(freeCount, 1, "destroy must release the final world only once");
    }
  } finally {
    WebAssembly.instantiate = instantiate;
    games.forEach((game) => game.destroy());
  }
});

test("opening has both sixteen-piece armies with complete character portraits", async (t) => {
  const game = await createFlickGame();
  t.after(() => game.destroy());
  const snapshot = game.snapshot();
  assert.equal(snapshot.phase, "aiming");
  assert.equal(snapshot.turn, "red");
  assert.equal(snapshot.pieces.length, 32);
  assert.deepEqual(snapshot.remaining, { red: 16, blue: 16 });
  for (const side of ["red", "blue"]) {
    const pieces = snapshot.pieces.filter((piece) => piece.side === side);
    assert.deepEqual(
      ["rook", "horse", "elephant", "advisor", "general", "cannon", "pawn"]
        .map((kind) => pieces.filter((piece) => piece.kind === kind).length),
      [2, 2, 2, 2, 1, 2, 5],
    );
    assert.equal(new Set(pieces.map((piece) => piece.unitId)).size, 16);
    const sign = side === "red" ? 1 : -1;
    const back = pieces.filter((piece) => piece.kind !== "cannon" && piece.kind !== "pawn");
    assertCoordinates(back.map((piece) => piece.x), [-4.69, -3.5175, -2.345, -1.1725, 0, 1.1725, 2.345, 3.5175, 4.69]);
    assert.ok(back.every((piece) => Math.abs(piece.z - sign * 7.2) < 0.00001));
    const cannons = pieces.filter((piece) => piece.kind === "cannon");
    assertCoordinates(cannons.map((piece) => piece.x), [-3.5175, 3.5175]);
    assert.ok(cannons.every((piece) => Math.abs(piece.z - sign * 4) < 0.00001));
    const pawns = pieces.filter((piece) => piece.kind === "pawn");
    assertCoordinates(pawns.map((piece) => piece.x), [-4.69, -2.345, 0, 2.345, 4.69]);
    assert.ok(pawns.every((piece) => Math.abs(piece.z - sign * 2.4) < 0.00001));
    pieces.forEach((piece) => {
      assert.equal(piece.inPlay, true);
      assert.equal(piece.exit, null);
      assert.ok(piece.radius > 0 && piece.height > 0 && piece.mass > 0);
      assert.ok(existsSync(path.join(process.cwd(), "public", piece.portrait)));
    });
  }
  snapshot.pieces.forEach((piece, index) => snapshot.pieces.slice(index + 1).forEach((other) => {
    assert.ok(Math.hypot(piece.x - other.x, piece.z - other.z) > piece.radius + other.radius);
  }));
  for (let step = 0; step < 60; step++) game.step(1 / 60);
  game.snapshot().pieces.forEach((piece, index) => {
    assert.ok(Math.hypot(piece.x - snapshot.pieces[index].x, piece.z - snapshot.pieces[index].z) < 0.001);
  });
});

test("invalid launches leave turn and pieces unchanged", async (t) => {
  const game = await createFlickGame();
  t.after(() => game.destroy());
  const before = game.snapshot();
  assert.equal(game.launch("blue-0", 0, 1), false);
  assert.equal(game.launch("red-0", 0, 0), false);
  assert.equal(game.launch("red-0", 0, 1.1), false);
  assert.equal(game.launch("red-0", Infinity, 0.5), false);
  assert.equal(game.launch("missing", 0, 0.5), false);
  const after = game.snapshot();
  assert.equal(after.phase, before.phase);
  assert.equal(after.turn, before.turn);
  assert.equal(after.shotCount, before.shotCount);
  assert.deepEqual(after.remaining, before.remaining);
  assert.deepEqual(after.pieces, before.pieces);
});

test("a physical shot can leave the board, then the turn switches and reset restores setup", async (t) => {
  const game = await createFlickGame();
  t.after(() => game.destroy());
  assert.equal(game.launch("red-15", 0, 1), true);
  assert.equal(game.launch("red-0", 0, 0.5), false, "a player may shoot only once per turn");
  const settled = settle(game);
  assert.equal(settled.phase, "aiming");
  assert.equal(settled.turn, "blue");
  assert.equal(settled.shotCount, 1);
  const fallen = settled.pieces.find((piece) => piece.id === "red-15");
  assert.equal(fallen.inPlay, false);
  assert.equal(fallen.exit.shotCount, 1);
  assert.ok(Object.values(fallen.exit).every(Number.isFinite));
  assert.ok(fallen.exit.x > settled.board.width / 2);
  assert.ok(fallen.exit.vx > 0);
  assertCoordinates([fallen.x, fallen.y, fallen.z, fallen.angle],
    [fallen.exit.x, fallen.exit.y, fallen.exit.z, fallen.exit.angle]);
  const recordedExit = { ...fallen.exit };
  fallen.exit.x = -99;
  assert.deepEqual(game.snapshot().pieces.find((piece) => piece.id === "red-15").exit, recordedExit,
    "snapshot consumers cannot overwrite recorded exit motion");
  assert.deepEqual(settled.remaining, { red: 15, blue: 16 });

  const reset = game.reset();
  assert.equal(reset.phase, "aiming");
  assert.equal(reset.turn, "red");
  assert.equal(reset.shotCount, 0);
  assert.deepEqual(reset.remaining, { red: 16, blue: 16 });
  assert.equal(reset.pieces.find((piece) => piece.id === "red-15").inPlay, true);
  assert.equal(reset.pieces.find((piece) => piece.id === "red-15").exit, null);
});

test("the last opposing piece leaving ends the game for the surviving side", async (t) => {
  const game = await createFlickGame();
  t.after(() => game.destroy());
  assert.equal(game.launch("red-15", 0, 1), true);
  moveOutside(game, (piece) => piece.side === "blue");
  const result = game.step(1 / 60);
  assert.equal(result.phase, "finished");
  assert.equal(result.winner, "red");
  assert.equal(result.remaining.blue, 0);
  assert.ok(result.remaining.red > 0);
  assert.equal(chooseAiShot(result), null);
  assert.equal(game.launch("red-0", 0, 1), false);
});

test("simultaneous elimination is a draw and reset starts a fresh match", async (t) => {
  const game = await createFlickGame();
  t.after(() => game.destroy());
  assert.equal(game.launch("red-15", 0, 1), true);
  moveOutside(game, () => true);
  const result = game.step(1 / 60);
  assert.equal(result.phase, "finished");
  assert.equal(result.winner, "draw");
  assert.deepEqual(result.remaining, { red: 0, blue: 0 });
  const reset = game.reset();
  assert.equal(reset.phase, "aiming");
  assert.equal(reset.winner, null);
  assert.deepEqual(reset.remaining, { red: 16, blue: 16 });
});

test("AI plays consecutive legal turns without a stuck moving phase", async (t) => {
  const game = await createFlickGame();
  t.after(() => game.destroy());
  let snapshot = game.snapshot();
  for (let turn = 0; turn < 20 && snapshot.phase !== "finished"; turn++) {
    const shot = chooseAiShot(snapshot);
    assert.ok(shot, "AI must select a shot while both sides still have pieces");
    assert.equal(snapshot.pieces.find((piece) => piece.id === shot.pieceId).side, snapshot.turn);
    assert.ok(Number.isFinite(shot.angle) && shot.power > 0 && shot.power <= 1);
    const previousTurn = snapshot.turn;
    assert.equal(game.launch(shot.pieceId, shot.angle, shot.power), true);
    snapshot = settle(game);
    assert.equal(snapshot.shotCount, turn + 1);
    if (snapshot.phase !== "finished") assert.notEqual(snapshot.turn, previousTurn);
  }
  assert.ok(snapshot.shotCount >= 1);
  assert.ok(snapshot.remaining.red <= 16 && snapshot.remaining.blue <= 16);
});

test("AI converts a clear edge attack into a winning elimination", async (t) => {
  const game = await createFlickGame();
  t.after(() => game.destroy());
  const position = placeScenario(game, {
    "red-15": { x: 3.9, z: 0 },
    "blue-15": { x: 5.18, z: 0 },
  });
  assert.deepEqual(position.remaining, { red: 1, blue: 1 });
  const shot = chooseAiShot(position);
  assert.ok(shot);
  assert.equal(shot.pieceId, "red-15");
  assert.deepEqual(game.snapshot(), position, "AI search must not advance the real game");
  assert.deepEqual(chooseAiShot(position), shot, "AI search should be deterministic for a settled position");
  assert.equal(game.launch(shot.pieceId, shot.angle, shot.power), true);
  const result = settle(game);
  assert.equal(result.winner, "red");
  assert.deepEqual(result.remaining, { red: 1, blue: 0 });
});

test("AI rejects an edge attack that sacrifices its own piece", async (t) => {
  const game = await createFlickGame();
  t.after(() => game.destroy());
  const position = placeScenario(game, {
    "red-15": { x: 3.95, z: 0 },
    "red-14": { x: -2, z: 0 },
    "blue-15": { x: 5.14, z: 0 },
    "blue-14": { x: -3.15, z: 0 },
  });
  assert.deepEqual(position.remaining, { red: 2, blue: 2 });
  const shot = chooseAiShot(position);
  assert.ok(shot);
  assert.equal(game.launch(shot.pieceId, shot.angle, shot.power), true);
  const result = settle(game);
  assert.ok(result.remaining.blue < position.remaining.blue, "the AI should still apply tactical pressure");
  assert.equal(result.remaining.red, position.remaining.red, "the AI should preserve its own pieces");
});
