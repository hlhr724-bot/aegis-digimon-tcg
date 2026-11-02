import type { CardDefinition, Permanent } from "@aegis/shared";
import type { EffectContext } from "../../EffectContext.js";

export function liveDigivolutionBase(ctx: EffectContext, base: Permanent): CardDefinition | undefined {
  if (!base.topCard) return undefined;
  const printed = ctx.game.definitionOf(base.topCard);
  return {
    ...printed,
    nameEn: base.originalNameOverride || printed.nameEn,
    colors: ctx.game.effectiveColors?.(base) ?? printed.colors,
  };
}
