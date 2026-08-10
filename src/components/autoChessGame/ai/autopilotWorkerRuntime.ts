import {
  AutoChessAutopilot,
  LIVE_AUTOPILOT_BATTLE_STEP_HZ,
  LIVE_AUTOPILOT_ROLLOUT_HZ,
} from "./AutoChessAutopilot";
import { EngineBridge, type GameAction } from "../phaser/EngineBridge";
import type {
  AutopilotWorkerConfiguration,
  AutopilotWorkerDecisionRequest,
  AutopilotWorkerDecisionResponse,
  AutopilotWorkerPrewarmRequest,
  AutopilotWorkerPrewarmResponse,
} from "./autopilotWorkerProtocol";

const PREWARM_CLOCK_STEP_MS = 2400;
const PREWARM_MAX_ACTIONS = 112;
const PREWARM_MAX_TICKS = 240;

type PrewarmSession = {
  key: string;
  targetRound: number;
  bridge: EngineBridge;
  pilot: AutoChessAutopilot;
  now: number;
  ticks: number;
  simulatedActions: number;
  elapsedMs: number;
};

export class AutopilotWorkerRuntime {
  private bridge: EngineBridge | null = null;

  private pilot: AutoChessAutopilot | null = null;

  private configuration: AutopilotWorkerConfiguration | null = null;

  private enabled = false;

  private prewarmSession: PrewarmSession | null = null;

  private createPilot(
    bridge: EngineBridge,
    configuration: AutopilotWorkerConfiguration,
  ) {
    return new AutoChessAutopilot(
      bridge,
      "evolution",
      {},
      configuration.style,
      undefined,
      LIVE_AUTOPILOT_ROLLOUT_HZ,
      undefined,
      true,
      configuration.level,
    );
  }

  private ensurePilot(request: AutopilotWorkerDecisionRequest) {
    if (!this.bridge || !this.pilot) {
      this.bridge = new EngineBridge(
        request.snapshot.state.seed,
        1,
        { simulation: true, battleStepHz: LIVE_AUTOPILOT_ROLLOUT_HZ },
      );
      this.bridge.setConsoleLogging(false);
      this.bridge.engine.restoreSimulationSnapshot(request.snapshot);
      this.pilot = this.createPilot(this.bridge, request.configuration);
      this.configuration = { ...request.configuration };
    } else {
      this.bridge.engine.restoreSimulationSnapshot(request.snapshot);
      if (
        this.configuration?.style !== request.configuration.style
        || this.configuration.level !== request.configuration.level
      ) {
        this.pilot.setConfiguration(
          request.configuration.style,
          request.configuration.level,
        );
        this.configuration = { ...request.configuration };
      }
    }
    if (this.enabled !== request.enabled) {
      this.enabled = request.enabled;
      this.pilot.setEnabled(request.enabled);
    }
    return { bridge: this.bridge, pilot: this.pilot };
  }

  public decide(request: AutopilotWorkerDecisionRequest): AutopilotWorkerDecisionResponse {
    this.prewarmSession = null;
    const startedAt = performance.now();
    try {
      const { bridge, pilot } = this.ensurePilot(request);
      let action: GameAction | null = null;
      if (request.startFromTitle && bridge.engine.state.phase === "title") {
        const started = pilot.startFromTitle();
        const { starter } = bridge.engine.state;
        if (started && starter) action = { type: "starter", id: starter };
      } else {
        action = pilot.tick(request.now);
      }
      return {
        type: "decision",
        id: request.id,
        action,
        elapsedMs: performance.now() - startedAt,
      };
    } catch (error) {
      return {
        type: "decision",
        id: request.id,
        action: null,
        elapsedMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private createPrewarmSession(request: AutopilotWorkerPrewarmRequest) {
    if (!request.snapshot) throw new Error("预热会话缺少战斗快照");
    const { snapshot } = request;
    const bridge = new EngineBridge(
      snapshot.state.seed,
      1,
      { simulation: true, battleStepHz: LIVE_AUTOPILOT_BATTLE_STEP_HZ },
    );
    bridge.setConsoleLogging(false);
    const pilot = this.createPilot(bridge, request.configuration);

    // Reusing a fresh speculative pilot must not grant oracle's activation
    // boost every round. Only a real mid-battle enable targets the next round.
    if (!request.expandOracleOnTargetRound) pilot.setEnabled(request.enabled);
    bridge.engine.restoreSimulationSnapshot(snapshot);
    if (request.expandOracleOnTargetRound) pilot.setEnabled(request.enabled);

    const { battle } = bridge.engine.state;
    if (bridge.engine.state.phase === "battle" && battle) {
      const maximumSteps = Math.ceil(
        (battle.limit - battle.elapsed + 2) * LIVE_AUTOPILOT_BATTLE_STEP_HZ,
      );
      let steps = 0;
      while (bridge.engine.state.phase === "battle" && steps < maximumSteps) {
        bridge.engine.update(1 / LIVE_AUTOPILOT_BATTLE_STEP_HZ);
        steps += 1;
      }
    }

    return {
      key: request.prewarmKey,
      targetRound: snapshot.state.round + 1,
      bridge,
      pilot,
      now: request.now,
      ticks: 0,
      simulatedActions: 0,
      elapsedMs: 0,
    } satisfies PrewarmSession;
  }

  private prewarmComplete(session: PrewarmSession) {
    const { state } = session.bridge.engine;
    return state.phase === "gameover"
      || state.phase === "title"
      || state.round > session.targetRound
      || (state.phase === "battle" && state.round >= session.targetRound)
      || session.ticks >= PREWARM_MAX_TICKS
      || session.simulatedActions >= PREWARM_MAX_ACTIONS;
  }

  public prewarm(request: AutopilotWorkerPrewarmRequest): AutopilotWorkerPrewarmResponse {
    const startedAt = performance.now();
    try {
      if (this.prewarmSession?.key !== request.prewarmKey) {
        this.prewarmSession = this.createPrewarmSession(request);
      }
      const session = this.prewarmSession;
      if (!session) throw new Error("无法创建预热会话");

      if (!this.prewarmComplete(session)) {
        session.now = Math.max(session.now, request.now) + PREWARM_CLOCK_STEP_MS;
        const action = session.pilot.tick(session.now);
        session.ticks += 1;
        if (action) session.simulatedActions += 1;
      }
      const complete = this.prewarmComplete(session);
      session.elapsedMs += performance.now() - startedAt;
      const response: AutopilotWorkerPrewarmResponse = {
        type: "prewarmed",
        id: request.id,
        prewarmKey: request.prewarmKey,
        targetRound: session.targetRound,
        complete,
        simulatedActions: session.simulatedActions,
        elapsedMs: session.elapsedMs,
      };
      if (complete) this.prewarmSession = null;
      return response;
    } catch (error) {
      this.prewarmSession = null;
      return {
        type: "prewarmed",
        id: request.id,
        prewarmKey: request.prewarmKey,
        targetRound: request.snapshot ? request.snapshot.state.round + 1 : 0,
        complete: true,
        simulatedActions: 0,
        elapsedMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
