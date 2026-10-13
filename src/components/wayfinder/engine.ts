import { HELP_STRATEGIES, LAST_MISSION, MISSIONS } from "./content";
import {
  bearing,
  direction,
  distance,
  edgeId,
  FLOOR_HEIGHT,
  makeWorld,
  nearestNode,
  pathLength,
  placeNode,
  route,
  walkable,
  wrap,
} from "./world";
import type { Place, World } from "./world";

export const dailySeed = (date = new Date()) => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
export const SAVE_KEY = "windpost-wayfinder-v1";
export type Mode =
  | "title"
  | "brief"
  | "playing"
  | "map"
  | "bearing"
  | "result"
  | "pause"
  | "journal";
// Retrieval is a pauseable choice, never a gate to continuing exploration.
export type Player = {
  x: number;
  z: number;
  floor: number;
  yaw: number;
  pitch: number;
};
export type TracePoint = { x: number; z: number; floor: number };
export type Metrics = {
  distance: number;
  mapOpens: number;
  locations: number;
  hints: number;
  rescues: number;
  bearingError: number | null;
  locateErrors: number[];
  floorMistakes: number;
  optimal: number;
  seconds: number;
  repeated: number;
  branchChecks: number;
  branchMistakes: number;
  marks: number;
};
export type Record = Metrics & {
  mission: number;
  seed: number;
  comfort: boolean;
  stamps: number;
  day: string;
  worldTheme: World["theme"];
};
export type Game = {
  mode: Mode;
  resumeMode: Mode;
  journalReturn: Mode;
  mission: number;
  seed: number;
  world: World;
  player: Player;
  phase: "outbound" | "home";
  blocked: string[];
  stamps: string[];
  visited: number[];
  stats: Metrics;
  trace: TracePoint[];
  referenceTrace: TracePoint[];
  records: Record[];
  unlocked: number;
  plan: string;
  toast: string;
  toastUntil: number;
  time: number;
  hintLevel: number;
  bearingAnswer: number | null;
  bearingFeedback: string;
  comfort: boolean;
  locate: boolean;
  locateResult: string;
  mapFloor: number;
  mapPin: TracePoint | null;
  transition: { from: number; to: number; t: number } | null;
  lastStair: string | null;
  daily: boolean;
  running: boolean;
  lastNode: number;
  edgeVisits: { [id: string]: number };
  chalk: string[];
  branchRecall: { edge: string; guess: boolean | null; actual: boolean } | null;
  bridgeEvent: {
    edge: string;
    stage: "armed" | "jump" | "broken";
    t: number;
  } | null;
};
export type Input = {
  forward: number;
  right: number;
  turn: number;
  sprint?: boolean;
};
const emptyStats = (): Metrics => ({
  distance: 0,
  mapOpens: 0,
  locations: 0,
  hints: 0,
  rescues: 0,
  bearingError: null,
  locateErrors: [],
  floorMistakes: 0,
  optimal: 0,
  seconds: 0,
  repeated: 0,
  branchChecks: 0,
  branchMistakes: 0,
  marks: 0,
});
const finite = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
export function createGame(): Game {
  const world = makeWorld();
  const p = world.nodes[world.start];
  return {
    mode: "title",
    resumeMode: "playing",
    journalReturn: "playing",
    mission: 0,
    seed: 31013,
    world,
    player: { x: p.x, z: p.z, floor: 0, yaw: 0, pitch: 0 },
    phase: "outbound",
    blocked: [],
    stamps: [],
    visited: [p.id],
    stats: emptyStats(),
    trace: [{ ...p }],
    referenceTrace: [],
    records: [],
    unlocked: 0,
    plan: "",
    toast: "",
    toastUntil: 0,
    time: 0,
    hintLevel: 0,
    bearingAnswer: null,
    bearingFeedback: "",
    comfort: false,
    locate: false,
    locateResult: "",
    mapFloor: 0,
    mapPin: null,
    transition: null,
    lastStair: null,
    daily: false,
    running: false,
    lastNode: world.start,
    edgeVisits: {},
    chalk: [],
    branchRecall: null,
    bridgeEvent: null,
  };
}
export function notify(g: Game, message: string) {
  g.toast = message;
  g.toastUntil = g.time + 8;
}
export function startMission(
  g: Game,
  mission: number,
  seed?: number,
  daily = false,
) {
  if (
    !Number.isInteger(mission) ||
    mission < 0 ||
    mission > LAST_MISSION ||
    (mission > g.unlocked && !(daily && mission === 5))
  ) return false;
  const { theme } = MISSIONS[mission];
  const newSeed =
    seed !== undefined && finite(seed, 0, 4294967295)
      ? Math.floor(seed)
      : mission === 5
        ? 63117
        : 31013;
  const next = createGame();
  next.mission = mission;
  next.seed = newSeed;
  next.daily = daily;
  next.world = makeWorld(newSeed, theme, mission === 5 || daily);
  const p = next.world.nodes[next.world.start];
  next.player = { x: p.x, z: p.z, floor: p.floor, yaw: 0, pitch: 0 };
  next.trace = [{ ...p }];
  next.visited = [p.id];
  next.lastNode = p.id;
  next.records = g.records;
  next.stamps = g.stamps;
  next.unlocked = g.unlocked;
  next.comfort = g.comfort;
  next.mode = "brief";
  next.stats.optimal = pathLength(
    next.world,
    route(next.world, next.world.start, targetPlace(next).node),
  );
  next.referenceTrace = route(
    next.world,
    next.world.start,
    targetPlace(next).node,
  ).map((id) => ({ ...next.world.nodes[id] }));
  Object.assign(g, next);
  return true;
}
export const targetPlace = (g: Game): Place => g.world.places.find(
    (p) => p.id === (g.phase === "home" ? "post" : MISSIONS[g.mission].target),
  )!;
export function beginWalk(g: Game) {
  if (g.mode === "brief") {
    g.mode = "playing";
    notify(g, MISSIONS[g.mission].clue);
  }
}
export function look(g: Game, dx: number, dy = 0) {
  if (
    g.mode !== "playing" ||
    g.branchRecall ||
    g.transition ||
    !Number.isFinite(dx + dy)
  ) return;
  g.player.yaw = wrap(g.player.yaw + Math.max(-1, Math.min(1, dx)));
  g.player.pitch = Math.max(-0.55, Math.min(0.45, g.player.pitch + dy));
}
function recordTrace(g: Game) {
  const previous = g.trace[g.trace.length - 1];
  if (previous.floor !== g.player.floor || distance(previous, g.player) > 1.4) {
    if (g.trace.length >= 5000) g.trace = g.trace.filter((_, i) => i % 2 === 0);
    g.trace.push({ x: g.player.x, z: g.player.z, floor: g.player.floor });
  }
  const near = nearestNode(g.world, g.player);
  if (distance(near, g.player) < 3 && !g.visited.includes(near.id)) g.visited.push(near.id);
  if (distance(near, g.player) < 1.2 && near.id !== g.lastNode) {
    const edge = g.world.edges.find(
      (e) => edgeId(e.a, e.b) === edgeId(g.lastNode, near.id),
    );
    if (edge) {
      const id = edgeId(edge.a, edge.b);
      if (g.edgeVisits[id]) g.stats.repeated += pathLength(g.world, [edge.a, edge.b]);
      g.edgeVisits[id] = (g.edgeVisits[id] ?? 0) + 1;
    }
    g.lastNode = near.id;
  }
}
export function stepGame(
  g: Game,
  ms: number,
  input: Input = { forward: 0, right: 0, turn: 0 },
) {
  if (g.mode !== "playing" || g.branchRecall || !finite(ms, 0, 10000)) return;
  g.running =
    input.sprint === true && Math.hypot(input.forward, input.right) > 0.1;
  let remaining = Math.min(ms, 200) / 1000;
  const forward = Number.isFinite(input.forward)
    ? Math.max(-1, Math.min(1, input.forward))
    : 0;
  const right = Number.isFinite(input.right)
    ? Math.max(-1, Math.min(1, input.right))
    : 0;
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 60);
    remaining -= dt;
    g.time += dt;
    g.stats.seconds += dt;
    const event = g.bridgeEvent;
    if (event?.stage === "armed" && g.phase === "home") {
      const e = g.world.edges.find((v) => edgeId(v.a, v.b) === event.edge)!;
      const a = g.world.nodes[e.a];
      const b = g.world.nodes[e.b];
      if (
        distance(g.player, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }) < 7.3
      ) {
        event.stage = "jump";
        event.t = 0;
        notify(g, "水面突然鼓起来了——大鲤鱼跃出河面，咬住了木桥！");
      }
    }
    if (event?.stage === "jump") {
      event.t += dt;
      g.running = false;
      if (event.t >= 1.65 && !g.blocked.includes(event.edge)) g.blocked.push(event.edge);
      if (event.t >= 3.4) {
        event.stage = "broken";
        notify(
          g,
          "鲤鱼叼走了桥板！先认清你在河的哪边，再找另一条路。地图已标出断桥。",
        );
      }
      continue;
    }
    if (g.transition) {
      g.transition.t = Math.min(1, g.transition.t + dt / 1.2);
      if (g.transition.t >= 1) {
        g.player.floor = g.world.nodes[g.transition.to].floor;
        g.transition = null;
        recordTrace(g);
      }
      continue;
    }
    const turn = Number.isFinite(input.turn)
      ? Math.max(-1, Math.min(1, input.turn))
      : 0;
    g.player.yaw = wrap(g.player.yaw + turn * dt * 1.75);
    const norm = Math.max(1, Math.hypot(forward, right));
    const speed =
      (g.comfort ? 4.5 : 6.3) * (g.running ? 1.85 : 1) * (dt / norm);
    const dx =
      (Math.sin(g.player.yaw) * forward + Math.cos(g.player.yaw) * right) *
      speed;
    const dz =
      (-Math.cos(g.player.yaw) * forward + Math.sin(g.player.yaw) * right) *
      speed;
    const { x } = g.player;
    const { z } = g.player;
    if (walkable(g.world, x + dx, z, g.player.floor, g.blocked)) g.player.x += dx;
    if (walkable(g.world, g.player.x, z + dz, g.player.floor, g.blocked)) g.player.z += dz;
    g.stats.distance += Math.hypot(g.player.x - x, g.player.z - z);
    recordTrace(g);
  }
}
export function nearPlace(g: Game): Place | undefined {
  return g.world.places
    .filter(
      (p) => g.world.nodes[p.node].floor === g.player.floor &&
        distance(g.player, g.world.nodes[p.node]) <= 3.4,
    )
    .sort(
      (a, b) => distance(g.player, g.world.nodes[a.node]) -
        distance(g.player, g.world.nodes[b.node]),
    )[0];
}
export function nearStair(g: Game) {
  return g.world.edges.find(
    (e) => e.stair &&
      [e.a, e.b].some(
        (id) => g.world.nodes[id].floor === g.player.floor &&
          distance(g.player, g.world.nodes[id]) <= 3.3,
      ),
  );
}
export function takeStairs(g: Game) {
  if (g.mode !== "playing" || g.transition) return false;
  const e = nearStair(g);
  if (!e) return false;
  const id = edgeId(e.a, e.b);
  if (g.blocked.includes(id)) {
    notify(g, "这座楼梯正在维护。中庭另一侧还有一座楼梯。");
    return false;
  }
  const from = g.world.nodes[e.a].floor === g.player.floor ? e.a : e.b;
  const to = from === e.a ? e.b : e.a;
  g.player.x = g.world.nodes[from].x;
  g.player.z = g.world.nodes[from].z;
  g.transition = { from, to, t: 0 };
  g.lastStair = id;
  g.stats.distance += FLOOR_HEIGHT;
  notify(
    g,
    `沿楼梯前往 ${g.world.nodes[to].floor + 1}F。记住这里，下次会从反方向看它。`,
  );
  return true;
}
function closeReturnRoute(g: Game) {
  if (g.mission !== 2 && g.mission !== 4) return;
  if (g.mission === 2) {
    const bridge = g.world.edges.find((e) => e.bridge);
    if (bridge) g.bridgeEvent = {
        edge: edgeId(bridge.a, bridge.b),
        stage: "armed",
        t: 0,
      };
    return;
  }
  const start = targetPlace(g).node;
  const path = route(g.world, start, g.world.start);
  const candidates =
    g.mission === 4
      ? [g.lastStair].filter((x): x is string => Boolean(x))
      : path.slice(1).map((id, i) => edgeId(path[i], id));
  for (const id of candidates) {
    const blocked = [...g.blocked, id];
    if (!route(g.world, start, g.world.start, blocked).length) continue;
    g.blocked = blocked;
    notify(
      g,
      g.mission === 4
        ? "刚才经过的楼梯开始维护了。带着回信，从另一座楼梯回邮局吧。"
        : "街道开始维修了，地图上已标出封路。带着回信，试一条新路线。",
    );
    break;
  }
}
export function interact(g: Game) {
  if (g.mode !== "playing" || g.transition) return false;
  const p = nearPlace(g);
  if (!p) return takeStairs(g);
  if (p.id !== targetPlace(g).id) {
    const stamp = `${g.world.theme}:${g.seed}:${p.id}`;
    if (!g.stamps.includes(stamp)) {
      g.stamps.push(stamp);
      notify(g, `收集了「${p.name}」风景邮票。${p.detail}`);
    } else notify(g, `${p.name}：${p.detail}`);
    return true;
  }
  if (g.phase === "outbound") {
    const stamp = `${g.world.theme}:${g.seed}:${p.id}`;
    if (!g.stamps.includes(stamp)) g.stamps.push(stamp);
    closeReturnRoute(g);
    g.phase = "home";
    const plannedBlocked = g.bridgeEvent
      ? [...g.blocked, g.bridgeEvent.edge]
      : g.blocked;
    g.stats.optimal += pathLength(
      g.world,
      route(g.world, p.node, g.world.start, plannedBlocked),
    );
    g.referenceTrace.push(
      ...route(g.world, p.node, g.world.start, plannedBlocked)
        .slice(1)
        .map((id) => ({ ...g.world.nodes[id] })),
    );
    g.mode = "bearing";
    g.bearingAnswer = null;
    g.bearingFeedback = "";
    return true;
  }
  g.mode = "result";
  const postStamp = `${g.world.theme}:${g.seed}:post`;
  if (!g.stamps.includes(postStamp)) g.stamps.push(postStamp);
  if (!g.daily) g.unlocked = Math.max(g.unlocked, Math.min(LAST_MISSION, g.mission + 1));
  g.records.push({
    ...g.stats,
    locateErrors: [...g.stats.locateErrors],
    mission: g.mission,
    seed: g.seed,
    comfort: g.comfort,
    stamps: g.stamps.filter((id) => id.startsWith(`${g.world.theme}:${g.seed}:`),).length,
    day: new Date().toISOString().slice(0, 10),
    worldTheme: g.world.theme,
  });
  g.records = g.records.slice(-60);
  return true;
}
export function answerBearing(g: Game, relativeIndex: number | null) {
  if (g.mode !== "bearing" || g.bearingFeedback) return;
  const target = placeNode(g.world, "post");
  const correct = bearing(g.player, target);
  const relative = [
    "正前方",
    "右前方",
    "右边",
    "右后方",
    "身后",
    "左后方",
    "左边",
    "左前方",
  ][Math.round(wrap(correct - g.player.yaw) / (Math.PI / 4)) % 8];
  if (relativeIndex === null) {
    g.bearingFeedback = `没关系。邮局在${direction(correct)}方，也就是你现在的${relative}。沿路看看地标，再把回信带回去。`;
    return;
  }
  if (
    !Number.isInteger(relativeIndex) ||
    relativeIndex < 0 ||
    relativeIndex > 7
  ) return;
  const guess = wrap(g.player.yaw + relativeIndex * (Math.PI / 4));
  const error =
    Math.abs(((guess - correct + Math.PI * 3) % (Math.PI * 2)) - Math.PI) *
    (180 / Math.PI);
  g.stats.bearingError = error;
  g.bearingAnswer = relativeIndex;
  g.bearingFeedback = `${error <= 30 ? "你记住了大方向！" : "我们一起对一下方向。"}邮局在${direction(correct)}方（你的${relative}），与你指的方向相差约 ${Math.round(error)}°。${g.world.theme === "arcade" && g.player.floor > 0 ? "还需要下到 1F。" : "试着自己找回去。"}`;
}
export function leaveBearing(g: Game) {
  if (g.mode !== "bearing" || !g.bearingFeedback) return;
  g.mode = "playing";
  if (!g.blocked.length) notify(g, "回信收好了。目的地现在是风邮局，试着从记得的路找回去。");
}
export function facingBranch(g: Game) {
  const n = nearestNode(g.world, g.player);
  if (distance(n, g.player) > 3 || g.transition) return null;
  const options = g.world.edges.filter(
    (e) => !e.stair && [e.a, e.b].includes(n.id),
  );
  return (
    options
      .map((e) => {
        const other = g.world.nodes[e.a === n.id ? e.b : e.a];
        const angle = Math.abs(
          ((bearing(n, other) - g.player.yaw + Math.PI * 3) % (Math.PI * 2)) -
            Math.PI,
        );
        return { id: edgeId(e.a, e.b), angle, other };
      })
      .sort((a, b) => a.angle - b.angle)[0] ?? null
  );
}
export function leaveChalk(g: Game) {
  if (g.mode !== "playing" || g.world.theme !== "cave") return;
  const branch = facingBranch(g);
  if (!branch) {
    notify(g, "先走近一个岔口，再面对想记住的支路。");
    return;
  }
  if (g.chalk.includes(branch.id)) {
    notify(g, "这条支路已经有你留下的粉笔月牙。换个朝向可以标另一条。");
    return;
  }
  g.chalk.push(branch.id);
  g.stats.marks++;
  notify(g, "你在面前这条支路入口画了月牙。记号会留在地面和纸地图上。");
}
export function recallBranch(g: Game) {
  if (g.mode !== "playing" || g.world.theme !== "cave") return;
  const branch = facingBranch(g);
  if (!branch) {
    notify(g, "走近岔口，面对想回想的支路。这里还不在路口旁。");
    return;
  }
  g.branchRecall = {
    edge: branch.id,
    guess: null,
    actual: Boolean(g.edgeVisits[branch.id]),
  };
  g.running = false;
}
export function answerBranch(g: Game, guess: boolean) {
  if (!g.branchRecall || g.branchRecall.guess !== null || g.mode !== "playing") return;
  g.branchRecall.guess = guess;
  g.stats.branchChecks++;
  if (guess !== g.branchRecall.actual) g.stats.branchMistakes++;
}
export function toggleMap(g: Game) {
  if (g.transition) return;
  if (g.mode === "map") {
    g.mode = "playing";
    g.locate = false;
    return;
  }
  if (g.mode !== "playing") return;
  g.mode = "map";
  g.mapFloor = g.player.floor;
  g.stats.mapOpens++;
  g.locate = false;
  g.locateResult = "";
  g.mapPin = null;
}
export function requestLocation(g: Game) {
  if (g.mode !== "map" || g.locate || g.locateResult) return;
  g.locate = true;
  g.locateResult = "";
}
export function locateAt(g: Game, x: number, z: number, floor: number) {
  if (g.mode !== "map" || !g.locate || ![x, z, floor].every(Number.isFinite)) return;
  const error = distance({ x, z }, g.player);
  const same = floor === g.player.floor;
  g.stats.locations++;
  g.stats.locateErrors.push(error);
  if (!same) g.stats.floorMistakes++;
  g.mapPin = { x, z, floor };
  g.locateResult = same
    ? `你标的位置相差约 ${Math.round(error)} 米。实心点是现在的位置。`
    : `你在 ${g.player.floor + 1}F，刚标的是 ${floor + 1}F。先确认楼层，再找附近地标。`;
  g.mapFloor = g.player.floor;
  g.locate = false;
}
export function revealLocation(g: Game) {
  if (g.mode !== "map" || g.locateResult) return;
  g.stats.locations++;
  g.locate = false;
  g.mapFloor = g.player.floor;
  g.locateResult = "实心点是现在的位置。看看附近地标，下次可以先试着自己判断。";
}
export const showPosition = (g: Game) => g.mission === 0 || g.comfort || Boolean(g.locateResult);
export function hint(g: Game) {
  if (g.mode !== "playing") return;
  g.stats.hints++;
  g.hintLevel = (g.hintLevel % 3) + 1;
  if (g.hintLevel === 1) {
    notify(g, HELP_STRATEGIES[g.mission % HELP_STRATEGIES.length]);
    return;
  }
  const near = nearestNode(g.world, g.player);
  const nearby = [...g.world.places]
    .filter((p) => g.world.nodes[p.node].floor === g.player.floor)
    .sort(
      (a, b) => distance(g.world.nodes[a.node], g.player) -
        distance(g.world.nodes[b.node], g.player),
    )[0];
  if (g.hintLevel === 2) {
    notify(
      g,
      `你在 ${g.player.floor + 1}F，离${nearby.name}最近；它在你的${direction(bearing(g.player, g.world.nodes[nearby.node]))}方。`,
    );
    return;
  }
  const path = route(g.world, near.id, targetPlace(g).node, g.blocked);
  const next = g.world.nodes[path[1] ?? path[0]];
  if (!next) {
    notify(g, "先回到认得的路口，再看看地图。");
    return;
  }
  notify(
    g,
    next.floor !== g.player.floor
      ? "到眼前的楼梯旁，按「走楼梯」换层。"
      : `先沿道路到最近路口，再往${direction(bearing(near, next))}走一条街。到路口后重新观察。`,
  );
}
export function rescue(g: Game) {
  if (!["playing", "pause", "map"].includes(g.mode)) return;
  const n = g.world.nodes[g.world.start];
  g.player = { x: n.x, z: n.z, floor: n.floor, yaw: 0, pitch: 0 };
  g.transition = null;
  g.lastNode = n.id;
  g.branchRecall = null;
  g.running = false;
  if (g.bridgeEvent?.stage === "jump") {
    g.bridgeEvent.stage = "broken";
    g.bridgeEvent.t = 3.4;
    if (!g.blocked.includes(g.bridgeEvent.edge)) g.blocked.push(g.bridgeEvent.edge);
  }
  g.stats.rescues++;
  g.mode = "playing";
  g.trace.push({ ...n });
  notify(g, "已经回到邮局门口。回程车不扣邮票，准备好了再出发。");
}
export function pause(g: Game) {
  g.running = false;
  if (g.mode === "pause") {
    g.mode = g.resumeMode;
    return;
  }
  if (["title", "result", "brief"].includes(g.mode)) return;
  g.resumeMode = g.mode;
  g.mode = "pause";
}
export function openJournal(g: Game) {
  if (g.mode === "journal") return;
  g.journalReturn = g.mode;
  g.mode = "journal";
}
export function closeJournal(g: Game) {
  if (g.mode === "journal") g.mode = g.journalReturn;
}
export function publicState(g: Game) {
  return {
    mode: g.mode,
    mission: g.mission,
    title: MISSIONS[g.mission].title,
    seed: g.seed,
    phase: g.phase,
    player: g.player,
    target: targetPlace(g),
    world: g.world,
    blocked: g.blocked,
    stats: g.stats,
    visited: g.visited,
    stamps: g.stamps,
    unlocked: g.unlocked,
    plan: g.plan,
    toast: g.toast,
    transition: g.transition,
    bearingFeedback: g.bearingFeedback,
    locateResult: g.locateResult,
    comfort: g.comfort,
    records: g.records,
    running: g.running,
    bridgeEvent: g.bridgeEvent,
    edgeVisits: g.edgeVisits,
    chalk: g.chalk,
    branchRecall: g.branchRecall,
    coordinates:
      "metres; x=east, z=south, floor=0/1; yaw 0=north, positive=east",
  };
}
export function saveGame(g: Game) {
  // Geometry is regenerated on load. Never accept collision data from storage.
  const { world, referenceTrace, ...data } = g;
  return JSON.stringify({ version: 1, ...data });
}
function validMetrics(v: unknown): v is Metrics {
  if (!v || typeof v !== "object") return false;
  const m = v as Metrics;
  return (
    [
      "distance",
      "mapOpens",
      "locations",
      "hints",
      "rescues",
      "floorMistakes",
      "optimal",
      "seconds",
      "repeated",
      "branchChecks",
      "branchMistakes",
      "marks",
    ].every((k) => finite(m[k as keyof Metrics], 0, 1e9)) &&
    (m.bearingError === null || finite(m.bearingError, 0, 180)) &&
    Array.isArray(m.locateErrors) &&
    m.locateErrors.length <= 10000 &&
    m.locateErrors.every((n) => finite(n, 0, 1e4))
  );
}
export function loadGame(raw: string | null): Game | null {
  if (!raw || raw.length > 2e6) return null;
  try {
    const d = JSON.parse(raw) as Game & { version: number };
    // v1 saves remain readable; newly introduced metrics start at zero.
    if (d.stats) d.stats = { ...emptyStats(), ...d.stats };
    if (Array.isArray(d.records)) d.records = d.records.map((r) => ({ ...emptyStats(), ...r }));
    if (
      d.version !== 1 ||
      !Number.isInteger(d.mission) ||
      !finite(d.mission, 0, LAST_MISSION) ||
      !Number.isInteger(d.unlocked) ||
      !finite(d.unlocked, 0, LAST_MISSION) ||
      (d.mission > d.unlocked && !(d.daily === true && d.mission === 5)) ||
      !finite(d.seed, 0, 4294967295) ||
      !validMetrics(d.stats)
    ) return null;
    if (
      !["outbound", "home"].includes(d.phase) ||
      ![
        "title",
        "brief",
        "playing",
        "map",
        "bearing",
        "result",
        "pause",
        "journal",
      ].includes(d.mode)
    ) return null;
    const g = createGame();
    g.unlocked = d.unlocked;
    startMission(g, d.mission, d.seed, d.daily === true);
    const p = d.player;
    if (
      !p ||
      !finite(p.yaw, -100, 100) ||
      !finite(p.pitch, -0.55, 0.45) ||
      !Number.isInteger(p.floor)
    ) return null;
    if (
      !Array.isArray(d.blocked) ||
      d.blocked.length > 2 ||
      !d.blocked.every((id) => g.world.edges.some((e) => edgeId(e.a, e.b) === id),)
    ) return null;
    if (!walkable(g.world, p.x, p.z, p.floor, d.blocked)) return null;
    if (
      !Array.isArray(d.records) ||
      !d.records.every(
        (r) => validMetrics(r) &&
          Number.isInteger(r.mission) &&
          finite(r.mission, 0, LAST_MISSION) &&
          finite(r.seed, 0, 4294967295) &&
          typeof r.day === "string" &&
          r.day.length <= 10 &&
          finite(r.stamps, 0, 8),
      )
    ) return null;
    if (
      !Array.isArray(d.stamps) ||
      !d.stamps.every((s) => typeof s === "string" && s.length < 80) ||
      d.stamps.length > 5000
    ) return null;
    if (
      !Array.isArray(d.trace) ||
      d.trace.length === 0 ||
      d.trace.length > 5000 ||
      !d.trace.every(
        (t) => finite(t.x, -100, 100) &&
          finite(t.z, -100, 100) &&
          finite(t.floor, 0, 1),
      )
    ) return null;
    g.player = { ...p };
    g.phase = d.phase;
    g.blocked = d.blocked;
    const validEdge = (id: string) => g.world.edges.some((e) => edgeId(e.a, e.b) === id);
    g.edgeVisits = {};
    if (d.edgeVisits && typeof d.edgeVisits === "object") Object.entries(d.edgeVisits).forEach(([id, count]) => {
        if (validEdge(id) && Number.isInteger(count) && finite(count, 0, 1e6)) g.edgeVisits[id] = count;
      });
    g.lastNode =
      Number.isInteger(d.lastNode) && g.world.nodes[d.lastNode]
        ? d.lastNode
        : nearestNode(g.world, p).id;
    g.chalk = Array.isArray(d.chalk)
      ? Array.from(
          new Set(
            d.chalk.filter((id) => typeof id === "string" && validEdge(id)),
          ),
        )
      : [];
    if (g.mission === 2 && g.phase === "home") {
      const bridge = g.world.edges.find((e) => e.bridge);
      if (bridge) {
        const id = edgeId(bridge.a, bridge.b);
        const candidate = d.bridgeEvent;
        g.bridgeEvent = {
          edge: id,
          stage: g.blocked.includes(id) ? "broken" : "armed",
          t: 0,
        };
        if (
          candidate?.edge === id &&
          candidate.stage === "jump" &&
          finite(candidate.t, 0, 3.4)
        ) {
          g.bridgeEvent = { ...candidate };
        }
      }
    }
    if (g.phase === "home") g.referenceTrace.push(
        ...route(
          g.world,
          g.world.places.find(
            (place) => place.id === MISSIONS[g.mission].target,
          )!.node,
          g.world.start,
          g.bridgeEvent ? [...g.blocked, g.bridgeEvent.edge] : g.blocked,
        )
          .slice(1)
          .map((id) => ({ ...g.world.nodes[id] })),
      );
    g.stats = d.stats;
    g.stamps = d.stamps;
    g.trace = d.trace;
    g.records = d.records.slice(-60);
    g.comfort = d.comfort === true;
    g.plan = g.world.places.some((place) => place.id === d.plan) ? d.plan : "";
    g.visited = Array.isArray(d.visited)
      ? d.visited.filter(
          (id) => Number.isInteger(id) && Boolean(g.world.nodes[id]),
        )
      : [];
    g.time = finite(d.time, 0, 1e9) ? d.time : 0;
    g.lastStair =
      typeof d.lastStair === "string" &&
      g.world.edges.some((e) => e.stair && edgeId(e.a, e.b) === d.lastStair)
        ? d.lastStair
        : null;
    g.bearingFeedback =
      typeof d.bearingFeedback === "string"
        ? d.bearingFeedback.slice(0, 250)
        : "";
    g.bearingAnswer = finite(d.bearingAnswer, 0, 7) ? d.bearingAnswer : null;
    const restoreMode = (mode: Mode, depth = 0): Mode => {
      if (depth > 3) return "playing";
      if (mode === "journal") return restoreMode(d.journalReturn, depth + 1);
      if (mode === "pause") return restoreMode(d.resumeMode, depth + 1);
      if (["title", "brief", "bearing", "result"].includes(mode)) return mode;
      return "playing";
    };
    g.mode = d.mode === "pause" ? "pause" : restoreMode(d.mode);
    g.resumeMode = restoreMode(d.resumeMode);
    if (
      !g.daily &&
      g.mission === 5 &&
      g.phase === "home" &&
      (g.mode === "result" || g.resumeMode === "result") &&
      g.records.some((r) => r.mission === 5)
    ) g.unlocked = Math.max(g.unlocked, 6);
    if (
      (["bearing", "result"].includes(g.mode) ||
        (g.mode === "pause" && ["bearing", "result"].includes(g.resumeMode))) &&
      g.phase !== "home"
    ) return null;
    if (
      d.transition &&
      g.world.edges.some(
        (e) => e.stair &&
          [e.a, e.b].includes(d.transition!.from) &&
          [e.a, e.b].includes(d.transition!.to),
      )
    ) {
      const n = g.world.nodes[d.transition.to];
      g.player.x = n.x;
      g.player.z = n.z;
      g.player.floor = n.floor;
    }
    return g;
  } catch {
    return null;
  }
}
