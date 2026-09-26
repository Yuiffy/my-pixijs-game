"use client";

import { useLayoutEffect, useRef } from "react";
import { skinOf } from "./skins";
import { householdStatus } from "./household";
import type { Game } from "./engine";
import { chooseGoodnight, finishLeisure, replyQuietly } from "./daily";
import MiniGame from "./MiniGame";
import styles from "./daily.module.css";

export default function DailyPanel({
  game: s,
  onChange,
}: {
  game: Game;
  onChange: () => void;
}) {
  const cat = useRef<HTMLDivElement>(null);
  const d = s.daily;
  const panel = d?.panel;
  const stage = d?.stage;
  const entertainment = d?.entertainment;
  useLayoutEffect(() => {
    if (!panel || stage === "sleep") return;
    let frame = 0;
    let lastClock = -1;
    const paint = () => {
      const { daily } = s;
      if (daily && daily.clock !== lastClock) {
        lastClock = daily.clock;
        // Read the simulation clock, including pause/reset/advanceTime. Never run a second animation clock.
        if (cat.current) cat.current.style.transform = `translateX(${Math.sin(daily.clock) * 42}px) rotate(${Math.sin(daily.clock * 2) * 8}deg)`;
      }
      frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [s, panel, stage, entertainment]);
  if (!d) return null;
  const change = (fn: () => void) => {
    fn();
    onChange();
  };
  if (d.stage === "sleep") return (
      <div className={styles.sleep} role="status">
        <small>00:48 — 02:13</small>
        <h2>你先睡，我一会儿就来。</h2>
        <p>
          你裹着毯子窝在客厅沙发上。意识朦胧间，最后一声“大家晚安”从隔壁传来。
        </p>
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
            ? `${skinOf(s.skin).name}穿着睡衣站在料理台前，锅里只放了一人份的米饭。看到你，手里的锅铲停住了：“怎么醒了？我马上就来。”`
            : `水声刚停，${skinOf(s.skin).name}披着毛巾，踮脚走到沙发旁。“本来想轻一点的。”你伸手碰了碰还湿着的发梢。`}
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
  if (d.panel === "lock" || d.panel === "cook") return (
      <section
        className={styles.panel}
        aria-label={d.panel === "cook" ? "蛋炒饭小游戏" : "轻声开门小游戏"}
      >
        <small>
          {d.panel === "cook"
            ? "HOME KITCHEN / 为你做一顿饭"
            : `WELCOME HOME / ${skinOf(s.skin).name}已经开播了`}
        </small>
        <MiniGame game={s} onChange={onChange} />
      </section>
    );
  if (d.panel !== "leisure") return null;
  return (
    <section
      className={`${styles.panel} ${styles.leisure}`}
      aria-label={d.leisurePlace === "computer" ? "电脑休闲" : "客厅休闲"}
    >
      <small>
        {d.leisurePlace === "computer"
          ? "DESKTOP / 下班打一会儿"
          : "SOFA TIME / 你的下班时间"}
      </small>
      <h2>
        {d.leisurePlace === "computer"
          ? "戴上耳机，来一梭。"
          : "先窝在沙发里一会儿。"}
      </h2>
      <div className={styles.tabs}>
        <button
          aria-pressed={d.entertainment === "video"}
          onClick={() => change(() => {
              d.mini.held = false;
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
          玩压枪训练
        </button>
      </div>
      {d.entertainment === "video" ? (
        <div className={styles.screen}>
          <div className={styles.cat} ref={cat}>
            ฅ^•ﻌ•^ฅ
          </div>
          <p>猫猫频道 · 今天也要好好休息</p>
        </div>
      ) : (
        <MiniGame game={s} onChange={onChange} />
      )}
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
        {householdStatus(s) && <p>{householdStatus(s)}</p>}
        <strong>
          微信 · {skinOf(s.skin).name} {d.unread ? "● 新消息" : ""}
        </strong>
        {d.messages.slice(-3).map((m, i) => (
          <p key={`${i}-${m.from}`} data-mine={m.from === "我"}>
            <small>{m.from === "我" ? "我" : skinOf(s.skin).name}</small>
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
        {d.leisureTime >= 8
          ? s.tasks
              .filter((t) => t !== "leisure")
              .every((t) => s.done.includes(t))
            ? d.leisurePlace === "computer"
              ? "离开电脑，去沙发小睡 →"
              : "收起手机，在沙发上小睡 →"
            : "收起手机，继续忙家里的事 →"
          : "先起来走走"}
      </button>
      {d.leisureTime < 8 && (
        <small>
          再放松 {Math.ceil(8 - d.leisureTime)} 秒就能完成今晚的小计划。
        </small>
      )}
    </section>
  );
}
