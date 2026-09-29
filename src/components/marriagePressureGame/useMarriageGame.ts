"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ECONOMY_EVENTS } from "./content";
import {
  createInitialState,
  gameReducer,
  getAvailableChildActions,
  getAvailableParentActions,
  getCandidate,
  getEnding,
  resolveGameAction,
  validateSave,
} from "./engine";
import { getHouseholdBudget, getLifeWarnings, getPartnerProfile } from "./household";
import { getProgressionGuide } from "./progression";
import { getGrowthAdvice } from "./growth";
import type {
  Difficulty,
  GameMode,
  GameResolution,
  MarriageGameAction,
  MarriageGameState,
  ResolutionStep,
} from "./types";

export const SAVE_KEY = "marriage-pressure-save-v1";
export const PROFILE_KEY = "marriage-pressure-player-name";
const INITIAL_NAMES = ["小禾", "阿宁", "小北", "阿川", "小秋", "木木", "小舟", "阿言", "小林", "安安", "小饼", "阿夏"];

export function pickInitialName(previous = "") {
  const names = INITIAL_NAMES.filter(name => name !== previous);
  return names[Math.floor(Math.random() * names.length)];
}

export interface EventNotice {
  title: string;
  detail: string;
  kind: "event" | "match" | "action" | "ending";
}

export interface ResolutionSequence {
  steps: ResolutionStep[];
  index: number;
}

export interface CommitResult extends GameResolution {
  previous: MarriageGameState;
}

type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

// 经典与沉浸两种界面共用的状态、存档与结算逻辑
export function useMarriageGame() {
  const [state, setState] = useState<MarriageGameState>(createInitialState);
  const [saved, setSaved] = useState<MarriageGameState | null>(null);
  const [savedName, setSavedName] = useState("");
  const [mode, setMode] = useState<GameMode>("child");
  const [difficulty, setDifficulty] = useState<Difficulty>("realistic");
  const [seedInput, setSeedInput] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [eventNotice, setEventNotice] = useState<EventNotice | null>(null);
  const [resolution, setResolution] = useState<ResolutionSequence | null>(null);
  const [help, setHelp] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  // 各界面把自己的调试信息写进来，统一由 render_game_to_text 输出
  const debugRef = useRef<Record<string, unknown>>({});
  const candidate = getCandidate(state.candidateId);
  const event = ECONOMY_EVENTS.find(item => item.id === state.currentEventId);
  const ending = state.phase === "ended" ? getEnding(state) : null;
  const childActions = useMemo(() => getAvailableChildActions(state), [state]);
  const parentActions = useMemo(() => getAvailableParentActions(state), [state]);

  useEffect(() => {
    setPlayerName(pickInitialName());
    try {
      const restored = validateSave(JSON.parse(localStorage.getItem(SAVE_KEY) || "null"));
      if (restored && restored.phase !== "lobby") setSaved(restored);
      const restoredName = localStorage.getItem(PROFILE_KEY)?.trim();
      if (restored && restored.phase !== "lobby" && restoredName) {
        setSavedName(restoredName.slice(0, 8));
        setPlayerName(pickInitialName(restoredName));
      }
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
        ? { id: candidate.id, name: candidate.name, compatibility: candidate.compatibility, resume: candidate.resume }
        : null,
      event: event ? { id: event.id, title: event.title } : null,
      progression: getProgressionGuide(state),
      growthAdvice: getGrowthAdvice(state),
      householdBudget: getHouseholdBudget(state),
      partnerProfile: getPartnerProfile(state),
      warnings: getLifeWarnings(state),
      availableActions: state.activeActor === "parent" ? parentActions : childActions,
      playerName,
      eventNotice,
      resolution: resolution
        ? { index: resolution.index, total: resolution.steps.length, current: resolution.steps[resolution.index] }
        : null,
      help,
      pendingDecision: null,
      pendingMeeting: null,
      inspector: null,
      ...debugRef.current,
      coordinateSystem: "DOM board; origin top-left; x right, y down",
    });
    target.advanceTime = () => undefined;
    return () => {
      delete target.render_game_to_text;
      delete target.advanceTime;
    };
  }, [state, candidate, event, parentActions, childActions, playerName, eventNotice, resolution, help]);

  const personalizeNarrative = useCallback((line: string) => {
    if (state.mode === "child") return line.replaceAll("子女", "我");
    if (state.mode === "parent") return line.replaceAll("子女", playerName).replace(/^家长/, "我");
    return line.replaceAll("子女", playerName).replace(/^家长/, "家长玩家");
  }, [state.mode, playerName]);

  const personalizeResolution = useCallback((line: string) => {
    const subject = state.mode === "child" ? "我" : playerName;
    return personalizeNarrative(line).replaceAll("当事人", subject);
  }, [personalizeNarrative, playerName, state.mode]);

  const makeNotice = useCallback((previous: MarriageGameState, next: MarriageGameState, action: MarriageGameAction): EventNotice => {
    const beforeCandidate = getCandidate(previous.candidateId);
    const afterCandidate = getCandidate(next.candidateId);
    if (next.phase === "ended") return { kind: "ending", title: "这一局有结果了", detail: personalizeNarrative(next.lastEvent) };
    if (beforeCandidate?.id !== afterCandidate?.id) {
      if (beforeCandidate && afterCandidate) {
        return {
          kind: "match",
          title: `现在介绍的是 ${afterCandidate.name}`,
          detail: `${beforeCandidate.name} 已经翻篇，现在家庭群推来的是 ${afterCandidate.name}。当前版本一次只发展一段关系。`,
        };
      }
      if (beforeCandidate && !afterCandidate) {
        return { kind: "match", title: `${beforeCandidate.name} 被划掉了`, detail: `${personalizeNarrative(next.lastEvent)} 现在要回到相亲角重新选人。` };
      }
      if (afterCandidate) return { kind: "match", title: `今晚被介绍的人是 ${afterCandidate.name}`, detail: personalizeNarrative(next.lastEvent) };
    }
    if (next.turn > previous.turn) {
      const nextEvent = ECONOMY_EVENTS.find(item => item.id === next.currentEventId);
      const economyLine = nextEvent ? `${nextEvent.title}：${nextEvent.detail}` : "";
      const actionLine = next.lastEvent === economyLine ? "" : personalizeNarrative(next.lastEvent);
      return {
        kind: "event",
        title: `第 ${next.turn} 回合 · ${nextEvent?.title || "现实又插手了"}`,
        detail: [nextEvent?.detail || "家庭饭桌继续。", actionLine].filter(Boolean).join(" "),
      };
    }
    return {
      kind: "action",
      title: action.type === "parent-action" ? "家长刚刚出牌" : action.type === "child-action" ? `${playerName}刚刚回应` : action.type === "reply" ? "消息已回复" : "相亲对象确定了",
      detail: personalizeNarrative(next.lastEvent),
    };
  }, [personalizeNarrative, playerName]);

  // 提交一个引擎动作；quiet 为 true 时不弹出逐步结算（沉浸版自己展示）
  const commitAction = useCallback((action: MarriageGameAction, options: { quiet?: boolean } = {}): CommitResult | null => {
    const result = resolveGameAction(state, action);
    const next = result.state;
    if (next === state) return null;
    setEventNotice(makeNotice(state, next, action));
    if (!options.quiet) setResolution(result.steps.length ? { steps: result.steps, index: 0 } : null);
    setState(next);
    return { ...result, previous: state };
  }, [state, makeNotice]);

  const advanceResolution = useCallback(() => {
    setResolution(current => {
      if (!current || current.index >= current.steps.length - 1) return null;
      return { ...current, index: current.index + 1 };
    });
  }, []);

  const start = useCallback(() => {
    const typed = Number(seedInput);
    const seed = Number.isSafeInteger(typed) && typed > 0 ? typed : crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    const next = gameReducer(createInitialState(), { type: "start", mode, difficulty, seed });
    const cleanName = playerName.trim().slice(0, 8) || pickInitialName();
    setPlayerName(cleanName);
    try {
      localStorage.setItem(PROFILE_KEY, cleanName);
      ["marriage-pressure-introduction", "marriage-pressure-day-plan", "marriage-pressure-reunion"].forEach(key => localStorage.removeItem(key));
    } catch {
      setStorageAvailable(false);
    }
    setState(next);
    setResolution(null);
    const firstEvent = ECONOMY_EVENTS.find(item => item.id === next.currentEventId);
    setEventNotice(next.phase === "candidate"
      ? { kind: "match", title: "先替这局选一个相亲对象", detail: "当前版本一次只发展一段关系；换人后会重新建立关系进度。" }
      : { kind: "event", title: `第 1 回合 · ${firstEvent?.title || "日常开始"}`, detail: `${firstEvent?.detail || "工位上的手机亮了，妈妈推来一张名片。"} ${next.lastEvent.replaceAll("子女", "我")}` });
    setSaved(null);
    return next;
  }, [seedInput, mode, difficulty, playerName]);

  const restart = useCallback(() => {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      setStorageAvailable(false);
    }
    setSaved(state);
    setSavedName(playerName);
    setPlayerName(pickInitialName(playerName));
    setState(createInitialState());
    setEventNotice(null);
    setResolution(null);
  }, [state, playerName]);

  const resume = useCallback(() => {
    if (!saved) return;
    setPlayerName(savedName || playerName.trim() || pickInitialName());
    setState(saved);
    setMode(saved.mode);
    setDifficulty(saved.difficulty);
    setSeedInput(String(saved.seed));
    setSaved(null);
    setResolution(null);
    setEventNotice({ kind: "event", title: `回到第 ${saved.turn} 回合`, detail: "存档已恢复。先看清刚才发生了什么，再继续出牌。" });
  }, [saved, savedName, playerName]);

  return {
    state,
    setState,
    saved,
    savedName,
    mode,
    setMode,
    difficulty,
    setDifficulty,
    seedInput,
    setSeedInput,
    playerName,
    setPlayerName,
    eventNotice,
    setEventNotice,
    resolution,
    setResolution,
    advanceResolution,
    help,
    setHelp,
    ready,
    storageAvailable,
    debugRef,
    candidate,
    event,
    ending,
    childActions,
    parentActions,
    personalizeNarrative,
    personalizeResolution,
    commitAction,
    start,
    restart,
    resume,
  };
}

export type MarriageGameApi = ReturnType<typeof useMarriageGame>;
