import type DeliveryScene from "./DeliveryScene";
import { deliveryLevel } from "./levels";

export const RAIN_ART = [
  { key: "rain-roof", file: "rain-roof-v1.webp" },
  { key: "greenhouse-hall", file: "greenhouse-hall-v1.webp" },
  { key: "rain-service-window", file: "rain-service-window-v1.webp" },
];

/** Decorative walls stay below the real roof lip; gaps and spring canopies stay open. */
export function addRainFacades(scene: DeliveryScene) {
  const level = deliveryLevel(scene.bridge.state);
  if (!level.rain) return [];
  const images = [];
  if (level.theme === "greenhouse") {
    images.push(scene.add.image(740, 680, "greenhouse-hall")
      .setOrigin(17 / 2172, 684 / 724).setScale(1600 / 2138).setDepth(0.8));
  } else {
    for (const roof of level.surfaces.filter(surface => surface.kind === "wood" && surface.w >= 240 && surface.y < 600)) {
      // A wide roof uses separate bays, so window and tile proportions stay readable.
      const bays = Math.ceil(roof.w / 360);
      const width = roof.w / bays;
      for (let i = 0; i < bays; i++) {
        images.push(scene.add.image(roof.x + i * width, roof.y + 12, "rain-roof")
          .setOrigin(72 / 1310, 151 / 1200).setScale(width / 1161).setDepth(0.8));
      }
    }
  }
  // Source sill y846 is aligned to the real interaction shelf. The entry sill
  // meets the separate serving counter, while the resident stands at the far window.
  images.push(scene.add.image(180, 615, "rain-service-window")
    .setOrigin(0.5, 846 / 1145).setScale(310 / 1364).setDepth(0.8));
  images.push(scene.add.image(level.destination.x + 40, level.destination.y, "rain-service-window")
    .setOrigin(0.5, 846 / 1145).setScale(260 / 1364).setDepth(0.9));
  return images;
}
