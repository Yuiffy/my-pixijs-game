import type Phaser from "phaser";
import type DeliveryScene from "./DeliveryScene";
import { deliveryLevel } from "./levels";
import { canopyPhase } from "./rain";

export function drawRainDistrict(scene: DeliveryScene): boolean {
  const level = deliveryLevel(scene.bridge.state);
  if (!level.rain) return false;
  const g = scene.buildings;
  if (level.theme === "greenhouse") {
    scene.rect(g, 740, 250, 1600, 440, 0xb5cabb, 8);
    scene.roof(g, 730, 130, 1620, 125, 0x688c85);
    scene.rect(g, 760, 270, 1560, 400, 0xd6e1c6, 3);
    for (let x = 780; x < 2340; x += 130) {
      g.lineStyle(8, 0x6a8d7a).lineBetween(x, 250, x, 680);
      g.lineStyle(2, 0xf7f0cf, 0.65).lineBetween(x + 20, 290, x + 85, 355);
    }
    g.lineStyle(7, 0x6a8d7a).lineBetween(740, 365, 2340, 365);
    for (const [x, y] of [
      [840, 500],
      [1360, 420],
      [1460, 420],
      [2150, 480],
      [2710, 410],
    ]) {
      scene.rect(g, x, y - 27, 54, 27, 0xa87956, 5);
      for (let n = 0; n < 3; n++) scene.flower(g, x + 9 + n * 16, y - 48, 0xd2a56f);
    }
    scene.rect(g, 2700, 275, 270, 135, 0x93b49c, 7);
    scene.window(g, 2780, 292, 60, 85);
    scene.ellipse(g, 2810, 333, 37, 48, 0xf5d487, 0.4);
  } else {
    for (const roof of level.surfaces.filter(
      (surface) => surface.kind === "wood" && surface.w >= 240 && surface.y < 600,
    )) {
      scene.rect(g, roof.x + 15, roof.y + 18, roof.w - 30, 330, 0xa9b9ac, 3);
      scene.window(g, roof.x + 45, roof.y + 65, 52, 70);
      scene.window(g, roof.x + roof.w - 110, roof.y + 65, 52, 70);
      g.lineStyle(3, 0x7b9686).lineBetween(
        roof.x + 20,
        roof.y + 180,
        roof.x + roof.w - 20,
        roof.y + 180,
      );
      scene.rect(g, roof.x - 8, roof.y + 17, roof.w + 16, 13, 0x5e7d79, 4);
      for (let { x } = roof; x < roof.x + roof.w; x += 28) g.lineStyle(2, 0x4e716e).lineBetween(
          x,
          roof.y + 18,
          x + 8,
          roof.y + 29,
        );
    }
    if (level.theme === "rain") {
      scene.rect(g, 2780, 260, 250, 130, 0xb3c4b0);
      scene.roof(g, 2760, 190, 280, 75, 0x577d75);
      scene.window(g, 2870, 280, 64, 90);
    }
    if (level.theme === "bird") for (let x = 2650; x < 3250; x += 70) {
        const y = 330 + Math.sin(((x - 2650) / 500) * Math.PI) * 35;
        g.lineStyle(2, 0x677f78).lineBetween(x, y, x + 70, y + 6);
        scene.ellipse(g, x, y + 9, 12, 16, 0xf2ce88);
      }
  }
  return true;
}

export function drawRainMechanisms(
  scene: DeliveryScene,
  g: Phaser.GameObjects.Graphics,
  front: Phaser.GameObjects.Graphics,
) {
  const s = scene.bridge.state;
  const level = deliveryLevel(s);
  const { rain } = level;
  if (!rain) return;
  const t = s.save.settings.reducedMotion ? 0 : s.clock;
  for (const canopy of rain.canopies) {
    const phase = canopyPhase(s, canopy);
    if (phase === "closed" || phase === "folded") {
      scene.rect(g, canopy.x - 10, canopy.y - 7, 32, 31, 0x779c92, 12);
      g.lineStyle(3, 0xf7e8b6).strokeCircle(canopy.x + 6, canopy.y + 8, 10);
      g.lineStyle(4, 0x738b79).lineBetween(
        canopy.x,
        canopy.y + 20,
        canopy.x,
        740,
      );
    }
    if (phase === "warning") for (let x = canopy.x + 15; x < canopy.x + canopy.w; x += 30) g.lineStyle(3, 0xe8b759)
          .lineBetween(x, canopy.y - 15, x + 6, canopy.y - 22)
          .lineBetween(x + 6, canopy.y - 22, x + 12, canopy.y - 15);
  }
  for (const hook of rain.hooks) {
    const open = s.switches.includes(hook.id);
    const green = level.theme === "greenhouse";
    const [x, y] = [hook.x, hook.y];
    g.lineStyle(green ? 9 : 4, green ? 0x6a8d7a : 0x778b75).lineBetween(
      x - 20,
      y - 65,
      x + 25,
      y - 65,
    );
    g.lineStyle(6, open ? 0x699f91 : 0xe5ba69).lineBetween(
      x,
      y - 50,
      x + (open ? 28 : 0),
      y - 6,
    );
    scene.ellipse(g, x, y, 30, 30, open ? 0x82b2a0 : 0xf6d895);
    g.lineStyle(3, 0xfff0cc).strokeCircle(x, y, 11);
    g.lineStyle(3, 0x466b63)
      .lineBetween(x - 8, y + 2, x, y - 6)
      .lineBetween(x, y - 6, x + 8, y + 2);
    if (green && open) for (let i = 0; i < 9; i++) {
        const f = (t * 0.7 + i / 9) % 1;
        scene.ellipse(
          g,
          x + 30 + f * 150,
          y - 35 + f * 90,
          5,
          9,
          0x7faeac,
          0.8,
        );
      }
  }
  if (rain.lift) {
    const { lift } = rain;
    scene.rect(g, lift.x - 16, lift.high - 8, lift.w + 32, 690 - lift.high + 8, 0x709f99, 5);
    scene.rect(g, lift.x - 8, s.rain.liftY + 12, lift.w + 16, Math.max(1, 690 - s.rain.liftY), 0x9cc6b8, 3);
    g.lineStyle(3, 0xd1e4c7).lineBetween(lift.x - 8, s.rain.liftY + 12, lift.x + lift.w + 8, s.rain.liftY + 12);
    scene.rect(g, 1020, 690, 1240, 200, 0x8eb8b2, 4);
    for (let x = 1040; x < 2250; x += 50) scene.rect(g, x, 710 + (x % 21), 28, 2, 0xd7e9cc);
    scene.rect(g, lift.x, s.rain.liftY, lift.w, 28, 0x6f9c85, 9);
    scene.rect(g, lift.x - 4, s.rain.liftY - 3, lift.w + 8, 8, 0xe1d9af, 4);
    for (let x = lift.x + 12; x < lift.x + lift.w; x += 28) scene.ellipse(g, x, s.rain.liftY + 17, 16, 16, 0x9ebd8e);
    for (let x = 1665; s.switches.includes("green-outlet") && x < 2010; x += 62) if (x < 1815 || x > 1860) scene.flower(g, x, x < 1815 ? 468 : 458, 0xe8bc80);
  }
  const { bird } = s.rain;
  if (bird && rain.bird) {
    if (bird.phase === "warning") for (let n = 0; n < 12; n++) {
        const f = n / 12;
        scene.ellipse(
          g,
          bird.fromX + (bird.targetX - bird.fromX) * f,
          bird.fromY + (bird.targetY - bird.fromY) * f,
          7,
          5,
          0xe1b75e,
        );
      }
    const { x, y } = bird;
    const wing = Math.sin(t * (bird.phase === "swoop" ? 25 : 10)) * 12;
    scene.ellipse(g, x, y, 39, 27, 0xd3ab6d);
    scene.ellipse(g, x - 10, y - 7 + wing * 0.3, 28, 14, 0x748c7d);
    g.fillStyle(0xd88c54).fillTriangle(
      x - 21,
      y - 2,
      x - 34,
      y + 2,
      x - 21,
      y + 7,
    );
    scene.ellipse(g, x - 12, y - 5, 5, 5, 0x355c51);
    if (!s.switches.includes("bird-ribbon")) g.lineStyle(3, 0xb95b52)
        .lineBetween(x - 25, y + 7, x - 35, y + 22)
        .lineBetween(x - 35, y + 22, x - 27, y + 28);
    const nest = rain.bird;
    scene.ellipse(g, nest.nestX, nest.nestY - 5, 72, 19, 0x9d805b);
    for (let n = 0; n < 3; n++) {
      scene.ellipse(
        g,
        nest.nestX - 18 + n * 18,
        nest.nestY - 15,
        18,
        20,
        0xdcc391,
      );
      scene.ellipse(
        g,
        nest.nestX - 21 + n * 18,
        nest.nestY - 18,
        3,
        3,
        0x355c51,
      );
    }
    if (s.switches.includes("bird-ribbon")) for (let n = 0; n < 4; n++) scene.ellipse(
          g,
          nest.nestX - 28 + n * 18,
          nest.nestY - 7,
          10,
          6,
          0xefddb0,
        );
  }
  if (s.player.dash > 0) for (let i = 1; i < 5; i++) scene.ellipse(
        front,
        s.player.x + 13 - s.player.dashFacing * i * 20,
        s.player.y + 24,
        20 - i * 2,
        12,
        0xfff0cc,
        0.7 - i * 0.12,
      );
  // Rain stays outside the greenhouse glass and has no separate gameplay damage.
  if (level.theme !== "bird") for (let i = 0; i < 70; i++) {
      const x = s.camera.x + ((i * 137 + t * 25) % s.viewport.w);
      const y = s.camera.y + ((i * 79 + t * 290) % s.viewport.h);
      if (level.theme === "greenhouse" && x > 740 && x < 2340 && y > 250) continue;
      front.lineStyle(1, 0xd1e3dc, 0.45).lineBetween(x, y, x - 4, y + 13);
    }
}
