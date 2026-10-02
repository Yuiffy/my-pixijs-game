"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  activateRelief,
  cancelPress,
  completion,
  createGame,
  DIFFICULTIES,
  Difficulty,
  grade,
  HEIGHT,
  INSTRUCTIONS,
  PHASE_NAMES,
  PHASES,
  press,
  release,
  selectTool,
  setPaused,
  snapshot,
  Tool,
  TOOL_NAMES,
  WIDTH,
} from "./engine";
import mountScene from "./scene";
import { CHAT, QUOTES, SOURCES } from "./content";
import styles from "./needle.module.css";

type TestWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};
type Scene = Awaited<ReturnType<typeof mountScene>>;
const TOOLS: Tool[] = ["swab", "cream", "probe", "ice"];
const BEST_KEY = "sui-golden-needle-best-v1";

function ToolIcon({ tool }: { tool: Tool | "relief" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {tool === "swab" && (
        <>
          <path
            d="m25 23 14 16"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <ellipse
            cx="18"
            cy="17"
            rx="13"
            ry="10"
            transform="rotate(40 18 17)"
            fill="currentColor"
            opacity=".35"
          />
          <path
            d="m10 13 15 12m-11-15 15 11"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </>
      )}
      {tool === "cream" && (
        <>
          <path
            d="m26 25 11 14"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path d="m7 17 12-11 16 17-12 12Z" fill="currentColor" opacity=".3" />
          <path
            d="m13 16 10 11m-5-16 10 11"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
      {tool === "probe" && (
        <>
          <path
            d="m25 24 14 15"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <rect
            x="5"
            y="4"
            width="25"
            height="25"
            rx="5"
            stroke="currentColor"
            strokeWidth="2"
          />
          {[11, 18, 25].flatMap((x) => [10, 17, 24].map((y) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r="1.5"
                fill="currentColor"
              />
            )),)}
        </>
      )}
      {tool === "ice" && (
        <>
          <rect
            x="7"
            y="6"
            width="34"
            height="36"
            rx="10"
            fill="currentColor"
            opacity=".2"
          />
          <path
            d="M24 13v23M13 24h23m-19-7 15 15m-15 0 15-15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {tool === "relief" && (
        <>
          <path
            d="M24 5c-10 10-13 18-13 26a13 13 0 0 0 26 0c0-8-3-16-13-26Z"
            fill="currentColor"
            opacity=".22"
          />
          <path
            d="M24 5c-10 10-13 18-13 26a13 13 0 0 0 26 0c0-8-3-16-13-26Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M18 31h12" stroke="currentColor" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

function Meter({
  label,
  value,
  warm,
}: {
  label: string;
  value: number;
  warm?: boolean;
}) {
  return (
    <div className={styles.meter}>
      <div>
        <span>{label}</span>
        <b>
          {Math.round(value)}
          <small> / 100</small>
        </b>
      </div>
      <div className={styles.track}>
        <i
          style={{
            width: `${value}%`,
            background: value > 72 ? "#bc674b" : warm ? "#bc9a51" : undefined,
          }}
        />
      </div>
    </div>
  );
}

export default function GoldenNeedle() {
  const state = useRef(createGame("gentle", true));
  const [view, setView] = useState({ ...state.current });
  const [difficulty, setDifficulty] = useState<Difficulty>("gentle");
  const [panel, setPanel] = useState<"help" | "sources" | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [best, setBest] = useState<Record<string, number>>({});
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const scene = useRef<Scene | null>(null);
  const pausedBeforePanel = useRef(false);
  const refresh = useCallback(() => setView({ ...state.current }), []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
      if (saved && typeof saved === "object") setBest(saved);
    } catch {
      /* Private browsing can deny storage. */
    }
    let disposed = false;
    let owned: Scene | null = null;
    const w = window as TestWindow;
    const renderText = () => JSON.stringify(snapshot(state.current));
    const advanceTime = (ms: number) => owned?.advanceTime(ms);
    if (host.current) mountScene(host.current, () => state.current, refresh)
        .then((value) => {
          if (disposed) {
            value.destroy();
            return;
          }
          owned = value;
          scene.current = value;
          w.render_game_to_text = renderText;
          w.advanceTime = advanceTime;
          setReady(true);
        })
        .catch(() => {
          if (!disposed) setLoadError("操作台加载失败，请刷新后重试。");
        });
    return () => {
      disposed = true;
      owned?.destroy();
      scene.current = null;
      if (w.render_game_to_text === renderText) delete w.render_game_to_text;
      if (w.advanceTime === advanceTime) delete w.advanceTime;
    };
  }, [refresh]);

  useEffect(() => {
    if (view.result !== "success") return;
    setBest((previous) => {
      const next = {
        ...previous,
        [view.difficulty]: Math.max(
          Number(previous[view.difficulty]) || 0,
          view.score,
        ),
      };
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(next));
      } catch {
        /* Scores are optional. */
      }
      return next;
    });
  }, [view.result, view.score, view.difficulty]);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (
        panel ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.repeat
      ) return;
      const key = event.key.toLowerCase();
      const s = state.current;
      if (key === "f") fullscreen();
      if (key === "p" || key === "escape") {
        setPaused(s, !s.paused);
        refresh();
      }
      if (s.paused) return;
      if (["1", "2", "3", "4"].includes(key)) {
        selectTool(s, TOOLS[Number(key) - 1]);
        refresh();
      }
      if (key === "q") s.turning = -1;
      if (key === "e") s.turning = 1;
      if (key === " " && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        press(s);
        refresh();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (["q", "e"].includes(event.key.toLowerCase())) state.current.turning = 0;
      if (event.key === " ") {
        release(state.current);
        refresh();
      }
    };
    const hidden = () => {
      if (document.hidden) {
        setPaused(state.current, true);
        refresh();
      }
    };
    const blur = () => {
      cancelPress(state.current);
      refresh();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [panel, refresh, fullscreen]);

  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);

  const showPanel = (next: "help" | "sources") => {
    pausedBeforePanel.current = state.current.paused;
    setPaused(state.current, true);
    setPanel(next);
    refresh();
  };
  const closePanel = () => {
    setPanel(null);
    setPaused(state.current, pausedBeforePanel.current);
    refresh();
  };
  const start = () => {
    state.current = createGame(difficulty);
    scene.current?.resumeClock();
    refresh();
  };
  const choose = (tool: Tool) => {
    selectTool(state.current, tool);
    refresh();
  };
  const pointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = host.current?.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    state.current.pointer = {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer(event);
    // Touch has no hover. Positioning the hand at touchdown makes every tool usable on phones.
    if (event.pointerType !== "mouse") state.current.hand = { ...state.current.pointer };
    press(state.current);
    refresh();
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    pointer(event);
    release(state.current);
    refresh();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const playing = !["welcome", "result"].includes(view.phase);
  const result = grade(view);
  const [low, high] = DIFFICULTIES[view.difficulty].window;
  const pulseTime = view.pulse?.time || 0;
  const recommended =
    view.phase === "numb"
      ? "cream"
      : view.phase === "needle"
        ? "probe"
        : view.phase === "cool"
          ? "ice"
          : "swab";

  return (
    <main className={styles.root} ref={root}>
      <header className={styles.header}>
        <Link href="/demos" className={styles.back} aria-label="返回游戏大厅">
          ←
        </Link>
        <div className={styles.brand}>
          <span className={styles.brandMark}>✳</span>
          <div>
            <b>不许手抖</b>
            <small>GOLDEN NEEDLE CLUB</small>
          </div>
        </div>
        <span className={styles.headerNote}>岁己的微针模拟室</span>
        <nav className={styles.nav} aria-label="游戏菜单">
          <button onClick={() => showPanel("sources")}>灵感档案</button>
          <button onClick={() => showPanel("help")}>怎么玩</button>
          <button onClick={fullscreen} aria-label="全屏">
            ⛶
          </button>
        </nav>
      </header>

      <div className={styles.workspace}>
        <section className={styles.operation} aria-label="手术操作区">
          {playing && (
            <div className={styles.mobileHint}>
              <b>
                {PHASE_NAMES[view.phase]} · {completion(view)}/
                {view.spots.length}
              </b>
              <span>{INSTRUCTIONS[view.phase]}</span>
            </div>
          )}
          <div className={styles.stage}>
            <div
              className={styles.canvas}
              ref={host}
              onPointerMove={pointer}
              onPointerDown={pointerDown}
              onPointerUp={pointerUp}
              onPointerCancel={() => {
                cancelPress(state.current);
                refresh();
              }}
              role="application"
              aria-label="操作台，鼠标移动工具，按住操作，数字 1 到 4 切换工具"
            />
            {(!ready || loadError) && (
              <div className={styles.loading}>
                {loadError || "正在整理器械…"}
              </div>
            )}
            {view.phase === "welcome" && (
              <div className={styles.patientTag}>
                <span>今日预约 / 001</span>
                <b>岁己 · 勇气充值中</b>
                <small>“我有一点点紧张。”</small>
              </div>
            )}
            {playing && (
              <div className={styles.mobileVitals}>
                疼痛 <b>{Math.round(view.pain)}</b>
                <span>
                  余热 <b>{Math.round(view.heat)}</b>
                </span>
              </div>
            )}
            {playing && (
              <div className={styles.speech} key={view.reaction}>
                {view.reaction}
                <small>角色演绎</small>
              </div>
            )}
            {playing && (
              <div className={styles.chat}>
                {CHAT[Math.floor(view.time / 9) % CHAT.length]}
                <small>改编弹幕</small>
              </div>
            )}
            {view.paused && !panel && playing && (
              <div className={styles.pause}>
                <span>先歇一下</span>
                <p>勇气和探头都暂停了。</p>
                <button
                  className={styles.primary}
                  onClick={() => {
                    setPaused(state.current, false);
                    refresh();
                  }}
                >
                  继续操作
                </button>
              </div>
            )}
          </div>
          <div className={styles.tray} aria-label="器械托盘">
            <div className={styles.trayLabel}>
              器械托盘<small>选好，再动手</small>
            </div>
            {TOOLS.map((tool, index) => (
              <button
                key={tool}
                className={`${styles.tool} ${view.tool === tool ? styles.selectedTool : ""}`}
                aria-pressed={view.tool === tool}
                disabled={!playing || view.paused || view.curtain > 0}
                onClick={() => choose(tool)}
                data-tool={tool}
              >
                <ToolIcon tool={tool} />
                <span>
                  {TOOL_NAMES[tool]}
                  <small>
                    {playing && tool === recommended
                      ? "当前步骤"
                      : `快捷键 ${index + 1}`}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside className={styles.console} aria-label="操作与状态">
          {view.phase === "welcome" ? (
            <div className={styles.intro}>
              <div className={styles.eyebrow}>一个关于美丽与勇气的小游戏</div>
              <h1>
                不许
                <br />
                手抖<span>。</span>
              </h1>
              <p className={styles.lead}>黄金微针模拟室</p>
              <p className={styles.description}>
                一个小方块，一脸小紧张。
                <br />
                拿稳探头，接住岁己的变美愿望。
              </p>
              <div className={styles.modes} aria-label="选择难度">
                {(Object.keys(DIFFICULTIES) as Difficulty[]).map((id) => (
                  <button
                    key={id}
                    aria-pressed={difficulty === id}
                    onClick={() => {
                      setDifficulty(id);
                      state.current = createGame(id, true);
                      refresh();
                    }}
                  >
                    <span>{DIFFICULTIES[id].name}</span>
                    <small>{DIFFICULTIES[id].hint}</small>
                    <i>{difficulty === id ? "●" : "○"}</i>
                  </button>
                ))}
              </div>
              <button
                className={styles.primary}
                onClick={start}
                disabled={!ready}
              >
                戴上手套 · 开始 <span>↗</span>
              </button>
              <div className={styles.best}>
                本机最佳 <b>{Number(best[difficulty]) || "—"}</b>
                <span>约 2–4 分钟 / 局</span>
              </div>
            </div>
          ) : view.phase === "result" ? (
            <div className={styles.result}>
              <span className={styles.eyebrow}>
                本次护理记录 / {DIFFICULTIES[view.difficulty].name}
              </span>
              <div className={styles.grade}>{result.letter}</div>
              <h1>{result.title}</h1>
              <p>
                {view.result === "success"
                  ? "每个落点都被认真照顾到了。"
                  : view.message}
              </p>
              <dl className={styles.stats}>
                <div>
                  <dt>操作得分</dt>
                  <dd>{view.score}</dd>
                </div>
                <div>
                  <dt>漂亮落针</dt>
                  <dd>
                    {view.perfect} / {view.spots.length}
                  </dd>
                </div>
                <div>
                  <dt>最长连稳</dt>
                  <dd>{view.bestCombo}</dd>
                </div>
                <div>
                  <dt>失误次数</dt>
                  <dd>{view.mistakes}</dd>
                </div>
                <div>
                  <dt>止痛道具</dt>
                  <dd>{view.reliefUsed ? "已使用栓剂" : "未使用"}</dd>
                </div>
                <div>
                  <dt>本机最佳</dt>
                  <dd>
                    {Math.max(
                      view.result === "success" ? view.score : 0,
                      Number(best[view.difficulty]) || 0,
                    )}
                  </dd>
                </div>
              </dl>
              <button className={styles.primary} onClick={start}>
                再来一局 <span>↻</span>
              </button>
              <button
                className={styles.textButton}
                onClick={() => {
                  state.current = createGame(difficulty, true);
                  refresh();
                }}
              >
                回到接诊台 · 换个难度
              </button>
              <small className={styles.note}>
                分数只代表游戏操作，不代表真实疗效。
              </small>
            </div>
          ) : (
            <div className={styles.controls}>
              <div className={styles.session}>
                <span>
                  接诊中 / {DIFFICULTIES[view.difficulty].name.split(" · ")[0]}
                </span>
                <button
                  onClick={() => {
                    setPaused(state.current, !state.current.paused);
                    refresh();
                  }}
                  aria-label={view.paused ? "继续游戏" : "暂停游戏"}
                >
                  {view.paused ? "▶ 继续" : "Ⅱ 暂停"}
                </button>
              </div>
              <ol className={styles.steps}>
                {PHASES.map((phase, index) => (
                  <li
                    key={phase}
                    className={view.phase === phase ? styles.currentStep : ""}
                  >
                    <span>{index + 1}</span>
                    <small>{PHASE_NAMES[phase].slice(0, 2)}</small>
                  </li>
                ))}
              </ol>
              <div className={styles.phaseTitle}>
                <h1>{PHASE_NAMES[view.phase]}</h1>
                <b>
                  {completion(view)}
                  <small>/{view.spots.length}</small>
                </b>
              </div>
              <p className={styles.instruction}>{INSTRUCTIONS[view.phase]}</p>
              <div className={styles.phaseProgress}>
                <i
                  style={{
                    width: `${(completion(view) / view.spots.length) * 100}%`,
                  }}
                />
              </div>
              <div className={styles.meters}>
                <Meter label="疼痛 · 太高会手抖" value={view.pain} />
                <Meter label="探头余热" value={view.heat} warm />
                <Meter label="失误风险" value={view.risk} />
              </div>
              {view.phase === "needle" && (
                <div className={styles.pulseBox}>
                  <div className={styles.pulseLabel}>
                    <b>
                      {pulseTime >= low && pulseTime <= high
                        ? "现在松手！"
                        : "按住 → 金区 → 松开"}
                    </b>
                    <span>
                      {view.combo > 1 ? `${view.combo} 连稳` : "稳住就是胜利"}
                    </span>
                  </div>
                  <div className={styles.timing}>
                    <i
                      style={{
                        left: `${(low / 1.5) * 100}%`,
                        width: `${((high - low) / 1.5) * 100}%`,
                      }}
                    />
                    <b
                      style={{ left: `${Math.min(pulseTime / 1.5, 1) * 100}%` }}
                    />
                  </div>
                  <small>疼了或探头热了，换冷敷包按住脸颊。</small>
                  {view.difficulty !== "gentle" && (
                    <div className={styles.angle}>
                      <button
                        aria-label="探头向左旋转"
                        onClick={() => {
                          if (!state.current.paused) state.current.angle = Math.max(
                              -40,
                              state.current.angle - 15,
                            );
                          refresh();
                        }}
                      >
                        ↶ Q
                      </button>
                      <span>
                        探头角度 <b>{Math.round(view.angle)}°</b>
                      </span>
                      <button
                        aria-label="探头向右旋转"
                        onClick={() => {
                          if (!state.current.paused) state.current.angle = Math.min(
                              40,
                              state.current.angle + 15,
                            );
                          refresh();
                        }}
                      >
                        E ↷
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className={styles.feedback} aria-live="polite">
                {view.message}
              </div>
              <button
                className={styles.relief}
                disabled={
                  view.reliefUsed || view.phase === "cool" || view.paused
                }
                onClick={() => {
                  activateRelief(state.current);
                  refresh();
                }}
              >
                <ToolIcon tool="relief" />
                <span>
                  <b>
                    {view.reliefUsed
                      ? view.curtain > 0
                        ? "帘幕后，请稍候…"
                        : view.relief > 0
                          ? `止痛中 · ${Math.ceil(view.relief)}s`
                          : "本局已使用"
                      : "栓剂止痛"}
                  </b>
                  <small>
                    {view.reliefUsed ? "勇气补给已领取" : "可选道具 · 单局一次"}
                  </small>
                </span>
                <span>{view.reliefUsed ? "✓" : "+"}</span>
              </button>
              <div className={styles.scoreLine}>
                <span>
                  操作得分 <b>{view.score}</b>
                </span>
                <span>
                  失误 <b>{view.mistakes}</b>
                </span>
              </div>
            </div>
          )}
          <p className={styles.disclaimer}>
            虚构操作游戏 · 非医疗教学
            <br />
            参数与止痛效果均为游戏设定
          </p>
        </aside>
      </div>
      <footer className={styles.footer}>
        <span>慢一点，也是一种技术。</span>
        <span>鼠标 / 触屏操作 · 1–4 换工具 · P 暂停 · F 全屏</span>
      </footer>

      <dialog ref={dialog} className={styles.dialog} onCancel={closePanel}>
        <div className={styles.dialogHead}>
          <span>
            {panel === "sources"
              ? "灵感档案 / FIELD NOTES"
              : "操作手册 / HOW TO PLAY"}
          </span>
          <button onClick={closePanel} aria-label="关闭弹窗">
            ×
          </button>
        </div>
        {panel === "sources" ? (
          <>
            <h2>针是真的。手抖是游戏的。</h2>
            <p>
              从岁己的直播闲聊，做成一次小小的勇气挑战。角色演绎和游戏弹幕经过改编，原始证据如下。
            </p>
            <h3>直播里的说法</h3>
            {QUOTES.map((q) => (
              <blockquote key={q.time}>
                <p>“{q.quote}”</p>
                <cite>
                  {q.who} · {q.date} · {q.time}
                </cite>
                <small>{q.note}</small>
              </blockquote>
            ))}
            <p className={styles.note}>
              本地自动字幕未经逐句听音复核；弹幕时钟与 SRT
              时钟可能不同。未把网友说法、剂量或麻醉持续时间当医学事实。
            </p>
            <h3>原理与资料</h3>
            {SOURCES.map((s) => (
              <div className={styles.source} key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.label} ↗
                </a>
                <p>{s.text}</p>
              </div>
            ))}
            <p>
              本作的格点、时机、分数、冷敷和栓剂数值均为虚构。现实中的射频微针和用药需要专业评估；栓剂道具不对应某种药物或推荐用法。
            </p>
          </>
        ) : (
          <>
            <h2>小方块，大考验。</h2>
            <p>按顺序完成五个步骤，让每个落点变成绿色勾号。</p>
            <ol className={styles.helpList}>
              <li>
                <b>擦干净</b> 用棉片按住擦过每个圆点，停留片刻让圆环填满。
              </li>
              <li>
                <b>敷好，再擦除</b>{" "}
                换敷麻刷涂满，再换棉片擦除。游戏已把准备时间压缩。
              </li>
              <li>
                <b>对准、按住、松开</b>{" "}
                微针中心停在圆圈里，按住后等指针到金色区间松开。按太快不会完成，太久或手滑会增加风险。
              </li>
              <li>
                <b>别连着硬扎</b>{" "}
                每个点只需成功一次。疼痛会增加手抖；换冷敷包按住脸颊能降痛和降温。
              </li>
              <li>
                <b>温柔收尾</b> 完成微针后，用冷敷包照顾每一个点，领取操作评级。
              </li>
            </ol>
            <p>
              进阶和整活模式需要对齐方框角度：Q / E
              或屏幕旋钮。触屏可直接按住落点，松手完成微针操作。
            </p>
            <p>
              栓剂是可选止痛道具，单局一次，会暂时降低疼痛增长。是否使用都能通关，选择它不会扣分。
            </p>
            <p>
              窗口失焦会抬起工具，切到其他页面会暂停。P 暂停，F 全屏，Esc
              退出全屏或暂停。
            </p>
          </>
        )}
        <button className={styles.primary} onClick={closePanel}>
          回到操作台
        </button>
      </dialog>
    </main>
  );
}
