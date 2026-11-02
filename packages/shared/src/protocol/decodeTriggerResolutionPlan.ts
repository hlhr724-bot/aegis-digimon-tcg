import type { OrderTriggersResponse } from "#shared/protocol/intents";

type Params = {
  response: OrderTriggersResponse;
  triggerKeys: readonly string[];
  supportsIndexes: boolean;
};

export function decodeTriggerResolutionPlan({
  response,
  triggerKeys,
  supportsIndexes,
}: Params): OrderTriggersResponse | undefined {
  if (response.orderIndexes === undefined && response.optionalAnswersByIndex === undefined) {
    if (!Array.isArray(response.order) || response.order.some((key) => typeof key !== "string")) {
      return undefined;
    }
    return response;
  }
  if (
    !supportsIndexes ||
    !Array.isArray(response.order) ||
    response.order.length !== 0 ||
    response.optionalAnswers !== undefined ||
    !Array.isArray(response.orderIndexes)
  ) {
    return undefined;
  }
  const indexes = response.orderIndexes;
  if (
    indexes.length === 0 ||
    indexes.length > triggerKeys.length ||
    new Set(indexes).size !== indexes.length ||
    indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= triggerKeys.length)
  ) {
    return undefined;
  }
  const answers = response.optionalAnswersByIndex;
  if (
    answers !== undefined &&
    (!Array.isArray(answers) ||
      answers.length > triggerKeys.length ||
      answers.some((answer) => answer !== null && typeof answer !== "boolean"))
  ) {
    return undefined;
  }
  return {
    kind: "orderTriggers",
    order: indexes.map((index) => triggerKeys[index]!),
    ...(answers === undefined
      ? {}
      : {
          optionalAnswers: Object.fromEntries(
            answers.flatMap((answer, index) => (typeof answer === "boolean" ? [[triggerKeys[index]!, answer]] : [])),
          ),
        }),
  };
}
