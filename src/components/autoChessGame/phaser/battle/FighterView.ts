import Phaser from "phaser";
import {
  ENERGY_PROFILES,
  UNIT_DEFS,
  type UnitId,
} from "../../core/gameData";
import type { Fighter } from "../../core/gameTypes";
import { getCharacterStyle, resolveUnitPortrait } from "../../core/characterStyle";
import { mumuWhipPullProgress } from "../../core/motionPaths";
import {
  GLUTTONY_RADIUS_PER_STACK,
  GLUTTONY_STACK_CAP,
  fighterVisualRadius,
} from "../../core/battleGeometry";
import type { EngineBridge } from "../EngineBridge";
import {
  abilityTextureKeyForUnit,
  circularTextureKeyForUnit,
  HAZEL_MANQU_TEXTURE_KEY,
  textureKeyForUnit,
} from "../assets";
import { DEPTH } from "../theme";
import {
  CLOCK_GUNNER_EAR_REST_Y_RATIO,
  createClockGunnerEarRig,
} from "./SummonView";

const PROJECTILE_EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", sans-serif';

type FighterViewParts = {
  hp: Phaser.GameObjects.Rectangle;
  energy: Phaser.GameObjects.Rectangle;
  portrait: Phaser.GameObjects.Container;
  portraitImage: Phaser.GameObjects.Image;
  clockGunnerEars: Phaser.GameObjects.Container | null;
  hitFlash: Phaser.GameObjects.Arc;
  shield: Phaser.GameObjects.Arc;
  abilityShield: Phaser.GameObjects.Arc;
  syncAura: Phaser.GameObjects.Arc;
  burn: Phaser.GameObjects.Arc;
  status: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  star: Phaser.GameObjects.Text;
  lastX: number;
  lastY: number;
  walkPhaseOffset: number;
};

interface FighterViewHost {
  scene: Phaser.Scene;
  bridge: EngineBridge;
  isCompact: () => boolean;
  text: (
    x: number,
    y: number,
    value: string,
    size?: number,
    color?: string,
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) => Phaser.GameObjects.Text;
  createPortrait: (
    unitId: UnitId,
    x: number,
    y: number,
    radius: number,
    enemy?: boolean,
  ) => Phaser.GameObjects.Container;
  showUnitTooltip: (
    unitId: UnitId,
    pointer?: Phaser.Input.Pointer,
    star?: 1 | 2 | 3,
    fighter?: Fighter,
  ) => void;
  clearTooltip: () => void;
}

export class FighterViewRenderer {
  private readonly fighterViewParts =
    new WeakMap<Phaser.GameObjects.Container, FighterViewParts>();

  constructor(private readonly host: FighterViewHost) {}

  public create(fighter: Fighter) {
    const container = this.host.scene.add.container(fighter.x, fighter.y);
    const radius = fighter.radius || fighterVisualRadius(fighter.unitId, fighter.star);
    const shadow = this.host.scene.add.ellipse(0, radius * 0.8, radius * 1.8, radius * 0.6, 0x000000, 0.3).setName("shadow");
    const shield = this.host.scene.add.circle(0, 0, radius + 8, 0x6edeff, 0)
      .setStrokeStyle(2, 0xc6f7ff, 0)
      .setName("shield");
    const abilityShield = this.host.scene.add.circle(0, 0, radius + 13, 0xb98cff, 0)
      .setStrokeStyle(2, 0xe6d0ff, 0)
      .setName("abilityShield");
    const syncAura = this.host.scene.add.circle(0, 0, radius + 13, 0x79dcff, 0).setName("syncAura");
    const hitFlash = this.host.scene.add.circle(0, 0, radius, 0xff526f, 0).setName("hitFlash");
    const burn = this.host.scene.add.circle(radius * 0.7, -radius * 0.55, 5, 0xff7a50, 0).setName("burn");
    const status = this.host.text(0, -radius - 8, "", 13, "#ffd95e", { fontFamily: PROJECTILE_EMOJI_FONT, fontStyle: "bold" }).setOrigin(0.5).setName("status");
    const portrait = this.host.createPortrait(fighter.unitId, 0, 0, radius, fighter.team === "enemy");
    portrait.setName("portrait");
    const clockGunnerEars = fighter.unitId === "clock_gunner"
      ? createClockGunnerEarRig(this.host.scene, radius)
      : null;
    if (clockGunnerEars) portrait.add(clockGunnerEars);
    const hpBack = this.host.scene.add.rectangle(0, radius + 10, radius * 2.25, 7, 0x152430).setName("hpBack");
    const hp = this.host.scene.add.rectangle(-radius * 1.125, radius + 10, radius * 2.25, 7, fighter.team === "player" ? 0x52de9b : 0xff668a).setOrigin(0, 0.5).setName("hp");
    const energyBack = this.host.scene.add.rectangle(0, radius + 20, radius * 2.25, 4, 0x14222d).setName("energyBack");
    const energy = this.host.scene.add.rectangle(-radius * 1.125, radius + 20, radius * 2.25, 4, 0x8edfff).setOrigin(0, 0.5).setName("energy");
    const label = this.host.text(0, radius + 30, UNIT_DEFS[fighter.unitId].name, 9, fighter.team === "player" ? "#b8dcef" : "#efb1c3").setOrigin(0.5).setName("label");
    const star = this.host.text(0, radius + 30, "★".repeat(fighter.star), 9, "#ffdc68").setOrigin(0, 0.5).setName("star");
    const zone = this.host.scene.add.zone(0, 0, radius * 2.4, radius * 2.4).setInteractive({ useHandCursor: true });
    zone.setData("fighter", fighter.fid);
    zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.host.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
    zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.host.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
    zone.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!this.host.isCompact()) this.host.clearTooltip();
    });
    container.add([shadow, syncAura, abilityShield, shield, portrait, hitFlash, burn, hpBack, hp, energyBack, energy, label, star, status, zone]);
    this.fighterViewParts.set(container, {
      hp,
      energy,
      portrait,
      portraitImage: portrait.getByName("portraitImage") as Phaser.GameObjects.Image,
      clockGunnerEars,
      hitFlash,
      shield,
      abilityShield,
      syncAura,
      burn,
      status,
      shadow,
      label,
      star,
      lastX: fighter.x,
      lastY: fighter.y,
      walkPhaseOffset: String(fighter.fid).split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) * 0.17,
    });
    return container;
  }

  public update(view: Phaser.GameObjects.Container, fighter: Fighter) {
    const radius = fighter.radius || fighterVisualRadius(fighter.unitId, fighter.star);
    const parts = this.fighterViewParts.get(view)!;
    const movedDistance = Math.hypot(fighter.x - parts.lastX, fighter.y - parts.lastY);
    parts.lastX = fighter.x;
    parts.lastY = fighter.y;
    const { abilityMotion } = fighter;
    const abilityJumping = abilityMotion?.kind === "jump";
    const mumuPulling = abilityMotion?.kind === "pull" && abilityMotion.abilityId === "mumu";
    const jumping = abilityJumping || mumuPulling || (fighter.jumpTime > 0 && fighter.jumpDuration > 0);
    const jumpProgress = abilityJumping
      ? abilityMotion.time / Math.max(abilityMotion.duration, 0.001)
      : mumuPulling
        ? mumuWhipPullProgress(abilityMotion.time / Math.max(abilityMotion.duration, 0.001))
      : jumping ? 1 - fighter.jumpTime / fighter.jumpDuration : 0;
    const jumpArcHeight = abilityJumping
      ? abilityMotion.arcHeight
      : mumuPulling
        ? 28
        : fighter.jumpArcHeight || 92;
    const jumpArc = jumping ? Math.sin(jumpProgress * Math.PI) * jumpArcHeight : 0;
    const attackProgress = !abilityMotion && !fighter.sekiChargeActive && fighter.attackPulse > 0 ? fighter.attackPulse / 0.22 : 0;
    const lunge = Math.sin((1 - attackProgress) * Math.PI) * 10;
    const targetDistance = Math.hypot(fighter.attackTargetX - fighter.x, fighter.attackTargetY - fighter.y) || 1;
    const attackOffsetX = ((fighter.attackTargetX - fighter.x) / targetDistance) * lunge;
    const attackOffsetY = ((fighter.attackTargetY - fighter.y) / targetDistance) * lunge;
    const visualY = fighter.y - jumpArc + attackOffsetY;
    view
      .setPosition(fighter.x + attackOffsetX, visualY)
      .setDepth(DEPTH.entities + visualY)
      .setAlpha(fighter.stealthTime > 0 ? 0.56 : 1);

    const {
      hp,
      energy,
      portrait,
      portraitImage,
      clockGunnerEars,
      hitFlash,
      shield,
      abilityShield,
      syncAura,
      burn,
      status,
      shadow,
      label,
      star,
      walkPhaseOffset,
    } = parts;
    const hitProgress = fighter.hitPulse > 0 ? fighter.hitPulse / 0.2 : 0;
    const growth = fighter.growthStacks > 0
      ? 1 + fighter.growthStacks * GLUTTONY_RADIUS_PER_STACK + Math.sin(this.host.bridge.engine.state.visualTime * 8) * 0.008
      : 1;
    const attackScaleX = 1 + lunge / 70;
    const attackScaleY = 1 - lunge / 130;
    const hitScaleX = 1 - 0.08 * hitProgress;
    const hitScaleY = 1 + 0.08 * hitProgress;
    const groundMotion = (abilityMotion && abilityMotion.kind !== "jump") || fighter.sekiChargeActive;
    const motionPulse = fighter.sekiChargeActive
      ? 0.72 + Math.sin(this.host.bridge.engine.state.visualTime * 18) * 0.2
      : groundMotion && abilityMotion
        ? Math.sin((abilityMotion.time / Math.max(abilityMotion.duration, 0.001)) * Math.PI)
        : 0;
    const resolvedPortrait = resolveUnitPortrait(fighter.unitId);
    const spriteWalking = resolvedPortrait.portraitStyle === "sprite"
      && movedDistance > 0.05
      && !jumping
      && !groundMotion
      && attackProgress <= 0
      && fighter.stun <= 0;
    const walkPhase = this.host.bridge.engine.state.visualTime * 11 + walkPhaseOffset;
    const walkStep = spriteWalking ? Math.sin(walkPhase) : 0;
    const walkBounce = Math.abs(walkStep) * 2.4;
    const walkSquash = spriteWalking ? Math.cos(walkPhase * 2) * 0.035 : 0;
    const walkTilt = walkStep * 4;
    const manquPulse = fighter.manquTime > 0
      ? Math.sin(this.host.bridge.engine.state.visualTime * 15) * 0.045
      : 0;
    const switchActive = fighter.raccoonSwitchTime > 0;
    const switchJitterX = switchActive
      ? Math.sin(this.host.bridge.engine.state.visualTime * 58) * 1.5
      : 0;
    const switchJitterY = switchActive
      ? Math.sin(this.host.bridge.engine.state.visualTime * 71 + 0.8) * 0.7
      : 0;
    portrait
      .setPosition(switchJitterX, switchJitterY - walkBounce)
      .setScale(
        growth * attackScaleX * hitScaleX * (1 + motionPulse * 0.08 + manquPulse + walkSquash),
        growth * attackScaleY * hitScaleY * (1 - motionPulse * 0.12 - manquPulse - walkSquash * 0.75),
      )
      .setAngle(groundMotion ? fighter.facingX * motionPulse * (mumuPulling ? 14 : 7) : walkTilt)
      .setAlpha(fighter.stun > 0 ? 0.72 : 1);
    const characterStyle = getCharacterStyle();
    const normalPortraitKey = resolvedPortrait.portraitStyle === "sprite"
      ? textureKeyForUnit(fighter.unitId, characterStyle)
      : circularTextureKeyForUnit(fighter.unitId, characterStyle);
    const portraitKey = fighter.unitId === "sun_guard" && fighter.manquTime > 0
      ? HAZEL_MANQU_TEXTURE_KEY
      : fighter.unitId === "komichi" && fighter.komichiSignTime > 0
        ? abilityTextureKeyForUnit(fighter.unitId, characterStyle)
      : normalPortraitKey;
    if (portraitImage.texture.key !== portraitKey && this.host.scene.textures.exists(portraitKey)) {
      portraitImage.setTexture(portraitKey);
    }
    portraitImage.setFlipX(fighter.facingX < 0);
    if (clockGunnerEars) {
      const rabbitEarsLaunched = this.host.bridge.engine.state.battle?.pets.some(
        (pet) => pet.ownerFid === fighter.fid,
      ) ?? false;
      clockGunnerEars
        .setVisible(!rabbitEarsLaunched)
        .setY(
          -radius * CLOCK_GUNNER_EAR_REST_Y_RATIO
            + Math.sin(this.host.bridge.engine.state.visualTime * 5 + walkPhaseOffset) * 1.1,
        )
        .setScale(fighter.facingX, 1);
    }
    const walkShadowScale = spriteWalking ? 1 - walkBounce / 30 : 1;
    shadow
      .setPosition(-attackOffsetX, radius * 0.8 + jumpArc - attackOffsetY)
      .setScale(growth * walkShadowScale, growth * (2 - walkShadowScale));
    hp.width = radius * 2.25 * Math.max(0, fighter.hp / fighter.maxHp);
    energy.width = radius * 2.25 * Math.max(0, Math.min(1, fighter.energy / fighter.maxEnergy));
    energy.fillColor = Phaser.Display.Color.HexStringToColor(ENERGY_PROFILES[fighter.energyStyle].color).color;
    hitFlash.setAlpha(0.72 * hitProgress).setRadius(radius);
    const shieldStrength = fighter.shield > 0
      ? Math.max(0, Math.min(1, fighter.shield / Math.max(fighter.shieldPeak, 1)))
      : 0;
    const shieldFill = switchActive ? 0xa756e8 : 0x6edeff;
    const shieldStroke = switchActive ? 0xe5baff : 0xc6f7ff;
    shield
      .setRadius(radius + 7 + Math.sin(this.host.bridge.engine.state.visualTime * 6) * 2)
      .setFillStyle(shieldFill, 0.06 + shieldStrength * 0.14)
      .setStrokeStyle(1.5 + shieldStrength * 1.5, shieldStroke, 0.24 + shieldStrength * 0.66)
      .setAlpha(fighter.shield > 0 ? 1 : 0);
    const abilityShieldStrength = fighter.abilityShield > 0
      ? Math.max(0, Math.min(1, fighter.abilityShield / Math.max(fighter.abilityShieldPeak, 1)))
      : 0;
    abilityShield
      .setRadius(radius + 12 + Math.sin(this.host.bridge.engine.state.visualTime * 7 + 1.2) * 2)
      .setFillStyle(0xb98cff, 0.04 + abilityShieldStrength * 0.1)
      .setStrokeStyle(2 + abilityShieldStrength * 1.8, 0xe6d0ff, 0.34 + abilityShieldStrength * 0.62)
      .setAlpha(fighter.abilityShield > 0 ? 1 : 0);
    const syncPulse = 1 + Math.sin(this.host.bridge.engine.state.visualTime * 7) * 0.12;
    const towerHackVisible = fighter.towerHackArmed || fighter.towerHackBuffed;
    const syncColor = towerHackVisible
      ? 0xf0c76b
      : fighter.syncAvDirection > 0
        ? 0xff9a5c
        : 0x79dcff;
    syncAura
      .setFillStyle(syncColor, 1)
      .setRadius((radius + 13 + (towerHackVisible ? 9 : fighter.syncAvStrength * 12)) * syncPulse)
      .setAlpha(towerHackVisible ? (fighter.towerHackBuffed ? 0.34 : 0.18) : fighter.syncAvDirection === 0 ? 0 : 0.12 + fighter.syncAvStrength * 0.32);
    burn.setAlpha(fighter.burnTime > 0 ? 0.9 : 0).setScale(1 + Math.sin(this.host.bridge.engine.state.visualTime * 10) * 0.35);
    const statusBadges = [
      fighter.weakenTime > 0 ? "🦑" : "",
      fighter.slowTime > 0 ? "🐌" : "",
      fighter.burnTime > 0 ? "🔥" : "",
      fighter.stun > 0 ? "✦" : "",
      fighter.tauntTime > 0 ? "嘲" : "",
      fighter.jumpPending ? "⌁" : "",
      abilityMotion?.kind === "dash" ? "»" : "",
      abilityMotion?.kind === "push" ? "›" : "",
      abilityMotion?.kind === "pull" ? "援" : "",
      fighter.abilityShield > 0 ? "术" : "",
      fighter.sekiChargeActive ? "冲" : "",
      fighter.barrageActive || fighter.abilityAttackSpeedTime > 0 || fighter.abilityMoveSpeedTime > 0 ? "⚡" : "",
      fighter.barrageActive && fighter.unitId === "cinder_ram" ? "歌" : "",
      fighter.reborn ? "涅" : "",
      fighter.rebirthRecoilTime > 0 ? "退" : "",
      fighter.stealthTime > 0 ? "隐" : "",
      fighter.lovelyControlTime > 0 ? "控" : "",
      fighter.komichiSignTime > 0 ? "牌" : "",
      fighter.towerHackArmed ? "待挂" : "",
      fighter.towerHackBuffed ? "挂" : "",
      switchActive ? "ON" : "",
      fighter.syncAvDirection > 0 ? "骄" : fighter.syncAvDirection < 0 ? "哀" : "",
      fighter.gen27Buffed ? "27" : "",
      fighter.enraged ? "!" : "",
    ].filter(Boolean);
    status.setText(statusBadges.join(" "));
    status.setY(-radius - 8);
    const statusColor = switchActive ? "#e3b7ff" : fighter.stealthTime > 0 ? "#a9c8ff" : fighter.enraged ? "#ff4f9a" : fighter.syncAvDirection > 0 ? "#ff9a5c" : fighter.syncAvDirection < 0 ? "#79dcff" : fighter.weakenTime > 0 ? "#f5d56f" : fighter.slowTime > 0 ? "#8fd9ff" : "#ffd95e";
    if (status.style.color !== statusColor) status.setColor(statusColor);
    label.setText(`${UNIT_DEFS[fighter.unitId].name}${fighter.manquTime > 0 ? " · 满区" : ""}${fighter.growthStacks ? ` · 饱${fighter.growthStacks}/${GLUTTONY_STACK_CAP}` : ""}${fighter.shield > 0 ? " ◇" : ""}${fighter.abilityShield > 0 ? " ◆" : ""}`);
    star.setText("★".repeat(fighter.star)).setPosition(label.width / 2 + 6, radius + 30);
  }

}
