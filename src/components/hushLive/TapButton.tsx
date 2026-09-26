"use client";

import { useRef, type ReactNode } from "react";

/** A touch tap after a canvas drag need not produce a compatibility click in Chrome. */
export default function TapButton({ onActivate, children }: { onActivate: () => void; children: ReactNode }) {
  const tap = useRef<{ id: number; x: number; y: number } | null>(null);
  const lastTouch = useRef(-Infinity);
  return (
<button
    onPointerDown={e => {
      if (e.pointerType === "touch") tap.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }}
    onPointerCancel={() => { tap.current = null; }}
    onPointerUp={e => {
      const start = tap.current;
      tap.current = null;
      if (!start || start.id !== e.pointerId || Math.hypot(start.x - e.clientX, start.y - e.clientY) > 10) return;
      lastTouch.current = performance.now();
      e.preventDefault();
      onActivate();
    }}
    onClick={e => {
      // Keep native mouse and keyboard activation without replaying a touch twice.
      // A puzzle can disappear before finger-up; reject its orphan touch click.
      if ((e.nativeEvent as PointerEvent).pointerType === "touch") return;
      if (e.detail === 0 || performance.now() - lastTouch.current > 600) onActivate();
    }}
  >{children}</button>
);
}
