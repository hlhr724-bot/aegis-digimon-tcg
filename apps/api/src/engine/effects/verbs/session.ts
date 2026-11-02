import type { Primitives } from "../EffectContext.js";

import type { PrimitivesContext } from "./context.js";

/**
 * Effect-resolution bookkeeping: announcing an effect, and the stack recording
 * which seat and source is resolving.
 */

export function createSessionVerbs(pc: PrimitivesContext) {
  const {
    engine,
    continuous,
    effectSeatStack,
    effectSourceKindsStack,
    effectSourcePermanentIdStack,
    effectTargetsEmittedStack,
  } = pc;

  const announceEffect: Primitives["announceEffect"] = (ctx, effect) => {
    const announced = {
      seat: ctx.source.ownerSeat,
      sourceCardId: ctx.source.cardId,
      sourceInstanceId: ctx.source.instanceId,
      sourcePermanentId: ctx.source.permanent()?.permanentId,
      effectKey: effect.effectKey,
      description: effect.description,
      ...(effect.effectTextPart !== undefined ? { effectTextPart: effect.effectTextPart } : {}),
      timing: effect.timing,
      ...(effect.beforeRemoval === true ? { beforeRemoval: true } : {}),
      ...(effect.isInherited === true ? { isInherited: true } : {}),
      ...(engine.inSecurityCheck?.() === true ? { duringSecurityCheck: true } : {}),
    };
    engine.emit({ kind: "effectTriggered", ...announced });
    return () => engine.emit({ kind: "effectResolved", ...announced });
  };
  const announceEffectOption: Primitives["announceEffectOption"] = (ctx, clause) => {
    engine.emit({
      kind: "effectOptionChosen",
      seat: ctx.source.ownerSeat,
      sourceCardId: ctx.source.cardId,
      sourceInstanceId: ctx.source.instanceId,
      sourcePermanentId: ctx.source.permanent()?.permanentId,
      timing: ctx.activeTiming,
      ...(ctx.activeEffectIsInherited === true ? { isInherited: true } : {}),
      clause,
    });
  };
  const announceEffectClauseAdvanced: Primitives["announceEffectClauseAdvanced"] = (ctx, clause) => {
    engine.emit({
      kind: "effectClauseAdvanced",
      ...(ctx.activeEffectKey !== undefined ? { effectKey: ctx.activeEffectKey } : {}),
      seat: ctx.source.ownerSeat,
      sourceCardId: ctx.source.cardId,
      sourceInstanceId: ctx.source.instanceId,
      sourcePermanentId: ctx.source.permanent()?.permanentId,
      timing: ctx.activeTiming,
      ...(ctx.activeEffectIsInherited === true ? { isInherited: true } : {}),
      clause,
    });
  };
  const enterEffectResolution: Primitives["enterEffectResolution"] = (seat, sourceKinds = [], sourcePermanentId) => {
    effectSeatStack.push(seat);
    effectSourceKindsStack.push(sourceKinds);
    effectSourcePermanentIdStack.push(sourcePermanentId);
    effectTargetsEmittedStack.push(new Set());
    engine.beginEffectBody?.();
  };
  const leaveEffectResolution: Primitives["leaveEffectResolution"] = () => {
    effectSeatStack.pop();
    effectSourceKindsStack.pop();
    effectSourcePermanentIdStack.pop();
    effectTargetsEmittedStack.pop();
    engine.finishEffectBody?.();
  };
  const resolvingEffectSourceKinds: Primitives["resolvingEffectSourceKinds"] = () => effectSourceKindsStack.at(-1);
  const restrictSecurityAddsFromEffect: Primitives["restrictSecurityAddsFromEffect"] = (
    blockedEffectSeat,
    granterSeat,
    duration,
  ) => continuous.restrictSecurityAddsFromEffect(blockedEffectSeat, granterSeat, duration);

  // DigiXros material zone expansion ledger (EX4-062 / BT19-079 / BT19-087).
  // Keep every active grant instead of replacing the previous one: separate Tamers'
  // permissions are additive, and the play-card path consumes their union. The
  // activation turn snapshot lets the read side expire finite grants even when no
  // explicit turn-sweep callback is available on the optional primitives port.
  const reactivateOnPlay: Primitives["reactivateOnPlay"] = engine.reactivateOnPlay
    ? (permanentId, opts) => engine.reactivateOnPlay!(permanentId, opts)
    : undefined;

  return {
    announceEffect,
    announceEffectOption,
    announceEffectClauseAdvanced,
    enterEffectResolution,
    leaveEffectResolution,
    resolvingEffectSourceKinds,
    restrictSecurityAddsFromEffect,
    reactivateOnPlay,
  };
}
