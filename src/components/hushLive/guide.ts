import { action, Game, nearest, SPOTS, Spot } from "./engine";

export const FIRST_STEPS = ["拿到充电器", "带回沙发放好", "收工，等TA下播"];

export type Objective = {
  spot: Spot;
  key: string;
  title: string;
  destination: string;
  detail: string;
  step: number;
};

/** Derive the next useful instruction from actual inventory and tasks, not a tutorial timer. */
export function objective(s: Game): Objective {
  let next: Objective;
  if (s.carry === "charger") next = {
      spot: "sofa",
      key: "charger",
      title: "把充电器带回沙发",
      destination: "回客厅沙发",
      detail: "已经拿到了。回到沙发旁，按住按钮把它放好。",
      step: 2,
    };
  else if (s.carry === "food") next = {
      spot: "partner",
      key: "food",
      title: "把热外卖递给TA",
      destination: "去恋人身旁",
      detail: "袋子会响。到TA身旁后，可以用眼神暗号请TA闭麦。",
      step: 1,
    };
  else {
    const task = s.tasks.find((t) => !s.done.includes(t));
    if (task === "charger") next = {
        spot: "shelf",
        key: "pickup-charger",
        title: "去直播间拿充电器",
        destination: "去床尾抽屉拿充电器",
        detail: "在直播间的床尾抽屉。沿金色目标标记走过去。",
        step: 1,
      };
    else if (task === "food") next = {
        spot: "entry",
        key: "pickup-food",
        title: "先去门口取外卖",
        destination: "去玄关取餐",
        detail: "先提起外卖袋，再送到直播间。",
        step: 1,
      };
    else if (task === "delta" && !s.doorClosed && s.player.x < 506) next = {
        spot: "door",
        key: "door",
        title: "报点前，先关上隔音门",
        destination: "去隔音门旁",
        detail: "在客厅这一侧轻轻关门，再回电脑旁语音报点。",
        step: 1,
      };
    else if (task === "delta") next = {
        spot: "desk",
        key: s.doorClosed ? "delta" : "",
        title: s.doorClosed ? "回电脑旁，低声报点" : "先回客厅，再关门报点",
        destination: "去客厅电脑旁",
        detail: s.doorClosed
          ? "门已关好。低声语音更安全，放开语音更快但更吵。"
          : "先回到客厅，关上身后的门，避免声音传进直播间。",
        step: 1,
      };
    else if (task === "hug" || task === "kiss") next = {
        spot: "partner",
        key: task,
        title: task === "hug" ? "TA想要一个拥抱" : "给TA一个晚安吻",
        destination: "去恋人身旁",
        detail: "先靠近TA，用眼神暗号闭麦，再按住按钮亲近。",
        step: 1,
      };
    else next = {
        spot: "sofa",
        key: "finish",
        title: "事情做好啦，回沙发收工",
        destination: "回沙发收工",
        detail: "在沙发旁按住“收工”，就能结束这一晚。",
        step: 3,
      };
  }
  if (
    s.doorClosed &&
    next.spot !== "door" &&
    s.player.x < 520 !== SPOTS[next.spot].x < 520
  ) {
    return {
      ...next,
      spot: "door",
      key: "door",
      title: "先轻轻打开隔音门",
      destination: "去隔音门旁",
      detail: "门挡住了路。靠近后按住按钮开门，再继续刚才的任务。",
    };
  }
  if (nearest(s) === next.spot && action(s).key === next.key) {
    return {
      ...next,
      title:
        next.key === "pickup-charger" ? "找到啦，按住拿起充电器" : next.title,
      detail:
        next.key === "pickup-charger"
          ? "看向充电器，按住E或互动按钮拿起。唱歌时更安静。"
          : next.key === "charger"
            ? "看向沙发，按住E或互动按钮把充电器放好。"
            : next.detail,
    };
  }
  return next;
}
