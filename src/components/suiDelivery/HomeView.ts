import type Phaser from "phaser";
import type DeliveryScene from "./DeliveryScene";

/** Shop purchases decorate the original kitchen as well as the pause-room illustration. */
export function drawHomeDetails(
  scene: DeliveryScene,
  g: Phaser.GameObjects.Graphics,
) {
  const { save } = scene.bridge.state;
  const shown = (id: string) => save.home.displayed.includes(id);
  if (shown("red-cloth")) {
    scene.rect(g, 170, 624, 155, 27, 0xb96352, 2);
    for (let x = 178; x < 325; x += 19) scene.rect(g, x, 624, 6, 27, 0xf0d3a4);
    for (const y of [630, 643]) scene.rect(g, 170, y, 155, 4, 0xf0d3a4);
  }
  if (shown("menu-board")) {
    g.lineStyle(6, 0x9e7751)
      .lineBetween(343, 680, 359, 619)
      .lineBetween(359, 619, 381, 680);
    scene.rect(g, 337, 615, 48, 55, 0xa27a55, 3);
    scene.rect(g, 342, 620, 38, 44, 0x4d6d5b, 2);
    for (const y of [630, 638, 656]) g.lineStyle(2, 0xeee4ba).lineBetween(349, y, 373, y);
    scene.ellipse(g, 361, 647, 20, 7, 0xe6cfa3);
  }
  if (shown("warm-lights")) {
    for (let x = 46; x < 350; x += 38) {
      const y = 395 + Math.sin(((x - 40) / 320) * Math.PI) * 18;
      g.lineStyle(2, 0x6d7d61).lineBetween(
        x,
        y,
        x + 38,
        395 + Math.sin(((x - 2) / 320) * Math.PI) * 18,
      );
      scene.ellipse(g, x, y + 6, 22, 25, 0xf9d992, 0.15);
      scene.ellipse(g, x, y + 5, 8, 12, 0xf9d992);
    }
  }
  if (shown("herb-shelf")) {
    scene.rect(g, 265, 588, 77, 6, 0xa87d56, 2);
    for (const x of [277, 302, 327]) {
      scene.rect(g, x - 8, 574, 16, 14, 0xc18c66, 2);
      g.lineStyle(3, 0x728d61).lineBetween(x, 575, x, 554);
      scene.ellipse(g, x - 5, 562, 12, 6, 0x8ba270);
      scene.ellipse(g, x + 5, 556, 12, 6, 0x728d61);
    }
  }
  if (save.delivered.includes("attic-soup")) {
    scene.rect(g, 45, 654, 48, 25, 0xc08662, 3);
    for (const x of [54, 69, 84]) scene.flower(g, x, 646, 0xd28b83);
  }
  if (save.delivered.includes("oven-crab")) {
    scene.rect(g, 175, 556, 71, 43, 0xa77b55, 2);
    scene.rect(g, 179, 560, 63, 35, 0xc5d0b4);
  }
  if (save.delivered.includes("greenhouse-dinner") && !shown("herb-shelf")) {
    for (const x of [295, 304, 313]) g.lineStyle(3, 0x779164).lineBetween(305, 609, x, 590);
    scene.rect(g, 291, 603, 28, 12, 0xa88a5f, 3);
  }
}
