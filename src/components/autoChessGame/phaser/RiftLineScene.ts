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
import type { Fighter, RankingMetric, UnitLocation } from "../core/gameTypes";
import { fighterVisualRadius } from "../core/battleGeometry";
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

  private overlayLayer!: Phaser.GameObjects.Container;

  private tooltipLayer!: Phaser.GameObjects.Container;

  private headerLayer!: Phaser.GameObjects.Container;

  private phase = "";

  private profile: LayoutProfile = "wide";

  private fighterViews = new Map<string, Phaser.GameObjects.Container>();

  private dragOrigin: UnitLocation | null = null;

  private pinnedTooltip: UnitId | null = null;

  constructor(bridge: EngineBridge) {
    super({ key: "RiftLineScene" });
    this.bridge = bridge;
  }

  preload() {
    preloadUnitPortraits(this);
  }

  create() {
    createFallbackTextures(this);
    this.input.setTopOnly(true);
    this.drawBackdrop();
    this.headerLayer = this.add.container(0, 0).setDepth(DEPTH.ui);
    this.phaseLayer = this.add.container(0, 0).setDepth(DEPTH.board);
    this.entityLayer = this.add.container(0, 0).setDepth(DEPTH.entities);
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
    this.profile = profileFor(this.scale.displaySize.width, this.scale.displaySize.height);
    this.rebuild();
  }

  private isCompact() {
    return this.profile === "compact";
  }

  private resetLayers() {
    this.phaseLayer.removeAll(true);
    this.entityLayer.removeAll(true);
    this.overlayLayer.removeAll(true);
    this.tooltipLayer.removeAll(true);
    this.headerLayer.removeAll(true);
    this.fighterViews.clear();
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
    this.drawHeader();
    if (this.phase === "battle" || this.phase === "result") {
      this.syncBattleEntities();
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

  private text(x: number, y: number, value: string, size = 14, color = COLORS.text, style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
    return this.add.text(x, y, value, {
      fontFamily: FONT_FAMILY,
      fontSize: `${size}px`,
      color,
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

  private button(x: number, y: number, width: number, height: number, label: string, action: GameAction, color = 0x285f78) {
    const container = this.add.container(x, y).setDepth(DEPTH.ui);
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
      const action = this.button(62, compact ? 204 : 218, cardWidth - 124, 32, "接入协议", { type: "starter", id }, Phaser.Display.Color.HexStringToColor(starter.color).color);
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
    this.button(810, 530, 82, 48, isMaxPlayerLevel ? "已满级" : `升本 · ${upgradeCost}`, { type: "buyXp" });
    this.button(900, 530, 82, 22, state.shopLocked ? "已锁定" : "锁定商店", { type: "lock" }, state.shopLocked ? 0x704f99 : 0x344d5d);
    this.button(900, 556, 82, 22, "刷新 · 1", { type: "reroll" }, 0x55472f);
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
    const shadow = this.add.ellipse(0, radius * 0.8, radius * 1.8, radius * 0.6, 0x000000, 0.3);
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
    container.add([shadow, portrait, hpBack, hp, energyBack, energy, label, star, zone]);
    return container;
  }

  private updateFighter(view: Phaser.GameObjects.Container, fighter: Fighter) {
    const radius = fighter.radius || fighterVisualRadius(fighter.unitId, fighter.star);
    const jumping = fighter.jumpTime > 0 && fighter.jumpDuration > 0;
    const jumpProgress = jumping ? 1 - fighter.jumpTime / fighter.jumpDuration : 0;
    const visualY = fighter.y - (jumping ? Math.sin(jumpProgress * Math.PI) * (fighter.jumpArcHeight || 92) : 0);
    view.setPosition(fighter.x, visualY).setDepth(DEPTH.entities + fighter.y);
    const hp = view.getByName("hp") as Phaser.GameObjects.Rectangle;
    const energy = view.getByName("energy") as Phaser.GameObjects.Rectangle;
    hp.width = radius * 2.25 * Math.max(0, fighter.hp / fighter.maxHp);
    energy.width = radius * 2.25 * Math.max(0, Math.min(1, fighter.energy / fighter.maxEnergy));
    energy.fillColor = Phaser.Display.Color.HexStringToColor(ENERGY_PROFILES[fighter.energyStyle].color).color;
    const portrait = view.getByName("portrait") as Phaser.GameObjects.Container;
    portrait.setScale(fighter.hitPulse > 0 ? 0.93 : 1);
    if (fighter.facingX < 0) portrait.setScale(-Math.abs(portrait.scaleX), portrait.scaleY);
    else portrait.setScale(Math.abs(portrait.scaleX), portrait.scaleY);
    const label = view.getByName("label") as Phaser.GameObjects.Text;
    label.setText(`${UNIT_DEFS[fighter.unitId].name}${fighter.shield > 0 ? " ◇" : ""}`);
  }

  private syncBattleOverlay() {
    const { battle } = this.bridge.engine.state;
    if (!battle) return;
    this.overlayLayer.removeAll(true);
    const remaining = Math.max(0, battle.limit - battle.elapsed);
    this.overlayLayer.add(this.text(560, 118, `⏱ ${remaining.toFixed(1)}s`, 14, remaining < 6 ? "#ff718e" : "#dcefff", { fontStyle: "bold" }).setOrigin(0.5));
    if (battle.bannerTimer > 0) this.overlayLayer.add(this.text(560, 155, battle.banner, 14, "#f5fbff", { backgroundColor: "#09131ddd", padding: { x: 18, y: 10 }, wordWrap: { width: 310 }, align: "center" }).setOrigin(0.5));
    this.button(892, 98, 180, 34, `战斗统计 · ${battle.rankingOpen ? "收起" : "展开"}`, { type: "rankingToggle" }, 0x1d4053).setDepth(DEPTH.overlay + 1);
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
      this.button(814 + index * 84, 178, metric === "support" ? 88 : 76, 24, resultMetricLabel[metric], { type: "metric", metric }, battle.rankingMetric === metric ? 0x6b4f91 : 0x294554).setDepth(DEPTH.overlay + 2);
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
    const portrait = this.add.image(0, 0, this.textures.exists(key) ? key : "rift-fallback-unit");
    portrait.setDisplaySize(radius * 1.75, radius * 1.75);
    if (def.portraitStyle === "sprite") portrait.setTexture(key).setDisplaySize(radius * 2, radius * 2);
    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff).fillCircle(x, y, radius - 1);
    portrait.setMask(maskShape.createGeometryMask());
    const glyph = this.text(0, 0, this.textures.exists(key) ? "" : def.glyph, Math.max(12, radius), "#ffffff", { fontStyle: "bold" }).setOrigin(0.5);
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
