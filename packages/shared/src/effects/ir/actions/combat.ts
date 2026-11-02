// Attack declaration, battle resolution, and attack redirection.

import type { EffectDurationRef } from "../durations.js";
import type { Target } from "../filters/filter.js";
import type { Controller } from "../filters/zones.js";
import type { ActionBase } from "./base.js";
import type { AttackTargetScope } from "#shared/effects/ir/actions/AttackTargetScope";

export interface AttackAction extends ActionBase {
  kind: "Attack";
  /** Who attacks ("this Digimon", "1 of your Digimon"). */
  target: Target;
  withoutSuspending?: boolean;
  /** Declare this as the keyword's Vortex attack. */
  vortex?: boolean;
  attackTargetScope?: AttackTargetScope;
  /** Name of the keyword mechanic that declared this attack. */
  attackMechanic?: string;
  subject?: Target;
  /** Alternative name for `target`. */
  attacker?: Target;
  /**
   * Attack with the permanent the preceding action chose, with no new prompt. A top-level alias
   * of `Target.sameTarget` for card authors who put it on the action (BT19-091); the interpreter
   * reads `target.sameTarget` in `resolvePermanentTargets`.
   */
  sameTarget?: boolean;
  /**
   * The resolved Digimon must attack if legally able — the player cannot decline (KB Q3163 on
   * BT19-091). Declarative only: `forceAttack` already enforces it, so this adds no runtime gate.
   */
  mandatory?: boolean;
  /** Drain the remaining effects in this timing window while the declared attack is still open. */
  drainTimingWindowDuringAttack?: boolean;
  deleteAtEndOfAttack?: boolean;
}

/**
 * "1 of your Digimon may battle 1 of your opponent's Digimon" — a DIRECT §14 DP comparison where
 * the loser, or both on a tie, is deleted. Not an attack: there is no attack declaration, and per
 * KB Q6348/Q6278/Q5955 the battle is a rule, so it bypasses effect-immunity on the chosen
 * permanents. AttackAction runs the full attack lifecycle instead.
 */
export interface BattleAction extends ActionBase {
  kind: "Battle";
  /** Compare source counts for this battle without granting a keyword. */
  comparison?: "digivolutionCards";
  attacker: Target;
  /** The defender, as `defender` or the equivalent `target`; exactly one is present. */
  defender?: Target;
  /** Alternative spelling of `defender`. */
  target?: Target;
}

interface RedirectAttackBase extends ActionBase {
  kind: "RedirectAttack";
  /** Also allow the defending player as a legal redirected target. */
  includePlayer?: boolean;
  /**
   * `"controller"` (the default, and what every existing RedirectAttack card relies on) lets the
   * source's controller pick. `"opponent"` lets the ATTACKED player choose (BT4-075).
   */
  chooser?: "controller" | "opponent";
  /** On decline the attack proceeds unchanged. Absent means mandatory. */
  optional?: boolean;
  controller?: Controller;
}

/** Change the attack target, or end it after an earlier target switch. */
export type RedirectAttackAction =
  | (RedirectAttackBase & {
      /** The Digimon to be attacked instead. */
      target: Target;
      /** "mustAttack" forces the target to attack. */
      mode?: "mustAttack";
    })
  | (RedirectAttackBase & {
      /** Legacy compiler spelling of the targetless EndAttack action. */
      mode: "endAttack";
      target?: never;
    });

/**
 * Select a permanent purely to BIND it for a later action ("Choose 1 of your [Shoutmon] Digimon.
 * Delete 1 of your opponent's Digimon with DP equal to or less than the chosen Digimon"). The
 * chosen permanentId is stored under `target.bindAs` and read by a downstream
 * `Filter.relativeTo` / `PlaceUnder.underSelectionRef`; nothing else happens. When nothing can be
 * chosen the binding stays empty and its dependents do not resolve.
 */
export interface SelectBindAction extends ActionBase {
  kind: "SelectBind";
  target: Target;
  /** Defaults to the effect controller. */
  chooser?: "controller" | "opponent";
}

/**
 * Relax the base rule that a defender must be suspended: the target may also attack the
 * opponent's UNSUSPENDED Digimon (ST12-08).
 */
export interface GrantCanAttackUnsuspendedAction extends ActionBase {
  kind: "GrantCanAttackUnsuspended";
  target: Target;
  duration: EffectDurationRef;
  /**
   * Relax it only for opponent Digimon with NO digivolution cards (EX1-016, EX1-020, BT7-095).
   * Omitted covers any unsuspended opponent Digimon (ST12-08, P-058).
   */
  noDigivolutionCards?: boolean;
  defenderLevelMax?: number;
  /** Apply the same timed grant to matching permanents that enter after resolution. */
  includeLaterEntrants?: boolean;
}

export interface GrantVortexCanAttackPlayersAction extends ActionBase {
  kind: "GrantVortexCanAttackPlayers";
  target: Target;
  duration: EffectDurationRef;
}

/**
 * "End that attack" (BT23-069): jump the current attack straight to the end-of-attack timing, a
 * no-op when no attack is resolving. It changes the TIMING, not the Digimon (KB Q5339/Q5340), so
 * it also ends an effect-immune attacker's attack.
 */
export interface EndAttackAction extends ActionBase {
  kind: "EndAttack";
}

/**
 * Arm "other than their highest play cost Digimon, none of your opponent's Digimon can suspend
 * until their turn ends" (BT23-024). Not a plain per-target Restrict: the EXEMPT set is
 * recomputed each continuous pass as the board changes (KB Q5250/Q5252; Q6025/Q6026 — if none has
 * a play cost, ALL are restricted). The action arms a duration-scoped marker and the recompute
 * pass re-derives the affected set and records the per-target `suspend` restriction. Consumed by
 * `combat/legality.canAttackerDeclare`, since a Digimon that can't suspend can't declare a
 * tapping attack.
 */
export interface ArmSuspendRestrictionAction extends ActionBase {
  kind: "ArmSuspendRestriction";
  /** Default "untilOpponentTurnEnd". */
  duration?: EffectDurationRef;
}
