import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import { getCardTieBreakValue } from "#api/bot/decisions/getCardTieBreakValue";
import { getDecisionCandidateSignature } from "#api/bot/decisions/getDecisionCandidateSignature";
import { orderIdenticalCandidatesById } from "#api/bot/decisions/orderIdenticalCandidatesById";
import { getVisibleDecisionCardValue } from "#api/bot/decisions/getVisibleDecisionCardValue";
import type { BotView } from "#api/bot/view";

type Params = { view: BotView | undefined; request: DecisionRequest };

export type CardOrder = { order: string[]; basis: DecisionBasis };

function getTieBreak({ view, request, instanceId }: Params & { instanceId: string }): number {
  const cardId =
    view?.hand.find((card) => card.instanceId === instanceId)?.cardId ??
    request.options?.visibleCards?.find((card) => card.instanceId === instanceId)?.cardId;
  return getCardTieBreakValue({ definition: cardId === undefined ? undefined : getCardDefinition(cardId) });
}

export function explainCardOrder({ view, request }: Params): CardOrder {
  const candidates = request.options?.candidateInstanceIds ?? [];
  const lowestFirst = request.options?.orderDestination === "stackBottom";
  const direction = lowestFirst ? -1 : 1;
  const value = (instanceId: string): number => getVisibleDecisionCardValue({ instanceId, request, view });
  const tieBreak = (instanceId: string): number => getTieBreak({ view, request, instanceId });
  const order = orderIdenticalCandidatesById({
    ordered: [...candidates].sort(
      (left, right) => direction * (value(right) - value(left)) || direction * (tieBreak(right) - tieBreak(left)),
    ),
    getSignature: (instanceId) => getDecisionCandidateSignature({ view, request, instanceId }),
  });
  return { order, basis: candidates.length <= 1 ? DecisionBasis.FORCED.value : DecisionBasis.SCORED.value };
}
