import Phaser from "phaser";
import type { UnitId, WaveUnit } from "../core/gameData";
import {
  ABILITY_CAST_TIMING_LABELS,
  AUGMENTS,
  AUGMENT_TIER_LABELS,
  STARTERS,
  TRAITS,
  UNIT_DEFS,
  MAX_PLAYER_LEVEL,
  PLAYER_LEVEL_CONFIG,
  abilityDescriptionForStar,
  augmentTierForRound,
  describeAbilityStarGrowth,
  bookLevelForPlayerLevel,
  enemyBudgetForRound,
  enemyTraitActivations,
  progressionModeForRound,
} from "../core/gameData";
import type {
  BattleEffect,
  ChronosphereZone,
  Fighter,
  OwnedUnit,
  Projectile,
  RankingMetric,
  Team,
  UnitLocation,
} from "../core/gameTypes";
import { EngineBridge, type GameAction } from "./EngineBridge";
import {
  circularTextureKeyForUnit,
  createCircularProjectileTextures,
  createCircularPortraitTextures,
  createFallbackTextures,
  preloadUnitPortraits,
  textureKeyForUnit,
} from "./assets";
import { FighterViewRenderer } from "./battle/FighterView";
import { ProjectileViewRenderer } from "./battle/ProjectileView";
import { EffectViewRenderer } from "./battle/EffectView";
import { SummonViewRenderer } from "./battle/SummonView";
import {
  COMPACT_RESULT_LAYOUT,
  COMPACT_TRAIT_STRIP,
  MOBILE_BENCH_PANEL,
  MOBILE_BOARD_PANEL,
  MOBILE_TRAIT_STRIP,
  PREPARATION_BENCH_PANEL,
  PREPARATION_BOARD_PANEL,
  PREPARATION_SELL_ZONE,
  PREPARATION_SHOP_PANEL,
  WIDE_RESULT_LAYOUT,
  WIDE_TRAIT_STRIP,
  MAX_MOBILE_TEXT_RESOLUTION,
  MAX_TEXT_RESOLUTION,
  TOOLTIP_TYPOGRAPHY,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  benchSlot,
  boardSlot,
  compactBenchSlot,
  compactBoardSlot,
  logicalSizeFor,
  mobileBenchSlot,
  mobileBoardSlot,
  occupiedSlotLayout,
  profileFor,
  tooltipLayoutFor,
  viewportScaleFor,
  type LayoutProfile,
} from "./layout";
import { BUTTONS, COLORS, DEPTH, FONT_FAMILY, TITLE, type ButtonTone } from "./theme";

type ButtonOptions = {
  tone?: ButtonTone;
  enabled?: boolean;
  hoverLabel?: string;
  selected?: boolean;
  secondary?: string;
};

type DragState = {
  origin: UnitLocation;
  unit: OwnedUnit;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  ghost: Phaser.GameObjects.Container | null;
  targetMarker: Phaser.GameObjects.Graphics | null;
  target: UnitLocation | null;
};

type TraitDragState = {
  startX: number;
  offset: number;
  moved: boolean;
};

type TraitEntry = {
  trait: (typeof TRAITS)[keyof typeof TRAITS];
  status: { count: number; level: number; active: boolean; maxThreshold: number };
  label: string;
  width: number;
};

type AugmentHistoryEntry = {
  augment: (typeof AUGMENTS)[number];
  rounds: number[];
};

type ResultRowLayout = {
  height: number;
  portraitRadius: number;
  nameSize: number;
  detailSize: number;
};

type ResultScrollDrag = {
  team: Team;
  pointerId: number;
  grabOffsetY: number;
};

type BattleViewPointer = {
  x: number;
  y: number;
};

export type BattleViewAction = "zoomOut" | "reset" | "zoomIn";

const RESULT_VISIBLE_ROWS = 6;
const RESULT_ROW_GAP = 5;
const RESULT_ROW_LAYOUT: ResultRowLayout = {
  height: 48,
  portraitRadius: 17,
  nameSize: 10,
  detailSize: 8,
};
const RESULT_VIEWPORT_HEIGHT = RESULT_VISIBLE_ROWS * RESULT_ROW_LAYOUT.height
  + (RESULT_VISIBLE_ROWS - 1) * RESULT_ROW_GAP;

const resultMetricLabel: Record<RankingMetric, string> = {
  damage: "输出",
  support: "治疗/护盾",
  taken: "承伤",
};

const short = (value: number) => (value < 1000 ? `${Math.round(value)}` : `${(value / 1000).toFixed(1)}k`);

const BURST_GRADIENT_TEXTURE = "rift-burst-gradient";
const TITLE_GLOW_TEXTURE = "rift-title-glow";
const PROJECTILE_EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", sans-serif';

export class RiftLineScene extends Phaser.Scene {
  private readonly bridge: EngineBridge;

  private readonly fighterRenderer: FighterViewRenderer;

  private readonly projectileRenderer: ProjectileViewRenderer;

  private readonly effectRenderer: EffectViewRenderer;

  private readonly summonRenderer: SummonViewRenderer;

  private phaseLayer!: Phaser.GameObjects.Container;

  private entityLayer!: Phaser.GameObjects.Container;

  private effectsLayer!: Phaser.GameObjects.Container;

  private overlayLayer!: Phaser.GameObjects.Container;

  private tooltipLayer!: Phaser.GameObjects.Container;

  private headerLayer!: Phaser.GameObjects.Container;

  private phase = "";

  private profile: LayoutProfile = "wide";

  private fighterViews = new Map<string, Phaser.GameObjects.Container>();

  private dragState: DragState | null = null;

  private sellDropZoneGraphics: Phaser.GameObjects.Graphics | null = null;

  private sellDropZoneLabel: Phaser.GameObjects.Text | null = null;

  private traitOffset = 0;

  private traitBaseOffset = 0;

  private traitDrag: TraitDragState | null = null;

  private pinnedTooltip: UnitId | null = null;

  private textResolution = 2;

  private projectileViews = new Map<Projectile, Phaser.GameObjects.Container>();

  private effectViews = new Map<BattleEffect, Phaser.GameObjects.Container>();

  private chronosphereViews = new Map<string, Phaser.GameObjects.Container>();

  private suppressedEffectViews = new WeakSet<BattleEffect>();

  private buttonViews: Phaser.GameObjects.Container[] = [];

  private battleTimerText: Phaser.GameObjects.Text | null = null;

  private battleTimerPanel: Phaser.GameObjects.Graphics | null = null;

  private battleTimerUrgent: boolean | null = null;

  private battleBannerText: Phaser.GameObjects.Text | null = null;

  private rankingLayer: Phaser.GameObjects.Container | null = null;

  private rankingStateKey = "";

  /** 战斗统计面板展开时的刷新计时（秒） */
  private rankingRefreshAccum = 0;

  private static readonly RANKING_REFRESH_INTERVAL = 1;

  private static readonly MOBILE_TEXT_EFFECT_LIMIT = 18;

  private resultScrollOffsets: Record<Team, number> = { player: 0, enemy: 0 };

  private resultScrollDrag: ResultScrollDrag | null = null;

  private battleViewZoom = 1;

  private battleViewCenter = new Phaser.Math.Vector2(WORLD_WIDTH / 2, 392);

  private battleViewPointers = new Map<number, BattleViewPointer>();

  private battleViewPinchDistance = 0;

  private battleViewCustomized = false;

  private traitContent: Phaser.GameObjects.Container | null = null;

  private traitFade: Phaser.GameObjects.Graphics | null = null;

  private traitMinimumOffset = 0;

  private traitEntries: TraitEntry[] = [];

  constructor(bridge: EngineBridge) {
    super({ key: "RiftLineScene" });
    this.bridge = bridge;
    this.effectRenderer = new EffectViewRenderer({
      scene: this,
      text: (x, y, value, size, color, style) => this.text(x, y, value, size, color, style),
    });
    this.projectileRenderer = new ProjectileViewRenderer({
      scene: this,
      bridge,
      text: (x, y, value, size, color, style) => this.text(x, y, value, size, color, style),
    });
    this.fighterRenderer = new FighterViewRenderer({
      scene: this,
      bridge,
      isCompact: () => this.isCompact(),
      text: (x, y, value, size, color, style) => this.text(x, y, value, size, color, style),
      createPortrait: (unitId, x, y, radius, enemy) => this.createPortrait(unitId, x, y, radius, enemy),
      showUnitTooltip: (unitId, pointer, star, fighter) => this.showUnitTooltip(unitId, pointer, star, fighter),
      clearTooltip: () => this.clearTooltip(),
    });
    this.summonRenderer = new SummonViewRenderer({
      scene: this,
      text: (x, y, value, size, color, style) => this.text(x, y, value, size, color, style),
    });
  }

  preload() {
    preloadUnitPortraits(this);
  }

  create() {
    this.profile = this.profileForViewport();
    this.syncLogicalCamera();
    this.updateQuality();
    createFallbackTextures(this);
    createCircularPortraitTextures(this);
    createCircularProjectileTextures(this);
    this.createBurstGradientTexture();
    this.createTitleGlowTexture();
    this.input.setTopOnly(true);
    this.input.addPointer(2);
    this.game.canvas.addEventListener("contextmenu", this.preventContextMenu);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUpOutside, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.handlePointerWheel, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cancelDrag, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.disposeSceneInput, this);
    this.drawBackdrop();
    this.headerLayer = this.add.container(0, 0).setDepth(DEPTH.ui);
    this.phaseLayer = this.add.container(0, 0).setDepth(DEPTH.board);
    this.entityLayer = this.add.container(0, 0).setDepth(DEPTH.entities);
    this.effectsLayer = this.add.container(0, 0).setDepth(DEPTH.effects);
    this.overlayLayer = this.add.container(0, 0).setDepth(DEPTH.overlay);
    this.tooltipLayer = this.add.container(0, 0).setDepth(DEPTH.tooltip);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.keyboard?.on("keydown-R", () => {
      if (!this.bridge.enemyFormationOpen) this.dispatch({ type: "reroll" });
    });
    this.input.keyboard?.on("keydown-SPACE", () => {
      if (!this.bridge.enemyFormationOpen) this.dispatch({ type: "battle" });
    });
    this.input.keyboard?.on("keydown-D", () => this.dispatch({ type: "rankingToggle" }));
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.bridge.enemyFormationOpen) this.bridge.setEnemyFormationOpen(false);
      else if (this.pinnedTooltip) this.clearTooltip();
      else this.dispatch({ type: "clearSelection" });
    });
    this.rebuild();
  }

  update(_: number, delta: number) {
    this.bridge.update(delta / 1000);
    if (this.phase !== this.bridge.engine.state.phase) this.rebuild();
    else this.sync(delta / 1000);
  }

  public refresh() {
    if (!this.phaseLayer || !this.entityLayer || !this.effectsLayer) return;
    this.rebuild();
  }

  public adjustBattleView(action: BattleViewAction) {
    if (this.bridge.engine.state.phase !== "battle") return;
    if (action === "reset") {
      this.resetBattleView();
    } else {
      this.battleViewCustomized = true;
      const factor = action === "zoomIn" ? 1.18 : 1 / 1.18;
      this.battleViewZoom = Phaser.Math.Clamp(this.battleViewZoom * factor, 1, 2.4);
    }
    this.syncLogicalCamera();
  }

  private dispatch(action: GameAction) {
    this.bridge.dispatch(action);
    this.rebuild();
  }

  private preventContextMenu = (event: Event) => event.preventDefault();

  private disposeSceneInput() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUpOutside, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.handlePointerWheel, this);
    this.input.keyboard?.off("keydown-R");
    this.input.keyboard?.off("keydown-SPACE");
    this.input.keyboard?.off("keydown-D");
    this.input.keyboard?.off("keydown-ESC");
    this.game.canvas.removeEventListener("contextmenu", this.preventContextMenu);
  }

  private handleResize() {
    this.profile = this.profileForViewport();
    if (!this.battleViewCustomized) this.battleViewZoom = this.defaultBattleViewZoom();
    this.syncLogicalCamera();
    this.updateQuality();
    this.rebuild();
  }

  private logicalSize() {
    // Portrait preparation uses the authored mobile composition instead of
    // shrinking the 1120×720 desktop board into a postage stamp.
    if (this.isMobile() && this.bridge.engine.state.phase === "preparation") {
      return { width: 480, height: 1000 };
    }
    return logicalSizeFor();
  }

  private syncLogicalCamera() {
    const { width, height } = this.scale.baseSize;
    const logical = this.logicalSize();
    const fitScale = logical.width === WORLD_WIDTH && logical.height === WORLD_HEIGHT
      ? viewportScaleFor(width, height).fitScale
      : Math.max(0.01, Math.min(width / logical.width, height / logical.height));
    const battle = this.bridge.engine.state.phase === "battle";
    const zoom = fitScale * (battle ? this.battleViewZoom : 1);
    const center = battle ? this.clampBattleViewCenter(this.battleViewCenter.x, this.battleViewCenter.y, zoom) : new Phaser.Math.Vector2(logical.width / 2, logical.height / 2);
    if (battle) this.battleViewCenter.copy(center);
    this.cameras.main
      .setViewport(0, 0, width, height)
      .setZoom(zoom)
      .centerOn(center.x, center.y);
    this.game.canvas.dataset.battleViewZoom = battle ? this.battleViewZoom.toFixed(3) : "1.000";
    this.game.canvas.dataset.battleViewCenter = battle
      ? `${this.battleViewCenter.x.toFixed(1)},${this.battleViewCenter.y.toFixed(1)}`
      : `${center.x.toFixed(1)},${center.y.toFixed(1)}`;
  }

  private profileForViewport() {
    const { width, height } = this.scale.parentSize;
    return profileFor(width || this.scale.displaySize.width, height || this.scale.displaySize.height);
  }

  private logicalPointer(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
  }

  private isMobile() {
    const { width, height } = this.scale.parentSize;
    return Boolean(width && height && height > width * 1.12);
  }

  private isLandscapePhone() {
    const { width, height } = this.scale.parentSize;
    return Boolean(width && height && width > height * 1.25 && height <= 700);
  }

  private isMobileSizedViewport() {
    const { width, height } = this.scale.parentSize;
    return Math.min(width, height) <= 700 && Math.max(width, height) <= 1200;
  }

  private defaultBattleViewZoom() {
    return this.isLandscapePhone() ? 1.18 : 1;
  }

  private resetBattleView() {
    this.battleViewCustomized = false;
    this.battleViewZoom = this.defaultBattleViewZoom();
    this.battleViewCenter.set(WORLD_WIDTH / 2, 392);
    this.battleViewPointers.clear();
    this.battleViewPinchDistance = 0;
  }

  private clampBattleViewCenter(x: number, y: number, zoom = this.cameras.main.zoom) {
    const { width, height } = this.scale.baseSize;
    const halfWidth = width / Math.max(zoom, 0.01) / 2;
    const halfHeight = height / Math.max(zoom, 0.01) / 2;
    const minX = halfWidth >= WORLD_WIDTH / 2 ? WORLD_WIDTH / 2 : halfWidth;
    const maxX = halfWidth >= WORLD_WIDTH / 2 ? WORLD_WIDTH / 2 : WORLD_WIDTH - halfWidth;
    const minY = halfHeight >= WORLD_HEIGHT / 2 ? WORLD_HEIGHT / 2 : halfHeight;
    const maxY = halfHeight >= WORLD_HEIGHT / 2 ? WORLD_HEIGHT / 2 : WORLD_HEIGHT - halfHeight;
    return new Phaser.Math.Vector2(
      Phaser.Math.Clamp(x, minX, maxX),
      Phaser.Math.Clamp(y, minY, maxY),
    );
  }

  private isCompact() {
    return this.profile !== "wide";
  }

  private traitStrip() {
    return this.isMobile() ? MOBILE_TRAIT_STRIP : this.isCompact() ? COMPACT_TRAIT_STRIP : WIDE_TRAIT_STRIP;
  }

  private resetLayers() {
    this.cancelDrag();
    [this.phaseLayer, this.entityLayer, this.effectsLayer, this.overlayLayer, this.tooltipLayer].forEach((layer) => layer.setPosition(0, 0).setScale(1));
    this.phaseLayer.removeAll(true);
    this.entityLayer.removeAll(true);
    this.effectsLayer.removeAll(true);
    this.overlayLayer.removeAll(true);
    this.tooltipLayer.removeAll(true);
    this.headerLayer.removeAll(true);
    this.fighterViews.clear();
    this.projectileViews.clear();
    this.projectileRenderer.reset();
    this.effectViews.clear();
    this.effectRenderer.reset();
    this.chronosphereViews.clear();
    this.summonRenderer.reset();
    this.buttonViews.forEach((button) => button.destroy());
    this.buttonViews = [];
    this.battleTimerText = null;
    this.battleTimerPanel = null;
    this.battleTimerUrgent = null;
    this.battleBannerText = null;
    this.rankingLayer = null;
    this.rankingStateKey = "";
    this.rankingRefreshAccum = 0;
    this.traitContent = null;
    this.traitFade = null;
    this.traitEntries = [];
    this.traitBaseOffset = 0;
    this.pinnedTooltip = null;
    this.sellDropZoneGraphics = null;
    this.sellDropZoneLabel = null;
  }

  private rebuild() {
    const nextPhase = this.bridge.engine.state.phase;
    if (nextPhase !== this.phase) {
      this.stopResultScrollDrag();
      this.battleViewPointers.clear();
      this.battleViewPinchDistance = 0;
      if (nextPhase === "battle") this.resetBattleView();
      if (nextPhase === "result" || this.phase === "result") {
        this.resultScrollOffsets = { player: 0, enemy: 0 };
      }
    }
    this.profile = this.profileForViewport();
    this.syncLogicalCamera();
    this.resetLayers();
    this.phase = nextPhase;
    // The desktop preparation stage keeps its established Phaser composition:
    // slot hit areas, enemy hover tooltips, trait activation, shop highlights and
    // drag/drop all share the same logical frame. Portrait uses DOM sheets.
    if (this.phase === "preparation") {
      if (this.isMobile()) this.drawMobilePreparation();
      else this.drawPreparation();
    }
    if (this.phase === "battle") this.drawBattle();
    if (this.phase === "result") {
      this.drawBattle();
      this.drawResult();
    }
    if (this.phase === "augment") this.drawAugments();
    this.drawToast();
  }

  private sync(deltaSec = 0) {
    if (this.phase === "battle") {
      this.syncBattleEntities();
      this.syncCombatEffects();
      this.syncBattleOverlay(deltaSec);
    }
    this.syncToast();
  }

  private drawBackdrop() {
    const logical = this.logicalSize();
    const graphics = this.add.graphics().setDepth(DEPTH.backdrop);
    graphics.fillGradientStyle(0x07121d, 0x0b1825, 0x160f20, 0x0b1825, 1);
    graphics.fillRect(0, 0, logical.width, logical.height);
    this.add.image(logical.width / 2, 294, TITLE_GLOW_TEXTURE).setDepth(DEPTH.backdrop + 1).setDisplaySize(930, 540).setAlpha(0.72);
    for (let index = 0; index < 56; index += 1) {
      const x = (index * 193 + 47) % logical.width;
      const y = (index * 83 + 29) % logical.height;
      const star = this.add.circle(x, y, index % 5 === 0 ? 2 : 1, index % 3 ? TITLE.starCyan : TITLE.starLilac, 0.16 + (index % 4) * 0.05).setDepth(DEPTH.backdrop + 2);
      this.tweens.add({
        targets: star,
        alpha: Math.min(0.55, star.alpha + 0.22),
        duration: 1700 + (index % 5) * 320,
        delay: (index % 7) * 140,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private updateQuality() {
    // DPR sharpens text textures only; authored card geometry remains unchanged.
    const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    const maximumResolution = this.isMobileSizedViewport() ? MAX_MOBILE_TEXT_RESOLUTION : MAX_TEXT_RESOLUTION;
    this.textResolution = Math.min(maximumResolution, Math.ceil(devicePixelRatio));
  }

  private text(x: number, y: number, value: string, size = 14, color = COLORS.text, style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
    return this.add.text(x, y, value, {
      fontFamily: FONT_FAMILY,
      fontSize: `${size}px`,
      color,
      resolution: this.textResolution,
      ...style,
    });
  }

  private truncateText(value: string, maxWidth: number, size: number, style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
    const measure = this.text(0, 0, value, size, COLORS.text, style).setVisible(false);
    if (measure.width <= maxWidth) {
      measure.destroy();
      return value;
    }
    const ellipsis = "…";
    let result = "";
    for (const character of value) {
      measure.setText(`${result}${character}${ellipsis}`);
      if (measure.width > maxWidth) break;
      result += character;
    }
    measure.destroy();
    return result ? `${result}${ellipsis}` : ellipsis;
  }

  private boundedText(value: string, maxWidth: number, maxLines: number, size: number, color: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
    const wrapStyle = { ...style, wordWrap: { width: maxWidth, useAdvancedWrap: true } };
    const probe = this.text(0, 0, value, size, color, wrapStyle).setVisible(false);
    const lines = probe.getWrappedText(value);
    probe.destroy();
    const bounded = lines.length <= maxLines
      ? lines
      : [...lines.slice(0, maxLines - 1), this.truncateText(lines.slice(maxLines - 1).join(""), maxWidth, size, style)];
    return this.text(0, 0, bounded.join("\n"), size, color, style);
  }

  private panel(x: number, y: number, width: number, height: number, color = COLORS.panel, alpha = 0.96, border = COLORS.border) {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, alpha);
    graphics.fillRoundedRect(x, y, width, height, 14);
    graphics.lineStyle(1, border, 0.8);
    graphics.strokeRoundedRect(x, y, width, height, 14);
    return graphics;
  }

  private button(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: GameAction | undefined,
    options: ButtonOptions = {},
    depth = DEPTH.ui,
    onPress?: () => void,
  ) {
    const { tone = "neutral", enabled = true, hoverLabel, selected = false, secondary } = options;
    const palette = BUTTONS[enabled ? tone : "disabled"];
    const container = this.add.container(x, y).setDepth(depth);
    const graphics = this.add.graphics();
    const labelText = this.text(width / 2, secondary ? height / 2 - 5 : height / 2, label, 12, palette.text, { fontStyle: "bold" }).setOrigin(0.5);
    const secondaryText = secondary
      ? this.text(width / 2, height / 2 + 10, secondary, 8, palette.text, { fontStyle: "bold" }).setOrigin(0.5)
      : null;
    const draw = (hover = false) => {
      const fill = hover && enabled ? palette.hover : palette.fill;
      graphics.clear();
      graphics.fillStyle(fill, 1);
      graphics.fillRoundedRect(0, 0, width, height, 10);
      graphics.lineStyle(selected ? 2 : 1, palette.border, selected ? 1 : hover && enabled ? 0.95 : 0.65);
      graphics.strokeRoundedRect(0, 0, width, height, 10);
      labelText.setText(hover && enabled && hoverLabel ? hoverLabel : label).setColor(hover && enabled ? palette.hoverText : palette.text);
      secondaryText?.setColor(hover && enabled ? palette.hoverText : palette.text);
    };
    draw();
    const zone = this.add.zone(width / 2, height / 2, width, height).setInteractive({ useHandCursor: enabled });
    if (enabled) {
      zone.on(Phaser.Input.Events.POINTER_DOWN, () => {
        if (onPress) onPress();
        else if (action) this.dispatch(action);
      });
      zone.on(Phaser.Input.Events.POINTER_OVER, () => draw(true));
      zone.on(Phaser.Input.Events.POINTER_OUT, () => draw(false));
    }
    container.add([graphics, labelText, ...(secondaryText ? [secondaryText] : []), zone]);
    this.buttonViews.push(container);
    return container;
  }

  private drawPreparationPanel(x: number, y: number, width: number, height: number) {
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x132736, 0x132736, 0x101929, 0x101929, 0.94);
    graphics.fillRoundedRect(x, y, width, height, 18);
    graphics.lineStyle(1, 0x66b6e0, 0.25).strokeRoundedRect(x, y, width, height, 18);
    return graphics;
  }

  private drawPreparation() {
    const { engine } = this.bridge;
    const { state, currentWave } = engine;
    const compact = this.isCompact();
    const mode = progressionModeForRound(state.round);
    this.phaseLayer.add(this.drawPreparationPanel(PREPARATION_BOARD_PANEL.x, PREPARATION_BOARD_PANEL.y, PREPARATION_BOARD_PANEL.width, PREPARATION_BOARD_PANEL.height));
    const waveLabel = currentWave.tag === "boss" ? "BOSS WARNING" : currentWave.tag === "elite" ? "ELITE WARNING" : mode === "hell" ? `HELL ${currentWave.round}` : `WAVE ${currentWave.round}`;
    const waveColor = currentWave.tag === "boss" ? "#ff8ba7" : currentWave.tag === "elite" ? "#ffc35b" : "#72d8ff";
    this.phaseLayer.add(this.text(48, 116, waveLabel, 10, waveColor, { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(48, 136, this.truncateText(currentWave.name, compact ? 680 : 470, 20, { fontStyle: "bold" }), 20, "#f1f7ff", { fontStyle: "bold" }));
    const description = this.boundedText(currentWave.description, compact ? 680 : 470, 2, 11, "#91aab9", { lineSpacing: 2 });
    description.setPosition(48, 158);
    this.phaseLayer.add(description);
    if (!compact) {
      const pressureLabel = `敌军 ${currentWave.units.length} 人 · 价值约 ${enemyBudgetForRound(state.round)}`;
      this.phaseLayer.add(this.text(536, 124, pressureLabel, 9, currentWave.tag === "normal" ? "#e89aaa" : waveColor, { fontStyle: "bold" }));
      this.button(682, 112, 74, 25, "▦ 站位", undefined, {
        tone: currentWave.tag === "normal" ? "neutral" : "danger",
        hoverLabel: "查看站位",
      }, DEPTH.ui, () => this.bridge.setEnemyFormationOpen(true)).setName("enemy-formation-trigger-desktop");
      this.drawEnemyTraitPreview(currentWave.units);
      currentWave.units.slice(0, 7).forEach((waveUnit, index) => {
        const x = 554 + index * 29;
        const star = waveUnit.star ?? 1;
        const portrait = this.createPortrait(waveUnit.id, x, 165, 12, true);
        const zone = this.add.zone(x, 165, 28, 28)
          .setName(`enemy-preview-${index}`)
          .setInteractive({ useHandCursor: true });
        zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(waveUnit.id, pointer, star));
        zone.on(Phaser.Input.Events.POINTER_OUT, () => this.clearTooltip());
        this.phaseLayer.add([portrait, zone]);
      });
    }
    this.drawTraits();
    this.drawTalentHistory(compact);
    if (!compact) {
      this.phaseLayer.add(this.text(48, 225, "后方 · 远程与辅助", 9, "#6f9eb8", { fontStyle: "bold" }).setOrigin(0, 0.5));
      this.phaseLayer.add(this.text(390, 225, `6 × 4 自由部署区 · 满级 ${PLAYER_LEVEL_CONFIG[MAX_PLAYER_LEVEL].boardCap} 人口`, 9, "#63849b").setOrigin(0.5));
      this.phaseLayer.add(this.text(756, 225, "前线 · 优先接敌 →", 9, "#78b8d2", { fontStyle: "bold" }).setOrigin(1, 0.5));
      this.phaseLayer.add(this.drawPreparationPanel(PREPARATION_BENCH_PANEL.x, PREPARATION_BENCH_PANEL.y, PREPARATION_BENCH_PANEL.width, PREPARATION_BENCH_PANEL.height));
      this.drawSellDropZone();
      // 备战席计数在出售按钮左侧；上阵人口右对齐到出售按钮前，避免被挡住
      this.phaseLayer.add(this.text(48, 570, `备战席  ${state.bench.filter(Boolean).length}/${state.bench.length}`, 12, "#9cb3c3"));
      const boardCapFull = engine.boardCount === engine.boardCap;
      this.phaseLayer.add(this.text(492, 570, `${bookLevelForPlayerLevel(state.playerLevel)} 本 · 上阵 ${engine.boardCount}/${engine.boardCap}`, 11, boardCapFull ? "#ffd166" : "#72d8ff"));
    }
    state.board.forEach((unit, index) => this.drawSlot("board", index, unit, compact));
    state.bench.forEach((unit, index) => this.drawSlot("bench", index, unit, compact));
    // The React HUD owns the desktop shop now. Keeping the legacy Phaser shop
    // and action row here would render duplicate controls at wide browser sizes.
  }

  private drawSellDropZone() {
    const { x, y, width, height } = PREPARATION_SELL_ZONE;
    const graphics = this.add.graphics();
    const label = this.text(x + width / 2, y + height / 2, "拖到这里出售", 10, "#d68b9d", { fontStyle: "bold" }).setOrigin(0.5);
    this.phaseLayer.add([graphics, label]);
    this.sellDropZoneGraphics = graphics;
    this.sellDropZoneLabel = label;
    this.updateSellDropZone(false);
  }

  private updateSellDropZone(active: boolean, unit?: OwnedUnit) {
    if (!this.sellDropZoneGraphics || !this.sellDropZoneLabel) return;
    const { x, y, width, height } = PREPARATION_SELL_ZONE;
    const refund = unit ? this.refundForUnit(unit) : 0;
    this.sellDropZoneGraphics.clear();
    const dragging = Boolean(unit);
    this.sellDropZoneGraphics.fillStyle(active ? 0xa73e56 : dragging ? 0x5d2736 : 0x3a1d2a, active ? 0.46 : dragging ? 0.38 : 0.58).fillRoundedRect(x, y, width, height, 8);
    this.sellDropZoneGraphics.lineStyle(active ? 2 : dragging ? 1.5 : 1, active ? 0xff8fa5 : dragging ? 0xd86c83 : 0x8b4c60, active ? 0.98 : dragging ? 0.86 : 0.72).strokeRoundedRect(x, y, width, height, 8);
    this.sellDropZoneLabel.setText(active ? `松开出售 +${refund} 金币` : dragging ? `出售 +${refund} 金币` : "拖到这里出售").setColor(active || dragging ? "#fff0f3" : "#d68b9d");
  }

  private drawMobilePreparation() {
    const { engine } = this.bridge;
    const { state, currentWave } = engine;
    const mode = progressionModeForRound(state.round);
    this.phaseLayer.add(this.drawPreparationPanel(MOBILE_BOARD_PANEL.x, MOBILE_BOARD_PANEL.y, MOBILE_BOARD_PANEL.width, MOBILE_BOARD_PANEL.height));
    this.phaseLayer.add(this.drawPreparationPanel(MOBILE_BENCH_PANEL.x, MOBILE_BENCH_PANEL.y, MOBILE_BENCH_PANEL.width, MOBILE_BENCH_PANEL.height));
    const waveLabel = currentWave.tag === "boss" ? "BOSS WARNING" : currentWave.tag === "elite" ? "ELITE WARNING" : mode === "hell" ? `HELL ${currentWave.round}` : `WAVE ${currentWave.round}`;
    const waveColor = currentWave.tag === "boss" ? "#ff8ba7" : currentWave.tag === "elite" ? "#ffc35b" : "#72d8ff";
    this.phaseLayer.add(this.text(16, 108, `${waveLabel} · ${this.truncateText(currentWave.name, 242, 14, { fontStyle: "bold" })}`, 14, waveColor, { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(338, 108, `敌军 ${currentWave.units.length} · 价值 ${enemyBudgetForRound(state.round)}`, 11, waveColor, { fontStyle: "bold" }).setOrigin(1, 0));
    this.button(354, 96, 110, 26, "▦ 敌方站位", undefined, {
      tone: currentWave.tag === "normal" ? "neutral" : "danger",
    }, DEPTH.ui, () => this.bridge.setEnemyFormationOpen(true)).setName("enemy-formation-trigger-mobile");
    this.drawTraits();
    this.phaseLayer.add(this.text(24, 178, `部署区 · ${engine.boardCount}/${engine.boardCap}`, 12, "#8ce8bd", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(24, 434, `备战席 · ${state.bench.filter(Boolean).length}/${state.bench.length}`, 12, "#9cb3c3", { fontStyle: "bold" }));
    state.board.forEach((unit, index) => this.drawSlot("board", index, unit, true));
    state.bench.forEach((unit, index) => this.drawSlot("bench", index, unit, true));
  }

  private drawEnemyTraitPreview(units: readonly WaveUnit[]) {
    const activations = enemyTraitActivations(units);
    const values = activations.map(({ id, level }) => `${TRAITS[id].name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][level]}`);
    const measuredWidth = (size: number) => {
      const labels = ["敌方羁绊", ...values];
      const width = labels.reduce((total, value) => {
        const probe = this.text(0, 0, value, size, "#ffffff", { fontStyle: "bold" }).setVisible(false);
        const next = total + probe.width;
        probe.destroy();
        return next;
      }, 0);
      return width + Math.max(0, labels.length - 1) * 7;
    };
    const size = measuredWidth(8) <= 214 ? 8 : 7;
    const heading = this.text(536, 139, "敌方羁绊", size, "#a889c7", { fontStyle: "bold" });
    this.phaseLayer.add(heading);
    if (!activations.length) {
      this.phaseLayer.add(this.text(536 + heading.width + 7, 139, "未成型", size, "#786b88", { fontStyle: "bold" }));
      return;
    }
    let x = 536 + heading.width + 7;
    activations.forEach(({ id, count, level }) => {
      const trait = TRAITS[id];
      const value = `${trait.name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][level]}`;
      const label = this.text(x, 139, value, size, trait.color, { fontStyle: "bold" }).setAlpha(0.88);
      const zone = this.add.zone(x + label.width / 2, 145, label.width + 5, 16)
        .setName(`enemy-trait-${id}`)
        .setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
        label.setAlpha(1).setScale(1.04);
        this.showEnemyTraitTooltip(id, count, level, pointer);
      });
      zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.showEnemyTraitTooltip(id, count, level, pointer));
      zone.on(Phaser.Input.Events.POINTER_OUT, () => {
        label.setAlpha(0.88).setScale(1);
        if (!this.isCompact()) this.clearTooltip();
      });
      this.phaseLayer.add([label, zone]);
      x += label.width + 7;
    });
  }

  private drawTalentHistory(compact: boolean) {
    const history = this.bridge.engine.state.augmentHistory.reduce<AugmentHistoryEntry[]>((entries, selection) => {
      const augment = AUGMENTS.find((item) => item.id === selection.id);
      if (!augment) return entries;
      const existing = entries.find((entry) => entry.augment.id === augment.id);
      if (existing) existing.rounds.push(selection.round);
      else entries.push({ augment, rounds: [selection.round] });
      return entries;
    }, []);
    const labelX = compact ? 744 : 156;
    const iconStartX = compact ? 790 : 190;
    const y = 123;
    const starterSelection = this.bridge.engine.state.starterHistory[0];
    const starter = starterSelection ? STARTERS.find((item) => item.id === starterSelection.id) : null;
    if (!starter && !history.length) {
      this.phaseLayer.add(this.text(labelX, 116, "天赋 · 选择开局后记录", 8, "#607f91", { fontStyle: "bold" }));
      return;
    }
    this.phaseLayer.add(this.text(labelX, 116, "天赋", 8, "#7898aa", { fontStyle: "bold" }));
    if (starter) {
      const { color } = Phaser.Display.Color.HexStringToColor(starter.color);
      const container = this.add.container(iconStartX, y);
      const backplate = this.add.graphics();
      const drawBackplate = (hover = false) => {
        const radius = hover ? 10 : 9;
        const points = Array.from({ length: 6 }, (_, index) => {
          const angle = (-Math.PI / 2) + ((index * Math.PI) / 3);
          return new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
        });
        backplate.clear();
        backplate.fillStyle(color, hover ? 0.34 : 0.18);
        backplate.lineStyle(hover ? 2 : 1, color, hover ? 1 : 0.86);
        backplate.fillPoints(points, true).strokePoints(points, true);
      };
      drawBackplate();
      const icon = this.text(0, 0, starter.icon, 10, "#ffffff", {
        fontFamily: PROJECTILE_EMOJI_FONT,
        fontStyle: "bold",
      }).setOrigin(0.5);
      const zone = this.add.zone(0, 0, 22, 22)
        .setName(`starter-history-${starter.id}`)
        .setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
        drawBackplate(true);
        container.setScale(1.08);
        this.showStarterTooltip(starter, pointer);
      });
      zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.showStarterTooltip(starter, pointer));
      zone.on(Phaser.Input.Events.POINTER_OUT, () => {
        drawBackplate(false);
        container.setScale(1);
        if (!this.isCompact()) this.clearTooltip();
      });
      container.add([backplate, icon, zone]);
      this.phaseLayer.add(container);
    }
    const augmentStartX = iconStartX + (starter ? 28 : 0);
    history.forEach((entry, index) => {
      const { augment, rounds } = entry;
      const { color } = Phaser.Display.Color.HexStringToColor(augment.color);
      const container = this.add.container(augmentStartX + index * 24, y);
      const backplate = this.add.graphics();
      const drawBackplate = (hover = false) => {
        backplate.clear();
        backplate.fillStyle(color, hover ? 0.34 : 0.18);
        backplate.lineStyle(hover ? 2 : 1, color, hover ? 1 : 0.82);
        if (augment.tier === "major") {
          const radius = hover ? 10 : 9;
          const points = [
            new Phaser.Math.Vector2(0, -radius),
            new Phaser.Math.Vector2(radius, 0),
            new Phaser.Math.Vector2(0, radius),
            new Phaser.Math.Vector2(-radius, 0),
          ];
          backplate.fillPoints(points, true).strokePoints(points, true);
        } else {
          backplate.fillCircle(0, 0, hover ? 10 : 9).strokeCircle(0, 0, hover ? 10 : 9);
        }
      };
      drawBackplate();
      const icon = this.text(0, 0, augment.icon, 10, "#ffffff", {
        fontFamily: PROJECTILE_EMOJI_FONT,
        fontStyle: "bold",
      }).setOrigin(0.5);
      const zone = this.add.zone(0, 0, 22, 22)
        .setName(`augment-history-${augment.id}`)
        .setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
        drawBackplate(true);
        container.setScale(1.08);
        this.showAugmentTooltip(entry, pointer);
      });
      zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.showAugmentTooltip(entry, pointer));
      zone.on(Phaser.Input.Events.POINTER_OUT, () => {
        drawBackplate(false);
        container.setScale(1);
        if (!this.isCompact()) this.clearTooltip();
      });
      container.add([backplate, icon, zone]);
      if (rounds.length > 1) {
        container.add([
          this.add.circle(7, -7, 5, 0x07111b, 1).setStrokeStyle(1, color, 0.9),
          this.text(7, -7, `${rounds.length}`, 6, "#f4fbff", { fontStyle: "bold" }).setOrigin(0.5),
        ]);
      }
      this.phaseLayer.add(container);
    });
  }

  private drawTraits() {
    const strip = this.traitStrip();
    const traits = Object.entries(this.bridge.engine.getTraitCounts())
      .filter(([, count]) => count > 0)
      .map(([id, count]) => {
        const trait = TRAITS[id as keyof typeof TRAITS];
        return { trait, count, status: this.bridge.engine.getTraitStatus(trait.id) };
      })
      .sort((left, right) => (
        Number(right.status.active) - Number(left.status.active)
        || right.status.level - left.status.level
        || left.trait.name.localeCompare(right.trait.name, "zh-CN")
      ));
    this.traitEntries = traits.map(({ trait, count, status }) => {
      const nextThreshold = trait.thresholds.find((threshold) => threshold > count) ?? status.maxThreshold;
      const label = `${trait.name} ${count}/${nextThreshold}${status.active ? "" : " !"}`;
      const probe = this.text(0, 0, label, 10, "#ffffff", { fontStyle: "bold" }).setVisible(false);
      const width = Math.min(95, Math.max(64, Math.ceil(probe.width) + 26));
      probe.destroy();
      return { trait, status, label, width };
    });
    const gap = 6;
    const contentWidth = Math.max(0, this.traitEntries.reduce((total, entry) => total + entry.width + gap, 0) - gap);
    this.traitMinimumOffset = Math.min(0, strip.width - contentWidth);
    this.traitOffset = Phaser.Math.Clamp(this.traitOffset, this.traitMinimumOffset, 0);
    this.traitBaseOffset = contentWidth < strip.width ? (strip.width - contentWidth) / 2 : 0;

    const maskGraphics = this.add.graphics();
    maskGraphics.fillStyle(0xffffff).fillRect(strip.x, strip.y, strip.width, strip.height);
    this.children.remove(maskGraphics);
    const content = this.add.container(strip.x + this.traitBaseOffset + this.traitOffset, strip.y);
    if (this.renderer.type === Phaser.CANVAS) {
      content.setMask(maskGraphics.createGeometryMask());
    } else {
      content.enableFilters().filters!.external.addMask(maskGraphics, false, this.cameras.main, "world");
    }
    let cursor = 0;
    this.traitEntries.forEach(({ trait, status, label, width }) => {
      const { color } = Phaser.Display.Color.HexStringToColor(trait.color);
      const graphics = this.add.graphics();
      graphics.fillStyle(status.active ? color : 0x142735, status.active ? 0.24 : 0.96);
      graphics.fillRoundedRect(cursor, 0, width, strip.height, 12);
      graphics.lineStyle(1, status.active ? color : 0x395467, status.active ? 0.9 : 1);
      graphics.strokeRoundedRect(cursor, 0, width, strip.height, 12);
      content.add([
        graphics,
        this.add.circle(cursor + 12, strip.height / 2, 3, color, status.active ? 1 : 0.72),
        this.text(cursor + 21, 7, label, 10, status.active ? "#effaff" : "#7f96a6", { fontStyle: "bold" }),
      ]);
      cursor += width + gap;
    });
    this.traitContent = content;
    const zone = this.add.zone(strip.x + strip.width / 2, strip.y + strip.height / 2, strip.width, strip.height).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.updateTraitTooltip(pointer));
    zone.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!this.traitDrag?.moved) this.updateTraitTooltip(pointer);
    });
    zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.clearTooltip();
      this.traitDrag = { startX: this.logicalPointer(pointer).x, offset: this.traitOffset, moved: false };
    });
    zone.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (!this.traitDrag?.moved) this.updateTraitTooltip(pointer);
      this.traitDrag = null;
    });
    zone.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!this.isCompact() && !this.traitDrag) this.clearTooltip();
    });
    this.phaseLayer.add([content, zone]);
    this.updateTraitViewport();
  }

  private traitEntryAt<T extends { width: number }>(entries: T[], gap: number, strip: { x: number; width: number }, pointerX: number) {
    const localX = pointerX - strip.x - this.traitBaseOffset - this.traitOffset;
    let cursor = 0;
    return entries.find((entry) => {
      const hit = localX >= cursor && localX <= cursor + entry.width;
      cursor += entry.width + gap;
      return hit;
    });
  }

  private updateTraitViewport() {
    const strip = this.traitStrip();
    this.traitContent?.setX(strip.x + this.traitBaseOffset + this.traitOffset);
    this.traitFade?.destroy();
    this.traitFade = null;
    if (this.traitMinimumOffset === 0) return;
    const fade = this.add.graphics();
    if (this.traitOffset < 0) fade.fillGradientStyle(0x132736, 0x132736, 0x132736, 0x132736, 0, 0.9, 0, 0.9).fillRect(strip.x, strip.y, 20, strip.height);
    if (this.traitOffset > this.traitMinimumOffset) fade.fillGradientStyle(0x132736, 0x132736, 0x132736, 0x132736, 0.9, 0, 0.9, 0).fillRect(strip.x + strip.width - 20, strip.y, 20, strip.height);
    this.traitFade = fade;
    this.phaseLayer.add(fade);
  }

  private updateTraitTooltip(pointer: Phaser.Input.Pointer) {
    const strip = this.traitStrip();
    const trait = this.traitEntryAt(this.traitEntries, 6, strip, this.logicalPointer(pointer).x);
    if (trait) this.showTraitTooltip(trait.trait.id, pointer);
  }

  private drawSlot(zone: UnitLocation["zone"], index: number, unit: OwnedUnit | null | undefined, compact: boolean) {
    const rect = this.slotRect({ zone, index }, compact);
    const selected = this.bridge.engine.state.selected?.zone === zone && this.bridge.engine.state.selected.index === index;
    const draggingSource = this.dragState && this.sameLocation(this.dragState.origin, { zone, index });
    const draggingTarget = this.dragState?.target && this.sameLocation(this.dragState.target, { zone, index });
    const isBench = zone === "bench";
    const graphics = this.add.graphics();
    const baseFill = isBench ? 0x0c1b27 : 0x07121c;
    const baseAlpha = isBench ? 0.75 : 0.48;
    graphics.fillStyle(draggingSource ? 0x153b4a : draggingTarget ? 0x1a4b3b : baseFill, draggingSource ? 0.5 : baseAlpha);
    graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 10);
    graphics.lineStyle(selected || draggingTarget ? 2 : 1, draggingTarget ? 0x77e8b4 : selected ? 0x7de2ff : isBench ? 0x223d4f : 0x223d50, 1);
    graphics.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 10);
    if (!unit && !isBench) {
      graphics.lineStyle(1, 0x64b4e1, 0.08).lineBetween(rect.x + 12, rect.y + rect.height / 2, rect.x + rect.width - 12, rect.y + rect.height / 2);
      graphics.fillStyle(0x29465a, 0.8).fillCircle(rect.x + rect.width / 2, rect.y + rect.height / 2, 2);
    }
    const slot = this.add.zone(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height).setInteractive({ useHandCursor: true });
    const location = { zone, index } as UnitLocation;
    slot.setData("slot", location);
    slot.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        if (unit) this.dispatch({ type: "sell", location });
        return;
      }
      if (!unit) {
        this.dispatch({ type: "slot", location });
        return;
      }
      const logical = this.logicalPointer(pointer);
      this.dragState = { origin: location, unit, pointerId: pointer.id, startX: logical.x, startY: logical.y, active: false, ghost: null, targetMarker: null, target: null };
    });
    slot.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
      if (unit && !this.dragState) this.showUnitTooltip(unit.id, pointer, unit.star, undefined, unit);
    });
    slot.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!this.isCompact() && !this.dragState) this.clearTooltip();
    });
    this.phaseLayer.add([graphics, slot]);
    if (!unit) {
      if (isBench) this.phaseLayer.add(this.text(rect.x + rect.width / 2, rect.y + rect.height / 2, "空", 13, "#426176").setOrigin(0.5));
      return;
    }
    const definition = UNIT_DEFS[unit.id];
    const slotLayout = occupiedSlotLayout(rect, isBench, compact);
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontStyle: "bold",
      stroke: COLORS.slotTextStroke,
      strokeThickness: 1,
      shadow: { color: "#000000", blur: 1, offsetY: 1, fill: true, stroke: true },
    };
    const starColor = unit.star === 3 ? "#ffdc68" : unit.star === 2 ? "#8ee9ff" : "#8ba1b2";
    const portrait = this.createPortrait(unit.id, rect.x + rect.width / 2, slotLayout.portraitY, slotLayout.portraitRadius);
    const stars = this.text(rect.x + rect.width / 2, slotLayout.starY + slotLayout.starHeight / 2, "★".repeat(unit.star), compact ? 9 : 10, starColor, textStyle).setOrigin(0.5);
    const name = this.text(
      rect.x + rect.width / 2,
      slotLayout.nameY,
      this.truncateText(definition.name, slotLayout.nameWidth, compact ? 10 : 9, textStyle),
      compact ? 10 : 9,
      "#e5f4ff",
      textStyle,
    ).setOrigin(0.5, 0.5);
    const value = isBench ? this.bridge.engine.getUnitSellValue(unit) : 0;
    const valueColor = value > 5 ? COLORS.gold : "#b7a271";
    const valueLabel = isBench
      ? this.text(
        compact ? rect.x + rect.width - 7 : rect.x + rect.width / 2,
        compact ? rect.y + 8 : rect.y + 51,
        `● ${value}`,
        compact ? 8 : 9,
        valueColor,
        { ...textStyle, strokeThickness: value > 5 ? 2 : 1 },
      ).setOrigin(compact ? 1 : 0.5, 0.5)
      : null;
    this.phaseLayer.add(valueLabel ? [portrait, stars, name, valueLabel] : [portrait, stars, name]);
  }

  private slotRect(location: UnitLocation, compact = this.isCompact()) {
    if (this.isMobile()) return location.zone === "board" ? mobileBoardSlot(location.index) : mobileBenchSlot(location.index);
    if (compact) return location.zone === "board" ? compactBoardSlot(location.index) : compactBenchSlot(location.index);
    return location.zone === "board" ? boardSlot(location.index) : benchSlot(location.index);
  }

  private unitAt(location: UnitLocation) {
    return location.zone === "board"
      ? this.bridge.engine.state.board[location.index]
      : this.bridge.engine.state.bench[location.index];
  }

  private sameLocation(a: UnitLocation, b: UnitLocation) {
    return a.zone === b.zone && a.index === b.index;
  }

  private locationAt(x: number, y: number) {
    const locations = [
      ...Array.from({ length: this.bridge.engine.state.board.length }, (_, index) => ({ zone: "board" as const, index })),
      ...Array.from({ length: this.bridge.engine.state.bench.length }, (_, index) => ({ zone: "bench" as const, index })),
    ];
    return locations.find((location) => {
      const rect = this.slotRect(location);
      return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    }) ?? null;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (this.phase !== "battle" || !pointer.isDown) return;
    this.battleViewPointers.set(pointer.id, { x: pointer.x, y: pointer.y });
    if (this.battleViewPointers.size >= 2) {
      const [first, second] = Array.from(this.battleViewPointers.values());
      this.battleViewPinchDistance = Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y);
    }
  }

  private handleBattleViewPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.phase !== "battle" || !pointer.isDown || !this.battleViewPointers.has(pointer.id)) return false;
    const previous = this.battleViewPointers.get(pointer.id)!;
    const next = { x: pointer.x, y: pointer.y };
    this.battleViewPointers.set(pointer.id, next);
    if (this.battleViewPointers.size >= 2) {
      const [first, second] = Array.from(this.battleViewPointers.values());
      const distance = Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y);
      if (this.battleViewPinchDistance > 1 && distance > 1) {
        this.battleViewCustomized = true;
        this.battleViewZoom = Phaser.Math.Clamp(
          this.battleViewZoom * (distance / this.battleViewPinchDistance),
          1,
          2.4,
        );
        this.syncLogicalCamera();
        this.clearTooltip();
      }
      this.battleViewPinchDistance = distance;
      return true;
    }
    const deltaX = next.x - previous.x;
    const deltaY = next.y - previous.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) < 0.5) return true;
    this.battleViewCustomized = true;
    const nextCenter = this.clampBattleViewCenter(
      this.battleViewCenter.x - deltaX / Math.max(this.cameras.main.zoom, 0.01),
      this.battleViewCenter.y - deltaY / Math.max(this.cameras.main.zoom, 0.01),
    );
    this.battleViewCenter.copy(nextCenter);
    this.syncLogicalCamera();
    this.clearTooltip();
    return true;
  }

  private releaseBattleViewPointer(pointer: Phaser.Input.Pointer) {
    this.battleViewPointers.delete(pointer.id);
    if (this.battleViewPointers.size < 2) this.battleViewPinchDistance = 0;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (this.handleBattleViewPointerMove(pointer)) return;
    const logical = this.logicalPointer(pointer);
    if (this.resultScrollDrag && pointer.id === this.resultScrollDrag.pointerId) {
      if (!pointer.isDown) {
        this.stopResultScrollDrag();
        return;
      }
      const { team, grabOffsetY } = this.resultScrollDrag;
      const layout = this.isCompact() ? COMPACT_RESULT_LAYOUT : WIDE_RESULT_LAYOUT;
      const rowCount = this.bridge.engine.getBattleRanking(team).length;
      const geometry = this.resultScrollbarGeometry(layout, team, rowCount);
      if (!geometry) {
        this.stopResultScrollDrag();
        return;
      }
      const thumbY = Phaser.Math.Clamp(
        logical.y - grabOffsetY,
        geometry.trackY,
        geometry.trackY + geometry.trackHeight - geometry.thumbHeight,
      );
      const travel = geometry.trackHeight - geometry.thumbHeight;
      const nextOffset = Math.round(((thumbY - geometry.trackY) / travel) * geometry.maxOffset);
      if (this.setResultScrollOffset(team, nextOffset, rowCount)) {
        this.clearTooltip();
        this.rebuild();
        if (this.game?.canvas) this.game.canvas.style.cursor = "grabbing";
      }
      return;
    }
    if (this.traitDrag && pointer.isDown) {
      const delta = logical.x - this.traitDrag.startX;
      if (Math.abs(delta) > 6) {
        this.traitDrag.moved = true;
        this.traitOffset = Phaser.Math.Clamp(this.traitDrag.offset + delta, this.traitMinimumOffset, 0);
        this.updateTraitViewport();
      } else this.updateTraitTooltip(pointer);
      return;
    }
    const drag = this.dragState;
    if (!drag || pointer.id !== drag.pointerId || !pointer.isDown) return;
    const distance = Phaser.Math.Distance.Between(drag.startX, drag.startY, logical.x, logical.y);
    if (!drag.active && distance > 8) {
      drag.active = true;
      this.clearTooltip();
      drag.ghost = this.createDragGhost(drag.unit);
      this.game.canvas.style.cursor = "grabbing";
    }
    if (!drag.active) return;
    const overSellZone = this.isInSellDropZone(logical.x, logical.y);
    drag.ghost?.setPosition(logical.x + (overSellZone ? 44 : 18), logical.y - (overSellZone ? 48 : 18));
    if (overSellZone) {
      drag.target = null;
      drag.targetMarker?.destroy();
      drag.targetMarker = null;
      this.updateSellDropZone(true, drag.unit);
      return;
    }
    this.updateSellDropZone(false, drag.unit);
    const target = this.locationAt(logical.x, logical.y);
    const nextTarget = target && !this.sameLocation(target, drag.origin) ? target : null;
    const previousKey = drag.target ? `${drag.target.zone}:${drag.target.index}` : "";
    const nextKey = nextTarget ? `${nextTarget.zone}:${nextTarget.index}` : "";
    if (previousKey !== nextKey) {
      drag.target = nextTarget;
      drag.targetMarker?.destroy();
      drag.targetMarker = nextTarget ? this.createDragTargetMarker(nextTarget) : null;
    }
  }

  private handlePointerWheel(pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) {
    if (this.phase === "battle") {
      if (deltaY) this.adjustBattleView(deltaY < 0 ? "zoomIn" : "zoomOut");
      return;
    }
    if (this.phase === "result") {
      const layout = this.isCompact() ? COMPACT_RESULT_LAYOUT : WIDE_RESULT_LAYOUT;
      const logical = this.logicalPointer(pointer);
      const team = (["player", "enemy"] as Team[]).find((candidate, index) => {
        const x = layout.columnX[index];
        return logical.x >= x
          && logical.x <= x + layout.columnWidth + 18
          && logical.y >= layout.rosterY
          && logical.y <= layout.rosterY + RESULT_VIEWPORT_HEIGHT;
      });
      if (!team) return;
      const rowCount = this.bridge.engine.getBattleRanking(team).length;
      const direction = Math.sign(deltaY);
      if (direction && this.setResultScrollOffset(team, this.resultScrollOffsets[team] + direction, rowCount)) {
        this.clearTooltip();
        this.rebuild();
      }
      return;
    }
    if (this.phase !== "preparation" || this.traitMinimumOffset === 0) return;
    const strip = this.traitStrip();
    const logical = this.logicalPointer(pointer);
    if (logical.x < strip.x || logical.x > strip.x + strip.width || logical.y < strip.y || logical.y > strip.y + strip.height) return;
    this.traitOffset = Phaser.Math.Clamp(this.traitOffset - deltaY * 0.35, this.traitMinimumOffset, 0);
    this.updateTraitViewport();
    this.updateTraitTooltip(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    this.releaseBattleViewPointer(pointer);
    if (this.resultScrollDrag?.pointerId === pointer.id) {
      this.stopResultScrollDrag();
      return;
    }
    if (this.traitDrag) {
      this.traitDrag = null;
      return;
    }
    const drag = this.dragState;
    if (!drag || pointer.id !== drag.pointerId) return;
    const logical = this.logicalPointer(pointer);
    const shouldSell = drag.active && this.isInSellDropZone(logical.x, logical.y);
    const target = this.locationAt(logical.x, logical.y);
    const shouldMove = drag.active && target && !this.sameLocation(drag.origin, target);
    const action = shouldSell
      ? { type: "sell", location: drag.origin } satisfies GameAction
      : shouldMove
        ? { type: "move", from: drag.origin, to: target } satisfies GameAction
        : { type: "slot", location: drag.origin } satisfies GameAction;
    this.cancelDrag();
    this.dispatch(action);
  }

  private handlePointerUpOutside(pointer: Phaser.Input.Pointer) {
    this.releaseBattleViewPointer(pointer);
    if (this.resultScrollDrag?.pointerId === pointer.id) this.stopResultScrollDrag();
    this.cancelDrag();
  }

  private stopResultScrollDrag() {
    this.resultScrollDrag = null;
    if (this.game?.canvas) this.game.canvas.style.cursor = "";
  }

  private isInSellDropZone(x: number, y: number) {
    const zone = PREPARATION_SELL_ZONE;
    return !this.isMobile() && x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
  }

  private createDragTargetMarker(location: UnitLocation) {
    const rect = this.slotRect(location);
    const marker = this.add.graphics().setDepth(DEPTH.overlay + 1);
    marker.fillStyle(0x62e3a6, 0.16).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 12);
    marker.lineStyle(2, 0x8af0bd, 0.95).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 12);
    this.overlayLayer.add(marker);
    return marker;
  }

  private createDragGhost(unit: OwnedUnit) {
    const container = this.add.container(0, 0).setDepth(DEPTH.tooltip - 1).setAlpha(0.84);
    const glow = this.add.circle(0, 0, 31, Phaser.Display.Color.HexStringToColor(UNIT_DEFS[unit.id].accent).color, 0.25);
    const portrait = this.createPortrait(unit.id, 0, 0, 27);
    const label = this.text(0, 38, `${"★".repeat(unit.star)}${UNIT_DEFS[unit.id].name}`, 10, "#f5fbff", { fontStyle: "bold" }).setOrigin(0.5);
    container.add([glow, portrait, label]);
    this.overlayLayer.add(container);
    return container;
  }

  private cancelDrag() {
    this.dragState?.ghost?.destroy();
    this.dragState?.targetMarker?.destroy();
    this.dragState = null;
    this.traitDrag = null;
    this.clearTooltip();
    this.updateSellDropZone(false);
    if (this.game?.canvas) this.game.canvas.style.cursor = "";
  }

  private selectedRefund() {
    const { selected } = this.bridge.engine.state;
    const unit = selected ? this.unitAt(selected) : null;
    return unit ? this.refundForUnit(unit) : 0;
  }

  private refundForUnit(unit: OwnedUnit) {
    return UNIT_DEFS[unit.id].cost * (unit.star === 3 ? 9 : unit.star === 2 ? 3 : 1);
  }

  private drawBattle() {
    const field = this.add.graphics();
    field.fillStyle(0x101e2a, 0.98).fillRoundedRect(24, 94, 1072, 596, 18);
    field.fillStyle(0x0f4053, 0.55).fillRoundedRect(28, 98, 512, 588, 14);
    field.fillStyle(0x54203c, 0.55).fillRoundedRect(580, 98, 512, 588, 14);
    field.fillStyle(0x281e43, 0.78).fillRect(528, 98, 64, 588);
    field.fillStyle(0x7a4db5, 0.22).fillRect(516, 98, 88, 588);
    field.lineStyle(2, 0xca9bff, 0.78).lineBetween(560, 104, 560, 680);
    field.lineStyle(1, 0x6094b0, 0.5).strokeRoundedRect(24, 94, 1072, 596, 18);
    for (let x = 52; x < 1090; x += 54) field.lineStyle(1, 0x7ab4d0, 0.08).lineBetween(x, 112, x, 676);
    for (let y = 122; y < 690; y += 54) field.lineStyle(1, 0x7ab4d0, 0.08).lineBetween(36, y, 1084, y);
    this.phaseLayer.add(field);
    this.phaseLayer.add(this.text(48, 108, "守备方", 10, "#72d8ff", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(1072, 108, "裂隙军团", 10, "#ff6d9a", { fontStyle: "bold" }).setOrigin(1, 0));
    this.phaseLayer.add(this.text(560, 108, "裂隙", 12, "#f0d8ff", { fontStyle: "bold" }).setOrigin(0.5));
    const activeTraits = this.bridge.engine.getActiveTraits();
    const traitSummary = activeTraits.length ? activeTraits.map((trait) => `${trait.name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][trait.level] ?? ""}`).join(" · ") : "无激活羁绊";
    const augmentSummary = this.bridge.engine.state.augments.map((id) => AUGMENTS.find((augment) => augment.id === id)?.name ?? id).join(" · ") || "无天赋";
    this.phaseLayer.add(this.text(48, 670, this.truncateText(`羁绊：${traitSummary}`, 420, 9, { fontStyle: "bold" }), 9, "#8ce8bd", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(1072, 670, this.truncateText(`天赋：${augmentSummary}`, 420, 9, { fontStyle: "bold" }), 9, "#d5b7ff", { fontStyle: "bold" }).setOrigin(1));
    this.syncBattleEntities();
    this.syncCombatEffects();
    if (this.phase === "battle") this.buildBattleOverlay();
  }

  private syncBattleEntities() {
    const { battle } = this.bridge.engine.state;
    if (!battle) return;
    const active = new Set<string>();
    [...battle.player, ...battle.enemy].filter((fighter) => fighter.alive).forEach((fighter) => {
      active.add(fighter.fid);
      let view = this.fighterViews.get(fighter.fid);
      if (!view) {
        view = this.createFighter(fighter);
        this.fighterViews.set(fighter.fid, view);
        this.entityLayer.add(view);
      }
      this.updateFighter(view, fighter);
    });
    this.fighterViews.forEach((view, id) => {
      if (!active.has(id)) {
        view.destroy();
        this.fighterViews.delete(id);
      }
    });
  }

  private createFighter(fighter: Fighter) {
    return this.fighterRenderer.create(fighter);
  }

  private updateFighter(
    view: Phaser.GameObjects.Container,
    fighter: Fighter,
  ) {
    this.fighterRenderer.update(view, fighter);
  }

  private syncCombatEffects() {
    const { battle, visualTime } = this.bridge.engine.state;
    if (!battle) return;
    const visibleEffects = this.visibleCombatEffects(battle.effects);
    this.syncObjectMap(
      this.projectileViews,
      battle.projectiles,
      (projectile) => this.createProjectile(projectile),
      (view, projectile) => this.updateProjectile(view, projectile),
      undefined,
      (view) => this.projectileRenderer.recycle(view),
    );
    this.syncObjectMap(
      this.effectViews,
      visibleEffects,
      (effect) => this.createEffect(effect),
      (view, effect) => this.updateEffect(view, effect),
      undefined,
      (view) => this.effectRenderer.recycle(view),
    );
    this.summonRenderer.sync(
      battle.pets,
      visualTime,
      this.effectsLayer,
    );
    this.syncChronospheres(battle.chronospheres, visualTime);
  }

  private visibleCombatEffects(effects: BattleEffect[]) {
    if (!this.isMobileSizedViewport()) return effects;

    const isText = (effect: BattleEffect) => effect.kind === "text" || effect.kind === "heal";
    const visibleText = new Set<BattleEffect>();
    effects.forEach((effect) => {
      if (isText(effect) && this.effectViews.has(effect)) visibleText.add(effect);
    });

    for (let index = effects.length - 1; index >= 0 && visibleText.size < RiftLineScene.MOBILE_TEXT_EFFECT_LIMIT; index -= 1) {
      const effect = effects[index];
      if (!isText(effect) || visibleText.has(effect) || this.suppressedEffectViews.has(effect)) continue;
      visibleText.add(effect);
    }

    effects.forEach((effect) => {
      if (isText(effect) && !visibleText.has(effect)) this.suppressedEffectViews.add(effect);
    });
    return effects.filter((effect) => !isText(effect) || visibleText.has(effect));
  }

  private syncObjectMap<T, K>(
    views: Map<K, Phaser.GameObjects.Container>,
    items: T[],
    create: (item: T) => Phaser.GameObjects.Container,
    update: (view: Phaser.GameObjects.Container, item: T) => void,
    keyFor: (item: T) => K = (item) => item as unknown as K,
    release: (view: Phaser.GameObjects.Container) => void = (view) => view.destroy(),
  ) {
    const active = new Set<K>();
    items.forEach((item) => {
      const key = keyFor(item);
      active.add(key);
      let view = views.get(key);
      if (!view) {
        view = create(item);
        views.set(key, view);
        this.effectsLayer.add(view);
      }
      update(view, item);
    });
    views.forEach((view, key) => {
      if (!active.has(key)) {
        release(view);
        views.delete(key);
      }
    });
  }

  private createProjectile(projectile: Projectile) {
    return this.projectileRenderer.create(projectile);
  }

  private updateProjectile(
    view: Phaser.GameObjects.Container,
    projectile: Projectile,
  ) {
    this.projectileRenderer.update(view, projectile);
  }

  private createTitleGlowTexture() {
    if (this.textures.exists(TITLE_GLOW_TEXTURE)) return;
    const texture = this.textures.createCanvas(TITLE_GLOW_TEXTURE, 256, 256);
    if (!texture) return;
    const context = texture.getContext();
    const radius = 128;
    const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
    gradient.addColorStop(0, "rgba(83, 109, 255, 0.34)");
    gradient.addColorStop(0.48, "rgba(49, 81, 177, 0.15)");
    gradient.addColorStop(1, "rgba(10, 19, 33, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    texture.refresh();
  }

  private createBurstGradientTexture() {
    if (this.textures.exists(BURST_GRADIENT_TEXTURE)) return;
    const texture = this.textures.createCanvas(BURST_GRADIENT_TEXTURE, 128, 128);
    if (!texture) return;
    const context = texture.getContext();
    const radius = 64;
    const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    texture.refresh();
  }

  private createEffect(effect: BattleEffect) {
    return this.effectRenderer.create(effect);
  }

  private updateEffect(
    view: Phaser.GameObjects.Container,
    effect: BattleEffect,
  ) {
    this.effectRenderer.update(view, effect);
  }

  private syncChronospheres(
    zones: ChronosphereZone[],
    visualTime: number,
  ) {
    const activeSourceFids = new Set(zones.map((zone) => zone.sourceFid));
    this.chronosphereViews.forEach((view, sourceFid) => {
      if (activeSourceFids.has(sourceFid)) return;
      view.destroy();
      this.chronosphereViews.delete(sourceFid);
    });

    zones.forEach((zone) => {
      let view = this.chronosphereViews.get(zone.sourceFid);
      if (!view) {
        view = this.add.container(0, 0);
        view.add(this.add.graphics().setName("shape"));
        this.chronosphereViews.set(zone.sourceFid, view);
        this.effectsLayer.add(view);
      }
      const pulse = 0.92 + Math.sin(visualTime * 6) * 0.04;
      const graphics = view.getByName("shape") as Phaser.GameObjects.Graphics;
      graphics.clear();
      graphics.fillStyle(0x783cb4, 0.2 + Math.max(0, zone.life / zone.maxLife) * 0.22).fillCircle(0, 0, zone.radius * pulse);
      graphics.lineStyle(3, Phaser.Display.Color.HexStringToColor(zone.color).color, 0.92).strokeCircle(0, 0, zone.radius * pulse);
      view.setPosition(zone.x, zone.y).setDepth(DEPTH.effects - 2);
    });
  }

  private buildBattleOverlay() {
    const { battle } = this.bridge.engine.state;
    if (!battle || this.battleTimerText) return;
    this.battleTimerPanel = this.panel(508, 104, 104, 28, 0x09131d, 0.88, 0x8edfff);
    this.battleTimerUrgent = false;
    this.battleTimerText = this.text(560, 118, "", 14, "#dcefff", { fontStyle: "bold" }).setOrigin(0.5);
    this.battleBannerText = this.text(560, 155, "", 14, "#f5fbff", { backgroundColor: "#09131ddd", padding: { x: 18, y: 10 }, wordWrap: { width: 310 }, align: "center" }).setOrigin(0.5);
    this.overlayLayer.add([this.battleTimerPanel, this.battleTimerText, this.battleBannerText]);
    if (battle.rankingOpen) this.drawRanking();
    this.syncBattleOverlay();
  }

  private syncBattleOverlay(deltaSec = 0) {
    const { battle } = this.bridge.engine.state;
    if (!battle || !this.battleTimerText || !this.battleTimerPanel || !this.battleBannerText) return;
    const remaining = Math.max(0, battle.limit - battle.elapsed);
    const urgent = remaining < 6;
    if (urgent !== this.battleTimerUrgent) {
      this.battleTimerUrgent = urgent;
      this.battleTimerPanel.clear();
      this.battleTimerPanel.fillStyle(0x09131d, 0.88).fillRoundedRect(508, 104, 104, 28, 8);
      this.battleTimerPanel.lineStyle(1, urgent ? 0xff718e : 0x8edfff, 0.8).strokeRoundedRect(508, 104, 104, 28, 8);
    }
    const timerColor = urgent ? "#ff718e" : "#dcefff";
    this.battleTimerText.setText(`⏱ ${remaining.toFixed(1)}s`);
    if (this.battleTimerText.style.color !== timerColor) this.battleTimerText.setColor(timerColor);
    this.battleBannerText.setText(battle.bannerTimer > 0 ? battle.banner : "").setVisible(battle.bannerTimer > 0);
    const rankingKey = battle.rankingOpen ? battle.rankingMetric : "closed";
    if (rankingKey !== this.rankingStateKey) {
      this.rankingStateKey = rankingKey;
      this.rankingRefreshAccum = 0;
      if (battle.rankingOpen) this.drawRanking();
      else {
        this.clearRankingPanel();
      }
      return;
    }
    // 展开时按间隔刷新数值，避免战斗中面板静止
    if (battle.rankingOpen) {
      this.rankingRefreshAccum += deltaSec;
      if (this.rankingRefreshAccum >= RiftLineScene.RANKING_REFRESH_INTERVAL) {
        this.rankingRefreshAccum = 0;
        this.drawRanking();
      }
    }
  }

  private clearRankingPanel() {
    this.rankingLayer?.destroy(true);
    this.rankingLayer = null;
    // 页签按钮挂在 buttonViews，销毁面板后清掉已失效引用
    this.buttonViews = this.buttonViews.filter((button) => button.active && Boolean(button.scene));
  }

  private createInputBlocker(x: number, y: number, width: number, height: number, depth: number) {
    const blocker = this.add.zone(x + width / 2, y + height / 2, width, height).setDepth(depth).setInteractive({ useHandCursor: false });
    blocker.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (!this.isCompact()) this.clearTooltip();
    });
    return blocker;
  }

  private drawRanking() {
    const { battle } = this.bridge.engine.state;
    if (!battle) return;
    this.clearRankingPanel();
    const layer = this.add.container(0, 0).setDepth(DEPTH.overlay + 1);
    this.rankingLayer = layer;
    layer.add(this.panel(802, 142, 270, 344, 0x07111b, 0.96));
    layer.add(this.text(816, 154, "本场战斗", 12, "#eff8ff", { fontStyle: "bold" }));
    layer.add(this.createInputBlocker(802, 142, 270, 344, DEPTH.overlay + 1));
    (["damage", "support", "taken"] as RankingMetric[]).forEach((metric, index) => {
      const tone: ButtonTone = metric === "damage" ? "metricDamage" : metric === "support" ? "metricSupport" : "metricTaken";
      // 页签挂到统计层，随面板一起销毁，避免定时刷新泄漏按钮
      layer.add(this.button(814 + index * 84, 178, metric === "support" ? 88 : 76, 24, resultMetricLabel[metric], { type: "metric", metric }, { tone, selected: battle.rankingMetric === metric }, DEPTH.overlay + 3));
    });
    const ranking = this.bridge.engine.getBattleRanking();
    const maximum = Math.max(1, ...ranking.map(({ value }) => value));
    ranking.slice(0, 8).forEach(({ fighter, value }, index) => {
      const y = 218 + index * 32;
      const row = this.add.graphics();
      row.fillStyle(0x102330, fighter.alive ? 0.9 : 0.48).fillRoundedRect(812, y - 13, 250, 27, 7);
      row.fillStyle(Phaser.Display.Color.HexStringToColor(UNIT_DEFS[fighter.unitId].accent).color, 0.65).fillRoundedRect(876, y + 7, 130 * (value / maximum), 3, 2);
      layer.add(row);
      layer.add(this.createPortrait(fighter.unitId, 834, y, 10, fighter.team === "enemy").setAlpha(fighter.alive ? 1 : 0.45));
      layer.add(this.text(850, y, `${index + 1}`, 10, "#98b1c2").setOrigin(0, 0.5));
      layer.add(this.text(868, y - 5, `${UNIT_DEFS[fighter.unitId].name}${"★".repeat(fighter.star)}`, 9, UNIT_DEFS[fighter.unitId].accent, { fontStyle: "bold" }).setOrigin(0, 0.5).setAlpha(fighter.alive ? 1 : 0.52));
      const support = battle.rankingMetric === "support" ? `治${short(fighter.healingDone)} 盾${short(fighter.shieldingDone)}` : short(value);
      layer.add(this.text(1056, y, support, 9, "#effaff").setOrigin(1, 0.5));
      const zone = this.add.zone(937, y, 250, 27).setDepth(DEPTH.overlay + 4).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
      zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
      zone.on(Phaser.Input.Events.POINTER_OUT, () => { if (!this.isCompact()) this.clearTooltip(); });
      layer.add(zone);
    });
    this.overlayLayer.add(layer);
  }

  private resultContinueLabel() {
    const { state } = this.bridge.engine;
    if (state.hp <= 0) return "继续 · 查看结局";
    const tier = augmentTierForRound(state.round);
    return tier
      ? `继续 · 选择${tier === "minor" ? "小" : "大"}天赋`
      : "继续 · 进入整备";
  }

  private drawResultMetricTab(x: number, y: number, width: number, metric: RankingMetric, selected: boolean) {
    const accent = metric === "damage" ? COLORS.resultMetricDamage : metric === "support" ? COLORS.resultMetricSupport : COLORS.resultMetricTaken;
    const graphics = this.add.graphics().setDepth(DEPTH.overlay + 3);
    const label = this.text(x + width / 2, y + 12, resultMetricLabel[metric], 10, selected ? `#${accent.toString(16).padStart(6, "0")}` : COLORS.resultMetricIdleText, { fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay + 4);
    const draw = (hover = false) => {
      graphics.clear();
      graphics.fillStyle(selected ? accent : hover ? COLORS.resultMetricIdleHover : COLORS.resultMetricIdle, selected ? 0.2 : 0.96);
      graphics.fillRoundedRect(x, y, width, 24, 9);
      graphics.lineStyle(selected ? 2 : 1, selected ? accent : COLORS.resultMetricIdleBorder, selected ? 0.96 : hover ? 0.92 : 0.7);
      graphics.strokeRoundedRect(x, y, width, 24, 9);
      label.setColor(selected ? `#${accent.toString(16).padStart(6, "0")}` : hover ? "#eaf7ff" : COLORS.resultMetricIdleText);
    };
    draw();
    const zone = this.add.zone(x + width / 2, y + 12, width, 24).setDepth(DEPTH.overlay + 5).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch({ type: "metric", metric }));
    zone.on(Phaser.Input.Events.POINTER_OVER, () => draw(true));
    zone.on(Phaser.Input.Events.POINTER_OUT, () => draw(false));
    this.overlayLayer.add([graphics, label, zone]);
  }

  private setResultScrollOffset(team: Team, offset: number, rowCount: number) {
    const maximum = Math.max(0, rowCount - RESULT_VISIBLE_ROWS);
    const nextOffset = Phaser.Math.Clamp(Math.round(offset), 0, maximum);
    if (nextOffset === this.resultScrollOffsets[team]) return false;
    this.resultScrollOffsets[team] = nextOffset;
    return true;
  }

  private resultScrollbarGeometry(layout: typeof WIDE_RESULT_LAYOUT, team: Team, rowCount: number) {
    const maxOffset = Math.max(0, rowCount - RESULT_VISIBLE_ROWS);
    if (!maxOffset) return null;
    const teamIndex = team === "player" ? 0 : 1;
    const trackHeight = RESULT_VIEWPORT_HEIGHT;
    const thumbHeight = Math.max(38, Math.round((trackHeight * RESULT_VISIBLE_ROWS) / rowCount));
    const offset = Phaser.Math.Clamp(this.resultScrollOffsets[team], 0, maxOffset);
    const thumbY = layout.rosterY + (trackHeight - thumbHeight) * (offset / maxOffset);
    return {
      maxOffset,
      trackX: layout.columnX[teamIndex] + layout.columnWidth + 9,
      trackY: layout.rosterY,
      trackHeight,
      thumbHeight,
      thumbY,
    };
  }

  private drawResultScrollbar(layout: typeof WIDE_RESULT_LAYOUT, team: Team, rowCount: number) {
    const geometry = this.resultScrollbarGeometry(layout, team, rowCount);
    if (!geometry) return;
    const accent = team === "player" ? COLORS.player : COLORS.enemy;
    const graphics = this.add.graphics()
      .setName(`resultScrollbar-${team}`)
      .setDepth(DEPTH.overlay + 4);
    graphics.fillStyle(0x28404f, 0.72).fillRoundedRect(
      geometry.trackX - 2,
      geometry.trackY,
      4,
      geometry.trackHeight,
      2,
    );
    graphics.fillStyle(accent, 0.88).fillRoundedRect(
      geometry.trackX - 3,
      geometry.thumbY,
      6,
      geometry.thumbHeight,
      3,
    );
    const trackZone = this.add.zone(
      geometry.trackX,
      geometry.trackY + geometry.trackHeight / 2,
      18,
      geometry.trackHeight,
    )
      .setName(`resultScrollbarTrack-${team}`)
      .setDepth(DEPTH.overlay + 5)
      .setInteractive({ useHandCursor: true });
    trackZone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const logical = this.logicalPointer(pointer);
      const travel = geometry.trackHeight - geometry.thumbHeight;
      const thumbY = Phaser.Math.Clamp(
        logical.y - geometry.thumbHeight / 2,
        geometry.trackY,
        geometry.trackY + travel,
      );
      const offset = Math.round(((thumbY - geometry.trackY) / travel) * geometry.maxOffset);
      if (this.setResultScrollOffset(team, offset, rowCount)) {
        this.clearTooltip();
        this.rebuild();
      }
    });
    const thumbZone = this.add.zone(
      geometry.trackX,
      geometry.thumbY + geometry.thumbHeight / 2,
      20,
      geometry.thumbHeight,
    )
      .setName(`resultScrollbarThumb-${team}`)
      .setDepth(DEPTH.overlay + 6)
      .setInteractive({ useHandCursor: true });
    thumbZone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const logical = this.logicalPointer(pointer);
      this.resultScrollDrag = {
        team,
        pointerId: pointer.id,
        grabOffsetY: logical.y - geometry.thumbY,
      };
      this.clearTooltip();
      if (this.game?.canvas) this.game.canvas.style.cursor = "grabbing";
    });
    this.overlayLayer.add([graphics, trackZone, thumbZone]);
  }

  private drawResultRow(x: number, y: number, width: number, rank: number, fighter: Fighter, value: number, metric: RankingMetric, layout: ResultRowLayout) {
    const accent = Phaser.Display.Color.HexStringToColor(UNIT_DEFS[fighter.unitId].accent).color;
    const { height, portraitRadius, nameSize, detailSize } = layout;
    const portraitX = x + portraitRadius + 10;
    const contentX = x + portraitRadius * 2 + 18;
    const statusWidth = 42;
    const metricText = metric === "support"
      ? `治 ${short(fighter.healingDone)} · 盾 ${short(fighter.shieldingDone)}`
      : `${resultMetricLabel[metric]} ${short(value)}`;
    const name = this.truncateText(`${rank}. ${UNIT_DEFS[fighter.unitId].name}${"★".repeat(fighter.star)}`, width - (contentX - x) - statusWidth - 18, nameSize, { fontStyle: "bold" });
    const health = `血 ${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)}${fighter.shield > 0 ? ` · 盾 ${Math.round(fighter.shield)}` : ""}${fighter.abilityShield > 0 ? ` · 术盾 ${Math.round(fighter.abilityShield)}` : ""}`;
    const row = this.add.graphics();
    row.fillStyle(0x102230, fighter.alive ? 0.94 : 0.48).fillRoundedRect(x, y, width, height, 8);
    row.lineStyle(1, accent, fighter.alive ? 0.3 : 0.14).strokeRoundedRect(x, y, width, height, 8);
    this.overlayLayer.add(row);
    this.overlayLayer.add(this.createPortrait(fighter.unitId, portraitX, y + height / 2, portraitRadius, fighter.team === "enemy").setAlpha(fighter.alive ? 1 : 0.42));
    this.overlayLayer.add(this.text(contentX, y + 5, name, nameSize, UNIT_DEFS[fighter.unitId].accent, { fontStyle: "bold" }).setAlpha(fighter.alive ? 1 : 0.55));
    this.overlayLayer.add(this.text(x + width - 10, y + 6, fighter.alive ? "存活" : "已击败", detailSize, fighter.alive ? "#75e6b0" : "#81919d", { fontStyle: "bold" }).setOrigin(1, 0));
    this.overlayLayer.add(this.text(contentX, y + Math.round(height * 0.44), health, detailSize, "#a9bfcc"));
    this.overlayLayer.add(this.text(contentX, y + height - detailSize - 5, `攻 ${Math.round(fighter.attack)} · 甲 ${Math.round(fighter.armor)}`, detailSize, fighter.team === "player" ? "#7fdcff" : "#ff91a9", { fontStyle: "bold" }));
    this.overlayLayer.add(this.text(x + width - 10, y + height - detailSize - 5, metricText, detailSize, "#edf8ff", { fontStyle: "bold" }).setOrigin(1));
    const zone = this.add.zone(x + width / 2, y + height / 2, width, height)
      .setName(`resultRow-${fighter.team}-${rank}`)
      .setDepth(DEPTH.overlay + 5)
      .setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
    zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
    zone.on(Phaser.Input.Events.POINTER_OUT, () => { if (!this.isCompact()) this.clearTooltip(); });
    this.overlayLayer.add(zone);
  }

  private drawResult() {
    const { result, battle } = this.bridge.engine.state;
    if (!result || !battle) return;
    const layout = this.isCompact() ? COMPACT_RESULT_LAYOUT : WIDE_RESULT_LAYOUT;
    const { panel } = layout;
    const dim = this.add.rectangle(560, 399, 1120, 642, 0x02070d, 0.76);
    this.overlayLayer.add(dim);
    this.overlayLayer.add(this.createInputBlocker(0, 78, WORLD_WIDTH, WORLD_HEIGHT - 78, DEPTH.overlay + 1));
    this.overlayLayer.add(this.panel(panel.x, panel.y, panel.width, panel.height, 0x07131e, 0.99, result.won ? 0x62e3a6 : 0xff718a));
    this.overlayLayer.add(this.text(560, layout.kickerY, result.won ? "战斗结算 · 胜利" : "战斗结算 · 失利", 13, result.won ? "#62e3a6" : "#ff718a", { fontStyle: "bold" }).setOrigin(0.5));
    const headline = this.truncateText(result.headline, 920, layout.headlineSize, { fontStyle: "bold" });
    this.overlayLayer.add(this.text(560, layout.headlineY, headline, layout.headlineSize, "#f2f8ff", { fontStyle: "bold" }).setOrigin(0.5));
    const detail = this.boundedText(result.detail, 860, 2, layout.detailSize, "#9cb4c3", { align: "center" }).setOrigin(0.5, 0);
    detail.setPosition(560, layout.detailY);
    this.overlayLayer.add(detail);
    const reward = result.won
      ? `+${result.income} 金币${result.upgradeDiscount ? ` · 升本费用 -${result.upgradeDiscount}` : ""}`
      : `核心 -${result.damage} · +${result.income} 金币${result.upgradeDiscount ? ` · 升本费用 -${result.upgradeDiscount}` : ""}`;
    this.overlayLayer.add(this.text(560, layout.rewardY, reward, 13, result.won ? COLORS.resultReward : "#ff9caf", { fontStyle: "bold" }).setOrigin(0.5));
    const metricWidths: Record<RankingMetric, number> = { damage: 78, support: 96, taken: 76 };
    const metrics: RankingMetric[] = ["damage", "support", "taken"];
    const totalMetricWidth = metrics.reduce((total, metric) => total + metricWidths[metric], 0) + 16;
    let metricX = 560 - totalMetricWidth / 2;
    metrics.forEach((metric) => {
      this.drawResultMetricTab(metricX, layout.metricsY, metricWidths[metric], metric, battle.rankingMetric === metric);
      metricX += metricWidths[metric] + 8;
    });
    const playerRows = this.bridge.engine.getBattleRanking("player");
    const enemyRows = this.bridge.engine.getBattleRanking("enemy");
    ([playerRows, enemyRows] as const).forEach((rows, teamIndex) => {
      const team: Team = teamIndex === 0 ? "player" : "enemy";
      const maximumOffset = Math.max(0, rows.length - RESULT_VISIBLE_ROWS);
      const offset = Phaser.Math.Clamp(this.resultScrollOffsets[team], 0, maximumOffset);
      this.resultScrollOffsets[team] = offset;
      const rangeEnd = Math.min(rows.length, offset + RESULT_VISIBLE_ROWS);
      this.overlayLayer.add(this.text(
        layout.columnX[teamIndex],
        layout.rosterHeadingY,
        team === "player" ? "我方阵容" : "敌方阵容",
        13,
        team === "player" ? "#7fdcff" : "#ff91a9",
        { fontStyle: "bold" },
      ));
      this.overlayLayer.add(this.text(
        layout.columnX[teamIndex] + layout.columnWidth,
        layout.rosterHeadingY + 2,
        rows.length ? `${offset + 1}–${rangeEnd} / ${rows.length}` : "0 / 0",
        9,
        "#829aaa",
        { fontStyle: "bold" },
      ).setName(`resultRange-${team}`).setOrigin(1, 0));
      rows.slice(offset, offset + RESULT_VISIBLE_ROWS).forEach(({ fighter, value }, index) => {
        this.drawResultRow(
          layout.columnX[teamIndex],
          layout.rosterY + index * (RESULT_ROW_LAYOUT.height + RESULT_ROW_GAP),
          layout.columnWidth,
          offset + index + 1,
          fighter,
          value,
          battle.rankingMetric,
          RESULT_ROW_LAYOUT,
        );
      });
      this.drawResultScrollbar(layout, team, rows.length);
    });
    this.button(410, layout.continueY, 300, 38, this.resultContinueLabel(), { type: "resultContinue" }, { tone: result.won ? "confirm" : "danger" }, DEPTH.overlay + 3);
  }

  private drawAugments() {
    const { state } = this.bridge.engine;
    const tier = AUGMENTS.find((item) => item.id === state.augmentChoices[0])?.tier
      || augmentTierForRound(state.round)
      || "minor";
    this.phaseLayer.add(this.text(560, 142, AUGMENT_TIER_LABELS[tier], 36, "#f3f8ff", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(560, 185, tier === "minor" ? "早期定向强化" : "后期核心强化", 13, "#95adbd").setOrigin(0.5));
    const choiceWidth = state.augmentChoices.length * 320 + Math.max(0, state.augmentChoices.length - 1) * 30;
    state.augmentChoices.forEach((id, index) => {
      const augment = AUGMENTS.find((item) => item.id === id);
      if (!augment) return;
      const repeated = state.augments.includes(id);
      const x = 560 - choiceWidth / 2 + index * 350;
      const y = 255;
      const accent = Phaser.Display.Color.HexStringToColor(augment.color).color;
      const card = this.add.container(x, y);
      const panel = this.panel(0, 0, 320, 300, 0x132231, 0.98, accent);
      card.add(panel);
      card.add(this.text(160, 48, `${repeated ? "再次强化 · " : ""}${augment.kicker}`.toUpperCase(), 10, augment.color, { fontStyle: "bold" }).setOrigin(0.5));
      card.add(this.text(160, 82, `${augment.icon} ${augment.name}`, 22, "#eff7ff", {
        fontFamily: PROJECTILE_EMOJI_FONT,
        fontStyle: "bold",
      }).setOrigin(0.5));
      card.add(this.text(24, 118, augment.description, 13, "#a9bfcc", { wordWrap: { width: 272 }, align: "center" }).setOrigin(0));
      const cta = this.add.graphics();
      cta.fillStyle(BUTTONS.confirm.fill, 1).fillRoundedRect(70, 244, 180, 34, 10);
      cta.lineStyle(1, BUTTONS.confirm.border, 0.9).strokeRoundedRect(70, 244, 180, 34, 10);
      const ctaText = this.text(160, 261, repeated ? "再次强化" : "选择天赋", 12, BUTTONS.confirm.text, { fontStyle: "bold" }).setOrigin(0.5);
      const zone = this.add.zone(160, 150, 320, 300).setInteractive({ useHandCursor: true });
      const drawHover = (hover: boolean) => {
        panel.clear();
        panel.fillStyle(hover ? accent : 0x132231, hover ? 0.22 : 0.98).fillRoundedRect(0, 0, 320, 300, 14);
        panel.lineStyle(hover ? 2 : 1, accent, hover ? 1 : 0.9).strokeRoundedRect(0, 0, 320, 300, 14);
        cta.clear();
        cta.fillStyle(hover ? BUTTONS.confirm.hover : BUTTONS.confirm.fill, 1).fillRoundedRect(70, 244, 180, 34, 10);
        cta.lineStyle(1, BUTTONS.confirm.border, 0.9).strokeRoundedRect(70, 244, 180, 34, 10);
        ctaText.setText(hover ? "选定并进入整备" : repeated ? "再次强化" : "选择天赋").setColor(hover ? BUTTONS.confirm.hoverText : BUTTONS.confirm.text);
      };
      zone.on(Phaser.Input.Events.POINTER_OVER, () => { card.setY(y - 6); drawHover(true); });
      zone.on(Phaser.Input.Events.POINTER_OUT, () => { card.setY(y); drawHover(false); });
      zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch({ type: "augment", index }));
      card.add([cta, ctaText, zone]);
      this.phaseLayer.add(card);
    });
  }

  private drawToast() {
    const { toast } = this.bridge.engine.state;
    // Preparation feedback is already surfaced in the DOM command bar. A
    // second toast over the board competes with the wave briefing, so reserve
    // the canvas toast for combat-only feedback.
    if (!toast || !this.tooltipLayer || this.bridge.engine.state.phase === "preparation") return;
    const color = toast.tone === "good" ? "#68e3aa" : toast.tone === "bad" ? "#ff7890" : "#79d8ff";
    const text = this.text(560, 90, toast.text, 12, color, { backgroundColor: "#07111bee", padding: { x: 22, y: 10 }, wordWrap: { width: 560 }, align: "center" }).setOrigin(0.5, 0);
    text.setName("toast");
    this.tooltipLayer.add(text);
  }

  private syncToast() {
    if (!this.tooltipLayer) return;
    this.tooltipLayer.getAll("name", "toast").forEach((item) => item.destroy());
    this.drawToast();
  }

  private createPortrait(unitId: UnitId, x: number, y: number, radius: number, enemy = false) {
    const def = UNIT_DEFS[unitId];
    const container = this.add.container(x, y);
    const key = def.portraitStyle === "sprite" ? textureKeyForUnit(unitId) : circularTextureKeyForUnit(unitId);
    const hasTexture = this.textures.exists(key);
    const portrait = this.add.image(0, 0, hasTexture ? key : "rift-fallback-unit").setName("portraitImage");
    const accent = Phaser.Display.Color.HexStringToColor(enemy ? "#ff688e" : def.accent).color;
    const unitColor = Phaser.Display.Color.HexStringToColor(def.color).color;
    const layers: Phaser.GameObjects.GameObject[] = [];

    if (def.portraitStyle === "sprite") {
      const { frame } = portrait;
      portrait.setScale(Math.min((radius * 2) / frame.width, (radius * 2) / frame.height));
      if (!hasTexture) layers.push(this.add.circle(0, 0, radius, unitColor, 0.72));
    } else {
      layers.push(
        this.add.circle(0, 0, radius + 3, 0x09131d, 0.96),
        this.add.circle(0, 0, radius + 1, unitColor, 0.92),
        this.add.circle(-radius * 0.2, -radius * 0.24, radius * 0.7, accent, 0.3),
      );
      portrait.setDisplaySize(radius * 2, radius * 2);
      layers.push(this.add.circle(0, 0, radius + 1, accent, 0).setStrokeStyle(1.5, accent, 0.95));
    }

    const glyph = this.text(0, 0, hasTexture ? "" : def.glyph, Math.max(12, radius), "#ffffff", { fontStyle: "bold" }).setOrigin(0.5);
    container.add([...layers, portrait, glyph]);
    return container;
  }

  private tooltipMetrics(preferredWidth: number) {
    const { width, height } = this.scale.parentSize;
    return tooltipLayoutFor(
      width || this.scale.displaySize.width,
      height || this.scale.displaySize.height,
      preferredWidth,
    );
  }

  private tooltipPosition(
    pointer: Phaser.Input.Pointer | undefined,
    width: number,
    height: number,
    compactY: number,
    scale: number,
  ) {
    const inset = TOOLTIP_TYPOGRAPHY.edgeInset * scale;
    const xMin = Math.min(inset, Math.max(0, WORLD_WIDTH - width));
    const xMax = Math.max(xMin, WORLD_WIDTH - width - inset);
    const yMin = Math.min(86 * scale, Math.max(0, WORLD_HEIGHT - height));
    const yMax = Math.max(yMin, WORLD_HEIGHT - height - inset);
    const preferred = this.isCompact() || !pointer
      ? { x: 28 * scale, y: compactY * scale }
      : (() => {
        const logical = this.logicalPointer(pointer);
        const offset = TOOLTIP_TYPOGRAPHY.pointerOffset * scale;
        return { x: logical.x + offset, y: logical.y + offset };
      })();
    let x = Phaser.Math.Clamp(preferred.x, xMin, xMax);
    const y = Phaser.Math.Clamp(preferred.y, yMin, yMax);
    // The React shop sits over the right side of the Phaser canvas during
    // desktop preparation. Keep unit/trait tooltips fully visible to its left.
    if (this.phase === "preparation" && !this.isMobile() && x + width > PREPARATION_SHOP_PANEL.x - 14) {
      x = Math.max(xMin, PREPARATION_SHOP_PANEL.x - 14 - width);
    }
    return { x, y };
  }

  private showUnitTooltip(
    unitId: UnitId,
    pointer?: Phaser.Input.Pointer,
    star: 1 | 2 | 3 = 1,
    fighter?: Fighter,
    owned?: OwnedUnit,
  ) {
    this.clearTooltip();
    this.pinnedTooltip = this.isCompact() ? unitId : null;
    const def = UNIT_DEFS[unitId];
    const { width, scale } = this.tooltipMetrics(408);
    const { padding, title, body, section, traitHeading, tag, tagHeight, tagGap } = TOOLTIP_TYPOGRAPHY;
    const contentWidth = width - padding * 2;
    const combatStats = owned ? this.bridge.engine.getPlayerCombatStats(owned) : null;
    const detail = fighter
      ? `生命 ${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)} · 护盾 ${Math.round(fighter.shield)} · 技能盾 ${Math.round(fighter.abilityShield)}（${fighter.abilityShieldTime.toFixed(1)}s）\n攻击 ${Math.round(fighter.attack)} · 护甲 ${Math.round(fighter.armor)} · 射程 ${Math.round(fighter.range)}\n攻速 ${fighter.attackInterval.toFixed(2)}s · 移速 ${Math.round(fighter.moveSpeed)}\n战斗：输出 ${short(fighter.damageDealt)} · 治疗 ${short(fighter.healingDone)} · 护盾 ${short(fighter.shieldingDone)} · 承伤 ${short(fighter.damageTaken)}`
      : combatStats
        ? `${def.attackType === "ranged" ? "远程" : "近战"} · 部署生命 ${Math.round(combatStats.maxHp)} · 攻击 ${Math.round(combatStats.attack)} · 护甲 ${Math.round(combatStats.armor)}\n射程 ${Math.round(combatStats.range)} · 攻速 ${combatStats.attackInterval.toFixed(2)}s · 移速 ${Math.round(combatStats.moveSpeed)}`
        : `${def.attackType === "ranged" ? "远程" : "近战"} · 生命 ${def.hp} · 攻击 ${def.attack} · 护甲 ${def.armor}\n射程 ${def.range} · 攻速 ${def.attackInterval.toFixed(2)}s · 移速 ${def.moveSpeed}`;
    const detailText = this.boundedText(detail, contentWidth, fighter ? 5 : 3, body, "#abc1ce", { lineSpacing: 5 });
    const abilityGrowth = describeAbilityStarGrowth(def);
    const abilityDescription = [
      abilityDescriptionForStar(def, star),
      abilityGrowth ? `星级成长：${abilityGrowth}` : "",
    ].filter(Boolean).join("\n");
    const ability = this.boundedText(abilityDescription, contentWidth, this.isCompact() ? 7 : 9, body, "#adc1cc", { lineSpacing: 5 });
    const abilityTitle = this.text(0, 0, `${def.abilityName} · ${ABILITY_CAST_TIMING_LABELS[def.abilityCastTiming]}`, section, "#eea7d5", { fontStyle: "bold" }).setVisible(false);
    const passive = def.passiveName && def.passiveDescription
      ? this.boundedText(def.passiveDescription, contentWidth, this.isCompact() ? 6 : 8, body, "#b8aecf", { lineSpacing: 5 })
      : null;
    const passiveTitle = def.passiveName
      ? this.text(0, 0, `被动 · ${def.passiveName}`, section, "#c3a7ff", { fontStyle: "bold" }).setVisible(false)
      : null;
    const titleY = padding - 2;
    const detailY = titleY + title + 14;
    const energyY = detailY + detailText.height + 8;
    const traitsY = energyY + body + 12;
    const traitContainer = this.add.container(padding, traitsY);
    const traitLabel = this.text(0, 3, "羁绊", traitHeading, "#8fa9b9", { fontStyle: "bold" });
    traitContainer.add(traitLabel);
    let traitX = Math.ceil(traitLabel.width) + 12;
    let traitY = 0;
    def.traits.forEach((traitId) => {
      const traitDef = TRAITS[traitId];
      const status = this.bridge.engine.getTraitStatus(traitId);
      const nextThreshold = traitDef.thresholds.find((threshold) => threshold > status.count);
      const statusLabel = status.active ? `${status.count}/${status.maxThreshold}` : `${status.count}/${nextThreshold ?? status.maxThreshold}`;
      const label = `${traitDef.name} ${statusLabel}`;
      const probe = this.text(0, 0, label, tag, "#ffffff", { fontStyle: "bold" }).setVisible(false);
      const tagWidth = Math.ceil(probe.width) + 22;
      probe.destroy();
      if (traitX > traitLabel.width + 12 && traitX + tagWidth > contentWidth) {
        traitX = 0;
        traitY += tagHeight + tagGap;
      }
      const { color } = Phaser.Display.Color.HexStringToColor(traitDef.color);
      const tagBackplate = this.add.graphics();
      tagBackplate.fillStyle(status.active ? color : COLORS.slotLabelFill, status.active ? 0.28 : 0.92);
      tagBackplate.fillRoundedRect(traitX, traitY, tagWidth, tagHeight, tagHeight / 2);
      tagBackplate.lineStyle(1, status.active ? color : COLORS.slotLabelBorder, status.active ? 0.95 : 0.7);
      tagBackplate.strokeRoundedRect(traitX, traitY, tagWidth, tagHeight, tagHeight / 2);
      traitContainer.add([
        tagBackplate,
        this.add.circle(traitX + 9, traitY + tagHeight / 2, 2.5, color, status.active ? 1 : 0.7),
        this.text(traitX + 16, traitY + 4, label, tag, status.active ? "#f4fbff" : "#a9c0cb", { fontStyle: "bold" }),
      ]);
      traitX += tagWidth + tagGap;
    });
    const traitHeight = traitY + tagHeight;
    const abilityTitleY = traitsY + traitHeight + 12;
    const abilityBodyY = abilityTitleY + abilityTitle.height + 5;
    const passiveTitleY = abilityBodyY + ability.height + (passiveTitle ? 12 : 0);
    const passiveBodyY = passiveTitleY + (passiveTitle?.height || 0) + 5;
    const height = Math.max(292, (passive ? passiveBodyY + passive.height : abilityBodyY + ability.height) + padding);
    const { x, y } = this.tooltipPosition(pointer, width * scale, height * scale, 280, scale);
    const container = this.add.container(x, y).setScale(scale);
    container.add(this.panel(0, 0, width, height, 0x07111b, 0.98, Phaser.Display.Color.HexStringToColor(def.accent).color));
    const priceLabel = `${def.cost} 费`;
    const priceProbe = this.text(0, 0, priceLabel, title - 2, COLORS.gold, { fontStyle: "bold" }).setVisible(false);
    const priceWidth = Math.ceil(priceProbe.width) + 20;
    priceProbe.destroy();
    const titleLabel = this.truncateText(`${def.name} ${"★".repeat(star)}`, contentWidth - priceWidth - 12, title, { fontStyle: "bold" });
    const priceBackplate = this.add.graphics();
    priceBackplate.fillStyle(Phaser.Display.Color.HexStringToColor(COLORS.gold).color, 0.12);
    priceBackplate.fillRoundedRect(width - padding - priceWidth, titleY - 4, priceWidth, title + 8, 7);
    priceBackplate.lineStyle(1, Phaser.Display.Color.HexStringToColor(COLORS.gold).color, 0.7);
    priceBackplate.strokeRoundedRect(width - padding - priceWidth, titleY - 4, priceWidth, title + 8, 7);
    container.add([
      this.text(padding, titleY, titleLabel, title, "#f1f8ff", { fontStyle: "bold" }),
      priceBackplate,
      this.text(width - padding - priceWidth / 2, titleY + title / 2, priceLabel, title - 2, COLORS.gold, { fontStyle: "bold" }).setOrigin(0.5),
    ]);
    detailText.setPosition(padding, detailY);
    container.add(detailText);
    const energy = fighter
      ? `${Math.round(fighter.energy)}/${fighter.maxEnergy}`
      : combatStats
        ? `${Math.round(combatStats.energy)}/${combatStats.maxEnergy}`
        : `${def.energyProfile.start}/${def.energyProfile.max}`;
    container.add(this.text(padding, energyY, `${def.energyProfile.name} · ${energy}`, body, def.energyProfile.color));
    container.add(traitContainer);
    abilityTitle.setPosition(padding, abilityTitleY).setVisible(true);
    ability.setPosition(padding, abilityBodyY);
    container.add([abilityTitle, ability]);
    if (passiveTitle && passive) {
      passiveTitle.setPosition(padding, passiveTitleY).setVisible(true);
      passive.setPosition(padding, passiveBodyY);
      container.add([passiveTitle, passive]);
    }
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private showTraitTooltip(traitId: keyof typeof TRAITS, pointer?: Phaser.Input.Pointer) {
    this.clearTooltip();
    const trait = TRAITS[traitId];
    const status = this.bridge.engine.getTraitStatus(traitId);
    const { width, scale } = this.tooltipMetrics(416);
    const { padding, title, body } = TOOLTIP_TYPOGRAPHY;
    const contentWidth = width - padding * 2;
    const thresholds = trait.thresholds.map((threshold, index) => `${status.count >= threshold ? "◆" : "◇"} ${threshold} 名：${trait.bonuses[index]}`).join("\n");
    const description = this.boundedText(trait.description, contentWidth, this.isCompact() ? 5 : 6, body, "#a9bfcc", { lineSpacing: 5 });
    const thresholdText = this.boundedText(thresholds, contentWidth, this.isCompact() ? 6 : 7, body, "#dcefff", { lineSpacing: 6 });
    const descriptionY = padding + title + 10;
    const thresholdY = descriptionY + description.height + 12;
    const height = Math.max(234, thresholdY + thresholdText.height + padding);
    const { x, y } = this.tooltipPosition(pointer, width * scale, height * scale, 300, scale);
    const container = this.add.container(x, y).setScale(scale);
    container.add(this.panel(0, 0, width, height, 0x07111b, 0.98, Phaser.Display.Color.HexStringToColor(trait.color).color));
    container.add(this.text(padding, padding - 2, `${trait.name} · ${status.count}/${status.maxThreshold}`, title, "#f1f8ff", { fontStyle: "bold" }));
    description.setPosition(padding, descriptionY);
    thresholdText.setPosition(padding, thresholdY);
    container.add([description, thresholdText]);
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private showEnemyTraitTooltip(
    traitId: keyof typeof TRAITS,
    count: number,
    level: number,
    pointer?: Phaser.Input.Pointer,
  ) {
    this.clearTooltip();
    const trait = TRAITS[traitId];
    const { width, scale } = this.tooltipMetrics(416);
    const { padding, title, body, section } = TOOLTIP_TYPOGRAPHY;
    const contentWidth = width - padding * 2;
    const description = this.boundedText(trait.description, contentWidth, this.isCompact() ? 5 : 4, body, "#a9bfcc", { lineSpacing: 5 });
    const thresholds = trait.thresholds
      .map((threshold, index) => `${count >= threshold ? "◆" : "◇"} ${threshold} 名：${trait.bonuses[index]}`)
      .join("\n");
    const thresholdText = this.boundedText(thresholds, contentWidth, this.isCompact() ? 6 : 7, body, "#dcefff", { lineSpacing: 6 });
    const descriptionY = padding + title + 34;
    const thresholdY = descriptionY + description.height + 12;
    const height = Math.max(242, thresholdY + thresholdText.height + padding);
    const { x, y } = this.tooltipPosition(pointer, width * scale, height * scale, 300, scale);
    const { color } = Phaser.Display.Color.HexStringToColor(trait.color);
    const container = this.add.container(x, y).setScale(scale);
    container.add(this.panel(0, 0, width, height, 0x07111b, 0.98, color));
    container.add(this.text(padding, padding - 2, `敌方羁绊 · ${trait.name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][level]}`, title, "#f1f8ff", { fontStyle: "bold" }));
    container.add(this.text(padding, padding + title + 8, `当前 ${count} 名 · ${level} 档生效`, section, trait.color, { fontStyle: "bold" }));
    description.setPosition(padding, descriptionY);
    thresholdText.setPosition(padding, thresholdY);
    container.add([description, thresholdText]);
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private showStarterTooltip(starter: (typeof STARTERS)[number], pointer?: Phaser.Input.Pointer) {
    this.clearTooltip();
    const { width, scale } = this.tooltipMetrics(390);
    const { padding, title, body, section } = TOOLTIP_TYPOGRAPHY;
    const contentWidth = width - padding * 2;
    const description = this.boundedText(starter.description, contentWidth, this.isCompact() ? 5 : 4, body, "#d7e6ed", { lineSpacing: 5 });
    const descriptionY = padding + title + 32;
    const height = Math.max(158, descriptionY + description.height + padding);
    const { x, y } = this.tooltipPosition(pointer, width * scale, height * scale, 250, scale);
    const { color } = Phaser.Display.Color.HexStringToColor(starter.color);
    const container = this.add.container(x, y).setScale(scale);
    container.add(this.panel(0, 0, width, height, 0x07111b, 0.98, color));
    container.add(this.text(padding, padding - 3, starter.icon, title + 2, "#ffffff", {
      fontFamily: PROJECTILE_EMOJI_FONT,
    }));
    container.add(this.text(padding + 34, padding - 2, starter.name, title, "#f1f8ff", { fontStyle: "bold" }));
    container.add(this.text(padding, padding + title + 10, `开局天赋 · ${starter.subtitle}`, section, starter.color, { fontStyle: "bold" }));
    description.setPosition(padding, descriptionY);
    container.add(description);
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private showAugmentTooltip(entry: AugmentHistoryEntry, pointer?: Phaser.Input.Pointer) {
    this.clearTooltip();
    const { augment, rounds } = entry;
    const { width, scale } = this.tooltipMetrics(390);
    const { padding, title, body, section } = TOOLTIP_TYPOGRAPHY;
    const contentWidth = width - padding * 2;
    const description = this.boundedText(augment.description, contentWidth, this.isCompact() ? 5 : 4, body, "#d7e6ed", { lineSpacing: 5 });
    const historyLabel = `第 ${rounds.join("、")} 战获得${rounds.length > 1 ? ` · 已叠加 ${rounds.length} 次` : ""}`;
    const descriptionY = padding + title + 42;
    const height = Math.max(174, descriptionY + description.height + padding);
    const { x, y } = this.tooltipPosition(pointer, width * scale, height * scale, 250, scale);
    const { color } = Phaser.Display.Color.HexStringToColor(augment.color);
    const container = this.add.container(x, y).setScale(scale);
    container.add(this.panel(0, 0, width, height, 0x07111b, 0.98, color));
    container.add(this.text(padding, padding - 3, augment.icon, title + 2, "#ffffff", {
      fontFamily: PROJECTILE_EMOJI_FONT,
    }));
    container.add(this.text(padding + 34, padding - 2, augment.name, title, "#f1f8ff", { fontStyle: "bold" }));
    container.add(this.text(padding, padding + title + 11, `${AUGMENT_TIER_LABELS[augment.tier]} · ${augment.kicker}`, section, augment.color, { fontStyle: "bold" }));
    container.add(this.text(padding, padding + title + 28, historyLabel, 10, "#7898aa", { fontStyle: "bold" }));
    description.setPosition(padding, descriptionY);
    container.add(description);
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private clearTooltip() {
    if (!this.tooltipLayer) {
      this.pinnedTooltip = null;
      return;
    }
    this.tooltipLayer.getAll("name", "tooltip").forEach((item) => item.destroy());
    this.pinnedTooltip = null;
  }
}
