import Phaser from "phaser";
import type { UnitId } from "../core/gameData";
import {
  AUGMENTS,
  CAMPAIGN_ROUNDS,
  ENERGY_PROFILES,
  STARTERS,
  TRAITS,
  UNIT_DEFS,
  bookLevelForPlayerLevel,
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
  COMPACT_TRAIT_STRIP,
  PREPARATION_BENCH_PANEL,
  PREPARATION_BOARD_PANEL,
  PREPARATION_SHOP_PANEL,
  WIDE_TRAIT_STRIP,
  MAX_TEXT_RESOLUTION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  benchSlot,
  boardSlot,
  compactBenchSlot,
  compactBoardSlot,
  profileFor,
  type LayoutProfile,
} from "./layout";
import { BUTTONS, COLORS, DEPTH, FONT_FAMILY, type ButtonTone } from "./theme";

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

const resultMetricLabel: Record<RankingMetric, string> = {
  damage: "输出",
  support: "治疗/护盾",
  taken: "承伤",
};

const short = (value: number) => (value < 1000 ? `${Math.round(value)}` : `${(value / 1000).toFixed(1)}k`);

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

  private fighterViews = new Map<string, Phaser.GameObjects.Container>();

  private dragState: DragState | null = null;

  private traitOffset = 0;

  private traitDrag: TraitDragState | null = null;

  private pinnedTooltip: UnitId | null = null;

  private textResolution = 2;

  private projectileViews = new Map<Projectile, Phaser.GameObjects.Container>();

  private effectViews = new Map<BattleEffect, Phaser.GameObjects.Container>();

  private petViews = new Map<string, Phaser.GameObjects.Container>();

  private treeViews = new Map<string, Phaser.GameObjects.Container>();

  private buttonViews: Phaser.GameObjects.Container[] = [];

  constructor(bridge: EngineBridge) {
    super({ key: "RiftLineScene" });
    this.bridge = bridge;
  }

  preload() {
    preloadUnitPortraits(this);
  }

  create() {
    this.syncLogicalCamera();
    this.updateQuality();
    createFallbackTextures(this);
    createCircularPortraitTextures(this);
    this.input.setTopOnly(true);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancelDrag, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cancelDrag, this);
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
    else this.sync();
  }

  public refresh() {
    this.rebuild();
  }

  private dispatch(action: GameAction) {
    this.bridge.dispatch(action);
    this.rebuild();
  }

  private handleResize() {
    this.syncLogicalCamera();
    this.updateQuality();
    this.profile = this.profileForViewport();
    this.rebuild();
  }

  private syncLogicalCamera() {
    const { width, height } = this.scale.baseSize;
    const scale = Math.max(1, Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT));
    this.cameras.main
      .setViewport(0, 0, width, height)
      .setZoom(scale)
      .centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  }

  private profileForViewport() {
    const { width, height } = this.scale.parentSize;
    return profileFor(width || this.scale.displaySize.width, height || this.scale.displaySize.height);
  }

  private renderScale() {
    return Math.max(1, Math.min(this.scale.baseSize.width / WORLD_WIDTH, this.scale.baseSize.height / WORLD_HEIGHT));
  }

  private logicalPointer(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
  }

  private isCompact() {
    return this.profile === "compact";
  }

  private resetLayers() {
    this.cancelDrag();
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
    this.pinnedTooltip = null;
  }

  private rebuild() {
    this.profile = this.profileForViewport();
    this.syncLogicalCamera();
    this.resetLayers();
    this.phase = this.bridge.engine.state.phase;
    this.drawHeader();
    if (this.phase === "title") this.drawTitle();
    if (this.phase === "preparation") this.drawPreparation();
    if (this.phase === "battle" || this.phase === "result") this.drawBattle();
    if (this.phase === "result") this.drawResult();
    if (this.phase === "augment") this.drawAugments();
    if (this.phase === "gameover") this.drawGameOver();
    this.drawToast();
  }

  private sync() {
    if (this.phase === "battle") {
      this.syncBattleEntities();
      this.syncCombatEffects();
      this.syncBattleOverlay();
    }
    this.syncToast();
  }

  private drawBackdrop() {
    const graphics = this.add.graphics().setDepth(DEPTH.backdrop);
    graphics.fillGradientStyle(0x07121d, 0x0b1825, 0x160f20, 0x0b1825, 1);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let index = 0; index < 56; index += 1) {
      const x = (index * 193 + 47) % WORLD_WIDTH;
      const y = (index * 83 + 29) % WORLD_HEIGHT;
      graphics.fillStyle(index % 3 ? 0x78d9ff : 0xb797ff, 0.25);
      graphics.fillCircle(x, y, index % 5 === 0 ? 2 : 1);
    }
  }

  private updateQuality() {
    this.textResolution = Math.max(1, Math.min(MAX_TEXT_RESOLUTION, Math.ceil(this.renderScale())));
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
    const probe = this.text(0, 0, value, size, color, { ...style, wordWrap: { width: maxWidth } }).setVisible(false);
    const lines = probe.text.split("\n");
    probe.destroy();
    const bounded = lines.length <= maxLines
      ? lines
      : [...lines.slice(0, maxLines - 1), this.truncateText(lines.slice(maxLines - 1).join(""), maxWidth, size, style)];
    return this.text(0, 0, bounded.join("\n"), size, color, { ...style, wordWrap: { width: maxWidth } });
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
    action: GameAction,
    options: ButtonOptions = {},
    depth = DEPTH.ui,
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
      zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch(action));
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
    this.headerLayer.add(this.text(930, 18, "金币", 10, "#8ba3b5"));
    this.headerLayer.add(this.text(930, 35, `${state.gold}`, 22, COLORS.gold, { fontStyle: "bold" }));
    this.headerLayer.add(this.text(1010, 18, "积分", 10, "#8ba3b5"));
    this.headerLayer.add(this.text(1010, 37, state.score.toLocaleString(), 18, "#e0f0fc", { fontStyle: "bold" }));
    this.headerLayer.add(this.text(580, 52, `${bookLevelForPlayerLevel(state.playerLevel)} 本 · 上阵 ${boardCount}/${boardCap}`, 10, "#84b8d5").setOrigin(0.5));
  }

  private drawTitle() {
    const { state } = this.bridge.engine;
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, 128, "守住八次远征冲击，然后向无限裂隙挑战极限。", 16, "#9db7c9").setOrigin(0.5));
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, 188, "裂 隙 阵 线", 48, "#f4f9ff", { fontStyle: "bold" }).setOrigin(0.5));
    const compact = this.isCompact();
    const cardWidth = compact ? 310 : 300;
    const cardX = compact ? [50, 405, 760] : [90, 410, 730];
    state.starterChoices.forEach((id, index) => {
      const starter = STARTERS.find((item) => item.id === id);
      if (!starter) return;
      const x = cardX[index];
      const y = compact ? 274 : 318;
      const container = this.add.container(x, y);
      container.add(this.panel(0, 0, cardWidth, compact ? 250 : 260, 0x122230, 0.98, Phaser.Display.Color.HexStringToColor(starter.color).color));
      const portrait = this.createPortrait(starter.unit, cardWidth / 2, 58, 35);
      container.add(portrait);
      container.add(this.text(cardWidth / 2, 108, starter.subtitle, 11, starter.color, { fontStyle: "bold" }).setOrigin(0.5));
      container.add(this.text(cardWidth / 2, 138, starter.name, 21, "#f3f8ff", { fontStyle: "bold" }).setOrigin(0.5));
      container.add(this.text(20, 162, starter.description, 12, "#aebfcb", { wordWrap: { width: cardWidth - 40 }, lineSpacing: 4 }).setOrigin(0));
      const action = this.button(
        62,
        compact ? 204 : 218,
        cardWidth - 124,
        32,
        "选择协议",
        { type: "starter", id },
        { tone: "confirm", hoverLabel: "点击接入并开始" },
        DEPTH.board,
      );
      const hoverZone = action.getAt(2) as Phaser.GameObjects.Zone;
      hoverZone.on(Phaser.Input.Events.POINTER_OVER, () => container.setY(y - 5));
      hoverZone.on(Phaser.Input.Events.POINTER_OUT, () => container.setY(y));
      container.add(action);
      this.phaseLayer.add(container);
    });
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, 650, `本局战术种子 · ${String(state.seed % 100000).padStart(5, "0")}`, 11, "#648297").setOrigin(0.5));
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
    const boardPanel = compact
      ? { x: 26, y: 98, width: 1068, height: 430 }
      : PREPARATION_BOARD_PANEL;
    this.phaseLayer.add(this.drawPreparationPanel(boardPanel.x, boardPanel.y, boardPanel.width, boardPanel.height));
    this.phaseLayer.add(this.text(48, 116, currentWave.tag === "boss" ? "BOSS" : `WAVE ${currentWave.round}`, 10, currentWave.tag === "boss" ? "#ff8ba7" : "#72d8ff", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(48, 136, this.truncateText(currentWave.name, compact ? 680 : 470, 20, { fontStyle: "bold" }), 20, "#f1f7ff", { fontStyle: "bold" }));
    const description = this.boundedText(currentWave.description, compact ? 680 : 470, 2, 11, "#91aab9", { lineSpacing: 2 });
    description.setPosition(48, 158);
    this.phaseLayer.add(description);
    this.drawTraits();
    if (!compact) {
      this.phaseLayer.add(this.text(48, 221, "后方 · 远程与辅助", 9, "#6f9eb8", { fontStyle: "bold" }).setOrigin(0, 0.5));
      this.phaseLayer.add(this.text(390, 221, `6 × 4 自由部署区 · 满级 ${engine.boardCap} 人口`, 9, "#63849b").setOrigin(0.5));
      this.phaseLayer.add(this.text(756, 221, "前线 · 优先接敌 →", 9, "#78b8d2", { fontStyle: "bold" }).setOrigin(1, 0.5));
      this.phaseLayer.add(this.drawPreparationPanel(PREPARATION_BENCH_PANEL.x, PREPARATION_BENCH_PANEL.y, PREPARATION_BENCH_PANEL.width, PREPARATION_BENCH_PANEL.height));
      this.phaseLayer.add(this.text(48, 563, `备战席 ${state.bench.filter(Boolean).length}/${state.bench.length}`, 11, "#91b5c8", { fontStyle: "bold" }));
      this.phaseLayer.add(this.text(748, 563, `${bookLevelForPlayerLevel(state.playerLevel)} 本 · 上阵 ${engine.boardCount}/${engine.boardCap}`, 10, "#7499ad").setOrigin(1));
    }
    state.board.forEach((unit, index) => this.drawSlot("board", index, unit, compact));
    state.bench.forEach((unit, index) => this.drawSlot("bench", index, unit, compact));
    if (compact) this.drawCompactShop();
    else this.drawWideShop();
    this.drawPreparationActions(compact);
  }

  private drawTraits() {
    const strip = this.isCompact() ? COMPACT_TRAIT_STRIP : WIDE_TRAIT_STRIP;
    const traits = Object.entries(this.bridge.engine.getTraitCounts()).filter(([, count]) => count > 0);
    const entries = traits.map(([id, count]) => {
      const trait = TRAITS[id as keyof typeof TRAITS];
      const status = this.bridge.engine.getTraitStatus(trait.id);
      const nextThreshold = trait.thresholds.find((threshold) => threshold > count) ?? status.maxThreshold;
      const label = `${trait.name} ${count}/${nextThreshold}${status.active ? "" : " !"}`;
      const probe = this.text(0, 0, label, 10, "#ffffff", { fontStyle: "bold" }).setVisible(false);
      const width = Math.max(72, Math.ceil(probe.width) + 34);
      probe.destroy();
      return { trait, status, label, width };
    });
    const gap = 6;
    const contentWidth = entries.reduce((total, entry) => total + entry.width + gap, 0);
    const minimumOffset = Math.min(0, strip.width - contentWidth);
    this.traitOffset = Phaser.Math.Clamp(this.traitOffset, minimumOffset, 0);

    const source = this.add.container(strip.x + this.traitOffset, strip.y);
    let cursor = 0;
    entries.forEach(({ trait, status, label, width }) => {
      const { color } = Phaser.Display.Color.HexStringToColor(trait.color);
      const graphics = this.add.graphics();
      graphics.fillStyle(status.active ? color : 0x142735, status.active ? 0.24 : 0.96);
      graphics.fillRoundedRect(cursor, 0, width, strip.height, 12);
      graphics.lineStyle(1, status.active ? color : 0x395467, status.active ? 0.9 : 1);
      graphics.strokeRoundedRect(cursor, 0, width, strip.height, 12);
      source.add([
        graphics,
        this.add.circle(cursor + 12, strip.height / 2, 3, color, status.active ? 1 : 0.72),
        this.text(cursor + 21, 7, label, 10, status.active ? "#effaff" : "#7f96a6", { fontStyle: "bold" }),
      ]);
      cursor += width + gap;
    });
    const renderScale = this.renderScale();
    const viewport = this.add
      .renderTexture(strip.x, strip.y, Math.ceil(strip.width * renderScale), Math.ceil(strip.height * renderScale))
      .setOrigin(0)
      .setScale(1 / renderScale);
    source.setScale(renderScale);
    viewport.draw(source, -strip.x * renderScale, -strip.y * renderScale);
    source.destroy(true);
    const zone = this.add.zone(strip.x + strip.width / 2, strip.y + strip.height / 2, strip.width, strip.height).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
      const logical = this.logicalPointer(pointer);
      const trait = this.traitEntryAt(entries, gap, strip, logical.x);
      if (trait) this.showTraitTooltip(trait.trait.id, pointer);
    });
    zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.traitDrag = { startX: this.logicalPointer(pointer).x, offset: this.traitOffset, moved: false };
    });
    zone.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (!this.traitDrag?.moved) {
        const logical = this.logicalPointer(pointer);
        const trait = this.traitEntryAt(entries, gap, strip, logical.x);
        if (trait) this.showTraitTooltip(trait.trait.id, pointer);
      }
      this.traitDrag = null;
    });
    zone.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!this.isCompact() && !this.traitDrag) this.clearTooltip();
    });
    this.phaseLayer.add([viewport, zone]);
    if (contentWidth > strip.width) {
      const fade = this.add.graphics();
      if (this.traitOffset < 0) fade.fillGradientStyle(0x132736, 0x132736, 0x132736, 0x132736, 0, 0.9, 0, 0.9).fillRect(strip.x, strip.y, 20, strip.height);
      if (this.traitOffset > minimumOffset) fade.fillGradientStyle(0x132736, 0x132736, 0x132736, 0x132736, 0.9, 0, 0.9, 0).fillRect(strip.x + strip.width - 20, strip.y, 20, strip.height);
      this.phaseLayer.add(fade);
    }
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
      if (!unit) return;
      const logical = this.logicalPointer(pointer);
      this.dragState = { origin: location, unit, pointerId: pointer.id, startX: logical.x, startY: logical.y, active: false, ghost: null, targetMarker: null, target: null };
    });
    slot.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
      if (unit) this.showUnitTooltip(unit.id, pointer, unit.star);
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
    const portraitRadius = compact ? 18 : isBench ? 24 : 20;
    const portraitY = rect.y + (compact ? rect.height * 0.43 : isBench ? 31 : 26);
    const stars = this.text(rect.x + rect.width / 2, rect.y + 4, "★".repeat(unit.star), compact ? 8 : 9, "#ffdc68", { fontStyle: "bold" }).setOrigin(0.5, 0);
    const portrait = this.createPortrait(unit.id, rect.x + rect.width / 2, portraitY, portraitRadius);
    const name = this.text(rect.x + rect.width / 2, rect.y + rect.height - 7, this.truncateText(definition.name, rect.width - 12, compact ? 10 : 9, { fontStyle: "bold" }), compact ? 10 : 9, "#e5f4ff", { fontStyle: "bold" }).setOrigin(0.5, 1);
    const traitDots = !compact
      ? definition.traits.slice(0, 3).map((traitId, traitIndex) => this.add.circle(rect.x + rect.width / 2 + (traitIndex - (definition.traits.length - 1) / 2) * 7, rect.y + rect.height - 17, 2, Phaser.Display.Color.HexStringToColor(TRAITS[traitId].color).color, 0.9))
      : [];
    this.phaseLayer.add([stars, portrait, name, ...traitDots]);
  }

  private slotRect(location: UnitLocation, compact = this.isCompact()) {
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
        this.traitOffset = Math.min(0, this.traitDrag.offset + delta);
        this.rebuild();
      }
      return;
    }
    const drag = this.dragState;
    if (!drag || pointer.id !== drag.pointerId || !pointer.isDown) return;
    const distance = Phaser.Math.Distance.Between(drag.startX, drag.startY, logical.x, logical.y);
    if (!drag.active && distance > 8) {
      drag.active = true;
      drag.ghost = this.createDragGhost(drag.unit);
      this.game.canvas.style.cursor = "grabbing";
    }
    if (!drag.active) return;
    drag.ghost?.setPosition(logical.x + 18, logical.y - 18);
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

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (this.traitDrag) {
      this.traitDrag = null;
      return;
    }
    const drag = this.dragState;
    if (!drag || pointer.id !== drag.pointerId) return;
    const logical = this.logicalPointer(pointer);
    const target = this.locationAt(logical.x, logical.y);
    const shouldMove = drag.active && target && !this.sameLocation(drag.origin, target);
    const action = shouldMove ? { type: "move", from: drag.origin, to: target } satisfies GameAction : { type: "slot", location: drag.origin } satisfies GameAction;
    this.cancelDrag();
    this.dispatch(action);
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
    if (this.game?.canvas) this.game.canvas.style.cursor = "";
  }

  private traitActivatesAfterPurchase(unitId: UnitId, traitId: keyof typeof TRAITS) {
    const { engine } = this.bridge;
    const status = engine.getTraitStatus(traitId);
    if (status.active || engine.boardCount >= engine.boardCap) return false;
    const threshold = TRAITS[traitId].thresholds[status.level];
    return status.count + 1 >= threshold && !engine.state.board.some((unit) => unit?.id === unitId);
  }

  private createShopTraitTags(unitId: UnitId, x: number, y: number, maxX: number, affordable: boolean, compact = false) {
    const container = this.add.container(x, y);
    const fontSize = compact ? 7 : 8;
    let cursor = 0;
    UNIT_DEFS[unitId].traits.forEach((traitId) => {
      const { [traitId]: trait } = TRAITS;
      const status = this.bridge.engine.getTraitStatus(traitId);
      const completes = this.traitActivatesAfterPurchase(unitId, traitId);
      const label = trait.name;
      const labelText = this.text(0, 0, label, fontSize, "#ffffff", { fontStyle: "bold" });
      const width = Math.ceil(labelText.width) + (compact ? 10 : 14);
      labelText.destroy();
      if (x + cursor + width > maxX) return;
      const { color } = Phaser.Display.Color.HexStringToColor(trait.color);
      const { active } = status;
      const graphic = this.add.graphics();
      graphic.fillStyle(active || (completes && affordable) ? color : 0x142735, active ? 0.22 : completes && affordable ? 0.38 : 0.9);
      graphic.fillRoundedRect(cursor, 0, width, compact ? 15 : 17, 8);
      graphic.lineStyle(completes && affordable ? 1.5 : 1, active || (completes && affordable) ? color : 0x395467, 1);
      graphic.strokeRoundedRect(cursor, 0, width, compact ? 15 : 17, 8);
      const text = this.text(cursor + width / 2, (compact ? 15 : 17) / 2, label, fontSize, active || (completes && affordable) ? "#f4fbff" : "#7890a1", { fontStyle: "bold" }).setOrigin(0.5);
      container.add([graphic, text]);
      cursor += width + 4;
    });
    return container;
  }

  private canBuyShopUnit(unitId: UnitId) {
    const { engine } = this.bridge;
    return engine.state.gold >= UNIT_DEFS[unitId].cost
      && (engine.boardCount < engine.boardCap || engine.state.bench.some((unit) => !unit));
  }

  private canReroll() {
    const { state } = this.bridge.engine;
    return state.gold >= 1 || (state.starter === "ranger_start" && state.round === 1);
  }

  private drawWideShop() {
    const { state, isMaxPlayerLevel, upgradeCost } = this.bridge.engine;
    this.phaseLayer.add(this.panel(PREPARATION_SHOP_PANEL.x, PREPARATION_SHOP_PANEL.y, PREPARATION_SHOP_PANEL.width, PREPARATION_SHOP_PANEL.height, 0x08121c, 0.96, 0x6fbfeb));
    this.phaseLayer.add(this.text(812, 112, `战术商店 · ${bookLevelForPlayerLevel(state.playerLevel)} 本`, 16, "#f1f8ff", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(1076, 117, isMaxPlayerLevel ? "MAX" : `升本还需 ${upgradeCost}`, 9, "#7593a5").setOrigin(1));
    state.shop.forEach((unitId, index) => {
      const y = 143 + index * 74;
      const item = this.add.container(810, y);
      const card = this.add.graphics();
      card.fillStyle(unitId ? 0x11222f : 0x0a1620, unitId ? 0.92 : 0.8);
      card.fillRoundedRect(0, 0, 270, 70, 10);
      card.lineStyle(1, unitId ? 0x294658 : 0x203748, 1).strokeRoundedRect(0, 0, 270, 70, 10);
      item.add(card);
      if (unitId) {
        const def = UNIT_DEFS[unitId];
        const affordable = this.canBuyShopUnit(unitId);
        item.add(this.createPortrait(unitId, 31, 34, 20).setAlpha(affordable ? 1 : 0.48));
        const role = def.title.includes(" · ") ? def.title.split(" · ").at(-1) || def.title : def.title;
        item.add(this.text(62, 11, this.truncateText(def.name, 138, 13, { fontStyle: "bold" }), 13, affordable ? "#edf7ff" : "#617888", { fontStyle: "bold" }));
        item.add(this.text(62, 29, this.truncateText(role, 150, 9), 9, affordable ? "#94acbc" : "#526b7b"));
        item.add(this.text(245, 22, `${def.cost}`, 22, affordable ? COLORS.gold : "#7e8e96", { fontStyle: "bold" }).setOrigin(0.5));
        item.add(this.createShopTraitTags(unitId, 62, 46, 224, affordable));
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
    this.button(900, 556, 82, 22, "刷新 · 1", { type: "reroll" }, { tone: "economic", enabled: this.canReroll() }, DEPTH.board);
  }

  private drawCompactShop() {
    const { state } = this.bridge.engine;
    this.phaseLayer.add(this.panel(24, 548, 1072, 112, 0x08131f));
    this.phaseLayer.add(this.text(46, 562, "商店 · 横向选择", 12, "#dcefff", { fontStyle: "bold" }));
    state.shop.forEach((unitId, index) => {
      const x = 46 + index * 211;
      const item = this.add.container(x, 578);
      item.add(this.panel(0, 0, 196, 66, 0x112431, unitId ? 0.95 : 0.55, 0x2d5064));
      if (unitId) {
        const def = UNIT_DEFS[unitId];
        const affordable = this.canBuyShopUnit(unitId);
        item.add(this.createPortrait(unitId, 27, 33, 19).setAlpha(affordable ? 1 : 0.48));
        item.add(this.text(54, 10, def.name, 12, affordable ? "#edf7ff" : "#718896", { fontStyle: "bold" }));
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

  private drawPreparationActions(compact: boolean) {
    const { state, isMaxPlayerLevel, upgradeCost, boardCount } = this.bridge.engine;
    const canBuyXp = !isMaxPlayerLevel && state.gold >= (upgradeCost ?? Number.POSITIVE_INFINITY);
    const canBattle = boardCount > 0;
    if (compact) {
      this.button(42, 675, 190, 40, isMaxPlayerLevel ? "已满级" : `升本 · ${upgradeCost}`, { type: "buyXp" }, { enabled: canBuyXp, secondary: isMaxPlayerLevel ? "MAX" : "一次付清" });
      this.button(252, 675, 190, 40, state.shopLocked ? "已锁定商店" : "锁定商店", { type: "lock" }, { tone: "lock", selected: state.shopLocked });
      this.button(462, 675, 190, 40, "刷新商店 · 1", { type: "reroll" }, { tone: "economic", enabled: this.canReroll() });
      this.button(672, 675, 190, 40, state.selected ? "出售选中棋子" : "选择棋子后出售", { type: "sell" }, { tone: "danger", enabled: Boolean(state.selected) });
      this.button(882, 675, 196, 40, "开始战斗", { type: "battle" }, { tone: "confirm", enabled: canBattle, secondary: "SPACE" });
    } else {
      this.button(990, 530, 90, 48, "开始战斗", { type: "battle" }, { tone: "confirm", enabled: canBattle, secondary: "SPACE" });
      this.button(636, 553, 112, 34, state.selected ? "回收选中" : "选择棋子", { type: "sell" }, { tone: "danger", enabled: Boolean(state.selected) });
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
    this.syncBattleEntities();
    this.syncCombatEffects();
    if (this.phase === "battle") this.syncBattleOverlay();
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
    const shield = this.add.circle(0, 0, radius + 8, 0x6edeff, 0).setName("shield");
    const hitFlash = this.add.circle(0, 0, radius, 0xff526f, 0).setName("hitFlash");
    const burn = this.add.circle(radius * 0.7, -radius * 0.55, 5, 0xff7a50, 0).setName("burn");
    const status = this.text(0, -radius - 29, "", 14, "#ffd95e", { fontStyle: "bold" }).setOrigin(0.5).setName("status");
    const portrait = this.createPortrait(fighter.unitId, 0, 0, radius, fighter.team === "enemy");
    portrait.setName("portrait");
    const hpBack = this.add.rectangle(0, radius + 10, radius * 2.25, 7, 0x152430).setName("hpBack");
    const hp = this.add.rectangle(-radius * 1.125, radius + 10, radius * 2.25, 7, fighter.team === "player" ? 0x52de9b : 0xff668a).setOrigin(0, 0.5).setName("hp");
    const energyBack = this.add.rectangle(0, radius + 20, radius * 2.25, 4, 0x14222d).setName("energyBack");
    const energy = this.add.rectangle(-radius * 1.125, radius + 20, radius * 2.25, 4, 0x8edfff).setOrigin(0, 0.5).setName("energy");
    const label = this.text(0, radius + 30, UNIT_DEFS[fighter.unitId].name, 9, fighter.team === "player" ? "#b8dcef" : "#efb1c3").setOrigin(0.5).setName("label");
    const star = this.text(0, -radius - 18, "★".repeat(fighter.star), 11, "#ffdc68").setOrigin(0.5).setName("star");
    const zone = this.add.zone(0, 0, radius * 2.4, radius * 2.4).setInteractive({ useHandCursor: true });
    zone.setData("fighter", fighter.fid);
    zone.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
    zone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.showUnitTooltip(fighter.unitId, pointer, fighter.star, fighter));
    zone.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!this.isCompact()) this.clearTooltip();
    });
    container.add([shadow, shield, portrait, hitFlash, burn, hpBack, hp, energyBack, energy, label, star, status, zone]);
    return container;
  }

  private updateFighter(view: Phaser.GameObjects.Container, fighter: Fighter) {
    const radius = fighter.radius || fighterVisualRadius(fighter.unitId, fighter.star);
    const jumping = fighter.jumpTime > 0 && fighter.jumpDuration > 0;
    const jumpProgress = jumping ? 1 - fighter.jumpTime / fighter.jumpDuration : 0;
    const jumpArc = jumping ? Math.sin(jumpProgress * Math.PI) * (fighter.jumpArcHeight || 92) : 0;
    const attackProgress = fighter.attackPulse > 0 ? fighter.attackPulse / 0.22 : 0;
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
    const burn = view.getByName("burn") as Phaser.GameObjects.Arc;
    const status = view.getByName("status") as Phaser.GameObjects.Text;
    const shadow = view.getByName("shadow") as Phaser.GameObjects.Ellipse;
    const label = view.getByName("label") as Phaser.GameObjects.Text;
    const hitProgress = fighter.hitPulse > 0 ? fighter.hitPulse / 0.2 : 0;
    const growth = fighter.growthStacks > 0
      ? 1 + fighter.growthStacks * 0.015 + Math.sin(this.bridge.engine.state.visualTime * 8) * 0.008
      : 1;
    const attackScaleX = 1 + lunge / 70;
    const attackScaleY = 1 - lunge / 130;
    const hitScaleX = 1 - 0.08 * hitProgress;
    const hitScaleY = 1 + 0.08 * hitProgress;
    portrait.setScale(growth * attackScaleX * hitScaleX, growth * attackScaleY * hitScaleY).setAlpha(fighter.stun > 0 ? 0.72 : 1);
    const portraitImage = portrait.getByName("portraitImage") as Phaser.GameObjects.Image;
    portraitImage.setFlipX(fighter.facingX < 0);
    shadow.setPosition(-attackOffsetX, radius * 0.8 + jumpArc - attackOffsetY).setScale(growth, growth);
    hp.width = radius * 2.25 * Math.max(0, fighter.hp / fighter.maxHp);
    energy.width = radius * 2.25 * Math.max(0, Math.min(1, fighter.energy / fighter.maxEnergy));
    energy.fillColor = Phaser.Display.Color.HexStringToColor(ENERGY_PROFILES[fighter.energyStyle].color).color;
    hitFlash.setAlpha(0.72 * hitProgress).setRadius(radius * growth);
    shield.setRadius(radius + 7 + Math.sin(this.bridge.engine.state.visualTime * 6) * 2).setAlpha(fighter.shield > 0 ? 0.28 : 0);
    burn.setAlpha(fighter.burnTime > 0 ? 0.9 : 0).setScale(1 + Math.sin(this.bridge.engine.state.visualTime * 10) * 0.35);
    status.setText(fighter.stun > 0 ? "✦" : fighter.jumpPending ? "⌁" : fighter.gen27Buffed ? "27" : fighter.enraged ? "!" : "");
    status.setColor(fighter.enraged ? "#ff4f9a" : fighter.gen27Buffed ? "#dfccff" : "#ffd95e");
    label.setText(`${UNIT_DEFS[fighter.unitId].name}${fighter.growthStacks ? ` · 饱${fighter.growthStacks}` : ""}${fighter.shield > 0 ? " ◇" : ""}`);
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
    const icon = this.text(0, 0, projectile.style === "shark" ? "🦈" : projectile.style === "carrot" ? "🥕" : "", Math.max(12, projectile.size), "#ffffff").setOrigin(0.5).setName("icon");
    container.add([trail, core, icon]);
    return container;
  }

  private updateProjectile(view: Phaser.GameObjects.Container, projectile: Projectile) {
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
    const angle = Math.atan2(projectile.velocityY, projectile.velocityX);
    const trail = view.getByName("trail") as Phaser.GameObjects.Graphics;
    const core = view.getByName("core") as Phaser.GameObjects.Arc;
    const icon = view.getByName("icon") as Phaser.GameObjects.Text;
    view.setPosition(projectile.x, projectile.y).setDepth(DEPTH.effects + projectile.y);
    trail.clear();
    const trailLength = projectile.style === "pine_needle" ? 16 : 22;
    const tailX = -(projectile.velocityX / speed) * trailLength;
    const tailY = -(projectile.velocityY / speed) * trailLength;
    const { color: projectileColor } = Phaser.Display.Color.HexStringToColor(projectile.color);
    trail.lineStyle(projectile.style === "pine_needle" ? 2.2 : projectile.size + 3, projectileColor, projectile.style === "pine_needle" ? 0.94 : 0.65);
    trail.lineBetween(tailX, tailY, 0, 0);
    core.setRadius(Math.max(2, projectile.size)).setFillStyle(0xf8fcff, projectile.style === "pine_needle" ? 0 : 0.98);
    icon.setText(projectile.emoji || (projectile.style === "shark" ? "🦈" : projectile.style === "carrot" ? "🥕" : ""));
    icon.setRotation(angle).setVisible(icon.text.length > 0);
  }

  private createEffect(effect: BattleEffect) {
    const container = this.add.container(effect.x, effect.y);
    const graphics = this.add.graphics().setName("shape");
    const label = this.text(0, 0, "", 14, "#ffffff", { fontStyle: "bold" }).setOrigin(0.5).setName("label");
    container.add([graphics, label]);
    return container;
  }

  private updateEffect(view: Phaser.GameObjects.Container, effect: BattleEffect) {
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = Math.max(0, effect.life / effect.maxLife);
    const graphics = view.getByName("shape") as Phaser.GameObjects.Graphics;
    const label = view.getByName("label") as Phaser.GameObjects.Text;
    const { color } = Phaser.Display.Color.HexStringToColor(effect.color);
    view.setPosition(effect.x, effect.y).setAlpha(alpha).setDepth(DEPTH.effects + effect.y + 1);
    graphics.clear();
    label.setVisible(false);
    if (effect.kind === "line") {
      const targetX = (effect.x2 ?? effect.x) - effect.x;
      const targetY = (effect.y2 ?? effect.y) - effect.y;
      const width = effect.size || 3;
      graphics.lineStyle(width + 4, color, 0.45).lineBetween(0, 0, targetX, targetY);
      graphics.lineStyle(Math.max(1, width * 0.5), 0xf4fbff, 0.96).lineBetween(0, 0, targetX, targetY);
    } else if (effect.kind === "ring") {
      graphics.lineStyle(Math.max(2, 8 * (1 - progress)), color, 1).strokeCircle(0, 0, Math.max(6, (effect.size || 80) * progress));
    } else if (effect.kind === "burst" || effect.kind === "chronosphere" || effect.kind === "hotpot") {
      const radius = (effect.size || (effect.kind === "hotpot" ? 130 : 50)) * (effect.kind === "hotpot" ? 0.45 + progress * 0.7 : 0.35 + progress * 0.65);
      const fill = effect.kind === "hotpot" ? 0xff6b2d : color;
      graphics.fillStyle(fill, effect.kind === "hotpot" ? 0.3 : 0.24).fillCircle(0, 0, radius);
      graphics.lineStyle(effect.kind === "hotpot" ? 4 : 3, color, 0.9).strokeCircle(0, 0, radius * (effect.kind === "hotpot" ? 0.72 : 0.92));
      if (effect.kind === "hotpot") graphics.lineStyle(2, 0xffd27a, 0.9).strokeCircle(0, 0, radius * 0.48);
    } else {
      label
        .setText(effect.text || "")
        .setColor(effect.color)
        .setFontSize(effect.size || 14)
        .setY(-progress * 26)
        .setVisible(true);
    }
  }

  private createRabbit(_pet: MechanicalRabbitPet) {
    const container = this.add.container(0, 0);
    const shadow = this.add.ellipse(0, 0, 30, 9, 0x000000, 0.28).setName("shadow");
    const body = this.add.polygon(0, 0, [-16, 0, -6, -8, 12, -6, 17, 0, 12, 6, -6, 8], 0x506979).setName("body");
    const cannon = this.add.rectangle(17, 0, 28, 7, 0xbed0db).setOrigin(0, 0.5).setName("cannon");
    const eye = this.add.circle(-5, 0, 2.5, 0x92d7ff).setName("eye");
    const flash = this.add.circle(45, 0, 5, 0xe8fbff, 0).setName("flash");
    container.add([shadow, body, cannon, eye, flash]);
    return container;
  }

  private updateRabbit(view: Phaser.GameObjects.Container, pet: MechanicalRabbitPet, visualTime: number) {
    const fade = Math.max(0.25, Math.min(1, pet.life / 0.7));
    const bob = Math.sin(visualTime * 8 + pet.x * 0.03) * 3;
    const angle = Math.atan2(pet.aimY, pet.aimX);
    const flash = view.getByName("flash") as Phaser.GameObjects.Arc;
    const muzzle = mechanicalRabbitMuzzle(pet);
    const muzzleDistance = Math.hypot(muzzle.x - pet.x, muzzle.y - pet.y);
    view.setPosition(pet.x, pet.y + bob).setRotation(angle).setAlpha(fade).setDepth(DEPTH.entities + pet.y + 0.5);
    (view.getByName("shadow") as Phaser.GameObjects.Ellipse).setRotation(-angle).setY(pet.radius * 0.88 - bob);
    flash.setX(muzzleDistance).setAlpha(pet.attackPulse > 0 ? Math.min(1, pet.attackPulse / 0.16) : 0).setScale(1 + pet.attackPulse * 4);
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

  private syncBattleOverlay() {
    const { battle } = this.bridge.engine.state;
    if (!battle) return;
    this.buttonViews.forEach((button) => button.destroy());
    this.buttonViews = [];
    this.overlayLayer.removeAll(true);
    const remaining = Math.max(0, battle.limit - battle.elapsed);
    this.overlayLayer.add(this.panel(508, 104, 104, 28, 0x09131d, 0.88, remaining < 6 ? 0xff718e : 0x8edfff));
    this.overlayLayer.add(this.text(560, 118, `⏱ ${remaining.toFixed(1)}s`, 14, remaining < 6 ? "#ff718e" : "#dcefff", { fontStyle: "bold" }).setOrigin(0.5));
    if (battle.bannerTimer > 0) this.overlayLayer.add(this.text(560, 155, battle.banner, 14, "#f5fbff", { backgroundColor: "#09131ddd", padding: { x: 18, y: 10 }, wordWrap: { width: 310 }, align: "center" }).setOrigin(0.5));
    this.button(892, 98, 180, 34, `战斗统计 · ${battle.rankingOpen ? "收起" : "展开"}`, { type: "rankingToggle" }, { tone: "neutral", selected: battle.rankingOpen }, DEPTH.overlay + 1);
    if (battle.rankingOpen) this.drawRanking();
    this.drawToast();
  }

  private drawRanking() {
    const { battle } = this.bridge.engine.state;
    if (!battle) return;
    const panel = this.panel(802, 142, 270, 344, 0x07111b, 0.96);
    this.overlayLayer.add(panel);
    this.overlayLayer.add(this.text(816, 154, "本场战斗", 12, "#eff8ff", { fontStyle: "bold" }));
    (["damage", "support", "taken"] as RankingMetric[]).forEach((metric, index) => {
      const tone: ButtonTone = metric === "damage" ? "metricDamage" : metric === "support" ? "metricSupport" : "metricTaken";
      this.button(814 + index * 84, 178, metric === "support" ? 88 : 76, 24, resultMetricLabel[metric], { type: "metric", metric }, { tone, selected: battle.rankingMetric === metric }, DEPTH.overlay + 2);
    });
    const ranking = this.bridge.engine.getBattleRanking();
    const maximum = Math.max(1, ...ranking.map(({ value }) => value));
    ranking.slice(0, 8).forEach(({ fighter, value }, index) => {
      const y = 218 + index * 32;
      const row = this.add.graphics();
      row.fillStyle(0x102330, fighter.alive ? 0.9 : 0.48).fillRoundedRect(812, y - 13, 250, 27, 7);
      row.fillStyle(Phaser.Display.Color.HexStringToColor(UNIT_DEFS[fighter.unitId].accent).color, 0.65).fillRoundedRect(876, y + 7, 130 * (value / maximum), 3, 2);
      this.overlayLayer.add(row);
      this.overlayLayer.add(this.createPortrait(fighter.unitId, 834, y, 10, fighter.team === "enemy").setAlpha(fighter.alive ? 1 : 0.45));
      this.overlayLayer.add(this.text(850, y, `${index + 1}`, 10, "#98b1c2").setOrigin(0, 0.5));
      this.overlayLayer.add(this.text(868, y - 5, `${UNIT_DEFS[fighter.unitId].name}${"★".repeat(fighter.star)}`, 9, UNIT_DEFS[fighter.unitId].accent, { fontStyle: "bold" }).setOrigin(0, 0.5).setAlpha(fighter.alive ? 1 : 0.52));
      const support = battle.rankingMetric === "support" ? `治${short(fighter.healingDone)} 盾${short(fighter.shieldingDone)}` : short(value);
      this.overlayLayer.add(this.text(1056, y, support, 9, "#effaff").setOrigin(1, 0.5));
    });
  }

  private resultContinueLabel() {
    const { state } = this.bridge.engine;
    if (state.hp <= 0) return "继续 · 查看结局";
    const augmentRound = state.round === 2 || state.round === 5 || (
      state.round > CAMPAIGN_ROUNDS
      && (state.round - CAMPAIGN_ROUNDS) % 6 === 0
      && state.augments.length < AUGMENTS.length
    );
    return augmentRound ? "继续 · 选择契印" : "继续 · 进入整备";
  }

  private drawResultRow(x: number, y: number, width: number, rank: number, fighter: Fighter, value: number, metric: RankingMetric) {
    const accent = Phaser.Display.Color.HexStringToColor(UNIT_DEFS[fighter.unitId].accent).color;
    const row = this.add.graphics();
    row.fillStyle(0x102230, fighter.alive ? 0.96 : 0.52).fillRoundedRect(x, y, width, 54, 9);
    row.lineStyle(1, accent, fighter.alive ? 0.45 : 0.2).strokeRoundedRect(x, y, width, 54, 9);
    this.overlayLayer.add(row);
    this.overlayLayer.add(this.createPortrait(fighter.unitId, x + 28, y + 27, 18, fighter.team === "enemy").setAlpha(fighter.alive ? 1 : 0.45));
    this.overlayLayer.add(this.text(x + 54, y + 10, `${rank}. ${UNIT_DEFS[fighter.unitId].name}${"★".repeat(fighter.star)}`, 10, UNIT_DEFS[fighter.unitId].accent, { fontStyle: "bold" }).setAlpha(fighter.alive ? 1 : 0.55));
    this.overlayLayer.add(this.text(x + width - 12, y + 10, fighter.alive ? "存活" : "已阵亡", 8, fighter.alive ? "#75e6b0" : "#81919d", { fontStyle: "bold" }).setOrigin(1));
    this.overlayLayer.add(this.text(x + 54, y + 26, `血 ${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)} · 盾 ${Math.round(fighter.shield)} · 攻 ${Math.round(fighter.attack)} · 甲 ${Math.round(fighter.armor)}`, 8, "#a9bfcc"));
    const metricText = metric === "support"
      ? `治 ${short(fighter.healingDone)} · 盾 ${short(fighter.shieldingDone)}`
      : `${resultMetricLabel[metric]} ${short(value)}`;
    this.overlayLayer.add(this.text(x + 54, y + 40, metricText, 9, "#e6f4fb", { fontStyle: "bold" }));
  }

  private drawResult() {
    const { result, battle } = this.bridge.engine.state;
    if (!result || !battle) return;
    const dim = this.add.rectangle(560, 399, 1120, 642, 0x02070d, 0.76);
    this.overlayLayer.add(dim);
    this.overlayLayer.add(this.panel(40, 94, 1040, 602, 0x07131e, 0.99, result.won ? 0x62e3a6 : 0xff718a));
    this.overlayLayer.add(this.text(560, 114, result.won ? "战斗结算 · 胜利" : "战斗结算 · 失利", 13, result.won ? "#62e3a6" : "#ff718a", { fontStyle: "bold" }).setOrigin(0.5));
    this.overlayLayer.add(this.text(560, 141, result.headline, 23, "#f2f8ff", { fontStyle: "bold" }).setOrigin(0.5));
    this.overlayLayer.add(this.text(560, 166, result.detail, 10, "#9cb4c3", { wordWrap: { width: 860 }, align: "center" }).setOrigin(0.5, 0));
    const reward = result.won
      ? `胜利奖励：+${result.income} 金币${result.upgradeDiscount ? ` · 下次升本减免 ${result.upgradeDiscount}` : ""}`
      : `核心 -${result.damage} · +${result.income} 金币${result.upgradeDiscount ? ` · 下次升本减免 ${result.upgradeDiscount}` : ""}`;
    this.overlayLayer.add(this.text(560, 194, reward, 10, result.won ? "#8ce8bd" : "#ff9caf", { fontStyle: "bold" }).setOrigin(0.5));
    (["damage", "support", "taken"] as RankingMetric[]).forEach((metric, index) => {
      const tone: ButtonTone = metric === "damage" ? "metricDamage" : metric === "support" ? "metricSupport" : "metricTaken";
      this.button(426 + index * 98, 220, metric === "support" ? 92 : 80, 24, resultMetricLabel[metric], { type: "metric", metric }, { tone, selected: battle.rankingMetric === metric }, DEPTH.overlay + 3);
    });
    this.overlayLayer.add(this.text(68, 258, "我方阵容", 13, "#7fdcff", { fontStyle: "bold" }));
    this.overlayLayer.add(this.text(574, 258, "敌方阵容", 13, "#ff91a9", { fontStyle: "bold" }));
    (["player", "enemy"] as const).forEach((team, teamIndex) => {
      this.bridge.engine.getBattleRanking(team).slice(0, 6).forEach(({ fighter, value }, index) => {
        this.drawResultRow(teamIndex ? 574 : 68, 278 + index * 58, 478, index + 1, fighter, value, battle.rankingMetric);
      });
    });
    this.button(410, 646, 300, 38, this.resultContinueLabel(), { type: "resultContinue" }, { tone: result.won ? "confirm" : "danger" }, DEPTH.overlay + 3);
  }

  private drawAugments() {
    const { state } = this.bridge.engine;
    this.phaseLayer.add(this.text(560, 142, "战术契印", 36, "#f3f8ff", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(560, 185, "选择一项永久天赋，立刻进入下一轮整备。", 13, "#95adbd").setOrigin(0.5));
    state.augmentChoices.forEach((id, index) => {
      const augment = AUGMENTS.find((item) => item.id === id);
      if (!augment) return;
      const x = 75 + index * 350;
      const card = this.add.container(x, 255);
      card.add(this.panel(0, 0, 320, 300, 0x132231, 0.98, Phaser.Display.Color.HexStringToColor(augment.color).color));
      card.add(this.text(160, 48, augment.kicker.toUpperCase(), 10, augment.color, { fontStyle: "bold" }).setOrigin(0.5));
      card.add(this.text(160, 82, augment.name, 22, "#eff7ff", { fontStyle: "bold" }).setOrigin(0.5));
      card.add(this.text(24, 118, augment.description, 13, "#a9bfcc", { wordWrap: { width: 272 }, align: "center" }).setOrigin(0));
      card.add(this.button(70, 244, 180, 34, "装备契印", { type: "augment", index }, { tone: "confirm" }));
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
    if (!toast) return;
    const color = toast.tone === "good" ? "#68e3aa" : toast.tone === "bad" ? "#ff7890" : "#79d8ff";
    const text = this.text(560, 90, toast.text, 12, color, { backgroundColor: "#07111bee", padding: { x: 22, y: 10 }, wordWrap: { width: 560 }, align: "center" }).setOrigin(0.5, 0);
    text.setName("toast");
    this.tooltipLayer.add(text);
  }

  private syncToast() {
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

  private tooltipPosition(pointer: Phaser.Input.Pointer | undefined, width: number, height: number, compactY: number) {
    if (this.isCompact() || !pointer) return { x: 28, y: compactY };
    const logical = this.logicalPointer(pointer);
    return {
      x: Phaser.Math.Clamp(logical.x + 18, 12, WORLD_WIDTH - width - 12),
      y: Phaser.Math.Clamp(logical.y + 18, 86, WORLD_HEIGHT - height - 12),
    };
  }

  private showUnitTooltip(unitId: UnitId, pointer?: Phaser.Input.Pointer, star = 1, fighter?: Fighter) {
    if (this.isCompact() && this.pinnedTooltip && this.pinnedTooltip !== unitId) return;
    this.clearTooltip();
    this.pinnedTooltip = this.isCompact() ? unitId : null;
    const def = UNIT_DEFS[unitId];
    const width = 342;
    const detail = fighter
      ? `生命 ${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)} · 护盾 ${Math.round(fighter.shield)}\n攻击 ${Math.round(fighter.attack)} · 护甲 ${Math.round(fighter.armor)} · 射程 ${Math.round(fighter.range)}\n攻速 ${fighter.attackInterval.toFixed(2)}s · 移速 ${Math.round(fighter.moveSpeed)}\n战斗：输出 ${short(fighter.damageDealt)} · 治疗 ${short(fighter.healingDone)} · 护盾 ${short(fighter.shieldingDone)}`
      : `${def.attackType === "ranged" ? "远程" : "近战"} · 生命 ${def.hp} · 攻击 ${def.attack} · 护甲 ${def.armor}\n射程 ${def.range} · 攻速 ${def.attackInterval.toFixed(2)}s · 移速 ${def.moveSpeed}`;
    const ability = this.text(0, 0, `${def.abilityName}\n${def.abilityDescription}`, 10, "#adc1cc", { wordWrap: { width: width - 36 }, lineSpacing: 4 });
    const height = Math.max(this.isCompact() ? 202 : 224, 130 + ability.height);
    ability.destroy();
    const { x, y } = this.tooltipPosition(pointer, width, height, 280);
    const container = this.add.container(x, y);
    container.add(this.panel(0, 0, width, height, 0x07111b, 0.98, Phaser.Display.Color.HexStringToColor(def.accent).color));
    container.add(this.text(18, 16, `${def.name} ${"★".repeat(star)} · ${def.cost}费`, 16, "#f1f8ff", { fontStyle: "bold" }));
    container.add(this.text(18, 44, detail, 10, "#abc1ce", { lineSpacing: 3 }));
    container.add(this.text(18, fighter ? 118 : 94, `${def.energyProfile.name} · ${fighter ? `${Math.round(fighter.energy)}/${fighter.maxEnergy}` : `${def.energyProfile.start}/${def.energyProfile.max}`}`, 10, def.energyProfile.color));
    container.add(this.text(18, fighter ? 140 : 116, `${def.abilityName}\n${def.abilityDescription}`, 10, "#adc1cc", { wordWrap: { width: width - 36 }, lineSpacing: 4 }));
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private showTraitTooltip(traitId: keyof typeof TRAITS, pointer?: Phaser.Input.Pointer) {
    this.clearTooltip();
    const trait = TRAITS[traitId];
    const status = this.bridge.engine.getTraitStatus(traitId);
    const width = 360;
    const thresholds = trait.thresholds.map((threshold, index) => `${status.count >= threshold ? "◆" : "◇"} ${threshold} 名：${trait.bonuses[index]}`).join("\n");
    const thresholdText = this.text(0, 0, thresholds, 10, "#dcefff", { wordWrap: { width: 324 }, lineSpacing: 5 });
    const descriptionText = this.text(0, 0, trait.description, 10, "#a9bfcc", { wordWrap: { width: 324 } });
    const height = Math.max(184, 80 + descriptionText.height + thresholdText.height);
    thresholdText.destroy();
    descriptionText.destroy();
    const { x, y } = this.tooltipPosition(pointer, width, height, 300);
    const container = this.add.container(x, y);
    container.add(this.panel(0, 0, width, height, 0x07111b, 0.98, Phaser.Display.Color.HexStringToColor(trait.color).color));
    container.add(this.text(18, 16, `${trait.name} · ${status.count}/${status.maxThreshold}`, 16, "#f1f8ff", { fontStyle: "bold" }));
    const description = this.text(18, 45, trait.description, 10, "#a9bfcc", { wordWrap: { width: 324 } });
    container.add(description);
    container.add(this.text(18, 55 + description.height, thresholds, 10, "#dcefff", { wordWrap: { width: 324 }, lineSpacing: 5 }));
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private clearTooltip() {
    this.tooltipLayer.getAll("name", "tooltip").forEach((item) => item.destroy());
    this.pinnedTooltip = null;
  }
}
