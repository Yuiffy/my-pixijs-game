import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { loadTypescriptModule } = await import(new URL("./helpers/load-typescript-module.mjs", import.meta.url));

const ai = "src/components/autoChessGame/ai/";
const { default: original } = await loadTypescriptModule(`${ai}goCombatModel.json`);
const { default: adapted } = await loadTypescriptModule(`${ai}goCombatModelMissingUnits.json`);
const { createGoCombatScorer, scoreGoCombatCandidate } = await loadTypescriptModule(`${ai}goValueModel.ts`);
const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { AutoChessAutopilot } = await loadTypescriptModule(`${ai}AutoChessAutopilot.ts`);
const scoreAdapted = createGoCombatScorer(adapted);
const entry = { unit: { uid: 100, id: "sumire", star: 2 }, location: { zone: "board", index: 10 } };
const placements = [{ entry, slot: 10 }];
const makeBridge = () => {
  const bridge = new EngineBridge(90232, 1, { simulation: true });
  bridge.setConsoleLogging(false);
  return bridge;
};

test("长考适配只增加三个有训练样本的棋子行，原权重与特征保持不变", async () => {
  const raw = await readFile(`${ai}goCombatModel.json`);
  assert.equal(createHash("sha256").update(raw).digest("hex"), adapted.adaptation.parentModelSha256);
  assert.equal(adapted.schema, original.schema);
  assert.deepEqual(adapted.unitFeatureNames, original.unitFeatureNames);
  assert.deepEqual(adapted.normalization, original.normalization);
  const oldCount = original.vocab.units.length;
  assert.deepEqual(adapted.vocab.units.slice(0, oldCount), original.vocab.units);
  assert.deepEqual(adapted.vocab.units.slice(oldCount), ["chu2u", "sumire", "viridis"]);
  assert.ok(!adapted.vocab.units.includes("akirinco"));
  for (const name of ["starters", "waveTags", "augments"]) {
    assert.deepEqual(adapted.vocab[name], original.vocab[name]);
  }
  for (const [name, value] of Object.entries(original.state)) {
    assert.deepEqual(["unit_embedding.weight", "unit_features"].includes(name)
      ? adapted.state[name].slice(0, oldCount) : adapted.state[name], value, name);
  }
  for (const row of adapted.state["unit_embedding.weight"].slice(oldCount)) {
    assert.equal(row.length, original.state["unit_embedding.weight"][0].length);
    row.forEach((value, index) => {
      assert.ok(Number.isFinite(value));
      assert.ok(Math.abs(value - original.state["unit_embedding.weight"][0][index]) <= 1.500001);
    });
  }
});

test("旧棋子和隐藏秋凛子评分逐值相同，新棋子评分保持有限", () => {
  const fixture = { starter: "dance_start",
    augments: [],
    waveTag: "normal",
    modifier: 1,
    players: [],
    enemies: [{ id: "sun_guard", star: 1, position: 0 }] };
  for (const id of [...original.vocab.units.filter(value => value !== "<unk>"), "akirinco"]) {
    for (const star of [1, 2, 3]) {
      const evaluation = { ...fixture, players: [{ id, star, position: 10 }] };
      assert.equal(scoreAdapted(evaluation), scoreGoCombatCandidate(evaluation), `${id}/${star}`);
    }
  }
  for (const id of ["chu2u", "sumire", "viridis"]) {
    assert.ok(Number.isFinite(scoreAdapted({ ...fixture, players: [{ id, star: 2, position: 10 }] })));
  }
});

test("只有现代长考和看穿启用适配；切换低档、隐藏go或旧配置会保留原评分", () => {
  const bridge = makeBridge();
  const wave = bridge.engine.currentWave;
  const evaluation = { starter: bridge.engine.state.starter,
    augments: bridge.engine.state.augments,
    waveTag: wave.tag,
    modifier: wave.modifier,
    players: [{ id: "sumire", star: 2, position: 10 }],
    enemies: wave.units.map((unit, index) => ({ id: unit.id, star: unit.star || 1, position: index })) };
  const oldScore = scoreGoCombatCandidate(evaluation);
  const newScore = scoreAdapted(evaluation);
  assert.notEqual(newScore, oldScore);
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    undefined,
    true,
    "deep",
    true
  );
  for (const level of ["deep", "veteran", "oracle", "novice", "go", "deep", "veteran"]) {
    pilot.setConfiguration("balanced", level);
    assert.equal(pilot.goModelPlacementsScoreAtRound(placements, 1), ["deep", "oracle"].includes(level) ? newScore : oldScore, level);
    assert.equal(bridge.engine.state.round, 1);
  }
  const legacy = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal", 20);
  assert.equal(legacy.goModelPlacementsScoreAtRound(placements, 1), oldScore);
});

test("自定义评分器仍单次执行；看穿前瞻预算和异常后的回合恢复保持正常", () => {
  const bridge = makeBridge();
  let calls = 0;
  const scorer = () => { calls += 1; return 321; };
  const pilot = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    scorer,
    true,
    "deep",
    true
  );
  assert.equal(pilot.goModelPlacementsScoreAtRound(placements, 12), 321);
  assert.equal(calls, 1);
  assert.equal(bridge.engine.state.round, 1);
  pilot.setConfiguration("balanced", "oracle");
  for (const [round, expected] of [[1, 1], [12, 4], [16, 6], [21, 6], [31, 6]]) {
    bridge.engine.state.round = round;
    calls = 0;
    pilot.oracleFutureModelScore([entry], "go_canonical");
    assert.equal(calls, expected);
    assert.equal(bridge.engine.state.round, round);
  }
  bridge.engine.state.round = 7;
  const throwing = new AutoChessAutopilot(
    bridge,
    "evolution",
    {},
    "balanced",
    "normal",
    20,
    () => { throw new Error("injected scorer failure"); },
    true,
    "deep",
    true
  );
  assert.throws(() => throwing.goModelPlacementsScoreAtRound(placements, 12), /injected scorer failure/);
  assert.equal(bridge.engine.state.round, 7);
});
