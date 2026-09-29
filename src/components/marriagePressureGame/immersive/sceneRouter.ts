import { ACTIVITIES, type VenueId } from "../activities";
import { getAvailableChildActions, getAvailableParentActions } from "../engine";
import { hashKey, nextSlot } from "../inbox";
import type { ActivityId, ChildActionId, MarriageGameState, ParentActionId } from "../types";
import { getSeason, type Season } from "./lines";

export type SceneId =
  | "matchmaking"
  | "office"
  | "meeting-room"
  | "commute"
  | "room"
  | "home"
  | "park"
  | "parent-home"
  | "reunion"
  | "hospital"
  | "venue";

export type PhoneApp = "home" | "chats" | "chat" | "moments" | "map" | "call" | "bank" | "calendar" | "album";
export type ChatId = "mom" | "dad" | "family" | "matchmaker" | "work" | "candidate" | "child" | "sisters" | "landlord";

export function phoneClock(state: Pick<MarriageGameState, "week" | "currentEventId">) {
  const clocks = state.currentEventId === "overtime"
    ? { work: "22:47", commute: "23:18", evening: "00:08", morning: "09:15", afternoon: "15:20" }
    : { work: "11:42", commute: "18:36", evening: "22:08", morning: "09:15", afternoon: "15:20" };
  return clocks[state.week.slot];
}

export type HotspotTarget =
  | { kind: "child-action"; id: ChildActionId }
  | { kind: "parent-action"; id: ParentActionId }
  | { kind: "phone"; app: PhoneApp; chat?: ChatId }
  | { kind: "advance" }
  | { kind: "plan" };

export interface Hotspot {
  id: string;
  label: string;
  detail: string;
  target: HotspotTarget;
  enabled: boolean;
}

export interface SceneRoute {
  id: SceneId;
  venue: VenueId | null;
  season: Season;
  title: string;
  night?: boolean;
}

const SCENE_TITLES: Record<SceneId, string> = {
  matchmaking: "公园相亲角",
  office: "工位",
  "meeting-room": "会议室",
  commute: "下班路上",
  room: "出租屋",
  home: "我们的家",
  park: "公园 · 相亲角",
  "parent-home": "爸妈家的客厅",
  reunion: "老家 · 年夜饭",
  hospital: "医院走廊",
  venue: "周末",
};

export const VENUE_TITLES: Record<VenueId, string> = {
  restaurant: "家常菜馆",
  hotpot: "火锅店",
  western: "西餐厅",
  cafe: "街角咖啡馆",
  riverside: "江边步道",
  museum: "市博物馆",
  mall: "商场",
  boardgame: "桌游吧",
  cinema: "电影院",
  nightmarket: "夜市",
  catcafe: "猫咖",
  mountain: "郊野山道",
  karting: "卡丁车场",
  archery: "射箭馆",
  comicon: "漫展会场",
  livehouse: "Livehouse",
  kitchen: "厨房",
  trip: "海边小镇",
};

export function venueOf(activity: ActivityId) {
  return ACTIVITIES[activity].venue;
}

// 按阶段、行动方与本周时段决定场景；约会场馆由界面层临时指定
export function routeScene(state: MarriageGameState, dateActivity: ActivityId | null = null, brief = false, reunion = false): SceneRoute {
  const season = getSeason(state);
  const make = (id: SceneId, venue: VenueId | null = null): SceneRoute => ({
    id, venue, season, title: venue ? VENUE_TITLES[venue] : SCENE_TITLES[id],
  });
  if (state.phase === "candidate") return make("matchmaking");
  if (reunion) return make("reunion");
  if (dateActivity) return make("venue", venueOf(dateActivity));
  const household = state.stage === "married" || state.stage === "parenthood";
  // 精简节奏：不逐段经历一周，直接停在一天结束的地方
  if (state.activeActor === "parent") return make(!brief && state.week.actor === "parent" && state.week.slot === "morning" ? "park" : "parent-home");
  const slot = !brief && state.week.actor === "child" ? state.week.slot : "evening";
  if (slot === "work") {
    if (state.currentEventId === "layoff-rumor" || state.currentEventId === "promotion") return make("meeting-room");
    // 项目临时上线：同一个工位，但人都走光了
    if (state.currentEventId === "overtime") return { ...make("office"), title: "夜里的办公室", night: true };
    return make("office");
  }
  if (slot === "commute") return make(state.currentEventId === "hospital" ? "hospital" : "commute");
  return make(household ? "home" : "room");
}

type HotspotSeed = Omit<Hotspot, "enabled">;

const child = (id: string, label: string, detail: string, action: ChildActionId): HotspotSeed => ({ id, label, detail, target: { kind: "child-action", id: action } });
const parent = (id: string, label: string, detail: string, action: ParentActionId): HotspotSeed => ({ id, label, detail, target: { kind: "parent-action", id: action } });
const phone = (id: string, label: string, detail: string, app: PhoneApp, chat?: ChatId): HotspotSeed => ({ id, label, detail, target: { kind: "phone", app, chat } });

const ADVANCE_LABELS: Record<string, string> = {
  work: "下班，走人",
  commute: "到家了",
  morning: "回家吃午饭",
};

// 场景里可以点的物件；主投入的物件点了就会结束本季
export function getHotspots(state: MarriageGameState, route: SceneRoute, brief = false): Hotspot[] {
  if (state.phase !== "turn" || route.id === "venue" || route.id === "matchmaking" || route.id === "reunion") return [];
  const childIds = new Set<string>(getAvailableChildActions(state));
  const parentIds = new Set<string>(getAvailableParentActions(state));
  const seeds: HotspotSeed[] = [];
  switch (route.id) {
    case "office":
    case "meeting-room":
      seeds.push(
        child("computer", "电脑", "今晚把手上的活干完", "work"),
        phone("desk-phone", "手机", "工位上偷偷看一眼消息", "chats"),
        child("training", "内训海报", "报名公司的技能课", "study"),
        child("leave", "找领导请调休", "推掉额外任务，歇一歇", "rest"),
      );
      break;
    case "hospital":
      seeds.push(
        phone("hospital-phone", "家庭群", "把检查结果发到群里", "chat", "family"),
        phone("hospital-call", "给妈妈回电话", "问问今晚谁来陪床", "call"),
        child("hospital-bench", "走廊长椅", "坐一会儿，缓一缓", "rest"),
      );
      break;
    case "commute":
      seeds.push(
        phone("street-phone", "手机", "地铁上刷刷消息和朋友圈", "chats"),
        phone("moments", "朋友圈", "看看大家这周在干嘛", "moments"),
        child("barber", "理发店", "顺路理个发", "groom"),
        child("track", "江边夜跑", "绕江边跑两圈", "exercise"),
      );
      break;
    case "room":
      seeds.push(
        child("mirror", "镜子与衣柜", "收拾一下自己", "groom"),
        child("dumbbell", "哑铃", "练一会儿", "exercise"),
        child("bookshelf", "书架", "学点东西，找找机会", "study"),
        child("laptop", "电脑", "打开电脑继续加班", "work"),
        child("bed", "床", "什么也不做，好好睡一觉", "rest"),
        phone("room-phone", "手机", "回消息、约人、看朋友圈", "chats"),
        { id: "calendar", label: "墙上的日历", detail: "安排这个周末", target: { kind: "plan" } },
        phone("bill", "账单信封", "看看这个月的钱", "bank"),
      );
      break;
    case "home":
      seeds.push(
        child("dining", "餐桌", "和伴侣好好谈谈钱、家务和分工", "build-home"),
        child("kid-room", "孩子的房间", "先听孩子说累不累", "protect-child"),
        child("home-laptop", "电脑", "把工作先做完", "work"),
        child("sofa", "沙发", "推掉所有事，歇一歇", "rest"),
        phone("home-phone", "手机", "回消息、看朋友圈", "chats"),
        { id: "calendar", label: "冰箱上的日历", detail: "安排这个周末", target: { kind: "plan" } },
        phone("bill", "账单", "看看家里的账", "bank"),
      );
      break;
    case "park":
      seeds.push(
        parent("board", "相亲角的简历墙", "这份不满意，换一个", "next"),
        parent("bench", "姐妹们的长椅", "听听谁家孩子又结婚了", "compare"),
        phone("park-phone", "手机", "给孩子发消息", "chat", "child"),
        phone("sisters", "广场舞群", "看看群里在聊什么", "chat", "sisters"),
      );
      break;
    case "parent-home":
      seeds.push(
        parent("drawer", "抽屉里的存折", "拿出一笔钱真正帮一把", "support"),
        parent("tea", "茶几上的电话", "打个电话，先听孩子说", "listen"),
        phone("home-phone", "手机", "给孩子发消息", "chat", "child"),
        { id: "calendar", label: "挂历", detail: "看看这一季还能做什么", target: { kind: "plan" } },
      );
      break;
    default:
      break;
  }
  const hotspots: Hotspot[] = seeds.map(seed => ({
    ...seed,
    enabled: seed.target.kind === "child-action"
      ? state.activeActor === "child" && childIds.has(seed.target.id)
      : seed.target.kind === "parent-action"
        ? state.activeActor === "parent" && parentIds.has(seed.target.id)
        : true,
  }));
  const next = !brief && state.week.actor === state.activeActor ? nextSlot(state.week) : null;
  if (next) hotspots.push({ id: "advance", label: ADVANCE_LABELS[state.week.slot] ?? "继续", detail: "进入这一周的下一个时段", target: { kind: "advance" }, enabled: true });
  return hotspots;
}

// 春节年夜饭：按季推进时每年第 1 季，按年推进时每回合都有
export function isReunionTurn(state: Pick<MarriageGameState, "turn" | "monthsPerTurn" | "currentEventId">) {
  return state.monthsPerTurn === 12 || (state.turn - 1) % 4 === 0 || state.currentEventId === "holiday-table";
}

// 节日只提醒，不惩罚：七夕在第 3 季，对方生日由对象哈希固定在某一季
export function getFestivalReminders(state: MarriageGameState) {
  const reminders: string[] = [];
  if (!state.candidateId || state.matchClosed || state.stage === "single") return reminders;
  const quarter = (state.turn - 1) % 4;
  if (quarter === 2) reminders.push("这周末是七夕。不用非得送礼，一句认真的话也可以。");
  if (hashKey(state.candidateId, "birthday") % 4 === quarter) reminders.push("日历提醒：对方的生日在这一季。");
  return reminders;
}
