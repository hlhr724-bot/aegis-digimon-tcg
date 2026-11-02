import type { CardDefinition } from "@aegis/shared/cards/types";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { type DefinitionFacts, definitionMatches } from "#api/engine/effects/interpreter/matching/definition";
import { permanentMatchesFilter } from "#api/engine/effects/interpreter/matching/permanent";
import type { CostModifierMatchParams } from "#api/engine/effects/interpreter/costModifiers/CostModifierMatchParams";

export function createEvoCostMatch({
  ctx,
  action,
  filter,
  selfRef,
  setMode,
}: CostModifierMatchParams): (m: { target: Permanent; into?: CardDefinition }) => boolean {
  const selfCardId = ctx.source.cardId;
  return (m) => {
    if (action.restriction === "suspendThisTamer") {
      const tamer = ctx.source.permanent();
      if (tamer === undefined || tamer.isSuspended || tamer.inBreeding) return false;
    }
    if (selfRef) {
      const self = ctx.source.permanent();
      if (self === undefined) {
        if (m.into === undefined || m.into.cardId !== selfCardId) return false;
        if (m.target.controllerSeat !== ctx.source.ownerSeat) return false;
        if (m.target.inBreeding && !setMode) return false;
        if (
          action.sourceFilter !== undefined &&
          !permanentMatchesFilter(ctx, m.target, action.sourceFilter, ctx.source)
        ) {
          return false;
        }
        return true;
      }
      if (self.permanentId !== m.target.permanentId) return false;
      if (action.into !== undefined) {
        if (m.into === undefined) return false;
        if (!definitionMatches(action.into, m.into as unknown as DefinitionFacts)) return false;
      }
      return true;
    }
    if (action.into !== undefined) {
      if (m.into === undefined) return false;
      if (!definitionMatches(action.into, m.into as unknown as DefinitionFacts)) return false;
    }
    return permanentMatchesFilter(ctx, m.target, filter, ctx.source);
  };
}
