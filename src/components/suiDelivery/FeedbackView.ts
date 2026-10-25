import type Phaser from "phaser";
import { feedbackLife } from "./feedback";
import type { DeliveryGame } from "./types";

/** Material silhouettes stay readable with sound off and with reduced motion. */
export function drawDeliveryFeedback(g: Phaser.GameObjects.Graphics, s: DeliveryGame) {
  for (const cue of s.feedback) {
    const { age } = cue;
    const life = feedbackLife(cue.kind);
    if (age < 0 || age >= life || cue.kind === "coin" || cue.kind === "swing" || cue.kind === "jump") continue;
    const t = age / life;
    const motion = s.save.settings.reducedMotion ? 0.25 : t;
    const { x, y, kind } = cue;
    const alpha = Math.min(1, (1 - t) * 1.7) * (0.65 + cue.strength * 0.35);
    const soft = ["dough", "stomp", "vault", "spring", "land-cloth", "cloth-tight", "bird"].includes(kind);
    const steam = ["steam", "dash", "water"].includes(kind);
    const warning = kind === "warning" || kind === "blocked";
    const land = kind.startsWith("land-");
    const color = warning ? 0x9f493c : steam ? 0xf7f7df : soft ? 0x417f70 : 0x9a641f;
    g.lineStyle(2.5, color, alpha);
    if (warning) {
      g.strokeTriangle(x - 12, y - 13, x + 12, y - 13, x, y + 8);
      g.lineBetween(x, y - 9, x, y - 3);
      g.fillStyle(color, alpha).fillCircle(x, y + 1, 1.5);
    } else if (steam) {
      for (let i = 0; i < 3; i++) g.strokeCircle(x + (i - 1) * (10 + motion * 16), y - motion * 22 - (i % 2) * 8, 5 + motion * 7);
    } else if (land) {
      const spread = 12 + motion * 22;
      g.strokeEllipse(x, y + 1, spread * 2, 5 + motion * 5);
      for (const side of [-1, 1]) g.lineBetween(x + side * spread, y - 3, x + side * (spread + 6), y - 7);
    } else if (soft) {
      g.strokeEllipse(x, y, 28 + motion * 27, 17 + motion * 14);
      if (kind === "dough" || kind === "stomp" || kind === "vault" || kind === "spring") {
        g.lineBetween(x - 6, y - 18 - motion * 13, x, y - 25 - motion * 13);
        g.lineBetween(x, y - 25 - motion * 13, x + 6, y - 18 - motion * 13);
        if (kind === "vault") {
          g.lineBetween(x - 8, y - 30 - motion * 13, x, y - 39 - motion * 13);
          g.lineBetween(x, y - 39 - motion * 13, x + 8, y - 30 - motion * 13);
        }
      }
    } else {
      const radius = 9 + motion * 20;
      g.strokeCircle(x, y, radius);
      for (let i = 0; i < 4; i++) {
        const a = ((i * Math.PI) / 2) + Math.PI / 4;
        g.lineBetween(x + Math.cos(a) * (radius + 3), y + Math.sin(a) * (radius + 3), x + Math.cos(a) * (radius + 9), y + Math.sin(a) * (radius + 9));
      }
    }
  }
}
