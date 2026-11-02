import { getCardTieBreakValue } from "#api/bot/decisions/getCardTieBreakValue";
import type { BotUnit } from "#api/bot/view";

type Params = { unit: BotUnit; controllerTurn?: boolean };

export function getUnitTieBreakValue({ unit, controllerTurn = false }: Params): number {
  const readyRusher = controllerTurn && !unit.suspended && unit.keywords.includes("Rush");
  return (
    (unit.suspended ? 0 : 1) +
    unit.keywords.length * 0.05 +
    (readyRusher ? 0.02 : 0) +
    (unit.securityAttack ?? 1) * 0.07 +
    getCardTieBreakValue({ definition: unit.definition })
  );
}
