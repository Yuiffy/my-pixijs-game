"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AudioOutlined,
  BulbOutlined,
  CheckOutlined,
  CoffeeOutlined,
  CustomerServiceOutlined,
  DownloadOutlined,
  FireOutlined,
  FullscreenOutlined,
  HeartOutlined,
  PauseOutlined,
  PlayCircleFilled,
  QuestionCircleOutlined,
  ReloadOutlined,
  ShareAltOutlined,
  SwapOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { ACTION_CARDS, FAN_LABELS, PERKS, TOPICS } from "./content";
import {
  createInitialState,
  gameReducer,
  getEnding,
  getNextBeatRisk,
  getReplyPreview,
  getSupportRate,
  getViewers,
  validateSave,
} from "./engine";
import type { FanKind, GameAction, ReplyStyle, StreamState } from "./types";
import { STREAMER_SKINS } from "./skins";
import {
  downloadResult,
  emptyCareer,
  ENDING_IDS,
  META_KEY,
  readCareer,
  resultText,
  SAVE_KEY,
} from "./persistence";
import type { Career } from "./persistence";
import styles from "./streamer.module.css";

type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};
const FAN_KINDS: FanKind[] = ["support", "rational", "chaos", "casual"];
const FAN_COLORS = {
  support: "#9470e8",
  rational: "#67b4a7",
  chaos: "#e9ac71",
  casual: "#c4bfce",
};
const REPLIES: { id: ReplyStyle; title: string; icon: React.ReactNode }[] = [
  { id: "agree", title: "接住这句", icon: <HeartOutlined /> },
  { id: "explain", title: "好好解释", icon: <CoffeeOutlined /> },
  { id: "confront", title: "拉出来对线", icon: <ThunderboltOutlined /> },
];
const ACT_NAMES = ["试探水温", "弹幕升温", "最后的控场"];
const PREVIEW_CHAT = [
  {
    user: "今天也要早点睡",
    kind: "support" as FanKind,
    text: "来了来了，今天聊点什么？",
  },
  {
    user: "饼干观察员",
    kind: "rational" as FanKind,
    text: "听见“我跟你们说”就坐直了。",
  },
  {
    user: "前排搬个板凳",
    kind: "chaos" as FanKind,
    text: "有一种要长脑子的预感",
  },
  {
    user: "路过的一片云",
    kind: "casual" as FanKind,
    text: "新来的，这个直播间一直这么热闹吗",
  },
];

function Meter({
  label,
  value,
  icon,
  danger = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={`${styles.meter} ${danger ? styles.dangerMeter : ""}`}>
      <span className={styles.meterLabel}>
        {icon} {label}
      </span>
      <strong>
        {Math.round(value)}
        <small>/ 100</small>
      </strong>
      <div className={styles.meterTrack}>
        <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

export default function StreamerGame() {
  const [state, setState] = useState<StreamState>(createInitialState);
  const [career, setCareer] = useState<Career>(emptyCareer);
  const [saved, setSaved] = useState<StreamState | null>(null);
  const [ready, setReady] = useState(false);
  const [timed, setTimed] = useState(true);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [selectedComment, setSelectedComment] = useState<number | null>(null);
  const [startPerk, setStartPerk] = useState("");
  const [seedInput, setSeedInput] = useState("");
  const [notice, setNotice] = useState("");
  const [shareFallback, setShareFallback] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [muted, setMuted] = useState(true);
  const runKey = useRef("");
  const audioRef = useRef<AudioContext | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);

  const live = !["lobby", "ended"].includes(state.phase);
  const skin =
    STREAMER_SKINS.find((item) => item.id === career.skin) || STREAMER_SKINS[1];
  const topic = TOPICS.find((item) => item.id === state.activeTopic);
  const beat = topic?.beats[state.beat];
  const comments =
    ["reply", "continue"].includes(state.phase) && beat
      ? beat.comments
      : PREVIEW_CHAT;
  const viewers = getViewers(state);
  const supportRate = Math.round(getSupportRate(state));
  const unlockedPerks =
    career.runs >= 5
      ? ["empathetic", "spotlight", "thick-skin"]
      : career.runs >= 3
        ? ["empathetic", "spotlight"]
        : career.runs >= 1
          ? ["empathetic"]
          : [];

  useEffect(() => {
    setCareer(readCareer());
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const restored = validateSave(parsed?.state);
      if (restored && restored.phase !== "lobby") {
        setSaved(restored);
        runKey.current =
          typeof parsed.runKey === "string"
            ? parsed.runKey
            : `restored-${restored.seed}`;
      }
      const querySeed = new URLSearchParams(window.location.search).get("seed");
      if (querySeed && /^\d{1,10}$/.test(querySeed)) setSeedInput(querySeed);
      localStorage.setItem("streamer-storage-probe", "1");
      localStorage.removeItem("streamer-storage-probe");
    } catch {
      setStorageAvailable(false);
    }
    setReady(true);
    return () => {
      audioRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(META_KEY, JSON.stringify(career));
    } catch {
      setStorageAvailable(false);
    }
  }, [career, ready]);

  useEffect(() => {
    if (!ready || state.phase === "lobby") return;
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ state, runKey: runKey.current }),
      );
    } catch {
      setStorageAvailable(false);
    }
    if (state.phase === "ended") {
      setCareer((previous) => {
        if (previous.recorded.includes(runKey.current)) return previous;
        return {
          ...previous,
          runs: previous.runs + 1,
          best: Math.max(previous.best, state.score),
          endings: Array.from(
            new Set([
              ...previous.endings,
              state.ending || getEnding(state).id,
            ]),
          ),
          recorded: [...previous.recorded, runKey.current].slice(-100),
        };
      });
    }
  }, [state, ready]);

  const playTone = useCallback(() => {
    if (muted) return;
    try {
      const context = audioRef.current || new AudioContext();
      audioRef.current = context;
      context.resume().catch(() => undefined);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(620, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        880,
        context.currentTime + 0.08,
      );
      gain.gain.setValueAtTime(0.045, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.16);
    } catch {
      setMuted(true);
    }
  }, [muted]);

  const act = useCallback(
    (action: GameAction) => {
      if (paused || help) return;
      setState((previous) => gameReducer(previous, action));
      if (action.type !== "tick") {
        setSelectedComment(null);
        playTone();
      }
    },
    [paused, help, playTone],
  );

  useEffect(() => {
    if (!live || paused || help || !state.timed || state.phase === "reward") return undefined;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      if (!document.hidden) setState((previous) => gameReducer(previous, { type: "tick", ms: Math.min(elapsed, 1500) }),);
    }, 250);
    return () => window.clearInterval(timer);
  }, [live, paused, help, state.timed, state.phase]);

  useEffect(() => {
    const gameWindow = window as GameWindow;
    gameWindow.render_game_to_text = () => JSON.stringify({
        ...state,
        selectedComment,
        paused: paused || help,
        skin: skin.id,
        viewers,
        supportRate,
        coordinateSystem: "DOM interface; origin top-left; x right, y down",
      });
    gameWindow.advanceTime = (ms) => {
      if (!paused && !help) setState((previous) => gameReducer(previous, { type: "tick", ms }));
    };
    return () => {
      delete gameWindow.render_game_to_text;
      delete gameWindow.advanceTime;
    };
  }, [state, selectedComment, paused, help, skin.id, viewers, supportRate]);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => setNotice("可按 Esc 退出全屏"));
    else rootRef.current
        ?.requestFullscreen?.()
        .catch(() => setNotice("当前浏览器不支持全屏"));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      ) return;
      if (event.key.toLowerCase() === "f") fullscreen();
      if (event.key === "Escape") {
        if (help) setHelp(false);
        else if (live) setPaused((previous) => !previous);
      }
      if (event.code === "Space" && event.target === document.body && live) {
        event.preventDefault();
        setPaused((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live, help, fullscreen]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!paused && !help) return undefined;
    const previousFocus = document.activeElement;
    const shell = rootRef.current?.firstElementChild;
    shell?.setAttribute("inert", "");
    modalRef.current?.querySelector("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons =
        modalRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      shell?.removeAttribute("inert");
      document.removeEventListener("keydown", trap);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [paused, help]);

  const start = (sameSeed = false) => {
    const typed = Number(seedInput);
    const seed = sameSeed
      ? state.seed
      : seedInput && Number.isSafeInteger(typed) && typed > 0
        ? typed
        : crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    runKey.current = `${seed}-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
    setState(
      gameReducer(createInitialState(), {
        type: "start",
        seed,
        timed,
        perk: unlockedPerks.includes(startPerk) ? startPerk : undefined,
      }),
    );
    setSelectedComment(null);
    setSaved(null);
    setPaused(false);
    setHelp(false);
    setShareFallback("");
    playTone();
  };

  const changeLook = () => setCareer((previous) => ({
      ...previous,
      skin:
        skin.id === STREAMER_SKINS[0].id
          ? STREAMER_SKINS[1].id
          : STREAMER_SKINS[0].id,
    }));
  const share = async () => {
    const text = resultText(state);
    try {
      await navigator.clipboard.writeText(text);
      setNotice("成绩和同局种子链接已复制");
    } catch {
      setShareFallback(text);
    }
  };

  const renderLobby = () => (
    <div className={styles.lobbyCopy}>
      <span className={styles.eyebrow}>A LITTLE CHAOS. A LOT OF CHAT.</span>
      <h1>
        饼干岁，
        <br />
        听我说<span>。</span>
      </h1>
      <p>
        话题可以跑偏。
        <br />
        直播间，得由你控场。
      </p>
      <button
        className={styles.primary}
        data-testid="start-stream"
        disabled={!ready}
        onClick={() => start()}
      >
        <PlayCircleFilled /> {saved ? "另开一场" : "开始直播"}{" "}
        <ArrowRightOutlined />
      </button>
      {saved && (
        <button
          className={styles.resumeLink}
          data-testid="resume-stream"
          onClick={() => {
            setState(saved);
            setSaved(null);
            setPaused(false);
          }}
        >
          {saved.phase === "ended" ? "查看上场成绩" : "继续上次直播"}{" "}
          <ArrowRightOutlined />
        </button>
      )}
      <span className={styles.sessionHint}>
        约 8–12 分钟 / 三幕直播 / 七种结局
      </span>
    </div>
  );

  const renderHand = () => {
    if (state.phase === "lobby") return (
        <div className={styles.setup}>
          <div className={styles.sectionHeading}>
            <span>
              <i /> 开播准备
            </span>
            <small>第一场？试试慢慢聊</small>
          </div>
          <div className={styles.setupRow}>
            <div className={styles.modeButtons}>
              <button
                className={timed ? styles.chosenMode : ""}
                data-testid="mode-timed"
                onClick={() => setTimed(true)}
              >
                <FireOutlined /> 临场模式 <small>冷场会掉粉</small>
              </button>
              <button
                className={!timed ? styles.chosenMode : ""}
                data-testid="mode-cozy"
                onClick={() => setTimed(false)}
              >
                <CoffeeOutlined /> 慢慢聊 <small>不限思考时间</small>
              </button>
            </div>
            <button
              className={styles.lookButton}
              data-testid="change-look"
              onClick={changeLook}
            >
              <SwapOutlined />
              <span>
                {skin.look}
                <small>切换形象</small>
              </span>
            </button>
          </div>
          <div className={styles.setupFooter}>
            <label htmlFor="stream-seed">
              同局种子{" "}
              <input
                id="stream-seed"
                aria-label="同局种子"
                value={seedInput}
                inputMode="numeric"
                maxLength={10}
                placeholder="随机开播"
                onChange={(event) => setSeedInput(event.target.value.replace(/\D/g, ""))}
              />
            </label>
            {unlockedPerks.length > 0 && (
              <label htmlFor="stream-perk">
                开场天赋{" "}
                <select
                  id="stream-perk"
                  aria-label="开场天赋"
                  value={startPerk}
                  onChange={(event) => setStartPerk(event.target.value)}
                >
                  <option value="">轻装上阵</option>
                  {PERKS.filter((perk) => unlockedPerks.includes(perk.id)).map(
                    (perk) => (
                      <option key={perk.id} value={perk.id}>
                        {perk.title}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
            <span>
              最高 {career.best} 分 · 结局 {career.endings.length}/7
            </span>
          </div>
          <details className={styles.collection}>
            <summary>
              结局图鉴 <span>{career.endings.length} / 7</span>
            </summary>
            <div>
              {ENDING_IDS.map((id) => {
                const ending = getEnding({ ...state, ending: id });
                const found = career.endings.includes(id);
                return (
                  <p key={id} data-found={found}>
                    <strong>
                      {found ? "✦" : "◇"} {ending.title}
                    </strong>
                    <span>
                      {found
                        ? ending.description
                        : "尚未收集 · 试试不同的控场方式"}
                    </span>
                  </p>
                );
              })}
            </div>
          </details>
        </div>
      );
    if (state.phase === "reward") return (
        <div className={styles.handSection}>
          <div className={styles.sectionHeading}>
            <span>
              <BulbOutlined /> 中场灵感 · 三选一
            </span>
            <small>选择后进入下一幕</small>
          </div>
          <div className={styles.topicGrid}>
            {PERKS.filter((perk) => state.rewardOptions.includes(perk.id)).map(
              (perk) => (
                <button
                  key={perk.id}
                  data-testid={`reward-${perk.id}`}
                  className={`${styles.topicCard} ${styles.perkCard}`}
                  onClick={() => act({ type: "reward", id: perk.id })}
                >
                  <span className={styles.cardIcon}>{perk.icon}</span>
                  <h3>{perk.title}</h3>
                  <p>{perk.description}</p>
                  <span className={styles.cardBottom}>
                    获得本局天赋 <ArrowRightOutlined />
                  </span>
                </button>
              ),
            )}
          </div>
        </div>
      );
    if (state.phase === "ended") return (
        <div className={styles.resultActions}>
          <button
            className={styles.primary}
            data-testid="restart-stream"
            onClick={() => start()}
          >
            <ReloadOutlined /> 再开一场
          </button>
          <button className={styles.secondary} onClick={() => start(true)}>
            重打同一局
          </button>
          <button
            className={styles.secondary}
            data-testid="share-result"
            onClick={share}
          >
            <ShareAltOutlined /> 复制成绩
          </button>
          <button
            className={styles.secondary}
            data-testid="download-result"
            onClick={() => downloadResult(state)
                .then(() => setNotice("成绩卡已下载"))
                .catch(() => setNotice("导出未成功，可先复制成绩"))}
          >
            <DownloadOutlined /> 成绩卡
          </button>
          <button
            className={styles.textButton}
            onClick={() => {
              setSaved(state);
              setState(createInitialState());
            }}
          >
            回到开播准备
          </button>
          {shareFallback && (
            <label htmlFor="stream-share" className={styles.shareFallback}>
              复制下面的成绩和挑战链接
              <textarea
                id="stream-share"
                readOnly
                value={shareFallback}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
          <p>
            已收集 {career.endings.length}/7 个结局 ·{" "}
            {career.runs < 5
              ? `完成 ${career.runs < 1 ? 1 : career.runs < 3 ? 3 : 5} 场解锁新的开场天赋`
              : "开场天赋全部解锁"}{" "}
            · 最佳 {career.best} 分
          </p>
        </div>
      );
    return (
      <div className={styles.handSection}>
        <div className={styles.sectionHeading}>
          <span>
            <i />{" "}
            {state.phase === "topic"
              ? "聊点什么？"
              : state.phase === "continue"
                ? "还要继续往下说吗？"
                : "话已经说出口了"}
          </span>
          <small>
            {state.phase === "topic"
              ? "三选一 · 越深入，越容易出节目效果"
              : state.phase === "reply"
                ? "点一条弹幕，再决定怎么回应"
                : "继续展开，或用下方行动卡转场"}
          </small>
        </div>
        {state.phase === "topic" && (
          <div className={styles.topicGrid}>
            {state.topicOptions
              .map((id) => TOPICS.find((item) => item.id === id))
              .filter((item) => !!item)
              .map((item) => (
                <button
                  key={item.id}
                  data-testid={`topic-${item.id}`}
                  className={styles.topicCard}
                  onClick={() => act({ type: "topic", id: item.id })}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.cardIcon}>{item.icon}</span>
                    <span
                      className={styles.difficulty}
                      data-risk={item.difficulty}
                    >
                      {item.difficulty}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.teaser}</p>
                  <span className={styles.cardBottom}>
                    {item.category} · 3 段 <ArrowRightOutlined />
                  </span>
                </button>
              ))}
          </div>
        )}
        {state.phase === "continue" && topic && (
          <button
            data-testid="continue-topic"
            className={styles.continueCard}
            onClick={() => act({ type: "continue" })}
          >
            <span className={styles.cardIcon}>{topic.icon}</span>
            <div>
              <span className={styles.eyebrow}>
                下一张话题 / {state.beat + 2} OF 3
              </span>
              <h3>{topic.beats[state.beat + 1]?.label}</h3>
              <p>{topic.beats[state.beat + 1]?.text}</p>
            </div>
            <span className={styles.continueRight}>
              继续说 <ArrowRightOutlined />
              <small>风险 +{getNextBeatRisk(state)}</small>
            </span>
          </button>
        )}
        {state.phase === "reply" && (
          <div className={styles.replyReminder}>
            <span className={styles.quoteMark}>“</span>
            <div>
              <strong>
                {selectedComment === null
                  ? "这么多条弹幕，你想回哪一句？"
                  : `已选中 @${comments[selectedComment]?.user}`}
              </strong>
              <p>
                {selectedComment === null
                  ? "支持你的人、认真劝你的人、来看热闹的人，都在等你的下一句话。"
                  : "在弹幕区选择回应方式。每一次接话，都在决定谁会留下。"}
              </p>
            </div>
            <span className={styles.pointArrow}>↗</span>
          </div>
        )}
        <div className={styles.actionRow}>
          {ACTION_CARDS.map((card) => {
            const disabled =
              !["reply", "continue"].includes(state.phase) ||
              state.actions[card.id] <= 0 ||
              (card.id === "moderate" &&
                (state.phase !== "reply" ||
                  state.moderatedBeat ===
                    `${state.activeTopic}:${state.beat}`));
            return (
              <button
                key={card.id}
                data-testid={`action-${card.id}`}
                className={styles.actionCard}
                disabled={disabled}
                title={`${card.quote}\n${card.description}`}
                onClick={() => act({ type: "action", id: card.id })}
              >
                <span className={styles.actionIcon}>{card.icon}</span>
                <span>
                  <strong>{card.title}</strong>
                  <small>{card.description}</small>
                </span>
                <b>×{state.actions[card.id]}</b>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <main className={styles.app} ref={rootRef}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <Link href="/demos" aria-label="返回小游戏">
              <ArrowLeftOutlined />
            </Link>
            <span className={styles.brandIcon}>
              <AudioOutlined />
            </span>
            <strong>
              饼干岁，听我说<span>LIVE ROOM SIMULATOR</span>
            </strong>
            <span className={styles.alpha}>试玩版 01</span>
          </div>
          <div className={styles.headerTools}>
            <button
              aria-label={muted ? "开启音效" : "关闭音效"}
              title={muted ? "开启音效" : "关闭音效"}
              onClick={() => setMuted((previous) => !previous)}
            >
              <CustomerServiceOutlined />
              <span>{muted ? "音效关" : "音效开"}</span>
            </button>
            <button aria-label="玩法说明" onClick={() => setHelp(true)}>
              <QuestionCircleOutlined />
            </button>
            <button aria-label="全屏" onClick={fullscreen}>
              <FullscreenOutlined />
            </button>
            {live && (
              <button
                data-testid="pause-stream"
                aria-label="暂停直播"
                onClick={() => setPaused(true)}
              >
                <PauseOutlined />
              </button>
            )}
          </div>
        </header>

        <div className={styles.broadcastHeading}>
          <div>
            <span className={styles.liveBadge}>
              <i />{" "}
              {live ? "LIVE" : state.phase === "ended" ? "OFF AIR" : "STANDBY"}
            </span>
            <span>
              {state.phase === "lobby"
                ? "今晚，也是元气满满的杂谈时间"
                : `第 ${state.act} 幕 / ${ACT_NAMES[state.act - 1] || ACT_NAMES[2]}`}
            </span>
          </div>
          <div className={styles.actProgress}>
            {[1, 2, 3].map((number) => (
              <span key={number} data-active={number <= state.act}>
                {String(number).padStart(2, "0")}
                <i />
              </span>
            ))}
          </div>
        </div>

        <div className={styles.layout} data-phase={state.phase}>
          <section className={styles.mainColumn} aria-label="直播与手牌">
            <div className={styles.stats}>
              <Meter label="热度" value={state.heat} icon={<FireOutlined />} />
              <Meter
                label="信任"
                value={state.trust}
                icon={<HeartOutlined />}
              />
              <Meter
                label="翻车风险"
                value={state.risk}
                icon={<WarningOutlined />}
                danger
              />
              <Meter
                label="精力"
                value={state.energy}
                icon={<ThunderboltOutlined />}
              />
              <Meter
                label="脑控"
                value={state.control}
                icon={<AudioOutlined />}
              />
            </div>

            <div
              className={`${styles.stage} ${state.phase === "lobby" ? styles.lobbyStage : ""} ${state.risk >= 70 ? styles.dangerStage : ""}`}
            >
              <div className={styles.roomWindow}>
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className={styles.orbit} />
              <span className={styles.stageStar}>✦</span>
              <span className={styles.stageStarSmall}>✧</span>
              <span className={styles.stageWatermark}>
                ON
                <br />
                AIR.
              </span>
              <div
                className={`${styles.avatar} ${skin.fullBody ? styles.fullBody : styles.halfBody}`}
                key={skin.id}
              >
                <Image
                  src={skin.image}
                  alt={`${skin.name} ${skin.look}`}
                  width={skin.fullBody ? 899 : 768}
                  height={skin.fullBody ? 2048 : 1361}
                  priority
                  unoptimized
                />
              </div>
              <div className={styles.stageTop}>
                <span>
                  <i />{" "}
                  {state.phase === "lobby"
                    ? "准备开播"
                    : state.phase === "ended"
                      ? "本场已结束"
                      : "杂谈进行中"}
                </span>
                <span>
                  <TeamOutlined /> {viewers.toLocaleString("zh-CN")} 在线
                </span>
              </div>
              <span className={styles.nameTag}>
                SUI<span>岁己的直播间</span>
              </span>
              <div className={styles.microphone}>
                <div />
                <i />
              </div>
              {state.phase === "lobby" && renderLobby()}
              {live && state.phase !== "reward" && (
                <div
                  className={styles.speech}
                  key={`${state.activeTopic}-${state.beat}-${state.phase}`}
                >
                  <span className={styles.speechLabel}>
                    {topic && ["reply", "continue"].includes(state.phase)
                      ? `${topic.title} · ${state.beat + 1}/3`
                      : "下一段直播，由你来决定"}
                  </span>
                  <p>
                    {state.phase === "reply"
                      ? beat?.text
                      : state.phase === "continue"
                        ? state.lastReply
                        : "饼干岁我跟你们说……今天的话题，可能有一点点不一样。"}
                  </p>
                </div>
              )}
              {state.phase === "reward" && (
                <div className={styles.intermission}>
                  <span className={styles.eyebrow}>A MOMENT TO BREATHE</span>
                  <h2>
                    喝口水，
                    <br />
                    接着聊。
                  </h2>
                  <p>把刚才的经验，变成下一幕的底气。</p>
                </div>
              )}
              {state.phase === "ended" && (
                <div className={styles.result}>
                  <span className={styles.eyebrow}>
                    STREAM RECAP / 本场结局
                  </span>
                  <h2>{getEnding(state).title}</h2>
                  <p>{getEnding(state).description}</p>
                  <div className={styles.resultScore}>
                    {state.score}
                    <span>控场评分</span>
                  </div>
                  <div className={styles.resultFacts}>
                    <span>
                      话题 <b>{state.completedTopics}/6</b>
                    </span>
                    <span>
                      最高在线 <b>{state.peakViewers}</b>
                    </span>
                    <span>
                      支持率 <b>{supportRate}%</b>
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.streamTicker}>
              <span>
                <span className={styles.pulseBars}>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                {live
                  ? state.lastEvent || "直播已开始。先选一个话题试试水。"
                  : state.phase === "ended"
                    ? "晚安。下次直播，再见。"
                    : "你的每一次回应，都会改变这个直播间。"}
              </span>
              {live && state.phase !== "reward" && (
                <strong
                  className={
                    state.remainingMs < 12000 && state.timed
                      ? styles.timerDanger
                      : ""
                  }
                >
                  {state.timed
                    ? `冷场前 ${Math.max(0, Math.ceil(state.remainingMs / 1000))}s`
                    : "慢慢聊 ∞"}
                </strong>
              )}
            </div>
            {renderHand()}
          </section>

          <aside className={styles.chatColumn} aria-label="弹幕与粉丝">
            <div className={styles.chatTitle}>
              <span>
                <i /> 弹幕现场
              </span>
              <small>CHAT ROOM</small>
            </div>
            <div className={styles.chatNotice}>
              {state.phase === "reply"
                ? "点击一条弹幕，把麦递给你想回应的人。"
                : "直播间的风向，藏在每一句弹幕里。"}
            </div>
            <div
              className={styles.comments}
              key={`${state.activeTopic}-${state.beat}-${state.phase}`}
            >
              {comments.map((comment, index) => (
                <button
                  key={`${comment.user}-${index}`}
                  data-testid={`comment-${index}`}
                  className={`${styles.comment} ${selectedComment === index ? styles.selectedComment : ""}`}
                  disabled={state.phase !== "reply"}
                  onClick={() => setSelectedComment(index)}
                  style={
                    { "--fan-color": FAN_COLORS[comment.kind] } as CSSProperties
                  }
                >
                  <span className={styles.commentAvatar}>
                    {comment.user.slice(0, 1)}
                  </span>
                  <span className={styles.commentBody}>
                    <span className={styles.commentMeta}>
                      <strong>{comment.user}</strong>
                      <small>{FAN_LABELS[comment.kind]}</small>
                    </span>
                    <span className={styles.commentText}>{comment.text}</span>
                  </span>
                  {selectedComment === index && (
                    <CheckOutlined className={styles.selectedCheck} />
                  )}
                </button>
              ))}
            </div>
            {state.phase === "reply" && (
              <div className={styles.replyPanel}>
                <span className={styles.replyHeading}>
                  {selectedComment === null
                    ? "① 选弹幕 → ② 选回应"
                    : "这句话，你准备怎么接？"}
                </span>
                {REPLIES.map((reply) => (
                  <button
                    key={reply.id}
                    data-testid={`reply-${reply.id}`}
                    className={styles.replyButton}
                    disabled={selectedComment === null}
                    onClick={() => selectedComment !== null &&
                      act({
                        type: "reply",
                        index: selectedComment,
                        style: reply.id,
                      })}
                  >
                    {reply.icon}
                    <span>
                      <strong>{reply.title}</strong>
                      <small>
                        {selectedComment === null
                          ? "先选择上方一条弹幕"
                          : getReplyPreview(state, selectedComment, reply.id)}
                      </small>
                    </span>
                    <ArrowRightOutlined />
                  </button>
                ))}
              </div>
            )}
            {state.phase !== "reply" && (
              <div className={styles.chatIdle}>
                <span>✳</span>
                <p>
                  {state.phase === "continue"
                    ? "主播话还没说完，弹幕已经开始猜了。"
                    : state.phase === "reward"
                      ? "休息一下，弹幕也需要消化。"
                      : state.phase === "ended"
                        ? "有人留下，有人离开。下一次，你会怎么说？"
                        : "“我们准备好听你说了。”"}
                </p>
                <small>
                  {state.phase === "lobby"
                    ? "开播后，弹幕可以点选回应"
                    : "下一句话，会把他们带向哪里？"}
                </small>
              </div>
            )}
            <div className={styles.audience}>
              <div className={styles.audienceHeading}>
                <strong>谁留在了直播间</strong>
                <span>
                  支持率 <b>{supportRate}%</b>
                </span>
              </div>
              <div className={styles.fanBar}>
                {FAN_KINDS.map((kind) => (
                  <i
                    key={kind}
                    style={{
                      width: `${viewers ? (state.fans[kind] / viewers) * 100 : 25}%`,
                      background: FAN_COLORS[kind],
                    }}
                  />
                ))}
              </div>
              <div className={styles.fanLegend}>
                {FAN_KINDS.map((kind) => (
                  <span key={kind}>
                    <i style={{ background: FAN_COLORS[kind] }} />
                    {FAN_LABELS[kind]}
                    <b>
                      {viewers
                        ? Math.round((state.fans[kind] / viewers) * 100)
                        : 0}
                      %
                    </b>
                  </span>
                ))}
              </div>
              <p>全肯定越多，越容易控场；声音越单一，越难走远。</p>
            </div>
          </aside>
        </div>

        <footer className={styles.footer}>
          <span>
            虚构杂谈剧场 · 对话与事件均为游戏改编，不代表主播实际言行。
          </span>
          <span>
            {live
              ? `已聊 ${state.completedTopics}/6 个话题 · 天赋 ${state.perks.length}`
              : `${TOPICS.length} 个话题 · ${ENDING_IDS.length} 种结局`}
            <button onClick={() => setHelp(true)}>
              怎么玩 <ArrowRightOutlined />
            </button>
          </span>
        </footer>
        {state.perks.length > 0 && live && (
          <div className={styles.perkStrip}>
            {state.perks.map((id) => {
              const perk = PERKS.find((item) => item.id === id);
              return perk ? (
                <span key={id} title={perk.description}>
                  {perk.icon} {perk.title}
                </span>
              ) : null;
            })}
          </div>
        )}
        {!storageAvailable && (
          <p className={styles.storageNotice}>
            当前浏览器无法保存进度；本场仍可正常游玩和导出成绩。
          </p>
        )}
        {notice && (
          <div className={styles.toast} role="status">
            {notice}
          </div>
        )}
      </div>

      {(paused || help) && (
        <div className={styles.overlay}>
          <section
            className={styles.modal}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={help ? "玩法说明" : "直播暂停"}
          >
            <span className={styles.eyebrow}>
              {help ? "HOW TO PLAY" : "TAKE A BREATH"}
            </span>
            <h2>{help ? "控场，从听懂弹幕开始。" : "先喝口水。"}</h2>
            {help ? (
              <>
                <ol>
                  <li>
                    <b>打话题。</b>
                    每个话题有三段，后续卡会提前展示。风险越高，节目效果也越强。
                  </li>
                  <li>
                    <b>挑弹幕。</b>
                    接住支持能提高脑控，认真解释更耗精力；对线能冲热度，也可能把信任打没。
                  </li>
                  <li>
                    <b>会救场。</b>
                    唱歌、游戏、同步视听会结束当前话题；房管控评只缓解眼前风险。卡牌次数有限。
                  </li>
                  <li>
                    <b>撑过三幕。</b>
                    每幕两个话题，中场选天赋。风险满格、精力耗尽或观众流失会提前下播。
                  </li>
                </ol>
                <p>
                  支持率高不等于经营得好：提纯、破圈、稳定社区会走向不同结局。完成
                  1 / 3 / 5 场解锁可选开场天赋；成绩单附同局种子。
                </p>
                <p>
                  临场模式冷场会流失观众；慢慢聊没有倒计时。暂停、查看说明和切到后台时不计时。F
                  全屏，空格暂停。
                </p>
              </>
            ) : (
              <>
                <p>计时已经暂停，弹幕也会等你。</p>
                <button
                  className={styles.secondary}
                  data-testid="change-look"
                  onClick={changeLook}
                >
                  <SwapOutlined /> {skin.look}
                </button>
              </>
            )}
            <button
              className={styles.primary}
              data-testid="resume-pause"
              onClick={() => {
                setHelp(false);
                setPaused(false);
              }}
            >
              {help ? "明白了" : "继续直播"} <ArrowRightOutlined />
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
