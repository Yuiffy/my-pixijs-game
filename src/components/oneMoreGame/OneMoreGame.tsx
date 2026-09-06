"use client";

// @refresh reset
import { useCallback, useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import {
  CONTROLS,
  HEIGHT,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  Sparring,
  WIDTH,
  freshProgress,
  parseChallenge,
  readProgress,
} from "./core";
import { SparringAudio } from "./audio";
import ChapterHud from "./ChapterHud";
import styles from "./OneMoreGame.module.css";

declare global {
  interface Window {
    suiSparring?: {
      snapshot: () => ReturnType<Sparring["snapshot"]>;
      advance: (ms: number) => void;
      live: () => void;
    };
  }
}
export default function OneMoreGame() {
  const [model] = useState(() => new Sparring(freshProgress()));
  const [audio] = useState(() => new SparringAudio());
  const [, refresh] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [settings, setSettings] = useState(false);
  const settingsRef = useRef(false);
  const shell = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const notify = useCallback(() => refresh((value) => value + 1), []);
  const focus = () => shell.current?.focus();
  const modal = (open: boolean) => {
    if (open) {
      model.pause();
      model.held.clear();
      audio.stop();
    }
    settingsRef.current = open;
    setSettings(open);
    notify();
    if (!open) focus();
  };

  useEffect(() => {
    let disposed = false;
    let game: Phaser.Game | null = null;
    let resize: ResizeObserver | null = null;
    try {
      model.restore(
        readProgress(
          localStorage.getItem(SAVE_KEY) ??
            localStorage.getItem(LEGACY_SAVE_KEY),
        ),
      );
    } catch {
      setSaveError(true);
    }
    const challenge = parseChallenge(new URL(window.location.href));
    if (challenge && model.progress.campaign.challengeKey !== JSON.stringify(challenge)) model.loadChallenge(challenge);
    audio.muted = model.progress.muted;
    audio.volume = model.progress.volume;
    model.onSave = (progress) => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
      } catch {
        setSaveError(true);
      }
    };
    const boot = async () => {
      try {
        const [{ default: Engine }, { SparringScene }] = await Promise.all([
          import("phaser"),
          import("./SparringScene"),
        ]);
        if (disposed || !host.current) return;
        const scene = new SparringScene(model, audio, () => {
          if (!disposed) {
            setLoaded(scene.ready);
            notify();
          }
        });
        game = new Engine.Game({
          type: Engine.AUTO,
          parent: host.current,
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: "#dce5df",
          render: { antialias: true, roundPixels: false },
          scale: {
            mode: Engine.Scale.RESIZE,
            autoCenter: Engine.Scale.CENTER_BOTH,
          },
          fps: { target: 60, limit: 60 },
          audio: { noAudio: true },
          scene: [scene],
        });
        game.canvas.setAttribute("aria-label", "岁己的三庭试炼");
        resize = new ResizeObserver(() => {
          const width = host.current?.clientWidth ?? 0;
          const height = host.current?.clientHeight ?? 0;
          if (game && width > 0 && height > 0 && (game.scale.width !== width || game.scale.height !== height)) game.scale.setParentSize(width, height);
        });
        resize.observe(host.current);
        const snapshot = () => ({ ...model.snapshot(), audio: audio.status });
        const advance = (ms: number) => scene.advance(ms);
        window.render_game_to_text = () => JSON.stringify(snapshot());
        window.advanceTime = advance;
        window.suiSparring = {
          snapshot,
          advance,
          live: () => {
            scene.manual = false;
          },
        };
      } catch (reason) {
        if (!disposed) setError(
            reason instanceof Error ? reason.message : "庭门暂时没有打开",
          );
      }
    };
    boot();
    const key = (event: KeyboardEvent, down: boolean) => {
      if (down && (event.ctrlKey || event.metaKey || event.altKey)) return;
      const { target } = event;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) return;
      if (
        (event.code === model.progress.bindings.pause ||
          (settingsRef.current && event.code === "Escape")) &&
        down &&
        !event.repeat
      ) {
        if (settingsRef.current) {
          settingsRef.current = false;
          setSettings(false);
        } else if (model.state.phase === "fight") {
          model.pause();
          audio.stop();
        } else if (model.state.phase === "paused") {
          model.resume();
          audio.unlock();
        }
        notify();
        event.preventDefault();
        return;
      }
      if (settingsRef.current) return;
      if (
        (event.code === "Enter" || event.code === "KeyR") &&
        down &&
        !event.repeat &&
        ["won", "lost", "ending"].includes(model.state.phase)
      ) {
        if (model.state.phase === "won") model.nextBoss();
        else if (model.state.phase === "ending") model.newChapter(model.progress.campaign.seed, "rematch");
        else model.start();
        audio.unlock();
        notify();
        event.preventDefault();
        return;
      }
      const bound = CONTROLS.find(
        (control) => model.progress.bindings[control.id] === event.code,
      )?.id;
      const input =
        bound ??
        (event.code === "ArrowLeft"
          ? "left"
          : event.code === "ArrowRight"
            ? "right"
            : undefined);
      if (input && input !== "pause") {
        model.input(input, down);
        if (model.state.phase === "fight") event.preventDefault();
      }
    };
    const down = (event: KeyboardEvent) => key(event, true);
    const up = (event: KeyboardEvent) => key(event, false);
    const pause = () => {
      model.pause("离开庭中，先歇一会儿");
      model.held.clear();
      audio.stop();
      notify();
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", visibility);
      model.onSave = undefined;
      resize?.disconnect();
      game?.destroy(true);
      audio.destroy();
      delete window.suiSparring;
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [audio, model, notify]);

  useEffect(() => {
    const dialog = shell.current?.querySelector<HTMLElement>('[role="dialog"]');
    dialog
      ?.querySelector<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
      )
      ?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
        ),
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => window.removeEventListener("keydown", trap);
  }, [model, model.state.phase, settings]);

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else shell.current?.requestFullscreen?.().catch(() => {});
  };
  return (
    <main
      ref={shell}
      tabIndex={-1}
      className={styles.game}
      aria-label="岁岁过招"
      data-phase={model.state.phase}
      data-layout={model.progress.layout}
    >
      <div className={styles.playArea}>
        <div className={styles.backdrop} />
        <div className={styles.world} ref={host} />
        <ChapterHud
          model={model}
          audio={audio}
          loaded={loaded}
          error={error}
          saveError={saveError}
          settings={settings}
          setSettings={modal}
          notify={notify}
          focus={focus}
          fullscreen={fullscreen}
        />
      </div>
    </main>
  );
}
