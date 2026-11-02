import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import type { EffectContext } from "#api/engine/effects/context/effectContext";

export type TamerAsDigimonMatchParams = {
  ctx: EffectContext;
  filter: Filter;
  sourceKinds: readonly string[];
  present: ReadonlySet<string> | undefined;
};
