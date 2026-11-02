import { CardKind, EffectDuration, requireCardDefinition, type Permanent } from "@aegis/shared";
import type { EvoCostMatch } from "../modifiers.js";
import type { Primitives } from "../EffectContext.js";
import { normalizeCost } from "../verbs/cardPlacement.js";
import { looseZoneOfInstance, ownerSeatOfLoose, peekLooseInstance } from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";
import { emitEffectTargetsSelected } from "./emitEffectTargetsSelected.js";

/**
 * DP, keywords and cost adjustments held for a duration.
 */

/** CR 4-3-1: a Digi-Egg on the field is a Digimon, so only other kinds need a treatment. */
function isNativeDigimon(permanent: Permanent): boolean {
  const kinds = requireCardDefinition(permanent.topCard.cardId).kinds;
  return kinds.includes(CardKind.Digimon) || kinds.includes(CardKind.DigiEgg);
}

export function createStatsVerbs(pc: PrimitivesContext) {
  const { engine, access, continuousOpt, durationForTarget, effectSeatStack, effectSourceKindsStack, ledger, state } =
    pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const effectDrivenPlayCost: PrimitivesContext["helpers"]["effectDrivenPlayCost"] = (...args) =>
    pc.helpers.effectDrivenPlayCost(...args);
  const modifyDP: Primitives["modifyDP"] = (permanentId, delta, duration, opts): void => {
    const before = access.permanentById(permanentId);
    if (before === undefined) return; // no such battle-area permanent; nothing to buff
    // "DP can't be reduced" (§15-1-3) gates negative deltas only. The ledger suppresses a
    // reduction while `dpImmune` holds rather than dropping it, so it applies for the rest
    // of its duration once the protection ends.
    const byOpponentEffect = pc.helpers.isOpponentEffectAgainst(permanentId);
    if (opts?.continuous !== true && (opts?.continuous === false || continuousOpt() === undefined)) {
      emitEffectTargetsSelected({ pc, permanentIds: [permanentId] });
    }
    ledger.addDpModifier(state, permanentId, delta, durationForTarget(permanentId, duration), {
      byOpponentEffect,
      ...(opts?.continuous === undefined ? continuousOpt() : { continuous: opts.continuous }),
      ...(opts?.sourceInstanceId !== undefined ? { sourceInstanceId: opts.sourceInstanceId } : {}),
      ...((opts?.sourceSeat ?? effectSeatStack.at(-1)) !== undefined
        ? { sourceSeat: opts?.sourceSeat ?? effectSeatStack.at(-1) }
        : {}),
      ...((opts?.sourceKinds ?? effectSourceKindsStack.at(-1)) !== undefined
        ? { sourceKinds: opts?.sourceKinds ?? effectSourceKindsStack.at(-1) }
        : {}),
      ...(opts?.skipsCurrentOpponentTurnEnd === true ? { skipsCurrentOpponentTurnEnd: true } : {}),
    });
    // currentDP was recomputed by the ledger; no dedicated ServerEvent in the
    // protocol for a DP change — the schema delta (currentDP) is the source of truth.
  };

  const modifyPlayerDP: Primitives["modifyPlayerDP"] = (seat, delta, duration, opts): void => {
    ledger.addPlayerDpModifier(state, seat, delta, duration, {
      ...opts,
      ...((opts?.sourceSeat ?? effectSeatStack.at(-1)) !== undefined
        ? { sourceSeat: opts?.sourceSeat ?? effectSeatStack.at(-1) }
        : {}),
      ...((opts?.sourceKinds ?? effectSourceKindsStack.at(-1)) !== undefined
        ? { sourceKinds: opts?.sourceKinds ?? effectSourceKindsStack.at(-1) }
        : {}),
    });
  };

  const setBaseDP = (permanentId: string, value: number, duration: EffectDuration): void => {
    const before = access.permanentById(permanentId);
    if (before === undefined) return; // no such battle-area permanent; nothing to override
    // Changing original DP is an effect that changes information (§15-12-2-1), not a -N DP
    // reduction (§2-5-3), so "DP can't be reduced" (`dpImmune`) does not block it.
    ledger.addBaseDpOverride(state, permanentId, value, durationForTarget(permanentId, duration), {
      ...continuousOpt(),
      ...(effectSeatStack.at(-1) === undefined ? {} : { sourceSeat: effectSeatStack.at(-1) }),
      ...(effectSourceKindsStack.at(-1) === undefined ? {} : { sourceKinds: effectSourceKindsStack.at(-1) }),
      ...(isNativeDigimon(before) ? {} : { treatsAsDigimon: true }),
    });
    // currentDP was recomputed by the ledger (override replaces base, deltas sum on top).
  };

  const grantPierce: Primitives["grantPierce"] = (permanentId, duration, opts): void => {
    ledger.addPierceGrant(permanentId, durationForTarget(permanentId, duration), {
      ...(opts?.continuous === true ? { continuous: true } : continuousOpt()),
      durationOwnerSeat: access.permanentById(permanentId)?.controllerSeat,
    });
  };

  const changeEvoCost = (
    filter: (m: EvoCostMatch) => boolean,
    delta: number,
    opts?: {
      setFixed?: boolean;
      once?: boolean;
      continuous?: boolean;
      onConsume?: (match: EvoCostMatch) => void;
      intrinsicCardId?: string;
      intrinsicEffectKey?: object;
    },
  ): void => {
    ledger.addEvoCostAdjustment(filter, delta, opts?.setFixed ?? false, {
      ...(opts?.continuous !== undefined ? { continuous: opts.continuous } : (continuousOpt() ?? {})),
      once: opts?.once,
      onConsume: opts?.onConsume,
      intrinsicCardId: opts?.intrinsicCardId,
      intrinsicEffectKey: opts?.intrinsicEffectKey,
    });
  };

  const changePlayCost: Primitives["changePlayCost"] = (filter, delta, opts) => {
    ledger.addPlayCostAdjustment(filter, delta, opts?.setFixed ?? false, {
      ...(opts?.continuous !== undefined ? { continuous: opts.continuous } : (continuousOpt() ?? {})),
      intrinsicCardId: opts?.intrinsicCardId,
      intrinsicEffectKey: opts?.intrinsicEffectKey,
    });
  };

  /**
   * Resolve the cost of an effect-driven paid play through the same modifier ledger as a
   * normal play. Card-text reductions such as "with the play cost reduced by 5" and
   * DigiXros reductions are additional reductions after SET-cost effects and therefore
   * stack with active self/field reducers. A "play costs can't be reduced" restriction
   * suppresses those explicit reductions just as it suppresses ledger reductions.
   */
  const canAffordEffectPlay: NonNullable<Primitives["canAffordEffectPlay"]> = async (instanceId, opts) => {
    const ownerSeat = ownerSeatOfLoose(state, instanceId);
    const instance = peekLooseInstance(state, instanceId);
    if (ownerSeat === undefined || instance === undefined) return false;
    const definition = requireCardDefinition(instance.cardId);
    const controllerSeat = opts?.controllerSeat ?? ownerSeat;
    const originZone = looseZoneOfInstance(state, instanceId);
    const cost = await effectDrivenPlayCost(
      instanceId,
      definition,
      controllerSeat,
      opts?.costDelta,
      opts?.useAsOption,
      undefined,
      originZone,
      true,
    );
    // Pending effects finish resolving before the turn ends (CR §6-1-4-1). That includes a
    // paid Option use started by the resolving effect after the enclosing action crossed the
    // gauge; affordability is the remaining distance to the gauge limit, just like an
    // effect-driven Digimon play.
    return cost >= 0 && cost <= engine.memory.maxCostFor(controllerSeat);
  };

  const effectivePlayCost: NonNullable<Primitives["effectivePlayCost"]> = (permanent) => {
    const definition = requireCardDefinition(permanent.topCard.cardId);
    return ledger.playCostFor(
      { def: definition, controllerSeat: permanent.controllerSeat, permanentId: permanent.permanentId },
      normalizeCost(definition.playCost),
    );
  };

  const effectiveLooseUseCost: NonNullable<Primitives["effectiveLooseUseCost"]> = (instanceId, controllerSeat) => {
    const projected = engine.effectiveLooseUseCost?.(instanceId, controllerSeat);
    if (projected !== undefined) return projected;
    const instance = peekLooseInstance(state, instanceId);
    if (instance === undefined) return undefined;
    const definition = requireCardDefinition(instance.cardId);
    return ledger.playCostFor({ def: definition, controllerSeat }, normalizeCost(definition.playCost));
  };

  const inHandCost: NonNullable<Primitives["inHandCost"]> = (instanceId, controllerSeat) =>
    engine.inHandCost?.(instanceId, controllerSeat);

  return {
    modifyDP,
    modifyPlayerDP,
    setBaseDP,
    grantPierce,
    changeEvoCost,
    changePlayCost,
    canAffordEffectPlay,
    effectivePlayCost,
    effectiveLooseUseCost,
    inHandCost,
  };
}
