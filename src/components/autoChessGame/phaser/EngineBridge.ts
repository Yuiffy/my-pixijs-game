/* eslint-disable no-console */

import type { GameAudioEvent } from "../audio";
import { AutoChessEngine, BATTLE_EVENT_LOG_LIMIT } from "../core/gameEngine";
import type {
  BattleLogEvent,
  BattleState,
  Fighter,
  GamePhase,
  RankingMetric,
  UnitLocation,
} from "../core/gameTypes";
import { UNIT_DEFS, type StarterId } from "../core/gameData";
import { AUTOCHESS_VERSION } from "../version";
import {
  canonicalAutopilotStyle,
  legacyThinkingLevelForAutopilotStyle,
  preferenceStyleForAutopilotStyle,
  type AutopilotInformationMode,
  type AutopilotPreferenceStyle,
  type AutopilotStyle,
  type AutopilotThinkingLevel,
  type CanonicalAutopilotStyle,
} from "../ai/autopilotPolicy";

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
  | { type: "starForge"; location?: UnitLocation }
  | { type: "buyXp" | "lock" | "reroll" | "battle" | "skipBattle" | "rankingToggle" | "resultContinue" | "restart" | "clearSelection" }
  | { type: "metric"; metric: RankingMetric }
  | { type: "augment"; index: number };

export type ActionTraceSnapshot = {
  seed: number;
  enemySeed: number;
  round: number;
  phase: GamePhase;
  hp: number;
  gold: number;
  level: number;
  boardCap: number;
  interest: number;
  streak: number;
  board: Array<{ slot: number; uid: number; id: string; name: string; star: number }>;
  bench: Array<{ slot: number; uid: number; id: string; name: string; star: number }>;
  shop: Array<{ slot: number; id: string | null; name: string | null; cost: number | null }>;
  traits: Array<{ id: string; name: string; count: number; level: number }>;
};

export type ActionTraceEntry = {
  sequence: number;
  action: GameAction;
  before: ActionTraceSnapshot;
  after: ActionTraceSnapshot;
  toast: string | null;
};

export type BattleFormationUnit = {
  fid: string;
  id: string;
  name: string;
  team: Fighter["team"];
  star: Fighter["star"];
  slot: number | null;
  x: number;
  y: number;
  maxHp: number;
  attack: number;
  armor: number;
  range: number;
};

export type BattleTraceEntry = {
  round: number;
  formation: {
    player: BattleFormationUnit[];
    enemy: BattleFormationUnit[];
  };
  events: BattleLogEvent[];
  result: {
    won: boolean;
    elapsed: number;
    playerSurvivors: number;
    enemySurvivors: number;
  } | null;
};

export type RunBattleLogEvent = BattleLogEvent & { round: number };

export const ACTION_TRACE_LIMIT = 10_000;
export const RUN_BATTLE_EVENT_LIMIT = BATTLE_EVENT_LOG_LIMIT;
const LIVE_BATTLE_STEP_SECONDS = 1 / 60;

export type EngineBridgeOptions = {
  simulation?: boolean;
  battleStepHz?: number;
};

export const GO_ENEMY_SEEDS = [152100, 152102] as const;

export const goEnemySeedForShopSeed = (seed: number) => (
  GO_ENEMY_SEEDS[Math.abs(Math.trunc(seed)) % GO_ENEMY_SEEDS.length]
);

export class EngineBridge {
  public readonly engine: AutoChessEngine;

  public codexOpen = false;

  public enemyFormationOpen = false;

  public hidden = false;

  public autoplayEnabled = false;

  public autoplayStyle: CanonicalAutopilotStyle = "survival";

  public autoplayPreferenceStyle: AutopilotPreferenceStyle = "balanced";

  public autoplayThinkingLevel: AutopilotThinkingLevel = "veteran";

  public autoplayInformationMode: AutopilotInformationMode = "normal";

  public backgroundBattleEnabled = false;

  public onEvent: ((event: BridgeEvent) => void) | null = null;

  private testSpeed: number;

  private previousPhase: GamePhase;

  private previousToast = "";

  private consoleLogging = true;

  private consoleBattle: BattleState | null = null;

  private lastConsoleEventId = 0;

  private lastArchivedEventId = 0;

  private activeBattleTrace: BattleTraceEntry | null = null;

  private battleHistory: BattleTraceEntry[] = [];

  private battleEventCount = 0;

  private droppedBattleEventCount = 0;

  private backgroundUpdatedAt: number | null = null;

  /** Accumulates render time while keeping visible combat on fixed 60Hz steps. */
  private liveBattleTimeRemainder = 0;

  private actionSequence = 0;

  private actionHistory: ActionTraceEntry[] = [];

  private readonly simulationMode: boolean;

  private readonly battleStepHz: number;

  constructor(seed?: number, testSpeed = 1, options: EngineBridgeOptions = {}) {
    this.simulationMode = options.simulation === true;
    this.battleStepHz = Math.max(20, Math.min(60, Math.round(options.battleStepHz || 60)));
    this.engine = new AutoChessEngine(seed, this.simulationMode
      ? { telemetry: false, visualEffects: false }
      : undefined);
    this.testSpeed = Math.max(1, Math.min(20, Math.floor(testSpeed)));
    this.previousPhase = this.engine.state.phase;
  }

  private applyAutoplayEnemySeed() {
    if (this.engine.state.phase !== "title") return;
    this.engine.state.enemySeed = this.autoplayStyle === "go"
      ? goEnemySeedForShopSeed(this.engine.state.seed)
      : this.engine.state.seed;
  }

  public dispatch(action: GameAction) {
    const { engine } = this;
    this.beginNewRun(action);
    const before = this.simulationMode ? null : this.actionSnapshot();
    const beforeGold = engine.state.gold;
    const beforeLevel = engine.state.playerLevel;

    switch (action.type) {
      case "starter":
        this.applyAutoplayEnemySeed();
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
      case "starForge":
        if (engine.useStarForge(action.location)) this.emitAudio("upgrade");
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
        this.applyAutoplayEnemySeed();
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

    if (before) this.reportAction(action, before);
    if (!this.simulationMode) {
      this.flushEvents();
      this.onEvent?.({ type: "state" });
      return this.getState();
    }
    return null;
  }

  public getState() {
    return JSON.parse(this.renderTextState()) as Record<string, unknown>;
  }

  public getBattleLog(count = 80) {
    this.syncBattleTrace();
    const safeCount = Math.max(1, Math.min(RUN_BATTLE_EVENT_LIMIT, Math.floor(count)));
    const events: RunBattleLogEvent[] = [];
    for (let battleIndex = this.battleHistory.length - 1; battleIndex >= 0; battleIndex -= 1) {
      const battle = this.battleHistory[battleIndex];
      for (let eventIndex = battle.events.length - 1; eventIndex >= 0; eventIndex -= 1) {
        events.push({ ...battle.events[eventIndex], round: battle.round });
        if (events.length >= safeCount) return events.reverse();
      }
    }
    return events.reverse();
  }

  public getActionHistory(count = 200) {
    const safeCount = Math.max(1, Math.min(ACTION_TRACE_LIMIT, Math.floor(count)));
    return this.actionHistory.slice(-safeCount);
  }

  public getBattleHistory() {
    this.syncBattleTrace();
    return this.battleHistory.map((battle) => ({
      ...battle,
      formation: {
        player: battle.formation.player.map((unit) => ({ ...unit })),
        enemy: battle.formation.enemy.map((unit) => ({ ...unit })),
      },
      events: [...battle.events],
      result: battle.result ? { ...battle.result } : null,
    }));
  }

  public getTraceStats() {
    this.syncBattleTrace();
    return {
      actions: this.actionHistory.length,
      battles: this.battleHistory.length,
      battleEvents: this.battleEventCount,
      droppedBattleEvents: this.droppedBattleEventCount,
      limits: {
        actions: ACTION_TRACE_LIMIT,
        battleEvents: RUN_BATTLE_EVENT_LIMIT,
      },
    };
  }

  public setConsoleLogging(enabled: boolean) {
    this.consoleLogging = enabled;
    if (!this.simulationMode) {
      console.info(`[RiftLine][console] ${enabled ? "enabled" : "disabled"}`);
    }
    return this.consoleLogging;
  }

  public get simulationBattleStepHz() {
    return this.battleStepHz;
  }

  public skipBattle() {
    const before = this.simulationMode ? null : this.actionSnapshot();
    const result = this.fastForwardBattle();
    if (before) this.reportAction({ type: "skipBattle" }, before);
    if (!this.simulationMode) {
      this.flushEvents();
      this.onEvent?.({ type: "state" });
      return { ...result, state: this.getState() };
    }
    return result;
  }

  private fastForwardBattle() {
    const { engine } = this;
    if (engine.state.phase !== "battle" || !engine.state.battle) {
      return { skipped: false, reason: "当前不在战斗阶段", steps: 0 };
    }
    const startedAt = engine.state.battle.elapsed;
    engine.recordBattleControl("收到快速结算指令，开始确定性推进");
    let steps = 0;
    const maximumSteps = Math.ceil(
      (engine.state.battle.limit - startedAt + 2) * this.battleStepHz,
    );
    while (engine.state.phase === "battle" && steps < maximumSteps) {
      engine.update(1 / this.battleStepHz);
      steps += 1;
    }
    return {
      skipped: engine.state.phase !== "battle",
      reason: engine.state.phase === "battle" ? "达到快速结算安全上限" : "战斗已结算",
      simulatedSeconds: Number((steps / this.battleStepHz).toFixed(2)),
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
    if (this.engine.state.phase === "battle") {
      this.liveBattleTimeRemainder += Math.min(0.05, Math.max(0, deltaSeconds));
      while (
        this.engine.state.phase === "battle"
        && this.liveBattleTimeRemainder + 1e-9 >= LIVE_BATTLE_STEP_SECONDS
      ) {
        this.engine.update(LIVE_BATTLE_STEP_SECONDS);
        this.liveBattleTimeRemainder -= LIVE_BATTLE_STEP_SECONDS;
      }
      this.flushEvents();
      return;
    }
    this.liveBattleTimeRemainder = 0;
    if (this.engine.state.toast) {
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

  public setAutopilotStrategy(
    style: AutopilotStyle,
    informationMode: AutopilotInformationMode,
    preferenceStyle = preferenceStyleForAutopilotStyle(style),
    thinkingLevel = legacyThinkingLevelForAutopilotStyle(style),
  ) {
    this.autoplayStyle = canonicalAutopilotStyle(style);
    this.autoplayPreferenceStyle = preferenceStyle;
    this.autoplayThinkingLevel = thinkingLevel;
    this.autoplayInformationMode = informationMode;
    this.applyAutoplayEnemySeed();
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
        autoplayPreferenceStyle: this.autoplayPreferenceStyle,
        autoplayThinkingLevel: this.autoplayThinkingLevel,
        autoplayEffectiveStyle: this.autoplayStyle,
        autoplayStyle: this.autoplayStyle,
        autoplayInformationMode: this.autoplayInformationMode,
        backgroundBattleEnabled: this.backgroundBattleEnabled,
        pageHidden: this.hidden,
      },
      trace: this.getTraceStats(),
      recentActions: this.getActionHistory(12),
    });
  }

  private beginNewRun(action: GameAction) {
    if (
      action.type !== "starter" ||
      this.engine.state.phase !== "title" ||
      (!this.actionHistory.length && !this.battleHistory.length)
    ) return;
    this.actionSequence = 0;
    this.actionHistory = [];
    this.consoleBattle = null;
    this.lastConsoleEventId = 0;
    this.lastArchivedEventId = 0;
    this.activeBattleTrace = null;
    this.battleHistory = [];
    this.battleEventCount = 0;
    this.droppedBattleEventCount = 0;
  }

  private formationUnit(fighter: Fighter): BattleFormationUnit {
    const boardSlotMatch = fighter.team === "player" ? /^p-(\d+)$/.exec(fighter.fid) : null;
    const boardSlot = boardSlotMatch ? Number(boardSlotMatch[1]) : 0;
    return {
      fid: fighter.fid,
      id: fighter.unitId,
      name: UNIT_DEFS[fighter.unitId].name,
      team: fighter.team,
      star: fighter.star,
      slot: boardSlot || null,
      x: Number(fighter.x.toFixed(1)),
      y: Number(fighter.y.toFixed(1)),
      maxHp: Number(fighter.maxHp.toFixed(2)),
      attack: Number(fighter.attack.toFixed(2)),
      armor: Number(fighter.armor.toFixed(2)),
      range: Number(fighter.range.toFixed(2)),
    };
  }

  private startBattleTrace(battle: BattleState) {
    const trace: BattleTraceEntry = {
      round: this.engine.state.round,
      formation: {
        player: battle.player.map((fighter) => this.formationUnit(fighter)),
        enemy: battle.enemy.map((fighter) => this.formationUnit(fighter)),
      },
      events: [],
      result: null,
    };
    this.battleHistory.push(trace);
    this.activeBattleTrace = trace;
    this.lastArchivedEventId = 0;
  }

  private appendBattleEvents(battle: BattleState) {
    if (!this.activeBattleTrace) return;
    const events = battle.eventLog.filter((event) => event.id > this.lastArchivedEventId);
    if (!events.length) return;
    this.activeBattleTrace.events.push(...events);
    this.lastArchivedEventId = events[events.length - 1].id;
    this.battleEventCount += events.length;
    this.pruneBattleEvents();
  }

  private pruneBattleEvents() {
    let overflow = this.battleEventCount - RUN_BATTLE_EVENT_LIMIT;
    if (overflow <= 0) return;
    for (const battle of this.battleHistory) {
      if (overflow <= 0) break;
      const drop = Math.min(overflow, battle.events.length);
      if (!drop) continue;
      battle.events.splice(0, drop);
      overflow -= drop;
      this.battleEventCount -= drop;
      this.droppedBattleEventCount += drop;
    }
  }

  private finishBattleTrace(battle: BattleState) {
    this.appendBattleEvents(battle);
    if (!this.activeBattleTrace || this.activeBattleTrace.result || !this.engine.state.result) return;
    this.activeBattleTrace.result = {
      won: this.engine.state.result.won,
      elapsed: Number(battle.elapsed.toFixed(3)),
      playerSurvivors: battle.player.filter((fighter) => fighter.alive).length,
      enemySurvivors: battle.enemy.filter((fighter) => fighter.alive).length,
    };
  }

  private syncBattleTrace() {
    const { battle, phase } = this.engine.state;
    if (battle !== this.consoleBattle) {
      if (this.consoleBattle) this.finishBattleTrace(this.consoleBattle);
      this.consoleBattle = battle;
      this.lastConsoleEventId = 0;
      this.activeBattleTrace = null;
      this.lastArchivedEventId = 0;
      if (battle) this.startBattleTrace(battle);
    }
    if (!battle) return;
    this.appendBattleEvents(battle);
    if (phase === "result") this.finishBattleTrace(battle);
  }

  private actionSnapshot(): ActionTraceSnapshot {
    const { engine } = this;
    const { state } = engine;
    const units = (entries: typeof state.board) => entries.flatMap((unit, index) => {
      if (!unit) return [];
      return [{
        slot: index + 1,
        uid: unit.uid,
        id: unit.id,
        name: UNIT_DEFS[unit.id].name,
        star: unit.star,
      }];
    });
    return {
      seed: state.seed,
      enemySeed: state.enemySeed,
      round: state.round,
      phase: state.phase,
      hp: state.hp,
      gold: state.gold,
      level: state.playerLevel,
      boardCap: engine.boardCap,
      interest: engine.interestIncome,
      streak: state.streak,
      board: units(state.board),
      bench: units(state.bench),
      shop: state.shop.map((id, index) => ({
        slot: index + 1,
        id,
        name: id ? UNIT_DEFS[id].name : null,
        cost: id ? UNIT_DEFS[id].cost : null,
      })),
      traits: engine.getActiveTraits().map((trait) => ({
        id: trait.id,
        name: trait.name,
        count: trait.count,
        level: trait.level,
      })),
    };
  }

  private emitAudio(event: GameAudioEvent) {
    this.onEvent?.({ type: "audio", event });
  }

  private flushEvents() {
    const { phase, battle } = this.engine.state;
    this.syncBattleTrace();
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
    before: ActionTraceSnapshot,
  ) {
    const { state } = this.engine;
    const record: ActionTraceEntry = {
      sequence: this.actionSequence += 1,
      action,
      before,
      after: this.actionSnapshot(),
      toast: state.toast?.text || null,
    };
    this.actionHistory.push(record);
    if (this.actionHistory.length > ACTION_TRACE_LIMIT) {
      this.actionHistory.splice(0, this.actionHistory.length - ACTION_TRACE_LIMIT);
    }
    if (!this.consoleLogging) return;
    console.info("[RiftLine][action]", {
      version: AUTOCHESS_VERSION,
      ...record,
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
