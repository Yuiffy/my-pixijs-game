"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AudioMutedOutlined,
  CheckOutlined,
  CloseOutlined,
  DownloadOutlined,
  DoubleRightOutlined,
  ExpandOutlined,
  HeartFilled,
  LinkOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyOutlined,
  SettingOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import {
  BOSSES,
  CHARMS,
  CONTROLS,
  DEFAULT_BINDINGS,
  DIFFICULTIES,
  KEY_OPTIONS,
  MOVES,
  VOWS,
  challengeUrl,
  keyLabel,
} from "./core";
import type { Charm, Difficulty, Input, Sparring } from "./core";
import type { SparringAudio } from "./audio";
import { chapterImage } from "./share";
import styles from "./OneMoreGame.module.css";

interface Props {
  model: Sparring;
  audio: SparringAudio;
  loaded: boolean;
  error: string;
  saveError: boolean;
  settings: boolean;
  setSettings: (open: boolean) => void;
  notify: () => void;
  focus: () => void;
  fullscreen: () => void;
}
const clock = (ms: number) => `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;

export default function ChapterHud({
  model,
  audio,
  loaded,
  error,
  saveError,
  settings,
  setSettings,
  notify,
  focus,
  fullscreen,
}: Props) {
  const [tab, setTab] = useState<"controls" | "sound" | "journey">("controls");
  const [shareMessage, setShareMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const { state: s, progress } = model;
  const { campaign } = progress;
  const boss = model.bossDefinition;
  const fighting = s.phase === "fight";
  const ready = s.phase === "ready";
  const denial = s.denial && s.feedbackT - s.denial.visualAt < 1300 ? s.denial : null;
  const lowStamina = s.player.stamina < model.dodgeCost;
  const staminaLevel = s.player.stamina < model.attackCost ? 'critical' : lowStamina ? 'low' : 'normal';
  const deniedAction = denial ? { attack: '挥剑', dodge: '闪避', guard: '格挡' }[denial.action] : '';
  const staminaMessage = denial ? denial.reason === 'stamina' ? `体力不足 · 无法${deniedAction}` : denial.reason === 'cooldown' ? '闪避尚未恢复' : `收招中 · 暂不能${deniedAction}` : lowStamina ? s.t - s.player.exertionAt > 450 ? '体力偏低 · 回气中' : '体力偏低' : '';
  const lastFeedback = [...s.events]
    .reverse()
    .find((event) => ['parry', 'counter', 'riposte', 'break', 'return'].includes(event.cue));
  const feedbackVisible =
    fighting && lastFeedback && s.feedbackT - lastFeedback.visualAt < 650;
  const feedbackTitle = lastFeedback?.cue === 'return' ? '飞铃回击' : lastFeedback?.cue === 'riposte' ? '破架追击' : lastFeedback?.cue === 'counter' ? '反击命中' : lastFeedback?.cue === 'break' ? '架势崩溃' : '弹反成功';
  const vow = VOWS.find((item) => item.id === progress.vow)!;
  const act = (fn: () => void) => {
    fn();
    notify();
  };
  const start = () => {
    audio.stop();
    model.start();
    audio.unlock();
    focus();
    notify();
  };
  const resume = () => {
    model.resume();
    audio.unlock();
    focus();
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
    setTab("controls");
    setSettings(true);
  };
  const pointer = (input: Input) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      model.input(input, true);
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      model.input(input, false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => model.input(input, false),
    onLostPointerCapture: () => model.input(input, false),
  });
  const copy = async () => {
    const url = challengeUrl(window.location.origin, progress);
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("挑战链接已复制");
    } catch {
      setShareMessage(url);
    }
  };
  const download = async () => {
    setExporting(true);
    try {
      const blob = await chapterImage(progress);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sui-three-courts-${campaign.seed}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setShareMessage("首章战报已生成");
    } catch (reason) {
      setShareMessage(
        reason instanceof Error ? reason.message : "战报生成失败",
      );
    }
    setExporting(false);
  };
  const difficultyOptions = Object.entries(DIFFICULTIES).map(([id, item]) => (
    <option key={id} value={id}>
      {item.name}
    </option>
  ));

  return (
    <>
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
              岁岁过招<span>三庭过，收场钟。</span>
            </h1>
            <p>
              {boss.stage} · 第 {campaign.bossIndex + 1} 试 / 3
            </p>
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
            onClick={fullscreen}
          >
            <ExpandOutlined />
          </button>
          <button
            className={`${styles.iconButton} ${styles.helpButton}`}
            title="操作与整备"
            aria-label="设置"
            onClick={showSettings}
          >
            <SettingOutlined aria-hidden />
            <span>操作</span>
          </button>
          <button
            className={styles.iconButton}
            title={s.phase === "paused" ? "继续过招" : "暂停"}
            aria-label={s.phase === "paused" ? "继续过招" : "暂停"}
            disabled={!fighting && s.phase !== "paused"}
            onClick={() => {
              if (s.phase === "paused") resume();
              else {
                model.pause();
                audio.stop();
                notify();
              }
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
              {Array.from({ length: 5 }, (_, index) => (
                <HeartFilled
                  key={index}
                  className={index >= s.player.hp ? styles.emptyHeart : ""}
                />
              ))}
            </div>
          </div>
        </div>
        <div className={styles.bossHealth}>
          <div>
            <strong>{boss.name}</strong>
            <span>{boss.title}</span>
          </div>
          <div
            className={styles.spiritTrack}
            role="meter"
            aria-label={`${boss.name}气血`}
            aria-valuenow={s.boss.spirit}
            aria-valuemin={0}
            aria-valuemax={boss.health}
          >
            <i style={{ width: `${(s.boss.spirit / boss.health) * 100}%` }} />
          </div>
          <div className={styles.bossSub}>
            <span>气血</span>
            <span>
              {Math.ceil(s.boss.spirit)} / {boss.health}
            </span>
          </div>
          <div
            className={`${styles.poiseTrack} ${s.boss.mode === "broken" ? styles.brokenPoise : ""}`}
            role="meter"
            aria-label="架势压力"
            aria-valuenow={s.boss.poise}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${s.boss.poise}%` }} />
          </div>
          <div className={styles.bossSub}>
            <span>
              {s.boss.mode === "broken"
                ? "架势崩溃"
                : s.boss.mode === "stagger"
                  ? "硬直"
                  : "架势压力"}
            </span>
            <span>
              {s.boss.counterReady
                ? "可反击"
                : `${Math.ceil(s.boss.poise)} / 100`}
            </span>
          </div>
        </div>
      </div>

      {loaded && (fighting || s.phase === "paused") && (
        <div className={styles.fightMeta}>
          <span>{vow.name}</span>
          <span>第 {campaign.attempts[campaign.bossIndex]} 次过招</span>
          <time>{clock(s.elapsed)}</time>
          <span>弹反 {s.stats.parries}</span>
        </div>
      )}
      {fighting && !feedbackVisible && s.boss.elevation < 25 && (
        <div
          className={`${styles.moveName} ${model.parryWindowOpen ? styles.parryWindow : ""} ${MOVES[s.boss.move].heavy && s.boss.mode === "windup" ? styles.danger : ""}`}
        >
          {s.boss.mode === "broken"
            ? "破架 · 追击"
            : model.parryWindowOpen
              ? "可弹反"
              : s.t < s.noticeUntil
                ? s.notice
                : s.boss.mode === "windup"
                  ? MOVES[s.boss.move].name
                  : ""}
        </div>
      )}
      {feedbackVisible && (
        <div
          key={lastFeedback.id}
          className={`${styles.parryFeedback} ${lastFeedback.cue === 'counter' || lastFeedback.cue === 'riposte' ? styles.counterFeedback : ''}`}
          role="status"
          aria-label={feedbackTitle}
        >
          <strong>{feedbackTitle}</strong>
          <span>
            {lastFeedback.cue === 'counter' || lastFeedback.cue === 'riposte' ? `反击 ${s.stats.counters} 次` : s.boss.mode === "broken"
              ? "架势崩溃 · 追击"
              : MOVES[s.boss.move].hits.length === 3
                ? `连弹 ${s.boss.tripleParries} / 3`
                : lastFeedback.cue === 'parry' && boss.id === 'keeper' ? '飞铃已弹回' : s.boss.counterReady ? "震退 · 可反击" : '震退'}
            <i>{lastFeedback.cue === 'parry' ? `累计 ${s.stats.parries}` : `破架 ${s.stats.breaks}`}</i>
          </span>
        </div>
      )}

      {!loaded && !error && (
        <div className={styles.loading}>
          庭门开启中
          <span />
        </div>
      )}
      {error && (
        <div className={styles.dialogShade}>
          <section className={styles.dialog}>
            <h2>庭门暂未打开</h2>
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

      {loaded && ready && !settings && (
        <>
          <div className={styles.chapterIntro}>
            <ol>
              {BOSSES.map((item, index) => (
                <li
                  key={item.id}
                  data-current={index === campaign.bossIndex}
                  data-cleared={index < campaign.cleared.length}
                >
                  {index < campaign.cleared.length ? (
                    <CheckOutlined />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                  {item.stage}
                </li>
              ))}
            </ol>
            <p>{boss.intro}</p>
          </div>
          <section className={styles.preflight} aria-label="出战准备">
            <div className={styles.pledges}>
              <span className={styles.eyebrow}>今日，立此一约</span>
              <div
                className={styles.vowList}
                role="radiogroup"
                aria-label="出战宣言"
              >
                {VOWS.map((item) => (
                  <label
                    htmlFor={`vow-${item.id}`}
                    key={item.id}
                    className={
                      progress.vow === item.id ? styles.selectedVow : ""
                    }
                    title={item.target}
                  >
                    <input
                      type="radio"
                      id={`vow-${item.id}`}
                      name="vow"
                      value={item.id}
                      checked={progress.vow === item.id}
                      onChange={() => act(() => model.choose(item.id))}
                    />
                    <span>{item.name}</span>
                    {progress.stamps.includes(
                      `${boss.id}:${item.id}:${model.difficulty}`,
                    ) && <CheckOutlined />}
                  </label>
                ))}
              </div>
              <p className={styles.vowTarget}>{vow.target}</p>
            </div>
            <div className={styles.depart}>
              <select
                className={styles.difficultySelect}
                aria-label="本场难度"
                value={model.difficulty}
                onChange={(e) => act(() => model.setDifficulty(e.target.value as Difficulty))}
              >
                {difficultyOptions}
              </select>
              <button className={styles.primary} onClick={start}>
                <span>请赐教</span>
                <ArrowRightOutlined />
              </button>
            </div>
          </section>
        </>
      )}

      {loaded && fighting && (
        <div className={styles.controls} aria-label="战斗操作">
          <div className={styles.movement}>
            <button
              {...pointer("left")}
              className={styles.actionButton}
              title="向左移动"
              aria-label="向左移动"
            >
              <ArrowLeftOutlined />
            </button>
            <button
              {...pointer("right")}
              className={styles.actionButton}
              title="向右移动"
              aria-label="向右移动"
            >
              <ArrowRightOutlined />
            </button>
          </div>
          <div className={styles.stamina} data-level={staminaLevel} data-denied={denial?.reason === 'stamina'} aria-label="体力状态">
            <div className={styles.staminaHeading}>
              <strong><ThunderboltOutlined aria-hidden /> 体力</strong>
              <span><b>{Math.floor(s.player.stamina)}</b> / 100</span>
            </div>
            <div className={styles.energyTrack} role="meter" aria-label="体力" aria-valuenow={Math.floor(s.player.stamina)} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${s.player.stamina}%` }} />
              <span style={{ left: `${model.dodgeCost}%` }} />
            </div>
            <div className={styles.staminaMessage} role="status" aria-live="polite" key={denial?.visualAt ?? 'rest'}>{staminaMessage}</div>
          </div>
          <div className={styles.combat}>
            <button
              {...pointer("guard")}
              className={`${styles.actionButton} ${styles.guardButton}`}
              title="格挡"
              aria-label="格挡"
            >
              <SafetyOutlined />
              <span>格挡 <small>{Math.ceil(model.guardCost)}</small></span>
            </button>
            <button
              {...pointer("dodge")}
              className={styles.actionButton}
              title="闪避"
              aria-label="闪避"
              aria-disabled={s.player.stamina < model.dodgeCost || s.t - s.player.dashAt < 750}
            >
              <DoubleRightOutlined />
              <span>闪避 <small>{Math.ceil(model.dodgeCost)}</small></span>
            </button>
            <button
              {...pointer("attack")}
              className={`${styles.actionButton} ${styles.attackButton}`}
              title="挥剑"
              aria-label="挥剑"
              aria-disabled={s.player.stamina < model.attackCost}
            >
              <ThunderboltOutlined />
              <span>{s.boss.counterReady ? "反击" : "挥剑"} <small>{Math.ceil(model.attackCost)}</small></span>
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
            <button className={styles.primary} onClick={resume}>
              <PlayCircleOutlined /> 继续过招
            </button>
            <button
              className={styles.textButton}
              onClick={() => act(() => model.ready())}
            >
              <ArrowLeftOutlined /> 回到庭前
            </button>
          </section>
        </div>
      )}

      {loaded && (s.phase === "won" || s.phase === "lost") && !settings && (
        <div className={styles.resultPosition}>
          <section className={styles.result} aria-label="本次战报">
            <span className={styles.eyebrow}>
              {boss.stage} · 第 {campaign.bossIndex + 1} 试 ·{" "}
              {s.phase === "won" ? "已过" : "再会"}
            </span>
            <h2>{s.phase === "won" ? "这下，服了吧。" : "差一点，再来。"}</h2>
            <p>{s.phase === "won" ? boss.victory : s.lastMistake}</p>
            <div className={styles.resultStats}>
              <div>
                <strong>{s.stats.parries}</strong>
                <span>精准弹反</span>
              </div>
              <div>
                <strong>
                  {s.stats.breaks}
                  <small> / {s.stats.counters}</small>
                </strong>
                <span>破架 / 反击</span>
              </div>
              <div>
                <strong>{clock(s.elapsed)}</strong>
                <span>本次用时</span>
              </div>
            </div>
            {s.phase === "won" && model.vowMet && (
              <div className={styles.stamp}>
                <TrophyOutlined /> 一约已成{" "}
                <span>{DIFFICULTIES[model.difficulty].name}</span>
              </div>
            )}
            <div className={styles.resultActions}>
              <button
                className={styles.primary}
                onClick={
                  s.phase === "won" ? () => act(() => model.nextBoss()) : start
                }
              >
                {s.phase === "won" ? (
                  <ArrowRightOutlined />
                ) : (
                  <ReloadOutlined />
                )}
                {s.phase === "won"
                  ? `去${BOSSES[campaign.bossIndex + 1]?.stage}`
                  : "再过一场"}
              </button>
              <button
                className={styles.textButton}
                onClick={() => act(() => {
                    if (s.phase === "won") model.nextBoss();
                    else model.ready();
                  })}
              >
                {s.phase === "won" ? "休整片刻" : "调整整备"}{" "}
                <ArrowRightOutlined />
              </button>
            </div>
          </section>
        </div>
      )}

      {loaded && s.phase === "ending" && !settings && (
        <div className={styles.endingPosition}>
          <section className={styles.ending} aria-label="首章战报">
            <span className={styles.eyebrow}>三庭收钟 · 首章已过</span>
            <h2>这一夜，记你的名字。</h2>
            <p>饼师傅让开山门，听钟人收起长铃。赤绶落定，小岁敲响了收场钟。</p>
            <ol className={styles.endingRecords}>
              {campaign.cleared.map((item) => (
                <li key={item.bossId}>
                  <div>
                    <strong>{BOSSES[item.bossIndex].name}</strong>
                    <small>
                      {DIFFICULTIES[item.difficulty].name} · {item.attempts}{" "}
                      次尝试
                    </small>
                  </div>
                  <span>
                    弹反 {item.stats.parries}
                    <br />
                    破架 {item.stats.breaks} · 反击 {item.stats.counters}
                  </span>
                  {item.vowMet && <CheckOutlined title="一约已成" />}
                </li>
              ))}
            </ol>
            <div className={styles.endingActions}>
              <button
                className={styles.primary}
                onClick={() => {
                  model.newChapter(campaign.seed, "rematch");
                  setShareMessage("");
                  notify();
                }}
              >
                <ReloadOutlined /> 再过三庭
              </button>
              <button
                className={styles.iconButton}
                aria-label="复制挑战链接"
                title="复制挑战链接"
                onClick={copy}
              >
                <LinkOutlined />
              </button>
              <button
                className={styles.iconButton}
                aria-label="下载首章战报"
                title="下载首章战报"
                disabled={exporting}
                onClick={download}
              >
                <DownloadOutlined />
              </button>
            </div>
            {shareMessage && (
              <p className={styles.shareMessage} role="status">
                {shareMessage}
              </p>
            )}
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
              onClick={() => setSettings(false)}
            >
              <CloseOutlined />
            </button>
            <span className={styles.eyebrow}>庭中小憩</span>
            <h2 id="settings-title">操作与整备</h2>
            <div
              className={styles.settingsTabs}
              role="tablist"
              aria-label="设置分类"
            >
              {(
                [
                  { id: "controls", name: "操作" },
                  { id: "sound", name: "声音" },
                  { id: "journey", name: "整备" },
                ] as const
              ).map((item) => (
                <button
                  role="tab"
                  id={`${item.id}-tab`}
                  aria-controls={`${item.id}-panel`}
                  aria-selected={tab === item.id}
                  key={item.id}
                  onClick={() => setTab(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
            {tab === "controls" && (
              <div
                role="tabpanel"
                id="controls-panel"
                aria-labelledby="controls-tab"
              >
                <div className={styles.bindingGrid}>
                  {CONTROLS.map((control) => (
                    <label
                      className={styles.binding}
                      htmlFor={`binding-${control.id}`}
                      key={control.id}
                    >
                      <span>{control.label}</span>
                      <select
                        id={`binding-${control.id}`}
                        aria-label={control.label}
                        value={progress.bindings[control.id]}
                        onChange={(e) => act(() => model.setBinding(control.id, e.target.value),)}
                      >
                        {KEY_OPTIONS.map((code) => (
                          <option value={code} key={code}>
                            {keyLabel(code)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  className={styles.textButton}
                  onClick={() => act(() => {
                      progress.bindings = { ...DEFAULT_BINDINGS };
                      model.held.clear();
                      model.save();
                    })}
                >
                  <ReloadOutlined aria-hidden /> 恢复默认按键
                </button>
              </div>
            )}
            {tab === "sound" && (
              <div role="tabpanel" id="sound-panel" aria-labelledby="sound-tab">
                <label className={styles.settingRow} htmlFor="sound-enabled">
                  <span>声音</span>
                  <input
                    id="sound-enabled"
                    type="checkbox"
                    checked={!audio.muted}
                    onChange={mute}
                  />
                </label>
                <label className={styles.settingRow} htmlFor="sound-volume">
                  <span>音效音量</span>
                  <input
                    id="sound-volume"
                    type="range"
                    aria-label="音效音量"
                    min="0"
                    max="1"
                    step="0.05"
                    value={progress.volume}
                    onChange={(e) => act(() => {
                        progress.volume = Number(e.target.value);
                        audio.volume = progress.volume;
                        model.save();
                      })}
                  />
                </label>
                <div className={styles.record}>
                  <span>总过招 {progress.attempts}</span>
                  <span>胜场 {progress.wins}</span>
                  <span>最高弹反 {progress.bestParries}</span>
                </div>
                <button
                  className={styles.textButton}
                  disabled={audio.muted || progress.volume === 0}
                  onClick={async () => {
                    await audio.unlock();
                    audio.play("parry");
                  }}
                >
                  <SoundOutlined /> 试听弹反
                </button>
              </div>
            )}
            {tab === "journey" && (
              <div
                role="tabpanel"
                id="journey-panel"
                aria-labelledby="journey-tab"
              >
                <label
                  className={styles.settingRow}
                  htmlFor="journey-difficulty"
                >
                  <span>本场难度</span>
                  <select
                    id="journey-difficulty"
                    aria-label="本场难度"
                    disabled={!ready}
                    value={model.difficulty}
                    onChange={(e) => act(() => model.setDifficulty(e.target.value as Difficulty),)}
                  >
                    {difficultyOptions}
                  </select>
                </label>
                <label className={styles.settingRow} htmlFor="journey-charm">
                  <span>本章护符</span>
                  <select
                    id="journey-charm"
                    aria-label="本章护符"
                    disabled={!ready || campaign.cleared.length > 0}
                    value={progress.charm}
                    onChange={(e) => act(() => model.setCharm(e.target.value as Charm))}
                  >
                    {CHARMS.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={styles.charmEffect}>
                  {CHARMS.find((item) => item.id === progress.charm)?.effect}
                </p>
                <label className={styles.settingRow} htmlFor="streamer-layout">
                  <span>主播布局</span>
                  <select
                    id="streamer-layout"
                    aria-label="主播布局"
                    value={progress.layout}
                    onChange={(e) => act(() => {
                        progress.layout = e.target
                          .value as typeof progress.layout;
                        model.save();
                      })}
                  >
                    <option value="none">完整画面</option>
                    <option value="left">左侧留空</option>
                    <option value="right">右侧留空</option>
                  </select>
                </label>
                <div className={styles.record}>
                  <span>种子 {campaign.seed}</span>
                  <span>首章通关 {progress.chapterWins}</span>
                </div>
                <button className={styles.textButton} onClick={copy}>
                  <LinkOutlined /> 复制挑战链接
                </button>
                {shareMessage && (
                  <p className={styles.shareMessage} role="status">
                    {shareMessage}
                  </p>
                )}
              </div>
            )}
            <button
              className={styles.primary}
              onClick={() => setSettings(false)}
            >
              回到庭中 <ArrowRightOutlined />
            </button>
          </section>
        </div>
      )}
      <footer className={styles.footer}>
        <span>
          岁岁过招 <i> / </i> 三庭收钟
        </span>
        <span>
          {saveError
            ? "本地存档不可用"
            : `${campaign.mode === "rematch" ? "重战" : "首章"} · ${campaign.cleared.length} / 3`}
        </span>
      </footer>
    </>
  );
}
