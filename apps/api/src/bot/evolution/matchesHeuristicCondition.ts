import type { Feature, HeuristicRule } from "#api/bot/evolution/heuristic";
import type { TrainingObservation } from "#api/bot/training/observation";

export function matchesHeuristicCondition(input: {
  condition: HeuristicRule["when"];
  features: Record<Feature, number>;
  kind: string;
  sourceCardId?: string;
  observation?: TrainingObservation;
}): boolean {
  const { condition, features, kind, sourceCardId, observation } = input;
  if (condition === undefined) return true;
  if (
    (condition.kind !== undefined && condition.kind !== kind) ||
    (condition.sourceCardIds !== undefined &&
      (sourceCardId === undefined || !condition.sourceCardIds.includes(sourceCardId))) ||
    !Object.entries(condition.minimum ?? {}).every(([feature, limit]) => features[feature as Feature] >= limit!) ||
    !Object.entries(condition.maximum ?? {}).every(([feature, limit]) => features[feature as Feature] <= limit!)
  )
    return false;
  if (condition.ownBoard === undefined && condition.ownHand === undefined) return true;
  const own = observation?.players.find((player) => player.seat === observation.seat);
  if (own === undefined) return false;
  const board = condition.ownBoard;
  const hand = condition.ownHand;
  if (board !== undefined) {
    const count = own.board.filter(
      (unit) =>
        board.cardIds.includes(unit.top.cardId ?? "") &&
        (board.suspended === undefined || board.suspended === unit.suspended),
    ).length;
    if (
      (board.minimum !== undefined && count < board.minimum) ||
      (board.maximum !== undefined && count > board.maximum)
    )
      return false;
  }
  if (hand !== undefined) {
    const count = own.hand.filter((card) => hand.cardIds.includes(card.cardId ?? "")).length;
    if ((hand.minimum !== undefined && count < hand.minimum) || (hand.maximum !== undefined && count > hand.maximum))
      return false;
  }
  return true;
}
