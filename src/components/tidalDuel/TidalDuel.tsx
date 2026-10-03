"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  WIDTH,
  HEIGHT,
  STEP,
  createGame,
  startGame,
  stepGame,
  emptyInput,
  describeGame,
  skipTransition,
  resetTraining,
} from "./engine";
import type {
  Action,
  Side,
  Input,
  Options,
  Game,
  Mode,
  Difficulty,
} from "./engine";
import { FIGHTERS, getFighter } from "./roster";
import { loadAssets, renderGame, pixelFrame } from "./renderer";
import type { Assets } from "./renderer";
import DuelAudio from "./audio";
import {
  MODERN_KEYS as KEYS,
  MODERN_CONTROLS as CONTROLS,
  modernGamepad,
} from "./controls";
import styles from "./tidalDuel.module.css";

type DuelWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
  tidalDuel?: {
    game: () => Game;
    input: (side: Side, action: Action, down: boolean) => void;
    manual: (value: boolean) => void;
  };
};
const INITIAL: Options = {
  mode: "solo",
  character: "sui",
  opponent: "shiori",
  difficulty: "normal",
  dummy: "idle",
  roundSeconds: 60,
  skin: "original",
  opponentSkin: "original",
};
const snapshot = (g: Game): Game => ({
  ...g,
  fighters: [{ ...g.fighters[0] }, { ...g.fighters[1] }],
  wins: [...g.wins],
  training: { ...g.training },
});

export default function TidalDuel() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const gameRef = useRef<Game>(createGame(INITIAL));
  const assetsRef = useRef<Assets | null>(null);
  const inputsRef = useRef<[Input, Input]>([emptyInput(), emptyInput()]);
  const sourcesRef = useRef(new Map<string, [Side, Action]>());
  const blockedSourcesRef = useRef(new Set<string>());
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
    sourcesRef.current.forEach((_, source) => blockedSourcesRef.current.add(source),);
    sourcesRef.current.clear();
    inputsRef.current = [emptyInput(), emptyInput()];
    gameRef.current.fighters.forEach((fighter) => {
      fighter.buffer = [];
      fighter.previous = emptyInput();
      fighter.aiPlan = emptyInput();
      fighter.aiTimer = 0;
      fighter.directions = [];
      fighter.throwTech = 0;
      fighter.assisted = null;
    });
  }, []);
  const input = useCallback(
    (source: string, side: Side, action: Action, down: boolean) => {
      if (
        down &&
        (overlayRef.current ||
          gameRef.current.paused ||
          gameRef.current.phase !== "fight")
      ) {
        blockedSourcesRef.current.add(source);
        return;
      }
      if (down && blockedSourcesRef.current.has(source)) return;
      if (!down) blockedSourcesRef.current.delete(source);
      if (down) sourcesRef.current.set(source, [side, action]);
      else sourcesRef.current.delete(source);
      inputsRef.current[side][action] = Array.from(
        sourcesRef.current.values(),
      ).some(([s, a]) => s === side && a === action);
    },
    [],
  );
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
    } catch {
      /* Fullscreen is optional on mobile browsers. */
    }
  }, []);
  const openOverlay = useCallback(
    (value: "help" | "exit") => {
      overlayRef.current = value;
      setOverlay(value);
      if (gameRef.current.phase !== "menu") gameRef.current.paused = true;
      clearInputs();
      sync();
    },
    [clearInputs, sync],
  );
  const closeOverlay = useCallback(() => {
    overlayRef.current = null;
    setOverlay(null);
    sync();
  }, [sync]);
  const choose = (next: Partial<Options>) => {
    const merged = { ...options, ...next };
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
      if (ctx && assetsRef.current) renderGame(
          ctx,
          assetsRef.current,
          gameRef.current,
          reduced.matches,
          window.innerWidth <= 700,
        );
    };
    const tick = () => {
      stepGame(gameRef.current, inputsRef.current, STEP);
      audio.events(gameRef.current.events);
    };
    target.render_game_to_text = () => JSON.stringify({
        ...describeGame(gameRef.current),
        assetsReady: !!assetsRef.current,
        overlay: overlayRef.current,
        art: "tidal-pixel-v2",
        animation: gameRef.current.fighters.map((f) => pixelFrame(f, reduced.matches),),
      });
    target.advanceTime = (ms) => {
      for (
        let i = 0;
        i < Math.round(Math.max(0, Math.min(ms, 120000)) / (STEP * 1000));
        i++
      ) tick();
      draw();
      sync();
    };
    if (process.env.NODE_ENV !== "production") target.tidalDuel = {
        game: () => gameRef.current,
        input: (side, action, down) => {
          inputsRef.current[side][action] = down;
        },
        manual: (value) => {
          manual = value;
          accumulator = 0;
        },
      };
    loadAssets()
      .then((assets) => {
        if (alive) {
          assetsRef.current = assets;
          setReady(true);
          draw();
        }
      })
      .catch((reason) => {
        if (alive) setError(String(reason));
      });
    try {
      const stored = Number(localStorage.getItem("tidal-duel-best-combo") || 0);
      if (Number.isFinite(stored) && stored >= 0) setBestCombo(Math.min(99, stored));
      const quiet = localStorage.getItem("tidal-duel-muted") === "true";
      audio.setEnabled(!quiet);
      setMuted(quiet);
    } catch {
      /* Records are optional when storage is unavailable. */
    }
    setPreferencesReady(true);
    const pollGamepad = () => {
      const pads = navigator.getGamepads?.() ?? [];
      for (const side of [0, 1] as Side[]) {
        const pad = pads[side];
        if (side === 1 && gameRef.current.options.mode !== "local") continue;
        const mappings = modernGamepad(pad);
        mappings.forEach(([action, down]) => input(`pad:${side}:${action}`, side, action, down),);
      }
    };
    const loop = (now: number) => {
      const elapsed = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!manual && assetsRef.current) {
        pollGamepad();
        accumulator += elapsed;
        while (accumulator >= STEP) {
          tick();
          accumulator -= STEP;
        }
      }
      draw();
      if (now - lastUi > 90) {
        sync();
        lastUi = now;
      }
      frame = requestAnimationFrame(loop);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLInputElement
      ) return;
      if (overlayRef.current) {
        if (event.code === "Escape") {
          event.preventDefault();
          closeOverlay();
        }
        return;
      }
      if (event.code === "KeyP" || event.code === "Escape") {
        if (!event.repeat) pause();
        event.preventDefault();
        return;
      }
      if (event.code === "KeyF") {
        if (!event.repeat) fullscreen();
        return;
      }
      const g = gameRef.current;
      if (g.phase === "menu" || g.phase === "result") return;
      if (
        event.code === "Enter" &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        skipTransition(g);
        sync();
        event.preventDefault();
        return;
      }
      const mapping = KEYS[event.code];
      if (mapping) {
        event.preventDefault();
        if (event.repeat) return;
        input(
          `key:${event.code}`,
          g.options.mode === "local" ? mapping[0] : 0,
          mapping[1],
          true,
        );
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const mapping = KEYS[event.code];
      if (mapping) input(
          `key:${event.code}`,
          gameRef.current.options.mode === "local" ? mapping[0] : 0,
          mapping[1],
          false,
        );
    };
    const blur = () => {
      clearInputs();
      const g = gameRef.current;
      if (g.phase !== "menu" && g.phase !== "result") {
        g.paused = true;
        sync();
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
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
    try {
      localStorage.setItem("tidal-duel-muted", String(muted));
    } catch {
      /* Optional preference. */
    }
  }, [muted, preferencesReady]);
  useEffect(() => {
    const combo = Math.max(
      ...view.fighters.map((f) => f.combo),
      view.training.maxCombo,
    );
    if (combo > bestCombo) {
      setBestCombo(combo);
      try {
        localStorage.setItem("tidal-duel-best-combo", String(combo));
      } catch {
        /* Optional record. */
      }
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
      const buttons = Array.from(
        modal.querySelectorAll<HTMLElement>("button, a[href], select"),
      );
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
      } else if (!event.shiftKey && index === buttons.length - 1) {
        event.preventDefault();
        buttons[0]?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      if (stage) stage.inert = false;
      window.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [overlay]);

  const isMenu = view.phase === "menu";
  const isResult = view.phase === "result";
  const active = !isMenu && !isResult;
  const selected = getFighter(options.character);
  const winner =
    view.winner === null
      ? null
      : getFighter(view.fighters[view.winner].character);
  const controls = (side: Side) => (
    <div
      className={styles.controlBank}
      key={side}
      aria-label={`玩家${side === 0 ? "一" : "二"}操作`}
    >
      {options.mode === "local" && (
        <span className={styles.bankLabel}>{side + 1}P</span>
      )}
      {CONTROLS.map(([action, label, key, secondKey]) => (
        <button
          type="button"
          key={action}
          data-control={`${side}-${action}`}
          className={`${action === "ability" ? styles.special : ""} ${["light", "medium", "heavy"].includes(action) ? styles.strike : ""}`}
          aria-label={`玩家${side === 0 ? "一" : "二"}${label}`}
          aria-pressed={
            action === "assist"
              ? !!view.fighters[side].previous.assist
              : undefined
          }
          disabled={view.paused || !!overlay || view.phase !== "fight"}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            input(`pointer:${event.pointerId}`, side, action, true);
            audioRef.current?.unlock();
          }}
          onPointerUp={(event) => input(`pointer:${event.pointerId}`, side, action, false)}
          onPointerCancel={(event) => input(`pointer:${event.pointerId}`, side, action, false)}
          onLostPointerCapture={(event) => input(`pointer:${event.pointerId}`, side, action, false)}
          onKeyDown={(event) => {
            if (event.code === "Space" || event.code === "Enter") {
              event.preventDefault();
              input(
                `button:${side}:${action}:${event.code}`,
                side,
                action,
                true,
              );
            }
          }}
          onKeyUp={(event) => {
            if (event.code === "Space" || event.code === "Enter") {
              event.preventDefault();
              input(
                `button:${side}:${action}:${event.code}`,
                side,
                action,
                false,
              );
            }
          }}
          onBlur={() => {
            input(`button:${side}:${action}:Space`, side, action, false);
            input(`button:${side}:${action}:Enter`, side, action, false);
          }}
        >
          <span>{label}</span>
          <kbd>{side === 0 ? key : secondKey}</kbd>
        </button>
      ))}
    </div>
  );
  return (
    <div
      className={`${styles.root} ${active && view.options.mode === "local" ? styles.localRoot : ""} ${active && view.options.mode === "training" ? styles.trainingRoot : ""}`}
      ref={rootRef}
    >
      <div ref={stageRef} className={styles.workspace}>
        <header className={styles.header}>
          <Link href="/demos">
            ← <span>游戏大厅</span>
          </Link>
          <span className={styles.brand}>
            潮夜格斗 <i>TIDE FIGHTERS</i>
          </span>
          <div className={styles.tools}>
            <button
              type="button"
              aria-label="玩法"
              onClick={() => openOverlay("help")}
            >
              ?
            </button>
            <button
              type="button"
              aria-label={muted ? "开启声音" : "静音"}
              aria-pressed={muted}
              onClick={() => {
                audioRef.current?.unlock();
                setMuted(!muted);
              }}
            >
              {muted ? "♫ ×" : "♫"}
            </button>
            <button type="button" aria-label="全屏" onClick={fullscreen}>
              ⛶
            </button>
            {active && (
              <button
                type="button"
                aria-label={view.paused ? "继续对决" : "暂停"}
                onClick={pause}
              >
                {view.paused ? "▶" : "Ⅱ"}
              </button>
            )}
          </div>
        </header>
        {active && (
          <div className={styles.mobileHud} aria-label="对战状态">
            <div className={styles.mobileFighter}>
              <b>
                {getFighter(view.fighters[0].character).name}
                <small>{Math.round(view.fighters[0].hp)} / 300</small>
              </b>
              <div className={styles.mobileHealth}>
                <i style={{ width: `${view.fighters[0].hp / 3}%` }} />
              </div>
              <div className={styles.mobileGuard}>
                <i style={{ width: `${view.fighters[0].guardGauge}%` }} />
              </div>
              <span>
                气势 {Math.round(view.fighters[0].meter)}% · 盾{" "}
                {Math.round(view.fighters[0].guardGauge)} ·{" "}
                {view.fighters[0].burstReady ? "脱身可用" : "脱身已用"}
              </span>
            </div>
            <div className={styles.mobileTimer}>
              <b>
                {view.options.mode === "training"
                  ? "∞"
                  : Math.ceil(view.roundTimer)}
              </b>
              <span>
                {view.wins[0]} : {view.wins[1]}
              </span>
            </div>
            <div className={styles.mobileFighter}>
              <b>
                {getFighter(view.fighters[1].character).name}
                <small>{Math.round(view.fighters[1].hp)} / 300</small>
              </b>
              <div className={styles.mobileHealth}>
                <i style={{ width: `${view.fighters[1].hp / 3}%` }} />
              </div>
              <div className={styles.mobileGuard}>
                <i style={{ width: `${view.fighters[1].guardGauge}%` }} />
              </div>
              <span>
                气势 {Math.round(view.fighters[1].meter)}% · 盾{" "}
                {Math.round(view.fighters[1].guardGauge)} ·{" "}
                {view.fighters[1].burstReady ? "脱身可用" : "脱身已用"}
              </span>
            </div>
          </div>
        )}
        <main className={`${styles.stage} ${isMenu ? styles.menuStage : ""}`}>
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            aria-label="潮夜格斗：岁己与栞栞的像素格斗擂台"
          >
            请使用支持 Canvas 的浏览器。
          </canvas>
          {!ready && (
            <div className={styles.loading}>
              <span />
              {error || "正在准备潮夜格斗擂台…"}
              {error && (
                <button type="button" onClick={() => window.location.reload()}>
                  重新加载
                </button>
              )}
            </div>
          )}
          {ready && isMenu && (
            <section className={styles.menu} aria-label="角色与对战设置">
              <div className={styles.eyebrow}>
                SUI × SHIORI / AFTER THE TIDE
              </div>
              <h1>
                潮夜<span>格斗</span>
                <small>TIDE FIGHTERS · 岁己 × 栞栞</small>
              </h1>
              <p className={styles.tagline}>
                轻中重出招，按后防御。日落之后，放手过招。
              </p>
              <div className={styles.characters}>
                {FIGHTERS.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    aria-pressed={options.character === f.id}
                    onClick={() => choose({ character: f.id })}
                  >
                    <b>{f.name}</b>
                    <span>{f.id.toUpperCase()}</span>
                    <small>{f.style}</small>
                  </button>
                ))}
              </div>
              <div className={styles.fighterNotes}>
                <b>{selected.role}</b>
                <span>{selected.strengths}</span>
                <small>{selected.weakness}</small>
              </div>
              <div className={styles.skins}>
                <label htmlFor="duel-skin">
                  1P 服装
                  <select
                    id="duel-skin"
                    value={options.skin}
                    onChange={(e) => choose({ skin: e.target.value })}
                  >
                    {selected.skins?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="duel-opponent-skin">
                  2P 服装
                  <select
                    id="duel-opponent-skin"
                    value={options.opponentSkin}
                    onChange={(e) => choose({ opponentSkin: e.target.value })}
                  >
                    {getFighter(options.opponent).skins?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.modes}>
                {(
                  [
                    ["solo", "单人挑战"],
                    ["local", "同机双人"],
                    ["training", "自由练习"],
                  ] as [Mode, string][]
                ).map(([mode, label]) => (
                  <button
                    type="button"
                    key={mode}
                    aria-pressed={options.mode === mode}
                    onClick={() => choose({ mode })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.settings}>
                <label htmlFor="duel-opponent">
                  对手角色
                  <select
                    id="duel-opponent"
                    value={options.opponent}
                    onChange={(e) => choose({ opponent: e.target.value })}
                  >
                    {FIGHTERS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                {options.mode === "solo" && (
                  <label htmlFor="duel-difficulty">
                    对手难度
                    <select
                      id="duel-difficulty"
                      value={options.difficulty}
                      onChange={(e) => choose({ difficulty: e.target.value as Difficulty })}
                    >
                      <option value="easy">初遇 · 轻松</option>
                      <option value="normal">过招 · 标准</option>
                      <option value="hard">争锋 · 挑战</option>
                    </select>
                  </label>
                )}
                {options.mode === "training" && (
                  <label htmlFor="duel-dummy">
                    练习对手
                    <select
                      id="duel-dummy"
                      value={options.dummy}
                      onChange={(e) => choose({ dummy: e.target.value as Options["dummy"] })}
                    >
                      <option value="idle">站立木桩</option>
                      <option value="guard">自动防御</option>
                      <option value="cpu">实战陪练</option>
                    </select>
                  </label>
                )}
                <span>
                  {options.mode === "training"
                    ? "不限时 · 开局满气势"
                    : "60 秒 / 三局两胜"}
                </span>
              </div>
              <button
                type="button"
                id="tidal-start"
                className={styles.start}
                onClick={begin}
              >
                {options.mode === "training" ? "开始练习" : "开始对决"}
                <span>↗</span>
              </button>
              <div className={styles.menuFoot}>
                <button type="button" onClick={() => openOverlay("help")}>
                  出招与反击 ↗
                </button>
                <span>最佳连击 {String(bestCombo).padStart(2, "0")}</span>
              </div>
            </section>
          )}
          {ready && isMenu && (
            <div className={styles.caption}>
              <span>{selected.name}</span>
              <small>
                {selected.subtitle} / {selected.superName}
              </small>
            </div>
          )}
          {active && (
            <>
              <div className={styles.srOnly} role="status">
                第 {view.round} 局，
                {view.fighters
                  .map(
                    (f) => `${getFighter(f.character).name} 生命 ${Math.round(f.hp)} 气势 ${Math.round(f.meter)}`,
                  )
                  .join("，")}
                ，{view.event}
              </div>
              {(view.phase === "intro" || view.phase === "roundEnd") &&
                !view.paused && (
                  <button
                    type="button"
                    className={styles.skip}
                    onClick={() => {
                      skipTransition(gameRef.current);
                      clearInputs();
                      sync();
                    }}
                  >
                    继续 ↗ <kbd>Enter</kbd>
                  </button>
                )}
              {view.paused && !overlay && (
                <section className={styles.pause} aria-label="对决已暂停">
                  <span>TAKE A BREATH</span>
                  <h2>海风稍歇</h2>
                  <p>准备好再继续。</p>
                  <button
                    type="button"
                    className={styles.start}
                    onClick={pause}
                  >
                    继续对决 →
                  </button>
                  <button type="button" onClick={() => openOverlay("exit")}>
                    返回选人
                  </button>
                </section>
              )}
            </>
          )}
          {isResult && (
            <section className={styles.result} aria-label="对决结果">
              <span>MATCH COMPLETE</span>
              <h2>{winner ? `${winner.name}，胜出` : "势均力敌"}</h2>
              <p>
                {view.wins[0]} : {view.wins[1]} · 最佳连击 {bestCombo}
              </p>
              <button type="button" className={styles.start} onClick={begin}>
                再战一场 ↗
              </button>
              <button type="button" onClick={menu}>
                返回选人
              </button>
            </section>
          )}
        </main>
        {active && (
          <footer className={styles.controls}>
            {view.options.mode === "training" && (
              <div className={styles.training}>
                <span>TRAINING LAB</span>
                <b>
                  {view.training.hits} HIT · {Math.round(view.training.damage)}{" "}
                  DAMAGE
                </b>
                {view.training.lastContact && (
                  <small>
                    {view.training.lastContact.move} ·{" "}
                    {view.training.lastContact.result} ·{" "}
                    {view.training.lastContact.advantage > 0 ? "+" : ""}
                    {view.training.lastContact.advantage}F
                  </small>
                )}
                <button
                  type="button"
                  aria-pressed={!!view.training.showBoxes}
                  onClick={() => {
                    gameRef.current.training.showBoxes =
                      !gameRef.current.training.showBoxes;
                    sync();
                  }}
                >
                  判定框 {view.training.showBoxes ? "开" : "关"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetTraining(gameRef.current);
                    clearInputs();
                    sync();
                  }}
                >
                  重置站位
                </button>
              </div>
            )}
            {controls(0)}
            {options.mode === "local" && controls(1)}
            <div className={styles.controlFoot}>
              <span>按后防御 · 轻+中投技 · 重+必杀超杀 · 按住辅助连打</span>
              <button type="button" onClick={() => openOverlay("exit")}>
                返回选人
              </button>
            </div>
          </footer>
        )}
      </div>
      {overlay && (
        <div className={styles.scrim}>
          <section
            ref={modalRef}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="duel-dialog-title"
          >
            <button
              type="button"
              className={styles.close}
              aria-label="关闭"
              onClick={closeOverlay}
            >
              ×
            </button>
            {overlay === "exit" ? (
              <>
                <span className={styles.eyebrow}>LEAVE THE ARENA</span>
                <h2 id="duel-dialog-title">返回选人？</h2>
                <p>本场比分将清空，连击纪录会保留。</p>
                <div className={styles.modalActions}>
                  <button type="button" onClick={closeOverlay}>
                    留在擂台
                  </button>
                  <button type="button" className={styles.start} onClick={menu}>
                    返回选人
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className={styles.eyebrow}>FIGHTER GUIDE</span>
                <h2 id="duel-dialog-title">五个键，就能开打。</h2>
                <p>
                  先记三件事：按后防御，轻中重出招，必杀一键释放。想打连招，按住辅助，再连续按同一个攻击键。
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>动作</th>
                      <th>1P</th>
                      <th>2P</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>移动 / 跳 / 蹲</td>
                      <td>A D / W / S</td>
                      <td>← → / ↑ / ↓</td>
                    </tr>
                    <tr>
                      <td>轻 / 中 / 重攻击</td>
                      <td>J / K / L</td>
                      <td>1 / 2 / 3</td>
                    </tr>
                    <tr>
                      <td>必杀 / 辅助</td>
                      <td>U / 按住 I</td>
                      <td>4 / 按住 5</td>
                    </tr>
                    <tr>
                      <td>防御 / 蹲防</td>
                      <td>远离对手的方向 / 下 + 后</td>
                      <td>远离对手的方向 / 下 + 后</td>
                    </tr>
                    <tr>
                      <td>投技 / 超杀 / 脱身</td>
                      <td>J + K / L + U / I + U</td>
                      <td>1 + 2 / 3 + 4 / 5 + 4</td>
                    </tr>
                  </tbody>
                </table>
                <p>
                  <b>按后防御：</b>
                  后是远离对手的方向，换边后会反过来。远处照常后退；受到攻击时会格挡。下
                  + 后防扫腿，站防应对跳入攻击。光按下只会蹲，不会防御。
                </p>
                <p>
                  <b>辅助连招：</b>按住 I，连按 J 是三段连掌，连按 K
                  是踢掌接角色必杀，连按 L
                  是浮空连招，满潮能时以超杀收尾。后续招只在命中后接出，不会在落空或被防御时自动消耗超杀能量。
                </p>
                <p>
                  <b>岁己 · 猫步连掌：</b>U 向前进身，命中或被防御后可再按 U
                  两次。最后一段收招长，落空要小心。
                </p>
                <p>
                  <b>栞栞 · 流心潮波：</b>U
                  发出潮波，按后、防反、跳跃或侧闪均可应对。两人都可用下 + U
                  升击，消耗 25 潮能，起手短暂无敌，被防后容易受罚。
                </p>
                <p>
                  <b>投技与资源：</b>轻 + 中投技，被抓瞬间同样按轻 + 中拆投。重
                  + 必杀消耗 100 潮能发动超杀；辅助 + 必杀消耗 50
                  潮能从受击或防御硬直脱身，每回合一次。护盾耗尽会破防。衣装只改变外观。
                </p>
                <details className={styles.advanced}>
                  <summary>进阶动作与招式帧数</summary>
                  <p>
                    轻 + 重防反：默认反中段，加上方向反上段，加下方向反下段。中
                    + 重侧闪，命中后可消耗 50 潮能取消收招。方向指令 ↓↘→ + 轻 /
                    →↓↘ + 中也保留，但不需要先学搓招。
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>{selected.name}招式</th>
                        <th>起手 / 有效 / 收招</th>
                        <th>伤害 / 潮能</th>
                      </tr>
                    </thead>
                    <tbody>
                      {["punch", "kick", "signature", "reversal", "super"].map(
                        (id) => {
                          const m = selected.moves[id];
                          return (
                            <tr key={id}>
                              <td>{m.name}</td>
                              <td>
                                {Math.round(m.startup * 60)} /{" "}
                                {Math.round(m.active * 60)} /{" "}
                                {Math.round(m.recovery * 60)}F
                              </td>
                              <td>
                                {m.damage} / {m.meter ?? 0}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </details>
                <p className={styles.helpFoot}>
                  P / Esc 暂停 · F 全屏 · 手柄：A 轻、X 中、Y 重、B 必杀、RT
                  辅助，方向后防；LB 投技、RB
                  超杀也可直接使用。切到其他页面会自动暂停。练习帧优势显示实际接触后的剩余硬直。
                </p>
                <button
                  type="button"
                  className={styles.start}
                  onClick={closeOverlay}
                >
                  明白了，去过招 →
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
