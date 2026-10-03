'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import GameShareButton from '@/app/game/GameShareButton';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { interact, escapeStuck, continueExploring, clearHeldActions, createGame, enemyAttack, getObjective, loadGame, maxFlasks, healAmount, maxHp, maxStamina, forgeWeapon, equipWeapon, canForge, respawn, saveGame, setPaused, startGame, stepGame, upgrade, upgradeCost, travelToLamp, chooseConversation } from './engine';
import { companionName, createCompanion, guideTargets, leadTo, mainTarget, recommendedTarget, speak, stopLeading, targetLabel, updateCompanion } from './companion';
import type { CameraControl, GameInput, GameState, PlayerSkin } from './types';
import { WEAPONS, weaponUnlocked, weaponAttack } from './weapons';
import { ARMORS, TALISMANS, equipArmor, equipTalisman } from './equipment';
import BestiaryPanel from './BestiaryPanel';
import { isBoss, enemyRole, ROLE_NAMES } from './encounters';
import { slotKey, migrateLegacy, selectedSlot, SLOT_COUNT } from './saveSlots';
import { BOSS_ROSTER } from './bossRoster';
import { enemyTell } from './enemyCombat';
import { LANDMARKS } from './world';
import HavenPanel from './HavenPanel';
import WorldMap from './WorldMap';
import { riverSeals } from './valley';
import { ActionControls } from './controls';
import { NightAudio } from './audio';
import { inputHint, hintText, type HintAction } from './inputHints';
import Interlude from './Interlude';
import { lootTier } from './loot';
import { PLAYER_SKINS } from './CharacterStyle';
import styles from './nightRain.module.css';

const WorldView = dynamic(() => import('./WorldView'), { ssr: false });
const STORAGE = 'night-rain-v1';
type Panel = 'pause' | 'map' | 'companion' | 'story' | 'journal' | 'forge' | 'lamp' | 'gear' | 'bestiary' | null;
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
  const audio = useRef<NightAudio | null>(null); const lampParent = useRef(false);
  const shiftSince = useRef(0);
  const pending = useRef<GameInput>({ x: 0, z: 0 }); const external = useRef<GameInput | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const slot = useRef(1);
  const [slotView, setSlotView] = useState(1); const [slotInfo, setSlotInfo] = useState<string[]>([]);
  const panelRef = useRef<Panel>(null); const saved = useRef<GameState | null>(null);
  const lastVoice = useRef(0); const manualUntil = useRef(0);
  const [recordedAt, setRecordedAt] = useState(-100);
  const [view, setView] = useState(0); const [panel, setPanelState] = useState<Panel>(null);
  const [ready, setReady] = useState(false); const [sceneError, setSceneError] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0); const [canResume, setCanResume] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState<{ id: number; kind: 'lamp' | 'death'; label: string } | null>(null);
  const noticeSerial = useRef(0); const noticeRef = useRef(notice); noticeRef.current = notice;
  const [restartConfirm, setRestartConfirm] = useState(false);
  const confirmRef = useRef(false); confirmRef.current = restartConfirm;
  const redraw = useCallback(() => setView(v => v + 1), []);
  const clearInput = useCallback(() => { clearHeldActions(stateRef.current); keys.current.clear(); pending.current = { x: 0, z: 0 }; external.current = null; drag.current = null; }, []);
  const cancelVoice = useCallback(() => { audio.current?.cancelVoice(); }, []);
  const save = useCallback(() => {
    try {
      if (stateRef.current.mode !== 'title') localStorage.setItem(slotKey(slot.current), saveGame(stateRef.current));
      const cc = companionRef.current;
      localStorage.setItem(`${STORAGE}-settings`, JSON.stringify({ enabled: cc.enabled, skin: cc.skin, voice: cc.voice, playerSkin: stateRef.current.playerSkin }));
      return true;
    } catch { setStorageError(true); return false; }
  }, []);
  const showPanel = useCallback((next: Panel) => {
    if (next === 'lamp') lampParent.current = true;
    else if (next !== 'forge' && next !== 'map' && next !== 'gear') lampParent.current = false;
    if (next !== 'story') stateRef.current.haven.talking = null;
    audio.current?.sound('menu');
    panelRef.current = next; setPanelState(next); setPaused(stateRef.current, !!next);
    clearInput(); cancelVoice(); redraw();
    if (next) controls.current?.release(); else controls.current?.capture();
  }, [clearInput, cancelVoice, redraw]);
  const backPanel = useCallback(() => { showPanel(lampParent.current && ['forge', 'map', 'gear'].includes(panelRef.current ?? '') ? 'lamp' : null); }, [showPanel]);
  const resetCamera = useCallback(() => { const underground = stateRef.current.player.x > 80; camera.current = { yaw: underground ? Math.PI : 0, pitch: underground ? 0.66 : 0.46, distance: 6.5, reset: camera.current.reset + 1 }; }, []);
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
    if (action.interact && canForge(s)) { showPanel('lamp'); return; }
    const previousLamps = s.litLamps.length; const previousRest = s.restCount; const previousCollected = s.collected.length; const previousDoors = Number(s.shortcut) + Number(s.templeGate) + Number(s.harborGate) + s.chapterGates.length + s.valleyGates.length + s.haven.gates.length;
    const previousPosition = { x: s.player.x, z: s.player.z };
    const previousEchoes = s.haven.echoes;
    const before = s.time; const previousMessage = s.messageSerial;
    stepGame(s, ms, action); audio.current?.observe(s);
    if (s.litLamps.length > previousLamps) setNotice({ id: ++noticeSerial.current, kind: 'lamp', label: LANDMARKS.find(l => l.id === s.checkpoint)?.label ?? '雨灯' });
    if (stateRef.current.mode === 'dead') setNotice({ id: ++noticeSerial.current, kind: 'death', label: '雨灯仍为你守夜' });
    if (s.haven.talking) showPanel('story');
    if (Math.hypot(s.player.x - previousPosition.x, s.player.z - previousPosition.z) > 30) {
      cc.position = { ...s.player }; cc.path = []; cc.targetId = null; cc.status = 'following';
      camera.current.yaw = s.player.x > 80 ? Math.PI : 0; camera.current.pitch = s.player.x > 80 ? 0.66 : 0.46; camera.current.reset += 1; save();
    }
    updateCompanion(cc, s, s.time - before);
    if ((s.haven.echoes !== previousEchoes || s.litLamps.length !== previousLamps || s.restCount !== previousRest || s.collected.length !== previousCollected || previousDoors !== Number(s.shortcut) + Number(s.templeGate) + Number(s.harborGate) + s.chapterGates.length + s.valleyGates.length + s.haven.gates.length) && save() && (s.restCount !== previousRest || s.litLamps.length !== previousLamps)) setRecordedAt(s.time);
    if (cc.enabled && s.messageSerial !== previousMessage && (s.interpretation || s.messageKind === 'hint')) speak(cc, s, s.interpretation || s.message, 8);
    pending.current = { x: 0, z: 0 };
    // Public input is one action per advance, never a mutation hook.
    if (external.current) external.current = { x: action.x, z: action.z, sprint: action.sprint, dashHeld: action.dashHeld, heavyHeld: action.heavyHeld, guardHeld: action.guardHeld, aim: action.aim };
    if (s.mode !== 'playing') { controls.current?.release(); clearInput(); cancelVoice(); save(); }
  }, [cancelVoice, clearInput, save, showPanel]);
  useEffect(() => {
    try {
      migrateLegacy(localStorage); slot.current = selectedSlot(localStorage); setSlotView(slot.current);
      setSlotInfo(Array.from({ length: SLOT_COUNT }, (_, i) => { const data = loadGame(localStorage.getItem(slotKey(i + 1))); return data ? `${targetLabel(data.checkpoint)} · 行装 +${data.level} · ${data.collected.length} 处发现` : '尚未出门'; }));
      saved.current = loadGame(localStorage.getItem(slotKey(slot.current))); setCanResume(!!saved.current && saved.current.mode !== 'title');
      const options = JSON.parse(localStorage.getItem(`${STORAGE}-settings`) ?? '{}');
      if (options && typeof options === 'object') {
        if (Object.hasOwn(PLAYER_SKINS, options.playerSkin ?? ''))stateRef.current.playerSkin = options.playerSkin;
        if (typeof options.enabled === 'boolean') companionRef.current.enabled = options.enabled;
        if (options.skin === 'biscuit' || options.skin === 'otter') companionRef.current.skin = options.skin;
        if (typeof options.voice === 'boolean') companionRef.current.voice = options.voice;
      }
    } catch { setStorageError(true); }
    if (saved.current) stateRef.current.playerSkin = saved.current.playerSkin;
    redraw();
    if (!root.current) return undefined;
    const devices = new ActionControls({ root: root.current, camera, state: () => stateRef.current, panel: () => panelRef.current, confirming: () => confirmRef.current, cancelConfirm: () => setRestartConfirm(false), back: backPanel, showPanel, clear: clearInput, queue, upgrade: () => { if (LANDMARKS.some(l => l.id === stateRef.current.nearbyId && l.kind === 'rest')) { upgrade(stateRef.current); save(); redraw(); } } });
    controls.current = devices;
    const sound = new NightAudio(root.current); audio.current = sound;
    const target = window as GameWindow;
    target.nightRain = { getState: () => JSON.parse(JSON.stringify(stateRef.current)), input: action => { external.current = { ...action }; }, resetCamera, save };
    target.render_game_to_text = () => JSON.stringify({ ...stateRef.current, enemyTells: stateRef.current.enemies.filter(e => e.aggro && ['windup', 'attack', 'recover'].includes(e.action)).map(e => ({ id: e.id, ...enemyTell(e) })), presentation: noticeRef.current ? { kind: noticeRef.current.kind, label: noticeRef.current.label } : null, journey: { chapter: stateRef.current.chapterComplete ? 2 : 1, sluices: riverSeals(stateRef.current), ferry: stateRef.current.collected.includes('ferry-winch'), complete: stateRef.current.valleyComplete }, coordinateSystem: '+x east, +z south, +y up; metres', camera: camera.current, companion: companionRef.current, panel: panelRef.current, saveSlot: slot.current, audio: sound.snapshot(), pickups: LANDMARKS.filter(l => ['cache', 'charm', 'flask'].includes(l.kind) && !stateRef.current.collected.includes(l.id)).map(l => ({ id: l.id, tier: lootTier(l) })), encounters: stateRef.current.enemies.filter(e => e.hp > 0).map(e => ({ id: e.id, role: enemyRole(e), label: ROLE_NAMES[enemyRole(e)] })), controls: { source: devices.source, family: devices.family, pointerLocked: devices.locked, altHeld: devices.altHeld, gamepadConnected: devices.gamepadConnected, look: devices.lookSettings } });
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
      if (key === 'escape' || key === 'p') { event.preventDefault(); if (!event.repeat) if (panelRef.current) backPanel(); else showPanel('pause'); return; }
      if (event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (key === 'm' || key === 'c' || key === 'n') { event.preventDefault(); if (!event.repeat && stateRef.current.mode === 'playing') showPanel(panelRef.current ? null : key === 'm' ? 'map' : key === 'n' ? 'journal' : 'companion'); return; }
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
      devices.poll(Math.min(100, now - last), now); sound.observe(stateRef.current);
      if (now > manualUntil.current) tick(Math.min(100, now - last)); last = now;
      if (now - lastUi > 80) { redraw(); lastUi = now; }
      if (now - lastSave > 3000) { save(); lastSave = now; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      sound.dispose(); audio.current = null; devices.dispose(); controls.current = null;
      cancelAnimationFrame(frame); clearInput(); cancelVoice(); save();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      delete target.nightRain; delete target.render_game_to_text; delete target.advanceTime;
    };
  }, [backPanel, cancelVoice, clearInput, fullscreen, queue, redraw, resetCamera, save, showPanel, tick]);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), notice.kind === 'death' ? 3100 : 3300);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    const dialog = root.current?.querySelector<HTMLElement>('[role="alertdialog"]') ?? root.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (controls.current?.source !== 'gamepad') (dialog?.querySelector<HTMLElement>('[data-game-primary]') ?? dialog?.querySelector<HTMLElement>('button:not(:disabled):not([data-game-close])'))?.focus();
  }, [panel, restartConfirm]);
  useEffect(() => {
    const cc = companionRef.current; const s = stateRef.current;
    if (!cc.enabled || !cc.voice || s.paused || s.mode !== 'playing' || cc.serial === lastVoice.current || s.time > cc.until) return;
    lastVoice.current = cc.serial;
    audio.current?.say(cc.subtitle, cc.skin);
  }, [view]);
  const begin = (resume = false) => {
    const old = companionRef.current; const chosenSkin = stateRef.current.playerSkin;
    stateRef.current = resume && saved.current ? saved.current : createGame();
    stateRef.current.playerSkin = chosenSkin;
    setNotice(null);
    startGame(stateRef.current); stateRef.current.paused = false;
    companionRef.current = { ...createCompanion(stateRef.current), enabled: old.enabled, skin: old.skin, voice: old.voice };
    lastVoice.current = 0; audio.current?.reset(); resetCamera(); confirmRef.current = false; setRestartConfirm(false); showPanel(null);
    speak(companionRef.current, stateRef.current, '下播啦！我陪你去找热乎的晚饭。迷路时按 C 叫我就好。', 9); save(); redraw();
  };
  const focusGuide = () => {
    const destination = Math.hypot(c.position.x - g.player.x, c.position.z - g.player.z) > 0.6 ? c.position : c.path[0];
    if (destination) { camera.current.yaw = Math.atan2(g.player.x - destination.x, g.player.z - destination.z); camera.current.pitch = 0.46; camera.current.reset += 1; }
  };
  const rescue = () => { if (!escapeStuck(g)) return; c.position = { ...g.player }; c.path = []; c.targetId = null; c.status = 'following'; showPanel(null); resetCamera(); save(); };
  const guideTo = (id?: string) => { if (leadTo(c, g, id)) focusGuide(); showPanel(null); };
  const selectSlot = (id: number) => {
    slot.current = id; setSlotView(id);
    try { localStorage.setItem(`${STORAGE}-active-slot`, String(id)); saved.current = loadGame(localStorage.getItem(slotKey(id))); setCanResume(!!saved.current && saved.current.mode !== 'title'); if (saved.current) stateRef.current.playerSkin = saved.current.playerSkin; } catch { setStorageError(true); }
  };
  const title = () => {
 save(); clearInput(); cancelVoice(); controls.current?.release(); stateRef.current = createGame(); showPanel(null);
    try { setSlotInfo(Array.from({ length: SLOT_COUNT }, (_, i) => { const data = loadGame(localStorage.getItem(slotKey(i + 1))); return data ? `${targetLabel(data.checkpoint)} · 行装 +${data.level} · ${data.collected.length} 处发现` : '尚未出门'; })); } catch { setStorageError(true); }
    selectSlot(slot.current); redraw();
  };
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
        <label className={styles.toggle} htmlFor="guide-voice"><input id="guide-voice" type="checkbox" checked={c.voice} onChange={e => { c.voice = e.target.checked; cancelVoice(); save(); redraw(); }} />精灵语音 <span>本地旁白 · 始终保留字幕</span></label>
        {audio.current?.status && <small role="status">{audio.current.status}</small>}
      </>
)}
    </div>
  );
  const error = useCallback(() => { setSceneError(true); showPanel('pause'); }, [showPanel]);
  const sceneReady = useCallback(() => setReady(true), []);
  const boss = g.enemies.find(e => isBoss(e) && e.aggro && e.hp > 0);
  const locked = g.enemies.find(e => e.id === g.lockedId);
  const source = controls.current?.source ?? 'mouse'; const usingPad = source === 'gamepad';
  const hint = (action: HintAction) => inputHint(action, source, controls.current?.family);
  const dialogueHint = (text: string) => hintText(text, source, controls.current?.family);
  const padHelp = `左摇杆移动 · 右摇杆视角 · ${hint('light')} 轻击 / ${hint('heavy')} 蓄力 · ${hint('parry')} 弹反 / 防御 · ${hint('jump')} 跳跃 · ${hint('dodge')} 闪避 / 跑 · ${hint('lock')} 锁定 · ${hint('pause')} 暂停`;
  const soundSettings = <details><summary>声音设置</summary><div className={styles.lookSettings}>{(['music', 'effects', 'narration'] as const).map((key, i) => <label key={key} htmlFor={`sound-${key}`}>{['音乐', '音效', '旁白'][i]}<input id={`sound-${key}`} aria-label={['音乐音量', '音效音量', '旁白音量'][i]} type="range" min={0} max={1} step={0.05} value={audio.current?.settings[key] ?? [0.32, 0.65, 0.85][i]} onChange={e => { audio.current?.setSettings({ [key]: Number(e.target.value) }); redraw(); }} /></label>)}<label htmlFor="sound-muted"><input id="sound-muted" type="checkbox" checked={audio.current?.settings.muted ?? false} onChange={e => { audio.current?.setSettings({ muted: e.target.checked }); redraw(); }} />静音</label><small>音乐素材：CC0 · <a href="/games/night-rain/audio/CREDITS.md" target="_blank" rel="noreferrer">作者与来源</a></small></div></details>;
  const threat = c.enabled ? g.enemies.find(e => {
    const tell = enemyTell(e);
    return (tell.parryNow || (tell.dangerous && tell.committed && tell.toImpact !== null && tell.toImpact > 0)) && Math.abs(e.y - g.player.y) < 1 && Math.hypot(e.x - g.player.x, e.z - g.player.z) < enemyAttack(e).range + 0.2;
  }) : undefined;
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
    <main className={styles.root} ref={root} tabIndex={-1} data-mode={g.mode}>
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
<section className={styles.title} data-menu-id="title" data-game-menu aria-label="雨夜寻味开始画面">
        <div className={styles.titleNav}><Link href="/demos" className={styles.back}>← 返回游戏实验室</Link><GameShareButton gamePath="/game/night-rain" /></div>
        <p className={styles.eyebrow}>岁己的旅居手记 · 长夜归灯 / 雾河回响</p>
        <h1>雨夜<br /><em>寻味</em></h1>
        <p className={styles.intro}>下播之后，穿过旧城寻找夜宵。<br />走过旧城与王寺，再循钟声进入雾河。</p>
        {settings}
        <details className={styles.saveSlots}><summary>选择旅人 · 第 {slotView} 档 / {SLOT_COUNT} 档</summary>{Array.from({ length: SLOT_COUNT }, (_, i) => <button key={i} aria-pressed={slotView === i + 1} onClick={() => selectSlot(i + 1)}>旅人 {i + 1}<small>{slotInfo[i] ?? '尚未出门'}</small></button>)}</details>
        {canResume && <button data-game-primary className={styles.primary} disabled={!ready} onClick={() => begin(true)}>继续雨夜旅程 →</button>}
        <button data-game-primary={!canResume || undefined} className={canResume ? styles.secondary : styles.primary} disabled={!ready} onClick={() => { if (canResume) setRestartConfirm(true); else begin(); }}>出门找夜宵</button>
        <p className={styles.fine}>点击开始捕获鼠标 · 按住 Alt 显示光标<br />支持标准手柄 · 按任意键连接，{hint('confirm')} 开始</p>
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
        <nav className={styles.tools} aria-label="旅程工具"><GameShareButton gamePath="/game/night-rain" /><button onClick={() => showPanel(panel ? null : 'map')}>地图 {hint('map')}</button><button onClick={() => showPanel(panel ? null : 'companion')}>{c.enabled ? companionName(c.skin) : '宝宝模式'} {hint('companion')}</button><button aria-label="暂停" onClick={() => showPanel('pause')}>Ⅱ</button></nav>
        <div className={styles.region} key={g.region}><small>雨夜旧城</small><h2>{g.region}</h2></div>
        {!panel && g.mode === 'playing' && (
<>
          <button className={styles.flask} onClick={() => queue({ heal: true })} disabled={g.player.flasks === 0 || g.player.hp >= maxHp(g) || g.player.action !== 'idle'} aria-label={`喝药回血 ${g.player.flasks} / ${maxFlasks(g)}`} title={`恢复 ${healAmount(g)} 生命；雨灯休息补满`}>
            <svg viewBox="0 0 40 52" aria-hidden="true"><path d="M15 3h10v12l8 8v21q0 5-5 5H12q-5 0-5-5V23l8-8Z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 30h20v14q0 2-3 2H13q-3 0-3-2Z" fill="currentColor" opacity=".6" /><path d="M13 7h14" stroke="currentColor" strokeWidth="4" /></svg>
            <span><b>椰露药瓶</b><strong>{g.player.flasks}<small> / {maxFlasks(g)}</small></strong><em>{hint('heal')} · 恢复生命</em></span>
          </button>
          {g.time - recordedAt < 5 && !storageError && <div className={styles.recorded} role="status">◈ 已记录 · {targetLabel(g.checkpoint)}</div>}
          {locked && <div className={styles.locked}>◎ {locked.name} {locked.action === 'windup' ? `· ${enemyAttack(locked).name}` : locked.action === 'stagger' ? (c.enabled ? '· 破架！靠近轻击处决' : '· 破架') : ''}</div>}
          {threat && <div className={styles.combatCue}>{enemyAttack(threat).parryable ? `现在弹反 · ${hint('parry')}` : `红色横扫，闪开 · ${hint('dodge')}`}</div>}
          {g.messageTime > 0 && g.messageKind !== 'hint' && <p className={`${styles.message} ${g.messageKind === 'lore' ? styles.inscription : styles.discovery}`} role="status" data-narrative={g.messageKind}>{g.message}</p>}
          {g.prompt && g.player.action === 'idle' && g.player.jumpHeight === 0 && (
<div className={styles.interact}><button onClick={() => queue({ interact: true })}><kbd>{hint('interact')}</kbd> {dialogueHint(g.prompt)}</button>{LANDMARKS.some(l => l.id === g.nearbyId && l.kind === 'rest' && g.litLamps.includes(l.id)) && <button disabled={g.level >= 15} onClick={() => { upgrade(g); save(); redraw(); }}>{g.level >= 15 ? '行装 +15 · 已整备完毕' : `${usingPad ? '十字键↑ · ' : ''}强化装备 · ${upgradeCost(g)} 钱`}</button>}
            {canForge(g) && <button onClick={() => showPanel('forge')}>锻造武器 · {WEAPONS[g.weapon].name}</button>}</div>
)}
          {c.enabled && c.subtitle && g.time < c.until && <div className={styles.subtitle} role="status"><b>{companionName(c.skin)}</b><p>{dialogueHint(c.subtitle)}</p></div>}
          {c.enabled && c.targetId && <button className={styles.guideStatus} onClick={focusGuide}>{c.status === 'waiting' ? '精灵在等你' : c.status === 'danger' ? '先应对敌人' : c.status === 'arrived' ? '到达啦' : '跟随精灵'} · {targetLabel(c.targetId)} · 看向精灵</button>}
          <div className={styles.mobile}>
            <div className={styles.dpad}><button aria-label="向前" {...hold('w')}>↑</button><button aria-label="向左" {...hold('a')}>←</button><button aria-label="向后" {...hold('s')}>↓</button><button aria-label="向右" {...hold('d')}>→</button></div>
            <div className={styles.actions}><button {...hold('f')} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add('f'); queue({ parry: true }); }} onClick={e => { if (e.detail === 0) queue({ parry: true }); }}>弹反 / 防御</button><button {...hold('shift')}>闪避 / 跑</button><button {...hold('k')} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add('k'); queue({ heavy: true }); }}>重击 / 蓄力</button>{[['轻击', 'light'], ['跳跃', 'jump'], ['喝水', 'heal'], ['锁定', 'lock']].map(([label, action]) => <button key={action} onPointerDown={e => { e.preventDefault(); queue({ [action]: true }); }} onClick={e => { if (e.detail === 0) queue({ [action]: true }); }}>{label}</button>)}</div>
          </div>
          {c.enabled && <div className={styles.keyHelp}>{usingPad ? padHelp : `${controls.current?.locked ? '鼠标转视角 · 按住 Alt 显示光标' : controls.current?.altHeld ? '松开 Alt 返回视角控制' : controls.current?.lockMessage || '点击画面捕获鼠标'} · WASD 移动 · 左 / 右键攻击 · 空格跳跃 · Shift 轻按闪避 / 按住跑`}</div>}
        </>
)}
        {boss && !panel && <div className={styles.boss}><p>{boss.name}<span>{BOSS_ROSTER[boss.kind] ? boss.phase === 2 ? BOSS_ROSTER[boss.kind]!.second : BOSS_ROSTER[boss.kind]!.first : boss.kind === 'nana' ? boss.phase === 2 ? '七潮叠浪' : '潮声初起' : boss.phase === 2 ? '夜曲 · 变奏' : '夜曲 · 序拍'}</span></p><div className={styles.meter}><i style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} /></div><div className={`${styles.meter} ${styles.posture}`}><i style={{ width: `${(boss.posture / boss.maxPosture) * 100}%` }} /></div></div>}
      </>
)}
      {panel && g.mode === 'playing' && (
<div className={styles.scrim}><section className={`${styles.panel} ${panel === 'map' ? styles.mapPanel : ''}`} role="dialog" data-menu-id={`${panel}-${g.haven.talking ?? ''}`} aria-modal="true" aria-label={panel === 'gear' ? '旅人行囊' : panel === 'bestiary' ? '雨夜图鉴' : panel === 'lamp' ? '雨灯歇息' : panel === 'forge' ? '雨灯锻造' : panel === 'story' ? '与归人交谈' : panel === 'journal' ? '归灯手记' : panel === 'map' ? '旧城与雾河地图' : panel === 'companion' ? '与精灵交谈' : '旅程暂停'}>
        <button data-game-close className={styles.close} onClick={backPanel} aria-label="关闭">×</button>
        <p className={styles.eyebrow}>雨暂时停在这一刻</p>
        {panel !== 'story' && <h2>{panel === 'gear' ? '选择下一程的行装' : panel === 'bestiary' ? '雨夜图鉴' : panel === 'lamp' ? targetLabel(g.nearbyId) : panel === 'forge' ? '收伞，试一把新刃' : panel === 'journal' ? '归灯手记' : panel === 'map' ? '旧城与雾河地图' : panel === 'companion' ? '我陪你慢慢找' : '歇一会儿'}</h2>}
        <small className={styles.menuHints}>{hint('confirm')} 确认 · {hint('back')} 返回{usingPad ? ' · 十字键 / 左摇杆选择，左右调节' : ''}</small>
        {panel === 'bestiary' ? <BestiaryPanel state={g} /> : panel === 'gear' ? <div className={styles.gear}><p>武器距离、速度和防具重量会改变打法。发现的遗物永久保留；在安全雨灯旁更换。</p><h3>武器</h3>{(Object.keys(WEAPONS) as GameState['weapon'][]).filter(id => weaponUnlocked(g, id)).map(id => <button data-game-primary={g.weapon === id || undefined} key={id} aria-pressed={g.weapon === id} disabled={!canForge(g)} onClick={() => { equipWeapon(g, id); save(); redraw(); }}>{WEAPONS[id].name}<small>轻击距离 {weaponAttack({ ...g, weapon: id }, 'light1').range.toFixed(2)} 米 · {WEAPONS[id].description}</small></button>)}<h3>防具</h3>{(Object.keys(ARMORS) as GameState['gear']['armor'][]).filter(id => !ARMORS[id].item || g.collected.includes(ARMORS[id].item)).map(id => <button key={id} aria-pressed={g.gear.armor === id} disabled={!canForge(g)} onClick={() => { equipArmor(g, id); save(); redraw(); }}>{ARMORS[id].name}<small>{ARMORS[id].description}</small></button>)}<h3>护符 · 1 个位置</h3>{(Object.keys(TALISMANS) as GameState['gear']['talisman'][]).filter(id => !TALISMANS[id].item || g.collected.includes(TALISMANS[id].item)).map(id => <button key={id} aria-pressed={g.gear.talisman === id} disabled={!canForge(g)} onClick={() => { equipTalisman(g, id); save(); redraw(); }}>{TALISMANS[id].name}<small>{TALISMANS[id].description}</small></button>)}</div> : panel === 'lamp' ? <div className={styles.lampTravel}><p>围着这盏雨灯，准备下一段旅程。</p><button data-game-primary onClick={() => { setPaused(g, false); interact(g); setPaused(g, true); setRecordedAt(g.time); save(); redraw(); }}>坐下休息 · 补满生命与药瓶</button><button disabled={g.level >= 15 || g.rice < upgradeCost(g)} onClick={() => { upgrade(g); save(); redraw(); }}>强化行装 +{g.level} · {upgradeCost(g)} 钱</button><button onClick={() => showPanel('forge')}>锻造与更换武器 · {WEAPONS[g.weapon].name}</button><button onClick={() => showPanel('gear')}>更换行装 · 武器 / 防具 / 护符</button><button onClick={() => showPanel('map')}>雨灯行旅 · 已开启 {g.litLamps.length} 处</button><button onClick={() => showPanel(null)}>离开雨灯</button><small>休息会复活普通敌人；传送保留当前补给。</small></div> : panel === 'forge' ? (
<div className={styles.forge}>
          <p>在灯火旁锻造，雨夜里选择自己的打法。武器和锻造进度会永久保留。</p>
          <p className={styles.forgeBalance}>夜市钱 {g.rice} · 当前握持 {WEAPONS[g.weapon].name}</p>
          {Object.entries(WEAPONS).filter(([, w]) => !('item' in w)).map(([id, w]) => (
<div key={id} className={styles.forgeWeapon}>
            <h3>{w.name}{g.weapon === id ? ' · 已握持' : ''}</h3><p>{w.description}</p>
            <small>轻击 {24 + w.lightDamage} · 重击 {41 + w.heavyDamage} · 轻击耗力 {17 + w.stamina}{w.tier === 2 ? ' · 击败栞栞后解锁' : ''}</small>
            {w.tier <= g.weaponLevel ? <button disabled={g.weapon === id} onClick={() => { equipWeapon(g, id as GameState['weapon']); save(); redraw(); }}>握持{w.name}</button> : <button disabled={w.tier !== g.weaponLevel + 1 || g.rice < w.cost || (w.tier === 2 && !g.bossDefeated)} onClick={() => { forgeWeapon(g); save(); redraw(); }}>锻造 · {w.cost} 夜市钱</button>}
          </div>
))}
          <button data-game-primary className={styles.primary} onClick={backPanel}>携刃出发</button>
        </div>
) : panel === 'story' || panel === 'journal' ? <><HavenPanel state={g} mode={panel} guide={id => { if (!c.enabled) c.enabled = true; guideTo(id); }} choose={choice => { if (chooseConversation(g, choice)) { save(); redraw(); if (!g.haven.talking) showPanel(null); } }} /><button onClick={() => showPanel(panel === 'story' ? 'journal' : null)}>{panel === 'story' ? '翻开归灯手记' : '继续旅程'}</button></> : panel === 'map' ? (
<>
          <p>{getObjective(g)}</p>
          <p className={styles.mapLegend}>冷蓝空灯 · 未点亮 / 暖金实灯 · 已点亮。传送需在安全的雨灯旁进行。</p>
          {g.chapterComplete && <p className={styles.mapLegend}>西岸水闸 {g.collected.includes('mill-sluice') ? '已开' : '未开'} · 东岸水闸 {g.collected.includes('monastery-sluice') ? '已开' : '未开'} · 渡船 {g.collected.includes('ferry-winch') ? '已恢复' : '待修缆'}</p>}
          <button onClick={() => showPanel('journal')}>归灯手记 · 人物与支路 {hint('journal')}</button>
          <WorldMap state={g} />
          {c.enabled && <button onClick={() => guideTo(g.collected.includes('food') ? mainTarget(g) : 'castle-note')}>沿主线带路 · {targetLabel(g.collected.includes('food') ? mainTarget(g) : 'castle-note')}</button>}
          {g.litLamps.length > 0 && (
<div className={styles.lampTravel}><p>雨灯行旅 · 前往已经点亮的雨灯</p>{g.litLamps.filter(id => id !== g.nearbyId).map(id => (
<button
key={id}
disabled={!canForge(g)}
onClick={() => {
            if (travelToLamp(g, id)) { c.position = { ...g.player }; c.path = []; c.targetId = null; c.status = 'following'; resetCamera(); showPanel(null); save(); }
          }}>前往{targetLabel(id)}</button>
))}<small className={styles.mapLegend}>保留血量和药瓶；补给请与雨灯交互。</small></div>
)}
          <button onClick={rescue}>脱离卡死 · 返回{g.checkpoint === 'room' ? '旅馆' : targetLabel(g.checkpoint)}</button>
          <small className={styles.mapLegend}>白点 · 你 · 菱灯 · 休息处 · 红线 · 闭门 · 青舟 · 渡埠<br />归灯 · {g.checkpoint === 'room' ? '旅馆' : targetLabel(g.checkpoint)} · 近道 {Number(g.shortcut) + Number(g.templeGate) + Number(g.harborGate) + g.chapterGates.filter(id => id !== 'archive-door').length + g.valleyGates.filter(id => ['cliff-gate', 'reed-gate'].includes(id)).length + Number(g.collected.includes('ferry-winch')) + g.haven.gates.filter(id => id !== 'well-door').length + Number(g.haven.recruits.includes('boatwright'))} / 13</small>
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
          <p>{getObjective(g)}</p><button data-game-primary className={styles.primary} onClick={() => showPanel(null)}>继续旅程</button>
          {settings}{soundSettings}
          <button onClick={() => showPanel('gear')}>旅人行囊 · 更换武器、防具和护符</button><button onClick={() => showPanel('bestiary')}>雨夜图鉴 · 击败后收录</button>
          <button onClick={() => showPanel('journal')}>归灯手记 · 人物与支路 {hint('journal')}</button>
          <button onClick={rescue}>脱离卡死 · 返回{g.checkpoint === 'room' ? '旅馆' : targetLabel(g.checkpoint)}</button>
          <p className={styles.rescueNote}>回到记录的落脚点，保留当前血量、药瓶与探索进度。</p>
          <details><summary>镜头设置</summary><div className={styles.lookSettings}>
            <label htmlFor="mouse-look-speed">鼠标视角速度<select id="mouse-look-speed" aria-label="鼠标视角速度" value={controls.current?.lookSettings.mouse ?? 1} onChange={e => { controls.current?.setLook({ mouse: Number(e.target.value) }); redraw(); }}>{[[0.6, '慢'], [1, '标准'], [1.5, '快'], [2, '很快']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label htmlFor="pad-look-speed">手柄视角速度<select id="pad-look-speed" aria-label="手柄视角速度" value={controls.current?.lookSettings.gamepad ?? 1} onChange={e => { controls.current?.setLook({ gamepad: Number(e.target.value) }); redraw(); }}>{[[0.6, '慢'], [1, '标准'], [1.5, '快'], [2, '很快']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className={styles.toggle} htmlFor="invert-look"><input id="invert-look" type="checkbox" checked={controls.current?.lookSettings.invertY ?? false} onChange={e => { controls.current?.setLook({ invertY: e.target.checked }); redraw(); }} />反转上下视角</label>
            <small>手柄十字键上下选择，左右调节速度。</small>
          </div></details>
          <details><summary>操作与战斗手记</summary><p>WASD 移动，鼠标直接转视角，按住 Alt 显示光标，松开继续。点击画面可重新捕获鼠标，Esc 释放并暂停。滚轮缩放，左键 / J 轻击，右键 / K 重击（按住蓄力），中键 / Q 锁定，空格跳跃，Shift 轻按松开闪避、按住疾跑，F 轻按弹反、按住防御（L 备用）、R 喝药回血、E 交互。</p><p>{padHelp}。{hint('interact')} 交互、{hint('heal')} 喝药、{hint('map')} 地图、{hint('companion')} 找精灵、{hint('journal')} 手记。菜单 {hint('confirm')} 确认 / {hint('back')} 返回；雨灯菜单可休息、锻造和行旅。</p><p>连续轻击可接横斩、返斩、挑斩。按住重击蓄力，蓄满会自动出手，提前松手为普通重击；疾跑中攻击会突刺或回旋，空中攻击会横斩或下砸。攻击起手可用方向键／摇杆或镜头修正朝向，出手后转向减弱。先看抬手姿势：高举重砸、侧身横扫、收刀居合、平举点射；蓄势别急，武器亮光时再弹反。持续按住可架伞防住正面攻击，消耗体力并受少量伤害；体力不足会破防。背后攻击与红色横扫无法防住。打空或贪刀会消耗体力；红色横扫用闪避。架势打满后靠近轻击处决。中庭雨灯首次交互只点火、记录复活点，不补给也不刷新敌人；再次交互免费休息，补满生命与药瓶并复活普通敌人。强化装备才消耗夜市钱。所有已开启的门、宝箱和药瓶升级会保留。中庭、榕树、经院、王寺、雾河渡村、竹寺与汇流台各有一盏补给雨灯；在灯旁打开地图，可前往已经点亮的雨灯。残钟雨寺、蓄水院和听瀑莲亭藏着提升瓶数的露瓶。第一关敲钟后，从钟台东侧后山门进入第二关。水车院与山寺两岸可任意顺序探索，亲手转动两闸后可进沉殿。修复水车院系缆后，渡船连接旧城、渡村与水车院。灵竹露增加每瓶恢复量，行装可升到十五级。旅馆南桥通往归灯庭：阿莲提供寄存钱币，庭灯可以休息和行旅。旧寺书房与盐仓船坞有可邀请的归人，按 N 查看手记与重读线索；交谈会暂停战斗。</p><p>手机左侧方向移动，右侧拖动镜头，动作按钮出招。C 找精灵，M 看地图，F10 全屏。</p></details>
          <div className={styles.row}><button onClick={fullscreen}>切换全屏</button><button onClick={resetCamera}>镜头归正</button><button onClick={title}>保存并返回标题 · 切换旅人</button><button onClick={() => setRestartConfirm(true)}>重新开始本档</button><Link href="/demos">离开旧城</Link></div>
        </>
)}
      </section></div>
)}
      {g.mode === 'interlude' && <Interlude state={g} done={() => { continueExploring(g); showPanel(null); resetCamera(); save(); }} guide={() => { continueExploring(g); guideTo(mainTarget(g)); resetCamera(); save(); }} />}
      {notice && !panel && <div key={notice.id} className={`${styles.soulNotice} ${notice.kind === 'death' ? styles.deathNotice : ''}`} role="status" data-soul-notice={notice.kind}><small>{notice.kind === 'death' ? 'YOU DIED' : 'BONFIRE LIT'}</small><strong>{notice.kind === 'death' ? '身 死' : '雨 灯 初 燃'}</strong><span>{notice.label}</span></div>}
      {((g.mode === 'dead' && notice?.kind !== 'death') || g.mode === 'ending') && (
<div className={styles.scrim}><section className={styles.panel} data-menu-id={g.mode} data-game-menu>
        <p className={styles.eyebrow}>{g.mode === 'dead' ? '雨灯未熄' : g.haven.ending ? '归灯暗线 · 灯下无名' : g.valleyComplete ? '第二关完成 · 雾河回响' : g.chapterComplete ? '第一关完成 · 长夜归灯' : '旅居手记 · 夜市小憩'}</p>
        <h2>{g.mode === 'dead' ? '再走一次就好' : g.haven.ending ? g.haven.ending === 'remember' ? '庭灯有名，归路有声' : '愿灯远行，空椅留温' : g.valleyComplete ? '钟声越山，愿灯归水' : g.chapterComplete ? '整座城，等到了钟声' : '吃饱了，继续北行'}</h2>
        <p>{g.mode === 'dead' ? (c.enabled ? '夜市钱留在倒下的地方。记住那一下起手，下次我们一起过去。' : '雨收走余温，灯替归人守夜。') : g.haven.ending ? g.haven.ending === 'remember' ? '你把被删掉的名字刻回庭灯。获得记名结：最大体力 +15。回到归灯庭，弥音、温叔与阿莲都有新的话想对你说。' : '你让未尽的愿灯顺水离开。获得归水结：每瓶恢复 +15。归灯庭会留下空椅，也会迎来新的归人。' : g.valleyComplete ? '两岸的水重新汇流。渡船又能回城，竹林里的风铃，也等到了归人。灯随雾河而下，我们仍可以沿路回去。' : g.chapterComplete ? '归夜钟终于响了。钟台东侧的后山门已经可以打开，沿山阶下去，第二关「雾河回响」正在等你。' : '炉火暖了胃。香料街在夜市北口，王寺的灯仍照着长夜。下一程，去城的高处。'}</p>
        <p>发现 {g.collected.filter(id => id !== 'laptop').length} 处 · 弹反 {g.parries} 次 · 开启近道 {Number(g.shortcut) + Number(g.templeGate) + Number(g.harborGate) + g.chapterGates.filter(id => id !== 'archive-door').length + g.valleyGates.filter(id => ['cliff-gate', 'reed-gate'].includes(id)).length + Number(g.collected.includes('ferry-winch')) + g.haven.gates.filter(id => id !== 'well-door').length + Number(g.haven.recruits.includes('boatwright'))} / 13 · 归灯 {g.checkpoint === 'room' ? '旅馆' : targetLabel(g.checkpoint)}</p>
        {g.mode === 'dead' ? <button data-game-primary className={styles.primary} onClick={() => { respawn(g); c.position = { ...g.player }; c.path = []; c.targetId = null; c.status = 'following'; showPanel(null); resetCamera(); save(); }}>回到雨灯</button> : <><button data-game-primary className={styles.primary} onClick={() => { continueExploring(g); showPanel(null); save(); }}>{g.haven.ending ? '回到旅途 · 重访归灯庭' : g.valleyComplete ? '继续探索两岸' : '继续探索旧城'}</button>{g.chapterComplete && !g.valleyComplete && <button onClick={() => { continueExploring(g); guideTo('valley-entry'); save(); }}>去雾河第二关</button>}{c.enabled && <button onClick={() => { continueExploring(g); guideTo('tide-note'); save(); }}>让精灵带我去潮汐港</button>}<button onClick={() => setRestartConfirm(true)}>再走一场雨夜</button><Link href="/demos">回到游戏实验室</Link></>}
      </section></div>
)}
      {sceneError && <div className={styles.scrim}><section className={styles.panel} role="alertdialog" aria-label="恢复游戏画面"><h2>画面暂时中断</h2><p>旅程已暂停，试试重新载入画面。</p><button className={styles.primary} onClick={() => { setSceneError(false); setReady(false); setSceneVersion(v => v + 1); }}>重新载入 3D 画面</button></section></div>}
      {restartConfirm && <div className={styles.scrim}><section className={styles.panel} role="alertdialog" aria-label="重新开始旅程"><h2>从下播那一刻重新开始？</h2><p>这会替换旅人 {slotView} 的本次旅程和探索记录；其他档位保留。</p><div className={styles.row}><button data-game-primary onClick={() => setRestartConfirm(false)}>保留旅程</button><button onClick={() => begin()}>重新出发</button></div></section></div>}
      {g.mode === 'playing' && audio.current && !audio.current.unlocked && !audio.current.settings.muted && <button className={styles.audioUnlock} onClick={() => audio.current?.unlock()}>点击或按键启用声音</button>}
      {storageError && <p className={styles.storage}>本机存档不可用，本次仍可继续游玩。</p>}
    </main>
  );
}
