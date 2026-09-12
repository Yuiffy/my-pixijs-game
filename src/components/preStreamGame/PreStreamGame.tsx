'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LEVELS, TASK_INFO, createGame, emptyInput, formatTime, getActivityView,
  getStars, goLive, pressControl, releaseControl, selectTask, setPointer,
  startGame, stepGame, togglePause, validateGame,
} from './engine';
import { drawScene, STATIONS } from './scene';
import { TASK_IDS, type ControlKey, type GameState, type Records } from './types';
import styles from './preStream.module.css';

const SAVE_KEY = 'sui-pre-stream-run-v1';
const RECORD_KEY = 'sui-pre-stream-records-v1';
const SYMBOLS: Record<ControlKey, string> = { primary: '●', left: '←', right: '→', up: '↑', down: '↓' };
const DIRECTIONS: ControlKey[] = ['left', 'up', 'down', 'right'];
const LABELS = { water: '接水喝水', toilet: '上厕所', food: '备点心', cat: '喂猫', audio: '声卡', vts: 'VTS', obs: 'OBS' };
const freshRecords = (): Records => ({ version: 1, best: {}, unlocked: 1 });
function readRecords(raw: string | null): Records {
  try {
    const data = JSON.parse(raw || 'null');
    const result = freshRecords();
    if (data?.version !== 1 || !data.best || typeof data.best !== 'object') return result;
    LEVELS.forEach(level => {
      const entry = data.best[level.id];
      if (entry && Number.isFinite(entry.elapsedMs) && entry.elapsedMs >= 3000 &&
        Number.isInteger(entry.stars) && entry.stars >= 1 && entry.stars <= 3) {
        result.best[level.id] = { elapsedMs: entry.elapsedMs, stars: entry.stars };
      }
    });
    result.unlocked = result.best['1'] ? (result.best['2'] ? 3 : 2) : 1;
    return result;
  } catch { return freshRecords(); }
}

function Stars({ count }: { count: number }) {
  return <span className={styles.stars} aria-label={`${count} 星`}>{[1, 2, 3].map(n => <span key={n} data-lit={n <= count}>★</span>)}</span>;
}

export default function PreStreamGame() {
  const [state, setState] = useState<GameState>(() => createGame(1, 20260912));
  const [records, setRecords] = useState<Records>(freshRecords);
  const [ready, setReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [help, setHelp] = useState(false);
  const [restart, setRestart] = useState(false);
  const [sound, setSound] = useState(false);
  const [held, setHeld] = useState(false);
  const stateRef = useRef(state);
  const recordsRef = useRef(records);
  const inputRef = useRef(emptyInput());
  const canvasHoldRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const manualRef = useRef(false);
  const initialized = useRef(false);
  const saveAtRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(sound);

  const clearInput = useCallback(() => {
    inputRef.current = emptyInput();
    canvasHoldRef.current = null;
    setHeld(false);
  }, []);

  const persist = useCallback((current: GameState, force = false) => {
    if (!initialized.current) return;
    const now = performance.now();
    if (!force && now - saveAtRef.current < 750) return;
    saveAtRef.current = now;
    try {
      if (current.phase === 'title') localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(current));
      localStorage.setItem(RECORD_KEY, JSON.stringify(recordsRef.current));
    } catch { setStorageOk(false); }
  }, []);

  const chime = useCallback(() => {
    if (!soundRef.current) return;
    try {
      const ctx = audioRef.current || new AudioContext();
      audioRef.current = ctx;
      ctx.resume().catch(() => {});
      [660, 880].forEach((frequency, i) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.045, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.18);
        oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.start(ctx.currentTime + i * 0.1);
        oscillator.stop(ctx.currentTime + i * 0.1 + 0.2);
      });
    } catch { /* Audio support is optional. */ }
  }, []);

  const commit = useCallback((next: GameState) => {
    const previous = stateRef.current;
    if (next === previous) return;
    if (next.activity?.id !== previous.activity?.id || next.paused || next.phase !== previous.phase) clearInput();
    if (next.completed.length > previous.completed.length || (previous.activity && !next.activity)) chime();
    if (next.phase === 'result' && previous.phase !== 'result') {
      const old = recordsRef.current;
      const best = old.best[next.level];
      const updated: Records = {
        version: 1,
        best: { ...old.best,
[next.level]: !best || next.elapsedMs < best.elapsedMs
          ? { elapsedMs: next.elapsedMs, stars: getStars(next) } : best },
        unlocked: Math.max(old.unlocked, Math.min(3, next.level + 1)),
      };
      recordsRef.current = updated; setRecords(updated);
    }
    stateRef.current = next;
    setState(next);
    persist(next, next.phase !== previous.phase || next.paused !== previous.paused || next.activity?.stage !== previous.activity?.stage);
  }, [chime, clearInput, persist]);

  const newRun = useCallback((level: number, begin = true) => {
    clearInput(); setRestart(false); setHelp(false);
    const seed = (Date.now() + Math.floor(Math.random() * 4294967296)) % 4294967296;
    const fresh = createGame(level, seed);
    commit(begin ? startGame(fresh) : fresh);
  }, [clearInput, commit]);

  const down = useCallback((key: ControlKey) => {
    if (inputRef.current[key] || stateRef.current.paused) return;
    inputRef.current[key] = true;
    if (key === 'primary') setHeld(true);
    commit(pressControl(stateRef.current, key));
  }, [commit]);

  const up = useCallback((key: ControlKey) => {
    if (!inputRef.current[key]) return;
    inputRef.current[key] = false;
    if (key === 'primary') setHeld(false);
    commit(releaseControl(stateRef.current, key));
  }, [commit]);

  const pause = useCallback(() => {
    clearInput(); commit(togglePause(stateRef.current));
  }, [clearInput, commit]);

  const fullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen?.();
    } catch { /* Browser fullscreen may be unavailable, the responsive view still works. */ }
  }, []);

  useEffect(() => {
    if (restart) dialogRef.current?.querySelector('button')?.focus();
  }, [restart]);

  useEffect(() => {
    try {
      const record = readRecords(localStorage.getItem(RECORD_KEY));
      recordsRef.current = record; setRecords(record);
      const saved = localStorage.getItem(SAVE_KEY);
      let restored: GameState | null = null;
      try { restored = saved ? validateGame(JSON.parse(saved)) : null; } catch { /* An invalid checkpoint starts a fresh night. */ }
      if (restored && restored.level <= record.unlocked) {
        const next = { ...restored, paused: restored.phase !== 'title' && restored.phase !== 'result' };
        stateRef.current = next; setState(next);
      } else if (saved) localStorage.removeItem(SAVE_KEY);
    } catch { setStorageOk(false); }
    initialized.current = true; setReady(true);
    return () => { persist(stateRef.current, true); initialized.current = false; };
  }, [persist]);

  useEffect(() => {
    const keyMap: Record<string, ControlKey> = {
      Space: 'primary',
ArrowLeft: 'left',
KeyA: 'left',
ArrowRight: 'right',
KeyD: 'right',
      ArrowUp: 'up',
KeyW: 'up',
ArrowDown: 'down',
KeyS: 'down',
    };
    const keydown = (event: KeyboardEvent) => {
      if (restart) {
        if (event.code === 'Escape') { event.preventDefault(); setRestart(false); } else if (event.code === 'Tab') {
          const buttons = dialogRef.current?.querySelectorAll('button');
          if (buttons?.length) {
            const first = buttons[0]; const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if (event.code === 'KeyF') { event.preventDefault(); if (!event.repeat) fullscreen(); return; }
      if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); if (!event.repeat) pause(); return; }
      if (stateRef.current.phase !== 'activity' || stateRef.current.paused) return;
      if (event.target instanceof HTMLElement) {
        const focusedControl = event.target.closest('button, a');
        if (focusedControl && !focusedControl.hasAttribute('data-control')) return;
      }
      const key = keyMap[event.code];
      if (key) { event.preventDefault(); if (!event.repeat) down(key); }
    };
    const keyup = (event: KeyboardEvent) => { if (keyMap[event.code]) { up(keyMap[event.code]); } };
    const freeze = () => {
      clearInput();
      const { current } = stateRef;
      if (!current.paused && ['room', 'activity', 'countdown'].includes(current.phase)) commit(togglePause(current));
      persist(stateRef.current, true);
    };
    const visibility = () => { if (document.hidden) freeze(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    window.addEventListener('blur', freeze); window.addEventListener('pagehide', freeze);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', freeze); window.removeEventListener('pagehide', freeze);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [clearInput, commit, down, fullscreen, pause, persist, restart, up]);

  useEffect(() => {
    const api = window as typeof window & { render_game_to_text?: () => string; advanceTime?: (ms: number) => void };
    const render = () => {
      const canvas = canvasRef.current; const ctx = canvas?.getContext('2d');
      if (ctx) drawScene(ctx, stateRef.current, stateRef.current.elapsedMs);
    };
    const tick = (ms: number) => {
      let remaining = Math.min(300000, Math.max(0, Number.isFinite(ms) ? ms : 0));
      let next = stateRef.current;
      while (remaining > 0) {
        const delta = Math.min(16, remaining);
        const before = next;
        next = stepGame(next, delta, inputRef.current);
        if (before.activity?.id !== next.activity?.id || before.phase !== next.phase) clearInput();
        remaining -= delta;
      }
      commit(next); render();
    };
    const textState = () => JSON.stringify({ ...stateRef.current,
      game: 'pre-stream',
coordinateSystem: '960x540 canvas; origin top-left; aim x180..780 maps to0..100',
      view: getActivityView(stateRef.current),
stars: getStars(stateRef.current),
      records: recordsRef.current,
formattedTime: formatTime(stateRef.current.elapsedMs),
    });
    api.render_game_to_text = textState;
    const advance = (ms: number) => { manualRef.current = true; tick(ms); };
    api.advanceTime = advance;
    let last = performance.now(); let frame = 0;
    const loop = (now: number) => {
      const delta = Math.max(0, now - last); last = now;
      if (!manualRef.current && initialized.current) tick(delta); else render();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      if (api.render_game_to_text === textState) delete api.render_game_to_text;
      if (api.advanceTime === advance) delete api.advanceTime;
    };
  }, [clearInput, commit]);

  const level = LEVELS.find(item => item.id === state.level) || LEVELS[0];
  const view = getActivityView(state);
  const active = state.phase !== 'title' && state.phase !== 'result';
  const { activity } = state;
  const sequenceMode = view?.mode === 'sequence' && activity && activity.stage < activity.sequence.length;
  const completed = state.completed.map(item => item.id);
  const incident = activity && !TASK_IDS.includes(activity.id as typeof TASK_IDS[number]);
  const controlsDisabled = state.paused || !active;
  const aim = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!view || !['track', 'dial'].includes(view.mode) || stateRef.current.paused) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    commit(setPointer(stateRef.current, (((event.clientX - bounds.left) / bounds.width) * 960 - 180) / 6));
  };
  const canvasDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!view || !['track', 'dial'].includes(view.mode) || controlsDisabled) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    aim(event);
    if (!inputRef.current.primary) { canvasHoldRef.current = event.pointerId; down('primary'); }
  };
  const canvasUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (canvasHoldRef.current === event.pointerId) { canvasHoldRef.current = null; up('primary'); }
  };

  const controlProps = (key: ControlKey) => ({
    'data-control': key,
    disabled: controlsDisabled,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); down(key);
    },
    onPointerUp: () => up(key),
    onPointerCancel: () => up(key),
    onLostPointerCapture: () => up(key),
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => { if (event.detail === 0) { down(key); up(key); } },
  });

  return (
<main ref={rootRef} className={styles.page}>
    <div className={styles.container}>
      <nav className={styles.topbar} aria-label="游戏导航">
        <Link href="/demos">← 实验室</Link>
        <span>一场开播前的小小冒险</span>
        <div>
          <button onClick={() => { setHelp(value => !value); if (active && !state.paused) pause(); }}>玩法</button>
          <button aria-pressed={sound} onClick={() => { soundRef.current = !sound; setSound(!sound); if (!sound) chime(); }}>音效{sound ? '开' : '关'}</button>
          <button onClick={() => fullscreen()} title="F 全屏">全屏</button>
        </div>
      </nav>

      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>SUI · BEFORE THE LIVE</p><h1><span>岁己：</span>马上就播<span className={styles.titleDot}>。</span></h1>
          <p className={styles.subtitle}>{state.phase === 'title' ? '“就五分钟！我真的马上来。”' : `${level.title} · ${level.subtitle}`}</p></div>
        <div className={styles.clock}>
          <span><i data-live={state.phase === 'result'} />{state.phase === 'result' ? '正式上播！' : state.phase === 'title' ? '待机画面准备中' : state.paused ? '暂停 · 时间已冻结' : '观众正在等岁己'}</span>
          <strong aria-label={`开播用时 ${formatTime(state.elapsedMs)}`}>{String(Math.floor(state.elapsedMs / 60000)).padStart(2, '0')}<b>:</b>{String(Math.floor(state.elapsedMs / 1000) % 60).padStart(2, '0')}</strong>
          {active && <button id="pause-game" onClick={pause}>{state.paused ? '继续 ▶' : '暂停 Ⅱ'}</button>}
        </div>
      </header>

      {help && (
<section className={styles.help} aria-label="玩法说明">
        <div><strong>七件小事，一场直播。</strong><button onClick={() => setHelp(false)}>收起说明 ×</button></div>
        <p>开始待机后计时。点房间里的家具，或下方清单，自由安排准备顺序；七项全好后点“正式上播”。三晚越来越忙，每晚的星星只看用时，超过两星时间仍能一星完成。</p>
        <p>空格 / 大按钮执行动作，方向键 / WASD 调方向；喂猫与校准可在画面上移动指针，手机可拖下方滑杆。F 全屏，P / Esc 暂停。切到后台会暂停，刷新后可续玩。</p>
        <p>接水要在绿区松开；切菜要等游标进绿区再按；喂猫和 VTS 要按住并持续对准。失误损失当前进度，不额外添加虚构秒数。</p>
      </section>
)}

      <div className={styles.sceneShell} data-phase={state.phase}>
        <canvas
ref={canvasRef}
width={960}
height={540}
onPointerMove={aim}
          onPointerDown={canvasDown}
          onPointerUp={canvasUp}
          onPointerCancel={canvasUp}
          onLostPointerCapture={canvasUp}
          aria-label={activity ? `${view?.title}动作场景` : '岁己的房间：厨房、洗手间、猫碗和直播电脑'} />
        {(state.phase === 'title' || state.phase === 'room') && (
<div className={styles.stations}>
          {STATIONS.map((station, index) => (
<button
key={station.id}
data-station={station.id}
            className={styles.station}
style={{ left: `${station.x / 9.6}%`, top: `${station.y / 5.4}%` }}
            disabled={state.phase !== 'room' || state.paused || completed.includes(station.id)}
data-done={completed.includes(station.id)}
            aria-label={`${TASK_INFO[station.id].title}${completed.includes(station.id) ? '已完成' : ''}`}
            onClick={() => commit(selectTask(stateRef.current, station.id))}>
            <b>{completed.includes(station.id) ? '✓' : index + 1}</b><span>{station.label}</span>
          </button>
))}
        </div>
)}
        {incident && <div className={styles.incidentFlag}>！临时加戏</div>}
        {state.notice && state.noticeMs > 0 && <div className={styles.notice} role="status">{state.notice}</div>}
        {state.phase === 'countdown' && <div className={styles.countdown}><span>准备就绪，接入直播间</span><strong>{Math.max(1, Math.ceil(state.countdownMs / 1000))}</strong><p>饼干岁，我来啦！</p></div>}
        {state.paused && active && <div className={styles.pauseVeil}><span>离开一下，也没关系。</span><h2>时间停在这里</h2><button id="resume-game" className={styles.primary} onClick={() => { setHelp(false); pause(); }}>继续准备 ▶</button><button className={styles.textButton} onClick={() => setRestart(true)}>重开本晚</button></div>}
      </div>

      {state.phase === 'title' && (
<section className={styles.titlePanel}>
        <div className={styles.nights} aria-label="选择关卡">{LEVELS.map(item => (
<button
key={item.id}
data-level={item.id}
          disabled={item.id > records.unlocked || !ready}
aria-pressed={state.level === item.id}
          onClick={() => commit(createGame(item.id, state.seed))}>
          <small>NIGHT 0{item.id}</small><strong>{item.title}{item.id > records.unlocked ? ' · 待解锁' : ''}</strong>
          <span>{records.best[item.id] ? <><Stars count={records.best[item.id].stars} /> {formatTime(records.best[item.id].elapsedMs)}</> : item.subtitle}</span>
        </button>
))}</div>
        <div className={styles.startRow}><p>接杯水，喂饱猫，把自己和直播间一起准备好。<small>三星 ≤ {formatTime(level.threeStarMs)} · 两星 ≤ {formatTime(level.twoStarMs)}</small></p>
          <button id="start-game" className={styles.primary} disabled={!ready} onClick={() => commit(startGame(stateRef.current))}>{ready ? '开始待机 →' : '房间准备中…'}</button></div>
      </section>
)}

      {state.phase === 'room' && (
<section className={styles.roomPanel}>
        <div className={styles.sectionLine}><div><strong>{completed.length === 7 ? '万事俱备，只欠上播。' : '先从哪件小事开始？'}</strong><span>{completed.length} / 7 准备完成</span></div><small>三星 ≤ {formatTime(level.threeStarMs)} · 两星 ≤ {formatTime(level.twoStarMs)}</small></div>
        <div className={styles.taskList}>{TASK_IDS.map((id, index) => (
<button
key={id}
data-task={id}
          disabled={state.paused || completed.includes(id)}
data-done={completed.includes(id)}
          onClick={() => commit(selectTask(stateRef.current, id))}><span>{completed.includes(id) ? '✓' : `0${index + 1}`}</span>{LABELS[id]}</button>
))}</div>
        {completed.length === 7 && <button id="go-live" className={styles.primary} disabled={state.paused} onClick={() => commit(goLive(stateRef.current))}>正式上播 →</button>}
      </section>
)}

      {state.phase === 'activity' && activity && view && (
<section className={styles.activityPanel}>
        <div className={styles.activityCopy}><p className={styles.eyebrow}>{incident ? 'A LITTLE SURPRISE' : `准备事项 ${completed.length + 1} / 7`}</p><h2>{view.title}</h2><p>{view.instruction}</p><small>{view.mode === 'track' || view.mode === 'dial' ? '鼠标 / 单指按住画面拖动也能操作 · ' : ''}{view.hint}</small></div>
        <div className={styles.actionArea}>
          <div className={styles.progressText}><span>{view.progressLabel}</span><b>{Math.round(view.progress)}%</b></div>
          <div className={styles.progressTrack}><i style={{ width: `${Math.max(0, Math.min(100, view.progress))}%` }} /></div>
          {(view.mode === 'track' || view.mode === 'dial') && (
<label className={styles.aimLabel} htmlFor="aim-control">{view.mode === 'dial' ? '调节旋钮' : '移动准星'}<input
id="aim-control"
type="range"
min="0"
max="100"
step="0.1"
value={activity.cursor}
disabled={controlsDisabled}
            onChange={event => commit(setPointer(stateRef.current, Number(event.target.value)))} /></label>
)}
          {sequenceMode && <div className={styles.sequence} aria-label="按此顺序操作">{activity.sequence.map((key, index) => <span key={index} data-done={index < activity.stage} data-current={index === activity.stage}>{SYMBOLS[key]}</span>)}</div>}
          <div className={styles.controls}>
            {sequenceMode ? DIRECTIONS.map(key => <button key={key} {...controlProps(key)} aria-label={key} className={styles.arrowControl}>{SYMBOLS[key]}</button>) : (
<>
              {(view.mode === 'track' || view.mode === 'dial') && <button {...controlProps('left')} aria-label="left" className={styles.arrowControl}>←</button>}
              <button {...controlProps('primary')} className={`${styles.primary} ${styles.actionButton}`} data-held={held}>{view.actionLabel}<small>空格 / 触屏</small></button>
              {(view.mode === 'track' || view.mode === 'dial') && <button {...controlProps('right')} aria-label="right" className={styles.arrowControl}>→</button>}
            </>
)}
          </div>
        </div>
      </section>
)}

      {state.phase === 'result' && (
<section className={styles.resultPanel}>
        <div className={styles.resultHero}><div><p className={styles.eyebrow}>LIVE IS ON · 第 {state.level} 晚完成</p><h2>“来了来了，饼干岁！”</h2><p>这次“马上”用了 <strong>{formatTime(state.elapsedMs)}</strong></p></div><Stars count={getStars(state)} /></div>
        <div className={styles.resultTasks}>{state.completed.map(item => <div key={item.id}><span>{LABELS[item.id]}</span><Stars count={item.stars} /><small>{formatTime(item.elapsedMs)}</small></div>)}</div>
        <div className={styles.resultNotes}><p>处理了 {state.incidents.length} 场小意外 · 本晚最好 {formatTime(records.best[state.level]?.elapsedMs ?? state.elapsedMs)}</p><small>三星 ≤ {formatTime(level.threeStarMs)} · 两星 ≤ {formatTime(level.twoStarMs)}</small></div>
        {state.level === 3 && <div className={styles.campaign}><strong>三晚，全部准时到达自己的直播间。</strong><p>{LEVELS.map(item => <span key={item.id}>{item.title} <Stars count={records.best[item.id]?.stars || 0} /> {formatTime(records.best[item.id]?.elapsedMs || 0)}</span>)}</p></div>}
        <div className={styles.resultActions}><button id="choose-level" className={styles.secondary} onClick={() => newRun(state.level, false)}>选择夜晚</button><button id="replay-level" className={styles.secondary} onClick={() => newRun(state.level)}>再快一点</button>{state.level < 3 && <button id="next-level" className={styles.primary} onClick={() => newRun(state.level + 1)}>下一晚 →</button>}</div>
      </section>
)}

      <footer className={styles.footer}><span>岁己的开播前日常 · 同人虚构小游戏</span><span>{storageOk ? '进度与纪录保存在这台设备' : '浏览器暂时不能保存，仍可正常游玩'}</span></footer>
      {restart && <div className={styles.dialogShade}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="restart-title" className={styles.dialog}><h2 id="restart-title">重新准备这一晚？</h2><p>本晚的准备进度会重置，已获得的星星和最好纪录会保留。</p><button className={styles.secondary} onClick={() => setRestart(false)}>保留进度</button><button className={styles.primary} onClick={() => newRun(state.level)}>重新开始</button></section></div>}
    </div>
  </main>
);
}
