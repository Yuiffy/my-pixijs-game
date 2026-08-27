"use client";

/* eslint-disable no-console */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioMutedOutlined,
  CloseOutlined,
  HistoryOutlined,
  LoadingOutlined,
  RobotOutlined,
  SettingOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import { AutoChessAIController } from "./ai/AutoChessAI";
import {
  getAutopilotRolloutCacheStats,
  hydrateAutopilotRolloutCache,
  LIVE_AUTOPILOT_BATTLE_STEP_HZ,
  snapshotAutopilotRolloutCache,
} from "./ai/AutoChessAutopilot";
import {
  AutoChessAutopilotWorkerClient,
  type AutopilotWorkerStatus,
} from "./ai/AutoChessAutopilotWorkerClient";
import type {
  AutopilotPreferenceStyle,
  AutopilotThinkingLevel,
} from "./ai/autopilotPolicy";
import {
  setCharacterStyle,
  useCharacterStyle,
  type CharacterStyle,
} from "./core/characterStyle";
import { GO_ROLLOUT_CACHE_SCHEMA } from "./ai/rolloutCacheSchema";
import {
  AutoChessAudio,
  DEFAULT_AUDIO_PREFERENCES,
  type AudioPreferences,
  loadAudioPreferences,
} from "./audio";
import Codex from "./Codex";
import ReleaseNotes from "./ReleaseNotes";
import RiftHud, { type BattleViewAction } from "./RiftHud";
import "./RiftHud.css";
import {
  ACTION_TRACE_LIMIT,
  EngineBridge,
  type ActionTraceEntry,
  type BattleTraceEntry,
  type BridgeEvent,
} from "./phaser/EngineBridge";
import { createGameConfig } from "./phaser/gameConfig";
import {
  TOOLBAR_HEIGHT,
  logicalSizeFor,
  profileFor,
  renderSizeFor,
  uiScaleFor,
} from "./phaser/layout";
import { AUTOCHESS_VERSION } from "./version";

declare global {
  type AutoChessLastRun = {
    version: string;
    capturedAt: string;
    state: Record<string, unknown>;
    actions: ActionTraceEntry[];
    battles: BattleTraceEntry[];
    trace: ReturnType<EngineBridge["getTraceStats"]>;
  };

  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
    autoChessAI?: AutoChessAIController;
    getAutoChessRolloutCacheStats?: typeof getAutopilotRolloutCacheStats;
    autoChessLastRun?: AutoChessLastRun;
    exportAutoChessLastRun?: () => Promise<{
      filename: string;
      bytes: number;
      round: number | null;
      actions: number;
      battles: number;
      battleEvents: number;
    } | null>;
  }
}

const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
const BACKGROUND_BATTLE_KEY = "rift-line-background-battle";
const AUTOPILOT_STRATEGY_KEY = "rift-line-autopilot-strategy";
const AUTOPILOT_STRATEGY_VERSION = 6;
const LAST_RUN_TRACE_KEY = "rift-line-last-run-trace";
const LAST_RUN_DATABASE = "rift-line-run-traces";
const LAST_RUN_STORE = "traces";
const GO_ROLLOUT_DATABASE = "rift-line-go-rollout-cache";
const GO_ROLLOUT_STORE = "cache";
const GO_ROLLOUT_RECORD_KEY = "latest";
const GO_ROLLOUT_PERSIST_INTERVAL_MS = 15_000;
const GO_ROLLOUT_PERSIST_LIMIT = 5_000;
const SESSION_TRACE_EVENT_LIMIT = 5_000;
type AutopilotConfiguration = {
  style: AutopilotPreferenceStyle;
  level: AutopilotThinkingLevel;
};
const AUTOPILOT_STYLE_OPTIONS = [
  ["survival", "稳健"],
  ["balanced", "平衡"],
  ["highroll", "搏上限"],
] as const satisfies ReadonlyArray<readonly [AutopilotPreferenceStyle, string]>;
const AUTOPILOT_LEVEL_OPTIONS = [
  ["novice", "新手"],
  ["veteran", "老手"],
  ["deep", "长考"],
  ["oracle", "看穿"],
] as const satisfies ReadonlyArray<readonly [AutopilotThinkingLevel, string]>;
const AUTOPILOT_DEFAULT_CONFIGURATION = {
  style: "balanced",
  level: "veteran",
} as const satisfies AutopilotConfiguration;

type PersistedGoRolloutCache = {
  schema: string;
  savedAt: string;
  entries: Array<[string, number]>;
};

const archiveCompletedRunInDevelopment = async (trace: AutoChessLastRun) => {
  if (process.env.NODE_ENV !== "development" || trace.state.phase !== "gameover") return;
  await fetch("/api/autochess-trace-recovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(trace),
  });
};

const openLastRunDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(LAST_RUN_DATABASE, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(LAST_RUN_STORE)) {
      request.result.createObjectStore(LAST_RUN_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const loadLastRunFromDatabase = async () => {
  if (!window.indexedDB) return null;
  const database = await openLastRunDatabase();
  try {
    return await new Promise<AutoChessLastRun | null>((resolve, reject) => {
      const request = database
        .transaction(LAST_RUN_STORE, "readonly")
        .objectStore(LAST_RUN_STORE)
        .get(LAST_RUN_TRACE_KEY);
      request.onsuccess = () => resolve((request.result as AutoChessLastRun | undefined) || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
};

const persistLastRun = async (trace: AutoChessLastRun) => {
  if (!window.indexedDB) return;
  const database = await openLastRunDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LAST_RUN_STORE, "readwrite");
      transaction.objectStore(LAST_RUN_STORE).put(trace, LAST_RUN_TRACE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

const openGoRolloutDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(GO_ROLLOUT_DATABASE, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(GO_ROLLOUT_STORE)) {
      request.result.createObjectStore(GO_ROLLOUT_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const loadGoRolloutCache = async () => {
  if (!window.indexedDB) return null;
  const database = await openGoRolloutDatabase();
  try {
    return await new Promise<PersistedGoRolloutCache | null>((resolve, reject) => {
      const request = database
        .transaction(GO_ROLLOUT_STORE, "readonly")
        .objectStore(GO_ROLLOUT_STORE)
        .get(GO_ROLLOUT_RECORD_KEY);
      request.onsuccess = () => resolve(
        (request.result as PersistedGoRolloutCache | undefined) || null,
      );
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
};

const persistGoRolloutCache = async (entries: Array<[string, number]>) => {
  if (!window.indexedDB) return;
  const database = await openGoRolloutDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(GO_ROLLOUT_STORE, "readwrite");
      transaction.objectStore(GO_ROLLOUT_STORE).put({
        schema: GO_ROLLOUT_CACHE_SCHEMA,
        savedAt: new Date().toISOString(),
        entries,
      } satisfies PersistedGoRolloutCache, GO_ROLLOUT_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

const loadBackgroundBattlePreference = () => {
  try {
    return window.localStorage.getItem(BACKGROUND_BATTLE_KEY) === "1";
  } catch {
    return false;
  }
};

const loadAutopilotConfiguration = (): AutopilotConfiguration => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUTOPILOT_STRATEGY_KEY) || "null");
    if (
      stored?.version >= AUTOPILOT_STRATEGY_VERSION
      && ["survival", "balanced", "highroll"].includes(stored?.style)
      && ["novice", "veteran", "deep", "oracle", "go"].includes(stored?.level)
    ) {
      return { style: stored.style, level: stored.level } as AutopilotConfiguration;
    }
    if (stored?.style === "seer" || stored?.style === "seer2") {
      return { style: "balanced", level: "oracle" };
    }
    if (stored?.style === "go") {
      return {
        style: "balanced",
        level: stored?.version >= 3 ? "go" : "oracle",
      };
    }
    if (stored?.style === "survival" || stored?.style === "highroll") {
      return { style: stored.style, level: "deep" };
    }
    if (stored?.style === "fair" || stored?.style === "balanced") {
      return { style: "balanced", level: "deep" };
    }
    if (stored?.informationMode === "oracle") {
      return { style: "balanced", level: "oracle" };
    }
    return AUTOPILOT_DEFAULT_CONFIGURATION;
  } catch {
    return AUTOPILOT_DEFAULT_CONFIGURATION;
  }
};

export default function AutoChessGame() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiScaleRef = useRef(1);
  const bridgeRef = useRef<EngineBridge | null>(null);
  const autopilotRef = useRef<AutoChessAutopilotWorkerClient | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const audioRef = useRef<AutoChessAudio | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const characterStyle = useCharacterStyle();
  const [autoplayEnabled, setAutoplayEnabled] = useState(false);
  const [autopilotActivity, setAutopilotActivity] = useState<
    AutopilotWorkerStatus["activity"]
  >(null);
  const autopilotThinking = autopilotActivity !== null;
  const [autopilotStyle, setAutopilotStyle] = useState<AutopilotPreferenceStyle>(
    AUTOPILOT_DEFAULT_CONFIGURATION.style,
  );
  const [autopilotLevel, setAutopilotLevel] = useState<AutopilotThinkingLevel>(
    AUTOPILOT_DEFAULT_CONFIGURATION.level,
  );
  const [backgroundBattleEnabled, setBackgroundBattleEnabled] = useState(false);
  const [audioPreferences, setAudioPreferences] = useState<AudioPreferences>(DEFAULT_AUDIO_PREFERENCES);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  const [message, setMessage] = useState("图鉴可查看棋子、羁绊与本局天赋");
  const [uiScale, setUiScale] = useState(1);
  const [, setRevision] = useState(0);
  const enemyFormationOpen = bridgeRef.current?.enemyFormationOpen || false;

  useEffect(() => {
    let disposed = false;
    let persistedSignature = "";
    let writeInFlight = false;
    const goKeyPrefix = `${GO_ROLLOUT_CACHE_SCHEMA}/`;
    const cacheSignature = (entries: Array<[string, number]>) => {
      const first = entries[0]?.[0] || "";
      const last = entries.at(-1)?.[0] || "";
      return `${entries.length}/${first}/${last}`;
    };

    loadGoRolloutCache().then((payload) => {
      if (disposed || payload?.schema !== GO_ROLLOUT_CACHE_SCHEMA) return;
      const entries = payload.entries
        .filter(([key, score]) => key.startsWith(goKeyPrefix) && Number.isFinite(score))
        .slice(-GO_ROLLOUT_PERSIST_LIMIT);
      hydrateAutopilotRolloutCache(entries);
      persistedSignature = cacheSignature(entries);
    }).catch(() => {});

    const persist = () => {
      if (disposed || writeInFlight) return;
      const entries = snapshotAutopilotRolloutCache({
        prefix: goKeyPrefix,
        limit: GO_ROLLOUT_PERSIST_LIMIT,
      });
      const signature = cacheSignature(entries);
      if (signature === persistedSignature) return;
      writeInFlight = true;
      persistGoRolloutCache(entries).then(() => {
        persistedSignature = signature;
      }).catch(() => {}).finally(() => {
        writeInFlight = false;
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    const interval = window.setInterval(persist, GO_ROLLOUT_PERSIST_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", persist);
    return () => {
      persist();
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", persist);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let resizeFrame = 0;
    const syncUiScale = () => {
      resizeFrame = 0;
      const next = uiScaleFor(container.clientWidth, container.clientHeight);
      uiScaleRef.current = next;
      setUiScale((current) => (Math.abs(current - next) > 0.001 ? next : current));
    };
    const scheduleUiScaleSync = () => {
      if (!resizeFrame) resizeFrame = window.requestAnimationFrame(syncUiScale);
    };
    const observer = new ResizeObserver(scheduleUiScaleSync);
    observer.observe(container);
    syncUiScale();
    return () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
    };
  }, []);

  const updateAudio = useCallback((patch: Partial<AudioPreferences>) => {
    setAudioPreferences((current) => {
      const next = { ...current, ...patch };
      audioRef.current?.setPreferences(next);
      if (!next.muted) audioRef.current?.unlock().catch(() => {});
      return next;
    });
  }, []);

  const updateAutoplay = useCallback((enabled: boolean) => {
    setAutoplayEnabled(enabled);
    autopilotRef.current?.setEnabled(enabled);
    bridgeRef.current?.setAutoplayEnabled(enabled);
    setMessage(enabled ? "AI 托管已开启，可随时接管。" : "已切回手动指挥。");
    setRevision((value) => value + 1);
  }, []);

  const updateAutopilotStyle = useCallback((style: AutopilotPreferenceStyle) => {
    setAutopilotStyle(style);
    autopilotRef.current?.setConfiguration(style, autopilotLevel);
    try {
      window.localStorage.setItem(
        AUTOPILOT_STRATEGY_KEY,
        JSON.stringify({
          style,
          level: autopilotLevel,
          version: AUTOPILOT_STRATEGY_VERSION,
        }),
      );
    } catch {
      // The strategy still applies for this session when storage is unavailable.
    }
    const label = AUTOPILOT_STYLE_OPTIONS.find(([option]) => option === style)?.[1] || style;
    setMessage(`托管风格已切换为${label}。`);
    setRevision((value) => value + 1);
  }, [autopilotLevel]);

  const updateAutopilotLevel = useCallback((level: AutopilotThinkingLevel) => {
    setAutopilotLevel(level);
    autopilotRef.current?.setConfiguration(autopilotStyle, level);
    try {
      window.localStorage.setItem(
        AUTOPILOT_STRATEGY_KEY,
        JSON.stringify({
          style: autopilotStyle,
          level,
          version: AUTOPILOT_STRATEGY_VERSION,
        }),
      );
    } catch {
      // The strategy still applies for this session when storage is unavailable.
    }
    const label = AUTOPILOT_LEVEL_OPTIONS.find(([option]) => option === level)?.[1] || level;
    setMessage(`AI 等级已切换为${label}。`);
    setRevision((value) => value + 1);
  }, [autopilotStyle]);

  const startAiRun = useCallback(() => {
    const started = autopilotRef.current?.startFromTitle() || false;
    if (!started) return;
    setAutoplayEnabled(true);
    setMessage("AI 已接管远征。");
    setRevision((value) => value + 1);
  }, []);

  const updateBackgroundBattle = useCallback((enabled: boolean) => {
    setBackgroundBattleEnabled(enabled);
    bridgeRef.current?.setBackgroundBattleEnabled(enabled);
    try {
      window.localStorage.setItem(BACKGROUND_BATTLE_KEY, enabled ? "1" : "0");
    } catch {
      // The setting still applies for this session when storage is unavailable.
    }
    setMessage(enabled ? "后台战斗已开启。" : "切出页面时将暂停战斗。");
    setRevision((value) => value + 1);
  }, []);

  const updateBattlePaused = useCallback((paused: boolean) => {
    const bridge = bridgeRef.current;
    if (!bridge || bridge.engine.state.phase !== "battle") return;
    const next = bridge.setBattlePaused(paused);
    setMessage(next ? "战斗已暂停，可继续查看羁绊与统计。" : "战斗继续。");
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) await document.exitFullscreen();
      else if (document.fullscreenElement) setMessage("其他内容正在全屏，请先退出后再试。");
      else if (!document.fullscreenEnabled || !container.requestFullscreen) {
        setFullscreenSupported(false);
        setMessage("当前浏览器不支持全屏。");
      } else await container.requestFullscreen();
    } catch {
      setMessage("无法进入全屏，请检查浏览器权限后重试。");
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedSeed = Number(query.get("seed"));
    const requestedSpeed = Number(query.get("testSpeed"));
    const bridge = new EngineBridge(
      Number.isFinite(requestedSeed) && requestedSeed > 0 ? requestedSeed : undefined,
      Number.isFinite(requestedSpeed) ? requestedSpeed : 1,
      { battleStepHz: LIVE_AUTOPILOT_BATTLE_STEP_HZ },
    );
    bridgeRef.current = bridge;
    const storedBackgroundBattle = loadBackgroundBattlePreference();
    bridge.setBackgroundBattleEnabled(storedBackgroundBattle);
    setBackgroundBattleEnabled(storedBackgroundBattle);
    const storedAutopilotConfiguration = loadAutopilotConfiguration();
    setAutopilotStyle(storedAutopilotConfiguration.style);
    setAutopilotLevel(storedAutopilotConfiguration.level);
    const audio = new AutoChessAudio(loadAudioPreferences());
    audioRef.current = audio;
    setAudioPreferences(loadAudioPreferences());

    let restoredFromSession = false;
    try {
      const storedTrace = window.sessionStorage.getItem(LAST_RUN_TRACE_KEY);
      if (storedTrace) {
        const trace = JSON.parse(storedTrace) as AutoChessLastRun;
        window.autoChessLastRun = trace;
        archiveCompletedRunInDevelopment(trace).catch(() => {});
        restoredFromSession = true;
      }
    } catch {
      // IndexedDB below handles larger traces and restricted session storage.
    }
    if (!restoredFromSession) {
      loadLastRunFromDatabase()
        .then((trace) => {
          if (trace) {
            window.autoChessLastRun = trace;
            archiveCompletedRunInDevelopment(trace).catch(() => {});
          }
        })
        .catch(() => {});
    }

    let lastPublishedSignature = "";
    const publishRunTrace = () => {
      const traceStats = bridge.getTraceStats();
      const signature = `${bridge.engine.state.phase}:${traceStats.actions}:${traceStats.battles}:${traceStats.battleEvents}`;
      if (signature === lastPublishedSignature && window.autoChessLastRun) return;
      lastPublishedSignature = signature;
      const trace: AutoChessLastRun = {
        version: AUTOCHESS_VERSION,
        capturedAt: new Date().toISOString(),
        state: bridge.getState(),
        actions: bridge.getActionHistory(ACTION_TRACE_LIMIT),
        battles: bridge.getBattleHistory(),
        trace: traceStats,
      };
      window.autoChessLastRun = trace;
      try {
        if (traceStats.battleEvents <= SESSION_TRACE_EVENT_LIMIT) {
          window.sessionStorage.setItem(LAST_RUN_TRACE_KEY, JSON.stringify(trace));
        } else window.sessionStorage.removeItem(LAST_RUN_TRACE_KEY);
      } catch {
        try {
          window.sessionStorage.removeItem(LAST_RUN_TRACE_KEY);
        } catch {
          // The in-memory and IndexedDB copies remain available.
        }
      }
      persistLastRun(trace).catch(() => {});
      archiveCompletedRunInDevelopment(trace).catch(() => {});
    };

    window.exportAutoChessLastRun = async () => {
      if (bridge.engine.state.phase !== "title") publishRunTrace();
      let trace: AutoChessLastRun | null | undefined = window.autoChessLastRun;
      if (!trace) trace = await loadLastRunFromDatabase();
      if (!trace) {
        console.warn("[RiftLine][trace] 没有找到可导出的本局记录");
        return null;
      }

      const state = trace.state as {
        round?: unknown;
        player?: { score?: unknown };
      };
      const round = Number.isFinite(Number(state.round)) ? Number(state.round) : null;
      const score = Number.isFinite(Number(state.player?.score))
        ? Number(state.player?.score)
        : null;
      const suffix = [
        round === null ? "unknown" : `round-${round}`,
        score === null ? null : `score-${score}`,
      ].filter(Boolean).join("-");
      const filename = `autochess-run-${suffix}.json`;
      const serialized = JSON.stringify(trace, null, 2);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000);

      const summary = {
        filename,
        bytes: serialized.length,
        round,
        actions: trace.actions.length,
        battles: trace.battles.length,
        battleEvents: trace.trace.battleEvents,
      };
      console.info("[RiftLine][trace] 已导出本局记录", summary);
      return summary;
    };

    const onBridgeEvent = (event: BridgeEvent) => {
      if (event.type === "audio") {
        audio.unlock().catch(() => {});
        audio.play(event.event);
      }
      if (event.type === "toast" && event.text) setMessage(event.text);
      if (event.type === "state" || event.type === "phase") {
        if (
          bridge.engine.state.phase === "gameover"
          || (event.type === "phase" && (event.phase === "battle" || event.phase === "result"))
        ) publishRunTrace();
        setRevision((value) => value + 1);
        const scene = gameRef.current?.scene.getScene("RiftLineScene") as { refresh?: () => void } | undefined;
        scene?.refresh?.();
      }
    };
    bridge.onEvent = onBridgeEvent;

    let disposed = false;
    let resizeFrame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const syncGameSize = () => {
      resizeFrame = 0;
      const game = gameRef.current;
      const host = gameHostRef.current;
      if (!game || !host || !host.clientWidth || !host.clientHeight) return;

      const displayWidth = host.clientWidth;
      const displayHeight = host.clientHeight;
      const target = renderSizeFor(
        displayWidth,
        displayHeight,
        (window.devicePixelRatio || 1) * uiScaleRef.current,
      );
      game.canvas.style.width = `${displayWidth}px`;
      game.canvas.style.height = `${displayHeight}px`;
      game.scale.setParentSize(displayWidth, displayHeight);
      if (game.scale.baseSize.width !== target.width || game.scale.baseSize.height !== target.height) {
        game.scale.resize(target.width, target.height);
      }

      const profile = profileFor(
        displayWidth,
        displayHeight,
      );
      const logical = logicalSizeFor();
      game.canvas.dataset.layoutProfile = profile;
      game.canvas.dataset.logicalWidth = String(logical.width);
      game.canvas.dataset.logicalHeight = String(logical.height);
      game.canvas.dataset.renderScale = target.renderScale.toFixed(3);
      game.canvas.dataset.devicePixelRatio = target.devicePixelRatio.toFixed(3);
    };
    const scheduleGameSizeSync = () => {
      if (!resizeFrame) resizeFrame = window.requestAnimationFrame(syncGameSize);
    };
    const boot = async () => {
      try {
        await document.fonts?.load(`400 16px ${FONT}`);
        await document.fonts?.load(`700 16px ${FONT}`);
      } catch {
        // System CJK fallbacks remain usable when a browser cannot report font readiness.
      }
      if (disposed || !gameHostRef.current) return;
      const Phaser = (await import("phaser")).default;
      const game = new Phaser.Game(createGameConfig(gameHostRef.current, bridge));
      gameRef.current = game;
      game.canvas.setAttribute("data-game-canvas", "rift-line");
      game.canvas.setAttribute("aria-label", "裂隙阵线自走棋游戏画布");
      game.canvas.tabIndex = 0;
      setRevision((value) => value + 1);
      scheduleGameSizeSync();
    };
    boot().catch(() => setMessage("无法初始化 Phaser 游戏画面。"));

    window.render_game_to_text = () => bridge.renderTextState();
    window.advanceTime = (milliseconds: number) => {
      bridge.advance(milliseconds);
      const scene = gameRef.current?.scene.getScene("RiftLineScene") as { refresh?: () => void } | undefined;
      scene?.refresh?.();
    };
    const ai = new AutoChessAIController(bridge);
    window.autoChessAI = ai;
    window.getAutoChessRolloutCacheStats = getAutopilotRolloutCacheStats;
    const autopilot = new AutoChessAutopilotWorkerClient(
      bridge,
      storedAutopilotConfiguration.style,
      storedAutopilotConfiguration.level,
      ({ thinking, activity }) => {
        if (!disposed) setAutopilotActivity(thinking ? activity : null);
      },
      (errorMessage) => {
        if (!disposed) setMessage(errorMessage);
      },
    );
    autopilotRef.current = autopilot;
    console.info(`[RiftLine][AI] v${AUTOCHESS_VERSION} ready. Use autoChessAI.help()`, ai.help());

    const automationTimer = window.setInterval(() => {
      if (document.hidden) bridge.updateBackground();
      autopilot.tick();
    }, 250);
    const onVisibility = () => {
      bridge.setHidden(document.hidden);
      if (document.hidden && bridge.engine.state.phase !== "title") publishRunTrace();
      autopilot.tick();
    };
    const onPageHide = () => {
      if (bridge.engine.state.phase !== "title") publishRunTrace();
    };
    const onFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement === containerRef.current;
      setFullscreen(isFullscreen);
      scheduleGameSizeSync();
    };
    const onFullscreenError = () => setMessage("全屏请求被浏览器拒绝。");
    const onWindowResize = () => scheduleGameSizeSync();
    if (gameHostRef.current) {
      resizeObserver = new ResizeObserver(scheduleGameSizeSync);
      resizeObserver.observe(gameHostRef.current);
    }
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("fullscreenerror", onFullscreenError);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("resize", onWindowResize);
    window.visualViewport?.addEventListener("resize", onWindowResize);
    setFullscreenSupported(Boolean(document.fullscreenEnabled && containerRef.current?.requestFullscreen));
    onVisibility();

    return () => {
      disposed = true;
      window.clearInterval(automationTimer);
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      bridge.onEvent = null;
      if (bridge.engine.state.phase !== "title") publishRunTrace();
      gameRef.current?.destroy(true);
      gameRef.current = null;
      bridgeRef.current = null;
      autopilot.dispose();
      autopilotRef.current = null;
      audio.destroy();
      audioRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("fullscreenerror", onFullscreenError);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("resize", onWindowResize);
      window.visualViewport?.removeEventListener("resize", onWindowResize);
      delete window.render_game_to_text;
      delete window.advanceTime;
      delete window.autoChessAI;
      delete window.getAutoChessRolloutCacheStats;
      delete window.exportAutoChessLastRun;
    };
  }, []);

  useEffect(() => {
    const bridge = bridgeRef.current;
    bridge?.setCodexOpen(codexOpen || releaseOpen || settingsOpen);
    if (!codexOpen && !releaseOpen && !settingsOpen) {
      const scene = gameRef.current?.scene.getScene("RiftLineScene") as { refresh?: () => void } | undefined;
      scene?.refresh?.();
    }
  }, [codexOpen, releaseOpen, settingsOpen]);

  useEffect(() => {
    const scene = gameRef.current?.scene.getScene("RiftLineScene") as {
      setCharacterStyle?: (style: CharacterStyle) => void;
    } | undefined;
    scene?.setCharacterStyle?.(characterStyle);
  }, [characterStyle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && releaseOpen) {
        event.preventDefault();
        setReleaseOpen(false);
        return;
      }
      if (event.key === "Escape" && settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (event.key === "Escape" && enemyFormationOpen) {
        event.preventDefault();
        bridgeRef.current?.setEnemyFormationOpen(false);
        return;
      }
      if (event.key === "Escape" && codexOpen) {
        event.preventDefault();
        setCodexOpen(false);
        return;
      }
      if (codexOpen || releaseOpen || settingsOpen || enemyFormationOpen || event.repeat) return;
      const active = document.activeElement;
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const { state } = bridge.engine;
      const key = event.key.toLowerCase();
      if (
        active instanceof HTMLInputElement
        || active instanceof HTMLSelectElement
        || active instanceof HTMLTextAreaElement
        || active?.getAttribute("contenteditable") === "true"
        || (active instanceof HTMLButtonElement && !(state.phase === "battle" && key === "p"))
      ) return;
      const number = /^[1-5]$/.test(event.key) ? Number(event.key) : 0;
      let action: import("./phaser/EngineBridge").GameAction | null = null;

      if (key === "f") {
        event.preventDefault();
        toggleFullscreen().catch(() => {});
        return;
      }
      if (key === "c") {
        event.preventDefault();
        setCodexOpen(true);
        return;
      }
      if (key === "v") {
        event.preventDefault();
        setReleaseOpen(true);
        return;
      }
      if (state.phase === "title" && number >= 1 && number <= state.starterChoices.length) {
        action = { type: "starter", id: state.starterChoices[number - 1] };
      } else if (state.phase === "augment" && number >= 1 && number <= state.augmentChoices.length) {
        action = { type: "augment", index: number - 1 };
      } else if (state.phase === "preparation" && number >= 1 && number <= 5) {
        action = { type: "shop", index: number - 1 };
      } else if (state.phase === "preparation" && key === "r") {
        action = { type: "reroll" };
      } else if (state.phase === "preparation" && key === "l") {
        action = { type: "lock" };
      } else if (state.phase === "preparation" && key === "u") {
        action = bridge.engine.isMaxPlayerLevel
          ? { type: "starForge" }
          : { type: "buyXp" };
      } else if (state.phase === "preparation" && key === "e") {
        event.preventDefault();
        bridge.setEnemyFormationOpen(true);
        return;
      } else if (state.phase === "preparation" && (event.key === "Delete" || event.key === "Backspace")) {
        action = { type: "sell" };
      } else if (state.phase === "preparation" && event.code === "Space") {
        action = { type: "battle" };
      } else if (state.phase === "battle" && key === "s") {
        action = { type: "skipBattle" };
      } else if (state.phase === "battle" && key === "p") {
        event.preventDefault();
        updateBattlePaused(!bridge.battlePaused);
        return;
      } else if (state.phase === "battle" && key === "d") {
        action = { type: "rankingToggle" };
      } else if (state.phase === "result" && event.key === "Enter") {
        action = { type: "resultContinue" };
      } else if (state.phase === "gameover" && event.key === "Enter") {
        action = { type: "restart" };
      } else if (event.key === "Escape") {
        action = { type: "clearSelection" };
      }

      if (action) {
        event.preventDefault();
        bridge.dispatch(action);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [codexOpen, enemyFormationOpen, releaseOpen, settingsOpen, toggleFullscreen, updateBattlePaused]);

  const engine = bridgeRef.current?.engine;
  const dispatch = useCallback((action: import("./phaser/EngineBridge").GameAction) => {
    bridgeRef.current?.dispatch(action);
    setRevision((value) => value + 1);
  }, []);
  const adjustBattleView = useCallback((action: BattleViewAction) => {
    const scene = gameRef.current?.scene.getScene("RiftLineScene") as {
      adjustBattleView?: (nextAction: BattleViewAction) => void;
    } | undefined;
    scene?.adjustBattleView?.(action);
  }, []);
  const setEnemyFormationOpen = useCallback((open: boolean) => {
    bridgeRef.current?.setEnemyFormationOpen(open);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`rift-game-shell rift-shell-${engine?.state.phase || "loading"}`}
      style={{
        width: fullscreen ? "100vw" : "100%",
        height: fullscreen ? "100dvh" : "100%",
        background: "#050b12",
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <div
        data-ui-scale={uiScale.toFixed(3)}
        style={{
          position: "absolute",
          inset: "0 auto auto 0",
          width: `${100 / uiScale}%`,
          height: `${100 / uiScale}%`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          transform: `scale(${uiScale})`,
          transformOrigin: "top left",
          boxSizing: "border-box",
          paddingBottom: "max(0px, env(safe-area-inset-bottom))",
        }}
      >
        <style>{`
          @media (max-width: 600px) {
            .rift-toolbar-status, .rift-shortcut { display: none !important; }
            .rift-toolbar { justify-content: center !important; }
            .rift-toolbar button { min-width: 0 !important; padding-inline: 10px !important; }
            .rift-toolbar-button-label { display: none !important; }
          }
        `}</style>
        <div className="rift-toolbar" style={{ width: "100%", height: TOOLBAR_HEIGHT, flex: "0 0 auto", display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "5px 10px", boxSizing: "border-box", color: "#7892a5", overflowX: "auto", background: "#08131e", borderBottom: "1px solid rgba(117, 205, 255, 0.16)", font: `600 12px ${FONT}` }}>
          <span className="rift-toolbar-status" aria-live="polite" style={{ flex: 1, minWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#82a8bd" }}>{message}</span>
          <button type="button" onClick={() => setCodexOpen(true)} style={toolbarButtonStyle}>图鉴 / 本局天赋</button>
          <button type="button" className={`${autoplayEnabled ? "is-autoplay" : ""}${autopilotThinking ? " is-thinking" : ""}`} aria-pressed={autoplayEnabled} onClick={() => updateAutoplay(!autoplayEnabled)} style={toolbarButtonStyle} title={autoplayEnabled ? "关闭托管并接管" : "让 AI 托管当前对局"}><RobotOutlined aria-hidden="true" /><span className="rift-toolbar-button-label">{autopilotThinking ? "后台推演中" : autoplayEnabled ? "AI 托管中" : "手动指挥"}</span></button>
          <div className="rift-toolbar-audio" aria-label="音量控制">
            <button type="button" aria-label={audioPreferences.muted ? "开启游戏声音" : "静音游戏声音"} aria-pressed={audioPreferences.muted} onClick={() => updateAudio({ muted: !audioPreferences.muted })} style={toolbarIconButtonStyle} title={audioPreferences.muted ? "开启游戏声音" : "静音游戏声音"}>{audioPreferences.muted ? <AudioMutedOutlined aria-hidden="true" /> : <SoundOutlined aria-hidden="true" />}</button>
            <label className="rift-audio-range" htmlFor="rift-toolbar-music-volume"><span>音乐</span><input id="rift-toolbar-music-volume" aria-label="音乐音量" type="range" min="0" max="1" step="0.05" value={audioPreferences.musicVolume} onChange={(event) => updateAudio({ musicVolume: Number(event.target.value) })} /></label>
            <label className="rift-audio-range" htmlFor="rift-toolbar-effects-volume"><span>音效</span><input id="rift-toolbar-effects-volume" aria-label="音效音量" type="range" min="0" max="1" step="0.05" value={audioPreferences.effectsVolume} onChange={(event) => updateAudio({ effectsVolume: Number(event.target.value) })} /></label>
          </div>
          <button type="button" aria-label="游戏设置" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)} style={toolbarIconButtonStyle} title="游戏设置"><SettingOutlined aria-hidden="true" /></button>
          <span className="rift-shortcut">快捷键 F</span>
          <button type="button" aria-pressed={fullscreen} disabled={!fullscreenSupported} onClick={() => { toggleFullscreen().catch(() => {}); }} style={toolbarButtonStyle}>{fullscreen ? "退出全屏" : "全屏游玩"}</button>
        </div>
        <div
          ref={gameHostRef}
          style={{
            width: "100%",
            flex: "1 1 auto",
            minHeight: 0,
            touchAction: "none",
          }}
        />
        {autoplayEnabled && autopilotThinking && (
          <div className="rift-autopilot-thinking" role="status" aria-live="polite">
            <LoadingOutlined aria-hidden="true" />
            <span>
              {autopilotActivity === "prewarm"
                ? "下一回合预演中"
                : autopilotLevel === "oracle" ? "看穿推演中" : "长考中"}
            </span>
          </div>
        )}
        <RiftHud
          engine={engine || null}
          enemyFormationOpen={enemyFormationOpen}
          onAction={dispatch}
          onBattleViewAction={adjustBattleView}
          onEnemyFormationOpenChange={setEnemyFormationOpen}
          autoplayEnabled={autoplayEnabled}
          onAutoplayChange={updateAutoplay}
          onAutoplayStart={startAiRun}
          onSettingsOpen={() => setSettingsOpen(true)}
          battlePaused={Boolean(bridgeRef.current?.battlePaused)}
          onBattlePauseChange={updateBattlePaused}
        />
        <Codex open={codexOpen} augmentHistory={engine?.state.augmentHistory || []} starterHistory={engine?.state.starterHistory || []} onClose={() => setCodexOpen(false)} />
        <ReleaseNotes open={releaseOpen} onClose={() => setReleaseOpen(false)} />
        {settingsOpen && (
          <div className="rift-settings-scrim" role="presentation" onPointerDown={() => setSettingsOpen(false)}>
            <section className="rift-settings-panel" role="dialog" aria-modal="true" aria-label="游戏设置" onPointerDown={(event) => event.stopPropagation()}>
              <header><strong>游戏设置</strong><button type="button" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}><CloseOutlined aria-hidden="true" /></button></header>
              <div className="rift-setting-strategy rift-setting-character-style">
                <span>角色样式</span>
                <div role="radiogroup" aria-label="角色样式">
                  {([[
                    "minimal", "极简",
                  ], [
                    "detail", "细节",
                  ], [
                    "classic", "棋子",
                  ]] as const).map(([style, label]) => (
                    <button
                      key={style}
                      type="button"
                      role="radio"
                      aria-checked={characterStyle === style}
                      onClick={() => setCharacterStyle(style)}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div className="rift-setting-row"><span>AI 托管</span><button type="button" className="rift-switch" role="switch" aria-label="AI 托管" aria-checked={autoplayEnabled} onClick={() => updateAutoplay(!autoplayEnabled)}><i /></button></div>
              <div className="rift-setting-strategy rift-setting-autopilot-style">
                <span>托管风格</span>
                <div role="radiogroup" aria-label="托管风格">
                  {AUTOPILOT_STYLE_OPTIONS.map(([style, label]) => (
                    <button
                      key={style}
                      type="button"
                      role="radio"
                      aria-checked={autopilotStyle === style}
                      onClick={() => updateAutopilotStyle(style)}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div className="rift-setting-strategy rift-setting-autopilot-level">
                <span>AI 等级</span>
                <div role="radiogroup" aria-label="AI 等级">
                  {AUTOPILOT_LEVEL_OPTIONS.map(([level, label]) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={autopilotLevel === level}
                      onClick={() => updateAutopilotLevel(level)}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div className="rift-setting-row"><span>后台继续战斗</span><button type="button" className="rift-switch" role="switch" aria-label="后台继续战斗" aria-checked={backgroundBattleEnabled} onClick={() => updateBackgroundBattle(!backgroundBattleEnabled)}><i /></button></div>
              <div className="rift-setting-row rift-setting-audio-mobile"><span>游戏声音</span><button type="button" className="rift-switch" role="switch" aria-label="游戏声音" aria-checked={!audioPreferences.muted} onClick={() => updateAudio({ muted: !audioPreferences.muted })}><i /></button></div>
              <label className="rift-setting-slider rift-setting-audio-mobile" htmlFor="rift-music-volume"><span>音乐</span><input id="rift-music-volume" aria-label="设置中的音乐音量" type="range" min="0" max="1" step="0.05" value={audioPreferences.musicVolume} onChange={(event) => updateAudio({ musicVolume: Number(event.target.value) })} /></label>
              <label className="rift-setting-slider rift-setting-audio-mobile" htmlFor="rift-effects-volume"><span>音效</span><input id="rift-effects-volume" aria-label="设置中的音效音量" type="range" min="0" max="1" step="0.05" value={audioPreferences.effectsVolume} onChange={(event) => updateAudio({ effectsVolume: Number(event.target.value) })} /></label>
              <button type="button" className="rift-setting-version" onClick={() => { setSettingsOpen(false); setReleaseOpen(true); }}>
                <span><HistoryOutlined aria-hidden="true" />版本与更新</span><b>v{AUTOCHESS_VERSION}</b>
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

const toolbarButtonStyle = {
  height: 30,
  padding: "0 12px",
  border: "1px solid #496579",
  borderRadius: 8,
  color: "#e3eff8",
  background: "#173246",
  cursor: "pointer",
  font: `700 12px ${FONT}`,
};

const toolbarIconButtonStyle = {
  ...toolbarButtonStyle,
  width: 30,
  padding: 0,
};
