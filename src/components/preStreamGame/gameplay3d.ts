export const TASK_IDS = ['water', 'toilet', 'food', 'cat', 'audio', 'vts', 'obs'] as const;
export type TaskId = typeof TASK_IDS[number];
export const INCIDENT_IDS = ['spill', 'cable', 'catwalk'] as const;
export type IncidentId = typeof INCIDENT_IDS[number];
export type StationId = 'thermos' | 'dispenser' | 'toilet' | 'food' | 'cat' | 'audio' | 'vts' | 'obs' | IncidentId;
export type MiniKind = Exclude<TaskId, 'water'> | IncidentId;
export type MiniStage = 'shoot' | 'flush-ready' | 'flushing' | 'plate' | 'feed' | 'tune' | 'testing' | 'calibrate' | 'sources' | 'confirm' | 'clean' | 'reconnect' | 'lure';
export const FOOD_ITEMS = ['bread', 'berry', 'cream', 'mint'] as const;
export const OBS_SOURCES = ['camera', 'mic', 'chat', 'overlay', 'desktop'] as const;

export interface PrepStation { id: StationId; x: number; z: number; label: string }
export interface PrepInput { x: number; z: number; primary: boolean }
export interface PrepMiniGame {
  kind: MiniKind;
  stage: MiniStage;
  progress: number;
  aimX: number;
  aimY: number;
  targetX: number;
  targetY: number;
  targetRadius: number;
  hits: number;
  misses: number;
  splashCount: number;
  flushMs: number;
  elapsedMs: number;
  holdMs: number;
  cooldownMs: number;
  offset: number;
  sequence: string[];
  sequenceIndex: number;
  poseIndex: number;
  sweeps: number;
  foodPlaced: number[];
  fillLevel: number;
  audioLevels: number[];
  audioTargets: number[];
  stains: { x: number; y: number; clean: number }[];
  lastWipeX: number;
  lastWipeY: number;
  cablePairs: number[];
  obsEnabled: boolean[];
}
export interface PrepState {
  version: 2;
  phase: 'title' | 'explore' | 'minigame' | 'countdown' | 'result';
  paused: boolean;
  level: number;
  seed: number;
  rng: number;
  elapsedMs: number;
  countdownMs: number;
  player: { x: number; z: number; yaw: number };
  cat: { x: number; z: number; yaw: number; cycleMs: number };
  completed: TaskId[];
  water: { cup: 'table' | 'carried-empty' | 'filling' | 'ready' | 'carried-full' | 'drank'; fillMs: number; fillRequiredMs: number };
  minigame: PrepMiniGame | null;
  incidents: { active: IncidentId[]; resolved: IncidentId[]; queue: IncidentId[] };
  notice: string;
  noticeMs: number;
}

export const WORLD_BOUNDS = { minX: -4.8, maxX: 4.8, minZ: -2.8, maxZ: 2.8 } as const;
export const BATHROOM_DOOR = { wallX: -2.4, topZ: -0.45, openingMinZ: -2.15, openingMaxZ: -0.7 } as const;
export const BEDROOM_DOOR = { wallX: 1.2, openingMinZ: 0.45, openingMaxZ: 1.55 } as const;
export const INTERACT_RADIUS = 1.3;
export const LIVE_RADIUS = 1.6;
export const STATIONS: PrepStation[] = [
  { id: 'thermos', x: 2.95, z: 1.65, label: '保温杯' },
  { id: 'dispenser', x: -0.6, z: 2.25, label: '饮水机' },
  { id: 'toilet', x: -4, z: -1.8, label: '厕所' },
  { id: 'food', x: -3.6, z: 2.1, label: '点心台' },
  { id: 'cat', x: 2.35, z: -1.35, label: '猫碗' },
  { id: 'audio', x: 3.55, z: 0.65, label: '声卡' },
  { id: 'vts', x: 3.55, z: -0.8, label: 'VTS' },
  { id: 'obs', x: 3.1, z: 0, label: 'OBS' },
  { id: 'spill', x: 0.15, z: 0.25, label: '洒水处' },
  { id: 'cable', x: 3, z: 0.15, label: '松脱线缆' },
  { id: 'catwalk', x: 3.1, z: -1.2, label: '霸占桌面的猫' },
];
export const TASK_LABELS: Record<TaskId, string> = {
  water: '接水喝', toilet: '上厕所', food: '准备吃的', cat: '给猫倒粮', audio: '调试声卡', vts: '打开 VTS', obs: '打开 OBS',
};
export const PREP_LEVELS = [
  { id: 1, title: '第一夜 · 不慌不忙', threeStarMs: 110000, twoStarMs: 170000, incidentCount: 1 },
  { id: 2, title: '第二夜 · 猫猫加班', threeStarMs: 135000, twoStarMs: 200000, incidentCount: 2 },
  { id: 3, title: '第三夜 · 今晚一定准时', threeStarMs: 165000, twoStarMs: 240000, incidentCount: 3 },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const uint = (value: number) => ((Math.floor(value) % 4294967296) + 4294967296) % 4294967296;
const isTask = (id: string): id is TaskId => (TASK_IDS as readonly string[]).includes(id);
const isIncident = (id: string): id is IncidentId => (INCIDENT_IDS as readonly string[]).includes(id);
const isMiniKind = (id: string): id is MiniKind => (id !== 'water' && isTask(id)) || isIncident(id);
const isBathroom = (x: number, z: number) => x < BATHROOM_DOOR.wallX && z < BATHROOM_DOOR.topZ;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const CAT_PATH = [
  { x: 2.2, z: -0.4 }, { x: 2.1, z: 0.95 }, { x: 0.55, z: 0.95 },
  { x: -0.6, z: 0.25 }, { x: -1.05, z: 1.55 }, { x: 0.55, z: 0.95 },
  { x: 2.1, z: 0.95 }, { x: 3.3, z: 1.5 }, { x: 3.9, z: 0.2 },
] as const;
const CAT_SPEED = 0.95;
const CAT_SEGMENTS = CAT_PATH.map((point, index) => ({
  from: point,
  to: CAT_PATH[(index + 1) % CAT_PATH.length],
  length: distance(point, CAT_PATH[(index + 1) % CAT_PATH.length]),
}));
const CAT_CYCLE_MS = (CAT_SEGMENTS.reduce((sum, segment) => sum + segment.length, 0) * 1000) / CAT_SPEED;

function catAt(ms: number): PrepState['cat'] {
  const cycleMs = ((ms % CAT_CYCLE_MS) + CAT_CYCLE_MS) % CAT_CYCLE_MS;
  let travelled = (cycleMs * CAT_SPEED) / 1000;
  for (const segment of CAT_SEGMENTS) {
    if (travelled <= segment.length) {
      const portion = travelled / segment.length;
      const dx = segment.to.x - segment.from.x;
      const dz = segment.to.z - segment.from.z;
      return { x: segment.from.x + dx * portion, z: segment.from.z + dz * portion, yaw: Math.atan2(dx, dz), cycleMs };
    }
    travelled -= segment.length;
  }
  return { ...CAT_PATH[0], yaw: 0, cycleMs };
}

function copyState(state: PrepState): PrepState {
  return {
    ...state,
    player: { ...state.player },
    cat: { ...state.cat },
    completed: [...state.completed],
    water: { ...state.water },
    minigame: state.minigame ? {
      ...state.minigame,
      sequence: [...state.minigame.sequence],
      foodPlaced: [...(state.minigame.foodPlaced || [])],
      audioLevels: [...(state.minigame.audioLevels || [])],
      audioTargets: [...(state.minigame.audioTargets || [])],
      stains: (state.minigame.stains || []).map(stain => ({ ...stain })),
      cablePairs: [...(state.minigame.cablePairs || [])],
      obsEnabled: [...(state.minigame.obsEnabled || [])],
    } : null,
    incidents: { active: [...state.incidents.active], resolved: [...state.incidents.resolved], queue: [...state.incidents.queue] },
  };
}

function random(state: PrepState): number {
  state.rng = uint(Math.imul(state.rng, 1664525) + 1013904223);
  return state.rng / 4294967296;
}

function announce(state: PrepState, message: string, ms = 3400) {
  state.notice = message;
  state.noticeMs = ms;
}

export function createPrepGame(level = 1, seed = 20260926): PrepState {
  const safeLevel = finite(level) ? clamp(Math.floor(level), 1, 3) : 1;
  const safeSeed = finite(seed) ? uint(seed) : 20260926;
  const state: PrepState = {
    version: 2,
phase: 'title',
paused: false,
level: safeLevel,
seed: safeSeed,
rng: safeSeed,
    elapsedMs: 0,
countdownMs: 0,
player: { x: 0.3, z: 0.1, yaw: 0 },
cat: catAt(0),
completed: [],
    water: { cup: 'table', fillMs: 0, fillRequiredMs: 19000 + (safeLevel - 1) * 2500 },
    minigame: null,
incidents: { active: [], resolved: [], queue: [] },
    notice: '说好马上开播……先把房间准备好！',
noticeMs: 0,
  };
  const choices: IncidentId[] = [...INCIDENT_IDS];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  state.incidents.queue = choices.slice(0, safeLevel);
  return state;
}

export function startPrepGame(state: PrepState): PrepState {
  if (state.phase !== 'title') return state;
  return { ...state, phase: 'explore', noticeMs: 4000 };
}

export function nearestStation(state: PrepState): PrepStation | null {
  if (state.phase !== 'explore') return null;
  let nearest: PrepStation | null = null;
  let nearestDistance = INTERACT_RADIUS;
  for (const station of STATIONS) {
    if (isIncident(station.id) && !state.incidents.active.includes(station.id)) continue;
    const d = distance(state.player, station);
    if (d <= nearestDistance && !blocksBathroom(state.player.x, state.player.z, station.x, station.z) && !blocksBedroom(state.player.x, state.player.z, station.x, station.z)) {
      nearest = station;
      nearestDistance = d;
    }
  }
  return nearest;
}

// Recalculate waypoints while walking so both doors remain navigable.
export function getPrepWalkTarget(state: PrepState, id: StationId): { x: number; z: number } | null {
  const station = STATIONS.find(item => item.id === id);
  if (!station) return null;
  const here = isBathroom(state.player.x, state.player.z);
  const there = isBathroom(station.x, station.z);
  if (here && !there) return { x: -1.5, z: -1.4 };
  if (!there && state.player.x < -1.2 && state.player.z < -0.1) return { x: -1.5, z: 0.2 };
  const west = state.player.x < BEDROOM_DOOR.wallX;
  const destinationWest = station.x < BEDROOM_DOOR.wallX;
  if (west !== destinationWest) {
    if (west) {
      if (state.player.x < 0.68 || Math.abs(state.player.z - 1) > 0.13) return { x: 0.7, z: 1 };
      return { x: 1.75, z: 1 };
    }
    if (state.player.x > 1.77 || Math.abs(state.player.z - 1) > 0.13) return { x: 1.75, z: 1 };
    return { x: 0.7, z: 1 };
  }
  if (!here && there) {
    if (state.player.z > -0.9 || state.player.z < -1.95) return { x: -1.5, z: -1.4 };
    return { x: -3, z: -1.4 };
  }
  return { x: station.x, z: station.z };
}

export function getPrepAction(state: PrepState): string {
  if (state.phase === 'minigame' && state.minigame) {
    const { kind, stage } = state.minigame;
    if (kind === 'toilet') return stage === 'flush-ready' ? '按下冲水按钮' : stage === 'flushing' ? '正在冲水' : '瞄准水花，按住发射';
    if (kind === 'food') return '按餐盘顺序摆好点心';
    if (kind === 'cat') return '量好每勺猫粮再倒入碗里';
    if (kind === 'audio') return stage === 'testing' ? '声卡试音中' : '调好三路音量后试音';
    if (kind === 'vts') return '按提示采集表情姿态';
    if (kind === 'spill') return '擦净三处水渍';
    if (kind === 'catwalk') return stage === 'confirm' ? '抱猫离开键盘' : '等猫扑过来时点按逗猫棒';
    if (kind === 'cable') return stage === 'confirm' ? '试音确认线缆' : '匹配插头和接口';
    return stage === 'confirm' ? '确认 OBS 预览' : '选择正确来源并检查预览';
  }
  const obs = STATIONS.find(item => item.id === 'obs')!;
  if (readyForLive(state) && distance(state.player, obs) <= LIVE_RADIUS && !blocksBedroom(state.player.x, state.player.z, obs.x, obs.z)) return '正式上播';
  const station = nearestStation(state);
  if (!station) return '';
  const { id } = station;
  if (id === 'thermos') {
    if (state.water.cup === 'table') return '拿起保温杯';
    if (state.water.cup === 'carried-full') return '喝水润嗓，完成接水';
    return '';
  }
  if (id === 'dispenser') {
    if (state.water.cup === 'carried-empty') return '把保温杯放到饮水机接水';
    if (state.water.cup === 'ready') return '取走接满的保温杯';
    if (state.water.cup === 'filling') return '保温杯正在慢慢接水';
    return '';
  }
  if (isIncident(id)) return state.incidents.active.includes(id) ? `处理${station.label}` : '';
  return state.completed.includes(id) ? '' : `开始${TASK_LABELS[id]}`;
}

function updateTarget(mini: PrepMiniGame) {
  const t = mini.elapsedMs / 1000;
  const { offset } = mini;
  switch (mini.kind) {
    case 'toilet':
      mini.targetX = 0.5 + Math.sin(t * 1.7 + offset) * 0.18;
      mini.targetY = 0.51 + Math.sin(t * 2.2 + offset * 0.7) * 0.1;
      break;
    case 'food':
      break;
    case 'cat':
      mini.targetX = [0.6, 0.72, 0.56][Math.min(mini.hits, 2)];
      mini.targetY = 0.5;
      break;
    case 'audio':
      break;
    case 'vts':
      break;
    case 'spill':
      break;
    case 'catwalk':
      mini.targetX = 0.5 + Math.sin(t * 2.8 + offset) * 0.44;
      mini.targetY = 0.5;
      break;
    default:
      break;
  }
}

function makeMini(state: PrepState, kind: MiniKind): PrepMiniGame {
  const stage: Record<MiniKind, MiniStage> = {
    toilet: 'shoot',
food: 'plate',
cat: 'feed',
audio: 'tune',
vts: 'calibrate',
obs: 'sources',
    spill: 'clean',
cable: 'reconnect',
catwalk: 'lure',
  };
  const sequence = kind === 'food' ? [...FOOD_ITEMS.slice(0, state.level === 1 ? 3 : 4)] :
    kind === 'vts' ? ['smile', 'blink', 'tilt'] :
    kind === 'obs' ? (state.level === 1 ? ['camera', 'mic', 'chat'] : ['camera', 'mic', 'chat', 'overlay']) :
    kind === 'cable' ? ['power', 'usb', 'mic'] : [];
  if (kind === 'food' || kind === 'vts') {
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = Math.floor(random(state) * (i + 1));
      [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }
  }
  const mini: PrepMiniGame = {
    kind,
stage: stage[kind],
progress: 0,
aimX: 0.5,
aimY: 0.5,
targetX: 0.5,
targetY: 0.5,
    targetRadius: kind === 'toilet' ? 0.18 : 0.16,
    hits: 0,
misses: 0,
splashCount: 0,
flushMs: 0,
elapsedMs: 0,
holdMs: 0,
cooldownMs: 0,
    offset: random(state) * Math.PI * 2,
    sequence,
    sequenceIndex: 0,
    poseIndex: 0,
    sweeps: 0,
    foodPlaced: kind === 'food' ? Array(sequence.length).fill(-1) : [],
    fillLevel: 0,
    audioLevels: kind === 'audio' ? [0.5, 0.5, 0.5] : [],
    audioTargets: kind === 'audio' ? [0.68, 0.32, 0.58] : [],
    stains: kind === 'spill' ? [
      { x: 0.23, y: 0.32, clean: 0 }, { x: 0.72, y: 0.45, clean: 0 }, { x: 0.48, y: 0.72, clean: 0 },
    ] : [],
    lastWipeX: -1,
    lastWipeY: -1,
    cablePairs: kind === 'cable' ? [-1, -1, -1] : [],
    obsEnabled: kind === 'obs' ? [false, false, false, false, false] : [],
  };
  updateTarget(mini);
  return mini;
}

function triggerIncident(state: PrepState) {
  const triggered = state.incidents.active.length + state.incidents.resolved.length;
  if (state.incidents.queue.length === 0 || state.completed.length < (triggered + 1) * 2) return;
  const incident = state.incidents.queue.shift();
  if (!incident) return;
  state.incidents.active.push(incident);
  announce(state, incident === 'spill' ? '哎呀，桌面洒水了！' : incident === 'cable' ? '声卡线松了！' : '猫猫占领键盘了！');
}

function completeTask(state: PrepState, id: TaskId) {
  if (state.completed.includes(id)) return;
  state.completed.push(id);
  announce(state, `${TASK_LABELS[id]}完成！`);
  triggerIncident(state);
}

function completeMini(state: PrepState) {
  const kind = state.minigame?.kind;
  if (!kind) return;
  state.minigame = null;
  state.phase = 'explore';
  if (isIncident(kind)) {
    state.incidents.active = state.incidents.active.filter(id => id !== kind);
    state.incidents.resolved.push(kind);
    announce(state, '小意外解决了，继续准备！');
    triggerIncident(state);
  } else completeTask(state, kind);
}

export function interactPrep(state: PrepState, id?: StationId): PrepState {
  if (state.paused || state.phase !== 'explore') return state;
  const station = id ? STATIONS.find(item => item.id === id) : nearestStation(state);
  if (!station || distance(state.player, station) > INTERACT_RADIUS || blocksBathroom(state.player.x, state.player.z, station.x, station.z) || blocksBedroom(state.player.x, state.player.z, station.x, station.z)) return state;
  const next = copyState(state);
  if (station.id === 'thermos') {
    if (next.water.cup === 'table') {
      next.water.cup = 'carried-empty';
      announce(next, '带上保温杯，去饮水机接水。');
    } else if (next.water.cup === 'carried-full') {
      next.water.cup = 'drank';
      completeTask(next, 'water');
    } else return state;
    return next;
  }
  if (station.id === 'dispenser') {
    if (next.water.cup === 'carried-empty') {
      next.water.cup = 'filling';
      next.water.fillMs = 0;
      announce(next, '饮水机接得慢，先去做别的。');
    } else if (next.water.cup === 'ready') {
      next.water.cup = 'carried-full';
      announce(next, '水接好了，把保温杯拿回桌边喝。');
    } else return state;
    return next;
  }
  if (isIncident(station.id)) {
    if (!next.incidents.active.includes(station.id)) return state;
    next.minigame = makeMini(next, station.id);
  } else {
    if (next.completed.includes(station.id)) return state;
    next.minigame = makeMini(next, station.id);
  }
  next.phase = 'minigame';
  announce(next, getPrepAction(next), 3000);
  return next;
}

export function aimPrep(state: PrepState, x: number, y: number): PrepState {
  if (state.paused || state.phase !== 'minigame' || !state.minigame || !finite(x) || !finite(y)) return state;
  const next = copyState(state);
  next.minigame!.aimX = clamp(x, 0, 1);
  next.minigame!.aimY = clamp(y, 0, 1);
  return next;
}

function onTarget(mini: PrepMiniGame): boolean {
  return Math.hypot(mini.aimX - mini.targetX, mini.aimY - mini.targetY) <= mini.targetRadius;
}

export function placeFoodPrep(state: PrepState, pastryIndex: number, plateIndex: number): PrepState {
  const mini = state.minigame;
  if (state.paused || state.phase !== 'minigame' || mini?.kind !== 'food' || !Number.isInteger(pastryIndex) || !Number.isInteger(plateIndex) ||
    pastryIndex < 0 || pastryIndex >= mini.sequence.length || plateIndex < 0 || plateIndex >= mini.sequence.length || mini.foodPlaced[plateIndex] !== -1) return state;
  const next = copyState(state);
  const food = next.minigame!;
  if (FOOD_ITEMS[pastryIndex] === food.sequence[plateIndex] && !food.foodPlaced.includes(pastryIndex)) {
    food.foodPlaced[plateIndex] = pastryIndex;
    food.hits++;
    food.progress = (food.hits * 100) / food.sequence.length;
    if (food.hits === food.sequence.length) completeMini(next);
  } else {
    food.misses++;
    announce(next, '摆盘顺序不对，看看餐盘上的提示。', 2000);
  }
  return next;
}

export function releaseCatPourPrep(state: PrepState): PrepState {
  const mini = state.minigame;
  if (state.paused || state.phase !== 'minigame' || mini?.kind !== 'cat' || mini.fillLevel <= 0) return state;
  const next = copyState(state);
  finishCatPour(next);
  return next;
}

function finishCatPour(state: PrepState) {
  const cat = state.minigame!;
  if (Math.abs(cat.fillLevel - cat.targetX) <= 0.095) {
    cat.hits++;
    cat.progress = (cat.hits * 100) / (state.level === 1 ? 2 : 3);
    if (cat.progress >= 100) completeMini(state);
    else announce(state, '这一勺刚好，继续量下一勺。', 1300);
  } else {
    cat.misses++;
    announce(state, '这一勺分量不对，重新量。', 1700);
  }
  if (state.minigame) {
    cat.fillLevel = 0;
    cat.holdMs = 0;
    updateTarget(cat);
  }
}

export function setAudioChannelPrep(state: PrepState, channelIndex: number, value: number): PrepState {
  const mini = state.minigame;
  if (state.paused || state.phase !== 'minigame' || mini?.kind !== 'audio' || mini.stage !== 'tune' ||
    !Number.isInteger(channelIndex) || channelIndex < 0 || channelIndex > 2 || !finite(value)) return state;
  const next = copyState(state);
  next.minigame!.audioLevels[channelIndex] = clamp(value, 0, 1);
  return next;
}

export function capturePosePrep(state: PrepState, poseIndex: number): PrepState {
  const mini = state.minigame;
  if (state.paused || state.phase !== 'minigame' || mini?.kind !== 'vts' || !Number.isInteger(poseIndex) || poseIndex < 0 || poseIndex > 2) return state;
  const next = copyState(state);
  const vts = next.minigame!;
  if (['smile', 'blink', 'tilt'][poseIndex] === vts.sequence[vts.poseIndex]) {
    vts.poseIndex++;
    vts.hits++;
    vts.progress = (vts.poseIndex * 100) / 3;
    if (vts.poseIndex === 3) completeMini(next);
    else announce(next, '姿态捕捉成功，换下一个表情。', 1400);
  } else {
    vts.misses++;
    announce(next, '表情不对，按提示再试。', 1400);
  }
  return next;
}

export function wipeSpillPrep(state: PrepState, x: number, y: number): PrepState {
  const mini = state.minigame;
  if (state.paused || state.phase !== 'minigame' || mini?.kind !== 'spill' || !finite(x) || !finite(y)) return state;
  const next = copyState(state);
  const spill = next.minigame!;
  const px = clamp(x, 0, 1);
  const py = clamp(y, 0, 1);
  const moved = spill.lastWipeX < 0 ? 0 : Math.hypot(px - spill.lastWipeX, py - spill.lastWipeY);
  if (moved >= 0.065 && moved <= 0.38) {
    const stain = spill.stains.find(item => item.clean < 3 && Math.hypot(px - item.x, py - item.y) < 0.18);
    if (stain) {
      stain.clean++;
      spill.sweeps++;
      spill.hits++;
      spill.progress = (spill.sweeps * 100) / 9;
      if (spill.sweeps === 9) completeMini(next);
    }
  }
  if (next.minigame) {
    spill.lastWipeX = px;
    spill.lastWipeY = py;
  }
  return next;
}

export function connectCablePrep(state: PrepState, plugIndex: number, socketIndex: number): PrepState {
  const mini = state.minigame;
  if (state.paused || state.phase !== 'minigame' || mini?.kind !== 'cable' || mini.stage !== 'reconnect' ||
    !Number.isInteger(plugIndex) || !Number.isInteger(socketIndex) || plugIndex < 0 || plugIndex > 2 || socketIndex < 0 || socketIndex > 2 || mini.cablePairs[plugIndex] !== -1) return state;
  const next = copyState(state);
  const cable = next.minigame!;
  if ([1, 2, 0][plugIndex] === socketIndex) {
    cable.cablePairs[plugIndex] = socketIndex;
    cable.hits++;
    cable.sequenceIndex++;
    cable.progress = (cable.hits * 100) / 3;
    if (cable.hits === 3) { cable.stage = 'confirm'; announce(next, '线缆接好了，按下试音确认。'); }
  } else {
    cable.misses++;
    announce(next, '接口不匹配，检查颜色和形状。', 1600);
  }
  return next;
}

export function toggleObsSourcePrep(state: PrepState, sourceIndex: number): PrepState {
  const mini = state.minigame;
  if (state.paused || state.phase !== 'minigame' || mini?.kind !== 'obs' || mini.stage !== 'sources' ||
    !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= OBS_SOURCES.length) return state;
  const next = copyState(state);
  const obs = next.minigame!;
  obs.obsEnabled[sourceIndex] = !obs.obsEnabled[sourceIndex];
  const requiredOn = obs.obsEnabled.filter((enabled, index) => enabled && obs.sequence.includes(OBS_SOURCES[index])).length;
  const unwantedOn = obs.obsEnabled.filter((enabled, index) => enabled && !obs.sequence.includes(OBS_SOURCES[index])).length;
  obs.progress = (Math.max(0, requiredOn - unwantedOn) * 100) / obs.sequence.length;
  return next;
}

export function pressPrep(state: PrepState): PrepState {
  if (state.paused || state.phase !== 'minigame' || !state.minigame || state.minigame.cooldownMs > 0) return state;
  const next = copyState(state);
  const mini = next.minigame!;
  if (mini.kind === 'toilet' && mini.stage === 'flush-ready') {
    mini.stage = 'flushing';
    mini.flushMs = 1800;
    mini.progress = 100;
    announce(next, '冲水中……哗啦！', 1800);
  } else if (mini.kind === 'catwalk' && mini.stage === 'confirm') {
    completeMini(next);
  } else if (mini.kind === 'catwalk' && mini.stage === 'lure') {
    mini.cooldownMs = 280;
    if (mini.targetX >= 0.8) {
      mini.hits++;
      mini.progress = (mini.hits * 100) / 3;
      if (mini.hits >= 3) { mini.stage = 'confirm'; announce(next, '猫跟着逗猫棒走开了，快抱下键盘。'); }
    } else { mini.misses++; announce(next, '猫还没扑过来，等它靠近再逗。', 1300); }
  } else if (mini.kind === 'audio' && mini.stage === 'tune') {
    if (mini.audioLevels.every((value, index) => Math.abs(value - mini.audioTargets[index]) <= 0.075)) {
      mini.stage = 'testing';
      mini.holdMs = 0;
      announce(next, '音量合适，正在试音。', 1200);
    } else { mini.misses++; announce(next, '声道还没调平，检查三路音量。', 1800); }
  } else if (mini.kind === 'cable' && mini.stage === 'confirm') {
    completeMini(next);
  } else if (mini.kind === 'obs') {
    if (mini.stage === 'confirm') completeMini(next);
    else if (mini.obsEnabled.every((enabled, index) => enabled === mini.sequence.includes(OBS_SOURCES[index]))) {
      mini.stage = 'confirm';
      mini.progress = 100;
      announce(next, '预览正常，再确认正式接入。');
    } else { mini.misses++; announce(next, '预览里还有缺失或多余的来源。', 1800); }
  } else return state;
  return next;
}

export function leaveMiniGame(state: PrepState): PrepState {
  if (state.paused || state.phase !== 'minigame' || !state.minigame || state.minigame.stage === 'flushing') return state;
  return { ...state, phase: 'explore', minigame: null, notice: '稍后再继续，准备事项还没完成。', noticeMs: 2200 };
}

function blocksBathroom(fromX: number, fromZ: number, toX: number, toZ: number) {
  const { wallX, topZ, openingMinZ, openingMaxZ } = BATHROOM_DOOR;
  const radius = 0.2;
  const crossingVertical = (fromX - wallX) * (toX - wallX) <= 0 && fromX !== toX;
  if (crossingVertical) {
    const ratio = (wallX - fromX) / (toX - fromX);
    const atZ = fromZ + (toZ - fromZ) * ratio;
    if (atZ < topZ && (atZ < openingMinZ + radius || atZ > openingMaxZ - radius)) return true;
  }
  const crossingTop = (fromZ - topZ) * (toZ - topZ) <= 0 && fromZ !== toZ;
  if (crossingTop) {
    const ratio = (topZ - fromZ) / (toZ - fromZ);
    const atX = fromX + (toX - fromX) * ratio;
    if (atX < wallX + radius) return true;
  }
  return false;
}

function blocksBedroom(fromX: number, fromZ: number, toX: number, toZ: number) {
  const { wallX, openingMinZ, openingMaxZ } = BEDROOM_DOOR;
  if ((fromX - wallX) * (toX - wallX) > 0 || fromX === toX) return false;
  const ratio = (wallX - fromX) / (toX - fromX);
  const atZ = fromZ + (toZ - fromZ) * ratio;
  return atZ < openingMinZ + 0.2 || atZ > openingMaxZ - 0.2;
}

function movePlayer(state: PrepState, dt: number, input: PrepInput) {
  if (!finite(input.x) || !finite(input.z)) return;
  const magnitude = Math.hypot(input.x, input.z);
  if (magnitude < 0.001) return;
  const scale = Math.min(1, magnitude) / magnitude;
  const dx = input.x * scale;
  const dz = input.z * scale;
  const speed = 2.65;
  const x = clamp(state.player.x + ((dx * dt * speed) / 1000), WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
  const z = clamp(state.player.z + ((dz * dt * speed) / 1000), WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
  const movedX = blocksBathroom(state.player.x, state.player.z, x, state.player.z) || blocksBedroom(state.player.x, state.player.z, x, state.player.z) || distance({ x, z: state.player.z }, state.cat) < 0.44 ? state.player.x : x;
  const movedZ = blocksBathroom(movedX, state.player.z, movedX, z) || distance({ x: movedX, z }, state.cat) < 0.44 ? state.player.z : z;
  state.player.x = movedX;
  state.player.z = movedZ;
  state.player.yaw = Math.atan2(dx, dz);
}

function tickMini(state: PrepState, dt: number, primary: boolean) {
  const mini = state.minigame;
  if (!mini) return;
  mini.elapsedMs += dt;
  mini.cooldownMs = Math.max(0, mini.cooldownMs - dt);
  if (mini.stage === 'flushing') {
    mini.flushMs = Math.max(0, mini.flushMs - dt);
    if (mini.flushMs === 0) completeMini(state);
    return;
  }
  if (mini.stage === 'testing') {
    if (!mini.audioLevels.every((value, index) => Math.abs(value - mini.audioTargets[index]) <= 0.075)) {
      mini.stage = 'tune';
      mini.holdMs = 0;
      mini.misses++;
      return;
    }
    mini.holdMs += dt;
    mini.progress = (mini.holdMs * 100) / 1200;
    if (mini.holdMs >= 1200) completeMini(state);
    return;
  }
  if (mini.stage === 'flush-ready' || mini.stage === 'confirm') return;
  updateTarget(mini);
  if (mini.kind === 'cat') {
    if (primary) mini.fillLevel = Math.min(1, mini.fillLevel + dt / 1500);
    else if (mini.fillLevel > 0) finishCatPour(state);
    return;
  }
  if (mini.kind !== 'toilet' || !primary) {
    mini.holdMs = 0;
    return;
  }
  if (onTarget(mini)) {
    mini.progress = clamp(mini.progress + ((dt * 100) / 4400), 0, 100);
    mini.holdMs += dt;
    if (mini.holdMs >= 170) {
      const pulses = Math.floor(mini.holdMs / 170);
      mini.holdMs -= pulses * 170;
      mini.hits += pulses;
      mini.splashCount += pulses * 3;
    }
    if (mini.progress >= 100) {
      mini.stage = 'flush-ready';
      mini.holdMs = 0;
      announce(state, '水花够了！别忘了按下马桶冲水按钮。');
    }
  } else {
    mini.progress = Math.max(0, mini.progress - dt * 0.012);
    mini.holdMs += dt;
    if (mini.holdMs >= 650) {
      mini.misses += Math.floor(mini.holdMs / 650);
      mini.holdMs %= 650;
    }
  }
}

export function stepPrepGame(state: PrepState, ms: number, input: PrepInput = { x: 0, z: 0, primary: false }): PrepState {
  if (!finite(ms) || ms <= 0 || state.paused || state.phase === 'title' || state.phase === 'result') return state;
  const next = copyState(state);
  const controls = input && typeof input === 'object' ? input : { x: 0, z: 0, primary: false };
  let remaining = ms;
  while (remaining > 0) {
    if (next.phase === 'result') break;
    const dt = Math.min(50, remaining);
    remaining -= dt;
    const counted = next.phase === 'countdown' ? Math.min(dt, next.countdownMs) : dt;
    next.elapsedMs += counted;
    next.noticeMs = Math.max(0, next.noticeMs - counted);
    if (next.water.cup === 'filling') {
      next.water.fillMs = Math.min(next.water.fillRequiredMs, next.water.fillMs + counted);
      if (next.water.fillMs >= next.water.fillRequiredMs) {
        next.water.cup = 'ready';
        announce(next, '保温杯接满了，记得回饮水机取。');
      }
    }
    if (next.phase === 'countdown') {
      next.countdownMs = Math.max(0, next.countdownMs - dt);
      if (next.countdownMs === 0) next.phase = 'result';
      continue;
    }
    next.cat = catAt(next.cat.cycleMs + dt);
    if (next.phase === 'explore') movePlayer(next, dt, controls);
    if (next.phase === 'minigame') tickMini(next, dt, controls.primary === true);
  }
  return next;
}

export function togglePausePrep(state: PrepState): PrepState {
  if (state.phase === 'title' || state.phase === 'result') return state;
  return { ...state, paused: !state.paused };
}

export function goLivePrep(state: PrepState): PrepState {
  const obs = STATIONS.find(station => station.id === 'obs')!;
  if (state.paused || !readyForLive(state) || distance(state.player, obs) > LIVE_RADIUS || blocksBedroom(state.player.x, state.player.z, obs.x, obs.z)) return state;
  return { ...state, phase: 'countdown', countdownMs: 3000, notice: '全部就绪，三、二、一，正式上播！', noticeMs: 3000 };
}

function readyForLive(state: PrepState): boolean {
  return state.phase === 'explore' && state.completed.length === TASK_IDS.length &&
    state.incidents.active.length === 0 && state.incidents.queue.length === 0 && state.incidents.resolved.length === state.level;
}

export function getPrepStars(state: PrepState): number {
  const level = PREP_LEVELS[state.level - 1] || PREP_LEVELS[0];
  if (state.elapsedMs <= level.threeStarMs) return 3;
  return state.elapsedMs <= level.twoStarMs ? 2 : 1;
}

export function formatPrepTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, finite(ms) ? ms : 0) / 1000);
  return `${Math.floor(seconds / 60)}分钟${String(seconds % 60).padStart(2, '0')}秒`;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const bounded = (value: unknown, min: number, max: number): value is number => finite(value) && value >= min && value <= max;
const uniqueIds = <T extends string>(value: unknown, valid: (id: string) => id is T): value is T[] => Array.isArray(value) && value.every(item => typeof item === 'string' && valid(item)) && new Set(value).size === value.length;

/** Resume only coherent saves; resumed active games start paused so background time never leaks. */
export function validatePrepGame(raw: unknown): PrepState | null {
  if (!record(raw) || (raw.version !== 1 && raw.version !== 2) || !bounded(raw.level, 1, 3) || !Number.isInteger(raw.level) || !bounded(raw.seed, 0, 4294967295) || !Number.isInteger(raw.seed) || !bounded(raw.rng, 0, 4294967295) || !Number.isInteger(raw.rng)) return null;
  const legacy = raw.version === 1;
  if (!['title', 'explore', 'minigame', 'countdown', 'result'].includes(String(raw.phase)) || typeof raw.paused !== 'boolean') return null;
  if (!bounded(raw.elapsedMs, 0, 86400000) || !bounded(raw.countdownMs, 0, 3000) || typeof raw.notice !== 'string' || raw.notice.length > 300 || !bounded(raw.noticeMs, 0, 10000)) return null;
  if (!record(raw.player) || !bounded(raw.player.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX) || !bounded(raw.player.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ) || !bounded(raw.player.yaw, -Math.PI, Math.PI)) return null;
  if (!legacy) {
    if (!record(raw.cat) || !bounded(raw.cat.cycleMs, 0, CAT_CYCLE_MS) || !bounded(raw.cat.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX) || !bounded(raw.cat.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ) || !bounded(raw.cat.yaw, -Math.PI, Math.PI)) return null;
    const expectedCat = catAt(raw.cat.cycleMs);
    if (distance(raw.cat as { x: number; z: number }, expectedCat) > 0.001 || Math.abs(raw.cat.yaw - expectedCat.yaw) > 0.001) return null;
  }
  if (!uniqueIds(raw.completed, isTask) || raw.completed.length > TASK_IDS.length) return null;
  if (!record(raw.water) || !['table', 'carried-empty', 'filling', 'ready', 'carried-full', 'drank'].includes(String(raw.water.cup))) return null;
  if (raw.water.fillRequiredMs !== 19000 + (raw.level - 1) * 2500 || !bounded(raw.water.fillMs, 0, raw.water.fillRequiredMs)) return null;
  if ((raw.water.cup === 'ready' || raw.water.cup === 'carried-full' || raw.water.cup === 'drank') && raw.water.fillMs !== raw.water.fillRequiredMs) return null;
  if (raw.completed.includes('water') !== (raw.water.cup === 'drank')) return null;
  if (!record(raw.incidents) || !uniqueIds(raw.incidents.active, isIncident) || !uniqueIds(raw.incidents.resolved, isIncident) || !uniqueIds(raw.incidents.queue, isIncident)) return null;
  const incidentIds = [...raw.incidents.active, ...raw.incidents.resolved, ...raw.incidents.queue];
  if (incidentIds.length !== raw.level || new Set(incidentIds).size !== incidentIds.length) return null;
  if (raw.phase === 'result' && (raw.completed.length !== TASK_IDS.length || raw.incidents.active.length || raw.incidents.queue.length)) return null;
  if (raw.phase === 'countdown' && (raw.completed.length !== TASK_IDS.length || raw.incidents.active.length || raw.incidents.queue.length)) return null;
  if ((raw.phase === 'minigame') !== (raw.minigame !== null)) return null;
  if (raw.minigame !== null) {
    const mini = raw.minigame;
    if (!record(mini) || typeof mini.kind !== 'string' || !isMiniKind(mini.kind) || typeof mini.stage !== 'string') return null;
    const stages: Record<MiniKind, MiniStage[]> = {
      toilet: ['shoot', 'flush-ready', 'flushing'],
      food: ['plate'],
      cat: ['feed'],
      audio: legacy ? ['tune'] : ['tune', 'testing'],
      vts: ['calibrate'],
      obs: ['sources', 'confirm'],
      spill: ['clean'],
      cable: ['reconnect', 'confirm'],
      catwalk: legacy ? ['lure'] : ['lure', 'confirm'],
    };
    if (!stages[mini.kind].includes(mini.stage as MiniStage)) return null;
    if (isIncident(mini.kind) ? !raw.incidents.active.includes(mini.kind) : raw.completed.includes(mini.kind)) return null;
    for (const key of ['progress', 'aimX', 'aimY', 'targetX', 'targetY', 'targetRadius', 'flushMs', 'elapsedMs', 'holdMs', 'cooldownMs', 'offset']) {
      if (!bounded(mini[key], 0, key === 'elapsedMs' ? raw.elapsedMs : key === 'flushMs' ? 1800 : key === 'offset' ? Math.PI * 2 + 10 : key === 'progress' ? 100 : key === 'cooldownMs' ? 500 : key === 'holdMs' ? 1200 : 1)) return null;
    }
    if (!bounded(mini.hits, 0, 100000) || !Number.isInteger(mini.hits) || !bounded(mini.misses, 0, 100000) || !Number.isInteger(mini.misses) || !bounded(mini.splashCount, 0, 100000) || !Number.isInteger(mini.splashCount)) return null;
    if (!Array.isArray(mini.sequence) || !mini.sequence.every((item: unknown) => typeof item === 'string' && item.length < 24) || !bounded(mini.sequenceIndex, 0, mini.sequence.length) || !Number.isInteger(mini.sequenceIndex)) return null;
    const sequence = mini.sequence as string[];
    const expected = mini.kind === 'obs' ? (raw.level === 1 ? ['camera', 'mic', 'chat'] : ['camera', 'mic', 'chat', 'overlay']) : mini.kind === 'cable' ? ['power', 'usb', 'mic'] :
      legacy ? [] : mini.kind === 'food' ? [...FOOD_ITEMS.slice(0, raw.level === 1 ? 3 : 4)] : mini.kind === 'vts' ? ['smile', 'blink', 'tilt'] : [];
    if (mini.sequence.length !== expected.length) return null;
    const shuffled = !legacy && (mini.kind === 'food' || mini.kind === 'vts');
    if (shuffled ? [...mini.sequence].sort().join('|') !== [...expected].sort().join('|') :
      mini.sequence.some((item: string, index: number) => item !== expected[index])) return null;
    if (mini.kind === 'cable' && mini.stage === 'confirm' && mini.sequenceIndex !== mini.sequence.length) return null;
    if (mini.stage === 'flushing' && (!finite(mini.flushMs) || mini.flushMs <= 0)) return null;
    if (!legacy) {
      if (!bounded(mini.poseIndex, 0, 3) || !Number.isInteger(mini.poseIndex) || !bounded(mini.sweeps, 0, 9) || !Number.isInteger(mini.sweeps) || !bounded(mini.fillLevel, 0, 1)) return null;
      if (!bounded(mini.lastWipeX, -1, 1) || !bounded(mini.lastWipeY, -1, 1)) return null;
      if (!Array.isArray(mini.foodPlaced) || mini.foodPlaced.length !== (mini.kind === 'food' ? mini.sequence.length : 0) || !mini.foodPlaced.every((item: unknown) => Number.isInteger(item) && bounded(item, -1, 3))) return null;
      if (mini.kind === 'food' && mini.foodPlaced.some((item: number, index: number) => item >= 0 && FOOD_ITEMS[item] !== sequence[index])) return null;
      if (!Array.isArray(mini.audioLevels) || !Array.isArray(mini.audioTargets) || mini.audioLevels.length !== (mini.kind === 'audio' ? 3 : 0) || mini.audioTargets.length !== mini.audioLevels.length || !mini.audioLevels.every((item: unknown) => bounded(item, 0, 1)) || !mini.audioTargets.every((item: unknown, index: number) => item === [0.68, 0.32, 0.58][index])) return null;
      if (!Array.isArray(mini.stains) || mini.stains.length !== (mini.kind === 'spill' ? 3 : 0) || !mini.stains.every((item: unknown, index: number) => record(item) && item.x === [0.23, 0.72, 0.48][index] && item.y === [0.32, 0.45, 0.72][index] && bounded(item.clean, 0, 3) && Number.isInteger(item.clean))) return null;
      if (mini.kind === 'spill' && mini.sweeps !== mini.stains.reduce((sum: number, item: { clean: number }) => sum + item.clean, 0)) return null;
      if (!Array.isArray(mini.cablePairs) || mini.cablePairs.length !== (mini.kind === 'cable' ? 3 : 0) || !mini.cablePairs.every((item: unknown, index: number) => item === -1 || item === [1, 2, 0][index])) return null;
      if (!Array.isArray(mini.obsEnabled) || mini.obsEnabled.length !== (mini.kind === 'obs' ? 5 : 0) || !mini.obsEnabled.every((item: unknown) => typeof item === 'boolean')) return null;
    }
  }
  const restored = copyState(raw as unknown as PrepState);
  restored.version = 2;
  if (legacy) {
    restored.cat = catAt(restored.elapsedMs);
    if (restored.minigame?.kind === 'toilet') {
      Object.assign(restored.minigame, {
        poseIndex: 0,
        sweeps: 0,
        foodPlaced: [],
        fillLevel: 0,
        audioLevels: [],
        audioTargets: [],
        stains: [],
        lastWipeX: -1,
        lastWipeY: -1,
        cablePairs: [],
        obsEnabled: [],
      });
    } else if (restored.minigame) {
      restored.minigame = null;
      restored.phase = 'explore';
      announce(restored, '准备事项已更新，请重新开始当前小游戏。');
    }
    if (Math.abs(restored.player.x - BEDROOM_DOOR.wallX) < 0.2 &&
      (restored.player.z < BEDROOM_DOOR.openingMinZ || restored.player.z > BEDROOM_DOOR.openingMaxZ)) {
      restored.player.x = restored.player.x < BEDROOM_DOOR.wallX ? 0.92 : 1.48;
    }
  }
  restored.paused = restored.phase !== 'title' && restored.phase !== 'result';
  return restored;
}
