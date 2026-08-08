"use client";

/* eslint-disable no-console */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioMutedOutlined,
  CloseOutlined,
  HistoryOutlined,
  RobotOutlined,
  SettingOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import { AutoChessAIController } from "./ai/AutoChessAI";
import { AutoChessAutopilot } from "./ai/AutoChessAutopilot";
import type { AutopilotStyle } from "./ai/autopilotPolicy";
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
const AUTOPILOT_STRATEGY_VERSION = 3;
const LAST_RUN_TRACE_KEY = "rift-line-last-run-trace";
const LAST_RUN_DATABASE = "rift-line-run-traces";
const LAST_RUN_STORE = "traces";
const SESSION_TRACE_EVENT_LIMIT = 5_000;

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

const loadBackgroundBattlePreference = () => {
  try {
    return window.localStorage.getItem(BACKGROUND_BATTLE_KEY) === "1";
  } catch {
    return false;
  }
};

const loadAutopilotStrategy = (): AutopilotStyle => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUTOPILOT_STRATEGY_KEY) || "null");
    if (stored?.style === "seer2") return "seer";
    if (stored?.style === "go" && stored?.version !== AUTOPILOT_STRATEGY_VERSION) {
      return "seer";
    }
    return ["survival", "balanced", "highroll", "seer", "go"].includes(stored?.style)
      ? stored.style as AutopilotStyle
      : stored?.informationMode === "oracle" ? "seer" : "survival";
  } catch {
    return "survival";
  }
};

export default function AutoChessGame() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiScaleRef = useRef(1);
  const bridgeRef = useRef<EngineBridge | null>(null);
  const autopilotRef = useRef<AutoChessAutopilot | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const audioRef = useRef<AutoChessAudio | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(false);
  const [autopilotStyle, setAutopilotStyle] = useState<AutopilotStyle>("survival");
  const [backgroundBattleEnabled, setBackgroundBattleEnabled] = useState(false);
  const [audioPreferences, setAudioPreferences] = useState<AudioPreferences>(DEFAULT_AUDIO_PREFERENCES);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  const [message, setMessage] = useState("图鉴可查看棋子、羁绊与本局天赋");
  const [uiScale, setUiScale] = useState(1);
  const [, setRevision] = useState(0);
  const enemyFormationOpen = bridgeRef.current?.enemyFormationOpen || false;

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

  const updateAutopilotStrategy = useCallback((style: AutopilotStyle) => {
    setAutopilotStyle(style);
    autopilotRef.current?.setStrategy(style);
    try {
      window.localStorage.setItem(
        AUTOPILOT_STRATEGY_KEY,
        JSON.stringify({ style, version: AUTOPILOT_STRATEGY_VERSION }),
      );
    } catch {
      // The strategy still applies for this session when storage is unavailable.
    }
    setMessage(style === "go"
      ? "Go测试托管策略已更新。"
      : style === "seer" ? "看穿托管策略已更新。" : "托管策略已更新。");
    setRevision((value) => value + 1);
  }, []);

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
    );
    bridgeRef.current = bridge;
    const storedBackgroundBattle = loadBackgroundBattlePreference();
    bridge.setBackgroundBattleEnabled(storedBackgroundBattle);
    setBackgroundBattleEnabled(storedBackgroundBattle);
    const storedAutopilotStrategy = loadAutopilotStrategy();
    setAutopilotStyle(storedAutopilotStrategy);
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
    const autopilot = new AutoChessAutopilot(
      bridge,
      "evolution",
      {},
      storedAutopilotStrategy,
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
      if (active instanceof HTMLInputElement || active instanceof HTMLButtonElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement || active?.getAttribute("contenteditable") === "true") return;
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const { state } = bridge.engine;
      const key = event.key.toLowerCase();
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
        action = { type: "buyXp" };
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
  }, [codexOpen, enemyFormationOpen, releaseOpen, settingsOpen, toggleFullscreen]);

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
          <button type="button" className={autoplayEnabled ? "is-autoplay" : ""} aria-pressed={autoplayEnabled} onClick={() => updateAutoplay(!autoplayEnabled)} style={toolbarButtonStyle} title={autoplayEnabled ? "关闭托管并接管" : "让 AI 托管当前对局"}><RobotOutlined aria-hidden="true" /><span className="rift-toolbar-button-label">{autoplayEnabled ? "AI 托管中" : "手动指挥"}</span></button>
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
        />
        <Codex open={codexOpen} augmentHistory={engine?.state.augmentHistory || []} starterHistory={engine?.state.starterHistory || []} onClose={() => setCodexOpen(false)} />
        <ReleaseNotes open={releaseOpen} onClose={() => setReleaseOpen(false)} />
        {settingsOpen && (
          <div className="rift-settings-scrim" role="presentation" onPointerDown={() => setSettingsOpen(false)}>
            <section className="rift-settings-panel" role="dialog" aria-modal="true" aria-label="游戏设置" onPointerDown={(event) => event.stopPropagation()}>
              <header><strong>游戏设置</strong><button type="button" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}><CloseOutlined aria-hidden="true" /></button></header>
              <div className="rift-setting-row"><span>AI 托管</span><button type="button" className="rift-switch" role="switch" aria-label="AI 托管" aria-checked={autoplayEnabled} onClick={() => updateAutoplay(!autoplayEnabled)}><i /></button></div>
              <div className="rift-setting-strategy">
                <span>托管风格</span>
                <div role="radiogroup" aria-label="托管风格">
                  {([
                    ["survival", "稳健"],
                    ["balanced", "均衡"],
                    ["highroll", "搏上限"],
                    ["seer", "看穿"],
                    ["go", "Go测试"],
                  ] as const).map(([style, label]) => (
                    <button
                      key={style}
                      type="button"
                      role="radio"
                      aria-checked={autopilotStyle === style}
                      onClick={() => updateAutopilotStrategy(style)}
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
