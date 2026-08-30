import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { createBattleDebrief } = await loadTypescriptModule(
  "src/components/autoChessGame/core/battleDebrief.ts",
);

const fighter = (unitId, damageDealt, options = {}) => ({
  unitId,
  damageDealt,
  healingDone: options.healingDone ?? 0,
  shieldingDone: options.shieldingDone ?? 0,
  alive: options.alive ?? false,
});

const baseInput = {
  won: false,
  elapsed: 12,
  limit: 24,
  boardCount: 4,
  boardCap: 4,
  activeTraitCount: 1,
  player: [fighter("sun_guard", 120)],
  enemy: [fighter("ember_blade", 300, { alive: true })],
};

test("战斗复盘优先指出少上人口和超时", () => {
  const population = createBattleDebrief({ ...baseInput, boardCount: 3 });
  assert.equal(population.kind, "population");
  assert.match(population.title, /少上阵 1 人/);

  const timeout = createBattleDebrief({ ...baseInput, elapsed: 24 });
  assert.equal(timeout.kind, "timeout");
  assert.match(timeout.detail, /敌方仍存活 1 人/);
});

test("败局复盘按敌方最高输出区分前后排威胁", () => {
  const backline = createBattleDebrief({
    ...baseInput,
    enemy: [
      fighter("ember_blade", 420, { alive: true }),
      fighter("sun_guard", 80),
    ],
  });
  assert.equal(backline.kind, "backline");
  assert.match(backline.title, /兔子射手/);
  assert.match(backline.detail, /84% 输出/);

  const frontline = createBattleDebrief({
    ...baseInput,
    enemy: [
      fighter("sun_guard", 360, { alive: true }),
      fighter("ember_blade", 40),
    ],
  });
  assert.equal(frontline.kind, "frontline");
  assert.match(frontline.title, /果冻风纪/);
});

test("败局复盘在威胁归因前识别未成型羁绊和全面压制", () => {
  const synergy = createBattleDebrief({
    ...baseInput,
    activeTraitCount: 0,
  });
  assert.equal(synergy.kind, "synergy");
  assert.equal(synergy.tone, "warning");

  const pressure = createBattleDebrief({
    ...baseInput,
    enemy: [
      fighter("ember_blade", 90, { alive: true }),
      fighter("sun_guard", 90, { alive: true }),
      fighter("gale_archer", 90, { alive: true }),
    ],
  });
  assert.equal(pressure.kind, "pressure");
  assert.equal(pressure.tone, "danger");
  assert.match(pressure.detail, /3\/3/);
});

test("没有有效敌方输出时仍给出可执行的战线建议", () => {
  const result = createBattleDebrief({
    ...baseInput,
    enemy: [fighter("sun_guard", 0)],
  });
  assert.equal(result.kind, "pressure");
  assert.match(result.title, /战线被突破/);
  assert.match(result.detail, /调整前后排间距/);
});

test("胜局复盘聚合相同棋子的关键输出或支援", () => {
  const damage = createBattleDebrief({
    ...baseInput,
    won: true,
    player: [
      fighter("ember_blade", 240, { alive: true }),
      fighter("ember_blade", 160),
      fighter("sun_guard", 100, { alive: true }),
    ],
  });
  assert.equal(damage.kind, "standout");
  assert.match(damage.title, /关键输出 · 兔子射手/);
  assert.match(damage.detail, /80% 输出/);

  const support = createBattleDebrief({
    ...baseInput,
    won: true,
    player: [
      fighter("pako", 20, { healingDone: 260, alive: true }),
      fighter("sun_guard", 120, { shieldingDone: 40, alive: true }),
    ],
  });
  assert.equal(support.kind, "standout");
  assert.equal(support.tone, "positive");
  assert.match(support.title, /关键支援 · 帕可Pako/);
});
