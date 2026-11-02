import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { Intent } from "@aegis/shared/protocol/intents";
import { getDecisionCandidateSignature } from "#api/bot/decisions/getDecisionCandidateSignature";
import type { BotView } from "#api/bot/view";

type Params = { view: BotView | undefined; request: DecisionRequest; intent: Intent };

const DELAYED_COPY_PATTERN = /#\d+/g;
const WORD_PATTERN = /[a-z0-9]+/g;

function getWordBag(text: string | undefined): string | null {
  if (text === undefined) {
    return null;
  }
  return (text.replace(DELAYED_COPY_PATTERN, "").toLowerCase().match(WORD_PATTERN) ?? []).sort().join(" ");
}

function describeChoice(request: DecisionRequest, index: number): string {
  const options = request.options;
  return JSON.stringify([
    options?.choices?.[index],
    options?.choiceSummaries?.[index] ?? null,
    options?.digivolveCostChoice?.costs[index] ?? null,
    options?.choiceEffects?.[index] ?? null,
    options?.choiceClauses?.[index] ?? null,
  ]);
}

function describeTrigger(request: DecisionRequest, key: string): string {
  const options = request.options;
  const index = options?.triggerKeys?.indexOf(key) ?? -1;
  return JSON.stringify([
    options?.triggerTimings?.[index] ?? null,
    getWordBag(options?.triggerDescriptions?.[index]) || (options?.triggerCardIds?.[index] ?? null),
    options?.triggerReasons?.[index] ?? null,
    options?.triggerSummaries?.[index] ?? null,
    options?.triggerIsInherited?.[index] ?? null,
    options?.triggerControllerSeats?.[index] ?? null,
  ]);
}

export function getDecisionAnswerSignature({ view, request, intent }: Params): string {
  if (intent.type !== "respondDecision") {
    return JSON.stringify(intent);
  }
  const response = intent.response;
  const candidate = (instanceId: string) => getDecisionCandidateSignature({ view, request, instanceId });
  switch (response.kind) {
    case "selectCards":
    case "chooseTargets":
      return JSON.stringify(response.instanceIds.map(candidate).sort());
    case "orderCards":
      return JSON.stringify(response.order.map(candidate));
    case "chooseOption":
      return describeChoice(request, response.optionIndex);
    case "orderTriggers":
      return JSON.stringify(response.order.map((key) => describeTrigger(request, key)));
    default:
      return JSON.stringify(response);
  }
}
