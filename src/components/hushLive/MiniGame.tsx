"use client";

import { useLayoutEffect, useRef } from "react";
import type { Game } from "./engine";
import { activityInput, restartPractice } from "./daily";
import { MiniInput } from "./minigames";
import { drawMini } from "./miniDrawing";
import styles from "./daily.module.css";

const titles = {
  dial: "听声转锁盘",
  pick: "铁丝探锁芯",
  pins: "抬起三枚弹子",
  toss: "骰子蛋炒饭",
  eggs: "粒粒裹上蛋",
  recoil: "压枪训练 · 24 发",
};
const hints = {
  dial: "拖动锁盘或用方向键转动。按箭头方向找卡点，波纹越强越接近；听到咔哒时记住这一格，共三格。",
  pick: "左右拖动调整铁丝。按住扳手轻转；卡住时松手，换角度试探。锁芯松动时转到底，共三枚锁舌。",
  pins: "上下拖动抬起当前弹子，让白色缺口对齐金线，再点锁住。已完成的弹子会留在原位。",
  toss: "按住锅向上甩，再左右移动去接饭团。键盘用空格颠锅、左右键接；接住三次就能出锅。",
  eggs: "在画面上左右拖动锅，接住滑落的鸡蛋。也可用左右键或下方滑杆，接满六颗就能出锅。",
  recoil:
    "按住画面开火，持续向下拖动压枪。键盘按住空格开火、方向键修正。打完可以再练，不强制成绩。",
};
export default function MiniGame({
  game: s,
  onChange,
}: {
  game: Game;
  onChange: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    startY: number;
  } | null>(null);
  const d = s.daily;
  const m = d?.mini;
  useLayoutEffect(() => {
    let frame = 0;
    const paint = () => {
      const context = canvas.current?.getContext("2d");
      if (context && s.daily) drawMini(context, s.daily.mini);
      frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [s, m]);
  if (!m) return null;
  const send = (input: MiniInput, x = 0, y = 0) => {
    activityInput(s, input, x, y);
    onChange();
  };
  const setPosition = (x: number, y: number) => {
    if (m.kind === "pick") send("set", x * 1.8 - 90);
    else if (m.kind === "pins") send("set", 100 - y);
    else if (m.kind === "toss" || m.kind === "eggs") send("pan", x);
  };
  return (
    <div className={styles.minigame} data-minigame={m.kind}>
      <h3>{titles[m.kind]}</h3>
      <p className={styles.gameHint} id={`mini-hint-${m.kind}`}>
        {hints[m.kind]}
      </p>
      <canvas
        ref={canvas}
        width={700}
        height={400}
        tabIndex={0}
        aria-label={titles[m.kind]}
        aria-describedby={`mini-hint-${m.kind}`}
        data-mini-surface
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          const b = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - b.left) / b.width) * 100;
          const y = ((e.clientY - b.top) / b.height) * 100;
          drag.current = { id: e.pointerId, x, y, startY: y };
          setPosition(x, y);
          if (m.kind === "recoil") send("press");
        }}
        onPointerMove={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          const b = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - b.left) / b.width) * 100;
          const y = ((e.clientY - b.top) / b.height) * 100;
          if (m.kind === "dial") send("turn", (x - drag.current.x) * 3);
          else if (m.kind === "recoil") send("aim", x - drag.current.x, y - drag.current.y);
          else setPosition(x, y);
          drag.current = { ...drag.current, x, y };
        }}
        onPointerUp={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          if (m.kind === "toss" && drag.current.startY - drag.current.y > 10) send(
              "toss",
              Math.min(1, (drag.current.startY - drag.current.y) / 45),
            );
          drag.current = null;
          send("release");
        }}
        onPointerCancel={() => {
          drag.current = null;
          send("release");
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          send("release");
        }}
        onBlur={() => send("release")}
        onKeyDown={(e) => {
          if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(
              e.key,
            )
          ) return;
          e.preventDefault();
          e.stopPropagation();
          const dx =
            e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
          const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
          if (e.key === " ") {
            if (m.kind === "toss") {
              if (!e.repeat) send("toss", 0.6);
            } else if (!e.repeat) send("press");
          } else if (m.kind === "dial") send("turn", dx * 5);
          else if (m.kind === "pick") send("set", m.angle + dx * 5);
          else if (m.kind === "pins") send("set", m.lift - dy * 5);
          else if (m.kind === "recoil") send("aim", dx * 2, dy * 2);
          else send("pan", m.panTarget + dx * 5);
        }}
        onKeyUp={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            send("release");
          }
        }}
      />
      <div className={styles.miniControls}>
        {m.kind === "dial" ? (
          <>
            <button onClick={() => send("turn", -10)} aria-label="逆时针转动">
              ↶ 逆时针
            </button>
            <button onClick={() => send("press")}>
              记住这一格 · {m.score}/3
            </button>
            <button onClick={() => send("turn", 10)} aria-label="顺时针转动">
              顺时针 ↷
            </button>
          </>
        ) : m.kind === "pick" || m.kind === "pins" ? (
          <>
            <label htmlFor="mini-lock-setting">
              {m.kind === "pick" ? "铁丝角度" : "抬起弹子"}
              <input
                id="mini-lock-setting"
                aria-label={m.kind === "pick" ? "铁丝角度" : "弹子高度"}
                type="range"
                min={m.kind === "pick" ? -90 : 0}
                max={m.kind === "pick" ? 90 : 100}
                step={1}
                value={m.kind === "pick" ? m.angle : m.lift}
                onChange={(e) => send("set", Number(e.target.value))}
              />
            </label>
            {m.kind === "pick" ? (
              <button
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  send("press");
                }}
                onPointerUp={() => send("release")}
                onPointerCancel={() => send("release")}
                onLostPointerCapture={() => send("release")}
                onBlur={() => send("release")}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    send("press");
                  }
                }}
                onKeyUp={() => send("release")}
              >
                按住扳手轻转 · {m.score}/3
              </button>
            ) : (
              <button onClick={() => send("press")}>
                锁住这枚弹子 · {m.score}/3
              </button>
            )}
          </>
        ) : m.kind === "recoil" ? (
          <button
            onClick={() => {
              restartPractice(s);
              onChange();
            }}
          >
            重新装填，再练一梭
          </button>
        ) : (
          <>
            <label htmlFor="mini-pan">
              移动锅
              <input
                id="mini-pan"
                aria-label="锅的位置"
                type="range"
                min={8}
                max={92}
                value={m.panTarget}
                onChange={(e) => send("pan", Number(e.target.value))}
              />
            </label>
            {m.kind === "toss" && (
              <button disabled={m.flight} onClick={() => send("toss", 0.6)}>
                颠锅 ↑
              </button>
            )}
          </>
        )}
      </div>
      <p className={styles.feedback} role="status">
        {m.feedback || "慢慢来，失误也能继续。"}
      </p>
    </div>
  );
}
