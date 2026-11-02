import type { EffectContext } from "#api/engine/effects/context/effectContext";
import { effectProvenanceKinds } from "#api/engine/effects/effectProvenance";

type Params<T> = {
  ctx: EffectContext;
  subCtx: EffectContext;
  decodeText: string | undefined;
  body: () => Promise<T>;
};

export async function runWithReplacementSource<T>({ ctx, subCtx, decodeText, body }: Params<T>): Promise<T> {
  const previousTiming = subCtx.activeTiming;
  const previousText = subCtx.activeEffectText;
  if (decodeText !== undefined) {
    subCtx.activeTiming = "AllTurns";
    subCtx.activeEffectText = decodeText;
  } else {
    subCtx.activeTiming ??= ctx.activeTiming;
    subCtx.activeEffectText ??= ctx.activeEffectText;
  }
  subCtx.fx.enterEffectResolution?.(
    subCtx.source.ownerSeat,
    effectProvenanceKinds(subCtx),
    subCtx.source.permanent()?.permanentId,
  );
  try {
    return await body();
  } finally {
    subCtx.activeTiming = previousTiming;
    subCtx.activeEffectText = previousText;
    subCtx.fx.leaveEffectResolution?.();
  }
}
