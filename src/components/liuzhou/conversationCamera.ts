import { constrainCamera } from "./camera";
import { BUILDINGS, type Point } from "./world";

type Position = Point & { y: number };
export type ConversationArea = { x: number; y: number; width: number; height: number };
export type ConversationView = { position: Position; target: Position; area: ConversationArea };

/** The DOM panel reports its real bounds, including wrapped text and choices. */
export function conversationArea(width: number, height: number, panel?: ConversationArea): ConversationArea {
  const top = Math.min(90, height * 0.24);
  if (panel && panel.x > width * 0.4 && panel.y < height * 0.4) {
    return { x: 20, y: top, width: Math.max(80, panel.x - 40), height: Math.max(80, height - top - 24) };
  }
  return { x: 20, y: top, width: Math.max(80, width - 40), height: Math.max(80, (panel?.y ?? height * 0.64) - top - 18) };
}

/** Fit both full silhouettes in the free part of the canvas, with static occlusion checks. */
export function conversationView(player: Position, speaker: Position | undefined, yaw: number, area: ConversationArea, height: number, buildings = BUILDINGS): ConversationView {
  const other = speaker || player;
  const target = { x: (player.x + other.x) / 2, y: (player.y + other.y) / 2 + 1.1, z: (player.z + other.z) / 2 };
  const focal = height / (2 * Math.tan((29 * Math.PI) / 180));
  const slope = 0.15;
  const scale = Math.hypot(1, slope);
  const points = [player, other].flatMap(p => [-0.48, 0.48].flatMap(x => [-0.48, 0.48].flatMap(z => [0.03, 2.35].map(y => ({ x: p.x + x, y: p.y + y, z: p.z + z })))));
  const base = speaker ? Math.atan2(other.x - player.x, other.z - player.z) + Math.PI / 2 : yaw;
  let best: ConversationView | undefined;
  let bestScore = -Infinity;
  // Prefer a side view so neither actor hides the other; try the other side by walls.
  for (const offset of [0, Math.PI, 0.35, -0.35, Math.PI + 0.35, Math.PI - 0.35, 0.7, -0.7]) {
    const angle = base + offset;
    const sin = Math.sin(angle); const cos = Math.cos(angle);
    let setback = 4;
    const fits = (distance: number) => points.every(p => {
      const x = p.x - target.x; const y = p.y - target.y; const z = p.z - target.z;
      const depth = (x * sin - y * slope + z * cos) / scale + distance * scale;
      const horizontal = ((-x * cos + z * sin) * focal) / depth;
      const vertical = ((x * sin * slope + y + z * cos * slope) * focal) / (depth * scale);
      return depth > 0.2 && Math.abs(horizontal) < area.width / 2 - 14 && Math.abs(vertical) < area.height / 2 - 14;
    });
    while (setback < 40 && !fits(setback)) setback += 0.25;
    const desired = { x: target.x - sin * setback, y: target.y + slope * setback, z: target.z - cos * setback };
    const position = constrainCamera(target, desired, buildings);
    const actual = Math.hypot(position.x - target.x, position.z - target.z);
    const clear = [player, other].every(p => {
      const eye = { ...p, y: p.y + 1.45 };
      const end = constrainCamera(eye, position, buildings);
      return Math.hypot(end.x - position.x, end.y - position.y, end.z - position.z) < 0.15;
    });
    const score = (fits(actual) ? 100 : 0) + (clear ? 40 : 0) + Math.min(1, actual / setback) * 10 - setback * 0.1 - Math.abs(Math.sin(offset)) * 2;
    if (score > bestScore) { best = { position, target, area }; bestScore = score; }
  }
  return best!;
}
