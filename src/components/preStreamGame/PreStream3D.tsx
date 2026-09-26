'use client';

import {
  ArrowLeftOutlined, CaretRightOutlined, CheckOutlined, CloseOutlined,
  FullscreenOutlined, PauseOutlined, QuestionCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LIVE_RADIUS, STATIONS, aimPrep, createPrepGame, formatPrepTime, getPrepAction, getPrepStars, getPrepWalkTarget, goLivePrep,
  interactPrep, leaveMiniGame, pressPrep, startPrepGame, stepPrepGame, placeFoodPrep, releaseCatPourPrep,
  setAudioChannelPrep, capturePosePrep, wipeSpillPrep, connectCablePrep, toggleObsSourcePrep,
  togglePausePrep, validatePrepGame,
} from './gameplay3d';
import type { PrepState, StationId, TaskId } from './gameplay3d';
import styles from './preStream3D.module.css';

const World3D = dynamic(() => import('./World3D'), { ssr: false });
const SAVE_KEY = 'sui-pre-stream-run-v2';
const RECORD_KEY = 'sui-pre-stream-records-v2';
const TASKS: { id: TaskId; label: string; station: StationId }[] = [
  { id: 'water', label: '接水喝水', station: 'thermos' },
  { id: 'toilet', label: '上厕所', station: 'toilet' },
  { id: 'food', label: '备点心', station: 'food' },
  { id: 'cat', label: '喂猫', station: 'cat' },
  { id: 'audio', label: '调声卡', station: 'audio' },
  { id: 'vts', label: '校准 VTS', station: 'vts' },
  { id: 'obs', label: '布置 OBS', station: 'obs' },
];
const NIGHTS = [
  { id: 1, title: '第一夜', mood: '先把房间跑熟' },
  { id: 2, title: '第二夜', mood: '猫和意外都来凑热闹' },
  { id: 3, title: '第三夜', mood: '观众已经在催了' },
];
const MINI_NAMES: Record<string, string> = {
  toilet: '水花靶心',
food: '点心装盘',
cat: '猫碗空投',
audio: '声卡试音',
  vts: '表情捕捉',
obs: '直播来源',
spill: '桌面抢救',
cable: '线路抢修',
catwalk: '键盘争夺战',
};
const MINI_NOTES: Record<string, string> = {
  toilet: '瞄准靶心按住发射，最后按下冲水按钮。',
  food: '看订单拿食材，依次放到盘位上。',
  cat: '按住倒粮，到目标刻度松手。',
  audio: '调好三路声卡电平，再测试声音。',
  vts: '按照屏幕提示采集三个表情。',
  obs: '打开直播需要的来源，检查预览。',
  spill: '拖着抹布逐处擦掉水渍。',
  cable: '选插头，再接到对应接口。',
  catwalk: '等猫咪走到桌边，再点逗猫棒。',
};
const FOOD_ITEMS = [
  { id: 'bread', label: '小面包' },
  { id: 'berry', label: '莓果' },
  { id: 'cream', label: '奶油' },
  { id: 'mint', label: '薄荷' },
] as const;
const POSE_ITEMS = [
  { id: 'smile', label: '微笑' },
  { id: 'blink', label: '眨眼' },
  { id: 'tilt', label: '歪头' },
] as const;
const AUDIO_CHANNELS = ['麦克风', '伴奏', '监听'] as const;
const OBS_SOURCES = ['摄像头', '麦克风', '弹幕', '挂件', '桌面'] as const;
type RecordEntry = { elapsedMs: number; stars: number };
type Records = { version: 2; unlocked: number; best: Record<string, RecordEntry> };
type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

const freshRecords = (): Records => ({ version: 2, unlocked: 1, best: {} });
function readRecords(raw: string | null): Records {
  try {
    const value = JSON.parse(raw || 'null');
    const result = freshRecords();
    if (value?.version !== 2 || !value.best || typeof value.best !== 'object') return result;
    NIGHTS.forEach(night => {
      const entry = value.best[night.id];
      if (Number.isFinite(entry?.elapsedMs) && entry.elapsedMs > 0 &&
        Number.isInteger(entry.stars) && entry.stars >= 1 && entry.stars <= 3) {
        result.best[night.id] = { elapsedMs: entry.elapsedMs, stars: entry.stars };
      }
    });
    result.unlocked = result.best[1] ? (result.best[2] ? 3 : 2) : 1;
    return result;
  } catch { return freshRecords(); }
}

function Stars({ count }: { count: number }) {
  return (
<span className={styles.stars} aria-label={`${count} 星`}>{[1, 2, 3].map(index => (
    <span key={index} data-lit={index <= count}>★</span>
  ))}</span>
);
}

function waterStatus(state: PrepState): string {
  const { water } = state;
  if (water.cup === 'filling') return `饮水机接水中 ${Math.max(0, Math.ceil((water.fillRequiredMs - water.fillMs) / 1000))} 秒`;
  if (water.cup === 'ready') return '水接好了，去饮水机取杯';
  if (water.cup === 'carried-empty') return '带保温杯去饮水机';
  if (water.cup === 'carried-full') return '把水喝了，润润嗓子';
  if (water.cup === 'drank') return '水已喝好';
  return '保温杯还在桌上';
}

function minigameAction(state: PrepState): string {
  const mini = state.minigame;
  if (!mini) return '操作';
  if (mini.kind === 'toilet') {
    if (mini.stage === 'flush-ready') return '冲水';
    if (mini.stage === 'flushing') return '冲水中';
    return '按住发射';
  }
  if (mini.kind === 'cat') return '按住倒粮，松开结算';
  if (mini.kind === 'audio') return mini.stage === 'testing' ? '试音中' : '测试电平';
  if (mini.kind === 'catwalk' && mini.stage === 'confirm') return '确认键盘安全';
  if (mini.kind === 'catwalk') return '抓准时机，点击逗猫';
  if (mini.kind === 'obs') return mini.stage === 'confirm' ? '确认接入直播' : '检查直播预览';
  if (mini.kind === 'cable') return '试音确认';
  return '操作';
}

export default function PreStream3D() {
  const [state, setState] = useState<PrepState>(() => createPrepGame());
  const [records, setRecords] = useState<Records>(freshRecords);
  const [ready, setReady] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [target, setTarget] = useState<StationId | null>(null);
  const [help, setHelp] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [knob, setKnob] = useState({ x: 0, z: 0 });
  const [held, setHeld] = useState(false);
  const [selectedFood, setSelectedFood] = useState<number | null>(null);
  const [selectedPlug, setSelectedPlug] = useState<number | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const stateRef = useRef(state);
  const recordsRef = useRef(records);
  const keysRef = useRef(new Set<string>());
  const stickRef = useRef({ x: 0, z: 0 });
  const stickIdRef = useRef<number | null>(null);
  const primaryRef = useRef(false);
  const destinationRef = useRef<StationId | null>(null);
  const manualRef = useRef(false);
  const initializedRef = useRef(false);
  const saveAtRef = useRef(0);
  const paintAtRef = useRef(0);
  const worldOnReady = useCallback(() => setWorldReady(true), []);

  useEffect(() => {
    setSelectedFood(null);
    setSelectedPlug(null);
  }, [state.minigame?.kind]);

  const persist = useCallback((next: PrepState, force = false) => {
    if (!initializedRef.current) return;
    const now = performance.now();
    if (!force && now - saveAtRef.current < 750) return;
    saveAtRef.current = now;
    try {
      if (next.phase === 'title') localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      localStorage.setItem(RECORD_KEY, JSON.stringify(recordsRef.current));
    } catch { setStorageOk(false); }
  }, []);

  const clearControls = useCallback(() => {
    keysRef.current.clear();
    stickRef.current = { x: 0, z: 0 };
    primaryRef.current = false;
    stickIdRef.current = null;
    destinationRef.current = null;
    setKnob({ x: 0, z: 0 });
    setHeld(false);
    setTarget(null);
  }, []);

  const commit = useCallback((next: PrepState, force = true) => {
    const previous = stateRef.current;
    if (next === previous) return;
    if (next.phase !== previous.phase || next.paused !== previous.paused) {
      primaryRef.current = false;
      setHeld(false);
    }
    if (previous.phase !== 'result' && next.phase === 'result') {
      const old = recordsRef.current;
      const best = old.best[next.level];
      const updated: Records = {
        version: 2,
        unlocked: Math.max(old.unlocked, Math.min(3, next.level + 1)),
        best: {
          ...old.best,
          [next.level]: !best || next.elapsedMs < best.elapsedMs
            ? { elapsedMs: next.elapsedMs, stars: getPrepStars(next) } : best,
        },
      };
      recordsRef.current = updated;
      setRecords(updated);
      destinationRef.current = null;
      setTarget(null);
    }
    stateRef.current = next;
    if (force || performance.now() - paintAtRef.current > 45 || next.phase !== previous.phase || next.minigame?.stage !== previous.minigame?.stage) {
      paintAtRef.current = performance.now();
      setState(next);
    }
    persist(next, force);
  }, [persist]);

  const selectNight = useCallback((level: number, begin = false) => {
    clearControls();
    setHelp(false);
    setConfirmRestart(false);
    const seed = (Date.now() + Math.floor(Math.random() * 4294967296)) % 4294967296;
    const fresh = createPrepGame(level, seed);
    commit(begin ? startPrepGame(fresh) : fresh);
  }, [clearControls, commit]);

  const pause = useCallback(() => {
    const { current } = stateRef;
    if (current.phase === 'title' || current.phase === 'result') return;
    clearControls();
    commit(togglePausePrep(current));
  }, [clearControls, commit]);

  const fullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen?.();
    } catch { /* Fullscreen support is optional. */ }
  }, []);

  const requestGoLive = useCallback(() => {
    const { current } = stateRef;
    if (current.phase !== 'explore' || current.paused) return;
    const desk = STATIONS.find(item => item.id === 'obs');
    if (desk && Math.hypot(desk.x - current.player.x, desk.z - current.player.z) <= LIVE_RADIUS) commit(goLivePrep(current));
  }, [commit]);

  const interact = useCallback((station?: StationId) => {
    const { current } = stateRef;
    if (current.phase !== 'explore' || current.paused) return;
    if (!station) {
      const desk = STATIONS.find(item => item.id === 'obs');
      if (current.completed.length === TASKS.length && desk && Math.hypot(desk.x - current.player.x, desk.z - current.player.z) <= LIVE_RADIUS) {
        requestGoLive();
      } else commit(interactPrep(current));
      return;
    }
    const found = STATIONS.find(item => item.id === station);
    if (!found) return;
    const distance = Math.hypot(found.x - current.player.x, found.z - current.player.z);
    if (station === 'obs' && current.completed.length === TASKS.length && distance <= LIVE_RADIUS) {
      requestGoLive();
      return;
    }
    if (distance <= 1.15) {
      destinationRef.current = null;
      setTarget(null);
      commit(interactPrep(current, station));
    } else {
      destinationRef.current = station;
      setTarget(station);
    }
  }, [commit, requestGoLive]);

  const act = useCallback(() => {
    const { current } = stateRef;
    if (current.phase === 'minigame' && !current.paused) commit(pressPrep(current));
    else if (current.phase === 'explore') interact();
  }, [commit, interact]);

  const aim = useCallback((x: number, y: number) => {
    const { current } = stateRef;
    if (current.phase === 'minigame' && !current.paused) commit(aimPrep(current, x, y), false);
  }, [commit]);

  useEffect(() => {
    try {
      const storedRecords = readRecords(localStorage.getItem(RECORD_KEY));
      recordsRef.current = storedRecords;
      setRecords(storedRecords);
      const saved = localStorage.getItem(SAVE_KEY);
      let restored: PrepState | null = null;
      try { restored = saved ? validatePrepGame(JSON.parse(saved)) : null; } catch { /* Bad save starts a fresh run. */ }
      if (restored && restored.level <= storedRecords.unlocked) {
        const next = { ...restored, paused: restored.phase !== 'title' && restored.phase !== 'result' };
        stateRef.current = next;
        setState(next);
      } else if (saved) localStorage.removeItem(SAVE_KEY);
    } catch { setStorageOk(false); }
    initializedRef.current = true;
    setReady(true);
    return () => { persist(stateRef.current, true); initializedRef.current = false; };
  }, [persist]);

  useEffect(() => {
    const tick = (ms: number) => {
      let remaining = Math.min(300000, Math.max(0, Number.isFinite(ms) ? ms : 0));
      while (remaining > 0) {
        const delta = Math.min(32, remaining);
        const { current } = stateRef;
        const keys = keysRef.current;
        let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
          (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stickRef.current.x;
        let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
          (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + stickRef.current.z;
        const manual = x !== 0 || z !== 0;
        if (manual && destinationRef.current) {
          destinationRef.current = null;
          setTarget(null);
        }
        const station = !manual && destinationRef.current && STATIONS.find(item => item.id === destinationRef.current);
        if (station && current.phase === 'explore' && !current.paused) {
          const dx = station.x - current.player.x;
          const dz = station.z - current.player.z;
          if (Math.hypot(dx, dz) < 1.12) {
            destinationRef.current = null;
            setTarget(null);
            if (station.id !== 'obs' || !current.completed.includes('obs')) commit(interactPrep(current, station.id));
          } else {
            const waypoint = getPrepWalkTarget(current, station.id);
            if (waypoint) {
              x = waypoint.x - current.player.x;
              z = waypoint.z - current.player.z;
            }
          }
        }
        const length = Math.hypot(x, z);
        if (length > 1) { x /= length; z /= length; }
        const next = stepPrepGame(stateRef.current, delta, { x, z, primary: primaryRef.current });
        commit(next, false);
        remaining -= delta;
      }
    };
    const api = window as GameWindow;
    const textState = () => JSON.stringify({
      game: 'pre-stream-3d',
coordinateSystem: 'world: x right, z down; aim: x/y 0..1',
      ...stateRef.current,
target: destinationRef.current,
      records: recordsRef.current,
formattedTime: formatPrepTime(stateRef.current.elapsedMs),
    });
    const advance = (ms: number) => { manualRef.current = true; tick(ms); setState({ ...stateRef.current }); };
    api.render_game_to_text = textState;
    api.advanceTime = advance;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const delta = Math.max(0, now - last);
      last = now;
      if (!manualRef.current && initializedRef.current && !document.hidden) tick(delta);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      if (api.render_game_to_text === textState) delete api.render_game_to_text;
      if (api.advanceTime === advance) delete api.advanceTime;
    };
  }, [commit]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if (event.code === 'KeyF') { event.preventDefault(); if (!event.repeat) fullscreen(); return; }
      if (confirmRestart || help) {
        if (event.code === 'Escape') { event.preventDefault(); setConfirmRestart(false); setHelp(false); }
        return;
      }
      if (event.code === 'Escape' || event.code === 'KeyP') {
        event.preventDefault();
        if (event.code === 'Escape' && destinationRef.current) {
          destinationRef.current = null; setTarget(null);
        } else if (event.code === 'Escape' && stateRef.current.phase === 'minigame' && !stateRef.current.paused) {
          primaryRef.current = false; commit(leaveMiniGame(stateRef.current));
        } else if (!event.repeat) pause();
        return;
      }
      const focusedControl = event.target instanceof HTMLElement && Boolean(event.target.closest('button, a, input, select'));
      const { current } = stateRef;
      if (current.paused || current.phase === 'title' || current.phase === 'result') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        if (focusedControl && event.target instanceof HTMLInputElement) return;
        if (current.phase === 'minigame' && current.minigame?.kind === 'toilet') {
          event.preventDefault();
          const horizontal = event.code === 'ArrowRight' || event.code === 'KeyD' ? 1 :
            event.code === 'ArrowLeft' || event.code === 'KeyA' ? -1 : 0;
          const vertical = event.code === 'ArrowDown' || event.code === 'KeyS' ? 1 :
            event.code === 'ArrowUp' || event.code === 'KeyW' ? -1 : 0;
          aim(current.minigame.aimX + horizontal * 0.055, current.minigame.aimY + vertical * 0.055);
        } else if (current.phase === 'explore') {
          event.preventDefault();
          keysRef.current.add(event.code);
        }
      } else if (event.code === 'KeyE' || event.code === 'Space') {
        if ((focusedControl && event.code === 'Space') || event.target instanceof HTMLInputElement) return;
        event.preventDefault();
        if (event.code === 'Space' && current.phase === 'minigame') primaryRef.current = true;
        if (!event.repeat) act();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
      if (event.code === 'Space') {
        const wasHeld = primaryRef.current;
        primaryRef.current = false;
        if (wasHeld && stateRef.current.minigame?.kind === 'cat') commit(releaseCatPourPrep(stateRef.current));
      }
    };
    const freeze = () => {
      keysRef.current.clear(); primaryRef.current = false; stickRef.current = { x: 0, z: 0 };
      setKnob({ x: 0, z: 0 }); setHeld(false);
      const { current } = stateRef;
      if (!current.paused && ['explore', 'minigame', 'countdown'].includes(current.phase)) commit(togglePausePrep(current));
      persist(stateRef.current, true);
    };
    const visibility = () => { if (document.hidden) freeze(); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', freeze);
    window.addEventListener('pagehide', freeze);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', freeze);
      window.removeEventListener('pagehide', freeze);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [act, aim, commit, confirmRestart, fullscreen, help, pause, persist]);

  const stationAction = (id: StationId) => {
    if ((id === 'thermos' || id === 'dispenser') && state.water.cup === 'drank') return '完成';
    if (id === 'dispenser' && state.water.cup === 'filling') return '接水中';
    if (id === 'obs' && state.completed.includes('obs')) return '开播台';
    if (TASKS.some(task => task.station === id && state.completed.includes(task.id))) return '完成';
    return '';
  };
  const waterPercent = state.water.cup === 'filling'
    ? Math.min(100, (state.water.fillMs / state.water.fillRequiredMs) * 100)
    : state.water.cup === 'ready' || state.water.cup === 'carried-full' || state.water.cup === 'drank' ? 100 : 0;
  const mini = state.minigame;
  const holdMode = mini && (mini.kind === 'cat' || (mini.kind === 'toilet' && mini.stage === 'shoot'));
  const currentNight = NIGHTS[state.level - 1] || NIGHTS[0];
  const gameActive = state.phase !== 'title' && state.phase !== 'result';
  const percent = Math.max(0, Math.min(100, mini?.progress || 0));
  const obsStation = STATIONS.find(station => station.id === 'obs');
  const readyForLive = state.completed.length === TASKS.length &&
    state.incidents.active.length === 0 && state.incidents.queue.length === 0 &&
    state.incidents.resolved.length === state.level;
  const atComputer = Boolean(obsStation && Math.hypot(obsStation.x - state.player.x, obsStation.z - state.player.z) <= LIVE_RADIUS);
  const nearbyAction = readyForLive && atComputer ? '正式上播' : getPrepAction(state);

  const pointAim = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    aim((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  };
  const aimDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!mini || state.paused) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointAim(event);
    if (holdMode) { primaryRef.current = true; setHeld(true); }
  };
  const aimUp = () => { primaryRef.current = false; setHeld(false); };
  const actionDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (holdMode) { primaryRef.current = true; setHeld(true); } else act();
  };
  const actionUp = () => {
    const wasHeld = primaryRef.current;
    primaryRef.current = false;
    setHeld(false);
    if (wasHeld && stateRef.current.minigame?.kind === 'cat') commit(releaseCatPourPrep(stateRef.current));
  };
  const wipePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    commit(wipeSpillPrep(stateRef.current, (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height), false);
  };
  const stickMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = bounds.width * 0.36;
    const x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    const z = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const length = Math.max(1, Math.hypot(x, z));
    const vector = { x: x / length, z: z / length };
    stickRef.current = vector; setKnob(vector);
  };
  const stickUp = () => {
    stickIdRef.current = null;
    stickRef.current = { x: 0, z: 0 };
    setKnob({ x: 0, z: 0 });
  };

  return (
<main ref={rootRef} className={styles.root} data-phase={state.phase}>
    <div className={styles.world}><World3D state={state} liveStateRef={stateRef} onStationClick={interact} onReady={worldOnReady} /></div>
    {!worldReady && <div className={styles.loading} role="status">房间准备中…</div>}

    <header className={styles.topbar}>
      <div className={styles.brandGroup}>
        <Link href="/demos" className={styles.iconLink} title="返回实验室" aria-label="返回实验室"><ArrowLeftOutlined /></Link>
        <div className={styles.brand}><span>SUI / BEFORE LIVE</span><strong>岁己：马上就播</strong></div>
      </div>
      <div className={styles.topStatus}>
        <span className={styles.nightTag}>{currentNight.title}</span>
        <strong className={styles.timer} aria-label={`开播用时 ${formatPrepTime(state.elapsedMs)}`}>{formatPrepTime(state.elapsedMs)}</strong>
        <span className={styles.doneCount}>{state.completed.length}<b>/ 7</b></span>
      </div>
      <div className={styles.topTools}>
        <button type="button" className={styles.iconButton} onClick={() => { if (gameActive && !state.paused) pause(); setHelp(true); }} title="玩法" aria-label="玩法"><QuestionCircleOutlined /></button>
        <button type="button" className={styles.iconButton} onClick={fullscreen} title="F 全屏" aria-label="切换全屏"><FullscreenOutlined /></button>
        {gameActive && <button type="button" id="pause-game" className={styles.iconButton} onClick={pause} title={state.paused ? '继续' : '暂停'} aria-label={state.paused ? '继续' : '暂停'}>{state.paused ? <CaretRightOutlined /> : <PauseOutlined />}</button>}
      </div>
    </header>

    {state.phase === 'title' && (
<section className={styles.titleScreen} aria-label="开始游戏">
      <p className={styles.kicker}>开播倒计时，从现在开始</p>
      <h1>岁己：<br /><em>马上就播。</em></h1>
      <p className={styles.titleSub}>“再给我五分钟！”<br />接水、喂猫、试音……今晚也要在小小的混乱中准时上播。</p>
      <div className={styles.nightPicker} aria-label="选择夜晚">
        {NIGHTS.map(night => (
<button
key={night.id}
type="button"
data-level={night.id}
          aria-pressed={state.level === night.id}
disabled={night.id > records.unlocked || !ready}
          onClick={() => selectNight(night.id)}>
          <span>0{night.id}</span><strong>{night.title}</strong>
          {records.best[night.id] ? <Stars count={records.best[night.id].stars} /> : <small>{night.id > records.unlocked ? '待解锁' : night.mood}</small>}
        </button>
))}
      </div>
      <button
type="button"
id="start-game"
className={styles.mainButton}
disabled={!ready || !worldReady}
        onClick={() => commit(startPrepGame(stateRef.current))}>
        <CaretRightOutlined /> {ready && worldReady ? '开始准备' : '房间准备中'}
      </button>
      <p className={styles.titleHint}>WASD 移动 · E 交互 · 点击目标自动前往</p>
    </section>
)}

    {(state.phase === 'explore' || state.phase === 'minigame') && !state.paused && (
<>
      <div className={styles.objectives} aria-label="开播准备">
        <span className={styles.objectiveHeading}>今晚的准备</span>
        <div className={styles.taskDots}>{TASKS.map(task => <span key={task.id} data-done={state.completed.includes(task.id)} title={task.label} aria-label={`${task.label}${state.completed.includes(task.id) ? '完成' : '未完成'}`} />)}</div>
        <span className={styles.objectiveText}>{state.incidents.active.length > 0 ? '临时加戏，先处理突发状况' : target ? `正在前往${STATIONS.find(item => item.id === target)?.label || '目标'}` : readyForLive ? atComputer ? '电脑前就绪，按 E 正式上播' : '准备好了，去电脑前开播' : nearbyAction || '走近物品并交互'}</span>
      </div>
      <div className={styles.waterHud} data-water={state.water.cup}>
        <div><strong>保温杯</strong><span>{waterStatus(state)}</span></div>
        {state.water.cup === 'filling' && <div className={styles.waterTrack}><i style={{ width: `${waterPercent}%` }} /></div>}
      </div>
      {state.notice && state.noticeMs > 0 && <div className={styles.notice} role="status">{state.notice}</div>}
    </>
)}

    {state.phase === 'explore' && !state.paused && (
<>
      <div className={styles.stationRail} aria-label="房间里的准备地点">
        {STATIONS.filter(station => !['spill', 'cable', 'catwalk'].includes(station.id) || state.incidents.active.includes(station.id as 'spill' | 'cable' | 'catwalk')).map(station => (
          <button
key={station.id}
type="button"
data-station={station.id}
data-current={target === station.id}
            data-done={stationAction(station.id) === '完成' || (station.id === 'obs' && state.completed.includes('obs'))}
onClick={() => interact(station.id)}
            disabled={stationAction(station.id) === '完成'}
title={`${station.label} · 点击前往`}>
            <span className={styles.stationMark}>{stationAction(station.id) === '完成' || (station.id === 'obs' && state.completed.includes('obs')) ? <CheckOutlined /> : '·'}</span>
            <span>{station.label}</span>
            {stationAction(station.id) && <small>{stationAction(station.id)}</small>}
          </button>
        ))}
      </div>
      <div className={styles.explorePrompt}>
        <span>{target ? '正在前往目标' : 'WASD / 方向键移动'}</span>
        <button id="interact" type="button" onClick={() => interact()}><span>E</span> {nearbyAction || '交互'}</button>
      </div>
      <div className={styles.mobileControls}>
        <div
className={styles.joystick}
aria-label="移动摇杆"
role="application"
          onPointerDown={event => { event.preventDefault(); stickIdRef.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); stickMove(event); }}
          onPointerMove={event => { if (stickIdRef.current === event.pointerId) stickMove(event); }}
          onPointerUp={stickUp}
onPointerCancel={stickUp}
onLostPointerCapture={stickUp}>
          <span style={{ transform: `translate(${knob.x * 29}px, ${knob.z * 29}px)` }} />
        </div>
        <button type="button" className={styles.mobileInteract} aria-label={readyForLive && atComputer ? '正式上播' : '交互'} onClick={() => interact()}>{readyForLive && atComputer ? '上播' : '交互'}</button>
      </div>
    </>
)}

    {state.phase === 'minigame' && mini && !state.paused && (
<section className={styles.miniPanel} aria-label={`${MINI_NAMES[mini.kind]}小游戏`}>
      <div className={styles.miniHead}><div><span>NOW PLAYING</span><h2>{MINI_NAMES[mini.kind]}</h2></div><button type="button" onClick={() => { clearControls(); commit(leaveMiniGame(stateRef.current)); }} title="返回房间" aria-label="返回房间"><CloseOutlined /></button></div>
      <p className={styles.miniNote}>{MINI_NOTES[mini.kind]}</p>
      {mini.kind === 'toilet' && (
        <div
data-aim-area
className={styles.aimBoard}
data-kind="toilet"
data-flushing={mini.stage === 'flushing'}
          onPointerDown={aimDown}
          onPointerMove={event => { if (event.pointerType === 'mouse' || event.currentTarget.hasPointerCapture(event.pointerId)) pointAim(event); }}
          onPointerUp={aimUp}
onPointerCancel={aimUp}
onLostPointerCapture={aimUp}>
          <span className={styles.sceneTag}>洗手间</span><span className={styles.toiletBowl} />
          <span className={styles.aimTarget} style={{ left: `${mini.targetX * 100}%`, top: `${mini.targetY * 100}%` }} />
          <span className={styles.crosshair} style={{ left: `${mini.aimX * 100}%`, top: `${mini.aimY * 100}%` }} />
          <span className={styles.splashCount}>水花 × {mini.splashCount}</span>
          {mini.splashCount > 0 && <span className={styles.splash} key={mini.splashCount} style={{ left: `${mini.targetX * 100}%`, top: `${mini.targetY * 100}%` }}>✦</span>}
          {mini.stage === 'flushing' && <span className={styles.flushWhirl}>冲水中</span>}
        </div>
      )}
      {mini.kind === 'food' && (
        <div className={styles.foodGame}>
          <div className={styles.foodOrder}><strong>今晚的点心</strong><span>{mini.sequence.map(item => FOOD_ITEMS.find(food => food.id === item)?.label || item).join(' / ')}</span></div>
          <div className={styles.pastryTray} aria-label="选择食材">{FOOD_ITEMS.slice(0, mini.sequence.length).map((food, index) => (
            <button key={food.id} type="button" data-food-pastry={index} data-selected={selectedFood === index} aria-pressed={selectedFood === index} onClick={() => setSelectedFood(index)}>
              <i data-food={food.id} /><span>{food.label}</span>
            </button>
          ))}</div>
          <div className={styles.plateRow} aria-label="点心盘位">{mini.foodPlaced.map((placed, index) => (
            <button
key={index}
type="button"
data-food-slot={index}
data-filled={placed >= 0}
disabled={placed >= 0 || selectedFood === null}
              aria-label={`第 ${index + 1} 个盘位${placed >= 0 ? `，${FOOD_ITEMS[placed]?.label || '已装盘'}` : '，待装盘'}`}
              onClick={() => { if (selectedFood !== null) { commit(placeFoodPrep(stateRef.current, selectedFood, index)); setSelectedFood(null); } }}>
              <i>{placed >= 0 ? FOOD_ITEMS[placed]?.label : `0${index + 1}`}</i>
            </button>
          ))}</div>
        </div>
      )}
      {mini.kind === 'cat' && (
        <div className={styles.catGame}>
          <div className={styles.catBowl}><span>{Array.from({ length: Math.max(0, mini.hits) }, (_, index) => <i key={index} />)}</span></div>
          <div className={styles.pourMeter}><span>本勺份量</span><div className={styles.pourTrack}><i className={styles.pourFill} style={{ width: `${mini.fillLevel * 100}%` }} /><i className={styles.pourTarget} style={{ left: `${mini.targetX * 100}%` }} /></div><b>{Math.round(mini.fillLevel * 100)}%</b></div>
          <div className={styles.catScoops}>已倒好 {mini.hits} / {state.level === 1 ? 2 : 3} 勺</div>
        </div>
      )}
      {mini.kind === 'audio' && (
        <div className={styles.audioGame}><div className={styles.patchHeader}><strong>声卡调音台</strong><span>CHANNEL / LEVEL</span></div>
          {AUDIO_CHANNELS.map((channel, index) => (
            <div className={styles.audioChannel} key={channel}><label htmlFor={`audio-channel-${index}`}>{channel}</label>
              <div className={styles.audioSlider}><input id={`audio-channel-${index}`} data-audio-channel={index} type="range" min="0" max="1" step="0.01" value={mini.audioLevels[index] ?? 0.5} onChange={event => commit(setAudioChannelPrep(stateRef.current, index, Number(event.target.value)))} aria-label={`${channel}电平`} /><i style={{ left: `${(mini.audioTargets[index] ?? 0.5) * 100}%` }} /></div>
              <span>{Math.round((mini.audioLevels[index] ?? 0) * 100)}</span>
            </div>
          ))}
          <div className={styles.audioStatus}>{mini.stage === 'testing' ? '正在监听三路声音…' : '绿色刻度为目标电平'}</div>
        </div>
      )}
      {mini.kind === 'vts' && (
        <div className={styles.vtsGame}><div className={styles.vtsPreview}><span className={styles.vtsPortrait}><i /><i /><b /></span><small>VTS / FACE CAPTURE</small></div>
          <div className={styles.vtsPrompt}>当前采集：<strong>{POSE_ITEMS.find(pose => pose.id === mini.sequence[mini.poseIndex])?.label || '完成'}</strong></div>
          <div className={styles.poseChoices}>{POSE_ITEMS.map((pose, index) => (
            <button type="button" key={pose.id} data-vts-pose={index} data-current={mini.sequence[mini.poseIndex] === pose.id} onClick={() => commit(capturePosePrep(stateRef.current, index))}>
              <i data-pose={pose.id} /><span>{pose.label}</span>
            </button>
          ))}</div>
          <div className={styles.poseSteps}>{mini.sequence.map((pose, index) => <i key={`${pose}-${index}`} data-done={index < mini.poseIndex} data-current={index === mini.poseIndex}>{index < mini.poseIndex ? '✓' : index + 1}</i>)}</div>
        </div>
      )}
      {mini.kind === 'spill' && (
        <div
data-spill-area
className={styles.spillArea}
          onPointerDown={event => { if (event.target instanceof HTMLButtonElement) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); wipePoint(event); }}
          onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) wipePoint(event); }}>
          <span className={styles.deskPaper} />
          {mini.stains.map((stain, index) => (
<button
type="button"
key={index}
data-spill-stain={index}
data-clean={stain.clean >= 3}
            style={{ left: `${stain.x * 100}%`, top: `${stain.y * 100}%` }}
aria-label={`水渍 ${index + 1}，已擦 ${Math.min(3, stain.clean)} 次`}
            onClick={() => { commit(wipeSpillPrep(stateRef.current, stain.x - 0.06, stain.y), false); commit(wipeSpillPrep(stateRef.current, stain.x + 0.06, stain.y), false); }} />
))}
          <span className={styles.spillSweeps}>抹布往返 {mini.sweeps} 次</span>
        </div>
      )}
      {mini.kind === 'catwalk' && (
        <div className={styles.catwalkGame}><div className={styles.keyboardBoard} /><span className={styles.catwalkCat} style={{ left: `${mini.targetX * 100}%` }} /><span className={styles.catwalkEdge}>桌边</span>
          <div className={styles.catwalkTrack}><i /><b style={{ left: `${mini.targetX * 100}%` }} /></div>
          <span className={styles.catToy}>成功引走 {mini.hits} / 3 次</span>
        </div>
      )}
      {mini.kind === 'cable' && (
        <div className={styles.cableGame}><div className={styles.patchHeader}><strong>线路接线板</strong><span>POWER / SIGNAL</span></div>
          <div className={styles.cableColumns}><div><span>插头</span>{['电源', 'USB', '麦克风'].map((label, index) => <button key={label} type="button" data-cable-plug={index} data-selected={selectedPlug === index} data-connected={mini.cablePairs[index] >= 0} disabled={mini.cablePairs[index] >= 0} aria-pressed={selectedPlug === index} onClick={() => setSelectedPlug(index)}><i />{label}</button>)}</div>
            <div><span>接口</span>{['麦克风', '电源', 'USB'].map((label, index) => <button key={label} type="button" data-cable-socket={index} data-connected={mini.cablePairs.includes(index)} disabled={mini.cablePairs.includes(index) || selectedPlug === null} onClick={() => { if (selectedPlug !== null) { commit(connectCablePrep(stateRef.current, selectedPlug, index)); setSelectedPlug(null); } }}><i />{label}</button>)}</div></div>
        </div>
      )}
      {mini.kind === 'obs' && (
        <div className={styles.obsGame}><div className={styles.obsPreview}><strong>直播预览</strong><span>{mini.obsEnabled[0] ? '画面在线' : '等待摄像头'}</span><i data-on={mini.obsEnabled[1]} /></div>
          <div className={styles.obsSources}>{OBS_SOURCES.map((label, index) => <button key={label} type="button" data-obs-source={index} aria-pressed={mini.obsEnabled[index]} disabled={mini.stage === 'confirm'} onClick={() => commit(toggleObsSourcePrep(stateRef.current, index))}><span>{label}</span><i data-on={mini.obsEnabled[index]} /></button>)}</div>
        </div>
      )}
      <div className={styles.miniProgress}><span>{mini.kind === 'toilet' && mini.stage === 'flush-ready' ? '瞄准完成，最后一步' : mini.kind === 'catwalk' && mini.stage === 'confirm' ? '猫咪已离开，抱走它' : '完成进度'}</span><strong>{mini.kind === 'food' ? `${mini.hits}/${mini.foodPlaced.length}` : mini.kind === 'cat' ? `${mini.hits}/${state.level === 1 ? 2 : 3} 勺` : mini.kind === 'vts' ? `${mini.poseIndex}/3` : mini.kind === 'cable' ? `${mini.cablePairs.filter(pair => pair >= 0).length}/3` : `${Math.round(percent)}%`}</strong></div>
      <div className={styles.progressTrack}><i style={{ width: `${percent}%` }} /></div>
      {(['toilet', 'cat', 'audio', 'catwalk', 'obs'].includes(mini.kind) || (mini.kind === 'cable' && mini.stage === 'confirm')) && (
        <button
type="button"
className={styles.miniAction}
data-minigame-action
          data-cat-pour={mini.kind === 'cat' ? '' : undefined}
data-catwalk-action={mini.kind === 'catwalk' ? '' : undefined}
          data-flush={mini.kind === 'toilet' && mini.stage === 'flush-ready' ? '' : undefined}
data-held={held}
          disabled={mini.stage === 'flushing' || mini.stage === 'testing'}
          onPointerDown={actionDown}
onPointerUp={actionUp}
onPointerCancel={actionUp}
onLostPointerCapture={actionUp}
          onKeyDown={event => { if (holdMode && (event.code === 'Space' || event.code === 'Enter')) { event.preventDefault(); primaryRef.current = true; setHeld(true); } }}
          onKeyUp={event => { if (event.code === 'Space' || event.code === 'Enter') actionUp(); }}
          onClick={event => { if (event.detail === 0 && !holdMode) act(); }}>
          {minigameAction(state)}
        </button>
      )}
    </section>
)}

    {state.phase === 'countdown' && <div className={styles.centerVeil}><span>直播间连接中</span><strong>{Math.max(1, Math.ceil(state.countdownMs / 1000))}</strong><p>“来了来了，饼干岁！”</p></div>}

    {state.paused && gameActive && !help && <div className={styles.centerVeil}><span>时间暂停</span><h2>等一下，马上回来。</h2><button id="resume-game" type="button" className={styles.mainButton} onClick={pause}><CaretRightOutlined /> 继续准备</button><button type="button" className={styles.underButton} onClick={() => setConfirmRestart(true)}><ReloadOutlined /> 重开本晚</button></div>}

    {state.phase === 'result' && (
<section className={styles.resultScreen} aria-label="本晚成绩">
      <span className={styles.kicker}>LIVE IS ON · {currentNight.title}</span>
      <h2>真的开播了！</h2>
      <p>从“马上”到“开播”，用了</p>
      <strong className={styles.resultTime}>{formatPrepTime(state.elapsedMs)}</strong>
      <Stars count={getPrepStars(state)} />
      <div className={styles.resultMeta}><span>{state.completed.length} 项准备</span><span>{state.incidents.resolved.length} 场意外</span><span>最佳 {formatPrepTime(records.best[state.level]?.elapsedMs || state.elapsedMs)}</span></div>
      <div className={styles.resultActions}><button type="button" onClick={() => selectNight(state.level)}>选择夜晚</button><button type="button" onClick={() => selectNight(state.level, true)}>再跑一遍</button>{state.level < 3 && <button type="button" className={styles.mainButton} onClick={() => selectNight(state.level + 1, true)}>下一晚 <CaretRightOutlined /></button>}</div>
      {state.level === 3 && <div className={styles.campaignRecords}>{NIGHTS.map(night => <span key={night.id}>{night.title} <Stars count={records.best[night.id]?.stars || 0} /></span>)}</div>}
    </section>
)}

    {help && <div className={styles.modalShade}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="help-title"><button type="button" className={styles.closeModal} onClick={() => setHelp(false)} title="关闭" aria-label="关闭"><CloseOutlined /></button><span className={styles.kicker}>HOW TO PLAY</span><h2 id="help-title">开播前，先把日常搞定。</h2><p>走到物品旁按 E 交互；也可以点击场景或下方地点自动跑过去。WASD / 方向键移动，手机使用摇杆。</p><p>把保温杯放在饮水机接水时，时间仍在走，先去忙别的。小游戏按画面里的操作完成，最后在电脑前正式上播。</p><p>Space 操作，P 暂停，F 全屏。切到后台自动停表，刷新可从暂停处继续。</p><button type="button" className={styles.mainButton} onClick={() => setHelp(false)}>知道了</button></section></div>}
    {confirmRestart && <div className={styles.modalShade}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="restart-title"><h2 id="restart-title">重开这一晚？</h2><p>当前准备进度将重置，已有最好纪录会保留。</p><div className={styles.dialogActions}><button type="button" onClick={() => setConfirmRestart(false)}>继续这晚</button><button type="button" className={styles.mainButton} onClick={() => selectNight(state.level, true)}>重新开始</button></div></section></div>}
    {!storageOk && <p className={styles.storageNotice}>当前浏览器无法保存进度</p>}
  </main>
);
}
