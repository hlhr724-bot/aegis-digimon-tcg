import { CardKind } from "@aegis/shared/schema/enums";
import { bodyValue } from "#api/bot/evaluate";
import type { BotUnit } from "#api/bot/view";

const TAMER_BASE_VALUE = 3;

type Params = { unit: BotUnit };

export function getUnitDecisionValue({ unit }: Params): number {
  const definition = unit.definition;
  if (definition !== undefined && definition.kinds.includes(CardKind.Tamer)) {
    return TAMER_BASE_VALUE + Math.max(0, definition.playCost) / 5;
  }
  return bodyValue(unit);
}
