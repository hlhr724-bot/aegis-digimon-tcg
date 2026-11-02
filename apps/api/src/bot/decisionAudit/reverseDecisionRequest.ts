import type { DecisionRequest } from "@aegis/shared/protocol/events";

type Options = NonNullable<DecisionRequest["options"]>;

function reverse<Value>(values: readonly Value[] | undefined): Value[] | undefined {
  return values === undefined ? undefined : [...values].reverse();
}

function reverseChoiceOptions(options: Options): Options {
  const count = options.choices?.length ?? 0;
  return {
    ...options,
    choices: reverse(options.choices),
    choiceSummaries: reverse(options.choiceSummaries),
    choiceEffects: reverse(options.choiceEffects),
    choiceClauses: reverse(options.choiceClauses),
    ...(options.digivolveCostChoice === undefined
      ? {}
      : {
          digivolveCostChoice: {
            ...options.digivolveCostChoice,
            costs: [...options.digivolveCostChoice.costs].reverse(),
          },
        }),
    ...(options.declineIndex === undefined ? {} : { declineIndex: count - 1 - options.declineIndex }),
  };
}

function reverseTriggerOptions(options: Options): Options {
  return {
    ...options,
    triggerKeys: reverse(options.triggerKeys),
    triggerSummaries: reverse(options.triggerSummaries),
    triggerControllerSeats: reverse(options.triggerControllerSeats),
    triggerCardIds: reverse(options.triggerCardIds),
    triggerTimings: reverse(options.triggerTimings),
    triggerDescriptions: reverse(options.triggerDescriptions),
    triggerReasons: reverse(options.triggerReasons),
    triggerIsInherited: reverse(options.triggerIsInherited),
    triggerIsOptional: reverse(options.triggerIsOptional),
  };
}

function reverseCandidateOptions(options: Options): Options {
  return {
    ...options,
    candidateInstanceIds: reverse(options.candidateInstanceIds),
    visibleInstanceIds: reverse(options.visibleInstanceIds),
    visibleCards: reverse(options.visibleCards),
    allowedTargetCombinations: options.allowedTargetCombinations
      ?.map((combination) => [...combination].reverse())
      .reverse(),
  };
}

export function reverseDecisionRequest(request: DecisionRequest): DecisionRequest {
  const options = request.options;
  if (options === undefined) {
    return request;
  }
  if (request.kind === "chooseOption") {
    return { ...request, options: reverseChoiceOptions(options) };
  }
  if (request.kind === "orderTriggers") {
    return { ...request, options: reverseTriggerOptions(options) };
  }
  return { ...request, options: reverseCandidateOptions(options) };
}
