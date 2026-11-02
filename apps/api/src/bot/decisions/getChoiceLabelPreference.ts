import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { BotUnit, BotView } from "#api/bot/view";

type Params = { request: DecisionRequest; view?: BotView; index: number };

const AMOUNT_LABEL_PATTERN = /^(\d+) cards?$/;

function getAmount(label: string): number | undefined {
  const match = AMOUNT_LABEL_PATTERN.exec(label.trim());
  return match === null ? undefined : Number(match[1]);
}

function getAmountPreference({ request, index }: Params): number | undefined {
  const choices = request.options?.choices ?? [];
  const amounts = choices.map(getAmount);
  const amount = amounts[index];
  if (amount === undefined || amounts.some((entry) => entry === undefined)) {
    return undefined;
  }
  const summary = request.options?.effectSummary;
  const controller = request.options?.effectControllerSeat ?? request.seat;
  const harmsOpponent = (summary?.removal ?? 0) > 0 && controller === request.seat;
  return harmsOpponent ? amount : -amount;
}

const TOP_PATTERN = /\btop\b/i;
const BOTTOM_PATTERN = /\bbottom\b/i;
const SECURITY_PATTERN = /\bsecurity\b/i;

function getStrongestDp(units: readonly BotUnit[]): number {
  return units.reduce((strongest, unit) => Math.max(strongest, unit.dp), 0);
}

function getSecurityPlacementPreference({ request, view, index }: Params): number | undefined {
  const choices = request.options?.choices ?? [];
  const label = choices[index] ?? "";
  if (view === undefined || choices.length !== 2 || !choices.every((choice) => SECURITY_PATTERN.test(choice))) {
    return undefined;
  }
  const placedIds = new Set(request.options?.affectedPermanentIds ?? []);
  const isPlaced = (unit: BotUnit) => placedIds.has(unit.permanentId);
  const opponentCard = view.opponentBoard.find(isPlaced);
  const ownCard = view.board.find(isPlaced);
  let prefersTop: boolean;
  if (opponentCard !== undefined) {
    prefersTop = opponentCard.dp < getStrongestDp(view.board);
  } else if (ownCard !== undefined) {
    prefersTop = ownCard.dp >= getStrongestDp(view.opponentBoard);
  } else {
    return undefined;
  }
  if (TOP_PATTERN.test(label)) {
    return prefersTop ? 1 : -1;
  }
  return BOTTOM_PATTERN.test(label) && !prefersTop ? 1 : -1;
}

export function getChoiceLabelPreference(params: Params): number {
  return getAmountPreference(params) ?? getSecurityPlacementPreference(params) ?? 0;
}
