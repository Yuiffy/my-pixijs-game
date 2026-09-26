import { mealOf } from "./daily";
import { action, Game, nearest, interactionPoint, Spot } from "./engine";

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
  if (s.daily && s.daily.stage !== "home") next = {
    spot: "partner",
key: "discover",
step: 4,
    title: s.daily.stage === "sleep" ? "你睡着了，等一盏灯熄灭" : s.daily.after === "rice" ? "下播了，去看看厨房的岁己" : "岁己洗完澡了，去床边看看",
    destination: "轻声走过去",
detail: "直播结束了，现在可以自在说话。靠近后轻按E。",
  };
  else if (s.daily?.panel === "lock") next = { spot: "entry", key: "unlock", title: "岁己在直播，轻轻开门", destination: "玄关", detail: "指针到金色区域时点一下。", step: 1 };
  else if (s.carry === "charger") next = {
      spot: "sofa",
      key: "charger",
      title: "把充电器带回沙发",
      destination: "回客厅沙发",
      detail: "已经拿到了。回到沙发旁，轻按按钮把它放好。",
      step: 2,
    };
  else if (s.carry === "food") next = {
      spot: "table",
      key: "food",
      title: "把晚饭摆到直播桌左侧",
      destination: "去桌边餐垫",
      detail: "看向桌上的餐垫，轻按E。TA继续直播，你把晚饭摆好就行。",
      step: 1,
    };
  else {
    const task = s.tasks.find((t) => !s.done.includes(t));
    if (task === "cook") next = { spot: "kitchen", key: "cook", title: "岁己想吃你炒的蛋炒饭", destination: "去料理台", detail: "鸡蛋和米饭都准备好了，轻按E开始做饭。", step: 2 };
    else if (task === "leisure") next = { spot: "sofa", key: "leisure", title: "忙完啦，回客厅放松一会儿", destination: "回沙发", detail: "可以看视频或玩游戏，记得留意手机消息。", step: 3 };
    else if (task === "charger") next = {
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
        title: s.daily ? `门口的${mealOf(s).name}到了` : "先去门口取外卖",
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
        title: s.doorClosed ? "回电脑旁，点击小球报点" : "先回客厅，再关门报点",
        destination: "去客厅电脑旁",
        detail: s.doorClosed
          ? "门已关好。轻按E开始，点击小球完成8个报点。"
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
    else if (s.daily) next = { spot: "bed", key: "sleep", title: "困了，先去床边睡一会儿", destination: "去床边", detail: "轻按E躺下。岁己下播后还会发生什么呢？", step: 4 };
    else next = {
        spot: "sofa",
        key: "finish",
        title: "事情做好啦，回沙发收工",
        destination: "回沙发收工",
        detail: "在沙发旁轻按“收工”，就能结束这一晚。",
        step: 3,
      };
  }
  if (
    s.doorClosed &&
    next.spot !== "door" &&
    s.player.x < 520 !== interactionPoint(s, next.spot).x < 520
  ) {
    return {
      ...next,
      spot: "door",
      key: "door",
      title: "先轻轻打开隔音门",
      destination: "去隔音门旁",
      detail: "门挡住了路。靠近后轻按按钮开门，再继续刚才的任务。",
    };
  }
  if (nearest(s) === next.spot && action(s).key === next.key) {
    return {
      ...next,
      title:
        next.key === "pickup-charger" ? "找到啦，轻按拿起充电器" : next.title,
      detail:
        next.key === "pickup-charger"
          ? "看向充电器，轻按E或互动按钮就能拿起。"
          : next.key === "charger"
            ? "看向沙发，轻按E或互动按钮把充电器放好。"
            : next.detail,
    };
  }
  return next;
}
