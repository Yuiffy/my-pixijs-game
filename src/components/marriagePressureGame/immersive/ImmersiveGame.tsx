"use client";

import Image from "next/image";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightOutlined,
  MobileOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  MutedOutlined,
  MessageOutlined,
  ReloadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ACTIVITIES, getActivityCost } from "../activities";
import { CHILD_ACTIONS, STAGE_LABELS } from "../content";
import { getActionPreview, getCandidate } from "../engine";
import { getCandidateProfile } from "../household";
import { HOBBY_OPTIONS } from "../interests";
import { GROWTH_COSTS } from "../growth";
import { SLOT_LABELS, getSlots } from "../inbox";
import type { ChildActionId, InboxMessage, MarriageGameAction, MarriageGameState, MeetingTopic } from "../types";
import type { MarriageGameApi } from "../useMarriageGame";
import { getChangeTone } from "../ClassicBoard";
import {
  TOPIC_PROMPTS, VENUE_MINIS, VENUE_SKILLS, VENUE_STEPS, getVenueOptions, type MiniOption,
} from "./activityScripts";
import { detectCutscenes, type Cutscene } from "./cutscenes";
import type { DatePlan, DialogueChoice } from "./dialogueTypes";
import { listChats } from "./dialogues";
import { quarterLabel } from "./lines";
import PhoneOverlay, { type PhoneDebug } from "./PhoneOverlay";
import { RELATIVES, REUNION_SECONDS, getReunionQuestions, reunionSummary, type ReunionTone } from "./reunionDinner";
import {
  VENUE_TITLES, getFestivalReminders, getHotspots, isReunionTurn, phoneClock, routeScene, type ChatId, type PhoneApp,
} from "./sceneRouter";
import SceneCanvas from "./scene/SceneCanvas";
import StepsMini from "./StepsMini";
import TimingMini from "./TimingMini";
import { playCue, type Cue } from "./sound";
import styles from "./immersive.module.css";
import { restoreDayPlan, type DayPlan } from "./dayPlan";

const DECISIONS = new Set<ChildActionId>(["marry", "simple-wedding", "baby", "separate"]);
const MONTHS = [2, 5, 8, 11];

// 结算通知出现时把焦点移到“下一条”，方便键盘连续确认
const focusOnMount = (element: HTMLButtonElement | null) => element?.focus({ preventScroll: true });

class SceneBoundary extends Component<{ onError: (reason: string) => void; children: ReactNode }, { failed: boolean }> {
  constructor(props: { onError: (reason: string) => void; children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    const { onError } = this.props;
    onError("3D 场景加载失败，已切换到经典模式。");
  }

  render() {
    const { failed } = this.state;
    const { children } = this.props;
    return failed ? null : children;
  }
}

function usePreference(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setValue(stored);
    } catch {
      // 读不到本地存储时沿用默认值
    }
  }, [key]);
  const update = useCallback((next: string) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // 存不下也不影响本局
    }
  }, [key]);
  return [value, update] as const;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

interface ReunionState {
  key: string;
  index: number;
  tones: ReunionTone[];
  reply: string | null;
}

interface DateState {
  plan: DatePlan;
  stage: "arrive" | "skill" | "steps" | "talk" | "after";
  mood: MiniOption | null;
  reaction: string;
}

export default function ImmersiveGame({ game, onFallback }: { game: MarriageGameApi; onFallback: (reason: string) => void }) {
  const { state, candidate, resolution, playerName, eventNotice } = game;
  const reducedMotion = useReducedMotion();
  const [pacing, setPacing] = usePreference("marriage-pressure-pacing", "full");
  const [muted, setMuted] = usePreference("marriage-pressure-muted", "off");
  const [phone, setPhone] = useState<{ app: PhoneApp; chat: ChatId | null } | null>(null);
  const [phoneDebug, setPhoneDebug] = useState<PhoneDebug | null>(null);
  const [date, setDate] = useState<DateState | null>(null);
  const [confirm, setConfirm] = useState<ChildActionId | null>(null);
  const [hobbyPick, setHobbyPick] = useState(false);
  const [toast, setToast] = useState("");
  const [cutscenes, setCutscenes] = useState<Cutscene[]>([]);
  const [reunionDone, setReunionDone] = usePreference("marriage-pressure-reunion", "");
  const [reunion, setReunion] = useState<ReunionState | null>(null);
  const [reunionVisit, setReunionVisit] = useState(false);
  const [introductionDone, setIntroductionDone] = usePreference("marriage-pressure-introduction", "");
  const [friendRequested, setFriendRequested] = useState(false);
  const weekKey = `${state.seed}-${state.turn}-${state.activeActor}`;
  const [pendingPlan, setPendingPlan] = useState<DayPlan | null>(() => {
    try { return restoreDayPlan(localStorage.getItem("marriage-pressure-day-plan"), weekKey); } catch { return null; }
  });
  const plan = pendingPlan?.key === weekKey ? pendingPlan : null;
  useEffect(() => {
    try {
      if (plan) localStorage.setItem("marriage-pressure-day-plan", JSON.stringify(plan));
      else localStorage.removeItem("marriage-pressure-day-plan");
    } catch { /* 无本地存储时，当前会话的安排仍然可用。 */ }
  }, [plan]);
  const introductionKey = `${state.seed}-${state.candidateId}`;
  const introductionOpen = state.phase === "turn" && state.activeActor === "child" && (state.stage === "single" || state.stage === "chatting") && !state.matchClosed && state.meetings === 0 && candidate && introductionDone !== introductionKey;
  const brief = pacing === "brief";
  // 精简节奏略过时段，手机仍需呈现这一季全部已安排的消息。
  const communicationState = useMemo<MarriageGameState>(() => (brief
    ? { ...state, week: { ...state.week, slot: state.activeActor === "parent" ? "afternoon" : "evening" } }
    : state), [state, brief]);
  const dateActivity = date?.plan.activity ?? null;
  // 回乡是玩家在住处主动开启的行程，不再在每轮工位前突然插入。
  const reunionKey = `${state.seed}-${state.turn}`;
  const reunionAvailable = state.phase === "turn" && isReunionTurn(state) && reunionDone !== reunionKey;
  const reunionDue = reunionAvailable && reunionVisit && !date;
  const reunionQuestions = useMemo(() => (reunionDue ? getReunionQuestions(state) : []), [reunionDue, state]);
  const reunionStep = useMemo<ReunionState>(() => (reunion?.key === reunionKey ? reunion : { key: reunionKey, index: 0, tones: [], reply: null }), [reunion, reunionKey]);
  const reunionOpen = reunionDue && !resolution && cutscenes.length === 0;
  const festival = useMemo(() => (state.phase === "turn" ? getFestivalReminders(state) : []), [state]);
  const route = useMemo(() => routeScene(state, dateActivity, brief, reunionDue), [state, dateActivity, brief, reunionDue]);
  const hotspots = useMemo(() => getHotspots(state, route, brief), [state, route, brief]);
  const unread = useMemo(() => (communicationState.phase === "turn" ? listChats(communicationState, playerName).reduce((sum, entry) => sum + entry.unread, 0) : 0), [communicationState, playerName]);
  const portraits = useMemo(() => state.candidateOptions.map(id => getCandidate(id)?.image).filter((image): image is string => Boolean(image)), [state.candidateOptions]);
  const cue = useCallback((name: Cue) => playCue(name, muted === "on"), [muted]);

  useEffect(() => {
    game.debugRef.current = {
      view: "immersive",
      scene: route.id,
      venue: route.venue,
      slot: state.week.slot,
      pacing,
      hotspots: hotspots.map(spot => spot.id),
      phoneApp: phone?.app ?? null,
      chatId: phoneDebug?.chatId ?? null,
      node: phoneDebug?.node ?? null,
      choices: phoneDebug?.choices ?? [],
      activity: date?.plan.activity ?? null,
      dateStage: date?.stage ?? null,
      pendingDecision: confirm,
      pendingMeeting: date ? date.plan.payment : null,
      inspector: null,
      reunion: reunionDue ? { index: reunionStep.index, total: reunionQuestions.length, tones: reunionStep.tones, answered: reunionStep.reply !== null } : null,
      cutscene: cutscenes[0]?.kind ?? null,
      festival,
      pendingPlan: plan?.label ?? null,
      introduction: introductionOpen ? (friendRequested ? "accepted" : "introduction") : null,
    };
  }, [game.debugRef, route, state.week.slot, pacing, hotspots, phone, phoneDebug, date, confirm, reunionDue, reunionStep, reunionQuestions, cutscenes, festival, plan, introductionOpen, friendRequested]);

  // 阶段变化与行动方交接都从前后状态差异里找，任何提交路径都不会漏掉
  const previousState = useRef<MarriageGameState>(state);
  useEffect(() => {
    const before = previousState.current;
    previousState.current = state;
    if (before === state || before.seed !== state.seed) return;
    const found = detectCutscenes(before, state, { player: playerName, candidate: candidate?.name ?? getCandidate(before.candidateId)?.name ?? null, image: candidate?.image ?? getCandidate(before.candidateId)?.image ?? null });
    if (found.length) setCutscenes(current => [...current, ...found]);
  }, [state, playerName, candidate]);

  const answerReunion = useCallback((tone: ReunionTone) => {
    const question = reunionQuestions[reunionStep.index];
    if (!question || reunionStep.reply !== null) return;
    const answer = question.answers.find(item => item.id === tone);
    cue(tone === "silent" ? "tap" : "send");
    setReunion({ ...reunionStep, tones: [...reunionStep.tones, tone], reply: answer ? answer.reply : question.silence });
  }, [reunionQuestions, reunionStep, cue]);

  // 连环问计时：到点没选就算沉默；“减少动态”下不计时
  const questionOpen = reunionOpen && reunionStep.reply === null && reunionStep.index < reunionQuestions.length;
  useEffect(() => {
    if (!questionOpen || reducedMotion) return undefined;
    const timer = window.setTimeout(() => answerReunion("silent"), REUNION_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [questionOpen, reducedMotion, answerReunion, reunionStep.index]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPhone(null);
      setConfirm(null);
      setHobbyPick(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const commit = useCallback((action: MarriageGameAction) => {
    if (action.type === "child-action" && !brief && state.week.slot !== "evening") {
      setPendingPlan({ key: weekKey, action, label: CHILD_ACTIONS.find(item => item.id === action.id)?.title ?? "今晚的安排" });
      setPhone(null);
      setToast("记下了。先过完今天：下班路上还能聊聊，回家后再完成这项安排。");
      return null;
    }
    const result = game.commitAction(action);
    if (!result) {
      setToast("现在做不了这件事。");
      return null;
    }
    setPhone(null);
    setPendingPlan(null);
    cue(result.state.turn > result.previous.turn ? "notify" : "tap");
    return result;
  }, [game, cue, brief, state.week.slot, weekKey]);

  const runChoice = useCallback((choice: DialogueChoice) => {
    if (choice.close) { setPhone(null); return; }
    if (choice.openApp) { setPhone({ app: choice.openApp, chat: null }); return; }
    if (choice.confirm) { setPhone(null); setConfirm(choice.confirm); return; }
    const { action } = choice;
    if (!action) return;
    if (action.type === "child-action" && (action.id === "meet" || action.id === "meet-aa")) { setPhone({ app: "map", chat: null }); return; }
    if (action.type === "child-action" && action.id === "hobby" && !action.activity) { setPhone(null); setHobbyPick(true); return; }
    if (action.type === "child-action" && DECISIONS.has(action.id)) { setPhone(null); setConfirm(action.id); return; }
    commit(action);
  }, [commit]);

  const reply = useCallback((item: InboxMessage, choice: string) => {
    const result = game.commitAction({ type: "reply", messageId: item.id, choice }, { quiet: true });
    if (!result) return;
    cue("send");
    setToast(result.steps[result.steps.length - 1]?.detail ?? "");
  }, [game, cue]);

  const onHotspot = useCallback((id: string) => {
    const spot = hotspots.find(item => item.id === id);
    if (!spot || !spot.enabled) return;
    const { target } = spot;
    cue("tap");
    if (target.kind === "child-action") runChoice({ id, label: spot.label, action: { type: "child-action", id: target.id } });
    else if (target.kind === "parent-action") commit({ type: "parent-action", id: target.id });
    else if (target.kind === "phone") setPhone({ app: target.chat ? "chat" : target.app, chat: target.chat ?? null });
    else if (target.kind === "plan") setPhone({ app: "calendar", chat: null });
    else {
      const result = game.commitAction({ type: "advance-slot" }, { quiet: true });
      if (result) {
        cue("step");
        const settled = result.steps.find(step => step.kind === "message");
        setToast(settled ? `${settled.title}：${settled.detail}` : `${SLOT_LABELS[result.state.week.slot]}。`);
      }
    }
  }, [hotspots, cue, runChoice, commit, game]);

  const startDate = useCallback((datePlan: DatePlan) => {
    setPhone(null);
    cue("step");
    if (!brief && state.week.slot !== "evening") {
      setPendingPlan({ key: weekKey, date: datePlan, label: `周末 · ${ACTIVITIES[datePlan.activity].title}` });
      setToast("约好了。下班回家后，就可以出发赴约。");
      return;
    }
    setPendingPlan(null);
    setDate({ plan: datePlan, stage: "arrive", mood: null, reaction: "" });
  }, [cue, brief, state.week.slot, weekKey]);

  const finishDate = useCallback((topic: MeetingTopic) => {
    if (!date) return;
    const result = commit({ type: "child-action", id: date.plan.payment, topic, activity: date.plan.activity });
    if (!result) { setDate(null); return; }
    const choice = result.steps.find(step => step.kind === "choice");
    const photo = result.state.dateLog[result.state.dateLog.length - 1];
    if (photo?.liked) cue("cheer");
    const festiveLine = festival.length ? ` ${(state.turn - 1) % 4 === 2 ? "今天是七夕，" : "这一季有对方的生日，"}${candidate?.name ?? "对方"}看起来很意外：“没想到你记得。”` : "";
    setDate({ ...date, stage: "after", reaction: `${game.personalizeResolution(choice?.detail ?? result.state.datingFeedback)}${festiveLine}` });
  }, [date, commit, cue, game, festival, state.turn, candidate]);

  const slots = getSlots(state.week.actor);
  const partnerLabel = "对方意愿";

  const renderHud = () => (
    <>
      <header className={styles.hud}>
        <div className={styles.placeCard}>
          <small>{quarterLabel(state)} · 本季的生活片段 · {state.turn}/{state.maxTurns}</small>
          <strong data-testid="scene-title">{route.title}</strong>
          {state.phase === "turn" && !date && !reunionDue && (
            <ol className={styles.slotStrip} aria-label="这一周的进度">
              {(brief ? [state.week.slot] : slots).map(slot => <li key={slot} data-current={state.week.slot === slot}>{SLOT_LABELS[slot]}</li>)}
              <li data-current={false}>周末</li>
            </ol>
          )}
        </div>
        <div className={styles.meters} aria-label="当前状态">
          {[
            { label: "压力", value: state.stress, tone: "stress" },
            { label: "存款", value: state.savings, tone: "money" },
            { label: state.stage === "married" || state.stage === "parenthood" ? "伴侣感情" : "感情", value: state.relation, tone: "relation" },
            { label: "亲情", value: state.familyBond, tone: "family" },
          ].map(meter => (
            <span key={meter.label} data-tone={meter.tone} data-testid={`hud-${meter.tone}`}>
              <small>{meter.label}</small><b>{Math.round(meter.value)}</b><i style={{ width: `${Math.max(0, Math.min(100, meter.value))}%` }} />
            </span>
          ))}
        </div>
        <div className={styles.hudTools}>
          <button data-testid="pacing-toggle" aria-pressed={brief} onClick={() => setPacing(brief ? "full" : "brief")} title="每季经历工作、通勤、住处，再完成一项主要安排">{brief ? "精简节奏" : "日常节奏"}</button>
          <button data-testid="sound-toggle" aria-pressed={muted === "on"} aria-label={muted === "on" ? "打开音效" : "关闭音效"} onClick={() => setMuted(muted === "on" ? "off" : "on")}>{muted === "on" ? <MutedOutlined /> : <SoundOutlined />}</button>
        </div>
      </header>
      {state.phase === "turn" && !date && !reunionDue && (
        <aside className={styles.narration} data-testid="relationship-feedback">
          <small>{state.activeActor === "parent" ? "家长视角" : `${playerName} · ${STAGE_LABELS[state.stage]}`}{candidate ? ` · ${candidate.name}` : ""}</small>
          <p>{state.week.slot === "work" ? "手边的手机亮了。忙完这一阵，下班路上再慢慢聊。" : state.week.slot === "commute" ? "走出办公楼，街灯刚亮。回条消息，或给家里打个电话，再回家。" : eventNotice?.detail ? game.personalizeNarrative(eventNotice.detail) : state.stage === "married" || state.stage === "parenthood" ? state.partnerNote : state.datingFeedback}</p>
          <small>{partnerLabel} {state.mutualIntent} · 了解 {state.understanding}</small>
          {festival.map(line => (
            <button key={line} className={styles.festival} data-testid="festival-reminder" onClick={() => { cue("tap"); setPhone({ app: "calendar", chat: null }); }}>{line}</button>
          ))}
        </aside>
      )}
    </>
  );

  const renderHotspotBar = () => state.phase === "turn" && !date && !reunionDue && (
    <nav className={styles.hotspotBar} aria-label="场景里可以做的事" data-testid="hotspot-bar">
      <button className={styles.phoneButton} data-testid="open-phone" onClick={() => { cue("tap"); setPhone({ app: "home", chat: null }); }}>
        <MobileOutlined /> 手机{unread > 0 && <em>{unread}</em>}
      </button>
      {hotspots.map(spot => (
        <button key={spot.id} data-testid={`hotspot-${spot.id}`} data-kind={spot.target.kind} disabled={!spot.enabled} onClick={() => onHotspot(spot.id)} title={spot.detail}>
          <strong>{spot.label}</strong><small>{spot.enabled ? spot.detail : "现在做不了"}</small>
        </button>
      ))}
    </nav>
  );

  const renderJourney = () => state.phase === "turn" && !date && !reunionDue && !introductionOpen && (
    <aside className={styles.journey} data-testid="daily-journey">
      <small>{plan ? `已安排：${plan.label}` : state.week.slot === "work" ? route.night ? "22:47 · 忙完这一阵就回家" : "11:42 · 午休前的一条消息" : state.week.slot === "commute" ? "下班后 · 把工作留在身后" : "回到家 · 今天终于属于自己"}</small>
      {hotspots.some(spot => spot.id === "advance") ? <button data-testid="journey-next" onClick={() => onHotspot("advance")}>{state.week.slot === "work" ? "收好电脑，出发下班" : state.week.slot === "commute" ? "沿着灯光，回出租屋" : "回家吃午饭"} <ArrowRightOutlined /></button> : (
<>
        {plan && <button data-testid="complete-plan" onClick={() => { if (plan.date) startDate(plan.date); else if (plan.action) commit(plan.action); }}> {plan.date ? "周末到了，出发赴约" : `完成安排：${plan.label}`} <ArrowRightOutlined /></button>}
        {!plan && <button data-testid="plan-evening" onClick={() => setPhone({ app: "calendar", chat: null })}>安排休息、成长或周末约会</button>}
        {reunionAvailable && <button data-testid="visit-reunion" onClick={() => { setReunionVisit(true); setPhone(null); }}>春节行程 · 坐高铁回家吃年夜饭 →</button>}
      </>
)}
      <span>{reunionAvailable && state.week.slot !== "evening" ? "春节将近 · 晚上回家后可安排返乡" : "微信与电话随时可用 · 完成主要安排后才进入下一季"}</span>
    </aside>
  );

  const renderCandidateDraft = () => state.phase === "candidate" && (
    <section className={styles.draft} data-testid="immersive-draft">
      <header>
        <small>公园相亲角 · {state.selectionKind === "replace" ? "上一位已经翻篇" : "今天的简历"}</small>
        <h2>{state.mode === "child" ? "妈妈发来了几张名片" : "伞下挂着几份简历"}</h2>
      </header>
      <div className={styles.draftCards}>
        {state.candidateOptions.map(id => {
          const option = getCandidate(id);
          if (!option) return null;
          return (
            <button key={id} data-testid={`candidate-${id}`} onClick={() => commit({ type: "candidate", id })}>
              <span className={styles.draftPortrait}><Image src={option.image} alt={`${option.name} 的虚构游戏角色立绘`} fill unoptimized sizes="120px" className={styles.avatarImage} /></span>
              <span>
                <small>{option.subtitle}</small>
                <strong>{option.name}</strong>
                <em>履历 {option.resume} · 契合 {option.compatibility} · 意愿 {option.initialIntent}</em>
                <q>{option.boundary}</q>
                <i>{getCandidateProfile(state.seed, option.id).title}</i>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderDate = () => {
    if (!date || !candidate) return null;
    const activity = ACTIVITIES[date.plan.activity];
    const mini = VENUE_MINIS[activity.venue];
    const skill = VENUE_SKILLS[activity.venue];
    const steps = VENUE_STEPS[activity.venue];
    const options = getVenueOptions(activity.venue, { knowsDislikes: state.knownDislikes.length > 0 || state.understanding >= 45, tags: candidate.tags });
    const cost = getActivityCost(candidate.cityCost, activity.id);
    return (
      <section className={styles.datePanel} data-testid="date-panel" data-stage={date.stage}>
        <header>
          <small>{VENUE_TITLES[activity.venue]} · {activity.title} · {date.plan.payment === "meet-aa" ? `AA ${Math.ceil(cost / 2)}` : `我请 ${cost}`}</small>
          <strong>{candidate.name}</strong>
        </header>
        {date.stage === "arrive" && (
          <>
            <p className={styles.dateLine}>{mini.greeting}</p>
            <p>{mini.prompt}</p>
            <div className={styles.dateChoices}>
              {skill && (
                <button data-testid="mini-skill" className={styles.skillChoice} onClick={() => { cue("tap"); setDate({ ...date, stage: "skill" }); }}>
                  <strong>来一局：{skill.title}</strong><small>看时机按下，成绩只影响气氛和合照</small>
                </button>
              )}
              {steps && (
                <button data-testid="mini-steps" className={styles.skillChoice} onClick={() => { cue("tap"); setDate({ ...date, stage: "steps" }); }}>
                  <strong>来一局：{steps.title}</strong><small>每一步选择怎么和对方相处，只影响气氛和合照</small>
                </button>
              )}
              {options.map(option => (
                <button key={option.id} data-testid={`mini-${option.id}`} onClick={() => { cue("tap"); setDate({ ...date, stage: "talk", mood: option }); }}>{option.label}</button>
              ))}
            </div>
            <button className={styles.textButton} data-testid="mini-skip" onClick={() => setDate({ ...date, stage: "talk", mood: null })}>跳过，直接坐下聊聊</button>
            <button className={styles.textButton} data-testid="date-cancel" onClick={() => setDate(null)}>临时改期，先回去</button>
          </>
        )}
        {date.stage === "steps" && steps && (
          <>
            <StepsMini mini={steps} onDone={result => { cue("tap"); setDate({ ...date, stage: "talk", mood: result }); }} />
            <button className={styles.textButton} data-testid="steps-skip" onClick={() => setDate({ ...date, stage: "talk", mood: null })}>跳过这一段</button>
          </>
        )}
        {date.stage === "skill" && skill && (
          <>
            <TimingMini
              skill={skill}
              seed={`${state.seed}-${state.turn}-${activity.venue}`}
              reducedMotion={reducedMotion}
              onDone={hits => {
                const result = skill.results[hits >= skill.rounds.length ? 2 : hits > 0 ? 1 : 0];
                cue(hits >= skill.rounds.length ? "cheer" : "tap");
                setDate({ ...date, stage: "talk", mood: result });
              }}
            />
            <button className={styles.textButton} data-testid="skill-skip" onClick={() => setDate({ ...date, stage: "talk", mood: null })}>跳过这一段</button>
          </>
        )}
        {date.stage === "talk" && (
          <>
            {date.mood && <p className={styles.dateLine} data-mood={date.mood.mood}>{date.mood.line}</p>}
            <p>气氛差不多了，聊些什么？</p>
            <div className={styles.dateChoices}>
              {(Object.keys(TOPIC_PROMPTS) as MeetingTopic[]).map(topic => (
                <button key={topic} data-testid={`meeting-${topic}`} onClick={() => finishDate(topic)}>
                  <strong>{TOPIC_PROMPTS[topic].title}</strong><small>{topic === "plans" && state.understanding < 40 ? "目前了解较少，可能显得太急。" : TOPIC_PROMPTS[topic].detail}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {date.stage === "after" && (
          <>
            <p className={styles.dateLine}>{date.reaction}</p>
            <figure className={styles.polaroid} data-venue={activity.venue} data-testid="date-photo">
              <span><Image src={candidate.image} alt="" fill unoptimized sizes="160px" className={styles.avatarImage} /></span>
              <figcaption>{mini.photo}{date.mood ? ` · ${date.mood.label}` : ""}</figcaption>
            </figure>
            <small>合照已存进手机相册。</small>
            <button className={styles.primary} data-testid="date-finish" onClick={() => setDate(null)}>收好合照，开始下一季 <ArrowRightOutlined /></button>
          </>
        )}
      </section>
    );
  };

  const renderResolution = () => {
    if (!resolution) return null;
    const step = resolution.steps[resolution.index];
    const isLast = resolution.index === resolution.steps.length - 1;
    const kindLabel = { choice: "我的行动", reality: "现实事件", family: "家长回应", response: "当事人回应", match: "对象变化", household: "共同生活", message: "消息往来" }[step.kind];
    const bank = step.changes.some(change => change.key === "savings");
    return (
      <div className={styles.notifyLayer}>
        <section className={styles.notification} data-kind={step.kind} data-bank={bank} data-testid="resolution-dialog" role="dialog" aria-modal="true" aria-label="本回合结算">
          <header>
            <span>{step.kind === "reality" ? <ThunderboltOutlined /> : step.kind === "match" ? <ReloadOutlined /> : step.kind === "choice" || step.kind === "response" ? <UserOutlined /> : <MessageOutlined />}</span>
            <small>{bank ? "银行短信 · " : ""}{kindLabel}</small>
            <b>{resolution.index + 1}/{resolution.steps.length}</b>
          </header>
          <h2>{game.personalizeResolution(step.title)}</h2>
          <p>{game.personalizeResolution(step.detail)}</p>
          {step.changes.length > 0 && (
            <div className={styles.changes}>
              {step.changes.map(change => (
                <span key={change.key} data-tone={getChangeTone(change)} data-testid={`resolution-change-${change.key}`}>
                  <small>{change.label}</small><b>{change.before} → {change.after}</b><i>{change.delta > 0 ? "+" : ""}{change.delta}</i>
                </span>
              ))}
            </div>
          )}
          <button className={styles.primary} data-testid="resolution-next" ref={focusOnMount} onClick={() => { cue("tap"); game.advanceResolution(); }}>
            {isLast ? "知道了" : "下一条"} <ArrowRightOutlined />
          </button>
        </section>
      </div>
    );
  };

  const renderReunion = () => {
    if (!reunionOpen) return null;
    const question = reunionQuestions[reunionStep.index];
    const finish = () => { cue("step"); setReunionDone(reunionKey); setReunion(null); setReunionVisit(false); setToast("年夜饭结束，返程回到住处。这一季的生活继续。"); };
    return (
      <section className={styles.reunion} data-testid="reunion-panel" aria-label="年夜饭连环问">
        <header>
          <small>老家 · 年夜饭 · {state.activeActor === "parent" ? "亲戚问起你家孩子" : "亲戚连环问"}</small>
          {question && <b>{reunionStep.index + 1}/{reunionQuestions.length}</b>}
        </header>
        {reunionStep.index === 0 && reunionStep.reply === null && (
          <p className={styles.reunionIntro}>
            {state.activeActor === "parent" ? `${playerName}坐了四个小时高铁回来，亲戚们也都到齐了。` : "高铁晚点了二十分钟。推开家门，年夜饭已经摆上桌，亲戚们都在。"}
          </p>
        )}
        {question ? (
          <>
            <p className={styles.reunionQuestion}><strong>{question.asker}</strong>{question.text}</p>
            {reunionStep.reply === null ? (
              <>
                {!reducedMotion && <i key={reunionStep.index} className={styles.reunionTimer} style={{ animationDuration: `${REUNION_SECONDS}s` }} data-testid="reunion-timer" />}
                <div className={styles.dateChoices}>
                  {question.answers.map(answer => (
                    <button key={answer.id} data-testid={`reunion-${answer.id}`} onClick={() => answerReunion(answer.id)}>{answer.label}</button>
                  ))}
                  <button className={styles.textButton} data-testid="reunion-silent" onClick={() => answerReunion("silent")}>低头吃菜，不接话</button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.dateLine}>{reunionStep.reply}</p>
                <button className={styles.primary} data-testid="reunion-next" onClick={() => { cue("tap"); setReunion({ ...reunionStep, index: reunionStep.index + 1, reply: null }); }}>
                  {reunionStep.index + 1 < reunionQuestions.length ? "下一个问题" : "饭吃完了"} <ArrowRightOutlined />
                </button>
              </>
            )}
            {reunionStep.reply === null && <button className={styles.textButton} data-testid="reunion-skip" onClick={finish}>快进这顿饭</button>}
          </>
        ) : (
          <>
            <p className={styles.dateLine} data-testid="reunion-summary">{reunionSummary(reunionStep.tones)}</p>
            <button className={styles.primary} data-testid="reunion-finish" onClick={finish}>返程，回到住处 <ArrowRightOutlined /></button>
          </>
        )}
      </section>
    );
  };

  const renderCutscene = () => {
    const scene = cutscenes[0];
    if (!scene || resolution) return null;
    return (
      <div className={styles.cutsceneLayer} data-kind={scene.kind}>
        <section className={styles.cutscene} role="dialog" aria-modal="true" aria-label={scene.title} data-testid="cutscene" data-kind={scene.kind}>
          <small>{scene.place}</small>
          <h2>{scene.title}</h2>
          {scene.image && <span className={styles.cutscenePhoto}><Image src={scene.image} alt="" fill unoptimized sizes="200px" className={styles.avatarImage} /></span>}
          {scene.lines.map(line => <p key={line}>{line}</p>)}
          <button className={styles.primary} data-testid="cutscene-next" ref={focusOnMount} onClick={() => { cue(scene.kind === "handoff" ? "tap" : "cheer"); setCutscenes(current => current.slice(1)); }}>
            {scene.action} <ArrowRightOutlined />
          </button>
        </section>
      </div>
    );
  };

  const renderConfirm = () => confirm && (
    <div className={styles.modalLayer}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label="确认人生决定" data-testid="decision-dialog">
        <small>先确认，这会改变生活阶段</small>
        <h2>{CHILD_ACTIONS.find(item => item.id === confirm)?.title}</h2>
        <p>{confirm === "separate" ? "确认后会结束这段婚姻并记录离婚结局。" : confirm === "baby" ? "确认后会进入育儿阶段，生活开支与照护责任增加。" : "确认后会正式登记结婚，之后继续经营共同生活。"}</p>
        <p>{getActionPreview(state, "child", confirm)}</p>
        <div className={styles.modalActions}>
          <button data-testid="decision-cancel" onClick={() => setConfirm(null)}>再想一想</button>
          <button className={styles.primary} data-testid="decision-confirm" onClick={() => { const id = confirm; setConfirm(null); if (commit({ type: "child-action", id })) cue("cheer"); }}>确认这个决定</button>
        </div>
      </section>
    </div>
  );

  const renderHobby = () => hobbyPick && (
    <div className={styles.modalLayer}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label="培养什么爱好" data-testid="hobby-dialog">
        <small>爱好与朋友 · 花费 {GROWTH_COSTS.hobby}</small>
        <h2>这个周末想做点什么？</h2>
        <div className={styles.planGrid}>
          {HOBBY_OPTIONS.map(id => (
            <button key={id} data-testid={`hobby-${id}`} onClick={() => { setHobbyPick(false); commit({ type: "child-action", id: "hobby", activity: id }); }}>
              <strong>{ACTIVITIES[id].title}</strong><small>{state.playerHobbies.includes(id) ? "已经在坚持，继续深入" : "新方向，和同好更聊得来"}</small>
            </button>
          ))}
          <button data-testid="hobby-general" onClick={() => { setHobbyPick(false); commit({ type: "child-action", id: "hobby" }); }}>
            <strong>见见朋友，随便放松</strong><small>不固定方向，只是让生活丰富一点。</small>
          </button>
        </div>
        <div className={styles.modalActions}><button onClick={() => setHobbyPick(false)}>再想想</button></div>
      </section>
    </div>
  );

  return (
    <div className={styles.immersive} data-testid="immersive-game" data-scene={route.id} data-venue={route.venue ?? undefined} data-reduced-motion={reducedMotion}>
      <div className={styles.canvasWrap} data-testid="scene-canvas">
        <SceneBoundary onError={onFallback}>
          <SceneCanvas
            route={route}
            hotspots={hotspots}
            onHotspot={onHotspot}
            portrait={candidate?.image ?? null}
            portraits={portraits}
            parenthood={state.stage === "parenthood"}
            parentActive={state.activeActor === "parent"}
            month={MONTHS[(Math.max(1, state.turn) - 1) % 4]}
            onContextLost={onFallback}
            unread={unread}
            clock={phoneClock(communicationState)}
            phonePreview={listChats(communicationState, playerName).find(entry => entry.unread > 0)?.preview ?? "点开微信，聊聊今天"}
            showPhone={!date && !reunionDue && !introductionOpen && state.phase === "turn"}
            onPhone={() => { cue("tap"); setPhone({ app: "chats", chat: null }); }}
            speaker={reunionOpen && reunionQuestions[reunionStep.index] ? RELATIVES.indexOf(reunionQuestions[reunionStep.index].asker as typeof RELATIVES[number]) : -1}
          />
        </SceneBoundary>
      </div>
      {renderHud()}
      {renderHotspotBar()}
      {renderJourney()}
      {renderCandidateDraft()}
      {renderDate()}
      {renderReunion()}
      {toast && !phone && !date && <p className={styles.toast} data-testid="immersive-toast" role="status">{toast}</p>}
      {phone && (
        <PhoneOverlay
          game={{ ...game, state: communicationState }}
          app={phone.app}
          chat={phone.chat}
          reducedMotion={reducedMotion}
          onNavigate={(app, chat = null) => { cue("tap"); setPhone({ app, chat }); }}
          onClose={() => { setPhone(null); setPhoneDebug(null); }}
          onChoice={runChoice}
          onReply={reply}
          onStartDate={startDate}
          onDebug={setPhoneDebug}
        />
      )}
      {renderHobby()}
      {renderConfirm()}
      {renderResolution()}
      {renderCutscene()}
      {introductionOpen && !resolution && (
        <div className={styles.introLayer}>
          <section className={styles.introCard} data-testid="introduction" role="dialog" aria-modal="true" aria-label="妈妈介绍的相亲对象">
            <small>{route.night ? "22:47" : "11:42"} · 工位上的手机振了一下</small>
            <h2>{friendRequested ? "你们已经是好友了" : "妈妈推来了一张名片"}</h2>
            <p className={styles.introMessage}>{friendRequested ? `“你好，我是${candidate.name}。听说你今天也在上班？不着急，忙完再回。”` : `“这是朋友介绍的${candidate.name}。我把微信推给你啦，先加上聊聊，合不合适你自己决定。”`}</p>
            <div className={styles.contactCard}><span className={styles.contactPortrait}><Image src={candidate.image} alt={candidate.name} fill unoptimized sizes="80px" className={styles.avatarImage} /></span><div><strong>{candidate.name}</strong><small>{candidate.subtitle}</small><p>{candidate.boundary}</p></div></div>
            <p className={styles.introHint}>{friendRequested ? "好友申请已通过。今天从一声招呼开始。" : "每季经历一段生活：办公室 → 下班路上 → 住处 → 周末。回微信、打电话都不会直接跳过一天。"}</p>
            <button className={styles.primary} data-testid={friendRequested ? "intro-start-chat" : "intro-add-wechat"} onClick={() => { cue("send"); if (!friendRequested) setFriendRequested(true); else { setIntroductionDone(introductionKey); setFriendRequested(false); setPhone({ app: "chat", chat: "candidate" }); } }}>{friendRequested ? "打个招呼" : "添加微信，发送好友申请"} <ArrowRightOutlined /></button>
            {friendRequested && <button className={styles.textButton} data-testid="intro-later" onClick={() => { setIntroductionDone(introductionKey); setFriendRequested(false); }}>先把手上的工作做完，稍后聊</button>}
          </section>
        </div>
      )}
    </div>
  );
}
