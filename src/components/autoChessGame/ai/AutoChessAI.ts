import { STARTERS, type StarterId } from "../core/gameData";
import type { UnitLocation } from "../core/gameTypes";
import { EngineBridge, type GameAction } from "../phaser/EngineBridge";
import { AUTOCHESS_VERSION } from "../version";

type Zone = UnitLocation["zone"];

export interface AICommandResult {
  ok: boolean;
  message: string;
  state: Record<string, unknown>;
}

const location = (zone: Zone, oneBasedSlot: number): UnitLocation => ({
  zone,
  index: Math.floor(oneBasedSlot) - 1,
});

export class AutoChessAIController {
  public readonly version = AUTOCHESS_VERSION;

  constructor(private readonly bridge: EngineBridge) {}

  public help() {
    return {
      version: this.version,
      indexing: "starter/buy/choose/select/move/sell use 1-based slots; act() uses raw GameAction indexes",
      read: ["state()", "logs(count = 80)", "battles()", "actions(count = 200)", "window.autoChessLastRun", "help()"],
      flow: ["starter(choice)", "battle()", "skipBattle()", "next()", "choose(choice)", "restart()"],
      economy: ["buy(shopSlot)", "reroll()", "lock()", "level()"],
      formation: ["select(zone, slot)", "move(fromZone, fromSlot, toZone, toSlot)", "sell(zone?, slot?)"],
      testing: ["advance(milliseconds)", "consoleLogging(enabled)", "act(rawGameAction)"],
      zones: ["board", "bench"],
    };
  }

  public state() {
    return this.bridge.getState();
  }

  public logs(count = 80) {
    return this.bridge.getBattleLog(count);
  }

  public battles() {
    return this.bridge.getBattleHistory();
  }

  public actions(count = 200) {
    return this.bridge.getActionHistory(count);
  }

  public act(action: GameAction) {
    return this.perform(action, `executed ${action.type}`);
  }

  public starter(choice: number | StarterId) {
    const choices = this.bridge.engine.state.starterChoices;
    const id = typeof choice === "number" ? choices[Math.floor(choice) - 1] : choice;
    if (!id || !STARTERS.some((starter) => starter.id === id)) return this.failure("invalid starter choice");
    return this.perform({ type: "starter", id }, `selected starter ${id}`);
  }

  public buy(shopSlot: number) {
    if (!this.validSlot(shopSlot, 5)) return this.failure("shopSlot must be 1-5");
    return this.perform({ type: "shop", index: Math.floor(shopSlot) - 1 }, `bought shop slot ${shopSlot}`);
  }

  public reroll() {
    return this.perform({ type: "reroll" }, "rerolled shop");
  }

  public lock() {
    return this.perform({ type: "lock" }, "toggled shop lock");
  }

  public level() {
    return this.perform({ type: "buyXp" }, "bought next book level");
  }

  public select(zone: Zone, slot: number) {
    if (!this.validLocation(zone, slot)) return this.failure("invalid formation location");
    return this.perform({ type: "slot", location: location(zone, slot) }, `selected ${zone}:${slot}`);
  }

  public move(fromZone: Zone, fromSlot: number, toZone: Zone, toSlot: number) {
    if (!this.validLocation(fromZone, fromSlot) || !this.validLocation(toZone, toSlot)) {
      return this.failure("invalid source or destination; board is 1-24 and bench is 1-8");
    }
    return this.perform(
      { type: "move", from: location(fromZone, fromSlot), to: location(toZone, toSlot) },
      `moved ${fromZone}:${fromSlot} to ${toZone}:${toSlot}`,
    );
  }

  public sell(zone?: Zone, slot?: number) {
    if (zone === undefined && slot === undefined) return this.perform({ type: "sell" }, "sold selected unit");
    if (!zone || slot === undefined || !this.validLocation(zone, slot)) return this.failure("sell requires a valid zone and slot");
    return this.perform({ type: "sell", location: location(zone, slot) }, `sold ${zone}:${slot}`);
  }

  public battle() {
    return this.perform({ type: "battle" }, "started battle");
  }

  public skipBattle() {
    return this.bridge.skipBattle();
  }

  public choose(choice: number) {
    if (!this.validSlot(choice, 3)) return this.failure("choice must be 1-3");
    return this.perform({ type: "augment", index: Math.floor(choice) - 1 }, `selected augment ${choice}`);
  }

  public next() {
    return this.perform({ type: "resultContinue" }, "continued after result");
  }

  public restart() {
    return this.perform({ type: "restart" }, "restarted run");
  }

  public advance(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return this.failure("milliseconds must be positive");
    this.bridge.advance(milliseconds);
    return this.success(`advanced ${milliseconds}ms`);
  }

  public consoleLogging(enabled: boolean) {
    this.bridge.setConsoleLogging(Boolean(enabled));
    return this.success(`console logging ${enabled ? "enabled" : "disabled"}`);
  }

  private perform(action: GameAction, message: string) {
    this.bridge.dispatch(action);
    const result = this.success(message);
    const toast = result.state.toast as string | null | undefined;
    return toast ? { ...result, message: `${message}: ${toast}` } : result;
  }

  private success(message: string): AICommandResult {
    return { ok: true, message, state: this.state() };
  }

  private failure(message: string): AICommandResult {
    return { ok: false, message, state: this.state() };
  }

  private validSlot(slot: number, maximum: number) {
    return Number.isInteger(slot) && slot >= 1 && slot <= maximum;
  }

  private validLocation(zone: Zone, slot: number) {
    return (zone === "board" && this.validSlot(slot, 24)) || (zone === "bench" && this.validSlot(slot, 8));
  }
}
