import type { TrainingWindow } from "#api/bot/training/policy";
import type { TrainingObservation } from "#api/bot/training/observation";

interface GetOptionalCostFeaturesParams {
  window: TrainingWindow;
  index: number;
  sourceValue: number;
  own: TrainingObservation["players"][number];
}

function getPositiveAmount(amount: number): number {
  return Number.isFinite(amount) ? Math.max(0, Math.min(64, amount)) : 0;
}

export function getOptionalCostFeatures({ window, index, sourceValue, own }: GetOptionalCostFeaturesParams) {
  const output = {
    paymentDraw: 0,
    paymentMemory: 0,
    paymentRecovery: 0,
    paymentCard: 0,
    paymentValue: 0,
    paymentStarter: 0,
    paymentDuplicate: 0,
  };
  const options = window.request?.options;
  const action = window.actions[index];
  const summary = options?.effectSummary;
  const benefit = options?.singleHandCostBenefit;
  if (
    window.kind !== "selectCards" ||
    window.selected.length !== 0 ||
    options?.purpose !== "cost" ||
    options.min !== 0 ||
    options.max !== 1 ||
    options.assemblyCardId !== undefined ||
    options.digiXrosCardId !== undefined ||
    options.effectControllerSeat !== window.observation.seat ||
    summary?.memoryCost.maximum !== 0 ||
    benefit === undefined ||
    action?.intent.type !== "respondDecision" ||
    action.intent.response.kind !== "selectCards" ||
    action.intent.response.instanceIds.length !== 1
  ) {
    return output;
  }
  const card = own.hand.find((entry) => entry.instanceId === action.sourceId);
  if (card?.cardId === undefined || action.intent.response.instanceIds[0] !== card.instanceId) {
    return output;
  }
  const available = Math.max(0, own.deckCount);
  if (benefit.cardsDrawn > 0 && benefit.cardsRecovered > 0 && benefit.cardsDrawn + benefit.cardsRecovered > available) {
    return output;
  }
  const draw = Math.min(available, getPositiveAmount(benefit.cardsDrawn));
  const recovery = Math.min(available, getPositiveAmount(benefit.cardsRecovered));
  const memory = window.observation.seat === 0 ? window.observation.memory : -window.observation.memory;
  const memoryGain = Math.min(Math.max(0, 10 - memory), getPositiveAmount(benefit.memoryGain));
  if (draw + recovery + memoryGain === 0) {
    return output;
  }
  output.paymentDraw = draw;
  output.paymentRecovery = recovery;
  output.paymentMemory = memoryGain;
  output.paymentCard = 1;
  output.paymentValue = Number.isFinite(sourceValue) ? Math.max(0, Math.min(100, sourceValue)) : 0;
  output.paymentDuplicate = Number(own.hand.filter((entry) => entry.cardId === card.cardId).length > 1);
  const hasStartingLine = own.board.some((unit) => (unit.top.level ?? 0) >= 3) || (own.breeding?.top.level ?? 0) >= 3;
  output.paymentStarter = Number(
    card.level === 3 && !hasStartingLine && own.hand.filter((entry) => entry.level === 3).length === 1,
  );
  return output;
}
