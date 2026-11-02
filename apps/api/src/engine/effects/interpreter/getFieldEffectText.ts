import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { EffectContext } from "#api/engine/effects/context/effectContext";

type Params = {
  action: Action;
  ctx: EffectContext;
};

export function getFieldEffectText({ action, ctx }: Params): string | undefined {
  const effectTextPart = "effectTextPart" in action ? action.effectTextPart : undefined;
  const raw = "raw" in action ? action.raw : undefined;
  return effectTextPart ?? ctx.activeEffectText ?? raw ?? ctx.source.definition.effectText;
}
