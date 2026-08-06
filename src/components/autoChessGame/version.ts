export const AUTOCHESS_VERSION = "0.2.3";
export const AUTOCHESS_RELEASE_DATE = "2026-08-06";

export const AUTOCHESS_RELEASE = {
  version: AUTOCHESS_VERSION,
  date: AUTOCHESS_RELEASE_DATE,
  title: "长局复盘",
  summary: "完整保存长局战斗事件、每战开场站位与操作轨迹，不再受控制台短日志窗口限制。",
  sections: [
    {
      title: "日志与复盘",
      items: [
        "整局最多保留 100,000 条结构化战斗事件，autoChessAI.logs() 可跨关卡读取。",
        "autoChessAI.battles() 与上一局轨迹按关卡保存双方开战站位、属性、事件和结算。",
        "操作轨迹容量由 640 条提高到 10,000 条，长局运营步骤不再过早截断。",
        "托管以真人 54 战的中线站位为种子，让优胜阵容与站位在每轮真实演习中继续变异。",
      ],
    },
    {
      title: "持久化",
      items: [
        "终局轨迹公开实际事件数、丢弃数和容量，便于确认复盘是否完整。",
        "长局轨迹超出 sessionStorage 配额时改存 IndexedDB，同标签页刷新后仍能恢复。",
      ],
    },
  ],
} as const;
