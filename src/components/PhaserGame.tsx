"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import Phaser from "phaser";
import GameShareButton from "@/app/game/GameShareButton";
import {
  createJump,
  emptyInput,
  heightScore,
  Input,
  JumpRecord,
  Phase,
  readRecord,
  RECORD_KEY,
} from "./jumpGame/engine";
import JumpScene, { describeJump, JumpBridge } from "./jumpGame/JumpScene";
import styles from "./jumpGame/jump.module.css";

type Hud = {
  phase: Phase;
  height: number;
  floor: number;
  dash: number;
  loaded: boolean;
  failed: boolean;
  seed: number;
};
type DebugWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};
const freshSeed = () => Math.floor(Math.random() * 4294967296);

export default function PhaserGame() {
  const shell = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<JumpBridge | null>(null);
  const recordRef = useRef<JumpRecord>(readRecord(null));
  const recorded = useRef(false);
  const pointerKeys = useRef(new Map<number, keyof Input>());
  const pointerTargets = useRef(new Map<number, HTMLButtonElement>());
  const keyboardKeys = useRef(new Set<string>());
  const buttonKeys = useRef(new Map<string, keyof Input>());
  const [record, setRecord] = useState(recordRef.current);
  const [notice, setNotice] = useState("");
  const [hud, setHud] = useState<Hud>({
    phase: "ready",
    height: 0,
    floor: 0,
    dash: 0,
    loaded: false,
    failed: false,
    seed: 1,
  });

  const syncInput = () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const keys = keyboardKeys.current;
    const touch = [...Array.from(pointerKeys.current.values()), ...Array.from(buttonKeys.current.values())];
    bridge.input = {
      left: keys.has("ArrowLeft") || keys.has("KeyA") || touch.includes("left"),
      right:
        keys.has("ArrowRight") || keys.has("KeyD") || touch.includes("right"),
      jump:
        keys.has("ArrowUp") ||
        keys.has("KeyW") ||
        keys.has("Space") ||
        touch.includes("jump"),
      dash:
        keys.has("ShiftLeft") ||
        keys.has("ShiftRight") ||
        keys.has("KeyK") ||
        touch.includes("dash"),
    };
  };
  const clearInput = useCallback(() => {
    pointerKeys.current.clear();
    keyboardKeys.current.clear();
    buttonKeys.current.clear();
    const captures = Array.from(pointerTargets.current);
    pointerTargets.current.clear();
    for (const [id, target] of captures) {
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    }
    if (bridgeRef.current) bridgeRef.current.input = emptyInput();
  }, []);
  const fullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.current?.requestFullscreen();
    } catch {
      setNotice("当前浏览器不支持全屏，仍可正常游玩。");
    }
  }, []);
  const start = useCallback(
    (newRoute = false) => {
      const bridge = bridgeRef.current;
      if (!bridge?.loaded || bridge.failed) return;
      clearInput();
      recorded.current = false;
      const seed = newRoute ? freshSeed() : bridge.state.seed;
      const url = new URL(window.location.href);
      url.searchParams.set("seed", String(seed));
      window.history.replaceState(window.history.state, "", url);
      bridge.scene?.restart(seed);
      container.current?.focus();
    },
    [clearInput],
  );
  const togglePause = useCallback(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    clearInput();
    if (bridge.state.phase === "playing") bridge.scene?.pause();
    else if (bridge.state.phase === "paused") {
      bridge.state.phase = "playing";
      bridge.onChange();
      container.current?.focus();
    }
  }, [clearInput]);

  useEffect(() => {
    if (!container.current) return undefined;
    try {
      recordRef.current = readRecord(localStorage.getItem(RECORD_KEY));
      setRecord(recordRef.current);
    } catch {
      setNotice("设备存储不可用，纪录仅在当前页面保留。");
    }
    const param = new URLSearchParams(window.location.search).get("seed");
    const parsed = param === null ? NaN : Number(param);
    const seed =
      Number.isInteger(parsed) && parsed >= 0 && parsed <= 4294967295
        ? parsed
        : freshSeed();
    const route = new URL(window.location.href);
    route.searchParams.set('seed', String(seed));
    window.history.replaceState(window.history.state, '', route);
    let previousHud = "";
    const bridge: JumpBridge = {
      state: createJump(seed),
      input: emptyInput(),
      scene: null,
      loaded: false,
      failed: false,
      onChange: () => {
        const s = bridge.state;
        if (s.phase === "over" && !recorded.current) {
          clearInput();
          recorded.current = true;
          let saved = recordRef.current;
          try {
            saved = readRecord(localStorage.getItem(RECORD_KEY));
          } catch {
            /* Use this page's record. */
          }
          const next = {
            height: Math.max(
              saved.height,
              recordRef.current.height,
              heightScore(s),
            ),
            floor: Math.max(saved.floor, recordRef.current.floor, s.floor),
            runs: Math.max(saved.runs, recordRef.current.runs) + 1,
          };
          recordRef.current = next;
          setRecord(next);
          try {
            localStorage.setItem(RECORD_KEY, JSON.stringify(next));
          } catch {
            setNotice("设备存储不可用，纪录仅在当前页面保留。");
          }
        }
        const next: Hud = {
          phase: s.phase,
          height: heightScore(s),
          floor: s.floor,
          dash: Math.ceil(s.cooldown * 10),
          loaded: bridge.loaded,
          failed: bridge.failed,
          seed: s.seed,
        };
        const signature = JSON.stringify(next);
        if (signature !== previousHud) {
          previousHud = signature;
          setHud(next);
        }
      },
    };
    bridgeRef.current = bridge;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container.current,
      width: 800,
      height: 600,
      backgroundColor: "#e6f0e9",
      scene: new JumpScene(bridge),
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true },
      audio: { noAudio: true },
    });
    const debug = window as DebugWindow;
    const renderText = () => describeJump(bridge);
    const advance = (ms: number) => {
      if (bridge.scene) {
        bridge.scene.manual = true;
        bridge.scene.advance(ms);
      }
    };
    debug.render_game_to_text = renderText;
    debug.advanceTime = advance;
    const pause = () => {
      clearInput();
      bridge.scene?.pause();
    };
    const hidden = () => {
      if (document.hidden) pause();
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches("input, textarea, select") ||
          event.target.isContentEditable)
      ) return;
      if (event.code === "KeyF" && !event.repeat) {
        event.preventDefault();
        fullscreen();
        return;
      }
      if (["KeyP", "Escape"].includes(event.code) && !event.repeat) {
        event.preventDefault();
        if (event.code === 'KeyP' || bridge.state.phase === 'playing') togglePause();
        return;
      }
      if (
        event.code === "KeyR" &&
        !event.repeat &&
        ["over", "paused"].includes(bridge.state.phase)
      ) {
        event.preventDefault();
        start();
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("button, a") &&
        ["Space", "Enter"].includes(event.code)
      ) return;
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "KeyA",
          "KeyD",
          "KeyW",
          "Space",
          "ShiftLeft",
          "ShiftRight",
          "KeyK",
        ].includes(event.code)
      ) {
        event.preventDefault();
        if (bridge.state.phase === "playing") {
          // A key held across pause/focus changes needs a fresh press to resume.
          if (event.repeat && !keyboardKeys.current.has(event.code)) return;
          keyboardKeys.current.add(event.code);
          syncInput();
        }
      }
    };
    const keyup = (event: KeyboardEvent) => {
      keyboardKeys.current.delete(event.code);
      buttonKeys.current.delete(event.code);
      syncInput();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hidden);
      if (debug.render_game_to_text === renderText) delete debug.render_game_to_text;
      if (debug.advanceTime === advance) delete debug.advanceTime;
      clearInput();
      bridgeRef.current = null;
      game.destroy(true);
    };
  }, [clearInput, fullscreen, start, togglePause]);

  const press = (event: PointerEvent<HTMLButtonElement>, key: keyof Input) => {
    event.preventDefault();
    if (event.button !== 0 || bridgeRef.current?.state.phase !== "playing") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerTargets.current.set(event.pointerId, event.currentTarget);
    pointerKeys.current.set(event.pointerId, key);
    syncInput();
  };
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    pointerKeys.current.delete(event.pointerId);
    const target = pointerTargets.current.get(event.pointerId);
    pointerTargets.current.delete(event.pointerId);
    if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    syncInput();
  };
  const control = (key: keyof Input) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => press(event, key),
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      if (bridgeRef.current?.state.phase === 'playing') {
        if (event.repeat && !buttonKeys.current.has(event.code)) return;
        buttonKeys.current.set(event.code, key);
        syncInput();
      }
    },
    onKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (['Space', 'Enter'].includes(event.code)) {
        event.preventDefault(); buttonKeys.current.delete(event.code); syncInput();
      }
    },
    onBlur: () => { buttonKeys.current.clear(); syncInput(); },
  });
  const playing = hud.phase === "playing";
  return (
    <div ref={shell} className={styles.shell}>
      <header className={styles.header}>
        <Link
          href="/demos#games"
          aria-label="返回游戏大厅"
          className={styles.back}
        >
          ←
        </Link>
        <div className={styles.brand}>
          <span>SUI / SKYWARD</span>
          <h1>小鸟一百层</h1>
        </div>
        <div className={styles.tools}>
          <GameShareButton gamePath="/game/jumpone" />
          <button onClick={fullscreen} aria-label="切换全屏">
            全屏
          </button>
          <button
            onClick={togglePause}
            disabled={!["playing", "paused"].includes(hud.phase)}
          >
            {hud.phase === "paused" ? "继续" : "暂停"}
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.hud} aria-live="off">
          <div>
            <span>攀登高度</span>
            <strong>
              {hud.height}
              <small> m</small>
            </strong>
          </div>
          <div className={styles.floor}>
            <span>抵达平台</span>
            <strong>
              {hud.floor}
              <small> 层</small>
            </strong>
          </div>
          <div className={styles.best}>
            <span>本机最高</span>
            <strong>
              {record.height}
              <small> m</small>
            </strong>
          </div>
        </div>
        <div className={styles.stage}>
          <div
            ref={container}
            className={styles.canvas}
            tabIndex={-1}
            role="application"
            aria-label="小鸟跳跃场地，方向键移动，空格跳跃，K 冲刺"
          />
          {(!playing || !hud.loaded || hud.failed) && (
            <div className={styles.overlay}>
              <div className={styles.menu}>
                <span className={styles.eyebrow}>
                  {hud.phase === "over"
                    ? "这一程，也很漂亮"
                    : hud.phase === "paused"
                      ? "歇一歇，风还在"
                      : "SUI / SKYWARD"}
                </span>
                <h2>
                  {hud.failed
                    ? "小鸟还没飞来"
                    : !hud.loaded
                      ? "正在准备天空…"
                      : hud.phase === "over"
                        ? `${hud.height} 米，下一程更高`
                        : hud.phase === "paused"
                          ? "已暂停"
                          : "再往云上，跳一层。"}
                </h2>
                <p>
                  {hud.failed
                    ? "图片加载失败，请刷新页面重试。"
                    : hud.phase === "over"
                      ? `抵达第 ${hud.floor} 层 · 最高纪录 ${record.height} 米`
                      : hud.phase === "paused"
                        ? "返回后台会自动暂停，准备好后再继续。"
                        : "稳稳落地，再起跳。冲刺可以救场，不必每次都用。"}
                </p>
                {hud.loaded && !hud.failed && (
                  <>
                    <button
                      className={styles.primary}
                      onClick={() => (hud.phase === "paused" ? togglePause() : start())}
                    >
                      {hud.phase === "paused"
                        ? "继续攀登"
                        : hud.phase === "over"
                          ? "再试同一路线"
                          : "开始攀登"}
                      <span>↗</span>
                    </button>
                    {hud.phase !== "ready" && (
                      <button
                        className={styles.secondary}
                        onClick={() => start(true)}
                      >
                        换一条新路线
                      </button>
                    )}
                    {hud.phase === "ready" && (
                      <div className={styles.instructions}>
                        ← → / A D 移动 · ↑ / W / 空格跳跃
                        <br />
                        Shift / K 冲刺 · P 暂停 · F 全屏
                        <br />
                        <span>按住方向，点按跳跃；松开后可再次起跳</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <div className={styles.controls} aria-label="触屏操作">
          <div className={styles.directions}>
            {(["left", "right"] as const).map((key, index) => (
              <button
                key={key}
                disabled={!playing}
                aria-label={index ? "向右移动" : "向左移动"}
                {...control(key)}
              >
                {index ? "→" : "←"}
              </button>
            ))}
          </div>
          <span className={styles.hint}>
            落地后再起跳
            <br />
            金色平台标记每十层
          </span>
          <div className={styles.actions}>
            <button
              disabled={!playing}
              aria-label="冲刺"
              {...control('dash')}
            >
              冲刺
              <small>
                {hud.dash ? `${(hud.dash / 10).toFixed(1)}s` : "就绪"}
              </small>
            </button>
            <button
              className={styles.jump}
              disabled={!playing}
              aria-label="跳跃"
              {...control('jump')}
            >
              跳跃<span>↑</span>
            </button>
          </div>
        </div>
        <footer className={styles.footer}>
          <span>同一路线 · 同样的起点</span>
          <span>路线 {hud.seed}</span>
        </footer>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
      </main>
    </div>
  );
}
