import Phaser from "phaser";
import { ENEMIES, GROUND, HEIGHT, LEVELS, WIDTH } from "./content";
import { pendulumPosition, platformPosition, stepGame } from "./engine";
import type { Game, Input } from "./engine";
import type SpringAudio from "./audio";

export interface Bridge {
  state: Game;
  input: Input;
  scene: SpringScene | null;
  onChange: () => void;
  audio: SpringAudio;
  loaded: boolean;
  manual: boolean;
  failure: string;
}
const C = {
  sky: 0xffefd5,
  ink: 0x466957,
  grass: 0x7ea77c,
  grassTop: 0xb3c995,
  soil: 0xe1b48a,
  soilDark: 0xc99d78,
  wood: 0xbc8762,
  cream: 0xfff4d9,
  pink: 0xe4a0a1,
  yellow: 0xf8d786,
};
export default class SpringScene extends Phaser.Scene {
  bridge: Bridge;
  bg!: Phaser.GameObjects.Graphics;
  world!: Phaser.GameObjects.Graphics;
  fx!: Phaser.GameObjects.Graphics;
  player!: Phaser.GameObjects.Image;
  sprites: Phaser.GameObjects.Image[] = [];
  signs: Phaser.GameObjects.Text[] = [];
  goalLabel!: Phaser.GameObjects.Text;
  levelDrawn = -1;
  accumulator = 0;
  lastHud = 0;
  constructor(bridge: Bridge) {
    super("SpringScene");
    this.bridge = bridge;
  }
  preload() {
    this.load.image("sui-idle", "/images/autochess/portraits/minimal/sui.png");
    this.load.image("sui-run", "/games/sui-spring/sui-run.png");
    for (const [key, enemy] of Object.entries(ENEMIES)) this.load.image(
        `spring-${key}`,
        `/images/autochess/portraits/minimal/${enemy.art}.png`,
      );
    this.load.on("loaderror", (file: { key: string }) => {
      this.bridge.failure = `素材没有加载成功：${file.key}。请刷新重试。`;
      this.bridge.onChange();
    });
  }
  create() {
    this.bridge.scene = this;
    this.bg = this.add.graphics().setDepth(0);
    this.world = this.add.graphics().setDepth(2);
    this.fx = this.add.graphics().setDepth(8);
    this.player = this.add
      .image(0, 0, "sui-idle")
      .setOrigin(0.5, 1)
      .setDepth(6);
    this.goalLabel = this.add
      .text(0, 0, "", {
        fontFamily: "sans-serif",
        fontSize: "17px",
        color: "#47725c",
        align: "center",
        fontStyle: "bold",
      })
      .setDepth(3)
      .setOrigin(0.5);
    this.bridge.loaded = true;
    this.bridge.onChange();
    this.paint();
  }
  tick(ms: number) {
    for (let i = 0; i < Math.floor(Math.min(30000, ms) / (1000 / 120)); i++) stepGame(this.bridge.state, this.bridge.input);
    this.consume();
    this.paint();
    this.bridge.onChange();
  }
  update(_time: number, delta: number) {
    if (!this.bridge.manual) {
      this.accumulator = Math.min(this.accumulator + delta / 1000, 0.1);
      while (this.accumulator >= 1 / 120) {
        stepGame(this.bridge.state, this.bridge.input);
        this.accumulator -= 1 / 120;
      }
    }
    this.consume();
    this.paint();
    const now = performance.now();
    if (now - this.lastHud > 80) {
      this.lastHud = now;
      this.bridge.onChange();
    }
    this.bridge.audio.update(this.bridge.state.phase === "playing");
  }
  consume() {
    for (const e of this.bridge.state.events) {
      if (e !== "save") this.bridge.audio.effect(e);
      else this.bridge.onChange();
    }
    this.bridge.state.events.length = 0;
  }
  ellipse(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    alpha = 1,
  ) {
    g.fillStyle(color, alpha).fillEllipse(x, y, w, h);
  }
  rect(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    radius = 0,
  ) {
    g.fillStyle(color);
    if (radius) g.fillRoundedRect(x, y, w, h, radius);
    else g.fillRect(x, y, w, h);
  }
  flower(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color = C.pink,
    size = 1,
  ) {
    g.lineStyle(1.5, C.ink, 0.5).lineBetween(x, y, x - 1, y + 14 * size);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      this.ellipse(
        g,
        x + Math.cos(a) * 4 * size,
        y + Math.sin(a) * 4 * size,
        6 * size,
        6 * size,
        color,
      );
    }
    this.ellipse(g, x, y, 4 * size, 4 * size, C.yellow);
  }
  house(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    variant: number,
  ) {
    this.rect(
      g,
      x - 45 * scale,
      y - 90 * scale,
      90 * scale,
      90 * scale,
      variant % 2 ? 0xf3dec0 : 0xf3d2b8,
      5,
    );
    g.fillStyle(variant % 2 ? 0xa3b7a1 : 0xd9a898).fillTriangle(
      x - 59 * scale,
      y - 86 * scale,
      x,
      y - 140 * scale,
      x + 59 * scale,
      y - 86 * scale,
    );
    this.rect(
      g,
      x - 10 * scale,
      y - 42 * scale,
      21 * scale,
      42 * scale,
      0xb2947a,
      10,
    );
    for (const d of [-1, 1]) {
      this.rect(
        g,
        x + d * 25 * scale - 8 * scale,
        y - 66 * scale,
        16 * scale,
        20 * scale,
        0xffefb9,
        3,
      );
      g.lineStyle(2 * scale, 0xb49d7c).lineBetween(
        x + d * 25 * scale,
        y - 66 * scale,
        x + d * 25 * scale,
        y - 46 * scale,
      );
    }
  }
  background() {
    const s = this.bridge.state;
    const g = this.bg;
    const { camera } = s;
    const t = s.time;
    g.clear();
    const sky = [0xffefd5, 0xf5efdd, 0xf5e3ce, 0xedcdbf][s.level];
    this.rect(g, 0, 0, WIDTH, HEIGHT, sky);
    this.ellipse(g, 764 - camera * 0.015, 108, 115, 115, 0xfff8dc, 0.65);
    this.ellipse(g, 764 - camera * 0.015, 108, 78, 78, 0xffdfa1, 0.8);
    for (let i = 0; i < 7; i++) {
      const x =
        ((((i * 203 - camera * 0.09 + t * 2) % 1350) + 1350) % 1350) - 180;
      this.ellipse(g, x, 95 + (i % 3) * 37, 125, 24, 0xfff9ec, 0.8);
      this.ellipse(g, x + 16, 83 + (i % 3) * 37, 64, 37, 0xfff9ec, 0.8);
    }
    for (let i = -1; i < 7; i++) {
      const x = i * 250 - ((camera * 0.15) % 250);
      this.ellipse(g, x + 100, 397, 440, 250 + (i % 3) * 35, 0xcbd6b4);
      this.ellipse(g, x + 230, 433, 390, 210 + (i % 2) * 30, 0xb0c7a4);
    }
    for (let i = -1; i < 8; i++) {
      const x = i * 180 - ((camera * 0.3) % 180);
      this.house(g, x + 60, 403, 0.5 + (i % 2) * 0.1, i);
      if (i % 3 === 0) {
        const y = 250;
        this.rect(g, x + 128, y + 20, 8, 150, 0xc5bfa4);
        const a = t * 0.5;
        for (let j = 0; j < 4; j++) {
          const angle = a + (j * Math.PI) / 2;
          g.lineStyle(8, 0xfff1ce).lineBetween(
            x + 132,
            y + 30,
            x + 132 + Math.cos(angle) * 47,
            y + 30 + Math.sin(angle) * 47,
          );
        }
        this.ellipse(g, x + 132, y + 30, 13, 13, 0xbba786);
      }
    }
    for (let i = -1; i < 10; i++) {
      const x = i * 137 - ((camera * 0.48) % 137);
      this.rect(g, x + 40, 346, 7, 110, 0x9eab87);
      this.ellipse(g, x + 43, 335, 95, 95, i % 3 === 0 ? 0xe4b5ac : 0xabc29c);
      this.ellipse(g, x + 20, 335, 61, 56, i % 3 === 0 ? 0xedc6b8 : 0xbdd0a9);
      this.ellipse(g, x + 61, 307, 68, 61, i % 3 === 0 ? 0xebc0b2 : 0xc1d1ad);
    }
    if (s.level === 2) {
      for (let i = -1; i < 6; i++) {
        const x = i * 260 - ((camera * 0.38) % 260);
        this.rect(g, x, 392, 185, 64, 0xd3b69a, 4);
        g.fillStyle(0xc59e87).fillTriangle(
          x - 12,
          394,
          x + 92,
          341,
          x + 197,
          394,
        );
        g.lineStyle(2, 0xe0bf9d);
        for (let j = 0; j < 4; j++) g.lineBetween(x + j * 32, 391, x + 65 + j * 28, 355 + j * 6);
        for (let j = 0; j < 3; j++) {
          this.rect(g, x + 23 + j * 52, 414, 24, 28, 0xf1deb0, 5);
          this.rect(g, x + 22 + j * 52, 442, 27, 5, 0xb58b72, 2);
        }
      }
    }
    if (s.level === 3) {
      g.lineStyle(2, 0xa48f7d).lineBetween(0, 65, 960, 110);
      for (let i = 0; i < 14; i++) this.ellipse(
          g,
          i * 76 + 20,
          67 + i * 3.5,
          8,
          12,
          i % 2 ? 0xffe2a1 : 0xfff2c4,
        );
    }
    for (let i = 0; i < 16; i++) {
      const x =
        (((i * 79 + Math.sin(t * 0.3 + i) * 20 - camera * 0.6) % WIDTH) +
          WIDTH) %
        WIDTH;
      const y = (i * 37 + t * (6 + (i % 4))) % 430;
      this.ellipse(g, x, y, 5, 3, i % 2 ? 0xe9b7a7 : 0xfff3cd, 0.7);
    }
  }
  paint() {
    const s = this.bridge.state;
    const level = LEVELS[s.level];
    const { camera } = s;
    const g = this.world;
    const f = this.fx;
    this.background();
    g.clear();
    f.clear();
    if (s.level === 3 && camera > 5300) {
      const x = 6380 - camera;
      // Backstage rigging, curtains and warm pools of light frame the final encounter.
      this.rect(g, x, 146, 850, 14, 0xb69b7f, 4);
      this.rect(g, x, 150, 13, 306, 0xb69b7f, 3);
      this.rect(g, x + 837, 150, 13, 306, 0xb69b7f, 3);
      for (let j = 0; j < 7; j++) this.rect(
          g,
          x + j * 14,
          162,
          21,
          120 - j * 10,
          j % 2 ? 0xd6a191 : 0xc89185,
          8,
        );
      for (let j = 0; j < 7; j++) this.rect(
          g,
          x + 740 + j * 14,
          162,
          21,
          60 + j * 10,
          j % 2 ? 0xd6a191 : 0xc89185,
          8,
        );
      g.fillStyle(0xffe6a5, 0.15).fillTriangle(
        x + 230,
        173,
        x + 110,
        GROUND,
        x + 390,
        GROUND,
      );
      g.fillStyle(0xffe6a5, 0.15).fillTriangle(
        x + 620,
        173,
        x + 470,
        GROUND,
        x + 750,
        GROUND,
      );
      for (let j = 0; j < 10; j++) {
        this.ellipse(
          g,
          x + 135 + j * 66,
          170 + Math.sin((j / 9) * Math.PI) * 25,
          9,
          12,
          0xffe2a1,
        );
      }
    }
    if (s.level !== this.levelDrawn) {
      this.levelDrawn = s.level;
      this.sprites.forEach((v) => v.destroy());
      this.sprites = s.enemies.map((e) => this.add.image(0, 0, `spring-${e.kind}`).setOrigin(0.5, 1).setDepth(5),);
      this.signs.forEach((v) => v.destroy());
      this.signs = level.signs.map((sign) => this.add
          .text(sign.x, sign.y - 80, sign.text, {
            fontFamily: "sans-serif",
            fontSize: "13px",
            color: "#57745c",
            align: "center",
            lineSpacing: 5,
            backgroundColor: "#fff4dedb",
            padding: { x: 13, y: 9 },
          })
          .setOrigin(0.5, 1)
          .setDepth(3),);
    }
    level.platforms.forEach((platform, i) => {
      const p = platformPosition(platform, s.time);
      const x = p.x - camera;
      if (x > WIDTH + 60 || x + p.w < -60) return;
      if (p.kind === "crumble" && (s.crumble[i] || 0) > 0.6) {
        f.lineStyle(1, C.wood, 0.2).strokeRoundedRect(x, p.y, p.w, p.h, 4);
        return;
      }
      if (p.kind === "grass") {
        this.rect(g, x, p.y + 10, p.w, p.h, C.soil);
        this.rect(g, x, p.y + 12, p.w, 14, C.soilDark);
        this.rect(g, x, p.y, p.w, 15, C.grass, 6);
        this.rect(g, x, p.y, p.w, 5, C.grassTop, 3);
        g.lineStyle(1, 0xecc798, 0.55).lineBetween(
          x,
          p.y + 52,
          x + p.w,
          p.y + 52,
        );
        g.lineStyle(2, 0xc19674, 0.24).lineBetween(
          x,
          p.y + 86,
          x + p.w,
          p.y + 86,
        );
        for (const edgeX of [x + 10, x + p.w - 15]) {
          g.lineStyle(2, 0xa08c5f, 0.5)
            .lineBetween(edgeX, p.y + 18, edgeX + 5, p.y + 40)
            .lineBetween(edgeX + 5, p.y + 40, edgeX - 4, p.y + 51);
          this.ellipse(g, edgeX + 10, p.y + 24, 11, 5, 0xa2ad7c);
          this.ellipse(g, edgeX + 1, p.y + 38, 9, 5, 0xa2ad7c);
        }
        for (let j = Math.max(0, Math.floor(-x / 34)); j < p.w / 34; j++) {
          const bx = x + j * 34;
          if (bx > WIDTH + 30) break;
          this.ellipse(
            g,
            bx + 11,
            p.y + 45 + (j % 3) * 19,
            9,
            5,
            C.soilDark,
            0.4,
          );
          if (j % 3 === 0) this.flower(
              g,
              bx + 14,
              p.y - 12 - (j % 4),
              j % 2 ? C.cream : C.pink,
              0.65,
            );
          if (j % 5 === 1) {
            g.lineStyle(1.2, C.ink, 0.3).lineBetween(
              bx,
              p.y - 1,
              bx - 3,
              p.y - 9,
            );
            g.lineBetween(bx + 2, p.y - 1, bx + 6, p.y - 7);
          }
        }
      } else {
        if (p.kind === "moving") {
          g.lineStyle(2, 0x809888, 0.2).lineBetween(
            platform.x - camera - (p.move || 45),
            p.y + 9,
            platform.x - camera + (p.move || 45) + p.w,
            p.y + 9,
          );
        }
        this.rect(
          g,
          x,
          p.y + 4,
          p.w,
          p.h,
          p.kind === "moving" ? 0x83a99d : C.wood,
          5,
        );
        this.rect(
          g,
          x,
          p.y,
          p.w,
          6,
          p.kind === "moving" ? 0xbdd6bb : 0xe5bc83,
          4,
        );
        for (let j = 12; j < p.w; j += 29) {
          g.lineStyle(1, 0x785b49, 0.25).lineBetween(
            x + j,
            p.y + 7,
            x + j,
            p.y + 17,
          );
          this.ellipse(g, x + j + 4, p.y + 10, 2, 2, 0x7b6a55);
        }
        if (p.kind === "crumble") {
          g.lineStyle(2, 0x765e53)
            .lineBetween(x + p.w * 0.4, p.y, x + p.w * 0.47, p.y + 9)
            .lineBetween(x + p.w * 0.47, p.y + 9, x + p.w * 0.44, p.y + 20);
        }
      }
    });
    // Small world details: fences, mailboxes, flowers and bunting are deliberately below the route.
    for (
      let i = Math.floor(camera / 650);
      i <= Math.ceil((camera + WIDTH) / 650);
      i++
    ) {
      const x = i * 650 + 320 - camera;
      if (
        !level.platforms.some(
          (p) => p.kind === "grass" &&
            i * 650 + 320 > p.x + 60 &&
            i * 650 + 410 < p.x + p.w,
        )
      ) continue;
      for (let j = 0; j < 4; j++) this.rect(g, x + j * 22, GROUND - 30, 7, 30, 0xd2bf92, 3);
      this.rect(g, x - 2, GROUND - 20, 78, 5, 0xd2bf92, 2);
      this.rect(g, x - 2, GROUND - 10, 78, 4, 0xd2bf92, 2);
      this.flower(g, x + 91, GROUND - 19, C.pink, 1.1);
      if (s.level === 0 && i % 2 === 0) {
        this.rect(g, x + 130, GROUND - 63, 6, 63, 0xad9672, 2);
        this.rect(g, x + 114, GROUND - 78, 41, 29, 0xb97766, 7);
        this.rect(g, x + 117, GROUND - 73, 30, 4, 0x865f50, 2);
        this.rect(g, x + 125, GROUND - 67, 16, 11, C.cream, 2);
        g.lineStyle(1, 0xccac82)
          .lineBetween(x + 125, GROUND - 67, x + 133, GROUND - 62)
          .lineBetween(x + 133, GROUND - 62, x + 141, GROUND - 67);
      }
      if (s.level === 1) {
        this.rect(g, x + 122, GROUND - 145, 6, 145, 0xb5a27f, 2);
        g.lineStyle(3, 0xb5a27f).lineBetween(
          x + 100,
          GROUND - 141,
          x + 151,
          GROUND - 141,
        );
        for (let j = 0; j < 3; j++) {
          const cx = x + 105 + j * 18 + Math.sin(s.time * 2 + j) * 3;
          g.lineStyle(1, 0x9d9d7d).lineBetween(
            x + 105 + j * 18,
            GROUND - 141,
            cx,
            GROUND - 115,
          );
          this.rect(g, cx - 3, GROUND - 115, 6, 18 + j * 5, 0xd7c29b, 2);
        }
      }
      if (s.level === 2) {
        for (let j = 0; j < 3; j++) {
          this.rect(g, x + 123 + j * 20, GROUND - 17, 18, 17, 0xc89778, 3);
          this.flower(
            g,
            x + 132 + j * 20,
            GROUND - 31,
            j % 2 ? C.cream : C.pink,
            0.8,
          );
        }
      }
    }
    level.checkpoints.forEach((cp) => {
      const x = cp - camera;
      if (x < -80 || x > WIDTH + 80) return;
      this.rect(g, x, GROUND - 100, 5, 100, 0x8b9070, 2);
      const lit = s.checkpoint >= cp;
      g.fillStyle(lit ? 0xf0ba68 : 0xc4cfb0).fillTriangle(
        x + 5,
        GROUND - 98,
        x + 46,
        GROUND - 84 + Math.sin(s.time * 3) * 2,
        x + 5,
        GROUND - 67,
      );
      this.ellipse(g, x + 4, GROUND - 102, 11, 11, C.cream);
    });
    for (const spring of level.springs) {
      const x = spring.x - camera;
      this.rect(g, x - 22, spring.y - 7, 44, 7, 0x658c7d, 3);
      g.lineStyle(3, 0x6f9b88);
      for (let j = 0; j < 3; j++) g.lineBetween(
          x - 12 + j * 8,
          spring.y - 8,
          x - 4 + j * 8,
          spring.y - 17,
        );
      this.rect(g, x - 22, spring.y - 20, 44, 7, 0xc1d1a1, 3);
    }
    level.pickups.forEach((item) => {
      if (s.collected.includes(item.id)) return;
      const x = item.x - camera;
      const y = item.y + Math.sin(s.time * 3 + item.x) * 3;
      if (x < -30 || x > WIDTH + 30) return;
      if (item.kind === "coin") {
        this.ellipse(
          g,
          x,
          y,
          14 + Math.sin(s.time * 4 + item.x) * 3,
          19,
          0xd8a555,
        );
        this.ellipse(
          g,
          x,
          y - 1,
          10 + Math.sin(s.time * 4 + item.x) * 2,
          15,
          0xffdc85,
        );
        g.lineStyle(1.5, 0xfff0b0).lineBetween(x, y - 4, x, y + 3);
      } else if (item.kind === "star") {
        this.ellipse(g, x, y, 50, 50, 0xffe1a0, 0.2);
        const points = Array.from({ length: 10 }, (_, i) => {
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const r = i % 2 ? 7 : 16;
          return new Phaser.Math.Vector2(
            x + Math.cos(a) * r,
            y + Math.sin(a) * r,
          );
        });
        g.fillStyle(0xe4ac4f).fillPoints(points, true);
        g.lineStyle(2, 0xffedaa).strokePoints(points, true);
        this.ellipse(g, x - 4, y - 1, 2, 3, 0x9a743b);
        this.ellipse(g, x + 4, y - 1, 2, 3, 0x9a743b);
      } else {
        g.fillStyle(C.pink)
          .fillCircle(x - 5, y - 4, 7)
          .fillCircle(x + 5, y - 4, 7)
          .fillTriangle(x - 11, y - 2, x + 11, y - 2, x, y + 12);
      }
    });
    level.hazards.forEach((h) => {
      if (Math.abs(h.x - camera - WIDTH / 2) > WIDTH) return;
      if (h.kind === "spikes") {
        this.rect(g, h.x - camera, h.y - 4, h.w, 5, 0x8d8f7a, 2);
        for (let j = 0; j < h.w - 5; j += 16) {
          g.fillStyle(0x7f908a).fillTriangle(
            h.x + j - camera,
            h.y - 3,
            h.x + j + 8 - camera,
            h.y - 23,
            h.x + j + 16 - camera,
            h.y - 3,
          );
          g.lineStyle(1, 0xd4ddd0).lineBetween(
            h.x + j + 8 - camera,
            h.y - 21,
            h.x + j + 13 - camera,
            h.y - 5,
          );
        }
      } else {
        const pos = pendulumPosition(h, s.time);
        g.lineStyle(6, 0xb8a789).lineBetween(
          h.x - camera,
          h.y,
          pos.x - camera,
          pos.y,
        );
        g.lineStyle(2, 0xe2cfaa).lineBetween(
          h.x - camera - 1,
          h.y,
          pos.x - camera - 1,
          pos.y,
        );
        this.ellipse(g, h.x - camera, h.y, 15, 15, 0x819b87);
        this.ellipse(g, pos.x - camera, pos.y, 52, 52, 0x768d80);
        this.ellipse(g, pos.x - camera - 5, pos.y - 5, 35, 35, 0xa4b3a0);
        this.ellipse(g, pos.x - camera, pos.y, 12, 12, 0xe0cf9a);
      }
    });
    s.enemies.forEach((e, i) => {
      const sprite = this.sprites[i];
      if (!sprite) return;
      const x = e.x + e.w / 2 - camera;
      sprite.setVisible(e.alive && x > -100 && x < WIDTH + 100);
      if (!sprite.visible) return;
      const height = e.kind === "director" ? 88 : e.shell ? 35 : 60;
      if (e.shell) {
        this.ellipse(g, x, e.y + e.h - 10, 46, 25, 0xb88f65);
        this.ellipse(g, x, e.y + e.h - 12, 40, 20, 0xe2bb7f);
      }
      const squash =
        e.kind === "hopper" && e.grounded && e.timer < 0.45
          ? 0.2
          : Math.sin(s.time * 9 + i) * (e.kind === "flyer" ? 0.05 : 0.07);
      sprite
        .setPosition(x, e.y + e.h + 3)
        .setDisplaySize(height * (1 + squash), height * (1 - squash))
        .setFlipX(e.direction < 0)
        .setAlpha(e.stun > 0 ? 0.55 + Math.sin(s.time * 35) * 0.25 : 1);
      this.ellipse(g, x, e.y + e.h + 2, e.w + 13, 6, 0x4e7056, 0.15);
      if (
        (e.kind === "archer" || e.kind === "mortar" || e.kind === "director") &&
        e.timer < 0.8
      ) {
        f.lineStyle(2, 0xce7060, 0.7).strokeCircle(
          x,
          e.y + 13,
          36 + Math.sin(s.time * 20) * 3,
        );
        this.ellipse(f, x, e.y - 19, 6, 6, 0xe28c67);
      }
      if (e.kind === "archer") {
        f.lineStyle(3, 0x91744f)
          .lineBetween(x - 25, e.y + 15, x - 30, e.y + 30)
          .lineBetween(x - 30, e.y + 30, x - 25, e.y + 45);
      }
      if (e.kind === "mortar" || e.kind === "director") {
        this.rect(f, x - 35, e.y + e.h - 20, 28, 18, 0x7b8c80, 5);
        f.lineStyle(10, 0x7b8c80).lineBetween(
          x - 23,
          e.y + e.h - 22,
          x - 33,
          e.y + e.h - 37,
        );
      }
      if (e.kind === "director") for (let j = 0; j < 3; j++) this.ellipse(
            f,
            x - 18 + j * 18,
            e.y - 15,
            10,
            10,
            j < e.hp ? C.pink : 0xcdb49a,
          );
    });
    for (const shot of s.projectiles) {
      const x = shot.x - camera;
      if (shot.type === "arrow") {
        f.lineStyle(3, 0x9c7557).lineBetween(x, shot.y + 4, x + 29, shot.y + 4);
        const tip = shot.vx < 0 ? x : x + 30;
        f.fillStyle(0x777f70).fillTriangle(
          tip,
          shot.y + 4,
          tip + (shot.vx < 0 ? 9 : -9),
          shot.y - 1,
          tip + (shot.vx < 0 ? 9 : -9),
          shot.y + 9,
        );
      } else {
        if (!shot.exploded) {
          this.ellipse(
            f,
            x,
            shot.y,
            18,
            18,
            shot.fuse >= 0 && Math.sin(s.time * 30) > 0 ? 0xf1aa79 : 0x6f8277,
          );
          f.lineStyle(2, 0xffde94).lineBetween(
            x,
            shot.y - 9,
            x + 4,
            shot.y - 16,
          );
        }
        f.lineStyle(2, 0xd87462, 0.65).strokeEllipse(
          shot.target - camera,
          shot.targetY - 2,
          105 + Math.sin(s.time * 8) * 4,
          16,
        );
        if (shot.fuse >= 0 && !shot.exploded) f.lineStyle(2, 0xd87462, 0.7).strokeEllipse(x, shot.y + 12, 115, 18);
        if (shot.exploded) this.ellipse(f, x, shot.y, 125, 125, 0xf5bc75, shot.life * 2);
      }
    }
    // The destination is a real building, so the last screen has a place to arrive at.
    const gx = level.goal - camera;
    if (gx < WIDTH + 200) {
      this.house(g, gx + 50, GROUND, 1.45, s.level);
      this.rect(g, gx - 27, GROUND - 102, 154, 30, C.cream, 5);
      this.goalLabel
        .setText(
          [
            "春风邮局",
            "风铃试音室",
            "星光工作室",
            s.phase === "clear" ? "ON AIR · 岁己" : "首播的舞台",
          ][s.level],
        )
        .setPosition(gx + 50, GROUND - 87)
        .setVisible(true);
      if (s.level === 3) {
        g.fillStyle(C.pink).fillTriangle(
          gx - 33,
          GROUND - 136,
          gx + 50,
          GROUND - 182,
          gx + 133,
          GROUND - 136,
        );
      }
    } else this.goalLabel.setVisible(false);
    level.signs.forEach((sign, i) => this.signs[i]
        ?.setX(sign.x - camera)
        .setVisible(Math.abs(sign.x - camera - WIDTH / 2) < WIDTH),);
    const p = s.player;
    const running = Math.abs(p.vx) > 50;
    const h = 64 * (1 - p.squash);
    const w = (running ? 64 : 61) * (1 + p.squash);
    this.player
      .setTexture(running ? "sui-run" : "sui-idle")
      .setDisplaySize(w, h)
      .setPosition(
        p.x + p.w / 2 - camera,
        p.y + p.h + 5 + (p.grounded && running ? Math.sin(s.time * 22) * 2 : 0),
      )
      .setFlipX(p.facing < 0)
      .setRotation(
        p.grounded
          ? Math.sin(s.time * (running ? 20 : 3)) * (running ? 0.045 : 0.015)
          : p.vx / 7500,
      )
      .setVisible(s.phase !== "dead")
      .setAlpha(p.invincible > 0 ? 0.5 + Math.sin(s.time * 28) * 0.35 : 1);
    this.ellipse(g, p.x + 13 - camera, p.y + p.h + 3, 32, 6, 0x42684f, 0.15);
    for (const v of s.particles) this.ellipse(
        f,
        v.x - camera,
        v.y,
        v.size,
        v.size,
        v.color,
        Math.max(0, v.life / v.max),
      );
    if (s.bossLock) {
      f.lineStyle(3, 0xe5ba82, 0.6).lineBetween(
        6300 - camera,
        330,
        6300 - camera,
        GROUND,
      );
      f.lineBetween(7220 - camera, 330, 7220 - camera, GROUND);
    }
    if (s.shake > 0) this.cameras.main.setScroll(
        Math.sin(s.time * 90) * s.shake * 12,
        Math.cos(s.time * 70) * s.shake * 8,
      );
    else this.cameras.main.setScroll(0, 0);
  }
}
