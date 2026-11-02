import { EffectDuration } from "@aegis/shared/schema/enums";
import { requireCardDefinition, type AttackTarget } from "@aegis/shared";
import type { Primitives } from "../EffectContext.js";
import type { ForceAttackOptions } from "../context/primitives/index.js";
import { canAttackerDeclare, canAttackTarget } from "../../combat/legality.js";
import { AttackTargetScope } from "@aegis/shared/effects/ir/actions/AttackTargetScope";
import { getForcedAttackCandidateIds } from "#api/engine/effects/verbs/getForcedAttackCandidateIds";

import type { PrimitivesContext } from "./context.js";

/**
 * Redirecting, adding to and ending an attack in flight.
 */

export function createCombatVerbs(pc: PrimitivesContext) {
  const { engine, access, continuous, effectSeatStack, player, state } = pc;

  const PLAYER = "player";

  /** The attack targets `forceAttack` would offer right now; empty when it would do nothing. */
  const forceAttackCandidates = (attackerPermanentId: string, opts?: ForceAttackOptions): string[] => {
    const combat = engine.combat;
    if (combat === undefined) return []; // no combat port (test engine): narrate nothing
    if (combat.isAttacking) return []; // do not nest an effect-driven attack inside another
    const attacker = access.permanentById(attackerPermanentId);
    if (attacker === undefined) return [];
    const controllerSeat = attacker.controllerSeat;
    if (
      canAttackerDeclare(access, controllerSeat, attacker, continuous, opts?.vortex, opts?.withoutSuspending) !== null
    ) {
      return [];
    }
    const opponentSeat = access.opponentOf(controllerSeat);

    // Reuse declared-attack target legality so forced attacks cannot offer a
    // protected defender, an unsuspended defender without a matching grant, or a
    // player forbidden by the effect/restriction (BT9-100, KB Q1904/Q1905).
    const playerTarget: AttackTarget = { kind: "player" };
    const legalEnemyIds = access
      .battleAreaPermanents(opponentSeat)
      .filter(
        (permanent) =>
          canAttackTarget(
            access,
            controllerSeat,
            attacker,
            { kind: "permanent", permanentId: permanent.permanentId },
            continuous,
            opts?.vortex,
          ) === null,
      )
      .map((permanent) => permanent.permanentId);
    return getForcedAttackCandidateIds({
      scope: opts?.attackTargetScope ?? AttackTargetScope.ANY.value,
      isPlayerLegal: canAttackTarget(access, controllerSeat, attacker, playerTarget, continuous, opts?.vortex) === null,
      playerCandidateId: PLAYER,
      legalDigimonIds: legalEnemyIds,
    });
  };

  const canForceAttack = (attackerPermanentId: string, opts?: ForceAttackOptions): boolean =>
    forceAttackCandidates(attackerPermanentId, opts).length > 0;

  const forceAttack = async (
    attackerPermanentId: string,
    opts?: ForceAttackOptions & {
      /** Replaces the target prompt; `undefined` declines the attack before declaration. */
      chooseTarget?: (candidates: string[]) => Promise<string | undefined>;
    },
  ): Promise<void> => {
    const combat = engine.combat;
    const attacker = access.permanentById(attackerPermanentId);
    const candidates = forceAttackCandidates(attackerPermanentId, opts);
    if (combat === undefined || attacker === undefined || candidates.length === 0) return;
    const controllerSeat = attacker.controllerSeat;
    const promptTarget = async (): Promise<string> => {
      const chosen = await engine.ask.selectInstances(
        controllerSeat,
        candidates,
        1,
        1,
        "Choose the attack target for the forced attack.",
        {
          ...opts?.decisionProvenance,
          // The clause's source remains available through sourceCardId/effectText, but
          // the board arrow for this second decision must leave from the Digimon that
          // was selected to attack, not from the permanent owning the effect.
          sourcePermanentId: attacker.permanentId,
          selectionContext: "attackTarget",
        },
      );
      return chosen[0] ?? candidates[0]!;
    };
    const pick = opts?.chooseTarget === undefined ? await promptTarget() : await opts.chooseTarget(candidates);
    if (pick === undefined) return;
    const target: AttackTarget = pick === PLAYER ? { kind: "player" } : { kind: "permanent", permanentId: pick };

    await combat.resolveAttack(controllerSeat, attacker, target, {
      withoutTap: opts?.withoutSuspending ?? false,
      attackMechanic: opts?.attackMechanic,
      afterAttackDeclaration: async () => {
        if (opts?.attackMechanic === "Execute") {
          continuous.addCustomEffectGrant(
            attacker.topCard.instanceId,
            controllerSeat,
            "Execute deletion",
            EffectDuration.UntilEndAttack,
            { sourceCardId: opts.decisionProvenance?.sourceCardId ?? attacker.topCard.cardId },
          );
        }
        if (opts?.deleteAtEndOfAttack === true) {
          continuous.addCustomEffectGrant(
            attacker.topCard.instanceId,
            controllerSeat,
            "[End of Attack] Delete this Digimon.",
            EffectDuration.UntilEndAttack,
            { sourceCardId: opts.decisionProvenance?.sourceCardId ?? attacker.topCard.cardId },
          );
        }
        await opts?.afterAttackDeclaration?.();
      },
      afterAttackTriggers: async () => {
        await opts?.afterAttackTriggers?.();
        const option = player(controllerSeat).resolvingOption;
        if (option !== undefined && option.instanceId === opts?.artsDigivolveOptionInstanceId) {
          const definition = requireCardDefinition(option.cardId);
          if (definition.isDualCard && !state.gameOver) {
            await engine.artsDigivolve?.(controllerSeat, option, definition, true);
          }
        }
      },
      // An attack ordered from inside a resolving body parks the attacker's [When Attacking]
      // triggers in the nested pending pool (§15-4-4), where they pool with whatever else that
      // body triggered — a DNA-produced attacker orders its When Digivolving and When Attacking
      // effects together from exactly this pool (Q3944). §11-1 still requires the pool to resolve
      // BEFORE Counter Timing and the security check, which the enclosing timing window's drain
      // does. A watcher body has no such window, so without the fallback nothing drained the pool
      // until the security check's own resolver did, and the attacker's inherited draw resolved
      // on top of the flipped card (match 89641815: BT26-015 ordering an attack by BT26-009's
      // host).
      drainTimingWindow: ((): ForceAttackOptions["drainTimingWindow"] => {
        const drain = opts?.drainTimingWindow ?? engine.drainPendingAttackTriggers;
        if (drain === undefined) return undefined;
        return (options) => engine.resolveAttackTimingWindow?.(drain, options) ?? drain(options);
      })(),
      // Counter Timing through End of Attack interrupt the ordering effect (§11-1), so the
      // triggers each step produces resolve as their own windows instead of being parked in
      // the nested pending pool until after combat.
      ...(engine.runAttackSteps === undefined ? {} : { runAttackSteps: engine.runAttackSteps }),
      // Inside that pause, a battle deletion's [On Deletion] window is still parked behind the
      // ordering effect's open window token, so each step boundary flushes it explicitly —
      // §11-1-4 puts those deletions before End of Attack, not after the whole attack.
      ...(engine.settleBetweenAttackSteps === undefined ? {} : { settleBetweenSteps: engine.settleBetweenAttackSteps }),
    });
  };

  const blitzAttack = async (attackerPermanentId: string, opts?: ForceAttackOptions): Promise<void> => {
    const awaitDeclaration = engine.awaitBlitzAttackDeclaration;
    const attacker = access.permanentById(attackerPermanentId);
    if (awaitDeclaration === undefined || attacker === undefined) return;
    const controllerSeat = attacker.controllerSeat;
    // CR §16-16-3: the processing condition is 1 or more memory on the opponent's side.
    if (engine.memory.memoryFor(access.opponentOf(controllerSeat)) < 1) return;
    // forceAttack checks suspension and the in-progress attack guard. A prior
    // attack without suspending does not prevent a later legal ＜Blitz＞ attack.
    await forceAttack(attackerPermanentId, {
      ...opts,
      attackMechanic: "Blitz",
      chooseTarget: (candidates) =>
        awaitDeclaration(controllerSeat, attackerPermanentId, candidates, opts?.decisionProvenance),
    });
  };

  const isAttackResolving = (): boolean => engine.combat?.isAttacking === true;

  function isAttackTargetLocked(attackerPermanentId = engine.combat?.currentAttackerId): boolean {
    return attackerPermanentId !== undefined && continuous.hasRestriction(attackerPermanentId, "attackTargetChange");
  }

  /**
   * Redirect the currently-resolving attack onto one of `candidatePermanentIds`
   * (chosen by the source's controller). The reserved id `"player"` represents the
   * defending player, allowing cards that say "another opponent's Digimon or the player".
   */
  const redirectAttack: Primitives["redirectAttack"] = async (candidatePermanentIds, opts) => {
    const combat = engine.combat;
    if (combat === undefined || !combat.isAttacking || isAttackTargetLocked()) return;
    const candidates = candidatePermanentIds.filter((id) => id === "player" || access.permanentById(id) !== undefined);
    if (candidates.length === 0) return;
    // The chooser is the source's controller by default; BT4-075 passes the opponent seat so
    // the DEFENDING player picks among their own unsuspended Digimon. When `optional`, the
    // chooser may decline (min 0) and the attack proceeds unchanged.
    const chooserSeat = opts?.chooserSeat ?? effectSeatStack.at(-1) ?? engine.controllerSeat();
    const optional = opts?.optional ?? false;
    const attackerId = combat.currentAttackerId;
    const attackerSeat = attackerId === undefined ? undefined : access.permanentById(attackerId)?.controllerSeat;
    // "player" is always the defending player. Clients label the sentinel from the chooser's
    // side ("player" = opponent's security, "mine" = your security), so a defending chooser
    // (EX5-054 "this Digimon or the player") must be offered "mine".
    const playerPromptId = attackerSeat !== undefined && chooserSeat !== attackerSeat ? "mine" : "player";
    const promptCandidates = candidates.map((id) => (id === "player" ? playerPromptId : id));
    let chosen: string[];
    if (candidates.length === 1 && !optional) {
      chosen = promptCandidates;
    } else {
      chosen = await engine.ask.selectInstances(
        chooserSeat,
        promptCandidates,
        optional ? 0 : 1,
        1,
        "Choose the new target of the attack.",
      );
    }
    const pick = chosen[0];
    if (pick === undefined) return; // declined (or no pick): attack proceeds unchanged
    const redirected = combat.redirectTarget(
      pick === playerPromptId ? { kind: "player" } : { kind: "permanent", permanentId: pick },
    );
    // The attack target was just switched — notify reactive watchers ("when this Digimon's
    // attack target is switched", BT11-008). The attacker is the event subject; a watcher's
    // sourceFilter isSelfRef gates it to its own attack.
    if (redirected && attackerId !== undefined) {
      await engine.fireSubTrigger?.("whenAttackTargetSwitched", {
        subjectPermanentId: attackerId,
        attackerPermanentId: attackerId,
      });
    }
  };

  return { forceAttack, canForceAttack, blitzAttack, isAttackResolving, isAttackTargetLocked, redirectAttack };
}
