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
  CHARACTER_IDS,
  HEIGHT,
  STEP,
  WIDTH,
  SHOT_NAMES,
  DEPTH_NAMES,
  createGame,
  describeGame,
  emptyInput,
  finishSpecialCinematic,
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
import BeachAudio, { DEFAULT_AUDIO_SETTINGS } from "./audio";
import { introVoices, musicForGame, voicesForCinema, voicesForEvent } from "./audioCues";
import { createControls } from "./controls";
import { matchMediaClips, nextCinematic, selectCinematic } from "./cinematics";
import { CinemaCache } from "./mediaCache";
import { VariantPicker } from "./variants";
import type { MediaPlayback } from "./mediaCache";
import type {
  CinemaKind,
  CinemaMode,
  Cinematic,
  MediaManifest,
} from "./cinematics";
import styles from "./beachVolley.module.css";

type PlaybackCinematic = Cinematic & { playback: MediaPlayback };
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
  KeyI: [0, "aimUp"],
  KeyS: [0, "aimDown"],
  Space: [0, "jump"],
  KeyJ: [0, "hit"],
  KeyK: [0, "dive"],
  KeyL: [0, "special"],
  ArrowLeft: [1, "left"],
  ArrowRight: [1, "right"],
  ArrowUp: [1, "jump"],
  ArrowDown: [1, "aimDown"],
  Numpad8: [1, "aimUp"],
  Numpad5: [1, "aimDown"],
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
  opponent: "shiori",
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
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [voicesEnabled, setVoicesEnabled] = useState(true);
  const [audioSettingsReady, setAudioSettingsReady] = useState(false);
  const [audioView, setAudioView] = useState<ReturnType<BeachAudio["snapshot"]> | null>(null);
  const [best, setBest] = useState(0);
  const helpRef = useRef(false);
  const [cinematic, setCinematic] = useState<PlaybackCinematic | null>(null);
  const [cinemaMode, setCinemaMode] = useState<CinemaMode>("all");
  const [cinemaPaused, setCinemaPaused] = useState(false);
  const cinemaPauseRef = useRef(false);
  const mediaRef = useRef<MediaManifest | null>(null);
  const [media, setMedia] = useState<MediaManifest | null>(null);
  const cacheRef = useRef<CinemaCache | null>(null);
  const variantsRef = useRef(new VariantPicker());
  const modeRef = useRef<CinemaMode>("all");
  const playbackRef = useRef<PlaybackCinematic | null>(null);
  const cinemaSerialRef = useRef(0);
  const seenEventRef = useRef(0);
  const returnPausedRef = useRef(false);
  const helpCinemaPausedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sync = useCallback(() => {
    setView(describeGame(gameRef.current));
    setAudioView(audioRef.current?.snapshot() || null);
  }, []);
  const syncAudio = useCallback(() => {
    const audio = audioRef.current;
    const g = gameRef.current;
    const movie = playbackRef.current;
    const activePaused = g.phase !== "menu" && g.phase !== "result" && g.paused;
    audio?.setPaused(document.hidden || !document.hasFocus() || helpRef.current || (movie ? cinemaPauseRef.current : activePaused));
    audio?.setBackgroundPaused(!!movie && !movie.playback.cached);
    audio?.setScene(musicForGame(g, movie));
    audio?.setCinemaDialogue(!!movie?.dialogue);
  }, []);
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
  const choose = (next: Partial<Options>) => {
    const merged = { ...options, ...next };
    if (next.character && merged.character === merged.opponent) merged.opponent = options.character;
    setOptions(merged);
    gameRef.current = createGame(merged);
    audioRef.current?.resetMatch();
    syncAudio();
    sync();
  };
  const showCinema = useCallback(
    (kind: CinemaKind, side: Side = 0, pausedStart = false) => {
      const g = gameRef.current;
      const plan = selectCinematic(
        g,
        mediaRef.current,
        modeRef.current,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        kind,
        side,
        variantsRef.current,
      );
      if (!plan) return false;
      plan.sequenceId = `${plan.sequenceId}:${++cinemaSerialRef.current}`;
      plan.id = `${plan.sequenceId}:0`;
      resetInput();
      returnPausedRef.current = pausedStart;
      g.paused = true;
      const playback = cacheRef.current!.play(plan);
      const movie = { ...plan, playback };
      playbackRef.current = movie;
      cinemaRef.current = true;
      cinemaPauseRef.current = pausedStart;
      setCinemaPaused(pausedStart);
      setCinematic(movie);
      syncAudio();
      audioRef.current?.queueVoices(voicesForCinema(g, movie), movie.id);
      return true;
    },
    [resetInput, syncAudio],
  );
  const begin = (showIntro = true) => {
    audioRef.current?.unlock();
    audioRef.current?.resetMatch();
    resetInput();
    gameRef.current = createGame(options, Date.now() % 4294967296);
    seenEventRef.current = 0;
    startGame(gameRef.current);
    syncAudio();
    if (!showIntro || !showCinema("intro")) audioRef.current?.queueVoices(introVoices(gameRef.current), `intro:${++cinemaSerialRef.current}`);
    sync();
  };
  const finishCinema = useCallback(
    (expectedId?: string) => {
      const plan = playbackRef.current;
      if (!plan || (expectedId && expectedId !== plan.id)) return;
      if (plan.kind === "special" && !expectedId) return;
      audioRef.current?.clearVoices();
      resetInput();
      playbackRef.current = null;
      cacheRef.current?.finish();
      cinemaRef.current = false;
      setCinematic(null);
      setCinemaPaused(false);
      cinemaPauseRef.current = false;
      const g = gameRef.current;
      if (plan.kind === "special") finishSpecialCinematic(g);
      else if (plan.kind !== "result") skipTransition(g);
      g.paused = document.hidden || helpRef.current || returnPausedRef.current;
      if (plan.kind === "point" && g.event?.type === "win") {
        seenEventRef.current = g.event.id;
        audioRef.current?.event(g.event);
        if (!showCinema("result", g.event.side, g.paused)) audioRef.current?.queueVoices(voicesForEvent(g, g.event), `event:${g.event.id}`);
      }
      syncAudio();
      sync();
    },
    [resetInput, showCinema, sync, syncAudio],
  );
  const endClip = useCallback(
    (expectedId: string) => {
      const plan = playbackRef.current;
      if (!plan || plan.id !== expectedId) return;
      const next = nextCinematic(plan);
      if (!next) finishCinema(expectedId);
      else {
        const movie = { ...next, playback: cacheRef.current!.play(next) };
        playbackRef.current = movie;
        setCinematic(movie);
        syncAudio();
        audioRef.current?.queueVoices(voicesForCinema(gameRef.current, movie), movie.id);
      }
    },
    [finishCinema, syncAudio],
  );
  const playCinema = useCallback(() => {
    const id = playbackRef.current?.id;
    if (!id) return;
    videoRef.current?.play().catch((reason) => {
      // Pausing or replacing a video intentionally aborts its pending play promise.
      if (reason?.name !== "AbortError") endClip(id);
    });
  }, [endClip]);
  const pause = useCallback(() => {
    if (helpRef.current) return;
    if (cinemaRef.current) {
      const next = !cinemaPauseRef.current;
      cinemaPauseRef.current = next;
      setCinemaPaused(next);
      if (next) videoRef.current?.pause();
      else {
        returnPausedRef.current = false;
        playCinema();
      }
      syncAudio();
      sync();
      return;
    }
    const g = gameRef.current;
    if (g.phase === "menu" || g.phase === "result") return;
    g.paused = !g.paused;
    resetInput();
    syncAudio();
    sync();
  }, [playCinema, resetInput, sync, syncAudio]);
  const menu = () => {
    resetInput();
    cinemaRef.current = false;
    playbackRef.current = null;
    cacheRef.current?.finish();
    setCinematic(null);
    seenEventRef.current = 0;
    gameRef.current = createGame(options);
    audioRef.current?.resetMatch();
    syncAudio();
    sync();
  };
  const openHelp = () => {
    helpCinemaPausedRef.current = cinemaPauseRef.current;
    helpRef.current = true;
    setHelp(true);
    videoRef.current?.pause();
    if (cinemaRef.current) {
      cinemaPauseRef.current = true;
      setCinemaPaused(true);
    }
    if (gameRef.current.phase !== "menu") gameRef.current.paused = true;
    resetInput();
    syncAudio();
    sync();
  };
  const closeHelp = () => {
    helpRef.current = false;
    setHelp(false);
    if (
      cinemaRef.current &&
      !document.hidden &&
      !returnPausedRef.current &&
      !helpCinemaPausedRef.current
    ) {
      cinemaPauseRef.current = false;
      playCinema();
      setCinemaPaused(false);
    }
    syncAudio();
    sync();
  };
  const press = (source: string, side: Side, action: Action) => {
    const g = gameRef.current;
    if (
      helpRef.current ||
      cinemaRef.current ||
      g.paused ||
      g.phase === "menu" ||
      g.phase === "result"
    ) return;
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
    const cache = new CinemaCache();
    cacheRef.current = cache;
    const manifestController = new AbortController();
    const audio = new BeachAudio();
    audioRef.current = audio;
    const target = window as GameWindow;
    const draw = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && assetsRef.current) renderGame(ctx, assetsRef.current, gameRef.current, reduced.matches);
    };
    const step = () => {
      const g = gameRef.current;
      stepGame(g, controlsRef.current.inputs, STEP);
      const { event } = g;
      audio.event(event, g.players.map((player) => player.character), g.lastContact);
      if (event && event.id !== seenEventRef.current && !cinemaRef.current) {
        seenEventRef.current = event.id;
        let shown = false;
        if (event.type === "special") shown = showCinema("special", event.side);
        else if (event.type === "point") shown = showCinema("point", event.side);
        else if (event.type === "win") shown = showCinema("result", event.side);
        else if (event.type === "serve") audio.clearVoices();
        if (!shown && ["special", "point", "win"].includes(event.type)) audio.queueVoices(voicesForEvent(g, event), `event:${event.id}`);
      }
      syncAudio();
    };
    const advance = (ms: number) => {
      const steps = Math.max(
        0,
        Math.round(Math.min(120000, ms) / (STEP * 1000)),
      );
      for (let i = 0; i < steps; i++) step();
      syncAudio();
      draw();
      sync();
    };
    target.render_game_to_text = () => JSON.stringify({
        ...describeGame(gameRef.current),
        assetsReady: !!assetsRef.current,
        inputs: controlsRef.current.inputs,
        cinematic: playbackRef.current
          ? {
              id: playbackRef.current.id,
              kind: playbackRef.current.kind,
              side: playbackRef.current.side,
              character: playbackRef.current.character,
              src: playbackRef.current.src,
              playbackSrc: playbackRef.current.playback.src,
              quality: playbackRef.current.playback.quality,
              cached: playbackRef.current.playback.cached,
              paused: cinemaPauseRef.current,
              outcome: playbackRef.current.outcome,
              index: playbackRef.current.index,
              count: playbackRef.current.clips.length,
              dialogue: playbackRef.current.dialogue?.text || null,
              paired: playbackRef.current.paired,
            }
          : null,
        cinemaMode: modeRef.current,
        mediaCache: cache.snapshot(),
        audio: audio.snapshot(),
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
    fetch("/games/beach-volley/media.json", { signal: manifestController.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.characters) {
          mediaRef.current = data;
          setMedia(data);
        }
      })
      .catch(() => {});
    try {
      const saved = Number(localStorage.getItem("beach-volley-best") || 0);
      if (Number.isFinite(saved)) setBest(saved);
      const mode = localStorage.getItem("beach-volley-cinema");
      if (mode === "all" || mode === "key" || mode === "off") {
        modeRef.current = mode;
        setCinemaMode(mode);
      }
    } catch {
      /* Storage is optional. */
    }
    try {
      const saved = JSON.parse(localStorage.getItem("beach-volley-audio") || "null");
      if (saved && typeof saved.enabled === "boolean" && typeof saved.music === "boolean" && typeof saved.voices === "boolean") {
        setMuted(!saved.enabled); setMusicEnabled(saved.music); setVoicesEnabled(saved.voices);
        audio.configure(saved);
      } else audio.configure(DEFAULT_AUDIO_SETTINGS);
    } catch { audio.configure(DEFAULT_AUDIO_SETTINGS); }
    setAudioSettingsReady(true);
    const loop = (now: number) => {
      const elapsed = Math.min((now - last) / 1000, 0.06);
      last = now;
      if (!manual && assetsRef.current) {
        accumulator += elapsed;
        while (accumulator >= STEP) {
          step();
          accumulator -= STEP;
        }
      }
      syncAudio();
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
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.isContentEditable) ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLInputElement
      ) return;
      const g = gameRef.current;
      if (
        cinemaRef.current &&
        !helpRef.current &&
        (event.code === "Enter" || event.code === "Escape")
      ) {
        event.preventDefault();
        if (!event.repeat) {
          if (playbackRef.current?.kind !== "special") finishCinema();
          else if (event.code === "Escape") pause();
        }
        return;
      }
      if (event.code === "Escape" || event.code === "KeyP") {
        if (!event.repeat && !helpRef.current) pause();
        return;
      }
      if (event.code === "KeyF") {
        if (!event.repeat) fullscreen();
        return;
      }
      // Keep native Enter/Space activation on menus, toolbars and dialogs.
      if (
        (event.code === "Enter" || event.code === "Space") &&
        event.target instanceof Element &&
        event.target.closest("button, a")
      ) return;
      if (
        helpRef.current ||
        cinemaRef.current ||
        g.paused ||
        g.phase === "menu" ||
        g.phase === "result"
      ) return;
      if (event.code === "Enter") {
        if (!event.repeat && (g.phase === "intro" || g.phase === "point")) { audio.clearVoices(); skipTransition(g); syncAudio(); }
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
      audio.setPaused(true);
      resetInput();
      if (cinemaRef.current) {
        returnPausedRef.current = true;
        cinemaPauseRef.current = true;
        videoRef.current?.pause();
        setCinemaPaused(true);
      }
      const g = gameRef.current;
      if (g.phase !== "menu" && g.phase !== "result") {
        g.paused = true;
        sync();
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
      else syncAudio();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", syncAudio);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive = false;
      manifestController.abort();
      cache.dispose();
      cancelAnimationFrame(frame);
      audio.dispose();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", syncAudio);
      document.removeEventListener("visibilitychange", visibility);
      delete target.render_game_to_text;
      delete target.advanceTime;
      delete target.beachVolley;
    };
  }, [finishCinema, pause, resetInput, showCinema, sync, syncAudio]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const { connection } = navigator as Navigator & {
      connection?: EventTarget & { saveData?: boolean; effectiveType?: string; downlink?: number };
    };
    const preload = () => {
      const lightOnly = connection?.saveData || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType || "") || (connection?.downlink !== undefined && connection.downlink < 1.5);
      cacheRef.current?.update(
        ready ? matchMediaClips(createGame(options), media, cinemaMode, reduced.matches) : [],
        !lightOnly,
      );
    };
    preload();
    reduced.addEventListener("change", preload);
    connection?.addEventListener("change", preload);
    return () => {
      reduced.removeEventListener("change", preload);
      connection?.removeEventListener("change", preload);
    };
  }, [ready, media, options, cinemaMode]);
  useEffect(() => {
    if (!audioSettingsReady) return;
    const settings = { enabled: !muted, music: musicEnabled, voices: voicesEnabled };
    audioRef.current?.configure(settings);
    try { localStorage.setItem("beach-volley-audio", JSON.stringify(settings)); } catch { /* Optional preferences. */ }
  }, [muted, musicEnabled, voicesEnabled, audioSettingsReady]);
  useEffect(() => {
    if (ready && audioSettingsReady) audioRef.current?.prepare([options.character, options.opponent]);
  }, [ready, options.character, options.opponent, muted, musicEnabled, voicesEnabled, audioSettingsReady]);
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
    if (cinematic) {
      if (cinemaPauseRef.current) videoRef.current?.pause();
      else playCinema();
    }
  }, [cinematic, playCinema]);
  useEffect(() => {
    if (!cinematic || cinemaPaused || help) return;
    const timeout = window.setTimeout(
      () => endClip(cinematic.id),
      (cinematic.duration + 12) * 1000,
    );
    return () => window.clearTimeout(timeout);
  }, [cinematic, cinemaPaused, help, endClip]);

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
      className={`${styles.root} ${isResult && !cinematic ? styles.resultRoot : ""}`}
      onPointerDownCapture={() => audioRef.current?.unlock()}
      onKeyDownCapture={(event) => { if (!event.repeat) audioRef.current?.unlock(); }}
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
              audioRef.current?.configure({ enabled: muted, music: musicEnabled, voices: voicesEnabled });
              if (muted) audioRef.current?.unlock();
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
          {(active || cinematic) && (
            <button
              type="button"
              aria-label={
                cinematic
                  ? cinemaPaused
                    ? "继续演出"
                    : "暂停演出"
                  : view.paused
                    ? "继续比赛"
                    : "暂停比赛"
              }
              onClick={pause}
            >
              {(cinematic ? cinemaPaused : view.paused) ? (
                "▶"
              ) : (
                <PauseOutlined />
              )}
            </button>
          )}
        </div>
      </header>
      <main
        className={`${styles.stage} ${isMenu ? styles.menuStage : ""} ${view.phase === "intro" || view.phase === "point" || view.freeze > 0 ? styles.closeupStage : ""}`}
      >
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          aria-label={`${CHARACTERS[options.character].name}和${CHARACTERS[options.opponent].name}的沙滩排球场`}
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
            <div className={styles.eyebrow}>
              {CHARACTERS[options.character].latin} ×{" "}
              {CHARACTERS[options.opponent].latin} · SUMMER RALLY
            </div>
            <h1>
              晴海<span>双打</span>
              <b>BEACH VOLLEY</b>
            </h1>
            <p className={styles.tagline}>海风正好。下一球，轮到你。</p>
            <div className={styles.selection}>
              <span className={styles.label}>01 / 选择你的角色</span>
              <div className={styles.characters}>
                {CHARACTER_IDS.map((id) => (
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
                <label htmlFor="beach-opponent">
                  对阵
                  <select
                    id="beach-opponent"
                    aria-label="对阵角色"
                    value={options.opponent}
                    onChange={(event) => choose({ opponent: event.target.value as Character })}
                  >
                    {CHARACTER_IDS.map((id) => (
                      <option key={id} value={id}>
                        {CHARACTERS[id].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="beach-cinema">
                  演出
                  <select
                    id="beach-cinema"
                    aria-label="演出模式"
                    value={cinemaMode}
                    onChange={(event) => {
                      const mode = event.target.value as CinemaMode;
                      modeRef.current = mode;
                      setCinemaMode(mode);
                      try {
                        localStorage.setItem("beach-volley-cinema", mode);
                      } catch {
                        /* Optional. */
                      }
                    }}
                  >
                    <option value="all">完整</option>
                    <option value="key">精彩</option>
                    <option value="off">关闭</option>
                  </select>
                </label>
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
                    : `${CHARACTERS[view.players[0].character].energyName}能量 ${view.players[0].energy}%`}
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
                    : `${CHARACTERS[view.players[1].character].energyName}能量 ${view.players[1].energy}%`}
                </small>
              </div>
            </div>
            <div className={styles.rally} data-special-windup={view.specialWindup?.side}>
              {view.specialWindup
                ? `${CHARACTERS[view.players[view.specialWindup.side].character].special} · 准备接球！`
                : view.rally >= 3
                ? `${view.rally} RALLY`
                : `${CHARACTERS[options.character].latin} × ${CHARACTERS[options.opponent].latin}`}
            </div>
            <div className={styles.aimReadout} aria-label="击球方向">
              <span data-aim="0">
                1P · {SHOT_NAMES[view.players[0].aim.lift]} /{" "}
                {DEPTH_NAMES[view.players[0].aim.depth]}
              </span>
              {options.mode === "local" && (
                <span data-aim="1">
                  2P · {SHOT_NAMES[view.players[1].aim.lift]} /{" "}
                  {DEPTH_NAMES[view.players[1].aim.depth]}
                </span>
              )}
            </div>
            {(view.phase === "intro" || view.phase === "point") && (
              <button
                type="button"
                className={styles.skip}
                onClick={() => {
                  audioRef.current?.clearVoices();
                  skipTransition(gameRef.current);
                  syncAudio();
                  sync();
                }}
              >
                跳过演出 ↗
              </button>
            )}
          </>
        )}
        {cinematic && (
          <div
            className={styles.cinema}
            data-cinematic={cinematic.kind}
            data-character={cinematic.character}
          >
            <video
              key={cinematic.id}
              ref={videoRef}
              src={cinematic.playback.src}
              data-quality={cinematic.playback.quality}
              poster={cinematic.poster}
              preload="auto"
              playsInline
              muted={muted || !voicesEnabled || !cinematic.dialogue}
              onEnded={() => endClip(cinematic.id)}
              onError={() => endClip(cinematic.id)}
            >
              <track kind="captions" />
            </video>
            <div>
              <small>
                {cinematic.kind === "intro"
                  ? "SUMMER ENTRANCE"
                  : cinematic.kind === "special"
                    ? "SPECIAL MOVE"
                    : cinematic.kind === "point"
                      ? "RALLY MOMENT"
                      : "SUMMER FINALE"}
              </small>
              <span>{cinematic.title}</span>
              <p>{cinematic.dialogue ? `「${cinematic.dialogue.text}」` : audioView?.voice
                ? `${audioView.voice.side + 1}P · ${CHARACTERS[audioView.voice.character].name}「${audioView.voice.text}」`
                : cinematic.line}</p>
              {cinemaPaused && (
                <button type="button" onClick={pause}>
                  继续演出 ▶
                </button>
              )}
            </div>
            {cinematic.kind !== "special" && (
              <button
                type="button"
                className={styles.skip}
                onClick={() => finishCinema()}
              >
                {cinematic.kind === "intro" ? "跳过开场" : "跳过特写"} ↗{" "}
                <small>Enter</small>
              </button>
            )}
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
        {isResult && !cinematic && (
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
              <fieldset className={styles.audioSettings}>
                <legend>声音</legend>
                <label htmlFor="beach-music"><input id="beach-music" type="checkbox" checked={musicEnabled} onChange={(event) => setMusicEnabled(event.target.checked)} />背景音乐</label>
                <label htmlFor="beach-voices"><input id="beach-voices" type="checkbox" checked={voicesEnabled} onChange={(event) => setVoicesEnabled(event.target.checked)} />角色语音</label>
              </fieldset>
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
                  <dd>发球 / 击球 · 同时按方向选球路</dd>
                </div>
                <div>
                  <dt>W / I · S</dt>
                  <dd>向上高吊 · 向下下压，松开为平抽</dd>
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
                向前 + J 打底线，向后 + J 打近网；上 / 下方向选择高吊和下压。
                例如 D + S + J 压向底线，A + I + J 轻吊近网。空格起跳后用 S + J
                打出陡扣。
                发球同样可瞄准，虚线显示球路；击球时锁定方向，接球积蓄必杀能量。
              </p>
              <p className={styles.helpTip}>
                同机 2P：方向键移动 / ↑ 跳，数字小键盘 1 / 2 / 3 或斜杠 /、句点
                .、逗号 , 击球、扑救、必杀；↓ 下压，小键盘 8 高吊、5 下压。
                手机可同时按方向与击球。Enter / Esc 可跳过开场与胜败视频；
                必杀须完整播放，Esc / P 可暂停。特写后有 0.8 秒蓄力动作，
                防守方可移动、跳跃或扑救；关闭演出也保留这段反应时间。
                完整演出含小分反应，精彩模式省略小分。
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
          {CHARACTERS[options.character].name} ×{" "}
          {CHARACTERS[options.opponent].name} <i>·</i> 晴海沙滩
        </span>
        {active ? (
          <span className={styles.keyboardHint}>
            A D 移动 <i>·</i> 空格 跳跃 <i>·</i> J 扣杀 <i>·</i> K 扑救 <i>·</i>{" "}
            L 必杀 <i>·</i> 方向 + J 瞄准
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
            {controlButton("aimUp", "高吊")}
            {controlButton("aimDown", "下压")}
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
              {controlButton("aimUp", "高", 1)}
              {controlButton("aimDown", "压", 1)}
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
