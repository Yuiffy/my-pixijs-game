import { EngineBridge, type GameAction } from "../phaser/EngineBridge";
import { UNIT_DEFS, TRAITS, traitLevelForCount } from "../core/gameData";
import type { Fighter, UnitLocation } from "../core/gameTypes";
import {
  MODE_NAMES,
  replayEngine,
  roundStage,
  type PrepAction,
  type RoundStage,
} from "./match";
import type { Command, RoomView } from "./room";

export type MultiplayerSession = {
  room: RoomView;
  busy: boolean;
  connected: boolean;
  message: string;
  send: (command: Command) => Promise<void>;
  leave: () => void;
};

const traitsFor = (fighters: Fighter[]) => {
  const ids = Array.from(new Set(fighters.map((f) => f.unitId)));
  return Object.values(TRAITS).flatMap((trait) => {
    const count = ids.filter((id) => UNIT_DEFS[id].traits.includes(trait.id),).length;
    const level = traitLevelForCount(trait, count);
    return level ? [{ ...trait, count, level }] : [];
  });
};

/** Adapts the existing game UI to room commands. It never saves a campaign or submits combat results. */
export class MultiplayerBridge extends EngineBridge {
  public session: MultiplayerSession;
  public panelOpen = false;
  public battleIndex = 0;
  public replayComplete = false;
  private pending = false;
  private clockOffset = 0;
  private clockSample: RoomView | null = null;
  private liveStage: RoundStage | null = null;
  private simulatedSteps = 0;
  private aftermathElapsed = 0;
  private hudSecond = -1;
  public watchedSeat = 0;
  private phaseKey = "";
  private personalRevision = -1;
  private replayKey = "";

  constructor(session: MultiplayerSession) {
    super(session.room.match!.self.seed);
    this.session = session;
    this.watchedSeat = session.room.seat;
    this.setConsoleLogging(false);
    this.syncSession(session);
  }

  public get match() {
    return this.session.room.match!;
  }
  public get me() {
    return this.match.players[this.session.room.seat];
  }
  public get modeName() {
    return MODE_NAMES[this.match.mode];
  }
  public get now() {
    return Date.now() + this.clockOffset;
  }
  public get stage() {
    return roundStage(this.match, this.now);
  }
  public get stageLabel() {
    return {
      preparation: "备战",
      starting: "即将开战",
      battle: "战斗中",
      "rescue-starting": "准备救援",
      rescue: "兜底救援",
      settlement: "本轮结算",
      finished: "对局结束",
    }[this.stage];
  }
  public get seconds() {
    const t = this.match.timeline;
    const end =
      this.stage === "starting"
        ? t?.startsAt
        : this.stage === "battle"
          ? t?.defenseEndsAt
          : this.stage === "rescue-starting"
            ? t?.rescueStartsAt
            : this.stage === "rescue"
              ? t?.combatEndsAt
              : this.match.deadline;
    return Math.max(
      0,
      Math.ceil(((end ?? this.match.deadline) - this.now) / 1000),
    );
  }
  public get settled() {
    return this.stage === "settlement" || this.stage === "finished";
  }
  public hpFor(seat: number) {
    return this.match.phase !== "preparation" && !this.settled
      ? (this.match.timeline?.opening[seat]?.hp ?? this.match.players[seat].hp)
      : this.match.players[seat].hp;
  }
  public get statusText() {
    if (this.stage === "starting") return `全员集结 · ${this.seconds} 秒后同时开战`;
    if (this.stage === "rescue-starting") return `防守战结束 · ${this.seconds} 秒后残兵出发救援`;
    if (this.stage === "settlement") return this.match.phase === "finished"
        ? `最终结算 · ${this.seconds} 秒后查看结果`
        : this.seconds
          ? `${this.seconds} 秒后自动进入下一轮备战`
          : "正在进入下一轮备战…";
    if (this.stage === "finished") return "对局结束 · 可查看各条战线与统计";
    const active = this.match.battles.filter(
      (b, i) => (this.stage === "rescue"
          ? b.rescueFor !== null
          : b.rescueFor === null) && this.battleStatus(i) === "战斗中",
    ).length;
    return this.replayComplete
      ? `${this.battleStatus(this.battleIndex)} · ${active ? `等待 ${active} 条战线，点击头像观战` : "正在汇总结算"}`
      : `${this.stage === "rescue" ? "残兵救援" : "同步交战"} · ${active} 条战线进行中`;
  }
  public battleStatus(index: number) {
    const b = this.match.battles[index];
    const t = this.match.timeline;
    if (!b || !t) return "等待开战";
    const start = b.rescueFor !== null ? t.rescueStartsAt : t.startsAt;
    if (this.now < start) return "等待开战";
    if (this.now < start + Math.ceil(b.elapsed * 1000)) return "战斗中";
    return b.rescueFor !== null
      ? b.won
        ? "救援成功"
        : "救援结束"
      : this.match.mode === "coop"
        ? b.won
          ? "已守住"
          : "防线漏怪"
        : "战斗结束";
  }
  public battleForSeat(seat: number) {
    const rescue = this.match.battles.findIndex(
      (b) => b.rescueFor !== null && (b.a === seat || b.rescueFor === seat),
    );
    if (
      ["rescue-starting", "rescue", "settlement", "finished"].includes(
        this.stage,
      ) &&
      rescue >= 0
    ) return rescue;
    return this.match.battles.findIndex(
      (b) => b.rescueFor === null && (b.a === seat || (!b.ghost && b.b === seat)),
    );
  }
  public watchSeat(seat: number) {
    const index = this.battleForSeat(seat);
    if (index < 0) return;
    this.watchedSeat = seat;
    this.playBattle(index);
    this.tickRoundClock();
    this.notify(true);
  }
  public get busy() {
    return this.pending || this.session.busy || !this.session.connected;
  }
  public get canEdit() {
    return (
      this.match.phase === "preparation" &&
      this.me.hp > 0 &&
      !this.me.ready &&
      !this.busy
    );
  }
  public get canAutoplayAct() {
    return this.canEdit;
  }
  public get opponent() {
    const { seat } = this.session.room;
    const p = this.match.pairings.find(
      (pair) => pair.a === seat || (!pair.ghost && pair.b === seat),
    );
    return p ? { seat: p.a === seat ? p.b : p.a, ghost: p.ghost } : null;
  }
  public get opponentBoard() {
    return this.opponent
      ? this.match.players[this.opponent.seat].previous
      : null;
  }
  public get battle() {
    return this.match.battles[this.battleIndex];
  }
  public get battleAftermath() {
    const { timeline } = this.match;
    if (this.match.phase === "preparation" || !this.replayComplete || !this.battle || !timeline) return null;
    const start = this.battle.rescueFor === null ? timeline.startsAt : timeline.rescueStartsAt;
    return {
      elapsed: Math.max(0, (this.now - start) / 1000 - this.battle.elapsed),
      winner: this.battle.won ? "player" as const : "enemy" as const,
    };
  }
  public get battleTraits() {
    return {
      player: traitsFor(this.battle?.recipe.player || []),
      enemy: traitsFor(this.battle?.recipe.enemy || []),
    };
  }
  public get readyLabel() {
    return this.me.hp <= 0 ? "观战中" : this.me.ready ? "取消准备" : "准备好了";
  }

  private notify(hudOnly = false) {
    this.onEvent?.({ type: hudOnly ? "hud" : "state" });
  }
  public openPanel(open: boolean) {
    this.panelOpen = open;
    this.notify(true);
  }

  public syncSession(session: MultiplayerSession) {
    if (this.clockSample !== session.room) {
      this.clockSample = session.room;
      this.clockOffset =
        session.room.code === "LOCAL" ? 0 : session.room.serverNow - Date.now();
    }
    this.session = session;
    const key = `${session.room.code}/${this.match.round}/${this.match.phase}`;
    const changedPhase = key !== this.phaseKey;
    const changedPersonal = this.personalRevision !== this.me.revision;
    if (changedPhase) {
      this.phaseKey = key;
      this.engine.state.selected = null;
      this.inspectedFighterId = null;
      this.enemyFormationOpen = false;
      this.battlePaused = false;
      this.panelOpen = this.me.hp <= 0 && this.match.phase === "preparation";
      this.replayKey = "";
      this.liveStage = null;
      this.watchedSeat = session.room.seat;
    }
    if (this.match.phase === "preparation") {
      if (changedPhase || changedPersonal) {
        const { selected } = this.engine.state;
        const snapshot = this.engine.getSimulationSnapshot();
        this.engine.restoreSimulationSnapshot({
          ...snapshot,
          ...this.match.simulation,
          state: this.match.self,
        });
        if (selected && this.engine.state[selected.zone][selected.index]) this.engine.state.selected = selected;
        this.engine.state.phase = "preparation";
        this.engine.previewBounty = 7;
        this.engine.previewWave = null;
        if (this.match.mode === "versus") {
          const { opponent } = this;
          this.engine.previewWave = {
            round: this.match.round,
            modifier: 1,
            tag: "normal",
            name: opponent
              ? `${this.match.players[opponent.seat].name}${opponent.ghost ? "的复制幻象" : ""}`
              : "观战中",
            description:
              "侦察展示对手上一轮锁定阵容。本轮调整不会提前公开。准备后等待全员或倒计时结束。",
            units: (this.opponentBoard || []).flatMap((u) => (u ? [{ id: u.id, star: u.star }] : []),),
          };
          this.preparationPressure = `上轮阵容 ${this.engine.previewWave.units.length} 人`;
        } else this.preparationPressure = "守住后可救援队友";
      }
    } else if (changedPhase) {
      const { seat } = session.room;
      this.battleIndex = Math.max(
        0,
        this.match.battles.findIndex(
          (b) => b.a === seat || (!b.ghost && b.b === seat),
        ),
      );
      this.playBattle(this.battleIndex);
      this.tickRoundClock();
    }
    this.personalRevision = this.me.revision;
    this.notify(
      !changedPhase && !(this.match.phase === "preparation" && changedPersonal),
    );
  }

  public playBattle(index: number, restart = false) {
    if (this.match.phase === "preparation") return;
    const record = this.match.battles[index];
    if (!record) return;
    const key = `${this.match.round}/${index}`;
    if (this.replayKey === key && !restart) return;
    if (
      record.rescueFor !== null &&
      ["starting", "battle"].includes(this.stage)
    ) return;
    this.replayKey = key;
    this.battleIndex = index;
    this.replayComplete = false;
    this.simulatedSteps = 0;
    this.aftermathElapsed = 0;
    this.battlePaused = false;
    this.inspectedFighterId = null;
    this.enemyFormationOpen = false;
    this.engine.previewWave = null;
    this.engine.restoreSimulationSnapshot(
      replayEngine(record.recipe, true).getSimulationSnapshot(),
    );
    this.restoreEconomy();
    const traits = this.battleTraits;
    this.battleLabels = {
      player: this.match.players[record.a].name,
      enemy:
        record.rescueFor !== null
          ? `${this.match.players[record.rescueFor].name}的漏怪`
          : record.b !== null
            ? `${this.match.players[record.b].name}${record.ghost ? "的幻象" : ""}`
            : "裂隙军团",
      playerSummary: `羁绊：${traits.player.map((t) => `${t.name} ${t.count}`).join(" · ") || "无"}`,
      enemySummary: `羁绊：${traits.enemy.map((t) => `${t.name} ${t.count}`).join(" · ") || "无"}`,
    };
    this.engine.state.battle!.banner =
      record.rescueFor === null ? "全员同步交战" : "残兵救援";
    this.panelOpen = false;
    this.onEvent?.({ type: "audio", event: "battle" });
    this.notify();
  }

  private restoreEconomy() {
    const s = this.engine.state;
    const own = this.match.self;
    s.hp = this.hpFor(this.session.room.seat);
    s.maxHp = own.maxHp;
    s.gold =
      this.match.phase !== "preparation" && !this.settled
        ? (this.match.timeline?.opening[this.session.room.seat]?.gold ??
          own.gold)
        : own.gold;
    s.score = own.score;
    s.streak = own.streak;
    s.victories = own.victories;
  }

  private step() {
    if (this.replayComplete || this.engine.state.phase !== "battle") return;
    this.engine.update(1 / 60);
    this.simulatedSteps++;
    if (this.engine.state.phase !== "battle") {
      this.replayComplete = true;
      this.engine.state.phase = "battle";
      this.restoreEconomy();
      this.engine.state.battle!.banner = this.statusText;
      this.engine.state.battle!.bannerTimer = 999;
      this.onEvent?.({
        type: "audio",
        event: this.battle?.won ? "win" : "loss",
      });
      this.notify();
    }
  }

  private animateAftermath() {
    const aftermath = this.battleAftermath;
    const { battle } = this.engine.state;
    if (!aftermath || !battle) return;
    const delta = Math.max(0, aftermath.elapsed - this.aftermathElapsed);
    if (!delta) return;
    const drift = Math.max(0, Math.min(aftermath.elapsed, 0.35) - Math.min(this.aftermathElapsed, 0.35));
    this.aftermathElapsed = Math.max(this.aftermathElapsed, aftermath.elapsed);
    this.engine.state.visualTime += delta;
    // Only expire visual effects. Health, damage, combat time and rescue survivors stay fixed.
    battle.effects.forEach(effect => { effect.life -= delta; });
    battle.effects = battle.effects.filter(effect => effect.life > 0);
    battle.projectiles.forEach(projectile => {
      projectile.x += projectile.velocityX * drift;
      projectile.y += projectile.velocityY * drift;
    });
    if (aftermath.elapsed >= 0.35) battle.projectiles = [];
  }

  public tickRoundClock() {
    if (this.match.phase === "preparation") return;
    const { stage } = this;
    const initial = this.liveStage === null;
    const changed = stage !== this.liveStage;
    if (changed) {
      this.liveStage = stage;
      if (
        stage === "rescue-starting" ||
        stage === "rescue" ||
        (initial && this.settled)
      ) {
        const own = this.battleForSeat(this.session.room.seat);
        const index =
          this.match.battles[own]?.rescueFor !== null && own >= 0
            ? own
            : this.match.battles.findIndex((b) => b.rescueFor !== null);
        if (index >= 0 && this.battle?.rescueFor === null) {
          this.watchedSeat = this.match.battles[index].rescueFor!;
          this.playBattle(index);
        }
      }
      if (stage === "finished") this.panelOpen = true;
    }
    const t = this.match.timeline;
    if (this.battle && t) {
      const startsAt =
        this.battle.rescueFor === null ? t.startsAt : t.rescueStartsAt;
      const targetSteps = Math.min(
        Math.ceil(this.battle.elapsed * 60 - 1e-6),
        Math.max(0, Math.floor(((this.now - startsAt) * 60) / 1000)),
      );
      while (!this.replayComplete && this.simulatedSteps < targetSteps) this.step();
      this.animateAftermath();
      this.restoreEconomy();
      if (this.engine.state.battle) {
        this.engine.state.battle.banner = this.statusText;
        this.engine.state.battle.bannerTimer = 999;
      }
    }
    const second = Math.floor(this.now / 1000);
    if (changed || second !== this.hudSecond) {
      this.hudSecond = second;
      this.notify(true);
    }
  }

  public update(delta: number) {
    if (this.match.phase === "preparation") super.update(delta);
    else if (!this.hidden) this.tickRoundClock();
  }
  public advance() {
    this.tickRoundClock();
  }
  public updateBackground() {
    this.tickRoundClock();
    return 0;
  }
  public setBattlePaused() {
    this.battlePaused = false;
    return false;
  }
  public skipBattle() {
    this.tickRoundClock();
    return {
      skipped: false,
      steps: 0,
      reason: "所有战线按房间时间同步推进",
      state: this.getState(),
    };
  }
  public async send(command: Command) {
    if (this.busy) return;
    this.pending = true;
    this.notify(true);
    try {
      await this.session.send(command);
    } finally {
      this.pending = false;
      this.notify(true);
    }
  }

  public confirmReport() {
    this.tickRoundClock();
  }

  public dispatch(action: GameAction) {
    if (
      ["inspectFighter", "rankingToggle", "metric", "clearSelection"].includes(
        action.type,
      )
    ) return super.dispatch(action);
    if (action.type === "skipBattle") {
      this.skipBattle();
      return this.getState();
    }
    if (action.type === "resultContinue") {
      this.confirmReport();
      return this.getState();
    }
    if (action.type === "battle") {
      if (this.match.phase === "preparation" && this.me.hp > 0) this.send({
          kind: "ready",
          round: this.match.round,
          ready: !this.me.ready,
        });
      return this.getState();
    }
    if (action.type === "slot") {
      const from = this.engine.state.selected;
      const to = action.location;
      if (!this.validLocation(to)) return this.getState();
      if (
        from &&
        (from.zone !== to.zone || from.index !== to.index) &&
        this.canEdit
      ) {
        this.engine.clearSelection();
        this.send({
          kind: "action",
          round: this.match.round,
          action: { kind: "move", from, to },
        });
      } else {
        this.engine.state.selected =
          from?.zone === to.zone && from.index === to.index
            ? null
            : this.engine.state[to.zone][to.index]
              ? to
              : null;
        this.notify();
      }
      return this.getState();
    }
    if (!this.canEdit) return this.getState();
    let command: PrepAction | null = null;
    if (action.type === "shop") command = { kind: "buy", index: action.index };
    if (action.type === "move") command = { kind: "move", from: action.from, to: action.to };
    if (action.type === "sell") {
      const location = action.location ?? this.engine.state.selected;
      if (location) command = { kind: "sell", location };
    }
    if (action.type === "starForge") command = {
        kind: "forge",
        location: action.location ?? this.engine.state.selected ?? undefined,
      };
    if (action.type === "buyXp") command = { kind: "level" };
    if (action.type === "lock" || action.type === "reroll") command = { kind: action.type };
    if (action.type === "autoArrange") command = { kind: "arrange" };
    if (command) this.send({ kind: "action", round: this.match.round, action: command });
    return this.getState();
  }

  private validLocation(l: UnitLocation) {
    return (
      ["board", "bench"].includes(l.zone) &&
      Number.isInteger(l.index) &&
      l.index >= 0 &&
      l.index < this.engine.state[l.zone].length
    );
  }

  public renderTextState() {
    const state = JSON.parse(super.renderTextState());
    return JSON.stringify({
      ...state,
      availableActions:
        this.match.phase === "preparation"
          ? [
              ...state.availableActions.filter(
                (a: string) => !/开始战斗/.test(a),
              ),
              "准备好了 / 取消准备",
              "房间 / 战报",
            ]
          : [
              "点击玩家头像切换实时观战",
              "D 查看统计",
              "点击棋子查看战况",
              "房间 / 战报",
            ],
      multiplayer: {
        code: this.session.room.code,
        seat: this.session.room.seat,
        mode: this.match.mode,
        phase: this.match.phase,
        stage: this.stage,
        stageLabel: this.stageLabel,
        status: this.statusText,
        watchedSeat: this.watchedSeat,
        timeline: this.match.timeline,
        serverNow: this.now,
        round: this.match.round,
        revision: this.session.room.revision,
        ready: this.me.ready,
        connected: this.session.connected,
        busy: this.busy,
        canEdit: this.canEdit,
        seconds: this.seconds,
        opponent: this.opponent,
        players: this.match.players,
        pairings: this.match.pairings,
        battleIndex: this.battleIndex,
        replayComplete: this.replayComplete,
        aftermath: this.battleAftermath,
        visualTime: this.engine.state.visualTime,
        panelOpen: this.panelOpen,
        winners: this.match.winners,
      },
    });
  }
}
