import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { parseTriggerKey } from "@aegis/shared/protocol/triggerKey";
import { getCardTieBreakValue } from "#api/bot/decisions/getCardTieBreakValue";
import { getChoiceLabelPreference } from "#api/bot/decisions/getChoiceLabelPreference";
import type { BotProfile } from "#api/bot/profiles";
import type { BotView } from "#api/bot/view";
import { scoreDecisionSummary } from "#api/bot/decisions/scoreDecisionSummary";

type Params = { request: DecisionRequest; profile: BotProfile; view?: BotView };

type RankedAlternative = { index: number; score: number; secondary: number; tieBreak: number };

function rankTrigger({ request, profile, view }: Params, index: number): RankedAlternative {
  const options = request.options;
  const summary = options?.triggerSummaries?.[index];
  const controller = options?.triggerControllerSeats?.[index] ?? options?.effectControllerSeat;
  const sign = controller === undefined || controller === request.seat ? 1 : -1;
  const score =
    summary === undefined || summary === null
      ? 0
      : sign * scoreDecisionSummary({ summary, profile, view, controllerSeat: controller });
  const cardId = options?.triggerCardIds?.[index];
  const card = cardId === undefined ? undefined : getCardDefinition(cardId);
  const secondary =
    card === undefined
      ? 0
      : sign * ((card.level ?? 0) + Math.max(0, card.playCost) / 10 + Math.max(0, card.dp) / 10000);
  const inheritedPenalty = options?.triggerIsInherited?.[index] === true ? 0.5 : 0;
  const uncertainPenalty = summary?.uncertain === true ? 0.25 : 0;
  const triggerKey = options?.triggerKeys?.[index];
  const grantedPenalty =
    cardId !== undefined && triggerKey !== undefined && !parseTriggerKey(triggerKey).effectKey.startsWith(`${cardId}/`)
      ? 0.125
      : 0;
  return {
    index,
    score,
    secondary,
    tieBreak: sign * getCardTieBreakValue({ definition: card }) - inheritedPenalty - uncertainPenalty - grantedPenalty,
  };
}

function rankChoice({ request, profile, view }: Params, index: number): RankedAlternative {
  const options = request.options;
  const summary = options?.choiceSummaries?.[index];
  const controller = options?.effectControllerSeat;
  const sign = controller === undefined || controller === request.seat ? 1 : -1;
  let score =
    summary === undefined || summary === null
      ? 0
      : sign * scoreDecisionSummary({ summary, profile, view, controllerSeat: controller });
  const costChoice = options?.digivolveCostChoice;
  const cost = costChoice?.costs[index];
  if (cost !== undefined && Number.isFinite(cost)) {
    score -= sign * Math.max(0, cost + (costChoice?.costDelta ?? 0));
  }
  const secondary = getChoiceLabelPreference({ request, view, index });
  return { index, score, secondary, tieBreak: 0 };
}

export function rankDecisionAlternatives(params: Params): number[] {
  const options = params.request.options;
  const ordering = params.request.kind === "orderTriggers";
  const labels = ordering ? (options?.triggerKeys ?? []) : (options?.choices ?? []);
  return labels
    .map((_label, index) => (ordering ? rankTrigger(params, index) : rankChoice(params, index)))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.secondary - left.secondary ||
        right.tieBreak - left.tieBreak ||
        left.index - right.index,
    )
    .map((entry) => entry.index);
}
