import { Phase, EffectTiming, type Seat } from "@aegis/shared";
import type { Primitives } from "../EffectContext.js";

import type { PrimitivesContext } from "./context.js";
import { emitEffectTargetsSelected } from "./emitEffectTargetsSelected.js";

/**
 * Suspending and unsuspending permanents.
 */

export function createSuspendVerbs(pc: PrimitivesContext) {
  const { engine, access, continuous, player, state } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const isRestricted: PrimitivesContext["helpers"]["isRestricted"] = (...args) => pc.helpers.isRestricted(...args);
  const trash: Primitives["trash"] = (...args) => pc.fx.trash(...args);

  /**
   * Report the orientation change the way the Active phase reports its own sweep. The state
   * patch alone leaves the client guessing WHEN a permanent turned: its board is frozen while
   * a phase ribbon is up, and without a move to release the hold a permanent suspended (or
   * unsuspended) by an effect stays rotated on screen until the hold lifts a phase later.
   */
  function emitSuspensionMoves(permanentIds: readonly string[]): void {
    for (const permanentId of permanentIds) {
      engine.emit?.({ kind: "cardsMoved", instanceIds: [permanentId], from: "unsuspended", to: "suspended" });
    }
  }

  async function fireSuspensionTriggers(
    permanentIds: string[],
    opts?: { byEffectSeat?: Seat; byEffectCardId?: string; suppressWhenEffectSuspends?: boolean },
  ): Promise<void> {
    const firstPermanentId = permanentIds[0];
    if (firstPermanentId === undefined) return;
    const simultaneousTrigger = {
      subjectPermanentId: firstPermanentId,
      ...(permanentIds.length > 1 ? { subjectPermanentIds: permanentIds } : {}),
      suspendedPermanentId: firstPermanentId,
      ...(opts?.byEffectSeat !== undefined ? { effectSuspendSeat: opts.byEffectSeat } : {}),
      ...(opts?.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
    };
    // One action that suspends multiple permanents creates one simultaneous timing, not one
    // timing per card (BT2-041 Q1015 / BT4-084 Q1230). Carry every subject so filtered watchers
    // can match any relevant member while activating only once for the shared timing.
    await engine.fireTiming?.(EffectTiming.OnTappedAnyone, {
      suspendedPermanentId: firstPermanentId,
      ...(permanentIds.length > 1 ? { subjectPermanentId: firstPermanentId, subjectPermanentIds: permanentIds } : {}),
    });
    await engine.fireSubTrigger?.("whenSuspended", simultaneousTrigger);
    if (opts?.suppressWhenEffectSuspends !== true) {
      await engine.fireSubTrigger?.("whenEffectSuspends", {
        ...simultaneousTrigger,
        ...(opts?.byEffectSeat !== undefined ? { effectSuspendSeat: opts.byEffectSeat } : {}),
        ...(opts?.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
      });
    }
  }

  const canSuspend: NonNullable<Primitives["canSuspend"]> = (permanentId: string, effectSeat?: Seat): boolean => {
    const permanent = access.permanentById(permanentId);
    if (permanent === undefined) return false;
    // Only an actual unsuspended -> suspended TRANSITION counts as "becoming suspended":
    // suspending an already-suspended permanent "isn't considered to be suspended by the
    // effect" (KB ST18-10), so it opens no OnTappedAnyone / whenSuspended window. Gating
    // here is also what terminates a "when an opponent becomes suspended, suspend 1 of
    // their Digimon" loop (BT13-057 Rosemon) once every opponent is already suspended.
    if (permanent.isSuspended) return false;
    // A continuous "can't BE suspended" restriction (BT19-101, LM-041) blocks
    // effect-driven suspension only. This primitive IS the effect-suspend seam
    // (combat self-suspend to attack calls access.suspend directly and never routes
    // here — KB BT19-101 Q3185: a "can't be suspended" Digimon may still attack via
    // <Overclock>). The restricted permanent stays unsuspended and opens no
    // whenSuspended/OnTappedAnyone window.
    return !isRestricted(permanentId, "beSuspended", effectSeat);
  };

  async function suspend(
    permanentIds: string[],
    opts?: {
      byEffectSeat?: Seat;
      byEffectCardId?: string;
      deferTriggers?: boolean;
      suppressWhenEffectSuspends?: boolean;
    },
  ): Promise<string[]> {
    const suspendedPermanentIds: string[] = [];
    for (const permanentId of permanentIds) {
      if (!canSuspend(permanentId, opts?.byEffectSeat)) continue;
      suspendedPermanentIds.push(permanentId);
    }
    emitEffectTargetsSelected({ pc, permanentIds: suspendedPermanentIds });
    for (const permanentId of suspendedPermanentIds) {
      access.suspend(access.permanentById(permanentId)!);
    }
    emitSuspensionMoves(suspendedPermanentIds);
    if (opts?.deferTriggers !== true) await fireSuspensionTriggers(suspendedPermanentIds, opts);
    return suspendedPermanentIds;
  }

  /**
   * Pay an activation cost by suspending a permanent (BeforePayCost / activateClass1
   * pattern, HARD-05). Explicit parameters — NEVER reads ctx.source.permanent().
   * Validates the permanent is unsuspended, on the battle area, and affectable.
   */
  const canPayActivationCost: NonNullable<Primitives["canPayActivationCost"]> = (
    permanentId: string,
    costKind: "suspend",
  ): boolean => {
    if (costKind !== "suspend") return false;
    const permanent = access.permanentById(permanentId);
    if (permanent === undefined) return false; // not on field
    if (permanent.isSuspended) return false; // already suspended
    if (permanent.inBreeding) return false; // breeding-area permanents can't suspend this way
    if (continuous.hasRestriction(permanentId, "beSuspended")) return false;
    // Check affectability (CanNotBeAffected): gate on beAffected restriction.
    // Unqualified call (no sourceKind): this low-level primitive receives no context
    // about what card is applying the cost, so source-kind-qualified entries (fromSourceKind)
    // do not block here. That is intentional: suspend-as-cost is a controller-side cost
    // verb, not the core opponent-Digimon-effect targeting path.
    if (continuous.hasRestriction(permanentId, "beAffected")) return false;
    return true;
  };
  const payActivationCost: NonNullable<Primitives["payActivationCost"]> = (permanentId, costKind): boolean => {
    if (!canPayActivationCost(permanentId, costKind)) return false;
    access.suspend(access.permanentById(permanentId)!);
    emitSuspensionMoves([permanentId]);
    return true;
  };

  const canUnsuspend: NonNullable<Primitives["canUnsuspend"]> = (permanentId: string, effectSeat?: Seat): boolean => {
    const permanent = access.permanentById(permanentId);
    if (permanent === undefined) return false;
    // Only an actual suspended -> unsuspended TRANSITION counts as "becoming unsuspended"
    // (mirrors `suspend`'s own-transition gate above): unsuspending an already-unsuspended
    // permanent opens no whenUnsuspended window.
    if (!permanent.isSuspended) return false;
    // "Can't unsuspend" is not limited to the Active phase. Effect-driven unsuspension
    // routes through this primitive, so enforce the same continuous restriction here too
    // (Samādhi Śānti and the wider freeze family). Active-phase code keeps its earlier
    // filter to report an accurate list of permanents that changed orientation.
    if (
      isRestricted(permanentId, "unsuspend", effectSeat) ||
      (state.phase === Phase.Active &&
        (isRestricted(permanentId, "unsuspendDuringUnsuspendPhase", effectSeat) ||
          (state.turnSeat === permanent.controllerSeat &&
            isRestricted(permanentId, "unsuspendDuringOwnUnsuspendPhase", effectSeat))))
    )
      return false;
    const handTrashCost = continuous.restrictionCount(permanentId, "unsuspendHandTrashCost");
    return player(permanent.controllerSeat).hand.length >= handTrashCost;
  };

  const unsuspend: Primitives["unsuspend"] = async (permanentIds: string[]): Promise<void> => {
    for (const permanentId of permanentIds) {
      if (!canUnsuspend(permanentId)) continue;
      const permanent = access.permanentById(permanentId)!;
      const handTrashCost = continuous.restrictionCount(permanentId, "unsuspendHandTrashCost");
      if (handTrashCost > 0) {
        const hand = player(permanent.controllerSeat).hand;
        const chosen = await engine.ask.selectInstances(
          permanent.controllerSeat,
          Array.from(hand, (card) => card.instanceId),
          0,
          handTrashCost,
          `Trash ${handTrashCost} card${handTrashCost === 1 ? "" : "s"} from your hand to unsuspend this Digimon?`,
        );
        if (chosen.length !== handTrashCost) continue;
        // Same provenance as the Active-phase payment in turnFlow: the granted cost belongs to
        // this Digimon's controller, so the payment is that player's own effect trashing.
        await trash(chosen, { byEffectSeat: permanent.controllerSeat });
      }
      emitEffectTargetsSelected({ pc, permanentIds: [permanentId] });
      access.unsuspend(permanent);
      engine.emit?.({ kind: "cardsMoved", instanceIds: [permanentId], from: "suspended", to: "unsuspended" });
      engine.combat?.resetAttackEligibility?.(permanentId);
      await engine.fireTiming?.(EffectTiming.OnUnTappedAnyone, {
        unsuspendedPermanentId: permanentId,
      });
      // SubTrigger bus: "when [this/a matching] Digimon/Tamer becomes unsuspended" watchers
      // (23-card cluster: BT2-002 etc., EX3-001's "+1000 DP when THIS Digimon unsuspends").
      await engine.fireSubTrigger?.("whenUnsuspended", { unsuspendedPermanentId: permanentId });
    }
  };

  return {
    fireSuspensionTriggers,
    canSuspend,
    suspend,
    canPayActivationCost,
    payActivationCost,
    canUnsuspend,
    unsuspend,
  };
}
