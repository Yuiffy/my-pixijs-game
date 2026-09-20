"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BankOutlined,
  CalendarOutlined,
  CheckOutlined,
  CloseOutlined,
  DollarOutlined,
  FireOutlined,
  FullscreenOutlined,
  HeartOutlined,
  HomeOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  CHILD_ACTIONS,
  CANDIDATES,
  DIFFICULTIES,
  ECONOMY_EVENTS,
  GAME_TITLE,
  PARENT_ACTIONS,
  STAGE_LABELS,
} from "./content";
import {
  createInitialState,
  gameReducer,
  getActionPreview,
  getAvailableChildActions,
  getAvailableParentActions,
  getCandidate,
  getEnding,
  validateSave,
} from "./engine";
import type {
  ChildActionId,
  Difficulty,
  GameMode,
  MarriageGameState,
  MarriageGameAction,
  ParentActionId,
} from "./types";
import styles from "./marriage.module.css";

const SAVE_KEY = "marriage-pressure-save-v1";
const PROFILE_KEY = "marriage-pressure-player-name";
const MODE_COPY: Record<GameMode, { title: string; subtitle: string }> = {
  child: { title: "我就是当事人", subtitle: "替自己做决定，也决定要不要靠近谁" },
  parent: { title: "我是家长", subtitle: "挑人、催进度，或真正提供支持" },
  duel: { title: "家庭对弈", subtitle: "两人同屏，家长与当事人轮流回应" },
};

interface EventNotice {
  title: string;
  detail: string;
  kind: "event" | "match" | "action" | "ending";
}

type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "stress" | "autonomy" | "family" | "money" | "career" | "relation" | "nextgen";
}) {
  const shown = Math.max(0, Math.min(100, value));
  return (
    <div className={styles.meter} data-tone={tone} data-testid={`meter-${tone}`}>
      <span>{label}</span>
      <strong>{Math.round(value)}</strong>
      <i><b style={{ width: `${shown}%` }} /></i>
    </div>
  );
}

function CandidatePortrait({ id, priority = false }: { id: string; priority?: boolean }) {
  const candidate = CANDIDATES.find(item => item.id === id);
  if (!candidate) return null;
  return (
    <Image
      src={candidate.image}
      alt={`${candidate.name} 的虚构游戏角色立绘`}
      fill
      priority={priority}
      unoptimized
      sizes="(max-width: 760px) 46vw, 360px"
      className={styles.portraitImage}
    />
  );
}

export default function MarriagePressureGame() {
  const [state, setState] = useState<MarriageGameState>(createInitialState);
  const [saved, setSaved] = useState<MarriageGameState | null>(null);
  const [mode, setMode] = useState<GameMode>("child");
  const [difficulty, setDifficulty] = useState<Difficulty>("realistic");
  const [seedInput, setSeedInput] = useState("");
  const [playerName, setPlayerName] = useState("小满");
  const [eventNotice, setEventNotice] = useState<EventNotice | null>(null);
  const [help, setHelp] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const rootRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const candidate = getCandidate(state.candidateId);
  const event = ECONOMY_EVENTS.find(item => item.id === state.currentEventId);
  const ending = state.phase === "ended" ? getEnding(state) : null;
  const childActions = useMemo(
    () => getAvailableChildActions(state),
    [state],
  );
  const parentActions = useMemo(
    () => getAvailableParentActions(state),
    [state],
  );

  useEffect(() => {
    try {
      const restored = validateSave(JSON.parse(localStorage.getItem(SAVE_KEY) || "null"));
      if (restored && restored.phase !== "lobby") setSaved(restored);
      const restoredName = localStorage.getItem(PROFILE_KEY)?.trim();
      if (restoredName) setPlayerName(restoredName.slice(0, 8));
      localStorage.setItem("marriage-pressure-probe", "1");
      localStorage.removeItem("marriage-pressure-probe");
    } catch {
      setStorageAvailable(false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || state.phase === "lobby") return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      setStorageAvailable(false);
    }
  }, [state, ready]);

  useEffect(() => {
    const target = window as GameWindow;
    target.render_game_to_text = () => JSON.stringify({
      ...state,
      candidate: candidate
        ? {
            id: candidate.id,
            name: candidate.name,
            compatibility: candidate.compatibility,
            resume: candidate.resume,
          }
        : null,
      event: event ? { id: event.id, title: event.title } : null,
      availableActions:
        state.activeActor === "parent" ? parentActions : childActions,
      playerName,
      eventNotice,
      help,
      coordinateSystem: "DOM board; origin top-left; x right, y down",
    });
    target.advanceTime = () => undefined;
    return () => {
      delete target.render_game_to_text;
      delete target.advanceTime;
    };
  }, [state, candidate, event, parentActions, childActions, playerName, eventNotice, help]);

  const personalizeNarrative = useCallback((line: string) => {
    if (state.mode === "child") return line.replaceAll("子女", "我");
    if (state.mode === "parent") return line.replaceAll("子女", playerName).replace(/^家长/, "我");
    return line.replaceAll("子女", playerName).replace(/^家长/, "家长玩家");
  }, [state.mode, playerName]);

  const makeNotice = useCallback((
    previous: MarriageGameState,
    next: MarriageGameState,
    action: MarriageGameAction,
  ): EventNotice => {
    const beforeCandidate = getCandidate(previous.candidateId);
    const afterCandidate = getCandidate(next.candidateId);
    if (next.phase === "ended") {
      return { kind: "ending", title: "这一局有结果了", detail: personalizeNarrative(next.lastEvent) };
    }
    if (beforeCandidate?.id !== afterCandidate?.id) {
      if (beforeCandidate && afterCandidate) {
        return {
          kind: "match",
          title: `现在介绍的是 ${afterCandidate.name}`,
          detail: `${beforeCandidate.name} 已经翻篇，现在家庭群推来的是 ${afterCandidate.name}。当前版本一次只发展一段关系。`,
        };
      }
      if (beforeCandidate && !afterCandidate) {
        return {
          kind: "match",
          title: `${beforeCandidate.name} 被划掉了`,
          detail: `${personalizeNarrative(next.lastEvent)} 现在要回到相亲角重新选人。`,
        };
      }
      if (afterCandidate) {
        return {
          kind: "match",
          title: `今晚被介绍的人是 ${afterCandidate.name}`,
          detail: personalizeNarrative(next.lastEvent),
        };
      }
    }
    if (next.turn > previous.turn) {
      const nextEvent = ECONOMY_EVENTS.find(item => item.id === next.currentEventId);
      const economyLine = nextEvent ? `${nextEvent.title}：${nextEvent.detail}` : "";
      const actionLine = next.lastEvent === economyLine
        ? ""
        : personalizeNarrative(next.lastEvent);
      return {
        kind: "event",
        title: `第 ${next.turn} 回合 · ${nextEvent?.title || "现实又插手了"}`,
        detail: [nextEvent?.detail || "家庭饭桌继续。", actionLine]
          .filter(Boolean)
          .join(" "),
      };
    }
    return {
      kind: "action",
      title: action.type === "parent-action" ? "家长刚刚出牌" : action.type === "child-action" ? `${playerName}刚刚回应` : "相亲对象确定了",
      detail: personalizeNarrative(next.lastEvent),
    };
  }, [personalizeNarrative, playerName]);

  const commitAction = useCallback((action: MarriageGameAction) => {
    const next = gameReducer(state, action);
    if (next === state) return;
    setEventNotice(makeNotice(state, next, action));
    setState(next);
  }, [state, makeNotice]);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key.toLowerCase() === "f") fullscreen();
      if (keyboardEvent.key === "Escape" && help) setHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, help]);

  useEffect(() => {
    if (!help) return undefined;
    const before = document.activeElement;
    modalRef.current?.querySelector("button")?.focus();
    const trap = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Tab") return;
      const buttons = modalRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (keyboardEvent.shiftKey && document.activeElement === first) {
        keyboardEvent.preventDefault();
        last.focus();
      } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
        keyboardEvent.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (before instanceof HTMLElement) before.focus();
    };
  }, [help]);

  const start = () => {
    const typed = Number(seedInput);
    const seed = Number.isSafeInteger(typed) && typed > 0
      ? typed
      : crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    const next = gameReducer(createInitialState(), {
      type: "start",
      mode,
      difficulty,
      seed,
    });
    const cleanName = playerName.trim().slice(0, 8) || "小满";
    setPlayerName(cleanName);
    try {
      localStorage.setItem(PROFILE_KEY, cleanName);
    } catch {
      setStorageAvailable(false);
    }
    setState(next);
    const firstEvent = ECONOMY_EVENTS.find(item => item.id === next.currentEventId);
    setEventNotice(next.phase === "candidate"
      ? { kind: "match", title: "先替这局选一个相亲对象", detail: "当前版本一次只发展一段关系；换人后会重新建立关系进度。" }
      : {
          kind: "event",
          title: `第 1 回合 · ${firstEvent?.title || "年夜饭开局"}`,
          detail: `${firstEvent?.detail || "饭桌刚刚坐下。"} ${next.lastEvent.replaceAll("子女", "我")}`,
        });
    setSaved(null);
  };

  const restart = () => {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      setStorageAvailable(false);
    }
    setSaved(state);
    setState(createInitialState());
    setEventNotice(null);
  };

  const renderLobby = () => (
    <section className={styles.lobby}>
      <div className={styles.lobbyScene} aria-hidden>
        <div className={`${styles.lobbyPortrait} ${styles.lobbyPortraitLeft}`}>
          <CandidatePortrait id="shiori" />
        </div>
        <div className={`${styles.lobbyPortrait} ${styles.lobbyPortraitMain}`}>
          <CandidatePortrait id="sui" priority />
        </div>
        <div className={`${styles.lobbyPortrait} ${styles.lobbyPortraitRight}`}>
          <CandidatePortrait id="kloa" />
        </div>
        <div className={styles.redEnvelope}>相亲简历<br /><b>8</b> 份</div>
      </div>
      <div className={styles.lobbyCopy}>
        <span className={styles.eyebrow}>A FAMILY STRATEGY GAME</span>
        <h1>{GAME_TITLE}<small>这婚，你催吗？</small></h1>
        <p>至少十四个家庭回合。从相亲饭桌走到婚后多年；越晚结婚生育，越会追加时间检验这段生活。</p>
        <div className={styles.modePicker} aria-label="选择扮演身份">
          {(Object.keys(MODE_COPY) as GameMode[]).map(id => (
            <button
              key={id}
              data-testid={`mode-${id}`}
              className={mode === id ? styles.selectedChoice : ""}
              onClick={() => setMode(id)}
            >
              {id === "child" ? <UserOutlined /> : id === "parent" ? <HomeOutlined /> : <TeamOutlined />}
              <span><strong>{MODE_COPY[id].title}</strong><small>{MODE_COPY[id].subtitle}</small></span>
              {mode === id && <CheckOutlined />}
            </button>
          ))}
        </div>
        <label className={styles.nameField} htmlFor="marriage-player-name">
          <span>{mode === "child" ? "这局里，我叫" : mode === "parent" ? "孩子的昵称" : "当事人的昵称"}</span>
          <input
            id="marriage-player-name"
            data-testid="player-name"
            value={playerName}
            maxLength={8}
            placeholder="例如：小满"
            onChange={input => setPlayerName(input.target.value.slice(0, 8))}
          />
          <small>昵称会进入回合提示和结算文案，不会上传。</small>
        </label>
        <div className={styles.difficultyPicker} aria-label="选择压力档位">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map(id => (
            <button
              key={id}
              data-testid={`difficulty-${id}`}
              className={difficulty === id ? styles.selectedDifficulty : ""}
              onClick={() => setDifficulty(id)}
            >
              <strong>{DIFFICULTIES[id].title}</strong>
              <small>{DIFFICULTIES[id].description}</small>
            </button>
          ))}
        </div>
        <div className={styles.startRow}>
          <label htmlFor="marriage-seed">同局种子
            <input
              id="marriage-seed"
              value={seedInput}
              inputMode="numeric"
              maxLength={10}
              placeholder="随机饭桌"
              onChange={input => setSeedInput(input.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button className={styles.primaryButton} data-testid="start-game" disabled={!ready} onClick={start}>
            开始这局 <ArrowRightOutlined />
          </button>
        </div>
        {saved && (
          <button
            className={styles.resumeButton}
            data-testid="resume-game"
            onClick={() => {
              setState(saved);
              setSaved(null);
              setEventNotice({ kind: "event", title: `回到第 ${saved.turn} 回合`, detail: "存档已恢复。先看清刚才发生了什么，再继续出牌。" });
            }}
          >
            继续第 {saved.turn} 回合 · {MODE_COPY[saved.mode].title} <ArrowRightOutlined />
          </button>
        )}
        <p className={styles.disclaimer}>虚构策略游戏。人物资料与对话均为玩法改编，不代表立绘角色或主播本人的真实经历、学历、婚恋观与言行。</p>
      </div>
    </section>
  );

  const renderResources = () => (
    <section className={styles.resources} aria-label="家庭资源" data-parenthood={state.stage === "parenthood"}>
      <Meter label="压力" value={state.stress} tone="stress" />
      <Meter label="自主" value={state.autonomy} tone="autonomy" />
      <Meter label="亲情" value={state.familyBond} tone="family" />
      <Meter label="存款" value={state.savings} tone="money" />
      <Meter label="事业" value={state.career} tone="career" />
      <Meter label="关系" value={state.relation} tone="relation" />
      {state.stage === "parenthood" && <Meter label="下一代压力" value={state.nextGenStress} tone="nextgen" />}
    </section>
  );

  const renderEventNotice = () => eventNotice && (
    <section className={styles.eventNotice} data-kind={eventNotice.kind} role="status" aria-live="assertive" data-testid="event-notice">
      <span className={styles.eventNoticeIcon}>{eventNotice.kind === "match" ? <ReloadOutlined /> : eventNotice.kind === "ending" ? <SafetyCertificateOutlined /> : <WarningOutlined />}</span>
      <div>
        <small>刚刚发生</small>
        <strong>{eventNotice.title}</strong>
        <p>{eventNotice.detail}</p>
      </div>
      <button onClick={() => setEventNotice(null)} aria-label="收起事件提示" title="收起事件提示"><CloseOutlined /></button>
    </section>
  );

  const renderCandidateDraft = () => (
    <section className={styles.draftSection}>
      <div className={styles.draftHeading}>
        <span className={styles.eyebrow}>MATCHMAKING DESK / 相亲角</span>
        <h2>{state.selectionKind === "replace" ? "上一位已经翻篇。" : "家长先挑一份简历。"}</h2>
        <p>履历分让家长有面子，契合度和本人意愿才决定关系能不能走下去。</p>
      </div>
      <div className={styles.candidateGrid}>
        {state.candidateOptions.map((id, index) => {
          const option = getCandidate(id);
          if (!option) return null;
          return (
            <button
              key={id}
              className={styles.candidateCard}
              data-testid={`candidate-${id}`}
              onClick={() => commitAction({ type: "candidate", id })}
            >
              <span className={styles.cardNumber}>0{index + 1}</span>
              <span className={styles.candidatePortrait}><CandidatePortrait id={id} /></span>
              <span className={styles.candidateCardCopy}>
                <small>{option.subtitle}</small>
                <strong>{option.name}</strong>
                <span className={styles.candidateStats}>
                  <b>履历 {option.resume}</b>
                  <b>契合 {option.compatibility}</b>
                  <b>意愿 {option.initialIntent}</b>
                </span>
                <span className={styles.tagRow}>{option.tags.map(tag => <i key={tag}>{tag}</i>)}</span>
                <q>{option.boundary}</q>
                <span className={styles.pickLabel}>我选这位推荐给 {playerName} <ArrowRightOutlined /></span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderActions = () => {
    const actor = state.activeActor;
    const definitions = actor === "parent" ? PARENT_ACTIONS : CHILD_ACTIONS;
    const available = new Set(actor === "parent" ? parentActions : childActions);
    return (
      <section className={styles.actionSection} data-actor={actor}>
        <div className={styles.actionHeading}>
          <span>{actor === "parent" ? <HomeOutlined /> : <UserOutlined />}</span>
          <div>
            <small>{state.mode === "duel" ? "把设备交给下一位玩家" : "本回合决策"}</small>
            <h2>{state.mode === "duel"
              ? `轮到${actor === "parent" ? "家长玩家出牌" : `${playerName}回应`}`
              : `轮到我${actor === "parent" ? "出牌" : "回应"}`}</h2>
          </div>
          <b>{state.turn} / {state.maxTurns}</b>
        </div>
        <div className={styles.actionGrid}>
          {definitions.map(definition => {
            const enabled = available.has(definition.id as never);
            const preview = enabled
              ? getActionPreview(
                  state,
                  actor,
                  definition.id as ChildActionId | ParentActionId,
                )
              : "当前阶段不可用";
            return (
              <button
                key={definition.id}
                data-testid={`${actor}-action-${definition.id}`}
                disabled={!enabled}
                onClick={() => commitAction(actor === "parent"
                    ? { type: "parent-action", id: definition.id as ParentActionId }
                    : { type: "child-action", id: definition.id as ChildActionId })}
              >
                <span className={styles.actionIcon}>
                  {definition.id.includes("support") ? <DollarOutlined />
                    : definition.id.includes("listen") || definition.id.includes("boundary") ? <MessageOutlined />
                      : definition.id.includes("protect") ? <SafetyCertificateOutlined />
                        : definition.id.includes("education") ? <ThunderboltOutlined />
                      : definition.id.includes("baby") ? <HeartOutlined />
                        : definition.id.includes("work") ? <BankOutlined />
                          : definition.id.includes("next") ? <ReloadOutlined />
                            : definition.id.includes("compare") ? <ThunderboltOutlined />
                              : <ArrowRightOutlined />}
                </span>
                <span><strong>{definition.title}</strong><small>{definition.detail}</small><i>{preview || definition.hint}</i></span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderBoard = () => (
    <>
      {renderResources()}
      {renderEventNotice()}
      {state.phase === "candidate" ? renderCandidateDraft() : (
        <div className={styles.board}>
          <section className={styles.profilePanel}>
            {candidate ? (
              <>
                <div className={styles.profilePortrait}><CandidatePortrait id={candidate.id} priority /></div>
                <div className={styles.profileCopy}>
                  <span className={styles.eyebrow}>CURRENT MATCH / 当前对象</span>
                  <h2>{candidate.name}</h2>
                  <p>{candidate.subtitle}</p>
                  <div className={styles.profileStats}>
                    <span><small>履历分</small><b>{candidate.resume}</b></span>
                    <span><small>生活契合</small><b>{candidate.compatibility}</b></span>
                    <span><small>本人意愿</small><b>{state.mutualIntent}</b></span>
                  </div>
                  <q>{candidate.boundary}</q>
                  <div className={styles.tagRow}>{candidate.tags.map(tag => <i key={tag}>{tag}</i>)}</div>
                </div>
              </>
            ) : <p>等待家长选择下一位候选人。</p>}
          </section>

          <section className={styles.tablePanel}>
            <div className={styles.stageTrack}>
              {(["single", "chatting", "dating", "married", "parenthood"] as const).map((stage, index) => (
                <span key={stage} data-active={state.stage === stage} data-passed={index < ["single", "chatting", "dating", "married", "parenthood"].indexOf(state.stage)}>
                  <i>{index + 1}</i><small>{STAGE_LABELS[stage]}</small>
                </span>
              ))}
            </div>
            <article className={styles.eventCard}>
              <span><CalendarOutlined /> 本回合现实事件</span>
              <h3>{event?.title || "饭桌刚刚坐定"}</h3>
              <p>{event?.detail || state.lastEvent}</p>
              {event && (
                <div>
                  {event.savings !== 0 && <b>存款 {event.savings > 0 ? "+" : ""}{event.savings}</b>}
                  {event.career !== 0 && <b>事业 {event.career > 0 ? "+" : ""}{event.career}</b>}
                  {event.stress !== 0 && <b>压力 {event.stress > 0 ? "+" : ""}{event.stress}</b>}
                </div>
              )}
            </article>
            <div className={styles.lastEvent} data-testid="last-event">
              <span>{state.lastParentAction ? "家庭群正在输入…" : "饭桌回声"}</span>
              <p>{personalizeNarrative(state.lastEvent)}</p>
            </div>
            <div className={styles.pressureReadout} data-danger={state.pressure >= 70}>
              <span><WarningOutlined /> 家庭催促</span>
              <strong>{state.pressure}</strong>
              <i><b style={{ width: `${state.pressure}%` }} /></i>
              <small>{state.pressure >= 70 ? "再施压可能直接击穿关系" : "催促会让推进更快，也会侵蚀自主与亲情"}</small>
            </div>
          </section>

          <aside className={styles.logPanel}>
            <div className={styles.logHeading}><MessageOutlined /><span>家庭群记录</span><small>最新在上</small></div>
            <div className={styles.logList}>
              {[...state.log].reverse().map((line, index) => (
                <p key={`${line}-${index}`}><i>{state.log.length - index}</i><span>{personalizeNarrative(line)}</span></p>
              ))}
            </div>
            <div className={styles.familyFacts}>
              <span><small>家长面子</small><b>{state.parentFace}</b></span>
              <span><small>实际支持</small><b>{state.support}</b></span>
              <span><small>婚育债务</small><b>{state.weddingDebt}</b></span>
              <span><small>边界表达</small><b>{state.boundaries}</b></span>
              {state.stage === "parenthood" && <span><small>下一代压力</small><b>{state.nextGenStress}</b></span>}
            </div>
          </aside>
        </div>
      )}
      {state.phase === "turn" && renderActions()}
    </>
  );

  const renderEnding = () => ending && (
    <section className={styles.ending} style={{ "--ending": ending.color } as React.CSSProperties}>
      <div className={styles.endingCopy}>
        <span className={styles.eyebrow}>FAMILY REPORT / 家庭结算</span>
        <p>{ending.kicker}</p>
        <h1>{ending.id === "depressed"
          ? state.mode === "parent" ? "孙辈玉玉了" : `我的孩子玉玉了`
          : ending.id === "burnout" && state.mode !== "child" ? `${playerName}先撑不住了` : ending.title}</h1>
        <blockquote>{ending.description}</blockquote>
        <div className={styles.scoreRow}>
          <span><small>{state.mode === "child" ? "我的分数" : `${playerName}的分数`}</small><b>{state.scores.child}</b></span>
          <span><small>家长分</small><b>{state.scores.parent}</b></span>
          <span><small>家庭分</small><b>{state.scores.family}</b></span>
        </div>
        <div className={styles.resultActions}>
          <button className={styles.primaryButton} data-testid="play-again" onClick={start}><ReloadOutlined /> 同身份再来一局</button>
          <button className={styles.secondaryButton} data-testid="back-lobby" onClick={restart}>换身份 / 难度</button>
        </div>
      </div>
      <div className={styles.endingLedger}>
        <span className={styles.ledgerTitle}><SafetyCertificateOutlined /> 最终账本</span>
        <dl>
          <div><dt>人生阶段</dt><dd>{STAGE_LABELS[state.stage]}</dd></div>
          <div><dt>压力 / 自主</dt><dd>{state.stress} / {state.autonomy}</dd></div>
          <div><dt>存款 / 债务</dt><dd>{state.savings} / {state.weddingDebt}</dd></div>
          <div><dt>真实支持</dt><dd>{state.support}</dd></div>
          <div><dt>下一代压力</dt><dd>{state.nextGenStress}</dd></div>
          <div><dt>强压行动</dt><dd>{state.coerciveMoves}</dd></div>
          <div><dt>倾听支持</dt><dd>{state.supportiveMoves}</dd></div>
        </dl>
        <details>
          <summary>展开本局家庭记录</summary>
          {[...state.log].reverse().map((line, index) => <p key={`${line}-${index}`}>{personalizeNarrative(line)}</p>)}
        </details>
      </div>
    </section>
  );

  return (
    <main ref={rootRef} className={styles.game} data-phase={state.phase}>
      <header className={styles.topbar}>
        <Link href="/demos#games" aria-label="返回小游戏列表" title="返回小游戏列表"><ArrowLeftOutlined /></Link>
        <div><strong>{GAME_TITLE}</strong><small>这婚，你催吗？</small></div>
        <nav>
          {state.phase !== "lobby" && <span>{state.mode === "child" ? `我 · ${playerName}` : MODE_COPY[state.mode].title} · {DIFFICULTIES[state.difficulty].title}</span>}
          <button onClick={() => setHelp(true)} title="玩法说明" aria-label="玩法说明"><QuestionCircleOutlined /></button>
          <button onClick={fullscreen} title="全屏" aria-label="全屏"><FullscreenOutlined /></button>
        </nav>
      </header>
      {state.phase === "lobby" && renderLobby()}
      {state.phase !== "lobby" && state.phase !== "ended" && renderBoard()}
      {state.phase === "ended" && renderEnding()}
      {!storageAvailable && <p className={styles.storageNotice}>当前浏览器无法保存进度，本局仍可正常游玩。</p>}
      {help && (
        <div className={styles.overlay}>
          <section ref={modalRef} className={styles.helpModal} role="dialog" aria-modal="true" aria-label="玩法说明">
            <span className={styles.eyebrow}>HOW TO PLAY</span>
            <h2>不是谁先结婚谁就赢。</h2>
            <ol>
              <li><b>先读三条线。</b>履历让家长满意，契合决定相处收益，本人意愿低时逼着主动只会加压。</li>
              <li><b>每回合一张牌。</b>我会直接以当前身份做决定；行动文案和事件提示都会告诉我刚刚发生了什么。</li>
              <li><b>现实事件会插手。</b>房租、裁员、加班和照护成本每回合结算，存款与事业不是装饰数字。</li>
              <li><b>双人模式轮流操作。</b>家长先出牌，当事人再回应。双方都有分数，但家庭分低时谁的个人高分都很难看。</li>
              <li><b>育儿不是终点。</b>随意生育后继续鸡娃会累积“下一代压力”；到达 100 时，我的孩子会在高压教育中先撑不住。</li>
              <li><b>当前是单对象规则。</b>一次只发展一段关系；养鱼与多人关系会作为后续可选扩展，不会在这一版里悄悄发生。</li>
              <li><b>压力 100、亲情归零或现金流断裂会提前结算。</b>幸福结局要求关系、意愿、支持与经济同时过关。</li>
            </ol>
            <p>内容包含家庭冲突、心理压力和经济困境。若这些主题让你不适，可随时退出。F 切换全屏，Esc 关闭说明。</p>
            <button className={styles.primaryButton} onClick={() => setHelp(false)}>明白了 <ArrowRightOutlined /></button>
          </section>
        </div>
      )}
      <footer className={styles.footer}>
        <span>虚构家庭策略游戏 · 角色设定不代表真人经历与立场</span>
        <span><FireOutlined /> 压力不是推进条，支持也不是一句“为你好”</span>
      </footer>
    </main>
  );
}
