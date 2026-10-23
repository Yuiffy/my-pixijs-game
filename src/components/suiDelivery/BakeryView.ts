import type DeliveryScene from "./DeliveryScene";

export const BAKERY_ART = [
  { key: "bakery-kitchen-wall", file: "kitchen-wall-v1.webp" },
  { key: "bakery-kitchen-oven", file: "kitchen-oven-v1.webp" },
  { key: "bakery-bread-rack", file: "bread-rack-v1.webp" },
  { key: "bakery-backdoor", file: "bakery-backdoor-v1.webp" },
];

/** Decorative layers stay behind the authored counters, pans and landing edges. */
export function addBakeryFacades(scene: DeliveryScene) {
  const place = (key: string, x: number, width: number, sourceWidth: number, contentBottom: number, depth = 0.8) => {
    const scale = width / sourceWidth;
    return scene.add.image(x, 680 - contentBottom * scale, key)
      .setOrigin(0, 0).setScale(scale).setDepth(depth);
  };
  return [
    place("bakery-kitchen-wall", 350, 2170, 2161, 671, 0.65),
    place("bakery-kitchen-oven", 950, 220, 1136, 1364),
    ...[450, 750, 1760, 1920].map(x => place("bakery-bread-rack", x, 140, 1034, 1427)),
    // The upper service sill meets the real y=465 delivery platform in front of it.
    place("bakery-backdoor", 2920, 500, 1222, 1238),
  ];
}
