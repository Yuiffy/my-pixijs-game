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
  PineTreeTurret,
  Projectile,
  RankingMetric,
  UnitLocation,
} from "../core/gameTypes";
import { fighterVisualRadius, mechanicalRabbitMuzzle } from "../core/battleGeometry";
import { EngineBridge, type GameAction } from "./EngineBridge";
import { createFallbackTextures, preloadUnitPortraits, textureKeyForUnit } from "./assets";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  benchSlot,
  boardSlot,
  compactBenchSlot,
  compactBoardSlot,
  profileFor,
  type LayoutProfile,
} from "./layout";
import { COLORS, DEPTH, FONT_FAMILY } from "./theme";

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

  private dragOrigin: UnitLocation | null = null;

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
    this.updateQuality();
    createFallbackTextures(this);
    this.input.setTopOnly(true);
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
    this.updateQuality();
    this.profile = profileFor(this.scale.displaySize.width, this.scale.displaySize.height);
    this.rebuild();
  }

  private isCompact() {
    return this.profile === "compact";
  }

  private resetLayers() {
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
    this.profile = profileFor(this.scale.displaySize.width, this.scale.displaySize.height);
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
    if (this.phase === "battle" || this.phase === "result") {
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
    const deviceResolution = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    this.textResolution = Math.max(1, Math.min(2, deviceResolution));
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

  private panel(x: number, y: number, width: number, height: number, color = COLORS.panel, alpha = 0.96, border = COLORS.border) {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, alpha);
    graphics.fillRoundedRect(x, y, width, height, 14);
    graphics.lineStyle(1, border, 0.8);
    graphics.strokeRoundedRect(x, y, width, height, 14);
    return graphics;
  }

  private button(x: number, y: number, width: number, height: number, label: string, action: GameAction, color = 0x285f78, depth = DEPTH.ui) {
    const container = this.add.container(x, y).setDepth(depth);
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(0, 0, width, height, 12);
    graphics.lineStyle(1, 0x8edfff, 0.55);
    graphics.strokeRoundedRect(0, 0, width, height, 12);
    const labelText = this.text(width / 2, height / 2, label, 12, "#edfaff", { fontStyle: "bold" }).setOrigin(0.5);
    const zone = this.add.zone(width / 2, height / 2, width, height).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch(action));
    zone.on(Phaser.Input.Events.POINTER_OVER, () => graphics.setAlpha(0.78));
    zone.on(Phaser.Input.Events.POINTER_OUT, () => graphics.setAlpha(1));
    container.add([graphics, labelText, zone]);
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
      const zone = this.add.zone(cardWidth / 2, compact ? 221 : 236, cardWidth - 48, 32).setInteractive({ useHandCursor: true });
      const action = this.button(62, compact ? 204 : 218, cardWidth - 124, 32, "接入协议", { type: "starter", id }, Phaser.Display.Color.HexStringToColor(starter.color).color, DEPTH.board);
      container.add([action, zone]);
      zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch({ type: "starter", id }));
      zone.on(Phaser.Input.Events.POINTER_OVER, () => container.setY(y - 5));
      zone.on(Phaser.Input.Events.POINTER_OUT, () => container.setY(y));
      this.phaseLayer.add(container);
    });
    this.phaseLayer.add(this.text(WORLD_WIDTH / 2, 650, `本局战术种子 · ${String(state.seed % 100000).padStart(5, "0")}`, 11, "#648297").setOrigin(0.5));
  }

  private drawPreparation() {
    const { engine } = this.bridge;
    const { state, currentWave } = engine;
    const compact = this.isCompact();
    this.phaseLayer.add(this.panel(26, 98, compact ? 1068 : 752, compact ? 400 : 430));
    this.phaseLayer.add(this.text(48, 116, currentWave.tag === "boss" ? "BOSS" : `WAVE ${currentWave.round}`, 10, currentWave.tag === "boss" ? "#ff8ba7" : "#72d8ff", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(48, 136, currentWave.name, 20, "#f1f7ff", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(48, 158, currentWave.description, 11, "#91aab9", { wordWrap: { width: compact ? 720 : 500 } }));
    this.drawTraits();
    state.board.forEach((unit, index) => this.drawSlot("board", index, unit, compact));
    state.bench.forEach((unit, index) => this.drawSlot("bench", index, unit, compact));
    if (compact) this.drawCompactShop();
    else this.drawWideShop();
    this.drawPreparationActions(compact);
  }

  private drawTraits() {
    const traits = Object.entries(this.bridge.engine.getTraitCounts()).filter(([, count]) => count > 0).slice(0, this.isCompact() ? 7 : 9);
    let x = 48;
    traits.forEach(([id, count]) => {
      const trait = TRAITS[id as keyof typeof TRAITS];
      const status = this.bridge.engine.getTraitStatus(id as keyof typeof TRAITS);
      const label = `${trait.name} ${count}/${status.maxThreshold}`;
      const width = Math.max(82, label.length * 10 + 26);
      const graphics = this.add.graphics();
      graphics.fillStyle(Phaser.Display.Color.HexStringToColor(trait.color).color, status.active ? 0.24 : 0.12);
      graphics.fillRoundedRect(x, 190, width, 25, 12);
      graphics.lineStyle(1, Phaser.Display.Color.HexStringToColor(trait.color).color, 0.8);
      graphics.strokeRoundedRect(x, 190, width, 25, 12);
      const zone = this.add.zone(x + width / 2, 202, width, 25).setInteractive({ useHandCursor: true });
      zone.setData("trait", trait.id);
      zone.on(Phaser.Input.Events.POINTER_OVER, () => this.showTraitTooltip(trait.id));
      zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.showTraitTooltip(trait.id));
      zone.on(Phaser.Input.Events.POINTER_OUT, () => {
        if (!this.isCompact()) this.clearTooltip();
      });
      this.phaseLayer.add([graphics, this.text(x + 12, 196, label, 10, status.active ? "#effaff" : "#8aa1b0", { fontStyle: "bold" }), zone]);
      x += width + 8;
    });
  }

  private drawSlot(zone: UnitLocation["zone"], index: number, unit: ReturnType<typeof this.bridge.engine.state.board.at>, compact: boolean) {
    const rect = compact
      ? zone === "board" ? compactBoardSlot(index) : compactBenchSlot(index)
      : zone === "board" ? boardSlot(index) : benchSlot(index);
    const selected = this.bridge.engine.state.selected?.zone === zone && this.bridge.engine.state.selected.index === index;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0c1c29, 0.82);
    graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 12);
    graphics.lineStyle(selected ? 2 : 1, selected ? 0x7de2ff : 0x294a60, 1);
    graphics.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 12);
    const slot = this.add.zone(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height).setInteractive({ useHandCursor: true });
    const location = { zone, index } as UnitLocation;
    slot.setData("slot", location);
    slot.on(Phaser.Input.Events.POINTER_DOWN, () => {
      const occupied = zone === "board"
        ? this.bridge.engine.state.board[index]
        : this.bridge.engine.state.bench[index];
      this.dragOrigin = occupied ? location : null;
    });
    slot.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      const origin = this.dragOrigin;
      const distance = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y);
      if (origin && distance > 8 && (origin.zone !== location.zone || origin.index !== location.index)) {
        this.dispatch({ type: "move", from: origin, to: location });
      } else this.dispatch({ type: "slot", location });
      this.dragOrigin = null;
    });
    slot.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!this.input.activePointer.isDown) this.dragOrigin = null;
    });
    this.phaseLayer.add([graphics, slot]);
    if (!unit) {
      this.phaseLayer.add(this.text(rect.x + rect.width / 2, rect.y + rect.height / 2, zone === "bench" ? "空" : "·", 14, "#426176").setOrigin(0.5));
      return;
    }
    const portrait = this.createPortrait(unit.id, rect.x + rect.width / 2, rect.y + rect.height * 0.44, compact ? 20 : 18);
    const name = this.text(rect.x + rect.width / 2, rect.y + rect.height - 12, `${unit.star > 1 ? "★".repeat(unit.star) : ""}${UNIT_DEFS[unit.id].name}`, compact ? 10 : 9, "#e5f4ff", { fontStyle: "bold" }).setOrigin(0.5);
    this.phaseLayer.add([portrait, name]);
  }

  private drawWideShop() {
    const { state, isMaxPlayerLevel, upgradeCost } = this.bridge.engine;
    this.phaseLayer.add(this.panel(794, 98, 300, 500, 0x08131f));
    this.phaseLayer.add(this.text(812, 112, `战术商店 · ${bookLevelForPlayerLevel(state.playerLevel)} 本`, 16, "#f1f8ff", { fontStyle: "bold" }));
    state.shop.forEach((unitId, index) => {
      const y = 143 + index * 74;
      const item = this.add.container(810, y);
      item.add(this.panel(0, 0, 270, 68, 0x112431, unitId ? 0.95 : 0.55, 0x2d5064));
      if (unitId) {
        const def = UNIT_DEFS[unitId];
        item.add(this.createPortrait(unitId, 31, 34, 20));
        item.add(this.text(62, 11, def.name, 13, "#edf7ff", { fontStyle: "bold" }));
        item.add(this.text(62, 29, def.title, 9, "#94acbc"));
        item.add(this.text(245, 22, `${def.cost}`, 22, COLORS.gold, { fontStyle: "bold" }).setOrigin(0.5));
        const traits = def.traits.map((trait) => TRAITS[trait].name).join(" · ");
        item.add(this.text(62, 48, traits, 8, "#8edfff"));
        const zone = this.add.zone(135, 34, 270, 68).setInteractive({ useHandCursor: true });
        const action = { type: "shop", index } satisfies GameAction;
        zone.setData("action", action);
        zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch(action));
        zone.on(Phaser.Input.Events.POINTER_OVER, () => this.showUnitTooltip(unitId));
        zone.on(Phaser.Input.Events.POINTER_OUT, () => {
          if (!this.isCompact()) this.clearTooltip();
        });
        item.add(zone);
      } else item.add(this.text(135, 34, "已征募", 12, "#547188").setOrigin(0.5));
      this.phaseLayer.add(item);
    });
    this.button(810, 530, 82, 48, isMaxPlayerLevel ? "已满级" : `升本 · ${upgradeCost}`, { type: "buyXp" }, 0x285f78, DEPTH.board);
    this.button(900, 530, 82, 22, state.shopLocked ? "已锁定" : "锁定商店", { type: "lock" }, state.shopLocked ? 0x704f99 : 0x344d5d, DEPTH.board);
    this.button(900, 556, 82, 22, "刷新 · 1", { type: "reroll" }, 0x55472f, DEPTH.board);
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
        item.add(this.createPortrait(unitId, 27, 33, 19));
        item.add(this.text(54, 10, def.name, 12, "#edf7ff", { fontStyle: "bold" }));
        item.add(this.text(54, 29, def.traits.map((trait) => TRAITS[trait].name).join(" · "), 8, "#91cee8"));
        item.add(this.text(174, 21, `${def.cost}`, 21, COLORS.gold, { fontStyle: "bold" }).setOrigin(0.5));
        const zone = this.add.zone(98, 33, 196, 66).setInteractive({ useHandCursor: true });
        const action = { type: "shop", index } satisfies GameAction;
        zone.setData("action", action);
        zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.dispatch(action));
        zone.on(Phaser.Input.Events.POINTER_OVER, () => this.showUnitTooltip(unitId));
        item.add(zone);
      }
      this.phaseLayer.add(item);
    });
  }

  private drawPreparationActions(compact: boolean) {
    const { state, isMaxPlayerLevel, upgradeCost } = this.bridge.engine;
    if (compact) {
      this.button(42, 675, 190, 40, isMaxPlayerLevel ? "已满级" : `升本 · ${upgradeCost}`, { type: "buyXp" });
      this.button(252, 675, 190, 40, state.shopLocked ? "已锁定商店" : "锁定商店", { type: "lock" }, state.shopLocked ? 0x704f99 : 0x344d5d);
      this.button(462, 675, 190, 40, "刷新商店 · 1", { type: "reroll" }, 0x55472f);
      this.button(672, 675, 190, 40, state.selected ? "出售选中棋子" : "选择棋子后出售", { type: "sell" }, state.selected ? 0x873b49 : 0x394756);
      this.button(882, 675, 196, 40, "开始战斗", { type: "battle" }, 0x42a97b);
    } else {
      this.button(990, 530, 90, 48, "开始战斗", { type: "battle" }, 0x42a97b);
      this.button(636, 553, 112, 34, state.selected ? "回收选中" : "选择棋子", { type: "sell" }, state.selected ? 0x873b49 : 0x394756);
    }
  }

  private drawBattle() {
    const field = this.add.graphics();
    field.fillGradientStyle(0x0f3342, 0x142235, 0x3d172f, 0x142235, 0.96);
    field.fillRoundedRect(24, 94, 1072, 596, 18);
    field.lineStyle(1, 0x6094b0, 0.35).strokeRoundedRect(24, 94, 1072, 596, 18);
    for (let x = 52; x < 1090; x += 54) field.lineStyle(1, 0x7ab4d0, 0.08).lineBetween(x, 112, x, 676);
    for (let y = 122; y < 690; y += 54) field.lineStyle(1, 0x7ab4d0, 0.08).lineBetween(36, y, 1084, y);
    this.phaseLayer.add(field);
    this.phaseLayer.add(this.text(48, 108, "守备方", 10, "#72d8ff", { fontStyle: "bold" }));
    this.phaseLayer.add(this.text(1072, 108, "裂隙军团", 10, "#ff6d9a", { fontStyle: "bold" }).setOrigin(1, 0));
    this.phaseLayer.add(this.text(560, 108, "战斗中", 14, "#ecf7ff", { fontStyle: "bold" }).setOrigin(0.5));
    this.syncBattleEntities();
    this.syncCombatEffects();
    this.syncBattleOverlay();
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
    this.overlayLayer.add(this.text(560, 118, `⏱ ${remaining.toFixed(1)}s`, 14, remaining < 6 ? "#ff718e" : "#dcefff", { fontStyle: "bold" }).setOrigin(0.5));
    if (battle.bannerTimer > 0) this.overlayLayer.add(this.text(560, 155, battle.banner, 14, "#f5fbff", { backgroundColor: "#09131ddd", padding: { x: 18, y: 10 }, wordWrap: { width: 310 }, align: "center" }).setOrigin(0.5));
    this.button(892, 98, 180, 34, `战斗统计 · ${battle.rankingOpen ? "收起" : "展开"}`, { type: "rankingToggle" }, 0x1d4053, DEPTH.overlay + 1);
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
      this.button(814 + index * 84, 178, metric === "support" ? 88 : 76, 24, resultMetricLabel[metric], { type: "metric", metric }, battle.rankingMetric === metric ? 0x6b4f91 : 0x294554, DEPTH.overlay + 2);
    });
    const ranking = this.bridge.engine.getBattleRanking();
    ranking.slice(0, 8).forEach(({ fighter, value }, index) => {
      const y = 218 + index * 32;
      this.overlayLayer.add(this.text(818, y, `${index + 1}`, 10, "#98b1c2").setOrigin(0, 0.5));
      this.overlayLayer.add(this.text(842, y, `${UNIT_DEFS[fighter.unitId].name}${"★".repeat(fighter.star)}`, 10, UNIT_DEFS[fighter.unitId].accent, { fontStyle: "bold" }).setOrigin(0, 0.5));
      this.overlayLayer.add(this.text(1058, y, short(value), 10, "#effaff").setOrigin(1, 0.5));
    });
  }

  private drawResult() {
    const { result, battle } = this.bridge.engine.state;
    if (!result || !battle) return;
    const dim = this.add.rectangle(560, 399, 1120, 642, 0x02070d, 0.72);
    this.overlayLayer.add(dim);
    this.overlayLayer.add(this.panel(52, 104, 1016, 584, 0x07131e, 0.98, result.won ? 0x62e3a6 : 0xff718a));
    this.overlayLayer.add(this.text(560, 126, result.won ? "战斗结算 · 胜利" : "战斗结算 · 失利", 13, result.won ? "#62e3a6" : "#ff718a", { fontStyle: "bold" }).setOrigin(0.5));
    this.overlayLayer.add(this.text(560, 155, result.headline, 24, "#f2f8ff", { fontStyle: "bold" }).setOrigin(0.5));
    this.overlayLayer.add(this.text(560, 181, result.detail, 10, "#9cb4c3", { wordWrap: { width: 860 }, align: "center" }).setOrigin(0.5, 0));
    (["damage", "support", "taken"] as RankingMetric[]).forEach((metric, index) => this.button(434 + index * 95, 214, index === 1 ? 90 : 78, 24, resultMetricLabel[metric], { type: "metric", metric }, battle.rankingMetric === metric ? 0x704f99 : 0x294554));
    this.overlayLayer.add(this.text(76, 258, "我方阵容", 13, "#7fdcff", { fontStyle: "bold" }));
    this.overlayLayer.add(this.text(576, 258, "敌方阵容", 13, "#ff91a9", { fontStyle: "bold" }));
    ["player", "enemy"].forEach((team, teamIndex) => {
      this.bridge.engine.getBattleRanking(team as "player" | "enemy").forEach(({ fighter, value }, index) => {
        const x = teamIndex ? 576 : 76;
        const y = 276 + index * 52;
        this.overlayLayer.add(this.text(x, y, `${index + 1}. ${UNIT_DEFS[fighter.unitId].name}${"★".repeat(fighter.star)}`, 11, UNIT_DEFS[fighter.unitId].accent, { fontStyle: "bold" }));
        this.overlayLayer.add(this.text(x, y + 18, `血 ${Math.round(fighter.hp)}/${Math.round(fighter.maxHp)} · ${resultMetricLabel[battle.rankingMetric]} ${short(value)}`, 9, "#a9bfcc"));
      });
    });
    this.button(410, 638, 300, 42, "继续", { type: "resultContinue" }, result.won ? 0x30765a : 0x783949);
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
      card.add(this.button(70, 244, 180, 34, "装备契印", { type: "augment", index }, Phaser.Display.Color.HexStringToColor(augment.color).color));
      this.phaseLayer.add(card);
    });
  }

  private drawGameOver() {
    const { state } = this.bridge.engine;
    const won = state.finalWon;
    this.phaseLayer.add(this.text(560, 185, won ? "裂 隙 已 封 闭" : "战 线 已 失 守", 40, won ? "#65e4a9" : "#ff718e", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(560, 250, won ? "守望成功" : `止步第 ${state.round} 战`, 30, "#f3f8ff", { fontStyle: "bold" }).setOrigin(0.5));
    this.phaseLayer.add(this.text(560, 340, `本局积分 ${state.score.toLocaleString()} · 最高纪录 ${state.bestScore.toLocaleString()} · 核心 ${state.hp}/${state.maxHp}`, 16, "#b9cfdd").setOrigin(0.5));
    this.button(420, 548, 280, 62, "再开一局 · 新战术种子", { type: "restart" }, won ? 0x30765a : 0x783949);
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
    const border = this.add.circle(0, 0, radius + 2, enemy ? 0xff688e : Phaser.Display.Color.HexStringToColor(def.accent).color, 0.95);
    const key = textureKeyForUnit(unitId);
    const hasTexture = this.textures.exists(key);
    const portrait = this.add.image(0, 0, hasTexture ? key : "rift-fallback-unit").setName("portraitImage");
    const targetSize = radius * 1.75;

    if (def.portraitStyle === "sprite") {
      const { frame } = portrait;
      const scale = Math.min((radius * 2) / frame.width, (radius * 2) / frame.height);
      portrait.setScale(scale);
    } else {
      const { frame } = portrait;
      const cropSize = Math.min(frame.width, frame.height);
      const cropX = Math.max(0, (frame.width - cropSize) / 2);
      const remainingY = Math.max(0, frame.height - cropSize);
      const cropY = def.portraitFocus === "top" ? remainingY * 0.16 : remainingY / 2;
      portrait.setCrop(cropX, cropY, cropSize, cropSize);
      portrait.setDisplaySize(targetSize, targetSize);
      Phaser.Actions.AddMaskShape(portrait, {
        shape: "circle",
        useInternal: true,
        region: new Phaser.Geom.Rectangle(-targetSize / 2, -targetSize / 2, targetSize, targetSize),
      });
    }

    const glyph = this.text(0, 0, hasTexture ? "" : def.glyph, Math.max(12, radius), "#ffffff", { fontStyle: "bold" }).setOrigin(0.5);
    container.add([border, portrait, glyph]);
    return container;
  }

  private showUnitTooltip(unitId: UnitId) {
    if (this.isCompact() && this.pinnedTooltip && this.pinnedTooltip !== unitId) return;
    this.clearTooltip();
    this.pinnedTooltip = this.isCompact() ? unitId : null;
    const def = UNIT_DEFS[unitId];
    const width = 330;
    const x = this.isCompact() ? 28 : 770;
    const y = this.isCompact() ? 280 : 440;
    const container = this.add.container(x, y);
    container.add(this.panel(0, 0, width, this.isCompact() ? 180 : 210, 0x07111b, 0.98, Phaser.Display.Color.HexStringToColor(def.accent).color));
    container.add(this.text(18, 16, `${def.name} · ${def.cost}费`, 16, "#f1f8ff", { fontStyle: "bold" }));
    container.add(this.text(18, 44, `${def.attackType === "ranged" ? "远程" : "近战"} · 生命 ${def.hp} · 攻击 ${def.attack} · 护甲 ${def.armor}`, 10, "#abc1ce"));
    container.add(this.text(18, 68, `${def.energyProfile.name} · ${def.energyProfile.start}/${def.energyProfile.max}`, 10, def.energyProfile.color));
    container.add(this.text(18, 92, `${def.abilityName}\n${def.abilityDescription}`, 10, "#adc1cc", { wordWrap: { width: width - 36 }, lineSpacing: 4 }));
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private showTraitTooltip(traitId: keyof typeof TRAITS) {
    this.clearTooltip();
    const trait = TRAITS[traitId];
    const status = this.bridge.engine.getTraitStatus(traitId);
    const container = this.add.container(28, 300);
    container.add(this.panel(0, 0, 360, 220, 0x07111b, 0.98, Phaser.Display.Color.HexStringToColor(trait.color).color));
    container.add(this.text(18, 16, `${trait.name} · ${status.count}/${status.maxThreshold}`, 16, "#f1f8ff", { fontStyle: "bold" }));
    container.add(this.text(18, 45, trait.description, 10, "#a9bfcc", { wordWrap: { width: 324 } }));
    container.add(this.text(18, 88, trait.thresholds.map((threshold, index) => `${status.count >= threshold ? "◆" : "◇"} ${threshold} 名：${trait.bonuses[index]}`).join("\n"), 10, "#dcefff", { wordWrap: { width: 324 }, lineSpacing: 5 }));
    container.setName("tooltip");
    this.tooltipLayer.add(container);
  }

  private clearTooltip() {
    this.tooltipLayer.getAll("name", "tooltip").forEach((item) => item.destroy());
    this.pinnedTooltip = null;
  }
}
