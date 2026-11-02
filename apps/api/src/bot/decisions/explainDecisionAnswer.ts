import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { CardKind } from "@aegis/shared/schema/enums";
import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import type { DecisionAnswer } from "#api/bot/decisions/DecisionAnswer";
import { explainCardOrder } from "#api/bot/decisions/explainCardOrder";
import { explainCardSelection } from "#api/bot/decisions/explainCardSelection";
import { explainOptionalDecision } from "#api/bot/decisions/explainOptionalDecision";
import { getCardTieBreakValue } from "#api/bot/decisions/getCardTieBreakValue";
import { rankDecisionAlternatives } from "#api/bot/decisions/rankDecisionAlternatives";
import type { BotProfile } from "#api/bot/profiles";
import type { BotView } from "#api/bot/view";

type Params = {
  view: BotView | undefined;
  request: DecisionRequest;
  profile: BotProfile;
  preferBeneficialSelections?: boolean;
  preferFreeOptionSelections?: boolean;
};

type CardSelectionCheck = { view: BotView; request: DecisionRequest };

const FREE_OPTION_PATTERN = /You may use 1 [^.]*Option card[^.]*without paying (?:the|its) cost[.]/i;
const REVEALED_FREE_PLAY_PATTERN =
  /Reveal the top [0-9]+ cards of your deck[.] You may play 1 [^.]*among them without paying (?:the|its) cost[.]/i;
const FREE_PLAY_PATTERN = /\bplay\b[\s\S]*\bwithout paying (?:the|its) cost\b/i;

function isOnBoard(view: BotView, instanceId: string): boolean {
  const board = [...view.board, ...view.opponentBoard, ...(view.breeding === undefined ? [] : [view.breeding])];
  return board.some((unit) => unit.permanentId === instanceId || unit.topCardInstanceId === instanceId);
}

function getVisibleCardId(request: DecisionRequest, instanceId: string): string | undefined {
  return request.options?.visibleCards?.find((card) => card.instanceId === instanceId)?.cardId;
}

function isOptionalFreeOptionSelection({ view, request }: CardSelectionCheck): boolean {
  const options = request.options;
  const text = options?.effectTextPart ?? options?.effectText ?? "";
  const candidates = options?.candidateInstanceIds ?? [];
  return (
    request.kind === "selectCards" &&
    options?.purpose === undefined &&
    (options?.min ?? 0) === 0 &&
    options?.max === 1 &&
    FREE_OPTION_PATTERN.test(text) &&
    candidates.length > 0 &&
    candidates.every((id) => {
      const cardId = getVisibleCardId(request, id);
      return cardId !== undefined && getCardDefinition(cardId)?.kinds.includes(CardKind.Option);
    }) &&
    candidates.every((id) => !isOnBoard(view, id))
  );
}

function isOptionalFreePlaySelection({ view, request }: CardSelectionCheck): boolean {
  const options = request.options;
  const text = options?.effectTextPart ?? options?.effectText ?? "";
  const candidates = options?.candidateInstanceIds ?? [];
  const unmarkedReveal =
    options?.purpose === undefined &&
    (options?.min ?? 0) === 0 &&
    REVEALED_FREE_PLAY_PATTERN.test(text) &&
    candidates.every((id) => getVisibleCardId(request, id) !== undefined);
  return (
    request.kind === "selectCards" &&
    options?.assemblyCardId === undefined &&
    options?.digiXrosCardId === undefined &&
    (options?.purpose === "optionalTarget" || unmarkedReveal) &&
    (options?.max ?? 1) === 1 &&
    candidates.length > 0 &&
    FREE_PLAY_PATTERN.test(text) &&
    candidates.every((id) => !isOnBoard(view, id))
  );
}

function explainFreeOptionSelection(request: DecisionRequest): DecisionAnswer {
  const value = (instanceId: string): number => {
    const cardId = getVisibleCardId(request, instanceId);
    const definition = cardId === undefined ? undefined : getCardDefinition(cardId);
    return Math.max(0, definition?.playCost ?? 0) + getCardTieBreakValue({ definition });
  };
  const candidates = request.options?.candidateInstanceIds ?? [];
  const best = [...candidates].sort((left, right) => value(right) - value(left))[0];
  return {
    intent: {
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "selectCards", instanceIds: best === undefined ? [] : [best] },
    },
    basis: candidates.length <= 1 ? DecisionBasis.FORCED.value : DecisionBasis.SCORED.value,
  };
}

function shouldKeepHand(view: BotView | undefined): boolean {
  if (view === undefined || view.hand.length === 0) {
    return true;
  }
  return view.hand.some(
    (card) =>
      card.definition !== undefined &&
      card.definition.kinds.includes(CardKind.Digimon) &&
      (card.definition.level ?? 0) <= 3,
  );
}

function getAlternativesBasis(count: number): DecisionBasis {
  return count <= 1 ? DecisionBasis.FORCED.value : DecisionBasis.SCORED.value;
}

export function explainDecisionAnswer(params: Params): DecisionAnswer {
  const { view, request, profile } = params;
  const preferBeneficialSelections = params.preferBeneficialSelections ?? false;
  if (params.preferFreeOptionSelections && view !== undefined && isOptionalFreeOptionSelection({ view, request })) {
    return explainFreeOptionSelection(request);
  }
  if (preferBeneficialSelections && view !== undefined && isOptionalFreePlaySelection({ view, request })) {
    return explainDecisionAnswer({
      ...params,
      request: { ...request, options: { ...request.options, purpose: "acceptedOptional" } },
    });
  }
  switch (request.kind) {
    case "mulligan":
      return { intent: { type: "mulligan", keep: shouldKeepHand(view) }, basis: DecisionBasis.RULE.value };

    case "optional":
      return explainOptionalDecision({ view, request, profile });

    case "selectCards":
    case "chooseTargets": {
      const selection = explainCardSelection({ view, request, profile, preferBeneficialSelections });
      return {
        intent: {
          type: "respondDecision",
          decisionId: request.decisionId,
          response:
            request.kind === "selectCards"
              ? { kind: "selectCards", instanceIds: selection.instanceIds }
              : { kind: "chooseTargets", instanceIds: selection.instanceIds },
        },
        basis: selection.basis,
      };
    }

    case "orderCards": {
      const { order, basis } = explainCardOrder({ view, request });
      return {
        intent: { type: "respondDecision", decisionId: request.decisionId, response: { kind: "orderCards", order } },
        basis,
      };
    }

    case "orderTriggers": {
      const keys = request.options?.triggerKeys ?? [];
      return {
        intent: {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: {
            kind: "orderTriggers",
            order: rankDecisionAlternatives({ request, profile, view })
              .slice(0, 1)
              .map((index) => keys[index]!),
          },
        },
        basis: getAlternativesBasis(keys.length),
      };
    }

    case "chooseOption": {
      const optionIndex = rankDecisionAlternatives({ request, profile, view })[0];
      if (optionIndex === undefined) {
        throw new Error("Bot cannot answer a choice with no offered options");
      }
      return {
        intent: {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "chooseOption", optionIndex },
        },
        basis: getAlternativesBasis(request.options?.choices?.length ?? 0),
      };
    }

    default: {
      const unhandled: never = request.kind;
      throw new Error(`Unhandled bot decision kind: ${String(unhandled)}`);
    }
  }
}
