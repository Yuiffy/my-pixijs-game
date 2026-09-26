"use client";

import { useState } from "react";
import type { Game } from "./engine";
import {
  chooseGoodnight,
  finishLeisure,
  replyQuietly,
  timingPosition,
  timingSteps,
  timingTap,
} from "./daily";
import styles from "./daily.module.css";

export default function DailyPanel({
  game: s,
  onChange,
}: {
  game: Game;
  onChange: () => void;
}) {
  const [hits, setHits] = useState(0);
  const d = s.daily;
  if (!d) return null;
  const change = (fn: () => void) => {
    fn();
    onChange();
  };
  if (d.stage === "sleep") return (
      <div className={styles.sleep} role="status">
        <small>00:48 — 02:13</small>
        <h2>你先睡，我一会儿就来。</h2>
        <p>意识朦胧间，最后一声“大家晚安”从隔壁传来。</p>
      </div>
    );
  if (d.panel === "story") return (
      <section className={styles.panel} aria-label="下播后的故事">
        <small>02:13 / OFF AIR</small>
        <h2>
          {d.after === "rice" ? "原来你也还没吃饱。" : "头发还没擦干呢。"}
        </h2>
        <p>
          {d.after === "rice"
            ? "岁己穿着睡衣站在料理台前，锅里只放了一人份的米饭。看到你，手里的锅铲停住了：“怎么醒了？我马上就来。”"
            : "水声刚停，岁己披着毛巾，踮脚走到床边。“本来想轻一点的。”你伸手碰了碰还湿着的发梢。"}
        </p>
        <div className={styles.choices}>
          <button onClick={() => change(() => chooseGoodnight(s, "together"))}>
            {d.after === "rice"
              ? "拿两把勺子，一起吃"
              : "递杯温水，陪你坐一会儿"}
          </button>
          <button onClick={() => change(() => chooseGoodnight(s, "care"))}>
            {d.after === "rice"
              ? "接过锅铲：我来，你歇着"
              : "拿干毛巾，帮你擦头发"}
          </button>
        </div>
      </section>
    );
  if (d.panel === "lock" || d.panel === "cook") {
    const cooking = d.panel === "cook";
    return (
      <section
        className={styles.panel}
        aria-label={cooking ? "蛋炒饭小游戏" : "轻声开门小游戏"}
      >
        <small>
          {cooking
            ? "HOME KITCHEN / 为你做一顿饭"
            : "WELCOME HOME / 岁己已经开播了"}
        </small>
        <h2>{cooking ? "一碗热乎乎的蛋炒饭" : "把今天的疲惫留在门外"}</h2>
        <div
          className={cooking ? styles.panScene : styles.lockScene}
          aria-hidden="true"
        >
          {cooking ? (
            <div className={styles.pan}>
              <i
                style={{
                  transform: `translateY(${Math.sin(d.clock * 4) * 5}px)`,
                }}
              >
                {["🥚", "🍚", "🍳"][d.beats]}
              </i>
              <span />
            </div>
          ) : (
            <div className={styles.keyhole}>
              <i
                style={{
                  transform: `rotate(${d.beats * 35 + timingPosition(s) * 15}deg)`,
                }}
              >
                ⌕
              </i>
            </div>
          )}
        </div>
        <div className={styles.steps}>
          {timingSteps(s).map((label, i) => (
            <span key={label} data-current={d.beats === i}>
              {i < d.beats ? "✓" : i + 1} {label}
            </span>
          ))}
        </div>
        <p>指针进入金色区域时，轻点下方按钮。失误可以重试。</p>
        <div
          className={styles.timing}
          role="meter"
          aria-label="动作时机"
          aria-valuenow={Math.round(timingPosition(s) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span />
          <i style={{ left: `${timingPosition(s) * 100}%` }} />
        </div>
        <button
          className={styles.primary}
          data-daily-timing
          onClick={() => change(() => timingTap(s))}
        >
          {timingSteps(s)[d.beats]}
        </button>
        <p className={styles.feedback} role="status">
          {d.feedback}
        </p>
      </section>
    );
  }
  if (d.panel !== "leisure") return null;
  return (
    <section
      className={`${styles.panel} ${styles.leisure}`}
      aria-label="客厅休闲"
    >
      <small>SOFA TIME / 你的下班时间</small>
      <h2>先窝在沙发里一会儿。</h2>
      <div className={styles.tabs}>
        <button
          aria-pressed={d.entertainment === "video"}
          onClick={() => change(() => {
              d.entertainment = "video";
            })}
        >
          看猫猫视频
        </button>
        <button
          aria-pressed={d.entertainment === "game"}
          onClick={() => change(() => {
              d.entertainment = "game";
            })}
        >
          玩接星星
        </button>
      </div>
      <div className={styles.screen}>
        {d.entertainment === "video" ? (
          <>
            <div
              className={styles.cat}
              style={{
                transform: `translateX(${Math.sin(d.clock) * 42}px) rotate(${Math.sin(d.clock * 2) * 8}deg)`,
              }}
            >
              ฅ^•ﻌ•^ฅ
            </div>
            <p>猫猫频道 · 今天也要好好休息</p>
          </>
        ) : (
          <>
            <small>接住亮星星 · {hits} 颗</small>
            <button
              aria-label="接星星"
              className={styles.star}
              style={{
                left: `${15 + ((hits * 31) % 65)}%`,
                top: `${28 + ((hits * 19) % 42)}%`,
              }}
              onClick={() => setHits((h) => h + 1)}
            >
              ✦
            </button>
          </>
        )}
      </div>
      <label htmlFor="daily-volume" className={styles.volume}>
        外放音量 {d.volume}%
        <input
          id="daily-volume"
          aria-label="外放音量"
          type="range"
          min="0"
          max="100"
          value={d.volume}
          onChange={(e) => change(() => {
              d.volume = Number(e.target.value);
            })}
        />
      </label>
      <aside className={styles.phone} aria-label="微信消息">
        <strong>微信 · 岁己 {d.unread ? "● 新消息" : ""}</strong>
        {d.messages.slice(-3).map((m, i) => (
          <p key={`${i}-${m.from}`} data-mine={m.from === "我"}>
            <small>{m.from}</small>
            {m.text}
          </p>
        ))}
        {d.unread && (
          <button onClick={() => change(() => replyQuietly(s))}>
            回复：收到，戴耳机啦
          </button>
        )}
      </aside>
      <button
        className={styles.primary}
        onClick={() => change(() => finishLeisure(s))}
      >
        {d.leisureTime >= 8 ? "有点困了，去睡一会儿 →" : "先起来走走"}
      </button>
      {d.leisureTime < 8 && (
        <small>
          再放松 {Math.ceil(8 - d.leisureTime)} 秒就能完成今晚的小计划。
        </small>
      )}
    </section>
  );
}
