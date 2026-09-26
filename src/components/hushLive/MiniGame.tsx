"use client";

import { useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { FACE_NAMES, dialReady, type Mini, type MiniInput } from "./minigames";
import { flick, type Stroke } from "./miniGestures";
import { drawMini } from "./miniDrawing";
import CookingGame3D from "./CookingGame3D";
import styles from "./daily.module.css";

export const MINI_TITLES = {
  dial: "听声转锁盘",
  pick: "铁丝探锁芯",
  pins: "抬起三枚弹子",
  toss: "六面煎骰子牛",
  eggs: "粒粒裹上蛋",
  recoil: "压枪训练 · 24 发",
};
const hints = {
  dial: "沿箭头绕着锁盘转。进入绿色卡点区，松手就能记住；不必对准某一度。三格依次换方向。",
  pick: "在锁上方左右移动，调整铁丝角度；按住下方扳手试转。感觉卡住就松手，再找角度。",
  pins: "拖动当前弹子往上抬，白色缺口靠近金线时松手。前面的弹子会留在原位。",
  toss: "不用按键，左右移动鼠标带动锅；快速上下甩动翻前后面，斜向甩翻左右面。每面煎熟再翻，六面全熟出锅。",
  eggs: "不用按键，移动鼠标直接倾斜铁锅。缓缓绕圈，让米饭在锅里滑过蛋液，全部裹成金黄。触屏按住锅滑动。",
  recoil: "按住画面开火，持续向下拖动压枪。键盘按住空格开火、方向键修正。",
};
export default function MiniGame({
  mini: m,
  onInput,
  onRestart,
}: {
  mini: Mini;
  onInput: (input: MiniInput, x: number, y: number) => void;
  onRestart: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const stroke = useRef<Stroke | null>(null);
  const cooking = m.kind === "toss" || m.kind === "eggs";
  useLayoutEffect(() => {
    drag.current = null;
    stroke.current = null;
    if (cooking) return;
    let frame = 0;
    const paint = () => {
      const c = canvas.current?.getContext("2d");
      if (c) drawMini(c, m);
      frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [m, cooking]);
  const send = (input: MiniInput, x = 0, y = 0) => onInput(input, x, y);
  const reset = () => {
    drag.current = null;
    stroke.current = null;
    send("release");
  };
  const cookingMove = (x: number, y: number, time: number) => {
    send("pan", x, (50 - y) * 0.004);
    if (m.kind === "eggs") send("tilt", (x - 50) / 36, (y - 50) / 36);
    else {
      const next = flick(
        stroke.current,
        { x, y, time },
        m.flight || m.cooldown > 0,
      );
      stroke.current = next.stroke;
      if (next.toss) send("toss", next.toss.strength, next.toss.turn);
    }
  };
  const events: HTMLAttributes<HTMLElement> = {
    tabIndex: 0,
    onPointerEnter: () => {
      stroke.current = null;
    },
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.focus();
      e.currentTarget.setPointerCapture(e.pointerId);
      const b = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - b.left) / b.width) * 100;
      const y = ((e.clientY - b.top) / b.height) * 100;
      drag.current = { id: e.pointerId, x, y };
      if (cooking) {
        stroke.current = { x, y, time: e.timeStamp };
        cookingMove(x, y, e.timeStamp);
      }
      if (m.kind === "pick") {
        if (y >= 55) send("press");
        else send("set", x * 1.8 - 90);
      }
      if (m.kind === "recoil") send("press");
    },
    onPointerMove: (e) => {
      const b = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - b.left) / b.width) * 100;
      const y = ((e.clientY - b.top) / b.height) * 100;
      const previous = drag.current;
      if (
        cooking &&
        (e.pointerType === "mouse" || previous?.id === e.pointerId)
      ) cookingMove(x, y, e.timeStamp);
      if (m.kind === "pick" && !m.held && y < 55) send("set", x * 1.8 - 90);
      if (!previous || previous.id !== e.pointerId) return;
      if (m.kind === "dial") {
        const angle = (xx: number, yy: number) => Math.atan2((xx - 50) * 7, -(yy - 47.5) * 4) * (180 / Math.PI);
        if (Math.hypot(x - 50, y - 47.5) > 8) send(
            "turn",
            ((angle(x, y) - angle(previous.x, previous.y) + 540) % 360) - 180,
          );
      } else if (m.kind === "pins") send("set", m.lift + (previous.y - y) * (400 / 150));
      else if (m.kind === "recoil") send("aim", x - previous.x, y - previous.y);
      drag.current = { ...previous, x, y };
    },
    onPointerUp: (e) => {
      if (drag.current?.id !== e.pointerId) return;
      if ((m.kind === "dial" && dialReady(m)) || m.kind === "pins") send("press");
      reset();
    },
    onPointerCancel: reset,
    onLostPointerCapture: reset,
    onPointerLeave: () => {
      if (!drag.current) {
        stroke.current = null;
        if (m.kind === "eggs") send("tilt", 0, 0);
      }
    },
    onBlur: reset,
    onKeyDown: (e) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(
          e.key,
        )
      ) return;
      e.preventDefault();
      e.stopPropagation();
      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      if (e.key === " ") {
        if (!e.repeat) send(m.kind === "toss" ? "toss" : "press", 0.6);
      } else if (m.kind === "dial") send("turn", dx * 5);
      else if (m.kind === "pick") send("set", m.angle + dx * 5);
      else if (m.kind === "pins") send("set", m.lift - dy * 5);
      else if (m.kind === "recoil") send("aim", dx * 2, dy * 2);
      else if (m.kind === "eggs") send("tilt", dx, dy);
      else if (e.shiftKey) send("toss", 0.6, dx || (dy > 0 ? 2 : 0));
      else send("pan", m.panTarget + dx * 5);
    },
    onKeyUp: (e) => {
      if (e.key === " ") {
        e.preventDefault();
        send("release");
      }
      if (m.kind === "eggs") send("tilt", 0, 0);
    },
  };
  return (
    <div className={styles.minigame} data-minigame={m.kind}>
      <h3>{MINI_TITLES[m.kind]}</h3>
      <p className={styles.gameHint} id={`mini-hint-${m.kind}`}>
        {hints[m.kind]}
      </p>
      {cooking ? (
        <div
          {...events}
          className={styles.cookingSurface}
          data-mini-surface
          aria-label={MINI_TITLES[m.kind]}
          aria-describedby={`mini-hint-${m.kind}`}
        >
          <CookingGame3D mini={m} />
        </div>
      ) : (
        <canvas
          {...events}
          ref={canvas}
          width={700}
          height={400}
          data-mini-surface
          aria-label={MINI_TITLES[m.kind]}
          aria-describedby={`mini-hint-${m.kind}`}
        />
      )}
      {m.kind === "toss" && (
        <div className={styles.faceProgress} aria-label="六面熟度">
          {m.faces.map((heat, i) => (
            <div key={i} data-contact={m.face === i} data-cooked={heat >= 1}>
              <span>
                {FACE_NAMES[i]}
                {m.face === i ? " · 贴锅" : ""}
              </span>
              <progress max={1} value={heat} />
              <small>
                {heat >= 1 ? "已熟 ✓" : `${Math.round(heat * 100)}%`}
              </small>
            </div>
          ))}
        </div>
      )}
      {m.kind === "eggs" && (
        <div className={styles.coating}>
          <span>
            裹蛋{" "}
            {Math.round((m.grains.reduce((n, g) => n + g.coat, 0) / 6) * 100)}%
          </span>
          <progress max={6} value={m.grains.reduce((n, g) => n + g.coat, 0)} />
        </div>
      )}
      <details className={styles.assistance}>
        <summary>键盘与辅助操作</summary>
        <p>
          方向键调整，空格确认或颠锅。骰子牛也可用
          Shift＋方向键选择翻面方向；蛋炒饭用方向键倾斜锅。
        </p>
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
            <button onClick={onRestart}>重新装填，再练一梭</button>
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
                <button
                  disabled={m.flight}
                  onClick={() => send("toss", 0.6, 0)}
                >
                  向前翻面 ↑
                </button>
              )}
            </>
          )}
        </div>
      </details>
      <p className={styles.feedback} role="status">
        {m.feedback ||
          (m.kind === "toss"
            ? "先让贴锅的一面煎熟，再甩锅翻面。"
            : "慢慢来，失误也能继续。")}
      </p>
    </div>
  );
}
