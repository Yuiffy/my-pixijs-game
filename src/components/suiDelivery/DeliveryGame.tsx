"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import DeliveryAudio from "./audio";
import { LEGACY_KEY, SAVE_KEY, VIEW } from "./content";
import { deliveryLevel, LEVELS, levelUnlocked, nextOrder } from "./levels";
import {
  createDelivery,
  deliveryInput,
  deliveryPublicState,
  resizeDeliveryViewport,
  retryDelivery,
  startDelivery,
  stepDelivery,
  visitBanquet,
} from "./engine";
import { legacyRecord, readDeliverySave } from "./save";
import type { DeliveryBridge } from "./DeliveryScene";
import type { DeliveryGame as Game, DeliveryInput } from "./types";
import HomePanel from "./HomePanel";
import { decorateHome } from "./home";
import styles from "./delivery.module.css";

type Panel = "none" | "help" | "kit" | "practice" | "orders" | "home";
type DeliveryWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
  deliveryTest?: {
    manual: (value: boolean) => void;
    input: (value: Partial<DeliveryInput>) => void;
    replay: (tape: DeliveryInput[]) => void;
    audio: () => ReturnType<DeliveryAudio["diagnostics"]>;
    oven: () => { shell: { visible: boolean; x: number; y: number }; claw: { visible: boolean; flipX: boolean }; facades: string[] } | null;
    market: () => { cart: { visible: boolean; x: number; y: number; scaleX: number; scaleY: number; texture: string }; facades: string[] } | null;
    serving: () => { ladle: { visible: boolean; x: number; y: number; texture: string }; lights: { visible: boolean; x: number; y: number; color: number }[]; facades: { key: string; x: number; y: number; scale: number }[] } | null;
    sprite: () => { texture: string; frame: string | number; x: number; y: number; flipX: boolean; originY: number; angle: number; size: number } | null;
  };
};
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
export default function DeliveryGame() {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const bridge = useRef<DeliveryBridge | null>(null);
  const keys = useRef(new Set<string>());
  const pointers = useRef(new Map<number, keyof DeliveryInput>());
  const panelRef = useRef<Panel>("none");
  const phaseBefore = useRef<Game["phase"]>("title");
  const [view, setView] = useState<Game | null>(null);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [touchMode, setTouchMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ReturnType<typeof legacyRecord>>(null);
  const refresh = useCallback(() => {
    const b = bridge.current;
    if (!b) return;
    b.audio.enabled = b.state.save.settings.sound;
    b.audio.setPhase(b.state.phase);
    setView({
      ...b.state,
      player: { ...b.state.player },
      save: { ...b.state.save, settings: { ...b.state.save.settings } },
    });
    setReady(b.loaded);
    if (b.error) setError(b.error);
  }, []);
  const clear = useCallback(() => {
    keys.current.clear();
    pointers.current.clear();
    if (bridge.current) bridge.current.input = deliveryInput();
  }, []);
  const sync = useCallback(() => {
    if (!bridge.current) return;
    const k = keys.current;
    const p = Array.from(pointers.current.values());
    bridge.current.input = {
      left: k.has("ArrowLeft") || k.has("KeyA") || p.includes("left"),
      right: k.has("ArrowRight") || k.has("KeyD") || p.includes("right"),
      jump:
        k.has("Space") ||
        k.has("KeyW") ||
        k.has("ArrowUp") ||
        p.includes("jump"),
      run: k.has("ShiftLeft") || k.has("ShiftRight") || p.includes("run"),
      attack: k.has("KeyJ") || k.has("KeyX") || p.includes("attack"),
      interact: k.has("KeyE") || p.includes("interact"),
      dash: k.has("KeyK") || p.includes("dash"),
    };
  }, []);
  const begin = useCallback(
    (mode: Game["mode"] = "story", cp?: string, levelId?: string) => {
      const b = bridge.current;
      if (!b?.loaded || b.error) return;
      clear();
      b.audio.unlock();
      startDelivery(b.state, mode, cp, levelId);
      panelRef.current = "none";
      setPanel("none");
      refresh();
      host.current?.focus();
    },
    [clear, refresh],
  );
  const close = useCallback(() => {
    const b = bridge.current;
    clear();
    panelRef.current = "none";
    setPanel("none");
    if (b?.state.phase === "paused") b.state.phase = phaseBefore.current;
    refresh();
    host.current?.focus();
  }, [clear, refresh]);
  const open = useCallback(
    (value: Panel) => {
      const b = bridge.current;
      if (!b) return;
      if (panelRef.current === "none") phaseBefore.current = b.state.phase;
      if (b.state.phase === "playing" || b.state.phase === "dead") b.state.phase = "paused";
      clear();
      panelRef.current = value;
      setPanel(value);
      refresh();
    },
    [clear, refresh],
  );
  const pause = useCallback(() => {
    const b = bridge.current;
    if (!b) return;
    if (panelRef.current !== "none") {
      close();
      return;
    }
    clear();
    if (b.state.phase === "playing") {
      phaseBefore.current = "playing";
      b.state.phase = "paused";
    } else if (b.state.phase === "paused") b.state.phase = phaseBefore.current === "dead" ? "dead" : "playing";
    refresh();
    host.current?.focus();
  }, [clear, close, refresh]);
  useEffect(() => {
    let disposed = false;
    let game: {
      destroy: (remove: boolean) => void;
      scale: { setGameSize: (w: number, h: number) => unknown };
    } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let written = "";
    let save = readDeliverySave(null);
    try {
      save = readDeliverySave(localStorage.getItem(SAVE_KEY));
      setHistory(legacyRecord(localStorage.getItem(LEGACY_KEY)));
    } catch {
      setNotice("浏览器存储不可用，当前仍可游玩。");
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) save.settings.reducedMotion = true;
    setTouchMode(
      navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches,
    );
    const audio = new DeliveryAudio();
    audio.enabled = save.settings.sound;
    const b: DeliveryBridge = {
      state: createDelivery(save),
      input: deliveryInput(),
      scene: null,
      audio,
      loaded: false,
      manual: false,
      error: "",
      changed: () => {
        if (disposed) return;
        const raw = JSON.stringify(b.state.save);
        if (written !== raw) {
          written = raw;
          try {
            localStorage.setItem(SAVE_KEY, raw);
          } catch {
            setNotice("浏览器存储不可用，当前仍可游玩。");
          }
        }
        refresh();
      },
    };
    bridge.current = b;
    refresh();
    const win = window as DeliveryWindow;
    win.render_game_to_text = () => JSON.stringify(deliveryPublicState(b.state));
    win.advanceTime = (ms) => b.scene?.tick(ms);
    if (new URLSearchParams(window.location.search).get("test") === "1") win.deliveryTest = {
        audio: () => b.audio.diagnostics(),
        market: () => {
          const { scene } = b;
          if (!scene) return null;
          const cart = scene.marketCartArt;
          return {
            cart: { visible: cart.visible, x: cart.x, y: cart.y, scaleX: cart.scaleX, scaleY: cart.scaleY, texture: cart.texture.key },
            facades: scene.facades.map(image => image.texture.key),
          };
        },
        serving: () => {
          const { scene } = b;
          if (!scene) return null;
          const { ladle, lights } = scene.servingArt;
          return {
            ladle: { visible: ladle.visible, x: ladle.x, y: ladle.y, texture: ladle.texture.key },
            lights: lights.map(light => ({ visible: light.visible, x: light.x, y: light.y, color: light.fillColor })),
            facades: scene.facades.map(image => ({ key: image.texture.key, x: image.x, y: image.y, scale: image.scaleX })),
          };
        },
        oven: () => {
          const { scene } = b;
          if (!scene) return null;
          const { shell, claw } = scene.ovenArt;
          return {
            shell: { visible: shell.visible, x: shell.x, y: shell.y },
            claw: { visible: claw.visible, flipX: claw.flipX },
            facades: scene.facades.map(facade => facade.texture.key),
          };
        },
        sprite: () => {
          const sprite = b.scene?.player;
          return sprite ? { texture: sprite.texture.key, frame: sprite.frame.name, x: sprite.x, y: sprite.y, flipX: sprite.flipX, originY: sprite.originY, angle: sprite.angle, size: sprite.displayHeight } : null;
        },
        manual: (v) => {
          b.manual = v;
        },
        input: (v) => {
          b.input = { ...deliveryInput(), ...v };
        },
        replay: (tape) => {
          for (const input of tape) stepDelivery(b.state, input);
          b.scene?.consume();
          b.scene?.paint();
          b.changed();
        },
      };
    Promise.all([import("phaser"), import("./DeliveryScene")])
      .then(([{ default: Phaser }, { default: Scene }]) => {
        if (disposed || !host.current) return;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          width: VIEW.w,
          height: VIEW.h,
          parent: host.current,
          backgroundColor: "#f7e6c9",
          scene: new Scene(b),
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          render: { antialias: true },
          input: { keyboard: false },
          audio: { noAudio: true },
          banner: false,
        });
        const resize = () => {
          const rect = host.current?.getBoundingClientRect();
          if (!rect || rect.width < 1 || rect.height < 1) return;
          const ratio = rect.width / rect.height;
          const w = Math.round(Math.max(540, Math.min(1280, 540 * ratio)));
          const h = Math.round(Math.max(540, Math.min(980, w / ratio)));
          if (b.state.viewport.w !== w || b.state.viewport.h !== h) {
            resizeDeliveryViewport(b.state, w, h);
            game?.scale.setGameSize(w, h);
          }
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host.current);
        resize();
        const c = host.current.querySelector("canvas");
        c?.setAttribute("aria-label", "春日第一单游戏画面");
      })
      .catch(() => {
        if (!disposed) setError("游戏加载失败，请刷新重试。");
      });
    return () => {
      disposed = true;
      clear();
      resizeObserver?.disconnect();
      game?.destroy(true);
      audio.destroy();
      bridge.current = null;
      delete win.render_game_to_text;
      delete win.advanceTime;
      delete win.deliveryTest;
    };
  }, [clear, refresh]);
  useEffect(() => {
    const used = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "KeyA",
      "KeyD",
      "KeyW",
      "KeyJ",
      "KeyX",
      "KeyK",
      "KeyE",
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
        ["BUTTON", "A", "INPUT", "SELECT"].includes(e.target.tagName)
      ) return;
      if (e.code === "KeyF" && !e.repeat) {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else root.current?.requestFullscreen().catch(() => {});
        return;
      }
      if (
        e.code === "Enter" &&
        !e.repeat &&
        bridge.current?.state.phase === "title"
      ) {
        begin();
        return;
      }
      if (
        e.code === "KeyR" &&
        !e.repeat &&
        bridge.current?.state.phase === "playing"
      ) {
        clear();
        retryDelivery(bridge.current.state);
        refresh();
        return;
      }
      if (!used.includes(e.code)) return;
      e.preventDefault();
      if (
        bridge.current?.state.phase !== "playing" ||
        panelRef.current !== "none"
      ) return;
      keys.current.add(e.code);
      sync();
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      sync();
    };
    const blur = () => {
      clear();
      const b = bridge.current;
      if (b?.state.phase === "playing") {
        b.state.phase = "paused";
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
  }, [begin, clear, pause, refresh, sync]);
  useEffect(() => {
    if (
      panel === "none" &&
      view?.phase !== "paused" &&
      view?.phase !== "delivered"
    ) return undefined;
    const dialog = root.current?.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const nodes = Array.from(
        dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"),
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
    return () => window.removeEventListener("keydown", trap);
  }, [panel, view?.phase]);
  const pointer = (
    e: ReactPointerEvent<HTMLButtonElement>,
    action: keyof DeliveryInput,
    on: boolean,
  ) => {
    if (on) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, action);
      bridge.current?.audio.unlock();
    } else pointers.current.delete(e.pointerId);
    sync();
  };
  const setting = (key: "sound" | "assist" | "reducedMotion") => {
    const b = bridge.current;
    if (!b) return;
    b.state.save.settings[key] = !b.state.save.settings[key];
    b.audio.enabled = b.state.save.settings.sound;
    if (key === "sound" && b.audio.enabled) b.audio.unlock();
    b.changed();
  };
  const explore = () => {
    const b = bridge.current;
    if (!b) return;
    clear();
    b.state.phase = "playing";
    b.changed();
    host.current?.focus();
  };
  const level = deliveryLevel(view || { levelId: "attic-soup" });
  const delivered = view?.save.delivered.includes(level.id);
  const complete = view?.save.delivered.includes("banquet-machine");
  const returnToMeal = () => {
    const b = bridge.current;
    if (!b) return;
    clear();
    visitBanquet(b.state);
    panelRef.current = "none";
    setPanel("none");
    b.changed();
    host.current?.focus();
  };
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
  return (
    <main className={styles.shell} ref={root}>
      <header className={styles.toolbar}>
        <Link href="/demos" className={styles.back}>
          ‹ 游戏库
        </Link>
        <strong>
          春日第一单 <small>岁己的小馆日记</small>
        </strong>
        <nav aria-label="游戏菜单">
          <button onClick={() => open("home")}>小馆</button>
          <button onClick={() => open("orders")}>订单</button>
          <button onClick={() => open("kit")}>整备</button>
          <button onClick={() => open("help")}>操作</button>
          <button onClick={pause} aria-label="暂停或继续">
            Ⅱ
          </button>
        </nav>
      </header>
      <section className={styles.stage} aria-label={level.district}>
        <div
          className={styles.canvas}
          ref={host}
          role="application"
          tabIndex={-1}
          aria-label="游戏操作区域"
        />
        {view?.phase === "title" && panel === "none" && (
          <div className={styles.title}>
            <p className={styles.eyebrow}>第一天 · 早餐时分</p>
            <h1>
              春日
              <br />
              <span>第一单</span>
              <i>SPRING, SERVED WARM</i>
            </h1>
            <p className={styles.intro}>
              阁楼有人等一碗热汤。
              <br />
              挑起面团，踩着晨光出发。
            </p>
            <button
              className={styles.primary}
              disabled={!ready || !!error}
              onClick={() => (complete && !view.save.resume ? returnToMeal() : begin())}
            >
              {!ready
                ? "正在准备早餐…"
                : view.save.resume
                  ? "继续这趟配送"
                  : complete ? "回到春日餐会"
                  : view.save.delivered.length
                    ? `接下一单 · ${nextOrder(view.save).title}`
                    : "接下第一单"}
              <span> →</span>
            </button>
            {delivered && (
              <button className={styles.hotStart} onClick={() => begin("hot")}>
                趁热送达 · 挑战熟悉的路
              </button>
            )}
            <p className={styles.titleHint}>
              方向键移动 · 空格跳跃 · J 挑击 · E 交谈
            </p>
          </div>
        )}
        {view && ["playing", "dead", "paused"].includes(view.phase) && (
          <div className={styles.hud} aria-label="配送状态">
            <span
              className={styles.hearts}
              aria-label={`生命 ${view.player.health} / 3`}
            >
              {"♥".repeat(view.player.health)}
              <em>{"♡".repeat(3 - view.player.health)}</em>
            </span>
            <div>
              <strong>
                {view.theater.seated ? "这一碗，给忙了一天的岁己" : view.carrying
                  ? `${level.meal} → ${level.customer}`
                  : delivered
                    ? `${level.customer}已经用上餐点`
                    : `在出餐台取${level.meal}`}
              </strong>
              <small>
                {level.checkpoints.find((c) => c.id === view.checkpoint)?.name}{" "}
                · {view.save.tray === "wide" ? "宽托盘" : "轻托盘"}
                {view.save.delivered.includes("oven-crab") ? " · 隔热包边" : ""}
                {view.save.delivered.includes("serving-machine") ? ` · 蒸汽${view.player.dashReady ? "●" : "○"}` : ""}
                {view.save.settings.assist ? " · 轻松模式" : ""}
                {view.mode === "practice" ? " · 单段练习" : ""}
              </small>
            </div>
            {view.mode === "hot" && (
              <time>
                {clock(view.time)}
                <small>
                  {view.time > level.hotLimit
                    ? "仍可完成"
                    : `目标 ${clock(level.hotLimit)}`}
                </small>
              </time>
            )}
          </div>
        )}
        {view?.phase === "playing" && view.toastTimer > 0 && (
          <p className={styles.toast} role="status">
            {view.toast}
          </p>
        )}
        {view?.phase === "playing" && view.prompt && (
          <div className={styles.prompt}>{view.prompt}</div>
        )}
        {view?.phase === "dead" && (
          <div className={styles.retry}>餐箱抱好了。马上再来。</div>
        )}
        {(error || notice) && (
          <p className={styles.notice} role="alert">
            {error || notice}
          </p>
        )}
        {view?.phase === "paused" && panel === "none" && (
          <div className={styles.veil}>
            <section
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="pause-title"
            >
              <p className={styles.eyebrow}>歇一小会</p>
              <h2 id="pause-title">餐点会等你。</h2>
              <p>已记住最近歇脚点和餐箱。现在可以安心休息。</p>
              <button className={styles.primary} onClick={pause}>
                继续配送
              </button>
              <button onClick={() => open("kit")}>整备与设置</button>
              <button
                onClick={() => {
                  if (bridge.current) {
                    bridge.current.state.phase = "title";
                    clear();
                    refresh();
                  }
                }}
              >
                回到标题
              </button>
            </section>
          </div>
        )}
        {view?.phase === "delivered" && panel === "none" && (
          <div className={styles.deliveryVeil}>
            <section
              className={styles.receipt}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delivery-title"
            >
              <p className={styles.eyebrow}>
                {String(LEVELS.indexOf(level) + 1).padStart(2, "0")} /{" "}
                {level.district} · {level.theater?.banquet ? "春日餐会" : "订单送达"}
              </p>
              <h2 id="delivery-title">{level.title}</h2>
              <blockquote>“{level.quote}”</blockquote>
              <p>{level.aftermath}</p>
              {view.mode === "hot" && (
                <p className={styles.medal}>
                  {clock(view.deliveryTime)} ·{" "}
                  {view.deliveryTime <= level.hotLimit
                    ? "趁热纪念章"
                    : "餐点已经稳稳送达"}
                </p>
              )}
              <button className={styles.primary} onClick={explore}>
                {level.id === "attic-soup"
                  ? "看看放下的木梯"
                  : level.theater?.banquet ? "留在餐桌旁" : "看看街坊的变化"}
              </button>
              <button onClick={() => begin("hot")}>再跑一次 · 趁热送达</button>
              <button onClick={() => open("practice")}>选择片段练习</button>
              <button onClick={() => open("home")}>回小馆看看</button>
              {nextLevel ? (
                <button
                  className={styles.nextOrder}
                  onClick={() => begin("story", undefined, nextLevel.id)}
                >
                  下一单 · {nextLevel.title} →
                </button>
              ) : (
                <p className={styles.nextOrder}>小馆的第一天，圆满收桌。<br /><small>可以留在长桌旁，也可以重访今天送过的每一单。</small></p>
              )}
            </section>
          </div>
        )}
        {panel !== "none" && (
          <div className={styles.veil}>
            <section
              className={`${styles.dialog} ${panel === "home" ? styles.homeDialog : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="panel-title"
            >
              <button
                className={styles.close}
                onClick={close}
                aria-label="关闭面板"
              >
                ×
              </button>
              <p className={styles.eyebrow}>春芽小馆</p>
              <h2 id="panel-title">
                {panel === "home"
                  ? "小馆里，慢慢热闹起来"
                  : panel === "help"
                  ? "托盘也能打开一条路"
                  : panel === "kit"
                    ? "出发前，整理一下"
                    : panel === "orders"
                      ? "今天的小馆订单"
                      : "从一个片段练起"}
              </h2>
              {panel === "home" && view && (
                <HomePanel
                  save={view.save}
                  onDecorate={id => {
                    const b = bridge.current;
                    if (!b) return "unknown";
                    const result = decorateHome(b.state.save, id);
                    b.scene?.paint();
                    b.changed();
                    return result;
                  }}
                />
              )}
              {panel === "help" && (
                <>
                  <dl className={styles.controls}>
                    <dt>← → / A D</dt>
                    <dd>移动，Shift 加速</dd>
                    <dt>空格 / W / ↑</dt>
                    <dd>轻点短跳，按住高跳；踩下时按住可跳更高</dd>
                    <dt>J / X</dt>
                    <dd>托盘上挑。面团变蓬松后，可踩它登高；再挑一次清路</dd>
                    <dt>E</dt>
                    <dd>取餐、交谈、送达</dd>
                    <dt>K</dt>
                    <dd>午间集市完成后，空中向面朝方向冲一次；落地恢复</dd>
                    <dt>R / Esc / F</dt>
                    <dd>重试片段 / 暂停 / 全屏</dd>
                  </dl>
                  <p>
                    普通订单没有倒计时。误清掉面团，等它重新鼓起就能再借力。
                  </p>
                  <p>找回屋顶旧招牌，可解锁宽托盘。面包可以留给修理师。</p>
                  <p>
                    卷边烤盘可以挑起并搭乘。关好大烤炉后获得隔热包边，在挑击命中时反弹金圈热弹。
                  </p>
                </>
              )}
              {panel === "kit" && view && (
                <>
                  <div className={styles.trays}>
                    <button
                      aria-pressed={view.save.tray === "quick"}
                      onClick={() => {
                        if (bridge.current) {
                          bridge.current.state.save.tray = "quick";
                          bridge.current.changed();
                        }
                      }}
                    >
                      轻托盘<small>收招快 · 近身挑击</small>
                    </button>
                    <button
                      disabled={!view.save.found.includes("old-sign")}
                      aria-pressed={view.save.tray === "wide"}
                      onClick={() => {
                        if (bridge.current) {
                          bridge.current.state.save.tray = "wide";
                          bridge.current.changed();
                        }
                      }}
                    >
                      宽托盘
                      <small>
                        {view.save.found.includes("old-sign")
                          ? "挑得更远 · 收招稍慢"
                          : "找回屋顶旧招牌后解锁"}
                      </small>
                    </button>
                  </div>
                  {view.save.delivered.includes("oven-crab") && <p className={styles.record}>隔热包边已装上 · 挑击能把金圈热弹送回铃铛开关。</p>}
                  {view.save.delivered.includes("serving-machine") && <p className={styles.record}>蒸汽扣已装上 · 空中 K 短冲一次，落稳后恢复。触屏按「冲」。</p>}
                  <div className={styles.settings}>
                    <button
                      aria-pressed={view.save.settings.sound}
                      onClick={() => setting("sound")}
                    >
                      音乐与音效{" "}
                      <span>{view.save.settings.sound ? "开" : "关"}</span>
                    </button>
                    <button
                      aria-pressed={view.save.settings.assist}
                      onClick={() => setting("assist")}
                    >
                      轻松模式{" "}
                      <span>{view.save.settings.assist ? "开" : "关"}</span>
                    </button>
                    <small>延长跳跃容错和受伤保护，不改变落点。</small>
                    <button
                      aria-pressed={view.save.settings.reducedMotion}
                      onClick={() => setting("reducedMotion")}
                    >
                      减少动态效果{" "}
                      <span>
                        {view.save.settings.reducedMotion ? "开" : "关"}
                      </span>
                    </button>
                  </div>
                  <p className={styles.record}>
                    小馆零钱 {view.save.money} ·{" "}
                    {view.save.kindness ? "小猫吃上面包了" : "修理师还没吃早餐"}
                  </p>
                  <button onClick={() => open("home")}>看看小馆与街坊</button>
                  {delivered && (
                    <button onClick={() => open("practice")}>
                      选择片段练习
                    </button>
                  )}
                  <button onClick={() => open("orders")}>查看小馆订单</button>
                  <Link
                    href="/game/sui-spring/archive"
                    className={styles.archive}
                  >
                    旧四关原型与旧纪录
                    {history
                      ? ` · ${history.levels} 关 / ${history.stars} 星光`
                      : ""}{" "}
                    ↗
                  </Link>
                </>
              )}
              {panel === "practice" && (
                <div className={styles.practice}>
                  {level.checkpoints.map((cp) => (
                    <button
                      key={cp.id}
                      disabled={!delivered}
                      onClick={() => begin("practice", cp.id)}
                    >
                      {cp.name}
                      <span> →</span>
                    </button>
                  ))}
                  {!delivered && <p>送达本单后开放单段练习。</p>}
                </div>
              )}
              {panel === "orders" && view && (
                <div className={styles.practice}>
                  {LEVELS.map((order, index) => (
                    <button
                      key={order.id}
                      disabled={!levelUnlocked(view.save, order.id)}
                      onClick={() => begin("story", undefined, order.id)}
                    >
                      <span>
                        {String(index + 1).padStart(2, "0")} · {order.title}
                        <small className={styles.orderDistrict}>
                          {order.district}
                        </small>
                      </span>
                      <span>
                        {view.save.delivered.includes(order.id)
                          ? "已送达 ↗"
                          : levelUnlocked(view.save, order.id)
                            ? "接单 →"
                            : "待前单送达"}
                      </span>
                    </button>
                  ))}
                  <p>
                    普通订单不倒计时。选择订单会从该单起点出发；标题页可继续最近歇脚点。
                  </p>
                  <p>十二单走过春芽街、午间集市、阵雨屋顶与暮色剧场，最后一起在长桌边开饭。</p>
                  {complete && <button onClick={returnToMeal}>回到春日餐会</button>}
                </div>
              )}
              <button className={styles.primary} onClick={close}>
                回到街上
              </button>
            </section>
          </div>
        )}
      </section>
      {touchMode && (
        <div className={styles.touch} aria-label="触屏操作">
          {(
            [
              ["left", "向左", "←"],
              ["right", "向右", "→"],
              ["run", "加速", "跑"],
              ["interact", "交谈或取餐", "E"],
              ...(view?.save.delivered.includes("serving-machine") ? [["dash", "蒸汽冲刺", "冲"] as const] : []),
              ["attack", "挑击", "挑"],
              ["jump", "跳跃", "跳"],
            ] as const
          ).map(([action, label, text]) => (
            <button
              key={action}
              aria-label={label}
              disabled={view?.phase !== "playing" || panel !== "none"}
              onPointerDown={(e) => pointer(e, action, true)}
              onPointerUp={(e) => pointer(e, action, false)}
              onPointerCancel={(e) => pointer(e, action, false)}
              onLostPointerCapture={(e) => pointer(e, action, false)}
            >
              {text}
            </button>
          ))}
        </div>
      )}
      <footer className={styles.footer}>
        <span>
          {level.district} · {level.title}
        </span>
        <span>
          {touchMode
            ? "点按 E 取餐与送达"
            : `← → 移动 · 空格 跳跃 · J 挑击 · E 交谈 · Shift 加速${view?.save.delivered.includes("serving-machine") ? " · K 冲刺" : ""}`}
        </span>
      </footer>
    </main>
  );
}
