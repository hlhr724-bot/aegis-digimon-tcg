import { isPermanentUnaffectable, permanentMatchesFilter } from "#api/engine/effects/interpreter/matching/permanent";
import type { PermanentFilterMatchParams } from "#api/engine/effects/interpreter/matching/PermanentFilterMatchParams";

export function createPermanentFilterMatch({
  ctx,
  filter,
  sourceKinds,
}: PermanentFilterMatchParams): (permanentId: string) => boolean {
  return (permanentId) => {
    const permanent = ctx.game.permanentById(permanentId);
    return (
      permanent !== undefined &&
      (filter === undefined || permanentMatchesFilter(ctx, permanent, filter, ctx.source)) &&
      (sourceKinds === undefined || !isPermanentUnaffectable(ctx, ctx.source, permanent, sourceKinds))
    );
  };
}
