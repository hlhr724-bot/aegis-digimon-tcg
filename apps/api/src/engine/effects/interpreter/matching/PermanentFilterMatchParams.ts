import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import type { EffectContext } from "#api/engine/effects/context/effectContext";

export type PermanentFilterMatchParams = {
  ctx: EffectContext;
  filter: Filter | undefined;
  sourceKinds: readonly string[] | undefined;
};
