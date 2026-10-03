"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import GameShareButton from "@/app/game/GameShareButton";
import {
  createFitness,
  startFitness,
  stepFitness,
  pauseFitness,
  chooseUpgrade,
  WORLD,
  DAYS,
  DAY_SECONDS,
  EXERCISE_DEFS,
  UPGRADE_DEFS,
  TARGET_WEIGHT,
  TARGET_MUSCLE,
  TARGET_BODY_FAT,
  TALENT_DEFS,
  WEAPON_DEFS,
  workoutCost,
} from "./engine";
import type { FitnessInput, FitnessState, Talent, WeaponKind } from "./engine";
import { drawFitness } from "./renderer";
import styles from "./fitness.module.css";

type Records = { best: number; wins: number; runs: number };
type FitnessWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};
const RECORD_KEY = "sui-fitness-record-v2";
const SUI_IMAGE = "/images/materials/岁己SUI小猫帽无外套长发金瞳.PNG";
const STEP = 1 / 60;
const ROUND_NAMES = [
  "先从出门开始",
  "奶茶街大作战",
  "年卡不能白办",
  "再练最后一组",
  "今天的我更有力",
];
const EMPTY_RECORD: Records = { best: 0, wins: 0, runs: 0 };

function Meter({
  label,
  value,
  display,
  detail,
  tone,
}: {
  label: string;
  value: number;
  display: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className={`${styles.meter} ${styles[tone]}`}>
      <div>
        <span>{label}</span>
        <strong>{display}</strong>
      </div>
      <div className={styles.track}>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <small>{detail}</small>
    </div>
  );
}

export default function SuiFitness() {
  const root = useRef<HTMLElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const game = useRef<FitnessState>(createFitness(20261003));
  const [view, setView] = useState<FitnessState>(() => structuredClone(game.current),);
  const [records, setRecords] = useState<Records>(EMPTY_RECORD);
  const recordsRef = useRef(EMPTY_RECORD);
  const recorded = useRef<FitnessState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const helpRef = useRef(false);
  const [notice, setNotice] = useState("");
  const keys = useRef(new Set<string>());
  const workoutPointers = useRef(new Set<number>());
  const workoutKeys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0, pointer: -1 });
  const [stickView, setStickView] = useState({ x: 0, y: 0 });
  const pending = useRef({ dash: false, pulse: false });
  const assets = useRef<{ sui?: HTMLImageElement }>({});
  const drawRef = useRef<() => void>(() => {});

  const sync = useCallback(() => {
    setView(structuredClone(game.current));
    drawRef.current();
  }, []);
  const clearInput = useCallback(() => {
    keys.current.clear();
    workoutKeys.current.clear();
    workoutPointers.current.clear();
    pending.current = { dash: false, pulse: false };
    stick.current = { x: 0, y: 0, pointer: -1 };
    setStickView({ x: 0, y: 0 });
  }, []);
  const pause = useCallback(() => {
    if (helpRef.current) return;
    if (game.current.phase === "paused") startFitness(game.current);
    else pauseFitness(game.current);
    clearInput();
    sync();
  }, [clearInput, sync]);
  const fullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setNotice("当前浏览器暂不支持全屏，仍可继续挑战。");
    }
  }, []);
  const readInput = useCallback((): FitnessInput => {
    const k = keys.current;
    const input: FitnessInput = {
      x:
        Number(k.has("KeyD") || k.has("ArrowRight")) -
        Number(k.has("KeyA") || k.has("ArrowLeft")) +
        stick.current.x,
      y:
        Number(k.has("KeyS") || k.has("ArrowDown")) -
        Number(k.has("KeyW") || k.has("ArrowUp")) +
        stick.current.y,
      dash: pending.current.dash,
      pulse: pending.current.pulse,
      exercise:
        k.has("KeyE") ||
        workoutKeys.current.size > 0 ||
        workoutPointers.current.size > 0,
    };
    pending.current.dash = false;
    pending.current.pulse = false;
    return input;
  }, []);
  const updateUrl = (seed: number, talent: Talent = game.current.talent) => {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", String(seed));
    url.searchParams.set("talent", talent);
    window.history.replaceState(null, "", url);
  };
  const begin = (newSeed = false, ready = false) => {
    clearInput();
    const seed = newSeed
      ? window.crypto.getRandomValues(new Uint32Array(1))[0]
      : game.current.seed;
    game.current = createFitness(seed, game.current.talent);
    updateUrl(seed);
    if (!ready) startFitness(game.current);
    recorded.current = null;
    helpRef.current = false;
    setHelp(false);
    sync();
    if (!ready) window.requestAnimationFrame(() => canvas.current?.focus());
  };
  const showHelp = () => {
    if (game.current.phase === "playing") pauseFitness(game.current);
    clearInput();
    helpRef.current = true;
    setHelp(true);
    sync();
  };
  const closeHelp = () => {
    helpRef.current = false;
    setHelp(false);
  };

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const requested = params.get("seed");
    const requestedTalent = params.get("talent") as Talent;
    const talent = Object.keys(TALENT_DEFS).includes(requestedTalent)
      ? requestedTalent
      : "strength";
    if (
      requested !== null &&
      /^\d{1,10}$/.test(requested) &&
      Number(requested) <= 4294967295
    ) {
      game.current = createFitness(Number(requested), talent);
    } else game.current = createFitness(game.current.seed, talent);
    updateUrl(game.current.seed);
    try {
      const raw = JSON.parse(localStorage.getItem(RECORD_KEY) || "null");
      if (
        raw &&
        ["best", "wins", "runs"].every(
          (key) => Number.isSafeInteger(raw[key]) && raw[key] >= 0,
        )
      ) {
        recordsRef.current = { best: raw.best, wins: raw.wins, runs: raw.runs };
        setRecords(recordsRef.current);
      }
    } catch {
      setNotice("本机纪录暂时不可用，本局仍可玩。");
    }

    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (alive) {
        assets.current.sui = image;
        drawRef.current();
      }
    };
    image.src = SUI_IMAGE;
    let frame = 0;
    let manual = false;
    let last = performance.now();
    let accumulator = 0;
    let lastUi = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = window as FitnessWindow;
    const draw = () => {
      const ctx = canvas.current?.getContext("2d");
      if (ctx) drawFitness(ctx, game.current, assets.current, {
          reducedMotion: reduced.matches,
        });
    };
    drawRef.current = draw;
    const simulate = (ms: number) => {
      if (!Number.isFinite(ms) || ms < 0) return;
      manual = true;
      const steps = Math.round(Math.min(300000, ms) / (STEP * 1000));
      for (let i = 0; i < steps; i++) stepFitness(game.current, STEP, readInput());
      sync();
    };
    target.render_game_to_text = () => JSON.stringify({
        ...game.current,
        coordinateSystem: "top-left origin, x right, y down; world 1100x700",
        records: recordsRef.current,
        inputs: {
          ...stick.current,
          keys: Array.from(keys.current),
          exercise:
            workoutPointers.current.size > 0 ||
            workoutKeys.current.size > 0 ||
            keys.current.has("KeyE"),
        },
        assetsReady: !!assets.current.sui,
        helpOpen: helpRef.current,
      });
    target.advanceTime = simulate;
    const tick = (now: number) => {
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      if (!manual) {
        accumulator += dt;
        while (accumulator >= STEP) {
          stepFitness(game.current, STEP, readInput());
          accumulator -= STEP;
        }
      }
      draw();
      if (now - lastUi >= 90) {
        sync();
        lastUi = now;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const isTyping = (event: KeyboardEvent) => event.target instanceof HTMLElement &&
      !!event.target.closest(
        'input, textarea, select, [contenteditable="true"]',
      );
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event) || helpRef.current) return;
      if (event.code === "KeyF") {
        event.preventDefault();
        if (!event.repeat) fullscreen();
        return;
      }
      if (event.code === "KeyP" || event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat) pause();
        return;
      }
      if (game.current.phase !== "playing") return;
      // Focused buttons keep their native activation, including the hold button.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("button, a") &&
        event.code === "Space"
      ) return;
      const supported = [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space",
        "KeyQ",
        "KeyE",
      ];
      if (!supported.includes(event.code)) return;
      event.preventDefault();
      if (event.repeat && !keys.current.has(event.code)) return;
      keys.current.add(event.code);
      if (!event.repeat && event.code === "Space") pending.current.dash = true;
      if (!event.repeat && event.code === "KeyQ") pending.current.pulse = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
    };
    const background = () => {
      if (game.current.phase === "playing") pauseFitness(game.current);
      clearInput();
      sync();
    };
    const hidden = () => {
      if (document.hidden) background();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", background);
    document.addEventListener("visibilitychange", hidden);
    frame = window.requestAnimationFrame(tick);
    setLoaded(true);
    sync();
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", background);
      document.removeEventListener("visibilitychange", hidden);
      if (target.advanceTime === simulate) delete target.advanceTime;
      delete target.render_game_to_text;
      drawRef.current = () => {};
    };
  }, [clearInput, fullscreen, pause, readInput, sync]);

  useEffect(() => {
    const s = game.current;
    if (!["won", "lost"].includes(view.phase) || recorded.current === s) return;
    recorded.current = s;
    const next = {
      best: Math.max(recordsRef.current.best, s.score),
      wins: recordsRef.current.wins + Number(s.phase === "won"),
      runs: recordsRef.current.runs + 1,
    };
    recordsRef.current = next;
    setRecords(next);
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(next));
    } catch {
      setNotice("本机纪录无法保存，本局仍可玩。");
    }
    clearInput();
  }, [view.phase, clearInput]);

  const modal =
    help || ["paused", "upgrade", "won", "lost"].includes(view.phase);
  useEffect(() => {
    if (surface.current) surface.current.inert = modal;
    if (!modal) return undefined;
    clearInput();
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.code === "Escape" && help) {
        event.preventDefault();
        helpRef.current = false;
        setHelp(false);
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href]",
        ) || [],
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      window.removeEventListener("keydown", trapFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, [modal, help, view.phase, clearInput]);

  const joystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      stick.current.pointer !== event.pointerId ||
      game.current.phase !== "playing"
    ) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.34;
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    if (length < 0.12) {
      x = 0;
      y = 0;
    }
    stick.current.x = x;
    stick.current.y = y;
    setStickView({ x, y });
  };
  const endStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stick.current.pointer !== event.pointerId) return;
    stick.current = { x: 0, y: 0, pointer: -1 };
    setStickView({ x: 0, y: 0 });
  };
  const holdExercise = (
    event: ReactPointerEvent<HTMLButtonElement>,
    down: boolean,
  ) => {
    if (down && game.current.phase === "playing") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      workoutPointers.current.add(event.pointerId);
    } else workoutPointers.current.delete(event.pointerId);
  };
  const holdExerciseKey = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    down: boolean,
  ) => {
    if (!["Space", "Enter"].includes(event.code)) return;
    event.preventDefault();
    if (down && game.current.phase === "playing") {
      if (!event.repeat || workoutKeys.current.has(event.code)) workoutKeys.current.add(event.code);
    } else workoutKeys.current.delete(event.code);
  };
  const nearby = view.zones.find(
    (zone) => Math.hypot(zone.x - view.player.x, zone.y - view.player.y) < zone.radius,
  );
  const interactive = view.phase === "playing";
  const exerciseCost = workoutCost(view);
  // Keep a near miss visibly outside the goal even when the usual label rounds.
  const weightLabel =
    view.weight > TARGET_WEIGHT + 1e-9 &&
    Number(view.weight.toFixed(2)) <= TARGET_WEIGHT
      ? `>${TARGET_WEIGHT.toFixed(2)}`
      : view.weight.toFixed(2);
  const muscleLabel =
    view.muscle < TARGET_MUSCLE - 1e-9 &&
    Math.round(view.muscle) >= TARGET_MUSCLE
      ? `<${TARGET_MUSCLE}`
      : String(Math.round(view.muscle));
  const fatLabel = view.bodyFat > TARGET_BODY_FAT + 1e-9 && Number(view.bodyFat.toFixed(2)) <= TARGET_BODY_FAT
    ? `>${TARGET_BODY_FAT.toFixed(2)}` : view.bodyFat.toFixed(2);

  return (
    <main ref={root} className={styles.root}>
      <div ref={surface} className={styles.surface}>
        <header className={styles.header}>
          <Link href="/demos#games" className={styles.back}>
            ← <span>游戏大厅</span>
          </Link>
          <div className={styles.brand}>
            岁己<span>今天也要动</span>
            <i>MOVE A LITTLE, FEEL A LOT.</i>
          </div>
          <div className={styles.tools}>
            <button onClick={showHelp} title="玩法说明" aria-label="玩法说明">
              ?
            </button>
            <button
              onClick={pause}
              disabled={!["playing", "paused"].includes(view.phase)}
              title="暂停 P"
              aria-label={view.phase === "paused" ? "继续挑战" : "暂停"}
            >
              Ⅱ
            </button>
            <button
              onClick={() => fullscreen()}
              title="全屏 F"
              aria-label="全屏"
            >
              ⛶
            </button>
            <GameShareButton gamePath="/game/sui-fitness" />
          </div>
        </header>
        <section className={styles.hud} aria-label="挑战状态">
          <div className={styles.day}>
            <small>
              STAGE {String(view.day).padStart(2, "0")} / {DAYS}
            </small>
            <strong>{ROUND_NAMES[view.day - 1]}</strong>
            <span>
              {Math.max(0, Math.ceil(DAY_SECONDS - view.time))}
              <small> 秒</small>
            </span>
          </div>
          <Meter
            label="体重"
            value={((view.weight - 40) / 14) * 100}
            display={`${weightLabel} kg`}
            detail="48.00 起步 · 目标 40.00"
            tone={view.weight > 52 ? "danger" : "coral"}
          />
          <Meter
            label="体脂率"
            value={view.bodyFat * 2}
            display={`${fatLabel}%`}
            detail={`目标 ≤${TARGET_BODY_FAT}% · 脂肪 ${view.fatMass.toFixed(2)} kg`}
            tone="blue"
          />
          <Meter
            label="肌肉"
            value={view.muscle}
            display={muscleLabel}
            detail="目标 ≥55 · 底线 20"
            tone={view.muscle < 35 ? "danger" : "plum"}
          />
          <Meter
            label="动力"
            value={view.motivation}
            display={`${Math.floor(view.motivation)}`}
            detail="攒起来，去运动"
            tone="sage"
          />
          <div className={styles.level}>
            <span>
              <b>Lv.{view.level}</b>
              <small>
                {Math.floor(view.xp)} / {view.nextXp} XP
              </small>
            </span>
            <div className={styles.track}>
              <i
                style={{
                  width: `${Math.min(100, (view.xp / view.nextXp) * 100)}%`,
                }}
              />
            </div>
            <small>拾取 +5 · 训练 +12 起</small>
          </div>
        </section>
        {view.phase === "ready" && (
          <section className={styles.buildPicker} aria-label="选择开局天赋">
            <div className={styles.buildTitle}>
              <b>今天想怎么练？</b>
              <small>开局天赋不同，后续武器可以混搭</small>
            </div>
            <div className={styles.buildChoices}>
              {(
                Object.entries(TALENT_DEFS) as [
                  Talent,
                  (typeof TALENT_DEFS)[Talent],
                ][]
              ).map(([id, talent]) => (
                <button
                  key={id}
                  data-talent={id}
                  aria-pressed={view.talent === id}
                  onClick={() => {
                    game.current = createFitness(game.current.seed, id);
                    updateUrl(game.current.seed, id);
                    sync();
                  }}
                >
                  <span style={{ color: talent.color }}>
                    {WEAPON_DEFS[talent.weapon].icon}
                  </span>
                  <b>{talent.name}</b>
                  <small>{talent.description}</small>
                </button>
              ))}
            </div>
          </section>
        )}
        <div className={styles.stage}>
          <canvas
            ref={canvas}
            width={WORLD.width}
            height={WORLD.height}
            tabIndex={0}
            aria-label="运动小镇。方向键或 WASD 移动，空格冲刺，Q 拒绝诱惑，运动区按住 E 锻炼。"
          />
          {view.phase === "ready" && (
            <div className={styles.intro}>
              <div className={styles.introCopy}>
                <p className={styles.eyebrow}>
                  SUI&apos;S LITTLE FITNESS ADVENTURE
                </p>
                <h1>
                  今天
                  <br />
                  也要<span>动。</span>
                </h1>
                <p className={styles.tagline}>
                  DQ 很甜。
                  <br />
                  变强的自己，也很值得期待。
                </p>
                <button
                  id="start-fitness"
                  className={styles.primary}
                  disabled={!loaded}
                  onClick={() => begin()}
                >
                  开始今天的挑战 <span>↗</span>
                </button>
                <p className={styles.introHint}>
                  48.00 → 40.00 kg · {TALENT_DEFS[view.talent].name}开局
                </p>
                <button className={styles.textButton} onClick={showHelp}>
                  第一次来？看看玩法 →
                </button>
              </div>
              {/* The site's existing character artwork is reused for this game. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.heroSui}
                src={SUI_IMAGE}
                alt="白发金瞳、戴小猫帽的岁己"
              />
              <div className={styles.heroStamp}>
                再坚持
                <br />
                <b>一小会！</b>
              </div>
            </div>
          )}
          {interactive && (
            <>
              <div className={styles.waveTrack}>
                <i style={{ width: `${(view.time / DAY_SECONDS) * 100}%` }} />
              </div>
              <div className={styles.message} role="status">
                {view.messageTime > 0
                  ? view.message
                  : "拾取与训练得经验 → 随时升级 → 混搭攻击。"}
              </div>
              <div className={styles.workoutPrompt}>
                {nearby ? (
                  <>
                    <b>{EXERCISE_DEFS[nearby.kind].name}</b>
                    <span>
                      {view.exercise
                        ? `正在锻炼 ${Math.round(view.exercise.progress * 100)}%`
                        : view.motivation < exerciseCost
                          ? `动力不足 · 需要 ${exerciseCost}`
                          : `站定按住 E · ${exerciseCost} 动力 / 2 秒`}
                    </span>
                  </>
                ) : (
                  <span>攻击自动释放 · 去运动区按住 E 训练</span>
                )}
              </div>
            </>
          )}
        </div>
        {view.phase !== "ready" && (
          <div className={styles.loadout} aria-label="当前装备与训练效果">
            <div>
              {(Object.entries(view.weapons) as [WeaponKind, number][])
                .filter(([, rank]) => rank > 0)
                .map(([kind, rank]) => (
                  <span key={kind}>
                    <i>{WEAPON_DEFS[kind].icon}</i>
                    {WEAPON_DEFS[kind].name} <b>{rank}</b>
                  </span>
                ))}
            </div>
            <small>
              击退 {view.defeats} · 燃脂储备 {view.burnReserve.toFixed(2)} kg
            </small>
          </div>
        )}
        <div className={styles.controls}>
          <div className={styles.keyboard}>
            <span>
              <kbd>WASD</kbd> / <kbd>↑ ↓ ← →</kbd> 移动
            </span>
            <span>
              <kbd>Space</kbd> 冲刺
            </span>
            <span>
              <kbd>Q</kbd> 拒绝诱惑
            </span>
            <span>
              <kbd>E</kbd> 锻炼
            </span>
          </div>
          <div className={styles.mobileControls}>
            <div
              className={styles.joystick}
              data-testid="fitness-joystick"
              role="group"
              aria-label="拖动摇杆移动"
              onPointerDown={(event) => {
                if (!interactive || stick.current.pointer !== -1) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                stick.current.pointer = event.pointerId;
                joystick(event);
              }}
              onPointerMove={joystick}
              onPointerUp={endStick}
              onPointerCancel={endStick}
              onLostPointerCapture={endStick}
            >
              <span className={styles.stickCross}>＋</span>
              <i
                style={{
                  transform: `translate(${stickView.x * 27}px, ${stickView.y * 27}px)`,
                }}
              />
            </div>
            <div className={styles.abilities}>
              <button
                aria-label="冲刺 Space"
                disabled={
                  !interactive || view.dashCooldown > 0 || view.stamina < 30
                }
                onClick={() => {
                  pending.current.dash = true;
                }}
              >
                冲刺 Space
                <small>
                  {view.dashCooldown > 0
                    ? `${view.dashCooldown.toFixed(1)}s`
                    : "闪开！"}
                </small>
              </button>
              <button
                aria-label="拒绝诱惑 Q"
                disabled={
                  !interactive || view.pulseCooldown > 0 || view.motivation < 25
                }
                onClick={() => {
                  pending.current.pulse = true;
                }}
              >
                拒绝诱惑 Q
                <small>
                  {view.pulseCooldown > 0
                    ? `${view.pulseCooldown.toFixed(1)}s`
                    : "25 动力"}
                </small>
              </button>
              <button
                aria-label="锻炼 E"
                disabled={!interactive}
                className={view.exercise ? styles.activeExercise : ""}
                onPointerDown={(e) => holdExercise(e, true)}
                onPointerUp={(e) => holdExercise(e, false)}
                onPointerCancel={(e) => holdExercise(e, false)}
                onLostPointerCapture={(e) => holdExercise(e, false)}
                onKeyDown={(e) => holdExerciseKey(e, true)}
                onKeyUp={(e) => holdExerciseKey(e, false)}
                onBlur={() => workoutKeys.current.clear()}
              >
                锻炼 E
                <small>
                  {nearby ? EXERCISE_DEFS[nearby.kind].name : "运动区内按住"}
                </small>
              </button>
            </div>
          </div>
        </div>
        <footer className={styles.footer}>
          <span>
            本机最高 {records.best.toLocaleString()} · 通关 {records.wins} 次
          </span>
          <span>
            开局 #{view.seed} · {notice || "体重与热量为游戏数值"}
          </span>
        </footer>
      </div>

      {modal && (
        <div className={styles.backdrop}>
          <section
            ref={dialog}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fitness-dialog-title"
            tabIndex={-1}
          >
            {help ? (
              <>
                <p className={styles.eyebrow}>A LITTLE MOVEMENT EVERY DAY</p>
                <h2 id="fitness-dialog-title">诱惑来了，先动起来。</h2>
                <ol className={styles.rules}>
                  <li>
                    <b>美食会追你。</b>DQ
                    慢但重、牛肉干快速贴身，西西里柠檬柚会瞄准冲刺。碰到增加脂肪负担，已装备武器会自动攻击。
                  </li>
                  <li>
                    <b>动力靠行动攒。</b>击退敌人掉落小星星，拾取后去运动区按住
                    E /「锻炼 E」完成训练。星星还给 5 经验，训练给 12
                    起；攒够经验立即升级选武器或强化，最多混搭三种武器。
                  </li>
                  <li>
                    <b>三种运动，三条路线。</b>
                    站定两秒、消耗 24 动力（自我鼓励可降至
                    16）。移动或碰撞会打断。健身房保肌强攻；游泳积累更多燃脂储备；居家训练保肌防护。储备会逐步兑现，不会一练就减一大截。
                  </li>
                  <li>
                    <b>别只盯着秤。</b>从 48.00 kg、35% 体脂开始，达到体重
                    ≤40.00 kg、体脂 ≤22%、肌肉 ≥55
                    就提前通关。五阶段结束仍未达标，或体重到 54.00 kg、肌肉降到
                    20，会结束挑战。站着等不会消耗脂肪或获得经验。
                  </li>
                </ol>
                <div className={styles.ruleKeys}>
                  <span>WASD / 方向键移动</span>
                  <span>空格冲刺</span>
                  <span>Q 消耗 25 动力清场</span>
                  <span>E 按住锻炼</span>
                  <span>P / Esc 暂停 · F 全屏</span>
                </div>
                <p className={styles.smallPrint}>
                  五个游戏阶段各 {DAY_SECONDS} 秒；体重与体脂是本作的虚构数值。
                </p>
                <button className={styles.primary} onClick={closeHelp}>
                  收起说明
                </button>
              </>
            ) : view.phase === "paused" ? (
              <>
                <p className={styles.eyebrow}>TAKE A BREATH</p>
                <h2 id="fitness-dialog-title">歇一下，也算计划的一部分。</h2>
                <p>
                  第 {view.day} 阶段 · Lv.{view.level} · 还剩{" "}
                  {Math.ceil(DAY_SECONDS - view.time)} 秒<br />
                  切出页面会自动暂停，回来后主动继续。
                </p>
                <button
                  aria-label="继续挑战"
                  className={styles.primary}
                  onClick={() => {
                    startFitness(game.current);
                    clearInput();
                    sync();
                  }}
                >
                  继续挑战 →
                </button>
                <div className={styles.dialogActions}>
                  <button onClick={showHelp}>玩法说明</button>
                  <button onClick={() => begin()}>重新挑战</button>
                  <button onClick={() => begin(true, true)}>换个开局</button>
                </div>
              </>
            ) : view.phase === "upgrade" ? (
              <>
                <p className={styles.eyebrow}>
                  LEVEL {view.level} · EARNED BY MOVING
                </p>
                <h2 id="fitness-dialog-title">努力有回报，选个新招。</h2>
                <p>时间已暂停。选新武器或强化，接着打这波诱惑。</p>
                <div className={styles.upgrades}>
                  {view.choices.map((id) => {
                    const upgrade = UPGRADE_DEFS.find((item) => item.id === id);
                    if (!upgrade) return null;
                    return (
                      <button
                        key={id}
                        data-testid="fitness-upgrade"
                        data-upgrade={id}
                        onClick={() => {
                          chooseUpgrade(game.current, id);
                          clearInput();
                          sync();
                          window.requestAnimationFrame(() => canvas.current?.focus(),);
                        }}
                      >
                        <span>
                          {upgrade.weapon
                            ? WEAPON_DEFS[upgrade.weapon].icon
                            : "＋"}
                        </span>
                        <b>
                          {upgrade.name}
                          {upgrade.weapon
                            ? ` · ${view.weapons[upgrade.weapon] ? `Lv.${view.weapons[upgrade.weapon]} → ${view.weapons[upgrade.weapon] + 1}` : "新武器"}`
                            : ""}
                        </b>
                        <small>{upgrade.description}</small>
                        <i>带上它 →</i>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className={styles.eyebrow}>
                  {view.phase === "won"
                    ? "A STRONGER YOU"
                    : "ANOTHER TRY, ANOTHER DAY"}
                </p>
                <h2 id="fitness-dialog-title">
                  {view.phase === "won"
                    ? "今天的岁己，更有力！"
                    : "今天先到这里。"}
                </h2>
                <p>
                  {view.resultReason ||
                    (view.phase === "won"
                      ? "美食很可爱，你的坚持也很可爱。"
                      : "调整一下路线，再来一次。")}
                </p>
                <div className={styles.resultStats}>
                  <div>
                    <small>本次得分</small>
                    <b>{view.score.toLocaleString()}</b>
                  </div>
                  <div>
                    <small>最终体重</small>
                    <b>
                      {weightLabel}
                      <i> kg</i>
                    </b>
                  </div>
                  <div>
                    <small>最终体脂</small>
                    <b>
                      {fatLabel}
                      <i>%</i>
                    </b>
                  </div>
                </div>
                <p className={styles.resultSummary}>
                  肌肉 {muscleLabel} · Lv.{view.level} · 用时{" "}
                  {view.elapsed.toFixed(1)} 秒 · {view.defeats} 次击退
                </p>
                <div className={styles.workoutReport}>
                  {(["gym", "swim", "home"] as const).map((kind) => (
                    <span key={kind}>
                      {EXERCISE_DEFS[kind].name} <b>{view.workouts[kind]} 次</b>
                    </span>
                  ))}
                </div>
                <button
                  aria-label="重新挑战"
                  className={styles.primary}
                  onClick={() => begin()}
                >
                  重新挑战 <span>↗</span>
                </button>
                <div className={styles.dialogActions}>
                  <button onClick={() => begin(true, true)}>换个开局</button>
                  <Link href="/demos#games">回游戏大厅 →</Link>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
