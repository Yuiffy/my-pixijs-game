import type { WuxiaContentPack } from "./wuxiaCampaign";

// This pack is intentionally not installed by default. It is a small, executable
// reference for adding data without changing the campaign engine.
export const EXAMPLE_RIVER_LANTERN_PACK: WuxiaContentPack = {
  id: "example.river-lanterns",
  version: "1.0.0",
  label: "示例扩展 · 河灯夜话",
  locations: [
    {
      id: "example_river_lantern_pier",
      name: "河灯旧埠",
      type: "pavilion",
      descriptor: "废弃的系船石仍留着旧绳痕，每逢夜潮，总有人把写了姓名的河灯放进水里。",
      region: "洛水下游",
      x: 88,
      y: 73,
      connections: ["inn_tingyu"],
      danger: 24,
      tags: ["河灯", "旧信", "水路"],
    },
  ],
  agendas: [
    {
      id: "example.river-letters",
      originIds: ["sect_disciple", "wanderer", "escort_guard"],
      title: "沿河访信",
      subtitle: "追一封在人与渡口之间流转的旧信",
      description: "把人物行踪、地方传闻与限时聚会连成一条可随时暂停的追寻；信没有预写结局，持信者的选择会继续改变它。",
      primaryVerb: "查访持信之人",
      tone: "ink",
      favoredActivityKinds: ["pursue", "investigate", "opportunity"],
      sourcePackId: "example.river-lanterns",
    },
  ],
  opportunities: [
    {
      id: "example_lantern_fair",
      title: "听雨渡河灯夜会",
      shortTitle: "河灯夜会",
      type: "faction_gathering",
      description: "沿河各家把未能送达的信系在灯下。来客可以寻人、交信或公开辨认冒名者的招式，但没有一盏灯替人决定答案。",
      locationId: "example_river_lantern_pier",
      startDay: 4,
      startDaySpread: 2,
      durationDays: 5,
      organizer: "听雨渡船户会",
      rewardHint: "人物线索、地方人情、门派辨识",
      risk: "中",
      sourcePackId: "example.river-lanterns",
    },
  ],
  characters: [
    {
      id: "example_luo_zhen",
      name: "罗枕河",
      sourceName: "示例 MOD 原创人物",
      title: "河灯信使",
      role: "替不便露面的人沿水路送信，只接受写有真实收信人的托付",
      desire: "把一封辗转三年仍未送达的信交到收信人本人手中",
      fear: "有人借河灯夜会的名义伪造整批书信，引两方旧识互相寻仇",
      signatureMove: "折灯渡影",
      signatureDescription: "他以薄竹灯骨贴水一点，身形借反光错开半步；追来的兵刃只击碎一盏河灯，真身已经落到另一侧船头。",
      portrait: "/images/autochess/portraits/nightin.png",
      traits: ["水路", "轻功", "守信"],
      romanceable: true,
      factionId: "free",
      homeLocationId: "example_river_lantern_pier",
      routineLocationIds: ["example_river_lantern_pier", "inn_tingyu", "bridge_beidou", "city_luoyang"],
      sourcePackId: "example.river-lanterns",
    },
  ],
  rules: {
    maxVisibleActivities: 10,
    inventTechnique: { martialInsights: 2 },
    foundSect: { followers: 1 },
  },
};
