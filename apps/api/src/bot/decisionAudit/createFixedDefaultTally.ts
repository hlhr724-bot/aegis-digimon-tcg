import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import type { DecisionAnswerObservation } from "#api/bot/decisions/DecisionAnswerObservation";
import { isFixedDefaultBasis } from "#api/bot/decisions/isFixedDefaultBasis";
import { getDecisionAnswerSignature } from "#api/bot/decisionAudit/getDecisionAnswerSignature";
import { reverseDecisionRequest } from "#api/bot/decisionAudit/reverseDecisionRequest";
import type { FixedDefaultExample, FixedDefaultTally } from "#api/bot/decisionAudit/FixedDefaultTally";

type Params = { maximumExamples?: number };

const ORDER_SENSITIVE_KINDS: ReadonlySet<string> = new Set([
  "selectCards",
  "chooseTargets",
  "orderCards",
  "orderTriggers",
  "chooseOption",
]);
const EXAMPLE_TEXT_LIMIT = 200;

type Classification = { basis: DecisionBasis; example: FixedDefaultExample };

function classify(observation: DecisionAnswerObservation): Classification {
  if (!("request" in observation)) {
    return { basis: observation.answer.basis, example: { sourceCardId: observation.sourceCardId } };
  }
  const { view, request, answer } = observation;
  const forward = getDecisionAnswerSignature({ view, request, intent: answer.intent });
  const example: FixedDefaultExample = {
    sourceCardId: request.sourceCardId,
    promptText: request.promptText.slice(0, EXAMPLE_TEXT_LIMIT),
    effectText: (request.options?.effectTextPart ?? request.options?.effectText)?.slice(0, EXAMPLE_TEXT_LIMIT),
    selectionGoal: request.options?.selectionGoal,
    purpose: request.options?.purpose,
    effectSummary: request.options?.effectSummary,
    answer: forward,
  };
  if (isFixedDefaultBasis(answer.basis) || !ORDER_SENSITIVE_KINDS.has(request.kind)) {
    return { basis: answer.basis, example };
  }
  const reversed = reverseDecisionRequest(request);
  const backward = getDecisionAnswerSignature({
    view,
    request: reversed,
    intent: observation.answerRequest(reversed).intent,
  });
  if (forward === backward) {
    return { basis: answer.basis, example };
  }
  return { basis: DecisionBasis.TIE_BY_ORDER.value, example: { ...example, reversedAnswer: backward } };
}

export function createFixedDefaultTally({ maximumExamples = 3 }: Params = {}) {
  const tally: FixedDefaultTally = { decisions: {}, nontrivialDecisions: 0, fixedDefaults: 0, buckets: {} };
  function observe(observation: DecisionAnswerObservation): void {
    const { basis, example } = classify(observation);
    const key = `${observation.kind}:${basis}`;
    tally.decisions[key] = (tally.decisions[key] ?? 0) + 1;
    if (observation.kind !== "mulligan" && basis !== DecisionBasis.FORCED.value) {
      tally.nontrivialDecisions += 1;
    }
    if (!isFixedDefaultBasis(basis)) {
      return;
    }
    tally.fixedDefaults += 1;
    const bucket = (tally.buckets[key] ??= { count: 0, cards: {}, examples: [] });
    bucket.count += 1;
    const cardId = example.sourceCardId ?? "unknown";
    bucket.cards[cardId] = (bucket.cards[cardId] ?? 0) + 1;
    if (bucket.examples.length < maximumExamples) {
      bucket.examples.push(example);
    }
  }
  return { observe, report: (): FixedDefaultTally => tally };
}
