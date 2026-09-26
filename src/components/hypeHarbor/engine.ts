export const SAVE_VERSION = 2;
export const TARGET = 15;
export const SEAT_PAYOUT = 12;
export const CLIP_SPOT = 13;
export const CLIP_COST = 2;
export const CLIP_PAYOUT = 8;
export const WORK_PAYOUT = 1;
export const RECOGNITION_SPACES = [
  { threshold: 1, label: "至少 1 位主播未达标", cost: 3, payout: 5 },
  { threshold: 2, label: "至少 2 位主播未达标", cost: 2, payout: 6 },
  { threshold: 3, label: "3 位主播都未达标", cost: 1, payout: 8 },
] as const;
export const PLAYER_COLORS = ["#e5694d", "#397c9c", "#9680b3", "#c09a3f"];

export const STREAMERS = [
  {
    id: "sui",
    name: "岁己",
    tag: "SUI",
    portrait: "/images/autochess/portraits/minimal/sui.png",
  },
  {
    id: "nagisa",
    name: "米汀",
    tag: "NAGISA",
    portrait: "/images/autochess/portraits/minimal/nagisa.png",
  },
  {
    id: "shiori",
    name: "栞栞",
    tag: "SHIORI",
    portrait: "/images/autochess/portraits/minimal/shiori.png",
  },
  {
    id: "mizuki",
    name: "弥月",
    tag: "MIZUKI",
    portrait: "/images/autochess/portraits/minimal/clock-gunner.png",
  },
  {
    id: "hazel",
    name: "灰泽满",
    tag: "HAZEL",
    portrait: "/images/autochess/portraits/minimal/sun-guard.png",
  },
  {
    id: "liko",
    name: "莉蔻",
    tag: "LIKO",
    portrait: "/images/autochess/portraits/minimal/ember-blade.png",
  },
  {
    id: "kloa",
    name: "克罗雅",
    tag: "KLOA",
    portrait: "/images/autochess/portraits/minimal/rift-brawler-head.png",
  },
  {
    id: "izayoi",
    name: "十六萤",
    tag: "IZAYOI",
    portrait: "/images/autochess/portraits/minimal/raccoon-archer.png",
  },
  {
    id: "chu2u",
    name: "羽啾",
    tag: "CHU2U",
    portrait: "/images/livers/chu2u.jpg",
  },
  {
    id: "sumire",
    name: "枝堇",
    tag: "SUMIRE",
    portrait: "/images/livers/sumire.jpg",
  },
  {
    id: "viridis",
    name: "小松绿",
    tag: "VIRIDIS",
    portrait: "/images/livers/viridis.jpg",
  },
  {
    id: "komichi",
    name: "四时小路",
    tag: "KOMICHI",
    portrait: "/images/autochess/portraits/minimal/komichi.png",
  },
] as const;
export type StreamerId = (typeof STREAMERS)[number]["id"];
export const ROSTERS: { name: string; members: StreamerId[] }[] = [
  { name: "环岁四人组", members: ["sui", "nagisa", "shiori", "mizuki"] },
  { name: "27期四人组", members: ["hazel", "liko", "kloa", "izayoi"] },
  { name: "28期四人组", members: ["chu2u", "sumire", "viridis", "komichi"] },
];
export const PROJECTS = [
  {
    name: "满座歌回",
    goal: "座无虚席",
    color: "#e78365",
    light: "#f6dfcc",
    icon: "♪",
  },
  {
    name: "新友见面会",
    goal: "涨粉达标",
    color: "#649fac",
    light: "#d7e9e8",
    icon: "✦",
  },
  {
    name: "周年特别场",
    goal: "企划圆满",
    color: "#9b8bb9",
    light: "#e7deee",
    icon: "★",
  },
];
export const EVENTS = [
  {
    title: "周末黄金档",
    description: "风平浪静，各船每次掷 1 枚六面骰。",
    wind: [0, 0, 0],
  },
  {
    title: "音乐区推荐",
    description: "歌回被首页推荐：橙色航线每次额外前进 1 格。",
    wind: [1, 0, 0],
  },
  {
    title: "新友涌入",
    description: "新人串门热潮：蓝色航线每次额外前进 1 格。",
    wind: [0, 1, 0],
  },
  {
    title: "周年应援周",
    description: "庆典气氛正浓：紫色航线每次额外前进 1 格。",
    wind: [0, 0, 1],
  },
  {
    title: "热门撞档",
    description: "歌回遇到撞档：橙色航线每次少走 1 格，至少走 1 格。",
    wind: [-1, 0, 0],
  },
  {
    title: "周中慢热",
    description: "新友来得稍晚：蓝色航线每次少走 1 格，至少走 1 格。",
    wind: [0, -1, 0],
  },
] as const;

export interface PlayerConfig {
  name: string;
  ai: boolean;
}
export interface Player extends PlayerConfig {
  id: number;
  cash: number;
  shares: Record<StreamerId, number>;
  boughtThisRound: boolean;
}
export interface Seat {
  player: number;
  cost: number;
  insured: boolean;
  source?: "clip";
}
export interface Boat {
  streamer: StreamerId;
  position: number;
  warmup: number;
  seats: Seat[];
  die: number | null;
  movement: number;
}
export type Phase =
  | "preparing"
  | "placing"
  | "sailing"
  | "reveal"
  | "spotlight"
  | "settlement"
  | "finished";
export type ActionKind =
  | "support"
  | "clip"
  | "recognition"
  | "share"
  | "boost"
  | "smear"
  | "insure"
  | "work";
export interface Action {
  kind: ActionKind;
  boat: number;
  recognition?: number;
  insured?: boolean;
}
export interface Payment {
  player: number;
  label: string;
  amount: number;
}
export interface RoundResult {
  round: number;
  boats: {
    streamer: StreamerId;
    success: boolean;
    position: number;
    priceBefore: number;
    priceAfter: number;
  }[];
  payments: Payment[];
  cashDelta: number[];
  wealthDelta: number[];
}
export interface GameState {
  version: number;
  seed: number;
  round: number;
  rounds: number;
  beat: number;
  phase: Phase;
  producer: number;
  turn: number;
  placed: number;
  players: Player[];
  roster: StreamerId[];
  boats: Boat[];
  recognition: ({ player: number; cost: number } | null)[];
  clippers: ({ player: number; cost: number } | null)[];
  clipQueue: number[];
  clipEntrants: number[];
  prices: Record<StreamerId, number>;
  event: number;
  log: string[];
  roundCash: number[];
  roundWealth: number[];
  results: RoundResult[];
  revision: number;
}

const shareRecord = (value: number) => Object.fromEntries(STREAMERS.map((s) => [s.id, value])) as Record<
    StreamerId,
    number
  >;
export const streamerById = (id: StreamerId) => STREAMERS.find((s) => s.id === id) || STREAMERS[0];
export const wealth = (state: GameState, player: Player) => player.cash +
  STREAMERS.reduce(
    (sum, s) => sum + player.shares[s.id] * state.prices[s.id],
    0,
  );
export const leaders = (state: GameState) => [...state.players].sort((a, b) => wealth(state, b) - wealth(state, a));
const clone = (state: GameState): GameState => migrateLegacy(JSON.parse(JSON.stringify(state)));
const addLog = (state: GameState, message: string) => {
  state.log = [message, ...state.log].slice(0, 18);
};
const random = (state: GameState) => {
  state.seed = (state.seed * 1664525 + 1013904223) % 4294967296;
  return state.seed / 4294967296;
};
const emptyBoats = (roster: StreamerId[]): Boat[] => roster.map((streamer) => ({
    streamer,
    position: 3,
    warmup: 0,
    seats: [],
    die: null,
    movement: 0,
  }));

export function createGame(
  config: PlayerConfig[],
  rounds = 3,
  seed = Date.now(),
  roster: readonly StreamerId[] = ROSTERS[0].members,
): GameState {
  if (
    roster.length !== 4 ||
    new Set(roster).size !== 4 ||
    !roster.every((id) => STREAMERS.some((s) => s.id === id))
  ) throw new Error("每局必须选择四位不同的主播");
  const players = config.slice(0, 4).map((p, id) => ({
    id,
    name: p.name.trim().slice(0, 12) || `玩家 ${id + 1}`,
    ai: p.ai,
    cash: 30,
    shares: shareRecord(0),
    boughtThisRound: false,
  }));
  if (players.length < 2) throw new Error("至少需要两位玩家");
  return {
    version: SAVE_VERSION,
    seed: Math.abs(Math.floor(seed)) % 4294967296,
    round: 1,
    rounds: rounds === 5 ? 5 : 3,
    beat: 1,
    phase: "preparing",
    producer: 0,
    turn: 0,
    placed: 0,
    players,
    roster: [...roster],
    boats: emptyBoats(roster.slice(0, 3)),
    recognition: [null, null, null],
    clippers: [null, null],
    clipQueue: [],
    clipEntrants: [],
    prices: shareRecord(6),
    event: 0,
    log: ["开张！每人 30 枚应援币，活动结束时总资产最多的人获胜。"],
    roundCash: players.map((p) => p.cash),
    roundWealth: players.map((p) => p.cash),
    results: [],
    revision: 0,
  };
}

export function setRoster(
  state: GameState,
  boatIndex: number,
  id: StreamerId,
): GameState {
  if (
    state.phase !== "preparing" ||
    !state.boats[boatIndex] ||
    !state.roster.includes(id)
  ) return state;
  const next = clone(state);
  const other = next.boats.findIndex((b) => b.streamer === id);
  if (other >= 0) next.boats[other].streamer = next.boats[boatIndex].streamer;
  next.boats[boatIndex].streamer = id;
  next.revision++;
  return next;
}

export function setWarmup(
  state: GameState,
  boatIndex: number,
  amount: number,
): GameState {
  if (
    state.phase !== "preparing" ||
    !state.boats[boatIndex] ||
    !Number.isInteger(amount) ||
    amount < 0 ||
    amount > 3
  ) return state;
  if (
    state.boats.reduce(
      (sum, b, i) => sum + (i === boatIndex ? amount : b.warmup),
      0,
    ) > 3
  ) return state;
  const next = clone(state);
  next.boats[boatIndex].warmup = amount;
  next.boats[boatIndex].position = 3 + amount;
  next.revision++;
  return next;
}

export function launch(state: GameState): GameState {
  if (state.phase !== "preparing") return state;
  const next = clone(state);
  // Unspent preparation is allocated evenly, keeping one-click starts viable.
  let remaining = 3 - next.boats.reduce((sum, b) => sum + b.warmup, 0);
  while (remaining > 0) {
    const boat = [...next.boats].sort((a, b) => a.warmup - b.warmup)[0];
    boat.warmup++;
    boat.position++;
    remaining--;
  }
  next.phase = "placing";
  next.turn = next.producer;
  addLog(
    next,
    `${next.players[next.producer].name}安排出航：${next.boats.map((b) => `${streamerById(b.streamer).name} ${b.position} 格`).join(" · ")}。`,
  );
  next.revision++;
  return next;
}

/** Exact public-information probability; intentionally never reads the random seed. */
export function successChance(
  state: GameState,
  boatIndex: number,
  extra = 0,
): number {
  const boat = state.boats[boatIndex];
  if (!boat) return 0;
  if (boat.position + extra >= TARGET) return 1;
  const remaining = ["settlement", "finished"].includes(state.phase)
    ? 0
    : ["reveal", "spotlight"].includes(state.phase)
      ? 3 - state.beat
      : 4 - state.beat;
  const wind = EVENTS[state.event].wind[boatIndex];
  let distribution = new Map<number, number>([
    [Math.max(0, Math.min(TARGET, boat.position + extra)), 1],
  ]);
  for (let step = 0; step < remaining; step++) {
    const next = new Map<number, number>();
    distribution.forEach((probability, position) => {
      for (let die = 1; die <= 6; die++) {
        const destination = Math.min(
          TARGET,
          position + Math.max(1, die + wind),
        );
        next.set(destination, (next.get(destination) || 0) + probability / 6);
      }
    });
    distribution = next;
  }
  return Math.min(1, Math.max(0, distribution.get(TARGET) || 0));
}

/** Joint odds for at least N misses, using only the remaining public dice. */
export function recognitionChance(state: GameState, recognition: number, boostedBoat = -1): number {
  const space = RECOGNITION_SPACES[recognition];
  if (!space) return 0;
  let distribution = [1, 0, 0, 0];
  state.boats.forEach((_, i) => {
    const success = successChance(state, i, i === boostedBoat ? 2 : 0);
    distribution = distribution.map((probability, misses) => probability * success + (misses ? distribution[misses - 1] * (1 - success) : 0));
  });
  const chance = distribution.slice(space.threshold).reduce((sum, p) => sum + p, 0);
  if (chance < 1e-12) return 0;
  if (chance > 1 - 1e-12) return 1;
  return Math.min(1, Math.max(0, chance));
}

function positionChance(state: GameState, boatIndex: number, position: number, rolls: number): number {
  let distribution = new Map<number, number>([[state.boats[boatIndex].position, 1]]);
  for (let step = 0; step < rolls; step++) {
    const next = new Map<number, number>();
    distribution.forEach((probability, current) => {
      for (let die = 1; die <= 6; die++) {
        const destination = Math.min(TARGET, current + Math.max(1, die + EVENTS[state.event].wind[boatIndex]));
        next.set(destination, (next.get(destination) || 0) + probability / 6);
      }
    });
    distribution = next;
  }
  return distribution.get(position) || 0;
}

/** Public dice only. Boarding odds exclude boats this player cannot join. */
export function clipForecast(state: GameState) {
  const afterRoll = ["reveal", "spotlight", "settlement", "finished"].includes(state.phase);
  const finalRolls = Math.max(0, (afterRoll ? 3 : 4) - state.beat);
  const secondRolls = (afterRoll ? 2 : 3) - state.beat;
  const settled = ["settlement", "finished"].includes(state.phase);
  const boardingChances = state.boats.map((b, i) => (!settled && secondRolls >= 0 && b.seats.length < 3 && !b.seats.some((seat) => seat.player === state.turn)
      ? positionChance(state, i, CLIP_SPOT, secondRolls) : 0));
  const finalChances = state.boats.map((_, i) => positionChance(state, i, CLIP_SPOT, finalRolls));
  return {
    boarding: 1 - boardingChances.reduce((p, chance) => p * (1 - chance), 1),
    jackpot: 1 - finalChances.reduce((p, chance) => p * (1 - chance), 1),
    expectedPayout: finalChances.reduce((sum, chance) => sum + chance * CLIP_PAYOUT, 0),
  };
}

export function clipBoardingOptions(state: GameState, player = state.turn): number[] {
  return state.boats.flatMap((b, i) => (b.position === CLIP_SPOT && b.seats.length < 3 &&
    !b.seats.some((seat) => seat.player === player) ? [i] : []));
}

function nextClipDecision(state: GameState) {
  while (state.clipQueue.length) {
    const slot = state.clippers[state.clipQueue[0]];
    if (slot && clipBoardingOptions(state, slot.player).length) {
      state.turn = slot.player;
      state.phase = "spotlight";
      return;
    }
    state.clipQueue.shift();
  }
  state.beat = 3;
  state.placed = 0;
  state.turn = state.producer;
  state.phase = "placing";
}

export function resolveClip(state: GameState, boatIndex: number | null): GameState {
  if (state.phase !== "spotlight" || !state.clipQueue.length) return state;
  if (boatIndex !== null && !clipBoardingOptions(state).includes(boatIndex)) return state;
  const next = clone(state);
  const index = next.clipQueue.shift()!;
  const slot = next.clippers[index]!;
  const { name } = next.players[slot.player];
  if (boatIndex !== null) {
    const boat = next.boats[boatIndex];
    boat.seats.push({ player: slot.player, cost: 0, insured: false, source: "clip" });
    next.clippers[index] = null;
    addLog(next, `${name}凭名场面切片蹭上${streamerById(boat.streamer).name}的空席！不再付船票，达标收 12 币。`);
  } else addLog(next, `${name}放弃免费上船，继续蹲最后一次的爆梗切片。`);
  nextClipDecision(next);
  next.revision++;
  return next;
}

export function chooseAiClip(state: GameState): number | null {
  const options = clipBoardingOptions(state).map((boat) => ({ boat, value: SEAT_PAYOUT * successChance(state, boat) }));
  const best = options.sort((a, b) => b.value - a.value)[0];
  const holding = clipForecast(state).expectedPayout / Math.max(1, state.clippers.filter(Boolean).length);
  return best && best.value >= holding ? best.boat : null;
}

export function actionCost(state: GameState, action: Action): number {
  if (action.kind === "recognition") {
    const space = RECOGNITION_SPACES[action.recognition ?? -1];
    return space ? space.cost + state.beat - 1 : 0;
  }
  if (action.kind === "clip") return CLIP_COST;
  const boat = state.boats[action.boat];
  if (!boat || action.kind === "work") return 0;
  switch (action.kind) {
    case "support":
      return (
        4 + (state.beat - 1) * 2 + boat.seats.length + (action.insured ? 2 : 0)
      );
    case "share":
      return state.prices[boat.streamer];
    case "boost":
    case "smear":
      return 2;
    case "insure":
      return 2;
    default:
      return 0;
  }
}

export function actionProblem(state: GameState, action: Action): string | null {
  if (state.phase !== "placing") return "等待下一次安排";
  if (action.kind === "work") return null;
  const player = state.players[state.turn];
  if (action.kind === "recognition") {
    const index = action.recognition ?? -1;
    if (!Number.isInteger(index) || !RECOGNITION_SPACES[index]) return "先选一种认知席";
    if (state.recognition?.[index]) return "这个认知席已有人蹲守";
    if (recognitionChance(state, index) < 1e-10) return "已不可能有这么多主播未达标";
    if (player.cash < actionCost(state, action)) return "应援币不足，可以接个小单";
    return null;
  }
  if (action.kind === "clip") {
    if (state.clippers.every(Boolean)) return "两个切片位都有人了";
    if (state.clipEntrants.includes(player.id)) return "每人每场只能蹲一次切片";
    if (player.cash < CLIP_COST) return "应援币不足，可以接个小单";
    if (clipForecast(state).boarding < 1e-10 && clipForecast(state).jackpot < 1e-10) return "已经错过本场名场面";
    return null;
  }
  if (!["support", "share", "boost", "smear", "insure"].includes(action.kind)) return "无效行动";
  const boat = state.boats[action.boat];
  if (!boat) return "先选一艘船";
  if (boat.position >= TARGET) return "已经达标，不能再入场";
  if (action.kind === "smear" && boat.position <= 0) return "已经在起点，不能再后退";
  if (action.kind === "support") {
    if (boat.seats.some((s) => s.player === player.id)) return "你已在这艘船上";
    if (boat.seats.length >= 3) return "三个应援席已满";
  }
  if (action.kind === "share") {
    if (player.boughtThisRound) return "每场活动只能买一股";
    if (state.players.reduce((sum, p) => sum + p.shares[boat.streamer], 0) >= 8) return "这位主播的八股已售完";
  }
  if (
    action.kind === "insure" &&
    !boat.seats.some((s) => s.player === player.id && !s.insured && s.cost > 0)
  ) return "先拥有一个未投保应援席";
  if (player.cash < actionCost(state, action)) return "应援币不足，可以接个小单";
  return null;
}

export function takeAction(state: GameState, action: Action): GameState {
  if (actionProblem(state, action)) return state;
  const next = clone(state);
  const player = next.players[next.turn];
  const boat = next.boats[action.boat];
  const cost = actionCost(next, action);
  const name = boat ? streamerById(boat.streamer).name : "";
  player.cash -= cost;
  switch (action.kind) {
    case "recognition": {
      const index = action.recognition!;
      const space = RECOGNITION_SPACES[index];
      next.recognition[index] = { player: player.id, cost };
      addLog(next, `${player.name}花 ${cost} 币当认知民：押${space.label}，猜中收 ${space.payout} 币。`);
      break;
    }
    case "support":
      boat.seats.push({
        player: player.id,
        cost: cost - (action.insured ? 2 : 0),
        insured: Boolean(action.insured),
      });
      addLog(
        next,
        `${player.name}花 ${cost} 币上了${name}的船${action.insured ? "，附带保本险" : ""}。达标收 12 币。`,
      );
      break;
    case "clip": {
      const index = next.clippers.findIndex((slot) => !slot);
      next.clippers[index] = { player: player.id, cost };
      next.clipEntrants.push(player.id);
      addLog(next, `${player.name}花 2 币蹲守名场面，占下第 ${index + 1} 个切片位。`);
      break;
    }
    case "share":
      player.shares[boat.streamer]++;
      player.boughtThisRound = true;
      addLog(next, `${player.name}花 ${cost} 币买入${name} 1 股，跨活动持有。`);
      break;
    case "boost":
    case "smear": {
      const before = boat.position;
      const backward = action.kind === "smear";
      boat.position = Math.max(0, Math.min(TARGET, before + (backward ? -2 : 2)));
      addLog(
        next,
        `${player.name}花 2 币对${name}投流${backward ? "黑料" : "助推"}，${backward ? "后退" : "前进"} ${Math.abs(boat.position - before)} 格${boat.position >= TARGET ? "，提前达标！" : "。"}`,
      );
      break;
    }
    case "insure": {
      const seat = boat.seats.find((s) => s.player === player.id);
      if (seat) seat.insured = true;
      addLog(next, `${player.name}花 2 币给${name}的应援席加了保本险。`);
      break;
    }
    case "work":
      player.cash += WORK_PAYOUT;
      addLog(next, `${player.name}接了一个剪辑小单，收到 ${WORK_PAYOUT} 币。`);
      break;
    default:
      break;
  }
  next.placed++;
  if (next.placed === next.players.length) next.phase = "sailing";
  else next.turn = (next.turn + 1) % next.players.length;
  next.revision++;
  return next;
}

export function roll(state: GameState): GameState {
  if (state.phase !== "sailing") return state;
  const next = clone(state);
  next.boats.forEach((boat, i) => {
    if (boat.position >= TARGET) {
      boat.die = null;
      boat.movement = 0;
      return;
    }
    boat.die = Math.floor(random(next) * 6) + 1;
    boat.movement = Math.min(
      TARGET - boat.position,
      Math.max(1, boat.die + EVENTS[next.event].wind[i]),
    );
    boat.position += boat.movement;
  });
  next.phase = "reveal";
  addLog(
    next,
    `第 ${next.beat} 次推进：${next.boats.map((b) => `${streamerById(b.streamer).name}${b.movement ? ` +${b.movement}` : " 已达标"}`).join(" · ")}。`,
  );
  next.revision++;
  return next;
}

function settle(state: GameState) {
  const payments: Payment[] = [];
  const pay = (player: number, label: string, amount: number) => {
    state.players[player].cash += amount;
    payments.push({ player, label, amount });
  };
  const boats = state.boats.map((boat) => {
    const success = boat.position >= TARGET;
    const { name } = streamerById(boat.streamer);
    const priceBefore = state.prices[boat.streamer];
    boat.seats.forEach((seat) => {
      if (success) pay(seat.player, `${name} · 应援回报`, SEAT_PAYOUT);
      else if (seat.insured) pay(seat.player, `${name} · 保险退还本金`, seat.cost);
      else payments.push({
          player: seat.player,
          label: `${name} · 应援未达标`,
          amount: 0,
        });
    });
    state.prices[boat.streamer] = Math.max(3, priceBefore + (success ? 3 : -1));
    return {
      streamer: boat.streamer,
      success,
      position: boat.position,
      priceBefore,
      priceAfter: state.prices[boat.streamer],
    };
  });
  const failed = boats.filter((b) => !b.success).length;
  state.recognition.forEach((slot, i) => {
    if (!slot) return;
    const space = RECOGNITION_SPACES[i];
    pay(slot.player, `认知民 · ${space.label}${failed >= space.threshold ? "，猜中了" : "，未猜中"}`, failed >= space.threshold ? space.payout : 0);
  });
  const clippers = state.clippers.filter((slot) => slot !== null);
  const featured = state.boats.filter((boat) => boat.position === CLIP_SPOT);
  const clipPool = featured.length * CLIP_PAYOUT;
  clippers.forEach((slot, i) => {
    const amount = Math.floor(clipPool / clippers.length) + (i < clipPool % clippers.length ? 1 : 0);
    pay(slot.player, clipPool ? `切片佬 · ${featured.length} 个爆梗${clippers.length > 1 ? "，撞车平分" : "，独家首发"}` : "切片佬 · 没蹲到爆梗", amount);
  });
  state.results.push({
    round: state.round,
    boats,
    payments,
    cashDelta: state.players.map((p, i) => p.cash - state.roundCash[i]),
    wealthDelta: state.players.map(
      (p, i) => wealth(state, p) - state.roundWealth[i],
    ),
  });
  state.phase = "settlement";
  addLog(
    state,
    `第 ${state.round} 场结束，${3 - failed} 艘达标、${failed} 艘未达标。应援、保险、认知与切片均已结算。`,
  );
}

export function continueGame(state: GameState): GameState {
  if (!["reveal", "settlement"].includes(state.phase)) return state;
  const next = clone(state);
  if (next.phase === "reveal") {
    if (next.beat === 3) settle(next);
    else if (next.beat === 2) {
      next.clipQueue = next.clippers.flatMap((slot, i) => (slot ? [i] : []));
      nextClipDecision(next);
    } else {
      next.beat++;
      next.placed = 0;
      next.turn = next.producer;
      next.phase = "placing";
    }
  } else if (next.round === next.rounds) next.phase = "finished";
  else {
    next.round++;
    next.beat = 1;
    next.producer = (next.producer + 1) % next.players.length;
    next.turn = next.producer;
    next.placed = 0;
    next.phase = "preparing";
    next.event = Math.floor(random(next) * EVENTS.length);
    next.boats = emptyBoats(next.boats.map((b) => b.streamer));
    next.recognition = [null, null, null];
    next.clippers = [null, null];
    next.clipQueue = [];
    next.clipEntrants = [];
    next.players.forEach((p) => {
      p.boughtThisRound = false;
    });
    next.roundCash = next.players.map((p) => p.cash);
    next.roundWealth = next.players.map((p) => wealth(next, p));
    addLog(
      next,
      `第 ${next.round} 场，轮到${next.players[next.producer].name}做主理人。${EVENTS[next.event].title}。`,
    );
  }
  next.revision++;
  return next;
}

export function availableActions(state: GameState): Action[] {
  if (state.phase !== "placing") return [];
  const actions: Action[] = [{ kind: "work", boat: 0 }];
  RECOGNITION_SPACES.forEach((_, recognition) => {
    const action: Action = { kind: "recognition", boat: 0, recognition };
    if (!actionProblem(state, action)) actions.push(action);
  });
  const clip: Action = { kind: "clip", boat: 0 };
  if (!actionProblem(state, clip)) actions.push(clip);
  state.boats.forEach((_, boat) => {
    (["support", "share", "boost", "smear", "insure"] as ActionKind[]).forEach(
      (kind) => {
        const action = { kind, boat };
        if (!actionProblem(state, action)) actions.push(action);
      },
    );
    const insured = { kind: "support" as const, boat, insured: true };
    if (!actionProblem(state, insured)) actions.push(insured);
  });
  return actions;
}

export function chooseAiAction(state: GameState): {
  action: Action;
  reason: string;
} {
  const player = state.players[state.turn];
  const scored = availableActions(state).map((action) => {
    const boat = state.boats[action.boat];
    const chance = successChance(state, action.boat);
    const cost = actionCost(state, action);
    let score = WORK_PAYOUT;
    let reason = "补充现金，给后面的机会留余地";
    if (action.kind === "support") {
      score =
        chance * SEAT_PAYOUT -
        cost +
        (action.insured ? (1 - chance) * (cost - 2) : 0);
      reason = `${Math.round(chance * 100)}% 的达标机会，上船${action.insured ? "并保本" : "争取回报"}`;
      if (action.insured && player.cash < 14) score += 0.8;
    } else if (action.kind === "recognition") {
      const index = action.recognition!;
      const probability = recognitionChance(state, index);
      score = probability * RECOGNITION_SPACES[index].payout - cost;
      reason = `押${RECOGNITION_SPACES[index].label}，猜中机会 ${Math.round(probability * 100)}%`;
    } else if (action.kind === "clip") {
      const forecast = clipForecast(state);
      const competition = state.clippers.filter(Boolean).length + 1;
      score = (forecast.boarding * 7) / competition + forecast.expectedPayout / competition - cost;
      reason = "蹲守 13 格名场面，争取免费上船或最后的爆梗分成";
    } else if (action.kind === "share") {
      score = 4 * chance - 1 + (state.rounds - state.round) * 0.9;
      if (player.cash - cost < 8) score -= 3;
      reason = "看好后续活动，提前持有长期股";
    } else if (action.kind === "boost" || action.kind === "smear") {
      const shifted = clone(state);
      shifted.boats[action.boat].position = Math.max(0, Math.min(TARGET, boat.position + (action.kind === "smear" ? -2 : 2)));
      const delta = successChance(shifted, action.boat) - chance;
      const seat = boat.seats.find((s) => s.player === player.id);
      const exposure =
        (seat ? SEAT_PAYOUT - (seat.insured ? seat.cost : 0) : 0) +
        4 * player.shares[boat.streamer];
      score = delta * exposure - cost;
      state.recognition?.forEach((slot, i) => {
        if (slot?.player === player.id) {
          score += (recognitionChance(shifted, i) - recognitionChance(state, i)) * RECOGNITION_SPACES[i].payout;
        }
      });
      if (state.clippers.some((slot) => slot?.player === player.id)) {
        const count = state.clippers.filter(Boolean).length;
        score += (clipForecast(shifted).expectedPayout - clipForecast(state).expectedPayout) / count;
      }
      if (action.kind === "smear") {
        const rivalExposure = Math.max(0, ...state.players.filter((p) => p.id !== player.id).map((p) => {
          const rivalSeat = boat.seats.find((s) => s.player === p.id);
          return (rivalSeat ? SEAT_PAYOUT - (rivalSeat.insured ? rivalSeat.cost : 0) : 0) + 4 * p.shares[boat.streamer];
        }));
        score -= delta * rivalExposure * 0.35;
      }
      reason = action.kind === "smear"
        ? "黑料降低达标机会，兼顾认知回报、切片位置和对手的投资"
        : "助推提高达标机会，也要考虑自己的认知席与切片位";
    } else if (action.kind === "insure") {
      const seat = boat.seats.find((s) => s.player === player.id);
      score = (1 - chance) * (seat?.cost || 0) - cost;
      reason = "形势转弱，先给应援本金加保险";
    }
    // Small, public-state-only preferences give opponents different personalities.
    if (player.id % 3 === 1 && action.kind === "share") score += 0.35;
    if (player.id % 3 === 2 && ["recognition", "clip"].includes(action.kind)) score += 0.35;
    return { action, reason, score };
  });
  const best = scored.sort((a, b) => b.score - a.score)[0];
  return (
    best || { action: { kind: "work", boat: 0 }, reason: "等待下一轮机会" }
  );
}

export function prepareAi(state: GameState): GameState {
  if (state.phase !== "preparing") return state;
  let next = state;
  const player = state.players[state.producer];
  const preferred = state.roster
    .map((_, i) => streamerById(state.roster[(i + state.round + state.producer - 1) % 4]))
    .sort((a, b) => player.shares[b.id] - player.shares[a.id]);
  preferred.slice(0, 3).forEach((s, i) => {
    next = setRoster(next, i, s.id);
  });
  const favored = next.boats
    .map((b, i) => ({
      i,
      score: player.shares[b.streamer] + EVENTS[next.event].wind[i] * 0.4,
    }))
    .sort((a, b) => b.score - a.score)[0].i;
  next = setWarmup(next, favored, 2);
  return launch(next);
}

export function gameText(state: GameState | null) {
  if (!state) return JSON.stringify({ game: "hype-harbor", phase: "menu" });
  return JSON.stringify({
    game: "hype-harbor",
    coordinates:
      "three horizontal lanes; progress increases left to right from 0 to 15",
    phase: state.phase,
    round: state.round,
    rounds: state.rounds,
    beat: state.beat,
    turn: state.turn,
    producer: state.producer,
    placed: state.placed,
    revision: state.revision,
    event: EVENTS[state.event],
    roster: state.roster,
    resting: state.roster.find(
      (id) => !state.boats.some((b) => b.streamer === id),
    ),
    players: state.players.map((p) => ({ ...p, wealth: wealth(state, p) })),
    boats: state.boats.map((b, i) => ({
      ...b,
      name: streamerById(b.streamer).name,
      chance: successChance(state, i),
      target: TARGET,
    })),
    prices: state.prices,
    recognition: RECOGNITION_SPACES.map((space, i) => ({
      ...space,
      cost: actionCost(state, { kind: "recognition", boat: 0, recognition: i }),
      owner: state.recognition?.[i] || null,
      chance: recognitionChance(state, i),
    })),
    clippers: state.clippers,
    clipEntrants: state.clipEntrants,
    clipQueue: state.clipQueue,
    clipSpot: CLIP_SPOT,
    clipForecast: clipForecast(state),
    clipOptions: state.phase === "spotlight" ? clipBoardingOptions(state) : [],
    log: state.log.slice(0, 6),
    result: state.results.at(-1) || null,
    availableActions: availableActions(state).map((a) => ({
      ...a,
      cost: actionCost(state, a),
    })),
  });
}

type LegacyState = Omit<GameState, "boats"> & {
  yard?: ({ player: number; cost: number } | null)[];
  boats: (Boat & { rescue?: { player: number; cost: number } | null })[];
};

function migrateLegacy(state: GameState): GameState {
  if (state.version !== 1) return state;
  const legacy = state as LegacyState;
  const unsettled = !["settlement", "finished"].includes(state.phase);
  let refunded = 0;
  const refund = (slot: { player: number; cost: number } | null | undefined) => {
    if (!unsettled || !slot) return;
    state.players[slot.player].cash += slot.cost;
    refunded += slot.cost;
  };
  legacy.yard?.forEach(refund);
  legacy.boats.forEach((boat) => { refund(boat.rescue); delete boat.rescue; });
  delete legacy.yard;
  state.recognition = [null, null, null];
  state.clippers = [null, null];
  state.clipQueue = [];
  state.clipEntrants = [];
  state.version = SAVE_VERSION;
  addLog(state, `玩法更新：认知民与切片佬登场。${refunded ? `旧版未结算的救场／后援站投入 ${refunded} 币已原额退回。` : "原有现金、股份与活动进度保留。"}`);
  return state;
}

/** Validate the complete boundary before restored data can reach the renderer or rules. */
export function restoreGame(raw: string): GameState | null {
  try {
    const s = JSON.parse(raw) as GameState;
    const integer = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
    const record = (
      value: Record<StreamerId, number>,
      min: number,
      max: number,
    ) => value && STREAMERS.every((x) => integer(value[x.id], min, max));
    if (
      !s ||
      ![1, SAVE_VERSION].includes(s.version) ||
      !integer(s.seed, 0, 4294967295) ||
      ![3, 5].includes(s.rounds) ||
      !integer(s.round, 1, s.rounds) ||
      !integer(s.beat, 1, 3) ||
      !integer(s.event, 0, EVENTS.length - 1) ||
      ![
        "preparing",
        "placing",
        "sailing",
        "reveal",
        "spotlight",
        "settlement",
        "finished",
      ].includes(s.phase) ||
      !Array.isArray(s.players) ||
      !integer(s.players.length, 2, 4) ||
      !integer(s.revision, 0, 10000)
    ) return null;
    if (
      !Array.isArray(s.roster) ||
      s.roster.length !== 4 ||
      new Set(s.roster).size !== 4 ||
      !s.roster.every((id) => STREAMERS.some((x) => x.id === id))
    ) return null;
    const validPlayer = (id: unknown) => integer(id, 0, s.players.length - 1);
    if (s.version === 1) {
      const legacy = s as LegacyState;
      if (s.phase === "spotlight") return null;
      if (legacy.yard !== undefined && (!Array.isArray(legacy.yard) || legacy.yard.length !== 3 ||
        !legacy.yard.every((slot, i) => slot === null || (slot && validPlayer(slot.player) && [0, 2, 4].includes(slot.cost - [3, 2, 1][i]))))) return null;
      if (!Array.isArray(legacy.boats) || !legacy.boats.every((b) => b.rescue === null ||
        (b.rescue && validPlayer(b.rescue.player) && [3, 5, 7].includes(b.rescue.cost)))) return null;
    } else {
      if (!Array.isArray(s.recognition) || s.recognition.length !== 3 || !s.recognition.every((slot, i) => slot === null || (slot && validPlayer(slot.player) &&
        [0, 1, 2].some((extra) => slot.cost === RECOGNITION_SPACES[i].cost + extra)))) return null;
      if (!Array.isArray(s.clippers) || s.clippers.length !== 2 || !s.clippers.every((slot) => slot === null ||
        (slot && validPlayer(slot.player) && slot.cost === CLIP_COST)) ||
        new Set(s.clippers.filter(Boolean).map((slot) => slot!.player)).size !== s.clippers.filter(Boolean).length) return null;
      if (!Array.isArray(s.clipEntrants) || new Set(s.clipEntrants).size !== s.clipEntrants.length || !s.clipEntrants.every(validPlayer) ||
        !s.clippers.every((slot) => !slot || s.clipEntrants.includes(slot.player))) return null;
      if (!Array.isArray(s.clipQueue) || new Set(s.clipQueue).size !== s.clipQueue.length || !s.clipQueue.every((i) => integer(i, 0, 1) && s.clippers[i])) return null;
      if (s.phase !== "spotlight" && s.clipQueue.length) return null;
      if (s.phase === "spotlight" && (s.beat !== 2 || !s.clipQueue.length || s.clippers[s.clipQueue[0]]?.player !== s.turn)) return null;
    }
    if (
      !validPlayer(s.turn) ||
      !validPlayer(s.producer) ||
      !integer(s.placed, 0, s.players.length) ||
      !s.players.every(
        (p, i) => p.id === i &&
          typeof p.name === "string" &&
          p.name.length <= 12 &&
          typeof p.ai === "boolean" &&
          typeof p.boughtThisRound === "boolean" &&
          integer(p.cash, 0, 2000) &&
          record(p.shares, 0, 8),
      ) ||
      !record(s.prices, 3, 21)
    ) return null;
    if (
      !Array.isArray(s.boats) ||
      s.boats.length !== 3 ||
      new Set(s.boats.map((b) => b.streamer)).size !== 3 ||
      !s.boats.every(
        (b) => s.roster.includes(b.streamer) &&
          integer(b.position, 0, TARGET) &&
          integer(b.warmup, 0, 3) &&
          integer(b.movement, 0, 7) &&
          (b.die === null || integer(b.die, 1, 6)) &&
          Array.isArray(b.seats) &&
          b.seats.length <= 3 &&
          new Set(b.seats.map((x) => x.player)).size === b.seats.length &&
          b.seats.every(
            (x) => validPlayer(x.player) &&
              (integer(x.cost, 4, 10) || (s.version === SAVE_VERSION && x.cost === 0 && x.source === "clip" && !x.insured)) &&
              typeof x.insured === "boolean",
          ),
      )
    ) return null;
    if (
      !Array.isArray(s.log) ||
      !s.log.every((x) => typeof x === "string") ||
      ![s.roundCash, s.roundWealth].every(
        (a) => Array.isArray(a) &&
          a.length === s.players.length &&
          a.every((n) => integer(n, 0, 3000)),
      ) ||
      !Array.isArray(s.results) ||
      s.results.length > s.rounds
    ) return null;
    if (
      !s.results.every(
        (r) => integer(r.round, 1, s.rounds) &&
          Array.isArray(r.boats) &&
          r.boats.length === 3 &&
          r.boats.every(
            (b) => STREAMERS.some((x) => x.id === b.streamer) &&
              typeof b.success === "boolean" &&
              integer(b.position, 0, TARGET) &&
              integer(b.priceBefore, 3, 21) &&
              integer(b.priceAfter, 3, 21),
          ) &&
          Array.isArray(r.payments) &&
          r.payments.every(
            (p) => validPlayer(p.player) &&
              typeof p.label === "string" &&
              integer(p.amount, 0, 24),
          ) &&
          [r.cashDelta, r.wealthDelta].every(
            (a) => Array.isArray(a) &&
              a.length === s.players.length &&
              a.every((n) => integer(n, -3000, 3000)),
          ),
      )
    ) return null;
    if (s.phase === "placing" && s.placed >= s.players.length) return null;
    if (
      ["settlement", "finished"].includes(s.phase) &&
      s.results.length !== s.round
    ) return null;
    if (s.phase === "spotlight" && !clipBoardingOptions(s).length) return null;
    return migrateLegacy(s);
  } catch {
    return null;
  }
}
