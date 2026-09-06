import Phaser from "phaser";
import { FLOOR, HEIGHT, MOVES, Sparring, WIDTH } from "./core";
import { FighterView } from "./FighterView";
import type { SparringAudio } from "./audio";

export class SparringScene extends Phaser.Scene {
  private model: Sparring;
  private audio: SparringAudio;
  private notify: () => void;
  private heroine!: FighterView;
  private coach!: FighterView;
  private effects!: Phaser.GameObjects.Graphics;
  private floorMarks!: Phaser.GameObjects.Graphics;
  private backdrop?: Phaser.GameObjects.Image;
  private crowd: Phaser.GameObjects.Container[] = [];
  private lastEvent = 0;
  private uiClock = 0;
  private previousX = 440;
  private reducedMotion = false;
  manual = false;
  ready = false;

  constructor(model: Sparring, audio: SparringAudio, notify: () => void) {
    super("sparring");
    this.model = model;
    this.audio = audio;
    this.notify = notify;
  }

  preload() {
    this.load.image("sparring-dojo", "/games/one-more/dojo.webp");
  }

  create() {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.textures.exists("sparring-dojo")) this.backdrop = this.add.image(640, 360, "sparring-dojo").setDisplaySize(WIDTH, HEIGHT);
    else this.add.rectangle(640, 360, WIDTH, HEIGHT, 0xc4dbd3);
    const floor = this.add.graphics();
    floor.fillStyle(0xdce5df, 0.88).fillRect(-2000, 531, 5280, 2500);
    floor.lineStyle(2, 0x79938d, 0.36).lineBetween(0, 564, WIDTH, 564);
    for (let x = -400; x <= 1700; x += 170) floor.lineBetween(640 + (x - 640) * 0.4, 531, x, 720);
    floor.lineBetween(0, 631, WIDTH, 631).lineBetween(0, 712, WIDTH, 712);
    // The sparring mat is part of the world, with all actionable marks drawn above it.
    floor.lineStyle(3, 0x668e80, 0.7).strokeEllipse(640, 581, 930, 77);
    floor.lineStyle(1, 0x668e80, 0.5).strokeEllipse(640, 581, 900, 66);
    [170, 245, 1035, 1110].forEach((x, i) => {
      const spectator = this.add.container(x, 520);
      const g = this.add.graphics();
      g.fillStyle(0xb98756)
        .lineStyle(2, 0x614537)
        .fillCircle(0, -23, 19)
        .strokeCircle(0, -23, 19);
      g.fillStyle(0xf0d8a1).fillCircle(-3, -26, 15);
      g.fillStyle(0x604b3b)
        .fillCircle(-6, -28, 2)
        .fillCircle(4, -28, 2)
        .fillCircle(8, -15, 3);
      g.lineStyle(3, 0x604b3b)
        .lineBetween(-8, -7, -12, 0)
        .lineBetween(8, -7, 12, 0);
      g.lineBetween(-17, -22, -26, -35 + (i % 2) * 10).lineBetween(
        17,
        -22,
        26,
        -35,
      );
      spectator.add(g);
      this.crowd.push(spectator);
    });
    this.floorMarks = this.add.graphics();
    this.heroine = new FighterView(this, false);
    this.coach = new FighterView(this, true);
    this.effects = this.add.graphics();
    this.game.canvas.setAttribute("data-game-canvas", "sui-sparring");
    this.ready = true;
    this.notify();
  }

  update(_time: number, delta: number) {
    if (!this.manual) this.model.advance(Math.min(delta, 80));
    this.draw();
    this.uiClock += delta;
    if (this.uiClock >= 50) {
      this.uiClock = 0;
      this.notify();
    }
  }

  advance(ms: number) {
    this.manual = true;
    this.model.advance(ms);
    if (this.ready) this.draw();
    this.notify();
  }

  private draw() {
    const s = this.model.state;
    const { player: p, boss: b } = s;
    const parry = [...s.events].reverse().find(event => event.cue === 'parry');
    const parryAge = parry ? s.feedbackT - parry.visualAt : Infinity;
    const screenWidth = this.scale.width;
    const screenHeight = this.scale.height;
    const portrait = screenHeight > screenWidth && screenWidth < 700;
    const ended = s.phase === 'won' || s.phase === 'lost';
    const displayPlayerX = ended && !portrait ? 300 : p.x;
    const displayBossX = ended && !portrait ? 980 : b.x;
    const zoom = portrait
      ? screenWidth / Math.max(750, Math.abs(p.x - b.x) + 380)
      : Math.min(screenWidth / WIDTH, screenHeight / HEIGHT);
    const cameraX = portrait ? (p.x + b.x) / 2 : WIDTH / 2;
    const cameraY = portrait ? FLOOR - 90 : HEIGHT / 2;
    const recoil = !this.reducedMotion && parryAge < 100 ? Math.sin(parryAge * 0.35) * 4 * (1 - parryAge / 100) : 0;
    this.cameras.main.setZoom(zoom).centerOn(cameraX + recoil, cameraY);
    const backgroundHeight = Math.max(HEIGHT, screenHeight / zoom, ((screenWidth / zoom) * HEIGHT) / WIDTH);
    this.backdrop?.setPosition(cameraX, cameraY).setDisplaySize((backgroundHeight * WIDTH) / HEIGHT, backgroundHeight);
    const idleTime =
      s.phase === "ready" || s.phase === "won" || s.phase === "lost"
        ? this.time.now
        : s.t;
    const attackAge = s.t - p.attackAt;
    const moving = Math.abs(p.x - this.previousX) > 0.1;
    const playerPose =
      s.phase === "lost"
        ? "lose"
        : s.phase === "won"
          ? "win"
          : s.t - p.hurtAt < 300
            ? "hurt"
            : s.t - p.dashAt < 300
              ? "dodge"
              : s.t - p.parryAt < 220
                ? "parry"
                : this.model.held.has("guard")
                  ? "guard"
                  : attackAge < 360
                    ? "attack"
                    : moving
                      ? "walk"
                      : "idle";
    this.heroine.sync(
      displayPlayerX,
      FLOOR,
      p.facing,
      playerPose,
      idleTime,
      attackAge / 270,
    );
    this.previousX = p.x;
    const { hits } = MOVES[b.move];
    const sinceHit =
      b.mode === "windup" && b.hitIndex > 0
        ? b.clock - hits[b.hitIndex - 1]
        : 10000;
    const nextHit = hits[b.hitIndex] ?? hits[hits.length - 1];
    const bossPose =
      s.phase === "won"
        ? "lose"
        : s.phase === "lost"
          ? "win"
          : s.phase === "ready"
            ? "idle"
            : parryAge < 240
              ? 'hurt'
            : b.mode === "approach"
              ? "walk"
              : b.mode === "recover"
                ? "recover"
                : sinceHit < 260
                  ? "attack"
                  : "charge";
    this.coach.sync(
      displayBossX,
      FLOOR,
      b.facing,
      bossPose,
      idleTime,
      bossPose === "attack" ? (sinceHit + 80) / 260 : b.clock / nextHit,
      b.move === 'slam',
    );
    this.floorMarks.clear();
    this.effects.clear();
    if (s.phase === "fight" || s.phase === "paused") {
      if (b.mode === "windup" && b.move === "slam") {
        const fill = Math.min(1, b.clock / hits[0]);
        this.floorMarks
          .fillStyle(0xb83149, 0.14 + fill * 0.13)
          .fillEllipse(b.targetX, FLOOR + 6, 340, 44);
        this.floorMarks
          .lineStyle(3, 0xb83149, 0.9)
          .strokeEllipse(b.targetX, FLOOR + 6, 340, 44);
        for (let x = b.targetX - 150; x < b.targetX + 150; x += 30) {
          this.floorMarks
            .lineStyle(2, 0xb83149, 0.5)
            .lineBetween(x, FLOOR, x + 15, FLOOR + 12);
        }
        if (sinceHit < 220) {
          this.effects.lineStyle(9 * (1 - sinceHit / 240), 0xc74453, 0.8);
          this.effects
            .lineBetween(b.targetX - 95, FLOOR - 160, b.targetX, FLOOR)
            .lineBetween(b.targetX + 30, FLOOR - 190, b.targetX, FLOOR);
        }
      }
      if (b.mode === "windup") {
        const remaining = nextHit - b.clock;
        const urgency = 1 - Math.min(1, Math.max(0, remaining) / 1050);
        const color = b.move === "slam" ? 0xc13e4f : this.model.parryWindowOpen ? 0xf2c24c : 0x256b68;
        this.effects
          .lineStyle(5, color, 0.18)
          .beginPath()
          .arc(b.x, FLOOR - 263, 17, Math.PI, 2 * Math.PI)
          .strokePath();
        if (this.model.parryWindowOpen) {
          this.effects.lineStyle(3, 0x5c472c).strokeCircle(b.x, FLOOR - 263, 24);
          this.effects.fillStyle(0xffe992).fillTriangle(b.x, FLOOR - 303, b.x - 7, FLOOR - 313, b.x + 7, FLOOR - 313);
        }
        this.effects
          .lineStyle(5, color, 0.95)
          .beginPath()
          .arc(b.x, FLOOR - 263, 17, Math.PI, Math.PI + Math.PI * urgency)
          .strokePath();
        if (sinceHit < 180 && b.move !== "slam") {
          this.effects.lineStyle(6, 0xf9f6dc, 0.8 * (1 - sinceHit / 180));
          this.effects
            .beginPath()
            .arc(b.x + b.facing * 85, FLOOR - 118, 95, -1.1, 1.2, b.facing < 0)
            .strokePath();
        }
      }
      if (playerPose === "guard" || playerPose === "parry") {
        this.effects.lineStyle(playerPose === "parry" ? 9 : 3, playerPose === 'parry' ? 0xffdf79 : 0x53b8b1, 0.9);
        this.effects
          .beginPath()
          .arc(p.x + p.facing * 38, FLOOR - 99, 63, -1.2, 1.2, p.facing < 0)
          .strokePath();
      }
      if (playerPose === "dodge") {
        this.effects.lineStyle(3, 0xf4faf3, 0.8);
        for (let i = 0; i < 3; i += 1) this.effects.lineBetween(
            p.x - p.dashDirection * 48,
            FLOOR - 20 - i * 20,
            p.x - p.dashDirection * 115,
            FLOOR - 20 - i * 20,
          );
      }
    }
    for (const event of s.events) {
      if (event.id > this.lastEvent) {
        if (s.phase !== 'paused') this.audio.play(event.cue);
        this.lastEvent = event.id;
      }
      const age = s.feedbackT - event.visualAt;
      if (s.phase === 'fight' && age < 200 && event.cue === "hit") {
        const alpha = 1 - age / 200;
        this.effects.lineStyle(
          2,
          0xf6d6a1,
          alpha,
        );
        for (let i = 0; i < 7; i += 1) {
          const angle = (i / 7) * Math.PI * 2;
          const size = 25 + age * 0.15;
          this.effects.lineBetween(
            event.x + Math.cos(angle) * 8,
            FLOOR - 110 + Math.sin(angle) * 8,
            event.x + Math.cos(angle) * size,
            FLOOR - 110 + Math.sin(angle) * size,
          );
        }
      }
      if (s.phase === 'fight' && event.cue === 'parry' && age < 520) {
        const { x } = event;
        const y = FLOOR - 112;
        const fade = Math.max(0, 1 - age / 520);
        const spread = 35 + Math.min(age, 220) * 0.3;
        this.effects.lineStyle(10 * fade, 0x846127, 0.65 * fade).strokeCircle(x, y, spread + 4);
        this.effects.lineStyle(6 * fade, 0xffdf79, fade).strokeCircle(x, y, spread);
        for (let ray = 0; ray < 12; ray += 1) {
          const angle = (ray / 12) * Math.PI * 2;
          const inner = 12 + age * 0.16;
          const outer = inner + (ray % 2 === 0 ? 90 : 56) * fade;
          this.effects.lineStyle((ray % 2 === 0 ? 7 : 4) * fade, ray % 2 === 0 ? 0xfff9d2 : 0xf6b636, fade);
          this.effects.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
        }
        if (age < 170) {
          const flash = (1 - age / 170) * 55;
          this.effects.fillStyle(0xffffff, fade).fillTriangle(x, y - flash, x + 9, y, x - 9, y)
            .fillTriangle(x, y + flash, x + 9, y, x - 9, y)
            .fillTriangle(x - flash, y, x, y - 9, x, y + 9)
            .fillTriangle(x + flash, y, x, y - 9, x, y + 9);
        }
      }
    }
    this.crowd.forEach((member, i) => {
      member.y =
        520 -
        Math.abs(Math.sin(idleTime / (s.phase === "won" ? 110 : 640) + i)) *
          (s.phase === "won" ? 18 : 2);
    });
  }
}
