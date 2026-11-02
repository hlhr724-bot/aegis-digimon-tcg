import { PASS_TURN_MEMORY } from "#api/engine/MemoryGauge";
import type { PlannedTurnState } from "#api/bot/evolution/createPlannedTurnState";
import type { TurnPlannerWeights } from "#api/bot/evolution/defaultTurnPlannerParameters";

export function scorePlannedTurnEnd(state: PlannedTurnState, weights: TurnPlannerWeights): number {
  const observation = state.observation;
  const own = observation.players.find((player) => player.seat === observation.seat)!;
  const enemy = observation.players.find((player) => player.seat !== observation.seat)!;
  let ownDp = 0;
  let ownLevels = 0;
  for (const unit of own.board) {
    ownDp += unit.dp / 1000;
    ownLevels += unit.top.level ?? 0;
  }
  let enemyDp = 0;
  for (const unit of enemy.board) enemyDp += unit.dp / 1000;
  return (
    weights.memoryGiven * (state.memoryGiven ?? PASS_TURN_MEMORY) +
    weights.opponentSecurity * enemy.securityCount +
    weights.ownHand * own.handCount +
    weights.ownBoardDp * ownDp +
    weights.ownBoardLevels * ownLevels +
    weights.opponentBoardDp * enemyDp +
    weights.win * Number(state.won)
  );
}
