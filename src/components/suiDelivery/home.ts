import type { DeliverySave } from "./types";

export const HOME_DECORATIONS = [
  {
    id: "red-cloth",
    name: "红格桌布",
    price: 24,
    order: "attic-soup",
    unlock: "送达阁楼热汤",
    detail: "给出餐台铺一块洗得软软的桌布。",
  },
  {
    id: "menu-board",
    name: "店门小黑板",
    price: 48,
    order: "oven-crab",
    unlock: "关好大烤炉并送达",
    detail: "把今天的热汤画在门口，让路过的人也看见。",
  },
  {
    id: "warm-lights",
    name: "暖灯串",
    price: 72,
    order: "serving-machine",
    unlock: "送完午间集市",
    detail: "回来得再晚，小馆门口也有一盏灯。",
  },
  {
    id: "herb-shelf",
    name: "窗边香草架",
    price: 36,
    order: "greenhouse-dinner",
    unlock: "送达温室晚餐",
    detail: "留一排小陶盆，种下小绿送来的香草。",
  },
] as const;
export type HomeDecorationId = (typeof HOME_DECORATIONS)[number]["id"];
export type HomeActionResult =
  | "bought"
  | "placed"
  | "stored"
  | "locked"
  | "short"
  | "unknown";

/** Reconstruct spending in catalogue order; never trust the stored balance or duplicate receipts. */
export function restoreHome(save: DeliverySave, raw: unknown) {
  const data =
    raw && typeof raw === "object"
      ? (raw as { owned?: unknown; displayed?: unknown })
      : {};
  save.home = { owned: [], displayed: [] };
  for (const item of HOME_DECORATIONS) {
    if (
      !Array.isArray(data.owned) ||
      !data.owned.includes(item.id) ||
      !save.delivered.includes(item.order) ||
      save.money < item.price
    ) continue;
    save.home.owned.push(item.id);
    save.money -= item.price;
  }
  const { displayed } = data;
  save.home.displayed = Array.isArray(displayed)
    ? save.home.owned.filter((id) => displayed.includes(id))
    : [...save.home.owned];
}

export function decorateHome(save: DeliverySave, id: string): HomeActionResult {
  const item = HOME_DECORATIONS.find((v) => v.id === id);
  if (!item) return "unknown";
  if (!save.delivered.includes(item.order)) return "locked";
  if (!save.home.owned.includes(id)) {
    if (save.money < item.price) return "short";
    save.money -= item.price;
    save.home.owned.push(id);
    save.home.displayed.push(id);
    return "bought";
  }
  if (save.home.displayed.includes(id)) {
    save.home.displayed = save.home.displayed.filter((v) => v !== id);
    return "stored";
  }
  save.home.displayed.push(id);
  return "placed";
}

export function homeKeepsakes(save: DeliverySave) {
  return [
    {
      id: "flowers",
      name: "小绿的开店花盆",
      text: "阁楼窗边的花挪到了小馆门口。",
      earned: save.delivered.includes("attic-soup"),
    },
    {
      id: "photo",
      name: "炉前第一张合照",
      text: "烤炉终于安静下来，大家挤在镜头里笑了。",
      earned: save.delivered.includes("oven-crab"),
    },
    {
      id: "herbs",
      name: "温室带来的香草",
      text: "雨停后，小绿留了一把种子，让明天的汤也有香气。",
      earned: save.delivered.includes("greenhouse-dinner"),
    },
    {
      id: "bowl",
      name: "留给岁己的碗",
      text: "今晚最后一碗饭，终于是给自己的。",
      earned: save.delivered.includes("banquet-machine"),
    },
  ].filter((v) => v.earned);
}

export function homeNeighbors(save: DeliverySave) {
  const done = (id: string) => save.delivered.includes(id);
  return [
    {
      id: "gardener",
      name: "小绿",
      art: "viridis",
      met: done("attic-soup"),
      line: done("greenhouse-dinner")
        ? "种子放在窗边了。等它发芽，明天来喝香草汤。"
        : "花盆放门口啦。这回换我提醒你：忙完也要吃饭。",
    },
    {
      id: "baker",
      name: "帕可",
      art: "pako",
      met: done("bakery-backdoor"),
      line: done("bird-supper")
        ? "小鸟终于肯回巢了。留在店里的这袋面包，是给你的，别全分出去呀。"
        : "后门开着，面包也替你留好了。午市前记得回来垫一口。",
    },
    {
      id: "mechanic",
      name: "栞栞",
      art: "shiori",
      met: done("oven-crab") || save.kindness,
      line: save.kindness
        ? "小猫又来门口等了。我给它留了半块，也给你留了半块。"
        : "烤炉修好了，合照也挂好了。下回……早餐给我多留一份吧。",
    },
    {
      id: "doctor",
      name: "露医生",
      art: "rutice",
      met: done("market-stalls"),
      line: done("last-table")
        ? "大家的碗都齐了。红椅子我看着呢，谁也不许占你的座位。"
        : "摊位间的便道铺好了。饿着肚子跑不远，下一单前歇一歇。",
    },
    {
      id: "freight",
      name: "货运员",
      art: "raccoon-archer",
      met: done("freight-lunch"),
      line: save.home.owned.includes("warm-lights")
        ? "灯串捎来啦。以后车停这儿，先闻闻今天煮什么。"
        : "下回想挂灯串，我替你捎来。今天先闻闻锅里煮什么。",
    },
    {
      id: "shelter",
      name: "又一",
      art: "youyi",
      met: done("rain-relay"),
      line: done("scenery-lifts")
        ? "后台的汤喝完啦。我把灯挂到长桌上，等你忙完一起吃。"
        : "棚下给你留了干地方。粥还热着，雨慢一点也没关系。",
    },
  ].filter((v) => v.met);
}
