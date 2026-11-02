import { PrimitiveCallbackKind } from "#api/engine/effects/verbs/snapshot/PrimitiveCallbackKind";
import { createDelayedMemoryBody } from "#api/engine/effects/verbs/snapshot/createDelayedMemoryBody";
import { EffectDuration, type CardDefinition, type Seat } from "@aegis/shared";
import type { Primitives } from "../EffectContext.js";

import type { PrimitivesContext } from "./context.js";
import { emitEffectTargetsSelected } from "./emitEffectTargetsSelected.js";

/**
 * The static-continuous prohibitions: what a permanent or player cannot do,
 * and for how long.
 */

export function createRestrictionsVerbs(pc: PrimitivesContext) {
  const {
    engine,
    access,
    continuous,
    continuousOpt,
    durationForTarget,
    effectSeatStack,
    effectSourceKindsStack,
    ledger,
    state,
    subTriggers,
  } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const deletePermanent: Primitives["deletePermanent"] = (...args) => pc.fx.deletePermanent(...args);

  const restrict = (
    permanentId: string,
    restriction: Parameters<Primitives["restrict"]>[1],
    duration: EffectDuration,
    opts?: {
      fromSourceKind?: string[];
      byOpponentEffectsOnly?: boolean;
      byEffectsOnly?: boolean;
      continuous?: boolean;
    },
  ): void => {
    if (opts?.continuous !== true && continuousOpt() === undefined) {
      emitEffectTargetsSelected({ pc, permanentIds: [permanentId] });
    }
    continuous.addRestriction(permanentId, restriction, durationForTarget(permanentId, duration), {
      ...(opts?.continuous === true ? { continuous: true } : continuousOpt()),
      fromSourceKind: opts?.fromSourceKind,
      byOpponentEffectsOnly: opts?.byOpponentEffectsOnly,
      byEffectsOnly: opts?.byEffectsOnly,
      originSeat: effectSeatStack.at(-1) ?? engine.controllerSeat(),
      sourceKinds: effectSourceKindsStack.at(-1) ?? [],
    });
    // "Isn't affected by effects" ENDS an effect that is already applying (KB Q5327; the mirror
    // of Q5328, where losing the immunity re-applies it). The DP ledger already suppresses a
    // modifier the recipient cannot be affected by, but only re-reads that suppression when it
    // recomputes, so the stored `currentDP` would keep a now-inert reduction until some other
    // event moved it. Recompute the recipient here so the immunity takes effect immediately.
    if (restriction === "beAffected") ledger.recomputeDP(state, permanentId);
  };

  const restrictPlayer: NonNullable<Primitives["restrictPlayer"]> = (
    seat,
    restriction,
    duration,
    matches,
    opts,
  ): void => {
    const resolvingSeat = effectSeatStack.at(-1) ?? engine.controllerSeat();
    // Unsuspend-phase durations are framed from the restricted player, exactly as a
    // per-permanent restriction keys them on the recipient's seat.
    const recipientFramed =
      duration === EffectDuration.UntilNextUntap || duration === EffectDuration.UntilOwnerActivePhase;
    const ownerSeat = recipientFramed ? seat : resolvingSeat;
    continuous.addPlayerRestriction(seat, ownerSeat, restriction, duration, matches, {
      sourceCardId: opts?.sourceCardId,
      effectText: opts?.effectText,
      ...continuousOpt(),
      ...(opts?.matchesAsDigimon === undefined ? {} : { matchesAsDigimon: opts.matchesAsDigimon }),
      fromSourceKind: opts?.fromSourceKind,
      byOpponentEffectsOnly: opts?.byOpponentEffectsOnly,
      byEffectsOnly: opts?.byEffectsOnly,
    });
    if (restriction === "beAffected") {
      for (const permanent of state.players[seat]?.battleArea ?? []) ledger.recomputeDP(state, permanent.permanentId);
    }
  };

  const restrictAttackTarget = (
    attackerPermanentId: string,
    targetPermanentId: string,
    duration: EffectDuration,
  ): void => {
    if (continuousOpt() === undefined) {
      emitEffectTargetsSelected({ pc, permanentIds: [attackerPermanentId] });
    }
    continuous.addAttackTargetRestriction(
      attackerPermanentId,
      targetPermanentId,
      durationForTarget(attackerPermanentId, duration),
      continuousOpt(),
    );
  };

  /**
   * Whether the effect currently resolving is controlled by `permanentId`'s OPPONENT —
   * the discriminator a `byOpponentEffectsOnly` restriction keys on. Undefined when the
   * subject is not a battle-area permanent, so the ledger falls back to blocking.
   */
  const grantCanAttackUnsuspended: Primitives["grantCanAttackUnsuspended"] = (permanentId, duration, opts) => {
    continuous.grantCanAttackUnsuspended(permanentId, durationForTarget(permanentId, duration), {
      ...continuousOpt(),
      noDigivolutionCards: opts?.noDigivolutionCards,
      defenderLevelMax: opts?.defenderLevelMax,
    });
  };

  const grantVortexCanAttackPlayers = (permanentId: string, duration: EffectDuration): void => {
    // EX11-062's [Your Turn] "while your opponent has no unsuspended Digimon, your ＜Vortex＞ can also
    // attack players": a persistent per-permanent grant re-derived each continuous pass (CR-01). The
    // consume-site (combat/legality.canAttackTarget) widens a ＜Vortex＞-mode player attack to legal
    // while this is active (KB Q5920); it never changes an attack target (KB Q5921).
    continuous.grantVortexCanAttackPlayers(permanentId, durationForTarget(permanentId, duration), continuousOpt());
  };

  const armSuspendRestrictionSource = (permanentId: string, duration: EffectDuration): void => {
    // The armed marker is a one-shot, duration-scoped entry (NOT continuous): it survives the
    // continuous-recompute passes and clears only at its own boundary (UntilOpponentTurnEnd).
    continuous.armSuspendRestrictionSource(permanentId, duration);
  };

  const hasSuspendRestrictionSource = (permanentId: string): boolean =>
    continuous.hasSuspendRestrictionSource(permanentId);

  const isBeAffectedBySourceKind = (permanentId: string, sourceKind: string): boolean =>
    continuous.hasRestriction(permanentId, "beAffected", sourceKind);

  // True when the permanent carries an UNQUALIFIED beAffected restriction (blocks all sources,
  // e.g. GrantImmunity's "not affected by your opponent's effects"; a source-kind-qualified
  // entry like immuneToOpponentOptionEffects is honored only through the kind-specific
  // isBeAffectedBySourceKind path) OR is the current attacker with ＜Progress＞ (Comprehensive
  // Rules §16-39-1: "this Digimon isn't affected by your opponent's effects while attacking" —
  // a persistent effect scoped to its own in-flight attack, §16-39-3). Reusing this seam means
  // ＜Progress＞ needs no separate targeting exclusion: it is excluded from opponent-effect
  // candidate selection exactly like a blanket immunity, only time-boxed to the attack.
  const isUnaffectableByOpponentEffects = (permanentId: string): boolean =>
    continuous.hasRestriction(permanentId, "beAffected") ||
    (continuous.hasKeyword(permanentId, "Progress") && engine.combat?.currentAttackerId === permanentId);

  const isUnaffectedByOwnEffects = (permanentId: string, sourceKinds: readonly string[]): boolean =>
    [undefined, ...sourceKinds].some((sourceKind) =>
      continuous.hasRestriction(permanentId, "beAffected", sourceKind, { byOpponentEffect: false }),
    );

  const restrictDigivolveInto = (
    permanentId: string,
    matchesInto: (def: CardDefinition) => boolean,
    duration: EffectDuration,
  ): void => {
    // A persistent [All Turns] constraint re-derived each continuous pass (CR-01): tag continuous.
    continuous.addDigivolveIntoConstraint(
      permanentId,
      matchesInto,
      durationForTarget(permanentId, duration),
      continuousOpt(),
    );
  };

  const minDpFloor = (permanentId: string, floor: number, duration: EffectDuration): void => {
    // EX11-070's [All Turns] "can't have less than 1000 DP": a persistent floor re-derived each
    // continuous pass (CR-01), applied in the DP-calc layer AFTER all +/- changes (KB Q5941).
    ledger.addMinDpFloor(state, permanentId, floor, durationForTarget(permanentId, duration), continuousOpt());
  };

  const stackTrashLock = (permanentId: string, duration: EffectDuration): void => {
    // EX11-070's [All Turns] "your opponent's effects can't trash this Digimon's stacked cards":
    // a persistent lock re-derived each continuous pass (CR-01), consulted at the digivolution-card
    // trash sites (trashDigivolutionCards / deDigivolve) against the trashing effect's seat.
    continuous.addStackTrashLock(permanentId, durationForTarget(permanentId, duration), continuousOpt());
  };

  const seatStackTrashLock = (ownerSeat: Seat, duration: EffectDuration): void => {
    continuous.addSeatStackTrashLock(ownerSeat, duration, continuousOpt());
  };

  const stackCardTrashLock = (instanceId: string, ownerSeat: Seat, duration: EffectDuration): void => {
    continuous.addStackCardTrashLock(instanceId, ownerSeat, duration, continuousOpt());
  };

  const securityAttackInvert = (permanentId: string, duration: EffectDuration): void => {
    // EX6-031's [Your Turn] "Change ＜Security Attack -＞ to ＜Security Attack +＞ on all of your
    // Digimon": a persistent per-permanent sign-inversion re-derived each continuous pass (CR-01).
    // The consume-site (GameEngine.runSecurityCheck.strikeFor) negates each existing SA grant's
    // amount while this is active (per-instance flip, KB Q3752) — never per-permanent value math
    // in a card file.
    continuous.addSecurityAttackInversion(permanentId, durationForTarget(permanentId, duration), continuousOpt());
  };

  const delayedDeletePlayed = (
    playedPermanentId: string,
    timing: "endOfOwnerTurn" | "endOfOpponentTurn" | "endOfCurrentTurn" = "endOfOwnerTurn",
    sourceCardId?: string,
  ): void => {
    // A one-shot `endOfTurn` watcher anchored on the affected permanent. Most cards delete at
    // their owner's turn end; BT23-048 explicitly schedules the opponent's turn end (Q5567/Q5568).
    const ownerSeat = access.permanentById(playedPermanentId)?.controllerSeat;
    const currentTurnSeat = state.turnSeat;
    const turnEndWindowSeat = engine.turnEndWindowSeat?.();
    let expiresOnTurnEndOf = ownerSeat;
    if (timing === "endOfCurrentTurn") {
      expiresOnTurnEndOf = turnEndWindowSeat === currentTurnSeat ? access.opponentOf(currentTurnSeat) : currentTurnSeat;
    } else if (timing === "endOfOpponentTurn" && ownerSeat !== undefined) {
      expiresOnTurnEndOf = access.opponentOf(ownerSeat);
    }
    const isStillDigimon = (): boolean =>
      access.isBattleAreaDigimon(access.permanentById(playedPermanentId), continuous);
    const deferredToTurnCount =
      timing === "endOfOpponentTurn" && expiresOnTurnEndOf !== undefined && turnEndWindowSeat === expiresOnTurnEndOf
        ? state.turnCount + 2
        : undefined;
    subTriggers.subscribe({
      event: "endOfTurn",
      sourcePermanentId: playedPermanentId,
      once: true,
      // Pending processing, not an activated effect: the turn player orders it against the
      // other end-of-turn effects even when the deleted Digimon is the opponent's
      // (KB Q5564/Q5566/Q5568).
      orderedByTurnPlayer: true,
      ...(expiresOnTurnEndOf !== undefined && deferredToTurnCount === undefined ? { expiresOnTurnEndOf } : {}),
      matches: (subCtx) =>
        (deferredToTurnCount === undefined || state.turnCount === deferredToTurnCount) &&
        (timing === "endOfCurrentTurn" || expiresOnTurnEndOf === undefined || state.turnSeat === expiresOnTurnEndOf) &&
        subCtx.source.isOnBattleArea() &&
        isStillDigimon(),
      description:
        timing === "endOfCurrentTurn"
          ? "[End of Current Turn] Delete this Digimon (delayed-delete-played)."
          : timing === "endOfOpponentTurn"
            ? "[End of Your Opponent's Turn] Delete this Digimon."
            : "[End of Your Turn] Delete this Digimon (delayed-delete-played).",
      run: async () => {
        if (!isStillDigimon()) return;
        const deletedCardId = access.permanentById(playedPermanentId)?.topCard.cardId;
        await deletePermanent(
          [playedPermanentId],
          "byEffect",
          sourceCardId && deletedCardId ? { turnEndDeletion: { sourceCardId, deletedCardId } } : undefined,
        );
      },
    });
  };

  const delayedGainMemory: NonNullable<Primitives["delayedGainMemory"]> = (seat, amount, activationContext) => {
    // BT1-021 "at the end of your turn, lose 3 memory": a one-shot `endOfTurn` watcher with
    // NO source anchor — per KB Q882/Q883 the delayed loss still fires if the installing
    // Digimon left the field first (the effect "has already activated"), so it must not be
    // dropped by the anchor teardown. `expiresOnTurnEndOf` still bounds it to this turn end.
    subTriggers.subscribe({
      event: "endOfTurn",
      once: true,
      // Pending processing, not an activated effect: the turn player orders it against the
      // other end-of-turn processing (KB Q5564/Q5566/Q5568), as the delayed deletion is.
      orderedByTurnPlayer: true,
      // CR 18-1-2: order this pending processing with the printed end-of-turn effects.
      // Keep its activated context without anchoring it to a card that may leave play;
      // a contextless watcher would bypass the pending pool and fire only afterwards.
      activationContext,
      expiresOnTurnEndOf: seat,
      description: `At end of turn, ${amount >= 0 ? "gain" : "lose"} ${Math.abs(amount)} memory (delayed one-shot #${++pc.sequences.delayedMemorySequence}).`,
      run:
        engine.runtimeCallbacks?.create({
          key: PrimitiveCallbackKind.DELAYED_MEMORY.value,
          payload: { seat, amount },
        }) ?? createDelayedMemoryBody({ memory: engine.memory, seat, amount }),
    });
  };

  const endAttack: Primitives["endAttack"] = () => {
    engine.combat?.endAttack();
  };

  const grantNameTrait = (
    permanentId: string,
    kind: "name" | "trait",
    tokens: string[],
    duration: EffectDuration,
    opts?: { digiXrosOnly?: boolean; fromRule?: boolean; nameContainsOnly?: boolean },
  ): void => {
    continuous.addNameTraitGrant(permanentId, kind, tokens, durationForTarget(permanentId, duration), {
      ...continuousOpt(),
      ...opts,
    });
  };

  return {
    restrict,
    restrictPlayer,
    restrictAttackTarget,
    grantCanAttackUnsuspended,
    grantVortexCanAttackPlayers,
    armSuspendRestrictionSource,
    hasSuspendRestrictionSource,
    isBeAffectedBySourceKind,
    isUnaffectableByOpponentEffects,
    isUnaffectedByOwnEffects,
    restrictDigivolveInto,
    minDpFloor,
    stackTrashLock,
    seatStackTrashLock,
    stackCardTrashLock,
    securityAttackInvert,
    delayedDeletePlayed,
    delayedGainMemory,
    endAttack,
    grantNameTrait,
  };
}
