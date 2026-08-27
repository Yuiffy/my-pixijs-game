export const AUTOCHESS_VERSION = "0.4.0";
export const AUTOCHESS_RELEASE_DATE = "2026-08-27";

export const AUTOCHESS_RELEASE = {
  version: AUTOCHESS_VERSION,
  date: AUTOCHESS_RELEASE_DATE,
  title: "战术暂停",
  summary: "战斗现在可以随时停下来查看局势，桌面和移动端的战斗工具也更清楚、更紧凑。",
  sections: [
    {
      title: "新增",
      items: [
        "战斗阶段新增暂停与继续按钮；按 P 也能快速切换，暂停期间计时、移动、攻击和技能结算都会冻结。",
        "暂停时仍可查看羁绊与战斗统计，画面中央会明确提示当前状态。",
      ],
    },
    {
      title: "调整",
      items: [
        "手机上的暂停、快速结算与战斗统计改为紧凑图标，竖屏下不再因为工具文字产生横向溢出。",
        "外部控制接口新增 pause() 与 resume()，文字状态会同步公开暂停状态和 P 键操作。",
      ],
    },
    {
      title: "修复",
      items: [
        "暂停同时冻结前台动画和后台补时，继续时不会突然补算暂停期间的战斗进度。",
      ],
    },
  ],
} as const;
