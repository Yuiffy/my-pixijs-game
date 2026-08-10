import { AutoChessAutopilot, LIVE_AUTOPILOT_ROLLOUT_HZ } from "./AutoChessAutopilot";
import {
  effectiveStyleForAutopilotConfiguration,
  informationModeForAutopilotThinkingLevel,
  type AutopilotPreferenceStyle,
  type AutopilotThinkingLevel,
} from "./autopilotPolicy";
import type {
  AutopilotWorkerRequest,
  AutopilotWorkerResponse,
} from "./autopilotWorkerProtocol";
import { EngineBridge } from "../phaser/EngineBridge";

export type AutopilotWorkerStatus = {
  thinking: boolean;
  activity: "decision" | "prewarm" | null;
  level: AutopilotThinkingLevel;
  elapsedMs?: number;
  unavailable?: boolean;
};

type StatusListener = (status: AutopilotWorkerStatus) => void;
type ErrorListener = (message: string) => void;

const decisionStateKey = (bridge: EngineBridge) => {
  const { engine } = bridge;
  const { state } = engine;
  const units = [...state.board, ...state.bench]
    .map((unit) => (unit ? `${unit.uid}:${unit.id}:${unit.star}` : ""))
    .join(",");
  return [
    state.phase,
    state.seed,
    state.enemySeed,
    state.round,
    state.hp,
    state.gold,
    state.streak,
    state.victories,
    state.playerLevel,
    state.upgradeRemaining,
    state.upgradeDiscountCarry,
    state.shopLocked,
    state.freeRerollCharges,
    engine.getRandomState(),
    engine.getShopRandomState(),
    state.starter,
    state.augments.join(","),
    state.shop.join(","),
    state.starterChoices.join(","),
    state.augmentChoices.join(","),
    state.result ? `${state.result.won}:${state.result.income}:${state.result.damage}` : "",
    units,
  ].join("/");
};

const prewarmStateKey = (
  bridge: EngineBridge,
  configuration: {
    style: AutopilotPreferenceStyle;
    level: AutopilotThinkingLevel;
  },
) => {
  const { engine } = bridge;
  const { state } = engine;
  const units = [...state.board, ...state.bench]
    .map((unit) => (unit ? `${unit.uid}:${unit.id}:${unit.star}` : ""))
    .join(",");
  return [
    state.seed,
    state.enemySeed,
    state.round,
    state.playerLevel,
    engine.getShopRandomState(),
    state.starter,
    state.augments.join(","),
    state.shop.join(","),
    units,
    configuration.style,
    configuration.level,
  ].join("/");
};

const nextPreparationRound = (bridge: EngineBridge) => {
  const { phase, round } = bridge.engine.state;
  return phase === "battle" || phase === "result" || phase === "augment"
    ? round + 1
    : round;
};

/** Runs expensive decisions off the Phaser thread and applies only fresh actions. */
export class AutoChessAutopilotWorkerClient {
  private worker: Worker | null = null;

  private fallbackPilot: AutoChessAutopilot | null = null;

  private enabled = false;

  private busy = false;

  private workerUnavailable = false;

  private startRequested = false;

  private requestId = 0;

  private activeRequest: (
    | { kind: "decision"; id: number; stateKey: string }
    | { kind: "prewarm"; id: number; prewarmKey: string; startedAt: number }
  ) | null = null;

  private completedPrewarmKey = "";

  private oracleActivationRound = 0;

  private configuration: {
    style: AutopilotPreferenceStyle;
    level: AutopilotThinkingLevel;
  };

  constructor(
    private readonly bridge: EngineBridge,
    style: AutopilotPreferenceStyle,
    level: AutopilotThinkingLevel,
    private readonly onStatus: StatusListener = () => {},
    private readonly onError: ErrorListener = () => {},
  ) {
    this.configuration = { style, level };
    this.syncBridgeStrategy();
  }

  public get isEnabled() {
    return this.enabled;
  }

  private syncBridgeStrategy() {
    const { style, level } = this.configuration;
    this.bridge.setAutopilotStrategy(
      effectiveStyleForAutopilotConfiguration(style, level),
      informationModeForAutopilotThinkingLevel(level),
      style,
      level,
    );
  }

  private emitStatus(
    activity: AutopilotWorkerStatus["activity"],
    elapsedMs?: number,
    unavailable = false,
  ) {
    this.onStatus({
      thinking: activity !== null,
      activity,
      level: this.configuration.level,
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
      ...(unavailable ? { unavailable: true } : {}),
    });
  }

  private ensureWorker() {
    if (this.worker) return true;
    if (this.workerUnavailable || typeof Worker === "undefined") {
      this.workerUnavailable = true;
      this.ensureFallbackPilot();
      return false;
    }
    try {
      const worker = new Worker(
        new URL("./autopilot.worker.ts", import.meta.url),
        { type: "module", name: "rift-line-autopilot" },
      );
      worker.onmessage = (event: MessageEvent<AutopilotWorkerResponse>) => {
        this.handleResponse(event.data);
      };
      worker.onerror = () => {
        this.failWorker("后台推演线程不可用，已切换为快速模型托管。");
      };
      this.worker = worker;
      return true;
    } catch {
      this.failWorker("后台推演线程不可用，已切换为快速模型托管。");
      return false;
    }
  }

  private ensureFallbackPilot() {
    if (this.fallbackPilot) return this.fallbackPilot;
    this.fallbackPilot = new AutoChessAutopilot(
      this.bridge,
      "evolution",
      {},
      this.configuration.style,
      undefined,
      LIVE_AUTOPILOT_ROLLOUT_HZ,
      undefined,
      false,
      "veteran",
    );
    this.fallbackPilot.setEnabled(this.enabled);
    this.syncBridgeStrategy();
    return this.fallbackPilot;
  }

  private failWorker(message: string) {
    this.worker?.terminate();
    this.worker = null;
    this.workerUnavailable = true;
    this.busy = false;
    this.activeRequest = null;
    this.completedPrewarmKey = "";
    this.emitStatus(null, undefined, true);
    this.onError(message);
    this.ensureFallbackPilot();
  }

  private handleResponse(response: AutopilotWorkerResponse) {
    const active = this.activeRequest;
    if (!active || response.id !== active.id) return;
    this.busy = false;
    this.activeRequest = null;

    if (active.kind === "prewarm") {
      if (response.type !== "prewarmed") {
        this.failWorker("后台预演返回了无法识别的结果，已切换为快速模型托管。");
        return;
      }
      const stillCurrent = this.enabled
        && this.bridge.engine.state.phase === "battle"
        && prewarmStateKey(this.bridge, this.configuration) === active.prewarmKey;
      if (response.error) {
        this.completedPrewarmKey = active.prewarmKey;
        this.emitStatus(null, response.elapsedMs);
        this.onError(`后台预演失败：${response.error}`);
        return;
      }
      if (!stillCurrent) {
        this.emitStatus(null, response.elapsedMs);
        if (this.enabled && this.bridge.engine.state.phase !== "battle") this.tick();
        return;
      }
      if (response.complete) {
        this.completedPrewarmKey = active.prewarmKey;
        this.emitStatus(null, response.elapsedMs);
        return;
      }
      this.requestPrewarm(Date.now(), active.prewarmKey, false, active.startedAt);
      return;
    }

    if (response.type !== "decision") {
      this.failWorker("后台决策返回了无法识别的结果，已切换为快速模型托管。");
      return;
    }
    this.emitStatus(null, response.elapsedMs);
    if (response.error) {
      this.failWorker(`后台推演失败：${response.error}，已切换为快速模型托管。`);
      if (this.enabled) this.fallbackTick(Date.now());
      return;
    }
    if (!this.enabled || decisionStateKey(this.bridge) !== active.stateKey) return;
    if (response.action?.type === "starter") this.startRequested = false;
    if (response.action) this.bridge.dispatch(response.action);
  }

  public setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.bridge.setAutoplayEnabled(enabled);
    this.fallbackPilot?.setEnabled(enabled);
    if (enabled && this.configuration.level === "oracle") {
      this.oracleActivationRound = nextPreparationRound(this.bridge);
    }
    if (!enabled) {
      this.startRequested = false;
      this.oracleActivationRound = 0;
      this.worker?.terminate();
      this.worker = null;
      this.busy = false;
      this.activeRequest = null;
      this.completedPrewarmKey = "";
      this.emitStatus(null);
    }
  }

  public setConfiguration(
    style: AutopilotPreferenceStyle,
    level: AutopilotThinkingLevel,
  ) {
    if (this.configuration.style === style && this.configuration.level === level) return;
    const enteringOracle = level === "oracle" && this.configuration.level !== "oracle";
    this.configuration = { style, level };
    if (enteringOracle && this.enabled) {
      this.oracleActivationRound = nextPreparationRound(this.bridge);
    } else if (level !== "oracle") {
      this.oracleActivationRound = 0;
    }
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
    this.activeRequest = null;
    this.completedPrewarmKey = "";
    if (this.fallbackPilot) this.fallbackPilot.setConfiguration(style, "veteran");
    this.syncBridgeStrategy();
    this.emitStatus(null);
  }

  public startFromTitle() {
    if (this.bridge.engine.state.phase !== "title") return false;
    this.startRequested = true;
    this.setEnabled(true);
    this.tick();
    return true;
  }

  private fallbackTick(now: number) {
    const pilot = this.ensureFallbackPilot();
    if (this.startRequested && this.bridge.engine.state.phase === "title") {
      const started = pilot.startFromTitle();
      if (started) this.startRequested = false;
      return null;
    }
    return pilot.tick(now);
  }

  private shouldPrewarmBattle() {
    return this.configuration.level === "deep"
      || this.configuration.level === "oracle"
      || this.configuration.level === "go";
  }

  private requestPrewarm(
    now: number,
    prewarmKey: string,
    initial: boolean,
    startedAt = now,
  ) {
    const id = this.requestId + 1;
    this.requestId = id;
    const request: AutopilotWorkerRequest = {
      type: "prewarm",
      id,
      now,
      enabled: this.enabled,
      configuration: { ...this.configuration },
      prewarmKey,
      expandOracleOnTargetRound: this.configuration.level === "oracle"
        && this.oracleActivationRound === this.bridge.engine.state.round + 1,
      snapshot: initial ? this.bridge.engine.getSimulationSnapshot() : null,
    };
    this.busy = true;
    this.activeRequest = {
      kind: "prewarm",
      id,
      prewarmKey,
      startedAt,
    };
    this.emitStatus("prewarm");
    this.worker?.postMessage(request);
  }

  public tick(now = Date.now()) {
    if (!this.enabled || this.bridge.codexOpen || this.busy) return null;
    if (this.bridge.engine.state.phase === "battle") {
      if (!this.shouldPrewarmBattle() || !this.ensureWorker()) return null;
      const prewarmKey = prewarmStateKey(this.bridge, this.configuration);
      if (prewarmKey === this.completedPrewarmKey) return null;
      this.requestPrewarm(now, prewarmKey, true);
      return null;
    }
    if (!this.ensureWorker()) return this.fallbackTick(now);
    const snapshot = this.bridge.engine.getSimulationSnapshot();
    const id = this.requestId + 1;
    this.requestId = id;
    const stateKey = decisionStateKey(this.bridge);
    const request: AutopilotWorkerRequest = {
      type: "decide",
      id,
      now,
      enabled: this.enabled,
      startFromTitle: this.startRequested,
      configuration: { ...this.configuration },
      snapshot,
    };
    this.busy = true;
    this.activeRequest = { kind: "decision", id, stateKey };
    if (
      this.configuration.level === "deep"
      || this.configuration.level === "oracle"
      || this.configuration.level === "go"
    ) {
      this.emitStatus("decision");
    }
    this.worker?.postMessage(request);
    return null;
  }

  public dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.fallbackPilot?.setEnabled(false);
    this.fallbackPilot = null;
    this.busy = false;
    this.activeRequest = null;
    this.completedPrewarmKey = "";
    this.emitStatus(null);
  }
}
