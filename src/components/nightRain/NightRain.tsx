'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { escapeStuck, continueExploring, clearHeldActions, createGame, enemyAttack, getObjective, loadGame, maxFlasks, healAmount, maxHp, maxStamina, respawn, saveGame, setPaused, startGame, stepGame, upgrade, upgradeCost } from './engine';
import { companionName, createCompanion, guideTargets, leadTo, mainTarget, recommendedTarget, speak, stopLeading, targetLabel, updateCompanion } from './companion';
import type { CameraControl, GameInput, GameState, PlayerSkin } from './types';
import { LANDMARKS, SURFACES, regionAt } from './world';
import { ActionControls } from './controls';
import { PLAYER_SKINS } from './CharacterStyle';
import styles from './nightRain.module.css';

const WorldView = dynamic(() => import('./WorldView'), { ssr: false });
const STORAGE = 'night-rain-v1';
type Panel = 'pause' | 'map' | 'companion' | null;
type GameWindow = Window & { render_game_to_text?: () => string; advanceTime?: (ms: number) => void; nightRain?: {
  getState: () => GameState; input: (action: GameInput) => void; resetCamera: () => void; save: () => void;
} };
class SceneBoundary extends React.Component<{ children: React.ReactNode; onError: () => void }, { failed: boolean }> {
  constructor(props: { children: React.ReactNode; onError: () => void }) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { const { onError } = this.props; onError(); }
  render() { const { failed } = this.state; const { children } = this.props; return failed ? null : children; }
}

export default function NightRain() {
  const stateRef = useRef(createGame()); const g = stateRef.current;
  const companionRef = useRef(createCompanion(g)); const c = companionRef.current;
  const camera = useRef<CameraControl>({ yaw: 0, pitch: 0.46, distance: 6.5, reset: 0 });
  const root = useRef<HTMLElement>(null); const keys = useRef(new Set<string>());
  const controls = useRef<ActionControls | null>(null);
  const shiftSince = useRef(0);
  const pending = useRef<GameInput>({ x: 0, z: 0 }); const external = useRef<GameInput | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const panelRef = useRef<Panel>(null); const saved = useRef<GameState | null>(null);
  const lastVoice = useRef(0); const manualUntil = useRef(0);
  const [recordedAt, setRecordedAt] = useState(-100);
  const [view, setView] = useState(0); const [panel, setPanelState] = useState<Panel>(null);
  const [ready, setReady] = useState(false); const [sceneError, setSceneError] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0); const [canResume, setCanResume] = useState(false);
  const [storageError, setStorageError] = useState(false); const [voiceStatus, setVoiceStatus] = useState('');
  const [restartConfirm, setRestartConfirm] = useState(false);
  const confirmRef = useRef(false); confirmRef.current = restartConfirm;
  const redraw = useCallback(() => setView(v => v + 1), []);
  const clearInput = useCallback(() => { clearHeldActions(stateRef.current); keys.current.clear(); pending.current = { x: 0, z: 0 }; external.current = null; drag.current = null; }, []);
  const cancelVoice = useCallback(() => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  const save = useCallback(() => {
    try {
      if (stateRef.current.mode !== 'title') localStorage.setItem(STORAGE, saveGame(stateRef.current));
      const cc = companionRef.current;
      localStorage.setItem(`${STORAGE}-settings`, JSON.stringify({ enabled: cc.enabled, skin: cc.skin, voice: cc.voice, playerSkin: stateRef.current.playerSkin }));
      return true;
    } catch { setStorageError(true); return false; }
  }, []);
  const showPanel = useCallback((next: Panel) => {
    panelRef.current = next; setPanelState(next); setPaused(stateRef.current, !!next);
    clearInput(); cancelVoice(); redraw();
    if (next) controls.current?.release(); else controls.current?.capture();
  }, [clearInput, cancelVoice, redraw]);
  const resetCamera = useCallback(() => { camera.current = { yaw: 0, pitch: 0.46, distance: 6.5, reset: camera.current.reset + 1 }; }, []);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen().catch(() => {});
  }, []);
  const queue = useCallback((action: Partial<GameInput>) => { if (!panelRef.current) pending.current = { ...pending.current, ...action }; }, []);
  const tick = useCallback((ms: number) => {
    const s = stateRef.current; const cc = companionRef.current;
    if (s.mode !== 'playing' || s.paused) return;
    const held = keys.current;
    const pad = controls.current?.movement;
    const horizontal = Number(held.has('d') || held.has('arrowright')) - Number(held.has('a') || held.has('arrowleft')) + (pad?.x ?? 0);
    const forward = Number(held.has('w') || held.has('arrowup')) - Number(held.has('s') || held.has('arrowdown')) + (pad?.forward ?? 0);
    const { yaw } = camera.current;
    const action = external.current ?? {
      ...pending.current,
x: horizontal * Math.cos(yaw) - forward * Math.sin(yaw),
      z: -horizontal * Math.sin(yaw) - forward * Math.cos(yaw),
sprint: pad?.sprint,
      dashHeld: held.has('shift') || controls.current?.dashHeld,
      guardHeld: held.has('f') || held.has('l') || controls.current?.guardHeld,
      heavyHeld: held.has('k') || controls.current?.heavyHeld,
      aim: Math.atan2(-Math.sin(yaw), -Math.cos(yaw)),
    };
    const previousLamps = s.litLamps.length; const previousRest = s.restCount; const previousCollected = s.collected.length; const previousDoors = Number(s.shortcut) + Number(s.templeGate) + Number(s.harborGate);
    const before = s.time; const previousMessage = s.messageSerial;
    stepGame(s, ms, action); updateCompanion(cc, s, s.time - before);
    if ((s.litLamps.length !== previousLamps || s.restCount !== previousRest || s.collected.length !== previousCollected || previousDoors !== Number(s.shortcut) + Number(s.templeGate) + Number(s.harborGate)) && save() && (s.restCount !== previousRest || s.litLamps.length !== previousLamps)) setRecordedAt(s.time);
    if (cc.enabled && s.messageSerial !== previousMessage && (s.interpretation || s.messageKind === 'hint')) speak(cc, s, s.interpretation || s.message, 8);
    pending.current = { x: 0, z: 0 };
    // Public input is one action per advance, never a mutation hook.
    if (external.current) external.current = { x: action.x, z: action.z, sprint: action.sprint, dashHeld: action.dashHeld, heavyHeld: action.heavyHeld, guardHeld: action.guardHeld, aim: action.aim };
    if (s.mode !== 'playing') { controls.current?.release(); clearInput(); cancelVoice(); save(); }
  }, [cancelVoice, clearInput, save]);
  useEffect(() => {
    try {
      saved.current = loadGame(localStorage.getItem(STORAGE)); setCanResume(!!saved.current && saved.current.mode !== 'title');
      const options = JSON.parse(localStorage.getItem(`${STORAGE}-settings`) ?? '{}');
      if (options && typeof options === 'object') {
        if (Object.hasOwn(PLAYER_SKINS, options.playerSkin ?? ''))stateRef.current.playerSkin = options.playerSkin;
        if (typeof options.enabled === 'boolean') companionRef.current.enabled = options.enabled;
        if (options.skin === 'biscuit' || options.skin === 'otter') companionRef.current.skin = options.skin;
        if (typeof options.voice === 'boolean') companionRef.current.voice = options.voice;
      }
    } catch { setStorageError(true); }
    redraw();
    if (!root.current) return undefined;
    const devices = new ActionControls({ root: root.current, camera, state: () => stateRef.current, panel: () => panelRef.current, confirming: () => confirmRef.current, cancelConfirm: () => setRestartConfirm(false), showPanel, clear: clearInput, queue, upgrade: () => { if (LANDMARKS.some(l => l.id === stateRef.current.nearbyId && l.kind === 'rest')) { upgrade(stateRef.current); save(); redraw(); } } });
    controls.current = devices;
    const target = window as GameWindow;
    target.nightRain = { getState: () => JSON.parse(JSON.stringify(stateRef.current)), input: action => { external.current = { ...action }; }, resetCamera, save };
    target.render_game_to_text = () => JSON.stringify({ ...stateRef.current, coordinateSystem: '+x east, +z south, +y up; metres', camera: camera.current, companion: companionRef.current, panel: panelRef.current, controls: { source: devices.source, pointerLocked: devices.locked, altHeld: devices.altHeld, gamepadConnected: devices.gamepadConnected, look: devices.lookSettings } });
    target.advanceTime = ms => {
      if (!Number.isFinite(ms) || ms < 0) return;
      manualUntil.current = performance.now() + 1200;
      for (let left = Math.min(ms, 60000); left > 0; left -= 40) tick(Math.min(40, left));
      external.current = null; redraw();
    };
    const actions: Record<string, Partial<GameInput>> = { j: { light: true }, k: { heavy: true }, ' ': { jump: true }, f: { parry: true }, l: { parry: true }, r: { heal: true }, q: { lock: true }, e: { interact: true } };
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const dialog = root.current?.querySelector<HTMLElement>('[role="alertdialog"]') ?? root.current?.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog && key === 'tab') {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, summary'));
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (confirmRef.current) { if (key === 'escape') { event.preventDefault(); setRestartConfirm(false); } return; }
      // Some browsers deliver Escape; others only emit pointerlockchange.
      if (key === 'escape' && document.pointerLockElement === root.current) { event.preventDefault(); if (!event.repeat) showPanel('pause'); return; }
      if (key === 'escape' || key === 'p') { event.preventDefault(); if (!event.repeat) showPanel(panelRef.current ? null : 'pause'); return; }
      if (event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (key === 'm' || key === 'c') { event.preventDefault(); if (!event.repeat && stateRef.current.mode === 'playing') showPanel(panelRef.current ? null : key === 'm' ? 'map' : 'companion'); return; }
      if (key === 'f10') { event.preventDefault(); if (!event.repeat) fullscreen(); return; }
      if (panelRef.current || stateRef.current.mode !== 'playing' || devices.altHeld || event.altKey) return;
      if (event.target instanceof HTMLButtonElement && (key === ' ' || key === 'enter')) return;
      if (actions[key] || ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        devices.source = 'mouse';
        event.preventDefault(); if (key === 'shift' && !keys.current.has(key)) shiftSince.current = performance.now(); keys.current.add(key); if (!event.repeat && actions[key]) queue(actions[key]);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'shift' && keys.current.has(key) && !stateRef.current.player.dashDown && performance.now() - shiftSince.current < 200 && !Object.values(pending.current).some(Boolean)) queue({ dodge: true });
      keys.current.delete(key);
    };
    const blur = () => { if (stateRef.current.mode === 'playing') showPanel('pause'); clearInput(); save(); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    let frame = 0; let last = performance.now(); let lastUi = 0; let lastSave = 0;
    const loop = (now: number) => {
      devices.poll(Math.min(100, now - last), now);
      if (now > manualUntil.current) tick(Math.min(100, now - last)); last = now;
      if (now - lastUi > 80) { redraw(); lastUi = now; }
      if (now - lastSave > 3000) { save(); lastSave = now; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      devices.dispose(); controls.current = null;
      cancelAnimationFrame(frame); clearInput(); cancelVoice(); save();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      delete target.nightRain; delete target.render_game_to_text; delete target.advanceTime;
    };
  }, [cancelVoice, clearInput, fullscreen, queue, redraw, resetCamera, save, showPanel, tick]);
  useEffect(() => {
    const dialog = root.current?.querySelector<HTMLElement>('[role="alertdialog"]') ?? root.current?.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [panel, restartConfirm]);
  useEffect(() => {
    const cc = companionRef.current; const s = stateRef.current;
    if (!cc.enabled || !cc.voice || s.paused || s.mode !== 'playing' || cc.serial === lastVoice.current || s.time > cc.until) return;
    lastVoice.current = cc.serial;
    if (!('speechSynthesis' in window)) { setVoiceStatus('此浏览器不支持语音，字幕仍然可用。'); return; }
    const utterance = new SpeechSynthesisUtterance(cc.subtitle); utterance.lang = 'zh-CN'; utterance.rate = 1.05; utterance.pitch = cc.skin === 'otter' ? 1.15 : 1.35;
    const chinese = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('zh')); if (chinese) utterance.voice = chinese;
    utterance.onerror = event => { if (event.error !== 'canceled' && event.error !== 'interrupted') setVoiceStatus('语音暂不可用，继续显示字幕。'); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }, [view]);
  const begin = (resume = false) => {
    const old = companionRef.current; const chosenSkin = stateRef.current.playerSkin;
    stateRef.current = resume && saved.current ? saved.current : createGame();
    stateRef.current.playerSkin = chosenSkin;
    startGame(stateRef.current); stateRef.current.paused = false;
    companionRef.current = { ...createCompanion(stateRef.current), enabled: old.enabled, skin: old.skin, voice: old.voice };
    lastVoice.current = 0; resetCamera(); confirmRef.current = false; setRestartConfirm(false); showPanel(null);
    speak(companionRef.current, stateRef.current, '下播啦！我陪你去找热乎的晚饭。迷路时按 C 叫我就好。', 9); save(); redraw();
  };
  const focusGuide = () => {
    const destination = Math.hypot(c.position.x - g.player.x, c.position.z - g.player.z) > 0.6 ? c.position : c.path[0];
    if (destination) { camera.current.yaw = Math.atan2(g.player.x - destination.x, g.player.z - destination.z); camera.current.pitch = 0.46; camera.current.reset += 1; }
  };
  const rescue = () => { if (!escapeStuck(g)) return; c.position = { ...g.player }; c.path = []; c.targetId = null; c.status = 'following'; showPanel(null); resetCamera(); save(); };
  const guideTo = (id?: string) => { if (leadTo(c, g, id)) focusGuide(); showPanel(null); };
  const settings = (
    <div className={styles.settings}>
      <div className={styles.skins} aria-label="旅人皮肤">{(Object.keys(PLAYER_SKINS) as PlayerSkin[]).map(id => <button key={id} aria-pressed={g.playerSkin === id} onClick={() => { g.playerSkin = id; save(); redraw(); }}>{PLAYER_SKINS[id].name}</button>)}</div>
      <label className={styles.toggle} htmlFor="baby-mode"><input id="baby-mode" type="checkbox" checked={c.enabled} onChange={e => { c.enabled = e.target.checked; c.path = []; c.targetId = null; c.status = 'following'; c.position = { ...g.player }; cancelVoice(); save(); redraw(); }} />宝宝模式 <span>有人陪你探索与认路</span></label>
      {c.enabled && (
<>
        <div className={styles.skins} aria-label="精灵造型">
          <button aria-pressed={c.skin === 'biscuit'} onClick={() => { c.skin = 'biscuit'; save(); redraw(); }}>🍪 饼干岁</button>
          <button aria-pressed={c.skin === 'otter'} onClick={() => { c.skin = 'otter'; save(); redraw(); }}>🦦 獭獭栞</button>
        </div>
        <label className={styles.toggle} htmlFor="guide-voice"><input id="guide-voice" type="checkbox" checked={c.voice} onChange={e => { c.voice = e.target.checked; cancelVoice(); save(); redraw(); }} />精灵语音 <span>系统 TTS · 始终保留字幕</span></label>
        {voiceStatus && <small role="status">{voiceStatus}</small>}
      </>
)}
    </div>
  );
  const error = useCallback(() => { setSceneError(true); showPanel('pause'); }, [showPanel]);
  const sceneReady = useCallback(() => setReady(true), []);
  const boss = g.enemies.find(e => ['boss', 'nana', 'azi'].includes(e.kind) && e.aggro && e.hp > 0);
  const locked = g.enemies.find(e => e.id === g.lockedId);
  const usingPad = controls.current?.source === 'gamepad';
  const threat = c.enabled ? g.enemies.find(e => e.action === 'windup' && e.timer < 0.3 && Math.abs(e.y - g.player.y) < 1 && Math.hypot(e.x - g.player.x, e.z - g.player.z) < 4) : undefined;
  const hold = (key: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); if (key === 'shift') shiftSince.current = performance.now(); keys.current.add(key); },
    onPointerUp: () => {
      if (key === 'shift' && keys.current.has(key) && !g.player.dashDown && performance.now() - shiftSince.current < 200 && !Object.values(pending.current).some(Boolean)) queue({ dodge: true });
      keys.current.delete(key);
    },
    onPointerCancel: () => { if (key === 'f') delete pending.current.parry; keys.current.delete(key); if (key === 'shift' || key === 'f') clearHeldActions(g); },
    onLostPointerCapture: () => { if (keys.current.has(key) && key === 'f') delete pending.current.parry; if (keys.current.has(key) && (key === 'shift' || key === 'f')) clearHeldActions(g); keys.current.delete(key); },
  });
  return (
    <main className={styles.root} ref={root} tabIndex={-1}>
      <div
className={styles.world}
role="presentation"
        onPointerDown={e => { if (panel || g.mode !== 'playing') return; if (e.pointerType === 'mouse') { if (e.button === 0) controls.current?.mouse(); return; } controls.current?.touch(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; }}
        onPointerMove={e => { const d = drag.current; if (!d || d.id !== e.pointerId || panel) return; camera.current.yaw -= (e.clientX - d.x) * 0.006; camera.current.pitch = Math.max(0.14, Math.min(1.15, camera.current.pitch + (e.clientY - d.y) * 0.005)); d.x = e.clientX; d.y = e.clientY; }}
        onPointerUp={() => { drag.current = null; }}
onPointerCancel={() => { drag.current = null; }}
        onWheel={e => { if (!panel) camera.current.distance = Math.max(3, Math.min(9, camera.current.distance + e.deltaY * 0.006)); }}>
        <SceneBoundary key={sceneVersion} onError={error}><WorldView stateRef={stateRef} companionRef={companionRef} cameraControl={camera} onReady={sceneReady} onError={error} /></SceneBoundary>
      </div>
      {!ready && !sceneError && <div className={styles.loading}>雨正在落下，旧城即将亮灯……</div>}
      {g.mode === 'title' && (
<section className={styles.title} data-game-menu aria-label="雨夜寻味开始画面">
        <Link href="/demos" className={styles.back}>← 返回游戏实验室</Link>
        <p className={styles.eyebrow}>岁己的旅居手记 · 第一夜</p>
        <h1>雨夜<br /><em>寻味</em></h1>
        <p className={styles.intro}>直播结束。穿过雨中的旧城，<br />给自己找一顿热乎的晚饭。</p>
        {settings}
        {canResume && <button data-game-primary className={styles.primary} disabled={!ready} onClick={() => begin(true)}>继续雨夜旅程 →</button>}
        <button data-game-primary={!canResume || undefined} className={canResume ? styles.secondary : styles.primary} disabled={!ready} onClick={() => { if (canResume) setRestartConfirm(true); else begin(); }}>出门找夜宵</button>
        <p className={styles.fine}>点击开始捕获鼠标 · 按住 Alt 显示光标<br />支持标准手柄 · 按任意键连接，A 开始</p>
      </section>
)}
      {g.mode !== 'title' && (
<>
        <div className={styles.hud}>
          <p>{PLAYER_SKINS[g.playerSkin].name} <span>行装 +{g.level}</span></p>
          <div className={styles.meter} aria-label={`生命 ${Math.ceil(g.player.hp)} / ${maxHp(g)}`}><i style={{ width: `${(100 * g.player.hp) / maxHp(g)}%` }} /></div>
          <div className={`${styles.meter} ${styles.stamina}`} aria-label={`体力 ${Math.ceil(g.player.stamina)}`}><i style={{ width: `${(100 * g.player.stamina) / maxStamina(g)}%` }} /></div>
          <small>◈ {g.rice} 夜市钱 <span>归灯 · {g.checkpoint === "room" ? "旅馆" : targetLabel(g.checkpoint)}</span></small>
        </div>
        <nav className={styles.tools} aria-label="旅程工具"><button onClick={() => showPanel(panel ? null : 'map')}>地图 {usingPad ? 'View' : 'M'}</button><button onClick={() => showPanel(panel ? null : 'companion')}>{c.enabled ? companionName(c.skin) : '宝宝模式'} {usingPad ? 'LT' : 'C'}</button><button aria-label="暂停" onClick={() => showPanel('pause')}>Ⅱ</button></nav>
        <div className={styles.region} key={g.region}><small>雨夜旧城</small><h2>{g.region}</h2></div>
        {!panel && g.mode === 'playing' && (
<>
          <button className={styles.flask} onClick={() => queue({ heal: true })} disabled={g.player.flasks === 0 || g.player.hp >= maxHp(g) || g.player.action !== 'idle'} aria-label={`喝药回血 ${g.player.flasks} / ${maxFlasks(g)}`} title={`恢复 ${healAmount(g)} 生命；雨灯休息补满`}>
            <svg viewBox="0 0 40 52" aria-hidden="true"><path d="M15 3h10v12l8 8v21q0 5-5 5H12q-5 0-5-5V23l8-8Z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 30h20v14q0 2-3 2H13q-3 0-3-2Z" fill="currentColor" opacity=".6" /><path d="M13 7h14" stroke="currentColor" strokeWidth="4" /></svg>
            <span><b>椰露药瓶</b><strong>{g.player.flasks}<small> / {maxFlasks(g)}</small></strong><em>{usingPad ? 'X' : 'R'} · 恢复生命</em></span>
          </button>
          {g.time - recordedAt < 5 && !storageError && <div className={styles.recorded} role="status">◈ 已记录 · {targetLabel(g.checkpoint)}</div>}
          {locked && <div className={styles.locked}>◎ {locked.name} {locked.action === 'windup' ? `· ${enemyAttack(locked).name}` : locked.action === 'stagger' ? (c.enabled ? '· 破架！靠近轻击处决' : '· 破架') : ''}</div>}
          {threat && <div className={styles.combatCue}>{enemyAttack(threat).parryable ? `现在弹反 · ${usingPad ? 'LB' : 'F'}` : `红色横扫，闪开 · ${usingPad ? 'B' : 'Shift'}`}</div>}
          {g.messageTime > 0 && g.messageKind !== 'hint' && <p className={`${styles.message} ${g.messageKind === 'lore' ? styles.inscription : styles.discovery}`} role="status" data-narrative={g.messageKind}>{g.message}</p>}
          {g.prompt && g.player.action === 'idle' && g.player.jumpHeight === 0 && <div className={styles.interact}><button onClick={() => queue({ interact: true })}><kbd>{usingPad ? 'Y' : 'E'}</kbd> {g.prompt}</button>{LANDMARKS.some(l => l.id === g.nearbyId && l.kind === 'rest' && g.litLamps.includes(l.id)) && <button onClick={() => { upgrade(g); save(); redraw(); }}>{usingPad ? '十字键↑ · ' : ''}强化装备 · {upgradeCost(g)} 钱</button>}</div>}
          {c.enabled && c.subtitle && g.time < c.until && <div className={styles.subtitle} role="status"><b>{companionName(c.skin)}</b><p>{c.subtitle}</p></div>}
          {c.enabled && c.targetId && <button className={styles.guideStatus} onClick={focusGuide}>{c.status === 'waiting' ? '精灵在等你' : c.status === 'danger' ? '先应对敌人' : c.status === 'arrived' ? '到达啦' : '跟随精灵'} · {targetLabel(c.targetId)} · 看向精灵</button>}
          <div className={styles.mobile}>
            <div className={styles.dpad}><button aria-label="向前" {...hold('w')}>↑</button><button aria-label="向左" {...hold('a')}>←</button><button aria-label="向后" {...hold('s')}>↓</button><button aria-label="向右" {...hold('d')}>→</button></div>
            <div className={styles.actions}><button {...hold('f')} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add('f'); queue({ parry: true }); }} onClick={e => { if (e.detail === 0) queue({ parry: true }); }}>弹反 / 防御</button><button {...hold('shift')}>闪避 / 跑</button><button {...hold('k')} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add('k'); queue({ heavy: true }); }}>重击 / 蓄力</button>{[['轻击', 'light'], ['跳跃', 'jump'], ['喝水', 'heal'], ['锁定', 'lock']].map(([label, action]) => <button key={action} onPointerDown={e => { e.preventDefault(); queue({ [action]: true }); }} onClick={e => { if (e.detail === 0) queue({ [action]: true }); }}>{label}</button>)}</div>
          </div>
          {c.enabled && <div className={styles.keyHelp}>{usingPad ? '左摇杆移动 · 右摇杆视角 · RB / RT 攻击 · LB 轻按弹反 / 按住防御 · A 跳跃 · B 轻按闪避 / 按住跑 · R3 锁定 · Menu 暂停' : `${controls.current?.locked ? '鼠标转视角 · 按住 Alt 显示光标' : controls.current?.altHeld ? '松开 Alt 返回视角控制' : controls.current?.lockMessage || '点击画面捕获鼠标'} · WASD 移动 · 左 / 右键攻击 · 空格跳跃 · Shift 轻按闪避 / 按住跑`}</div>}
        </>
)}
        {boss && !panel && <div className={styles.boss}><p>{boss.name}<span>{boss.kind === 'nana' ? boss.phase === 2 ? '七潮叠浪' : '潮声初起' : boss.kind === 'azi' ? boss.phase === 2 ? '夜曲 · 变奏' : '夜曲 · 序拍' : boss.phase === 2 ? '第二式 · 铁伞破裂' : '守街第一式'}</span></p><div className={styles.meter}><i style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} /></div><div className={`${styles.meter} ${styles.posture}`}><i style={{ width: `${(boss.posture / boss.maxPosture) * 100}%` }} /></div></div>}
      </>
)}
      {panel && g.mode === 'playing' && (
<div className={styles.scrim}><section className={`${styles.panel} ${panel === 'map' ? styles.mapPanel : ''}`} role="dialog" aria-modal="true" aria-label={panel === 'map' ? '旧城手绘地图' : panel === 'companion' ? '与精灵交谈' : '旅程暂停'}>
        <button className={styles.close} onClick={() => showPanel(null)} aria-label="关闭">×</button>
        <p className={styles.eyebrow}>雨暂时停在这一刻</p>
        <h2>{panel === 'map' ? '旧城手绘地图' : panel === 'companion' ? '我陪你慢慢找' : '歇一会儿'}</h2>
        {panel === 'map' ? (
<>
          {c.enabled && <p>{getObjective(g)}</p>}
          <svg viewBox="-40 -88 108 112" className={styles.map} role="img" aria-label={c.enabled ? "旧城回环：中庭向西登高，经屋脊与夜市沿东侧返回；铃兰回廊连接中庭与高阶。" : "旧城地图"}>
            {SURFACES.map(s => <rect key={s.id} x={s.x1} y={s.z1} width={s.x2 - s.x1} height={s.z2 - s.z1} fill={g.visited.includes(s.name) ? '#857455' : '#394b50'} stroke="#b6a783" strokeWidth=".2" />)}
            {[
              { x: 36, z: -85, label: '黎明钟' }, { x: 40, z: -71, label: '七重潮门' }, { x: 58, z: -57, label: '苔灯戏台' }, { x: 39, z: -25, label: '潮汐港' }, { x: 4, z: -51, label: '封街夜市' }, { x: -31, z: -36, label: '残钟雨寺' },
              { x: -8, z: -18, label: '金塔屋脊' }, { x: 20, z: -24, label: '摆渡庵' },
              { x: 1, z: 3, label: '雨灯中庭' }, { x: 4, z: 21, label: '旅馆' },
            ].map(l => <text key={l.label} x={l.x} y={l.z} textAnchor="middle" fontSize="2.4" fill="#e3d6b8">{l.label}</text>)}
            {LANDMARKS.filter(l => (l.kind === 'rest' ? g.litLamps.includes(l.id) || g.visited.includes(regionAt(l.x, l.z)) : c.enabled || g.collected.includes(l.id))).map(l => (
<g key={l.id}>
              <title>{targetLabel(l.id)}</title>
              {l.kind === 'rest' ? <path d={`M ${l.x} ${l.z - 1.1} l .8 1.1 l -.8 1.1 l -.8 -1.1 Z`} fill={g.checkpoint === l.id ? '#fff0ae' : g.litLamps.includes(l.id) ? '#91d8c1' : '#6c8e96'} stroke="#11272d" strokeWidth=".25" /> : <circle cx={l.x} cy={l.z} r=".5" fill={g.collected.includes(l.id) ? '#788879' : '#ffd17f'} />}
            </g>
))}
            <line x1="10" y1="-8" x2="14" y2="-8" stroke={g.shortcut ? '#8bd6b3' : '#ed8176'} strokeWidth=".8" />
            <line x1="-35" y1="-6" x2="-26" y2="-6" stroke={g.templeGate ? "#8bd6b3" : "#ed8176"} strokeWidth=".8" />
            <line x1="27" y1="-8" x2="31" y2="-8" stroke={g.harborGate ? "#8bd6b3" : "#ed8176"} strokeWidth=".8" /><circle cx={g.player.x} cy={g.player.z} r="1" fill="#fff" stroke="#d9a254" strokeWidth=".4" />
            {c.enabled && <polyline points="7,-38 12,-35 12,-30 24,-30 35,-30" fill="none" stroke="#8de4dd" strokeWidth=".65" strokeDasharray="1.2 .8"><title>夜市东侧，经摆渡庵潮桥进入潮汐港</title></polyline>}
          </svg>
          {c.enabled && <><p>潮汐港入口：夜市东侧 → 运河侧廊 → 摆渡庵向东 → 潮桥。</p><button onClick={() => guideTo('tide-note')}>带我去新区域 · 潮汐港</button></>}
          <button onClick={rescue}>脱离卡死 · 返回{g.checkpoint === 'room' ? '旅馆' : '中庭雨灯'}</button>
          <small className={styles.mapLegend}>白点 · 你 · 菱灯 · 休息处 · 红线 · 闭门<br />归灯 · {g.checkpoint === 'room' ? '旅馆' : targetLabel(g.checkpoint)} · 近道 {Number(g.shortcut) + Number(g.templeGate) + Number(g.harborGate)} / 3</small>
        </>
) : panel === 'companion' ? (
<>
          {settings}
          {c.enabled && (
<>
            <p className={styles.dialogue}>“看不懂岔路也没关系。你想去哪里？我会等你，不会把你丢下。”</p>
            <button className={styles.primary} onClick={() => { guideTo(); }}>直接带我去 · {targetLabel(recommendedTarget(c, g))}</button>
            {recommendedTarget(c, g) !== 'tide-note' && <button onClick={() => guideTo('tide-note')}>带我去新区域 · 潮汐港</button>}
            <div className={styles.destinations}>{recommendedTarget(c, g) !== mainTarget(g) && <button onClick={() => { guideTo(mainTarget(g)); }}>主线 · {targetLabel(mainTarget(g))} ↗</button>}{guideTargets(g).filter(l => l.id !== recommendedTarget(c, g) && l.id !== 'tide-note').map(l => <button key={l.id} onClick={() => { guideTo(l.id); }}>{targetLabel(l.id)} ↗</button>)}</div>
            {c.targetId && <button onClick={() => { stopLeading(c, g); showPanel(null); }}>先不带路，我们随便逛逛</button>}
            <button onClick={() => { speak(c, g, c.subtitle || '别怕，我一直在这里。慢慢走就好。'); showPanel(null); }}>再说一遍</button>
          </>
)}
        </>
) : (
<>
          <p>{getObjective(g)}</p><button className={styles.primary} onClick={() => showPanel(null)}>继续旅程</button>
          {settings}
          <button onClick={rescue}>脱离卡死 · 返回{g.checkpoint === 'room' ? '旅馆' : '中庭雨灯'}</button>
          <p className={styles.rescueNote}>回到记录的落脚点，保留当前血量、药瓶与探索进度。</p>
          <details><summary>镜头设置</summary><div className={styles.lookSettings}>
            <label htmlFor="mouse-look-speed">鼠标视角速度<select id="mouse-look-speed" aria-label="鼠标视角速度" value={controls.current?.lookSettings.mouse ?? 1} onChange={e => { controls.current?.setLook({ mouse: Number(e.target.value) }); redraw(); }}>{[[0.6, '慢'], [1, '标准'], [1.5, '快'], [2, '很快']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label htmlFor="pad-look-speed">手柄视角速度<select id="pad-look-speed" aria-label="手柄视角速度" value={controls.current?.lookSettings.gamepad ?? 1} onChange={e => { controls.current?.setLook({ gamepad: Number(e.target.value) }); redraw(); }}>{[[0.6, '慢'], [1, '标准'], [1.5, '快'], [2, '很快']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className={styles.toggle} htmlFor="invert-look"><input id="invert-look" type="checkbox" checked={controls.current?.lookSettings.invertY ?? false} onChange={e => { controls.current?.setLook({ invertY: e.target.checked }); redraw(); }} />反转上下视角</label>
            <small>手柄十字键上下选择，左右调节速度。</small>
          </div></details>
          <details><summary>操作与战斗手记</summary><p>WASD 移动，鼠标直接转视角，按住 Alt 显示光标，松开继续。点击画面可重新捕获鼠标，Esc 释放并暂停。滚轮缩放，左键 / J 轻击，右键 / K 重击（按住蓄力），中键 / Q 锁定，空格跳跃，Shift 轻按松开闪避、按住疾跑，F 轻按弹反、按住防御（L 备用）、R 喝药回血、E 交互。</p><p>手柄：左摇杆移动、L3 切换奔跑（停下结束），右摇杆视角、R3 锁定。RB 轻击、RT 重击（按住蓄力）、LB 轻按弹反 / 按住防御、B 轻按松开闪避／按住疾跑、A 跳跃、Y 交互、X 喝药回血、LT 找精灵，雨灯旁十字键↑整备。View 看地图，Menu 暂停。菜单用十字键或左摇杆选择，A 确认、B 返回。按钮按 Xbox 标准标注，其他标准手柄使用对应位置。</p><p>连续轻击可接横斩、返斩、挑斩。按住重击蓄力，金光亮起后松手释放；疾跑中攻击会突刺或回旋，空中攻击会横斩或下砸。攻击起手可用方向键／摇杆或镜头修正朝向，出手后转向减弱。看清敌人抬手再弹反。持续按住可架伞防住正面攻击，消耗体力并受少量伤害；体力不足会破防。背后攻击与红色横扫无法防住。打空或贪刀会消耗体力；红色横扫用闪避。架势打满后靠近轻击处决。中庭雨灯首次交互只点火、记录复活点，不补给也不刷新敌人；再次交互免费休息，补满生命与药瓶并复活普通敌人。强化装备才消耗夜市钱。所有已开启的门、宝箱和药瓶升级会保留。中庭是旧城唯一补给雨灯；残钟雨寺有增加瓶数的刻露瓶。</p><p>手机左侧方向移动，右侧拖动镜头，动作按钮出招。C 找精灵，M 看地图，F10 全屏。</p></details>
          <div className={styles.row}><button onClick={fullscreen}>切换全屏</button><button onClick={resetCamera}>镜头归正</button><button onClick={() => setRestartConfirm(true)}>重新开始</button><Link href="/demos">离开旧城</Link></div>
        </>
)}
      </section></div>
)}
      {(g.mode === 'dead' || g.mode === 'ending') && (
<div className={styles.scrim}><section className={styles.panel} data-game-menu>
        <p className={styles.eyebrow}>{g.mode === 'dead' ? '雨灯未熄' : '岁己的旅居手记 · 第一幕完成'}</p>
        <h2>{g.mode === 'dead' ? '再走一次就好' : '终于，吃上饭了'}</h2>
        <p>{g.mode === 'dead' ? (c.enabled ? '夜市钱留在倒下的地方。记住那一下起手，下次我们一起过去。' : '雨收走余温，灯替归人守夜。') : '热气模糊了眼镜。明天还要直播，今晚先好好吃饭。'}</p>
        <p>发现 {g.collected.filter(id => id !== 'laptop').length} 处 · 弹反 {g.parries} 次 · 开启近道 {Number(g.shortcut) + Number(g.templeGate) + Number(g.harborGate)} / 3 · 归灯 {g.checkpoint === 'room' ? '旅馆' : targetLabel(g.checkpoint)}</p>
        {g.mode === 'dead' ? <button data-game-primary className={styles.primary} onClick={() => { respawn(g); c.position = { ...g.player }; c.path = []; c.targetId = null; c.status = 'following'; showPanel(null); resetCamera(); save(); }}>回到雨灯</button> : <><button data-game-primary className={styles.primary} onClick={() => { continueExploring(g); showPanel(null); save(); }}>继续探索旧城</button>{c.enabled && <button onClick={() => { continueExploring(g); guideTo('tide-note'); save(); }}>让精灵带我去潮汐港</button>}<button onClick={() => setRestartConfirm(true)}>再走一场雨夜</button><Link href="/demos">回到游戏实验室</Link></>}
      </section></div>
)}
      {sceneError && <div className={styles.scrim}><section className={styles.panel} role="alertdialog" aria-label="恢复游戏画面"><h2>画面暂时中断</h2><p>旅程已暂停，试试重新载入画面。</p><button className={styles.primary} onClick={() => { setSceneError(false); setReady(false); setSceneVersion(v => v + 1); }}>重新载入 3D 画面</button></section></div>}
      {restartConfirm && <div className={styles.scrim}><section className={styles.panel} role="alertdialog" aria-label="重新开始旅程"><h2>从下播那一刻重新开始？</h2><p>这会替换本机的本次旅程和探索记录。</p><div className={styles.row}><button onClick={() => setRestartConfirm(false)}>保留旅程</button><button onClick={() => begin()}>重新出发</button></div></section></div>}
      {storageError && <p className={styles.storage}>本机存档不可用，本次仍可继续游玩。</p>}
    </main>
  );
}
