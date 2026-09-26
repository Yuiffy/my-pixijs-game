/** RESET / 开蹬! — deterministic, serializable tabletop rules. All currency is fictional. */
export type Category = "game" | "personal" | "open" | "company";
export type Tier = 20 | 100 | 200;
export type Mode = "luna" | "sol" | "astra" | "ultra" | "turbo";
export type Strategy = "balanced" | "builder" | "sprinter" | "banker";
export const SAVE_KEY = "reset-rush-v1";
export const PLANS: Record<Tier, { name: string; capacity: number }> = {
  20: { name: "PLUS", capacity: 24 },
  100: { name: "PRO 100", capacity: 90 },
  200: { name: "PRO 200", capacity: 180 },
};
export const MODES: Record<
  Mode,
  { name: string; cost: number; work: number; bugs: number }
> = {
  luna: { name: "Luna", cost: 0, work: 2, bugs: 0 },
  sol: { name: "Sol", cost: 4, work: 6, bugs: 0 },
  astra: { name: "Astra", cost: 9, work: 11, bugs: 0 },
  ultra: { name: "Ultra", cost: 24, work: 20, bugs: 0 },
  turbo: { name: "Ultra + Turbo", cost: 48, work: 38, bugs: 1 },
};
export const CATEGORIES: Record<
  Category,
  { name: string; short: string; perk: string }
> = {
  game: { name: "碉游", short: "GAME", perk: "高声望 · 发布抢首发" },
  personal: { name: "个人项目", short: "INDIE", perk: "每周 +$15 被动收入" },
  open: {
    name: "开源项目",
    short: "OPEN SOURCE",
    perk: "付费模型产出永久 +1，最多 +3",
  },
  company: {
    name: "公司项目",
    short: "CONTRACT",
    perk: "高额回款 · 8 天交付期限",
  },
};
export interface Project {
  id: number;
  name: string;
  category: Category;
  need: number;
  vp: number;
  cash: number;
  work: number;
  bugs: number;
  deadline: number | null;
}
export interface Account {
  id: number;
  tier: Tier;
  quota: number;
  nextReset: number;
  paidUntil: number;
  banks: number[];
  lastBankDay: number;
}
export interface Player {
  id: number;
  name: string;
  strategy: Strategy;
  cash: number;
  vp: number;
  knowledge: number;
  accounts: Account[];
  projects: Project[];
  shipped: Project[];
  used: number;
  resetGain: number;
  wasted: number;
  expired: number;
  banksUsed: number;
  collisions: number;
}
export interface EventCard {
  id: string;
  title: string;
  quote: string;
  detail: string;
  chance: number;
  effect: "signal" | "instant" | "bank" | "sale" | "jam" | "quiet";
}
export interface Log {
  day: number;
  text: string;
  player: number | null;
}
export interface Receipt {
  title: string;
  text: string;
  kind: "normal" | "bank" | "quiet";
  gains: {
    player: number;
    gained: number;
    unused: number;
    collision: boolean;
  }[];
}
export interface Game {
  version: 1;
  seed: number;
  rng: number;
  day: number;
  length: number;
  phase: "plan" | "reveal" | "over";
  players: Player[];
  market: Project[];
  serial: number;
  event: EventCard;
  events: string[];
  resetDeck: ("normal" | "bank")[];
  order: number[];
  cursor: number;
  logs: Log[];
  awards: { id: string; name: string; vp: number; owner: number | null }[];
  receipt: Receipt | null;
  message: string;
}
export type Action =
  | { type: "develop"; project: number; account: number; mode: Mode }
  | { type: "test"; project: number }
  | { type: "claim"; project: number }
  | { type: "bank"; account: number }
  | { type: "buy"; tier: Tier }
  | { type: "renew"; account: number }
  | { type: "upgrade"; account: number; tier: Tier }
  | { type: "abandon"; project: number }
  | { type: "freelance" }
  | { type: "pass" };

export const EVENTS: EventCard[] = [
  {
    id: "riddle",
    title: "他又开始说谜语了",
    quote: "“something is cooking 👀”",
    detail: "今晚 45% 触发赠礼。先蹬为敬，还是当没看见？",
    chance: 45,
    effect: "signal",
  },
  {
    id: "promise",
    title: "今晚，真的会 reset",
    quote: "“yes. resetting limits tonight.”",
    detail: "今晚必定翻重置牌。可能直接补满，也可能只发银行券。",
    chance: 100,
    effect: "signal",
  },
  {
    id: "quiet",
    title: "平静得有点不习惯",
    quote: "“have a nice day, builders.”",
    detail: "今晚没有赠礼。让账号按自己的 7 天周期恢复。",
    chance: 0,
    effect: "quiet",
  },
  {
    id: "gift",
    title: "存起来，下次再蹬",
    quote: "“a banked reset for everyone.”",
    detail: "早晨每个有效订阅账号获得 1 张银行券，30 天后过期。",
    chance: 0,
    effect: "bank",
  },
  {
    id: "now",
    title: "没通知，直接 reset！",
    quote: "“limits reset. go build.”",
    detail: "早晨立即补满有效账号，旧额度不叠加。今晚不再重置。",
    chance: 0,
    effect: "instant",
  },
  {
    id: "soon",
    title: "Soon™",
    quote: "“very, very soon.”",
    detail: "今晚 70% 触发赠礼。越像承诺，就越值得赌吗？",
    chance: 70,
    effect: "signal",
  },
  {
    id: "ellipsis",
    title: "只有三个点",
    quote: "“...”",
    detail: "今晚 25% 触发赠礼。今天的阅读理解有点贵。",
    chance: 25,
    effect: "signal",
  },
  {
    id: "sale",
    title: "Turbo 快乐日",
    quote: "“let’s make it go faster.”",
    detail: "今天 Turbo 消耗从 48 降到 36。照样会写出 bug。",
    chance: 0,
    effect: "sale",
  },
  {
    id: "jam",
    title: "周末 Game Jam",
    quote: "“show me what you built.”",
    detail: "今天发布碉游，额外获得 4 声望。今晚 35% 触发赠礼。",
    chance: 35,
    effect: "jam",
  },
  {
    id: "maybe",
    title: "这条推文有点东西",
    quote: "“builders deserve more.”",
    detail: "今晚 60% 触发赠礼。银行券可以留着，今天的行动不行。",
    chance: 60,
    effect: "signal",
  },
  {
    id: "again",
    title: "再来一次",
    quote: "“one more reset. you earned it.”",
    detail: "今晚必定翻重置牌。开蹬窗口只剩今天。",
    chance: 100,
    effect: "signal",
  },
  {
    id: "offline",
    title: "tibo 今天去爬山了",
    quote: "“touching grass.”",
    detail: "没有赠礼。是补测试、接外包和攒钱的好日子。",
    chance: 0,
    effect: "quiet",
  },
];
const TEMPLATES: [string, Category, number, number, number][] = [
  ["只有一条命", "game", 42, 23, 35],
  ["猫猫自走棋", "game", 56, 31, 45],
  ["下班后勇者", "game", 36, 19, 30],
  ["像素宇宙", "game", 68, 39, 50],
  ["我的第二大脑", "personal", 18, 8, 30],
  ["极简记账本", "personal", 14, 6, 25],
  ["今天吃什么", "personal", 22, 10, 35],
  ["专注白噪音", "personal", 26, 12, 40],
  ["tiny-agent", "open", 24, 11, 15],
  ["一键部署工具", "open", 30, 15, 20],
  ["开源 UI 积木", "open", 20, 9, 10],
  ["本地模型路由", "open", 34, 17, 25],
  ["老板的新后台", "company", 26, 8, 125],
  ["周五紧急需求", "company", 20, 5, 95],
  ["客户说很简单", "company", 38, 12, 160],
  ["再改最后一版", "company", 32, 10, 145],
];
const copy = (g: Game): Game => JSON.parse(JSON.stringify(g)) as Game;
function random(g: Game): number {
  g.rng = (g.rng * 1664525 + 1013904223) % 4294967296;
  return g.rng / 4294967296;
}
function shuffle<T>(g: Game, values: T[]): T[] {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function log(g: Game, text: string, player: number | null = null) {
  g.logs.unshift({ day: g.day, text, player });
  g.logs = g.logs.slice(0, 100);
}
function project(g: Game, template?: number): Project {
  const available = TEMPLATES.filter(([name]) => !g.market.some(j => j.name === name));
  const [name, category, need, vp, cash] = template === undefined
    ? available[Math.floor(random(g) * available.length)] : TEMPLATES[template];
  g.serial++;
  return {
    id: g.serial,
    name,
    category,
    need,
    vp,
    cash,
    work: 0,
    bugs: 0,
    deadline: null,
  };
}
function account(g: Game, tier: Tier): Account {
  g.serial++;
  return {
    id: g.serial,
    tier,
    quota: PLANS[tier].capacity,
    nextReset: g.day + 7,
    paidUntil: g.day + 29,
    banks: [],
    lastBankDay: 0,
  };
}
export const activeAccount = (g: Game, a: Account) => a.paidUntil >= g.day;
export const actionsLeft = (g: Game, id = 0) => g.order.slice(g.cursor).filter((p) => p === id).length;
export function score(p: Player) {
  const variety = new Set(p.shipped.map((x) => x.category)).size;
  return {
    projects: p.vp,
    variety: variety === 4 ? 12 : variety === 3 ? 5 : 0,
    cash: Math.min(10, Math.floor(p.cash / 100)),
    quota: Math.min(10, Math.floor(p.used / 120)),
    total:
      p.vp +
      (variety === 4 ? 12 : variety === 3 ? 5 : 0) +
      Math.min(10, Math.floor(p.cash / 100)) +
      Math.min(10, Math.floor(p.used / 120)),
  };
}
export function modeStats(g: Game, p: Player, mode: Mode) {
  const m = MODES[mode];
  return {
    ...m,
    cost: mode === "turbo" && g.event.effect === "sale" ? 36 : m.cost,
    work: m.work + (mode === "luna" ? 0 : p.knowledge),
  };
}
function award(g: Game, p: Player) {
  const earned = [
    p.shipped.some((x) => x.category === "game"),
    new Set(p.shipped.map((x) => x.category)).size >= 3,
    p.used >= 500,
  ];
  g.awards.forEach((a, i) => {
    if (a.owner === null && earned[i]) {
      a.owner = p.id;
      p.vp += a.vp;
      log(g, `${p.name} 抢到「${a.name}」：+${a.vp} 声望！`, p.id);
    }
  });
}
function release(g: Game, p: Player, job: Project) {
  if (job.work < job.need || job.bugs > 0) return;
  const jam = job.category === "game" && g.event.effect === "jam" ? 4 : 0;
  p.vp += job.vp + jam;
  p.cash += job.cash;
  if (job.category === "open") p.knowledge = Math.min(3, p.knowledge + 1);
  p.projects = p.projects.filter((x) => x.id !== job.id);
  p.shipped.push(job);
  log(
    g,
    `${p.name} 发布《${job.name}》！+${job.vp + jam} 声望，+$${job.cash}${job.category === "open" ? "，研发效率 +1（上限 3）" : ""}`,
    p.id,
  );
  award(g, p);
}
function reset(g: Game, kind: "normal" | "bank"): Receipt {
  const gains = g.players.map((p) => {
    let gained = 0;
    let unused = 0;
    let collision = false;
    p.accounts
      .filter((a) => activeAccount(g, a))
      .forEach((a) => {
        if (kind === "bank") {
          if (a.banks.length < 3) {
            a.banks.push(g.day + 30);
            gained++;
          } else unused++;
        } else {
          gained += PLANS[a.tier].capacity - a.quota;
          unused += a.quota;
          a.quota = PLANS[a.tier].capacity;
          if (a.lastBankDay === g.day) {
            collision = true;
            p.collisions++;
          }
        }
      });
    if (kind === "normal") {
      p.resetGain += gained;
      p.wasted += unused;
    }
    return { player: p.id, gained, unused, collision };
  });
  const r: Receipt = {
    kind,
    gains,
    title: kind === "normal" ? "直接 RESET！" : "BANKED RESET 到账",
    text:
      kind === "normal"
        ? "有效账号额度补满，不叠加余额，不改变自然重置日。"
        : "每个有效账号 +1 张银行券。绑定账号，30 天有效，最多存 3 张。",
  };
  log(
    g,
    `${r.title} ${kind === "normal" ? `你补回 ${gains[0].gained} 额度，${gains[0].unused} 余额无法叠加。` : `你获得 ${gains[0].gained} 张银行券。`}`,
  );
  return r;
}
function drawEvent(g: Game): EventCard {
  if (g.day <= 4) return { ...EVENTS[g.day - 1] };
  if (!g.events.length) g.events = shuffle(
      g,
      EVENTS.map((e) => e.id),
    );
  const id = g.events.shift();
  return { ...(EVENTS.find((e) => e.id === id) ?? EVENTS[2]) };
}
function beginDay(g: Game) {
  g.phase = "plan";
  g.cursor = 0;
  g.receipt = null;
  const first = (g.day - 1) % 4;
  g.order = Array.from({ length: 12 }, (_, i) => (first + i) % 4);
  if (g.day > 1) {
    const oldest = g.market.reduce((a, b) => (a.id < b.id ? a : b));
    g.market[g.market.indexOf(oldest)] = project(g);
  }
  g.players.forEach((p) => {
    p.accounts.forEach((a) => {
      const before = a.banks.length;
      a.banks = a.banks.filter((d) => d > g.day);
      if (before > a.banks.length) {
        p.expired += before - a.banks.length;
        log(
          g,
          `${p.name} 有 ${before - a.banks.length} 张银行券过期了。`,
          p.id,
        );
      }
      while (a.nextReset <= g.day) {
        if (activeAccount(g, a)) {
          const gained = PLANS[a.tier].capacity - a.quota;
          a.quota = PLANS[a.tier].capacity;
          p.resetGain += gained;
          log(
            g,
            `${p.name} 的 ${PLANS[a.tier].name} 自然重置，补回 ${gained}。`,
            p.id,
          );
        }
        a.nextReset += 7;
      }
      if (a.paidUntil === g.day - 1) log(
          g,
          `${p.name} 的 ${PLANS[a.tier].name} 到期，续费后恢复使用。`,
          p.id,
        );
    });
    p.projects
      .filter((j) => j.deadline !== null && j.deadline < g.day)
      .forEach((j) => {
        p.vp -= 3;
        p.projects = p.projects.filter((x) => x.id !== j.id);
        log(g, `${p.name} 的《${j.name}》超期撤单，扣 3 声望。`, p.id);
      });
  });
  g.event = drawEvent(g);
  log(g, `早间消息：${g.event.title}`);
  if (g.event.effect === "instant") g.receipt = reset(g, "normal");
  if (g.event.effect === "bank") g.receipt = reset(g, "bank");
  g.message =
    g.day === 1
      ? "先选项目和模型，完成你的第一次开发。"
      : `第 ${g.day} 天。${g.event.detail}`;
  runBots(g);
}
export function createGame(
  seed = 260926,
  setup: "balanced" | "dual" | "lean" = "balanced",
  length = 42,
): Game {
  const g: Game = {
    version: 1,
    seed: Math.trunc(Math.abs(seed)) % 4294967296,
    rng: Math.trunc(Math.abs(seed)) % 4294967296,
    day: 1,
    length: length === 21 ? 21 : 42,
    phase: "plan",
    players: [],
    market: [],
    serial: 0,
    event: EVENTS[0],
    events: [],
    resetDeck: [],
    order: [],
    cursor: 0,
    logs: [],
    receipt: null,
    message: "",
    awards: [
      { id: "first-game", name: "碉游首发", vp: 5, owner: null },
      { id: "diversity", name: "三栖开发者", vp: 6, owner: null },
      { id: "pedal", name: "500 额度俱乐部", vp: 5, owner: null },
    ],
  };
  const specs: [string, Strategy, Tier[]][] = [
    [
      "你",
      "balanced",
      setup === "dual" ? [200, 200] : setup === "lean" ? [20] : [100],
    ],
    ["林工", "builder", [100]],
    ["阿卷", "sprinter", [200]],
    ["老周", "banker", [200, 200]],
  ];
  specs.forEach(([name, strategy, tiers], id) => {
    const accounts = tiers.map((t) => account(g, t));
    // One opening token per account makes the storage/timing tradeoff playable immediately.
    accounts.forEach((a) => {
      a.banks = [31];
    });
    g.players.push({
      id,
      name,
      strategy,
      cash: 500 - tiers.reduce<number>((n, t) => n + t, 0),
      vp: 0,
      knowledge: 0,
      accounts,
      projects: [project(g, 5)],
      shipped: [],
      used: 0,
      resetGain: 0,
      wasted: 0,
      expired: 0,
      banksUsed: 0,
      collisions: 0,
    });
  });
  g.market = [project(g, 0), project(g, 8), project(g, 12), project(g, 4)];
  g.resetDeck = shuffle(g, [
    "normal",
    "normal",
    "normal",
    "normal",
    "bank",
    "bank",
  ]);
  beginDay(g);
  return g;
}
export function actionError(g: Game, id: number, a: Action): string | null {
  const p = g.players[id];
  if (g.phase !== "plan" || g.order[g.cursor] !== id) return "现在不是你的行动时间。";
  if (a.type === "develop") {
    const j = p.projects.find((x) => x.id === a.project);
    const acc = p.accounts.find((x) => x.id === a.account);
    if (!j) return "先选择一个进行中的项目。";
    if (j.work >= j.need) return "代码写完了，先测试清除 bug 就能发布。";
    if (!MODES[a.mode]) return "请选择有效模型。";
    if (a.mode !== "luna" && (!acc || !activeAccount(g, acc))) return "这个订阅已到期，请续费或使用 Luna。";
    if (a.mode !== "luna" && acc && acc.quota < modeStats(g, p, a.mode).cost) return "额度不足。换账号、使用银行券，或切换 Luna。";
  }
  if (a.type === "test") {
    const j = p.projects.find((x) => x.id === a.project);
    if (!j || !j.bugs) return "当前项目没有需要修复的 bug。";
  }
  if (a.type === "claim") {
    if (p.projects.length >= 2) return "最多同时开发 2 个项目。先发布，或放弃一个。";
    if (!g.market.some((x) => x.id === a.project)) return "这个项目已经被别人接走了。";
  }
  if (a.type === "bank") {
    const acc = p.accounts.find((x) => x.id === a.account);
    if (!acc || !activeAccount(g, acc)) return "银行券需要有效订阅。";
    if (!acc.banks.some((d) => d > g.day)) return "这个账号没有有效银行券。";
    if (acc.quota === PLANS[acc.tier].capacity) return "额度已经满了，留着这张券。";
    if (acc.lastBankDay === g.day) return "每个账号每天最多使用 1 张银行券。";
  }
  if (a.type === "buy") {
    if (!PLANS[a.tier]) return "无效套餐。";
    if (p.accounts.length >= 3) return "最多持有 3 个账号。";
    if (p.cash < a.tier) return "现金不够，接点外包吧。";
  }
  if (a.type === "renew" || a.type === "upgrade") {
    const acc = p.accounts.find((x) => x.id === a.account);
    if (!acc) return "账号不存在。";
    if (a.type === "renew") {
      if (activeAccount(g, acc)) return "订阅到期后才能续费。";
      if (p.cash < acc.tier) return "续费资金不足。";
    } else {
      if (!PLANS[a.tier] || a.tier <= acc.tier || !activeAccount(g, acc)) return "只能升级有效订阅。";
      if (p.cash < a.tier - acc.tier) return "升级资金不足。";
    }
  }
  if (a.type === "abandon" && !p.projects.some((j) => j.id === a.project)) return "项目不存在。";
  return null;
}
function applyAction(g: Game, id: number, a: Action): boolean {
  const error = actionError(g, id, a);
  if (error) {
    if (!id) g.message = error;
    return false;
  }
  const p = g.players[id];
  if (a.type === "develop") {
    const j = p.projects.find((x) => x.id === a.project)!;
    const acc = p.accounts.find((x) => x.id === a.account);
    const m = modeStats(g, p, a.mode);
    if (acc && m.cost) acc.quota -= m.cost;
    p.used += m.cost;
    j.work = Math.min(j.need, j.work + m.work);
    j.bugs += m.bugs;
    log(
      g,
      `${p.name} 用 ${m.name} 开发《${j.name}》：+${m.work} 进度，−${m.cost} 额度${m.bugs ? "，+1 bug" : ""}。`,
      id,
    );
    release(g, p, j);
    award(g, p);
  } else if (a.type === "test") {
    const j = p.projects.find((x) => x.id === a.project)!;
    j.bugs = Math.max(0, j.bugs - 2);
    j.work = Math.min(j.need, j.work + 2);
    log(g, `${p.name} 测试《${j.name}》：修复 2 个 bug，+2 进度。`, id);
    release(g, p, j);
  } else if (a.type === "claim") {
    const index = g.market.findIndex((x) => x.id === a.project);
    const j = g.market[index];
    if (j.category === "company") j.deadline = g.day + 7;
    p.projects.push(j);
    g.market[index] = project(g);
    log(
      g,
      `${p.name} 接下《${j.name}》${j.deadline ? `，D${j.deadline} 前交付` : ""}。`,
      id,
    );
  } else if (a.type === "bank") {
    const acc = p.accounts.find((x) => x.id === a.account)!;
    acc.banks.sort((x, y) => x - y).shift();
    const gain = PLANS[acc.tier].capacity - acc.quota;
    acc.quota = PLANS[acc.tier].capacity;
    acc.lastBankDay = g.day;
    p.banksUsed++;
    log(
      g,
      `${p.name} 用掉 1 张银行券，补回 ${gain} 额度。自然重置仍在 D${acc.nextReset}。`,
      id,
    );
  } else if (a.type === "buy") {
    p.cash -= a.tier;
    p.accounts.push(account(g, a.tier));
    log(g, `${p.name} 开通 ${PLANS[a.tier].name} 新账号，−$${a.tier}。`, id);
  } else if (a.type === "renew") {
    const acc = p.accounts.find((x) => x.id === a.account)!;
    p.cash -= acc.tier;
    acc.paidUntil = g.day + 29;
    acc.quota = PLANS[acc.tier].capacity;
    acc.nextReset = g.day + 7;
    log(
      g,
      `${p.name} 续费 ${PLANS[acc.tier].name}，−$${acc.tier}，恢复满额。`,
      id,
    );
  } else if (a.type === "upgrade") {
    const acc = p.accounts.find((x) => x.id === a.account)!;
    const price = a.tier - acc.tier;
    acc.quota += PLANS[a.tier].capacity - PLANS[acc.tier].capacity;
    p.cash -= price;
    acc.tier = a.tier;
    log(
      g,
      `${p.name} 补差价 $${price} 升级 ${PLANS[a.tier].name}，订阅期限不变。`,
      id,
    );
  } else if (a.type === "abandon") {
    p.projects = p.projects.filter((x) => x.id !== a.project);
    p.vp -= 2;
    log(g, `${p.name} 放弃项目，−2 声望。`, id);
  } else if (a.type === "freelance") {
    p.cash += 25;
    log(g, `${p.name} 手写外包，+$25。`, id);
  }
  if (a.type !== "bank") g.cursor++;
  if (!id) g.message =
      a.type === "pass"
        ? "留出一点生活。"
        : (g.logs.find((l) => l.player === 0)?.text ?? "行动完成。");
  return true;
}
/** AI reads only public information: never the PRNG, future event, or deck order. */
export function chooseAction(g: Game, id: number, strategy?: Strategy): Action {
  const p = g.players[id];
  const style = strategy ?? p.strategy;
  const accounts = p.accounts.filter((a) => activeAccount(g, a));
  const capacity = accounts.reduce((n, a) => n + a.quota, 0);
  const remaining = g.length - g.day;
  if (!accounts.length) {
    const expired = [...p.accounts]
      .sort((a, b) => a.tier - b.tier)
      .find((a) => p.cash >= a.tier);
    if (expired && remaining > 2) return { type: "renew", account: expired.id };
    if (p.cash < 20 && remaining > 3) return { type: "freelance" };
  }
  const bank = accounts.find(
    (a) => a.quota < 24 &&
      a.banks.length &&
      a.lastBankDay !== g.day &&
      (a.nextReset > g.day + 1 || a.banks[0] <= g.day + 1) &&
      (g.event.chance < 100 || !capacity),
  );
  if (bank) return { type: "bank", account: bank.id };
  if (
    style === "banker" &&
    p.accounts.length < 2 &&
    p.cash >= 280 &&
    remaining > 12
  ) return { type: "buy", tier: 200 };
  const unfinished = [...p.projects].sort(
    (a, b) => (a.deadline ?? 999) - (b.deadline ?? 999) ||
      a.need - a.work - (b.need - b.work),
  );
  const j = unfinished[0];
  if (j?.bugs && (j.work >= j.need || j.bugs >= 2)) return { type: "test", project: j.id };
  if (j) {
    const acc = [...accounts]
      .sort((a, b) => a.nextReset - b.nextReset || a.quota - b.quota)
      .find((a) => a.quota >= 4);
    if (acc) {
      const left = j.need - j.work;
      const urgency =
        g.event.chance >= 60 || acc.nextReset <= g.day + 1 || remaining <= 2;
      const modes: Mode[] = ["sol", "astra", "ultra", "turbo"];
      const usable = modes.filter((m) => modeStats(g, p, m).cost <= acc.quota);
      const finish = usable.find(
        (m) => modeStats(g, p, m).work >= left && !MODES[m].bugs,
      );
      if (finish) return {
          type: "develop",
          project: j.id,
          account: acc.id,
          mode: finish,
        };
      const preferred: Mode =
        style === "sprinter" || urgency
          ? "turbo"
          : style === "builder"
            ? "astra"
            : "ultra";
      const mode = usable.includes(preferred)
        ? preferred
        : usable[usable.length - 1];
      if (mode) return { type: "develop", project: j.id, account: acc.id, mode };
    }
    if (j.bugs) return { type: "test", project: j.id };
    if (p.cash < 80 && remaining > 5 && j.need - j.work > 4) return { type: "freelance" };
    return {
      type: "develop",
      project: j.id,
      account: p.accounts[0].id,
      mode: "luna",
    };
  }
  const ranked = g.market
    .map((m) => {
      let value = m.vp / (Math.ceil(m.need / 18) + 1);
      if (m.category === "open" && p.knowledge < 3 && remaining > 12) value += style === "builder" ? 7 : 3;
      if (m.category === "company" && p.cash < 200) value += 6;
      if (m.category === "personal" && g.day < 14) value += 2;
      if (m.category === "game" && style === "sprinter") value += 2;
      if (!p.shipped.some((x) => x.category === m.category)) value += 2;
      if (remaining < 3 && m.need > Math.max(2, capacity)) value -= 10;
      return { project: m, value };
    })
    .sort((a, b) => b.value - a.value);
  if (ranked[0] && remaining >= 1) return { type: "claim", project: ranked[0].project.id };
  return { type: "freelance" };
}
function runBots(g: Game) {
  let guard = 0;
  while (g.cursor < g.order.length && g.order[g.cursor] !== 0 && guard++ < 50) {
    const id = g.order[g.cursor];
    if (!applyAction(g, id, chooseAction(g, id))) applyAction(g, id, { type: "pass" });
  }
}
export function act(state: Game, action: Action): Game {
  const g = copy(state);
  if (applyAction(g, 0, action)) runBots(g);
  return g;
}
export function endDay(state: Game): Game {
  if (state.phase !== "plan") return state;
  const g = copy(state);
  while (g.cursor < g.order.length) {
    if (g.order[g.cursor] === 0) applyAction(g, 0, { type: "pass" });
    runBots(g);
  }
  const trigger = g.event.chance > 0 && random(g) * 100 < g.event.chance;
  if (trigger) {
    if (!g.resetDeck.length) g.resetDeck = shuffle(g, [
        "normal",
        "normal",
        "normal",
        "normal",
        "bank",
        "bank",
      ]);
    g.receipt = reset(g, g.resetDeck.shift()!);
  } else {
    g.receipt = {
      kind: "quiet",
      title: g.event.chance ? "今晚没有 reset。" : "今天，收工。",
      text: g.event.chance
        ? "谜语没有兑现。用剩下的额度继续生活，或者让 Luna 顶一顶。"
        : "没有夜间赠礼。自然重置会在各账号标注的早晨发生。",
      gains: [],
    };
    log(g, g.receipt.title);
  }
  if (g.day % 7 === 0) g.players.forEach((p) => {
      const income =
        35 + p.shipped.filter((j) => j.category === "personal").length * 15;
      p.cash += income;
      log(g, `${p.name} 领取周薪与个人项目收入：+$${income}。`, p.id);
    });
  g.phase = "reveal";
  g.message = g.receipt.title;
  return g;
}
export function nextDay(state: Game): Game {
  if (state.phase !== "reveal") return state;
  const g = copy(state);
  if (g.day >= g.length) {
    g.phase = "over";
    return g;
  }
  g.day++;
  beginDay(g);
  return g;
}
export function textState(g: Game) {
  // Do not expose deck order, future draws or PRNG state to the player / browser diagnostics.
  return {
    title: "RESET / 开蹬！",
    phase: g.phase,
    day: g.day,
    length: g.length,
    actions: actionsLeft(g),
    turn: g.order[g.cursor] ?? null,
    event: g.event,
    market: g.market,
    players: g.players.map((p) => ({ ...p, score: score(p) })),
    resetDeck: {
      normal: g.resetDeck.filter((c) => c === "normal").length,
      bank: g.resetDeck.filter((c) => c === "bank").length,
    },
    awards: g.awards,
    receipt: g.receipt,
    message: g.message,
    logs: g.logs.slice(0, 10),
    coordinateSystem:
      "DOM tabletop; origin top-left; no spatial simulation or real-time deadline.",
  };
}
export function restoreGame(raw: string | null): Game | null {
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as Game;
    if (
      g.version !== 1 ||
      !["plan", "reveal", "over"].includes(g.phase) ||
      ![21, 42].includes(g.length) ||
      !Number.isInteger(g.day) ||
      g.day < 1 ||
      g.day > g.length ||
      !Number.isInteger(g.rng) ||
      !Array.isArray(g.players) ||
      g.players.length !== 4 ||
      !Array.isArray(g.market) ||
      g.market.length !== 4 ||
      !Array.isArray(g.order) ||
      g.order.length !== 12 ||
      !Number.isInteger(g.cursor) ||
      g.cursor < 0 ||
      g.cursor > 12 ||
      !Array.isArray(g.logs) ||
      !Array.isArray(g.awards) ||
      g.awards.length !== 3 ||
      !Array.isArray(g.events) ||
      !Array.isArray(g.resetDeck) ||
      !EVENTS.some((e) => e.id === g.event?.id)
    ) return null;
    const validProject = (j: Project) => j &&
      Number.isInteger(j.id) &&
      typeof j.name === "string" &&
      !!CATEGORIES[j.category] &&
      [j.need, j.vp, j.cash, j.work, j.bugs].every(Number.isFinite) &&
      j.need > 0 &&
      j.work >= 0 &&
      j.work <= j.need &&
      j.bugs >= 0;
    if (
      !g.market.every(validProject) ||
      !g.order.every((id) => Number.isInteger(id) && id >= 0 && id < 4) ||
      !g.resetDeck.every((c) => c === "normal" || c === "bank")
    ) return null;
    for (const p of g.players) {
      if (
        !p ||
        typeof p.name !== "string" ||
        !Array.isArray(p.accounts) ||
        p.accounts.length < 1 ||
        p.accounts.length > 3 ||
        !Array.isArray(p.projects) ||
        p.projects.length > 2 ||
        !p.projects.every(validProject) ||
        !Array.isArray(p.shipped) ||
        !p.shipped.every(validProject) ||
        ![
          p.cash,
          p.vp,
          p.knowledge,
          p.used,
          p.resetGain,
          p.wasted,
          p.expired,
          p.banksUsed,
          p.collisions,
        ].every(Number.isFinite) ||
        p.cash < 0 ||
        p.knowledge < 0 ||
        p.knowledge > 3
      ) return null;
      for (const a of p.accounts) if (
          !a ||
          !PLANS[a.tier] ||
          !Number.isFinite(a.quota) ||
          a.quota < 0 ||
          a.quota > PLANS[a.tier].capacity ||
          ![a.id, a.nextReset, a.paidUntil, a.lastBankDay].every(
            Number.isInteger,
          ) ||
          !Array.isArray(a.banks) ||
          a.banks.length > 3 ||
          !a.banks.every(Number.isInteger)
        ) return null;
    }
    return g;
  } catch {
    return null;
  }
}
