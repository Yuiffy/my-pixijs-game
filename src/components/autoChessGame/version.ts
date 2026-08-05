export const AUTOCHESS_VERSION = "0.2.1";
export const AUTOCHESS_RELEASE_DATE = "2026-08-06";

export const AUTOCHESS_RELEASE = {
  version: AUTOCHESS_VERSION,
  date: AUTOCHESS_RELEASE_DATE,
  title: "满席换购",
  summary: "补齐点击出售操作，并让 AI 托管在候选席满时主动腾位、继续买入更合适的棋子。",
  sections: [
    {
      title: "出售与托管",
      items: [
        "选中棋子后可直接点击桌面出售区回收，并提前显示返还金币。",
        "AI 在棋盘和候选席全满时，会回收目标阵容外的低价值候选并立即买入已选中的更高价值棋子。",
        "控制台出售测试同时覆盖指定槽位与选中后出售。",
      ],
    },
    {
      title: "桌面工具栏",
      items: [
        "桌面顶部恢复声音开关和音乐、音效音量快捷调节。",
        "版本与更新入口统一移入设置，移动端仍保留完整音频控制。",
      ],
    },
  ],
} as const;
