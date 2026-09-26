import { skinOf } from "./skins";
import { mealOf } from "./daily";
import { householdStatus, noodlesWaiting, onBreak } from "./household";
import { action, Game, nearest, interactionPoint, Spot } from "./engine";

export const FIRST_STEPS = ["拿到充电器", "放到扶手托盘", "收工，等TA下播"];

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
    title: s.daily.stage === "sleep" ? "你睡着了，等一盏灯熄灭" : s.daily.after === "rice" ? `下播了，去看看厨房的${skinOf(s.skin).name}` : `${skinOf(s.skin).name}洗完澡，来沙发旁找你了`,
    destination: "轻声走过去",
detail: "直播结束了，现在可以自在说话。靠近后轻按E。",
  };
  else if (s.daily && s.daily.arrival !== "done") next = { spot: "entry", key: "unlock", title: `${skinOf(s.skin).name}在直播，轻轻开门`, destination: "玄关", detail: "观察门锁，按锁芯的提示慢慢解开。", step: 1 };
  else if (s.carry === "charger") next = {
      spot: "charging",
      key: "charger",
      title: "把充电器放到沙发右侧托盘",
      destination: "去沙发右侧扶手",
      detail: "看向右侧扶手上的木托盘，轻按E放下，不用走到沙发中间。",
      step: 2,
    };
  else if (s.carry === "food" && s.daily?.meal === "noodles" && s.daily.household.noodles === "sealed") next = {
    spot: "kitchen", key: "boil-water", title: "桶面还没泡，先烧一壶热水", destination: "去料理台", detail: "轻按E放下未开封桶面，给水壶加水。烧水时可以自由走动。", step: 1,
  };
  else if (s.carry === "food") next = {
      spot: "table",
      key: "food",
      title: "把晚饭摆到直播桌左侧",
      destination: "去桌边餐垫",
      detail: "看向桌上的餐垫，轻按E。TA继续直播，你把晚饭摆好就行。",
      step: 1,
    };
  else if (s.daily?.meal === "noodles" && ["hot", "steeping", "ready"].includes(s.daily.household.noodles)) next = {
      spot: "kitchen",
key: s.daily.household.noodles === "hot" ? "pour-noodles" : "take-noodles",
      title: s.daily.household.noodles === "hot" ? "水开了，给桶面加热水" : "泡面冲好了，直接端过去",
      destination: "回料理台",
detail: s.daily.household.noodles === "hot" ? "轻按E撕盖、放调料、加水到刻度线并盖好。" : "轻按E拿起盖好的泡面和叉子，放到直播桌。焖好了TA会自己吃，不用等。",
step: 2,
    };
  else {
    const task = s.tasks.find((t) => !s.done.includes(t) && !(t === "food" && noodlesWaiting(s)) && !(["hug", "kiss"].includes(t) && onBreak(s)));
    if (task === "cook") next = { spot: "kitchen", key: "cook", title: `${skinOf(s.skin).name}想吃你做的${mealOf(s).name}`, destination: "去料理台", detail: "食材都准备好了，轻按E开始做饭。", step: 2 };
    else if (task === "leisure") next = { spot: "sofa", key: "leisure", title: "回客厅放松一会儿", destination: "回沙发", detail: "可以看视频或玩游戏，烧水和泡面会继续进行，留意消息提醒。", step: 3 };
    else if (task === "cat-food" || task === "cat-litter") next = {
      spot: task === "cat-food" ? "cat-bowl" : "cat-litter",
key: task,
      title: task === "cat-food" ? "小猫的饭碗空了" : `清理猫砂盆 · ${s.daily?.household.cat.scoops ?? 0}/3`,
      destination: task === "cat-food" ? "去客厅猫碗旁" : "去墙边猫砂盆",
      detail: task === "cat-food" ? "轻按E量一勺猫粮倒进碗，小猫会过来吃饭。" : "轻点E铲起一处结团，筛砂装袋，共三次。",
step: 2,
    };
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
        detail: s.daily?.meal === "noodles" ? "超市送来的是桶装干面，需要先去厨房烧水冲泡。" : "先提起外卖袋，再送到直播间。",
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
    else if (noodlesWaiting(s) || (onBreak(s) && !s.tasks.every(t => s.done.includes(t)))) next = { spot: "sofa", key: "leisure", title: householdStatus(s), destination: "可以先坐一会儿", detail: "不用一直按住按钮。时间会自然推进，也可以四处走走、摸摸猫。", step: 2 };
    else if (s.daily) next = { spot: "sofa", key: "sleep", title: "忙完了，在沙发上等TA下播", destination: "回客厅沙发", detail: "看向沙发坐垫，轻按E，裹着毯子小睡一会儿。", step: 4 };
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
            ? "看向扶手上的木托盘，轻按E把充电器放好。"
            : next.detail,
    };
  }
  return next;
}
