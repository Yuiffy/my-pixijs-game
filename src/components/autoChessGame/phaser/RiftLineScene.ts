import Phaser from "phaser";
import type { UnitId } from "../core/gameData";
import {
  ABILITY_CAST_TIMING_LABELS,
  AUGMENTS,
  AUGMENT_TIER_LABELS,
  CAMPAIGN_ROUNDS,
  ENERGY_PROFILES,
  SHOP_UNITS,
  STARTERS,
  TRAITS,
  UNIT_DEFS,
  MAX_PLAYER_LEVEL,
  PLAYER_LEVEL_CONFIG,
  abilityDescriptionForStar,
  augmentTierForRound,
  describeAbilityStarGrowth,
  bookLevelForPlayerLevel,
  tierOddsForLevel,
} from "../core/gameData";
import type {
  BattleEffect,
  Fighter,
  MechanicalRabbitPet,
  OwnedUnit,
  PineTreeTurret,
  Projectile,
  RankingMetric,
  UnitLocation,
} from "../core/gameTypes";
import { fighterVisualRadius, mechanicalRabbitMuzzle } from "../core/battleGeometry";
import { EngineBridge, type GameAction } from "./EngineBridge";
import {
  circularTextureKeyForUnit,
  createCircularPortraitTextures,
  createFallbackTextures,
  preloadUnitPortraits,
  textureKeyForUnit,
} from "./assets";
import {
  COMPACT_RESULT_LAYOUT,
  COMPACT_TRAIT_STRIP,
  MOBILE_BENCH_PANEL,
  MOBILE_BOARD_PANEL,
  MOBILE_TRAIT_STRIP,
  MOBILE_SHOP_PANEL,
  MOBILE_TOUCH_TARGET,
  PREPARATION_BENCH_PANEL,
  PREPARATION_BOARD_PANEL,
  PREPARATION_SELL_ZONE,
  PREPARATION_SHOP_PANEL,
  WIDE_RESULT_LAYOUT,
  WIDE_TRAIT_STRIP,
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
  titleLayoutFor,
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

type ResultRowLayout = {
  height: number;
  portraitRadius: number;
  nameSize: number;
  detailSize: number;
};

const resultMetricLabel: Record<RankingMetric, string> = {
  damage: "输出",
  support: "治疗/护盾",
  taken: "承伤",
};

const short = (value: number) => (value < 1000 ? `${Math.round(value)}` : `${(value / 1000).toFixed(1)}k`);

const BURST_GRADIENT_TEXTURE = "rift-burst-gradient";
const TITLE_GLOW_TEXTURE = "rift-title-glow";
const PROJECTILE_EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", sans-serif';

const projectileEmoji = (projectile: Projectile) => {
  if (projectile.emoji) return projectile.emoji;
  if (projectile.style === "shark") return "🦈";
  if (projectile.style === "carrot") return "🥕";
  if (projectile.style === "coin") return "🪙";
  if (projectile.style === "lollipop") return "🍭";
  if (projectile.style === "fireball") return "🔥";
  return "";
};

export class RiftLineScene extends Phaser.Scene {
  private readonly bridge: EngineBridge;

  private phaseLayer!: Phaser.GameObjects.Container;

  private entityLayer!: Phaser.GameObjects.Container;

  private effectsLayer!: Phaser.GameObjects.Container;

  private overlayLayer!: Phaser.GameObjects.Container;

  private tooltipLayer!: Phaser.GameObjects.Container;

  private headerLayer!: Phaser.GameObjects.Container;

  private phase = "";

  private profile: LayoutProfile = "wide";

  /** Used only by unreachable legacy mobile drawing helpers. */
  private mobilePage = 0;

  private fighterViews = new Map<string, Phaser.GameObjects.Container>();

  private dragState: DragState | null = null;

  private sellDropZoneGraphics: Phaser.GameObjects.Graphics | null = null;

  private sellDropZoneLabel: Phaser.GameObjects.Text | null = null;

  private traitOffset = 0;

  private traitDrag: TraitDragState | null = null;

  private pinnedTooltip: UnitId | null = null;

  private textResolution = 2;

  private projectileViews = new Map<Projectile, Phaser.GameObjects.Container>();

  private effectViews = new Map<BattleEffect, Phaser.GameObjects.Container>();

  private petViews = new Map<string, Phaser.GameObjects.Container>();

  private treeViews = new Map<string, Phaser.GameObjects.Container>();

  private buttonViews: Phaser.GameObjects.Container[] = [];

  private battleTimerText: Phaser.GameObjects.Text | null = null;

  private battleTimerPanel: Phaser.GameObjects.Graphics | null = null;

  private battleBannerText: Phaser.GameObjects.Text | null = null;

  private rankingLayer: Phaser.GameObjects.Container | null = null;

  private rankingStateKey = "";

  /** 战斗统计面板展开时的刷新计时（秒） */
  private rankingRefreshAccum = 0;

  private static readonly RANKING_REFRESH_INTERVAL = 1;

  private traitContent: Phaser.GameObjects.Container | null = null;

  private traitFade: Phaser.GameObjects.Graphics | null = null;

  private traitMinimumOffset = 0;

  private traitEntries: Array<{ trait: (typeof TRAITS)[keyof typeof TRAITS]; status: { count: number; level: number; active: boolean; maxThreshold: number }; label: string; width: number }> = [];

  constructor(bridge: EngineBridge) {
    super({ key: "RiftLineScene" });
    this.bridge = bridge;
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
    this.createBurstGradientTexture();
    this.createTitleGlowTexture();
    this.input.setTopOnly(true);
    this.game.canvas.addEventListener("contextmenu", this.preventContextMenu);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancelDrag, this);
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
    this.input.keyboard?.on("keydown-R", () => this.dispatch({ type: "reroll" }));
    this.input.keyboard?.on("keydown-SPACE", () => this.dispatch({ type: "battle" }));
    this.input.keyboard?.on("keydown-D", () => this.dispatch({ type: "rankingToggle" }));
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.pinnedTooltip) this.clearTooltip();
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

  private dispatch(action: GameAction) {
    this.bridge.dispatch(action);
    this.rebuild();
  }

  private preventContextMenu = (event: Event) => event.preventDefault();

  private disposeSceneInput() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancelDrag, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.handlePointerWheel, this);
    this.input.keyboard?.off("keydown-R");
    this.input.keyboard?.off("keydown-SPACE");
    this.input.keyboard?.off("keydown-D");
    this.input.keyboard?.off("keydown-ESC");
    this.game.canvas.removeEventListener("contextmenu", this.preventContextMenu);
  }

  private handleResize() {
    this.profile = this.profileForViewport();
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
    this.cameras.main
      .setViewport(0, 0, width, height)
      .setZoom(fitScale)
      .centerOn(logical.width / 2, logical.height / 2);
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
    this.effectViews.clear();
    this.petViews.clear();
    this.treeViews.clear();
    this.buttonViews.forEach((button) => button.destroy());
    this.buttonViews = [];
    this.battleTimerText = null;
    this.battleTimerPanel = null;
    this.battleBannerText = null;
    this.rankingLayer = null;
    this.rankingStateKey = "";
    this.rankingRefreshAccum = 0;
    this.traitContent = null;
    this.traitFade = null;
    this.traitEntries = [];
    this.pinnedTooltip = null;
    this.sellDropZoneGraphics = null;
    this.sellDropZoneLabel = null;
  }

  private rebuild() {
    this.profile = this.profileForViewport();
    this.syncLogicalCamera();
    this.resetLayers();
    this.phase = this.bridge.engine.state.phase;
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
    this.textResolution = Math.min(MAX_TEXT_RESOLUTION, 2, Math.ceil(devicePixelRatio));
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

  private drawHeader() {
    const { state, boardCap, boardCount } = this.bridge.engine;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x050c14, 0.92);
    graphics.fillRect(0, 0, WORLD_WIDTH, 78);
    graphics.lineStyle(1, 0x39627a, 0.45);
    graphics.lineBetween(0, 77, WORLD_WIDTH, 77);
    this.headerLayer.add(graphics);
    this.headerLayer.add(this.text(28, 16, "裂隙阵线", 23, "#f1f8ff", { fontStyle: "bold" }));
    this.headerLayer.add(this.text(30, 47, state.endlessUnlocked ? "RIFT LINE · 无限裂隙" : "RIFT LINE · 八战远征", 10, "#79a1b7", { fontStyle: "bold" }));
    if (state.phase === "title") {
      this.headerLayer.add(this.text(1088, 30, `最高纪录 ${state.bestScore.toLocaleString()}`, 14, "#91aabd").setOrigin(1, 0.5));
      return;
    }
    const label = state.round > CAMPAIGN_ROUNDS ? `∞ 第 ${state.round} 层` : `第 ${state.round}/${CAMPAIGN_ROUNDS} 战`;
    this.headerLayer.add(this.text(465, 28, label, 15, "#d8efff", { fontStyle: "bold" }).setOrigin(0.5));
    this.headerLayer.add(this.text(770, 18, `核心 ${state.hp}/${state.maxHp}`, 11, "#afc3d1"));
    const health = this.add.graphics();
    health.fillStyle(0x1a2b38, 1).fillRoundedRect(770, 38, 120, 11, 5);
    health.fillStyle(0xff718b, 1).fillRoundedRect(770, 38, 120 * (state.hp / state.maxHp), 11, 5);
    this.headerLayer.add(health);
    this.headerLayer.add(this.text(1010, 18, "积分", 10, "#8ba3b5"));
    this.headerLayer.add(this.text(1010, 37, state.score.toLocaleString(), 18, "#e0f0fc", { fontStyle: "bold" }));
    this.headerLayer.add(this.text(580, 52, `${bookLevelForPlayerLevel(state.playerLevel)} 本 · 上阵 ${boardCount}/${boardCap}`, 10, "#84b8d5").setOrigin(0.5));
  }

  private drawTitle() {
    const { state } = this.bridge.engine;
    const layout = titleLayoutFor(this.profile);
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, layout.eyebrowY, "守住八次冲击。每一次购买，都该改变你的答案。", 15, TITLE.eyebrow).setOrigin(0.5));
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, layout.titleY, "裂 隙 阵 线", 48, "#f4f9ff", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, layout.summaryY, "轻量构筑 · 自动战斗 · 一局约 8 分钟", 13, TITLE.summary, { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, layout.promptY, "选择一项开局协议", 11, TITLE.prompt).setOrigin(0.5));

    state.starterChoices.forEach((id, index) => {
      const starter = STARTERS.find((item) => item.id === id);
      if (!starter) return;
      const x = layout.cardXs[index];
      const y = layout.cardY;
      const accent = Phaser.Display.Color.HexStringToColor(starter.color).color;
      const accentColor = Phaser.Display.Color.IntegerToColor(accent);
      const ctaFill = Phaser.Display.Color.GetColor(Math.round(accentColor.red * 0.46), Math.round(accentColor.green * 0.46), Math.round(accentColor.blue * 0.46));
      const ctaHover = Phaser.Display.Color.GetColor(Math.min(255, Math.round(accentColor.red * 1.14 + 18)), Math.min(255, Math.round(accentColor.green * 1.14 + 18)), Math.min(255, Math.round(accentColor.blue * 1.14 + 18)));
      const container = this.add.container(x, y);
      const cardPanel = this.add.graphics();
      const cta = this.add.graphics();
      const ctaWidth = layout.cardWidth - 124;
      const ctaX = (layout.cardWidth - ctaWidth) / 2;
      const ctaText = this.text(layout.cardWidth / 2, layout.ctaY + 16, "选择协议", 12, TITLE.ctaText, { fontStyle: "bold" }).setOrigin(0.5);
      const drawCard = (hover = false) => {
        cardPanel.clear();
        cardPanel.fillGradientStyle(TITLE.cardTop, TITLE.cardTop, TITLE.cardBottom, TITLE.cardBottom, 0.98);
        cardPanel.fillRoundedRect(0, 0, layout.cardWidth, layout.cardHeight, 20);
        if (hover) cardPanel.fillStyle(accent, TITLE.cardHoverOverlay).fillRoundedRect(0, 0, layout.cardWidth, layout.cardHeight, 20);
        cardPanel.lineStyle(hover ? 2 : 1, accent, hover ? 1 : TITLE.cardBorderAlpha).strokeRoundedRect(0, 0, layout.cardWidth, layout.cardHeight, 20);
        cta.clear();
        cta.fillStyle(hover ? ctaHover : ctaFill, 1).fillRoundedRect(ctaX, layout.ctaY, ctaWidth, 32, 12);
        cta.lineStyle(1, accent, hover ? 1 : 0.84).strokeRoundedRect(ctaX, layout.ctaY, ctaWidth, 32, 12);
        ctaText.setText(hover ? "点击接入并开始" : "选择协议").setColor(hover ? TITLE.ctaHoverText : TITLE.ctaText);
      };
      drawCard();
      const portrait = this.createPortrait(starter.unit, layout.cardWidth / 2, layout.portraitY, 35);
      const description = this.boundedText(starter.description, layout.descriptionWidth, 2, 12, TITLE.description, { align: "center", lineSpacing: 4 });
      description.setPosition(layout.cardWidth / 2, layout.descriptionY).setOrigin(0.5, 0);
      const zone = this.add.zone(layout.cardWidth / 2, layout.cardHeight / 2, layout.cardWidth, layout.cardHeight).setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.POINTER_OVER, () => { container.setY(y - 5); drawCard(true); });
      zone.on(Phaser.Input.Events.POINTER_OUT, () => { container.setY(y); drawCard(false); });
      zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch({ type: "starter", id }));
      container.add([
        cardPanel,
        portrait,
        this.text(layout.cardWidth / 2, layout.subtitleY, starter.subtitle, 11, starter.color, { fontStyle: "bold" }).setOrigin(0.5),
        this.text(layout.cardWidth / 2, layout.nameY, starter.name, 21, "#f3f8ff", { fontStyle: "bold" }).setOrigin(0.5),
        description,
        cta,
        ctaText,
        zone,
      ]);
      this.phaseLayer.add(container);
    });
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, layout.seedY, `本局战术种子 · ${String(state.seed % 100000).padStart(5, "0")}`, 11, TITLE.seed).setOrigin(0.5));
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, layout.controlsY, "操作：点击购买与移动 · 右键快速回收 · R 刷新 · Space 开战 · F 全屏", 10, TITLE.controls).setOrigin(0.5));
  }

  private drawMobileTitle() {
    const { state } = this.bridge.engine;
    const choiceCount = state.starterChoices.length;
    if (!choiceCount) return;
    const index = Phaser.Math.Clamp(this.mobilePage, 0, choiceCount - 1);
    const starter = STARTERS.find((item) => item.id === state.starterChoices[index]);
    if (!starter) return;
    const accent = Phaser.Display.Color.HexStringToColor(starter.color).color;
    const card = this.add.container(16, 212);
    card.add(this.panel(0, 0, 448, 418, 0x112331, 0.98, accent));
    card.add(this.createPortrait(starter.unit, 224, 70, 48));
    card.add(this.text(224, 136, starter.subtitle, 15, starter.color, { fontStyle: "bold" }).setOrigin(0.5));
    card.add(this.text(224, 170, starter.name, 26, "#f3f8ff", { fontStyle: "bold" }).setOrigin(0.5));
    const description = this.boundedText(starter.description, 364, 3, 16, TITLE.description, { align: "center", lineSpacing: 6 });
    description.setPosition(224, 210).setOrigin(0.5, 0);
    card.add(description);
    this.phaseLayer.add(this.text(240, 132, "选择开局协议", 17, TITLE.eyebrow, { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(240, 168, "为手机操作优化的纵向布局", 12, TITLE.summary).setOrigin(0.5));
    this.button(54, 522, 372, MOBILE_TOUCH_TARGET, "选择协议并开始", { type: "starter", id: starter.id }, { tone: "confirm" });
    card.add(this.text(224, 356, `${index + 1} / ${choiceCount}`, 14, "#a8c0cf", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(card);
    if (choiceCount > 1) {
      this.button(32, 644, 188, MOBILE_TOUCH_TARGET, "上一项", undefined, { tone: "neutral", enabled: index > 0, secondary: "浏览" }, DEPTH.board, () => {
        this.mobilePage = Math.max(0, this.mobilePage - 1);
        this.rebuild();
      });
      this.button(260, 644, 188, MOBILE_TOUCH_TARGET, "下一项", undefined, { tone: "neutral", enabled: index < choiceCount - 1, secondary: "浏览" }, DEPTH.board, () => {
        this.mobilePage = Math.min(choiceCount - 1, this.mobilePage + 1);
        this.rebuild();
      });
    }
    this.phaseLayer.add(this.text(240, 734, `战术种子 · ${String(state.seed % 100000).padStart(5, "0")}`, 12, TITLE.seed).setOrigin(0.5));
    this.phaseLayer.add(this.text(240, 766, "点击卡片或按钮选择；部署棋子后可开始战斗", 12, TITLE.controls).setOrigin(0.5));
  }

  private drawPreparationPanel(x: number, y: number, width: number, height: number) {
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x132736, 0x132736, 0x101929, 0x101929, 0.94);
    graphics.fillRoundedRect(x, y, width, height, 18);
    graphics.lineStyle(1, 0x66b6e0, 0.25).strokeRoundedRect(x, y, width, height, 18);
    return graphics;
  }

  private drawCanvasPreparation() {
    const { state, boardCount, boardCap } = this.bridge.engine;
    const compact = this.isCompact();
    this.phaseLayer.add(this.drawPreparationPanel(PREPARATION_BOARD_PANEL.x, PREPARATION_BOARD_PANEL.y, PREPARATION_BOARD_PANEL.width, PREPARATION_BOARD_PANEL.height));
    state.board.forEach((unit, index) => this.drawSlot("board", index, unit, compact));
    if (!compact) {
      this.phaseLayer.add(this.drawPreparationPanel(PREPARATION_BENCH_PANEL.x, PREPARATION_BENCH_PANEL.y, PREPARATION_BENCH_PANEL.width, PREPARATION_BENCH_PANEL.height));
      this.phaseLayer.add(this.text(48, 570, `备战席  ${state.bench.filter(Boolean).length}/${state.bench.length}`, 12, "#9cb3c3"));
      this.phaseLayer.add(this.text(612, 570, `${bookLevelForPlayerLevel(state.playerLevel)} 本 · 上阵 ${boardCount}/${boardCap}`, 11, "#72d8ff").setOrigin(1, 0));
      state.bench.forEach((unit, index) => this.drawSlot("bench", index, unit, false));
    }
  }

  private drawPreparation() {
    const { engine } = this.bridge;
    const { state, currentWave } = engine;
    const compact = this.isCompact();
    this.phaseLayer.add(this.drawPreparationPanel(PREPARATION_BOARD_PANEL.x, PREPARATION_BOARD_PANEL.y, PREPARATION_BOARD_PANEL.width, PREPARATION_BOARD_PANEL.height));
    const waveLabel = currentWave.tag === "boss" ? "BOSS" : currentWave.tag === "elite" ? "ELITE" : `WAVE ${currentWave.round}`;
    const waveColor = currentWave.tag === "boss" ? "#ff8ba7" : currentWave.tag === "elite" ? "#ffc35b" : "#72d8ff";
    this.phaseLayer.add(this.text(48, 116, waveLabel, 10, waveColor, { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(48, 136, this.truncateText(currentWave.name, compact ? 680 : 470, 20, { fontStyle: "bold" }), 20, "#f1f7ff", { fontStyle: "bold" }));
    const description = this.boundedText(currentWave.description, compact ? 680 : 470, 2, 11, "#91aab9", { lineSpacing: 2 });
    description.setPosition(48, 158);
    this.phaseLayer.add(description);
    if (!compact) {
      this.phaseLayer.add(this.text(536, 124, "敌情预览 · 悬浮查看技能", 9, "#e89aaa", { fontStyle: "bold" }));
      currentWave.units.slice(0, 7).forEach((waveUnit, index) => {
        const x = 554 + index * 29;
        const star = waveUnit.star ?? 1;
        const portrait = this.createPortrait(waveUnit.id, x, 158, 12, true);
        const zone = this.add.zone(x, 158, 28, 28).setInteractive({ useHandCursor: true });
        zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(waveUnit.id, pointer, star));
        zone.on(Phaser.Input.Events.POINTER_OUT, () => this.clearTooltip());
        this.phaseLayer.add([portrait, zone]);
      });
    }
    this.drawTraits();
    const augmentSummary = state.augmentHistory.length
      ? state.augmentHistory.map(({ round, id }) => `${round}战·${AUGMENTS.find((augment) => augment.id === id)?.name ?? id}`).join(" · ")
      : "第 2 战后可选择首个小天赋";
    this.phaseLayer.add(this.text(compact ? 708 : 748, compact ? 226 : 184, this.truncateText(augmentSummary, compact ? 360 : 330, 9), 9, "#8ea8b9").setOrigin(compact ? 0 : 1));
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
    state.board.forEach((unit, index) => this.drawSlot("board", index, unit, false));
    state.bench.forEach((unit, index) => this.drawSlot("bench", index, unit, false));
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
    this.phaseLayer.add(this.drawPreparationPanel(MOBILE_BOARD_PANEL.x, MOBILE_BOARD_PANEL.y, MOBILE_BOARD_PANEL.width, MOBILE_BOARD_PANEL.height));
    this.phaseLayer.add(this.drawPreparationPanel(MOBILE_BENCH_PANEL.x, MOBILE_BENCH_PANEL.y, MOBILE_BENCH_PANEL.width, MOBILE_BENCH_PANEL.height));
    const waveLabel = currentWave.tag === "boss" ? "BOSS" : currentWave.tag === "elite" ? "ELITE" : `WAVE ${currentWave.round}`;
    const waveColor = currentWave.tag === "boss" ? "#ff8ba7" : currentWave.tag === "elite" ? "#ffc35b" : "#72d8ff";
    this.phaseLayer.add(this.text(16, 108, `${waveLabel} · ${this.truncateText(currentWave.name, 292, 14, { fontStyle: "bold" })}`, 14, waveColor, { fontStyle: "bold" }));
    this.drawTraits();
    this.phaseLayer.add(this.text(24, 178, `部署区 · ${engine.boardCount}/${engine.boardCap}`, 12, "#8ce8bd", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(24, 434, `备战席 · ${state.bench.filter(Boolean).length}/${state.bench.length}`, 12, "#9cb3c3", { fontStyle: "bold" }));
    state.board.forEach((unit, index) => this.drawSlot("board", index, unit, true));
    state.bench.forEach((unit, index) => this.drawSlot("bench", index, unit, true));
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
      const width = Math.max(72, Math.ceil(probe.width) + 34);
      probe.destroy();
      return { trait, status, label, width };
    });
    const gap = 6;
    const contentWidth = Math.max(0, this.traitEntries.reduce((total, entry) => total + entry.width + gap, 0) - gap);
    this.traitMinimumOffset = Math.min(0, strip.width - contentWidth);
    this.traitOffset = Phaser.Math.Clamp(this.traitOffset, this.traitMinimumOffset, 0);

    const maskGraphics = this.add.graphics().setVisible(false);
    maskGraphics.fillStyle(0xffffff).fillRect(strip.x, strip.y, strip.width, strip.height);
    const content = this.add.container(strip.x + this.traitOffset, strip.y);
    content.setMask(maskGraphics.createGeometryMask());
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
    this.phaseLayer.add([maskGraphics, content, zone]);
    this.updateTraitViewport();
  }

  private traitEntryAt<T extends { width: number }>(entries: T[], gap: number, strip: { x: number; width: number }, pointerX: number) {
    const localX = pointerX - strip.x - this.traitOffset;
    let cursor = 0;
    return entries.find((entry) => {
      const hit = localX >= cursor && localX <= cursor + entry.width;
      cursor += entry.width + gap;
      return hit;
    });
  }

  private updateTraitViewport() {
    const strip = this.traitStrip();
    this.traitContent?.setX(strip.x + this.traitOffset);
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

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    const logical = this.logicalPointer(pointer);
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
    if (this.phase !== "preparation" || this.traitMinimumOffset === 0) return;
    const strip = this.traitStrip();
    const logical = this.logicalPointer(pointer);
    if (logical.x < strip.x || logical.x > strip.x + strip.width || logical.y < strip.y || logical.y > strip.y + strip.height) return;
    this.traitOffset = Phaser.Math.Clamp(this.traitOffset - deltaY * 0.35, this.traitMinimumOffset, 0);
    this.updateTraitViewport();
    this.updateTraitTooltip(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
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

  private traitActivatesAfterPurchase(unitId: UnitId, traitId: keyof typeof TRAITS) {
    const { engine } = this.bridge;
    const status = engine.getTraitStatus(traitId);
    if (status.active) return false;
    const threshold = TRAITS[traitId].thresholds[status.level];
    return status.count + 1 >= threshold && !engine.state.board.some((unit) => unit?.id === unitId);
  }

  private createShopTraitTags(unitId: UnitId, x: number, y: number, maxX: number, affordable: boolean, compact = false) {
    const container = this.add.container(x, y);
    const fontSize = 10;
    const tagHeight = compact ? 20 : 21;
    const horizontalPadding = compact ? 14 : 16;
    let cursor = 0;
    UNIT_DEFS[unitId].traits.forEach((traitId) => {
      const { [traitId]: trait } = TRAITS;
      const status = this.bridge.engine.getTraitStatus(traitId);
      const completes = this.traitActivatesAfterPurchase(unitId, traitId);
      const label = trait.name;
      const labelText = this.text(0, 0, label, fontSize, "#ffffff", { fontStyle: "bold" });
      const width = Math.ceil(labelText.width) + horizontalPadding;
      labelText.destroy();
      if (x + cursor + width > maxX) return;
      const { color } = Phaser.Display.Color.HexStringToColor(trait.color);
      const { active } = status;
      const graphic = this.add.graphics();
      graphic.fillStyle(active || (completes && affordable) ? color : 0x142735, active ? 0.22 : completes && affordable ? 0.38 : 0.9);
      graphic.fillRoundedRect(cursor, 0, width, tagHeight, tagHeight / 2);
      graphic.lineStyle(completes && affordable ? 1.5 : 1, active || (completes && affordable) ? color : 0x395467, 1);
      graphic.strokeRoundedRect(cursor, 0, width, tagHeight, tagHeight / 2);
      const text = this.text(cursor + width / 2, tagHeight / 2, label, fontSize, active || (completes && affordable) ? "#f4fbff" : "#b3c7d1", { fontStyle: "bold" }).setOrigin(0.5);
      container.add([graphic, text]);
      cursor += width + 4;
    });
    return container;
  }

  private ownedUnitStars(unitId: UnitId) {
    const { state } = this.bridge.engine;
    const stars: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    [...state.board, ...state.bench].forEach((unit) => {
      if (unit?.id === unitId) stars[unit.star] += 1;
    });
    return stars;
  }

  private addShopOwnedCue(item: Phaser.GameObjects.Container, unitId: UnitId, stars: Record<1 | 2 | 3, number>, compact: boolean) {
    const total = stars[1] + stars[2] + stars[3];
    if (total <= 0) return;
    const accent = Phaser.Display.Color.HexStringToColor(UNIT_DEFS[unitId].accent).color;
    const portraitX = compact ? 27 : 31;
    const portraitY = compact ? 33 : 34;
    const halo = this.add.circle(portraitX, portraitY, compact ? 25 : 27, accent, 0.08);
    const ring = this.add.graphics();
    ring.lineStyle(1.5, accent, 0.82).strokeCircle(portraitX, portraitY, compact ? 24 : 26);
    item.add([halo, ring]);
    this.tweens.add({
      targets: [halo, ring],
      alpha: { from: 0.2, to: 0.72 },
      duration: 900,
      ease: "Sine.inOut",
      repeat: -1,
      yoyo: true,
    });
    const badgeX = compact ? 90 : 150;
    const badgeY = compact ? 4 : 8;
    const badgeWidth = compact ? 72 : 74;
    const starEntries = ([3, 2, 1] as const)
      .filter((star) => stars[star] > 0)
      .map((star) => `${star}星×${stars[star]}`);
    const labelText = starEntries.length === 1 && stars[1] === total
      ? `已有 ×${total}`
      : `已有 ${starEntries.join(" ")}`;
    const badge = this.add.graphics();
    badge.fillStyle(accent, 0.18).fillRoundedRect(badgeX, badgeY, badgeWidth, 16, 8);
    badge.lineStyle(1, accent, 0.8).strokeRoundedRect(badgeX, badgeY, badgeWidth, 16, 8);
    const label = this.text(badgeX + badgeWidth / 2, badgeY + 8, labelText, compact ? 7 : 8, "#f4fbff", { fontStyle: "bold" }).setOrigin(0.5);
    item.add([badge, label]);
  }

  private canBuyShopUnit(unitId: UnitId) {
    const { engine } = this.bridge;
    return engine.state.gold >= UNIT_DEFS[unitId].cost
      && (engine.boardCount < engine.boardCap || engine.state.bench.some((unit) => !unit));
  }

  private canReroll() {
    const { state } = this.bridge.engine;
    return state.gold >= 1 || state.freeRerollCharges > 0;
  }

  private drawWideShop() {
    const { state, isMaxPlayerLevel, upgradeCost } = this.bridge.engine;
    this.phaseLayer.add(this.panel(PREPARATION_SHOP_PANEL.x, PREPARATION_SHOP_PANEL.y, PREPARATION_SHOP_PANEL.width, PREPARATION_SHOP_PANEL.height, 0x08121c, 0.96, 0x6fbfeb));
    this.phaseLayer.add(this.text(812, 112, `战术商店 · ${bookLevelForPlayerLevel(state.playerLevel)} 本`, 16, "#f1f8ff", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(1076, 117, isMaxPlayerLevel ? "已满级" : `距 ${bookLevelForPlayerLevel(state.playerLevel) + 1} 本还需 ${upgradeCost} 金币`, 9, "#7593a5").setOrigin(1));
    this.phaseLayer.add(this.text(812, 131, tierOddsForLevel(state.playerLevel).map((chance, index) => (chance ? `${index + 1}费${chance}%` : "")).filter(Boolean).join(" · "), 9, "#8dc3e0", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(1076, 137, `金币 ${state.gold}`, 14, COLORS.gold, { fontStyle: "bold" }).setOrigin(1));
    state.shop.forEach((unitId, index) => {
      const y = 151 + index * 74;
      const item = this.add.container(810, y);
      const card = this.add.graphics();
      const ownedStars = unitId ? this.ownedUnitStars(unitId) : { 1: 0, 2: 0, 3: 0 };
      const hasOwned = ownedStars[1] + ownedStars[2] + ownedStars[3] > 0;
      card.fillStyle(unitId ? 0x11222f : 0x0a1620, unitId ? 0.92 : 0.8);
      card.fillRoundedRect(0, 0, 270, 70, 10);
      card.lineStyle(1, unitId ? 0x294658 : 0x203748, 1).strokeRoundedRect(0, 0, 270, 70, 10);
      item.add(card);
      if (unitId) {
        const def = UNIT_DEFS[unitId];
        const affordable = this.canBuyShopUnit(unitId);
        this.addShopOwnedCue(item, unitId, ownedStars, false);
        item.add(this.createPortrait(unitId, 31, 34, 20).setAlpha(affordable ? 1 : 0.48));
        const role = def.title.includes(" · ") ? def.title.split(" · ").at(-1) || def.title : def.title;
        item.add(this.text(62, 11, this.truncateText(def.name, hasOwned ? 82 : 138, 13, { fontStyle: "bold" }), 13, affordable ? "#edf7ff" : "#617888", { fontStyle: "bold" }));
        item.add(this.text(62, 29, this.truncateText(role, 158, 12), 12, affordable ? "#c3dbe7" : "#a1b8c4", { fontStyle: "bold" }));
        item.add(this.text(245, 22, `${def.cost}`, 22, affordable ? COLORS.gold : "#7e8e96", { fontStyle: "bold" }).setOrigin(0.5));
        item.add(this.createShopTraitTags(unitId, 62, 47, 242, affordable));
        const zone = this.add.zone(135, 34, 270, 68).setInteractive({ useHandCursor: affordable });
        const action = { type: "shop", index } satisfies GameAction;
        zone.setData("action", action);
        if (affordable) zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch(action));
        zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
          card.clear();
          const accent = Phaser.Display.Color.HexStringToColor(def.accent).color;
          card.fillStyle(accent, 0.12).fillRoundedRect(0, 0, 270, 70, 10);
          card.lineStyle(2, accent, 0.9).strokeRoundedRect(0, 0, 270, 70, 10);
          this.showUnitTooltip(unitId, pointer);
        });
        zone.on(Phaser.Input.Events.POINTER_OUT, () => {
          card.clear();
          card.fillStyle(0x11222f, 0.92).fillRoundedRect(0, 0, 270, 70, 10);
          card.lineStyle(1, 0x294658, 1).strokeRoundedRect(0, 0, 270, 70, 10);
          if (!this.isCompact()) this.clearTooltip();
        });
        item.add(zone);
      } else item.add(this.text(135, 34, "已征募", 12, "#547188").setOrigin(0.5));
      this.phaseLayer.add(item);
    });
    this.button(810, 530, 82, 48, isMaxPlayerLevel ? "已满级" : `升本 · ${upgradeCost}`, { type: "buyXp" }, { tone: "neutral", enabled: !isMaxPlayerLevel && state.gold >= (upgradeCost ?? Number.POSITIVE_INFINITY), secondary: isMaxPlayerLevel ? "MAX" : "一次付清" }, DEPTH.board);
    this.button(900, 530, 82, 22, state.shopLocked ? "已锁定" : "锁定商店", { type: "lock" }, { tone: "lock", selected: state.shopLocked }, DEPTH.board);
    this.button(900, 556, 82, 22, state.freeRerollCharges > 0 ? "刷新 · 免费" : "刷新 · 1", { type: "reroll" }, { tone: "economic", enabled: this.canReroll() }, DEPTH.board);
    // 商店面板下方说明：兵种规则、激活羁绊、利息计算、最新天赋
    this.phaseLayer.add(this.text(807, 622, `${SHOP_UNITS.length} 个兵种 · 同名三合一 · 羁绊同名只计一次`, 10, "#607d91"));
    const activeNames = this.bridge.engine
      .getActiveTraits()
      .map((trait) => `${trait.name}${["", "Ⅰ", "Ⅱ", "Ⅲ"][trait.level] ?? ""}`)
      .join(" · ");
    const interestRule = this.bridge.engine.getTraitStatus("finance").level >= 2
      ? "理财Ⅱ · 每 4 金币提供 1 利息（无上限）"
      : "每 5 金币提供 1 利息（20 金币封顶）";
    this.phaseLayer.add(
      this.text(
        807,
        647,
        this.truncateText(activeNames ? `已激活：${activeNames}` : "常规羁绊按 2/4/6；关系羁绊按图标说明", 270, 10, { fontStyle: "bold" }),
        10,
        activeNames ? "#7de2ff" : "#526d80",
        { fontStyle: "bold" },
      ),
    );
    this.phaseLayer.add(
      this.text(
        807,
        672,
        this.truncateText(`连胜 ${state.streak} · ${interestRule}`, 270, 10),
        10,
        "#7d94a4",
      ),
    );
    if (state.augmentHistory.length) {
      const latest = state.augmentHistory[state.augmentHistory.length - 1];
      const augment = AUGMENTS.find((item) => item.id === latest.id);
      this.phaseLayer.add(
        this.text(
          807,
          692,
          this.truncateText(`最新天赋（共 ${state.augmentHistory.length} 项）：第 ${latest.round} 战 · ${augment?.name || ""}`, 270, 9, { fontStyle: "bold" }),
          9,
          "#c9b1ee",
          { fontStyle: "bold" },
        ),
      );
    }
  }

  private drawCompactShop() {
    const { state, isMaxPlayerLevel, upgradeCost } = this.bridge.engine;
    this.phaseLayer.add(this.panel(24, 548, 1072, 112, 0x08131f));
    this.phaseLayer.add(this.text(46, 562, "商店 · 横向选择", 12, "#dcefff", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(218, 563, tierOddsForLevel(state.playerLevel).map((chance, index) => (chance ? `${index + 1}费${chance}%` : "")).filter(Boolean).join(" · "), 8, "#8dc3e0", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(1074, 563, isMaxPlayerLevel ? "已满级" : `距 ${bookLevelForPlayerLevel(state.playerLevel) + 1} 本还需 ${upgradeCost} 金币`, 8, "#7593a5").setOrigin(1));
    state.shop.forEach((unitId, index) => {
      const x = 46 + index * 211;
      const item = this.add.container(x, 578);
      item.add(this.panel(0, 0, 196, 66, 0x112431, unitId ? 0.95 : 0.55, 0x2d5064));
      if (unitId) {
        const def = UNIT_DEFS[unitId];
        const affordable = this.canBuyShopUnit(unitId);
        const ownedStars = this.ownedUnitStars(unitId);
        const hasOwned = ownedStars[1] + ownedStars[2] + ownedStars[3] > 0;
        this.addShopOwnedCue(item, unitId, ownedStars, true);
        item.add(this.createPortrait(unitId, 27, 33, 19).setAlpha(affordable ? 1 : 0.48));
        item.add(this.text(54, 10, this.truncateText(def.name, hasOwned ? 78 : 112, 12, { fontStyle: "bold" }), 12, affordable ? "#edf7ff" : "#718896", { fontStyle: "bold" }));
        item.add(this.text(174, 21, `${def.cost}`, 21, affordable ? COLORS.gold : "#7e8e96", { fontStyle: "bold" }).setOrigin(0.5));
        item.add(this.createShopTraitTags(unitId, 54, 45, 154, affordable, true));
        const zone = this.add.zone(98, 33, 196, 66).setInteractive({ useHandCursor: affordable });
        const action = { type: "shop", index } satisfies GameAction;
        zone.setData("action", action);
        if (affordable) zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch(action));
        zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(unitId, pointer));
        item.add(zone);
      }
      this.phaseLayer.add(item);
    });
  }

  private drawMobileShop() {
    const { state } = this.bridge.engine;
    this.phaseLayer.add(this.panel(MOBILE_SHOP_PANEL.x, MOBILE_SHOP_PANEL.y, MOBILE_SHOP_PANEL.width, MOBILE_SHOP_PANEL.height, 0x08121c, 0.98, 0x6fbfeb));
    this.phaseLayer.add(this.text(28, 618, "战术商店 · 左右翻页", 13, "#f1f8ff", { fontStyle: "bold" }));
    const available = state.shop.map((unitId, index) => ({ unitId, index })).filter((entry) => entry.unitId);
    if (!available.length) {
      this.phaseLayer.add(this.text(240, 666, "商店已售罄", 16, "#89a5b5").setOrigin(0.5));
      return;
    }
    const page = Phaser.Math.Clamp(this.mobilePage, 0, available.length - 1);
    const { unitId, index } = available[page];
    if (!unitId) return;
    const def = UNIT_DEFS[unitId];
    const affordable = this.canBuyShopUnit(unitId);
    const role = def.title.includes(" · ") ? def.title.split(" · ").at(-1) || def.title : def.title;
    this.phaseLayer.add(this.createPortrait(unitId, 56, 669, 29).setAlpha(affordable ? 1 : 0.56));
    this.phaseLayer.add(this.text(98, 638, this.truncateText(def.name, 252, 17, { fontStyle: "bold" }), 17, affordable ? "#edf7ff" : "#a0b2bc", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(98, 664, this.truncateText(role, 252, 13), 13, affordable ? "#c3dbe7" : "#9ab0bc"));
    this.phaseLayer.add(this.text(412, 650, `${def.cost}`, 28, affordable ? COLORS.gold : "#a0adb3", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.createShopTraitTags(unitId, 98, 684, 416, affordable, true));
    const cardZone = this.add.zone(240, 665, 348, 90).setInteractive({ useHandCursor: affordable });
    if (affordable) cardZone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch({ type: "shop", index }));
    this.phaseLayer.add(cardZone);
    this.button(24, 734, 92, MOBILE_TOUCH_TARGET, "上一张", undefined, { tone: "neutral", enabled: page > 0 }, DEPTH.board, () => {
      this.mobilePage = Math.max(0, page - 1);
      this.rebuild();
    });
    this.button(132, 734, 216, MOBILE_TOUCH_TARGET, `购买 · ${page + 1}/${available.length}`, { type: "shop", index }, { tone: "economic", enabled: affordable }, DEPTH.board);
    this.button(364, 734, 92, MOBILE_TOUCH_TARGET, "下一张", undefined, { tone: "neutral", enabled: page < available.length - 1 }, DEPTH.board, () => {
      this.mobilePage = Math.min(available.length - 1, page + 1);
      this.rebuild();
    });
  }

  private drawMobilePreparationActions() {
    const { state, isMaxPlayerLevel, upgradeCost, boardCount } = this.bridge.engine;
    const refund = this.selectedRefund();
    const canBuyXp = !isMaxPlayerLevel && state.gold >= (upgradeCost ?? Number.POSITIVE_INFINITY);
    this.button(16, 800, 448, MOBILE_TOUCH_TARGET, "开始战斗", { type: "battle" }, { tone: "confirm", enabled: boardCount > 0 });
    // Compact portrait hosts may crop this final row; it is deliberately positioned
    // below the shop and available when the browser gives the game full height.
    this.button(16, 866, 210, MOBILE_TOUCH_TARGET, isMaxPlayerLevel ? "已满级" : `升本 · ${upgradeCost}`, { type: "buyXp" }, { enabled: canBuyXp });
    this.button(254, 866, 210, MOBILE_TOUCH_TARGET, state.shopLocked ? "已锁定" : "锁定商店", { type: "lock" }, { tone: "lock", selected: state.shopLocked });
    this.button(16, 932, 210, MOBILE_TOUCH_TARGET, state.freeRerollCharges > 0 ? "刷新 · 免费" : "刷新 · 1", { type: "reroll" }, { tone: "economic", enabled: this.canReroll() });
    this.button(254, 932, 210, MOBILE_TOUCH_TARGET, state.selected ? `出售 +${refund}` : "选择后出售", { type: "sell" }, { tone: "danger", enabled: Boolean(state.selected) });
  }

  private selectedRefund() {
    const { selected } = this.bridge.engine.state;
    const unit = selected ? this.unitAt(selected) : null;
    return unit ? this.refundForUnit(unit) : 0;
  }

  private refundForUnit(unit: OwnedUnit) {
    return UNIT_DEFS[unit.id].cost * (unit.star === 3 ? 9 : unit.star === 2 ? 3 : 1);
  }

  private drawPreparationActions(compact: boolean) {
    const { state, isMaxPlayerLevel, upgradeCost, boardCount } = this.bridge.engine;
    const canBuyXp = !isMaxPlayerLevel && state.gold >= (upgradeCost ?? Number.POSITIVE_INFINITY);
    const canBattle = boardCount > 0;
    const refund = this.selectedRefund();
    if (compact) {
      this.button(42, 675, 190, 40, isMaxPlayerLevel ? "已满级" : `升本 · ${upgradeCost}`, { type: "buyXp" }, { enabled: canBuyXp, secondary: isMaxPlayerLevel ? "MAX" : "一次付清" });
      this.button(252, 675, 190, 40, state.shopLocked ? "已锁定商店" : "锁定商店", { type: "lock" }, { tone: "lock", selected: state.shopLocked });
      this.button(462, 675, 190, 40, state.freeRerollCharges > 0 ? "刷新商店 · 免费" : "刷新商店 · 1", { type: "reroll" }, { tone: "economic", enabled: this.canReroll() });
      this.button(672, 675, 190, 40, state.selected ? `回收 +${refund}` : "选择棋子后出售", { type: "sell" }, { tone: "danger", enabled: Boolean(state.selected) });
      this.button(882, 675, 196, 40, "开始战斗", { type: "battle" }, { tone: "confirm", enabled: canBattle, secondary: "SPACE" });
    } else {
      this.button(990, 530, 90, 48, "开始战斗", { type: "battle" }, { tone: "confirm", enabled: canBattle, secondary: "SPACE" });
      this.button(636, 553, 112, 34, state.selected ? `回收 +${refund}` : "选择棋子", { type: "sell" }, { tone: "danger", enabled: Boolean(state.selected) });
    }
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
    const container = this.add.container(fighter.x, fighter.y);
    const radius = fighter.radius || fighterVisualRadius(fighter.unitId, fighter.star);
    const shadow = this.add.ellipse(0, radius * 0.8, radius * 1.8, radius * 0.6, 0x000000, 0.3).setName("shadow");
    const shield = this.add.circle(0, 0, radius + 8, 0x6edeff, 0)
      .setStrokeStyle(2, 0xc6f7ff, 0)
      .setName("shield");
    const syncAura = this.add.circle(0, 0, radius + 13, 0x79dcff, 0).setName("syncAura");
    const hitFlash = this.add.circle(0, 0, radius, 0xff526f, 0).setName("hitFlash");
    const burn = this.add.circle(radius * 0.7, -radius * 0.55, 5, 0xff7a50, 0).setName("burn");
    const status = this.text(0, -radius - 8, "", 13, "#ffd95e", { fontFamily: PROJECTILE_EMOJI_FONT, fontStyle: "bold" }).setOrigin(0.5).setName("status");
    const portrait = this.createPortrait(fighter.unitId, 0, 0, radius, fighter.team === "enemy");
    portrait.setName("portrait");
    const hpBack = this.add.rectangle(0, radius + 10, radius * 2.25, 7, 0x152430).setName("hpBack");
    const hp = this.add.rectangle(-radius * 1.125, radius + 10, radius * 2.25, 7, fighter.team === "player" ? 0x52de9b : 0xff668a).setOrigin(0, 0.5).setName("hp");
    const energyBack = this.add.rectangle(0, radius + 20, radius * 2.25, 4, 0x14222d).setName("energyBack");
    const energy = this.add.rectangle(-radius * 1.125, radius + 20, radius * 2.25, 4, 0x8edfff).setOrigin(0, 0.5).setName("energy");
    const label = this.text(0, radius + 30, UNIT_DEFS[fighter.unitId].name, 9, fighter.team === "player" ? "#b8dcef" : "#efb1c3").setOrigin(0.5).setName("label");
    const star = this.text(0, radius + 30, "★".repeat(fighter.star), 9, "#ffdc68").setOrigin(0, 0.5).setName("star");
    const zone = this.add.zone(0, 0, radius * 2.4, radius * 2.4).setInteractive({ useHandCursor: true });
    zone.setData("fighter", fighter.fid);
    zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
    zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
    zone.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!this.isCompact()) this.clearTooltip();
    });
    container.add([shadow, syncAura, shield, portrait, hitFlash, burn, hpBack, hp, energyBack, energy, label, star, status, zone]);
    return container;
  }

  private updateFighter(view: Phaser.GameObjects.Container, fighter: Fighter) {
    const radius = fighter.radius || fighterVisualRadius(fighter.unitId, fighter.star);
    const { abilityMotion } = fighter;
    const abilityJumping = abilityMotion?.kind === "jump";
    const jumping = abilityJumping || (fighter.jumpTime > 0 && fighter.jumpDuration > 0);
    const jumpProgress = abilityJumping
      ? abilityMotion.time / Math.max(abilityMotion.duration, 0.001)
      : jumping ? 1 - fighter.jumpTime / fighter.jumpDuration : 0;
    const jumpArcHeight = abilityJumping ? abilityMotion.arcHeight : fighter.jumpArcHeight || 92;
    const jumpArc = jumping ? Math.sin(jumpProgress * Math.PI) * jumpArcHeight : 0;
    const attackProgress = !abilityMotion && fighter.attackPulse > 0 ? fighter.attackPulse / 0.22 : 0;
    const lunge = Math.sin((1 - attackProgress) * Math.PI) * 10;
    const targetDistance = Math.hypot(fighter.attackTargetX - fighter.x, fighter.attackTargetY - fighter.y) || 1;
    const attackOffsetX = ((fighter.attackTargetX - fighter.x) / targetDistance) * lunge;
    const attackOffsetY = ((fighter.attackTargetY - fighter.y) / targetDistance) * lunge;
    const visualY = fighter.y - jumpArc + attackOffsetY;
    view.setPosition(fighter.x + attackOffsetX, visualY).setDepth(DEPTH.entities + visualY);

    const hp = view.getByName("hp") as Phaser.GameObjects.Rectangle;
    const energy = view.getByName("energy") as Phaser.GameObjects.Rectangle;
    const portrait = view.getByName("portrait") as Phaser.GameObjects.Container;
    const hitFlash = view.getByName("hitFlash") as Phaser.GameObjects.Arc;
    const shield = view.getByName("shield") as Phaser.GameObjects.Arc;
    const syncAura = view.getByName("syncAura") as Phaser.GameObjects.Arc;
    const burn = view.getByName("burn") as Phaser.GameObjects.Arc;
    const status = view.getByName("status") as Phaser.GameObjects.Text;
    const shadow = view.getByName("shadow") as Phaser.GameObjects.Ellipse;
    const label = view.getByName("label") as Phaser.GameObjects.Text;
    const star = view.getByName("star") as Phaser.GameObjects.Text;
    const hitProgress = fighter.hitPulse > 0 ? fighter.hitPulse / 0.2 : 0;
    const growth = fighter.growthStacks > 0
      ? 1 + fighter.growthStacks * 0.015 + Math.sin(this.bridge.engine.state.visualTime * 8) * 0.008
      : 1;
    const attackScaleX = 1 + lunge / 70;
    const attackScaleY = 1 - lunge / 130;
    const hitScaleX = 1 - 0.08 * hitProgress;
    const hitScaleY = 1 + 0.08 * hitProgress;
    const groundMotion = abilityMotion && abilityMotion.kind !== "jump";
    const motionPulse = groundMotion ? Math.sin((abilityMotion.time / Math.max(abilityMotion.duration, 0.001)) * Math.PI) : 0;
    portrait
      .setScale(
        growth * attackScaleX * hitScaleX * (1 + motionPulse * 0.08),
        growth * attackScaleY * hitScaleY * (1 - motionPulse * 0.12),
      )
      .setAngle(groundMotion ? fighter.facingX * motionPulse * 7 : 0)
      .setAlpha(fighter.stun > 0 ? 0.72 : 1);
    const portraitImage = portrait.getByName("portraitImage") as Phaser.GameObjects.Image;
    portraitImage.setFlipX(fighter.facingX < 0);
    shadow.setPosition(-attackOffsetX, radius * 0.8 + jumpArc - attackOffsetY).setScale(growth, growth);
    hp.width = radius * 2.25 * Math.max(0, fighter.hp / fighter.maxHp);
    energy.width = radius * 2.25 * Math.max(0, Math.min(1, fighter.energy / fighter.maxEnergy));
    energy.fillColor = Phaser.Display.Color.HexStringToColor(ENERGY_PROFILES[fighter.energyStyle].color).color;
    hitFlash.setAlpha(0.72 * hitProgress).setRadius(radius * growth);
    const shieldStrength = fighter.shield > 0
      ? Math.max(0, Math.min(1, fighter.shield / Math.max(fighter.shieldPeak, 1)))
      : 0;
    shield
      .setRadius(radius + 7 + Math.sin(this.bridge.engine.state.visualTime * 6) * 2)
      .setFillStyle(0x6edeff, 0.06 + shieldStrength * 0.14)
      .setStrokeStyle(1.5 + shieldStrength * 1.5, 0xc6f7ff, 0.24 + shieldStrength * 0.66)
      .setAlpha(fighter.shield > 0 ? 1 : 0);
    const syncPulse = 1 + Math.sin(this.bridge.engine.state.visualTime * 7) * 0.12;
    const syncColor = fighter.syncAvDirection > 0 ? 0xff9a5c : 0x79dcff;
    syncAura
      .setFillStyle(syncColor, 1)
      .setRadius((radius + 13 + fighter.syncAvStrength * 12) * syncPulse)
      .setAlpha(fighter.syncAvDirection === 0 ? 0 : 0.12 + fighter.syncAvStrength * 0.32);
    burn.setAlpha(fighter.burnTime > 0 ? 0.9 : 0).setScale(1 + Math.sin(this.bridge.engine.state.visualTime * 10) * 0.35);
    const statusBadges = [
      fighter.weakenTime > 0 ? "🦑" : "",
      fighter.slowTime > 0 ? "🐌" : "",
      fighter.burnTime > 0 ? "🔥" : "",
      fighter.stun > 0 ? "✦" : "",
      fighter.tauntTime > 0 ? "嘲" : "",
      fighter.jumpPending ? "⌁" : "",
      abilityMotion?.kind === "dash" ? "»" : "",
      abilityMotion?.kind === "push" ? "›" : "",
      fighter.barrageActive || fighter.abilityAttackSpeedTime > 0 || fighter.abilityMoveSpeedTime > 0 ? "⚡" : "",
      fighter.barrageActive && fighter.unitId === "cinder_ram" ? "歌" : "",
      fighter.reborn ? "涅" : "",
      fighter.channelTime > 0 ? "捏" : "",
      fighter.syncAvDirection > 0 ? "骄" : fighter.syncAvDirection < 0 ? "哀" : "",
      fighter.gen27Buffed ? "27" : "",
      fighter.enraged ? "!" : "",
    ].filter(Boolean);
    status.setText(statusBadges.join(" "));
    status.setY(-radius - 8);
    status.setColor(fighter.enraged ? "#ff4f9a" : fighter.syncAvDirection > 0 ? "#ff9a5c" : fighter.syncAvDirection < 0 ? "#79dcff" : fighter.weakenTime > 0 ? "#f5d56f" : fighter.slowTime > 0 ? "#8fd9ff" : "#ffd95e");
    label.setText(`${UNIT_DEFS[fighter.unitId].name}${fighter.growthStacks ? ` · 饱${fighter.growthStacks}` : ""}${fighter.shield > 0 ? " ◇" : ""}`);
    star.setText("★".repeat(fighter.star)).setPosition(label.width / 2 + 6, radius + 30);
  }

  private syncCombatEffects() {
    const { battle, visualTime } = this.bridge.engine.state;
    if (!battle) return;
    this.syncObjectMap(this.projectileViews, battle.projectiles, (projectile) => this.createProjectile(projectile), (view, projectile) => this.updateProjectile(view, projectile));
    this.syncObjectMap(this.effectViews, battle.effects, (effect) => this.createEffect(effect), (view, effect) => this.updateEffect(view, effect));
    this.syncObjectMap(this.petViews, battle.pets, (pet) => this.createRabbit(pet), (view, pet) => this.updateRabbit(view, pet, visualTime), (pet) => pet.id);
    this.syncObjectMap(this.treeViews, battle.pineTrees, (tree) => this.createPineTree(tree), (view, tree) => this.updatePineTree(view, tree, visualTime), (tree) => tree.id);
    this.syncChronospheres(battle.chronospheres, visualTime);
  }

  private syncObjectMap<T, K>(
    views: Map<K, Phaser.GameObjects.Container>,
    items: T[],
    create: (item: T) => Phaser.GameObjects.Container,
    update: (view: Phaser.GameObjects.Container, item: T) => void,
    keyFor: (item: T) => K = (item) => item as unknown as K,
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
        view.destroy();
        views.delete(key);
      }
    });
  }

  private createProjectile(projectile: Projectile) {
    const container = this.add.container(projectile.x, projectile.y);
    const trail = this.add.graphics().setName("trail");
    const core = this.add.circle(0, 0, Math.max(2, projectile.size), 0xf8fcff).setName("core");
    const icon = this.text(0, 0, "", Math.max(12, projectile.size), "#ffffff", { fontFamily: PROJECTILE_EMOJI_FONT }).setOrigin(0.5).setName("icon");
    container.add([trail, core, icon]);
    return container;
  }

  private drawProjectileTrail(graphics: Phaser.GameObjects.Graphics, tailX: number, tailY: number, width: number, color: number) {
    const capRadius = width / 2;
    graphics.lineStyle(width, color, 1).lineBetween(tailX, tailY, 0, 0);
    graphics.fillStyle(color, 1).fillCircle(tailX, tailY, capRadius).fillCircle(0, 0, capRadius);
  }

  private updateProjectile(view: Phaser.GameObjects.Container, projectile: Projectile) {
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
    const angle = Math.atan2(projectile.velocityY, projectile.velocityX);
    const trail = view.getByName("trail") as Phaser.GameObjects.Graphics;
    const core = view.getByName("core") as Phaser.GameObjects.Arc;
    const icon = view.getByName("icon") as Phaser.GameObjects.Text;
    const emoji = projectileEmoji(projectile);
    const { color: projectileColor } = Phaser.Display.Color.HexStringToColor(projectile.color);
    view.setPosition(projectile.x, projectile.y).setDepth(DEPTH.effects + projectile.y);
    trail.clear().setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);
    core.setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);
    icon.setVisible(false).setBlendMode(Phaser.BlendModes.NORMAL);

    if (projectile.style === "lollipop" && projectile.grounded) {
      trail.setVisible(true);
      trail.lineStyle(2, projectileColor, 0.72).strokeCircle(0, 0, projectile.radius + 7);
      trail.lineStyle(1, 0xfff2f7, 0.35).strokeCircle(0, 0, projectile.radius + 12);
      icon.setText(emoji || "🍭").setFontSize(Math.max(14, projectile.size)).setRotation(0).setVisible(true);
      return;
    }

    if (projectile.style === "aoe_orb") {
      const tailX = -(projectile.velocityX / speed) * 18;
      const tailY = -(projectile.velocityY / speed) * 18;
      trail.setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
      this.drawProjectileTrail(trail, tailX, tailY, 3, projectileColor);
      trail.fillStyle(projectileColor, 0.2).fillCircle(0, 0, 14);
      trail.lineStyle(2, projectileColor, 0.92).strokeCircle(0, 0, 11);
      trail.lineStyle(1, 0xffffff, 0.68).strokeCircle(0, 0, 6);
      if (emoji) icon.setText(emoji).setFontSize(11).setRotation(0).setVisible(true);
      else core.setRadius(4).setFillStyle(0xf8fcff, 0.98).setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
      return;
    }

    if (projectile.style === "pine_needle") {
      const tailX = -(projectile.velocityX / speed) * 16;
      const tailY = -(projectile.velocityY / speed) * 16;
      trail.setVisible(true);
      this.drawProjectileTrail(trail, tailX, tailY, 2.2, projectileColor);
      return;
    }

    if (emoji) {
      const fontSize = projectile.style === "shark" ? Math.max(12, projectile.size) : Math.max(14, projectile.size);
      icon.setText(emoji).setFontSize(fontSize).setRotation(angle).setVisible(true);
      return;
    }

    const tailX = -(projectile.velocityX / speed) * 22;
    const tailY = -(projectile.velocityY / speed) * 22;
    trail.setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
    core.setRadius(Math.max(2, projectile.size)).setFillStyle(0xf8fcff, 0.98).setVisible(true).setBlendMode(Phaser.BlendModes.SCREEN);
    this.drawProjectileTrail(trail, tailX, tailY, projectile.size + 3, projectileColor);
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
    const container = this.add.container(effect.x, effect.y);
    const graphics = this.add.graphics().setName("shape");
    const burstGradient = this.add.image(0, 0, BURST_GRADIENT_TEXTURE).setOrigin(0.5).setName("burstGradient").setVisible(false);
    const label = this.text(0, 0, "", 14, "#ffffff", { fontStyle: "bold" }).setOrigin(0.5).setName("label");
    container.add([graphics, burstGradient, label]);
    return container;
  }

  private updateEffect(view: Phaser.GameObjects.Container, effect: BattleEffect) {
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = Math.max(0, effect.life / effect.maxLife);
    const graphics = view.getByName("shape") as Phaser.GameObjects.Graphics;
    const burstGradient = view.getByName("burstGradient") as Phaser.GameObjects.Image;
    const label = view.getByName("label") as Phaser.GameObjects.Text;
    const { color } = Phaser.Display.Color.HexStringToColor(effect.color);
    view
      .setPosition(effect.x, effect.y)
      .setAlpha(alpha ** 0.65)
      .setRotation(0)
      .setDepth(DEPTH.effects + effect.y + 1);
    graphics.clear();
    burstGradient.setVisible(false);
    label.setVisible(false);
    if (effect.kind === "line") {
      const targetX = (effect.x2 ?? effect.x) - effect.x;
      const targetY = (effect.y2 ?? effect.y) - effect.y;
      const width = effect.size || 3;
      const travel = Math.min(1, progress * 1.35);
      const tail = Math.max(0, travel - 0.2);
      const pulseX = targetX * travel;
      const pulseY = targetY * travel;
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .lineStyle(width + 4, color, 0.22)
        .lineBetween(0, 0, targetX, targetY)
        .lineStyle(width + 2, color, 0.88)
        .lineBetween(targetX * tail, targetY * tail, pulseX, pulseY)
        .lineStyle(Math.max(1, width * 0.45), 0xf4fbff, 0.96)
        .lineBetween(targetX * tail, targetY * tail, pulseX, pulseY)
        .fillStyle(color, 0.38)
        .fillCircle(pulseX, pulseY, width + 7)
        .fillStyle(0xf4fbff, 1)
        .fillCircle(pulseX, pulseY, width + 2);
      if (travel > 0.82) {
        graphics
          .lineStyle(Math.max(1.5, width * 0.7), color, 0.9)
          .strokeCircle(targetX, targetY, (travel - 0.82) * 54 + width * 2);
      }
    } else if (effect.kind === "ring") {
      const radius = effect.size || 80;
      const arrival = 1 - (1 - progress) ** 3;
      const fieldRadius = Math.max(6, radius * (0.72 + arrival * 0.28));
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .fillStyle(color, 0.1 + (1 - progress) * 0.08)
        .fillCircle(0, 0, fieldRadius)
        .lineStyle(Math.max(2, 7 * (1 - progress)), color, 0.95)
        .strokeCircle(0, 0, fieldRadius)
        .lineStyle(1.5, 0xf4fbff, 0.66)
        .strokeCircle(0, 0, Math.max(5, radius * arrival * 0.72));
    } else if (effect.kind === "burst") {
      const radius = (effect.size || 40) * (0.35 + progress * 0.65);
      burstGradient
        .setTint(color)
        .setDisplaySize(radius * 2, radius * 2)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setVisible(true);
      graphics
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .lineStyle(Math.max(1.5, 4 * (1 - progress)), color, 0.8)
        .strokeCircle(0, 0, radius * 0.72);
    } else if (effect.kind === "chronosphere" || effect.kind === "hotpot") {
      const radius = (effect.size || (effect.kind === "hotpot" ? 130 : 50)) * (effect.kind === "hotpot" ? 0.45 + progress * 0.7 : 0.35 + progress * 0.65);
      const fill = effect.kind === "hotpot" ? 0xff6b2d : color;
      graphics.fillStyle(fill, effect.kind === "hotpot" ? 0.3 : 0.24).fillCircle(0, 0, radius);
      graphics.lineStyle(effect.kind === "hotpot" ? 4 : 3, color, 0.9).strokeCircle(0, 0, radius * (effect.kind === "hotpot" ? 0.72 : 0.92));
      if (effect.kind === "hotpot") graphics.lineStyle(2, 0xffd27a, 0.9).strokeCircle(0, 0, radius * 0.48);
    } else {
      label
        .setText(effect.text || "")
        .setFontFamily(effect.emoji ? PROJECTILE_EMOJI_FONT : FONT_FAMILY)
        .setColor(effect.color)
        .setFontSize(effect.size || 14)
        .setY(-progress * 26)
        .setVisible(true);
    }
  }

  private createRabbit(pet: MechanicalRabbitPet) {
    const container = this.add.container(0, 0);
    const muzzle = mechanicalRabbitMuzzle(pet);
    const muzzleDistance = Math.hypot(muzzle.x - pet.x, muzzle.y - pet.y);
    const shadow = this.add.ellipse(0, 0, pet.radius * 2.4, pet.radius * 0.6, 0x000000, 0.26).setName("shadow");
    const body = this.add.graphics().setName("body");
    const cannon = this.add.graphics().setName("cannon");
    const details = this.add.graphics().setName("details");
    const eye = this.add.circle(-pet.radius * 0.2, 0, 2.4, 0x92d7ff).setName("eye");
    const flash = this.add.circle(muzzleDistance, 0, 4.5, 0xdafaff, 0).setName("flash");

    this.drawRabbitBody(body, pet.radius);
    this.drawRabbitCannon(cannon, details, pet.radius, muzzleDistance);
    container.add([shadow, body, cannon, details, eye, flash]);
    return container;
  }

  private drawRabbitBody(graphics: Phaser.GameObjects.Graphics, radius: number) {
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
  }

  private drawRabbitCannon(
    cannon: Phaser.GameObjects.Graphics,
    details: Phaser.GameObjects.Graphics,
    radius: number,
    muzzleDistance: number,
  ) {
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
  }

  private updateRabbit(view: Phaser.GameObjects.Container, pet: MechanicalRabbitPet, visualTime: number) {
    const fade = Math.max(0.25, Math.min(1, pet.life / 0.7));
    const bob = Math.sin(visualTime * 8 + pet.x * 0.03) * 3;
    const angle = Math.atan2(pet.aimY, pet.aimX);
    const flash = view.getByName("flash") as Phaser.GameObjects.Arc;
    const muzzle = mechanicalRabbitMuzzle(pet);
    const muzzleDistance = Math.hypot(muzzle.x - pet.x, muzzle.y - pet.y);
    const flashScale = 1 + (pet.attackPulse / 0.16) * 0.75;
    view.setPosition(pet.x, pet.y + bob).setRotation(angle).setAlpha(fade).setDepth(DEPTH.entities + pet.y + 0.5);
    (view.getByName("shadow") as Phaser.GameObjects.Ellipse).setRotation(-angle).setY(pet.radius * 0.88 - bob);
    flash.setX(muzzleDistance).setAlpha(pet.attackPulse > 0 ? Math.min(0.96, pet.attackPulse / 0.16) : 0).setScale(flashScale);
  }

  private createPineTree(_tree: PineTreeTurret) {
    const container = this.add.container(0, 0);
    const shadow = this.add.ellipse(0, 0, 30, 9, 0x000000, 0.3).setName("shadow");
    const tree = this.text(0, -4, "🌲", 42, "#ffffff").setOrigin(0.5).setName("tree");
    const flash = this.add.circle(0, -8, 7, 0xa0e696, 0).setName("flash");
    container.add([shadow, tree, flash]);
    return container;
  }

  private updatePineTree(view: Phaser.GameObjects.Container, tree: PineTreeTurret, visualTime: number) {
    const fade = Math.max(0.35, Math.min(1, tree.life / 0.9));
    const sway = Math.sin(visualTime * 2.4 + tree.x * 0.02) * 1.5;
    const flash = view.getByName("flash") as Phaser.GameObjects.Arc;
    view.setPosition(tree.x + sway, tree.y).setAlpha(fade).setDepth(DEPTH.entities + tree.y + 0.4);
    (view.getByName("shadow") as Phaser.GameObjects.Ellipse).setY(tree.radius * 0.7);
    flash.setAlpha(tree.attackPulse > 0 ? Math.min(0.85, tree.attackPulse / 0.18) : 0).setScale(1 + tree.attackPulse * 5);
  }

  private syncChronospheres(zones: Array<{ x: number; y: number; radius: number; life: number; maxLife: number; color: string }>, visualTime: number) {
    const key = "rift-chronosphere";
    const existing = this.effectViews.get(key as unknown as BattleEffect);
    if (!zones.length) {
      if (existing) {
        existing.destroy();
        this.effectViews.delete(key as unknown as BattleEffect);
      }
      return;
    }
    let view = existing;
    if (!view) {
      view = this.add.container(0, 0);
      view.add(this.add.graphics().setName("shape"));
      this.effectViews.set(key as unknown as BattleEffect, view);
      this.effectsLayer.add(view);
    }
    const zone = zones[0];
    const pulse = 0.92 + Math.sin(visualTime * 6) * 0.04;
    const graphics = view.getByName("shape") as Phaser.GameObjects.Graphics;
    graphics.clear();
    graphics.fillStyle(0x783cb4, 0.2 + Math.max(0, zone.life / zone.maxLife) * 0.22).fillCircle(0, 0, zone.radius * pulse);
    graphics.lineStyle(3, Phaser.Display.Color.HexStringToColor(zone.color).color, 0.92).strokeCircle(0, 0, zone.radius * pulse);
    view.setPosition(zone.x, zone.y).setDepth(DEPTH.effects - 2);
  }

  private buildBattleOverlay() {
    const { battle } = this.bridge.engine.state;
    if (!battle || this.battleTimerText) return;
    this.battleTimerPanel = this.panel(508, 104, 104, 28, 0x09131d, 0.88, 0x8edfff);
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
    this.battleTimerPanel.clear();
    this.battleTimerPanel.fillStyle(0x09131d, 0.88).fillRoundedRect(508, 104, 104, 28, 8);
    this.battleTimerPanel.lineStyle(1, urgent ? 0xff718e : 0x8edfff, 0.8).strokeRoundedRect(508, 104, 104, 28, 8);
    this.battleTimerText.setText(`⏱ ${remaining.toFixed(1)}s`).setColor(urgent ? "#ff718e" : "#dcefff");
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
    const health = `血 ${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)}${fighter.shield > 0 ? ` · 盾 ${Math.round(fighter.shield)}` : ""}`;
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
    const zone = this.add.zone(x + width / 2, y + height / 2, width, height).setDepth(DEPTH.overlay + 5).setInteractive({ useHandCursor: true });
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
    this.overlayLayer.add(this.text(layout.columnX[0], layout.rosterHeadingY, "我方阵容", 13, "#7fdcff", { fontStyle: "bold" }));
    this.overlayLayer.add(this.text(layout.columnX[1], layout.rosterHeadingY, "敌方阵容", 13, "#ff91a9", { fontStyle: "bold" }));
    const playerRows = this.bridge.engine.getBattleRanking("player");
    const enemyRows = this.bridge.engine.getBattleRanking("enemy");
    const rowCount = Math.max(playerRows.length, enemyRows.length);
    const gap = rowCount > 6 ? 3 : 5;
    const height = Math.min(52, Math.floor((layout.rosterBottom - layout.rosterY - gap * Math.max(0, rowCount - 1)) / Math.max(1, rowCount)));
    const rowLayout: ResultRowLayout = {
      height,
      portraitRadius: Math.max(12, Math.min(17, Math.floor(height / 2 - 3))),
      nameSize: height < 45 ? 9 : 10,
      detailSize: height < 45 ? 7 : 8,
    };
    ([playerRows, enemyRows] as const).forEach((rows, teamIndex) => {
      rows.forEach(({ fighter, value }, index) => {
        this.drawResultRow(layout.columnX[teamIndex], layout.rosterY + index * (height + gap), layout.columnWidth, index + 1, fighter, value, battle.rankingMetric, rowLayout);
      });
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
      card.add(this.text(160, 82, augment.name, 22, "#eff7ff", { fontStyle: "bold" }).setOrigin(0.5));
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

  private drawGameOver() {
    const { state } = this.bridge.engine;
    const won = state.finalWon;
    this.phaseLayer.add(this.text(560, 185, won ? "裂 隙 已 封 闭" : "战 线 已 失 守", 40, won ? "#65e4a9" : "#ff718e", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(560, 250, won ? "守望成功" : `止步第 ${state.round} 战`, 30, "#f3f8ff", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(560, 340, `本局积分 ${state.score.toLocaleString()} · 最高纪录 ${state.bestScore.toLocaleString()} · 核心 ${state.hp}/${state.maxHp}`, 16, "#b9cfdd").setOrigin(0.5));
    this.button(420, 548, 280, 62, "再开一局 · 新战术种子", { type: "restart" }, { tone: won ? "confirm" : "danger" });
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
      ? `生命 ${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)} · 护盾 ${Math.round(fighter.shield)}\n攻击 ${Math.round(fighter.attack)} · 护甲 ${Math.round(fighter.armor)} · 射程 ${Math.round(fighter.range)}\n攻速 ${fighter.attackInterval.toFixed(2)}s · 移速 ${Math.round(fighter.moveSpeed)}\n战斗：输出 ${short(fighter.damageDealt)} · 治疗 ${short(fighter.healingDone)} · 护盾 ${short(fighter.shieldingDone)} · 承伤 ${short(fighter.damageTaken)}`
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
    const height = Math.max(292, abilityBodyY + ability.height + padding);
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

  private clearTooltip() {
    if (!this.tooltipLayer) {
      this.pinnedTooltip = null;
      return;
    }
    this.tooltipLayer.getAll("name", "tooltip").forEach((item) => item.destroy());
    this.pinnedTooltip = null;
  }
}
