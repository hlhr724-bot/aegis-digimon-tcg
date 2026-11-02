import type { CostModifierMatchParams } from "#api/engine/effects/interpreter/costModifiers/CostModifierMatchParams";

export function createSuspendTamerConsume({ ctx }: CostModifierMatchParams): () => void {
  return () => {
    const tamer = ctx.source.permanent();
    if (tamer !== undefined) ctx.fx.payActivationCost?.(tamer.permanentId, "suspend");
  };
}
