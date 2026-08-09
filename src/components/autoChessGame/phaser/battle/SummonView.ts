import Phaser from "phaser";
import { mechanicalRabbitMuzzle } from "../../core/battleGeometry";
import type { MechanicalRabbitPet } from "../../core/gameTypes";
import { DEPTH } from "../theme";

interface SummonViewHost {
  scene: Phaser.Scene;
  text: (
    x: number,
    y: number,
    value: string,
    size?: number,
    color?: string,
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) => Phaser.GameObjects.Text;
}

type MechanicalRabbitVisualOptions = {
  flash?: boolean;
  shadow?: boolean;
};

export const CLOCK_GUNNER_EAR_REST_Y_RATIO = 1.5;

const drawRabbitBody = (
  graphics: Phaser.GameObjects.Graphics,
  radius: number,
) => {
  graphics
    .fillGradientStyle(0x111a27, 0x728998, 0x3b4f60, 0x728998, 1)
    .beginPath()
    .moveTo(-radius * 0.62, 0)
    .lineTo(-radius * 0.22, -radius * 0.31)
    .lineTo(radius * 0.38, -radius * 0.2)
    .lineTo(radius * 0.5, 0)
    .lineTo(radius * 0.38, radius * 0.2)
    .lineTo(-radius * 0.22, radius * 0.31)
    .closePath()
    .fillPath()
    .lineStyle(1.2, 0xb8ccd8)
    .strokePath();
};

const drawRabbitCannon = (
  cannon: Phaser.GameObjects.Graphics,
  details: Phaser.GameObjects.Graphics,
  radius: number,
  muzzleDistance: number,
) => {
  cannon
    .fillStyle(0x1b2938)
    .lineStyle(1.25, 0xdce6ec)
    .beginPath()
    .moveTo(-radius * 0.08, -radius * 0.23)
    .lineTo(muzzleDistance - radius * 0.08, -radius * 0.1)
    .lineTo(muzzleDistance, 0)
    .lineTo(muzzleDistance - radius * 0.08, radius * 0.1)
    .lineTo(-radius * 0.08, radius * 0.23)
    .closePath()
    .fillPath()
    .strokePath();
  details
    .fillStyle(0xf4f0f2)
    .beginPath()
    .moveTo(radius * 0.04, -radius * 0.11)
    .lineTo(muzzleDistance - radius * 0.22, -radius * 0.045)
    .lineTo(muzzleDistance - radius * 0.08, 0)
    .lineTo(muzzleDistance - radius * 0.22, radius * 0.045)
    .lineTo(radius * 0.04, radius * 0.11)
    .closePath()
    .fillPath()
    .fillStyle(0xefc8d1)
    .fillRect(radius * 0.16, -radius * 0.17, radius * 0.24, radius * 0.34)
    .lineStyle(1.4, 0x92d7ff)
    .lineBetween(radius * 0.4, 0, muzzleDistance - radius * 0.25, 0);
};

export const createMechanicalRabbitVisual = (
  scene: Phaser.Scene,
  radius: number,
  muzzleDistance = radius * 1.55,
  options: MechanicalRabbitVisualOptions = {},
) => {
  const { flash: showFlash = true, shadow: showShadow = true } = options;
  const container = scene.add.container(0, 0);
  const shadow = scene.add
    .ellipse(0, 0, radius * 2.4, radius * 0.6, 0x000000, 0.26)
    .setName("shadow")
    .setVisible(showShadow);
  const body = scene.add.graphics().setName("body");
  const cannon = scene.add.graphics().setName("cannon");
  const details = scene.add.graphics().setName("details");
  const eye = scene.add
    .circle(-radius * 0.2, 0, Math.max(1.8, radius * 0.17), 0x92d7ff)
    .setName("eye");
  const flash = scene.add
    .circle(muzzleDistance, 0, 4.5, 0xdafaff, 0)
    .setName("flash")
    .setVisible(showFlash);

  drawRabbitBody(body, radius);
  drawRabbitCannon(cannon, details, radius, muzzleDistance);
  container.add([shadow, body, cannon, details, eye, flash]);
  return container;
};

export const createClockGunnerEarRig = (
  scene: Phaser.Scene,
  fighterRadius: number,
) => {
  const rig = scene.add
    .container(0, -fighterRadius * CLOCK_GUNNER_EAR_REST_Y_RATIO)
    .setName("clockGunnerEarRig");
  const earRadius = fighterRadius * 0.43;
  const leftEar = createMechanicalRabbitVisual(scene, earRadius, earRadius * 1.55, {
    flash: false,
    shadow: false,
  })
    .setName("clockGunnerLeftEar")
    .setPosition(-fighterRadius * 0.25, fighterRadius * 0.05)
    .setRotation(-Math.PI / 2 - 0.14);
  const rightEar = createMechanicalRabbitVisual(scene, earRadius, earRadius * 1.55, {
    flash: false,
    shadow: false,
  })
    .setName("clockGunnerRightEar")
    .setPosition(fighterRadius * 0.25, -fighterRadius * 0.02)
    .setRotation(-Math.PI / 2 + 0.14);
  rig.add([leftEar, rightEar]);
  return rig;
};

export class SummonViewRenderer {
  private readonly petViews = new Map<string, Phaser.GameObjects.Container>();

  constructor(private readonly host: SummonViewHost) {}

  public reset() {
    this.petViews.clear();
  }

  public sync(
    pets: MechanicalRabbitPet[],
    visualTime: number,
    layer: Phaser.GameObjects.Container,
  ) {
    this.syncMap(
      this.petViews,
      pets,
      (pet) => this.createRabbit(pet),
      (view, pet) => this.updateRabbit(view, pet, visualTime),
      layer,
    );
  }

  private syncMap<T extends { id: string }>(
    views: Map<string, Phaser.GameObjects.Container>,
    items: T[],
    create: (item: T) => Phaser.GameObjects.Container,
    update: (view: Phaser.GameObjects.Container, item: T) => void,
    layer: Phaser.GameObjects.Container,
  ) {
    const active = new Set<string>();
    items.forEach((item) => {
      active.add(item.id);
      let view = views.get(item.id);
      if (!view) {
        view = create(item);
        views.set(item.id, view);
        layer.add(view);
      }
      update(view, item);
    });
    views.forEach((view, id) => {
      if (active.has(id)) return;
      view.destroy();
      views.delete(id);
    });
  }

  private createRabbit(pet: MechanicalRabbitPet) {
    const { scene } = this.host;
    const muzzle = mechanicalRabbitMuzzle(pet);
    const muzzleDistance = Math.hypot(muzzle.x - pet.x, muzzle.y - pet.y);
    return createMechanicalRabbitVisual(scene, pet.radius, muzzleDistance);
  }

  private updateRabbit(
    view: Phaser.GameObjects.Container,
    pet: MechanicalRabbitPet,
    visualTime: number,
  ) {
    const fade = Math.max(0.25, Math.min(1, pet.life / 0.7));
    const bob = Math.sin(visualTime * 8 + pet.x * 0.03) * 3;
    const angle = Math.atan2(pet.aimY, pet.aimX);
    const flash = view.getByName("flash") as Phaser.GameObjects.Arc;
    const muzzle = mechanicalRabbitMuzzle(pet);
    const muzzleDistance = Math.hypot(muzzle.x - pet.x, muzzle.y - pet.y);
    const flashScale = 1 + (pet.attackPulse / 0.16) * 0.75;
    view
      .setPosition(pet.x, pet.y + bob)
      .setRotation(angle)
      .setAlpha(fade)
      .setDepth(DEPTH.entities + pet.y + 0.5);
    (view.getByName("shadow") as Phaser.GameObjects.Ellipse)
      .setRotation(-angle)
      .setY(pet.radius * 0.88 - bob);
    flash
      .setX(muzzleDistance)
      .setAlpha(
        pet.attackPulse > 0 ? Math.min(0.96, pet.attackPulse / 0.16) : 0,
      )
      .setScale(flashScale);
  }

}
