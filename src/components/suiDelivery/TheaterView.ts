import type Phaser from "phaser";
import type DeliveryScene from "./DeliveryScene";
import { deliveryLevel } from "./levels";
import { banquetReady, crownPhase, liftPhase } from "./theater";

export function drawTheaterDistrict(scene: DeliveryScene) {
  const level = deliveryLevel(scene.bridge.state);
  if (!level.theater) return false;
  const g = scene.buildings;
  // Theater walls, fly galleries and the sloped town silhouette give platforms a purpose.
  for (const [x, width] of [[600, 1000], [1840, 950]]) {
    scene.rect(g, x, 170, width, 620, 0xd8bd9b, 8);
    scene.rect(g, x + 16, 190, width - 32, 490, 0xb49a89, 5);
    for (let post = x + 20; post < x + width; post += 150) {
      scene.rect(g, post, 185, 14, 590, 0x806c60, 3);
      g.lineStyle(3, 0xe6cd9f).lineBetween(post, 220, post + 130, 320);
    }
    scene.rect(g, x - 15, 160, width + 30, 25, 0x6f7d79, 5);
    for (let y = 320; y < 680; y += 145) scene.rect(g, x + 10, y, width - 20, 12, 0x9c7863, 3);
  }
  for (const surface of level.surfaces.filter(b => b.kind === "wood" && b.w > 160)) {
    scene.rect(g, surface.x + 12, surface.y + 18, 12, 340, 0x9a7c65);
    scene.rect(g, surface.x + surface.w - 24, surface.y + 18, 12, 340, 0x9a7c65);
    g.lineStyle(3, 0xb59672).lineBetween(surface.x + 18, surface.y + 50, surface.x + surface.w - 18, surface.y + 145);
  }
  for (let x = 120; x < level.world.w; x += 100) {
    const y = 180 + Math.sin(x / 400) * 38;
    g.lineStyle(2, 0x6c7063).lineBetween(x, y, x + 100, 180 + Math.sin((x + 100) / 400) * 38);
    scene.ellipse(g, x, y + 10, 18, 24, 0xf5d58f);
    scene.ellipse(g, x, y + 9, 30, 34, 0xffe2a2, 0.12);
  }
  return true;
}

function mealTable(scene: DeliveryScene, g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, served: boolean) {
  scene.rect(g, x, y - 22, w, 16, 0xf2dfbb, 5);
  scene.rect(g, x + 12, y - 6, 9, 28, 0x8e6d58);
  scene.rect(g, x + w - 21, y - 6, 9, 28, 0x8e6d58);
  for (let cx = x + 35; cx < x + w; cx += 80) {
    scene.ellipse(g, cx, y - 25, 38, 11, 0xfaf0d8);
    if (served) {
      scene.ellipse(g, cx, y - 29, 25, 11, 0xb9bb7d);
      scene.ellipse(g, cx - 5, y - 32, 10, 6, 0xd58e65);
      g.lineStyle(2, 0x729367).lineBetween(cx + 4, y - 28, cx + 9, y - 36);
    }
  }
}
export function drawTheaterMechanisms(scene: DeliveryScene, g: Phaser.GameObjects.Graphics, front: Phaser.GameObjects.Graphics) {
  const s = scene.bridge.state;
  const level = deliveryLevel(s);
  const { theater } = level;
  if (!theater) return;
  const t = s.save.settings.reducedMotion ? 0 : s.theater.time;
  for (const lift of theater.lifts) {
    const y = s.theater.lifts[lift.id] ?? lift.y;
    const phase = liftPhase(s, lift.hook);
    const warningX = lift.x + lift.w - 28;
    for (const x of [lift.x + 12, lift.x + lift.w - 12]) {
      g.lineStyle(4, 0x9a8062).lineBetween(x, 160, x, y);
      scene.ellipse(g, x, 163, 34, 34, 0x6f8079);
      g.lineStyle(3, 0xebcd92).strokeCircle(x, 163, 12);
    }
    scene.rect(g, lift.x - 4, y, lift.w + 8, 22, 0x7e9484, 5);
    scene.rect(g, lift.x - 4, y - 3, lift.w + 8, 7, 0xf0d699, 3);
    for (let x = lift.x + 15; x < lift.x + lift.w; x += 30) scene.rect(g, x, y + 6, 15, 8, 0xcdd2ae, 2);
    if (phase === "warning") {
      front.lineStyle(4, 0xe3ac62).lineBetween(warningX - 12, y - 28, warningX, y - 16).lineBetween(warningX, y - 16, warningX + 12, y - 28);
      scene.ellipse(front, warningX, y - 45, 12, 12, 0xf4ce7d);
    }
  }
  for (const hook of theater.hooks) {
    const off = s.switches.includes(hook.id);
    const crown = hook.id === "banquet-crown";
    const phase = crownPhase(s);
    const color = off ? 0x90b19a : 0xedc279;
    g.lineStyle(4, 0x806c60).lineBetween(hook.x, hook.y - 80, hook.x, hook.y - 18);
    scene.ellipse(g, hook.x, hook.y, crown ? 56 : 34, crown ? 56 : 34, color);
    g.lineStyle(4, 0xffe6b1).strokeCircle(hook.x, hook.y, crown ? 22 : 12);
    if (crown && !off) {
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + (phase === "open" ? 0 : t * 1.5);
        const r = phase === "open" ? 40 : 19;
        scene.ellipse(g, hook.x + Math.cos(a) * r, hook.y + Math.sin(a) * r, 28, 18, phase === "warning" ? 0xf7d890 : 0x8e9d8d);
      }
    } else g.lineStyle(3, 0x547367).lineBetween(hook.x - 8, hook.y + 2, hook.x, hook.y - 6).lineBetween(hook.x, hook.y - 6, hook.x + 8, hook.y + 2);
  }
  if (level.id === "last-table") {
    const served = s.switches.includes("table-served");
    mealTable(scene, g, 1210, 445, 170, served);
    const width = served ? 25 : 130;
    scene.rect(g, 1510, 185, width, served ? 80 : 495, 0x946468, 8);
    for (let x = 1518; x < 1510 + width; x += 20) g.lineStyle(3, 0xb17c78).lineBetween(x, 195, x, served ? 250 : 670);
    mealTable(scene, g, 2910, 395, 220, s.save.delivered.includes(level.id));
  }
  if (theater.banquet) {
    const ready = banquetReady(s);
    g.lineStyle(18, 0x899f8d).lineBetween(2400, 600, 2480, ready ? 425 : 270).lineBetween(2480, ready ? 425 : 270, ready ? 2780 : 2620, ready ? 425 : 250);
    for (let n = 0; n < 3; n++) scene.ellipse(g, 2390, 550 - n * 36, 22, 22, s.switches.includes(["banquet-heat", "banquet-crank", "banquet-crown"][n]) ? 0xf1d38e : 0x748679);
    if (!ready) {
      scene.rect(g, 2750, 180, 48, 500, 0x9e6b6c, 5);
      for (let y = 210; y < 680; y += 40) g.lineStyle(2, 0xc48e7f).lineBetween(2755, y, 2793, y);
    }
    const served = s.switches.includes("banquet-served");
    mealTable(scene, front, 2850, 487, 560, served);
    // The reserved chair and bowl remain visible before the final interaction.
    scene.rect(g, 3200, 449, 40, 45, 0xb95951, 7);
    scene.rect(g, 3195, 490, 50, 9, 0xd67c62, 4);
    scene.rect(g, 3200, 498, 7, 17, 0x865b50);
    scene.rect(g, 3233, 498, 7, 17, 0x865b50);
    if (s.theater.seated) {
      scene.rect(front, 3248, 476, 28, 25, 0xb47d4f, 4);
      scene.rect(front, 3250, 476, 24, 5, 0xf3dfb7, 2);
      scene.ellipse(front, 3220, 462, 33, 10, 0xffedd1);
      scene.ellipse(front, 3220, 460, 23, 7, 0xc59f69);
    }
  }
}
