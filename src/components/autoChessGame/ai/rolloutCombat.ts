import type { AutoChessEngine } from "../core/gameEngine";
import type {
  BattleState,
  GamePhase,
  RoundResult,
} from "../core/gameTypes";

export const scorePreparedAutoChessCombat = (
  simulation: AutoChessEngine,
  combatHz = 60,
) => {
  if (simulation.state.phase === "preparation" && simulation.boardCount > 0) {
    simulation.startBattle();
  }
  if (simulation.state.phase !== "battle" || !simulation.state.battle) {
    return Number.NEGATIVE_INFINITY;
  }
  let steps = 0;
  const maximumSteps = Math.ceil(26 * combatHz);
  while ((simulation.state.phase as GamePhase) === "battle" && steps < maximumSteps) {
    simulation.update(1 / combatHz);
    steps += 1;
  }
  const battle = simulation.state.battle as BattleState | null;
  if (!battle) return Number.NEGATIVE_INFINITY;
  const healthRatio = (fighters: BattleState["player"]) => fighters.reduce(
    (sum, fighter) => sum + (fighter.alive ? fighter.hp / fighter.maxHp : 0),
    0,
  );
  const healthMargin = healthRatio(battle.player) - healthRatio(battle.enemy);
  const result = simulation.state.result as RoundResult | null;
  const won = result?.won === true;
  return (won ? 10000 : 0) + healthMargin * 100 - (won ? battle.elapsed : 0);
};
