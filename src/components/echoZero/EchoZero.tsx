"use client";

/** ECHO ZERO — controller: simulation loop, input, HUD, cinematics and save data. */

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Component, useCallback, useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import GameShareButton from "@/app/game/GameShareButton";
import { createAudio } from "./audio";
import {
  createGame, pushNotice, respawn, snapshot, startGame, stepGame, togglePause,
} from "./engine";
import { emptyInput, FLASK_MAX, type GameState, type Input } from "./types";
import { LEVEL } from "./world";
import styles from "./echoZero.module.css";

const WorldView = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => (
    <div className={styles.loading}>
      <span>正在接入第七区信号</span>
      <i />
      <span style={{ fontSize: 10, opacity: 0.6 }}>LOADING · ECHO ZERO</span>
    </div>
  ),
});

const SAVE_KEY = "echo-zero-v1";
const STEP_MS = 1000 / 60;

type GameWindow = Window & {
  echoZero?: {
    getState: () => ReturnType<typeof snapshot>;
    input: (action: Partial<Input>) => void;
    tap: (action: Partial<Input>) => void;
    start: (continueFromCheckpoint?: boolean) => void;
    respawn: () => void;
    pause: () => void;
    skipIntro: () => void;
    mute: (value: boolean) => void;
    save: () => void;
  };
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

type SceneBoundaryProps = { children: ReactNode; onError: (message: string) => void };

class SceneBoundary extends Component<SceneBoundaryProps, { failed: boolean }> {
  constructor(props: SceneBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error) {
    const { onError } = this.props;
    onError(error.message);
  }

  render() {
    const { failed } = this.state;
    const { children } = this.props;
    return failed ? null : children;
  }
}

const KEY_ACTIONS: Record<string, string> = {
  j: "light",
k: "heavy",
" ": "dodge",
f: "deflect",
q: "lock",
  l: "lock",
r: "heal",
e: "interact",
};

export default function EchoZero() {
  const stateRef = useRef<GameState>(createGame());
  const keys = useRef<Set<string>>(new Set());
  const edges = useRef<Record<string, boolean>>({});
  const externalTap = useRef<Partial<Input>>({});
  const held = useRef<Partial<Input>>({});
  const pointer = useRef({ down: false, button: 0, x: 0, y: 0, moved: 0 });
  const mouseDelta = useRef({ x: 0, y: 0 });
  const padPrev = useRef<Record<number, boolean>>({});
  const manualUntil = useRef(0);
  const skipIntro = useRef(false);
  const rootRef = useRef<HTMLElement>(null);
  const audio = useMemo(createAudio, []);
  const prev = useRef({ action: "idle", hits: 0, deflects: 0, deathblows: 0, hp: 130, checkpoint: false, boss: false, lock: false });
  const [, setView] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0);
  const helpRef = useRef(false);
  helpRef.current = help;

  const save = useCallback(() => {
    const s = stateRef.current;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        checkpointLit: s.checkpoint.lit,
        stage: s.stage,
        bossDefeated: s.bossDefeated,
        stats: s.stats,
      }));
      if (s.checkpoint.lit) setHasSave(true);
    } catch { /* storage may be unavailable in private mode */ }
  }, []);

  const begin = useCallback((continueFromCheckpoint = false) => {
    audio.start();
    startGame(stateRef.current, continueFromCheckpoint);
    skipIntro.current = false;
    prev.current = { action: "idle", hits: 0, deflects: 0, deathblows: 0, hp: 130, checkpoint: false, boss: false, lock: false };
    if (continueFromCheckpoint) prev.current.checkpoint = true;
    setView(v => v + 1);
  }, [audio]);

  // Restore a previous checkpoint (never restores combat state).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { checkpointLit?: boolean; stats?: GameState["stats"] };
        if (data.checkpointLit) {
          stateRef.current.checkpoint.lit = true;
          stateRef.current.stats.deaths = data.stats?.deaths ?? 0;
          setHasSave(true);
        }
      }
    } catch { /* ignore corrupt saves */ }
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    const target = window as GameWindow;
    const observe = () => {
      const p = s.player;
      const before = prev.current;
      if (p.action !== before.action) {
        if (["light1", "light2", "light3", "dashSlash"].includes(p.action)) audio.play("swing");
        if (p.action === "heavy") audio.play("heavy");
        if (p.action === "dodge") audio.play("dodge");
        if (p.action === "heal") audio.play("heal");
      }
      if (s.stats.deflects > before.deflects) audio.play("deflect");
      if (s.stats.deathblows > before.deathblows) audio.play("deathblow");
      if (p.hp < before.hp - 1) audio.play("hurt");
      else if (s.stats.hits > before.hits) audio.play("hit");
      if (s.checkpoint.lit && !before.checkpoint) { audio.play("checkpoint"); save(); }
      if (s.bossActive && !before.boss) audio.play("boss");
      if (s.lockId !== null && !before.lock) audio.play("lock");
      prev.current = {
        action: p.action,
hits: s.stats.hits,
deflects: s.stats.deflects,
        deathblows: s.stats.deathblows,
hp: p.hp,
checkpoint: s.checkpoint.lit,
        boss: s.bossActive,
lock: s.lockId !== null,
      };
    };

    const buildInput = (first: boolean): Input => {
      const k = keys.current;
      const base = emptyInput();
      const taps: Record<string, boolean> = first
        ? { ...edges.current, ...(externalTap.current as Record<string, boolean>) }
        : {};
      if (first) { edges.current = {}; externalTap.current = {}; }
      const axis = (positive: string[], negative: string[]) => (positive.some(key => k.has(key)) ? 1 : 0) - (negative.some(key => k.has(key)) ? 1 : 0);
      const gamepad = typeof navigator.getGamepads === "function" ? Array.from(navigator.getGamepads()).find(Boolean) : undefined;
      let gx = 0;
      let gz = 0;
      let gcx = 0;
      let gcy = 0;
      if (gamepad) {
        const dead = (v: number) => (Math.abs(v) > 0.18 ? v : 0);
        gx = dead(gamepad.axes[0] ?? 0);
        gz = dead(gamepad.axes[1] ?? 0);
        gcx = dead(gamepad.axes[2] ?? 0);
        gcy = dead(gamepad.axes[3] ?? 0);
        const pressed = (i: number) => !!gamepad.buttons[i]?.pressed;
        const edge = (i: number, name: string) => {
          if (pressed(i) && !padPrev.current[i]) taps[name] = true;
          padPrev.current[i] = pressed(i);
        };
        if (first) {
          edge(0, "dodge"); edge(2, "light"); edge(3, "heavy"); edge(4, "deflect");
          edge(5, "lock"); edge(6, "guard"); edge(1, "interact"); edge(9, "pause");
        }
      }
      const h = held.current;
      base.x = h.x ?? Math.max(-1, Math.min(1, axis(["d"], ["a"]) + gx));
      base.z = h.z ?? Math.max(-1, Math.min(1, axis(["s"], ["w"]) + gz));
      base.camX = (h.camX ?? 0) + axis(["arrowright"], ["arrowleft"]) * 0.8 + gcx + mouseDelta.current.x;
      base.camY = (h.camY ?? 0) + axis(["arrowdown"], ["arrowup"]) * 0.5 + gcy + mouseDelta.current.y;
      mouseDelta.current = { x: 0, y: 0 };
      base.sprint = h.sprint ?? (k.has("shift") || !!gamepad?.buttons[10]?.pressed);
      base.guard = h.guard ?? (k.has("c") || k.has("control"));
      base.light = h.light ?? !!taps.light;
      base.heavy = h.heavy ?? !!taps.heavy;
      base.dodge = !!taps.dodge;
      base.deflect = !!taps.deflect;
      base.heal = !!taps.heal;
      base.interact = !!taps.interact;
      base.lock = !!taps.lock;
      base.skip = skipIntro.current || (s.phase === "opening" && k.has("x"));
      return base;
    };

    const tick = (ms: number, first = true) => {
      const beforePhase = s.phase;
      stepGame(s, ms, buildInput(first));
      observe();
      if (beforePhase === "opening" && s.phase === "play") { skipIntro.current = false; save(); }
      if (beforePhase !== "ending" && s.phase === "ending") save();
      if (beforePhase !== "dead" && s.phase === "dead") save();
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastUi = 0;
    let lastSave = 0;
    const loop = (now: number) => {
      const delta = Math.min(100, now - last);
      last = now;
      if (now >= manualUntil.current) {
        acc += delta;
        let first = true;
        let steps = 0;
        while (acc >= STEP_MS && steps < 8) {
          tick(STEP_MS, first);
          acc -= STEP_MS;
          first = false;
          steps += 1;
        }
        if (steps >= 8) acc = 0;
      }
      if (now - lastUi > 80) { setView(v => v + 1); lastUi = now; }
      if (now - lastSave > 3000) { save(); lastSave = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    target.echoZero = {
      getState: () => snapshot(s),
      input: action => { held.current = { ...action }; },
      tap: action => { externalTap.current = { ...externalTap.current, ...action }; },
      start: cont => begin(cont ?? false),
      respawn: () => { respawn(s); setView(v => v + 1); },
      pause: () => { togglePause(s); setView(v => v + 1); },
      skipIntro: () => { skipIntro.current = true; },
      mute: value => audio.setMuted(value),
      save,
    };
    target.render_game_to_text = () => JSON.stringify({
      ...snapshot(s),
      camera: { yaw: Number(s.camera.yaw.toFixed(2)), pitch: Number(s.camera.pitch.toFixed(2)), distance: Number(s.camera.distance.toFixed(2)) },
      fade: Number(s.fade.toFixed(2)),
      canvas: document.querySelectorAll("canvas").length,
      phase: s.phase,
    });
    target.advanceTime = ms => {
      manualUntil.current = performance.now() + 1600;
      let left = Math.max(0, Math.min(60000, ms));
      let first = true;
      while (left > 0) {
        const step = Math.min(40, left);
        tick(step, first);
        left -= step;
        first = false;
      }
      setView(v => v + 1);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = event.key.toLowerCase();
      keys.current.add(key);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "tab"].includes(key)) event.preventDefault();
      if (event.repeat) return;
      const action = KEY_ACTIONS[key];
      if (action) edges.current[action] = true;
      if (key === "escape" || key === "p") {
        if (helpRef.current) setHelp(false);
        else if (s.phase === "title" || s.phase === "dead") { /* handled by panels */ } else togglePause(s);
      }
      if (key === "h") setHelp(v => !v);
      if (key === "enter") {
        if (s.phase === "title") begin(false);
        else if (s.phase === "dead") { respawn(s); setView(v => v + 1); } else if (s.phase === "ending") begin(false);
      }
      if (key === "x" && s.phase === "opening") skipIntro.current = true;
      setView(v => v + 1);
    };
    const onKeyUp = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    const clearInput = () => { keys.current.clear(); edges.current = {}; held.current = {}; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", clearInput);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setReady(false);
      setError("");
      setSceneVersion(v => v + 1);
    };
    const canvasHost = rootRef.current;
    canvasHost?.addEventListener("webglcontextlost", onContextLost);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearInput);
      document.removeEventListener("visibilitychange", clearInput);
      canvasHost?.removeEventListener("webglcontextlost", onContextLost);
      delete target.echoZero;
      delete target.render_game_to_text;
      delete target.advanceTime;
    };
  }, [audio, begin, save]);

  const onSceneError = useCallback((message: string) => { setError(message); setReady(true); }, []);
  const onSceneReady = useCallback(() => { setReady(true); }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 0) edges.current.light = true;
    if (event.button === 1) edges.current.deflect = true;
    pointer.current = { down: true, button: event.button, x: event.clientX, y: event.clientY, moved: 0 };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointer.current.down || pointer.current.button !== 2) return;
    const dx = event.clientX - pointer.current.x;
    const dy = event.clientY - pointer.current.y;
    pointer.current.x = event.clientX;
    pointer.current.y = event.clientY;
    pointer.current.moved += Math.abs(dx) + Math.abs(dy);
    mouseDelta.current.x += dx * 0.055;
    mouseDelta.current.y += dy * 0.035;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 2 && pointer.current.moved < 8) edges.current.heavy = true;
    pointer.current.down = false;
  };

  const s = stateRef.current;
  const p = s.player;
  const hpRatio = Math.max(0, p.hp / p.maxHp);
  const staminaRatio = Math.max(0, p.stamina / p.maxStamina);
  const postureRatio = Math.max(0, p.posture / p.maxPosture);
  const boss = s.enemies.find(e => e.kind === "boss" && e.active && !e.dead && e.state !== "deathblow");
  const staggerTarget = s.enemies.find(e => !e.dead && e.state === "stagger" && Math.hypot(e.x - p.x, e.z - p.z) < (e.kind === "boss" ? 3.5 : 2.8));
  const nearCheckpoint = !s.checkpoint.lit && Math.hypot(p.x - LEVEL.checkpoint.x, p.z - LEVEL.checkpoint.z) < 3.2;
  const danger = s.enemies.some(e => e.active && !e.dead && e.state === "tell" && e.attack === "shockwave" && Math.hypot(e.x - p.x, e.z - p.z) < 9);
  const deathFlash = s.effects.some(e => e.kind === "deathblow" && s.time - e.at < 0.34);
  const activeNotices = s.notices.filter(n => s.time - n.at < n.ttl).slice(-2);
  const cinematic = s.phase === "opening" || s.phase === "title" || s.phase === "ending";
  const inGame = s.phase === "play" || s.phase === "paused" || s.phase === "dead";
  const letterHeight = cinematic ? "9vh" : "0";

  return (
    <main className={styles.root} ref={rootRef} tabIndex={-1} data-mode={s.phase}>
      <div
        className={styles.world}
        role="presentation"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={event => event.preventDefault()}
      >
        <SceneBoundary key={sceneVersion} onError={onSceneError}>
          <WorldView stateRef={stateRef} onReady={onSceneReady} onError={onSceneError} />
        </SceneBoundary>
      </div>

      {!ready && !error && (
        <div className={styles.loading}>
          <span>正在接入第七区信号</span>
          <i />
          <span style={{ fontSize: 10, opacity: 0.6 }}>LOADING · ECHO ZERO</span>
        </div>
      )}
      {error && (
        <div className={styles.loading}>
          <span>渲染上下文异常</span>
          <span style={{ fontSize: 11, opacity: 0.75 }}>{error}</span>
          <button type="button" className={styles.secondary} onClick={() => { setError(""); setSceneVersion(v => v + 1); }}>
            重新载入场景
          </button>
        </div>
      )}

      <div className={styles.grade} />
      <div className={styles.scanlines} />
      <div className={`${styles.letterbox} ${styles.letterboxTop}`} style={{ height: letterHeight }} />
      <div className={`${styles.letterbox} ${styles.letterboxBottom}`} style={{ height: letterHeight }} />
      <div className={styles.hurt} style={{ opacity: Math.min(0.85, p.hurtFlash * 0.8) }} />
      <div className={styles.flash} style={{ opacity: deathFlash ? 0.85 : 0 }} />
      <div className={styles.fade} style={{ opacity: 1 - s.fade, pointerEvents: s.fade < 0.4 ? "auto" : "none" }} />

      {inGame && (
        <div className={styles.hud}>
          <div className={styles.vitals}>
            <div className={styles.nameplate}>
              <b>岁己</b><em>SUI</em><span>／ 断频刃</span>
            </div>
            <div className={`${styles.bar} ${styles.barHp}`}>
              <div className={styles.barHpGhost} style={{ width: `${hpRatio * 100}%` }} />
              <i style={{ width: `${hpRatio * 100}%` }} />
            </div>
            <div className={`${styles.bar} ${styles.barStamina}`}><i style={{ width: `${staminaRatio * 100}%` }} /></div>
            <div className={`${styles.bar} ${styles.barPosture}`}><i style={{ width: `${postureRatio * 100}%` }} /></div>
            <div className={styles.flasks}>
              <span>应急针</span>
              {Array.from({ length: FLASK_MAX }, (_, i) => (
                <span key={i} className={`${styles.flask} ${i >= p.flasks ? styles.flaskEmpty : ""}`} />
              ))}
              <span style={{ marginLeft: 6, opacity: 0.7 }}>R</span>
            </div>
          </div>

          <div className={styles.mission}>
            <div className={styles.area}>{s.areaName}</div>
            <div className={styles.objective}>{s.objective}</div>
            <div className={styles.chapter}>CHAPTER 00 · 雨落在第七区</div>
          </div>

          <div className={styles.topTools}>
            <button type="button" className={styles.toolBtn} onClick={() => setHelp(v => !v)}>操作 H</button>
            <button type="button" className={styles.toolBtn} onClick={() => togglePause(s)}>暂停 ESC</button>
            <button
type="button"
className={styles.toolBtn}
onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
              else rootRef.current?.requestFullscreen?.()?.catch(() => undefined);
            }}>
              全屏
            </button>
            <GameShareButton gamePath="/game/echo-zero" />
          </div>

          <div className={styles.centre}>
            {danger && <div className={styles.danger}>危</div>}
            {staggerTarget && s.phase === "play" && (
              <div className={styles.cue}><b>E</b> 忍杀 · DEATHBLOW</div>
            )}
            {!staggerTarget && nearCheckpoint && s.phase === "play" && (
              <div className={styles.cue}><b>E</b> 点亮信号塔</div>
            )}
            {s.lockId !== null && !staggerTarget && !danger && (
              <div style={{ fontSize: 11, letterSpacing: ".3em", color: "#ffd9a0", opacity: 0.75 }}>锁定中 · Q 解除</div>
            )}
          </div>

          {boss && (
            <div className={styles.bossBar}>
              <div className={styles.bossName}>零号 · 回声 / ECHO-00</div>
              <div className={styles.bossTrack}><i style={{ width: `${Math.max(0, boss.hp / boss.maxHp) * 100}%` }} /></div>
              <div className={styles.bossPosture}><i style={{ width: `${Math.max(0, boss.posture / boss.maxPosture) * 100}%` }} /></div>
            </div>
          )}

          <div className={styles.subtitles}>
            {activeNotices.map(n => (
              <div
                key={n.id}
                className={`${styles.notice} ${n.tone === "radio" ? styles.noticeRadio : n.tone === "danger" ? styles.noticeDanger : n.tone === "lore" ? styles.noticeLore : ""}`}
              >
                {n.text}
              </div>
            ))}
          </div>

          <div className={styles.controlsHint}>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动&nbsp;&nbsp;<kbd>Shift</kbd> 冲刺&nbsp;&nbsp;<kbd>Space</kbd> 闪避</div>
            <div><kbd>J</kbd>/左键 轻攻击&nbsp;&nbsp;<kbd>K</kbd>/右键 重攻击&nbsp;&nbsp;<kbd>F</kbd> 弹反&nbsp;&nbsp;<kbd>C</kbd> 格挡</div>
            <div><kbd>Q</kbd> 锁定&nbsp;&nbsp;<kbd>E</kbd> 交互 / 忍杀&nbsp;&nbsp;<kbd>R</kbd> 应急针&nbsp;&nbsp;方向键 转视角</div>
          </div>
          <div className={styles.statsPill}>
            弹反 {s.stats.deflects} · 忍杀 {s.stats.deathblows} · 倒下 {s.stats.deaths}
          </div>

          <div className={styles.touch}>
            <div className={styles.touchPad}>
              <span />
              <button type="button" onPointerDown={() => { held.current.z = -1; }} onPointerUp={() => { held.current.z = 0; }}>▲</button>
              <span />
              <button type="button" onPointerDown={() => { held.current.x = -1; }} onPointerUp={() => { held.current.x = 0; }}>◀</button>
              <button type="button" onPointerDown={() => { held.current.z = 1; }} onPointerUp={() => { held.current.z = 0; }}>▼</button>
              <button type="button" onPointerDown={() => { held.current.x = 1; }} onPointerUp={() => { held.current.x = 0; }}>▶</button>
            </div>
            <div className={styles.touchActions}>
              <button type="button" onPointerDown={() => { edges.current.light = true; }}>斩</button>
              <button type="button" onPointerDown={() => { edges.current.dodge = true; }}>闪</button>
              <button type="button" onPointerDown={() => { edges.current.deflect = true; }}>弹</button>
              <button type="button" onPointerDown={() => { edges.current.lock = true; }}>锁</button>
              <button type="button" onPointerDown={() => { edges.current.heal = true; }}>针</button>
              <button type="button" onPointerDown={() => { edges.current.interact = true; }}>E</button>
            </div>
          </div>
        </div>
      )}

      {s.phase === "opening" && (
        <div className={styles.hud}>
          <div style={{ position: "absolute", top: "12vh", right: 34 }}>
            <button type="button" className={styles.toolBtn} style={{ pointerEvents: "auto" }} onClick={() => { skipIntro.current = true; }}>
              跳过演出 X
            </button>
          </div>
          <div className={styles.subtitles}>
            {activeNotices.map(n => (
              <div key={n.id} className={`${styles.notice} ${n.tone === "radio" ? styles.noticeRadio : n.tone === "lore" ? styles.noticeLore : ""}`}>
                {n.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {s.phase === "title" && (
        <div className={styles.scrim} role="dialog" aria-label="标题画面">
          <div className={styles.panel}>
            <div className={styles.kicker}>岁己 SUI · 3D 动作冒险</div>
            <h1 className={styles.title}>零日余烬</h1>
            <div className={styles.titleEn}>E C H O &nbsp; Z E R O</div>
            <div className={styles.tagline}>
              第 214 天，雨没有停过。<br />
              第七区的最后一条信号里，<em>栞栞</em>还在叫你的名字。
            </div>
            <div className={styles.menuButtons}>
              <button type="button" className={styles.primary} data-game-primary onClick={() => begin(false)}>开始序章</button>
              {hasSave && (
                <button type="button" className={styles.secondary} onClick={() => begin(true)}>从信号塔继续</button>
              )}
              <button type="button" className={styles.secondary} onClick={() => setHelp(true)}>操作说明</button>
              <Link href="/demos" className={styles.secondary} style={{ textAlign: "center", textDecoration: "none" }}>返回游戏实验室</Link>
            </div>
            <div className={styles.footnote}>CHAPTER 00 · 雨落在第七区&nbsp;/&nbsp;DEMO BUILD 0.1</div>
          </div>
        </div>
      )}

      {s.phase === "paused" && !help && (
        <div className={styles.scrim} role="dialog" aria-label="暂停菜单" data-game-menu>
          <div className={styles.panel}>
            <div className={styles.kicker}>SIGNAL PAUSED</div>
            <h2 className={styles.helpTitle} style={{ marginTop: 18 }}>暂停</h2>
            <div className={styles.menuButtons}>
              <button type="button" className={styles.primary} data-game-primary onClick={() => togglePause(s)}>继续</button>
              <button type="button" className={styles.secondary} onClick={() => setHelp(true)}>操作说明</button>
              <button type="button" className={styles.secondary} onClick={() => { startGame(s, false); pushNotice(s, "序章重新开始。进度保存在信号塔。", "system"); setView(v => v + 1); }}>重新开始序章</button>
              <Link href="/demos" className={styles.secondary} style={{ textAlign: "center", textDecoration: "none" }}>离开第七区</Link>
            </div>
          </div>
        </div>
      )}

      {s.phase === "dead" && (
        <div className={styles.scrim} role="dialog" aria-label="死亡画面">
          <div className={styles.panel}>
            <div className={styles.deathWord}>死</div>
            <div className={styles.tagline} style={{ marginTop: 10 }}>
              {s.checkpoint.lit ? "信号塔会把你送回去。" : "雨还在下。再站起来一次。"}
            </div>
            <div className={styles.menuButtons}>
              <button type="button" className={styles.primary} data-game-primary onClick={() => { respawn(s); setView(v => v + 1); }}>
                {s.checkpoint.lit ? "于信号塔复苏" : "重新站起"}
              </button>
              <Link href="/demos" className={styles.secondary} style={{ textAlign: "center", textDecoration: "none" }}>离开第七区</Link>
            </div>
            <div className={styles.footnote}>ENTER 亦可继续</div>
          </div>
        </div>
      )}

      {s.phase === "ending" && (
        <div className={styles.scrim} role="dialog" aria-label="序章完成">
          <div className={styles.panel}>
            <div className={styles.kicker}>CHAPTER 00 · CLEAR</div>
            <h2 className={styles.title} style={{ fontSize: "clamp(32px, 5vw, 56px)" }}>序章 · 完</h2>
            <div className={styles.tagline}>
              零号信号消失了。雨还在下，<br />
              但第七区第一次，安静得像一个可以睡觉的地方。
            </div>
            <div className={styles.resultGrid}>
              <div>弹反<b>{s.stats.deflects}</b></div>
              <div>忍杀<b>{s.stats.deathblows}</b></div>
              <div>倒下<b>{s.stats.deaths}</b></div>
              <div>承伤<b>{Math.round(s.stats.damageTaken)}</b></div>
            </div>
            <div className={styles.menuButtons}>
              <button type="button" className={styles.primary} data-game-primary onClick={() => begin(false)}>再走一遍雨夜</button>
              <Link href="/demos" className={styles.secondary} style={{ textAlign: "center", textDecoration: "none" }}>返回游戏实验室</Link>
            </div>
            <div className={styles.footnote}>TO BE CONTINUED · 第七区之外</div>
          </div>
        </div>
      )}

      {help && (
        <div className={styles.scrim} role="dialog" aria-label="操作说明" data-game-menu style={{ zIndex: 12 }}>
          <div className={styles.panel}>
            <div className={styles.kicker}>CONTROLS</div>
            <h2 className={styles.helpTitle} style={{ marginTop: 14 }}>操作说明</h2>
            <div className={styles.helpGrid}>
              <div><span>移动 / 冲刺</span><kbd>WASD · Shift</kbd></div>
              <div><span>转视角</span><kbd>方向键 / 右键拖拽</kbd></div>
              <div><span>轻攻击（三段连招）</span><kbd>J · 鼠标左键</kbd></div>
              <div><span>重攻击 / 冲刺斩</span><kbd>K · 鼠标右键</kbd></div>
              <div><span>闪避翻滚（无敌帧）</span><kbd>Space</kbd></div>
              <div><span>弹反（击碎架势）</span><kbd>F · 鼠标中键</kbd></div>
              <div><span>格挡</span><kbd>C · Ctrl</kbd></div>
              <div><span>锁定 / 解除</span><kbd>Q</kbd></div>
              <div><span>应急针回血</span><kbd>R</kbd></div>
              <div><span>交互 / 忍杀</span><kbd>E</kbd></div>
              <div><span>暂停 / 帮助</span><kbd>Esc · H</kbd></div>
              <div><span>跳过开场</span><kbd>X</kbd></div>
            </div>
            <div className={styles.tagline} style={{ fontSize: 12 }}>
              红光是起手：命中前一瞬按 <b>F</b> 弹反，或 <b>Space</b> 闪开。<br />
              架势被打满时靠近按 <b>E</b> 忍杀。信号塔可以休息、补满并作为复活点。
            </div>
            <div className={styles.menuButtons}>
              <button type="button" className={styles.primary} data-game-close onClick={() => setHelp(false)}>明白了</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
