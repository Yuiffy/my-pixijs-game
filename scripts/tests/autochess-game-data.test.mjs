import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const loadModule = async (relativePath) => {
  const source = await readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  Function("module", "exports", compiled)(module, module.exports);
  return module.exports;
};

const data = await loadModule("src/components/autoChessGame/core/gameData.ts");

test("六本八人口的升本成本与商店概率符合短局节奏", () => {
  assert.deepEqual(
    data.PLAYER_LEVELS.map((level) => data.PLAYER_LEVEL_CONFIG[level].upgradeCost),
    [5, 9, 14, 20, 27, null],
  );
  assert.deepEqual(data.PLAYER_LEVELS.map(data.bookLevelForPlayerLevel), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    data.PLAYER_LEVELS.map((level) => data.PLAYER_LEVEL_CONFIG[level].boardCap),
    [3, 4, 5, 6, 7, 8],
  );
  data.PLAYER_LEVELS.forEach((level) =>
    assert.equal(data.PLAYER_LEVEL_CONFIG[level].tierOdds.reduce((sum, chance) => sum + chance, 0), 100),
  );
});

test("八关后生成持续成长的无限关", () => {
  const first = data.waveForRound(9);
  const elite = data.waveForRound(11);
  const boss = data.waveForRound(13);
  const late = data.waveForRound(26);
  assert.equal(first.round, 9);
  assert.equal(first.tag, "normal");
  assert.equal(elite.tag, "elite");
  assert.equal(boss.tag, "boss");
  assert.equal(boss.units[0].id, "rift_tyrant");
  assert.ok(late.modifier > first.modifier);
  assert.ok(late.units.some((unit) => (unit.star || 1) >= 2));
});

test("岁己主题棋子组成早起的鸟儿有饼吃构筑", () => {
  const forms = ["sui", "sui_blue", "sui_bird", "sui_flower", "sui_cat", "biscuit_sui"];
  assert.equal(data.TRAITS.sui_forms.name, "早起的鸟儿有饼吃");
  assert.deepEqual(data.TRAITS.sui_forms.thresholds, [2, 4, 6]);
  assert.deepEqual(
    forms.map((id) => data.UNIT_DEFS[id].tier),
    [1, 2, 3, 3, 4, 5],
  );
  forms.forEach((id) => {
    assert.ok(data.SHOP_UNITS.includes(id));
    assert.ok(data.UNIT_DEFS[id].traits.includes("sui_forms"));
    assert.ok(data.UNIT_DEFS[id].portrait);
  });
  assert.equal(data.UNIT_DEFS.sui.name, "小红帽岁己");
  assert.equal(
    data.UNIT_DEFS.sui.portrait,
    "/images/materials/red/1d5ad005aff0b4b648a0f1ef6b8d0cd71954091502.png",
  );
  assert.equal(data.UNIT_DEFS.sui_bird.name, "小岁鸟");
  assert.equal(
    data.UNIT_DEFS.sui_bird.portrait,
    "/images/materials/bird/岁己_小鸟跳静态图.png",
  );
  assert.deepEqual(
    forms.map((id) => data.UNIT_DEFS[id].abilityName),
    ["大家在吗？", "闪购闪购", "小鸟归巢", "火烧云", "小猫拳", "饼干拳法"],
  );
  ["shiori", "yua", "nagisa"].forEach((id) => {
    assert.ok(data.SHOP_UNITS.includes(id));
    assert.match(data.UNIT_DEFS[id].portrait, /^\/images\/livers\//);
  });
});

test("商店棋子定义和羁绊引用保持完整", () => {
  assert.equal(new Set(data.SHOP_UNITS).size, data.SHOP_UNITS.length);
  data.SHOP_UNITS.forEach((id) => {
    const unit = data.UNIT_DEFS[id];
    assert.equal(unit.id, id);
    assert.equal(unit.shop, true);
    assert.equal(unit.cost, unit.tier);
    assert.equal(unit.traits.length, 2);
    unit.traits.forEach((trait) => assert.ok(data.TRAIT_IDS.includes(trait)));
  });
});
