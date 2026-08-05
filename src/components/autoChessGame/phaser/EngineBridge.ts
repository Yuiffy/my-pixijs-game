/* eslint-disable no-console */

import type { GameAudioEvent } from "../audio";
import { AutoChessEngine } from "../core/gameEngine";
import type { BattleState, GamePhase, RankingMetric, UnitLocation } from "../core/gameTypes";
import { UNIT_DEFS, type StarterId } from "../core/gameData";
import { AUTOCHESS_VERSION } from "../version";

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
  | { type: "buyXp" | "lock" | "reroll" | "battle" | "skipBattle" | "rankingToggle" | "resultContinue" | "restart" | "clearSelection" }
  | { type: "metric"; metric: RankingMetric }
  | { type: "augment"; index: number };

export class EngineBridge {
  public readonly engine: AutoChessEngine;

  public codexOpen = false;

  public enemyFormationOpen = false;

  public hidden = false;

  public autoplayEnabled = false;

  public backgroundBattleEnabled = false;

  public onEvent: ((event: BridgeEvent) => void) | null = null;

  private testSpeed: number;

  private previousPhase: GamePhase;

  private previousToast = "";

  private consoleLogging = true;

  private consoleBattle: BattleState | null = null;

  private lastConsoleEventId = 0;

  private backgroundUpdatedAt: number | null = null;

  constructor(seed?: number, testSpeed = 1) {
    this.engine = new AutoChessEngine(seed);
    this.testSpeed = Math.max(1, Math.min(20, Math.floor(testSpeed)));
    this.previousPhase = this.engine.state.phase;
  }

  public dispatch(action: GameAction) {
    const { engine } = this;
    const beforeGold = engine.state.gold;
    const beforeLevel = engine.state.playerLevel;
    const beforePhase = engine.state.phase;

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
      case "skipBattle":
        this.fastForwardBattle();
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
    this.reportAction(action, { gold: beforeGold, level: beforeLevel, phase: beforePhase });
    return this.getState();
  }

  public getState() {
    return JSON.parse(this.renderTextState()) as Record<string, unknown>;
  }

  public getBattleLog(count = 80) {
    const safeCount = Math.max(1, Math.min(320, Math.floor(count)));
    return this.engine.state.battle?.eventLog.slice(-safeCount) || [];
  }

  public setConsoleLogging(enabled: boolean) {
    this.consoleLogging = enabled;
    console.info(`[RiftLine][console] ${enabled ? "enabled" : "disabled"}`);
    return this.consoleLogging;
  }

  public skipBattle() {
    const result = this.fastForwardBattle();
    this.flushEvents();
    this.onEvent?.({ type: "state" });
    return { ...result, state: this.getState() };
  }

  private fastForwardBattle() {
    const { engine } = this;
    if (engine.state.phase !== "battle" || !engine.state.battle) {
      return { skipped: false, reason: "当前不在战斗阶段", steps: 0 };
    }
    const startedAt = engine.state.battle.elapsed;
    engine.recordBattleControl("收到快速结算指令，开始确定性推进");
    let steps = 0;
    const maximumSteps = Math.ceil((engine.state.battle.limit - startedAt + 2) * 60);
    while (engine.state.phase === "battle" && steps < maximumSteps) {
      engine.update(1 / 60);
      steps += 1;
    }
    return {
      skipped: engine.state.phase !== "battle",
      reason: engine.state.phase === "battle" ? "达到快速结算安全上限" : "战斗已结算",
      simulatedSeconds: Number((steps / 60).toFixed(2)),
      steps,
    };
  }

  public setEnemyFormationOpen(open: boolean) {
    const next = open && this.engine.state.phase === "preparation";
    if (next === this.enemyFormationOpen) return;
    this.enemyFormationOpen = next;
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

  public setAutoplayEnabled(enabled: boolean) {
    this.autoplayEnabled = enabled;
  }

  public setBackgroundBattleEnabled(enabled: boolean, now = Date.now()) {
    this.backgroundBattleEnabled = enabled;
    this.backgroundUpdatedAt = this.hidden ? now : null;
  }

  public setHidden(hidden: boolean, now = Date.now()) {
    if (this.hidden === hidden) return;
    if (!hidden) this.updateBackground(now);
    this.hidden = hidden;
    this.backgroundUpdatedAt = hidden ? now : null;
  }

  public updateBackground(now = Date.now()) {
    if (!this.hidden || !this.backgroundBattleEnabled || this.codexOpen) {
      if (this.hidden) this.backgroundUpdatedAt = now;
      return 0;
    }
    const previous = this.backgroundUpdatedAt ?? now;
    this.backgroundUpdatedAt = now;
    const elapsedMilliseconds = Math.min(30000, Math.max(0, now - previous));
    if (!elapsedMilliseconds || (this.engine.state.phase !== "battle" && !this.engine.state.toast)) {
      return 0;
    }
    const steps = Math.max(1, Math.ceil(elapsedMilliseconds / (1000 / 60)));
    const delta = elapsedMilliseconds / 1000 / steps;
    for (let index = 0; index < steps; index += 1) this.engine.update(delta);
    this.flushEvents();
    this.onEvent?.({ type: "state" });
    return elapsedMilliseconds;
  }

  public renderTextState() {
    const state = JSON.parse(this.engine.renderTextState()) as Record<string, unknown>;
    return JSON.stringify({
      ...state,
      interface: {
        enemyFormationOpen: this.enemyFormationOpen,
        autoplayEnabled: this.autoplayEnabled,
        backgroundBattleEnabled: this.backgroundBattleEnabled,
        pageHidden: this.hidden,
      },
    });
  }

  private emitAudio(event: GameAudioEvent) {
    this.onEvent?.({ type: "audio", event });
  }

  private flushEvents() {
    const { phase, battle } = this.engine.state;
    if (battle !== this.consoleBattle) {
      this.consoleBattle = battle;
      this.lastConsoleEventId = 0;
    }
    if (battle) {
      const events = battle.eventLog.filter((event) => event.id > this.lastConsoleEventId);
      if (events.length && this.consoleLogging) {
        events.forEach((event) => console.info(`[RiftLine][battle][${event.time.toFixed(3)}s] ${event.message}`, event));
      }
      if (events.length) {
        const { id } = events[events.length - 1];
        this.lastConsoleEventId = id;
      }
    }
    if (phase !== "preparation") this.enemyFormationOpen = false;
    if (phase !== this.previousPhase) {
      if (phase === "battle") this.emitAudio("battle");
      if (phase === "result") this.emitAudio(this.engine.state.result?.won ? "win" : "loss");
      this.previousPhase = phase;
      this.onEvent?.({ type: "phase", phase });
      if (this.consoleLogging) console.info("[RiftLine][phase]", { phase, round: this.engine.state.round });
    }

    const toast = this.engine.state.toast?.text || "";
    if (toast !== this.previousToast) {
      if (toast.includes("聚合完成")) this.emitAudio("merge");
      this.previousToast = toast;
      this.onEvent?.({ type: "toast", text: toast || null });
      if (this.consoleLogging && toast) console.info("[RiftLine][feedback]", { text: toast });
    }
  }

  private reportAction(
    action: GameAction,
    before: { gold: number; level: number; phase: GamePhase },
  ) {
    if (!this.consoleLogging) return;
    const { state } = this.engine;
    console.info("[RiftLine][action]", {
      version: AUTOCHESS_VERSION,
      action,
      before,
      after: { gold: state.gold, level: state.playerLevel, phase: state.phase, round: state.round },
      toast: state.toast?.text || null,
    });
    if (
      action.type === "reroll" ||
      action.type === "starter" ||
      action.type === "resultContinue"
    ) {
      console.info("[RiftLine][shop]", state.shop.map((unitId, index) => ({
        slot: index + 1,
        unitId,
        name: unitId ? UNIT_DEFS[unitId].name : null,
        cost: unitId ? UNIT_DEFS[unitId].cost : null,
      })));
    }
  }
}
