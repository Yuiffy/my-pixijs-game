'use client';

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { CHAPTERS, ENDINGS, OBJECT_NAMES, SAVE_KEY, choose, inspect, newGame, objective, ready, restoreSave, type GameState, type ObjectId } from './engine';
import styles from './remainingSeat.module.css';

const Scene = dynamic(() => import('./RemainingSeatScene'), { ssr: false, loading: () => <div className={styles.loading}>正在拧开楼道里的灯…</div> });

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    const { failed } = this.state;
    const { children } = this.props;
    if (failed) return <div className={styles.fallback}><h2>灯暂时没有亮起来</h2><p>3D 场景未能载入。请在启用硬件加速的 Chrome 或 Edge 中重新打开。</p><button type="button" onClick={() => window.location.reload()}>重新载入</button><Link href="/demos">返回游戏大厅</Link></div>;
    return children;
  }
}

function Modal({ title, children, onClose, paper = false }: { title: string; children: ReactNode; onClose: () => void; paper?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLElement>('button, a, input, [tabindex="0"]') || []);
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);
  return <div className={styles.modalShade}><section ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`${styles.modal} ${paper ? styles.paper : ''}`}><button type="button" className={styles.close} aria-label="合上" onClick={onClose}>×</button>{children}</section></div>;
}

function useRoomSound(active: boolean, chapter: number) {
  const [enabled, setEnabled] = useState(false);
  const sound = useRef<{ context: AudioContext; gain: GainNode; drone: OscillatorNode; noise: AudioBufferSourceNode } | null>(null);
  const toggle = () => {
    if (!sound.current) {
      try {
        const context = new AudioContext();
        const gain = context.createGain(); gain.gain.value = 0; gain.connect(context.destination);
        const drone = context.createOscillator(); drone.type = 'sine'; drone.frequency.value = 54;
        const droneGain = context.createGain(); droneGain.gain.value = 0.09; drone.connect(droneGain); droneGain.connect(gain); drone.start();
        const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
        const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true;
        const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650;
        noise.connect(filter); filter.connect(gain); noise.start();
        sound.current = { context, gain, drone, noise };
      } catch { return; }
    }
    sound.current.context.resume().catch(() => {});
    setEnabled(value => !value);
  };
  useEffect(() => {
    if (!sound.current) return;
    const { gain, context, drone } = sound.current;
    gain.gain.setTargetAtTime(enabled && active ? 0.65 : 0, context.currentTime, 0.2);
    drone.frequency.setTargetAtTime(54 - chapter * 4, context.currentTime, 1);
  }, [enabled, active, chapter]);
  useEffect(() => () => {
    sound.current?.drone.stop(); sound.current?.noise.stop(); sound.current?.context.close().catch(() => {}); sound.current = null;
  }, []);
  return { enabled, toggle };
}

type Panel = ObjectId | 'journal' | 'pause' | null;
type Phase = 'title' | 'playing' | 'ending';
const STILL = { forward: 0, strafe: 0, turn: 0 };

export default function RemainingSeatGame() {
  const [state, setState] = useState<GameState>(newGame);
  const [phase, setPhase] = useState<Phase>('title');
  const [saved, setSaved] = useState<GameState | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [qa, setQa] = useState(false);
  const [transition, setTransition] = useState(false);
  const [movement, setMovement] = useState(STILL);
  const [saveAvailable, setSaveAvailable] = useState(true);
  const pose = useRef({ x: 0, z: 5.6, yaw: 0 });
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();
  const paused = phase !== 'playing' || panel !== null || transition;
  const sound = useRoomSound(!paused, state.chapter);

  useEffect(() => {
    try { setSaved(restoreSave(localStorage.getItem(SAVE_KEY))); } catch { setSaveAvailable(false); }
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setQa(process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).get('qa') === '1');
    return () => clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    if (phase === 'title') return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); setSaved(state); } catch { setSaveAvailable(false); }
  }, [state, phase]);

  useEffect(() => {
    if (paused) { setMovement(STILL); if (document.pointerLockElement) document.exitPointerLock(); }
  }, [paused]);

  const openObject = useCallback((id: string) => {
    if (phase !== 'playing' || panel || transition || !(id in OBJECT_NAMES)) return;
    setPanel(id as ObjectId);
  }, [phase, panel, transition]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || phase !== 'playing') return;
      if (event.key === 'Escape') { event.preventDefault(); setPanel(current => (current ? null : 'pause')); }
      if (event.code === 'KeyJ' && (!panel || panel === 'journal')) { event.preventDefault(); setPanel(current => (current ? null : 'journal')); }
    };
    const hidden = () => { if (document.hidden && phase === 'playing') setPanel(current => current || 'pause'); };
    window.addEventListener('keydown', key); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', hidden); };
  }, [phase, panel]);

  useEffect(() => {
    const target = window as unknown as { render_game_to_text?: () => string };
    const render = () => JSON.stringify({ game: 'remaining-seat',
phase,
chapter: state.chapter,
      chapterName: CHAPTERS[state.chapter].name,
interacted: state.interacted,
memories: state.memories.length,
      objective: objective(state),
ready: ready(state),
focus,
modal: panel,
ending: state.ending,
      pose: pose.current,
paused,
reducedMotion,
saveAvailable,
      coordinates: 'metres, x right, y up, -z forward; room x [-5,5], z [-7,7]',
    });
    target.render_game_to_text = render;
    return () => { if (target.render_game_to_text === render) delete target.render_game_to_text; };
  }, [phase, state, focus, panel, paused, reducedMotion, saveAvailable]);

  function start(resume = false) {
    const next = resume && saved ? saved : newGame();
    setState(next); setPhase(next.ending ? 'ending' : 'playing'); setPanel(null); setFocus(null);
    setTransition(false); clearTimeout(transitionTimer.current);
  }

  function select(id: string) {
    if (!panel || panel === 'journal' || panel === 'pause') return;
    const next = choose(state, panel, id);
    setState(next); setPanel(null);
    if (next.chapter !== state.chapter) {
      setFocus(null); setTransition(true);
      clearTimeout(transitionTimer.current);
      transitionTimer.current = setTimeout(() => setTransition(false), reducedMotion ? 150 : 1400);
    }
    if (next.ending) { setPhase('ending'); setFocus(null); }
  }

  const page = panel && panel !== 'journal' && panel !== 'pause' ? inspect(state, panel) : null;
  const ending = state.ending ? ENDINGS[state.ending] : null;
  const touchMove = (key: keyof typeof STILL, value: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.currentTarget.setPointerCapture(event.pointerId); setMovement(current => ({ ...current, [key]: value })); },
    onPointerUp: () => setMovement(current => ({ ...current, [key]: 0 })),
    onPointerCancel: () => setMovement(STILL),
    onLostPointerCapture: () => setMovement(current => ({ ...current, [key]: 0 })),
  });

  return (
<main className={`${styles.game} ${reducedMotion ? styles.reduced : ''}`}>
    <div className={styles.world}><SceneBoundary><Scene chapter={state.chapter} phase={phase} paused={paused} reducedMotion={reducedMotion} interacted={state.interacted} onFocus={setFocus} onInteract={openObject} onPose={value => { pose.current = value; }} movement={movement} qa={qa} /></SceneBoundary></div>
    <div className={styles.grain} aria-hidden="true" /><div className={styles.vignette} aria-hidden="true" />

    {phase === 'title' && (
<div className={styles.titleScreen}>
      <Link href="/demos" className={styles.back}>← 游戏大厅</Link>
      <div className={styles.titleContent}><div className={styles.eyebrow}>一场没有散席的家宴</div><h1>余<span>席</span></h1><div className={styles.english}>THE REMAINING SEAT</div><div className={styles.rule} />
        <p className={styles.tagline}>门没有锁。<br />饭还温着。<br />他们给你，留了一个位置。</p>
        <div className={styles.titleActions}>{saved && <button id="remaining-continue" type="button" className={styles.primary} onClick={() => start(true)}>继续这一晚 <span>→</span></button>}
          <button id="remaining-start" type="button" className={saved ? styles.secondary : styles.primary} onClick={() => start()}>{saved ? '重新回家' : '推门回家'} <span>→</span></button></div>
        <p className={styles.caption}>第一人称心理恐怖短篇 · 三幕 · 可自由探索</p>
      </div>
      <div className={styles.titleFoot}><span>旧城 · 廿九 · 23:47</span><span>虚构故事 / 开发中原型 0.1</span></div>
      <div className={styles.titleSettings}><button type="button" onClick={sound.toggle} aria-pressed={sound.enabled}>{sound.enabled ? '环境声：开' : '环境声：关'}</button><button type="button" onClick={() => setReducedMotion(value => !value)} aria-pressed={reducedMotion}>{reducedMotion ? '镜头起伏：关' : '镜头起伏：开'}</button><p>含幽闭空间与家庭压力主题。可随时暂停。</p></div>
    </div>
)}

    {phase === 'playing' && (
<>
      <header className={styles.hud}><div><div className={styles.chapterLabel}>0{state.chapter + 1} <span>/ 03</span></div><h2>{CHAPTERS[state.chapter].name}</h2><p>{objective(state)}</p></div><nav aria-label="游戏工具"><button id="remaining-journal" type="button" onClick={() => setPanel('journal')}>手记 <kbd>J</kbd></button><button id="remaining-pause" type="button" onClick={() => setPanel('pause')}>暂停 <kbd>Esc</kbd></button></nav></header>
      {!paused && (
<><div className={`${styles.reticle} ${focus ? styles.focused : ''}`} aria-hidden="true" />
        <div className={styles.interaction}>{focus && focus in OBJECT_NAMES ? <button id="remaining-interact" type="button" onClick={() => openObject(focus)}><kbd>E</kbd><span>{OBJECT_NAMES[focus as ObjectId]}</span><small>查看</small></button> : <p>靠近物件，停下来看看。</p>}</div>
        <div className={styles.keyboardHint}>W A S D 移动 <i /> 点击画面后用鼠标环顾 <i /> 方向键也可转身</div>
        <div className={styles.touchControls} aria-label="触屏移动"><div className={styles.movePad}><button type="button" aria-label="向前走" {...touchMove('forward', 1)}>↑</button><div><button type="button" aria-label="向左移动" {...touchMove('strafe', -1)}>←</button><button type="button" aria-label="向后走" {...touchMove('forward', -1)}>↓</button><button type="button" aria-label="向右移动" {...touchMove('strafe', 1)}>→</button></div></div><div className={styles.turnPad}><button type="button" aria-label="向左看" {...touchMove('turn', 1)}>↶</button><button type="button" aria-label="向右看" {...touchMove('turn', -1)}>↷</button></div></div>
      </>
)}
      {transition && <div className={styles.transition}><span>0{state.chapter + 1}</span><h2>{CHAPTERS[state.chapter].name}</h2><p>{CHAPTERS[state.chapter].line}</p></div>}
    </>
)}

    {page && <Modal title={page.title} paper onClose={() => setPanel(null)}><div className={styles.eyebrow}>{page.eyebrow}</div><h2>{page.title}</h2><div className={styles.prose}>{page.text.map((line, index) => <p key={index}>{line}</p>)}</div><div className={styles.choices}>{page.choices.map(choice => <button key={choice.id} type="button" data-choice={choice.id} onClick={() => select(choice.id)}>{choice.label}<span>→</span></button>)}</div><span className={styles.pageNumber}>廿九 · {String(state.memories.length + 1).padStart(2, '0')}</span></Modal>}

    {panel === 'journal' && <Modal title="口袋里的手记" onClose={() => setPanel(null)}><div className={styles.eyebrow}>那些没有说出口的话</div><h2>口袋里的手记</h2><p className={styles.muted}>你记住的物件，都留在这里。</p><div className={styles.journal}>{state.memories.length ? state.memories.map(memory => <article key={`${memory.chapter}-${memory.object}`}><span>0{memory.chapter + 1} / {OBJECT_NAMES[memory.object]}</span><h3>{memory.title}</h3><p>{memory.text}</p></article>) : <p>还没有记下什么。先看看门边的信。</p>}</div><button type="button" className={styles.primary} onClick={() => setPanel(null)}>收起手记</button></Modal>}

    {panel === 'pause' && <Modal title="先喘口气" onClose={() => setPanel(null)}><div className={styles.eyebrow}>这一刻，不必回答</div><h2>先喘口气</h2><p className={styles.muted}>{saveAvailable ? '进度已保存在这台设备。' : '当前浏览器无法保存进度，本次游玩仍可继续。'}</p><div className={styles.pauseActions}><button id="remaining-resume" type="button" className={styles.primary} onClick={() => setPanel(null)}>回到屋里 <span>→</span></button><button type="button" onClick={sound.toggle} aria-pressed={sound.enabled}>{sound.enabled ? '关闭环境声' : '开启环境声'}</button><button type="button" onClick={() => setReducedMotion(value => !value)} aria-pressed={reducedMotion}>{reducedMotion ? '开启镜头起伏' : '关闭镜头起伏'}</button><button type="button" onClick={() => { setPhase('title'); setPanel(null); }}>回到标题</button></div><div className={styles.controlGuide}><p>W A S D 移动 · ← → 转身 · ↑ ↓ 抬头低头</p><p>点击画面锁定鼠标 · E 查看 · J 手记</p><p>Esc 松开鼠标 / 暂停 · 触屏拖动画面环顾，下方按钮移动</p><p>没有倒计时，也没有追逐。可以按自己的步调走。</p></div></Modal>}

    {phase === 'ending' && ending && <div className={styles.ending}><div className={styles.endingInner}><div className={styles.eyebrow}>终席 / {state.ending === 'air' ? '一线风' : '又一晚'}</div><h1>{ending.title}</h1><p className={styles.endingSubtitle}>{ending.subtitle}</p><div className={styles.prose}>{ending.text.map(line => <p key={line}>{line}</p>)}</div><div className={styles.endingActions}><button id="remaining-start" type="button" className={styles.primary} onClick={() => start()}>再回去一次 <span>→</span></button><Link href="/demos">离开旧宅</Link></div><p className={styles.caption}>《余席》三幕原型 · 感谢你在这里停了一会儿。</p></div></div>}
  </main>
);
}
