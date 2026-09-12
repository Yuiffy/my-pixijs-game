import { TASK_IDS } from './types';
import type { ActivityId, ActivityState, ActivityView, ControlKey, GameState, IncidentId, InputState, LevelDefinition, TaskId } from './types';

export const LEVELS: LevelDefinition[] = [
  { id: 1, title: '第一夜 · 不慌不忙', subtitle: '七件小事，一次小意外。先熟悉岁己的开播仪式。', threeStarMs: 75000, twoStarMs: 120000, incidentCount: 1 },
  { id: 2, title: '第二夜 · 猫猫加班', subtitle: '目标更灵活，两次意外。猫已经等不及了。', threeStarMs: 95000, twoStarMs: 150000, incidentCount: 2 },
  { id: 3, title: '第三夜 · 今晚一定准时', subtitle: '更精准的操作，三次意外。把直播间准备妥当。', threeStarMs: 120000, twoStarMs: 180000, incidentCount: 3 },
];

export const TASK_INFO: Record<TaskId, { title: string; short: string; description: string }> = {
  water: { title: '接水喝', short: '先润润嗓子', description: '接到绿区，松手，再喝完这杯水。' },
  toilet: { title: '上个厕所', short: '关好门再说', description: '按顺序关好门，再安心解决一下。' },
  food: { title: '准备吃的', short: '一口一口装盘', description: '在绿区点按，把三份小点心装好。' },
  cat: { title: '给猫倒粮', short: '主子先吃', description: '跟着猫碗移动，一边瞄准一边倒粮。' },
  audio: { title: '调试声卡', short: '喂喂，听得到吗', description: '把音量调进绿区，保持位置完成试音。' },
  vts: { title: '打开 VTS', short: '今天也要灵动', description: '让追踪框跟上脸，保持校准。' },
  obs: { title: '打开 OBS', short: '画面声音都就位', description: '按顺序加载直播来源，再确认预览。' },
};

const DIRECTIONS: ControlKey[] = ['left', 'up', 'right', 'down'];
const INCIDENT_IDS: IncidentId[] = ['spill', 'cable', 'catwalk'];
const ARROWS: Record<ControlKey, string> = { left: '←', right: '→', up: '↑', down: '↓', primary: '操作' };
const TASK_TIMES: Record<TaskId, [number, number]> = {
  water: [9000, 16000],
toilet: [8000, 14000],
food: [10000, 19000],
cat: [8500, 16000],
  audio: [7500, 14000],
vts: [8500, 16000],
obs: [8500, 15000],
};
const clamp = (n: number, low = 0, high = 100) => (n >= high - 1e-9 ? high : Math.min(high, Math.max(low, n)));
const uint = (n: number) => ((Math.floor(n) % 4294967296) + 4294967296) % 4294967296;
const isTask = (id: string): id is TaskId => (TASK_IDS as readonly string[]).includes(id);
const isIncident = (id: string): id is IncidentId => (INCIDENT_IDS as string[]).includes(id);
const playing = (state: GameState) => !state.paused && state.phase === 'activity' && state.activity !== null;
const copy = (state: GameState): GameState => ({ ...state, activity: state.activity ? { ...state.activity } : null });
const difficulty = (state: GameState) => state.level - 1;

function random(state: GameState): number {
  state.rng = uint(Math.imul(state.rng, 1664525) + 1013904223);
  return state.rng / 4294967296;
}

export function emptyInput(): InputState {
  return { primary: false, left: false, right: false, up: false, down: false };
}

export function createGame(level = 1, seed = 20260912): GameState {
  const safeLevel = Number.isFinite(level) ? clamp(Math.floor(level), 1, LEVELS.length) : 1;
  const safeSeed = Number.isFinite(seed) ? uint(seed) : 20260912;
  const state: GameState = {
    version: 1,
phase: 'title',
paused: false,
level: safeLevel,
seed: safeSeed,
rng: safeSeed,
    elapsedMs: 0,
countdownMs: 0,
activity: null,
completed: [],
incidents: [],
incidentQueue: [],
    notice: '说好马上开播……先把房间准备好！',
noticeMs: 0,
  };
  const choices = [...INCIDENT_IDS];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  state.incidentQueue = choices.slice(0, LEVELS[safeLevel - 1].incidentCount);
  return state;
}

export function startGame(state: GameState): GameState {
  return state.phase === 'title' ? { ...state, phase: 'room', paused: false, noticeMs: 4000 } : state;
}

function newActivity(state: GameState, id: ActivityId): ActivityState {
  const sequence: ControlKey[] = [];
  const length = (id === 'obs' ? 4 : 3) + difficulty(state);
  if (id === 'spill') {
    const start = random(state) < 0.5 ? 'left' : 'right';
    for (let i = 0; i < 6 + difficulty(state) * 2; i++) sequence.push(i % 2 === 0 ? start : start === 'left' ? 'right' : 'left');
  } else if (id === 'toilet' || id === 'obs' || id === 'cable') {
    for (let i = 0; i < length; i++) sequence.push(DIRECTIONS[Math.floor(random(state) * DIRECTIONS.length)]);
  }
  return { id, stage: 0, progress: 0, cursor: id === 'audio' ? 15 : 50, target: 35 + random(state) * 30, elapsedMs: 0, holdMs: 0, hits: 0, misses: 0, sequence };
}

export function selectTask(state: GameState, id: TaskId): GameState {
  if (state.phase !== 'room' || state.paused || !isTask(id) || state.completed.some(task => task.id === id)) return state;
  const next = copy(state);
  next.activity = newActivity(next, id);
  next.phase = 'activity';
  next.notice = '';
  next.noticeMs = 0;
  return next;
}

function notice(state: GameState, message: string) {
  state.notice = message;
  state.noticeMs = 2400;
}

function starsFor(ms: number, three: number, two: number): number {
  return ms <= three ? 3 : ms <= two ? 2 : 1;
}

function finish(state: GameState) {
  const { activity } = state;
  if (!activity) return;
  if (isTask(activity.id)) {
    const times = TASK_TIMES[activity.id];
    state.completed = [...state.completed, {
      id: activity.id,
elapsedMs: activity.elapsedMs,
      stars: starsFor(activity.elapsedMs, times[0], times[1]),
mistakes: activity.misses,
    }];
    notice(state, `${TASK_INFO[activity.id].title}完成！${formatTime(activity.elapsedMs)}，回房间准备下一件。`);
  } else {
    state.incidents = [...state.incidents, activity.id];
    notice(state, '小意外解决了！接着准备，马上就能开播。');
  }
  state.activity = null;
  state.phase = 'room';
  // Incidents arrive after the second, fourth and sixth completed preparations.
  if (state.incidentQueue.length && state.completed.length >= (state.incidents.length + 1) * 2) {
    const [incident, ...rest] = state.incidentQueue;
    state.incidentQueue = rest;
    state.activity = newActivity(state, incident);
    state.phase = 'activity';
    notice(state, incident === 'spill' ? '哎呀，桌面洒了水！先擦干。' : incident === 'cable' ? '声卡线松了！重新接好。' : '猫猫占领了键盘！用逗猫棒请它下来。');
  }
}

function miss(state: GameState, message: string) {
  if (state.activity) state.activity.misses++;
  notice(state, message);
}

/** Call on a new key/pointer press only; held controls belong in stepGame's input. */
export function pressControl(state: GameState, key: ControlKey): GameState {
  if (!playing(state) || !['primary', ...DIRECTIONS].includes(key)) return state;
  const next = copy(state);
  const a = next.activity!;
  if (a.sequence.length && a.stage < a.sequence.length && key !== 'primary') {
    if (key === a.sequence[a.stage]) {
      a.stage++;
      a.progress = (a.stage / a.sequence.length) * 100;
      if (a.stage === a.sequence.length) {
        if (a.id === 'toilet') { a.progress = 0; notice(next, '门关好了。按住操作，安心解决一下。'); } else if (a.id === 'obs') notice(next, '来源全部就位。点按操作，确认预览。');
        else finish(next);
      }
    } else {
      a.stage = Math.max(0, a.stage - 1);
      a.progress = (a.stage / a.sequence.length) * 100;
      miss(next, '按错啦，退回一步。看清下一个箭头再试。');
    }
  } else if (a.id === 'obs' && a.stage === a.sequence.length && key === 'primary') {
    finish(next);
  } else if (a.id === 'food' && key === 'primary' && a.holdMs <= 0) {
    const view = getActivityView(next)!;
    a.holdMs = 180;
    if (a.cursor >= view.targetMin && a.cursor <= view.targetMax) {
      a.hits++;
      a.progress = (a.hits / 3) * 100;
      if (a.hits >= 3) finish(next);
      else { a.target = 25 + random(next) * 50; notice(next, '装好一份！下一份换个位置。'); }
    } else {
      a.hits = Math.max(0, a.hits - 1);
      a.progress = (a.hits / 3) * 100;
      miss(next, '点心歪了，重新装一份。等光标进入绿区再点。');
    }
  }
  return next;
}

/** Releasing primary in the green water band commits the cup and starts drinking. */
export function releaseControl(state: GameState, key: ControlKey): GameState {
  if (!playing(state) || key !== 'primary' || state.activity!.id !== 'water' || state.activity!.stage !== 0) return state;
  if (state.activity!.progress === 0) return state;
  const next = copy(state);
  const a = next.activity!;
  if (a.progress >= 65 && a.progress <= 85) {
    a.stage = 1;
    a.progress = 0;
    a.holdMs = 0;
    notice(next, '刚刚好！再按住操作，把水喝完。');
  } else {
    a.progress = 0;
    miss(next, '水量还不合适，重新接一杯。绿区时松手。');
  }
  return next;
}

export function setPointer(state: GameState, xNormalized: number): GameState {
  if (!playing(state) || !Number.isFinite(xNormalized) || !['cat', 'vts', 'audio', 'catwalk'].includes(state.activity!.id)) return state;
  const next = copy(state);
  next.activity!.cursor = clamp(xNormalized);
  return next;
}

function tracking(state: GameState, dt: number, input: InputState, durationMs: number) {
  const a = state.activity!;
  const view = getActivityView(state)!;
  if (input.primary !== true) { a.holdMs = 0; return; }
  if (a.cursor >= view.targetMin && a.cursor <= view.targetMax) {
    a.progress = clamp(a.progress + (dt / durationMs) * 100);
    a.holdMs = 0;
    if (a.progress >= 100) finish(state);
  } else {
    a.progress = clamp(a.progress - (dt / 1000) * (a.id === 'audio' ? 24 : 9));
    a.holdMs += dt;
    if (a.holdMs >= 650) {
      a.holdMs = 0;
      miss(state, a.id === 'audio' ? '声音不稳，调回绿区再试音。' : a.id === 'cat' ? '粮倒到碗外啦，瞄准猫碗继续。' : '跟丢了一点，重新对准绿区就能继续。');
    }
  }
}

function tick(state: GameState, dt: number, input: InputState) {
  if (state.paused || state.phase === 'title' || state.phase === 'result') return;
  const elapsed = state.phase === 'countdown' ? Math.min(dt, state.countdownMs) : dt;
  state.elapsedMs += elapsed;
  state.noticeMs = Math.max(0, state.noticeMs - elapsed);
  if (state.phase === 'countdown') {
    state.countdownMs = Math.max(0, state.countdownMs - elapsed);
    if (state.countdownMs <= 0) state.phase = 'result';
    return;
  }
  const a = state.activity;
  if (!a || state.phase !== 'activity') return;
  a.elapsedMs += dt;
  const hard = difficulty(state);
  if (['cat', 'vts', 'audio', 'catwalk'].includes(a.id)) {
    const move = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
    a.cursor = clamp(a.cursor + move * (dt / 1000) * (a.id === 'audio' ? 35 : 72));
  }
  switch (a.id) {
    case 'water':
      if (input.primary === true) {
        a.progress = clamp(a.progress + (dt / (a.stage === 0 ? 4400 - hard * 200 : 2200)) * 100);
        if (a.stage === 0 && a.progress >= 100) {
          a.progress = 0;
          miss(state, '接满溢出来了！松手再试，停在绿区。');
        } else if (a.stage === 1 && a.progress >= 100) finish(state);
      }
      break;
    case 'toilet':
      if (a.stage === a.sequence.length && input.primary === true) {
        a.progress = clamp(a.progress + (dt / 2600) * 100);
        if (a.progress >= 100) finish(state);
      }
      break;
    case 'food':
      a.holdMs = Math.max(0, a.holdMs - dt);
      a.cursor = 50 + 45 * Math.sin(a.elapsedMs / (520 - hard * 65));
      break;
    case 'cat':
      a.target = 50 + 29 * Math.sin((a.elapsedMs + (state.seed % 1700)) / (1000 - hard * 100));
      tracking(state, dt, input, 3900 + hard * 350);
      break;
    case 'audio':
      tracking(state, dt, input, 1900 + hard * 200);
      break;
    case 'vts':
      a.target = 50 + 32 * Math.sin((a.elapsedMs + (state.seed % 1100)) / (1150 - hard * 120));
      tracking(state, dt, input, 3200 + hard * 300);
      break;
    case 'catwalk':
      a.target = 50 + 28 * Math.sin((a.elapsedMs + (state.seed % 900)) / (1150 - hard * 100));
      tracking(state, dt, input, 2500 + hard * 250);
      break;
    default:
      break;
  }
}

/** At most one real second per call; split long test advances into calls <= 1000 ms. */
export function stepGame(state: GameState, deltaMs: number, input: InputState = emptyInput()): GameState {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || state.paused || state.phase === 'title' || state.phase === 'result') return state;
  const next = copy(state);
  let remaining = Math.min(deltaMs, 1000);
  const controls = input && typeof input === 'object' ? input : emptyInput();
  while (remaining > 0) {
    const dt = Math.min(20, remaining);
    tick(next, dt, controls);
    remaining -= dt;
  }
  return next;
}

export function togglePause(state: GameState): GameState {
  if (state.phase === 'title' || state.phase === 'result') return state;
  return { ...state, paused: !state.paused };
}

export function goLive(state: GameState): GameState {
  if (state.paused || state.phase !== 'room' || state.completed.length !== TASK_IDS.length || state.incidentQueue.length || state.incidents.length !== LEVELS[state.level - 1].incidentCount) return state;
  return { ...state, phase: 'countdown', countdownMs: 3000, notice: '全部就绪。深呼吸，正式上播！', noticeMs: 3000 };
}

export function getStars(state: GameState): number {
  const level = LEVELS[state.level - 1];
  return starsFor(state.elapsedMs, level.threeStarMs, level.twoStarMs);
}

export function formatTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return `${Math.floor(seconds / 60)}分钟${String(seconds % 60).padStart(2, '0')}秒`;
}

export function getActivityView(state: GameState): ActivityView | null {
  const a = state.activity;
  if (!a) return null;
  const hard = difficulty(state);
  const base = { progress: a.progress, progressLabel: '准备进度', targetMin: 0, targetMax: 100 };
  const sequenceHint = a.sequence.map((key, i) => `${i < a.stage ? '✓' : ARROWS[key]}`).join('  ');
  switch (a.id) {
    case 'water':
      return a.stage === 0 ? { ...base, title: '接一杯温水', mode: 'hold', instruction: '按住接水，水位到绿区时松手。', hint: '目标水位 65%–85% · 接满会溢出，需要重来', actionLabel: '按住接水', progressLabel: '杯中水位', targetMin: 65, targetMax: 85 }
        : { ...base, title: '润润嗓子再出发', mode: 'hold', instruction: '再按住操作，把水慢慢喝完。', hint: '可以中途松手，喝完就准备好了', actionLabel: '按住喝水', progressLabel: '已喝完' };
    case 'toilet':
      return a.stage < a.sequence.length ? { ...base, title: '先把门关好', mode: 'sequence', instruction: '依次点按箭头，关门、锁门、拉好帘。', hint: sequenceHint, actionLabel: '先完成箭头', progressLabel: '隐私准备' }
        : { ...base, title: '请稍等一下下', mode: 'hold', instruction: '门关好了。按住操作，安心解决一下。', hint: '完成后会洗手回到房间', actionLabel: '按住安心一下', progressLabel: '马上就好' };
    case 'food': {
      const radius = 11 - hard;
      return { ...base, title: '把点心装进小碟', mode: 'timing', instruction: '光标进入绿区时，点按操作装盘。', hint: `已装好 ${a.hits}/3 份 · 每次点按装一份，按住不会连发`, actionLabel: '点按装盘', progressLabel: '装盘进度', targetMin: a.target - radius, targetMax: a.target + radius };
    }
    case 'cat': {
      const radius = 13 - hard * 2;
      return { ...base, title: '主子的晚饭优先', mode: 'track', instruction: '左右移动瞄准猫碗，同时按住倒粮。', hint: '拖动瞄准条或按 ← → · 松手可暂停倒粮', actionLabel: '按住倒猫粮', progressLabel: '猫碗装满', targetMin: a.target - radius, targetMax: a.target + radius };
    }
    case 'audio': {
      const radius = 8 - hard;
      return { ...base, title: '声卡 · 一二三，喂喂', mode: 'dial', instruction: '把旋钮调到绿区，按住操作持续试音。', hint: '拖动音量条或按 ← → · 试音中也可以微调', actionLabel: '按住试音', progressLabel: '声音稳定', targetMin: a.target - radius, targetMax: a.target + radius };
    }
    case 'vts': {
      const radius = 15 - hard * 2;
      return { ...base, title: 'VTS · 找到今天的自己', mode: 'track', instruction: '让追踪框跟着脸，同时按住校准。', hint: '拖动追踪条或按 ← → · 对准绿区再校准', actionLabel: '按住校准', progressLabel: '模型校准', targetMin: a.target - radius, targetMax: a.target + radius };
    }
    case 'obs':
      return a.stage < a.sequence.length ? { ...base, title: 'OBS · 让直播间亮起来', mode: 'sequence', instruction: '依次点按箭头，加载画面、模型和声音来源。', hint: sequenceHint, actionLabel: '先加载来源', progressLabel: '来源加载' }
        : { ...base, title: 'OBS · 预览准备完毕', mode: 'sequence', instruction: '画面和声音都就位了，点按确认预览。', hint: '全部准备完成后，回房间点击「正式上播」', actionLabel: '点按确认预览', progressLabel: '来源已就位' };
    case 'spill':
      return { ...base, title: '小意外 · 桌面洒水了', mode: 'sequence', instruction: '交替点按左右箭头，把桌面擦干。', hint: sequenceHint, actionLabel: '交替擦桌子', progressLabel: '桌面擦干' };
    case 'cable':
      return { ...base, title: '小意外 · 声卡线松了', mode: 'sequence', instruction: '按箭头顺序整理线缆，重新接好接口。', hint: sequenceHint, actionLabel: '按顺序接线', progressLabel: '线缆连接' };
    case 'catwalk': {
      const radius = 17 - hard * 2;
      return { ...base, title: '小意外 · 键盘上长猫了', mode: 'track', instruction: '左右移动逗猫棒，同时按住吸引猫猫。', hint: '拖动瞄准条或按 ← → · 让玩具跟着猫猫', actionLabel: '按住逗猫', progressLabel: '请猫猫下桌', targetMin: a.target - radius, targetMax: a.target + radius };
    }
    default:
      return null;
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, max = 86400000): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const integer = (value: unknown, max: number): value is number => finite(value, max) && Number.isInteger(value);

function minimumTaskTime(id: TaskId, level: number): number {
  const hard = level - 1;
  switch (id) {
    case 'water': return (4400 - hard * 200) * 0.65 + 2200;
    case 'toilet': return 2600;
    case 'food': return 360;
    case 'cat': return 3900 + hard * 350;
    case 'audio': return 1900 + hard * 200;
    case 'vts': return 3200 + hard * 300;
    default: return 0;
  }
}

/** Only structurally coherent saves resume. Active games always restore paused. */
export function validateGame(raw: unknown): GameState | null {
  if (!record(raw) || raw.version !== 1 || !integer(raw.level, 3) || raw.level < 1 || !integer(raw.seed, 4294967295) || !integer(raw.rng, 4294967295)) return null;
  if (!['title', 'room', 'activity', 'countdown', 'result'].includes(String(raw.phase)) || typeof raw.paused !== 'boolean') return null;
  if (!finite(raw.elapsedMs) || !finite(raw.countdownMs, 3000) || !finite(raw.noticeMs, 5000) || typeof raw.notice !== 'string' || raw.notice.length > 300) return null;
  if (!Array.isArray(raw.completed) || raw.completed.length > 7 || !Array.isArray(raw.incidents) || !Array.isArray(raw.incidentQueue)) return null;
  const completed: GameState['completed'] = [];
  for (const item of raw.completed) {
    if (!record(item) || typeof item.id !== 'string' || !isTask(item.id) || completed.some(other => other.id === item.id)) return null;
    if (!finite(item.elapsedMs, raw.elapsedMs) || !integer(item.mistakes, 1000000) || !integer(item.stars, 3) || item.stars < 1) return null;
    if (item.elapsedMs + 0.01 < minimumTaskTime(item.id, raw.level)) return null;
    if (item.stars !== starsFor(item.elapsedMs, ...TASK_TIMES[item.id])) return null;
    completed.push({ id: item.id, elapsedMs: item.elapsedMs, mistakes: item.mistakes, stars: item.stars });
  }
  if (completed.reduce((sum, item) => sum + item.elapsedMs, 0) > raw.elapsedMs + 0.01) return null;
  const incidents: IncidentId[] = [];
  const incidentQueue: IncidentId[] = [];
  for (const value of raw.incidents) {
    if (typeof value !== 'string' || !isIncident(value) || incidents.includes(value)) return null;
    incidents.push(value);
  }
  for (const value of raw.incidentQueue) {
    if (typeof value !== 'string' || !isIncident(value) || incidentQueue.includes(value) || incidents.includes(value)) return null;
    incidentQueue.push(value);
  }
  let activity: ActivityState | null = null;
  if (raw.activity !== null) {
    const a = raw.activity;
    if (!record(a) || typeof a.id !== 'string' || !(isTask(a.id) || isIncident(a.id))) return null;
    if (!integer(a.stage, 10) || !finite(a.progress, 100) || !finite(a.cursor, 100) || !finite(a.target, 100) || !finite(a.elapsedMs, raw.elapsedMs) || !finite(a.holdMs, 650) || !integer(a.hits, 3) || !integer(a.misses, 1000000)) return null;
    if (!Array.isArray(a.sequence) || a.sequence.length > 10 || !a.sequence.every(key => DIRECTIONS.includes(key))) return null;
    const { sequence } = a;
    const seqLength = a.id === 'spill' ? 6 + (raw.level - 1) * 2 : (a.id === 'obs' ? 4 : 3) + raw.level - 1;
    if (['toilet', 'obs', 'spill', 'cable'].includes(a.id)) {
      if (a.sequence.length !== seqLength || a.stage > seqLength) return null;
      if (['spill', 'cable'].includes(a.id) && a.stage === seqLength) return null;
      if ((a.stage < seqLength || a.id === 'obs') && Math.abs(a.progress - (a.stage / seqLength) * 100) > 0.01) return null;
      if (a.id === 'spill' && sequence.some((key, i) => !['left', 'right'].includes(key) || (i > 0 && sequence[i - 1] === key))) return null;
    } else if (a.sequence.length || a.stage > (a.id === 'water' ? 1 : 0)) return null;
    if (a.id === 'food' && (a.hits > 2 || Math.abs(a.progress - (a.hits / 3) * 100) > 0.01)) return null;
    if (a.id !== 'obs' && a.progress === 100) return null;
    if (a.id !== 'food' && a.hits !== 0) return null;
    if (a.id === 'food' ? a.holdMs > 180 : !['cat', 'audio', 'vts', 'catwalk'].includes(a.id) && a.holdMs !== 0) return null;
    if (a.id === 'water' && a.stage === 1 && a.elapsedMs + 0.01 < (4400 - (raw.level - 1) * 200) * 0.65) return null;
    if (isTask(a.id) && completed.some(item => item.id === a.id)) return null;
    if (isIncident(a.id) && (incidents.includes(a.id) || incidentQueue.includes(a.id))) return null;
    if (completed.reduce((sum, item) => sum + item.elapsedMs, a.elapsedMs) > raw.elapsedMs + 0.01) return null;
    activity = { id: a.id, stage: a.stage, progress: a.progress, cursor: a.cursor, target: a.target, elapsedMs: a.elapsedMs, holdMs: a.holdMs, hits: a.hits, misses: a.misses, sequence: [...a.sequence] };
  }
  if ((raw.phase === 'activity') !== (activity !== null)) return null;
  const activeIncident = activity && isIncident(activity.id) ? [activity.id] : [];
  const expected = createGame(raw.level, raw.seed).incidentQueue;
  if (JSON.stringify([...incidents, ...activeIncident, ...incidentQueue]) !== JSON.stringify(expected)) return null;
  const due = Math.min(Math.floor(completed.length / 2), expected.length);
  if (incidents.length + activeIncident.length !== due) return null;
  if (activeIncident.length && completed.length !== (incidents.length + 1) * 2) return null;
  if (raw.phase === 'title' && (raw.elapsedMs !== 0 || completed.length || incidents.length)) return null;
  if (['countdown', 'result'].includes(String(raw.phase)) && (completed.length !== 7 || incidents.length !== expected.length)) return null;
  if (raw.phase === 'countdown' ? raw.countdownMs <= 0 : raw.countdownMs !== 0) return null;
  if (raw.phase === 'result' && raw.elapsedMs < 3000) return null;
  const incidentMinimum = incidents.includes('catwalk') ? 2500 + (raw.level - 1) * 250 : 0;
  const recordedMinimum = completed.reduce((sum, item) => sum + item.elapsedMs, incidentMinimum);
  const countdownElapsed = raw.phase === 'result' ? 3000 : raw.phase === 'countdown' ? 3000 - raw.countdownMs : 0;
  if (recordedMinimum + countdownElapsed + (activity?.elapsedMs ?? 0) > raw.elapsedMs + 0.01) return null;
  return {
    version: 1,
level: raw.level,
seed: raw.seed,
rng: raw.rng,
phase: raw.phase as GameState['phase'],
    paused: raw.phase !== 'title' && raw.phase !== 'result',
elapsedMs: raw.elapsedMs,
    countdownMs: raw.countdownMs,
notice: raw.notice,
noticeMs: raw.noticeMs,
    activity,
completed,
incidents,
incidentQueue,
  };
}
