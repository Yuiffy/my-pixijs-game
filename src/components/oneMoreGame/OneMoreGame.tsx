"use client";

// @refresh reset

import { useCallback, useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AudioMutedOutlined,
  CheckOutlined,
  CloseOutlined,
  ExpandOutlined,
  HeartFilled,
  PauseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  SafetyOutlined,
  DoubleRightOutlined,
} from "@ant-design/icons";
import {
  freshProgress,
  HEIGHT,
  Input,
  MOVES,
  readProgress,
  SAVE_KEY,
  Sparring,
  VOWS,
  WIDTH,
  CONTROLS,
  DEFAULT_BINDINGS,
  KEY_OPTIONS,
  keyLabel,
} from "./core";
import { SparringAudio } from "./audio";
import type { SparringScene } from "./SparringScene";
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

const clock = (ms: number) => `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;

export default function OneMoreGame() {
  const [model] = useState(() => new Sparring(freshProgress()));
  const [audio] = useState(() => new SparringAudio());
  const [, refresh] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'controls' | 'sound'>('controls');
  const [saveError, setSaveError] = useState(false);
  const shell = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SparringScene | null>(null);
  const settingsRef = useRef(false);
  const notify = useCallback(() => refresh((n) => n + 1), []);

  useEffect(() => {
    let disposed = false;
    let game: Phaser.Game | null = null;
    try {
      model.progress = readProgress(localStorage.getItem(SAVE_KEY));
    } catch {
      setSaveError(true);
    }
    audio.muted = model.progress.muted;
    audio.volume = model.progress.volume;
    model.onSave = (progress) => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
      } catch {
        setSaveError(true);
      }
    };
    const start = async () => {
      try {
        const [{ default: Engine }, { SparringScene: Scene }] =
          await Promise.all([import("phaser"), import("./SparringScene")]);
        if (disposed || !host.current) return;
        const current = new Scene(model, audio, () => {
          if (!disposed) {
            setLoaded(current.ready);
            notify();
          }
        });
        scene.current = current;
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
          scene: [current],
        });
        const { canvas } = game;
        canvas.setAttribute("aria-label", "岁己与饼师傅的道场");
        const advance = (ms: number) => current.advance(ms);
        const snapshot = () => ({ ...model.snapshot(), audio: audio.status });
        window.render_game_to_text = () => JSON.stringify(snapshot());
        window.advanceTime = advance;
        window.suiSparring = {
          snapshot,
          advance,
          live: () => {
            current.manual = false;
          },
        };
      } catch (reason) {
        if (!disposed) setError(
            reason instanceof Error ? reason.message : "道场暂时没有打开",
          );
      }
    };
    start();
    const key = (event: KeyboardEvent, down: boolean) => {
      const { target } = event;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) return;
      if ((event.code === model.progress.bindings.pause || (settingsRef.current && event.code === 'Escape')) && down && !event.repeat) {
        if (settingsRef.current) {
          setSettings(false);
          settingsRef.current = false;
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
        ["won", "lost"].includes(model.state.phase)
      ) {
        model.start();
        audio.unlock();
        notify();
        event.preventDefault();
        return;
      }
      const bound = CONTROLS.find(control => model.progress.bindings[control.id] === event.code)?.id;
      const input = bound ?? (event.code === 'ArrowLeft' ? 'left' : event.code === 'ArrowRight' ? 'right' : undefined);
      if (input && input !== 'pause') {
        model.input(input, down);
        if (model.state.phase === "fight") event.preventDefault();
      }
    };
    const down = (event: KeyboardEvent) => key(event, true);
    const up = (event: KeyboardEvent) => key(event, false);
    const pause = () => {
      model.pause("离开道场，先歇一会儿");
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
      game?.destroy(true);
      audio.destroy();
      scene.current = null;
      delete window.suiSparring;
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [audio, model, notify]);

  useEffect(() => {
    const dialog = shell.current?.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]'));
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', trap);
    return () => window.removeEventListener('keydown', trap);
  }, [model, model.state.phase, settings]);

  const { state: s, progress } = model;
  const fighting = s.phase === "fight";
  const preflight = s.phase === "ready";
  const result = s.phase === "won" || s.phase === "lost";
  const currentVow = VOWS.find((v) => v.id === progress.vow)!;
  const lastParry = [...s.events].reverse().find(event => event.cue === 'parry');
  const parryVisible = fighting && lastParry && s.feedbackT - lastParry.visualAt < 650;
  const startFight = () => {
    audio.stop();
    model.start();
    audio.unlock();
    shell.current?.focus();
    notify();
  };
  const mute = () => {
    audio.muted = !audio.muted;
    progress.muted = audio.muted;
    if (audio.muted) audio.stop();
    else audio.unlock();
    model.save();
    notify();
  };
  const showSettings = () => {
    model.pause();
    audio.stop();
    model.held.clear();
    settingsRef.current = true;
    setSettingsTab('controls');
    setSettings(true);
    notify();
  };
  const closeSettings = () => {
    settingsRef.current = false;
    setSettings(false);
    shell.current?.focus();
  };
  const buttonInput = (action: Input) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      model.input(action, true);
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      model.input(action, false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => model.input(action, false),
    onLostPointerCapture: () => model.input(action, false),
  });
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else shell.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <main
      ref={shell}
      tabIndex={-1}
      className={styles.game}
      aria-label="岁岁过招"
      data-phase={s.phase}
    >
      <div className={styles.backdrop} />
      <div className={styles.world} ref={host} />
      <header className={styles.header}>
        <div className={styles.identity}>
          <Link
            href="/demos"
            className={styles.iconButton}
            title="返回游戏"
            aria-label="返回游戏"
          >
            <ArrowLeftOutlined />
          </Link>
          <div>
            <h1>
              岁岁过招<span>过一招，长一岁。</span>
            </h1>
            <p>竹庭 · 第一试</p>
          </div>
        </div>
        <div className={styles.tools}>
          <button
            className={styles.iconButton}
            title={audio.muted ? "开启声音" : "静音"}
            aria-label={audio.muted ? "开启声音" : "静音"}
            onClick={mute}
          >
            {audio.muted ? <AudioMutedOutlined /> : <SoundOutlined />}
          </button>
          <button
            className={`${styles.iconButton} ${styles.fullscreenButton}`}
            title="全屏"
            aria-label="全屏"
            onClick={toggleFull}
          >
            <ExpandOutlined />
          </button>
          <button
            className={`${styles.iconButton} ${styles.helpButton}`}
            title="操作与按键"
            aria-label="设置"
            onClick={showSettings}
          >
            <SettingOutlined aria-hidden /> <span>操作</span>
          </button>
          <button
            className={styles.iconButton}
            title={s.phase === "paused" ? "继续过招" : "暂停"}
            aria-label={s.phase === "paused" ? "继续过招" : "暂停"}
            disabled={!fighting && s.phase !== "paused"}
            onClick={() => {
              if (s.phase === "paused") {
                model.resume();
                audio.unlock();
              } else {
                model.pause();
                audio.stop();
              }
              notify();
            }}
          >
            {s.phase === "paused" ? <PlayCircleOutlined /> : <PauseOutlined />}
          </button>
        </div>
      </header>

      <div className={styles.health}>
        <div className={styles.playerName}>
          <Image
            src="/images/autochess/portraits/sui.png"
            alt=""
            width={52}
            height={52}
          />
          <div>
            <strong>岁己 SUI</strong>
            <div
              className={styles.hearts}
              aria-label={`生命 ${s.player.hp} / 5`}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <HeartFilled
                  key={i}
                  className={i >= s.player.hp ? styles.emptyHeart : ""}
                />
              ))}
            </div>
          </div>
        </div>
        <div className={styles.bossHealth}>
          <div>
            <strong>饼师傅</strong>
            <span>竹庭守门人</span>
          </div>
          <div
            className={styles.spiritTrack}
            role="meter"
            aria-label="饼师傅气势"
            aria-valuenow={s.boss.spirit}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${s.boss.spirit}%` }} />
          </div>
          <div className={styles.bossSub}>
            <span>气势</span>
            <span>{Math.ceil(s.boss.spirit)} / 100</span>
          </div>
        </div>
      </div>

      {loaded && (fighting || s.phase === "paused") && (
        <div className={styles.fightMeta}>
          <span>{currentVow.name}</span>
          <span>第 {progress.attempts} 次过招</span>
          <time>{clock(s.elapsed)}</time>
          <span>弹反 {s.stats.parries}</span>
        </div>
      )}
      {fighting && !parryVisible && (
        <div
          className={`${styles.moveName} ${model.parryWindowOpen ? styles.parryWindow : ''} ${s.boss.move === "slam" && s.boss.mode === "windup" ? styles.danger : ""}`}
          aria-live="off"
        >
          {model.parryWindowOpen ? '可弹反' : s.t < s.noticeUntil ? s.notice
            : s.boss.mode === 'windup' ? MOVES[s.boss.move].name : ''}
        </div>
      )}
      {parryVisible && (
<div key={lastParry.id} className={styles.parryFeedback} role="status" aria-label="弹反成功">
        <strong>弹反成功</strong>
        <span>{s.boss.move === 'triple' ? `连弹 ${s.boss.tripleParries} / 3` : '气势击破'}<i>累计 {s.stats.parries}</i></span>
      </div>
)}

      {!loaded && !error && (
        <div className={styles.loading}>
          竹庭开门中
          <span />
        </div>
      )}
      {error && (
        <div className={styles.dialogShade}>
          <section className={styles.dialog}>
            <h2>道场暂未打开</h2>
            <p>{error}</p>
            <button
              className={styles.primary}
              onClick={() => window.location.reload()}
            >
              <ReloadOutlined /> 重新打开
            </button>
          </section>
        </div>
      )}

      {loaded && preflight && !settings && (
        <section className={styles.preflight} aria-label="出战准备">
          <div className={styles.pledges}>
            <span className={styles.eyebrow}>今日，立此一约</span>
            <div
              className={styles.vowList}
              role="radiogroup"
              aria-label="出战宣言"
            >
              {VOWS.map((v) => (
                <label
                  htmlFor={`vow-${v.id}`}
                  key={v.id}
                  className={progress.vow === v.id ? styles.selectedVow : ""}
                  title={v.target}
                >
                  <input
                    type="radio"
                    id={`vow-${v.id}`}
                    name="vow"
                    value={v.id}
                    checked={progress.vow === v.id}
                    onChange={() => {
                      model.choose(v.id);
                      notify();
                    }}
                  />
                  <span>{v.name}</span>
                  {progress.stamps.includes(
                    `${v.id}:${progress.assist ? "assist" : "standard"}`,
                  ) && <CheckOutlined />}
                </label>
              ))}
            </div>
            <p className={styles.vowTarget}>{currentVow.target}</p>
          </div>
          <div className={styles.depart}>
            <label className={styles.toggle} htmlFor="ready-assist">
              <input
                type="checkbox"
                id="ready-assist"
                checked={progress.assist}
                onChange={(e) => {
                  model.setAssist(e.target.checked);
                  notify();
                }}
              />
              <span />
              舒缓模式
            </label>
            <button className={styles.primary} onClick={startFight}>
              <span>请赐教</span>
              <ArrowRightOutlined />
            </button>
          </div>
        </section>
      )}

      {loaded && fighting && (
        <div className={styles.controls} aria-label="战斗操作">
          <div className={styles.movement}>
            <button
              {...buttonInput("left")}
              className={styles.actionButton}
              title="向左移动"
              aria-label="向左移动"
            >
              <ArrowLeftOutlined />
            </button>
            <button
              {...buttonInput("right")}
              className={styles.actionButton}
              title="向右移动"
              aria-label="向右移动"
            >
              <ArrowRightOutlined />
            </button>
          </div>
          <div className={styles.combat}>
            <button
              {...buttonInput("guard")}
              className={`${styles.actionButton} ${styles.guardButton}`}
              title="格挡"
              aria-label="格挡"
            >
              <SafetyOutlined />
              <span>格挡</span>
            </button>
            <button
              {...buttonInput("dodge")}
              className={styles.actionButton}
              title="闪避"
              aria-label="闪避"
            >
              <DoubleRightOutlined />
              <span>闪避</span>
            </button>
            <button
              {...buttonInput("attack")}
              className={`${styles.actionButton} ${styles.attackButton}`}
              title="挥剑"
              aria-label="挥剑"
            >
              <ThunderboltOutlined />
              <span>挥剑</span>
            </button>
          </div>
        </div>
      )}

      {loaded && s.phase === "paused" && !settings && (
        <div className={styles.dialogShade}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
          >
            <span className={styles.eyebrow}>茶还温着</span>
            <h2 id="pause-title">歇一口气</h2>
            <p>{s.pauseReason}</p>
            <button
              className={styles.primary}
              onClick={() => {
                model.resume();
                audio.unlock();
                shell.current?.focus();
                notify();
              }}
            >
              <PlayCircleOutlined /> 继续过招
            </button>
            <button
              className={styles.textButton}
              onClick={() => {
                model.ready();
                notify();
              }}
            >
              <ArrowLeftOutlined /> 回到庭前
            </button>
          </section>
        </div>
      )}

      {loaded && result && !settings && (
        <div className={styles.resultPosition}>
          <section className={styles.result} aria-label="本次战报">
            <span className={styles.eyebrow}>
              {s.phase === "won" ? "竹庭第一试 · 已过" : "竹庭第一试 · 再会"}
            </span>
            <h2>{s.phase === "won" ? "这下，服了吧。" : "差一点，再来。"}</h2>
            <p>
              {s.phase === "won"
                ? model.vowMet
                  ? `「${currentVow.name}」一约已成。`
                  : "门已开。约定留给下一场。"
                : s.lastMistake}
            </p>
            <div className={styles.resultStats}>
              <div>
                <strong>{s.stats.parries}</strong>
                <span>精准弹反</span>
              </div>
              <div>
                <strong>
                  {Math.floor(100 - s.boss.spirit)}
                  <small>%</small>
                </strong>
                <span>气势击破</span>
              </div>
              <div>
                <strong>{clock(s.elapsed)}</strong>
                <span>本次用时</span>
              </div>
            </div>
            {s.phase === "won" && model.vowMet && (
              <div className={styles.stamp}>
                <TrophyOutlined /> 一约已成{" "}
                <span>{progress.assist ? "舒缓" : "标准"}</span>
              </div>
            )}
            <div className={styles.resultActions}>
              <button className={styles.primary} onClick={startFight}>
                <ReloadOutlined /> 再过一场
              </button>
              <button
                className={styles.textButton}
                onClick={() => {
                  model.ready();
                  notify();
                }}
              >
                换个约定 <ArrowRightOutlined />
              </button>
            </div>
          </section>
        </div>
      )}

      {settings && (
        <div className={styles.dialogShade}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <button
              className={`${styles.iconButton} ${styles.close}`}
              title="关闭设置"
              aria-label="关闭设置"
              onClick={closeSettings}
            >
              <CloseOutlined />
            </button>
            <span className={styles.eyebrow}>庭中小憩</span>
            <h2 id="settings-title">操作与设置</h2>
            <div className={styles.settingsTabs} role="tablist" aria-label="设置分类">
              <button role="tab" id="controls-tab" aria-controls="controls-panel" aria-selected={settingsTab === 'controls'} onClick={() => setSettingsTab('controls')}>操作</button>
              <button role="tab" id="sound-tab" aria-controls="sound-panel" aria-selected={settingsTab === 'sound'} onClick={() => setSettingsTab('sound')}>声音与难度</button>
            </div>
            {settingsTab === 'controls' ? (
<div role="tabpanel" id="controls-panel" aria-labelledby="controls-tab">
              <div className={styles.bindingGrid}>{CONTROLS.map(control => (
<label className={styles.binding} htmlFor={`binding-${control.id}`} key={control.id}>
                <span>{control.label}</span>
                <select id={`binding-${control.id}`} aria-label={control.label} value={progress.bindings[control.id]} onChange={event => { model.setBinding(control.id, event.target.value); notify(); }}>
                  {KEY_OPTIONS.map(code => <option value={code} key={code}>{keyLabel(code)}</option>)}
                </select>
              </label>
))}</div>
              <button className={styles.textButton} onClick={() => { progress.bindings = { ...DEFAULT_BINDINGS }; model.held.clear(); model.save(); notify(); }}><ReloadOutlined aria-hidden /> 恢复默认按键</button>
            </div>
) : (
<div role="tabpanel" id="sound-panel" aria-labelledby="sound-tab">
            <label className={styles.settingRow} htmlFor="sound-enabled">
              <span>声音</span>
              <input id="sound-enabled" type="checkbox" checked={!audio.muted} onChange={mute} />
            </label>
            <label className={styles.settingRow} htmlFor="sound-volume">
              <span>音效音量</span>
              <input
                type="range"
                id="sound-volume"
                aria-label="音效音量"
                min="0"
                max="1"
                step="0.05"
                value={progress.volume}
                onChange={(e) => {
                  progress.volume = Number(e.target.value);
                  audio.volume = progress.volume;
                  model.save();
                  notify();
                }}
              />
            </label>
            <label className={styles.settingRow} htmlFor="settings-assist">
              <span>舒缓模式</span>
              <input
                type="checkbox"
                id="settings-assist"
                checked={progress.assist}
                disabled={fighting || s.phase === "paused"}
                onChange={(e) => {
                  model.setAssist(e.target.checked);
                  notify();
                }}
              />
            </label>
            <div className={styles.record}>
              <span>总过招 {progress.attempts}</span>
              <span>胜场 {progress.wins}</span>
              <span>最高弹反 {progress.bestParries}</span>
            </div>
            <button className={styles.textButton} disabled={audio.muted || progress.volume === 0} onClick={async () => { await audio.unlock(); audio.play('parry'); notify(); }}><SoundOutlined aria-hidden /> 试听弹反</button>
            </div>
)}
            <button
              className={styles.primary}
              onClick={closeSettings}
            >
              回到庭中 <ArrowRightOutlined />
            </button>
          </section>
        </div>
      )}
      <footer className={styles.footer}>
        <span>
          岁岁过招 <i> / </i> 竹庭篇
        </span>
        <span>
          {saveError
            ? "本地存档不可用"
            : progress.wins
              ? `已过 ${progress.wins} 场`
              : "SUI · 01"}
        </span>
      </footer>
    </main>
  );
}
