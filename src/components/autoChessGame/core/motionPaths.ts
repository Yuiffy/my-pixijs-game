export interface MotionPoint {
  x: number;
  y: number;
}

export const MUMU_WHIP_CATCH_FRACTION = 0.24;
export const MUMU_WHIP_ARC_HEIGHT = 82;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const mumuWhipPullProgress = (progress: number) => {
  const pull = clamp01(
    (progress - MUMU_WHIP_CATCH_FRACTION) / (1 - MUMU_WHIP_CATCH_FRACTION),
  );
  return 1 - (1 - pull) ** 3;
};

export const quadraticMotionPoint = (
  from: MotionPoint,
  control: MotionPoint,
  to: MotionPoint,
  progress: number,
) => {
  const t = clamp01(progress);
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
};

export const mumuWhipControlPoint = (
  from: MotionPoint,
  to: MotionPoint,
  source: MotionPoint,
  arcHeight = MUMU_WHIP_ARC_HEIGHT,
) => {
  const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const normalX = -(to.y - from.y) / distance;
  const normalY = (to.x - from.x) / distance;
  const upperSide = normalY <= 0 ? 1 : -1;
  return {
    x: source.x + normalX * arcHeight * upperSide,
    y: source.y + normalY * arcHeight * upperSide,
  };
};
