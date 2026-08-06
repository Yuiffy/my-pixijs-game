export const AUTOCHESS_VERSION = "0.2.2";
export const AUTOCHESS_RELEASE_DATE = "2026-08-06";

export const AUTOCHESS_RELEASE = {
  version: AUTOCHESS_VERSION,
  date: AUTOCHESS_RELEASE_DATE,
  title: "战术前瞻",
  summary: "托管开始用真实战斗预演协议、阵容和天赋，并补齐谨慎经济与可恢复的真人操作轨迹。",
  sections: [
    {
      title: "托管策略",
      items: [
        "每个候选协议先完整预演三战，只有胜场严格更多时才推翻长期偏好。",
        "阵容与天赋由真实战斗浅层推演比较，单卡技能、星级、站位与羁绊都会进入结果。",
        "稳胜时可保留跨档刷新金币，满候选席且正好差一金币升息时会安全回收一张闲置单卡。",
      ],
    },
    {
      title: "稳定与测试",
      items: [
        "棋盘与候选席全满时直接交换目标棋，不再因非法上阵保持选中直到超时。",
        "新增完整操作前后快照；上一局轨迹在终局、热更新和同标签页刷新后仍可恢复。",
        "24 个固定种子平均终止战从 13.42 提升到 14.38，平均胜场从 10.17 提升到 11.33。",
      ],
    },
  ],
} as const;
