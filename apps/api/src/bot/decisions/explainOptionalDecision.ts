import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import type { DecisionAnswer } from "#api/bot/decisions/DecisionAnswer";
import { scoreDecisionSummary } from "#api/bot/decisions/scoreDecisionSummary";
import { scoreCandidate } from "#api/bot/evaluate";
import type { BotProfile } from "#api/bot/profiles";
import { isDigimonCard, type BotUnit, type BotView } from "#api/bot/view";

type Params = { view: BotView | undefined; request: DecisionRequest; profile: BotProfile };

function buildAnswer(request: DecisionRequest, accept: boolean, basis: DecisionBasis): DecisionAnswer {
  return {
    intent: { type: "respondDecision", decisionId: request.decisionId, response: { kind: "optional", accept } },
    basis,
  };
}

function scorePlayerAttack(view: BotView, attacker: BotUnit, profile: BotProfile): number {
  return scoreCandidate(
    view,
    {
      kind: "attackPlayer",
      key: `attackPlayer:${attacker.permanentId}`,
      intent: { type: "attack", attackerPermanentId: attacker.permanentId, target: { kind: "player" } },
      cost: 0,
      attacker: { ...attacker, canAttackPlayer: true },
    },
    profile,
  );
}

function explainBlitz({ view, request, profile }: Params): DecisionAnswer {
  const attacker = view?.board.find((unit) => unit.permanentId === request.sourcePermanentId);
  if (view === undefined || attacker === undefined) {
    return buildAnswer(request, true, DecisionBasis.UNSCORED_OPTIONAL.value);
  }
  return buildAnswer(request, scorePlayerAttack(view, attacker, profile) > 0, DecisionBasis.SCORED.value);
}

function explainEffectAttack({ view, request, profile }: Params): DecisionAnswer {
  const attackers = (view?.board ?? []).filter((unit) => !unit.suspended && isDigimonCard(unit.definition));
  if (view === undefined || attackers.length === 0) {
    return buildAnswer(request, true, DecisionBasis.UNSCORED_OPTIONAL.value);
  }
  const best = Math.max(...attackers.map((attacker) => scorePlayerAttack(view, attacker, profile)));
  return buildAnswer(request, best > 0, DecisionBasis.SCORED.value);
}

export function explainOptionalDecision({ view, request, profile }: Params): DecisionAnswer {
  const options = request.options;
  if (options?.selectionGoal === DecisionSelectionGoal.PROTECT.value) {
    return buildAnswer(request, true, DecisionBasis.PROTECTION.value);
  }
  if (options?.promptKey === "activateBlitz") {
    return explainBlitz({ view, request, profile });
  }
  if (options?.selectionContext === "attackSource") {
    return explainEffectAttack({ view, request, profile });
  }
  const summary = options?.effectSummary;
  if (summary === undefined) {
    return buildAnswer(request, true, DecisionBasis.UNSCORED_OPTIONAL.value);
  }
  const controllerSeat = options?.effectControllerSeat ?? request.seat;
  const sign = controllerSeat === request.seat ? 1 : -1;
  const score = sign * scoreDecisionSummary({ summary, profile, view, controllerSeat });
  if (score !== 0) {
    return buildAnswer(request, score > 0, DecisionBasis.SCORED.value);
  }
  if (summary.memoryCost.maximum === 0) {
    return buildAnswer(request, sign > 0, DecisionBasis.FREE_EFFECT.value);
  }
  return buildAnswer(request, true, DecisionBasis.UNSCORED_OPTIONAL.value);
}
