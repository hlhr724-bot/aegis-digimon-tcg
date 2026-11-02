import type { CounterChoice } from "@aegis/shared/protocol/CounterChoice";
import type { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import type { AttackTarget, CardColor, CardInstance, EffectTiming, Seat, ServerEvent } from "@aegis/shared";
import type { RemovalCause, SubTriggerEventName, TriggerInfo } from "../effects/EffectContext.js";
import type { ContinuousLegalityReader } from "./legality.js";
import type { SecurityCheckOptions, SecurityCheckReason } from "../security/securityCheck.js";

/**
 * The shapes the attack-and-block subsystem passes around: the decision windows a
 * running attack opens, the trigger payload every combat timing carries, and
 * `CombatHooks` — the seam the controller reaches the rest of the engine through
 * without depending on it.
 */

/** Battle completion payload, published once the outer attack reaches cleanup. */
/** The card a keyword prompt belongs to, so the client never guesses it from the event log. */
export interface DecisionSource {
  sourceCardId: string;
  sourceInstanceId: string;
  sourcePermanentId?: string;
}

export interface CompletedCombat {
  seat: Seat;
  attackerPermanentId: string;
  deletedPermanentIds: string[];
}

/** A live block window awaiting the defending seat's declareBlock / declineBlock. */
export interface OpenBlockWindow {
  attackerPermanentId: string;
  defendingSeat: Seat;
  eligibleBlockerIds: Set<string>;
  /** Resolve with the chosen blocker permanent id, or null when the window is passed. */
  resolve: (blockerPermanentId: string | null) => void;
}

/** A live ＜Alliance＞ decision awaiting a seat's ally choice. */
export interface AllianceDecisionWindow {
  permanentId: string;
  seat: Seat;
  eligibleAllyIds: Set<string>;
  resolve: (allyPermanentId: string | null) => void;
}

/** A live ＜Evade＞ decision for a single permanent. */
export interface EvadeDecisionWindow {
  permanentId: string;
  seat: Seat;
  resolve: (accept: boolean) => void;
}

/** A live ＜Barrier＞ decision for a single permanent. */
export interface BarrierDecisionWindow {
  permanentId: string;
  seat: Seat;
  resolve: (accept: boolean) => void;
}

/**
 * A live §11-3 Counter Timing window: open while the non-turn (defending) seat
 * may activate at most 1 [Counter] effect for this attack. `resolve` is called by
 * the matching `respondCounter` intent handler (either after passing, or after it
 * has already run the chosen [Counter] effect's body) — mirroring the block/
 * alliance/evade/barrier decision windows above.
 */
export interface OpenCounterWindow {
  attackerPermanentId: string;
  defendingSeat: Seat;
  resolve: () => void;
}

export interface BlockTiming {
  attackerPermanentId: string;
  blockerPermanentId: string;
  blockerSuspended: boolean;
}

/** Minimal trigger payload passed to the effect-stack seam for combat timings. */
export interface CombatTrigger {
  subjectPermanentId?: string;
  suspendedPermanentId?: string;
  attackerPermanentId?: string;
  attackSequence?: number;
  attackMechanic?: string;
  defenderPermanentId?: string;
  /** See {@link TriggerInfo.defenderAtDeclaration}. */
  defenderAtDeclaration?: TriggerInfo["defenderAtDeclaration"];
  blockerPermanentId?: string;
  target?: AttackTarget;
  /** A permanent deleted by the battle (OnDestroyedAnyone). */
  deletedPermanentId?: string;
  /** Every permanent deleted by the same simultaneous battle outcome. */
  deletedPermanentIds?: string[];
  /** Controller and top-card facts captured before the battle losers leave play. */
  deletedPermanentSnapshots?: TriggerInfo["deletedPermanentSnapshots"];
  /** The sole surviving battle participant that caused the deletion; absent for ties. */
  deletingPermanentId?: string;
  /** Controller of the first deleted permanent. */
  deletedControllerSeat?: Seat;
  /** Why the permanent left play, for deletion-condition gates. */
  removalCause?: RemovalCause;
  deletedTopCardId?: string;
  deletedEffectiveColorsByInstanceId?: Record<string, CardColor[]>;
  /** The card instances that actually left the field in this battle's deletion window. */
  deletedInstanceIds?: string[];
  /** Subset of deletedInstanceIds that were stack cards (for inherited-effect gating). */
  deletedWasStackInstanceIds?: string[];
  /** Subset of deletedInstanceIds that were linked cards before deletion. */
  deletedWasLinkedInstanceIds?: string[];
  /** Deleted host top-card instance keyed by each linked card that left with it. */
  deletedLinkHostInstanceByLinkedInstanceId?: Record<string, string>;
  /** Top-card instance IDs that individually reached exactly 0 DP in this deletion window. */
  deletedByDpZeroInstanceIds?: string[];
  battleOpponentPermanentIdByInstanceId?: Record<string, string>;
  /** Retaliation holders actually deleted in battle, paired with their battled opponent. */
  retaliationTargetsByInstanceId?: Record<string, string>;
  retaliationCountsByInstanceId?: Record<string, number>;
  /** Event-time Fortitude holders that had digivolution cards when deleted. */
  fortitudeInstanceIds?: string[];
  /** Deleted host top-card identity for every card moved with it; pending effects require that host in trash. */
  deletedHostInstanceByInstanceId?: Record<string, string>;
  /** Event-time custom grants, captured before battle deletion drops recipient availability. */
  customEffectGrantsSnapshot?: TriggerInfo["customEffectGrantsSnapshot"];
  stackEffectConferralsSnapshot?: TriggerInfo["stackEffectConferralsSnapshot"];
}

/**
 * Capabilities the controller needs from the engine: narration, the effect-stack
 * seam, and the security-and-win-check hand-off. Injected so combat stays
 * decoupled from transport and from sibling subsystems' internals.
 */
export interface CombatHooks {
  emit: (event: ServerEvent) => void;
  /**
   * Fire an effect-timing window through the effect stack. No-op until
   * effect-stack-resolution lands; the attack/block flow runs and narrates either
   * way (subsystems: effect-framework, effect-stack-resolution).
   */
  fireTiming: (timing: EffectTiming, trigger: CombatTrigger) => Promise<void>;
  /**
   * Resolve the attack's When Attacking, ＜Alliance＞ and ＜Raid＞ effects as one simultaneous
   * window. Returns whether the window actually carried the keyword effects: a window the
   * engine has to defer (an attack declared from INSIDE another effect's resolution) cannot,
   * and the caller then falls back to the legacy inline Alliance loop and Raid step.
   */
  fireAttackTiming?: (
    trigger: CombatTrigger,
    allianceCount: number,
    opts?: {
      includeSubTriggers?: boolean;
      subTriggerPayload?: TriggerInfo;
      suspendedPermanentId?: string;
      raidTriggered?: boolean;
    },
  ) => Promise<{
    allianceResolvedInWindow: boolean;
    raidResolvedInWindow: boolean;
    subTriggersResolvedInWindow: boolean;
  }>;
  /** Whether the engine has attack-timing effects to combine with Alliance. */
  combineAllianceTiming?: (permanentId: string) => boolean;
  /** Resolve simultaneous [On Deletion]/<Ascension> reactions in controller-chosen order. */
  resolveDeletionReactions?: (
    trigger: CombatTrigger,
    ascensionCandidates: readonly { instanceId: string; seat: Seat }[],
    transientCandidates?: readonly CardInstance[],
  ) => Promise<void>;
  /** Effective colors captured immediately before a battle deletion. */
  effectiveColorsOf?: (permanentId: string) => CardColor[];
  /**
   * Fire the SubTrigger bus (System B) for a combat event, running armed watchers whose
   * captured sourceFilter matches the payload (delayed-and-rule-effects). Distinct from
   * `fireTiming` (System A): a `whenAttacking` / `whenOpponentAttacks` / `whenDeletesInBattle`
   * watcher was armed by an already-resolved effect and reacts to this attack/battle. Optional
   * so the combat unit tests (minimal hooks) need no change; absent => no watcher runs.
   */
  fireSubTrigger?: (event: SubTriggerEventName, payload: TriggerInfo) => Promise<void>;
  /**
   * Snapshot a SubTrigger event's armed watchers at the instant the event occurs, while
   * deferring their activation until the caller invokes the returned function. Attack
   * declarations use this to preserve the event-time watcher set while System-A
   * [When Attacking] effects resolve first.
   */
  prepareSubTrigger?: (event: SubTriggerEventName, payload: TriggerInfo) => () => Promise<void>;
  /**
   * How many watchers a SubTrigger event has armed for this payload. Attack declaration uses it
   * to decide whether the non-turn player's `whenOpponentAttacks` watchers need holding back
   * for turn-player priority at all: with none armed the ordinary inline fire is kept, so an
   * attack that nobody is watching keeps its legacy sequence exactly.
   */
  armedSubTriggerCount?: (event: SubTriggerEventName, payload: TriggerInfo) => number;
  /**
   * Run the attack-declaration timing windows with this event's `whenAttacking` /
   * `whenOpponentAttacks` watchers folded into them, so a printed [When Attacking] effect and a
   * watcher that reacts to the same declaration reach ONE ordering prompt (CR §15-4). Watchers
   * the windows did not resolve still fire afterwards. Absent => the legacy sequence below runs
   * the windows first and the watcher bus second.
   */
  withPendingAttackSubTriggers?: (payload: TriggerInfo, runWindows: () => Promise<void>) => Promise<void>;
  /**
   * Run a combat suspension's [On Tapped] window with its `whenSuspended` watchers folded in, so
   * a watcher resolves as an effect inside a timing window: what its body triggers (the [On Play]
   * of a Digimon it plays) waits for the rule check after it (CR §15-4-4-3, Discord
   * 1557356892794388541). Absent => the window and the watcher bus run one after the other.
   */
  withPendingSuspensionSubTriggers?: (payload: TriggerInfo, runWindows: () => Promise<void>) => Promise<void>;
  fireBlockTiming: (block: BlockTiming) => Promise<void>;
  /** Capture event-time eligibility before battle losers leave, without resolving reactions. */
  prepareFrozenSubTrigger?: (
    event: SubTriggerEventName,
    payload: TriggerInfo,
  ) => (options?: { deferIntoDeletionWindow?: boolean }) => Promise<void>;
  /** Refresh passive effects at the battle-deletion boundary, before reactions activate. */
  refreshContinuousEffects?: () => Promise<void>;
  /**
   * Consult card-authored deletion replacements before battle losers leave the field. The
   * effect-path primitive already uses the same shared consult; combat otherwise deletes by
   * raw state access and would pay a prevention cost without actually saving the Digimon.
   */
  keywordReactionsInLeavePrevention?: boolean;
  resolveAvertedBattleReactions?: (
    resolveBattleWon?: (options?: { deferIntoDeletionWindow?: boolean }) => Promise<void>,
  ) => Promise<void>;
  consultLeavePrevention?: (
    permanentIds: string[],
    opts?: { insteadOnly?: boolean; keywordPreventions?: { interruptsEffect: boolean } },
  ) => Promise<Set<string>>;
  /**
   * Drop a battle-deleted permanent's modifier / continuous / SubTrigger ledgers as it
   * leaves the field (subsystems: static-continuous-effects, delayed-and-rule-effects).
   * Combat deletes through raw state access, so it routes per-permanent teardown here to
   * stay single-sourced with the effect-path primitive — a stale reduceCost/prevent
   * replacement or watcher from a Digimon that died in battle must not survive to fire.
   * Optional so the combat unit tests (minimal hooks) keep the base behavior (no teardown).
   */
  dropPermanentSubscriptions?: (permanentId: string) => void;
  /** Capture custom named-effect grants while battle recipients are still live. */
  snapshotCustomEffectGrants?: (departingInstanceIds: readonly string[]) => TriggerInfo["customEffectGrantsSnapshot"];
  snapshotStackEffectConferrals?: () => TriggerInfo["stackEffectConferralsSnapshot"];
  /**
   * Resolve a successful, unblocked player-directed attack against `defenderSeat`
   * by running the security check (subsystem: security-and-win-check). The engine
   * binds this to runSecurityCheck(...); combat never flips a security card itself.
   */
  checkSecurity: (
    defenderSeat: Seat,
    attackerPermanentId: string,
    reason: SecurityCheckReason,
    options?: SecurityCheckOptions,
  ) => Promise<void>;
  /**
   * Whether a permanent currently has ＜Piercing＞ (subsystem: keyword-abilities).
   * Read post-win in resolveDigimonBattle: a piercing attacker that deletes the
   * defending Digimon then performs the defending player's security check
   * (Comprehensive Rules §16-7 / source OnDetermineDoSecurityCheck). Optional so the
   * combat unit tests (minimal hooks) keep the base "no pierce" behavior.
   */
  hasPierce?: (permanentId: string) => boolean;
  /**
   * Expire the attack/battle-scoped duration modifiers (`UntilEndAttack` /
   * `UntilEndBattle`) and re-derive the continuous tier, at the end of an attack
   * (subsystems: static-continuous-effects, effect-primitives). The source cleared
   * its `UntilEndAttackEffects` / `UntilEndBattleEffects` lists here. Optional so the
   * combat unit tests (which pass a minimal hooks object) need no change.
   */
  sweepEndOfAttack?: () => void | Promise<void>;
  afterAttackEnded?: () => Promise<void>;
  /**
   * Queue the End of Attack timing behind the effect that is ending the attack, so its
   * [End of Attack] effects activate as derived triggers ahead of the effects still pending
   * (CR §15-4-5-2, KB Q6490). Returns a withdraw callback that is true while the queued
   * timing has not been activated yet, or undefined when no effect window is resolving.
   */
  deferEndOfAttack?: (trigger: CombatTrigger) => (() => boolean) | undefined;
  /** Expire battle durations after all Digimon-battle reactions, preserving attack durations. */
  sweepEndOfBattle?: (scopeId?: number) => Promise<void>;
  /** Open/close an identity scope for nested field battles. */
  beginBattleScope?: () => number;
  endBattleScope?: (scopeId: number) => void;
  /** Re-derive passive effects when the field-Digimon battle context opens or closes. */
  recomputeBattleEffects?: () => Promise<void>;
  /**
   * The shared continuous-rule reader (ContinuousEffectLedger). When supplied, the
   * block window only offers Digimon with ＜Blocker＞ and no `block` restriction
   * (Comprehensive Rules §16-5). Optional so the combat unit tests keep the base
   * "any unsuspended Digimon may block" behavior.
   */
  continuous?: ContinuousLegalityReader;
  /** Resolve a keyword from printed top-card text plus live continuous grants. */
  hasKeyword?: (permanentId: string, keyword: string) => boolean;
  /** Number of independent Alliance instances currently active on the attacker. */
  allianceCount?: (permanentId: string) => number;
  /**
   * Add an attack-scoped DP modifier (UntilEndAttack). Used by ＜Alliance＞ (§16-24) to
   * boost the attacking Digimon's DP for the current attack. The modifier is cleaned
   * up by `sweepEndOfAttack`. Optional so combat unit tests (minimal hooks) keep the
   * base behavior.
   */
  addDpModifier?: (permanentId: string, delta: number) => void;
  /** Add Alliance's Security Attack +1 for this attack, independent of its source remaining active. */
  addSecurityAttack?: (permanentId: string) => void;
  /**
   * Pay Barrier's security-trash cost through the shared security primitive so
   * `whenSecurityRemoved` watchers observe the removal before battle continues.
   * Minimal combat-unit fixtures may omit this and use the direct access fallback.
   */
  trashTopSecurityForBarrier?: (seat: Seat, isAttackBattle: boolean) => Promise<void>;
  /**
   * Ask `seat` to optionally choose ONE of `candidateInstanceIds` (each the topCard instance
   * of an eligible permanent), or decline. Backs the ＜Raid＞ redirect choice (§16-23) and the
   * ＜Scapegoat＞ sacrifice choice (§16-32) — both are a single "pick one of these, or pass"
   * decision, so they share the generic selectCards decision channel instead of each keyword
   * inventing its own protocol intent. Optional so the combat unit tests (minimal hooks) skip
   * straight to "no choice offered" (undefined == decline).
   */
  selectOptionalInstance?: (
    seat: Seat,
    candidateInstanceIds: string[],
    promptText: string,
    source?: DecisionSource,
    selectionGoal?: DecisionSelectionGoal,
  ) => Promise<string | undefined>;
  /**
   * Ask `seat` to optionally choose exactly `count` of `candidateInstanceIds`, or decline
   * (anything short of `count` is a decline — the choice is all-or-nothing). Backs ＜Fragment
   * (N)＞'s "choose and trash N digivolution cards" cost (§16-37). Optional so the combat unit
   * tests (minimal hooks) skip straight to decline.
   */
  selectOptionalInstances?: (
    seat: Seat,
    candidateInstanceIds: string[],
    count: number,
    promptText: string,
    source?: DecisionSource,
    selectionGoal?: DecisionSelectionGoal,
  ) => Promise<string[] | undefined>;
  /**
   * Pay ＜Armor Purge＞'s cost on an already-accepted decision: trash this permanent's own
   * current top card, promoting the digivolution card beneath it to the new top (§16-19).
   * Optional so the combat unit tests (minimal hooks) leave it a no-op (the deletion is
   * already excluded from `toDelete` source by the same optional-hook pattern as Fragment).
   */
  armorPurge?: (permanentId: string) => Promise<void>;
  /**
   * Trash `instanceIds` from `hostPermanentId`'s own digivolution stack as an already-accepted
   * cost. Backs ＜Fragment＞'s cost payment (§16-37). Optional, mirrors `armorPurge`.
   */
  trashDigivolutionCards?: (
    hostPermanentId: string,
    instanceIds: string[],
    provenance: { byEffectSeat: Seat; byEffectCardId: string },
  ) => Promise<void>;

  /**
   * Place a card instance already loose in trash at the top of its owner's security stack, on
   * an already-accepted decision. Backs ＜Ascension＞'s reaction (§16-43). Optional, mirrors
   * `armorPurge`.
   */
  ascendToSecurity?: (instanceId: string) => Promise<void>;
  /**
   * ＜Material Save＞'s full reaction (§16-21): decision, Tamer choice, and card relocation, as
   * one atomic step (unlike Armor Purge/Fragment/Ascension, its decision tree has an internal
   * branch — a Tamer to place under — that does not fit the generic accept/decline hooks).
   * Must be called BEFORE the permanent's cards move to trash. Optional, mirrors
   * `armorPurge`.
   */
  materialSave?: (permanentId: string) => Promise<void>;
  /**
   * List `seat`'s currently-activatable [Counter] effects (Comprehensive Rules
   * §11-3-1), one entry per (source instance, effect) pair — mirrors the engine's
   * `syncActivatableEffects` but scoped to the defending seat and the
   * `EffectTiming.OnCounterTiming` window. Used to decide whether the counter
   * timing window needs a round trip at all: with nothing eligible, `runCounterWindow`
   * resolves immediately without prompting (mirrors `runBlockWindow`'s "no eligible
   * blocker" shortcut). Optional so the combat unit tests (minimal hooks) keep the
   * base "nothing eligible" behavior.
   */
  counterEligible?: (seat: Seat) => CounterChoice[];
}
