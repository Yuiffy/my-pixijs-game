import type DeliveryScene from "./DeliveryScene";
import { deliveryLevel } from "./levels";
import type { Surface } from "./types";

export const MARKET_ART = [
  { key: "market-produce", file: "market-produce-v1.webp" },
  { key: "market-canteen", file: "market-canteen-v1.webp" },
  { key: "market-cart", file: "market-cart-v1.webp" },
];

/** Counters remain behind the authored awning poles and real landing edges. */
export function addMarketFacades(scene: DeliveryScene) {
  const counter = (x: number, width: number) => {
    const scale = width / 1801;
    return scene.add.image(x - 59 * scale, 680 - 736 * scale, "market-produce")
      .setOrigin(0, 0).setScale(scale).setDepth(0.8);
  };
  // The generated service sill is at y=610; its base at y=1166 meets the street.
  const scale = 180 / (1166 - 610);
  return [
    counter(80, 210),
    ...deliveryLevel(scene.bridge.state).surfaces.filter(b => b.kind === "awning")
      .map(b => counter(b.x + 10, b.w - 20)),
    scene.add.image(3330 - 14 * scale, 680 - 1166 * scale, "market-canteen")
      .setOrigin(0, 0).setScale(scale).setDepth(0.8),
  ];
}

export function createMarketCartArt(scene: DeliveryScene) {
  return scene.add.image(0, 0, "market-cart")
    .setOrigin(95 / 2079, 133 / 756).setDepth(2.9).setVisible(false);
}

export function placeMarketCartArt(scene: DeliveryScene, cart: Surface) {
  scene.marketCartArt.setPosition(cart.x, cart.y)
    .setScale(cart.w / 1896, 58 / 491).setVisible(true);
  const g = scene.moving;
  // These thin edges and rotating wheels follow the collision surface, not painted scenery.
  g.fillStyle(0xfff0cc).fillRoundedRect(cart.x, cart.y, cart.w, 4, 2);
  for (const x of [cart.x + 25, cart.x + 133]) {
    const y = cart.y + 69;
    g.fillStyle(0x425b50).fillCircle(x, y, 14.5);
    g.fillStyle(0xc39a54).fillCircle(x, y, 10);
    const rotation = (scene.bridge.state.cart.x - deliveryLevel(scene.bridge.state).cart!.start) / 14.5;
    for (let spoke = 0; spoke < 4; spoke++) {
      const angle = rotation + (spoke * Math.PI) / 2;
      g.lineStyle(2, 0xffe3ac).lineBetween(x, y, x + Math.cos(angle) * 9, y + Math.sin(angle) * 9);
    }
    g.fillStyle(0x6d654d).fillCircle(x, y, 3);
  }
}
