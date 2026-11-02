import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { ScopedPrimitiveKind } from "#api/engine/effects/scopes/ScopedPrimitiveKind";

export type ScopedPrimitiveParams = {
  ctx: EffectContext;
  kind: ScopedPrimitiveKind;
  autoKey?: string;
  maxPerTurn?: number;
};
