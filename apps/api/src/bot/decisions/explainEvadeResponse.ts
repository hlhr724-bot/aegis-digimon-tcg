import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import type { DecisionAnswer } from "#api/bot/decisions/DecisionAnswer";
import { getUnitDecisionValue } from "#api/bot/decisions/getUnitDecisionValue";
import type { BotProfile } from "#api/bot/profiles";
import type { BotView } from "#api/bot/view";

type Params = { view: BotView; permanentId: string; profile: BotProfile };

const ON_DELETION_PATTERN = /\[On Deletion\]/i;

export function explainEvadeResponse({ view, permanentId, profile }: Params): DecisionAnswer {
  const unit = view.board.find((entry) => entry.permanentId === permanentId);
  if (unit === undefined) {
    return {
      intent: { type: "respondEvade", permanentId, accept: true },
      basis: DecisionBasis.UNSCORED_OPTIONAL.value,
    };
  }
  const deletionPayoff = ON_DELETION_PATTERN.test(unit.definition?.effectText ?? "") ? profile.weights.activate : 0;
  const survivalValue = getUnitDecisionValue({ unit }) * profile.weights.loss;
  return {
    intent: { type: "respondEvade", permanentId, accept: survivalValue >= deletionPayoff },
    basis: DecisionBasis.SCORED.value,
  };
}
