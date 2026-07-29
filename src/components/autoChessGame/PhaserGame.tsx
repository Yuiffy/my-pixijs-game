"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AutoChessAudio,
  DEFAULT_AUDIO_PREFERENCES,
  type AudioPreferences,
  loadAudioPreferences,
} from "./audio";
import Codex from "./Codex";
import RiftHud, { type BattleViewAction } from "./RiftHud";
import "./RiftHud.css";
import { EngineBridge, type BridgeEvent } from "./phaser/EngineBridge";
import { createGameConfig } from "./phaser/gameConfig";
import {
  TOOLBAR_HEIGHT,
  logicalSizeFor,
  profileFor,
  renderSizeFor,
  uiScaleFor,
} from "./phaser/layout";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
  }
}

const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';

export default function AutoChessGame() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uiScaleRef = useRef(1);
  const bridgeRef = useRef<EngineBridge | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const audioRef = useRef<AutoChessAudio | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
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
    const audio = new AutoChessAudio(loadAudioPreferences());
    audioRef.current = audio;
    setAudioPreferences(loadAudioPreferences());

    const onBridgeEvent = (event: BridgeEvent) => {
      if (event.type === "audio") {
        audio.unlock().catch(() => {});
        audio.play(event.event);
      }
      if (event.type === "toast" && event.text) setMessage(event.text);
      if (event.type === "state" || event.type === "phase") {
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

    const onVisibility = () => bridge.setHidden(document.hidden);
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
    window.addEventListener("resize", onWindowResize);
    window.visualViewport?.addEventListener("resize", onWindowResize);
    setFullscreenSupported(Boolean(document.fullscreenEnabled && containerRef.current?.requestFullscreen));

    return () => {
      disposed = true;
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      bridge.onEvent = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      bridgeRef.current = null;
      audio.destroy();
      audioRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("fullscreenerror", onFullscreenError);
      window.removeEventListener("resize", onWindowResize);
      window.visualViewport?.removeEventListener("resize", onWindowResize);
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, []);

  useEffect(() => {
    const bridge = bridgeRef.current;
    bridge?.setCodexOpen(codexOpen);
    if (!codexOpen) {
      const scene = gameRef.current?.scene.getScene("RiftLineScene") as { refresh?: () => void } | undefined;
      scene?.refresh?.();
    }
  }, [codexOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
      if (codexOpen || enemyFormationOpen || event.repeat) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLButtonElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement || active?.getAttribute("contenteditable") === "true") return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [codexOpen, enemyFormationOpen, toggleFullscreen]);

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
            .rift-toolbar-status, .rift-audio-range, .rift-shortcut { display: none !important; }
            .rift-toolbar { justify-content: center !important; }
            .rift-toolbar button { min-width: 0 !important; padding-inline: 10px !important; }
          }
        `}</style>
        <div className="rift-toolbar" style={{ width: "100%", height: TOOLBAR_HEIGHT, flex: "0 0 auto", display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "5px 10px", boxSizing: "border-box", color: "#7892a5", overflowX: "auto", background: "#08131e", borderBottom: "1px solid rgba(117, 205, 255, 0.16)", font: `600 12px ${FONT}` }}>
          <span className="rift-toolbar-status" aria-live="polite" style={{ flex: 1, minWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#82a8bd" }}>{message}</span>
          <button type="button" onClick={() => setCodexOpen(true)} style={toolbarButtonStyle}>图鉴 / 本局天赋</button>
          <button type="button" aria-pressed={audioPreferences.muted} onClick={() => updateAudio({ muted: !audioPreferences.muted })} style={toolbarButtonStyle}>{audioPreferences.muted ? "静音" : "声音"}</button>
          <span className="rift-audio-range" style={{ display: "flex", alignItems: "center", gap: 4 }}>乐<input aria-label="音乐音量" type="range" min="0" max="1" step="0.05" value={audioPreferences.musicVolume} onChange={(event) => updateAudio({ musicVolume: Number(event.target.value) })} style={{ width: 58 }} /></span>
          <span className="rift-audio-range" style={{ display: "flex", alignItems: "center", gap: 4 }}>效<input aria-label="音效音量" type="range" min="0" max="1" step="0.05" value={audioPreferences.effectsVolume} onChange={(event) => updateAudio({ effectsVolume: Number(event.target.value) })} style={{ width: 58 }} /></span>
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
        />
        <Codex open={codexOpen} augmentHistory={engine?.state.augmentHistory || []} starterHistory={engine?.state.starterHistory || []} onClose={() => setCodexOpen(false)} />
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
