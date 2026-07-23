import type { GameAudioEvent } from "../audio";
import { AutoChessEngine } from "../core/gameEngine";
import type { Fighter, GamePhase, RankingMetric, UnitLocation } from "../core/gameTypes";
import type { StarterId } from "../core/gameData";

export type DomTooltip =
  | { kind: "unit"; unitId: import("../core/gameData").UnitId; star: 1 | 2 | 3; fighter?: Fighter; x: number; y: number }
  | { kind: "trait"; traitId: keyof typeof import("../core/gameData").TRAITS; x: number; y: number };

export type BridgeEvent =
  | { type: "audio"; event: GameAudioEvent }
  | { type: "phase"; phase: GamePhase }
  | { type: "toast"; text: string | null }
  | { type: "state" };

export type GameAction =
  | { type: "starter"; id: StarterId }
  | { type: "shop"; index: number }
  | { type: "slot"; location: UnitLocation }
  | { type: "move"; from: UnitLocation; to: UnitLocation }
  | { type: "sell"; location?: UnitLocation }
  | { type: "buyXp" | "lock" | "reroll" | "battle" | "rankingToggle" | "resultContinue" | "restart" | "clearSelection" }
  | { type: "metric"; metric: RankingMetric }
  | { type: "augment"; index: number };

export class EngineBridge {
  public readonly engine: AutoChessEngine;

  public codexOpen = false;

  public hidden = false;

  public onEvent: ((event: BridgeEvent) => void) | null = null;

  public onTooltip: ((tooltip: DomTooltip | null) => void) | null = null;

  private testSpeed: number;

  private previousPhase: GamePhase;

  private previousToast = "";

  constructor(seed?: number, testSpeed = 1) {
    this.engine = new AutoChessEngine(seed);
    this.testSpeed = Math.max(1, Math.min(20, Math.floor(testSpeed)));
    this.previousPhase = this.engine.state.phase;
  }

  public dispatch(action: GameAction) {
    const { engine } = this;
    const beforeGold = engine.state.gold;
    const beforeLevel = engine.state.playerLevel;

    switch (action.type) {
      case "starter":
        engine.startRun(action.id);
        this.emitAudio("click");
        break;
      case "shop":
        engine.buyShopUnit(action.index);
        if (engine.state.gold < beforeGold) this.emitAudio("buy");
        break;
      case "slot":
        engine.selectSlot(action.location.zone, action.location.index);
        break;
      case "move":
        engine.moveUnit(action.from, action.to.zone, action.to.index);
        break;
      case "sell":
        if (action.location) engine.sellUnit(action.location.zone, action.location.index);
        else engine.sellSelected();
        break;
      case "buyXp":
        engine.buyExperience();
        if (engine.state.playerLevel > beforeLevel) this.emitAudio("upgrade");
        break;
      case "lock":
        engine.toggleShopLock();
        this.emitAudio("lock");
        break;
      case "reroll":
        engine.rerollShop();
        if (engine.state.gold < beforeGold) this.emitAudio("reroll");
        break;
      case "battle":
        engine.startBattle();
        break;
      case "rankingToggle":
        engine.toggleRanking();
        break;
      case "resultContinue":
        engine.continueAfterResult();
        break;
      case "restart":
        engine.resetToTitle();
        break;
      case "clearSelection":
        engine.clearSelection();
        break;
      case "metric":
        engine.setRankingMetric(action.metric);
        break;
      case "augment":
        engine.chooseAugment(action.index);
        this.emitAudio("augment");
        break;
      default:
        break;
    }

    this.flushEvents();
    this.onEvent?.({ type: "state" });
  }

  public update(deltaSeconds: number) {
    if (this.codexOpen || this.hidden) return;
    if (this.engine.state.phase === "battle" || this.engine.state.toast) {
      this.engine.update(Math.min(0.05, Math.max(0, deltaSeconds)));
      this.flushEvents();
    }
  }

  public advance(milliseconds: number) {
    const steps = Math.max(1, Math.ceil(milliseconds / (1000 / 60))) * this.testSpeed;
    for (let index = 0; index < steps; index += 1) this.engine.update(1 / 60);
    this.flushEvents();
    this.onEvent?.({ type: "state" });
  }

  public setCodexOpen(open: boolean) {
    this.codexOpen = open;
  }

  public setHidden(hidden: boolean) {
    this.hidden = hidden;
  }

  public renderTextState() {
    return this.engine.renderTextState();
  }

  private emitAudio(event: GameAudioEvent) {
    this.onEvent?.({ type: "audio", event });
  }

  private flushEvents() {
    const { phase } = this.engine.state;
    if (phase !== this.previousPhase) {
      if (phase === "battle") this.emitAudio("battle");
      if (phase === "result") this.emitAudio(this.engine.state.result?.won ? "win" : "loss");
      this.previousPhase = phase;
      this.onEvent?.({ type: "phase", phase });
    }

    const toast = this.engine.state.toast?.text || "";
    if (toast !== this.previousToast) {
      if (toast.includes("聚合完成")) this.emitAudio("merge");
      this.previousToast = toast;
      this.onEvent?.({ type: "toast", text: toast || null });
    }
  }
}
