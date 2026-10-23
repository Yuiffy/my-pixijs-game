import type Phaser from "phaser";
import type DeliveryScene from "./DeliveryScene";
import type { DeliveryLevel, Surface } from "./types";

/** Raster facades sit behind the exact collision ledges and all interactive props. */
export const BREAKFAST_ART = [
  { key: "breakfast-cafe", file: "cafe-v1.webp" },
  { key: "breakfast-attic", file: "attic-v1.webp" },
  { key: "breakfast-bakery", file: "bakery-v1.webp" },
  { key: "breakfast-gatehouse", file: "gatehouse-v1.webp" },
  { key: "breakfast-workshop", file: "workshop-v1.webp" },
];

export function addBreakfastFacades(scene: DeliveryScene) {
  const place = (key: string, x: number, bottom: number, width: number, sourceWidth: number, alphaBottom: number) => {
    const scale = width / sourceWidth;
    return scene.add.image(x, bottom - alphaBottom * scale, key)
      .setOrigin(0, 0).setScale(scale).setDepth(0.8);
  };
  return [
    place("breakfast-cafe", 0, 680, 420, 1285, 1166),
    // Only the upper chamber is painted; the low passage remains open below y=562.
    place("breakfast-gatehouse", 400, 562, 325, 1507, 922),
    place("breakfast-bakery", 983, 680, 390, 1222, 1245),
    place("breakfast-workshop", 1540, 680, 620, 1536, 960),
    // Its upper windows open onto the authored balcony at y=410; a stone plinth meets the street.
    place("breakfast-attic", 2840, 634, 840, 1610, 977),
  ];
}

function timber(g: Phaser.GameObjects.Graphics, b: Surface) {
  g.fillStyle(0x78583d).fillRoundedRect(b.x, b.y, b.w, b.h, 2);
  g.fillStyle(0xb68a59).fillRect(b.x + 2, b.y + 4, b.w - 4, Math.max(2, b.h - 7));
  g.fillStyle(0xf3d6a2).fillRect(b.x, b.y, b.w, 4);
  g.lineStyle(1, 0x735334, 0.55);
  for (let x = b.x + 12; x < b.x + b.w - 15; x += 49) {
    g.lineBetween(x, b.y + 9, Math.min(x + 26, b.x + b.w - 4), b.y + 9);
    g.lineBetween(x + 9, b.y + b.h - 4, Math.min(x + 37, b.x + b.w - 4), b.y + b.h - 4);
  }
  for (let x = b.x + 5; x < b.x + b.w; x += 72) {
    g.lineStyle(1, 0x6c5037, 0.8).lineBetween(x, b.y + 4, x, b.y + b.h - 1);
    g.fillStyle(0x614c37).fillCircle(x + 5, b.y + 8, 1.5);
  }
  if (b.h > 30) {
    for (let x = b.x + 14; x < b.x + b.w - 10; x += 40) {
      g.lineStyle(2, 0x79583d, 0.45).lineBetween(x, b.y + 22, x, b.y + b.h - 5);
    }
    g.fillStyle(0x7c593d).fillRect(b.x, b.y + b.h - 5, b.w, 5);
  }
}

function stone(g: Phaser.GameObjects.Graphics, b: Surface) {
  g.fillStyle(0x8b8b76).fillRoundedRect(b.x, b.y, b.w, b.h, 2);
  for (let row = 0; row < Math.ceil(b.h / 23); row++) {
    const top = b.y + row * 23;
    for (let x = b.x - (row % 2) * 22; x < b.x + b.w; x += 46) {
      const left = Math.max(b.x + 1, x + 1);
      const width = Math.min(x + 44, b.x + b.w - 1) - left;
      if (width > 0) g.fillStyle(row % 2 ? 0xb4b49a : 0xc2c0a5)
        .fillRoundedRect(left, top + 2, width, Math.min(20, b.y + b.h - top - 3), 2);
    }
  }
  g.fillStyle(0xf4e2ba).fillRect(b.x, b.y, b.w, 4);
}

/** Material detail follows authored surfaces, so art cannot invent a misleading landing edge. */
export function drawBreakfastMaterials(g: Phaser.GameObjects.Graphics, level: DeliveryLevel) {
  if (!["street", "bakery", "oven", "market", "freight", "sorter"].includes(level.theme)) return;
  for (const b of level.surfaces) {
    if (b.kind === "wood") timber(g, b);
    if (b.kind === "brick") stone(g, b);
    if (b.kind !== "ground") continue;
    g.fillGradientStyle(0xc5ac82, 0xc5ac82, 0xa99272, 0xa99272)
      .fillRect(b.x, b.y + 16, b.w, b.h - 16);
    for (let row = 0; row < 2; row++) {
      for (let x = b.x - (row % 2) * 23; x < b.x + b.w; x += 47) {
        const left = Math.max(b.x, x + 1);
        const width = Math.min(x + 45, b.x + b.w) - left;
        if (width > 0) {
          g.fillStyle(row ? 0xbda47f : 0xe2c99d).fillRoundedRect(left, b.y + row * 19, width, 17, 3);
          if (!row) g.fillStyle(0xf8e6bd).fillRect(left + 2, b.y, Math.max(1, width - 4), 3);
        }
      }
    }
    for (let x = b.x + 24; x < b.x + b.w - 20; x += 91) {
      const offset = Math.floor((x - b.x) / 91) % 3;
      g.lineStyle(1, 0x8e775a, 0.28).lineBetween(x, b.y + 67 + offset * 11, x + 32, b.y + 69 + offset * 11);
      g.fillStyle(0xd6bc92, 0.65).fillEllipse(x + 16, b.y + 126 + offset * 16, 13, 5);
      g.fillStyle(0x9f896a, 0.25).fillEllipse(x + 52, b.y + 198 + offset * 7, 7, 3);
    }
  }
  if (level.theme === "street") {
    // The house's raised masonry base and balcony support the real playable deck.
    stone(g, { id: "attic-plinth-art", x: 2880, y: 632, w: 770, h: 48, kind: "brick" });
    for (const x of [3110, 3560]) {
      g.fillStyle(0x735940).fillRect(x, 425, 11, 207);
      g.fillStyle(0xa58358).fillRect(x + 2, 425, 5, 207);
      g.lineStyle(5, 0x8c6c48).lineBetween(x + 5, 473, x + (x === 3110 ? 60 : -50), 428);
    }
    for (let x = 3100; x < 3590; x += 27) {
      g.lineStyle(3, 0x8b704e).lineBetween(x, 379, x, 410);
    }
    g.fillStyle(0xb5905e).fillRoundedRect(3085, 373, 520, 6, 2);
    g.fillStyle(0xf1d7a7).fillRect(3085, 373, 520, 2);
  }
}
