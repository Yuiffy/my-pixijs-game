export const AUTOCHESS_VERSION = "0.2.0";
export const AUTOCHESS_RELEASE_DATE = "2026-08-05";

export const AUTOCHESS_RELEASE = {
  version: AUTOCHESS_VERSION,
  date: AUTOCHESS_RELEASE_DATE,
  title: "AI 战术台",
  summary: "统一首批棋子形象，并让完整对局可以通过键盘或控制台快速操作、观测和复盘。",
  sections: [
    {
      title: "AI 操作与观测",
      items: [
        "新增 window.autoChessAI 控制台接口，覆盖购买、布阵、出售、升本、天赋选择和流程推进。",
        "战斗日志记录目标切换、技能方向、投射物命中、伤害与阵亡，并同步输出到控制台。",
        "战斗中可快速结算，减少自动化等待时间。",
      ],
    },
    {
      title: "棋子形象",
      items: [
        "果冻风纪、小红帽与绒绒的狗换用透明全身战棋形象。",
        "新资产统一为 512px、固定安全边距和小尺寸优先的清晰轮廓。",
      ],
    },
    {
      title: "平衡与体验",
      items: [
        "根据多局策略测试平滑前 8 波强度，保留精英峰值并让更多低费阵容能进入中期。",
        "败局的存活敌人追加伤害上限由 3 降为 2，保留一次调整阵容的机会。",
        "版本、更新日志与发布检查纳入日常功能改动流程。",
      ],
    },
  ],
} as const;
