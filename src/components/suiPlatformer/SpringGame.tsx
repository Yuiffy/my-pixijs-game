"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ENEMIES, HEIGHT, LEVELS, WIDTH } from "./content";
import type { EnemyKind } from "./content";
import {
  createGame,
  emptyInput,
  publicState,
  readSave,
  respawn,
  SAVE_KEY,
  startLevel,
  stepGame,
} from "./engine";
import type { Game, Input } from "./engine";
import type { Bridge } from "./SpringScene";
import SpringAudio from "./audio";
import styles from "./spring.module.css";

type Panel = "none" | "map" | "codex" | "help";
type Browser = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
  springTest?: {
    state: Game;
    input: (input: Partial<Input>) => void;
    start: (n: number) => void;
    manual: (on: boolean) => void;
    replay: (tape: Input[]) => void;
  };
};
const clock = (v: number) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`;

export default function SpringGame() {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const bridgeRef = useRef<Bridge | null>(null);
  const keys = useRef(new Set<string>());
  const pointers = useRef(new Map<number, keyof Input>());
  const [state, setState] = useState<Game | null>(null);
  const [ready, setReady] = useState(false);
  const [touchMode, setTouchMode] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>("none");
  const [notice, setNotice] = useState("");
  const [selectedEnemy, setSelectedEnemy] = useState<EnemyKind>("walker");
  const panelRef = useRef<Panel>("none");
  const panelBeforePhase = useRef<Game["phase"]>("title");
  const syncInput = useCallback(() => {
    const b = bridgeRef.current;
    if (!b) return;
    const k = keys.current;
    const p = Array.from(pointers.current.values());
    b.input = {
      left: k.has("ArrowLeft") || k.has("KeyA") || p.includes("left"),
      right: k.has("ArrowRight") || k.has("KeyD") || p.includes("right"),
      jump:
        k.has("Space") ||
        k.has("KeyW") ||
        k.has("ArrowUp") ||
        k.has("KeyZ") ||
        p.includes("jump"),
      run:
        k.has("ShiftLeft") ||
        k.has("ShiftRight") ||
        k.has("KeyX") ||
        p.includes("run"),
    };
  }, []);
  const clearInput = useCallback(() => {
    keys.current.clear();
    pointers.current.clear();
    if (bridgeRef.current) bridgeRef.current.input = emptyInput();
  }, []);
  const refresh = useCallback(() => {
    const b = bridgeRef.current;
    if (!b) return;
    setState({
      ...b.state,
      player: { ...b.state.player },
      save: { ...b.state.save, discovered: [...b.state.save.discovered] },
    });
    setReady(b.loaded);
    if (b.failure) setError(b.failure);
  }, []);
  const begin = useCallback(
    (index: number) => {
      const b = bridgeRef.current;
      if (!b?.loaded || b.failure) return;
      b.audio.unlock();
      clearInput();
      startLevel(b.state, index);
      panelRef.current = "none";
      setPanel("none");
      refresh();
      host.current?.focus();
    },
    [clearInput, refresh],
  );
  const closePanel = useCallback(() => {
    const b = bridgeRef.current;
    panelRef.current = "none";
    setPanel("none");
    clearInput();
    if (b && b.state.phase === "paused") b.state.phase = panelBeforePhase.current;
    refresh();
    host.current?.focus();
  }, [clearInput, refresh]);
  const openPanel = useCallback(
    (next: Panel) => {
      const b = bridgeRef.current;
      if (!b) return;
      if (panelRef.current === "none") panelBeforePhase.current = b.state.phase;
      if (b.state.phase === "playing" || b.state.phase === "dead") b.state.phase = "paused";
      clearInput();
      panelRef.current = next;
      setPanel(next);
      refresh();
    },
    [clearInput, refresh],
  );
  const pause = useCallback(() => {
    const b = bridgeRef.current;
    if (!b) return;
    clearInput();
    if (panelRef.current !== "none") {
      closePanel();
      return;
    }
    if (b.state.phase === "playing") b.state.phase = "paused";
    else if (b.state.phase === "paused") {
      b.state.phase = "playing";
      host.current?.focus();
    }
    refresh();
  }, [clearInput, closePanel, refresh]);

  useEffect(() => {
    let disposed = false;
    setTouchMode(navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;
    let saved = "";
    let localSave = readSave(null);
    try {
      localSave = readSave(localStorage.getItem(SAVE_KEY));
    } catch {
      setNotice("浏览器存储不可用，本次进度仍可正常游玩。");
    }
    const audio = new SpringAudio();
    audio.enabled = localSave.sound;
    const bridge: Bridge = {
      state: createGame(localSave),
      input: emptyInput(),
      scene: null,
      audio,
      loaded: false,
      manual: false,
      failure: "",
      onChange: () => {
        if (disposed) return;
        const raw = JSON.stringify(bridge.state.save);
        if (raw !== saved) {
          saved = raw;
          try {
            localStorage.setItem(SAVE_KEY, raw);
          } catch {
            setNotice("浏览器存储不可用，本次进度仍可正常游玩。");
          }
        }
        refresh();
      },
    };
    bridgeRef.current = bridge;
    const win = window as Browser;
    win.render_game_to_text = () => JSON.stringify(publicState(bridge.state));
    win.advanceTime = (ms) => bridge.scene?.tick(ms);
    if (new URLSearchParams(window.location.search).get("test") === "1") win.springTest = {
        state: bridge.state,
        input: (value) => {
          bridge.input = { ...emptyInput(), ...value };
        },
        start: (n) => {
          startLevel(bridge.state, n);
          refresh();
        },
        manual: (on) => {
          bridge.manual = on;
        },
        replay: (tape) => {
          for (const input of tape) stepGame(bridge.state, input);
          bridge.scene?.consume();
          bridge.scene?.paint();
          bridge.onChange();
        },
      };
    Promise.all([import("phaser"), import("./SpringScene")])
      .then(([{ default: Phaser }, { default: Scene }]) => {
        if (disposed || !host.current) return;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: host.current,
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: "#ffefd5",
          scene: new Scene(bridge),
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          render: { antialias: true, roundPixels: false },
          input: { keyboard: false },
          audio: { noAudio: true },
          banner: false,
        });
        const canvas = host.current.querySelector("canvas");
        if (canvas) {
          canvas.setAttribute("aria-label", "春日第一封信游戏画面");
          canvas.dataset.gameCanvas = "sui-spring";
        }
      })
      .catch(() => {
        if (!disposed) setError("游戏加载失败。请刷新页面重试。");
      });
    return () => {
      disposed = true;
      clearInput();
      game?.destroy(true);
      audio.destroy();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
      delete win.render_game_to_text;
      delete win.advanceTime;
      delete win.springTest;
    };
  }, [clearInput, refresh]);

  useEffect(() => {
    const used = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "KeyA",
      "KeyD",
      "KeyW",
      "KeyZ",
      "KeyX",
      "Space",
      "ShiftLeft",
      "ShiftRight",
    ];
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        if (!e.repeat) pause();
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(
          e.target.tagName,
        )
      ) return;
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        openPanel("codex");
        return;
      }
      if (e.code === "Enter" && !e.repeat) {
        const s = bridgeRef.current?.state;
        if (s?.phase === "title" && panelRef.current === "none") begin(s.save.unlocked);
        else if (s?.phase === "clear" && panelRef.current === "none") begin(Math.min(3, s.level + 1));
      }
      if (!used.includes(e.code)) return;
      e.preventDefault();
      if (
        bridgeRef.current?.state.phase !== "playing" ||
        panelRef.current !== "none"
      ) return;
      keys.current.add(e.code);
      syncInput();
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      syncInput();
    };
    const blur = () => {
      clearInput();
      if (bridgeRef.current?.state.phase === "playing") {
        bridgeRef.current.state.phase = "paused";
        refresh();
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [begin, clearInput, openPanel, pause, refresh, syncInput]);

  useEffect(() => {
    if (
      panel === "none" &&
      state?.phase !== "paused" &&
      state?.phase !== "clear"
    ) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const gameHost = host.current;
    const dialog = root.current?.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const nodes = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex="0"]',
        ),
      );
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      if (bridgeRef.current?.state.phase === "playing") gameHost?.focus();
      else if (previous?.isConnected) previous.focus();
    };
  }, [panel, state?.phase]);

  const touch = (
    e: ReactPointerEvent<HTMLButtonElement>,
    key: keyof Input,
    on: boolean,
  ) => {
    if (on) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, key);
      bridgeRef.current?.audio.unlock();
    } else pointers.current.delete(e.pointerId);
    syncInput();
  };
  const toggle = (key: "sound" | "assist") => {
    const b = bridgeRef.current;
    if (!b) return;
    b.state.save[key] = !b.state.save[key];
    if (key === "sound") {
      b.audio.enabled = b.state.save.sound;
      if (b.audio.enabled) b.audio.unlock();
    }
    b.onChange();
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setNotice("此浏览器暂不支持全屏。");
    }
  };
  const level = LEVELS[state?.level || 0];
  const playing = state?.phase === "playing" || state?.phase === "dead";
  const selected = ENEMIES[selectedEnemy];
  const known = state?.save.discovered.includes(selectedEnemy);

  return (
    <main className={styles.shell} ref={root} data-touch={touchMode}>
      <header className={styles.toolbar}>
        <Link href="/demos" className={styles.back} aria-label="返回游戏库">
          ← <span>游戏库</span>
        </Link>
        <div className={styles.brand}>
          <span className={styles.brandMark}>✿</span> 岁己的春日冒险{" "}
          <small>CHAPTER 01</small>
        </div>
        <nav aria-label="游戏工具" className={styles.tools}>
          <button onClick={() => openPanel("map")} title="关卡地图">
            地图
          </button>
          <button onClick={() => openPanel("codex")} title="敌人图鉴 B">
            图鉴 <small>{state?.save.discovered.length || 0}/7</small>
          </button>
          <button
            onClick={() => toggle("sound")}
            aria-label={state?.save.sound ? "关闭声音" : "开启声音"}
          >
            {state?.save.sound ? "♫" : "♪̸"}
          </button>
          <button onClick={fullscreen} aria-label="切换全屏">
            ⛶
          </button>
          {state?.phase !== "title" && (
            <button onClick={pause} aria-label="暂停或继续">
              Ⅱ
            </button>
          )}
        </nav>
      </header>
      <div className={styles.stage}>
        <div
          className={styles.canvas}
          ref={host}
          tabIndex={-1}
          role="application"
          aria-label="游戏操作区，方向键移动，空格跳跃，Shift加速，Escape暂停"
        />
        {!ready && !error && (
          <div className={styles.loading}>
            <span>✿</span>
            <p>正在把春天装进口袋…</p>
          </div>
        )}
        {error && (
          <div className={styles.loading}>
            <p role="alert">{error}</p>
            <button onClick={() => window.location.reload()}>重新加载</button>
          </div>
        )}
        {state?.phase === "title" && ready && !error && panel === "none" && (
          <section className={styles.title} aria-label="游戏标题">
            <div className={styles.titleCopy}>
              <p className={styles.eyebrow}>SUI&apos;S LITTLE ADVENTURE</p>
              <h1>
                春日
                <br />
                <span>第一封信</span>
                <i>✧</i>
              </h1>
              <p className={styles.intro}>
                从一封报名信，到第一次说出「晚上好」。
                <br />
                穿过小镇，把小小的勇气带上舞台。
              </p>
              <button
                className={styles.primary}
                onClick={() => begin(state.save.unlocked)}
              >
                {state.save.unlocked > 0 ? "继续春日冒险" : "把信寄出去"}{" "}
                <span>→</span>
              </button>
              <div className={styles.titleActions}>
                <button onClick={() => openPanel("map")}>选择关卡</button>
                <span>·</span>
                <button onClick={() => openPanel("help")}>怎么玩</button>
                <span className={styles.enterHint}>ENTER 开始</span>
              </div>
            </div>
            <div className={styles.titleArt} aria-hidden="true">
              <div className={styles.artSun} />
              <span className={styles.artStar}>✧</span>
              <Image
                src="/games/sui-spring/sui-run.png"
                width={320}
                height={320}
                unoptimized
                priority
                alt=""
              />
              <div className={styles.postmark}>
                春风邮局
                <br />
                <small>FIRST LETTER · 01</small>
              </div>
            </div>
            <p className={styles.titleFoot}>
              第一大关 · 初次开播的春日小镇{" "}
              <span>4 个手工关卡 / 12 枚星光信物</span>
            </p>
          </section>
        )}
        {(playing || state?.phase === "paused") && (
          <>
            <div className={styles.hud}>
              <div className={styles.levelName}>
                <span>{level.id}</span>
                <div>
                  {level.name}
                  <small>{level.subtitle}</small>
                </div>
              </div>
              <div className={styles.counters}>
                <span
                  className={styles.hearts}
                  aria-label={`${state.player.health}颗爱心`}
                >
                  {"♥".repeat(state.player.health)}
                  <i>{"♡".repeat(3 - state.player.health)}</i>
                </span>
                <span className={styles.coin}>
                  ● <b>{String(state.coins).padStart(2, "0")}</b>
                </span>
                <span className={styles.stars}>
                  {[0, 1, 2].map((n) => (
                    <i
                      key={n}
                      className={
                        state.stars.includes(`star-${n}`)
                          ? styles.collected
                          : ""
                      }
                    >
                      ★
                    </i>
                  ))}
                </span>
              </div>
            </div>
            <div className={styles.progress}>
              <i
                style={{
                  width: `${Math.min(100, (state.player.x / level.goal) * 100)}%`,
                }}
              />
            </div>
            {playing && state.toastTimer > 0 && (
              <div className={styles.toast} role="status">
                {state.toast}
              </div>
            )}
            <div className={styles.keyboardHint}>
              <span>← → 移动</span>
              <span>空格 长按高跳</span>
              <span>Shift / X 加速</span>
              <span>Esc 暂停</span>
            </div>
            {playing && (
              <div className={styles.touchControls} aria-label="触屏操作">
                {(["left", "right", "run", "jump"] as (keyof Input)[]).map(
                  (key, i) => (
                    <button
                      key={key}
                      className={key === "jump" ? styles.jumpButton : ""}
                      aria-label={["向左", "向右", "加速", "跳跃"][i]}
                      onPointerDown={(e) => touch(e, key, true)}
                      onPointerUp={(e) => touch(e, key, false)}
                      onPointerCancel={(e) => touch(e, key, false)}
                      onLostPointerCapture={(e) => touch(e, key, false)}
                    >
                      {["←", "→", "跑", "跳"][i]}
                    </button>
                  ),
                )}
              </div>
            )}
          </>
        )}
        {state?.phase === "paused" && panel === "none" && (
          <div className={styles.veil}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label="暂停"
              className={styles.pause}
            >
              <span className={styles.eyebrow}>TAKE A LITTLE BREATH</span>
              <h2>在春风里歇一会儿</h2>
              <p>
                第 {level.id} 关 · {level.name}
              </p>
              <button className={styles.primary} onClick={pause}>
                继续冒险 →
              </button>
              <div className={styles.pauseActions}>
                <button
                  onClick={() => {
                    const b = bridgeRef.current;
                    if (b) {
                      respawn(b.state);
                      clearInput();
                      refresh();
                    }
                  }}
                >
                  回到检查点
                </button>
                <button onClick={() => openPanel("map")}>关卡地图</button>
                <button onClick={() => openPanel("help")}>操作与设置</button>
              </div>
            </section>
          </div>
        )}
        {state?.phase === "clear" && panel === "none" && (
          <div className={styles.veil}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label="关卡完成"
              className={styles.clear}
            >
              <p className={styles.eyebrow}>
                {state.level === 3 ? "THE FIRST HELLO" : "A LITTLE BRAVER"}
              </p>
              <div className={styles.clearStars}>
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className={
                      state.stars.includes(`star-${n}`) ? styles.collected : ""
                    }
                  >
                    ★
                  </span>
                ))}
              </div>
              <h2>
                {state.level === 3 ? "晚上好，我是岁己。" : "又向前迈了一小步"}
              </h2>
              <p className={styles.ending}>{level.ending}</p>
              <div className={styles.results}>
                <span>
                  <b>{state.coins}</b>枚春日金币
                </span>
                <span>
                  <b>{clock(state.clock)}</b>本次用时
                </span>
                <span>
                  <b>{state.deaths}</b>次重新出发
                </span>
              </div>
              <p className={styles.saveNote}>
                关卡与信物已自动保存 · 收集信物不影响解锁
              </p>
              <button
                className={styles.primary}
                onClick={() => (state.level === 3 ? openPanel("map") : begin(state.level + 1))}
              >
                {state.level === 3
                  ? "回看春日地图"
                  : `出发去 ${LEVELS[state.level + 1].id}`}{" "}
                →
              </button>
              <div className={styles.titleActions}>
                <button onClick={() => begin(state.level)}>
                  再找找没拿到的星光
                </button>
                <button onClick={() => openPanel("codex")}>看看新朋友</button>
              </div>
            </section>
          </div>
        )}
        {panel !== "none" && state && (
          <div className={styles.veil}>
            <section
              className={`${styles.panel} ${panel === "codex" ? styles.codex : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={
                panel === "map"
                  ? "春日关卡地图"
                  : panel === "codex"
                    ? "敌人图鉴"
                    : "操作与设置"
              }
            >
              <button
                className={styles.close}
                onClick={closePanel}
                aria-label="关闭面板"
              >
                ×
              </button>
              <p className={styles.eyebrow}>
                {panel === "map"
                  ? "A SMALL TOWN, A BIG FIRST STEP"
                  : panel === "codex"
                    ? "THE FACES ALONG THE WAY"
                    : "MAKE YOURSELF AT HOME"}
              </p>
              <h2>
                {panel === "map"
                  ? "初次开播的春日小镇"
                  : panel === "codex"
                    ? "路上遇见的朋友"
                    : "先跑跑，再跳跳"}
              </h2>
              {panel === "map" && (
                <>
                  <p className={styles.panelIntro}>
                    一封信，一阵风，一束光，还有第一句问候。
                  </p>
                  <div className={styles.mapRoute}>
                    {LEVELS.map((l, i) => (
                      <button
                        key={l.id}
                        disabled={i > state.save.unlocked}
                        onClick={() => begin(i)}
                        className={styles.mapStop}
                      >
                        <span className={styles.mapIcon}>
                          {["✉", "♧", "✧", "♫"][i]}
                        </span>
                        <small>{l.id}</small>
                        <strong>{l.name}</strong>
                        <span className={styles.mapStars}>
                          {i > state.save.unlocked
                            ? "尚未抵达"
                            : [0, 1, 2]
                                .map((n) => (state.save.best[i]?.stars.includes(
                                    `star-${n}`,
                                  )
                                    ? "★"
                                    : "☆"),)
                                .join(" ")}
                        </span>
                        {state.save.best[i]?.time > 0 && (
                          <em>最佳 {clock(state.save.best[i].time)}</em>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className={styles.saveNote}>
                    通关后解锁下一关 · 每关 3 枚星光 · 进度保存在当前浏览器
                  </p>
                  <p className={styles.fiction}>
                    本章是围绕「报名—试音—准备—首播」创作的童话，不是现实经历的逐条复述。
                  </p>
                </>
              )}
              {panel === "codex" && (
                <>
                  <p className={styles.panelIntro}>
                    靠近就能收录，不必打败。{state.save.discovered.length} / 7
                    位已遇见。
                  </p>
                  <div className={styles.codexLayout}>
                    <div className={styles.enemyList}>
                      {(Object.keys(ENEMIES) as EnemyKind[]).map((kind) => {
                        const discovered = state.save.discovered.includes(kind);
                        return (
                          <button
                            key={kind}
                            onClick={() => setSelectedEnemy(kind)}
                            aria-pressed={selectedEnemy === kind}
                            className={
                              selectedEnemy === kind ? styles.selectedEnemy : ""
                            }
                          >
                            <Image
                              width={46}
                              height={46}
                              unoptimized
                              src={`/images/autochess/portraits/minimal/${ENEMIES[kind].art}.png`}
                              className={discovered ? "" : styles.silhouette}
                              alt=""
                            />
                            <span>
                              {discovered ? ENEMIES[kind].name : "尚未遇见"}
                              <small>
                                {discovered
                                  ? ENEMIES[kind].character
                                  : "继续向前看看吧"}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <article className={styles.enemyDetail}>
                      <div
                        className={styles.enemyPortrait}
                        style={{ background: `${selected.color}22` }}
                      >
                        <Image
                          width={115}
                          height={115}
                          unoptimized
                          src={`/images/autochess/portraits/minimal/${selected.art}.png`}
                          className={known ? "" : styles.silhouette}
                          alt={known ? selected.character : "未发现角色的剪影"}
                        />
                      </div>
                      <small>
                        {known ? selected.character : "UNKNOWN FRIEND"}
                      </small>
                      <h3>{known ? selected.name : "在下一段旅途中相遇"}</h3>
                      <p>
                        {known
                          ? selected.role
                          : "在关卡中靠近这位朋友，图鉴就会记录她的样子与行动方式。"}
                      </p>
                      {known && (
                        <div className={styles.tip}>
                          <b>怎么应对</b>
                          <p>{selected.tip}</p>
                        </div>
                      )}
                    </article>
                  </div>
                </>
              )}
              {panel === "help" && (
                <>
                  <div className={styles.helpGrid}>
                    <p>
                      <kbd>← →</kbd>
                      <kbd>A D</kbd>
                      <b>移动</b>
                      <span>有一点惯性；反向按键可以刹车。</span>
                    </p>
                    <p>
                      <kbd>空格 / W / ↑ / Z</kbd>
                      <b>跳跃</b>
                      <span>
                        轻点小跳，长按高跳。离台瞬间也能跳，落地前按下也能接上。
                      </span>
                    </p>
                    <p>
                      <kbd>Shift / X</kbd>
                      <b>加速跑</b>
                      <span>跑起来能跳得更远，空中也能小幅变向。</span>
                    </p>
                    <p>
                      <kbd>Esc / P</kbd>
                      <kbd>B</kbd>
                      <b>暂停 / 图鉴</b>
                      <span>
                        面板打开与切到后台时暂停。踩怪时按住跳跃可以反弹更高。
                      </span>
                    </p>
                  </div>
                  <div className={styles.settings}>
                    <button
                      aria-pressed={state.save.sound}
                      onClick={() => toggle("sound")}
                    >
                      音乐与音效 <b>{state.save.sound ? "开启" : "关闭"}</b>
                    </button>
                    <button
                      aria-pressed={state.save.assist}
                      onClick={() => toggle("assist")}
                    >
                      轻松模式 <b>{state.save.assist ? "开启" : "关闭"}</b>
                    </button>
                  </div>
                  <p className={styles.saveNote}>
                    轻松模式延长受伤后的保护时间。跌落仍会回到检查点，重试次数不限。
                  </p>
                  <p className={styles.fiction}>
                    触屏：按住左右移动、按住「跑」加速、轻点或长按「跳」。横屏视野更好。
                  </p>
                </>
              )}
            </section>
          </div>
        )}
        {notice && (
          <button className={styles.notice} onClick={() => setNotice("")}>
            {notice} ×
          </button>
        )}
      </div>
      <footer className={styles.footer}>
        <span>✿ 春风会记得每一次出发。</span>
        <span>第一大关 · 1-1 — 1-4</span>
      </footer>
    </main>
  );
}
