export type Stroke = { x: number; y: number; time: number };
/** Normalized surface coordinates keep flicks consistent on mouse and touch screens. */
export function flick(stroke: Stroke | null, point: Stroke, airborne: boolean) {
  if (
    !stroke ||
    airborne ||
    point.time - stroke.time > 220 ||
    point.time <= stroke.time
  ) return { stroke: point, toss: null };
  const dx = point.x - stroke.x;
  const dy = point.y - stroke.y;
  if (Math.abs(dy) < 10 || Math.abs(dy) / (point.time - stroke.time) < 0.07) return { stroke, toss: null };
  return {
    stroke: point,
    toss: {
      strength: Math.min(1, Math.abs(dy) / 32),
      turn: Math.abs(dx) > Math.abs(dy) * 0.6 ? Math.sign(dx) : dy < 0 ? 0 : 2,
    },
  };
}
