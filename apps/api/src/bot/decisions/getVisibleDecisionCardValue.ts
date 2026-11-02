import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { bodyValue } from "#api/bot/evaluate";
import type { BotView } from "#api/bot/view";

type Params = { instanceId: string; request: DecisionRequest; view?: BotView };

export function getVisibleDecisionCardValue({ instanceId, request, view }: Params): number {
  const board = [
    ...(view?.board ?? []),
    ...(view?.opponentBoard ?? []),
    ...(view?.breeding === undefined ? [] : [view.breeding]),
  ];
  const unit = board.find((entry) => entry.permanentId === instanceId || entry.topCardInstanceId === instanceId);
  if (unit !== undefined) {
    return bodyValue(unit);
  }
  const ownCard = view?.hand.find((entry) => entry.instanceId === instanceId);
  const visible = request.options?.visibleCards?.find((entry) => entry.instanceId === instanceId);
  const cardId = ownCard?.cardId ?? visible?.cardId;
  const definition = ownCard?.definition ?? (cardId === undefined ? undefined : getCardDefinition(cardId));
  if (definition === undefined) {
    return 0;
  }
  return (definition.level ?? 0) + Math.max(0, definition.playCost) / 10 + Math.max(0, definition.dp) / 10000;
}
