import { EffectActivationCallbackKind } from "#api/engine/effects/EffectActivationCallbackKind";
import type { EffectContext } from "./EffectContext.js";

/**
 * A pending optional clause is explained by its decision. Public effect narration starts
 * only when processing is accepted, before its costs or results mutate the board. Context
 * copies retain the callback, so a compiled action and its enclosing clause share one receipt.
 */
export function observeEffectActivation(ctx: EffectContext, deferred: boolean, announce: () => void) {
  const outer = ctx.onActivationChosen;
  const outerPending = ctx.isActivationPending;
  let accepted = false;
  const isPending = () => !accepted;
  const accept = () => {
    if (accepted) {
      return;
    }
    accepted = true;
    ctx.game?.runtimeCallbacks?.track({
      callback: accept,
      key: EffectActivationCallbackKind.ACCEPTED.value,
      payload: null,
    });
    ctx.game?.runtimeCallbacks?.track({
      callback: isPending,
      key: EffectActivationCallbackKind.NOT_PENDING.value,
      payload: null,
    });
    announce();
  };
  ctx.onActivationChosen = accept;
  ctx.isActivationPending = isPending;
  if (!deferred) accept();
  return {
    accept,
    accepted: () => accepted,
    restore: () => {
      ctx.onActivationChosen = outer;
      ctx.isActivationPending = outerPending;
    },
  };
}
