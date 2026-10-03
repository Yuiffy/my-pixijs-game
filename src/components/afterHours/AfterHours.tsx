"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CHAPTERS, NOTES, actionLabel, objective } from "./content";
import {
  chooseEnding,
  createGame,
  fuseSwitch,
  interact,
  loadGame,
  look,
  pause,
  publicState,
  retry,
  SAVE_KEY,
  saveGame,
  startGame,
  stepGame,
  submitCode,
} from "./engine";
import { createAudio } from "./audio";
import type { Game, Input } from "./types";
import type { RenderStats } from "./Scene";
import styles from "./afterHours.module.css";

const Scene = dynamic(() => import("./Scene"), { ssr: false });
type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};
const SETTINGS_KEY = "sui-after-hours-settings";

export default function AfterHours() {
  const game = useRef(createGame());
  const stats = useRef<RenderStats>({
    calls: 0,
    triangles: 0,
    type: "loading",
    assets: [],
    fps: 0,
  });
  const keys = useRef(new Set<string>());
  const touch = useRef({ forward: 0, right: 0, run: false });
  const root = useRef<HTMLElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const audio = useRef<ReturnType<typeof createAudio> | null>(null);
  const saved = useRef<Game | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const joy = useRef<{ id: number; x: number; y: number } | null>(null);
  const expectedUnlock = useRef(false);
  const locked = useRef(false);
  const manualUntil = useRef(0);
  const [g, setG] = useState(game.current);
  const [ready, setReady] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [sceneVersion, setSceneVersion] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [muted, setMuted] = useState(false);
  const [code, setCode] = useState("");
  const [restart, setRestart] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });

  const refresh = useCallback(
    () => setG({
        ...game.current,
        player: { ...game.current.player },
        notes: [...game.current.notes],
      }),
    [],
  );
  const clearInputs = useCallback(() => {
    keys.current.clear();
    touch.current = { forward: 0, right: 0, run: false };
    drag.current = null;
    joy.current = null;
    setStick({ x: 0, y: 0 });
  }, []);
  const unlock = useCallback(() => {
    clearInputs();
    if (document.pointerLockElement) {
      expectedUnlock.current = true;
      document.exitPointerLock();
    }
  }, [clearInputs]);
  const store = useCallback(() => {
    if (game.current.mode === "title") return;
    try {
      localStorage.setItem(SAVE_KEY, saveGame(game.current));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(
    (message: string) => {
      pause(game.current, true);
      unlock();
      setSceneError(message);
      setReady(false);
      refresh();
    },
    [refresh, unlock],
  );
  const openJournal = useCallback(() => {
    if (game.current.mode !== "playing") return;
    game.current.panel = game.current.panel === "journal" ? "none" : "journal";
    unlock();
    refresh();
  }, [refresh, unlock]);
  const action = useCallback(() => {
    interact(game.current);
    if (game.current.panel !== "none" || game.current.mode !== "playing") unlock();
    store();
    refresh();
  }, [refresh, store, unlock]);

  useEffect(() => {
    audio.current = createAudio();
    try {
      saved.current = loadGame(localStorage.getItem(SAVE_KEY));
      setHasSave(Boolean(saved.current && !saved.current.ending));
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (typeof settings.muted === "boolean") setMuted(settings.muted);
      if (Number.isFinite(settings.brightness)) setBrightness(Math.max(0.8, Math.min(1.8, settings.brightness)));
      if (settings.quality === "low") setQuality("low");
    } catch {
      setStorageError(true);
    }
    const input = (): Input => ({
      forward: Math.max(
        -1,
        Math.min(
          1,
          (keys.current.has("KeyW") || keys.current.has("ArrowUp") ? 1 : 0) -
            (keys.current.has("KeyS") || keys.current.has("ArrowDown")
              ? 1
              : 0) +
            touch.current.forward,
        ),
      ),
      right: Math.max(
        -1,
        Math.min(
          1,
          (keys.current.has("KeyD") ? 1 : 0) -
            (keys.current.has("KeyA") ? 1 : 0) +
            touch.current.right,
        ),
      ),
      run:
        keys.current.has("ShiftLeft") ||
        keys.current.has("ShiftRight") ||
        touch.current.run,
    });
    const advance = (ms: number) => {
      if (!Number.isFinite(ms) || ms < 0) return;
      let remaining = Math.min(ms, 30000);
      while (remaining > 0) {
        const step = Math.min(remaining, 1000 / 60);
        const turn =
          (keys.current.has("ArrowLeft") ? 1 : 0) -
          (keys.current.has("ArrowRight") ? 1 : 0);
        look(game.current, (turn * step * 1.7) / 1000, 0);
        stepGame(game.current, step, input());
        remaining -= step;
      }
      if (!ms) stepGame(game.current, 0);
    };
    const host = window as GameWindow;
    host.render_game_to_text = () => JSON.stringify({
        ...publicState(game.current),
        renderer: stats.current,
        objective: objective(game.current),
        controls: {
          locked: locked.current,
          forward: input().forward,
          right: input().right,
          running: input().run,
        },
        storageAvailable: !storageError,
      });
    host.advanceTime = (ms) => {
      advance(ms);
      manualUntil.current = performance.now() + 120;
      refresh();
      store();
    };
    let frame = 0;
    let previous = performance.now();
    let published = previous;
    let stored = previous;
    let revision = -1;
    const loop = (now: number) => {
      const delta = Math.min(80, Math.max(0, now - previous));
      previous = now;
      if (now >= manualUntil.current && !document.hidden) advance(delta);
      audio.current?.update(game.current);
      if (now - published > 100) {
        refresh();
        published = now;
      }
      if (game.current.revision !== revision || now - stored > 3000) {
        store();
        stored = now;
        revision = game.current.revision;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const keyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.code !== 'Escape') return;
      const control = [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyE",
        "KeyF",
        "KeyJ",
        "KeyP",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ShiftLeft",
        "ShiftRight",
        "Escape",
      ];
      if (!control.includes(event.code)) return;
      event.preventDefault();
      if (event.repeat) return;
      keys.current.add(event.code);
      if (event.code === "KeyE") action();
      if (
        event.code === "KeyF" &&
        game.current.mode === "playing" &&
        game.current.panel === "none"
      ) game.current.flashlight = !game.current.flashlight;
      if (event.code === "KeyJ") openJournal();
      if (event.code === "Escape" || event.code === "KeyP") {
        if (game.current.panel !== "none") game.current.panel = "none";
        else pause(game.current, game.current.mode !== "paused");
        unlock();
      }
      refresh();
    };
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.code);
    const mouse = (event: MouseEvent) => {
      if (document.pointerLockElement === view.current) look(
          game.current,
          -event.movementX * 0.0023,
          -event.movementY * 0.0023,
        );
    };
    const lockChange = () => {
      const wasLocked = locked.current;
      locked.current = Boolean(document.pointerLockElement);
      if (wasLocked && !locked.current) {
        if (!expectedUnlock.current && game.current.panel === "none") pause(game.current, true);
        expectedUnlock.current = false;
        clearInputs();
        refresh();
      }
    };
    const blur = () => {
      if (game.current.mode === "playing") pause(game.current, true);
      unlock();
      store();
      refresh();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("mousemove", mouse);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerlockchange", lockChange);
    return () => {
      cancelAnimationFrame(frame);
      store();
      unlock();
      audio.current?.dispose();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("mousemove", mouse);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerlockchange", lockChange);
      delete host.render_game_to_text;
      delete host.advanceTime;
    };
    // Listener lifetime follows the mounted game. Mutable refs own live values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, clearInputs, openJournal, refresh, store, unlock]);

  useEffect(() => {
    audio.current?.mute(muted);
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ muted, brightness, quality }),
      );
    } catch {
      setStorageError(true);
    }
  }, [muted, brightness, quality]);

  const begin = (continuing: boolean) => {
    unlock();
    game.current = continuing && saved.current ? saved.current : createGame();
    startGame(game.current);
    setRestart(false);
    setHasSave(true);
    setCode("");
    audio.current?.begin();
    audio.current?.mute(muted);
    store();
    refresh();
  };
  const closePanel = () => {
    game.current.panel = "none";
    clearInputs();
    refresh();
  };
  const moveStick = (event: ReactPointerEvent<HTMLElement>) => {
    if (!joy.current || joy.current.id !== event.pointerId) return;
    const dx = event.clientX - joy.current.x;
    const dy = event.clientY - joy.current.y;
    const length = Math.max(40, Math.hypot(dx, dy));
    touch.current.right = dx / length;
    touch.current.forward = -dy / length;
    setStick({ x: (dx / length) * 30, y: (dy / length) * 30 });
  };
  const startLook = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      game.current.mode !== "playing" ||
      game.current.panel !== "none" ||
      game.current.hidden
    ) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === "mouse" && !document.pointerLockElement) {
      event.currentTarget.requestPointerLock()?.catch(() => {});
    }
  };
  const moveLook = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !drag.current ||
      drag.current.id !== event.pointerId ||
      document.pointerLockElement
    ) return;
    look(
      game.current,
      -(event.clientX - drag.current.x) * 0.0045,
      -(event.clientY - drag.current.y) * 0.0045,
    );
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const active = g.mode === "playing" && g.panel === "none";
  const chapter = CHAPTERS[g.stage];
  const danger =
    g.stage === "chase" && !g.hidden
      ? Math.max(
          0,
          1 - Math.hypot(g.player.x - g.echo.x, g.player.z - g.echo.z) / 5,
        )
      : 0;
  const submit = () => {
    submitCode(game.current, code);
    store();
    refresh();
  };

  return (
    <main className={styles.root} ref={root} data-stage={g.stage}>
      <div
        className={styles.scene}
        ref={view}
        role="presentation"
        onPointerDown={startLook}
        onPointerMove={moveLook}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {!sceneError && (
          <Scene
            key={sceneVersion}
            game={game}
            stats={stats}
            brightness={brightness}
            quality={quality}
            onReady={onReady}
            onError={onError}
          />
        )}
      </div>
      <div
        className={styles.vignette}
        style={{
          boxShadow: `inset 0 0 ${90 + danger * 100}px ${danger * 36}px rgba(${danger > 0.2 ? "118,20,46" : "5,8,16"},${0.25 + danger * 0.4})`,
        }}
      />
      {g.hidden && (
        <div className={styles.hiding}>
          <span />{" "}
          <p>
            衣柜里 · 放轻呼吸
            <br />
            <small>E / 互动 · 离开</small>
          </p>
        </div>
      )}
      {g.mode === "title" && (
        <div className={styles.titleScreen}>
          <div className={styles.titleCopy}>
            <p className={styles.eyebrow}>SUI / AFTER HOURS</p>
            <h1>
              零点<span>之后</span>
            </h1>
            <p className={styles.titleSui}>岁己 · 一场没有结束的直播</p>
            <div className={styles.rule} />
            <p className={styles.intro}>
              你已经说过晚安。
              <br />
              可房间里的另一个你，还在等最后一句话。
            </p>
            <div className={styles.titleActions}>
              {hasSave && (
                <button
                  className={styles.primary}
                  disabled={!ready}
                  onClick={() => begin(true)}
                >
                  继续 · {CHAPTERS[saved.current?.stage || "home"].name}
                </button>
              )}
              <button
                className={hasSave ? styles.secondary : styles.primary}
                id="after-hours-start"
                disabled={!ready}
                onClick={() => {
                  if (hasSave) setRestart(true);
                  else begin(false);
                }}
              >
                {ready ? "从下播那一刻开始" : "正在准备房间…"} <span>↗</span>
              </button>
            </div>
            <p className={styles.genre}>
              第一人称心理恐怖 · 探索 / 解谜 / 追逐
              <br />
              <span>扮演岁己。耳机体验更好，可随时暂停。</span>
            </p>
          </div>
          <Link href="/demos" className={styles.back}>
            ← 游戏馆
          </Link>
          <span className={styles.titleTime}>23:59:59</span>
        </div>
      )}
      {g.mode !== "title" && g.mode !== "ending" && (
        <>
          <div className={styles.hud}>
            <p>{chapter.name}</p>
            <span>{objective(g)}</span>
            {g.notice.until > g.time && (
              <small role="status">{g.notice.text}</small>
            )}
          </div>
          <div className={styles.tools}>
            <button aria-label="打开手记" onClick={openJournal}>
              手记 <kbd>J</kbd>
            </button>
            <button
              aria-label="暂停游戏"
              onClick={() => {
                pause(game.current, true);
                unlock();
                refresh();
              }}
            >
              暂停 <kbd>Esc</kbd>
            </button>
          </div>
          {active && !g.hidden && (
            <span className={styles.reticle} data-focused={Boolean(g.focus)} />
          )}
          {active && (g.focus || g.hidden) && (
            <button className={styles.prompt} onClick={action}>
              <kbd>E</kbd> {g.hidden ? "离开衣柜" : actionLabel(g, g.focus!)}{" "}
              <span>互动</span>
            </button>
          )}
          {g.subtitle.until > g.time && (
            <div className={styles.subtitle} aria-live="polite">
              <span>{g.subtitle.speaker}</span>
              <p>“{g.subtitle.text}”</p>
            </div>
          )}
          {active && (
            <div className={styles.bottom}>
              <span>
                {g.flashlight ? "● 手电已开" : "○ F 手电"} ·{" "}
                {g.hidden ? "屏住呼吸" : "Shift 快跑"}
              </span>
              <div
                className={styles.stamina}
                aria-label={`体力 ${Math.round(g.player.stamina)}`}
              >
                <i style={{ width: `${g.player.stamina}%` }} />
              </div>
            </div>
          )}
          {active && g.time < 13 && (
            <p className={styles.hint}>
              WASD 移动 · 点击画面 / 拖动转头 · 方向键也能转头
            </p>
          )}
          {active && (
            <div className={styles.touch}>
              <button
                className={styles.stick}
                aria-label="移动摇杆"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  joy.current = {
                    id: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                  };
                }}
                onPointerMove={moveStick}
                onPointerUp={() => {
                  joy.current = null;
                  touch.current.forward = 0;
                  touch.current.right = 0;
                  setStick({ x: 0, y: 0 });
                }}
                onPointerCancel={() => {
                  joy.current = null;
                  touch.current.forward = 0;
                  touch.current.right = 0;
                  setStick({ x: 0, y: 0 });
                }}
              >
                <i
                  style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
                />
                <span>移动</span>
              </button>
              <div className={styles.touchActions}>
                <button
                  aria-label="开关手电"
                  onClick={() => {
                    game.current.flashlight = !game.current.flashlight;
                    refresh();
                  }}
                >
                  手电
                </button>
                <button
                  aria-label="按住快跑"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    touch.current.run = true;
                  }}
                  onPointerUp={() => {
                    touch.current.run = false;
                  }}
                  onPointerCancel={() => {
                    touch.current.run = false;
                  }}
                >
                  快跑
                </button>
                <button
                  className={styles.interactTouch}
                  disabled={!g.focus && !g.hidden}
                  onClick={action}
                >
                  互动
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {g.panel !== "none" && g.mode === "playing" && (
        <div className={styles.scrim}>
          <section
            className={`${styles.panel} ${g.panel === "journal" ? styles.journal : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              g.panel === "journal"
                ? "收工手记"
                : g.panel === "fuse"
                  ? "配电箱"
                  : g.panel === "code"
                    ? "午夜密码"
                    : "最后一句话"
            }
          >
            <button
              className={styles.close}
              aria-label="收起面板"
              onClick={closePanel}
            >
              ×
            </button>
            {g.panel === "journal" && (
              <>
                <p className={styles.eyebrow}>FIELD NOTES / SUI</p>
                <h2>收工手记</h2>
                <p className={styles.journalGoal}>{objective(g)}</p>
                {g.notes.length ? (
                  g.notes.map((id) => (
                    <article key={id}>
                      <h3>{NOTES[id]?.title}</h3>
                      <p>{NOTES[id]?.text}</p>
                    </article>
                  ))
                ) : (
                  <p>房间里有些不对劲。找到的便签和录音会留在这里。</p>
                )}
                <p className={styles.controls}>
                  WASD / 左摇杆：移动 鼠标 / 右侧滑动：转头
                  <br />
                  E：互动 F：手电 Shift：快跑 J：手记 Esc：暂停
                  <br />
                  追逐时可以躲进卧室衣柜，等她走远再出来。
                </p>
              </>
            )}
            {g.panel === "fuse" && (
              <>
                <p className={styles.eyebrow}>POWER / THREE CIRCUITS</p>
                <h2>把灯接回来</h2>
                <p>
                  配电箱只能按顺序接通。
                  <br />
                  冰箱上的便签记着怎么做。
                </p>
                <div className={styles.fuses}>
                  {["星", "月亮", "太阳"].map((name, index) => (
                    <button
                      key={name}
                      disabled={g.fuse.includes(index)}
                      onClick={() => {
                        fuseSwitch(game.current, index);
                        refresh();
                        store();
                      }}
                    >
                      {["✦", "☾", "☀"][index]}
                      <span>{name}</span>
                      <small>
                        {g.fuse.includes(index) ? "已接通" : "接通"}
                      </small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {g.panel === "code" && (
              <>
                <p className={styles.eyebrow}>LOCK / MIDNIGHT MEMORY</p>
                <h2>停住的时间</h2>
                <p>四位数字。把录音里的时间留下来。</p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  <label className={styles.codeLabel} htmlFor="midnight-code">
                    午夜密码
                    <input
                      id="midnight-code"
                      className={styles.code}
                      value={code}
                      placeholder="_ _ _ _"
                      maxLength={4}
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      autoComplete="off"
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    />
                  </label>
                  <button
                    className={styles.primary}
                    type="submit"
                    disabled={code.length !== 4}
                  >
                    确认时间 →
                  </button>
                </form>
                <button className={styles.secondary} onClick={openJournal}>
                  回看三段录音
                </button>
              </>
            )}
            {g.panel === "choice" && (
              <>
                <p className={styles.eyebrow}>ONE LAST GOODNIGHT</p>
                <h2>最后一句话</h2>
                <p>
                  “如果明天没有人叫我的名字，
                  <br />
                  我是不是就不算来过这里？”
                </p>
                <button
                  className={styles.primary}
                  onClick={() => {
                    chooseEnding(game.current, "name");
                    refresh();
                    store();
                  }}
                >
                  记住她，关掉直播，走向天亮
                </button>
                <button
                  className={styles.secondary}
                  onClick={() => {
                    chooseEnding(game.current, "stay");
                    refresh();
                    store();
                  }}
                >
                  再陪她一会儿，留在零点
                </button>
              </>
            )}
            {g.notice.until > g.time && g.panel !== "journal" && (
              <small className={styles.panelNotice} role="status">
                {g.notice.text}
              </small>
            )}
          </section>
        </div>
      )}
      {g.mode === "paused" && !sceneError && (
        <div className={styles.scrim}>
          <section
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="暂停游戏"
          >
            <p className={styles.eyebrow}>PAUSE / TAKE A BREATH</p>
            <h2>房间会等你</h2>
            <p>{chapter.name} · 本机自动存档</p>
            <button
              className={styles.primary}
              onClick={() => {
                clearInputs();
                pause(game.current, false);
                audio.current?.begin();
                refresh();
              }}
            >
              继续 →
            </button>
            <div className={styles.settings}>
              <button onClick={() => setMuted((v) => !v)}>
                声音：{muted ? "关闭" : "开启"}
              </button>
              <button
                onClick={() => setQuality((v) => (v === "high" ? "low" : "high"))}
              >
                画质：{quality === "high" ? "精细" : "节能"}
              </button>
              <label htmlFor="after-hours-brightness">
                画面亮度{" "}
                <input
                  id="after-hours-brightness"
                  type="range"
                  min=".8"
                  max="1.8"
                  step=".1"
                  value={brightness}
                  onChange={(event) => setBrightness(Number(event.target.value))}
                />
              </label>
              <button
                onClick={() => {
                  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                  else root.current?.requestFullscreen().catch(() => {});
                }}
              >
                切换全屏
              </button>
            </div>
            <p className={styles.controls}>
              WASD 移动 · 鼠标 / 拖动转头 · E 互动
              <br />F 手电 · J 手记 · Shift 快跑 · Esc 暂停
              <br />
              触屏：左摇杆移动，右侧画面滑动转头。
            </p>
            <button
              className={styles.secondary}
              onClick={() => setRestart(true)}
            >
              重新开始
            </button>
            <Link href="/demos" className={styles.textLink}>
              返回游戏馆
            </Link>
          </section>
        </div>
      )}
      {g.mode === "dead" && (
        <div className={`${styles.scrim} ${styles.death}`}>
          <section
            className={styles.panel}
            role="dialog"
            aria-label="回声找到了你"
          >
            <p className={styles.eyebrow}>SHE FOUND YOU</p>
            <h2>你又回来了</h2>
            <p>
              “别怕。我们可以从这里重新开始。”
              <br />
              已经关掉的回声源会保留。
            </p>
            <button
              className={styles.primary}
              onClick={() => {
                retry(game.current);
                clearInputs();
                refresh();
                store();
              }}
            >
              回到本章检查点 →
            </button>
          </section>
        </div>
      )}
      {g.mode === "ending" && (
        <div
          className={`${styles.ending} ${g.ending === "dawn" ? styles.dawn : ""}`}
        >
          <div>
            <p className={styles.eyebrow}>
              {g.ending === "dawn"
                ? "ENDING 01 / DAYBREAK"
                : "ENDING 02 / STILL ON AIR"}
            </p>
            <h1>{g.ending === "dawn" ? "天会亮" : "再陪我一会儿"}</h1>
            <p>
              {g.ending === "dawn"
                ? "你记住了她的名字，也把自己的名字带回了清晨。\n直播结束了。明天见，岁己。"
                : "时钟又回到了零点十七分。\n房间很温暖，最后一条弹幕永远不会离开。"}
            </p>
            <span className={styles.endingStats}>
              三段录音 · 三枚门印 · {g.deaths} 次回返
            </span>
            <button className={styles.primary} onClick={() => begin(false)}>
              从另一个选择再开始 →
            </button>
            <Link href="/demos" className={styles.textLink}>
              返回游戏馆
            </Link>
          </div>
        </div>
      )}
      {sceneError && (
        <div className={styles.scrim}>
          <section
            className={styles.panel}
            role="alertdialog"
            aria-label="恢复游戏画面"
          >
            <h2>房间暂时看不见了</h2>
            <p>{sceneError}</p>
            <button
              className={styles.primary}
              onClick={() => {
                setSceneError("");
                setSceneVersion((v) => v + 1);
              }}
            >
              重新载入 3D 画面
            </button>
          </section>
        </div>
      )}
      {restart && (
        <div className={styles.scrim}>
          <section
            className={styles.panel}
            role="alertdialog"
            aria-label="重新开始"
          >
            <h2>重新说一次晚安？</h2>
            <p>这会替换本机的当前旅程。</p>
            <button className={styles.primary} onClick={() => begin(false)}>
              从下播那一刻开始
            </button>
            <button
              className={styles.secondary}
              onClick={() => setRestart(false)}
            >
              保留旅程
            </button>
          </section>
        </div>
      )}
      {storageError && (
        <p className={styles.storage}>本机存档暂不可用，本次仍可继续。</p>
      )}
    </main>
  );
}
