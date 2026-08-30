import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { canonicalFormationPlacements } = await loadTypescriptModule(
  "src/components/autoChessGame/core/formation.ts",
);
const { UNIT_DEFS } = await loadTypescriptModule(
  "src/components/autoChessGame/core/gameData.ts",
);
const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);

const unitSpecs = [
  ["rei", 2],
  ["mossback", 1],
  ["youyi", 2],
  ["spark_mage", 1],
  ["spark_mage", 1],
  ["yua", 3],
  ["tiandou", 2],
];

const makeLineup = (specs, uidBase = 8100) => specs.map(([id, star], index) => ({
  unit: { uid: uidBase + index * 13, id, star },
  location: { zone: "board", index: (index * 7) % 24 },
}));

const placementSignature = (placements) => placements
  .map(({ entry, slot }) => `${slot}:${entry.unit.id}:${entry.unit.star}`)
  .sort()
  .join("|");

test("规范站位按角色职责稳定排序且不依赖输入顺序或 UID", () => {
  const forward = canonicalFormationPlacements(makeLineup(unitSpecs));
  const reverse = canonicalFormationPlacements(makeLineup([...unitSpecs].reverse(), 99100));

  assert.equal(forward.length, unitSpecs.length);
  assert.equal(new Set(forward.map(({ slot }) => slot)).size, unitSpecs.length);
  assert.equal(placementSignature(forward), placementSignature(reverse));

  const rei = forward.find(({ entry }) => entry.unit.id === "rei");
  assert.equal(rei?.slot, 23);
  forward.forEach(({ entry, slot }) => {
    const definition = UNIT_DEFS[entry.unit.id];
    if (entry.unit.id === "rei") return;
    if (definition.attackType === "melee") {
      assert.ok([11, 17, 10, 16, 5, 23, 9, 15, 4, 22].includes(slot));
    } else {
      assert.ok([10, 16, 9, 15, 4, 22, 3, 21, 8, 14].includes(slot));
    }
  });
});

test("推荐站位只重排场上单位并保持星级、备战席与选中棋子", () => {
  const bridge = new EngineBridge(198710, 1, { simulation: true });
  const { state } = bridge.engine;
  state.phase = "preparation";
  state.board.fill(null);
  state.bench.fill(null);

  const lineup = makeLineup(unitSpecs, 12000);
  const scrambledSlots = [0, 2, 6, 7, 12, 18, 20];
  lineup.forEach(({ unit }, index) => {
    state.board[scrambledSlots[index]] = unit;
  });
  state.bench[0] = { uid: 70001, id: "sui_blue", star: 3 };
  state.bench[5] = { uid: 70002, id: "lian", star: 1 };
  state.selected = { zone: "board", index: scrambledSlots[3] };

  const selectedUid = state.board[state.selected.index].uid;
  const benchBefore = structuredClone(state.bench);
  const rosterBefore = lineup
    .map(({ unit }) => `${unit.uid}:${unit.id}:${unit.star}`)
    .sort();
  const expectedSlots = new Map(
    canonicalFormationPlacements(lineup).map(({ entry, slot }) => [entry.unit.uid, slot]),
  );

  bridge.dispatch({ type: "autoArrange" });

  const rosterAfter = state.board
    .filter(Boolean)
    .map((unit) => `${unit.uid}:${unit.id}:${unit.star}`)
    .sort();
  assert.deepEqual(rosterAfter, rosterBefore);
  assert.deepEqual(state.bench, benchBefore);
  expectedSlots.forEach((slot, uid) => assert.equal(state.board[slot]?.uid, uid));
  assert.equal(state.board[state.selected.index]?.uid, selectedUid);
  assert.match(state.toast.text, /推荐站位已完成/);

  const arrangedBoard = state.board.map((unit) => unit?.uid ?? null);
  state.selected = { zone: "bench", index: 5 };
  bridge.dispatch({ type: "autoArrange" });
  assert.deepEqual(state.board.map((unit) => unit?.uid ?? null), arrangedBoard);
  assert.deepEqual(state.selected, { zone: "bench", index: 5 });
  assert.match(state.toast.text, /已经处于推荐站位/);

  const textState = JSON.parse(bridge.renderTextState());
  assert.ok(textState.availableActions.includes("A 推荐站位（只整理场上单位）"));
});

test("战斗阶段不会执行推荐站位", () => {
  const bridge = new EngineBridge(198711, 1, { simulation: true });
  const { state } = bridge.engine;
  state.phase = "battle";
  state.board.fill(null);
  state.board[0] = { uid: 92001, id: "mossback", star: 2 };
  state.board[23] = { uid: 92002, id: "yua", star: 2 };
  const before = structuredClone(state.board);

  assert.equal(bridge.engine.autoArrangeBoard(), false);
  assert.deepEqual(state.board, before);
});
