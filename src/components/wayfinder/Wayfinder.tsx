"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import Atlas from "./Atlas";
import { LAST_MISSION, MISSIONS, REAL_WORLD_TIPS, REGIONS } from "./content";
import {
  answerBearing,
  answerBranch,
  dailySeed,
  openJournal,
  closeJournal,
  beginWalk,
  createGame,
  hint,
  interact,
  leaveBearing,
  loadGame,
  locateAt,
  look,
  nearPlace,
  nearStair,
  facingBranch,
  leaveChalk,
  recallBranch,
  pause,
  publicState,
  requestLocation,
  rescue,
  revealLocation,
  SAVE_KEY,
  saveGame,
  showPosition,
  startMission,
  stepGame,
  takeStairs,
  targetPlace,
  toggleMap,
} from "./engine";
import type { Game, Input } from "./engine";
import { direction } from "./world";
import styles from "./wayfinder.module.css";

const Scene = dynamic(() => import("./Scene"), { ssr: false });
type BrowserWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
  windpost?: {
    input: (value: Input) => void;
    look: (dx: number, dy?: number) => void;
  };
};
class SceneBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { failed: boolean }
> {
  constructor(props: {
    children: ReactNode;
    onError: (message: string) => void;
  }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    const { onError } = this.props;
    onError(
      "这个浏览器暂时无法打开立体场景。请在支持 WebGL 的浏览器里重试。你的存档仍保留。",
    );
  }
  render() {
    const { failed } = this.state;
    const { children } = this.props;
    return failed ? null : children;
  }
}
function Modal({
  children,
  title,
  className = "",
}: {
  children: ReactNode;
  title: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const before = document.activeElement as HTMLElement | null;
    el?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !el) return;
      const all = Array.from(
        el.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input, select, summary",
        ),
      ).filter((item) => item.getClientRects().length);
      if (!all.length) {
        event.preventDefault();
        return;
      }
      const first = all[0];
      const last = all[all.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === el)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === el)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    el?.addEventListener("keydown", trap);
    return () => {
      el?.removeEventListener("keydown", trap);
      before?.focus();
    };
  }, []);
  return (
    <div className={styles.veil}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`${styles.paper} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
const relativeNames = [
  "正前方",
  "右前方",
  "右边",
  "右后方",
  "身后",
  "左后方",
  "左边",
  "左前方",
];
const relativeArrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
export default function Wayfinder() {
  const game = useRef<Game>(null!);
  if (!game.current) game.current = createGame();
  const keys = useRef(new Set<string>());
  const touch = useRef({ forward: 0, right: 0, turn: 0 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const sceneElement = useRef<HTMLDivElement>(null);
  const releaseExpected = useRef(false);
  const joy = useRef<{ id: number; x: number; y: number } | null>(null);
  const saved = useRef<Game | null>(null);
  const liveStarted = useRef(false);
  const manualUntil = useRef(0);
  const [g, setG] = useState(game.current);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [reduced, setReduced] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [share, setShare] = useState("");
  const [restart, setRestart] = useState(false);
  const [sharedSeed, setSharedSeed] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [regionPreview, setRegionPreview] = useState(false);
  const [touchRun, setTouchRun] = useState(false);
  const touchRunRef = useRef(false);
  const refresh = useCallback(
    () => setG({
        ...game.current,
        player: { ...game.current.player },
        stats: { ...game.current.stats },
        stamps: [...game.current.stamps],
      }),
    [],
  );
  const save = useCallback(() => {
    if (!liveStarted.current) return;
    try {
      localStorage.setItem(SAVE_KEY, saveGame(game.current));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);
  const clearInputs = useCallback(() => {
    keys.current.clear();
    touch.current = { forward: 0, right: 0, turn: 0 };
    drag.current = null;
    joy.current = null;
    setStick({ x: 0, y: 0 });
    touchRunRef.current = false;
    setTouchRun(false);
  }, []);
  const act = useCallback(
    (fn: (s: Game) => void) => {
      fn(game.current);
      if (game.current.mode !== "playing" || game.current.branchRecall) {
        clearInputs();
        game.current.running = false;
      }
      refresh();
      save();
    },
    [clearInputs, refresh, save],
  );
  const getInput = useCallback((): Input => {
    const k = keys.current;
    return {
      forward:
        touch.current.forward +
        Number(k.has("KeyW") || k.has("ArrowUp")) -
        Number(k.has("KeyS") || k.has("ArrowDown")),
      right:
        touch.current.right + Number(k.has("KeyD")) - Number(k.has("KeyA")),
      turn:
        touch.current.turn +
        Number(k.has("ArrowRight") || k.has("KeyE")) -
        Number(k.has("ArrowLeft") || k.has("KeyQ")),
      sprint: touchRunRef.current || k.has("ShiftLeft") || k.has("ShiftRight"),
    };
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      saved.current = loadGame(raw);
      setHasSave(Boolean(saved.current));
      if (raw && !saved.current) setStorageError(true);
    } catch {
      setStorageError(true);
    }
    const query = new URLSearchParams(window.location.search).get("seed");
    if (query && /^\d{1,10}$/.test(query) && Number(query) <= 4294967295) setSharedSeed(Number(query));
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    setLoaded(true);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let uiTime = 0;
    let saveTime = 0;
    const loop = (now: number) => {
      const dt = Math.min(100, now - previous);
      previous = now;
      if (now >= manualUntil.current) stepGame(game.current, dt, getInput());
      if (now - uiTime > 90) {
        refresh();
        uiTime = now;
      }
      if (now - saveTime > 2000) {
        save();
        saveTime = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const w = window as BrowserWindow;
    w.render_game_to_text = () => JSON.stringify(publicState(game.current));
    w.advanceTime = (ms: number) => {
      if (!Number.isFinite(ms) || ms < 0) return;
      manualUntil.current = performance.now() + 350;
      for (let remaining = Math.min(ms, 15000); remaining > 0; remaining -= 16) stepGame(game.current, Math.min(16, remaining), getInput());
      refresh();
    };
    // Automation uses the same movement and look actions as keyboard/touch.
    // No teleport, progression, world or save mutation API is exposed.
    w.windpost = {
      input: (value) => {
        touch.current = { ...value };
      },
      look: (dx, dy) => {
        look(game.current, dx, dy);
        refresh();
      },
    };
    return () => {
      cancelAnimationFrame(frame);
      delete w.render_game_to_text;
      delete w.advanceTime;
      delete w.windpost;
    };
  }, [getInput, refresh, save]);
  const captureMouse = () => {
    if (
      window.matchMedia("(pointer: coarse)").matches ||
      game.current.mode !== "playing" ||
      game.current.branchRecall
    ) return;
    releaseExpected.current = false;
    try {
      const request = sceneElement.current?.requestPointerLock();
      if (request && typeof request.catch === "function") request.catch(() => {});
    } catch {
      /* Hover-look remains usable when the browser denies pointer lock. */
    }
  };
  useEffect(() => {
    const change = () => {
      const active = document.pointerLockElement === sceneElement.current;
      setLocked(active);
      if (!active) {
        clearInputs();
        if (
          !releaseExpected.current &&
          game.current.mode === "playing" &&
          !game.current.branchRecall
        ) act(pause);
        releaseExpected.current = false;
      }
    };
    const move = (event: MouseEvent) => {
      if (document.pointerLockElement === sceneElement.current) look(game.current, event.movementX * 0.0035, -event.movementY * 0.0035);
    };
    document.addEventListener("pointerlockchange", change);
    document.addEventListener("mousemove", move);
    return () => {
      document.removeEventListener("pointerlockchange", change);
      document.removeEventListener("mousemove", move);
    };
  }, [act, clearInputs]);
  useEffect(() => {
    if (
      (g.mode !== "playing" || g.branchRecall || regionPreview) &&
      document.pointerLockElement
    ) {
      releaseExpected.current = true;
      document.exitPointerLock();
    }
  }, [g.mode, g.branchRecall, regionPreview]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
      if (event.code === "Escape") {
        event.preventDefault();
        act((s) => {
          if (s.branchRecall) {
            s.branchRecall = null;
            return;
          }
          if (s.mode === "map") toggleMap(s);
          else if (s.mode === "journal") closeJournal(s);
          else pause(s);
        });
        return;
      }
      if (event.code === "KeyM" && !event.repeat) {
        event.preventDefault();
        act(toggleMap);
        return;
      }
      if (game.current.mode !== "playing" || game.current.branchRecall) return;
      if (
        [
          "KeyW",
          "KeyS",
          "KeyA",
          "KeyD",
          "KeyQ",
          "ShiftLeft",
          "ShiftRight",
          "KeyE",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.code)
      ) {
        event.preventDefault();
        keys.current.add(event.code);
      }
      if (event.repeat) return;
      if (event.code === "KeyF") {
        event.preventDefault();
        act(interact);
      }
      if (event.code === "KeyT") {
        event.preventDefault();
        act(takeStairs);
      }
      if (event.code === "KeyH") {
        event.preventDefault();
        act(hint);
      }
      if (event.code === "KeyB") {
        event.preventDefault();
        act(leaveChalk);
      }
      if (event.code === "KeyG") {
        event.preventDefault();
        act(recallBranch);
        clearInputs();
      }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const blur = () => {
      clearInputs();
      act((s) => {
        if (["playing", "map", "bearing", "journal"].includes(s.mode)) pause(s);
      });
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", save);
    };
  }, [act, clearInputs, save]);
  const start = (mission = 0, seed?: number, daily = false) => {
    liveStarted.current = true;
    act((s) => {
      startMission(s, mission, seed, daily);
    });
    setRestart(false);
  };
  const continueGame = () => {
    if (!saved.current) return;
    game.current = saved.current;
    if (game.current.mode === "pause") game.current.mode = game.current.resumeMode;
    liveStarted.current = true;
    refresh();
    captureMouse();
  };
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(
    (message: string) => {
      setSceneError(message);
      clearInputs();
      save();
    },
    [clearInputs, save],
  );
  const moveLook = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      if (!document.pointerLockElement) look(game.current, event.movementX * 0.0035, -event.movementY * 0.0035);
      return;
    }
    if (!drag.current || drag.current.id !== event.pointerId) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    look(game.current, dx * 0.005, -dy * 0.0035);
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
  };
  const moveStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!joy.current || joy.current.id !== event.pointerId) return;
    const dx = event.clientX - joy.current.x;
    const dy = event.clientY - joy.current.y;
    const d = Math.max(36, Math.hypot(dx, dy));
    touch.current.right = dx / d;
    touch.current.forward = -dy / d;
    setStick({ x: (dx / d) * 29, y: (dy / d) * 29 });
  };
  const releaseStick = () => {
    joy.current = null;
    touch.current = { forward: 0, right: 0, turn: 0 };
    setStick({ x: 0, y: 0 });
  };
  const shareMap = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", String(g.seed));
    try {
      await navigator.clipboard.writeText(url.href);
      setShare("同行链接已复制");
    } catch {
      setShare(url.href);
    }
  };
  const journal = () => act((s) => {
      openJournal(s);
    });
  const place = nearPlace(g);
  const stair = nearStair(g);
  const mission = MISSIONS[g.mission];
  const target = targetPlace(g);
  const branch = facingBranch(g);
  const openRegions = () => {
    if (game.current.mode === "playing") act(pause);
    setRegionPreview(true);
  };
  const closeRegions = () => {
    setRegionPreview(false);
    if (game.current.mode === "pause") {
      act(pause);
      captureMouse();
    }
  };
  return (
    <main className={styles.root} data-mode={g.mode}>
      <div
        ref={sceneElement}
        className={styles.scene}
        role="application"
        aria-label="风邮小镇立体街区，WASD走路，Shift跑步，鼠标直接看四周"
        onPointerDown={(event) => {
          if (game.current.mode !== "playing" || game.current.transition) return;
          if (event.pointerType === "mouse") {
            captureMouse();
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }}
        onPointerMove={moveLook}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <SceneBoundary onError={onError}>
          <Scene
            game={game}
            world={g.world}
            reduced={reduced}
            onReady={onReady}
            onError={onError}
          />
        </SceneBoundary>
      </div>
      {!ready && !sceneError && (
        <div className={styles.loading} role="status">
          正在展开小镇…
        </div>
      )}
      {g.mode === "title" && (
        <section className={styles.title}>
          <div className={styles.topline}>
            <Link href="/demos">← 游戏馆</Link>
            <span>WINDPOST · A WAYFINDING ADVENTURE</span>
          </div>
          <div className={styles.titleCopy}>
            <p className={styles.eyebrow}>一封信，一段自己找到的路</p>
            <h1>
              风邮小镇
              <span>
                沿着好奇心，
                <br />
                慢慢认得回家的路。
              </span>
            </h1>
            <p className={styles.intro}>
              从认一座钟楼开始，走到空中回廊和弯曲洞窟。回路会改变，远处还有看不见的岔路。
            </p>
            <div className={styles.titleActions}>
              <button
                className={styles.primary}
                disabled={!loaded || !ready}
                onClick={() => (hasSave ? continueGame() : start())}
              >
                {hasSave ? "继续这段旅程" : "领第一封信"} <span>↗</span>
              </button>
              {hasSave && (
                <button
                  className={styles.textButton}
                  onClick={() => {
                    game.current = saved.current!;
                    refresh();
                    journal();
                  }}
                >
                  看看我的旅记
                </button>
              )}
            </div>
            <button className={styles.regionTeaser} onClick={openRegions}>
              海港 → 双层商场 → 回声洞窟 · 看看远行路线 ↗
            </button>
            {sharedSeed !== null && (
              <button
                className={styles.sharedStart}
                disabled={!ready}
                onClick={() => {
                  if (saved.current && !liveStarted.current) game.current = saved.current;
                  start(5, sharedSeed, true);
                }}
              >
                打开同行地图 #{sharedSeed}
              </button>
            )}
            <p className={styles.titleFoot}>
              没有倒计时 · 随时看地图 · 迷路了也没关系
            </p>
          </div>
          <div className={styles.postmark}>
            风 邮<br />
            <small>EST. 2026</small>
          </div>
        </section>
      )}
      {g.mode === "playing" && (
        <>
          <header className={styles.hud}>
            <div className={styles.task}>
              <span>
                {g.daily ? "自由远行" : `第 ${g.mission + 1} 封信`} ·{" "}
                {g.world.theme === "arcade"
                  ? `${g.player.floor + 1}F`
                  : g.world.theme === "cave"
                    ? "回声洞窟"
                    : "海风街区"}
              </span>
              <strong>
                {g.phase === "outbound"
                  ? `送往${target.name}`
                  : `带着回信回${g.world.places.find((p) => p.id === "post")?.name}`}
              </strong>
              {g.plan && (
                <small>
                  我打算经过：
                  {g.world.places.find((p) => p.id === g.plan)?.name}
                </small>
              )}
            </div>
            <button
              className={styles.smallButton}
              onClick={() => act(pause)}
              aria-label="暂停与设置"
            >
              Ⅱ
            </button>
          </header>
          <div className={styles.compass}>
            <span>朝向</span>
            <strong>{direction(g.player.yaw)}</strong>
            <i style={{ transform: `rotate(${-g.player.yaw}rad)` }}>↑</i>
          </div>
          {g.toast && g.time < g.toastUntil && (
            <p className={styles.toast} role="status">
              {g.toast}
            </p>
          )}
          <div className={styles.aim} aria-hidden="true">
            ·
          </div>
          {(place || stair) && !g.transition && (
            <div className={styles.contextActions}>
              {place && (
                <button
                  className={styles.primary}
                  onClick={() => act(interact)}
                >
                  <kbd>F</kbd>{" "}
                  {place.id === target.id
                    ? g.phase === "outbound"
                      ? "送出信件"
                      : "交回回信"
                    : `看看${place.name}`}
                </button>
              )}
              {stair && (
                <button
                  className={styles.stairButton}
                  onClick={() => act(takeStairs)}
                >
                  <kbd>T</kbd> 走楼梯 · 前往{" "}
                  {g.player.floor === 0 ? "2F" : "1F"}
                </button>
              )}
            </div>
          )}
          <nav className={styles.tools} aria-label="随身工具">
            <button onClick={() => act(toggleMap)}>
              <span>▧</span>纸地图 <kbd>M</kbd>
            </button>
            <button onClick={() => act(hint)}>
              <span>?</span>问问风 <kbd>H</kbd>
            </button>
            <button onClick={journal}>
              <span>✉</span>旅记
            </button>
          </nav>
          <p className={styles.controls}>
            WASD 走路 · Shift 跑步 ·{" "}
            {locked ? "鼠标看四周 · Esc 松开" : "点击画面捕获鼠标"}
          </p>
          {!locked && (
            <button className={styles.mouseCapture} onClick={captureMouse}>
              点击进入 · 鼠标自由看四周
            </button>
          )}
          <button className={styles.regionHud} onClick={openRegions}>
            远行路线 ↗
          </button>
          {g.world.theme === "cave" && (
            <div className={styles.branchTools}>
              <button
                onClick={() => {
                  act(leaveChalk);
                  captureMouse();
                }}
              >
                <kbd>B</kbd> 留粉笔记号
              </button>
              <button
                onClick={() => {
                  act(recallBranch);
                  clearInputs();
                }}
              >
                <kbd>G</kbd> 这条路走过吗？
              </button>
              {!branch && <small>走近岔口，面对一条支路</small>}
            </div>
          )}
          {g.running && <span className={styles.running}>正在跑步</span>}
          <div
            className={styles.joystick}
            role="application"
            aria-label="移动摇杆，拖动行走"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              joy.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
              };
            }}
            onPointerMove={moveStick}
            onPointerUp={releaseStick}
            onPointerCancel={releaseStick}
            onLostPointerCapture={releaseStick}
          >
            <span
              style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }}
            >
              ✥
            </span>
          </div>
          <span className={styles.touchLook}>右侧拖动 · 看四周</span>
          <button
            className={styles.touchRun}
            aria-pressed={touchRun}
            onClick={() => {
              touchRunRef.current = !touchRunRef.current;
              setTouchRun(touchRunRef.current);
            }}
          >
            ⇧ {touchRun ? "慢走" : "跑步"}
          </button>
        </>
      )}
      {g.mode === "brief" && (
        <Modal title="出发前的信" className={styles.brief}>
          <p className={styles.eyebrow}>{mission.subtitle}</p>
          <h2>{mission.title}</h2>
          <p>{mission.brief}</p>
          <div className={styles.envelope} aria-hidden="true">
            ✉
            <span>
              TO / {g.world.places.find((p) => p.id === mission.target)?.name}
            </span>
          </div>
          <p className={styles.clue}>{mission.clue}</p>
          {g.mission === 0 && (
            <div className={styles.controlLesson}>
              <span>
                <kbd>WASD</kbd> 走路
              </span>
              <span>
                鼠标直接看四周 · <kbd>Shift</kbd> 跑步
              </span>
              <span>
                <kbd>M</kbd> 展开纸地图
              </span>
              <span>
                <kbd>F</kbd> 送信、收邮票
              </span>
              <small>
                手机：左下摇杆走路，右侧拖动看四周，点跑步加速。后面有破桥、双层商场和遮挡视野的洞窟。
              </small>
            </div>
          )}
          <button
            className={styles.primary}
            disabled={!ready}
            onClick={() => {
              act(beginWalk);
              captureMouse();
            }}
          >
            把信放进邮包，出发 ↗
          </button>
          <p className={styles.paperFoot}>{mission.skill}</p>
          <button className={styles.textButton} onClick={openRegions}>
            先看看后面的地区与挑战 ↗
          </button>
        </Modal>
      )}
      {g.mode === "map" && (
        <Modal title="纸地图" className={styles.mapModal}>
          <div className={styles.paperTop}>
            <div>
              <p className={styles.eyebrow}>FIELD MAP / 北向上</p>
              <h2>先看看，要往哪走。</h2>
            </div>
            <button
              className={styles.close}
              onClick={() => act(toggleMap)}
              aria-label="合上地图"
            >
              ×
            </button>
          </div>
          <div className={styles.mapColumns}>
            <Atlas
              game={g}
              onFloor={(floor) => act((s) => {
                  s.mapFloor = floor;
                })}
              onLocate={(x, z, floor) => act((s) => locateAt(s, x, z, floor))}
            />
            <div className={styles.mapNotes}>
              <p className={styles.eyebrow}>邮包里的信</p>
              <h3>{target.name}</h3>
              <p>
                {g.phase === "home"
                  ? "回想来时见过的地标。也可以试一条新路。"
                  : mission.clue}
              </p>
              <label htmlFor="wf-plan">
                我打算经过的地标
                <select
                  id="wf-plan"
                  value={g.plan}
                  onChange={(event) => act((s) => {
                      s.plan = event.target.value;
                    })}
                >
                  <option value="">先看看再决定</option>
                  {g.world.places
                    .filter((p) => p.id !== target.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <small>虚线圈只是你的计划，不会替你选路。</small>
              <div className={styles.locationHelp}>
                {g.locate ? (
                  <>
                    <strong>你觉得自己在哪里？</strong>
                    <p>点一下地图上的位置，再核对。选错也没关系。</p>
                    <button onClick={() => act(revealLocation)}>
                      这次直接告诉我
                    </button>
                  </>
                ) : g.locateResult ? (
                  <p role="status">{g.locateResult}</p>
                ) : showPosition(g) ? (
                  <p>
                    ● 是你，尖角是面朝的方向。
                    {g.comfort
                      ? "舒适探索会一直保留位置。"
                      : "第一封信先一起熟悉读图。"}
                  </p>
                ) : (
                  <>
                    <p>先用附近地标找位置，需要时再核对。</p>
                    <button onClick={() => act(requestLocation)}>
                      我在哪？试着标一标
                    </button>
                    <button
                      className={styles.textButton}
                      onClick={() => act(revealLocation)}
                    >
                      直接显示位置
                    </button>
                  </>
                )}
              </div>
              <button className={styles.primary} onClick={() => act(toggleMap)}>
                合上地图，自己走走 ↗
              </button>
            </div>
          </div>
        </Modal>
      )}
      {g.mode === "bearing" && (
        <Modal title="收到了回信" className={styles.bearing}>
          <p className={styles.eyebrow}>DELIVERED / 信已送达</p>
          <div className={styles.delivered}>✉</div>
          <h2>回信在邮包里了。</h2>
          <p>
            先别看地图。凭刚才走过的路，
            <br />
            邮局大概在你身体的哪个方向？
          </p>
          {!g.bearingFeedback ? (
            <>
              <div className={styles.bearingDial}>
                {relativeNames.map((name, i) => (
                  <button
                    key={name}
                    aria-label={`邮局在${name}`}
                    style={{
                      gridColumn: [2, 3, 3, 3, 2, 1, 1, 1][i],
                      gridRow: [1, 1, 2, 3, 3, 3, 2, 1][i],
                    }}
                    onClick={() => act((s) => answerBearing(s, i))}
                  >
                    <span>{relativeArrows[i]}</span>
                    {name}
                  </button>
                ))}
                <div className={styles.you}>
                  你<br />
                  <small>面朝{direction(g.player.yaw)}</small>
                </div>
              </div>
              <button
                className={styles.textButton}
                onClick={() => act((s) => answerBearing(s, null))}
              >
                还没把握，这次一起看答案
              </button>
            </>
          ) : (
            <>
              <p className={styles.feedback} role="status">
                {g.bearingFeedback}
              </p>
              <button
                className={styles.primary}
                onClick={() => act(leaveBearing)}
              >
                带着回信，找路回家 ↗
              </button>
            </>
          )}
          {g.blocked.length > 0 && (
            <p className={styles.closureNotice}>
              {g.mission === 4
                ? "原来的楼梯开始维护。请从另一座楼梯下楼。"
                : "返程途中有一处道路维护，纸地图已经标出。"}
            </p>
          )}
          {g.bridgeEvent?.stage === "armed" && (
            <p className={styles.paperFoot}>
              花房那头的河水有些动静。回桥边时先看一眼水面。
            </p>
          )}
        </Modal>
      )}
      {g.mode === "result" && (
        <Modal title="一封完成的旅程" className={styles.result}>
          <div className={styles.paperTop}>
            <div>
              <p className={styles.eyebrow}>
                POSTMARK {String(g.mission + 1).padStart(2, "0")} / 已抵达
              </p>
              <h2>
                {g.mission === 5
                  ? "陌生的地方，也有回家的路。"
                  : "又认得了一小片世界。"}
              </h2>
            </div>
            <span className={styles.resultStamp}>
              风邮
              <br />
              已送达
            </span>
          </div>
          <blockquote>{mission.letter}</blockquote>
          <div className={styles.resultColumns}>
            <Atlas
              game={g}
              review
              onFloor={(floor) => act((s) => {
                  s.mapFloor = floor;
                })}
            />
            <div className={styles.reflection}>
              <h3>这次的脚步</h3>
              <dl>
                <div>
                  <dt>实际步行</dt>
                  <dd>{Math.round(g.stats.distance)} 米</dd>
                </div>
                {g.world.theme === "cave" && (
                  <>
                    <div>
                      <dt>再次完整走过的路段</dt>
                      <dd>{Math.round(g.stats.repeated)} 米</dd>
                    </div>
                    <div>
                      <dt>岔路回想 / 记错</dt>
                      <dd>
                        {g.stats.branchChecks} / {g.stats.branchMistakes} 次
                      </dd>
                    </div>
                    <div>
                      <dt>自己留下的记号</dt>
                      <dd>{g.stats.marks} 处</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>路网最短往返参考</dt>
                  <dd>{Math.round(g.stats.optimal)} 米</dd>
                </div>
                <div>
                  <dt>打开地图 / 定位</dt>
                  <dd>
                    {g.stats.mapOpens} / {g.stats.locations} 次
                  </dd>
                </div>
                <div>
                  <dt>问路 / 回程车</dt>
                  <dd>
                    {g.stats.hints} / {g.stats.rescues} 次
                  </dd>
                </div>
                <div>
                  <dt>选错楼层</dt>
                  <dd>{g.stats.floorMistakes} 次</dd>
                </div>
                <div>
                  <dt>指向出发点</dt>
                  <dd>
                    {g.stats.bearingError === null
                      ? "一起看了答案"
                      : `相差 ${Math.round(g.stats.bearingError)}°`}
                  </dd>
                </div>
              </dl>
              <p className={styles.feedback}>{mission.tip}</p>
              <small>
                探索、收集邮票和近处交互会影响路程。
                {g.comfort ? "本次使用舒适探索。" : ""}
                这些是本局记录，不是方向感评级。
              </small>
            </div>
          </div>
          <div className={styles.resultActions}>
            {g.mission < LAST_MISSION && !g.daily ? (
              <button
                className={styles.primary}
                onClick={() => start(g.mission + 1)}
              >
                领取下一封信 ↗
              </button>
            ) : (
              <button
                className={styles.primary}
                onClick={() => start(5, dailySeed(), true)}
              >
                今天的陌生街区 ↗
              </button>
            )}
            <button onClick={journal}>收好回信，打开旅记</button>
            <button
              className={styles.textButton}
              onClick={() => start(g.mission, g.seed, g.daily)}
            >
              再走一次这条路
            </button>
          </div>
          <p className={styles.realWorld}>
            {REAL_WORLD_TIPS[g.mission % REAL_WORLD_TIPS.length]}
          </p>
        </Modal>
      )}
      {g.mode === "pause" && (
        <Modal title="歇一会儿" className={styles.pause}>
          <p className={styles.eyebrow}>TAKE YOUR TIME</p>
          <h2>路会在这里等你。</h2>
          <p>地图、信件和走过的路会保存在这台设备。</p>
          <label htmlFor="wf-comfort" className={styles.setting}>
            <input
              id="wf-comfort"
              type="checkbox"
              checked={g.comfort}
              onChange={(event) => act((s) => {
                  s.comfort = event.target.checked;
                })}
            />
            <span>
              舒适探索
              <small>走慢一点，地图持续显示位置；完成记录会注明辅助。</small>
            </span>
          </label>
          <label htmlFor="wf-reduced" className={styles.setting}>
            <input
              id="wf-reduced"
              type="checkbox"
              checked={reduced}
              onChange={(event) => setReduced(event.target.checked)}
            />
            <span>
              减少动态<small>停止首页镜头和海面装饰动画。</small>
            </span>
          </label>
          <div className={styles.pauseActions}>
            <button
              className={styles.primary}
              onClick={() => {
                act(pause);
                captureMouse();
              }}
            >
              继续走走
            </button>
            <button onClick={journal}>看看旅记</button>
            <button onClick={() => act(rescue)}>坐免费回程车到邮局</button>
            <button
              className={styles.textButton}
              onClick={() => setRestart(!restart)}
            >
              重新开始这一封信
            </button>
            {restart && (
              <div className={styles.confirm}>
                <p>会重置这封信的路程，已有邮票与回信保留。</p>
                <button onClick={() => start(g.mission, g.seed, g.daily)}>
                  确认重新出发
                </button>
                <button onClick={() => setRestart(false)}>继续这段路</button>
              </div>
            )}
          </div>
          <details>
            <summary>操作与找路小提示</summary>
            <p>
              WASD 走路，Shift 跑步，鼠标直接看四周（点击画面捕获鼠标，Esc
              松开）。Q/E 或左右方向键也能转向。F 与附近居民交互，T 走楼梯，M
              地图，H 求助，Esc 暂停。洞窟 B 留记号、G
              回想支路。手机左下摇杆行走，右侧拖动转向，点跑步加速。
            </p>
            <p>
              先抬头认地标，再对照北向上的地图。每次只记一小段路，迷路时回到最近认得的地方。
            </p>
          </details>
          <Link className={styles.backLink} href="/demos">
            保存并回游戏馆
          </Link>
        </Modal>
      )}
      {g.mode === "journal" && (
        <Modal title="我的风邮旅记" className={styles.journal}>
          <div className={styles.paperTop}>
            <div>
              <p className={styles.eyebrow}>MY FIELD NOTES</p>
              <h2>把陌生，走成熟悉。</h2>
            </div>
            <button
              className={styles.close}
              aria-label="合上旅记"
              onClick={() => act((s) => {
                  closeJournal(s);
                })}
            >
              ×
            </button>
          </div>
          <div className={styles.journalColumns}>
            <div>
              <h3>八封信的旅程</h3>
              <div className={styles.regionList}>
                {REGIONS.map((r) => (
                  <p key={r.title}>
                    <strong>{r.title}</strong>
                    <small>{r.detail}</small>
                  </p>
                ))}
              </div>
              <ol className={styles.missions}>
                {MISSIONS.map((m, i) => (
                  <li key={m.title}>
                    <button
                      disabled={i > g.unlocked}
                      onClick={() => {
                        if (
                          g.mode === "journal" &&
                          ["playing", "map", "bearing", "pause"].includes(
                            g.journalReturn,
                          )
                        ) {
                          setRestart(true);
                          return;
                        }
                        start(i);
                      }}
                    >
                      <span>
                        {g.records.some((r) => r.mission === i)
                          ? "✓"
                          : String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{m.title}</strong>
                        <small>
                          {m.skill}
                          {i > g.unlocked ? " · 上一封回信后开启" : ""}
                        </small>
                      </div>
                      <b>↗</b>
                    </button>
                  </li>
                ))}
              </ol>
              {restart && (
                <div className={styles.confirm}>
                  <p>
                    先完成当前回信，或回暂停页重新出发。你的当前路程仍保留。
                  </p>
                  <button
                    onClick={() => {
                      setRestart(false);
                      act((s) => {
                        closeJournal(s);
                      });
                    }}
                  >
                    回到当前旅程
                  </button>
                </div>
              )}
              {g.records.some((r) => r.mission === 5) && (
                <div className={styles.daily}>
                  <h3>想再逛一座新小镇？</h3>
                  <button onClick={() => start(5, dailySeed(), true)}>
                    今日街区
                  </button>
                  <button
                    onClick={() => start(5, Date.now() % 4294967296, true)}
                  >
                    另一阵海风 · 新地图
                  </button>
                  {g.mission === 5 && (
                    <button onClick={shareMap}>复制这张地图的同行链接</button>
                  )}
                  {share && (
                    <p role="status" className={styles.shareText}>
                      {share}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <h3>沿途的风景邮票</h3>
              <div className={styles.stampCollection}>
                {g.world.places.map((p) => (
                  <div
                    key={p.id}
                    data-collected={g.stamps.some((id) => id.endsWith(`:${p.id}`),)}
                    style={{ "--stamp-color": p.color } as React.CSSProperties}
                  >
                    <span>{p.symbol}</span>
                    <strong>{p.name}</strong>
                    <small>
                      {g.stamps.some((id) => id.endsWith(`:${p.id}`))
                        ? "已经遇见"
                        : "等你发现"}
                    </small>
                  </div>
                ))}
              </div>
              <h3>最近的旅程</h3>
              {g.records.length ? (
                <ul className={styles.records}>
                  {g.records
                    .slice(-5)
                    .reverse()
                    .map((r, i) => (
                      <li key={i}>
                        <strong>{MISSIONS[r.mission].title}</strong>
                        <span>
                          {Math.round(r.distance)} 米 · 定位 {r.locations} 次 ·
                          问路 {r.hints} 次{r.comfort ? " · 舒适探索" : ""}
                        </span>
                        <small>
                          地图 #{r.seed} · {r.day}
                        </small>
                      </li>
                    ))}
                </ul>
              ) : (
                <p>把第一封回信带回来，这里就会留下你的脚步。</p>
              )}
              <details className={styles.research}>
                <summary>为什么这样练习？</summary>
                <p>
                  主动选路、观察地标、尝试回忆和更换地图，让你有机会练习不同找路动作。研究支持空间技能可以练习，但本游戏尚未验证能改善现实导航。
                </p>
                <a
                  href="https://doi.org/10.1038/s41598-020-62877-0"
                  target="_blank"
                  rel="noreferrer"
                >
                  自主导航与 GPS 使用研究 ↗
                </a>
                <a
                  href="https://doi.org/10.1037/a0028446"
                  target="_blank"
                  rel="noreferrer"
                >
                  空间技能训练元分析 ↗
                </a>
              </details>
            </div>
          </div>
        </Modal>
      )}
      {g.branchRecall && !regionPreview && g.mode === "playing" && (
        <Modal title="这条支路走过吗？" className={styles.brief}>
          <p className={styles.eyebrow}>JUNCTION MEMORY / 回想来路</p>
          <h2>面前这条路，你走过吗？</h2>
          {g.branchRecall.guess === null ? (
            <>
              <p>
                先看看入口的岩壁和地标，想想自己是否完整走过这条支路。答案不影响继续送信。
              </p>
              <div className={styles.pauseActions}>
                <button onClick={() => act((s) => answerBranch(s, true))}>
                  我走过这条路
                </button>
                <button onClick={() => act((s) => answerBranch(s, false))}>
                  还没有走过
                </button>
              </div>
            </>
          ) : (
            <p className={styles.feedback}>
              {g.branchRecall.guess === g.branchRecall.actual
                ? "你认出来了。"
                : "一起核对一下："}
              {g.branchRecall.actual
                ? "你已经完整走过这段路。换个方向看，它也还是同一条支路。"
                : "这段支路还没有完整走过。可以先留个记号，再进去看看。"}
            </p>
          )}
          <button
            className={styles.primary}
            onClick={() => {
              act((s) => {
                s.branchRecall = null;
              });
              captureMouse();
            }}
          >
            继续探索
          </button>
        </Modal>
      )}
      {regionPreview && (
        <Modal title="风邮远行路线" className={styles.regionModal}>
          <div className={styles.paperTop}>
            <div>
              <p className={styles.eyebrow}>BEYOND THE HARBOR / 远处还有路</p>
              <h2>这封信，只是出发。</h2>
            </div>
            <button
              className={styles.close}
              aria-label="合上远行路线"
              onClick={closeRegions}
            >
              ×
            </button>
          </div>
          <p>
            港口旁的双层回廊在另一座岛上，山脚下的洞口通向弯曲的石廊。八封信会一点点把你带过去。
          </p>
          <div className={styles.regionPreview}>
            {REGIONS.map((r, i) => (
              <article key={r.title}>
                <div className={styles.regionSketch} data-theme={r.theme}>
                  <span>{["≈", "↕", "↗", "◇"][i]}</span>
                  <i />
                  <i />
                  <i />
                </div>
                <h3>{r.title}</h3>
                <p>{r.detail}</p>
              </article>
            ))}
          </div>
          <p className={styles.feedback}>
            第一封先熟悉走路。之后木桥会被鲤鱼咬断；商场要辨认楼层；洞窟看不见远处全貌，还要认出回头路和没走过的岔口。
          </p>
          <button className={styles.primary} onClick={closeRegions}>
            带着期待出发 ↗
          </button>
        </Modal>
      )}
      {storageError && (
        <p className={styles.storageNotice} role="status">
          本机存档暂不可用或已损坏。仍可游玩，本次进度可能无法保留。
        </p>
      )}
      {sceneError && (
        <Modal title="画面需要重新打开">
          <h2>小镇暂时没能展开。</h2>
          <p>{sceneError}</p>
          <button
            className={styles.primary}
            onClick={() => window.location.reload()}
          >
            重新载入
          </button>
          <Link className={styles.backLink} href="/demos">
            回游戏馆
          </Link>
        </Modal>
      )}
    </main>
  );
}
