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
  assert.equal(unit.abilityName, "扔橘子");
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
    [1, 2, 3, 3, 4, 5],
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
  assert.equal(data.UNIT_DEFS.sui_flower.name, "暴龙岁");
  assert.deepEqual(data.UNIT_DEFS.sui_flower.traits, ["vanguard", "chuanmei", "mystic", "finance"]);
  assert.deepEqual(data.UNIT_DEFS.sui_cat.traits, ["assassin", "aggression", "dance", "vanguard"]);
  assert.deepEqual(data.UNIT_DEFS.biscuit_sui.traits, ["wild", "gluttony", "finance"]);
  assert.equal(data.UNIT_DEFS.sui_bird.name, "小岁鸟");
  assert.equal(data.UNIT_DEFS.shiori.name, "椰子栞");
  assert.equal(data.UNIT_DEFS.shiori.abilityName, "大声");
  assert.equal(data.UNIT_DEFS.zeyin.attackType, "melee");
  assert.equal(data.UNIT_DEFS.zeyin.abilityName, "涅槃重生");
  assert.equal(data.UNIT_DEFS.zeyin.abilityCastTiming, "passive");
  assert.equal(data.UNIT_DEFS.grove_mender.abilityName, "鲨鱼变身");
  assert.match(data.UNIT_DEFS.grove_mender.abilityDescription, /攻击力.*吸血/);
  assert.equal(data.UNIT_DEFS.tiandou.abilityName, "棒棒糖刘海");
  assert.match(data.UNIT_DEFS.tiandou.abilityDescription, /友军.*回复生命.*敌人.*减速/);
  assert.equal(data.UNIT_DEFS.mitsuri.abilityName, "站我后面");
  assert.match(data.UNIT_DEFS.mitsuri.abilityDescription, /护盾.*嘲讽/);
});

test("战斗身份数据完整且覆盖不同能量与站位节奏", () => {
  const profiles = new Set(["assault", "bulwark", "steady_guard", "flow", "tempo", "alien", "reservoir", "automatic", "feast", "passive"]);
  Object.values(data.UNIT_DEFS).forEach((unit) => {
    assert.ok(["melee", "ranged"].includes(unit.attackType), `${unit.id} must declare an attack type`);
    assert.ok(profiles.has(unit.energyProfile.id), `${unit.id} must use a known energy profile`);
    assert.ok(unit.energyProfile.max > 0);
    ["start", "perSecond", "onAttack", "onHit", "castRefund"].forEach((field) => assert.ok(unit.energyProfile[field] >= 0));
  });
  assert.equal(data.UNIT_DEFS.nagisa.energyProfile.id, "bulwark");
  assert.deepEqual(data.UNIT_DEFS.sun_guard.energyProfile, data.ENERGY_PROFILES.steady_guard);
  assert.equal(data.UNIT_DEFS.sun_guard.energyProfile.start, 25);
  assert.equal(data.UNIT_DEFS.sun_guard.energyProfile.perSecond, 5);
  assert.equal(data.UNIT_DEFS.sun_guard.energyProfile.onAttack, 0);
  assert.equal(data.UNIT_DEFS.sun_guard.energyProfile.onHit, 1);
  assert.match(data.UNIT_DEFS.sun_guard.abilityDescription, /主要随时间自动充能.*受击仅小幅加速.*30% 最大生命护盾/);
  assert.match(data.describeEnergyRecovery(data.ENERGY_PROFILES.steady_guard), /初始 25\/100.*自动回能（20 秒回满，每秒 \+5）.*受击回能（每下 \+1）/);
  ["rift_stalker", "rift_brawler", "dawn_duelist", "guangyi", "sui_cat", "biscuit_sui", "youyi", "akirinco", "lovely", "nori"].forEach((id) => {
    const profile = data.UNIT_DEFS[id].energyProfile;
    assert.equal(profile.id, "automatic", `${id} should use automatic energy recovery`);
    assert.equal(profile.start, 20);
    assert.equal(profile.perSecond, 20);
    assert.equal(profile.onAttack, 0);
  });
  assert.match(data.describeEnergyRecovery(data.ENERGY_PROFILES.automatic), /自动回能（5 秒回满，每秒 \+20）/);
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
  assert.ok(data.UNIT_DEFS.sui_cat.moveSpeed >= 100);
  assert.equal(data.UNIT_DEFS.sui_cat.abilityName, "猫拳三连");
  assert.match(data.UNIT_DEFS.sui_cat.abilityDescription, /闪现到最远敌人身后/);
  assert.match(data.UNIT_DEFS.sui_cat.abilityDescription, /击晕/);
  assert.equal(data.UNIT_DEFS.rutice.abilityName, "咕咕诊所");
  assert.match(data.UNIT_DEFS.rutice.abilityDescription, /全体友军回复生命/);
  assert.match(data.UNIT_DEFS.rutice.abilityDescription, /生命比例最低的两名友军.*护盾/);
  assert.ok(data.UNIT_DEFS.sui_cat.hp >= 250);
  assert.ok(data.UNIT_DEFS.sui_cat.armor >= 18);
});

test("北欧魔法师技能定义提供三档时停范围与持续时间", () => {
  const unit = data.UNIT_DEFS.spark_mage;
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
  assert.match(data.describeAbilityStarGrowth(unit), /1星.*2星.*3星/);
  assert.equal(data.abilityDescriptionForStar(data.UNIT_DEFS.gale_archer, 3), data.UNIT_DEFS.gale_archer.abilityDescription);
});

test("关系羁绊覆盖收敛后的主播组合且商店定义完整", () => {
  assert.equal(new Set(data.SHOP_UNITS).size, data.SHOP_UNITS.length);
  assert.ok(data.SHOP_UNITS.includes("mitsuri"));
  assert.equal(data.SHOP_UNITS.length, 40);
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
    ["cog_scribe", "guangyi", "lovely", "mumu", "pako", "spark_mage"],
  );
  assert.deepEqual(data.UNIT_DEFS.mumu.traits, ["host", "dance"]);
  assert.equal(data.UNIT_DEFS.mumu.traits.includes("vanguard"), false);
  assert.equal(data.TRAITS.dwarf.name, "矮人");
  assert.equal(data.TRAITS.skeleton_soldier.name, "骷髅兵");
  assert.match(data.TRAITS.skeleton_soldier.bonuses[0], /攻击力/);
  ["sui_flower", "cinder_ram", "lian"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("chuanmei")));
  ["grove_mender", "sui_blue"].forEach((id) => assert.ok(data.UNIT_DEFS[id].traits.includes("gluttony")));
  assert.equal(data.UNIT_DEFS.grove_mender.tier, 4);
  assert.equal(data.UNIT_DEFS.grove_mender.cost, 4);
  assert.equal(data.UNIT_DEFS.grove_mender.traits.includes("ember"), true);
  assert.equal(data.UNIT_DEFS.biscuit_sui.traits.includes("gluttony"), true);
  assert.equal(data.UNIT_DEFS.sui.traits.includes("gluttony"), false);
  assert.equal(data.UNIT_DEFS.sui_cat.traits.includes("gluttony"), false);
  assert.equal(data.TRAITS.assassin.name, "偷袭");
  assert.equal(data.UNIT_DEFS.dawn_duelist.traits.includes("assassin"), false);
  assert.ok(data.UNIT_DEFS.lovely.traits.includes("assassin"));
  assert.deepEqual(data.UNIT_DEFS.nightin.traits, ["mystic", "dwarf"]);
  assert.match(data.TRAITS.mature.bonuses[0], /每 4 秒降低 1 个百分点/);
  assert.match(data.TRAITS.mature.bonuses[0], /正常移速的 70%/);
  const danceStarter = data.STARTERS.find((starter) => starter.id === "dance_start");
  assert.equal(danceStarter?.name, "舞台梦");
  assert.equal(danceStarter?.unit, "sui");
  assert.match(danceStarter?.description || "", /携带小红帽开局；所有友军开战 \+10 能量.*跳舞成员攻击速度 \+8%/);
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
  assert.equal(seki.abilityName, "山猪冲阵");
  assert.equal(towerGod.abilityName, "尖塔压顶");
  assert.equal(sumi.abilityName, "礼小虎出击");
  assert.deepEqual(seki.traits, ["wild", "aggression"]);
  assert.deepEqual(towerGod.traits, ["mystic", "traffic"]);
  assert.deepEqual(sumi.traits, ["mystic", "ranger"]);
});

test("帕可使用公开头像、公开内容衍生技能与主持阵容羁绊", async () => {
  const pako = data.UNIT_DEFS.pako;
  assert.ok(data.SHOP_UNITS.includes("pako"));
  assert.equal(pako.name, "帕可Pako");
  assert.equal(pako.cost, 5);
  assert.deepEqual(pako.traits, ["host", "mystic", "traffic"]);
  assert.equal(pako.abilityName, "全配音实况");
  assert.match(pako.abilityDescription, /范围伤害.*打断行动/);
  assert.match(pako.abilityDescription, /主持成员补充能量/);
  assert.equal(pako.portrait, "/images/livers/pako.jpg");
  await access(path.resolve("public", pako.portrait.slice(1)));
});

test("理财与流量羁绊拥有完整的经济成员池", () => {
  assert.deepEqual(data.TRAITS.finance.thresholds, [2, 4]);
  assert.match(data.TRAITS.finance.bonuses[0], /额外获得 2 金币/);
  assert.match(data.TRAITS.finance.bonuses[1], /每 4 金币/);
  assert.match(data.TRAITS.finance.bonuses[1], /利息无上限/);
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
