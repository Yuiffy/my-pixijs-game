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
  getAgeAtTurn,
  getCandidate,
  getEnding,
  getEndingReason,
  resolveGameAction,
  validateSave,
} from "./engine";
import type {
  ChildActionId,
  Difficulty,
  GameMode,
  MarriageGameState,
  MarriageGameAction,
  ParentActionId,
  ResolutionChange,
  ResolutionStep,
} from "./types";
import { getCandidateProfile, getHouseholdBudget, getLifeWarnings, getPartnerProfile, isHousehold } from "./household";
import { getProgressionGuide } from "./progression";
import styles from "./marriage.module.css";

const SAVE_KEY = "marriage-pressure-save-v1";
const PROFILE_KEY = "marriage-pressure-player-name";
const SHARE_URL = "my-pixijs-game.vercel.app/game/family-pressure";
const LOWER_IS_BETTER_METRICS = new Set<ResolutionChange["key"]>([
  "stress",
  "pressure",
  "weddingDebt",
  "nextGenStress",
]);
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

interface ResolutionSequence {
  steps: ResolutionStep[];
  index: number;
}

type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

function Meter({
  label,
  value,
  tone,
  description,
}: {
  label: string;
  description?: string;
  value: number;
  tone: "stress" | "autonomy" | "family" | "money" | "career" | "relation" | "nextgen";
}) {
  const shown = Math.max(0, Math.min(100, value));
  return (
    <div className={styles.meter} title={description} aria-label={`${label} ${value}${description ? `，${description}` : ""}`} data-tone={tone} data-testid={`meter-${tone}`}>
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

function getEconomySummary(state: MarriageGameState) {
  const net = state.savings - state.weddingDebt;
  if (net >= 68 && state.career >= 68) return { title: "宽裕上升", detail: `净余量 ${net} · 事业 ${state.career}` };
  if (net >= 28) return { title: "基本稳住", detail: `净余量 ${net} · 事业 ${state.career}` };
  if (net >= 0) return { title: "收支紧绷", detail: `存款 ${state.savings} · 债务 ${state.weddingDebt}` };
  return { title: "债务压顶", detail: `存款 ${state.savings} · 债务 ${state.weddingDebt}` };
}

function getRelationshipSummary(state: MarriageGameState) {
  if (state.ending === "runaway") return "已经离婚";
  if (state.matchClosed) return "没有继续交往";
  if (state.relation >= 76 && state.mutualIntent >= 66) return "仍然相爱";
  if (state.relation >= 52 && state.mutualIntent >= 45) return "还在磨合";
  if (state.stage === "single") return "已经翻篇";
  return "关系破裂";
}

function getChangeTone(change: ResolutionChange) {
  if (change.key === "parentFace") return "neutral";
  const improved = LOWER_IS_BETTER_METRICS.has(change.key) ? change.delta < 0 : change.delta > 0;
  return improved ? "better" : "worse";
}

export default function MarriagePressureGame() {
  const [state, setState] = useState<MarriageGameState>(createInitialState);
  const [saved, setSaved] = useState<MarriageGameState | null>(null);
  const [mode, setMode] = useState<GameMode>("child");
  const [difficulty, setDifficulty] = useState<Difficulty>("realistic");
  const [seedInput, setSeedInput] = useState("");
  const [playerName, setPlayerName] = useState("小满");
  const [eventNotice, setEventNotice] = useState<EventNotice | null>(null);
  const [resolution, setResolution] = useState<ResolutionSequence | null>(null);
  const [actionTab, setActionTab] = useState("connection");
  const [pendingMeeting, setPendingMeeting] = useState<ChildActionId | null>(null);
  const [pendingDecision, setPendingDecision] = useState<ChildActionId | null>(null);
  const [inspector, setInspector] = useState<"profile" | "household" | "history" | "progression" | null>(null);
  const [showActionNumbers, setShowActionNumbers] = useState(false);
  const [help, setHelp] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const rootRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const resolutionModalRef = useRef<HTMLElement>(null);
  const candidate = getCandidate(state.candidateId);
  const guide = getProgressionGuide(state);
  const budget = getHouseholdBudget(state);
  const partnerProfile = getPartnerProfile(state);
  const lifeWarnings = getLifeWarnings(state);
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
      progression: getProgressionGuide(state),
      householdBudget: getHouseholdBudget(state),
      partnerProfile: getPartnerProfile(state),
      warnings: getLifeWarnings(state),
      pendingDecision,
      pendingMeeting,
      inspector,
      availableActions:
        state.activeActor === "parent" ? parentActions : childActions,
      playerName,
      eventNotice,
      resolution: resolution
        ? {
            index: resolution.index,
            total: resolution.steps.length,
            current: resolution.steps[resolution.index],
          }
        : null,
      help,
      coordinateSystem: "DOM board; origin top-left; x right, y down",
    });
    target.advanceTime = () => undefined;
    return () => {
      delete target.render_game_to_text;
      delete target.advanceTime;
    };
  }, [state, candidate, event, parentActions, childActions, playerName, eventNotice, resolution, help, pendingDecision, pendingMeeting, inspector]);

  const personalizeNarrative = useCallback((line: string) => {
    if (state.mode === "child") return line.replaceAll("子女", "我");
    if (state.mode === "parent") return line.replaceAll("子女", playerName).replace(/^家长/, "我");
    return line.replaceAll("子女", playerName).replace(/^家长/, "家长玩家");
  }, [state.mode, playerName]);

  const personalizeResolution = useCallback((line: string) => {
    const subject = state.mode === "child" ? "我" : playerName;
    return personalizeNarrative(line).replaceAll("当事人", subject);
  }, [personalizeNarrative, playerName, state.mode]);

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
    const result = resolveGameAction(state, action);
    const next = result.state;
    if (next === state) return;
    setEventNotice(makeNotice(state, next, action));
    setResolution(result.steps.length ? { steps: result.steps, index: 0 } : null);
    setState(next);
    if (next.matchClosed && !state.matchClosed) setActionTab("decision");
    else if (isHousehold(next) && !isHousehold(state)) setActionTab("connection");
    else if (next.stress >= 85) setActionTab("life");
  }, [state, makeNotice]);

  const advanceResolution = useCallback(() => {
    setResolution(current => {
      if (!current || current.index >= current.steps.length - 1) return null;
      return { ...current, index: current.index + 1 };
    });
  }, []);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (keyboardEvent: KeyboardEvent) => {
      if (!(keyboardEvent.target instanceof HTMLInputElement) && keyboardEvent.key.toLowerCase() === "f") fullscreen();
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

  useEffect(() => {
    if (!resolution && !pendingDecision && !pendingMeeting && !inspector) return undefined;
    const dialog = rootRef.current?.querySelector<HTMLElement>('[data-testid="resolution-dialog"], [data-testid="decision-dialog"], [data-testid="meeting-dialog"], [data-testid="inspector-dialog"]');
    const previous = document.activeElement;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") { setPendingDecision(null); setPendingMeeting(null); setInspector(null); }
      if (keyboardEvent.key !== "Tab") return;
      const buttons = dialog?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (keyboardEvent.shiftKey && document.activeElement === first) { keyboardEvent.preventDefault(); last.focus(); } else if (!keyboardEvent.shiftKey && document.activeElement === last) { keyboardEvent.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [resolution, pendingDecision, pendingMeeting, inspector]);

  useEffect(() => {
    const grid = rootRef.current?.querySelector<HTMLElement>("[data-action-grid]");
    if (grid) grid.scrollTop = 0;
  }, [actionTab, state.turn, state.stage, state.candidateId]);

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
    setResolution(null);
    setPendingDecision(null);
    setActionTab("connection");
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
    setResolution(null);
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
        <div className={styles.redEnvelope}>相亲简历<br /><b>{CANDIDATES.length}</b> 份</div>
      </div>
      <div className={styles.lobbyCopy}>
        <span className={styles.eyebrow}>V4.1 · 相亲与共同生活</span>
        <h1>{GAME_TITLE}<small>这婚，你催吗？</small></h1>
        <p>从微信破冰，到见面、恋爱和共同生活。24 个季度里，找到愿意互相靠近的人，也学会在不合适时说再见。</p>
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
              setMode(saved.mode);
              setDifficulty(saved.difficulty);
              setSeedInput(String(saved.seed));
              setSaved(null);
              setResolution(null);
              setEventNotice({ kind: "event", title: `回到第 ${saved.turn} 回合`, detail: "存档已恢复。先看清刚才发生了什么，再继续出牌。" });
            }}
          >
            继续第 {saved.turn} 回合 · {MODE_COPY[saved.mode].title} <ArrowRightOutlined />
          </button>
        )}
        <details className={styles.castList} data-testid="candidate-catalog">
          <summary>看看相亲名册 · {CANDIDATES.length} 位</summary>
          <p>自走棋人物全员与两位客串已加入，同一人的不同形态合并。人物生活观固定，每次相遇的缘分不同。</p>
          <div>{CANDIDATES.map(item => <span key={item.id}>{item.name}</span>)}</div>
        </details>
        <p className={styles.disclaimer}>虚构策略游戏。人物资料与对话均为玩法改编，不代表立绘角色或主播本人的真实经历、学历、婚恋观与言行。</p>
      </div>
    </section>
  );

  const renderResources = () => (
    <section className={styles.primaryResources} aria-label="当前状态">
      <Meter label="压力" value={state.stress} tone="stress" />
      <Meter label="存款" value={state.savings} tone="money" />
      <Meter label="伴侣感情" value={state.relation} tone="relation" />
      <button data-testid="open-household" onClick={() => setInspector("household")}>家庭与账本 <ArrowRightOutlined /></button>
    </section>
  );

  const renderResolutionDialog = () => {
    if (!resolution) return null;
    const step = resolution.steps[resolution.index];
    const isLast = resolution.index === resolution.steps.length - 1;
    const kindLabel = {
      choice: "我的行动",
      reality: "现实事件",
      family: "家长回应",
      response: "当事人回应",
      match: "对象变化",
      household: "共同生活",
    }[step.kind];
    return (
      <div className={styles.resolutionOverlay}>
        <section
          ref={resolutionModalRef}
          className={styles.resolutionModal}
          data-kind={step.kind}
          data-testid="resolution-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="本回合数值结算"
        >
          <header>
            <span>{kindLabel}</span>
            <b>{resolution.index + 1} / {resolution.steps.length}</b>
          </header>
          <div className={styles.resolutionLead}>
            <span>{step.kind === "reality" ? <ThunderboltOutlined /> : step.kind === "family" ? <MessageOutlined /> : step.kind === "match" ? <ReloadOutlined /> : <UserOutlined />}</span>
            <div>
              <small>这一步单独结算</small>
              <h2>{personalizeResolution(step.title)}</h2>
            </div>
          </div>
          <p>{personalizeResolution(step.detail)}</p>
          {step.changes.length ? (
            <div className={styles.resolutionChanges}>
              {step.changes.map(change => (
                <span key={change.key} data-tone={getChangeTone(change)} data-testid={`resolution-change-${change.key}`}>
                  <small>{change.label}</small>
                  <strong>{change.before} → {change.after}</strong>
                  <i>{change.delta > 0 ? "+" : ""}{change.delta}</i>
                </span>
              ))}
            </div>
          ) : <p className={styles.noResolutionChange}>这一步没有直接改数字，但改变了关系阶段或接下来轮到谁。</p>}
          <div className={styles.resolutionFooter}>
            <small>这里只显示当前这一步的影响，不把后续事件混在一起。</small>
            <button className={styles.primaryButton} data-testid="resolution-next" onClick={advanceResolution}>
              {isLast ? "知道了，继续" : "继续看下一项"} <ArrowRightOutlined />
            </button>
          </div>
        </section>
      </div>
    );
  };

  const renderCandidateDraft = () => (
    <section className={styles.draftSection}>
      <div className={styles.draftHeading}>
        <span className={styles.eyebrow}>MATCHMAKING DESK / 相亲角</span>
        <h2>{state.selectionKind === "replace" ? "上一位已经翻篇。" : "家长先挑一份简历。"}</h2>
        <p>先认识对方，再看双方是否愿意继续。有人被催着来，也有人见过几次才发现没感觉。</p>
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
                <q>{option.boundary}</q><span className={styles.candidateWish}>{getCandidateProfile(state.seed, option.id).title}</span>
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
    const definitions = (actor === "parent" ? PARENT_ACTIONS : CHILD_ACTIONS).filter(item => item.id !== "invest" && item.id !== "meet-aa");
    const available = new Set(actor === "parent" ? parentActions : childActions);
    const groupFor = (id: string) => {
      if (["chat-listen", "chat-share", "chat-checklist", "meet", "meet-aa", "invest", "build-home", "protect-child"].includes(id)) return "connection";
      if (["work", "rest", "budget", "ask-help", "boundary", "support", "listen"].includes(id)) return "life";
      return "decision";
    };
    const tabs = [{ id: "connection", title: isHousehold(state) ? "一起生活" : "聊天与见面" }, { id: "life", title: "生活与边界" }, { id: "decision", title: "关系决定" }];
    const shownTab = definitions.some(item => available.has(item.id as never) && groupFor(item.id) === actionTab)
      ? actionTab : tabs.find(tab => definitions.some(item => available.has(item.id as never) && groupFor(item.id) === tab.id))?.id;
    return (
      <section className={styles.actionSection} data-actor={actor} data-testid="turn-actions">
        <div className={styles.actionHeading}>
          <span>{actor === "parent" ? <HomeOutlined /> : <UserOutlined />}</span>
          <div>
            <small>{state.mode === "duel" ? "把设备交给下一位玩家" : "本回合决策"}</small>
            <h2>{state.mode === "duel"
              ? `轮到${actor === "parent" ? "家长玩家出牌" : `${playerName}回应`}`
              : `轮到我${actor === "parent" ? "出牌" : "回应"}`}</h2>
          </div>
          <b>{state.turn} / {state.maxTurns} <small>{state.monthsPerTurn === 3 ? "季" : "年"}</small></b>
        </div>
        <nav className={styles.actionTabs} aria-label="行动分类">
          {tabs.map(tab => (
            <button key={tab.id} data-testid={`actions-${tab.id}`} aria-pressed={shownTab === tab.id} onClick={() => setActionTab(tab.id)}>
              {tab.title} <small>{definitions.filter(item => available.has(item.id as never) && groupFor(item.id) === tab.id).length}</small>
            </button>
          ))}
        </nav>
        <div className={styles.progressionGuide} data-testid="progression-guide">
          <div><strong>下一步 · {guide.title}</strong><button data-testid="open-progression" onClick={() => setInspector("progression")}>查看条件</button></div>
          <p>{guide.advice} {actor === "child" && guide.unlocked && shownTab !== "decision" && <button data-testid="show-marriage-options" onClick={() => setActionTab("decision")}>去看结婚选择 <ArrowRightOutlined /></button>}</p>
        </div>
        <div className={styles.actionTools}><span>每回合选一项</span><button data-testid="toggle-action-numbers" aria-pressed={showActionNumbers} onClick={() => setShowActionNumbers(!showActionNumbers)}>{showActionNumbers ? "收起数值预览" : "查看数值影响"}</button></div>
        <div className={styles.actionGrid} data-action-grid>
          {definitions.filter(item => available.has(item.id as never) && groupFor(item.id) === shownTab).map(definition => {
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
                data-suggested={actor === "child" && definition.id === guide.suggested}
                disabled={!enabled}
                onClick={() => {
                  if (actor === "child" && ["meet", "meet-aa", "invest"].includes(definition.id)) setPendingMeeting("meet-aa");
                  else if (actor === "child" && ["marry", "simple-wedding", "baby", "separate"].includes(definition.id)) setPendingDecision(definition.id as ChildActionId);
                  else commitAction(actor === "parent"
                    ? { type: "parent-action", id: definition.id as ParentActionId }
                    : { type: "child-action", id: definition.id as ChildActionId });
                }}
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
                <span><strong>{definition.id === "meet" ? state.meetings > 0 ? "再约一次见面" : "约一次见面" : definition.title}</strong><small>{definition.id === "meet" ? "先选请客或 AA，再聊聊彼此的生活。" : definition.detail}</small>{showActionNumbers && <i>{preview || definition.hint}</i>}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderInspector = () => inspector && (
    <div className={styles.overlay}>
      <section className={`${styles.helpModal} ${styles.inspector}`} role="dialog" aria-modal="true" aria-label="人物与家庭详情" data-testid="inspector-dialog">
        <header><h2>人物与家庭</h2><button aria-label="关闭详情" data-testid="close-inspector" onClick={() => setInspector(null)}><CloseOutlined /></button></header>
        <nav className={styles.inspectorTabs} aria-label="详情分类">
          {([{ id: "profile", title: "人物" }, { id: "household", title: "家庭账本" }, { id: "history", title: "记录" }, { id: "progression", title: "下一步" }] as const).map(tab => <button key={tab.id} aria-pressed={inspector === tab.id} onClick={() => setInspector(tab.id)}>{tab.title}</button>)}
        </nav>
        {inspector === "progression" && (
<div data-testid="progression-details">
          <h3>{guide.title}</h3><p>{guide.explanation}</p>
          <ul className={styles.requirements}>{guide.requirements.map(item => <li key={item.label} data-met={item.met}><span>{item.met ? "✓" : "○"} {item.label}</span><strong>{item.value} / {item.target}</strong><small>{item.met ? "已满足" : `还差 ${item.remaining}`}</small></li>)}</ul>
          <p>{guide.preparationNote}</p>
          {guide.preparation.length > 0 && <><h3>{state.stage === "dating" ? "婚礼准备" : "育儿准备"}</h3><ul className={styles.requirements}>{guide.preparation.map(item => <li key={item.label} data-met={item.met}><span>{item.met ? "✓" : "○"} {item.label}</span><strong>{item.value} / {item.lower ? "≤" : "≥"}{item.target}</strong><small>{item.met ? "已准备好" : item.lower ? `需降低 ${item.remaining}` : `还差 ${item.remaining}`}</small></li>)}</ul></>}
          {state.activeActor === "parent" && <p>家长可以倾听、支持、减少催促，交往和婚育仍需当事人与对象作决定。</p>}
        </div>
)}
        {inspector === "profile" && candidate && (
<div data-testid="partner-profile">
          <h3>{candidate.name} · {candidate.subtitle}</h3>
          <blockquote>{candidate.boundary}</blockquote>
          <h3>{partnerProfile.title}</h3><p>{partnerProfile.wish}</p>
          <p>人物生活观采用固定游戏设定；双向好感仍随这次相处变化。</p>
          <dl><div><dt>本人意愿</dt><dd>{state.mutualIntent}</dd></div><div><dt>相互了解</dt><dd>{state.understanding}</dd></div><div><dt>生活契合</dt><dd>{candidate.compatibility}</dd></div><div><dt>履历分</dt><dd>{candidate.resume}</dd></div></dl>
        </div>
)}
        {inspector === "household" && (
<div>
          <div className={styles.secondaryResources}><Meter label="与父母的亲情" value={state.familyBond} tone="family" /><Meter label="自主" value={state.autonomy} tone="autonomy" /><Meter label="事业" value={state.career} tone="career" /></div>
          <div className={styles.budgetPanel} data-testid="household-budget"><h3>每回合生活账本 · {budget.net >= 0 ? "+" : ""}{budget.net}</h3><p>工作结余 +{budget.income} · 伴侣投入 +{budget.partnerIncome}<br />基本生活 −{budget.essentials} · 弹性消费 −{budget.extras} · 还款 −{budget.repayment}</p><small>游戏预算点，事件和行动另外结算。</small></div>
          <dl>{[["家庭催促", state.pressure], ["家里可支援", state.familyReserve], ["累计支援", state.support], ["婚育债务", state.weddingDebt], ["家长面子", state.parentFace], ["边界表达", state.boundaries], ...(state.stage === "parenthood" ? [["下一代压力", state.nextGenStress]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {lifeWarnings.map(warning => <p key={warning}>{warning}</p>)}
        </div>
)}
        {inspector === "history" && (
<div className={styles.historyDetails}>
          {eventNotice && <div data-testid="event-notice"><h3>{eventNotice.title}</h3><p>{eventNotice.detail}</p></div>}
          {event && <p><CalendarOutlined /> {event.title}：{event.detail}</p>}
          {[...state.log].reverse().map((line, index) => <p key={`${index}-${line}`}>{personalizeNarrative(line)}</p>)}
        </div>
)}
      </section>
    </div>
  );

  const renderBoard = () => (
    <>
      {renderResources()}
      {state.phase === "candidate" ? renderCandidateDraft() : (
        <div className={styles.decisionLayout}>
          <aside className={styles.characterScene}>
            <div className={styles.characterPortrait}>{candidate && <CandidatePortrait id={candidate.id} priority />}</div>
            <div className={styles.characterCaption}><small>正在了解的人</small><h2>{candidate?.name}</h2><p>{partnerProfile.title}</p><button data-testid="open-profile" onClick={() => setInspector("profile")}>人物与生活偏好 <ArrowRightOutlined /></button></div>
          </aside>
          <div className={styles.decisionMain}>
            <section className={styles.turnContext} data-testid="relationship-feedback">
              <div><small>{STAGE_LABELS[state.stage]} · {isHousehold(state) ? "共同生活" : `已见面 ${state.meetings} 次`}</small><button data-testid="open-history" onClick={() => setInspector("history")}>本季动态 <ArrowRightOutlined /></button></div>
              <p>{isHousehold(state) ? state.partnerNote : state.datingFeedback}</p>
              {(lifeWarnings.length > 0 || state.familyBond <= 25 || state.nextGenStress >= 70) && <button className={styles.compactWarning} data-testid="life-warning" onClick={() => { setActionTab("life"); setInspector("household"); }}><WarningOutlined /> {state.familyBond <= 25 ? "与父母的关系紧张" : state.nextGenStress >= 70 ? "孩子的压力需要关注" : state.stress >= 85 || state.burnoutTurns > 0 ? "先让自己喘口气" : state.conflictTurns > 0 ? "伴侣正在疏远" : "生活预算需要调整"} · 看看详情</button>}
            </section>
            {renderActions()}
          </div>
        </div>
      )}
      {renderInspector()}
    </>
  );

  const renderEnding = () => {
    if (!ending) return null;
    const endingTitle = ending.id === "depressed"
      ? state.mode === "parent" ? "孙辈需要被接住" : "孩子需要被接住"
      : ending.id === "burnout" && state.mode !== "child" ? `${playerName}先撑不住了` : ending.title;
    const endingAge = getAgeAtTurn(state);
    const marriedAge = state.marriedAtTurn === null
      ? null
      : getAgeAtTurn(state, state.marriedAtTurn);
    const parenthoodAge = state.parenthoodAtTurn === null
      ? null
      : getAgeAtTurn(state, state.parenthoodAtTurn);
    const childSummary = state.stage === "parenthood"
      ? { title: "已经生子", detail: parenthoodAge ? `${parenthoodAge} 岁进入育儿` : "旧档未记录年龄" }
      : state.childPlan === "childfree"
        ? { title: "决定不生", detail: "已明确不生的立场" }
        : { title: "没有孩子", detail: state.stage === "married" ? "生育仍未达成共识" : "尚未进入婚育" };
    const economy = getEconomySummary(state);
    const relationship = getRelationshipSummary(state);

    return (
      <section className={styles.ending} style={{ "--ending": ending.color } as React.CSSProperties}>
        <div className={styles.endingPoster} data-testid="ending-poster">
          <div className={styles.endingPortrait}>
            {candidate ? <CandidatePortrait id={candidate.id} priority /> : <span className={styles.noPartner}>这一局没有留下对象</span>}
            <div className={styles.endingPartner}>
              <small>这段人生的对象</small>
              <strong>{candidate?.name ?? "没有对象"}</strong>
              <span>{candidate?.subtitle ?? "选择权回到自己手里"}</span>
            </div>
          </div>
          <div className={styles.endingCopy}>
            <div className={styles.endingBrand}>
              <span>{GAME_TITLE} · 这婚，你催吗？</span>
              <b>{SHARE_URL}</b>
            </div>
            <span className={styles.eyebrow}>FAMILY REPORT / {playerName} 的阶段记录</span>
            <p>{ending.kicker}</p>
            <h1>{endingTitle}</h1>
            <blockquote>{ending.description}</blockquote>
            <p className={styles.endingReason} data-testid="ending-reason">{getEndingReason(state)}</p>
            <div className={styles.endingFacts}>
              <span><small>对象</small><strong>{candidate?.name ?? "没有对象"}</strong><i>{relationship} · 伴侣感情 {state.relation}</i></span>
              <span><small>结婚年龄</small><strong>{marriedAge ? `${marriedAge} 岁` : state.stage === "married" || state.stage === "parenthood" ? "旧档未记录" : "没有结婚"}</strong><i>{ending.id === "runaway" ? "曾经结婚 · 现已离婚" : STAGE_LABELS[state.stage]}</i></span>
              <span><small>走到结局</small><strong>{endingAge} 岁</strong><i>经历 {state.turn} 个家庭回合</i></span>
              <span><small>生育选择</small><strong>{childSummary.title}</strong><i>{childSummary.detail}</i></span>
              <span><small>家庭经济</small><strong>{economy.title}</strong><i>{economy.detail}</i></span>
              <span><small>与父母的关系</small><strong>{state.familyBond >= 68 ? "彼此支持" : state.familyBond >= 38 ? "勉强维系" : "已经决裂"}</strong><i>亲情 {state.familyBond} · 支持 {state.support}</i></span>
            </div>
            <div className={styles.scoreRow}>
              <span><small>{state.mode === "child" ? "我的分数" : `${playerName}的分数`}</small><b>{state.scores.child}</b></span>
              <span><small>家长期待分</small><b>{state.scores.parent}</b></span>
              <span><small>家庭生活分</small><b>{state.scores.family}</b></span>
            </div>
          </div>
        </div>
        <div className={styles.endingDetails}>
          <div className={styles.resultPanel}>
            <span className={styles.eyebrow}>这一段故事，暂时落笔</span>
            <h2>{endingTitle}</h2>
            <p>{playerName} 从 {state.startAge} 岁走到 {endingAge} 岁。下一局，换一种回应，也许会走向完全不同的家。</p>
            <div className={styles.resultActions}>
              <button className={styles.primaryButton} data-testid="play-again" onClick={start}><ReloadOutlined /> 同身份再来一局</button>
              <button className={styles.secondaryButton} data-testid="back-lobby" onClick={restart}>换身份 / 难度</button>
            </div>
          </div>
          <div className={styles.endingLedger}>
            <span className={styles.ledgerTitle}><SafetyCertificateOutlined /> 最终账本</span>
            <dl>
              <div><dt>压力 / 自主</dt><dd>{state.stress} / {state.autonomy}</dd></div>
              <div><dt>存款 / 债务</dt><dd>{state.savings} / {state.weddingDebt}</dd></div>
              <div><dt>下一代压力</dt><dd>{state.nextGenStress}</dd></div>
              <div><dt>强压 / 倾听</dt><dd>{state.coerciveMoves} / {state.supportiveMoves}</dd></div>
            </dl>
            <details>
              <summary>展开本局家庭记录</summary>
              {[...state.log].reverse().map((line, index) => <p key={`${line}-${index}`}>{personalizeNarrative(line)}</p>)}
            </details>
          </div>
        </div>
      </section>
    );
  };

  return (
    <main ref={rootRef} className={styles.game} data-phase={state.phase}>
      <header className={styles.topbar}>
        <Link href="/demos#games" aria-label="返回小游戏列表" title="返回小游戏列表"><ArrowLeftOutlined /></Link>
        <div><strong>{GAME_TITLE}</strong><small>V4.1 · 相亲与共同生活</small></div>
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
              <li><b>先认识，再决定。</b>微信倾听、分享日常或直接问条件；见面可请客或提前说好 AA，花钱不会额外买到好感。见过几次仍没感觉，就换下一个。</li>
              <li><b>每回合选一项。</b>新局一回合是一季，24 回合后记录阶段结果；晚婚和首次困境会留出后续时间。相互了解、伴侣感情、对方意愿各不相同。</li>
              <li><b>现实事件会插手。</b>房租、裁员、加班和照护成本每回合结算，存款与事业不是装饰数字。</li>
              <li><b>双人模式轮流操作。</b>家长先出牌，当事人再回应。双方都有分数，但家庭分低时谁的个人高分都很难看。</li>
              <li><b>育儿不是终点。</b>随意生育后继续鸡娃会累积“下一代压力”；到达 100 时，我的孩子会在高压教育中先撑不住。</li>
              <li><b>两种关系分开看。</b>“与父母的亲情”是原生家庭关系，“伴侣感情”是当前对象的相处质量。家里支援总额有限，伴侣婚后也承担生活开支。</li>
              <li><b>困难先给补救窗口。</b>连续 2 回合压力 ≥95 才会暂停生活；连续 3 回合收支缺口且债务 ≥45 才会长期困顿。婚后感情与意愿均低于 35 连续 3 回合才会自动离婚，也可主动分开。</li>
            </ol>
            <p>内容包含家庭冲突、心理压力和经济困境。若这些主题让你不适，可随时退出。F 切换全屏，Esc 关闭说明。</p>
            <button className={styles.primaryButton} onClick={() => setHelp(false)}>明白了 <ArrowRightOutlined /></button>
          </section>
        </div>
      )}
      {pendingMeeting && (
        <div className={styles.overlay}>
          <section className={styles.helpModal} role="dialog" aria-modal="true" aria-label="见面聊什么" data-testid="meeting-dialog">
            <span className={styles.eyebrow}>{candidate?.name} · 第 {state.meetings + 1} 次见面 · {pendingMeeting === "meet-aa" ? "提前说好 AA" : "这次我请客"}</span>
            <h2>这次见面，怎么安排？</h2>
            <div className={styles.paymentChoices} aria-label="选择付款方式">
              <button data-testid="payment-aa" aria-pressed={pendingMeeting === "meet-aa"} onClick={() => setPendingMeeting("meet-aa")}>提前说好 AA · {Math.ceil((candidate?.cityCost || 0) / 2)}</button>
              <button data-testid="payment-treat" aria-pressed={pendingMeeting === "meet"} onClick={() => setPendingMeeting("meet")}>这次我请 · {candidate?.cityCost}</button>
            </div>
            <div className={styles.meetingOptions}>
              {([
                { id: "everyday", title: "互相分享平时的生活", detail: "说说兴趣、工作和周末安排，看看聊不聊得来。" },
                { id: "listen", title: "先听对方说最近怎么样", detail: "了解更多，气氛更轻松；也要给对方认识你的机会。" },
                { id: "plans", title: "谈谈城市与婚育预期", detail: state.understanding < 40 ? "目前了解较少，可能显得太急，但能更快了解分歧。" : "已有一些了解，可以认真确认未来有没有交集。" },
              ] as const).map(item => (
                <button key={item.id} data-testid={`meeting-${item.id}`} onClick={() => { const id = pendingMeeting; setPendingMeeting(null); commitAction({ type: "child-action", id, topic: item.id }); }}>
                  <strong>{item.title}</strong><span>{item.detail}</span>
                  {showActionNumbers && <small>{getActionPreview(state, "child", pendingMeeting, item.id)}</small>}
                </button>
              ))}
            </div>
            <button className={styles.secondaryButton} onClick={() => setPendingMeeting(null)}>先不约，重新想想</button>
          </section>
        </div>
      )}
      {pendingDecision && (
        <div className={styles.overlay}>
          <section className={styles.helpModal} role="dialog" aria-modal="true" aria-label="确认人生决定" data-testid="decision-dialog">
            <span className={styles.eyebrow}>先确认，这会改变生活阶段</span>
            <h2>{CHILD_ACTIONS.find(item => item.id === pendingDecision)?.title}</h2>
            <p>{pendingDecision === "separate" ? "确认后会结束这段婚姻并记录离婚结局。" : pendingDecision === "baby" ? "确认后会进入育儿阶段，生活开支与照护责任增加。" : "确认后会正式登记结婚，之后继续经营共同生活。"}</p>
            <p>{getActionPreview(state, "child", pendingDecision)}</p>
            <div className={styles.resultActions}>
              <button className={styles.secondaryButton} data-testid="decision-cancel" onClick={() => setPendingDecision(null)}>再想一想</button>
              <button className={styles.primaryButton} data-testid="decision-confirm" onClick={() => { const id = pendingDecision; setPendingDecision(null); commitAction({ type: "child-action", id }); }}>确认这个决定</button>
            </div>
          </section>
        </div>
      )}
      {renderResolutionDialog()}
      <footer className={styles.footer}>
        <span>虚构家庭策略游戏 · 角色设定不代表真人经历与立场</span>
        <span><FireOutlined /> 压力不是推进条，支持也不是一句“为你好”</span>
      </footer>
    </main>
  );
}
