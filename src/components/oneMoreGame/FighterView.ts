import Phaser from "phaser";

type Pose =
  | "idle"
  | "walk"
  | "attack"
  | "guard"
  | "parry"
  | "dodge"
  | "hurt"
  | "win"
  | "lose"
  | "charge"
  | "recover";
const INK = 0x28363b;

// Art is assembled once; animation only moves the reusable paper-puppet parts.
export class FighterView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Container;
  frontArm: Phaser.GameObjects.Container;
  backArm: Phaser.GameObjects.Container;
  legs: Phaser.GameObjects.Container[];
  tails: Phaser.GameObjects.Container[] = [];
  shadow: Phaser.GameObjects.Ellipse;
  private boss: boolean;

  constructor(scene: Phaser.Scene, boss: boolean) {
    this.boss = boss;
    this.shadow = scene.add.ellipse(
      0,
      570,
      boss ? 160 : 115,
      20,
      0x293d3d,
      0.19,
    );
    this.root = scene.add.container(0, 0);
    this.body = scene.add.container(0, 0);
    this.root.add(this.body);
    const shape = (parent: Phaser.GameObjects.Container) => {
      const g = scene.add.graphics();
      parent.add(g);
      return g;
    };
    this.legs = [-1, 1].map((side) => {
      const limb = scene.add.container(side * 16, -53);
      const g = shape(limb);
      g.lineStyle(3, INK).fillStyle(boss ? 0xe7cda2 : 0xffe3d9);
      g.fillRoundedRect(-9, 0, 20, 52, 8).strokeRoundedRect(-9, 0, 20, 52, 8);
      g.fillStyle(boss ? 0x2e5853 : 0x30313c).fillRoundedRect(
        -11,
        28,
        29,
        25,
        7,
      );
      g.lineStyle(2, boss ? 0x94c8b6 : 0xaec0c5).lineBetween(-8, 45, 13, 45);
      this.body.add(limb);
      return limb;
    });
    if (!boss) {
      [-1, 1].forEach((side) => {
        const tail = scene.add.container(side * 35, -166);
        const g = shape(tail);
        g.fillStyle(0xe9edf3).lineStyle(3, INK);
        const points = [
          0,
          0,
          side * 16,
          13,
          side * 23,
          62,
          side * 6,
          92,
          -side * 5,
          81,
          side * 5,
          55,
          -side * 6,
          23,
        ];
        g.fillPoints(
          points.filter((_, i) => i % 2 === 0).map((x, i) => new Phaser.Math.Vector2(x, points[i * 2 + 1])),
          true,
        );
        g.strokePoints(
          points.filter((_, i) => i % 2 === 0).map((x, i) => new Phaser.Math.Vector2(x, points[i * 2 + 1])),
          true,
        );
        g.lineStyle(3, 0xb9c8d4).lineBetween(side * 6, 18, side * 12, 64);
        g.fillStyle(0xc33f51).fillTriangle(-6, 3, side * 16, -5, side * 15, 15);
        this.body.add(tail);
        this.tails.push(tail);
      });
    }
    const torso = shape(this.body);
    torso.lineStyle(3.5, INK);
    if (boss) {
      torso
        .fillStyle(0x247f74)
        .fillRoundedRect(-43, -135, 86, 84, 20)
        .strokeRoundedRect(-43, -135, 86, 84, 20);
      torso.fillStyle(0x7ac3a3).fillTriangle(-22, -133, 33, -130, 0, -75);
      torso.lineStyle(4, 0xf1eee3).lineBetween(-24, -129, 25, -76);
      torso.fillStyle(0xf1eee3).fillRoundedRect(-44, -72, 88, 12, 3);
      torso.fillStyle(0xd9b564).fillCircle(5, -66, 9);
      torso.fillStyle(0xf1eee3).fillTriangle(5, -64, 27, -31, 30, -60);
    } else {
      torso
        .fillStyle(0xf7faf9)
        .fillRoundedRect(-27, -126, 55, 65, 12)
        .strokeRoundedRect(-27, -126, 55, 65, 12);
      torso
        .fillStyle(0x41414e)
        .fillTriangle(-27, -74, -40, -44, 38, -44)
        .fillTriangle(-27, -74, 29, -74, 38, -44);
      torso.lineStyle(2, 0x81939d);
      for (let i = -24; i <= 25; i += 12) torso.lineBetween(i, -72, i * 1.2, -46);
      torso.fillStyle(0xb9344b).fillTriangle(-28, -134, -48, -67, 12, -99);
      torso.fillStyle(0xd84b57).fillTriangle(-28, -134, 32, -132, 25, -89);
      torso.lineStyle(3, 0xf0bab3).lineBetween(-25, -121, -40, -74);
      torso.fillStyle(0x27363d).fillRoundedRect(-30, -80, 60, 10, 3);
      torso.fillStyle(0xe9c576).fillCircle(6, -75, 5);
    }
    this.backArm = scene.add.container(-25, -116);
    this.frontArm = scene.add.container(24, -116);
    [this.backArm, this.frontArm].forEach((arm, index) => {
      const g = shape(arm);
      g.lineStyle(3, INK).fillStyle(boss ? 0x287b71 : 0xfaf5ef);
      g.fillRoundedRect(-11, -3, 25, 42, 9).strokeRoundedRect(
        -11,
        -3,
        25,
        42,
        9,
      );
      g.fillStyle(boss ? 0xd7aa6b : 0xffd7c7)
        .fillCircle(4, 43, 11)
        .strokeCircle(4, 43, 11);
      if (index === 1) {
        const sword = scene.add.graphics();
        sword.lineStyle(3, INK).fillStyle(boss ? 0xddc891 : 0xd3ece9);
        const points = [
          { x: 6, y: 34 },
          { x: boss ? 145 : 119, y: 30 },
          { x: boss ? 160 : 133, y: 40 },
          { x: 6, y: 46 },
        ];
        const vertices = points.map(point => new Phaser.Math.Vector2(point.x, point.y));
        sword.fillPoints(vertices, true).strokePoints(vertices, true);
        sword
          .lineStyle(2, boss ? 0x9a784b : 0x55a9a2)
          .lineBetween(25, 39, boss ? 145 : 119, 37);
        sword
          .lineStyle(7, boss ? 0x34564a : 0xa83145)
          .lineBetween(-8, 41, 15, 41);
        sword.lineStyle(5, 0xd8ad58).lineBetween(16, 24, 16, 55);
        arm.add(sword);
      }
      this.body.add(arm);
    });
    this.head = scene.add.container(0, boss ? -173 : -167);
    const face = shape(this.head);
    face.lineStyle(3.5, INK);
    if (boss) {
      face.fillStyle(0xeac182).fillCircle(0, 0, 47).strokeCircle(0, 0, 47);
      face
        .fillStyle(0xdba863)
        .fillCircle(-29, 17, 11)
        .fillCircle(26, -17, 7)
        .fillCircle(-21, -25, 6)
        .fillCircle(32, 14, 5);
      face.fillStyle(0x236f66).fillRoundedRect(-48, -26, 94, 17, 6);
      face.fillStyle(0x93cfae).fillTriangle(-45, -21, -70, -5, -53, -29);
      face.fillStyle(0xfff7dd).fillCircle(0, -17, 9);
      face.lineStyle(3, INK).lineBetween(0, -23, 0, -11);
      face.fillStyle(INK).fillEllipse(-13, 6, 8, 10).fillEllipse(17, 6, 8, 10);
      face
        .lineStyle(4, INK)
        .lineBetween(-23, -2, -9, -5)
        .lineBetween(12, -5, 25, -1);
      face
        .fillStyle(0xfaf4df)
        .fillTriangle(4, 15, -26, 25, -7, 28)
        .fillTriangle(4, 15, 31, 24, 14, 29);
      face.fillStyle(0x5d4037).fillEllipse(4, 29, 10, 6);
    } else {
      face
        .fillStyle(0xe5eaf2)
        .fillEllipse(-3, -1, 84, 88)
        .strokeEllipse(-3, -1, 84, 88);
      face
        .fillStyle(0xffe3d8)
        .fillEllipse(4, 12, 65, 56)
        .strokeEllipse(4, 12, 65, 56);
      face
        .fillStyle(0xffffff)
        .fillEllipse(-5, 12, 16, 21)
        .fillEllipse(24, 12, 16, 21);
      face
        .fillStyle(0xb63349)
        .fillEllipse(-2, 13, 9, 17)
        .fillEllipse(27, 13, 9, 17);
      face.fillStyle(INK).fillEllipse(-1, 14, 4, 11).fillEllipse(28, 14, 4, 11);
      face.fillStyle(0xffffff).fillCircle(-3, 8, 3).fillCircle(26, 8, 3);
      face
        .lineStyle(3, INK)
        .lineBetween(-15, 2, 4, 1)
        .lineBetween(17, 1, 33, 3);
      face.fillStyle(0xf4f5fa);
      const fringe = [
        { x: -42, y: -20 },
        { x: -22, y: -36 },
        { x: 16, y: -38 },
        { x: 37, y: -16 },
        { x: 34, y: 1 },
        { x: 21, y: -10 },
        { x: 14, y: 1 },
        { x: 0, y: -14 },
        { x: -8, y: 1 },
        { x: -19, y: -8 },
        { x: -27, y: 13 },
        { x: -36, y: 3 },
      ];
      const vertices = fringe.map(point => new Phaser.Math.Vector2(point.x, point.y));
      face.fillPoints(vertices, true).strokePoints(vertices, true);
      face
        .fillStyle(0xba2d49)
        .fillEllipse(-9, -38, 87, 37)
        .strokeEllipse(-9, -38, 87, 37);
      face.lineStyle(4, 0xf19594).lineBetween(-38, -39, 2, -48);
      face
        .fillStyle(0xebc477)
        .fillCircle(-29, -29, 6)
        .fillTriangle(-36, -29, -46, -12, -26, -21);
      face
        .fillStyle(0xf4a39d, 0.7)
        .fillEllipse(-18, 26, 11, 5)
        .fillEllipse(32, 27, 9, 5);
      face.lineStyle(2, INK).lineBetween(8, 30, 17, 29);
    }
    this.body.add(this.head);
  }

  sync(
    x: number,
    y: number,
    facing: number,
    pose: Pose,
    time: number,
    strength = 0,
    overhead = false,
  ) {
    const walk = pose === "walk";
    const beat = Math.sin(time / 90);
    const breathing = Math.sin(time / 430) * 1.7;
    this.root
      .setPosition(x, y)
      .setScale(facing * (this.boss ? 1.08 : 1), this.boss ? 1.08 : 1);
    this.shadow.setX(x).setScale(pose === "dodge" ? 1.3 : 1, 1);
    this.body.y = walk ? -Math.abs(beat) * 6 : breathing;
    this.body.rotation = 0;
    this.head.rotation = Math.sin(time / 600) * 0.02;
    this.frontArm.rotation = -0.5;
    this.backArm.rotation = 0.2;
    this.legs[0].rotation = walk ? beat * 0.42 : -0.1;
    this.legs[1].rotation = walk ? -beat * 0.42 : 0.15;
    this.tails.forEach((tail, i) => {
      tail.rotation = Math.sin(time / 170 + i) * (walk ? 0.18 : 0.04);
    });
    if (pose === "attack") {
      this.frontArm.rotation =
        -1.65 + Math.sin((Math.min(1, strength) * Math.PI) / 2) * 2.25;
      this.body.rotation = 0.1;
      this.backArm.rotation = -0.4;
    } else if (pose === "guard" || pose === "parry") {
      this.frontArm.rotation = -1.45;
      this.backArm.rotation = -0.85;
      this.body.rotation = -0.05;
      this.head.rotation = -0.07;
      if (pose === "parry") this.body.x = -4;
    } else if (pose === "dodge") {
      this.body.y = 38;
      this.body.rotation = -0.25;
      this.frontArm.rotation = -0.05;
      this.legs[0].rotation = -0.7;
      this.legs[1].rotation = 0.85;
    } else if (pose === "hurt") {
      this.body.rotation = -0.21;
      this.frontArm.rotation = -0.8;
      this.head.rotation = -0.12;
    } else if (pose === "charge") {
      this.frontArm.rotation = overhead ? -2.1 - strength * 0.25 : -1.3 - strength * 0.25;
      this.backArm.rotation = overhead ? -1.8 : 0.2;
      this.body.y = 7;
      this.head.rotation = -0.08;
    } else if (pose === "recover") {
      this.frontArm.rotation = 0.65;
      this.body.rotation = 0.12;
      this.head.rotation = 0.1;
    } else if (pose === "win") {
      this.frontArm.rotation = -2;
      this.backArm.rotation = -2.5;
      this.body.y = -Math.abs(Math.sin(time / 190)) * 13;
      this.head.rotation = -0.12;
    } else if (pose === "lose") {
      this.body.y = 32;
      this.body.rotation = -0.24;
      this.frontArm.rotation = 0.55;
      this.head.rotation = 0.17;
      this.legs[0].rotation = -0.6;
      this.legs[1].rotation = 0.75;
    }
    if (pose !== "parry") this.body.x = 0;
  }
}
