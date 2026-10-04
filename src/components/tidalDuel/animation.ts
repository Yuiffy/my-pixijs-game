import type { Fighter } from "./engine";
import { getFighter } from "./roster";
import layout from "../../../public/games/tidal-duel/pixel/source-layout.json";

export interface PixelFrame {
  sheet: "motion" | "combat" | "air";
  index: number;
}
export const SPRITE_LAYOUT = {
  tile: layout.frameSize,
  anchor: layout.anchor,
  bodyHeight: layout.bodyHeight,
};

/** Startup, active and recovery use the move clock; hitstop freezes the pose. */
export function pixelFrame(f: Fighter, reduced = false): PixelFrame {
  const motion = (index: number): PixelFrame => ({ sheet: "motion", index });
  const combat = (index: number): PixelFrame => ({ sheet: "combat", index });
  if ((f.state === "attack" || f.state === "clash") && f.move) {
    const m = getFighter(f.character).moves[f.move];
    if (m.air) {
      const phase = f.moveTime < m.startup ? 0 :
        f.moveTime < m.startup + m.active ? 1 :
        f.moveTime < m.startup + m.active + m.recovery * 0.6 ? 2 : 3;
      return { sheet: "air", index: m.air.row * 4 + phase };
    }
    const animation =
      m.animation ??
      (m.height === "low"
        ? "low"
        : f.move.toLowerCase().includes("kick")
          ? "kick"
          : m.launcher
            ? "rise"
            : m.kind === "super" || m.kind === "throw"
              ? "skill"
              : "punch");
    const rows: Record<string, number> = {
      punch: 0,
      kick: 4,
      low: 8,
      skill: 12,
      rise: 16,
    };
    const row = rows[animation] ?? 0;
    const phase =
      f.moveTime < m.startup
        ? 0
        : f.moveTime < m.startup + m.active
          ? 1
          : f.moveTime < m.startup + m.active + m.recovery * 0.6
            ? 2
            : 3;
    return combat(row + phase);
  }
  if (f.state === "walk") return motion(4 + (Math.floor(f.stateTime * 10) % 4));
  if (f.state === "jump") return motion(
      f.stateTime < 0.065 ? 12 : f.vy < -140 ? 13 : f.vy < 230 ? 14 : 15,
    );
  if (f.state === "crouch") return motion(f.stateTime < 0.065 ? 8 : 9);
  if (f.state === "landing") return motion(f.stateTime < 2 / 60 ? 8 : 9);
  if (f.state === "guard") return motion(
      f.previous.crouch ? 9 : 10 + (Math.floor(f.stateTime * 6) % 2),
    );
  if (f.state === "hold") return motion(f.holdHeight === "low" ? 8 : 11);
  if (["hit", "critical", "grabbed", "launch"].includes(f.state)) return combat(
      f.state === "critical" || f.state === "launch" || f.stateTime > 0.08
        ? 21
        : 20,
    );
  if (["down", "defeat"].includes(f.state)) return combat(22);
  if (f.state === "wake") return f.stateTime < 0.12 ? combat(22) : motion(8);
  if (f.state === "victory") return combat(23);
  return motion(reduced ? 0 : Math.floor(f.stateTime * 5) % 4);
}
