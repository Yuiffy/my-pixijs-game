import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const compileModule = async (relativePath, dependencies = {}) => {
  const source = await readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (!(specifier in dependencies)) {
      throw new Error(`Unexpected dependency: ${specifier}`);
    }
    return dependencies[specifier];
  };
  Function("module", "exports", "require", compiled)(module, module.exports, require);
  return module.exports;
};

const gameData = await compileModule("src/components/autoChessGame/core/gameData.ts");
const { AutoChessEngine } = await compileModule(
  "src/components/autoChessGame/core/gameEngine.ts",
  { "./gameData": gameData },
);

const BOARD_SLOTS = [0, 4, 5, 6, 11, 12, 23];
const BATTLE_BOUNDS = { left: 52, right: 1068, top: 145, bottom: 625 };

test("6x4 deployment slots preserve their formation positions at battle start", () => {
  const engine = new AutoChessEngine(1);
  engine.startRun("bastion");
  engine.state.playerLevel = 8;
  engine.state.board.fill(null);

  BOARD_SLOTS.forEach((slot, index) => {
    engine.state.board[slot] = {
      uid: index + 1,
      id: "sun_guard",
      star: 1,
    };
  });

  engine.startBattle();

  assert.equal(engine.state.phase, "battle");
  assert.ok(engine.state.battle);

  const fightersById = new Map(
    engine.state.battle.player.map((fighter) => [fighter.fid, fighter]),
  );

  BOARD_SLOTS.forEach((slot, index) => {
    const fighter = fightersById.get(`p-${index + 1}`);
    const column = slot % 6;
    const row = Math.floor(slot / 6);

    assert.ok(fighter, `slot ${slot} should create a fighter`);
    assert.equal(fighter.x, 72 + column * 88 + (row % 2) * 18);
    assert.equal(fighter.y, 175 + row * 135);
    assert.ok(fighter.x >= BATTLE_BOUNDS.left && fighter.x <= BATTLE_BOUNDS.right);
    assert.ok(fighter.y >= BATTLE_BOUNDS.top && fighter.y <= BATTLE_BOUNDS.bottom);
  });

  const slot4 = fightersById.get("p-2");
  const slot5 = fightersById.get("p-3");
  const slot6 = fightersById.get("p-4");
  const slot23 = fightersById.get("p-7");

  assert.equal(slot4.y, 175);
  assert.equal(slot5.y, 175);
  assert.equal(slot6.y, 310);
  assert.equal(slot23.x, 530);
  assert.equal(slot23.y, 580);
});
