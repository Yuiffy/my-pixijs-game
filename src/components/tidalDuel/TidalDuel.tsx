"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WIDTH, HEIGHT, STEP, createGame, startGame, stepGame, emptyInput, describeGame, skipTransition, resetTraining } from "./engine";
import type { Action, Side, Input, Options, Game, Mode, Difficulty } from "./engine";
import { FIGHTERS, getFighter } from "./roster";
import { loadAssets, renderGame } from "./renderer";
import type { Assets } from "./renderer";
import DuelAudio from "./audio";
import styles from "./tidalDuel.module.css";

type DuelWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
  tidalDuel?: { game: () => Game; input: (side: Side, action: Action, down: boolean) => void; manual: (value: boolean) => void };
};
const INITIAL: Options = { mode: "solo", character: "sui", opponent: "shiori", difficulty: "normal", dummy: "idle", roundSeconds: 60 };
const KEYS: Record<string, [Side, Action]> = {
  KeyA: [0, "left"],
KeyD: [0, "right"],
KeyW: [0, "jump"],
KeyS: [0, "crouch"],
  KeyJ: [0, "punch"],
KeyK: [0, "kick"],
KeyL: [0, "guard"],
KeyU: [0, "hold"],
KeyI: [0, "throw"],
KeyO: [0, "special"],
ShiftLeft: [0, "sidestep"],
  ArrowLeft: [1, "left"],
ArrowRight: [1, "right"],
ArrowUp: [1, "jump"],
ArrowDown: [1, "crouch"],
  Numpad1: [1, "punch"],
Numpad2: [1, "kick"],
Numpad3: [1, "guard"],
Numpad4: [1, "hold"],
Numpad5: [1, "throw"],
Numpad6: [1, "special"],
ShiftRight: [1, "sidestep"],
  Digit1: [1, "punch"],
Digit2: [1, "kick"],
Digit3: [1, "guard"],
Digit4: [1, "hold"],
Digit5: [1, "throw"],
Digit6: [1, "special"],
};
const CONTROLS: [Action, string, string][] = [
  ["left", "←", "A"], ["right", "→", "D"], ["jump", "跳", "W"], ["crouch", "蹲", "S"],
  ["punch", "拳", "J"], ["kick", "踢", "K"], ["guard", "防", "L"], ["hold", "反", "U"], ["throw", "投", "I"], ["sidestep", "闪", "⇧"], ["special", "必杀", "O"],
];
const snapshot = (g: Game): Game => ({ ...g, fighters: [{ ...g.fighters[0] }, { ...g.fighters[1] }], wins: [...g.wins], training: { ...g.training } });

export default function TidalDuel() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const gameRef = useRef<Game>(createGame(INITIAL));
  const assetsRef = useRef<Assets | null>(null);
  const inputsRef = useRef<[Input, Input]>([emptyInput(), emptyInput()]);
  const sourcesRef = useRef(new Map<string, [Side, Action]>());
  const audioRef = useRef<DuelAudio | null>(null);
  const overlayRef = useRef<string | null>(null);
  const [options, setOptions] = useState<Options>(INITIAL);
  const [view, setView] = useState(() => snapshot(gameRef.current));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [overlay, setOverlay] = useState<"help" | "exit" | null>(null);
  const [bestCombo, setBestCombo] = useState(0);
  const sync = useCallback(() => setView(snapshot(gameRef.current)), []);
  const clearInputs = useCallback(() => {
    sourcesRef.current.clear();
    inputsRef.current = [emptyInput(), emptyInput()];
    gameRef.current.fighters.forEach(fighter => {
      fighter.buffer = [];
      fighter.previous = emptyInput();
      fighter.aiPlan = emptyInput();
      fighter.aiTimer = 0;
    });
  }, []);
  const input = useCallback((source: string, side: Side, action: Action, down: boolean) => {
    if (down && (overlayRef.current || gameRef.current.paused || gameRef.current.phase !== "fight")) return;
    if (down) sourcesRef.current.set(source, [side, action]);
    else sourcesRef.current.delete(source);
    inputsRef.current[side][action] = Array.from(sourcesRef.current.values()).some(([s, a]) => s === side && a === action);
  }, []);
  const pause = useCallback(() => {
    const g = gameRef.current;
    if (overlayRef.current || g.phase === "menu" || g.phase === "result") return;
    g.paused = !g.paused;
    clearInputs();
    sync();
  }, [clearInputs, sync]);
  const fullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch { /* Fullscreen is optional on mobile browsers. */ }
  }, []);
  const openOverlay = useCallback((value: "help" | "exit") => {
    overlayRef.current = value;
    setOverlay(value);
    if (gameRef.current.phase !== "menu") gameRef.current.paused = true;
    clearInputs();
    sync();
  }, [clearInputs, sync]);
  const closeOverlay = useCallback(() => {
    overlayRef.current = null;
    setOverlay(null);
    sync();
  }, [sync]);
  const choose = (next: Partial<Options>) => {
    const merged = { ...options, ...next };
    if (next.character) merged.opponent = FIGHTERS.find(f => f.id !== next.character)?.id ?? next.character;
    setOptions(merged);
    gameRef.current = createGame(merged);
    sync();
  };
  const begin = () => {
    clearInputs();
    audioRef.current?.reset();
    audioRef.current?.unlock();
    gameRef.current = createGame(options, Date.now() % 4294967296);
    startGame(gameRef.current);
    sync();
  };
  const menu = () => {
    clearInputs();
    closeOverlay();
    gameRef.current = createGame(options);
    sync();
  };

  useEffect(() => {
    let alive = true;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastUi = 0;
    let manual = false;
    const audio = new DuelAudio();
    audioRef.current = audio;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = window as DuelWindow;
    const draw = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && assetsRef.current) renderGame(ctx, assetsRef.current, gameRef.current, reduced.matches, window.innerWidth <= 700);
    };
    const tick = () => {
      stepGame(gameRef.current, inputsRef.current, STEP);
      audio.events(gameRef.current.events);
    };
    target.render_game_to_text = () => JSON.stringify({ ...describeGame(gameRef.current), assetsReady: !!assetsRef.current, overlay: overlayRef.current });
    target.advanceTime = ms => {
      for (let i = 0; i < Math.round(Math.max(0, Math.min(ms, 120000)) / (STEP * 1000)); i++) tick();
      draw();
      sync();
    };
    if (process.env.NODE_ENV !== "production") target.tidalDuel = {
      game: () => gameRef.current,
      input: (side, action, down) => { inputsRef.current[side][action] = down; },
      manual: value => { manual = value; accumulator = 0; },
    };
    loadAssets().then(assets => {
      if (alive) { assetsRef.current = assets; setReady(true); draw(); }
    }).catch(reason => { if (alive) setError(String(reason)); });
    try {
      const stored = Number(localStorage.getItem("tidal-duel-best-combo") || 0);
      if (Number.isFinite(stored) && stored >= 0) setBestCombo(Math.min(99, stored));
      const quiet = localStorage.getItem("tidal-duel-muted") === "true";
      audio.setEnabled(!quiet);
      setMuted(quiet);
    } catch { /* Records are optional when storage is unavailable. */ }
    setPreferencesReady(true);
    const pollGamepad = () => {
      const pads = navigator.getGamepads?.() ?? [];
      for (const side of [0, 1] as Side[]) {
        const pad = pads[side];
        if (side === 1 && gameRef.current.options.mode !== "local") continue;
        const axis = pad?.axes[0] ?? 0;
        const vertical = pad?.axes[1] ?? 0;
        const mappings: [Action, boolean][] = [
          ["left", axis < -0.35 || !!pad?.buttons[14]?.pressed], ["right", axis > 0.35 || !!pad?.buttons[15]?.pressed],
          ["crouch", vertical > 0.35 || !!pad?.buttons[13]?.pressed], ["jump", vertical < -0.35 || !!pad?.buttons[12]?.pressed],
          ["punch", !!pad?.buttons[0]?.pressed], ["kick", !!pad?.buttons[1]?.pressed], ["guard", !!pad?.buttons[4]?.pressed],
          ["hold", !!pad?.buttons[2]?.pressed], ["throw", !!pad?.buttons[3]?.pressed], ["sidestep", !!pad?.buttons[5]?.pressed], ["special", !!pad?.buttons[7]?.pressed],
        ];
        mappings.forEach(([action, down]) => input(`pad:${side}:${action}`, side, action, down));
      }
    };
    const loop = (now: number) => {
      const elapsed = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!manual && assetsRef.current) {
        pollGamepad();
        accumulator += elapsed;
        while (accumulator >= STEP) { tick(); accumulator -= STEP; }
      }
      draw();
      if (now - lastUi > 90) { sync(); lastUi = now; }
      frame = requestAnimationFrame(loop);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
      if (overlayRef.current) {
        if (event.code === "Escape") { event.preventDefault(); closeOverlay(); }
        return;
      }
      if (event.code === "KeyP" || event.code === "Escape") { if (!event.repeat) pause(); event.preventDefault(); return; }
      if (event.code === "KeyF") { if (!event.repeat) fullscreen(); return; }
      const g = gameRef.current;
      if (g.phase === "menu" || g.phase === "result") return;
      if (event.code === "Enter" && !(event.target instanceof HTMLButtonElement)) { skipTransition(g); sync(); event.preventDefault(); return; }
      const mapping = KEYS[event.code];
      if (mapping) {
        event.preventDefault();
        input(`key:${event.code}`, g.options.mode === "local" ? mapping[0] : 0, mapping[1], true);
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const mapping = KEYS[event.code];
      if (mapping) input(`key:${event.code}`, gameRef.current.options.mode === "local" ? mapping[0] : 0, mapping[1], false);
    };
    const blur = () => {
      clearInputs();
      const g = gameRef.current;
      if (g.phase !== "menu" && g.phase !== "result") { g.paused = true; sync(); }
    };
    const visibility = () => { if (document.hidden) blur(); };
    frame = requestAnimationFrame(loop);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      audio.dispose();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      delete target.render_game_to_text;
      delete target.advanceTime;
      delete target.tidalDuel;
    };
  }, [clearInputs, closeOverlay, fullscreen, input, pause, sync]);

  useEffect(() => {
    if (!preferencesReady) return;
    audioRef.current?.setEnabled(!muted);
    try { localStorage.setItem("tidal-duel-muted", String(muted)); } catch { /* Optional preference. */ }
  }, [muted, preferencesReady]);
  useEffect(() => {
    const combo = Math.max(...view.fighters.map(f => f.combo), view.training.maxCombo);
    if (combo > bestCombo) {
      setBestCombo(combo);
      try { localStorage.setItem("tidal-duel-best-combo", String(combo)); } catch { /* Optional record. */ }
    }
  }, [view.fighters, view.training.maxCombo, bestCombo]);
  useEffect(() => {
    if (!overlay) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const stage = stageRef.current;
    if (stage) stage.inert = true;
    const modal = modalRef.current;
    modal?.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.code !== "Tab" || !modal) return;
      const buttons = Array.from(modal.querySelectorAll<HTMLElement>("button, a[href], select"));
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); } else if (!event.shiftKey && index === buttons.length - 1) { event.preventDefault(); buttons[0]?.focus(); }
    };
    window.addEventListener("keydown", trap);
    return () => { if (stage) stage.inert = false; window.removeEventListener("keydown", trap); previous?.focus(); };
  }, [overlay]);

  const isMenu = view.phase === "menu";
  const isResult = view.phase === "result";
  const active = !isMenu && !isResult;
  const selected = getFighter(options.character);
  const winner = view.winner === null ? null : getFighter(view.fighters[view.winner].character);
  const controls = (side: Side) => (
    <div className={styles.controlBank} key={side} aria-label={`玩家${side === 0 ? "一" : "二"}操作`}>
      {options.mode === "local" && <span className={styles.bankLabel}>{side + 1}P</span>}
      {CONTROLS.map(([action, label, key]) => (
        <button
type="button"
key={action}
data-control={`${side}-${action}`}
          className={`${action === "special" ? styles.special : ""} ${action === "punch" || action === "kick" ? styles.strike : ""}`}
          aria-label={`玩家${side === 0 ? "一" : "二"}${label}`}
disabled={view.paused || !!overlay || view.phase !== "fight"}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            input(`pointer:${event.pointerId}`, side, action, true);
            audioRef.current?.unlock();
          }}
          onPointerUp={event => input(`pointer:${event.pointerId}`, side, action, false)}
          onPointerCancel={event => input(`pointer:${event.pointerId}`, side, action, false)}
          onLostPointerCapture={event => input(`pointer:${event.pointerId}`, side, action, false)}
          onKeyDown={event => {
            if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); input(`button:${side}:${action}:${event.code}`, side, action, true); }
          }}
          onKeyUp={event => {
            if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); input(`button:${side}:${action}:${event.code}`, side, action, false); }
          }}
          onBlur={() => { input(`button:${side}:${action}:Space`, side, action, false); input(`button:${side}:${action}:Enter`, side, action, false); }}>
          <span>{label}</span><kbd>{side === 0 ? key : action === "sidestep" ? "⇧" : ["left", "right", "jump", "crouch"].includes(action) ? label : String(["punch", "kick", "guard", "hold", "throw", "special"].indexOf(action) + 1)}</kbd>
        </button>
      ))}
    </div>
  );
  return (
    <div className={`${styles.root} ${active && view.options.mode === "local" ? styles.localRoot : ""}`} ref={rootRef}>
      <div ref={stageRef} className={styles.workspace}>
        <header className={styles.header}>
          <Link href="/demos">← <span>游戏大厅</span></Link>
          <span className={styles.brand}>晴海对决 <i>TIDAL DUEL</i></span>
          <div className={styles.tools}>
            <button type="button" aria-label="玩法" onClick={() => openOverlay("help")}>?</button>
            <button type="button" aria-label={muted ? "开启声音" : "静音"} aria-pressed={muted} onClick={() => { audioRef.current?.unlock(); setMuted(!muted); }}>{muted ? "♫ ×" : "♫"}</button>
            <button type="button" aria-label="全屏" onClick={fullscreen}>⛶</button>
            {active && <button type="button" aria-label={view.paused ? "继续对决" : "暂停"} onClick={pause}>{view.paused ? "▶" : "Ⅱ"}</button>}
          </div>
        </header>
        {active && (
        <div className={styles.mobileHud} aria-label="对战状态">
          <div className={styles.mobileFighter}><b>{getFighter(view.fighters[0].character).name}<small>{Math.round(view.fighters[0].hp)} / 300</small></b><div className={styles.mobileHealth}><i style={{ width: `${view.fighters[0].hp / 3}%` }} /></div><span>气势 {Math.round(view.fighters[0].meter)}%</span></div>
          <div className={styles.mobileTimer}><b>{view.options.mode === "training" ? "∞" : Math.ceil(view.roundTimer)}</b><span>{view.wins[0]} : {view.wins[1]}</span></div>
          <div className={styles.mobileFighter}><b>{getFighter(view.fighters[1].character).name}<small>{Math.round(view.fighters[1].hp)} / 300</small></b><div className={styles.mobileHealth}><i style={{ width: `${view.fighters[1].hp / 3}%` }} /></div><span>气势 {Math.round(view.fighters[1].meter)}%</span></div>
        </div>
        )}
        <main className={`${styles.stage} ${isMenu ? styles.menuStage : ""}`}>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="岁己与栞栞的晴海格斗擂台">请使用支持 Canvas 的浏览器。</canvas>
          {!ready && <div className={styles.loading}><span />{error || "正在准备晴海擂台…"}{error && <button type="button" onClick={() => window.location.reload()}>重新加载</button>}</div>}
          {ready && isMenu && (
<section className={styles.menu} aria-label="角色与对战设置">
            <div className={styles.eyebrow}>SUI × SHIORI / ISLAND FIGHTERS</div>
            <h1>晴海<span>对决</span><small>TIDAL DUEL</small></h1>
            <p className={styles.tagline}>海风吹起。认真过两招。</p>
            <div className={styles.characters}>{FIGHTERS.map(f => (
<button type="button" key={f.id} aria-pressed={options.character === f.id} onClick={() => choose({ character: f.id })}>
              <b>{f.name}</b><span>{f.id.toUpperCase()}</span><small>{f.style}</small>
            </button>
))}</div>
            <div className={styles.modes}>{([["solo", "单人挑战"], ["local", "同机双人"], ["training", "自由练习"]] as [Mode, string][]).map(([mode, label]) => <button type="button" key={mode} aria-pressed={options.mode === mode} onClick={() => choose({ mode })}>{label}</button>)}</div>
            <div className={styles.settings}>
              <label htmlFor="duel-opponent">对手角色<select id="duel-opponent" value={options.opponent} onChange={e => choose({ opponent: e.target.value })}>{FIGHTERS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              {options.mode === "solo" && <label htmlFor="duel-difficulty">对手难度<select id="duel-difficulty" value={options.difficulty} onChange={e => choose({ difficulty: e.target.value as Difficulty })}><option value="easy">初遇 · 轻松</option><option value="normal">过招 · 标准</option><option value="hard">争锋 · 挑战</option></select></label>}
              {options.mode === "training" && <label htmlFor="duel-dummy">练习对手<select id="duel-dummy" value={options.dummy} onChange={e => choose({ dummy: e.target.value as Options["dummy"] })}><option value="idle">站立木桩</option><option value="guard">自动防御</option><option value="cpu">实战陪练</option></select></label>}
              <span>{options.mode === "training" ? "不限时 · 开局满气势" : "60 秒 / 三局两胜"}</span>
            </div>
            <button type="button" id="tidal-start" className={styles.start} onClick={begin}>{options.mode === "training" ? "开始练习" : "开始对决"}<span>↗</span></button>
            <div className={styles.menuFoot}><button type="button" onClick={() => openOverlay("help")}>出招与反击 ↗</button><span>最佳连击 {String(bestCombo).padStart(2, "0")}</span></div>
          </section>
)}
          {ready && isMenu && <div className={styles.caption}><span>{selected.name}</span><small>{selected.subtitle} / {selected.superName}</small></div>}
          {active && (
<>
            <div className={styles.srOnly} role="status">第 {view.round} 局，{view.fighters.map(f => `${getFighter(f.character).name} 生命 ${Math.round(f.hp)} 气势 ${Math.round(f.meter)}`).join("，")}，{view.event}</div>
            {(view.phase === "intro" || view.phase === "roundEnd") && !view.paused && <button type="button" className={styles.skip} onClick={() => { skipTransition(gameRef.current); clearInputs(); sync(); }}>继续 ↗ <kbd>Enter</kbd></button>}
            {view.options.mode === "training" && <div className={styles.training}><span>TRAINING LAB</span><b>{view.training.hits} HIT · {Math.round(view.training.damage)} DAMAGE</b><button type="button" onClick={() => { resetTraining(gameRef.current); clearInputs(); sync(); }}>重置站位</button></div>}
            {view.paused && !overlay && <section className={styles.pause} aria-label="对决已暂停"><span>TAKE A BREATH</span><h2>海风稍歇</h2><p>准备好再继续。</p><button type="button" className={styles.start} onClick={pause}>继续对决 →</button><button type="button" onClick={() => openOverlay("exit")}>返回选人</button></section>}
          </>
)}
          {isResult && <section className={styles.result} aria-label="对决结果"><span>MATCH COMPLETE</span><h2>{winner ? `${winner.name}，胜出` : "势均力敌"}</h2><p>{view.wins[0]} : {view.wins[1]} · 最佳连击 {bestCombo}</p><button type="button" className={styles.start} onClick={begin}>再战一场 ↗</button><button type="button" onClick={menu}>返回选人</button></section>}
        </main>
        {active && <footer className={styles.controls}>{controls(0)}{options.mode === "local" && controls(1)}<div className={styles.controlFoot}><span>拳脚压投技 · 投技破防反 · 反击截拳脚</span><button type="button" onClick={() => openOverlay("exit")}>返回选人</button></div></footer>}
      </div>
      {overlay && (
<div className={styles.scrim}><section ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="duel-dialog-title">
        <button type="button" className={styles.close} aria-label="关闭" onClick={closeOverlay}>×</button>
        {overlay === "exit" ? <><span className={styles.eyebrow}>LEAVE THE ARENA</span><h2 id="duel-dialog-title">返回选人？</h2><p>本场比分将清空，连击纪录会保留。</p><div className={styles.modalActions}><button type="button" onClick={closeOverlay}>留在擂台</button><button type="button" className={styles.start} onClick={menu}>返回选人</button></div></> : (
<>
          <span className={styles.eyebrow}>FIGHTER GUIDE</span><h2 id="duel-dialog-title">读懂对手，再出招。</h2>
          <div className={styles.triangle}><b>拳 / 脚</b><span>→</span><b>投技</b><span>→</span><b>反击</b><span>→ 拳 / 脚</span></div>
          <p>拳脚打断投技。投技抓住防御与反击的空当。反击只在短窗口内生效，猜错会留下破绽。</p>
          <table><thead><tr><th>动作</th><th>1P</th><th>2P</th></tr></thead><tbody>
            <tr><td>移动 / 跳 / 蹲</td><td>A D / W / S</td><td>← → / ↑ / ↓</td></tr>
            <tr><td>拳 / 踢 / 防御</td><td>J / K / L</td><td>1 / 2 / 3</td></tr>
            <tr><td>反击 / 投技 / 必杀</td><td>U / I / O</td><td>4 / 5 / 6</td></tr>
            <tr><td>侧闪</td><td>左 Shift</td><td>右 Shift</td></tr>
          </tbody></table>
          <p><b>上中下段：</b>站立防御挡上、中段；蹲防挡下段。U 反中段，W + U 反上段，S + U 反下段。侧闪躲直拳，回旋踢能追踪。</p>
          <p><b>连招：</b>J → J → K 浮空，J → K 突进，K → K 回旋。恢复前按下一招可预输入。蹲下出拳脚是下段。满气势 O 发动角色必杀。</p>
          <p className={styles.helpFoot}>P / Esc 暂停 · F 全屏 · 支持触屏与标准手柄：A 拳、B 踢、X 反、Y 投、LB 防、RB 闪、RT 必杀。切到其他页面会自动暂停。</p>
          <button type="button" className={styles.start} onClick={closeOverlay}>明白了，去过招 →</button>
        </>
)}
      </section></div>
)}
    </div>
  );
}
