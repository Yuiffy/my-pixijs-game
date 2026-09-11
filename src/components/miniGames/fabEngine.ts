import { clamp, round, random, log, Ending, Log } from "./core";

export const FAB_STYLES = [
  {
    id: "memory",
    name: "长河存储",
    perk: "高密度路线：初始库存 55，成本更低。",
  },
  {
    id: "hbm",
    name: "海峰半导体",
    perk: "AI 内存路线：繁荣周期售价额外 +18%。",
  },
  {
    id: "foundry",
    name: "群星晶圆",
    perk: "灵活代工路线：初始资金 +50 M，良率更高。",
  },
] as const;
export type FabStyle = (typeof FAB_STYLES)[number]["id"];
export type FabAction = "expand" | "research" | "loan" | "repay";
export type Factory = {
  name: string;
  cash: number;
  debt: number;
  fabs: number;
  inventory: number;
  tech: number;
  building: number;
  sold: number;
  profit: number;
  style: FabStyle;
  bankrupt: boolean;
  settledCash: number;
};
export type FabState = {
  version: 1;
  kind: "fab";
  seed: number;
  rng: number;
  turn: number;
  actions: number;
  used: FabAction[];
  player: Factory;
  rivals: Factory[];
  price: number;
  demand: number;
  cycle: number;
  shock: number;
  pricing: number;
  production: number;
  shipment: number;
  history: { turn: number; price: number; cash: number }[];
  logs: Log[];
  ending: Ending | null;
};
export const CYCLES = [
  {
    name: "库存寒冬",
    text: "下游去库存，现货降价。满产可能扩大亏损。",
    price: 1.15,
    demand: 90,
  },
  {
    name: "需求复苏",
    text: "终端补库存。扩建需要两季，提前布局下一轮需求。",
    price: 2,
    demand: 180,
  },
  {
    name: "AI 爆发",
    text: "数据中心抢购内存，高价与缺货并存。",
    price: 3.5,
    demand: 310,
  },
  {
    name: "产能过剩",
    text: "上一轮扩产集中投产，买家压价。现金比产量更珍贵。",
    price: 1.45,
    demand: 135,
  },
];
export const FAB_ACTIONS: { id: FabAction; name: string; hint: string }[] = [
  {
    id: "expand",
    name: "新建晶圆厂",
    hint: "110 M · 两季后增加 1 座工厂；最多 5 座。",
  },
  {
    id: "research",
    name: "改进制程",
    hint: "42 M · 良率提高、单位成本降低；最高 5 级。",
  },
  {
    id: "loan",
    name: "产业贷款",
    hint: "借入 80 M · 每季利率 4%；债务上限 240 M。",
  },
  { id: "repay", name: "偿还贷款", hint: "偿还最多 80 M 本金，减少后续利息。" },
];
export function createFactory(name: string, style: FabStyle): Factory {
  return {
    name,
    style,
    cash: style === "foundry" ? 270 : 220,
    debt: 0,
    fabs: 2,
    inventory: style === "memory" ? 55 : 30,
    tech: style === "foundry" ? 2 : 1,
    building: 0,
    sold: 0,
    profit: 0,
    bankrupt: false,
    settledCash: -1,
  };
}
export function createFab(seed = 2026, style: FabStyle = "memory"): FabState {
  return {
    version: 1,
    kind: "fab",
    seed,
    rng: seed,
    turn: 1,
    actions: 2,
    used: [],
    player: createFactory(FAB_STYLES.find((s) => s.id === style)!.name, style),
    rivals: [
      createFactory("北陆芯业", "hbm"),
      createFactory("新湾电子", "foundry"),
      createFactory("远洋存储", "memory"),
    ],
    price: 1.15,
    demand: 90,
    cycle: 0,
    shock: 0,
    pricing: 1,
    production: 0.5,
    shipment: 1,
    history: [{ turn: 0, price: 1.15, cash: style === "foundry" ? 270 : 220 }],
    logs: [
      {
        turn: 1,
        text: "六年，二十四个季度。每季设置产量、报价、出货，再决定资本开支。金额单位为百万。",
      },
    ],
    ending: null,
  };
}
export const capacity = (f: Factory) => Math.round(f.fabs * (22 + f.tech * 3));
export const unitCost = (f: Factory) => Math.round(
    Math.max(0.45, 1.15 - f.tech * 0.1 - (f.style === "memory" ? 0.1 : 0)) *
      100,
  ) / 100;
export const liquidation = (f: Factory, price: number) => (f.settledCash >= 0 ? f.settledCash : round(
    f.cash +
      f.inventory * price * 0.65 +
      f.fabs * 55 +
      (f.building ? 55 : 0) -
      f.debt,
  ));
export const fabQuote = (s: FabState, f: Factory, pricing: number) => round(s.price * pricing * (f.style === "hbm" && s.cycle === 2 ? 1.18 : 1));
export function fabBlocked(s: FabState, action: FabAction): string {
  if (s.ending) return "本局已结束";
  if (!s.actions) return "本季资本行动已用完";
  if (s.used.includes(action)) return "本季已执行";
  if (action === "expand" && s.player.building) return "已有工厂在建设";
  if (action === "expand" && s.player.fabs >= 5) return "工厂数量已满";
  if (action === "expand" && s.player.cash < 110) return "需要 110 M";
  if (action === "research" && s.player.cash < 42) return "需要 42 M";
  if (action === "research" && s.player.tech >= 5) return "制程已满级";
  if (action === "loan" && s.player.debt >= 240) return "贷款已达上限";
  if (action === "repay" && !s.player.debt) return "没有未偿还贷款";
  if (action === "repay" && s.player.cash < Math.min(80, s.player.debt)) return "还款资金不足";
  return "";
}
export function actFab(state: FabState, action: FabAction): FabState {
  if (fabBlocked(state, action)) return state;
  const s: FabState = structuredClone(state);
  s.actions--;
  s.used.push(action);
  if (action === "expand") {
    s.player.cash -= 110;
    s.player.building = 2;
  }
  if (action === "research") {
    s.player.cash -= 42;
    s.player.tech++;
  }
  if (action === "loan") {
    s.player.cash += 80;
    s.player.debt += 80;
  }
  if (action === "repay") {
    const amount = Math.min(80, s.player.debt);
    s.player.cash -= amount;
    s.player.debt -= amount;
  }
  log(s, `${FAB_ACTIONS.find((a) => a.id === action)?.name}完成。`);
  return s;
}
export type FabOrders = {
  production: number;
  pricing: number;
  shipment: number;
};
export function fabForecast(s: FabState) {
  const produced = Math.floor(capacity(s.player) * s.production);
  return {
    produced,
    offered: Math.floor((s.player.inventory + produced) * s.shipment),
    cost: round(
      produced * unitCost(s.player) + s.player.fabs * 6 + s.player.debt * 0.04,
    ),
    quote: fabQuote(s, s.player, s.pricing),
  };
}
export function endFabTurn(state: FabState): FabState {
  if (state.ending) return state;
  const s: FabState = structuredClone(state);
  const firms = [s.player, ...s.rivals];
  const orders: FabOrders[] = [
    { pricing: s.pricing, production: s.production, shipment: s.shipment },
  ];
  s.rivals.forEach((f, i) => {
    if (!f.bankrupt) {
      if (
        f.cash > 185 &&
        !f.building &&
        f.fabs < 5 && capacity(f) < 95 + i * 8 &&
        [1, 2].includes(s.cycle)
      ) {
        f.cash -= 110;
        f.building = 2;
      }
      if (f.cash > 110 && f.tech < 5 && s.turn % 3 === i) {
        f.cash -= 42;
        f.tech++;
      }
    }
    const targetStock = (s.demand / 4) * (i === 0 ? 1.5 : 1.15);
    orders.push({
      pricing: [0.85, 1, 1.2][(i + Math.floor(s.turn / 4)) % 3],
      production: f.inventory >= targetStock ? 0 : f.inventory + capacity(f) * 0.5 >= targetStock ? 0.5 : 1,
      shipment: s.cycle === 1 && i === 0 ? 0.5 : 1,
    });
  });
  const offers = firms.map((f, i) => {
    if (f.bankrupt) return { produced: 0, offer: 0, weight: 0, sold: 0, quote: 0 };
    const produced = Math.floor(capacity(f) * orders[i].production);
    f.inventory += produced;
    return {
      produced,
      offer: Math.floor(f.inventory * orders[i].shipment),
      weight: 1 / orders[i].pricing ** 3,
      sold: 0,
      quote: fabQuote(s, f, orders[i].pricing),
    };
  });
  // Allocate a finite market in units: cheaper quotes attract demand; unsold demand flows to remaining suppliers.
  let allocated = 0;
  while (allocated < s.demand) {
    let winner = -1;
    let best = -1;
    offers.forEach((offer, i) => {
      const score = offer.weight / (offer.sold + 1);
      const willingness = Math.floor(
        s.demand * Math.min(1, 1.25 / orders[i].pricing),
      );
      if (offer.sold < Math.min(offer.offer, willingness) && score > best) {
        winner = i;
        best = score;
      }
    });
    if (winner < 0) break;
    offers[winner].sold++;
    allocated++;
  }
  firms.forEach((f, i) => {
    if (f.bankrupt) { f.sold = 0; f.profit = 0; return; }
    const offer = offers[i];
    f.inventory -= offer.sold;
    f.sold = offer.sold;
    f.profit = round(
      offer.sold * offer.quote -
        offer.produced * unitCost(f) -
        f.fabs * 6 -
        f.inventory * 0.08 -
        f.debt * 0.04,
    );
    f.cash = round(f.cash + f.profit);
    if (f.building) {
      f.building--;
      if (!f.building) {
        f.fabs++;
        if (i === 0) log(s, "新厂投产！下一季度可使用新增产能。");
      }
    }
    if (f.cash < 0) { f.settledCash = Math.max(0, liquidation(f, s.price)); f.bankrupt = true; }
  });
  log(
    s,
    `出货 ${s.player.sold} 批，报价 ${offers[0].quote} M；季度净收益 ${s.player.profit} M，库存 ${s.player.inventory} 批。`,
  );
  s.history.push({ turn: s.turn, price: s.price, cash: s.player.cash });
  if (s.player.bankrupt) s.ending = {
      title: "停机清算",
      text: "现金不足以支付生产、仓储与利息。减少寒冬产量，提前出货或保留贷款额度，可以熬过低谷。",
      won: false,
    };
  else if (s.turn === 24) {
    const ranking = [...firms].sort(
      (a, b) => liquidation(b, s.price) - liquidation(a, s.price),
    );
    const rank = ranking.findIndex((f) => f === s.player) + 1;
    s.ending = {
      title: rank === 1 ? "穿越周期的赢家" : `六年终局 · 第 ${rank} 名`,
      text: `以期末现货价的 65% 清算库存，每座厂回收 55 M，扣除全部债务。你的最终资金为 ${liquidation(s.player, s.price)} M。${rank === 1 ? "你在行业起落中积累了最多财富。" : `${ranking[0].name}取得第一；下一局尝试提前一轮扩产，在需求高峰释放库存。`}`,
      won: rank === 1,
    };
  }
  if (!s.ending) {
    s.turn++;
    s.actions = 2;
    s.used = [];
    s.cycle = Math.floor((s.turn - 1) / 3) % 4;
    let roll: number;
    [s.rng, roll] = random(s.rng);
    s.shock = round((roll - 0.5) * 0.24);
    s.price = round(CYCLES[s.cycle].price * (1 + s.shock));
    const supply = firms
      .filter((f) => !f.bankrupt)
      .reduce((sum, f) => sum + capacity(f), 0);
    s.price = round(s.price * clamp(380 / Math.max(200, supply), 0.65, 1.1));
    s.demand = Math.round(CYCLES[s.cycle].demand * (1 + s.shock));
  }
  return s;
}
