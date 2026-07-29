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

test("三至十本的人口、升本成本与商店概率完整", () => {
  assert.deepEqual(
    data.PLAYER_LEVELS.map((level) => data.PLAYER_LEVEL_CONFIG[level].upgradeCost),
    [5, 9, 14, 20, 27, 36, 46, null],
  );
  assert.deepEqual(data.PLAYER_LEVELS.map(data.bookLevelForPlayerLevel), [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(
    data.PLAYER_LEVELS.map((level) => data.PLAYER_LEVEL_CONFIG[level].boardCap),
    [3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.deepEqual(
    data.PLAYER_LEVELS.map((level) => data.PLAYER_LEVEL_CONFIG[level].tierOdds),
    [
      [75, 25, 0, 0, 0],
      [50, 38, 11, 1, 0],
      [35, 35, 24, 5, 1],
      [25, 30, 30, 13, 2],
      [15, 25, 32, 23, 5],
      [10, 20, 30, 30, 10],
      [7, 15, 25, 35, 18],
      [5, 10, 20, 40, 25],
    ],
  );
  data.PLAYER_LEVELS.forEach((level) =>
    assert.equal(data.PLAYER_LEVEL_CONFIG[level].tierOdds.reduce((sum, chance) => sum + chance, 0), 100),
  );
  assert.ok(data.PLAYER_LEVEL_CONFIG[10].tierOdds[0] > 0, "满级商店仍应能搜到一费棋");
  assert.ok(
    data.PLAYER_LEVEL_CONFIG[10].tierOdds[3] + data.PLAYER_LEVEL_CONFIG[10].tierOdds[4] <= 65,
    "满级四费与五费总概率不应重新膨胀",
  );
});

test("十六战主线每四战预警精英并以首领收束", () => {
  assert.equal(data.CAMPAIGN_ROUNDS, 16);
  [4, 8, 12].forEach((round) => {
    const wave = data.waveForRound(round);
    assert.equal(wave.tag, "elite");
    assert.match(wave.description, /精英预警/);
  });
  const boss = data.waveForRound(16);
  assert.equal(boss.tag, "boss");
  assert.equal(boss.units[0].id, "rift_tyrant");
  assert.match(boss.description, /首领预警/);
});

test("前两战只使用低费教学棋子，轴伊不会提前出现在固定关", () => {
  data.WAVES.slice(0, 2).forEach((wave) => {
    wave.units.forEach(({ id }) => {
      assert.ok(
        data.UNIT_DEFS[id].cost <= 2,
        `round ${wave.round} should not use ${data.UNIT_DEFS[id].cost}-cost ${id}`,
      );
    });
  });
  const secondWave = data.waveForRound(2);
  assert.deepEqual(secondWave.units.map(({ id }) => id), ["mossback", "gale_archer", "rift_stalker"]);
  assert.equal(data.enemyBudgetForRound(2), 5);
  assert.ok(data.enemyTraitActivations(secondWave.units).some(({ id }) => id === "wild"));
});

test("固定关逐关锁定原始费用、最高单卡费用与有效预算", () => {
  assert.deepEqual(
    data.WAVES.map((wave) => data.waveCompositionValue(wave)),
    [3, 3, 12, 9, 9, 12, 16, 10],
  );
  assert.deepEqual(
    data.WAVES.map((wave) =>
      Math.max(...wave.units.map(({ id }) => data.UNIT_DEFS[id].cost)),
    ),
    [2, 1, 5, 3, 4, 5, 5, 5],
  );
  assert.deepEqual(
    data.WAVES.flatMap((wave) =>
      wave.units
        .filter(({ id }) => data.UNIT_DEFS[id].cost === 5)
        .map(({ id }) => `${wave.round}:${id}`),
    ),
    [
      "3:cinder_ram",
      "6:cinder_ram",
      "7:grove_mender",
      "8:rift_tyrant",
    ],
  );
  assert.deepEqual(
    data.WAVES[4].units.map(({ id }) => id),
    ["mossback", "mossback", "biscuit_sui", "rift_brawler", "ember_blade"],
  );
  assert.match(data.WAVES[4].description, /饼干岁.*治疗.*护盾/);
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => data.enemyBudgetForRound(index + 1)),
    [2, 5, 9, 18, 16, 17, 21, 32],
  );
});

test("主线普通关保留储蓄空间，精英关与首领集中检查战力", () => {
  assert.deepEqual(
    [9, 10, 11, 12, 13, 14, 15, 16, 17].map((round) =>
      data.enemyBudgetForRound(round),
    ),
    [17, 22, 26, 81, 38, 45, 53, 125, 135],
  );
  [4, 8, 12, 16].forEach((round) => {
    assert.ok(data.enemyBudgetForRound(round) > data.enemyBudgetForRound(round - 1) * 1.4);
  });
  [9, 13].forEach((round) => {
    assert.ok(data.enemyBudgetForRound(round) < data.enemyBudgetForRound(round - 1));
  });
  assert.ok(data.enemyBudgetForRound(17) > data.enemyBudgetForRound(16));
});

test("普通无限与地狱无限按完整回合收入递推敌军总价值", () => {
  const normal = data.waveForRound(17);
  const elite = data.waveForRound(19);
  const boss = data.waveForRound(21);
  const threshold = data.waveForRound(31);
  const hell = data.waveForRound(32);
  assert.equal(data.progressionModeForRound(16), "campaign");
  assert.equal(data.progressionModeForRound(17), "endless");
  assert.equal(data.progressionModeForRound(31), "endless");
  assert.equal(data.progressionModeForRound(32), "hell");
  assert.equal(normal.units.length, 10);
  assert.equal(normal.description, "敌人会持续变强，请继续强化阵容。");
  assert.equal(elite.description, data.ELITE_WARNING_TEXT);
  assert.equal(boss.description, data.BOSS_WARNING_TEXT);
  assert.equal(hell.description, "地狱无限：敌人会越来越强，请不断强化阵容。");
  [normal, elite, boss, hell].forEach((wave) => {
    assert.doesNotMatch(wave.description, /利息|连胜|赏金|复投|总价值/);
  });

  const normalIncome = data.projectedIncomeAfterRound(17);
  assert.deepEqual(
    { interest: normalIncome.interest, streak: normalIncome.streak, finance: normalIncome.finance },
    { interest: 5, streak: 2, finance: 0 },
  );
  assert.equal(
    data.enemyBudgetForRound(18) - data.enemyBudgetForRound(17),
    normalIncome.total,
  );

  const thresholdIncome = data.projectedIncomeAfterRound(31);
  assert.deepEqual(thresholdIncome, {
    interest: 20,
    streak: 2,
    finance: 2,
    bounty: 39,
    total: 63,
  });
  assert.equal(
    data.enemyBudgetForRound(32) - data.enemyBudgetForRound(31),
    thresholdIncome.total,
  );
  assert.ok(data.enemyBudgetForRound(40) > data.enemyBudgetForRound(32));
  assert.ok(threshold.modifier > 1);
  assert.ok(hell.modifier > 1);
});

test("无限后段提前突破十人并以可见人口持续加压", () => {
  assert.deepEqual(
    [17, 21, 22, 26, 29, 32, 40].map((round) => data.waveForRound(round).units.length),
    [10, 10, 11, 12, 13, 14, 18],
  );
  assert.ok(data.waveForRound(60).units.length > data.waveForRound(40).units.length);
});

test("无限首领轮换时停、续航与高费压制主题编队", () => {
  const control = data.waveForRound(21, 4);
  const sustain = data.waveForRound(26, 4);
  const highCost = data.waveForRound(31, 4);

  assert.match(control.name, /^时停合唱团/);
  assert.equal(control.units.filter(({ id }) => id === "spark_mage").length, 2);
  assert.match(sustain.name, /^终场续航团/);
  assert.ok(sustain.units.filter(({ id }) => id === "cinder_ram").length >= 4);
  assert.match(highCost.name, /^高费压制团/);
  assert.ok(highCost.units.filter(({ id }) => id === "lian").length >= 3);
  [control, sustain, highCost].forEach((wave) => {
    assert.equal(wave.units[0].id, "rift_tyrant");
    assert.ok(data.enemyTraitActivations(wave.units).length > 0);
  });
});

test("敌方阵容始终组成羁绊，特殊角色偶尔出现但不进入商店", async () => {
  for (let round = 1; round <= 40; round += 1) {
    const wave = data.waveForRound(round, 3);
    assert.ok(data.enemyTraitActivations(wave.units).length > 0, `round ${round} should activate an enemy trait`);
  }

  const seenGuests = new Set();
  for (let seed = 0; seed < 20; seed += 1) {
    for (let round = 9; round <= 32; round += 1) {
      data.waveForRound(round, seed).units.forEach(({ id }) => {
        if (data.ENEMY_GUEST_IDS.includes(id)) seenGuests.add(id);
      });
    }
  }
  assert.deepEqual([...seenGuests].sort(), [...data.ENEMY_GUEST_IDS].sort());
  data.ENEMY_GUEST_IDS.forEach((id) => {
    assert.equal(data.SHOP_UNITS.includes(id), false);
    assert.doesNotMatch(
      `${data.UNIT_DEFS[id].title} ${data.UNIT_DEFS[id].abilityDescription}`,
      /毕业嘉宾|毕业返场|仅敌方可用/,
    );
  });

  await Promise.all(data.ENEMY_GUEST_IDS.map((id) =>
    access(path.resolve("public", data.UNIT_DEFS[id].portrait.slice(1))),
  ));
});

test("浣熊店员使用原创展示文案与独立精灵头像", async () => {
  const unit = data.UNIT_DEFS.gale_archer;
  assert.equal(unit.name, "浣熊店员");
  assert.equal(unit.title, "浣熊店员 · 前排照料");
  assert.equal(unit.glyph, "浣");
  assert.equal(unit.abilityName, "端茶倒水");
  assert.deepEqual(unit.traits, ["wild", "mature", "gen27"]);
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

test("轴轴的宝使用围巾格裙 Q 版精灵头像", async () => {
  const unit = data.UNIT_DEFS.cog_scribe;
  assert.equal(unit.name, "轴轴的宝");
  assert.equal(unit.title, "轴伊Joi · 后排治疗");
  assert.equal(unit.tier, 4);
  assert.equal(unit.cost, 4);
  assert.equal(unit.hp, 238);
  assert.equal(unit.attack, 32);
  assert.equal(unit.armor, 16);
  assert.equal(unit.abilityName, "扔橘子");
  assert.match(unit.abilityDescription, /5 个橘子/);
  assert.match(unit.abilityDescription, /逐次减弱/);
  assert.equal(unit.portraitStyle, "sprite");
  assert.equal(unit.portrait, "/images/autochess/portraits/cog-scribe.png");
  assert.equal(unit.portraitFocus, undefined);
  const assetPath = path.resolve("public", unit.portrait.slice(1));
  await access(assetPath);
  const portrait = inspectPng(await readFile(assetPath));
  assert.equal(portrait.width, portrait.height);
  assert.equal(portrait.width, 512);
  assert.equal(portrait.hasTransparentPixel, true);
});

test("莉蔻使用独立精灵头像并加入矮人联盟", async () => {
  const unit = data.UNIT_DEFS.ember_blade;
  assert.equal(unit.name, "兔子射手");
  assert.equal(unit.title, "莉蔻Liko · 远程连射");
  assert.equal(unit.glyph, "蔻");
  assert.equal(unit.abilityName, "近视射击");
  assert.match(unit.abilityDescription, /胡萝卜弹幕/);
  assert.match(unit.abilityDescription, /随机偏移/);
  assert.equal(unit.range, 230);
  assert.ok(unit.traits.includes("dwarf"));
  assert.equal(unit.traits.includes("ember"), false);
  assert.equal(data.UNIT_DEFS.nori.name, "能能弄你");
  assert.equal(data.UNIT_DEFS.nori.abilityName, "苹果派");
  assert.equal(data.UNIT_DEFS.nori.attackInterval, 1.02);
  assert.match(data.UNIT_DEFS.nori.abilityDescription, /8 枚.*子弹/);
  assert.equal(unit.portraitStyle, "sprite");
  assert.equal(unit.portrait, "/images/autochess/portraits/ember-blade.png");
  assert.equal(unit.portraitFocus, undefined);
  const assetPath = path.resolve("public", unit.portrait.slice(1));
  await access(assetPath);
  const portrait = inspectPng(await readFile(assetPath));
  assert.equal(portrait.width, portrait.height);
  assert.equal(portrait.width, 512);
  assert.equal(portrait.hasTransparentPixel, true);
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
  assert.equal(data.TRAITS.aegis, undefined);
  assert.equal(data.TRAIT_IDS.includes("aegis"), false);
  assert.equal(data.AUGMENTS.find((augment) => augment.id === "triage")?.name, "全员续航");
});

test("岁己形态拆分到不同关系构筑", () => {
  const forms = ["sui", "sui_blue", "sui_bird", "sui_flower", "sui_cat", "biscuit_sui"];
  assert.equal(data.TRAITS.sui_forms, undefined);
  assert.deepEqual(
    forms.map((id) => data.UNIT_DEFS[id].tier),
    [1, 2, 3, 3, 4, 4],
  );
  forms.forEach((id) => {
    assert.ok(data.SHOP_UNITS.includes(id));
    assert.ok(data.UNIT_DEFS[id].portrait);
  });
  assert.equal(data.UNIT_DEFS.sui.name, "小红帽");
  assert.deepEqual(data.UNIT_DEFS.sui.traits, ["dance", "aggression", "vanguard"]);
  assert.equal(data.UNIT_DEFS.sui_blue.name, "贪吃岁");
  assert.deepEqual(data.UNIT_DEFS.sui_blue.traits, ["skeleton_soldier", "gluttony", "finance", "traffic"]);
  assert.equal(data.UNIT_DEFS.sui_blue.abilityName, "吃！");
  assert.equal(data.UNIT_DEFS.sui_blue.energyProfile.id, "feast");
  assert.deepEqual(data.UNIT_DEFS.sui_bird.traits, ["mystic", "wild", "vanguard"]);
  assert.equal(data.UNIT_DEFS.sui_bird.attackType, "melee");
  assert.equal(data.UNIT_DEFS.sui_bird.abilityCastTiming, "engage");
  assert.equal(data.UNIT_DEFS.sui_bird.abilityName, "连续肘击");
  assert.match(data.UNIT_DEFS.sui_bird.abilityDescription, /连续发动 3 次.*击退.*短暂眩晕/);
  assert.equal(data.UNIT_DEFS.sui_flower.name, "暴龙岁");
  assert.deepEqual(data.UNIT_DEFS.sui_flower.traits, ["vanguard", "chuanmei", "mystic", "finance"]);
  assert.deepEqual(data.UNIT_DEFS.sui_cat.traits, ["assassin", "aggression", "dance", "vanguard"]);
  assert.deepEqual(data.UNIT_DEFS.biscuit_sui.traits, ["wild", "gluttony", "finance"]);
  assert.equal(data.UNIT_DEFS.sui_bird.name, "小岁鸟");
  assert.equal(data.UNIT_DEFS.shiori.name, "椰子栞");
  assert.equal(data.UNIT_DEFS.shiori.tier, 3);
  assert.equal(data.UNIT_DEFS.shiori.cost, 3);
  assert.equal(data.UNIT_DEFS.shiori.attackType, "melee");
  assert.equal(data.UNIT_DEFS.shiori.abilityCastTiming, "engage");
  assert.equal(data.UNIT_DEFS.shiori.abilityName, "海獭冲击");
  assert.match(data.UNIT_DEFS.shiori.abilityDescription, /最远.*范围伤害.*眩晕.*护盾/);
  assert.equal(data.UNIT_DEFS.zeyin.attackType, "melee");
  assert.equal(data.UNIT_DEFS.zeyin.abilityName, "涅槃重生");
  assert.equal(data.UNIT_DEFS.zeyin.abilityCastTiming, "passive");
  assert.equal(data.UNIT_DEFS.grove_mender.abilityName, "凿凿冲击");
  assert.equal(data.UNIT_DEFS.grove_mender.attackType, "melee");
  assert.equal(data.UNIT_DEFS.grove_mender.abilityCastTiming, "engage");
  assert.match(data.UNIT_DEFS.grove_mender.abilityDescription, /最远.*护甲.*嘲讽.*⛏️.*眩晕/);
  assert.equal(data.UNIT_DEFS.tiandou.abilityName, "棒棒糖刘海");
  assert.match(data.UNIT_DEFS.tiandou.abilityDescription, /友军.*回复生命.*敌人.*减速/);
  assert.equal(data.UNIT_DEFS.mitsuri.abilityName, "站我后面");
  assert.match(data.UNIT_DEFS.mitsuri.abilityDescription, /护盾.*嘲讽/);
  assert.equal(data.UNIT_DEFS.mitsuri.attackType, "melee");
  assert.ok(data.UNIT_DEFS.mitsuri.range <= 60);
  assert.equal(data.UNIT_DEFS.lovely.abilityCastTiming, "offenseInRange");
  assert.match(data.UNIT_DEFS.lovely.abilityDescription, /需要接近敌人才能发动/);
});

test("战斗身份数据完整且覆盖不同能量与站位节奏", () => {
  const profiles = new Set(["assault", "bulwark", "steady_guard", "flow", "tempo", "alien", "reservoir", "automatic", "feast", "passive"]);
  Object.values(data.UNIT_DEFS).forEach((unit) => {
    assert.ok(["melee", "ranged"].includes(unit.attackType), `${unit.id} must declare an attack type`);
    assert.ok(profiles.has(unit.energyProfile.id), `${unit.id} must use a known energy profile`);
    assert.ok(unit.energyProfile.max > 0);
    ["start", "perSecond", "onAttack", "onHit", "castRefund"].forEach((field) => assert.ok(unit.energyProfile[field] >= 0));
    assert.ok(Number.isFinite(unit.abilityRange) && unit.abilityRange >= 0 && unit.abilityRange <= 520);
  });
  const repeatableSustainUnits = [
    "sun_guard",
    "rift_stalker",
    "mossback",
    "gale_archer",
    "seki_boar_king",
    "mitsuri",
    "guangyi",
    "nagisa",
    "biscuit_sui",
    "mumu",
    "rutice",
  ];
  repeatableSustainUnits.forEach((id) => {
    assert.ok(
      data.UNIT_DEFS[id].energyProfile.onHit <= 4,
      `${id} must not use high on-hit recovery for repeatable sustain`,
    );
  });
  ["mossback", "nagisa", "seki_boar_king", "mumu"].forEach((id) => {
    assert.deepEqual(data.UNIT_DEFS[id].energyProfile, data.ENERGY_PROFILES.steady_guard);
  });
  assert.deepEqual(data.UNIT_DEFS.gale_archer.energyProfile, data.ENERGY_PROFILES.steady_guard);
  assert.match(data.UNIT_DEFS.gale_archer.abilityDescription, /持续自动充能.*攻击与受击也会少量回复能量.*回复生命/);
  assert.deepEqual(data.UNIT_DEFS.sun_guard.energyProfile, data.ENERGY_PROFILES.steady_guard);
  assert.equal(data.UNIT_DEFS.sun_guard.energyProfile.start, 25);
  assert.equal(data.UNIT_DEFS.sun_guard.energyProfile.perSecond, 8);
  assert.equal(data.UNIT_DEFS.sun_guard.energyProfile.onAttack, 6);
  assert.equal(data.UNIT_DEFS.sun_guard.energyProfile.onHit, 3);
  assert.match(data.UNIT_DEFS.sun_guard.abilityDescription, /持续自动充能.*攻击与受击也会回复能量.*30% 最大生命护盾/);
  assert.match(data.UNIT_DEFS.mossback.abilityDescription, /持续自动充能.*攻击与受击也会少量回复能量.*回复自身生命.*两名友军提供护盾/);
  assert.match(data.describeEnergyRecovery(data.ENERGY_PROFILES.steady_guard), /初始 25\/100.*自动回能（12\.5 秒回满，每秒 \+8）.*攻击回能（每下 \+6）.*受击回能（每下 \+3）/);
  ["rift_stalker", "rift_brawler", "dawn_duelist", "guangyi", "sui_cat", "shiori", "youyi", "akirinco", "lovely", "nori"].forEach((id) => {
    const profile = data.UNIT_DEFS[id].energyProfile;
    assert.equal(profile.id, "automatic", `${id} should use automatic energy recovery`);
    assert.equal(profile.start, 20);
    assert.equal(profile.perSecond, 20);
    assert.equal(profile.onAttack, 0);
  });
  assert.match(data.describeEnergyRecovery(data.ENERGY_PROFILES.automatic), /自动回能（5 秒回满，每秒 \+20）/);
  assert.deepEqual(data.UNIT_DEFS.biscuit_sui.energyProfile, data.WARM_SUPPORT_ENERGY_PROFILE);
  assert.equal(data.UNIT_DEFS.biscuit_sui.energyProfile.start, 36);
  assert.equal(data.UNIT_DEFS.biscuit_sui.energyProfile.max, 90);
  assert.equal(data.UNIT_DEFS.biscuit_sui.energyProfile.perSecond, 18);
  assert.equal(data.UNIT_DEFS.biscuit_sui.energyProfile.castRefund, 10);
  assert.equal(data.UNIT_DEFS.cog_scribe.energyProfile.id, "flow");
  assert.equal(data.UNIT_DEFS.clock_gunner.energyProfile.id, "tempo");
  assert.equal(data.UNIT_DEFS.yua.energyProfile.id, "alien");
  assert.deepEqual(data.UNIT_DEFS.yua.energyProfile, data.ENERGY_PROFILES.alien);
  assert.equal(data.UNIT_DEFS.yua.energyProfile.max, 75);
  assert.equal(data.UNIT_DEFS.yua.energyProfile.start, 10);
  assert.equal(data.UNIT_DEFS.yua.energyProfile.perSecond, 5);
  assert.equal(data.UNIT_DEFS.yua.energyProfile.onAttack, 18);
  assert.equal(data.UNIT_DEFS.clock_gunner.traits.includes("ranger"), false);
  assert.equal(data.UNIT_DEFS.clock_gunner.traits.includes("yue_gang"), true);
  assert.equal(data.UNIT_DEFS.clock_gunner.abilityName, "机械兔耳浮游炮");
  assert.match(data.UNIT_DEFS.clock_gunner.abilityDescription, /两只机械兔耳/);
  assert.match(data.UNIT_DEFS.clock_gunner.abilityDescription, /4 秒/);
  assert.equal(data.UNIT_DEFS.clock_gunner.attackInterval, 0.84);
  assert.equal(data.UNIT_DEFS.clock_gunner.energyProfile.onAttack, 15);
  assert.deepEqual(data.UNIT_DEFS.yua.traits, ["gluttony", "dance", "ranger"]);
  assert.equal(data.UNIT_DEFS.yua.abilityName, "外星贯穿光线");
  assert.match(data.UNIT_DEFS.yua.abilityDescription, /横排/);
  assert.equal(data.UNIT_DEFS.rift_tyrant.energyProfile.id, "reservoir");
  assert.equal(data.UNIT_DEFS.clock_gunner.attackType, "ranged");
  assert.equal(data.UNIT_DEFS.rift_tyrant.attackType, "melee");
  assert.ok(data.UNIT_DEFS.clock_gunner.range >= 260);
  assert.equal(data.UNIT_DEFS.gale_archer.range, 60);
  assert.equal(data.UNIT_DEFS.meme.range, 60);
  assert.equal(data.UNIT_DEFS.meme.tier, 3);
  assert.equal(data.UNIT_DEFS.meme.cost, 3);
  assert.ok(data.UNIT_DEFS.nagisa.moveSpeed <= 40);
  assert.deepEqual(data.UNIT_DEFS.nagisa.traits, ["chuanmei", "assassin", "mystic"]);
  assert.ok(data.UNIT_DEFS.sui_cat.moveSpeed >= 100);
  assert.equal(data.UNIT_DEFS.sui_cat.abilityName, "猫拳三连");
  assert.match(data.UNIT_DEFS.sui_cat.abilityDescription, /闪现到最远敌人身后/);
  assert.match(data.UNIT_DEFS.sui_cat.abilityDescription, /击晕/);
  assert.equal(data.UNIT_DEFS.rutice.abilityName, "咕咕诊所");
  assert.match(data.UNIT_DEFS.rutice.abilityDescription, /施法距离内友军回复生命/);
  assert.match(data.UNIT_DEFS.rutice.abilityDescription, /生命比例最低的两名友军.*护盾/);
  assert.ok(data.UNIT_DEFS.rutice.traits.includes("mystic"));
  assert.ok(data.UNIT_DEFS.sui_cat.hp >= 250);
  assert.ok(data.UNIT_DEFS.sui_cat.armor >= 18);
});

test("北欧魔法师升为三费并提供能量驱动的三档时停", () => {
  const unit = data.UNIT_DEFS.spark_mage;
  assert.equal(unit.tier, 3);
  assert.equal(unit.cost, 3);
  assert.equal(unit.hp, 165);
  assert.equal(unit.attack, 25);
  assert.equal(unit.armor, 8);
  assert.match(unit.abilityDescription, /能量从满降至 0/);
  assert.match(unit.abilityDescription, /无法回复/);
  assert.equal(unit.abilityLevels.length, 3);
  assert.deepEqual(
    unit.abilityLevels.map((level) => level.stats.radius),
    [108, 132, 162],
  );
  assert.deepEqual(
    unit.abilityLevels.map((level) => level.stats.duration),
    [1.8, 2.5, 3.4],
  );
  assert.equal(data.abilityStatForStar(unit, 2, "radius", 0), 132);
  assert.match(data.abilityDescriptionForStar(unit, 3), /半径 162/);
  assert.match(data.abilityDescriptionForStar(unit, 3), /能量耗尽时结束/);
  assert.match(data.describeAbilityStarGrowth(unit), /1星.*2星.*3星/);
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(
      (tier) => data.SHOP_UNITS.filter((id) => data.UNIT_DEFS[id].tier === tier).length,
    ),
    [7, 8, 12, 9, 5],
  );
  assert.equal(data.abilityDescriptionForStar(data.UNIT_DEFS.gale_archer, 3), data.UNIT_DEFS.gale_archer.abilityDescription);
});

test("好笑姐姐使用近距离跳跃技能，不再描述为无过程闪现", () => {
  const michiya = data.UNIT_DEFS.rift_stalker;
  assert.equal(michiya.abilityRange, 240);
  assert.equal(michiya.abilityCastTiming, "engage");
  assert.match(michiya.abilityDescription, /跳向施法距离内/);
  assert.doesNotMatch(michiya.abilityDescription, /闪到/);
});

test("雪烛以高初始能量主动提供固定值加生命比例的四秒技能盾", async () => {
  const yukisyo = data.UNIT_DEFS.yukisyo;
  assert.ok(data.SHOP_UNITS.includes("yukisyo"));
  assert.equal(yukisyo.tier, 3);
  assert.equal(yukisyo.cost, 3);
  assert.deepEqual(yukisyo.traits, ["mystic", "wild", "finance"]);
  assert.equal(yukisyo.abilityCastTiming, "supportShield");
  assert.equal(yukisyo.energyProfile.start, 78);
  assert.equal(yukisyo.energyProfile.max, 100);
  assert.ok(yukisyo.energyProfile.start < yukisyo.energyProfile.max);
  assert.deepEqual(
    yukisyo.abilityLevels.map((level) => [
      level.stats.shieldFlat,
      level.stats.shieldHpRatio,
      level.stats.duration,
    ]),
    [[70, 0.26, 4], [120, 0.36, 4], [200, 0.5, 4]],
  );
  assert.match(yukisyo.abilityDescription, /发动技能时/);
  assert.doesNotMatch(yukisyo.abilityDescription, /战斗开始时/);
  assert.match(yukisyo.abilityDescription, /固定值与目标最大生命值/);
  assert.match(yukisyo.abilityDescription, /只吸收技能/);
  assert.equal(yukisyo.portrait, "/images/livers/yukisyo.png");
  await access(path.resolve("public", yukisyo.portrait.slice(1)));
});

test("沐霂改为后排单体救援且不再造成范围伤害或群盾", () => {
  const mumu = data.UNIT_DEFS.mumu;
  assert.equal(mumu.attackType, "ranged");
  assert.equal(mumu.range, 190);
  assert.equal(mumu.abilityCastTiming, "supportRescue");
  assert.equal(mumu.abilityName, "领舞救场");
  assert.match(mumu.abilityDescription, /最危险的一人/);
  assert.match(mumu.abilityDescription, /拉到自己身后/);
  assert.match(mumu.abilityDescription, /时停只能通过被拉出范围解除/);
  assert.doesNotMatch(mumu.abilityDescription, /造成范围伤害/);
});

test("关系羁绊覆盖收敛后的主播组合且商店定义完整", () => {
  assert.equal(new Set(data.SHOP_UNITS).size, data.SHOP_UNITS.length);
  assert.ok(data.SHOP_UNITS.includes("mitsuri"));
  assert.equal(data.SHOP_UNITS.length, 41);
  ["nori", "meme", "kioi", "nightin", "guangyi", "lovely", "rei", "rutice"].forEach((id) => assert.ok(data.SHOP_UNITS.includes(id)));
  assert.equal(data.SHOP_UNITS.includes("akirinco"), false);
  ["aza", "ayana", "yy", "haruka"].forEach((id) => {
    assert.equal(data.SHOP_UNITS.includes(id), false);
    assert.equal(data.UNIT_DEFS[id], undefined);
  });
  ["chuanmei", "gluttony", "skeleton_soldier", "gen27", "yue_gang", "host", "dwarf", "traffic", "mature", "dance", "aggression"].forEach((id) => {
    assert.equal(data.TRAITS[id].family, "关系");
    assert.equal(data.TRAITS[id].thresholds.length, data.TRAITS[id].bonuses.length);
  });
  assert.equal(data.TRAITS.timid, undefined);
  assert.equal(data.TRAIT_IDS.includes("timid"), false);
  assert.equal(data.TRAITS.vanguard.name, "怕死");
  ["sui_cat", "sui", "sui_bird", "nori", "youyi"].forEach((id) => {
    assert.ok(data.UNIT_DEFS[id].traits.includes("vanguard"));
  });
  assert.equal(data.UNIT_DEFS.tiandou.traits.includes("vanguard"), false);
  assert.equal(data.UNIT_DEFS.tiandou.traits.includes("mystic"), false);
  assert.equal(data.UNIT_DEFS.lovely.traits.includes("vanguard"), false);
  assert.equal(data.TRAITS.rift, undefined);
  assert.equal(data.TRAITS.clockwork, undefined);
  assert.equal(data.TRAITS.brawler, undefined);
  assert.equal(data.TRAITS.host.name, "主持");
  assert.deepEqual(
    Object.values(data.UNIT_DEFS)
      .filter((unit) => unit.traits.includes("host"))
      .map((unit) => unit.id)
      .sort(),
    ["cog_scribe", "guangyi", "lovely", "miki_guest", "mumu", "pako", "spark_mage"],
  );
  assert.deepEqual(data.UNIT_DEFS.mumu.traits, ["host", "dance"]);
  assert.equal(data.UNIT_DEFS.mumu.traits.includes("vanguard"), false);
  assert.equal(data.TRAITS.dwarf.name, "矮人");
  assert.equal(data.TRAITS.skeleton_soldier.name, "骷髅兵");
  assert.match(data.TRAITS.skeleton_soldier.bonuses[0], /攻击力/);
  ["sui_flower", "cinder_ram", "lian"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("chuanmei")));
  ["grove_mender", "sui_blue"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("gluttony")));
  assert.equal(data.UNIT_DEFS.grove_mender.tier, 5);
  assert.equal(data.UNIT_DEFS.grove_mender.cost, 5);
  assert.equal(data.UNIT_DEFS.grove_mender.traits.includes("ember"), true);
  assert.equal(data.UNIT_DEFS.biscuit_sui.traits.includes("gluttony"), true);
  assert.equal(data.UNIT_DEFS.sui.traits.includes("gluttony"), false);
  assert.equal(data.UNIT_DEFS.sui_cat.traits.includes("gluttony"), false);
  assert.equal(data.TRAITS.assassin.name, "偷袭");
  assert.match(data.TRAITS.assassin.description, /集中跃向敌方最后排中最虚弱的目标/);
  assert.equal(data.UNIT_DEFS.dawn_duelist.traits.includes("assassin"), false);
  assert.ok(data.UNIT_DEFS.lovely.traits.includes("assassin"));
  assert.equal(data.UNIT_DEFS.biscuit_sui.tier, 4);
  assert.equal(data.UNIT_DEFS.biscuit_sui.cost, 4);
  assert.equal(data.UNIT_DEFS.biscuit_sui.abilityRange, 360);
  assert.equal(data.UNIT_DEFS.biscuit_sui.abilityCastTiming, "supportHeal");
  assert.equal(data.UNIT_DEFS.biscuit_sui.abilityName, "暖男回复");
  assert.match(data.UNIT_DEFS.biscuit_sui.abilityDescription, /最虚弱的友军.*治疗.*护盾.*击退/);
  assert.doesNotMatch(data.TRAITS.gluttony.description, /只影响外观|不改变碰撞体积/);
  assert.match(data.TRAITS.gluttony.description, /击杀.*碰撞体积.*攻击力/);
  assert.deepEqual(
    data.UNIT_DEFS.rei.abilityLevels.map((level) => level.stats.reviveCount),
    [2, 3, 5],
  );
  assert.deepEqual(data.UNIT_DEFS.rei.energyProfile, data.REI_SLOW_ENERGY_PROFILE);
  assert.equal(data.UNIT_DEFS.rei.energyProfile.start, 25);
  assert.equal(data.UNIT_DEFS.rei.energyProfile.max, 100);
  assert.equal(data.UNIT_DEFS.rei.energyProfile.perSecond, 5);
  assert.equal(data.UNIT_DEFS.rei.energyProfile.onAttack, 0);
  assert.equal(data.UNIT_DEFS.rei.energyProfile.onHit, 0);
  assert.equal(data.UNIT_DEFS.rei.energyProfile.castRefund, 0);
  assert.match(data.UNIT_DEFS.rei.abilityDescription, /开场拥有 25 点能量.*仅随时间缓慢回复.*攻击与受击均不回能.*2\/3\/5 具.*四分之一血幽灵/);
  ["cinder_ram", "nagisa", "rutice", "lian", "hatsuse_guest", "rift_tyrant"].forEach((id) => {
    assert.match(data.UNIT_DEFS[id].abilityDescription, /施法距离内/);
    assert.doesNotMatch(data.UNIT_DEFS[id].abilityDescription, /全队|全体友军|全场/);
  });
  assert.deepEqual(data.UNIT_DEFS.nightin.traits, ["mystic", "dwarf"]);
  assert.match(data.TRAITS.mature.bonuses[0], /每 4 秒降低 1 个百分点/);
  assert.match(data.TRAITS.mature.bonuses[0], /正常移速的 70%/);
  const danceStarter = data.STARTERS.find((starter) => starter.id === "dance_start");
  assert.equal(danceStarter?.name, "舞台梦");
  assert.equal(danceStarter?.unit, "sui");
  assert.match(danceStarter?.description || "", /携带小红帽开局；初始金币 \+1.*所有友军开战 \+10 能量.*跳舞成员攻击速度 \+8%/);
  assert.equal(data.UNIT_DEFS.cinder_ram.name, "蛙梓");
  assert.equal(data.UNIT_DEFS.cinder_ram.tier, 5);
  assert.equal(data.UNIT_DEFS.kioi.name, "美·鱿鱼");
  assert.equal(data.UNIT_DEFS.kioi.abilityName, "讨厌你");
  assert.equal(data.UNIT_DEFS.meme.name, "毛神");
  assert.equal(data.UNIT_DEFS.xuehui.name, "雪绘");
  assert.equal(data.UNIT_DEFS.xuehui.tier, 4);
  assert.equal(data.UNIT_DEFS.xuehui.cost, 4);
  assert.equal(data.UNIT_DEFS.xuehui.attackType, "melee");
  assert.deepEqual(data.UNIT_DEFS.xuehui.traits, ["dwarf", "ember", "aggression", "traffic"]);
  assert.deepEqual(data.TRAITS.aggression.thresholds, [2, 4, 6]);
  assert.match(data.TRAITS.aggression.bonuses[2], /成员 \+55% 攻击力；全体友军 \+20% 攻击力/);
  ["xuehui", "cinder_ram", "meme", "sui", "sui_cat"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("aggression")));
  assert.equal(data.UNIT_DEFS.nightin.name, "南町");
  assert.equal(data.UNIT_DEFS.lovely.name, "狍子偶像");
  ["sui_blue", "shiori"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("skeleton_soldier")));
  ["rift_brawler", "mitsuri", "clock_gunner"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("yue_gang")));
  ["sun_guard", "rift_brawler", "clock_gunner"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("gen27")));
  assert.deepEqual(data.UNIT_DEFS.rift_brawler.traits, ["gen27", "yue_gang"]);
  assert.deepEqual(data.UNIT_DEFS.rift_stalker.traits, ["assassin", "mystic"]);
  ["dawn_duelist", "ember_blade", "nightin"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("dwarf")));
  ["sun_guard", "dawn_duelist"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("traffic")));
  assert.equal(data.UNIT_DEFS.dawn_duelist.abilityName, "迎客松");
  assert.match(data.UNIT_DEFS.dawn_duelist.abilityDescription, /松树/);
  assert.equal(data.STARTERS.find((starter) => starter.id === "traffic_start")?.name, "热点追踪");
  ["gale_archer", "clock_gunner", "cinder_ram", "zeyin"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("mature")));
  ["sui", "zeyin", "tiandou", "youyi", "mumu", "lian"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("dance")));
  assert.equal(data.UNIT_DEFS.guangyi.abilityName, "滑跪");
  assert.deepEqual(data.UNIT_DEFS.guangyi.traits, ["host", "gluttony", "mature"]);
  data.WAVES.forEach((wave) => wave.units.forEach(({ id }) => assert.ok(data.UNIT_DEFS[id], `${id} should remain defined for wave ${wave.round}`)));
  data.SHOP_UNITS.forEach((id) => {
    const unit = data.UNIT_DEFS[id];
    assert.equal(unit.id, id);
    assert.equal(unit.shop, true);
    assert.equal(unit.cost, unit.tier);
    assert.ok(unit.traits.length >= 1 && unit.traits.length <= 4);
    unit.traits.forEach((trait) => assert.ok(data.TRAIT_IDS.includes(trait)));
  });
});

test("所有羁绊的最高档都能由可购买成员达到", () => {
  const memberCounts = Object.fromEntries(
    data.TRAIT_IDS.map((traitId) => [
      traitId,
      data.SHOP_UNITS.filter((unitId) => data.UNIT_DEFS[unitId].traits.includes(traitId)).length,
    ]),
  );

  data.TRAIT_IDS.forEach((traitId) => {
    const trait = data.TRAITS[traitId];
    assert.equal(trait.thresholds.length, trait.bonuses.length, `${traitId} thresholds and bonuses must align`);
    assert.ok(
      trait.thresholds.at(-1) <= memberCounts[traitId],
      `${traitId} highest threshold ${trait.thresholds.at(-1)} exceeds ${memberCounts[traitId]} purchasable members`,
    );
  });

  assert.deepEqual(
    Object.fromEntries(["ember", "assassin", "gen27", "mature"].map((traitId) => [traitId, memberCounts[traitId]])),
    { ember: 4, assassin: 5, gen27: 5, mature: 5 },
  );
  ["ember", "assassin", "gen27", "mature"].forEach((traitId) => {
    assert.deepEqual(data.TRAITS[traitId].thresholds, [2, 4]);
  });
});

test("星汐、塔神与礼墨使用已下载的公开头像并保留各自角色定位", async () => {
  assert.equal(data.TRAITS.star_tower_ink, undefined);
  assert.equal(data.TRAIT_IDS.includes("star_tower_ink"), false);
  const seki = data.UNIT_DEFS.seki_boar_king;
  const towerGod = data.UNIT_DEFS.tower_god;
  const sumi = data.UNIT_DEFS.sumi;
  const portraits = {
    seki_boar_king: "/images/livers/seki.webp",
    tower_god: "/images/livers/shengge.jpg",
    sumi: "/images/livers/sumi.jpg",
  };
  [seki, towerGod, sumi].forEach((unit) => {
    assert.ok(data.SHOP_UNITS.includes(unit.id));
    assert.equal(unit.cost, unit.tier);
    assert.equal(unit.portrait, portraits[unit.id]);
  });
  await Promise.all(Object.values(portraits).map((portrait) => access(path.resolve("public", portrait.slice(1)))));
  await access(path.resolve("public/images/livers/sumi-little-dragon.jpg"));
  assert.equal(seki.abilityName, "山猪冲阵");
  assert.match(seki.abilityDescription, /持续耗能.*提高移速.*无法普攻.*缓慢转向.*击退.*眩晕.*边缘.*反弹/);
  assert.equal(towerGod.abilityName, "尖塔压顶");
  assert.equal(sumi.abilityName, "空气龙");
  assert.match(sumi.abilityDescription, /隐身.*最低攻击优先级.*正常攻击.*移速.*能量耗尽.*礼小龙/);
  assert.equal(sumi.passiveName, "社恐");
  assert.match(sumi.passiveDescription, /后坐力.*推离目标/);
  assert.equal(sumi.abilityCastTiming, "selfBuff");
  assert.deepEqual(seki.traits, ["wild", "aggression", "skeleton_soldier"]);
  assert.deepEqual(towerGod.traits, ["mystic", "traffic"]);
  assert.deepEqual(sumi.traits, ["mystic", "ranger", "gluttony"]);
  assert.deepEqual(data.UNIT_DEFS.meme.traits, ["wild", "skeleton_soldier", "aggression", "traffic"]);
});

test("主动技能触发类别与技能形态一致", () => {
  const expectedTimings = {
    sun_guard: "selfOnHit",
    sui: "offenseReady",
    rift_brawler: "offenseInRange",
    meme: "offenseInRange",
    yua: "offenseReady",
    sumi: "selfBuff",
  };
  Object.entries(expectedTimings).forEach(([id, timing]) => {
    assert.equal(data.UNIT_DEFS[id].abilityCastTiming, timing, `${id} should use ${timing}`);
  });
  assert.deepEqual(
    data.SHOP_UNITS.filter((id) => data.UNIT_DEFS[id].abilityCastTiming === "selfOnHit"),
    ["sun_guard"],
    "只有明确的自保技能应使用受击触发",
  );
});

test("帕可使用公开头像、公开内容衍生技能与主持阵容羁绊", async () => {
  const pako = data.UNIT_DEFS.pako;
  assert.ok(data.SHOP_UNITS.includes("pako"));
  assert.equal(pako.name, "帕可Pako");
  assert.equal(pako.tier, 1);
  assert.equal(pako.cost, 1);
  assert.equal(pako.hp, 142);
  assert.equal(pako.attack, 18);
  assert.equal(pako.armor, 7);
  assert.deepEqual(pako.traits, ["host", "mystic"]);
  assert.equal(pako.traits.includes("traffic"), false);
  assert.equal(pako.abilityName, "天使摸鱼");
  assert.match(pako.abilityDescription, /受伤友军最密集/);
  assert.match(pako.abilityDescription, /落地治疗范围内友军/);
  assert.match(pako.abilityDescription, /持续 3\.2 秒/);
  assert.match(pako.abilityDescription, /帕可自身属性/);
  assert.equal(pako.abilityCastTiming, "supportHeal");
  assert.equal(pako.portrait, "/images/livers/pako.jpg");
  await access(path.resolve("public", pako.portrait.slice(1)));
});

test("理财与流量羁绊拥有完整的经济成员池", () => {
  assert.deepEqual(data.TRAITS.finance.thresholds, [2, 4]);
  assert.match(data.TRAITS.finance.bonuses[0], /额外获得 2 金币/);
  assert.match(data.TRAITS.finance.bonuses[1], /每 4 金币/);
  assert.match(data.TRAITS.finance.bonuses[1], /最多 20 利息/);
  ["sui_blue", "sui_flower", "biscuit_sui", "shiori", "grove_mender", "lian", "mitsuri"].forEach((id) => {
    assert.ok(data.UNIT_DEFS[id].traits.includes("finance"), `${id} should join finance`);
  });
  assert.equal(data.UNIT_DEFS.grove_mender.traits.includes("mystic"), false);
  ["sun_guard", "dawn_duelist", "sui_blue", "meme", "zeyin", "tiandou", "mitsuri", "xuehui", "tower_god"].forEach((id) => {
    assert.ok(data.UNIT_DEFS[id].traits.includes("traffic"), `${id} should join traffic`);
  });
  ["nori", "mumu", "rei"].forEach((id) => {
    assert.equal(data.UNIT_DEFS[id].traits.includes("traffic"), false, `${id} should leave traffic`);
  });
  assert.match(data.TRAITS.traffic.bonuses[0], /1 次免费刷新/);
  assert.match(data.TRAITS.traffic.bonuses[2], /3 次免费刷新/);
});

test("棋子图鉴按费用从低到高稳定排序并展示技能距离", async () => {
  const source = await readFile(
    new URL("../../src/components/autoChessGame/Codex.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /\.sort\(\(left, right\) => UNIT_DEFS\[left\]\.cost - UNIT_DEFS\[right\]\.cost\)/);
  assert.match(source, /技能距离.*unit\.abilityRange/);
});
