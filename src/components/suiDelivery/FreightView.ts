import type DeliveryScene from "./DeliveryScene";
import { servingStage } from "./market";

export const FREIGHT_ART = [
  { key: "freight-station", file: "freight-station-v1.webp" },
  { key: "sorter-tower", file: "sorter-tower-v1.webp" },
  { key: "sorter-ladle", file: "sorter-ladle-v1.webp" },
];

/** Open centers leave the rider, bell, shots and actual platform edges readable. */
export function addFreightFacades(scene: DeliveryScene) {
  return [[585, 540, 270], [1585, 500, 400], [2895, 460, 300]].map(([x, bottom, width]) => {
    const scale = width / 1476;
    return scene.add.image(x - 30 * scale, bottom - 928 * scale, "freight-station")
      .setOrigin(0, 0).setScale(scale).setDepth(0.8);
  });
}

const TOWER_SCALE = 375 / 1461;
const LIGHT_Y = [390, 535, 680].map(y => 680 - (1497 - y) * TOWER_SCALE);

export function addSorterFacades(scene: DeliveryScene) {
  return [scene.add.image(1785, 680, "sorter-tower")
    .setOrigin(515 / 1024, 1497 / 1536).setScale(TOWER_SCALE).setDepth(0.8)];
}

export function createServingArt(scene: DeliveryScene) {
  return {
    ladle: scene.add.image(0, 0, "sorter-ladle")
      .setOrigin(819.5 / 1641, 483.5 / 958).setScale(70 / 1509, 42 / 503)
      .setDepth(3.5)
.setVisible(false),
    lights: LIGHT_Y.map(y => scene.add.circle(1785, y, 7.5, 0x35473e)
      .setStrokeStyle(1, 0xf4d69a).setDepth(3.5).setVisible(false)),
  };
}

/** Match the live collision center; keep warnings on the procedural graphics above the arm. */
export function paintServingArt(scene: DeliveryScene) {
  const s = scene.bridge.state;
  const { ladle, lights } = scene.servingArt;
  const m = s.machine;
  const stage = servingStage(s);
  ladle.setVisible(!!m && m.phase !== "off");
  if (m) {
    const x = m.phase === "sweep" ? 1030 + (1 - m.timer / 0.65) * 510 : 1050;
    ladle.setPosition(x, 680 - Math.min(2, stage) * 120 - 22);
    if (m.phase === "warning") {
      scene.moving.lineStyle(3, 0xe8b759, 0.85).strokeEllipse(x, ladle.y, 80, 50);
    }
  }
  lights.forEach((light, i) => {
    const closed = i < stage;
    const active = !!m && m.phase !== "sleep" && m.phase !== "off" && i === stage;
    light.setVisible(!!m).setFillStyle(closed ? 0x8cae80 : active ? 0xe8b759 : 0x35473e)
      .setAlpha(active ? 0.8 + Math.sin(s.clock * 6) * 0.2 : 1);
  });
}
