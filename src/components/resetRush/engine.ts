/** RESET / 开蹬! — deterministic, serializable tabletop rules. All currency is fictional. */
export type Category = "game" | "personal" | "open" | "company";
export type Tier = 20 | 100 | 200;
export type Model = "luna" | "sol" | "astra";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type Difficulty = 1 | 2 | 3 | 4;
export interface Development {
  model: Model;
  effort: Effort;
  turbo: boolean;
}
export const DEFAULT_DEVELOPMENT: Development = {
  model: "sol",
  effort: "medium",
  turbo: false,
};
export type Strategy = "balanced" | "builder" | "sprinter" | "banker";
export type AccountPolicy = "preferred" | "soon-reset" | "drain" | "most-quota" | "late-expiry" | "balanced";
export interface Studio {
  mode: "auto" | "manual";
  threads: number;
  accountPolicy: AccountPolicy;
  preferredAccount: number;
}
export const SAVE_KEY = "reset-rush-v4";
export const V3_SAVE_KEY = "reset-rush-v3";
export const V2_SAVE_KEY = "reset-rush-v2";
export const LEGACY_SAVE_KEY = "reset-rush-v1";
export const DAY_MINUTES = 480;
export const DAILY_ENERGY = 12;
export const MAX_LANES = 6;
export const BUG_WORK = 12;
const EPS = 1e-8;
export const fmt = (n: number) => Number(n.toFixed(1)).toString();
export const timeLabel = (minute: number) => `${String(9 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const PLANS: Record<Tier, { name: string; capacity: number }> = {
  20: { name: "PLUS", capacity: 24 },
  100: { name: "PRO 100", capacity: 90 },
  200: { name: "PRO 200", capacity: 180 },
};
export const MODELS: Record<
  Model,
  {
    name: string;
    cost: number;
    speed: number;
    ability: number;
    description: string;
  }
> = {
  luna: {
    name: "Luna",
    cost: 0,
    speed: 0.075,
    ability: 1,
    description: "简单任务 · 慢慢免费跑",
  },
  sol: {
    name: "Sol",
    cost: 0.16,
    speed: 0.18,
    ability: 2,
    description: "日常主力 · 均衡消耗",
  },
  astra: {
    name: "Astra",
    cost: 0.4,
    speed: 0.3,
    ability: 3,
    description: "复杂工程 · 更强能力",
  },
};
export const EFFORTS: Record<
  Effort,
  {
    name: string;
    cost: number;
    speed: number;
    ability: number;
    lunaCost: number;
  }
> = {
  low: { name: "Low", cost: 0.75, speed: 1.2, ability: -0.5, lunaCost: 0 },
  medium: { name: "Medium", cost: 1, speed: 1, ability: 0, lunaCost: 0 },
  high: { name: "High", cost: 1.5, speed: 0.9, ability: 0.5, lunaCost: 0.035 },
  xhigh: { name: "XHigh", cost: 2, speed: 0.8, ability: 1, lunaCost: 0.06 },
  max: { name: "Max", cost: 2.6, speed: 0.65, ability: 1.25, lunaCost: 0.1 },
  ultra: { name: "Ultra", cost: 3, speed: 1.5, ability: 1.5, lunaCost: 0.16 },
};
export const DIFFICULTIES: Record<Difficulty, string> = {
  1: "简单",
  2: "常规",
  3: "复杂",
  4: "攻坚",
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
    perk: "研发速度永久 +8%，最多 +24%",
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
  difficulty: Difficulty;
  vp: number;
  cash: number;
  work: number;
  bugs: number;
  deadline: number | null;
  checked: number;
  riskLoad: number;
  repair: number;
}
export interface Lane {
  id: number;
  account: number;
  development: Development;
  projects: number[];
  enabled: boolean;
  paidDay: number;
}
export interface Account {
  id: number;
  tier: Tier;
  quota: number;
  nextReset: number;
  paidUntil: number;
  renewal: Tier | null;
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
  energy: number;
  rested: boolean;
  lanes: Lane[];
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
  minute: number;
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
  version: 4;
  development: Development;
  studio: Studio;
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
  minute: number;
  logs: Log[];
  awards: { id: string; name: string; vp: number; owner: number | null }[];
  receipt: Receipt | null;
  message: string;
}
export type Action =
  | { type: "studio"; threads: number; accountPolicy: AccountPolicy; preferredAccount: number }
  | ({
      type: "dispatch";
      lane: number | null;
      projects: number[];
      account: number;
    } & Development)
  | { type: "pause"; lane: number }
  | { type: "remove-lane"; lane: number }
  | { type: "advance"; minutes: number }
  | { type: "next" }
  | { type: "rest" }
  | { type: "configure"; development: Development }
  | { type: "test"; project: number }
  | { type: "claim"; project: number }
  | { type: "bank"; account: number }
  | { type: "buy"; tier: Tier }
  | { type: "renew"; account: number; tier: Tier }
  | { type: "renewal"; account: number; tier: Tier | null }
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
    detail: "今天 Turbo 额度消耗打 75 折。加速缩短时间，不改变解题能力。",
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
    detail: "今晚 60% 触发赠礼。银行券可以留着，今天的时间不行。",
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
const TEMPLATES: [string, Category, number, number, number, Difficulty][] = [
  ["只有一条命", "game", 221, 23, 35, 2],
  ["猫猫自走棋", "game", 343, 34, 45, 3],
  ["下班后勇者", "game", 189, 19, 30, 2],
  ["像素宇宙", "game", 525, 44, 50, 4],
  ["我的第二大脑", "personal", 126, 8, 30, 2],
  ["极简记账本", "personal", 42, 6, 25, 1],
  ["今天吃什么", "personal", 116, 10, 35, 1],
  ["专注白噪音", "personal", 137, 12, 40, 1],
  ["tiny-agent", "open", 168, 14, 15, 3],
  ["一键部署工具", "open", 158, 15, 20, 2],
  ["开源 UI 积木", "open", 105, 9, 10, 1],
  ["本地模型路由", "open", 238, 20, 25, 3],
  ["老板的新后台", "company", 182, 8, 125, 2],
  ["周五紧急需求", "company", 140, 5, 95, 1],
  ["客户说很简单", "company", 266, 16, 180, 4],
  ["再改最后一版", "company", 224, 10, 145, 2],
  ["一百关推箱子", "game", 560, 40, 55, 1],
  ["百页文档站", "open", 420, 28, 30, 1],
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
  g.logs.unshift({ day: g.day, minute: g.minute, text, player });
  g.logs = g.logs.slice(0, 100);
}
function project(g: Game, template?: number): Project {
  const available = TEMPLATES.filter(
    ([name]) => !g.market.some((j) => j.name === name),
  );
  const [name, category, need, vp, cash, difficulty] =
    template === undefined
      ? available[Math.floor(random(g) * available.length)]
      : TEMPLATES[template];
  g.serial++;
  return {
    id: g.serial,
    name,
    category,
    need,
    difficulty,
    vp,
    cash,
    work: 0,
    bugs: 0,
    deadline: null,
    checked: 0,
    riskLoad: 0,
    repair: 0,
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
    renewal: tier,
    banks: [],
    lastBankDay: 0,
  };
}
export const activeAccount = (g: Game, a: Account) => a.paidUntil >= g.day;
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
export function developmentStats(
  g: Game,
  p: Player,
  config: Development,
  job?: Project,
) {
  const m = MODELS[config.model];
  const e = EFFORTS[config.effort];
  const baseCost = config.model === "luna" ? e.lunaCost : m.cost * e.cost;
  const cost = config.turbo
    ? Math.max(0.025, baseCost) * 2.5 * (g.event.effect === "sale" ? 0.75 : 1)
    : baseCost;
  const ability = m.ability + e.ability;
  const speed =
    m.speed * e.speed * (1 + p.knowledge * 0.08) * (config.turbo ? 2 : 1);
  const remaining = job
    ? Math.max(0, job.need - job.work) + job.bugs * BUG_WORK - job.repair
    : 0;
  return {
    name: `${m.name} · ${e.name}${config.turbo ? " + Turbo" : ""}`,
    cost,
    speed,
    perHour: speed * 60,
    quotaPerHour: cost * speed * 60,
    minutes: remaining / speed,
    quota: remaining * cost,
    ability,
    risk: job
      ? Math.min(80, Math.max(0, Math.round((job.difficulty - ability) * 30)))
      : 0,
  };
}
const validDevelopment = (d: Development) => !!d &&
  !!MODELS[d.model] &&
  !!EFFORTS[d.effort] &&
  typeof d.turbo === "boolean";

function renew(g: Game, p: Player, a: Account, tier: Tier) {
  p.cash -= tier;
  a.tier = tier;
  a.quota = PLANS[tier].capacity;
  a.paidUntil = g.day + 29;
  a.nextReset = g.day + 7;
  log(
    g,
    `${p.name} 的账号按 $${tier} 续订至 D${a.paidUntil}，恢复满额，自然重置改为 D${a.nextReset}。`,
    p.id,
  );
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
  cleanLanes(p);
  p.shipped.push(job);
  log(
    g,
    `${p.name} 发布《${job.name}》！+${job.vp + jam} 声望，+$${job.cash}${job.category === "open" ? "，研发速度 +8%（上限 24%）" : ""}`,
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
    `${r.title} ${kind === "normal" ? `你补回 ${fmt(gains[0].gained)} 额度，${fmt(gains[0].unused)} 余额无法叠加。` : `你获得 ${gains[0].gained} 张银行券。`}`,
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
  g.minute = 0;
  g.receipt = null;
  if (g.day > 1) {
    const oldest = g.market.reduce((a, b) => (a.id < b.id ? a : b));
    g.market[g.market.indexOf(oldest)] = project(g);
  }
  g.players.forEach((p) => {
    p.energy = DAILY_ENERGY;
    p.rested = false;
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
      if (a.paidUntil === g.day - 1) {
        a.quota = 0;
        if (a.renewal !== null && p.cash >= a.renewal) renew(g, p, a, a.renewal);
        else log(
            g,
            `${p.name} 的 ${PLANS[a.tier].name} ${a.renewal === null ? "按计划停订" : "续费余额不足，已暂停"}。可在账号管理中重新开通，银行券仍按原日到期。`,
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
            `${p.name} 的 ${PLANS[a.tier].name} 自然重置，补回 ${fmt(gained)}。`,
            p.id,
          );
        }
        a.nextReset += 7;
      }
    });
    p.projects
      .filter((j) => j.deadline !== null && j.deadline < g.day)
      .forEach((j) => {
        p.vp -= 3;
        p.projects = p.projects.filter((x) => x.id !== j.id);
        log(g, `${p.name} 的《${j.name}》超期撤单，扣 3 声望。`, p.id);
      });
    cleanLanes(p);
    for (const lane of p.lanes) if (lane.enabled && lane.projects.length) {
        p.energy -= 2;
        lane.paidDay = g.day;
      }
  });
  g.event = drawEvent(g);
  log(g, `早间消息：${g.event.title}`);
  if (g.event.effect === "instant") g.receipt = reset(g, "normal");
  if (g.event.effect === "bank") g.receipt = reset(g, "bank");
  g.message =
    g.day === 1
      ? "先管理账号，接下想做的项目；工作室会自动排队，收工时一起结算。"
      : `第 ${g.day} 天。工作室自动托管，剩 ${g.players[0].energy} 精力。${g.event.detail}`;
}
export function createGame(seed = 260926, length = 42): Game {
  const g: Game = {
    version: 4,
    development: { ...DEFAULT_DEVELOPMENT },
    studio: { mode: "auto", threads: 1, accountPolicy: "soon-reset", preferredAccount: 0 },
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
    minute: 0,
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
    ["你", "balanced", [20]],
    ["林工", "builder", [20]],
    ["阿卷", "sprinter", [20]],
    ["老周", "banker", [20]],
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
      energy: DAILY_ENERGY,
      rested: false,
      lanes: [],
    });
  });
  g.studio.preferredAccount = g.players[0].accounts[0].id;
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
function cleanLanes(p: Player) {
  for (const lane of p.lanes) {
    lane.projects = lane.projects.filter((id) => p.projects.some((j) => j.id === id),);
    if (!lane.projects.length) lane.enabled = false;
  }
}
function organizeStudio(g: Game) {
  if (g.studio.mode !== "auto" || g.phase !== "plan") return;
  const p = g.players[0];
  cleanLanes(p);
  const count = Math.min(g.studio.threads, p.projects.length);
  while (p.lanes.length < count) p.lanes.push({
    id: ++g.serial,
    account: g.studio.preferredAccount,
    development: { ...g.development },
    projects: [],
    enabled: false,
    paidDay: 0,
  });
  const activeLanes = p.lanes.slice(0, count);
  for (const lane of p.lanes.slice(count)) {
    lane.projects = [];
    lane.enabled = false;
  }

  // Keep work already underway at the front; spread the rest by queued workload.
  const heads = new Set(activeLanes.map((l) => l.projects[0]).filter(Boolean));
  for (const lane of activeLanes) lane.projects = lane.projects.length ? [lane.projects[0]] : [];
  const waiting = p.projects
    .filter((j) => !heads.has(j.id))
    .sort((a, b) => (a.deadline ?? 999) - (b.deadline ?? 999) || a.id - b.id);
  for (const job of waiting) {
    const lane = [...activeLanes].sort((a, b) => {
      const load = (l: Lane) => l.projects.reduce((n, id) => {
        const j = p.projects.find((x) => x.id === id)!;
        return n + Math.max(0, j.need - j.work) + j.bugs * BUG_WORK - j.repair;
      }, 0);
      return load(a) - load(b) || a.id - b.id;
    })[0];
    if (lane) lane.projects.push(job.id);
  }
  for (const lane of activeLanes) {
    lane.development = { ...g.development };
    if (!lane.projects.length) {
      lane.enabled = false;
    } else if (!lane.enabled && lane.paidDay === g.day) {
      lane.enabled = true;
    } else if (!lane.enabled && p.energy >= 2) {
      p.energy -= 2;
      lane.enabled = true;
      lane.paidDay = g.day;
      log(g, `${p.name} 托管线程，−2 精力。`, p.id);
    }
  }
}
function routeStudioAccounts(g: Game) {
  if (g.studio.mode !== "auto") return;
  const p = g.players[0];
  const eligible = p.accounts.filter((a) => activeAccount(g, a) && a.quota > EPS);
  const loads = new Map<number, number>();
  for (const lane of p.lanes) {
    if (!lane.enabled || !lane.projects.length) continue;
    if (developmentStats(g, p, lane.development).cost <= 0) continue;
    if (!eligible.length) continue;
    const policy = g.studio.accountPolicy;
    const ranked = [...eligible].sort((a, b) => {
      if (policy === "preferred") return (a.id === g.studio.preferredAccount ? -1 : b.id === g.studio.preferredAccount ? 1 : a.id - b.id);
      if (policy === "soon-reset") return a.nextReset - b.nextReset || a.id - b.id;
      if (policy === "drain") return a.quota - b.quota || a.id - b.id;
      if (policy === "most-quota") return b.quota - a.quota ||
        (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0) || a.id - b.id;
      if (policy === "late-expiry") return b.paidUntil - a.paidUntil || a.id - b.id;
      const available = (x: Account) => (x.quota / PLANS[x.tier].capacity) /
        (1 + (loads.get(x.id) ?? 0));
      return available(b) - available(a) || a.id - b.id;
    });
    lane.account = ranked[0].id;
    loads.set(lane.account, (loads.get(lane.account) ?? 0) + 1);
  }
}
export function laneStatus(g: Game, p: Player, lane: Lane): string {
  if (!lane.projects.length) return "队列完成";
  if (!lane.enabled) return g.studio.mode === "auto" && p.id === 0 &&
    lane.paidDay !== g.day && p.energy < 2 ? "等待精力" : "已暂停";
  if (g.phase !== "plan") return "收工待续";
  const job = p.projects.find((j) => j.id === lane.projects[0]);
  if (!job) return "等待项目";
  const acc = p.accounts.find((a) => a.id === lane.account);
  if (
    developmentStats(g, p, lane.development, job).cost > 0 &&
    (!acc || !activeAccount(g, acc) || acc.quota < EPS)
  ) return "等待额度";
  return job.work >= job.need - EPS ? "自动返工" : "开发中";
}
export function energyCost(g: Game, p: Player, a: Action): number {
  if (a.type === "claim" || a.type === "freelance") return 1;
  if (a.type === "test") return 2;
  if (a.type === "dispatch") return p.lanes.find((l) => l.id === a.lane)?.paidDay === g.day ? 1 : 2;
  return 0;
}
export function actionError(g: Game, id: number, a: Action): string | null {
  const p = g.players[id];
  if (!p) return "开发者不存在。";
  if (g.phase === "over") return "牌局已结束。";
  const administrative = [
    "configure",
    "renewal",
    "buy",
    "renew",
    "upgrade",
  ].includes(a.type);
  if (!administrative && g.phase !== "plan") return "先进入下一天。";
  if (p.energy < energyCost(g, p, a)) return "真人精力不足。可休息一次，后台线程仍会继续工作。";
  if (a.type === "studio") {
    if (!Number.isInteger(a.threads) || a.threads < 0 || a.threads > MAX_LANES ||
      !["preferred", "soon-reset", "drain", "most-quota", "late-expiry", "balanced"].includes(a.accountPolicy) ||
      !p.accounts.some((acc) => acc.id === a.preferredAccount)) return "工作室策略无效。";
    return null;
  }
  if (a.type === "configure") return validDevelopment(a.development) ? null : "开发配置无效。";
  if (a.type === "dispatch") {
    if (g.minute >= DAY_MINUTES) return "今天的时间用完了，先揭牌。";
    if (!validDevelopment(a)) return "请选择有效的开发配置。";
    if (!p.accounts.some((acc) => acc.id === a.account)) return "先选择账号。";
    if (!a.projects.length) return "先在工作台勾选项目，可多选组成队列。";
    if (
      new Set(a.projects).size !== a.projects.length ||
      !a.projects.every((j) => p.projects.some((x) => x.id === j))
    ) return "队列中有无效项目。";
    if (a.lane !== null && !p.lanes.some((l) => l.id === a.lane)) return "线程不存在。";
    if (
      a.lane === null &&
      p.lanes.filter((l) => l.projects.length).length >= MAX_LANES
    ) return "最多同时托管 6 条线程；可向已有队列追加项目。";
    if (
      p.lanes.some(
        (l) => l.id !== a.lane && l.projects.some((j) => a.projects.includes(j)),
      )
    ) return "项目已在另一条线程中。先调整原队列，避免重复开发。";
  }
  if (a.type === "pause" || a.type === "remove-lane") {
    if (!p.lanes.some((l) => l.id === a.lane)) return "线程不存在。";
  }
  if (a.type === "claim" && !g.market.some((j) => j.id === a.project)) return "项目已被别人接走。";
  if (a.type === "test") {
    if (!p.projects.find((j) => j.id === a.project)?.bugs) return "当前项目没有 bug。";
    if (g.minute + 30 > DAY_MINUTES) return "亲自排障需要完整的 30 分钟。";
  }
  if (a.type === "rest") {
    if (p.rested) return "今天已经休息过了。";
    if (p.energy >= DAILY_ENERGY) return "精力已经充足。";
    if (g.minute + 60 > DAY_MINUTES) return "今天已没有 60 分钟休息时间。";
  }
  if (a.type === "freelance" && g.minute + 60 > DAY_MINUTES) return "手写外包需要完整的 60 分钟。";
  if (
    a.type === "advance" &&
    (!Number.isInteger(a.minutes) || a.minutes <= 0 || a.minutes > DAY_MINUTES)
  ) return "推进时间应为 1–480 分钟。";
  if (a.type === "bank") {
    const acc = p.accounts.find((x) => x.id === a.account);
    if (!acc || !activeAccount(g, acc)) return "银行券需要有效订阅。";
    if (!acc.banks.some((d) => d > g.day)) return "这个账号没有有效银行券。";
    if (acc.quota >= PLANS[acc.tier].capacity - EPS) return "额度已经满了，留着这张券。";
    if (acc.lastBankDay === g.day) return "每个账号每天最多使用 1 张银行券。";
  }
  if (a.type === "buy") {
    if (!PLANS[a.tier]) return "无效套餐。";
    if (p.accounts.length >= 3) return "最多持有 3 个账号，每号都可以带多条线程。";
    if (p.cash < a.tier) return "现金不够，接点外包吧。";
  }
  if (a.type === "renew" || a.type === "upgrade" || a.type === "renewal") {
    const acc = p.accounts.find((x) => x.id === a.account);
    if (!acc) return "账号不存在。";
    if (a.type === "renewal") return a.tier === null || PLANS[a.tier] ? null : "无效续订套餐。";
    if (!PLANS[a.tier]) return "无效套餐。";
    if (a.type === "renew") {
      if (activeAccount(g, acc)) return "订阅到期后才能续费。";
      if (p.cash < a.tier) return "续费资金不足。";
    } else {
      if (a.tier <= acc.tier || !activeAccount(g, acc)) return "只能升级有效订阅。";
      if (p.cash < a.tier - acc.tier) return "升级资金不足。";
    }
  }
  if (a.type === "abandon" && !p.projects.some((j) => j.id === a.project)) return "项目不存在。";
  return null;
}

/** Administrative actions never advance the world or trigger a bot turn. */
function applyAction(g: Game, id: number, a: Action): boolean {
  const error = actionError(g, id, a);
  if (error) {
    if (id === 0) g.message = error;
    return false;
  }
  const p = g.players[id];
  const energy = energyCost(g, p, a);
  p.energy -= energy;
  if (a.type === "studio") {
    g.studio = { mode: "auto", threads: a.threads, accountPolicy: a.accountPolicy, preferredAccount: a.preferredAccount };
  } else if (a.type === "dispatch") {
    if (id === 0) g.studio.mode = "manual";
    let lane = p.lanes.find((l) => l.id === a.lane);
    if (!lane) {
      lane = p.lanes.find((l) => !l.projects.length);
      if (!lane) {
        lane = {
          id: ++g.serial,
          account: a.account,
          development: { ...DEFAULT_DEVELOPMENT },
          projects: [],
          enabled: false,
          paidDay: 0,
        };
        p.lanes.push(lane);
      }
    }
    lane.account = a.account;
    lane.development = { model: a.model, effort: a.effort, turbo: a.turbo };
    lane.projects = [...a.projects];
    lane.enabled = true;
    lane.paidDay = g.day;
    log(
      g,
      `${p.name} 安排 ${a.projects.length} 个项目：${developmentStats(g, p, a).name}，−${energy} 精力。推进时间后自动连做。`,
      id,
    );
  } else if (a.type === "pause") {
    p.lanes.find((l) => l.id === a.lane)!.enabled = false;
    log(g, `${p.name} 暂停一条线程；项目、进度与剩余额度保留。`, id);
  } else if (a.type === "remove-lane") {
    p.lanes = p.lanes.filter((l) => l.id !== a.lane);
    log(g, `${p.name} 解散一条线程，项目回到待安排列表。`, id);
  } else if (a.type === "claim") {
    const index = g.market.findIndex((x) => x.id === a.project);
    const j = g.market[index];
    if (j.category === "company") j.deadline = g.day + 7;
    p.projects.push(j);
    g.market[index] = project(g);
    log(
      g,
      `${p.name} 接下《${j.name}》，−1 精力${j.deadline ? `，D${j.deadline} 收工前交付` : ""}。`,
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
      `${p.name} 用掉银行券，补回 ${fmt(gain)} 额度。等待额度的线程可继续跑，自然重置仍在 D${acc.nextReset}。`,
      id,
    );
  } else if (a.type === "buy") {
    p.cash -= a.tier;
    p.accounts.push(account(g, a.tier));
    log(
      g,
      `${p.name} 开通 ${PLANS[a.tier].name} 新账号，−$${a.tier}；不花精力或时间。`,
      id,
    );
  } else if (a.type === "renew") {
    const acc = p.accounts.find((x) => x.id === a.account)!;
    renew(g, p, acc, a.tier);
    acc.renewal = a.tier;
  } else if (a.type === "renewal") {
    p.accounts.find((x) => x.id === a.account)!.renewal = a.tier;
    log(
      g,
      `${p.name} 设置到期后${a.tier === null ? "不再续订" : `按 $${a.tier} 续订`}。`,
      id,
    );
  } else if (a.type === "configure") {
    g.development = { ...a.development };
  } else if (a.type === "upgrade") {
    const acc = p.accounts.find((x) => x.id === a.account)!;
    const price = a.tier - acc.tier;
    acc.quota += PLANS[a.tier].capacity - PLANS[acc.tier].capacity;
    p.cash -= price;
    if (acc.renewal === acc.tier) acc.renewal = a.tier;
    acc.tier = a.tier;
    log(
      g,
      `${p.name} 补差价 $${price} 升级 ${PLANS[a.tier].name}，期限不变，不花精力或时间。`,
      id,
    );
  } else if (a.type === "abandon") {
    p.projects = p.projects.filter((j) => j.id !== a.project);
    cleanLanes(p);
    p.vp -= 2;
    log(g, `${p.name} 放弃项目，−2 声望。`, id);
  } else if (a.type === "test") {
    const j = p.projects.find((x) => x.id === a.project)!;
    j.bugs = Math.max(0, j.bugs - 2);
    if (!j.bugs) j.repair = 0;
    log(
      g,
      `${p.name} 亲自排障，修复最多 2 个 bug，−2 精力；其他线程继续运行 30 分钟。`,
      id,
    );
    release(g, p, j);
    advanceMutable(g, 30);
  } else if (a.type === "freelance") {
    advanceMutable(g, 60);
    p.cash += 25;
    log(g, `${p.name} 手写外包 60 分钟，−1 精力，+$25；后台线程照常工作。`, id);
  } else if (a.type === "rest") {
    p.rested = true;
    advanceMutable(g, 60);
    p.energy = Math.min(DAILY_ENERGY, p.energy + 3);
    log(g, `${p.name} 休息 60 分钟，恢复 3 精力；后台任务没有停。`, id);
  } else if (a.type === "advance") advanceMutable(g, a.minutes);
  else if (a.type === "next") {
    const before = humanNode(g);
    do {
      advanceMutable(g, 1);
    } while (g.phase === "plan" && humanNode(g) === before);
  }
  if (id === 0 && g.phase === "plan" && g.studio.mode === "auto") {
    if (a.type === "studio" || a.type === "claim") organizeStudio(g);
    if (a.type === "configure") for (const lane of p.lanes) lane.development = { ...g.development };
    routeStudioAccounts(g);
  }
  if (id === 0 && a.type !== "configure") g.message =
      g.phase === "reveal"
        ? g.receipt!.title
        : `${timeLabel(g.minute)} · ${g.logs.find((l) => l.player === 0)?.text ?? "安排妥当后推进时间。"}`;
  return true;
}

/** Integrate all lanes simultaneously, splitting at completions, risk checkpoints and shared-account exhaustion. */
function runPlayer(g: Game, p: Player) {
  let time = 1;
  let guard = 0;
  while (time > EPS && guard++ < 1000) {
    if (p.id === 0) {
      organizeStudio(g);
      routeStudioAccounts(g);
    }
    cleanLanes(p);
    const running = p.lanes.flatMap((lane) => {
      if (!lane.enabled || !lane.projects.length) return [];
      const job = p.projects.find((j) => j.id === lane.projects[0])!;
      const acc = p.accounts.find((a) => a.id === lane.account)!;
      const stats = developmentStats(g, p, lane.development, job);
      if (stats.cost > 0 && (!activeAccount(g, acc) || acc.quota <= EPS)) return [];
      const repair = job.work >= job.need - EPS;
      if (repair && !job.bugs) {
        release(g, p, job);
        return [];
      }
      const boundary = repair
        ? BUG_WORK - job.repair
        : Math.min(job.need, job.checked + 20) - job.work;
      return [{ lane, job, acc, stats, repair, boundary }];
    });
    if (!running.length) break;
    let dt = Math.min(time, ...running.map((r) => r.boundary / r.stats.speed));
    for (const acc of p.accounts) {
      const rate = running
        .filter((r) => r.acc.id === acc.id)
        .reduce((n, r) => n + r.stats.cost * r.stats.speed, 0);
      if (rate > 0) dt = Math.min(dt, acc.quota / rate);
    }
    if (dt < EPS) break;
    for (const r of running) {
      const work = Math.min(r.boundary, r.stats.speed * dt);
      const cost = work * r.stats.cost;
      r.acc.quota = Math.max(0, r.acc.quota - cost);
      if (r.acc.quota < EPS) r.acc.quota = 0;
      p.used += cost;
      if (r.repair) {
        r.job.repair += work;
        if (r.job.repair >= BUG_WORK - EPS) {
          r.job.bugs--;
          r.job.repair = 0;
        }
      } else {
        r.job.work = Math.min(r.job.need, r.job.work + work);
        r.job.riskLoad += (work * r.stats.risk) / 2000;
        const checkpoint = Math.min(r.job.need, r.job.checked + 20);
        if (r.job.work >= checkpoint - EPS) {
          r.job.work = checkpoint;
          if (r.job.riskLoad > 0 && random(g) < r.job.riskLoad) {
            r.job.bugs++;
            log(
              g,
              `${p.name} 的《${r.job.name}》发现 1 个 bug，完工后会自动返工；可换更强配置。`,
              p.id,
            );
          }
          r.job.riskLoad = 0;
          r.job.checked = checkpoint;
        }
      }
    }
    // Resolve rewards only after all simultaneous work has used the same pre-completion rates.
    for (const r of running) release(g, p, r.job);
    award(g, p);
    time -= dt;
  }
}

function sameConfig(a: Development, b: Development) {
  return a.model === b.model && a.effort === b.effort && a.turbo === b.turbo;
}
function botConfig(
  g: Game,
  p: Player,
  acc: Account,
  j: Project,
  style: Strategy,
): Development {
  const free = { model: "luna", effort: "medium", turbo: false } as Development;
  if (!activeAccount(g, acc) || acc.quota < 0.5) return free;
  const urgency =
    g.event.chance >= 60 ||
    acc.nextReset <= g.day + 1 ||
    g.length - g.day < 2 ||
    (j.deadline !== null && j.deadline <= g.day + 1);
  let best = free;
  let bestValue = -Infinity;
  for (const model of Object.keys(MODELS) as Model[]) for (const effort of Object.keys(EFFORTS) as Effort[]) for (const turbo of [false, true]) {
        const config = { model, effort, turbo };
        const s = developmentStats(g, p, config, j);
        const sustainable = s.cost
          ? Math.min(DAY_MINUTES - g.minute, acc.quota / (s.speed * s.cost))
          : DAY_MINUTES - g.minute;
        const work = Math.min(
          j.need - j.work + j.bugs * BUG_WORK,
          (sustainable * s.speed) / (1 + ((s.risk / 100) * BUG_WORK) / 20),
        );
        const price = urgency
          ? 0.07
          : style === "sprinter"
            ? 0.25
            : style === "builder"
              ? 1.6
              : 0.7;
        const value =
          work - s.cost * work * price + (urgency ? s.speed * 30 : 0);
        if (value > bestValue) {
          bestValue = value;
          best = config;
        }
      }
  return best;
}
/** Bots read public state only; they schedule against the same clock, quota and energy rules. */
export function chooseAction(g: Game, id: number, strategy?: Strategy): Action {
  const p = g.players[id];
  const style = strategy ?? p.strategy;
  if (g.phase !== "plan") return { type: "pass" };
  const remaining = g.length - g.day;
  const target: Tier = style === "builder" ? 100 : 200;
  const upgrade = p.accounts.find(
    (a) => activeAccount(g, a) && a.tier < target,
  );
  if (upgrade && remaining > 9 && p.cash >= target - upgrade.tier + 70) return { type: "upgrade", account: upgrade.id, tier: target };
  const active = p.accounts.filter((a) => activeAccount(g, a));
  if (!active.length && p.cash >= 20 && remaining > 1) return {
      type: "renew",
      account: p.accounts[0].id,
      tier: p.cash > 180 ? 100 : 20,
    };
  if (
    style === "banker" &&
    p.accounts.length < 2 &&
    p.cash >= 270 &&
    remaining > 12
  ) return { type: "buy", tier: 200 };
  if (p.accounts.length < 2 && remaining > 10 && (
    (style === "builder" && p.knowledge > 0 && p.cash >= 240) ||
    (style === "sprinter" && g.day > 5 && p.cash >= 280) ||
    (style === "balanced" && g.day > 3 && p.cash >= 260)
  )) return { type: "buy", tier: style === "sprinter" ? 200 : 100 };
  const bank = active.find(
    (a) => a.quota < PLANS[a.tier].capacity * 0.08 &&
      a.banks.length &&
      a.lastBankDay !== g.day &&
      (a.nextReset > g.day + 1 || a.banks[0] <= g.day + 1) &&
      (g.event.chance < 75 || g.minute < 240),
  );
  if (bank) return { type: "bank", account: bank.id };
  const chooseAccount = () => [...p.accounts].sort((a, b) => {
      const value = (x: Account) => ((activeAccount(g, x) ? x.quota : 0) /
          (1 + p.lanes.filter((l) => l.enabled && l.account === x.id).length)) *
        (x.nextReset <= g.day + 1 ? 1.3 : 1);
      return value(b) - value(a);
    })[0];
  for (const lane of p.lanes.filter((l) => l.projects.length)) {
    const j = p.projects.find((x) => x.id === lane.projects[0])!;
    const oldAcc = p.accounts.find((a) => a.id === lane.account)!;
    const acc =
      activeAccount(g, oldAcc) && oldAcc.quota > 0.5 ? oldAcc : chooseAccount();
    const config = botConfig(g, p, acc, j, style);
    if (
      (g.minute === 0 ||
        laneStatus(g, p, lane) === "等待额度" ||
        !lane.enabled) &&
      (acc.id !== lane.account ||
        !sameConfig(lane.development, config) ||
        !lane.enabled)
    ) {
      const a: Action = {
        type: "dispatch",
        lane: lane.id,
        account: acc.id,
        projects: lane.projects,
        ...config,
      };
      if (!actionError(g, id, a)) return a;
    }
  }
  const waiting = p.projects
    .filter((j) => !p.lanes.some((l) => l.projects.includes(j.id)))
    .sort((a, b) => (a.deadline ?? 999) - (b.deadline ?? 999));
  const desired = style === "builder" ? 4 : 3;
  if (waiting.length && p.energy >= 2) {
    const lane =
      p.lanes.filter((l) => l.projects.length).length < desired
        ? null
        : [...p.lanes]
            .filter((l) => l.projects.length)
            .sort((a, b) => a.projects.length - b.projects.length)[0];
    const acc = lane
      ? p.accounts.find((a) => a.id === lane.account)!
      : chooseAccount();
    const config = lane
      ? lane.development
      : botConfig(g, p, acc, waiting[0], style);
    return {
      type: "dispatch",
      lane: lane?.id ?? null,
      account: acc.id,
      projects: [...(lane?.projects ?? []), ...waiting.map((j) => j.id)],
      ...config,
    };
  }
  const pending = p.projects.reduce(
    (n, j) => n + j.need - j.work + j.bugs * BUG_WORK,
    0,
  );
  if (
    p.energy >= (waiting.length ? 3 : 2) &&
    g.minute < 420 &&
    p.projects.length < desired + 2 &&
    pending < desired * 260 &&
    remaining >= 1
  ) {
    const ranked = [...g.market].sort((a, b) => {
      const value = (j: Project) => (j.vp / (j.need + (j.difficulty - 1) * 30)) * 100 +
        (j.category === "open" && p.knowledge < 3 && remaining > 10
          ? style === "builder"
            ? 12
            : 4
          : 0) +
        (j.category === "company" && p.cash < 220 ? 9 : 0) +
        (!p.shipped.some((x) => x.category === j.category) ? 2 : 0) +
        (style === "sprinter" && j.category === "game" ? 4 : 0);
      return value(b) - value(a);
    });
    if (ranked[0]) return { type: "claim", project: ranked[0].id };
  }
  return { type: "pass" };
}
function runBots(g: Game) {
  for (let i = 0; i < 4; i++) {
    const id = (i + g.day) % 4;
    if (id === 0) continue;
    for (let n = 0; n < 16; n++) {
      const action = chooseAction(g, id);
      if (action.type === "pass" || !applyAction(g, id, action)) break;
    }
  }
}
function humanNode(g: Game) {
  const p = g.players[0];
  if (g.studio.mode === "auto") {
    const active = p.lanes.filter((l) => l.enabled && l.projects.length);
    return JSON.stringify([
      p.shipped.length,
      p.projects.length === 0,
      active.length > 0 && active.every((l) => laneStatus(g, p, l) === "等待额度"),
    ]);
  }
  return JSON.stringify([
    p.shipped.length,
    p.lanes.map((l) => [l.projects[0], laneStatus(g, p, l)]),
    p.accounts.map((a) => a.quota <= EPS),
  ]);
}
function finishNight(g: Game) {
  if (g.phase !== "plan") return;
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
      text: "队列与进度会保留到明天。自然重置在各账号标注的早晨发生。",
      gains: [],
    };
    log(g, g.receipt.title);
  }
  if (g.day % 7 === 0) for (const p of g.players) {
      const income =
        35 + p.shipped.filter((j) => j.category === "personal").length * 15;
      p.cash += income;
      log(g, `${p.name} 领取周薪与个人项目收入：+$${income}。`, p.id);
    }
  g.phase = "reveal";
  g.message = g.receipt.title;
}
function advanceMutable(g: Game, minutes: number) {
  const end = Math.min(DAY_MINUTES, g.minute + minutes);
  while (g.phase === "plan" && g.minute < end) {
    if (g.minute % 30 === 0) runBots(g);
    g.minute++;
    // Rotating settlement order avoids granting every simultaneous first-publication award to player 0.
    for (let i = 0; i < 4; i++) runPlayer(g, g.players[(i + g.day) % 4]);
  }
  if (g.minute >= DAY_MINUTES) finishNight(g);
}
export function advanceMinutes(state: Game, minutes: number): Game {
  if (state.phase !== "plan" || !Number.isInteger(minutes) || minutes < 1) return state;
  const g = copy(state);
  advanceMutable(g, Math.min(DAY_MINUTES, minutes));
  if (g.phase === "plan") g.message = `${timeLabel(g.minute)} · 所有线程已同步推进。完成会自动接下一单，缺额线程等待补给。`;
  return g;
}
export function act(state: Game, action: Action): Game {
  const g = copy(state);
  applyAction(g, 0, action);
  return g;
}
export function endDay(state: Game): Game {
  if (state.phase !== "plan") return state;
  const g = copy(state);
  advanceMutable(g, DAY_MINUTES - g.minute);
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
  return {
    title: "RESET / 开蹬！",
    version: g.version,
    development: g.development,
    studio: g.studio,
    phase: g.phase,
    day: g.day,
    length: g.length,
    minute: g.minute,
    clock: timeLabel(g.minute),
    minutesLeft: DAY_MINUTES - g.minute,
    energy: g.players[0].energy,
    event: g.event,
    market: g.market,
    players: g.players.map((p) => ({
      ...p,
      score: score(p),
      lanes: p.lanes.map((l) => ({ ...l, status: laneStatus(g, p, l) })),
    })),
    resetDeck: {
      normal: g.resetDeck.filter((c) => c === "normal").length,
      bank: g.resetDeck.filter((c) => c === "bank").length,
    },
    awards: g.awards,
    receipt: g.receipt,
    message: g.message,
    logs: g.logs.slice(0, 12),
    coordinateSystem:
      "DOM tabletop, top-left origin. Paused simulated clock: 09:00–17:00. advanceTime(60000) advances one game minute; wall time never runs tasks.",
  };
}
export function restoreGame(raw: string | null): Game | null {
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as Game;
    const legacy = g as unknown as {
      version: number;
      order?: number[];
      cursor?: number;
    };
    const oldVersion = legacy.version;
    if (
      ![1, 2, 3, 4].includes(oldVersion) ||
      !["plan", "reveal", "over"].includes(g.phase) ||
      ![21, 42].includes(g.length) ||
      !Number.isInteger(g.day) ||
      g.day < 1 ||
      g.day > g.length ||
      !Number.isInteger(g.rng) ||
      g.rng < 0 ||
      g.rng >= 4294967296 ||
      !Number.isInteger(g.seed) ||
      !Number.isInteger(g.serial) ||
      !Array.isArray(g.players) ||
      g.players.length !== 4 ||
      !Array.isArray(g.market) ||
      g.market.length !== 4 ||
      !Array.isArray(g.logs) ||
      !Array.isArray(g.awards) ||
      g.awards.length !== 3 ||
      !Array.isArray(g.events) ||
      !Array.isArray(g.resetDeck) ||
      !EVENTS.some((e) => e.id === g.event?.id)
    ) return null;
    if (oldVersion < 3) {
      if (
        !Array.isArray(legacy.order) ||
        legacy.order.length !== 12 ||
        !Number.isInteger(legacy.cursor) ||
        legacy.cursor! < 0 ||
        legacy.cursor! > 12
      ) return null;
      const used = legacy.order
        .slice(0, legacy.cursor)
        .filter((id) => id === 0).length;
      g.minute =
        g.phase === "plan" ? Math.min(DAY_MINUTES, used * 160) : DAY_MINUTES;
      g.development =
        oldVersion === 1 ? { ...DEFAULT_DEVELOPMENT } : g.development;
      for (const p of g.players) {
        if (
          !Array.isArray(p?.projects) ||
          !Array.isArray(p?.shipped) ||
          !Array.isArray(p?.accounts)
        ) return null;
        p.energy =
          g.phase === "plan" ? Math.max(0, DAILY_ENERGY - used * 4) : 0;
        p.rested = false;
        p.lanes = [];
        if (oldVersion === 1) for (const a of p.accounts) a.renewal = null;
      }
      for (const j of [
        ...g.market,
        ...g.players.flatMap((p) => [...p.projects, ...p.shipped]),
      ]) {
        if (oldVersion === 1) j.difficulty = TEMPLATES.find((t) => t[0] === j.name)?.[5] ?? 2;
        j.checked = j.work >= j.need ? j.need : Math.floor(j.work / 20) * 20;
        j.riskLoad = 0;
        j.repair = 0;
      }
      for (const l of g.logs) l.minute = 0;
      delete legacy.order;
      delete legacy.cursor;
      g.version = 4;
      g.event = { ...EVENTS.find((e) => e.id === g.event.id)! };
      g.message =
        "旧牌局已迁移：现金、账号、券和项目进度全部保留；今天剩余时间按旧行动折算。请选择项目，安排新的并行队列。";
    }
    if (oldVersion < 4) {
      const player = g.players[0];
      const oldLanes = player.lanes.filter((l) => l.projects.length);
      const running = oldLanes.filter((l) => l.enabled);
      player.lanes = [...running, ...player.lanes.filter((l) => !running.includes(l))];
      if (running.length) g.development = { ...running[0].development };
      g.studio = {
        mode: "auto",
        threads: oldLanes.length ? running.length : 1,
        accountPolicy: "soon-reset",
        preferredAccount: running[0]?.account ?? oldLanes[0]?.account ?? player.accounts[0].id,
      };
      g.version = 4;
      g.message = "牌局已迁移：账号、项目和进度保留；工作室现在会自动排队和切换账号。";
    }
    if (
      !validDevelopment(g.development) ||
      !g.studio ||
      !["auto", "manual"].includes(g.studio.mode) ||
      !Number.isInteger(g.studio.threads) ||
      g.studio.threads < 0 ||
      g.studio.threads > MAX_LANES ||
      !["preferred", "soon-reset", "drain", "most-quota", "late-expiry", "balanced"].includes(g.studio.accountPolicy) ||
      !g.players[0].accounts.some((a) => a.id === g.studio.preferredAccount) ||
      !Number.isInteger(g.minute) ||
      g.minute < 0 ||
      g.minute > DAY_MINUTES ||
      !g.resetDeck.every((c) => c === "normal" || c === "bank") ||
      !g.events.every((id) => EVENTS.some((e) => e.id === id))
    ) return null;
    const finite = (xs: number[]) => xs.every(Number.isFinite);
    const validProject = (j: Project) => j &&
      Number.isInteger(j.id) &&
      typeof j.name === "string" &&
      !!CATEGORIES[j.category] &&
      [1, 2, 3, 4].includes(j.difficulty) &&
      finite([
        j.need,
        j.vp,
        j.cash,
        j.work,
        j.bugs,
        j.checked,
        j.riskLoad,
        j.repair,
      ]) &&
      j.need > 0 &&
      j.work >= 0 &&
      j.work <= j.need + EPS &&
      Number.isInteger(j.bugs) &&
      j.bugs >= 0 &&
      j.checked >= 0 &&
      j.checked <= j.work + EPS &&
      j.work - j.checked <= 20 + EPS &&
      j.riskLoad >= 0 &&
      j.riskLoad <= 1 &&
      j.repair >= 0 &&
      j.repair < BUG_WORK &&
      (j.deadline === null || Number.isInteger(j.deadline));
    if (!g.market.every(validProject)) return null;
    for (let index = 0; index < g.players.length; index++) {
      const p = g.players[index];
      if (
        !p ||
        p.id !== index ||
        typeof p.name !== "string" ||
        !["balanced", "builder", "sprinter", "banker"].includes(p.strategy) ||
        !Array.isArray(p.accounts) ||
        p.accounts.length < 1 ||
        p.accounts.length > 3 ||
        !Array.isArray(p.projects) ||
        !p.projects.every(validProject) ||
        !Array.isArray(p.shipped) ||
        !p.shipped.every(validProject) ||
        !Array.isArray(p.lanes) ||
        p.lanes.length > MAX_LANES ||
        !Number.isInteger(p.energy) ||
        p.energy < 0 ||
        p.energy > DAILY_ENERGY ||
        typeof p.rested !== "boolean" ||
        !finite([
          p.cash,
          p.vp,
          p.knowledge,
          p.used,
          p.resetGain,
          p.wasted,
          p.expired,
          p.banksUsed,
          p.collisions,
        ]) ||
        p.cash < 0 ||
        !Number.isInteger(p.knowledge) ||
        p.knowledge < 0 ||
        p.knowledge > 3
      ) return null;
      for (const a of p.accounts) if (
          !a ||
          !PLANS[a.tier] ||
          !(a.renewal === null || PLANS[a.renewal]) ||
          !Number.isFinite(a.quota) ||
          a.quota < 0 ||
          a.quota > PLANS[a.tier].capacity + EPS ||
          ![a.id, a.nextReset, a.paidUntil, a.lastBankDay].every(
            Number.isInteger,
          ) ||
          !Array.isArray(a.banks) ||
          a.banks.length > 3 ||
          !a.banks.every(Number.isInteger)
        ) return null;
      const assigned = new Set<number>();
      for (const l of p.lanes) {
        if (
          !l ||
          !Number.isInteger(l.id) ||
          !p.accounts.some((a) => a.id === l.account) ||
          !validDevelopment(l.development) ||
          typeof l.enabled !== "boolean" ||
          !Number.isInteger(l.paidDay) ||
          !Array.isArray(l.projects) ||
          !l.projects.every(
            (id) => p.projects.some((j) => j.id === id) &&
              !assigned.has(id) &&
              !!assigned.add(id),
          )
        ) return null;
      }
    }
    const ids = [
      ...g.market.map((j) => j.id),
      ...g.players.flatMap((p) => [...p.accounts, ...p.projects, ...p.shipped, ...p.lanes].map(
          (x) => x.id,
        ),),
    ];
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => id < 1 || id > g.serial)
    ) return null;
    if (
      !g.awards.every(
        (a) => a &&
          typeof a.name === "string" &&
          Number.isFinite(a.vp) &&
          (a.owner === null ||
            (Number.isInteger(a.owner) && a.owner >= 0 && a.owner < 4)),
      )
    ) return null;
    if (
      !g.logs.every(
        (l) => l &&
          typeof l.text === "string" &&
          Number.isInteger(l.day) &&
          Number.isInteger(l.minute),
      )
    ) return null;
    if (g.phase === "reveal" && !g.receipt) return null;
    if (g.receipt && (
      !["normal", "bank", "quiet"].includes(g.receipt.kind) ||
      typeof g.receipt.title !== "string" || typeof g.receipt.text !== "string" ||
      !Array.isArray(g.receipt.gains) ||
      !g.receipt.gains.every(r => r && Number.isInteger(r.player) && r.player >= 0 && r.player < 4 && finite([r.gained, r.unused]) && typeof r.collision === "boolean")
    )) return null;
    return g;
  } catch {
    return null;
  }
}
