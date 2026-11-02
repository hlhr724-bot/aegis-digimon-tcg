import type { Seat } from "@aegis/shared/schema/enums";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import type { BotProfile } from "#api/bot/profiles";
import type { BotView } from "#api/bot/view";

type Params = { summary: DecisionEffectSummary; profile: BotProfile; view?: BotView; controllerSeat?: Seat };

export function scoreDecisionSummary({ summary, profile, view, controllerSeat }: Params): number {
  const weights = profile.weights;
  const ownPerspective = controllerSeat === undefined || view === undefined || controllerSeat === view.seat;
  const removalTargets = ownPerspective ? (view?.opponentBoard.length ?? 1) : (view?.board.length ?? 1);
  const security = ownPerspective ? (view?.securityCount ?? 5) : (view?.opponentSecurityCount ?? 5);
  let freeMemory = view?.freeMemory;
  if (!ownPerspective) {
    freeMemory = 0;
    if (view?.turnSeat === controllerSeat) {
      freeMemory = Math.max(0, view.memory);
    }
  }
  const recoveryValue = weights.securityDefend * (security <= 1 ? weights.criticalSecurityMultiplier : 1);
  const memoryCost = Math.max(0, summary.memoryCost.maximum ?? summary.memoryCost.minimum);
  const handover = Math.max(0, memoryCost - (freeMemory ?? memoryCost));
  return (
    summary.memoryGain * (1 + weights.memoryHandover) +
    (summary.cardsDrawn + summary.cardsReturnedFromTrash) * weights.digivolveDraw +
    summary.cardsRecovered * recoveryValue +
    summary.removal * Math.min(1, removalTargets) * weights.removal * weights.securityAttack +
    summary.plays * weights.playBody * weights.tamer +
    summary.evolutions * (weights.levelGain + weights.digivolveDraw) +
    summary.unsuspends * weights.securityAttack -
    memoryCost * weights.memorySpend -
    handover * weights.memoryHandover
  );
}
