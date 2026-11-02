import { type CombatTrigger } from "../../combat/controller.js";
import type { TriggerInfo } from "../../effects/EffectContext.js";
import type { GameEngine } from "../../GameEngine.js";

/**
 * Fire an effect-timing window through the stack (subsystem: effect-stack-resolution).
 * Delegates to the resolver composition root (`runTiming`): collect every effect
 * that triggers at `timing` across the candidate zones, order turn-player-first,
 * prompt for optionals/ordering, and resolve one at a time — folding in effects
 * triggered DURING resolution (documented behavior). Centralized
 * so every caller (turn machine, actions, security check) shares one seam.
 */
/**
 * Map a {@link CombatTrigger} onto the {@link TriggerInfo} a timing window reads. Shared by
 * the plain combat timing hook and the combined [When Attacking]/＜Alliance＞ window so both
 * present the same trigger data to collected effects.
 */
export function combatTriggerInfo(engine: GameEngine, trigger: CombatTrigger): TriggerInfo {
  return {
    attackerPermanentId: trigger.attackerPermanentId,
    attackMechanic: trigger.attackMechanic,
    defenderPermanentId: trigger.defenderPermanentId,
    defenderAtDeclaration: trigger.defenderAtDeclaration,
    blockerPermanentId: trigger.blockerPermanentId,
    ...(trigger.target?.kind === "permanent" ? { targetPermanentId: trigger.target.permanentId } : {}),
    deletedPermanentId: trigger.deletedPermanentId,
    deletedPermanentIds: trigger.deletedPermanentIds,
    deletedPermanentSnapshots: trigger.deletedPermanentSnapshots,
    deletingPermanentId: trigger.deletingPermanentId,
    removalCause: trigger.removalCause,
    deletedControllerSeat: trigger.deletedControllerSeat,
    deletedTopCardId: trigger.deletedTopCardId,
    deletedEffectiveColorsByInstanceId: trigger.deletedEffectiveColorsByInstanceId,
    deletedInstanceIds: trigger.deletedInstanceIds,
    deletedWasStackInstanceIds: trigger.deletedWasStackInstanceIds,
    deletedWasLinkedInstanceIds: trigger.deletedWasLinkedInstanceIds,
    deletedLinkHostInstanceByLinkedInstanceId: trigger.deletedLinkHostInstanceByLinkedInstanceId,
    fortitudeInstanceIds: trigger.fortitudeInstanceIds,
    deletedHostInstanceByInstanceId: trigger.deletedHostInstanceByInstanceId,
    customEffectGrantsSnapshot: trigger.customEffectGrantsSnapshot,
    stackEffectConferralsSnapshot: trigger.stackEffectConferralsSnapshot,
    battleOpponentPermanentIdByInstanceId: trigger.battleOpponentPermanentIdByInstanceId,
  };
}
