import type { CardDefinition } from "@aegis/shared/cards/types";
import type { Seat } from "@aegis/shared/schema/enums";
import { type DefinitionFacts, definitionMatches } from "#api/engine/effects/interpreter/matching/definition";
import type { CostModifierMatchParams } from "#api/engine/effects/interpreter/costModifiers/CostModifierMatchParams";

export function createPlayCostDefinitionMatch({
  ctx,
  filter,
  selfRef,
  seats,
}: CostModifierMatchParams): (facts: { def: CardDefinition; controllerSeat: Seat }) => boolean {
  const selfCardId = ctx.source.cardId;
  return (facts) => {
    if (!seats.includes(facts.controllerSeat)) return false;
    if (selfRef) {
      return facts.controllerSeat === ctx.source.ownerSeat && facts.def.cardId === selfCardId;
    }
    return definitionMatches(filter, facts.def as unknown as DefinitionFacts);
  };
}
