import Phaser from "phaser";
import { BOSSES, FLOOR, HEIGHT, MOVES, Sparring, WIDTH } from "./core";
import { FighterView } from "./FighterView";
import type { SparringAudio } from "./audio";

export class SparringScene extends Phaser.Scene {
  private model: Sparring;
  private audio: SparringAudio;
  private notify: () => void;
  private heroine!: FighterView;
  private coach!: FighterView;
  private opponents: FighterView[] = [];
  private activeBoss = -1;
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
    BOSSES.forEach((boss) => this.load.image(`sparring-${boss.id}`, boss.background),);
  }

  create() {
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (this.textures.exists("sparring-coach")) this.backdrop = this.add
        .image(640, 360, "sparring-coach")
        .setDisplaySize(WIDTH, HEIGHT);
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
    this.opponents = BOSSES.map((boss) => new FighterView(this, true, boss.id));
    [this.coach] = this.opponents;
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
    const { bossIndex } = this.model.progress.campaign;
    if (bossIndex !== this.activeBoss) {
      this.activeBoss = bossIndex;
      this.opponents.forEach((opponent, index) => {
        opponent.root.setVisible(index === bossIndex);
        opponent.shadow.setVisible(index === bossIndex);
      });
      this.coach = this.opponents[bossIndex];
      this.backdrop?.setTexture(`sparring-${BOSSES[bossIndex].id}`);
    }
    const attack = MOVES[b.move];
    const indicatorY =
      FLOOR - b.elevation - (bossIndex === 2 ? 325 : bossIndex === 1 ? 290 : 263);
    const parry = [...s.events]
      .reverse()
      .find((event) => event.cue === "parry");
    const parryAge = parry ? s.feedbackT - parry.visualAt : Infinity;
    const screenWidth = this.scale.width;
    const screenHeight = this.scale.height;
    const portrait = screenHeight > screenWidth && screenWidth < 700;
    const ended =
      s.phase === "won" || s.phase === "lost" || s.phase === "ending";
    const displayPlayerX = ended && !portrait ? 300 : p.x;
    const displayBossX = ended && !portrait ? 980 : b.x;
    let zoom = portrait
      ? screenWidth / Math.max(750, Math.abs(p.x - b.x) + 380)
      : Math.min(screenWidth / WIDTH, screenHeight / HEIGHT);
    const cameraX = portrait ? (p.x + b.x) / 2 : WIDTH / 2;
    let cameraY = portrait ? FLOOR - (screenHeight < 700 ? 130 : 90) : HEIGHT / 2 + (screenHeight < 560 ? 50 : 0);
    // On short screens the leap needs room above the fighters without entering the HUD.
    if (bossIndex === 2 && ((portrait && screenHeight < 700) || (!portrait && screenHeight < 560))) {
      const floorScreenY = screenHeight / 2 + (FLOOR - cameraY) * zoom;
      const leapFraming = this.reducedMotion ? 1 : attack.kind !== 'leap' ? 0 : b.mode === 'windup' ? Math.min(1, b.clock / 650) : b.mode === 'recover' ? Math.max(0, 1 - b.clock / 350) : 0;
      const fittedZoom = Math.min(zoom, (floorScreenY - (portrait ? 180 : 140)) / 510);
      zoom += (fittedZoom - zoom) * leapFraming;
      cameraY = FLOOR + (screenHeight / 2 - floorScreenY) / zoom;
    }
    const recoil =
      !this.reducedMotion && parryAge < 100
        ? Math.sin(parryAge * 0.35) * 4 * (1 - parryAge / 100)
        : 0;
    this.cameras.main.setZoom(zoom).centerOn(cameraX + recoil, cameraY);
    const backgroundHeight = Math.max(
      HEIGHT,
      screenHeight / zoom,
      ((screenWidth / zoom) * HEIGHT) / WIDTH,
    );
    this.backdrop
      ?.setPosition(cameraX, cameraY)
      .setDisplaySize((backgroundHeight * WIDTH) / HEIGHT, backgroundHeight);
    const idleTime = s.phase === "ready" || ended ? this.time.now : s.t;
    const attackAge = s.t - p.attackAt;
    const newestAttack = attackAge < 360 && p.attackAt > p.parryAt && (!this.model.held.has('guard') || attackAge < 170);
    const moving = Math.abs(p.x - this.previousX) > 0.1;
    const playerPose =
      s.phase === "lost"
        ? "lose"
        : s.phase === "won" || s.phase === "ending"
          ? "win"
          : s.t - p.hurtAt < 300
            ? "hurt"
            : s.t - p.dashAt < 300
              ? "dodge"
              : newestAttack ? 'attack' : s.t - p.parryAt < 220
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
      s.phase === "won" || s.phase === "ending"
        ? "lose"
        : s.phase === "lost"
          ? "win"
          : s.phase === "ready"
            ? "idle"
            : b.mode === "broken"
              ? "lose"
              : b.mode === "stagger" || s.t - b.hurtAt < 180
                ? "hurt"
                : b.mode === "approach"
                  ? "walk"
                  : b.mode === "recover"
                    ? "recover"
                    : b.elevation > 15 ? 'leap'
                      : attack.kind === 'bell' || attack.kind === 'ward' ? 'cast'
                        : attack.kind === 'rush' && b.motionStarted && b.clock <= attack.motion!.end ? 'rush'
                          : attack.kind === 'spin' && sinceHit < 400 ? 'spin'
                    : sinceHit < 260
                      ? "attack"
                      : "charge";
    this.coach.sync(
      displayBossX,
      FLOOR - b.elevation,
      b.facing,
      bossPose,
      idleTime,
      bossPose === 'spin' ? sinceHit / 400 : bossPose === "attack" ? (sinceHit + 80) / 260 : b.clock / nextHit,
      attack.heavy,
    );
    this.coach.shadow.setScale(1 - b.elevation / 330, 1 - b.elevation / 500);
    this.floorMarks.clear();
    this.effects.clear();
    if (s.phase === "fight" || s.phase === "paused") {
      const staminaColor = p.stamina < this.model.attackCost ? 0xc33246 : p.stamina < this.model.dodgeCost ? 0xbb8019 : 0x408f46;
      this.effects.fillStyle(0xf7fff5, 0.95).fillRoundedRect(p.x - 49, FLOOR + 26, 98, 13, 3);
      this.effects.fillStyle(0x334a40, 0.35).fillRect(p.x - 46, FLOOR + 29, 92, 7);
      this.effects.fillStyle(staminaColor).fillRect(p.x - 46, FLOOR + 29, (92 * p.stamina) / 100, 7);
      for (const bell of s.projectiles) {
        const y = FLOOR - 104;
        const direction = Math.sign(bell.vx);
        const color = bell.reflected ? 0xedb929 : 0x3b8eae;
        this.effects.lineStyle(5, color, 0.3).lineBetween(bell.x - direction * 90, y, bell.x - direction * 20, y);
        this.effects.lineStyle(2, color, 0.3).lineBetween(bell.x - direction * 115, y - 14, bell.x - direction * 30, y - 14);
        this.effects.fillStyle(bell.reflected ? 0xffe689 : 0xd6f3ff).fillCircle(bell.x, y, bell.radius);
        this.effects.lineStyle(3, color).strokeCircle(bell.x, y, bell.radius);
        this.effects.lineStyle(3, 0x52645a).strokeRoundedRect(bell.x - 10, y - 12, 20, 22, 8).lineBetween(bell.x - 13, y + 9, bell.x + 13, y + 9);
        this.effects.fillStyle(0xbf9444).fillCircle(bell.x, y + 15, 4);
        this.effects.fillStyle(color).fillTriangle(bell.x + direction * 40, y, bell.x + direction * 31, y - 6, bell.x + direction * 31, y + 6);
        if (!bell.reflected && this.model.parryWindowOpen) this.effects.lineStyle(4, 0xffd14d).strokeCircle(bell.x, y, bell.radius + 8);
      }
      if (b.mode === 'windup' && attack.kind === 'ward') {
        const left = b.targetX - attack.range;
        const right = b.targetX + attack.range;
        this.floorMarks.fillStyle(0xbd395c, 0.28).fillRect(20, FLOOR - 6, left - 20, 39).fillRect(right, FLOOR - 6, 1260 - right, 39);
        this.floorMarks.fillStyle(0x53ae91, 0.4).fillRect(left, FLOOR - 6, right - left, 39);
        this.floorMarks.lineStyle(3, 0x287c67).strokeRect(left, FLOOR - 6, right - left, 39);
        for (const boundary of [left, right]) this.effects.lineStyle(3, 0x9de5cc, 0.9).lineBetween(boundary, FLOOR + 24, boundary, FLOOR - 175);
        for (let x = 45; x < 1250; x += 65) {
          if (x > left - 20 && x < right) continue;
          this.floorMarks.lineStyle(3, 0xc24c67, 0.75).lineBetween(x, FLOOR + 22, x + 25, FLOOR - 3);
          if (sinceHit < 300) this.effects.lineStyle(6, 0xbb3c66, (1 - sinceHit / 300) * 0.75).lineBetween(x, FLOOR + 15, x, FLOOR - 230);
        }
        this.effects.lineStyle(3, 0x91dbef, 0.8).strokeEllipse(b.x, FLOOR - 140, 130 + Math.sin(b.clock / 120) * 12, 180);
      }
      if (b.mode === 'windup' && attack.kind === 'rush') {
        const target = b.motionStarted ? b.motionToX : b.targetX;
        this.floorMarks.lineStyle(6, 0xb9435d, 0.35).lineBetween(b.motionStarted ? b.motionFromX : b.x, FLOOR + 9, target, FLOOR + 9);
        if (bossPose === 'rush') for (let i = 0; i < 4; i += 1) this.effects.lineStyle(5 - i, 0xa63851, 0.55 - i * 0.1).lineBetween(b.x - b.facing * 70, FLOOR - 30 - i * 32, b.x - b.facing * (170 + i * 14), FLOOR - 30 - i * 32);
      }
      if (b.mode === 'windup' && attack.kind === 'spin') {
        this.floorMarks.lineStyle(3, 0xb73e5e, 0.65).strokeEllipse(b.x, FLOOR + 8, attack.range * 2, 55);
        if (sinceHit < 400) {
          const alpha = 1 - sinceHit / 450;
          this.effects.lineStyle(9, 0xf9deaa, alpha).strokeEllipse(b.x, FLOOR - 95, attack.range * 2, 125);
          this.effects.lineStyle(3, 0xb73353, alpha).strokeEllipse(b.x, FLOOR - 95, attack.range * 2 + 12, 137);
        }
      }
      if (b.mode === "windup" && attack.heavy && attack.kind !== 'ward') {
        const fill = Math.min(1, b.clock / hits[0]);
        this.floorMarks
          .fillStyle(0xb83149, 0.14 + fill * 0.13)
          .fillEllipse(b.targetX, FLOOR + 6, attack.range * 2, 44);
        this.floorMarks
          .lineStyle(3, 0xb83149, 0.9)
          .strokeEllipse(b.targetX, FLOOR + 6, attack.range * 2, 44);
        for (
          let x = b.targetX - attack.range + 20;
          x < b.targetX + attack.range - 20;
          x += 30
        ) {
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
        if (attack.kind === 'leap') {
          this.floorMarks.lineStyle(3, 0xfcdfaf, 0.95).lineBetween(b.targetX - 18, FLOOR + 6, b.targetX + 18, FLOOR + 6).lineBetween(b.targetX, FLOOR - 8, b.targetX, FLOOR + 20);
          if (b.elevation > 20) this.effects.lineStyle(2, 0xbc4059, 0.5).lineBetween(b.x, FLOOR - b.elevation + 10, b.targetX, FLOOR);
        }
      }
      if (b.mode === "windup") {
        const remaining = nextHit - b.clock;
        const urgency = 1 - Math.min(1, Math.max(0, remaining) / 1050);
        const color = attack.heavy
          ? 0xc13e4f
          : this.model.parryWindowOpen
            ? 0xf2c24c
            : this.model.bossDefinition.accent;
        this.effects
          .lineStyle(5, color, 0.18)
          .beginPath()
          .arc(b.x, indicatorY, 17, Math.PI, 2 * Math.PI)
          .strokePath();
        if (this.model.parryWindowOpen) {
          this.effects.lineStyle(3, 0x5c472c).strokeCircle(b.x, indicatorY, 24);
          this.effects
            .fillStyle(0xffe992)
            .fillTriangle(
              b.x,
              indicatorY - 40,
              b.x - 7,
              indicatorY - 50,
              b.x + 7,
              indicatorY - 50,
            );
        }
        this.effects
          .lineStyle(5, color, 0.95)
          .beginPath()
          .arc(b.x, indicatorY, 17, Math.PI, Math.PI + Math.PI * urgency)
          .strokePath();
        if (sinceHit < 180 && (attack.kind === 'slash' || attack.kind === 'rush')) {
          this.effects.lineStyle(6, 0xf9f6dc, 0.8 * (1 - sinceHit / 180));
          this.effects
            .beginPath()
            .arc(b.x + b.facing * 85, FLOOR - 118, 95, -1.1, 1.2, b.facing < 0)
            .strokePath();
        }
      }
      if (b.mode === "broken") {
        this.effects.lineStyle(4, 0xc64453, 0.85);
        for (let mark = 0; mark < 4; mark += 1) this.effects.lineBetween(
            b.x - 44 + mark * 25,
            indicatorY + 8,
            b.x - 38 + mark * 25,
            indicatorY - 6,
          );
      }
      if (playerPose === "guard" || playerPose === "parry") {
        this.effects.lineStyle(
          playerPose === "parry" ? 9 : 3,
          playerPose === "parry" ? 0xffdf79 : 0x53b8b1,
          0.9,
        );
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
        if (s.phase !== "paused") this.audio.play(event.cue);
        this.lastEvent = event.id;
      }
      const age = s.feedbackT - event.visualAt;
      if (
        s.phase === "fight" &&
        age < 260 &&
        (event.cue === "hit" || event.cue === 'return' ||
          event.cue === 'riposte' ||
          event.cue === "counter" ||
          event.cue === "deflect")
      ) {
        const alpha = 1 - age / 200;
        this.effects.lineStyle(
          event.cue === 'riposte' ? 8 : event.cue === "counter" ? 6 : 2,
          event.cue === "deflect" ? 0xadc4ca : 0xf6d6a1,
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
      if (s.phase === "fight" && event.cue === "break" && age < 650) {
        const fade = 1 - age / 650;
        this.effects
          .lineStyle(7 * fade, 0xedca7a, fade)
          .strokeEllipse(
            event.x,
            FLOOR - 100,
            95 + age * 0.5,
            170 + age * 0.12,
          );
      }
      if (s.phase === "fight" && event.cue === "parry" && age < 520) {
        const { x } = event;
        const y = FLOOR - 112;
        const fade = Math.max(0, 1 - age / 520);
        const spread = 35 + Math.min(age, 220) * 0.3;
        this.effects
          .lineStyle(10 * fade, 0x846127, 0.65 * fade)
          .strokeCircle(x, y, spread + 4);
        this.effects
          .lineStyle(6 * fade, 0xffdf79, fade)
          .strokeCircle(x, y, spread);
        for (let ray = 0; ray < 12; ray += 1) {
          const angle = (ray / 12) * Math.PI * 2;
          const inner = 12 + age * 0.16;
          const outer = inner + (ray % 2 === 0 ? 90 : 56) * fade;
          this.effects.lineStyle(
            (ray % 2 === 0 ? 7 : 4) * fade,
            ray % 2 === 0 ? 0xfff9d2 : 0xf6b636,
            fade,
          );
          this.effects.lineBetween(
            x + Math.cos(angle) * inner,
            y + Math.sin(angle) * inner,
            x + Math.cos(angle) * outer,
            y + Math.sin(angle) * outer,
          );
        }
        if (age < 170) {
          const flash = (1 - age / 170) * 55;
          this.effects
            .fillStyle(0xffffff, fade)
            .fillTriangle(x, y - flash, x + 9, y, x - 9, y)
            .fillTriangle(x, y + flash, x + 9, y, x - 9, y)
            .fillTriangle(x - flash, y, x, y - 9, x, y + 9)
            .fillTriangle(x + flash, y, x, y - 9, x, y + 9);
        }
      }
    }
    this.crowd.forEach((member, i) => {
      member.y =
        520 -
        Math.abs(
          Math.sin(
            idleTime / (s.phase === "won" || s.phase === "ending" ? 110 : 640) +
              i,
          ),
        ) *
          (s.phase === "won" || s.phase === "ending" ? 18 : 2);
    });
  }
}
