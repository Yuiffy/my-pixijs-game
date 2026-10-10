import { TRAITS, traitLevelForCount } from "./traits";
import { AugmentTier, TRAIT_IDS, UnitId, WaveDefinition, WaveUnit } from "./types";
import { UNIT_DEFS } from "./units";

export const WAVES: WaveDefinition[] = [
  {
    round: 1,
    name: "直播间暖场",
    tag: "normal",
    description: "果冻风纪受击后会逃跑回血，兔子射手提供远程火力；前排承伤、远程后置。",
    modifier: Math.sqrt(2 / 3),
    units: [{ id: "sun_guard" }, { id: "ember_blade" }],
  },
  {
    round: 2,
    name: "毛茸茸夜班",
    tag: "normal",
    description: "绒绒的狗与浣熊店员撑住前排，好笑姐姐会从侧翼突入后排。",
    modifier: Math.sqrt(4 / 3),
    units: [{ id: "mossback" }, { id: "gale_archer" }, { id: "rift_stalker" }],
  },
  {
    round: 3,
    name: "深夜档突入",
    tag: "normal",
    description: "蛙梓持续治疗，雅吨近身灼烧；北欧时停会冻结范围内敌我，远程分散可减少同时被控。",
    modifier: Math.sqrt(7 / 12),
    units: [
      { id: "cinder_ram" },
      { id: "rift_brawler" },
      { id: "clock_gunner" },
      { id: "spark_mage" },
    ],
  },
  {
    round: 4,
    name: "果冻火力网",
    tag: "elite",
    description: "精英预警：果冻风纪逃跑回血，大黑鼠沿路减速，老弥与北欧魔法师提供浮游炮和时停；前后排保持间距。",
    modifier: Math.sqrt(11 / 9),
    units: [
      { id: "sun_guard" },
      { id: "clock_gunner" },
      { id: "spark_mage" },
      { id: "dawn_duelist" },
    ],
  },
  {
    round: 5,
    name: "毛茸茸团建",
    tag: "normal",
    description: "饼干岁会冲向虚弱友军提供治疗与护盾，优先集火可压制这套毛茸茸续航。",
    modifier: Math.sqrt(10 / 9),
    units: [
      { id: "mossback" },
      { id: "mossback" },
      { id: "biscuit_sui" },
      { id: "rift_brawler" },
      { id: "ember_blade" },
    ],
  },
  {
    round: 6,
    name: "攻城序列",
    tag: "normal",
    description: "蛙梓治疗与灼烧并行，好笑姐姐和椰子栞切入后方；保留侧翼保护远程核心。",
    modifier: Math.sqrt(13 / 12),
    units: [
      { id: "cinder_ram" },
      { id: "rift_stalker" },
      { id: "shiori" },
      { id: "gale_archer" },
      { id: "clock_gunner" },
    ],
  },
  {
    round: 7,
    name: "五系禁卫",
    tag: "normal",
    description: "前排、输出与辅助同时登场，检验阵容完整度。",
    modifier: 1,
    units: [
      { id: "dawn_duelist" },
      { id: "cog_scribe" },
      { id: "grove_mender" },
      { id: "rift_brawler" },
      { id: "clock_gunner" },
      { id: "ember_blade" },
    ],
  },
  {
    round: 8,
    name: "暴君投影",
    tag: "elite",
    description: "精英预警：暴君投影携带双辅卫队；这是终局首领前的机制演练。",
    modifier: Math.sqrt(24 / 10),
    units: [{ id: "rift_tyrant" }, { id: "shiori" }, { id: "rift_brawler" }],
  },
];

export const CAMPAIGN_ROUNDS = 16;
export const NORMAL_ENDLESS_END_ROUND = 31;
export const HELL_ENDLESS_START_ROUND = NORMAL_ENDLESS_END_ROUND + 1;
export const NORMAL_INTEREST_CAP = 4;
export const FINANCE_INTEREST_CAP = 20;
export const BOSS_WARNING_TEXT = "首领预警：敌人非常强大，请倾尽所有资源应对，否则可能会失败。";
export const ELITE_WARNING_TEXT = "精英预警：敌人强度明显提升，请升级阵容并调整站位。";
export const HELL_WARNING_TEXT = "地狱预警：敌人会持续变强，请不断强化阵容。";

export type ProgressionMode = "campaign" | "endless" | "hell";

export const progressionModeForRound = (round: number): ProgressionMode => {
  if (round <= CAMPAIGN_ROUNDS) return "campaign";
  if (round <= NORMAL_ENDLESS_END_ROUND) return "endless";
  return "hell";
};

export const augmentTierForRound = (round: number): AugmentTier | null => {
  const campaignTier: Partial<Record<number, AugmentTier>> = {
    2: "minor",
    4: "major",
    8: "minor",
    12: "major",
    16: "major",
  };
  if (round <= CAMPAIGN_ROUNDS) return campaignTier[round] ?? null;
  if ((round - CAMPAIGN_ROUNDS) % 6 !== 0) return null;
  return ((round - CAMPAIGN_ROUNDS) / 6) % 2 === 1 ? "minor" : "major";
};

const ENDLESS_NAMES = [
  "回响突击群",
  "裂隙混编队",
  "失序远征军",
  "深层守望者",
] as const;

const HELL_NAMES = [
  "猩红清算者",
  "地狱追猎群",
  "失控升星潮",
  "终焉守门人",
] as const;

const STAR_COPY_VALUE = [0, 1, 3, 9] as const;

export const ENEMY_GUEST_IDS = ["yua", "hatsuse_guest", "miki_guest"] as const;

// 毕业角色只在自己的固定关登场，悠亚与弥希留到无限首领。
export const FIXED_GUEST_WAVES: WaveDefinition[] = [
  {
    round: 21,
    name: "邪恶外星人",
    tag: "boss",
    description: `${BOSS_WARNING_TEXT} 三星邪恶外星人坐镇后排中央，九名两星护卫以舞带救援、技能盾和前排续航护送连续贯穿光线；分散后排、错开射线，并从侧翼切入悠亚。`,
    modifier: 1,
    units: [
      { id: "yua", star: 3, formationIndex: 1 },
      { id: "sumi", star: 2, formationIndex: 0 },
      { id: "mumu", star: 2, formationIndex: 2 },
      { id: "sun_guard", star: 2, formationIndex: 7 },
      { id: "gale_archer", star: 2, formationIndex: 6 },
      { id: "shiori", star: 2, formationIndex: 8 },
      { id: "yukisyo", star: 2, formationIndex: 4 },
      { id: "nori", star: 2, formationIndex: 5 },
      { id: "biscuit_sui", star: 2, formationIndex: 3 },
      { id: "mossback", star: 2, formationIndex: 9 },
    ],
  },
  {
    round: 12,
    name: "蝙蝠夜歌",
    tag: "elite",
    description: "精英预警：两星初濑在后排中央以蝙蝠夜歌吸血治疗，火热与月之帮卫队拖长战斗；侧翼切入初濑可打断续航链。",
    modifier: Math.sqrt(81 / 34),
    units: [
      { id: "hatsuse_guest", star: 2, formationIndex: 1 },
      { id: "rift_brawler", star: 2, formationIndex: 7 },
      { id: "shiori", formationIndex: 6 },
      { id: "cinder_ram", formationIndex: 4 },
      { id: "nightin", formationIndex: 0 },
      { id: "sui_flower", formationIndex: 2 },
    ],
  },
  {
    round: 26,
    name: "肾虚萌音脑控",
    tag: "boss",
    description: `${BOSS_WARNING_TEXT} 两星弥希由十一名两星护卫保护，缓慢蓄能后以萌音脑控高攻击棋子反打队友 1.6 秒；分散主力，趁蓄能间隙切入弥希，击倒她可解除脑控。`,
    modifier: 1,
    units: [
      { id: "miki_guest", star: 2, formationIndex: 2 },
      { id: "nagisa", star: 2, formationIndex: 12 },
      { id: "sun_guard", star: 2, formationIndex: 10 },
      { id: "gale_archer", star: 2, formationIndex: 14 },
      { id: "spark_mage", star: 2, formationIndex: 1 },
      { id: "mumu", star: 2, formationIndex: 8 },
      { id: "yukisyo", star: 2, formationIndex: 7 },
      { id: "shiori", star: 2, formationIndex: 11 },
      { id: "mossback", star: 2, formationIndex: 13 },
      { id: "nightin", star: 2, formationIndex: 3 },
      { id: "cinder_ram", star: 2, formationIndex: 0 },
      { id: "sui_flower", star: 2, formationIndex: 4 },
    ],
  },
];

// 多档护盾与开场能量叠加使弥希关超出同预算强度；降星后也不把差额补给护卫。
const FIXED_GUEST_STAT_SCALES: Readonly<Partial<Record<number, number>>> = { 26: 0.86 };

const ENEMY_SQUADS: ReadonlyArray<{
  name: string;
  units: readonly UnitId[];
}> = [
  {
    name: "深夜声场",
    units: ["spark_mage", "nightin", "cinder_ram", "rei", "sui_flower", "lian", "shiori"],
  },
  {
    name: "舞台突袭",
    units: ["mumu", "youyi", "lian", "sui_cat", "lovely", "tiandou", "pako"],
  },
  {
    name: "同期联动",
    units: ["sun_guard", "ember_blade", "rift_brawler", "clock_gunner", "shiori", "mitsuri", "sumi"],
  },
  {
    name: "毛茸盛宴",
    units: ["mossback", "grove_mender", "sui_bird", "biscuit_sui", "meme", "kioi", "seki_boar_king"],
  },
];

const ENDLESS_BOSS_SQUADS: ReadonlyArray<{
  name: string;
  units: readonly UnitId[];
}> = [
  {
    name: "时停合唱团",
    units: ["spark_mage", "nightin", "shiori", "cinder_ram", "rei", "sui_flower"],
  },
  {
    name: "终场续航团",
    units: ["cinder_ram", "cinder_ram", "cinder_ram", "lian", "clock_gunner", "shiori"],
  },
  {
    name: "高费压制团",
    units: ["lian", "lian", "cinder_ram", "spark_mage", "seki_boar_king", "guangyi"],
  },
];

const enemySquadForRound = (round: number, seed = 0) => {
  const endlessDepth = round - CAMPAIGN_ROUNDS;
  if (endlessDepth > 0 && endlessDepth % 5 === 0) {
    const bossIndex = endlessDepth / 5 - 1;
    return ENDLESS_BOSS_SQUADS[bossIndex % ENDLESS_BOSS_SQUADS.length];
  }
  return ENEMY_SQUADS[Math.abs(round * 7 + seed * 11) % ENEMY_SQUADS.length];
};

export const waveCompositionValue = (wave: Pick<WaveDefinition, "units">) => wave.units.reduce(
    (total, waveUnit) => total + UNIT_DEFS[waveUnit.id].cost * STAR_COPY_VALUE[waveUnit.star ?? 1],
    0,
  );

export const waveEffectiveValue = (wave: Pick<WaveDefinition, "units" | "modifier">) => Math.round(waveCompositionValue(wave) * wave.modifier ** 2);

export const enemyTraitActivations = (
  units: readonly WaveUnit[],
) => {
  const uniqueIds = new Set(units.map((waveUnit) => waveUnit.id));
  return TRAIT_IDS.flatMap((id) => {
    let count = 0;
    uniqueIds.forEach((unitId) => {
      if (UNIT_DEFS[unitId].traits.includes(id)) count += 1;
    });
    const level = traitLevelForCount(TRAITS[id], count);
    return level ? [{ id, count, level }] : [];
  });
};

const tagForRound = (round: number): WaveDefinition["tag"] => {
  if (round <= CAMPAIGN_ROUNDS) {
    if (round === CAMPAIGN_ROUNDS) return "boss";
    return round % 4 === 0 ? "elite" : "normal";
  }
  const endlessRound = round - CAMPAIGN_ROUNDS;
  if (endlessRound % 5 === 0) return "boss";
  return endlessRound % 3 === 0 ? "elite" : "normal";
};

export const enemyBudgetForRound = (round: number) => {
  const safeRound = Math.max(1, Math.floor(round));
  if (safeRound <= WAVES.length) {
    const wave = WAVES[safeRound - 1];
    return Math.round(waveCompositionValue(wave) * wave.modifier * wave.modifier);
  }
  if (safeRound <= CAMPAIGN_ROUNDS) {
    const campaignDepth = safeRound - WAVES.length;
    const baseBudget =
      18 + campaignDepth * 4.5 + campaignDepth * campaignDepth * 0.42;
    const tag = tagForRound(safeRound);
    return Math.round(
      baseBudget * (tag === "boss" ? 1.55 : tag === "elite" ? 1.9 : 0.75),
    );
  }
  let budget = 135;
  for (let waveRound = CAMPAIGN_ROUNDS + 1; waveRound < safeRound; waveRound += 1) {
    const nextMode = progressionModeForRound(waveRound + 1);
    const bounty = projectedBountyForGeneratedRound(waveRound, budget);
    const interest = nextMode === "hell" ? FINANCE_INTEREST_CAP : 5;
    const finance = nextMode === "hell" ? 2 : 0;
    const streak = 2;
    budget += interest + finance + streak + bounty;
  }
  return budget;
};

const generatedUnitCount = (round: number) => {
  if (round <= CAMPAIGN_ROUNDS) {
    return Math.min(10, 5 + Math.floor((round - 9) / 3));
  }
  if (round <= 21) return 10;
  if (round <= 25) return 11;
  if (round <= 28) return 12;
  if (round <= NORMAL_ENDLESS_END_ROUND) return 13;
  return 14 + Math.floor((round - HELL_ENDLESS_START_ROUND) / 2);
};

const buildBudgetedUnits = (
  round: number,
  tag: WaveDefinition["tag"],
  budget: number,
  seed = 0,
) => {
  const count = generatedUnitCount(round);
  const squad = enemySquadForRound(round, seed);
  const units: WaveUnit[] = Array.from({ length: count }, (_, index) => {
    if (tag === "boss" && index === 0) return { id: "rift_tyrant", star: 1 };
    const squadIndex = tag === "boss" ? index - 1 : index;
    return {
      id: squad.units[squadIndex % squad.units.length],
      star: 1,
    };
  });
  const maxStar: 1 | 2 | 3 = round < 15 ? 2 : 3;
  let remaining = Math.max(0, budget - waveCompositionValue({ units }));
  for (let guard = 0; guard < units.length * 2; guard += 1) {
    const options = units
      .map((candidateUnit, index) => {
        const star = candidateUnit.star ?? 1;
        const nextStar = Math.min(3, star + 1) as 1 | 2 | 3;
        return {
          index,
          nextStar,
          cost:
            UNIT_DEFS[candidateUnit.id].cost *
            (STAR_COPY_VALUE[nextStar] - STAR_COPY_VALUE[star]),
          priority: (index * 7 + round) % Math.max(1, units.length),
        };
      })
      .sort((left, right) => right.cost - left.cost || left.priority - right.priority);
    let [choice] = options;
    while (choice && (choice.nextStar > maxStar || choice.cost > remaining)) {
      options.shift();
      [choice] = options;
    }
    if (!choice) break;
    units[choice.index] = { ...units[choice.index], star: choice.nextStar };
    remaining -= choice.cost;
  }
  return units;
};

const bountyForUnits = (units: readonly WaveUnit[]) => units.reduce((total, waveUnit) => total + (waveUnit.star ?? 1), 0);

const projectedBountyForGeneratedRound = (round: number, budget: number) => {
  const guestWave = FIXED_GUEST_WAVES.find((wave) => wave.round === round);
  return bountyForUnits(guestWave?.units ?? buildBudgetedUnits(round, tagForRound(round), budget));
};

export const projectedIncomeAfterRound = (round: number) => {
  const safeRound = Math.max(CAMPAIGN_ROUNDS + 1, Math.floor(round));
  const nextMode = progressionModeForRound(safeRound + 1);
  const interest = nextMode === "hell" ? FINANCE_INTEREST_CAP : 5;
  const finance = nextMode === "hell" ? 2 : 0;
  const streak = 2;
  const bounty = projectedBountyForGeneratedRound(
    safeRound,
    enemyBudgetForRound(safeRound),
  );
  return {
    interest,
    streak,
    finance,
    bounty,
    total: interest + streak + finance + bounty,
  };
};

export const waveForRound = (round: number, seed = 0): WaveDefinition => {
  if (round <= WAVES.length) return WAVES[Math.max(0, round - 1)];
  const guestWave = FIXED_GUEST_WAVES.find((wave) => wave.round === round);
  if (guestWave) return {
    ...guestWave,
    modifier: Math.sqrt(enemyBudgetForRound(round) / waveCompositionValue(guestWave)) * (FIXED_GUEST_STAT_SCALES[round] ?? 1),
  };

  const mode = progressionModeForRound(round);
  const tag = tagForRound(round);
  const budget = enemyBudgetForRound(round);
  const units = buildBudgetedUnits(round, tag, budget, seed);
  const compositionValue = Math.max(1, waveCompositionValue({ units }));
  const modifier = Math.sqrt(budget / compositionValue);
  const endlessRound = round - CAMPAIGN_ROUNDS;
  const nameIndex = Math.max(0, endlessRound - 1);
  const squad = enemySquadForRound(round, seed);

  return {
    round,
    name:
      tag === "boss"
        ? mode === "campaign"
          ? "暴君本体 · 远征终局"
          : `${squad.name} · ${round}`
        : mode === "campaign"
          ? tag === "elite"
            ? `${squad.name} · 精英 ${round}`
            : `${squad.name} · ${round}`
          : mode === "hell"
            ? `${HELL_NAMES[nameIndex % HELL_NAMES.length]} · ${round}`
            : `${ENDLESS_NAMES[nameIndex % ENDLESS_NAMES.length]} · ${round}`,
    tag,
    description:
      tag === "boss"
        ? BOSS_WARNING_TEXT
        : tag === "elite"
          ? ELITE_WARNING_TEXT
          : mode === "campaign"
            ? "敌人组成了完整羁绊，请根据敌方阵容调整站位。"
            : mode === "endless"
              ? "敌人会持续变强，请继续强化阵容。"
              : "地狱无限：敌人会越来越强，请不断强化阵容。",
    modifier,
    units,
  };
};
