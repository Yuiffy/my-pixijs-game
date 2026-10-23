import type DeliveryScene from "./DeliveryScene";

export const OVEN_ART = [
  { key: "oven-crab-shell", file: "oven-crab-shell-v1.webp" },
  { key: "oven-crab-claw", file: "oven-crab-claw-v1.webp" },
  { key: "oven-courtyard", file: "oven-courtyard-v1.webp" },
];

export function addOvenFacades(scene: DeliveryScene) {
  const scale = 430 / 1443;
  return [0, 1900].map(x => scene.add.image(x - 39 * scale, 680 - 977 * scale, "oven-courtyard")
    .setOrigin(0, 0).setScale(scale).setDepth(0.8));
}

/** Trim origins preserve the generated alpha while aligning the body with the real back. */
export function createOvenCrabArt(scene: DeliveryScene) {
  return {
    shell: scene.add.image(0, 0, "oven-crab-shell")
      .setOrigin(920 / 1840, 806 / 855).setScale(250 / 1752).setDepth(2)
.setVisible(false),
    claw: scene.add.image(0, 0, "oven-crab-claw")
      .setOrigin(798.5 / 1586, 497 / 992).setDepth(3.5).setVisible(false),
  };
}
