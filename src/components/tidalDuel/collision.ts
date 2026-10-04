import type { Box, Fighter } from "./engine";
import { getFighter } from "./roster";
import { SPRITE_LAYOUT, pixelFrame } from "./animation";
import contours from "../../../public/games/tidal-duel/pixel/collision-contours.json";

interface ContourFrame { hurt: number[][]; strike: number[][] }
const profiles: Record<string, Record<string, ContourFrame[]>> = contours.characters;
const SCALE = 2;

export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function circleIntersects(circle: { x: number; y: number; radius: number }, box: Box) {
  const x = Math.max(box.x, Math.min(box.x + box.w, circle.x));
  const y = Math.max(box.y, Math.min(box.y + box.h, circle.y));
  return (circle.x - x) ** 2 + (circle.y - y) ** 2 < circle.radius ** 2;
}

export function bounds(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b => b.x));
  const y = Math.min(...boxes.map(b => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map(b => b.x + b.w)) - x,
    h: Math.max(...boxes.map(b => b.y + b.h)) - y,
  };
}

function world(f: Fighter, rect: number[], padding = 0): Box {
  const [x, y, w, h] = rect;
  const localX = (x - SPRITE_LAYOUT.anchor[0]) * SCALE;
  return {
    x: f.x + (f.facing > 0 ? localX : -localX - w * SCALE) - padding,
    y: f.y + (y - SPRITE_LAYOUT.anchor[1]) * SCALE - padding,
    w: w * SCALE + padding * 2,
    h: h * SCALE + padding * 2,
  };
}

function authored(f: Fighter, reach: number, top: number, bottom: number): Box {
  return {
    x: f.facing > 0 ? f.x + 20 : f.x - reach,
    y: f.y + top,
    w: reach - 20,
    h: bottom - top,
  };
}

export const pushBox = (f: Fighter): Box => ({ x: f.x - 49.5, y: f.y - 175, w: 99, h: 175 });

/** Canonical skin contours share the exact animation clock and drawing anchor. */
export function fighterBoxes(f: Fighter) {
  const pose = pixelFrame(f);
  // A registry extension can reuse the baseline silhouette until it ships its
  // own compiled profile; no character-specific branches enter the engine.
  const profile = profiles[f.character] ?? profiles.sui;
  const frame = profile[pose.sheet][pose.index];
  const hurt = frame.hurt.map(rect => world(f, rect));
  const move = f.state === "attack" && f.move ? getFighter(f.character).moves[f.move] : null;
  let strikes: Box[] = [];
  let geometry: "contour" | "grab" | "effect" = "contour";
  if (move && !move.projectile && f.moveTime >= move.startup && f.moveTime < move.startup + move.active) {
    if (move.kind === "throw") {
      strikes = [authored(f, move.reach, -245, -35)];
      geometry = "grab";
    } else if (move.kind === "super") {
      strikes = [authored(f, move.reach, -260, -70)];
      geometry = "effect";
    } else if (move.animation === "rise" || move.launcher) {
      // Uppercuts sweep an arc over their active frames, rather than only
      // touching the terminal fist high above a standing opponent's head.
      strikes = [authored(f, move.reach, -420, -145)];
      geometry = "effect";
    } else strikes = frame.strike.map(rect => world(f, rect, 4));
  }
  return {
    hurt,
    strikes,
    attack: bounds(strikes),
    push: pushBox(f),
    pose,
    geometry,
  };
}
