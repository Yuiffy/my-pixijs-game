import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
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

const inspectPng = (buffer) => {
  const signature = "89504e470d0a1a0a";
  assert.equal(buffer.subarray(0, 8).toString("hex"), signature, "portrait must be a PNG");
  let offset = 8;
  let width;
  let height;
  let colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      assert.equal(chunk[8], 8, "portrait must use 8-bit channels");
      colorType = chunk[9];
      assert.equal(chunk[12], 0, "portrait must not use interlacing");
    }
    if (type === "IDAT") idat.push(chunk);
    if (type === "IEND") break;
    offset += length + 12;
  }
  assert.equal(colorType, 6, "portrait must be RGBA so its background can be transparent");
  const rows = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  let rowOffset = 0;
  let previous = Buffer.alloc(stride);
  let hasTransparentPixel = false;
  for (let y = 0; y < height; y += 1) {
    const filter = rows[rowOffset];
    const row = Buffer.from(rows.subarray(rowOffset + 1, rowOffset + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      if (filter === 2) row[x] = (row[x] + up) & 255;
      if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const prediction = left + up - upperLeft;
        const distances = [Math.abs(prediction - left), Math.abs(prediction - up), Math.abs(prediction - upperLeft)];
        const nearest = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : upperLeft;
        row[x] = (row[x] + nearest) & 255;
      }
    }
    assert.ok(filter <= 4, "portrait PNG uses an unsupported scanline filter");
    for (let alpha = 3; alpha < row.length; alpha += 4) hasTransparentPixel ||= row[alpha] < 255;
    previous = row;
    rowOffset += stride + 1;
  }
  return { width, height, hasTransparentPixel };
};

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

test("浣熊射手试点使用原创展示文案与独立精灵头像", async () => {
  const unit = data.UNIT_DEFS.gale_archer;
  assert.equal(unit.name, "浣熊射手");
  assert.equal(unit.title, "风痕巡林者 · 远程输出");
  assert.equal(unit.glyph, "浣");
  assert.equal(unit.portraitStyle, "sprite");
  assert.equal(unit.portrait, "/images/autochess/portraits/raccoon-archer.png");
  assert.doesNotMatch(`${unit.name} ${unit.title}`, /十六萤|Izayoi/);
  const assetPath = path.resolve("public", unit.portrait.slice(1));
  await access(assetPath);
  const portrait = inspectPng(await readFile(assetPath));
  assert.equal(portrait.width, portrait.height);
  assert.equal(portrait.width, 512);
  assert.equal(portrait.hasTransparentPixel, true);
});

test("炽焰萝卜试点使用原创展示文案与独立精灵头像", async () => {
  const unit = data.UNIT_DEFS.ember_blade;
  assert.equal(unit.name, "炽焰萝卜");
  assert.equal(unit.title, "炽焰前锋 · 近战灼烧");
  assert.equal(unit.glyph, "萝");
  assert.equal(unit.abilityName, "炽焰萝卜突击");
  assert.equal(unit.portraitStyle, "sprite");
  assert.equal(unit.portrait, "/images/autochess/portraits/ember-blade.png");
  assert.equal(unit.portraitFocus, undefined);
  assert.doesNotMatch(`${unit.name} ${unit.title} ${unit.abilityName} ${unit.abilityDescription}`, /莉蔻|Liko|棒冰|特工/);
  const assetPath = path.resolve("public", unit.portrait.slice(1));
  await access(assetPath);
  const portrait = inspectPng(await readFile(assetPath));
  assert.equal(portrait.width, portrait.height);
  assert.equal(portrait.width, 512);
  assert.equal(portrait.hasTransparentPixel, true);
  const blaze = data.STARTERS.find((starter) => starter.id === "blaze");
  const sharpEdge = data.AUGMENTS.find((augment) => augment.id === "sharp_edge");
  assert.doesNotMatch(`${blaze.name} ${blaze.subtitle} ${blaze.description} ${sharpEdge.name} ${sharpEdge.kicker}`, /莉蔻|Liko|特工/);
});

test("非岁己角色收敛为低费代表，岁己保留多种形态", () => {
  const retained = [
    "sun_guard", "ember_blade", "gale_archer", "rift_stalker", "cog_scribe", "mossback",
    "rift_brawler", "shiori", "spark_mage", "clock_gunner", "dawn_duelist", "grove_mender",
    "cinder_ram", "yua", "mitsuri", "nagisa",
  ];
  const removed = [
    "brass_colossus", "ash_dancer", "thorn_brute", "void_oracle", "gear_sniper", "shade_reaver",
    "sun_phoenix", "prism_sage", "moonfang", "rift_warden", "iron_dervish", "siege_walker",
    "dawn_sovereign", "solar_champion", "inferno_witch", "sky_drake", "void_reaper", "chrono_titan",
  ];
  retained.forEach((id) => assert.ok(data.SHOP_UNITS.includes(id), `${id} should remain shop-available`));
  removed.forEach((id) => {
    assert.equal(data.SHOP_UNITS.includes(id), false);
    assert.equal(data.UNIT_DEFS[id], undefined);
  });
  assert.equal(data.UNIT_DEFS.sun_guard.name, "果冻风纪");
  assert.match(data.UNIT_DEFS.sun_guard.title, /灰泽满Hazel/);
  assert.equal(data.UNIT_DEFS.sui_cat.name, "小猫拳");
  assert.match(data.UNIT_DEFS.sui_cat.title, /岁己SUI/);
  assert.equal(data.TRAITS.aegis.name, "VR学园");
  assert.equal(data.AUGMENTS.find((augment) => augment.id === "triage")?.name, "七海急救");
});

test("岁己形态拆分到不同关系构筑", () => {
  const forms = ["sui", "sui_blue", "sui_bird", "sui_flower", "sui_cat", "biscuit_sui"];
  assert.equal(data.TRAITS.sui_forms, undefined);
  assert.deepEqual(
    forms.map((id) => data.UNIT_DEFS[id].tier),
    [1, 2, 3, 3, 4, 5],
  );
  forms.forEach((id) => {
    assert.ok(data.SHOP_UNITS.includes(id));
    assert.ok(data.UNIT_DEFS[id].portrait);
  });
  assert.deepEqual(data.UNIT_DEFS.sui.traits, ["vanguard", "gluttony"]);
  assert.deepEqual(data.UNIT_DEFS.sui_blue.traits, ["ranger", "skeleton_soldier"]);
  assert.deepEqual(data.UNIT_DEFS.sui_bird.traits, ["mystic", "sui_shiori"]);
  assert.deepEqual(data.UNIT_DEFS.sui_flower.traits, ["mystic", "chuanmei"]);
  assert.deepEqual(data.UNIT_DEFS.sui_cat.traits, ["assassin", "sui_shiori"]);
  assert.deepEqual(data.UNIT_DEFS.biscuit_sui.traits, ["brawler", "chuanmei"]);
  assert.equal(data.UNIT_DEFS.sui_bird.name, "岁己·小鸟援护");
});

test("关系羁绊覆盖收敛后的主播组合且商店定义完整", () => {
  assert.equal(new Set(data.SHOP_UNITS).size, data.SHOP_UNITS.length);
  assert.ok(data.SHOP_UNITS.includes("mitsuri"));
  ["chuanmei", "gluttony", "skeleton_soldier", "gen27", "yue_gang", "sui_shiori"].forEach((id) => {
    assert.equal(data.TRAITS[id].family, "关系");
    assert.equal(data.TRAITS[id].thresholds.length, data.TRAITS[id].bonuses.length);
  });
  ["sui_flower", "biscuit_sui", "nagisa"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("chuanmei")));
  ["sui", "spark_mage", "grove_mender", "cinder_ram"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("gluttony")));
  ["sui_blue", "shiori"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("skeleton_soldier")));
  ["rift_stalker", "rift_brawler", "mitsuri"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("yue_gang")));
  ["sun_guard", "ember_blade", "gale_archer", "rift_brawler", "clock_gunner"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("gen27")));
  assert.deepEqual(data.UNIT_DEFS.rift_brawler.traits, ["rift", "brawler", "gen27", "yue_gang"]);
  data.WAVES.forEach((wave) => wave.units.forEach(({ id }) => assert.ok(data.UNIT_DEFS[id], `${id} should remain defined for wave ${wave.round}`)));
  data.SHOP_UNITS.forEach((id) => {
    const unit = data.UNIT_DEFS[id];
    assert.equal(unit.id, id);
    assert.equal(unit.shop, true);
    assert.equal(unit.cost, unit.tier);
    assert.ok(unit.traits.length >= 2 && unit.traits.length <= 4);
    unit.traits.forEach((trait) => assert.ok(data.TRAIT_IDS.includes(trait)));
  });
});
