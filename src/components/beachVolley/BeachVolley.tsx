"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftOutlined,
  ExpandOutlined,
  PauseOutlined,
  QuestionCircleOutlined,
  SoundOutlined,
  AudioMutedOutlined,
} from "@ant-design/icons";
import {
  CHARACTERS,
  HEIGHT,
  STEP,
  WIDTH,
  createGame,
  describeGame,
  emptyInput,
  skipTransition,
  startGame,
  stepGame,
} from "./engine";
import type {
  Action,
  Character,
  Difficulty,
  Game,
  Mode,
  Options,
  Side,
} from "./engine";
import { loadAssets, renderGame } from "./renderer";
import type { Assets } from "./renderer";
import BeachAudio from "./audio";
import { createControls } from "./controls";
import styles from "./beachVolley.module.css";

type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
  beachVolley?: {
    game: () => Game;
    input: (side: Side, action: Action, down: boolean) => void;
    manual: (value: boolean) => void;
  };
};
const KEY_MAP: Record<string, [Side, Action]> = {
  KeyA: [0, "left"],
  KeyD: [0, "right"],
  KeyW: [0, "jump"],
  Space: [0, "jump"],
  KeyJ: [0, "hit"],
  KeyK: [0, "dive"],
  KeyL: [0, "special"],
  ArrowLeft: [1, "left"],
  ArrowRight: [1, "right"],
  ArrowUp: [1, "jump"],
  Numpad1: [1, "hit"],
  Numpad2: [1, "dive"],
  Numpad3: [1, "special"],
  Slash: [1, "hit"],
  Period: [1, "dive"],
  Comma: [1, "special"],
};
const INITIAL: Options = {
  mode: "solo",
  character: "sui",
  difficulty: "normal",
  target: 7,
};
export default function BeachVolley() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(createGame());
  const assetsRef = useRef<Assets | null>(null);
  const controlsRef = useRef(createControls());
  const audioRef = useRef<BeachAudio | null>(null);
  const [options, setOptions] = useState<Options>(INITIAL);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState(() => describeGame(gameRef.current));
  const [help, setHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(0);
  const helpRef = useRef(false);
  const [cinematic, setCinematic] = useState(false);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sync = useCallback(() => setView(describeGame(gameRef.current)), []);
  const resetInput = useCallback(() => {
    controlsRef.current.clear();
    gameRef.current.players.forEach((player) => {
      player.lastInput = emptyInput();
    });
  }, []);
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      /* Browser may not expose fullscreen on this device. */
    }
  };
  const cinemaRef = useRef(false);
  const pause = useCallback(() => {
    if (helpRef.current || cinemaRef.current) return;
    const g = gameRef.current;
    if (g.phase === "menu" || g.phase === "result") return;
    g.paused = !g.paused;
    resetInput();
    sync();
  }, [resetInput, sync]);
  const choose = (next: Partial<Options>) => {
    const merged = { ...options, ...next };
    setOptions(merged);
    gameRef.current = createGame(merged);
    sync();
  };
  const begin = (showIntro = true) => {
    audioRef.current?.unlock();
    resetInput();
    gameRef.current = createGame(options, Date.now() % 4294967296);
    startGame(gameRef.current);
    if (
      showIntro &&
      videoAvailable &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      gameRef.current.paused = true;
      cinemaRef.current = true;
      setCinematic(true);
    }
    sync();
  };
  const finishCinema = useCallback(() => {
    resetInput();
    cinemaRef.current = false;
    setCinematic(false);
    gameRef.current.paused = document.hidden || helpRef.current;
    sync();
  }, [resetInput, sync]);
  const menu = () => {
    resetInput();
    cinemaRef.current = false;
    setCinematic(false);
    gameRef.current = createGame(options);
    sync();
  };
  const openHelp = () => {
    helpRef.current = true;
    setHelp(true);
    if (gameRef.current.phase !== "menu") gameRef.current.paused = true;
    resetInput();
    sync();
  };
  const closeHelp = () => {
    helpRef.current = false;
    setHelp(false);
    sync();
  };
  const press = (source: string, side: Side, action: Action) => {
    const g = gameRef.current;
    if (helpRef.current || cinemaRef.current || g.paused || g.phase === "menu" || g.phase === "result") return;
    controlsRef.current.press(source, side, action);
    audioRef.current?.unlock();
  };

  useEffect(() => {
    let alive = true;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastUi = 0;
    let manual = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const audio = new BeachAudio();
    audioRef.current = audio;
    const target = window as GameWindow;
    const draw = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && assetsRef.current) renderGame(ctx, assetsRef.current, gameRef.current, reduced.matches);
    };
    const advance = (ms: number) => {
      const steps = Math.max(
        0,
        Math.round(Math.min(120000, ms) / (STEP * 1000)),
      );
      for (let i = 0; i < steps; i++) stepGame(gameRef.current, controlsRef.current.inputs, STEP);
      draw();
      sync();
    };
    target.render_game_to_text = () => JSON.stringify({
        ...describeGame(gameRef.current),
        assetsReady: !!assetsRef.current,
        inputs: controlsRef.current.inputs,
      });
    target.advanceTime = advance;
    if (process.env.NODE_ENV !== "production") {
      target.beachVolley = {
        game: () => gameRef.current,
        input: (s, a, down) => {
          if (down) controlsRef.current.press(`debug:${s}:${a}`, s, a);
          else controlsRef.current.release(`debug:${s}:${a}`);
        },
        manual: (value) => {
          manual = value;
        },
      };
    }
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
    fetch("/games/beach-volley/media.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.intro) setVideoAvailable(true);
      })
      .catch(() => {});
    try {
      const saved = Number(localStorage.getItem("beach-volley-best") || 0);
      if (Number.isFinite(saved)) setBest(saved);
    } catch {
      /* Storage is optional. */
    }
    const loop = (now: number) => {
      const elapsed = Math.min((now - last) / 1000, 0.06);
      last = now;
      if (!manual && assetsRef.current) {
        accumulator += elapsed;
        while (accumulator >= STEP) {
          stepGame(gameRef.current, controlsRef.current.inputs, STEP);
          accumulator -= STEP;
        }
      }
      audio.event(gameRef.current.event);
      draw();
      if (now - lastUi > 85) {
        sync();
        lastUi = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        (event.target instanceof HTMLElement && event.target.isContentEditable) ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLInputElement
      ) return;
      const g = gameRef.current;
      if (event.code === "Escape" || event.code === "KeyP") {
        if (!event.repeat && !helpRef.current) pause();
        return;
      }
      if (event.code === "KeyF") {
        if (!event.repeat) fullscreen();
        return;
      }
      // Keep native Enter/Space activation on menus, toolbars and dialogs.
      if ((event.code === "Enter" || event.code === "Space") &&
        event.target instanceof Element && event.target.closest("button, a")) return;
      if (helpRef.current || cinemaRef.current || g.paused || g.phase === "menu" || g.phase === "result") return;
      if (event.code === "Enter") {
        if (!event.repeat) skipTransition(g);
        event.preventDefault();
        return;
      }
      const mapping = KEY_MAP[event.code];
      if (mapping) {
        event.preventDefault();
        const side = g.options.mode === "local" ? mapping[0] : 0;
        if (!event.repeat) controlsRef.current.press(`key:${event.code}`, side, mapping[1]);
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      controlsRef.current.release(`key:${event.code}`);
    };
    const blur = () => {
      resetInput();
      const g = gameRef.current;
      if (g.phase !== "menu" && g.phase !== "result") {
        g.paused = true;
        sync();
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
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
      delete target.beachVolley;
    };
  }, [pause, resetInput, sync]);
  useEffect(() => {
    audioRef.current?.setEnabled(!muted);
  }, [muted]);
  useEffect(() => {
    if (view.bestRally > best) {
      setBest(view.bestRally);
      try {
        localStorage.setItem("beach-volley-best", String(view.bestRally));
      } catch {
        /* Storage is optional. */
      }
    }
  }, [view.bestRally, best]);
  useEffect(() => {
    if (cinematic) videoRef.current?.play().catch(finishCinema);
  }, [cinematic, finishCinema]);

  const isMenu = view.phase === "menu";
  const isResult = view.phase === "result";
  const active = !isMenu && !isResult;
  const character = CHARACTERS[options.character];
  const winner =
    view.winner === null
      ? null
      : CHARACTERS[view.players[view.winner].character];
  const controlButton = (action: Action, text: string, side: Side = 0) => (
    <button
      key={action}
      type="button"
      className={action === "special" ? styles.specialTouch : ""}
      aria-label={`${side === 0 ? "玩家一" : "玩家二"}${text}`}
      data-control={`${side}-${action}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        if (
          event.currentTarget.hasPointerCapture(event.pointerId) ||
          event.nativeEvent.isTrusted
        ) event.currentTarget.setPointerCapture(event.pointerId);
        press(`pointer:${event.pointerId}`, side, action);
      }}
      onPointerUp={(event) => controlsRef.current.release(`pointer:${event.pointerId}`)}
      onPointerCancel={(event) => controlsRef.current.release(`pointer:${event.pointerId}`)}
      onLostPointerCapture={(event) => controlsRef.current.release(`pointer:${event.pointerId}`)}
      onKeyDown={(event) => {
        if (event.code !== "Enter" && event.code !== "Space") return;
        event.preventDefault();
        if (!event.repeat) press(`button:${side}:${action}:${event.code}`, side, action);
      }}
      onKeyUp={(event) => {
        if (event.code !== "Enter" && event.code !== "Space") return;
        event.preventDefault();
        controlsRef.current.release(`button:${side}:${action}:${event.code}`);
      }}
      onBlur={() => {
        controlsRef.current.release(`button:${side}:${action}:Enter`);
        controlsRef.current.release(`button:${side}:${action}:Space`);
      }}
    >
      {text}
    </button>
  );
  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${isResult ? styles.resultRoot : ""}`}
    >
      <header className={styles.header}>
        <Link href="/demos" className={styles.back}>
          <ArrowLeftOutlined /> 游戏大厅
        </Link>
        <span className={styles.brand}>
          晴海双打 <i>BEACH VOLLEY</i>
        </span>
        <div className={styles.tools}>
          <button
            type="button"
            title="玩法说明"
            aria-label="玩法说明"
            onClick={openHelp}
          >
            <QuestionCircleOutlined />
          </button>
          <button
            type="button"
            title={muted ? "开启声音" : "关闭声音"}
            aria-label={muted ? "开启声音" : "关闭声音"}
            onClick={() => {
              audioRef.current?.unlock();
              setMuted(!muted);
            }}
          >
            {muted ? <AudioMutedOutlined /> : <SoundOutlined />}
          </button>
          <button
            type="button"
            title="全屏 F"
            aria-label="全屏"
            onClick={() => fullscreen()}
          >
            <ExpandOutlined />
          </button>
          {active && (
            <button
              type="button"
              aria-label={view.paused ? "继续比赛" : "暂停比赛"}
              onClick={pause}
            >
              {view.paused ? "▶" : <PauseOutlined />}
            </button>
          )}
        </div>
      </header>
      <main className={`${styles.stage} ${isMenu ? styles.menuStage : ""}`}>
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          aria-label="岁己和栞栞的沙滩排球场"
        >
          请使用支持 Canvas 的浏览器。
        </canvas>
        {!ready && (
          <div className={styles.loading}>
            <span className={styles.loader} />
            {error || "正在前往晴海沙滩…"}
            {error && (
              <button type="button" onClick={() => window.location.reload()}>
                重新加载
              </button>
            )}
          </div>
        )}
        {ready && isMenu && (
          <section className={styles.menu} aria-label="比赛设置">
            <div className={styles.eyebrow}>SUI × SHIORI · SUMMER RALLY</div>
            <h1>
              晴海<span>双打</span>
              <b>BEACH VOLLEY</b>
            </h1>
            <p className={styles.tagline}>海风正好。下一球，轮到你。</p>
            <div className={styles.selection}>
              <span className={styles.label}>01 / 选择你的搭档</span>
              <div className={styles.characters}>
                {(["sui", "shiori"] as Character[]).map((id) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={options.character === id}
                    onClick={() => choose({ character: id })}
                  >
                    <span>{CHARACTERS[id].name}</span>
                    <small>{CHARACTERS[id].latin}</small>
                  </button>
                ))}
              </div>
              <span className={styles.label}>02 / 今天怎么玩</span>
              <div className={styles.modes}>
                {(
                  [
                    ["solo", "单人挑战"],
                    ["local", "同机双人"],
                    ["practice", "自由练习"],
                  ] as [Mode, string][]
                ).map(([mode, text]) => (
                  <button
                    type="button"
                    key={mode}
                    aria-pressed={options.mode === mode}
                    onClick={() => choose({ mode })}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <div className={styles.settings}>
                {options.mode !== "local" && (
                  <label htmlFor="beach-difficulty">
                    对手{" "}
                    <select
                      id="beach-difficulty"
                      aria-label="对手难度"
                      value={options.difficulty}
                      onChange={(event) => choose({ difficulty: event.target.value as Difficulty })}
                    >
                      <option value="easy">海风 · 轻松</option>
                      <option value="normal">晴浪 · 标准</option>
                      <option value="hard">烈阳 · 挑战</option>
                    </select>
                  </label>
                )}
                {options.mode !== "practice" && (
                  <label htmlFor="beach-target">
                    赛制{" "}
                    <select
                      id="beach-target"
                      aria-label="比赛分数"
                      value={options.target}
                      onChange={(event) => choose({ target: Number(event.target.value) })}
                    >
                      <option value={7}>7 分短局</option>
                      <option value={11}>11 分比赛</option>
                    </select>
                  </label>
                )}
              </div>
              <button
                id="beach-start"
                type="button"
                className={styles.start}
                onClick={() => begin()}
              >
                出发，去打球 <span>↗</span>
              </button>
            </div>
            <div className={styles.menuFoot}>
              <button type="button" onClick={openHelp}>
                第一次来？查看玩法 ↗
              </button>
              <span>最佳回合 {best.toString().padStart(2, "0")}</span>
            </div>
          </section>
        )}
        {ready && isMenu && (
          <div className={styles.heroCaption}>
            <span>{character.name}</span>
            <small>{character.special} / SPECIAL MOVE</small>
          </div>
        )}
        {active && !cinematic && (
          <>
            <div
              className={styles.scoreboard}
              aria-label={`比分 ${view.score[0]} 比 ${view.score[1]}`}
            >
              <div className={styles.team}>
                <span>
                  {CHARACTERS[view.players[0].character].name} <small>1P</small>
                </span>
                <div className={styles.energy}>
                  <i style={{ width: `${view.players[0].energy}%` }} />
                </div>
                <small>
                  {view.players[0].energy >= 100
                    ? "L · 必杀就绪"
                    : `晴空能量 ${view.players[0].energy}%`}
                </small>
              </div>
              <div className={styles.score}>
                <b>{view.score[0]}</b>
                <span>
                  {options.mode === "practice"
                    ? "自由练习"
                    : `${options.target} 分制`}
                  <i>:</i>
                </span>
                <b>{view.score[1]}</b>
              </div>
              <div className={`${styles.team} ${styles.teamRight}`}>
                <span>
                  {CHARACTERS[view.players[1].character].name}{" "}
                  <small>{options.mode === "local" ? "2P" : "CPU"}</small>
                </span>
                <div className={styles.energy}>
                  <i style={{ width: `${view.players[1].energy}%` }} />
                </div>
                <small>
                  {view.players[1].energy >= 100
                    ? "必杀就绪"
                    : `潮汐能量 ${view.players[1].energy}%`}
                </small>
              </div>
            </div>
            <div className={styles.rally}>
              {view.rally >= 3 ? `${view.rally} RALLY` : "SUI × SHIORI"}
            </div>
            {(view.phase === "intro" ||
              view.phase === "point" ||
              view.freeze > 0) && (
              <button
                type="button"
                className={styles.skip}
                onClick={() => {
                  skipTransition(gameRef.current);
                  sync();
                }}
              >
                跳过演出 ↗
              </button>
            )}
          </>
        )}
        {cinematic && (
          <div className={styles.cinema}>
            <video
              ref={videoRef}
              src="/games/beach-volley/intro.mp4"
              poster="/games/beach-volley/intro.webp"
              playsInline
              muted={muted}
              onEnded={finishCinema}
              onError={finishCinema}
            >
              <track kind="captions" />
            </video>
            <div>
              <span>晴海双打</span>
              <p>「这一局，输了请喝汽水！」</p>
            </div>
            <button
              type="button"
              className={styles.skip}
              onClick={finishCinema}
            >
              跳过开场 ↗
            </button>
          </div>
        )}
        {active && view.paused && !help && !cinematic && (
          <div className={styles.overlay}>
            <section className={styles.dialog}>
              <span className={styles.label}>TAKE A BREATH</span>
              <h2>海风暂停一下</h2>
              <p>准备好了，就接着打。</p>
              <button type="button" className={styles.start} onClick={pause}>
                继续比赛 <span>▶</span>
              </button>
              <div className={styles.dialogLinks}>
                <button type="button" onClick={() => begin(false)}>
                  重新开局
                </button>
                <button type="button" onClick={menu}>
                  返回沙滩
                </button>
              </div>
            </section>
          </div>
        )}
        {isResult && (
          <div className={styles.result}>
            <div className={styles.resultArt} />
            <section className={styles.resultText}>
              <span className={styles.eyebrow}>
                {view.winner === 0 || options.mode === "local"
                  ? "SUMMER CHAMPION"
                  : "ONE MORE SUMMER"}
              </span>
              <h2>
                {winner?.name}
                <br />
                {view.winner === 0 || options.mode === "local"
                  ? "赢下晴海！"
                  : "赢了这一局"}
              </h2>
              <p>
                {view.winner === 0
                  ? "「好球！汽水我要冰的。」"
                  : "「下次，再一起打到日落吧。」"}
              </p>
              <div className={styles.resultScore}>
                {view.score[0]} <span>:</span> {view.score[1]}
              </div>
              <div className={styles.stats}>
                <span>
                  最长回合 <b>{view.bestRally}</b>
                </span>
                <span>
                  成功接球 <b>{view.hits[0]}</b>
                </span>
                <span>
                  晴海必杀 <b>{view.specials[0]}</b>
                </span>
              </div>
              <button
                type="button"
                className={styles.start}
                onClick={() => begin(false)}
              >
                再来一场 <span>↗</span>
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={menu}
              >
                返回沙滩
              </button>
            </section>
          </div>
        )}
        {help && (
          <div className={styles.overlay}>
            <section
              className={`${styles.dialog} ${styles.help}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="beach-help-title"
            >
              <button
                type="button"
                className={styles.close}
                aria-label="关闭玩法说明"
                onClick={closeHelp}
              >
                ×
              </button>
              <span className={styles.label}>HOW TO PLAY</span>
              <h2 id="beach-help-title">把球，留在空中。</h2>
              <p>
                移动到球下方会自动接球。让球落在对方沙滩，就得一分。先到目标分且领先
                2 分获胜，加赛最多 4 分。
              </p>
              <dl>
                <div>
                  <dt>A / D 或 ← / →</dt>
                  <dd>左右移动</dd>
                </div>
                <div>
                  <dt>W / 空格</dt>
                  <dd>跳跃 · 起跳接高球</dd>
                </div>
                <div>
                  <dt>J</dt>
                  <dd>发球 / 击球 · 空中扣杀</dd>
                </div>
                <div>
                  <dt>K</dt>
                  <dd>朝移动方向扑救</dd>
                </div>
                <div>
                  <dt>L</dt>
                  <dd>满能量必杀 · 1 秒内触球</dd>
                </div>
                <div>
                  <dt>P / Esc · F</dt>
                  <dd>暂停 · 全屏</dd>
                </div>
              </dl>
              <p className={styles.helpTip}>
                向前 + J 打远球，向后 + J
                打轻吊球。不断接球积蓄能量，再用必杀一锤定音。
              </p>
              <p className={styles.helpTip}>
                同机 2P：方向键移动 / ↑ 跳，数字小键盘 1 / 2 / 3 或斜杠 /、句点
                .、逗号 , 击球、扑救、必杀。手机可用触屏按钮，横屏更舒适。
              </p>
              <button
                type="button"
                className={styles.start}
                onClick={closeHelp}
              >
                明白，去接球 <span>↗</span>
              </button>
            </section>
          </div>
        )}
      </main>
      <footer className={styles.footer}>
        <span>
          岁己 × 栞栞 <i>·</i> 晴海沙滩
        </span>
        {active ? (
          <span className={styles.keyboardHint}>
            A D 移动 <i>·</i> 空格 跳跃 <i>·</i> J 扣杀 <i>·</i> K 扑救 <i>·</i>{" "}
            L 必杀
          </span>
        ) : (
          <span>一场球，一整个夏天。</span>
        )}
        <span className={styles.rotateHint}>横屏，视野更开阔 ↻</span>
      </footer>
      {active && !view.paused && !cinematic && (
        <div className={styles.touchControls} aria-label="触屏控制">
          <div>
            {controlButton("left", "←")}
            {controlButton("right", "→")}
          </div>
          <div>
            {controlButton("dive", "扑救")}
            {controlButton("jump", "跳跃")}
            {controlButton("hit", "击球")}
            {controlButton("special", "必杀")}
          </div>
          {options.mode === "local" && (
            <div className={styles.secondTouch}>
              {controlButton("left", "←", 1)}
              {controlButton("right", "→", 1)}
              {controlButton("jump", "跳", 1)}
              {controlButton("dive", "扑救", 1)}
              {controlButton("hit", "击", 1)}
              {controlButton("special", "必杀", 1)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
