import Phaser from "phaser";
import DeliveryAudio from "./audio";
import { drawDeliveryFeedback } from "./FeedbackView";
import { deliveryPlayerFrame, deliveryTrayPose, PLAYER_SPRITE_FRAME, PLAYER_SPRITE_SIZE } from "./playerAnimation";
import { deliveryLevel } from "./levels";
import { crabValve, insulatedTray } from "./machinery";
import { beltSpeed, servingStage } from "./market";
import { drawRainDistrict, drawRainMechanisms } from "./RainView";
import { drawTheaterDistrict, drawTheaterMechanisms } from "./TheaterView";
import { drawHomeDetails } from "./HomeView";
import { addBreakfastFacades, BREAKFAST_ART, drawBreakfastMaterials } from "./BreakfastView";
import { addBakeryFacades, BAKERY_ART } from "./BakeryView";
import { addOvenFacades, createOvenCrabArt, OVEN_ART } from "./OvenView";
import { addMarketFacades, createMarketCartArt, MARKET_ART, placeMarketCartArt } from "./MarketView";
import { addFreightFacades, addSorterFacades, createServingArt, FREIGHT_ART, paintServingArt } from "./FreightView";
import { deliverySurfaces, FIXED_DT, stepDelivery } from "./engine";
import type { DeliveryGame, DeliveryInput } from "./types";

export type DeliveryBridge = {
  state: DeliveryGame;
  input: DeliveryInput;
  manual: boolean;
  loaded: boolean;
  scene: DeliveryScene | null;
  audio: DeliveryAudio;
  error: string;
  changed: () => void;
};
const C = {
  ink: 0x425b50,
  cream: 0xfff0cc,
  red: 0xb94e42,
  roof: 0x718c75,
  gold: 0xe8b759,
  wall: 0xf2d9aa,
  wood: 0xa77c57,
  stone: 0x969e90,
};
export default class DeliveryScene extends Phaser.Scene {
  bridge: DeliveryBridge;
  sky!: Phaser.GameObjects.Graphics;
  buildings!: Phaser.GameObjects.Graphics;
  moving!: Phaser.GameObjects.Graphics;
  front!: Phaser.GameObjects.Graphics;
  player!: Phaser.GameObjects.Image;
  gardener!: Phaser.GameObjects.Image;
  mechanic!: Phaser.GameObjects.Image;
  guests: Phaser.GameObjects.Image[] = [];
  homePhoto: Phaser.GameObjects.Image[] = [];
  facades: Phaser.GameObjects.Image[] = [];
  ovenArt!: ReturnType<typeof createOvenCrabArt>;
  marketCartArt!: Phaser.GameObjects.Image;
  servingArt!: ReturnType<typeof createServingArt>;
  labels: Phaser.GameObjects.Text[] = [];
  accumulator = 0;
  hud = 0;
  drawnLevel = "";
  constructor(bridge: DeliveryBridge) {
    super("SpringDelivery");
    this.bridge = bridge;
  }
  preload() {
    for (const art of [...BREAKFAST_ART, ...BAKERY_ART, ...OVEN_ART, ...MARKET_ART, ...FREIGHT_ART]) this.load.image(art.key, `/games/sui-spring/environment/${art.file}`);
    this.load.image(
      "delivery-sui",
      "/images/autochess/portraits/minimal/sui.png",
    );
    for (const [key, group] of [["air", "air"], ["gait", "run"], ["tray", "tray"], ["reaction", "reaction"]]) this.load.spritesheet(`delivery-${key}`, `/games/sui-spring/animations/${group}-v1.png`, { frameWidth: PLAYER_SPRITE_FRAME, frameHeight: PLAYER_SPRITE_FRAME });
    this.load.image(
      "delivery-gardener",
      "/images/autochess/portraits/minimal/viridis.png",
    );
    this.load.image(
      "delivery-mechanic",
      "/images/autochess/portraits/minimal/shiori.png",
    );
    this.load.image(
      "delivery-baker",
      "/images/autochess/portraits/minimal/pako.png",
    );
    this.load.image(
      "delivery-market",
      "/images/autochess/portraits/minimal/rutice.png",
    );
    this.load.image("delivery-freight", "/images/autochess/portraits/minimal/raccoon-archer.png");
    this.load.image("delivery-shelter", "/images/autochess/portraits/minimal/youyi.png");
    this.load.on("loaderror", (file: { key: string }) => {
      this.bridge.error = `图片加载失败：${file.key}，请刷新重试。`;
      this.bridge.changed();
    });
  }
  create() {
    this.sky = this.add.graphics().setScrollFactor(0).setDepth(0);
    this.buildings = this.add.graphics().setDepth(1);
    this.moving = this.add.graphics().setDepth(3);
    this.front = this.add.graphics().setDepth(7);
    this.ovenArt = createOvenCrabArt(this);
    this.marketCartArt = createMarketCartArt(this);
    this.servingArt = createServingArt(this);
    this.player = this.add
      .image(150, 680, "delivery-sui")
      .setOrigin(0.5, 1)
      .setDepth(6);
    this.gardener = this.add
      .image(3390, 410, "delivery-gardener")
      .setOrigin(0.5, 1)
      .setDisplaySize(63, 63)
      .setDepth(4);
    this.mechanic = this.add
      .image(1650, 680, "delivery-mechanic")
      .setOrigin(0.5, 1)
      .setDisplaySize(61, 61)
      .setDepth(4);
    this.guests = ["delivery-baker", "delivery-freight", "delivery-gardener", "delivery-mechanic", "delivery-shelter", "delivery-market"].map((key, i) => this.add.image(2035 + i * 95, 651, key).setOrigin(0.5, 1).setDisplaySize(56, 56).setDepth(4)
.setVisible(false));
    this.drawLabels();
    this.homePhoto = ["delivery-sui", "delivery-baker", "delivery-mechanic"].map((key, i) => this.add.image(188 + i * 21, 592, key).setOrigin(0.5, 1).setDisplaySize(24, 27).setDepth(4)
.setVisible(false));
    this.drawBuildings();
    this.drawnLevel = this.bridge.state.levelId;
    this.bridge.loaded = true;
    this.bridge.scene = this;
    this.bridge.changed();
    this.paint();
  }
  drawLabels() {
    for (const label of this.labels) label.destroy();
    this.labels = [];
    for (const sign of deliveryLevel(this.bridge.state).signs) {
      const label = this.add
        .text(sign.x, sign.y, `${sign.title}\n${sign.text}`, {
          fontFamily: '"Microsoft YaHei", sans-serif',
          fontSize: "14px",
          color: "#435f50",
          align: "center",
          lineSpacing: 5,
          backgroundColor: "#fff0d8ed",
          padding: { x: 9, y: 7 },
        })
        .setOrigin(0.5, 1)
        .setDepth(8);
      this.labels.push(label);
    }
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
  window(g: Phaser.GameObjects.Graphics, x: number, y: number, w = 56, h = 72) {
    this.rect(g, x - 5, y - 5, w + 10, h + 10, C.wood, 5);
    this.rect(g, x, y, w, h, 0x7a9b8c, 3);
    this.rect(g, x + 5, y + 5, w - 10, h - 10, 0xd3dfbc, 3);
    g.lineStyle(3, C.wood)
      .lineBetween(x + w / 2, y, x + w / 2, y + h)
      .lineBetween(x, y + h / 2, x + w, y + h / 2);
    this.rect(g, x - 10, y + h, w + 20, 9, C.cream);
  }
  flower(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color = 0xd58878,
  ) {
    g.lineStyle(2, 0x6f8d68).lineBetween(x, y, x, y + 24);
    this.ellipse(g, x - 5, y + 13, 12, 5, 0x7c9a71);
    for (let n = 0; n < 5; n++) this.ellipse(
        g,
        x + Math.cos(n * 1.26) * 5,
        y + Math.sin(n * 1.26) * 5,
        9,
        9,
        color,
      );
    this.ellipse(g, x, y, 5, 5, C.gold);
  }
  roof(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    color = C.roof,
  ) {
    g.fillStyle(color).fillTriangle(
      x - 20,
      y + h,
      x + w / 2,
      y,
      x + w + 20,
      y + h,
    );
    g.lineStyle(2, C.ink, 0.18);
    for (let i = 18; i < h; i += 17) g.lineBetween(
        x + w / 2 - ((w / 2 + 20) * i) / h,
        y + i,
        x + w / 2 + ((w / 2 + 20) * i) / h,
        y + i,
      );
  }
  drawBuildings() {
    const g = this.buildings;
    g.clear();
    for (const facade of this.facades) facade.destroy();
    this.facades = [];
    const level = deliveryLevel(this.bridge.state);
    if (level.theme !== "street") {
      if (level.theme === "bakery") this.facades = addBakeryFacades(this);
      if (level.theme === "oven") this.facades = addOvenFacades(this);
      if (level.theme === "market") this.facades = addMarketFacades(this);
      if (level.theme === "freight") this.facades = addFreightFacades(this);
      if (level.theme === "sorter") this.facades = addSorterFacades(this);
      this.drawDistrict();
      drawBreakfastMaterials(g, level);
      return;
    }
    this.facades = addBreakfastFacades(this);
    // Each building has real shelves, entrances and surfaces; the canal breaks the street silhouette.
    this.rect(g, 0, 680, 2230, 430, 0xc5ac82);
    this.rect(g, 2820, 680, 980, 430, 0xc5ac82);
    for (let x = 0; x < level.world.w; x += 42) {
      if (x > 2230 && x < 2820) continue;
      this.rect(g, x, 680, 40, 15, x % 84 ? 0xe4d0a5 : 0xd8c298, 3);
      g.lineStyle(1, 0x9f8967, 0.22).lineBetween(x + 18, 710, x + 40, 710);
    }
    this.rect(g, 170, 624, 155, 56, C.wood, 5);
    this.rect(g, 163, 615, 169, 12, C.cream, 3);
    this.ellipse(g, 225, 608, 46, 12, C.ink);
    for (let i = 0; i < 3; i++) this.flower(g, 35 + i * 16, 642);
    this.rect(g, 435, 550, 18, 130, 0xb18c67);
    this.rect(g, 675, 550, 20, 130, 0xb18c67);
    for (const x of [435, 675]) {
      this.rect(g, x + 3, 550, 4, 130, 0xd8b17b);
      this.rect(g, x - 4, 670, 27, 10, 0x8b8b76, 2);
    }
    this.rect(g, 788, 584, 70, 96, C.wood, 4);
    this.ellipse(g, 823, 585, 84, 23, 0xd1b07e);
    this.ellipse(g, 823, 585, 68, 13, C.cream);
    for (let x = 1010; x < 1350; x += 29) {
      this.ellipse(g, x + 12, 642, 20, 31, 0x8caa70);
    }
    this.rect(g, 1390, 575, 155, 105, 0xd4be93);
    this.rect(g, 1402, 590, 128, 84, 0x9b9b79);
    this.ellipse(g, 1470, 617, 65, 22, C.ink, 0.12);
    this.rect(g, 1598, 640, 105, 40, C.wood);
    this.rect(g, 1586, 632, 128, 12, C.cream);
    g.lineStyle(4, C.ink)
      .lineBetween(1630, 632, 1618, 611)
      .lineBetween(1614, 614, 1638, 608);
    for (let x = 1760; x < 2130; x += 54) this.flower(g, x, 650, 0xc88e90);
    // Canal pilings and ripples sit below the playable stones.
    g.lineStyle(5, 0x7c735b).lineBetween(2150, 640, 3000, 640);
    g.lineStyle(2, 0xd1c5a0).lineBetween(2150, 635, 3000, 635);
    for (let x = 2220; x < 2920; x += 155) {
      g.lineStyle(7, 0xab936d).lineBetween(x, 644, x, 850);
      g.lineStyle(3, 0xb79c74).lineBetween(x, 725, x + 130, 650);
      this.rect(g, x - 10, 638, 21, 10, 0xcab68c, 2);
    }
    this.rect(g, 2230, 825, 590, 280, 0x90b5a7);
    for (let i = 0; i < 16; i++) this.rect(g, 2240 + i * 36, 850 + (i % 3) * 21, 24, 2, 0xcbd7bb);
    g.lineStyle(7, 0xbca078)
      .lineBetween(2260, 790, 2260, 850)
      .lineBetween(2800, 740, 2800, 850);
    for (const b of level.surfaces) {
      if (b.kind === "awning" || b.kind === "ground") continue;
      this.rect(
        g,
        b.x,
        b.y,
        b.w,
        b.h,
        b.kind === "brick" ? C.stone : C.wood,
        3,
      );
      this.rect(
        g,
        b.x,
        b.y,
        b.w,
        5,
        b.kind === "brick" ? 0xc2c5a5 : 0xe6bd7c,
        2,
      );
      if (b.kind === "wood" && b.y < 600) {
        g.lineStyle(3, 0xb98b5d)
          .lineBetween(b.x + 12, b.y + 18, b.x + 30, b.y + 41)
          .lineBetween(b.x + b.w - 12, b.y + 18, b.x + b.w - 30, b.y + 41);
      }
    }
    for (const cp of level.checkpoints) {
      this.rect(g, cp.x - 25, cp.y + 36, 49, 8, C.wood, 3);
      this.rect(g, cp.x - 20, cp.y + 42, 5, 9, C.wood);
      this.rect(g, cp.x + 15, cp.y + 42, 5, 9, C.wood);
    }
    drawBreakfastMaterials(g, level);
  }
  drawDistrict() {
    const g = this.buildings;
    const level = deliveryLevel(this.bridge.state);
    const bakery = level.theme === "bakery";
    for (const ground of level.surfaces.filter((v) => v.kind === "ground")) {
      this.rect(g, ground.x, ground.y, ground.w, ground.h, 0xc5ac82);
      for (let { x } = ground; x < ground.x + ground.w; x += 44) this.rect(g, x, ground.y, 42, 15, 0xe1c99c, 3);
    }
    if (bakery) {
      // Raster walls, oven and racks sit behind the real kitchen collision surfaces.
      for (const x of [1520, 1600, 1680]) {
        this.rect(g, x, 600, 53, 80, 0xf1e6c4, 12);
        this.ellipse(g, x + 26, 604, 45, 15, 0xc9b797);
      }
      for (let x = 2600; x < 3000; x += 50) this.flower(g, x, 642);
    } else if (level.theme === "oven") {
      for (let x = 820; x < 1900; x += 70) {
        this.rect(g, x, 610, 8, 70, 0xa18b68);
        g.lineStyle(3, 0xa18b68).lineBetween(x, 625, x + 70, 625);
      }
      this.rect(g, 2040, 640, 160, 40, C.wood, 4);
      this.rect(g, 2030, 630, 180, 12, C.cream, 4);
    } else if (level.theme === "freight") {
      // A sloped elevated railway spans an actual gap in the collision map.
      g.lineStyle(6, 0x8d8064);
      for (let i = 0; i < (level.cart?.rail?.length || 0) - 1; i++) {
        const a = level.cart!.rail![i];
        const b = level.cart!.rail![i + 1];
        g.lineBetween(a.x, a.y + 76, b.x + 160, b.y + 76);
      }
      for (let x = 850; x < 2700; x += 200) {
        const y = x < 1660 ? 676 - (x - 820) / 7.8 : 576 - (x - 1600) / 22.5;
        g.lineStyle(10, 0xb39c77).lineBetween(x, y, x, 1080);
        g.lineStyle(4, 0xb39c77).lineBetween(x, y + 50, x + 170, y + 200);
      }
      this.rect(g, 790, 880, 1950, 200, 0x91b4a7);
      for (let x = 800; x < 2740; x += 65) this.rect(g, x, 910 + (x % 31), 40, 3, 0xc9dbc1);
      for (const [x, y, w] of [[570, 540, 280], [1580, 500, 420], [2730, 610, 470]]) {
        this.rect(g, x, y, w, 25, C.wood, 3);
        this.rect(g, x + 15, y + 25, 14, 330, C.wood);
        this.rect(g, x + w - 30, y + 25, 14, 330, C.wood);
      }
      for (const [x, y] of [[2790, 560], [2930, 480], [3040, 480]]) {
        this.rect(g, x, y, 75, 60, 0xb38a5c, 4);
        g.lineStyle(3, C.cream).strokeRect(x + 6, y + 6, 63, 48).lineBetween(x + 6, y + 6, x + 69, y + 54);
      }
    } else if (level.theme === "sorter") {
      this.rect(g, 830, 272, 930, 18, 0x789384, 7);
      for (const x of [850, 1700]) {
        this.rect(g, x, 285, 24, 395, 0x849480, 5);
        for (let y = 305; y < 670; y += 56) this.rect(g, x + 2, y, 20, 9, C.cream);
      }
      this.rect(g, 2010, 622, 320, 58, C.wood, 7);
      this.rect(g, 2000, 611, 340, 12, C.cream, 4);
      for (let x = 2080; x < 2300; x += 80) this.ellipse(g, x, 603, 45, 12, C.cream);
    } else if (drawRainDistrict(this)) {
      // Roofs and glasshouse structures follow the matching collision shelves.
    } else if (drawTheaterDistrict(this)) {
      // The fly galleries and rigging share the stage's collision layout.
    } else {
      // Stall wheels run on a visible rail rather than floating over the market.
      g.lineStyle(4, 0xa78e66).lineBetween(880, 576, 1320, 576);
      for (let x = 900; x <= 1300; x += 100) g.lineStyle(5, 0xb29a73).lineBetween(x, 576, x, 680);
    }
    if (!["oven", "market"].includes(level.theme)) this.rect(g, 40, 540, 270, 140, C.wall, 5);
    if (level.theme !== "market") {
      this.rect(g, 110, 625, 150, 55, C.wood, 4);
      this.rect(g, 100, 615, 170, 12, C.cream, 3);
    }
    for (const b of level.surfaces) {
      if (b.kind === "ground" || b.kind === "awning") continue;
      this.rect(
        g,
        b.x,
        b.y,
        b.w,
        b.h,
        b.kind === "brick" ? C.stone : C.wood,
        3,
      );
      this.rect(
        g,
        b.x,
        b.y,
        b.w,
        5,
        b.kind === "brick" ? 0xc2c5a5 : 0xe6bd7c,
        2,
      );
      if (b.y < 610) g.lineStyle(4, 0xb18c67).lineBetween(
          b.x + 15,
          b.y + b.h,
          b.x + 15,
          Math.min(680, b.y + 85),
        );
    }
    for (const cp of level.checkpoints) {
      this.rect(g, cp.x - 25, cp.y + 36, 50, 8, C.wood, 3);
      this.rect(g, cp.x - 20, cp.y + 44, 5, 8, C.wood);
      this.rect(g, cp.x + 15, cp.y + 44, 5, 8, C.wood);
    }
  }
  tick(ms: number) {
    const steps = Math.floor(Math.max(0, Math.min(30000, ms)) / (1000 / 120));
    for (let i = 0; i < steps; i++) stepDelivery(this.bridge.state, this.bridge.input);
    this.consume();
    this.paint();
    this.bridge.changed();
  }
  consume() {
    const b = this.bridge;
    b.audio.enabled = b.state.save.settings.sound;
    b.audio.setPhase(b.state.phase);
    for (const cue of b.state.events.filter(e => e.age < 0.18).slice(-8)) b.audio.effect(cue, b.state.camera, b.state.viewport);
    b.state.events.length = 0;
  }
  update(_time: number, delta: number) {
    if (!this.bridge.manual) {
      this.accumulator = Math.min(0.1, this.accumulator + delta / 1000);
      while (this.accumulator >= FIXED_DT) {
        stepDelivery(this.bridge.state, this.bridge.input);
        this.accumulator -= FIXED_DT;
      }
    }
    this.consume();
    this.paint();
    this.bridge.audio.update(this.bridge.state.phase === "playing", deliveryLevel(this.bridge.state).theme);
    if (performance.now() - this.hud > 100) {
      this.hud = performance.now();
      this.bridge.changed();
    }
  }
  paint() {
    const s = this.bridge.state;
    const level = deliveryLevel(s);
    if (this.drawnLevel !== s.levelId) {
      this.drawnLevel = s.levelId;
      this.drawLabels();
      this.drawBuildings();
    }
    const p = s.player;
    const t = s.save.settings.reducedMotion ? 0 : s.clock;
    this.cameras.main.setScroll(s.camera.x, s.camera.y);
    const bg = this.sky.clear();
    bg.fillGradientStyle(level.theater ? 0x8b929f : level.rain ? 0x94b7b6 : 0xf4dfb9, level.theater ? 0xb29fa2 : level.rain ? 0xb7cbc0 : 0xf7dfb5, level.theater ? 0xedd4ac : level.rain ? 0xe3e6cb : 0xfaf0d4, level.theater ? 0xd5c9ad : level.rain ? 0xd9e0c9 : 0xfaf0d4).fillRect(
      0,
      0,
      s.viewport.w,
      s.viewport.h,
    );
    this.ellipse(bg, 790 - s.camera.x * 0.04, 88, 91, 91, level.rain ? 0xd9dfca : 0xffedb5);
    for (let i = -1; i < 8; i++) {
      const x = i * 220 - ((s.camera.x * 0.15) % 220);
      this.ellipse(bg, x, 470 - s.camera.y * 0.12, 420, 190, 0xc3c9a4);
      this.rect(bg, x + 20, 250 - (i % 3) * 35, 92, 180, 0xc8c9a7);
      this.roof(bg, x + 12, 205 - (i % 3) * 35, 110, 50, 0xaab79a);
    }
    const g = this.moving.clear();
    const f = this.front.clear();
    this.marketCartArt.setVisible(false);
    this.drawMachinery(g);
    for (const b of deliverySurfaces(s)) {
      if (!["awning", "cart", "ladder", "pan", "belt"].includes(b.kind)) continue;
      if (b.id === "green-water-lift") continue;
      if (level.theater?.lifts.some(lift => lift.id === b.id)) continue;
      if (b.kind === "awning") {
        const compression = Math.max(0, s.awnings[b.id] || 0) * 35;
        this.rect(g, b.x - 6, b.y + compression, b.w + 12, 17, C.cream, 3);
        for (let { x } = b; x < b.x + b.w; x += 30) {
          this.rect(g, x, b.y + compression, 15, 26, level.rain ? 0x5c8c80 : C.red, 3);
          this.ellipse(g, x + 7, b.y + compression + 25, 15, 8, level.rain ? 0x5c8c80 : C.red);
        }
        g.lineStyle(3, C.wood)
          .lineBetween(b.x + 5, b.y + 28, b.x + 5, 680)
          .lineBetween(b.x + b.w - 5, b.y + 28, b.x + b.w - 5, 680);
        if (level.springs.some((v) => v.id === b.id) || level.rain?.canopies.some((v) => v.id === b.id)) {
          g.lineStyle(2, C.ink, 0.5)
            .lineBetween(
              b.x + 40,
              b.y - 8 + Math.sin(t * 9) * 3,
              b.x + 55,
              b.y - 15,
            )
            .lineBetween(b.x + 65, b.y - 15, b.x + 75, b.y - 8);
        }
      } else if (b.kind === "cart") {
        if (["market", "freight"].includes(level.theme)) {
          placeMarketCartArt(this, b);
          continue;
        }
        this.rect(g, b.x, b.y, b.w, 58, 0x668475, 6);
        this.rect(g, b.x - 6, b.y, b.w + 12, 8, C.cream, 3);
        this.rect(g, b.x + 15, b.y + 17, 131, 26, C.cream, 5);
        for (let n = 0; n < 3; n++) this.ellipse(g, b.x + 39 + n * 39, b.y + 27, 20, 9, C.red);
        for (const x of [b.x + 25, b.x + 133]) {
          this.ellipse(g, x, b.y + 69, 29, 29, C.ink);
          this.ellipse(g, x, b.y + 69, 14, 14, C.gold);
        }
      } else if (b.kind === "belt") {
        this.rect(g, b.x, b.y, b.w, 24, C.ink, 11);
        this.rect(g, b.x, b.y, b.w, 5, C.cream, 2);
        const speed = s.machine?.phase === "off" || b.y !== 680 - Math.min(2, servingStage(s)) * 120 ? 0 : beltSpeed(s);
        for (let x = b.x + 12; x < b.x + b.w - 12; x += 34) {
          const offset = speed ? (((t * speed) % 34) + 34) % 34 : 0;
          this.ellipse(g, x + offset, b.y + 15, 13, 13, 0x98aa89);
        }
        if (speed) for (let x = b.x + 40; x < b.x + b.w - 35; x += 110) g.lineStyle(3, C.gold).lineBetween(x - Math.sign(speed) * 10, b.y - 12, x, b.y - 19).lineBetween(x, b.y - 19, x - Math.sign(speed) * 10, b.y - 26);
      } else if (b.kind === "pan") {
        this.rect(g, b.x - 5, b.y - 4, b.w + 10, 20, 0x6a8275, 8);
        this.rect(g, b.x + 5, b.y, b.w - 10, 7, 0xe8dbad, 4);
        g.lineStyle(4, 0xb0b8a0)
          .lineBetween(b.x + 12, b.y + 18, b.x + 12, 680)
          .lineBetween(b.x + b.w - 12, b.y + 18, b.x + b.w - 12, 680);
        for (const x of [b.x + 10, b.x + b.w - 10]) {
          g.lineStyle(3, C.cream)
            .lineBetween(x - 5, b.y - 8, x, b.y - 14)
            .lineBetween(x, b.y - 14, x + 5, b.y - 8);
        }
      } else {
        this.rect(g, b.x, b.y, b.w, b.h, C.gold, 3);
        g.lineStyle(4, C.wood)
          .lineBetween(b.x + 15, b.y, b.x + 15, b.y + 90)
          .lineBetween(b.x + 65, b.y, b.x + 65, b.y + 90);
      }
    }
    drawRainMechanisms(this, g, f);
    drawTheaterMechanisms(this, g, f);
    for (const item of level.pickups) {
      if (s.collected.includes(item.id)) continue;
      const y = item.y + Math.sin(t * 3 + item.x) * 3;
      if (item.kind === "coin") {
        this.ellipse(g, item.x, y, 15, 22, C.gold);
        this.ellipse(g, item.x, y, 8, 15, 0xffe6a5);
      }
      if (item.kind === "sign") {
        g.lineStyle(2, C.wood)
          .lineBetween(item.x - 27, y - 25, item.x - 27, y - 5)
          .lineBetween(item.x + 27, y - 25, item.x + 27, y - 5);
        this.rect(g, item.x - 37, y - 10, 74, 28, C.cream, 5);
        this.ellipse(g, item.x, y + 3, 26, 12, C.red);
        g.lineStyle(2, C.red)
          .lineBetween(item.x - 10, y - 4, item.x - 6, y - 17)
          .lineBetween(item.x + 8, y - 4, item.x + 13, y - 17);
      }
      if (item.kind === "bread") {
        this.ellipse(g, item.x, y, 31, 21, 0xd5a05e);
        g.lineStyle(2, C.cream)
          .lineBetween(item.x - 9, y - 4, item.x - 6, y + 4)
          .lineBetween(item.x + 3, y - 5, item.x + 6, y + 3);
      }
    }
    for (const e of s.dough) {
      if (e.state === "gone") {
        if (e.timer < 1) this.ellipse(
            g,
            e.homeX + 19,
            e.homeY + 34,
            30,
            5 + (1 - e.timer) * 10,
            0xe9d8ae,
            0.75,
          );
        continue;
      }
      const loft = e.state === "loft";
      const squash =
        e.vy < -30 ? 0.8 : e.vy > 30 ? 1.12 : 1 + Math.sin(t * 5 + e.x) * 0.05;
      this.ellipse(g, e.x + 19, e.homeY + 38, 35, 8, C.ink, 0.12);
      this.ellipse(
        g,
        e.x + 19,
        e.y + 21,
        40 * squash,
        37 / squash,
        loft ? 0xfaf1c6 : 0xe1bc82,
      );
      g.lineStyle(loft ? 3 : 2, loft ? 0x619584 : 0x9c784e).strokeEllipse(
        e.x + 19,
        e.y + 21,
        40 * squash,
        37 / squash,
      );
      for (const x of [e.x + 13, e.x + 26]) this.ellipse(g, x, e.y + 20, 4, 6, C.ink);
      g.lineStyle(2, C.ink).lineBetween(e.x + 17, e.y + 29, e.x + 22, e.y + 29);
      if (loft) {
        g.lineStyle(2, 0x619584)
          .lineBetween(e.x + 10, e.y - 4, e.x + 19, e.y - 13)
          .lineBetween(e.x + 19, e.y - 13, e.x + 28, e.y - 4);
        this.ellipse(g, e.x + 3, e.y + 5, 6, 6, C.cream);
        this.ellipse(g, e.x + 34, e.y, 5, 5, C.cream);
      }
    }
    const bob =
      p.grounded && Math.abs(p.vx) > 15
        ? Math.sin(t * (Math.abs(p.vx) > 270 ? 24 : 17)) * 2
        : Math.sin(t * 2) * 0.5;
    const animation = deliveryPlayerFrame(s);
    this.player
      .setDepth(level.theater?.banquet && !s.theater.seated ? 8 : 6)
      .setTexture(animation.texture, animation.frame)
      .setOrigin(0.5, animation.drawn ? 100 / PLAYER_SPRITE_FRAME : 1)
      .setPosition(p.x + 13, p.y + (animation.drawn ? 44 : 46 + bob) - (s.theater.seated ? 10 : 0))
      .setFlipX(p.facing < 0)
      .setDisplaySize(
        animation.drawn ? PLAYER_SPRITE_SIZE : 65,
        animation.drawn ? PLAYER_SPRITE_SIZE : 65,
      )
      .setAngle(
        0,
      )
      .setAlpha(
        p.invincible > 0 && Math.floor(s.clock * 10) % 2 === 0 ? 0.45 : 1,
      );
    if (s.phase === "dead") this.player.setAlpha(0.25);
    const bx = p.x + 13 - p.facing * 21;
    if (!s.theater.seated) {
      this.rect(g, bx - 13, p.y + 17, 26, 27, 0xb47d4f, 4);
      this.rect(g, bx - 11, p.y + 18, 22, 5, C.cream, 2);
      this.ellipse(g, bx, p.y + 31, 13, 10, C.red);
    }
    if (s.carrying) for (let i = 0; i < 2; i++) {
        g.lineStyle(1.7, C.cream, 0.85).lineBetween(
          bx - 6 + i * 10,
          p.y + 12,
          bx - 8 + i * 10 + Math.sin(t * 4 + i) * 3,
          p.y + 2,
        );
      }
    if (!s.theater.seated) {
    const tray = deliveryTrayPose(s);
    const trayX = p.x + 13 + p.facing * tray.x;
    const trayY = p.y + tray.y;
    g.lineStyle(6, C.cream).lineBetween(
      p.x + 13 + p.facing * tray.hand.x,
      p.y + tray.hand.y,
      trayX,
      trayY + 2,
    );
    this.ellipse(
      f,
      trayX,
      trayY,
      s.save.tray === "wide" ? 47 : 35,
      9,
      0x9fa58a,
    );
    this.ellipse(
      f,
      trayX,
      trayY - 3,
      s.save.tray === "wide" ? 43 : 31,
      6,
      0xe6dfbd,
    );
    if (insulatedTray(s)) f.lineStyle(2, C.red).strokeEllipse(
        trayX,
        trayY - 2,
        s.save.tray === "wide" ? 46 : 34,
        8,
      );
    if (tray.active && !s.save.settings.reducedMotion) f.lineStyle(4, C.gold, 0.7)
        .beginPath()
        .arc(
          p.x + 13,
          p.y + 18,
          60,
          p.facing > 0 ? -1.4 : 2,
          p.facing > 0 ? 0.1 : 3.3,
        )
        .strokePath();
    }
    // Delivery changes the same scene: the blocking planter is moved and a ladder appears.
    const done = s.save.delivered.includes(level.id);
    if (level.theme === "street") {
      drawHomeDetails(this, g);
      this.rect(g, done ? 3525 : 3450, 385, 44, 25, 0xc18d62, 4);
      for (let i = 0; i < 3; i++) this.flower(g, (done ? 3533 : 3458) + i * 12, 364, 0xd88989);
      if (done) {
        this.rect(g, 3330, 396, 40, 7, C.cream, 3);
        this.ellipse(g, 3350, 389, 22, 12, C.red);
        this.flower(g, 55, 630, 0xb96b6d);
      }
      if (s.save.kindness) {
        this.ellipse(g, 1730, 671, 29, 16, 0xe1b275);
        g.fillStyle(0xe1b275)
          .fillTriangle(1718, 661, 1721, 647, 1728, 661)
          .fillTriangle(1733, 661, 1740, 648, 1741, 663);
        this.ellipse(g, 1719, 676, 10, 6, C.cream);
        this.ellipse(g, 1684, 624, 15, 8, C.gold);
      }
    }
    if (done && level.theme === "bakery") {
      this.rect(g, 3140, 449, 50, 14, C.cream, 4);
      this.ellipse(g, 3165, 448, 36, 14, 0xd7a462);
    }
    for (const cp of level.checkpoints) this.ellipse(
        g,
        cp.x,
        cp.y + 22,
        20,
        6,
        cp.id === s.checkpoint ? C.gold : C.cream,
        0.8,
      );
    for (const v of s.particles) this.ellipse(f, v.x, v.y, 4, 4, v.color, Math.min(1, v.life * 2));
    drawDeliveryFeedback(f, s);
    for (let i = 0; i < this.labels.length; i++) {
      const sign = level.signs[i];
      const near = Math.abs(p.x - sign.x) < (i === 0 ? 320 : 260);
      this.labels[i].setVisible(near && s.phase !== "title" && !s.theater.seated);
    }
    this.gardener
      .setTexture(
        level.id === "last-table" ? "delivery-market" : level.theater ? "delivery-shelter" : level.theme === "bakery"
          ? "delivery-baker"
          : level.theme === "oven"
            ? "delivery-mechanic"
            : level.theme === "market"
              ? "delivery-market"
              : level.theme === "freight"
                ? "delivery-freight"
                : level.theme === "rain"
                  ? "delivery-shelter"
                  : level.theme === "bird"
                    ? "delivery-baker"
                : level.theme === "sorter"
                  ? "delivery-market"
              : "delivery-gardener",
      )
      .setPosition(
        level.destination.x + 40,
        level.destination.y + Math.sin(t * 2) * 0.6,
      )
      .setFlipX(Math.sin(t * 1.4) < -0.8)
      .setDisplaySize(63, 63);
    this.mechanic.setVisible(level.theme === "street");
    this.homePhoto.forEach(photo => photo.setVisible(level.theme === "street" && s.save.delivered.includes("oven-crab")));
    this.gardener.setVisible(level.theme !== "banquet");
    this.guests.forEach((guest, i) => {
      const banquet = level.theme === "banquet";
      const backstage = level.theme === "last-table" && s.switches.includes("table-served") && i < 2;
      guest.setVisible(banquet || backstage || (level.theme === "sorter" && s.machine?.phase === "off" && i < 3));
      guest.setPosition(banquet ? [2880, 2960, 3040, 3120, 3320, 3400][i] : backstage ? 1240 + i * 90 : 2035 + i * 95, banquet ? 472 : backstage ? 427 : 651);
    });
  }
  drawMachinery(g: Phaser.GameObjects.Graphics) {
    const s = this.bridge.state;
    const level = deliveryLevel(s);
    const b = s.boss;
    paintServingArt(this);
    this.ovenArt.shell.setVisible(!!b);
    this.ovenArt.claw.setVisible(!!b && b.phase !== "off");
    if (s.machine) {
      const stage = servingStage(s);
      const y = 680 - Math.min(2, stage) * 120;
      const m = s.machine;
      const armX = m.phase === "sweep" ? 1030 + (1 - m.timer / 0.65) * 510 : 1050;
      if (m.phase !== "off") {
        g.lineStyle(16, 0xa4b399).lineBetween(armX + 60, 290, armX + 60, y - 100).lineBetween(armX + 60, y - 100, armX, y - 22);
        if (m.phase === "warning") {
          g.lineStyle(3, 0xbf8058, 0.7).lineBetween(1030, y - 5, 1540, y - 5);
          for (let x = 1050; x < 1540; x += 70) this.ellipse(g, x, y - 9, 8, 8, C.gold);
        }
      } else {
        g.lineStyle(14, 0x98ab8c).lineBetween(1750, 350, 1840, 520).lineBetween(1840, 520, 1990, 560);
        for (let x = 1660; x < 2030; x += 90) this.ellipse(g, x, 551, 54, 13, C.cream);
      }
    }
    if (b) {
      const off = b.phase === "off";
      const vent = b.phase === "vent";
      const warning = b.phase === "claw-warning";
      const { x } = b;
      for (let i = 0; i < 4; i++) {
        const legX = x + 25 + i * 65;
        g.lineStyle(10, 0x775847)
          .lineBetween(legX, 640, legX - 15, 660)
          .lineBetween(legX - 15, 660, legX - 25, 680);
      }
      this.ovenArt.shell.setPosition(x + 125, 653);
      const safeBack = vent || off || b.phase === "rest";
      this.rect(g, x + 18, 531, 214, 20, safeBack ? 0x647d6b : 0x9b624c, 8);
      this.rect(g, x + 20, 532, 210, 4, safeBack ? 0xe8dbad : 0xe8aa70, 2);
      if (!safeBack) for (let n = 0; n < 5; n++) {
        const heatX = x + 31 + n * 47;
        g.lineStyle(2, 0xd58a53, 0.75)
          .lineBetween(heatX, 529, heatX - 3, 524)
          .lineBetween(heatX - 3, 524, heatX, 519);
      }
      this.ellipse(g, x + 125, 622, 73, 13, off ? 0xe6bf77 : 0xe99b51);
      if (off) {
        for (const breadX of [x + 105, x + 144]) {
          this.ellipse(g, breadX, 620, 32, 18, 0xd6a05b);
          g.lineStyle(2, C.cream).lineBetween(breadX - 5, 615, breadX - 2, 621);
        }
      }
      for (const eyeX of [x + 89, x + 161]) {
        this.ellipse(g, eyeX, 553, 20, 20, C.cream);
        this.ellipse(g, eyeX + b.facing * 3, 552, 7, 9, C.ink);
      }
      for (let n = 0; n < 3; n++) {
        const valveX = x + 65 + n * 60;
        this.rect(g, valveX - 4, 515, 8, 20, 0x5b7768);
        const closed = (n === 0 && b.hits >= 1) || (n === 2 && b.hits >= 2) || b.hits >= 3;
        g.lineStyle(4, closed ? 0x8caa78 : vent ? C.gold : 0xc98260).strokeCircle(valveX, 511, 12);
        g.lineStyle(3, C.ink).lineBetween(valveX - 8, 511, valveX + 8, 511);
      }
      if (vent) {
        const v = crabValve(b);
        g.lineStyle(3, C.gold).strokeCircle(
          v.x,
          v.y,
          25 + Math.sin(s.clock * 8) * 3,
        );
        g.lineStyle(3, C.cream)
          .lineBetween(v.x - 10, v.y - 35, v.x, v.y - 27)
          .lineBetween(v.x, v.y - 27, v.x + 10, v.y - 35);
      }
      const clawSide = b.facing < 0 ? x : x + 250;
      const reach =
        b.phase === "claw"
          ? 170 + Math.sin(((0.75 - b.timer) / 0.75) * Math.PI) * 140
          : warning
            ? 65
            : 105;
      const clawX = clawSide + b.facing * reach;
      if (!off) {
        g.lineStyle(13, 0xa76b4b).lineBetween(clawSide, 608, clawX, 640);
        g.lineStyle(4, 0xd1a16a).lineBetween(clawSide, 605, clawX, 637);
        this.ovenArt.claw.setPosition(clawX, 640).setFlipX(b.facing > 0)
          .setScale(Math.min((warning ? 48 : 65) / 1255, 40 / 854));
        if (warning) g.lineStyle(3, C.gold).strokeEllipse(clawX, 640, 58, 46);
        if (warning) {
          g.lineStyle(3, 0xc17e56, 0.7).lineBetween(
            clawSide,
            673,
            clawSide + b.facing * 310,
            673,
          );
          for (let i = 0; i < 4; i++) this.ellipse(
              g,
              clawSide + b.facing * (80 + i * 65),
              667,
              9,
              9,
              C.gold,
            );
        }
      }
      if (vent || b.phase === "vent-warning") for (const side of [-1, 1]) {
          for (let n = 0; n < (vent ? 5 : 2); n++) {
            const y = 600 - ((s.clock * 95 + n * 33) % (vent ? 160 : 45));
            this.ellipse(
              g,
              x + (side < 0 ? -80 : 335) + Math.sin(n + s.clock * 3) * 9,
              y,
              24 + n * 7,
              18,
              C.cream,
              0.55,
            );
          }
        }
      if (off) {
        // The same machine becomes a calm neighborhood oven; the photo board is visible by the exit.
        this.rect(g, 1850, 425, 110, 80, C.wood, 5);
        this.rect(g, 1858, 433, 94, 64, C.cream);
        for (let n = 0; n < 4; n++) {
          this.ellipse(g, 1872 + n * 22, 454, 17, 19, n === 0 ? C.red : C.roof);
          this.rect(g, 1866 + n * 22, 464, 13, 19, n === 0 ? C.red : C.wood, 3);
        }
      }
    }
    for (const emitter of level.emitters) {
      if (emitter.stage !== undefined && (emitter.stage !== servingStage(s) || s.machine?.phase === "off")) continue;
      const warning = s.clock % emitter.period > emitter.period - 0.7;
      this.rect(g, emitter.x - 20, emitter.y - 27, 40, 54, 0x778971, 10);
      this.ellipse(
        g,
        emitter.x,
        emitter.y,
        28,
        28,
        warning ? C.gold : 0xa8b194,
      );
      g.lineStyle(3, C.cream).strokeCircle(
        emitter.x,
        emitter.y,
        warning ? 22 : 15,
      );
      if (warning) g.lineStyle(3, C.gold).lineBetween(
          emitter.x - 90,
          emitter.y + 28,
          emitter.x,
          emitter.y + 28,
        );
    }
    for (const gate of level.gates) {
      const open = s.switches.includes(gate.id);
      const x = gate.targetX;
      const y = gate.targetY;
      g.lineStyle(4, C.wood).lineBetween(x, y - 55, x, y - 27);
      this.ellipse(g, x, y, 42, 42, open ? 0x799d7c : C.gold);
      g.lineStyle(3, C.cream).strokeCircle(x, y, 15);
      this.ellipse(g, x, y + 16, 8, 8, C.ink);
      if (gate.barrier !== false) this.rect(g, gate.x - 8, 330, gate.w + 16, 22, C.wood, 3);
      if (!open && gate.barrier !== false) {
        this.rect(g, gate.x, 352, gate.w, 328, C.wood);
        for (let n = 0; n < 6; n++) this.rect(g, gate.x - 5, 360 + n * 50, gate.w + 10, 18, C.red, 3);
      }
    }
    for (const shot of s.projectiles) {
      this.ellipse(
        g,
        shot.x,
        shot.y,
        19,
        19,
        shot.reflected ? 0x7ba58c : 0xe3a852,
      );
      g.lineStyle(3, C.cream).strokeCircle(shot.x, shot.y, 14);
      g.lineStyle(3, shot.reflected ? 0x7ba58c : C.gold, 0.5).lineBetween(
        shot.x,
        shot.y,
        shot.x - Math.sign(shot.vx) * 28,
        shot.y,
      );
    }
  }
}
