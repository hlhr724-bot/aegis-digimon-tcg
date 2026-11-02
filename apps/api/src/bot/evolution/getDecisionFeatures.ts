import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import type { TrainingWindow } from "#api/bot/training/policy";
import type { ObservedCard, ObservedPermanent, TrainingObservation } from "#api/bot/training/observation";

interface GetDecisionFeaturesParams {
  window: TrainingWindow;
  index: number;
  card?: ObservedCard;
  unit?: ObservedPermanent;
  sourceValue: number;
  own: TrainingObservation["players"][number];
  enemy: TrainingObservation["players"][number];
}

function getChoiceSummary(window: TrainingWindow, index: number): DecisionEffectSummary | undefined {
  const intent = window.actions[index]?.intent;
  const options = window.request?.options;
  if (intent?.type !== "respondDecision") {
    return undefined;
  }
  if (intent.response.kind === "chooseOption") {
    return options?.choiceSummaries?.[intent.response.optionIndex] ?? undefined;
  }
  if (intent.response.kind === "orderTriggers") {
    const position = options?.triggerKeys?.indexOf(intent.response.order[0] ?? "") ?? -1;
    return options?.triggerSummaries?.[position] ?? undefined;
  }
  return undefined;
}

export function getDecisionFeatures({ window, index, card, unit, sourceValue, own, enemy }: GetDecisionFeaturesParams) {
  const output = {
    selectionGain: 0,
    selectionLoss: 0,
    selectionRookie: 0,
    selectionDuplicate: 0,
    selectionNoop: 0,
    decisionMemory: 0,
    decisionDraw: 0,
    decisionRecovery: 0,
    decisionRemoval: 0,
    decisionPlay: 0,
    decisionEvolution: 0,
    decisionUnsuspend: 0,
    decisionCost: 0,
    decisionUncertain: 0,
  };
  const action = window.actions[index];
  const options = window.request?.options;
  if (action === undefined || options === undefined) {
    return output;
  }
  const intent = action.intent;
  const summary = getChoiceSummary(window, index);
  let controller = options.effectControllerSeat ?? window.observation.seat;
  if (intent.type === "respondDecision" && intent.response.kind === "orderTriggers") {
    const position = options.triggerKeys?.indexOf(intent.response.order[0] ?? "") ?? -1;
    controller = options.triggerControllerSeats?.[position] ?? controller;
  }
  const sign = controller === window.observation.seat ? 1 : -1;
  function getSignedValue(value: number): number {
    return value === 0 ? 0 : sign * value;
  }
  if (summary !== undefined) {
    output.decisionMemory = getSignedValue(summary.memoryGain);
    output.decisionDraw = getSignedValue(summary.cardsDrawn + summary.cardsReturnedFromTrash);
    output.decisionRecovery = getSignedValue(summary.cardsRecovered);
    const affectedBoard = sign === 1 ? enemy.board : own.board;
    output.decisionRemoval = getSignedValue(summary.removal * Math.min(1, affectedBoard.length));
    output.decisionPlay = getSignedValue(summary.plays);
    output.decisionEvolution = getSignedValue(summary.evolutions);
    output.decisionUnsuspend = getSignedValue(summary.unsuspends);
    output.decisionCost = getSignedValue(summary.memoryCost.maximum ?? summary.memoryCost.minimum);
    output.decisionUncertain = Number(summary.uncertain);
  }
  if (
    intent.type === "respondDecision" &&
    intent.response.kind === "chooseOption" &&
    options.digivolveCostChoice !== undefined
  ) {
    const cost = options.digivolveCostChoice.costs[intent.response.optionIndex];
    if (cost !== undefined && Number.isFinite(cost)) {
      output.decisionCost = getSignedValue(Math.max(0, cost + options.digivolveCostChoice.costDelta));
    }
  }
  if (window.kind !== "selectCards" && window.kind !== "chooseTargets") {
    return output;
  }
  if (card?.cardId === undefined && unit?.top.cardId === undefined) {
    return output;
  }
  const identity = card?.instanceId ?? unit?.top.instanceId;
  const inHand = own.hand.some((entry) => entry.instanceId === identity);
  const isEnemy =
    enemy.board.some(
      (entry) => entry === unit || entry.permanentId === action.sourceId || entry.top.instanceId === action.sourceId,
    ) || card?.ownerSeat === enemy.seat;
  const goal = options.selectionGoal;
  let direction = 0;
  if (
    options.purpose === "cost" ||
    options.assemblyCardId !== undefined ||
    options.digiXrosCardId !== undefined ||
    goal === DecisionSelectionGoal.MATERIAL.value
  ) {
    direction = isEnemy ? 1 : -1;
  } else if (goal === DecisionSelectionGoal.DISCARD.value) {
    direction = isEnemy ? 1 : -1;
  } else if (
    goal === DecisionSelectionGoal.GAIN.value ||
    goal === DecisionSelectionGoal.PLAY.value ||
    goal === DecisionSelectionGoal.EVOLVE.value
  ) {
    direction = sign;
  } else if (unit !== undefined && options.targetFate !== undefined) {
    if (options.targetFate === "unsuspend") {
      output.selectionNoop = Number(!unit.suspended);
      direction = unit.suspended ? (isEnemy ? -1 : 1) : 0;
    } else if (options.targetFate === "suspend") {
      output.selectionNoop = Number(unit.suspended);
      direction = unit.suspended ? 0 : isEnemy ? 1 : -1;
    } else if (options.targetFate === "digivolve") {
      direction = isEnemy ? -1 : 1;
    } else {
      direction = isEnemy ? 1 : -1;
    }
  }
  const value = Math.max(0, sourceValue);
  if (direction > 0) {
    output.selectionGain = value;
  } else if (direction < 0) {
    output.selectionLoss = value;
  }
  const cardId = card?.cardId ?? unit?.top.cardId;
  const copies = own.hand.filter((entry) => entry.cardId === cardId).length;
  if (
    direction !== 0 &&
    cardId !== undefined &&
    (inHand || goal === DecisionSelectionGoal.GAIN.value || goal === DecisionSelectionGoal.PLAY.value)
  ) {
    output.selectionDuplicate = -direction * Number(copies >= (inHand ? 2 : 1));
    const level = card?.level ?? unit?.top.level;
    const rookies = own.hand.filter((entry) => entry.level === 3).length;
    const hasStarter = own.board.length > 0 || own.breeding !== undefined;
    if (
      level === 3 &&
      !hasStarter &&
      rookies <= (inHand ? 1 : 0) &&
      (direction < 0 || goal === DecisionSelectionGoal.GAIN.value)
    ) {
      output.selectionRookie = direction;
    }
  }
  return output;
}
