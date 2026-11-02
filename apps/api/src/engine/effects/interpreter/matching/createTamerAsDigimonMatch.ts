import type { CardDefinition } from "@aegis/shared/cards/types";
import { isPermanentUnaffectable, permanentMatchesFilterAs } from "#api/engine/effects/interpreter/matching/permanent";
import type { TamerAsDigimonMatchParams } from "#api/engine/effects/interpreter/matching/TamerAsDigimonMatchParams";

export function createTamerAsDigimonMatch({
  ctx,
  filter,
  sourceKinds,
  present,
}: TamerAsDigimonMatchParams): (permanentId: string, asDigimon: CardDefinition) => boolean {
  return (permanentId, asDigimon) => {
    const permanent = ctx.game.permanentById(permanentId);
    return (
      permanent !== undefined &&
      (present === undefined || present.has(permanentId)) &&
      permanentMatchesFilterAs(ctx, permanent, filter, ctx.source, asDigimon) &&
      !isPermanentUnaffectable(ctx, ctx.source, permanent, sourceKinds)
    );
  };
}
