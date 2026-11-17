// Restrictions placed on players, cards, and effects.

import type { EffectDurationRef } from "../durations.js";
import type { Filter, Target } from "../filters/filter.js";
import type { Controller } from "../filters/zones.js";
import type { Condition } from "../predicates/conditions.js";
import type { ActionBase } from "./base.js";

/** What a continuous restriction forbids the target from doing. */
export type RestrictionKind =
  | "attack"
  | "attackPlayers"
  | "cantAttackDigimon" // players remain legal targets
  | "attackOnlySuspendedDigimon"
  | "block"
  | "cantBeBlocked" // on the ATTACKER
  | "suspend"
  | "unsuspend" // "doesn't unsuspend"
  | "unsuspendDuringOwnUnsuspendPhase" // effect-driven unsuspend and opponent-turn Reboot remain legal
  | "unsuspendDuringUnsuspendPhase" // no Digimon/Tamers unsuspend during either player's unsuspend phase
  | "beDeletedInBattle"
  | "beDeleted"
  | "beTrashed"
  | "beReturned"
  | "leaveBattleAreaExceptByDeletion"
  | "digivolve"
  | "digivolveToLevel7" // EX3-069, including DNA digivolution
  | "digivolveExceptInto" // POSITIVE constraint; carries an into-filter via RestrictDigivolveInto (EX10-035)
  | "attackTargetChange"
  | "cantBeAttacked" // on the DEFENDER
  | "dpImmune"
  | "beAffected" // "unaffected by your opponent's effects"
  | "cantBeDeDigivolved"
  | "cannotActivateWhenDigivolving" // BT19-038, KB Q5541–Q5545
  // DEPRECATED — inert, and never had a consumer. The two distinct "can't activate effects"
  // mechanics are now DisableSecurityEffectAction / DisableTimingEffectAction. Still emitted by
  // older runtime records for ~32 cards pending re-classification, so it stays in the union.
  | "activateEffects";

/**
 * A continuous "can't ..." restriction on a target, recorded in the continuous-effect layer and
 * read by combat and turn code.
 */
export interface RestrictAction extends ActionBase {
  kind: "Restrict";
  target: Target;
  restriction: RestrictionKind | string;
  /**
   * Also record the combat-facing `suspend` prohibition when the canonical
   * effect-facing restriction is `beSuspended`. Printed "can't suspend"
   * clauses cover both effect suspension and attack declaration suspension;
   * older generated IR uses `restriction: "suspend"` for both wordings, so
   * this opt-in keeps that compatibility while exposing the complete rule.
   */
  blocksCombatSuspend?: boolean;
  /** The permanent the restriction is ON. Defaults to the source. */
  on?: Target;
  duration: EffectDurationRef;
  /**
   * Narrow a `beAffected` immunity to effects from these source kinds ("opponent's Digimon
   * effects don't affect this Digimon"). Absent blocks regardless of source.
   */
  fromSourceKind?: ("Digimon" | "Tamer" | "Option" | "DigiEgg")[];
  /**
   * Apply only while the restricted permanent's OPPONENT controls the resolving effect — the
   * "…by your opponent's effects" wording. Absent applies to any effect.
   */
  byOpponentEffectsOnly?: boolean;
  /**
   * Apply only to effects, never to rule processing or battle — the "prevent effects from
   * deleting it" wording (BT7-064). Absent also blocks rule and battle deletion (BT18-086).
   */
  byEffectsOnly?: boolean;
  exceptInBattle?: boolean;
  /**
   * Board-state gate re-evaluated every continuous pass ("while you have 1 or more memory",
   * EX8-026). Unlike `condition`, which is checked once at resolution, `while` marks the
   * restriction continuous so it lifts as soon as the state stops holding.
   */
  while?: Condition;
  /** Keep the restriction only while its recipient continues to match the original target filter. */
  whileMatchesTargetFilter?: boolean;
}

/** Declare a card category, reveal the opponent's top deck card, and gain matching immunity. */
export interface DeclareCategoryImmunityAction extends ActionBase {
  kind: "DeclareCategoryImmunity";
  target: Target;
  controller: "opponent";
  duration: EffectDurationRef;
}

/**
 * Seat-level, state-sensitive prohibition: the restricted player's UNSUSPENDED Digimon can't
 * digivolve. Suspended Digimon stay legal, as do Tamers using a direct named Tamer requirement; a
 * Tamer used "as if it were a Digimon" is blocked. EX3-053, KB Q3420-Q3422.
 */
export interface RestrictUnsuspendedDigivolveAction extends ActionBase {
  kind: "RestrictUnsuspendedDigivolve";
  seat: Controller;
  duration: EffectDurationRef;
}

/**
 * Positive digivolve-target constraint (EX10-035 "this Digimon can only digivolve into ..."):
 * digivolve-legality rejects a digivolve onto the restricted permanent unless the evolving card
 * matches `into`. Distinct from the plain `digivolve` restriction, which forbids it entirely.
 */
export interface RestrictDigivolveIntoAction extends ActionBase {
  kind: "RestrictDigivolveInto";
  /** Usually the source. */
  target: Target;
  /** The only card(s) this permanent may digivolve into. */
  into: Filter;
  duration: EffectDurationRef;
}

/**
 * Continuous "can't have less than N DP" floor, applied AFTER all +/- changes are summed rather
 * than per change — KB EX11-070 Q5941: 5000 +2000 −7000 clamps to 1000. `recomputeDP`/`rawDp`
 * raise the computed DP to the highest active floor. Cleared and re-derived each continuous pass
 * (CR-01).
 */
export interface MinDpFloorAction extends ActionBase {
  kind: "MinDpFloor";
  /** The host of an inherited effect. */
  target: Target;
  /** EX11-070 => 1000. */
  floor: number;
  duration: EffectDurationRef;
}

/**
 * Continuous "this Digimon's stacked cards can't be trashed by your opponent's effects"
 * (KB Q5943): blocks the opponent's TrashDigivolution and ＜De-Digivolve＞, leaving the
 * controller's own effects free. Consulted by the digivolution-card trash sites; cleared and
 * re-derived each continuous pass (CR-01).
 */
export interface StackTrashLockAction extends ActionBase {
  kind: "StackTrashLock";
  /** The host of an inherited effect. */
  target: Target;
  duration: EffectDurationRef;
  /** Apply the same timed lock to matching permanents that enter after resolution. */
  includeLaterEntrants?: boolean;
}

/** Seat-level lock: the affected seat may not gain memory from non-Tamer effects. */
export interface RestrictMemoryGainAction extends ActionBase {
  kind: "RestrictMemoryGain";
  /** From the source card owner's perspective. */
  seat: Controller;
  exceptTamerEffects: true;
  duration: EffectDurationRef;
}

/** Seat-level prohibition on reducing play or digivolve costs. */
export interface RestrictCostReductionAction extends ActionBase {
  kind: "RestrictCostReduction";
  seat: Controller;
  costType: "play" | "digivolve" | "all";
  duration: EffectDurationRef;
}

/**
 * Seat-level prohibition on PLAYING or MOVING matching cards ("your opponent can't use Option
 * cards", "can't play or move Digimon with 6000 DP or less").
 *
 * It binds only the restricted seat's OWN actions and effects: the SOURCE player's effects may
 * still play such a card into the restricted seat's area (KB EX7-014 Q4675/Q4676). Token plays
 * are exempt unless the filter opts into them (Q3834; BT14-017/Q2381); breeding-area plays and
 * effect-driven moves are blocked (Q3835/Q6509).
 * Delay/Security activations of Options already in play are not "playing" and are unaffected
 * (BT8-057 Q1736/Q1737, EX1-072 Q3265/Q3266).
 */
export interface RestrictPlayAction extends ActionBase {
  kind: "RestrictPlay";
  /** From the source card owner's perspective. */
  seat: Controller;
  /** Kind Option, or kind Digimon + dpAtMost. */
  filter: Filter;
  mode: "play" | "move" | "playOrMove";
  /**
   * Restrict only effect-driven plays, leaving normal hand play alone. Consulted at the
   * effect-play gate (KB Q4665–Q4668, Q6245 / BT20-020).
   */
  byEffectOnly?: boolean;
  duration: EffectDurationRef;
}

/** Seat-wide prohibition on adding cards to security through one player's effects. */
export interface GlobalRestrictAction extends ActionBase {
  kind: "GlobalRestrict";
  restriction: "opponentCannotAddToSecurity";
  duration: EffectDurationRef;
}

/**
 * A continuous immunity: the target cannot be chosen by, and is unaffected by, any opponent
 * effect while the condition holds. Stored as a `beAffected` restriction (CAP-C-06, BT19-101).
 */
export interface GrantImmunityAction extends ActionBase {
  kind: "GrantImmunity";
  target: Target;
  /** "opponentEffects" blocks all opponent-controlled effects. */
  immuneFrom: "opponentEffects" | string;
  duration: EffectDurationRef;
}

/** A restriction scoped to the current effect resolution alone (BT23-013). */
export interface RestrictEffectAction extends ActionBase {
  kind: "RestrictEffect";
  restriction: string;
  scope: "thisEffect";
}
