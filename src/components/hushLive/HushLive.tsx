"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  action,
  broadcast,
  createGame,
  ending,
  freshSave,
  LEVELS,
  parseSave,
  record,
  Save,
  signal,
  stars,
  SPOTS,
  TASK_NAMES,
} from "./engine";
import { FIRST_STEPS, objective } from "./guide";
import {
  advance3D,
  clearControls,
  createRuntime,
  go3D,
  lookPoint,
  pause3D,
  rotateLockedView,
  rotateView,
  text3D,
} from "./runtime3d";
import { worldPoint } from "./navigation";
import { ApartmentSound } from "./sound3d";
import styles from "./hush3d.module.css";
import DeltaGame from "./DeltaGame";
import { SkinPortrait } from "./SkinDetails";
import { SKINS, skinOf, SkinId } from "./skins";
import DailyPanel from "./DailyPanel";
import TapButton from "./TapButton";
import MiniGame, { MINI_TITLES } from "./MiniGame";
import { createMini, miniInput, stepMini, Mini, MiniKind } from "./minigames";
import { dailyModal, mealOf, offAir } from "./daily";
import { householdStatus, onBreak } from "./household";

const Apartment = dynamic(() => import("./Apartment"), { ssr: false });
const STORAGE = "hush-live-v1";
type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};
class SceneBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    const { onError } = this.props;
    onError();
  }
  render() {
    const { failed } = this.state;
    const { children } = this.props;
    return failed ? null : children;
  }
}

export default function HushLive() {
  const runtime = useRef(createRuntime(freshSave()));
  const r = runtime.current;
  const shell = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ ...r.game });
  const [save, setSave] = useState(freshSave());
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(true);
  const audio = useRef<ApartmentSound | null>(null);
  const [note, setNote] = useState("");
  const [shareText, setShareText] = useState("");
  const [journal, setJournal] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const lookDrag = useRef<{ id: number; x: number; y: number } | null>(null);
  const stickPointer = useRef<number | null>(null);
  const actionPointer = useRef<number | null>(null);
  const seed = useRef(1);
  const lastPaint = useRef(0);
  const practice = useRef<Mini | null>(null);
  const practicePaused = useRef(false);
  const practiceSeed = useRef(1);

  const refresh = useCallback(
    () => setView({
        ...runtime.current.game,
        done: [...runtime.current.game.done],
      }),
    [],
  );
  const persist = useCallback((next: Save) => {
    runtime.current.save = next;
    setSave(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      setNote("浏览器未允许保存；本次仍能游玩，关闭页面后进度会丢失。");
    }
  }, []);
  const unlock = () => {
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const tick = useCallback(
    (dt: number) => {
      const { current } = runtime;
      if (practice.current) {
        if (!practicePaused.current) stepMini(practice.current, dt);
        if (current.manual || performance.now() - lastPaint.current > 70) {
          refresh(); lastPaint.current = performance.now();
        }
        return;
      }
      const before = current.game.phase;
      advance3D(current, dt);
      if (before === "playing" && current.game.phase === "result") {
        clearControls(current);
        persist(record(current.save, current.game));
        if (document.pointerLockElement) document.exitPointerLock();
      }
      if ((current.game.delta?.active || dailyModal(current.game)) && document.pointerLockElement) {
        clearControls(current);
        document.exitPointerLock();
      }
      audio.current?.update(current, soundRef.current);
      const now = performance.now();
      if (
        current.manual ||
        now - lastPaint.current > 70 ||
        current.game.phase !== before
      ) {
        refresh();
        lastPaint.current = now;
      }
    },
    [persist, refresh],
  );
  const onReady = useCallback(() => {
    setSceneReady(true);
    setSceneError(false);
    refresh();
  }, [refresh]);
  const onLost = useCallback(() => {
    if (practice.current) { practice.current.held = false; practicePaused.current = true; }
    pause3D(runtime.current);
    setSceneError(true);
    setSceneReady(false);
    refresh();
  }, [refresh]);
  const pause = useCallback(() => {
    const { current } = runtime;
    if (practice.current) {
      practice.current.held = false;
      practicePaused.current = !practicePaused.current;
      refresh();
      return;
    }
    if (current.game.phase === "playing") {
      pause3D(current);
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (current.game.phase === "paused" && current.webglReady) current.game.phase = "playing";
    setKnob({ x: 0, y: 0 });
    setJournal(false);
    refresh();
  }, [refresh]);
  const muteSignal = useCallback(() => {
    const { current } = runtime;
    if (current.focus === "partner") signal(current.game);
    else current.game.message = "走近TA，看着TA的眼睛，再打闭麦暗号。";
    refresh();
  }, [refresh]);

  useEffect(() => {
    const { current } = runtime;
    try {
      current.save = parseSave(localStorage.getItem(STORAGE));
    } catch {
      setNote("浏览器未允许保存；本次仍能完整游玩。");
    }
    const parameter = new URLSearchParams(window.location.search).get("seed");
    seed.current =
      parameter && /^\d{1,10}$/.test(parameter)
        ? Number(parameter) % 4294967296 || 1
        : Date.now() % 4294967296;
    current.game = createGame(
      parameter && current.save.unlocked >= 5
        ? 5
        : Math.min(4, current.save.unlocked),
      seed.current,
      current.save.unlocked,
      current.save.skin,
    );
    if (current.game.daily?.arrival !== undefined && current.game.daily.arrival !== "done") current.yaw = 0;
    setSave(current.save);
    refresh();
    const target = window as GameWindow;
    target.render_game_to_text = () => JSON.stringify({
        ...text3D(current),
        practice: practice.current,
        practicePaused: practicePaused.current,
        objective: objective(current.game),
        broadcast: broadcast(current.game),
      });
    target.advanceTime = (ms) => {
      current.manual = true;
      if (Number.isFinite(ms) && ms >= 0 && ms <= 300000) tick(ms / 1000);
    };
    const blur = () => {
      if (practice.current) { practice.current.held = false; practicePaused.current = true; }
      pause3D(current);
      lookDrag.current = null;
      stickPointer.current = null;
      actionPointer.current = null;
      setKnob({ x: 0, y: 0 });
      refresh();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    const lockChange = () => {
      const wasLocked = current.pointerLocked;
      current.pointerLocked = document.pointerLockElement === viewport.current?.querySelector("canvas");
      lookDrag.current = null;
      if (wasLocked && !current.pointerLocked && !current.game.delta?.active && !dailyModal(current.game)) {
        pause3D(current);
        refresh();
      }
    };
    const mouseMove = (event: MouseEvent) => {
      rotateLockedView(current, event.movementX, event.movementY);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        ["SELECT", "INPUT", "TEXTAREA"].includes(event.target.tagName)
      ) return;
      const key = event.key.toLowerCase();
      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key) &&
        current.game.phase === "playing"
      ) event.preventDefault();
      if (event.repeat && ["q", "m", "p", "escape", "f", "tab"].includes(key)) return;
      if (key === "escape") {
        if (current.game.phase === "playing" || practice.current) pause();
        return;
      }
      if (key === "p") {
        pause();
        return;
      }
      if (key === "f") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else shell.current?.requestFullscreen().catch(() => {});
        return;
      }
      if (current.game.phase !== "playing") return;
      if (dailyModal(current.game)) return;
      if (current.game.delta?.active && key !== "q") return;
      if (key === "e" && !event.repeat) current.pressed = true;
      if (key === "q") current.game.quiet = !current.game.quiet;
      if (key === "m") muteSignal();
      current.keys.add(key);
    };
    const keyUp = (event: KeyboardEvent) => {
      current.keys.delete(event.key.toLowerCase());
      if (event.key.toLowerCase() === "e") current.game.requireRelease = false;
    };
    const release = (event: PointerEvent) => {
      if (actionPointer.current === event.pointerId) {
        current.held = false;
        current.game.requireRelease = false;
        actionPointer.current = null;
      }
      if (stickPointer.current === event.pointerId) {
        current.stick = { x: 0, y: 0 };
        stickPointer.current = null;
        setKnob({ x: 0, y: 0 });
      }
      if (lookDrag.current?.id === event.pointerId) lookDrag.current = null;
    };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerlockchange", lockChange);
    document.addEventListener("mousemove", mouseMove);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerlockchange", lockChange);
      document.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      delete target.render_game_to_text;
      delete target.advanceTime;
      audio.current?.close();
    };
  }, [refresh, tick, pause, muteSignal]);

  const start = () => {
    if (!r.webglReady) return;
    clearControls(r);
    r.game.phase = "playing";
    setJournal(false);
    if (!audio.current) audio.current = new ApartmentSound();
    audio.current.resume().catch(() => {});
    refresh();
  };
  const selectNight = (level: number, nextSeed = seed.current) => {
    clearControls(r);
    unlock();
    r.game = createGame(level, nextSeed, r.save.unlocked, r.save.skin);
    r.yaw = r.game.daily?.arrival !== undefined && r.game.daily.arrival !== "done" ? 0 : -1.25;
    r.pitch = -0.04;
    r.focus = null;
    seed.current = nextSeed;
    setShareText("");
    setJournal(false);
    refresh();
  };
  const startPractice = (kind: MiniKind) => {
    clearControls(r);
    unlock();
    practiceSeed.current += 1;
    practice.current = createMini(kind, practiceSeed.current);
    practicePaused.current = false;
    refresh();
  };
  const closePractice = () => {
    if (practice.current) practice.current.held = false;
    practice.current = null;
    practicePaused.current = false;
    clearControls(r);
    refresh();
  };
  const goGoal = () => {
    go3D(r, objective(r.game).spot);
    refresh();
  };
  const selectSkin = (skin: SkinId) => {
    const next = { ...save, skin, partner: skin === "host" ? save.partner : "她" as const };
    persist(next);
    r.game = createGame(r.game.level, r.game.seed, next.unlocked, skin);
    refresh();
  };
  const share = async () => {
    const g = r.game;
    const url = `${window.location.origin}/game/hush-live${g.level === 5 ? `?seed=${g.seed}` : ""}`;
    const text = `《嘘，TA还在播 · 3D》${g.level === 5 ? `加班夜 #${g.seed}` : `第${g.level + 1}晚`}\n${ending(g)} · ${g.totalScore}分 / ${stars(g)}星 / 甜蜜${g.love}\n${url}`;
    setShareText(text);
    try {
      await navigator.clipboard.writeText(text);
      setNote("成绩已复制，可以和朋友分享这个夜晚。");
    } catch {
      setNote("可在文本框中选择并复制成绩。");
    }
  };
  const g = view;
  const mini = practice.current;
  const practiceChoices = (["toss", "eggs", "dial", "pick", "pins", "recoil"] as MiniKind[]).map(kind => (
    <button key={kind} data-practice={kind} aria-pressed={mini?.kind === kind} onClick={() => startPractice(kind)}>{MINI_TITLES[kind]}</button>
  ));
  const goal = objective(g);
  const a = action(g, r.focus);
  const b = broadcast(g);
  const [px, pz] = worldPoint(g.player);
  const target = lookPoint(r, goal.spot);
  const metres = Math.hypot(target.x - px, target.z - pz);
  const angle = Math.atan2(-(target.x - px), -(target.z - pz)) - r.yaw;
  const direction = Math.atan2(Math.sin(angle), Math.cos(angle));
  const marker =
    Math.abs(direction) < 0.35 ? "前方" : direction > 0 ? "← 左侧" : "右侧 →";
  const playing = g.phase === "playing";
  const ready = g.phase === "ready";
  const result = g.phase === "result";
  const minutes = `${Math.floor(Math.max(0, g.limit - g.elapsed) / 60)}:${String(Math.floor(Math.max(0, g.limit - g.elapsed) % 60)).padStart(2, "0")}`;

  return (
    <main ref={shell} className={styles.root} data-phase={g.phase}>
      <div
        ref={viewport}
        data-world3d="true"
        className={styles.world}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(event) => {
          if (!playing || r.game.delta?.active || dailyModal(r.game)) return;
          lookDrag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          if (
            event.pointerType === "mouse" &&
            event.button === 0 &&
            !document.pointerLockElement
          ) {
            const promise = viewport.current
              ?.querySelector("canvas")
              ?.requestPointerLock();
            promise?.catch(() => setNote("也可以按住鼠标右键拖动视角，或使用方向键转头。"),);
          }
        }}
        onPointerMove={(event) => {
          if (
            !playing ||
            r.pointerLocked ||
            lookDrag.current?.id !== event.pointerId
          ) return;
          rotateView(
            r,
            event.clientX - lookDrag.current.x,
            event.clientY - lookDrag.current.y,
          );
          lookDrag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }}
      >
        <SceneBoundary key={sceneVersion} onError={onLost}>
          <Apartment
            runtime={r}
            appearance={save}
            onTick={tick}
            onReady={onReady}
            onLost={onLost}
          />
        </SceneBoundary>
      </div>
      {(ready || result || g.phase === "paused" || sceneError) && (
        <div className={styles.veil} />
      )}
      <nav className={styles.nav}>
        <Link href="/demos">← 实验室</Link>
        <span>
          嘘，TA还在播 <b>3D</b>
        </span>
        <div>
          <button
            onClick={() => {
              const enabled = !sound;
              soundRef.current = enabled;
              setSound(enabled);
            }}
          >
            声音 {sound ? "开" : "关"}
          </button>
          {(playing || mini) && <button onClick={pause}>{mini && practicePaused.current ? "继续练习 ▶" : "暂停 Ⅱ"}</button>}
        </div>
      </nav>
      {sceneError ? (
        <section className={styles.menu}>
          <p className={styles.eyebrow}>稍等一下</p>
          <h1>
            房间的灯
            <br />
            需要重新亮起。
          </h1>
          <p>3D画面暂时中断，游戏已暂停。进度仍在这里。</p>
          <button
            className={styles.primary}
            onClick={() => {
              setSceneError(false);
              setSceneReady(false);
              setSceneVersion((v) => v + 1);
            }}
          >
            重新载入3D画面 →
          </button>
        </section>
      ) : mini ? (
        <section className={styles.practicePanel} aria-label="小游戏自由练习">
          <header><small>随手玩一局</small><button onClick={closePractice}>返回主界面</button></header>
          <p className={styles.practiceNote}>随时重来，按自己的节奏玩。不会改变夜晚进度。</p>
          {practicePaused.current ? (
            <div className={styles.practicePaused}><h2>歇一会儿。</h2><button className={styles.primary} onClick={pause}>继续练习 ▶</button></div>
          ) : (
<MiniGame
mini={mini}
onInput={(input, x, y) => {
            if (!practicePaused.current || input === "release") miniInput(mini, input, x, y);
            refresh();
          }}
onRestart={() => startPractice(mini.kind)} />
)}
          {mini.won && <p role="status" className={styles.practiceResult}>{mini.kind === "recoil" ? `一梭打完 · 命中 ${mini.score}/24` : mini.kind === "toss" ? "六面煎熟，骰子牛出锅！" : mini.kind === "eggs" ? "粒粒裹蛋，蛋炒饭出锅！" : "咔哒，门锁打开了。"}</p>}
          <div className={styles.practiceActions}><TapButton onActivate={() => startPractice(mini.kind)}>再来一局 ↻</TapButton><button onClick={closePractice}>玩够了，回家 →</button></div>
          <details className={styles.practiceSwitch}><summary>换个小游戏</summary><div className={styles.arcadeChoices}>{practiceChoices}</div></details>
        </section>
      ) : ready ? (
        <section className={styles.menu}>
          <p className={styles.eyebrow}>A LITTLE LOVE, OFF THE RECORD.</p>
          <h1>
            嘘，TA
            <br />
            还在播<span>。</span>
          </h1>
          <p className={styles.tagline}>屏幕里的偶像，生活里的恋人。</p>
          <div className={styles.brief}>
            <small>
              {g.level === 5 ? `加班夜 #${g.seed}` : `NIGHT 0${g.level + 1}`}
            </small>
            <h2>
              {g.level === 0
                ? "今晚，只拿一个充电器"
                : g.level === 5
                  ? "再陪你一个夜晚"
                  : LEVELS[g.level].title}
            </h2>
            <p>
              {g.level === 0
                ? "走进直播间，拿回床尾的充电器，再回到沙发。别让麦克风听见你。"
                : g.level === 5
                  ? `${g.daily?.household.arrival === "outside" ? "今晚下班回家，先轻轻开门。" : g.daily?.household.arrival === "sofa" ? "今晚本来就在家，从沙发旁开始。" : "今晚在家打游戏，从电脑旁开始。"} 猫咪、晚饭和临时离席，每晚有不同的小事。`
                  : LEVELS[g.level].subtitle}
            </p>
            {g.daily && <small>今晚的晚饭：{`${g.daily.homemade ? "亲手做的" : ""}${mealOf(g).name}`} · 忙完回沙发，故事会继续。</small>}
            {g.level === 5 && <button data-reroll-night onClick={() => selectNight(5, (g.seed + 7919) % 4294967296)}>换一个日常夜晚 ↻</button>}
          </div>
          <fieldset className={styles.skinPicker}>
            <legend>今晚和谁一起？</legend>
            <div>
              {SKINS.map((skin) => (
<button key={skin.id} data-skin={skin.id} aria-pressed={save.skin === skin.id} onClick={() => selectSkin(skin.id)}>
                <SkinPortrait id={skin.id} />
                <span>{skin.name}</span>
              </button>
))}
            </div>
            <small>{skinOf(save.skin).description}</small>
          </fieldset>
          <button
            id="hush-start"
            disabled={!sceneReady}
            className={styles.primary}
            onClick={start}
          >
            {sceneReady ? g.daily && g.daily.household.arrival !== "outside" ? "开始今晚的日常 →" : "轻轻走进家门 →" : "正在点亮小公寓…"}
          </button>
          <section className={styles.arcade} aria-label="单独玩小游戏">
            <h2>想先玩点什么？</h2>
            <p>不用等随机事件，点一个直接开始。</p>
            <div className={styles.arcadeChoices}>{practiceChoices}</div>
          </section>
          <p className={`${styles.instructions} ${styles.desktopOnly}`}>
            WASD 走动 · 鼠标转头 · 看向物品，轻按 E 拿取
            <br />
            点击画面锁定鼠标；Esc 暂停。也可右键拖动转头。
          </p>
          <p className={`${styles.instructions} ${styles.touchOnly}`}>
            左侧摇杆走动，滑动画面转头。
            <br />
            靠近并看向物品，再轻点互动按钮。
          </p>
          <details className={styles.settings}>
            <summary>选择夜晚与角色</summary>
            <div className={styles.identities}>
              <label htmlFor="hush-player">
                你是
                <select
                  id="hush-player"
                  aria-label="玩家身份"
                  value={save.player}
                  onChange={(e) => persist({
                      ...save,
                      player: e.target.value as Save["player"],
                    })}
                >
                  <option>男友</option>
                  <option>女友</option>
                </select>
              </label>
              <label htmlFor="hush-partner">
                恋人是
                <select
                  id="hush-partner"
                  aria-label="恋人称呼"
                  disabled={save.skin !== "host"}
                  value={save.partner}
                  onChange={(e) => persist({
                      ...save,
                      partner: e.target.value as Save["partner"],
                    })}
                >
                  <option value="她">她</option>
                  <option value="他">他</option>
                </select>
              </label>
            </div>
            <div className={styles.chapters}>
              {[...LEVELS.map((l) => l.title), "随机加班夜"].map((name, i) => (
                <button
                  key={name}
                  disabled={i > save.unlocked}
                  aria-pressed={i === g.level}
                  onClick={() => selectNight(i)}
                >
                  <span>
                    {i > save.unlocked ? "未解锁" : i === 5 ? "∞" : `0${i + 1}`}
                  </span>
                  {name}
                  <small>
                    {i < 5 && save.best[i]
                      ? `${save.best[i]}分`
                      : i === 5 && save.endlessBest
                        ? `${save.endlessBest}分`
                        : ""}
                  </small>
                </button>
              ))}
            </div>
          </details>
          <p className={styles.saveNote}>
            每晚结束自动保存星级与解锁 · 日常与下播故事随关卡展开
          </p>
        </section>
      ) : result ? (
        <section className={styles.menu}>
          <p className={styles.eyebrow}>
            {g.won ? "OFF AIR / 现在，只属于我们" : "今晚的小插曲"}
          </p>
          <h1 className={styles.resultTitle}>{g.daily && g.won ? "普通的夜晚，也想和你一起。" : ending(g)}</h1>
          <div className={styles.score}>
            {g.totalScore}
            <small>分</small>
          </div>
          <p className={styles.stars}>
            {"★".repeat(stars(g))}
            {"☆".repeat(3 - stars(g))}
          </p>
          <p className={styles.resultStory}>
            {g.daily && g.won ? g.daily.memory : g.won
              ? `${save.partner}把头靠在你的肩上：“谢谢你，我的${save.player}。现在可以放心抱了。”`
              : g.reason === "timeout"
                ? "直播结束了，事情还没有做完。先跟着金色目标标记走，下次一定赶得上。"
                : "弹幕刷满了问号。TA红着脸说：“是……家里那只猫。”试试慢走、关门，或等唱歌时再动手。"}
          </p>
          <p className={styles.resultStats}>
            甜蜜 {g.love} · 最高怀疑 {Math.round(g.peak)}% · 用时{" "}
            {Math.ceil(g.elapsed)}秒
          </p>
          <p className={styles.instructions}>
            {g.level === 0
              ? "第一晚三星：最高怀疑低于25%。"
              : "三星：最高怀疑低于25%，甜蜜至少25。"}
          </p>
          {g.won && [1, 3, 4].includes(g.level) && (
            <p className={styles.reward}>
              {g.level === 1
                ? "解锁棉拖鞋 · 轻步更安静"
                : g.level === 3
                  ? "解锁隔音门条 · 关门更隔音"
                  : "解锁随机加班夜 · 再陪TA一晚"}
            </p>
          )}
          <button
            className={styles.primary}
            onClick={() => {
              if (g.won) selectNight(
                  Math.min(5, g.level + 1),
                  g.level === 5 ? (g.seed + 7919) % 4294967296 : g.seed,
                );
              else {
                selectNight(g.level, g.seed);
                start();
              }
            }}
          >
            {g.won
              ? g.level >= 4
                ? "再开一个加班夜 →"
                : "下一个夜晚 →"
              : "再试一次 →"}
          </button>
          <div className={styles.resultButtons}>
            <button onClick={() => selectNight(g.level, g.seed)}>
              重玩本晚
            </button>
            <button
              onClick={() => {
                share().catch(() => {});
              }}
            >
              复制成绩分享
            </button>
          </div>
          {shareText && (
            <textarea
              aria-label="成绩分享文案"
              value={shareText}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          )}
        </section>
      ) : g.phase === "paused" ? (
        <section className={styles.menu}>
          <p className={styles.eyebrow}>时间停在这里</p>
          <h1>
            先歇
            <br />
            一会儿<span>。</span>
          </h1>
          <p>事情做到哪一步，回来就接着做。</p>
          <button className={styles.primary} onClick={pause}>
            继续今晚 →
          </button>
          <button
            className={styles.textButton}
            onClick={() => selectNight(g.level, g.seed)}
          >
            放弃本晚，返回准备
          </button>
        </section>
      ) : null}
      {playing && !sceneError && (
        <>
          <section className={styles.objective} data-objective={goal.key}>
            <small>
              {offAir(g) ? "下播以后 · 只属于我们" : g.level === 0
                ? `第 ${goal.step} / 3 步`
                : g.level === 5 ? "加班夜 · 当前目标" : `第 ${g.level + 1} 晚 · 当前目标`}
            </small>
            <h2>{goal.title}</h2>
            {householdStatus(g) && <small data-household-status>{householdStatus(g)}</small>}
            <div>
              <span>
                {metres.toFixed(1)}m · {marker}
              </span>
              <button
                data-assist="goal"
                disabled={!!g.busy || !!g.delta?.active || dailyModal(g)}
                onClick={goGoal}
              >
                {g.path.length ? "正在带路…" : "跟随目标 →"}
              </button>
            </div>
          </section>
          <section className={styles.liveStatus} aria-label="直播状态">
            <p className={b.music || g.muted > 0 ? styles.safe : ""}>
              {offAir(g) ? "○ OFF AIR · 可以放心说话了" : onBreak(g) ? "○ 暂时离席 · 已闭麦" : g.muted > 0
                ? `● 已闭麦 ${g.muted.toFixed(1)}s`
                : b.music
                  ? `♫ 唱歌掩护 ${Math.ceil(b.remaining)}s`
                  : b.sensitive
                    ? "● 耳语时段 · 小心声音"
                    : `● LIVE · ${Math.ceil(b.remaining)}s后唱歌`}
            </p>
            <div>
              <span>观众怀疑</span>
              <b>{Math.round(g.suspicion)}%</b>
            </div>
            <div className={styles.meter}>
              <i style={{ width: `${g.suspicion}%` }} />
            </div>
            <footer>
              <span>♡ {g.love}</span>
              <span>{offAir(g) ? "02:13" : minutes}</span>
            </footer>
          </section>
          <div
            className={`${styles.crosshair} ${a.key ? styles.active : ""} ${a.mode === "hold" && g.actionProgress > 0 ? styles.holding : ""} ${(g.delta?.active || dailyModal(g)) ? styles.hidden : ""}`}
            style={
              {
                "--progress": `${a.mode === "hold" ? g.actionProgress * 360 : 0}deg`,
              } as React.CSSProperties
            }
          >
            <i>
              {a.mode === "hold" && g.actionProgress > 0 && (
                <span>{Math.round(g.actionProgress * 100)}%</span>
              )}
            </i>
          </div>
          <div
            className={`${styles.interaction} ${dailyModal(g) ? styles.hidden : ""} ${r.focus === "partner" || g.delta?.active ? styles.partnerInteraction : ""}`}
          >
            <span>
              {g.busy
                ? g.busy.key === "food"
                  ? "正在把晚饭摆好…"
                  : "正在完成动作…"
                : a.key
                  ? `${a.label}${a.mode === "hold" ? ` · ${a.seconds}s` : ""}`
                  : r.focus
                    ? "这里暂时没有要做的事"
                    : `靠近并看向${SPOTS[goal.spot].name}`}
            </span>
            <small className={styles.desktopOnly}>
              {a.key
                ? a.mode === "hold"
                  ? "按住 E，松开可停"
                  : a.mode === "minigame"
                    ? "轻按 E 开始"
                    : "轻按 E，动作会自动完成"
                : "金色菱形标记着当前目标"}
            </small>
          </div>
          <div className={`${styles.dialogue} ${dailyModal(g) ? styles.hidden : ""}`}>
            <span>{g.message}</span>
          </div>
          <div
            className={`${styles.bottomTools} ${(g.delta?.active || dailyModal(g)) ? styles.hidden : ""}`}
          >
            <button
              aria-pressed={g.quiet}
              onClick={() => {
                r.game.quiet = !r.game.quiet;
                refresh();
              }}
            >
              {g.quiet ? "轻步" : "快走"} <kbd>Q</kbd>
            </button>
            <button onClick={() => setJournal((v) => !v)}>
              {journal ? "收起" : "计划"} {g.done.length}/{g.tasks.length}
            </button>
            {r.focus === "partner" && !offAir(g) && (
              <button disabled={g.cooldown > 0} onClick={muteSignal}>
                {g.cooldown > 0 ? `暗号 ${Math.ceil(g.cooldown)}s` : "请TA闭麦"}{" "}
                <kbd>M</kbd>
              </button>
            )}
          </div>
          {journal && (
            <aside className={styles.journal}>
              <strong>今晚的小计划</strong>
              <ol>
                {!g.daily && g.level === 0
                  ? FIRST_STEPS.map((t, i) => (
                      <li
                        key={t}
                        className={goal.step > i + 1 ? styles.done : ""}
                      >
                        {goal.step > i + 1 ? "✓" : i + 1} {t}
                      </li>
                    ))
                  : g.tasks.map((t) => (
                      <li
                        key={t}
                        className={g.done.includes(t) ? styles.done : ""}
                      >
                        {g.done.includes(t) ? "✓" : "○"} {TASK_NAMES[t]}
                      </li>
                    ))}
              </ol>
              <p>{g.chat}</p>
              <small>
                棉拖鞋{g.slippers ? "已穿上" : "第二晚解锁"} · 门条
                {g.seal ? "已安装" : "第四晚解锁"}
              </small>
              <p className={styles.instructions}>
                方向键可前后走、左右转头。Shift快跑；F全屏；P暂停。跟随目标会步行带路，不会自动替你做事。
              </p>
            </aside>
          )}
          <button
            className={`${styles.joystick} ${styles.touchOnly} ${(g.delta?.active || dailyModal(g)) ? styles.hidden : ""}`}
            aria-label="移动摇杆"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              stickPointer.current = event.pointerId;
              r.assist = null;
              r.autoLook = false;
              r.game.path = [];
            }}
            onPointerMove={(event) => {
              if (stickPointer.current !== event.pointerId) return;
              const box = event.currentTarget.getBoundingClientRect();
              const dx = event.clientX - box.x - box.width / 2;
              const dy = event.clientY - box.y - box.height / 2;
              const length = Math.max(34, Math.hypot(dx, dy));
              r.stick = { x: dx / length, y: -dy / length };
              setKnob({ x: (dx / length) * 28, y: (dy / length) * 28 });
            }}
          >
            <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}>
              走
            </span>
          </button>
          <button
            data-act="hold"
            className={`${styles.touchAction} ${(g.delta?.active || dailyModal(g)) ? styles.hidden : ""}`}
            disabled={!a.key || !!g.busy}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              actionPointer.current = event.pointerId;
              r.pressed = true;
              r.held = a.mode === "hold";
            }}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                r.pressed = true;
                r.held = a.mode === "hold";
              }
            }}
            onKeyUp={() => {
              r.held = false;
              r.game.requireRelease = false;
            }}
            onBlur={() => {
              r.held = false;
            }}
          >
            <span className={styles.desktopOnly}>
              {g.busy
                ? "正在完成动作…"
                : a.mode === "hold"
                  ? "按住 E 互动"
                  : "轻按 E 互动"}
            </span>
            <span className={styles.touchOnly}>
              {g.busy
                ? "正在完成动作…"
                : a.mode === "hold"
                  ? "按住互动"
                  : "轻点互动"}
            </span>
            <small>{a.key ? a.label : "先看向物品"}</small>
          </button>
          {g.daily && <DailyPanel game={r.game} onChange={refresh} />}
          {g.delta?.active && <DeltaGame game={r.game} onChange={refresh} />}
        </>
      )}
      {note && (
        <div className={styles.notice} role="status">
          {note}
          <button aria-label="关闭提示" onClick={() => setNote("")}>
            {" "}
            ×{" "}
          </button>
        </div>
      )}
    </main>
  );
}
