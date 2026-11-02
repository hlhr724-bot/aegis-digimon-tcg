import type { Seat } from "@aegis/shared";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import type { EffectContext } from "./effectContext.js";

/**
 * Restrict one SubTrigger fire to (or away from) the subject permanent's own self clauses.
 *
 * Used by the deletion seam: a permanent's OWN "when this Digimon is deleted" clause resolves
 * before a leave-prevention replacement can save it (Q2212), while every other "when a
 * Digimon is deleted" watcher, including one on the subject itself, must only see the
 * permanents that actually left (Q6030, Q2311).
 */
export type SubTriggerSourceScope = "selfSourceOnly" | "excludeSelfSource";

/** Future events a delayed/triggered sub-effect can watch (delayed-and-rule-effects). */
export type SubTriggerEventName =
  // Every actual entry into the battle area; mirrors OnEnterFieldAnyone rather
  // than the narrower whenPlayed bus (which excludes breeding movement/digivolve).
  | "onEnterFieldAnyone"
  | "whenAttacking"
  | "whenOpponentAttacks"
  | "whenBlocked"
  | "whenBlockerActivated"
  | "whenAttackTargetSwitched"
  | "whenSuspended"
  | "whenUnsuspended"
  | "whenBattleWon"
  | "whenSecurityBattleEnded"
  | "whenDeletesInBattle"
  | "whenOneOfYoursDigivolves"
  | "whenAnyDigivolves"
  | "whenHatch"
  | "whenMovedFromBreeding"
  | "whenOpponentMovedFromBreeding"
  | "onDeletionOf"
  | "whenSecurityRemoved"
  | "whenCardTrashedFromSecurity"
  | "whenEffectTrashesFromSecurity"
  | "whenEffectRemovesFromSecurity"
  | "whenAddSecurity"
  | "whenFaceUpCardsAddedToOpponentSecurity"
  | "onAddDigivolutionCards"
  | "whenPlayed"
  | "whenOptionPlayed"
  | "whenOptionInBattleAreaTrashed"
  | "whenLeavesPlay"
  | "whenLinked"
  | "whenLinkTrashed"
  | "whenDigivolutionTrashed"
  | "whenDigimonTopTrashed"
  | "onDigivolutionCardDiscarded"
  | "onDigivolutionCardsDiscardedBatch"
  | "onDigiBurstCardDiscarded"
  | "onDigivolutionCardReturnToDeckBottom"
  | "whenTrashedFromHand"
  | "whenHandTrashed"
  | "onDiscardLibrary"
  | "whenOptionUsed"
  | "whenEffectAddsToHand"
  | "whenEffectAddsToOpponentHand"
  | "whenCardReturnsFromTrashToHand"
  | "whenDigimonReturnsToHand"
  | "whenCardReturnsFromTrashToDeck"
  | "whenEffectSuspends"
  | "whenOpponentDraws"
  | "startOfYourMainPhase"
  | "endOfTurn"
  | "endOfOpponentTurn"
  | "wouldBeReturned"
  | "whenTrashedByEffect"
  | "whenTrashedFromDeck"
  | "whenCheckedFaceUpSecurity"
  // The whenEffectAddsToHand sibling for deck-bound moves (returnToDeck). Unblocks
  // BT26-001/BT26-015, which need "an effect adds a card to your deck" as a live event.
  | "whenEffectAddsToDeck";

/** Args for installing a delayed/triggered sub-effect via the primitives. */
export interface SubTriggerInstall {
  decisionSummary?: DecisionEffectSummary;
  event: SubTriggerEventName;
  attackRedirectTargetIds?: (ctx: EffectContext) => string[];
  attackRedirectRequiresSelfSuspend?: boolean;
  /** See `SubTriggerSubscription.printedClause`. */
  printedClause?: string;
  /** The watcher body reports an accepted processing choice before its first result. */
  activationDeferred?: boolean;
  /**
   * Pending processing left over from an effect that already resolved (a delayed deletion, a
   * delayed memory change, a delayed body) rather than an effect activating now. The turn
   * player orders the whole simultaneous set it lands in, whoever controls its source
   * (KB Q5564/Q5566/Q5568). See `SubTriggerSubscription.orderedByTurnPlayer`.
   */
  orderedByTurnPlayer?: boolean;
  appliesOnEntry?: boolean;
  /** Stable action identity used to avoid duplicate installs while preserving distinct clauses. */
  dedupeKey?: string;
  /** Printed placement class retained so a pending watcher passes the same kernel guard. */
  isInheritedSource?: boolean;
  isLinkedSource?: boolean;
  /** See `SubTriggerSubscription.watchesSelf`. */
  watchesSelf?: boolean;
  sourcePermanentId?: string;
  /**
   * Anchor for a watcher installed by a card that is NOT a live battle-area Permanent —
   * a hand- or trash-resident source ("when this card is trashed from the hand", a
   * `[Trash]` continuous reaction). When paired with `sourcePermanentId`, it preserves
   * the exact printed source card while the permanent id anchors lifecycle. Otherwise,
   * the engine resolves it against the loose CardInstance wherever it currently sits
   * (hand/trash/security), binding `ctx.source` from it instead of requiring a Permanent.
   * See `SubTriggerRegistry.subscribe`'s loud-failure guard: a
   * watcher with a `matches` predicate and NEITHER anchor can never fire and is now a
   * hard error at install time, not a silent no-op.
   */
  sourceInstanceId?: string;
  /** Retained live context for a seat-scoped timed watcher with no permanent/card anchor. */
  activationContext?: EffectContext;
  once: boolean;
  /** Marks a watcher installed by a persistent static effect for recompute teardown. */
  continuous?: boolean;
  run: (ctx: EffectContext) => Promise<void>;
  /**
   * Per-install gate on the fired event's payload (the captured `sourceFilter`).
   * Absent => the sub fires for every event of its type. See SubTriggerSubscription.matches.
   */
  matches?: (ctx: EffectContext) => boolean;
  /**
   * Can this watcher still DO anything? Consulted only when several watchers fire off the
   * same event and their controller is asked to order them: a watcher that answers false
   * would resolve to nothing (its `by suspending this Tamer` cost is unpayable because the
   * Tamer is already suspended), so it must not appear in that ordering prompt. Firing
   * itself is unaffected — the body's own guard still decides what happens.
   * Absent => the watcher always competes for ordering.
   */
  canFire?: (ctx: EffectContext) => boolean;
  hasLegalOutcome?: (ctx: EffectContext) => boolean;
  /**
   * A GRANTED watcher's expiry: the seat whose turn-END drops this subscription
   *. Absent => the watcher lives until its
   * anchor leaves the field. Swept by the engine at each turn-end boundary.
   */
  expiresOnTurnEndOf?: Seat;
  /**
   * Fires at most once per `fire()` call even if the event fires multiple times in that
   * batch (KB Q2814 for BT2-053; see SubTriggerSubscription.oncePerTiming).
   */
  oncePerTiming?: boolean;
  /**
   * A stable per-TURN key gating this watcher to fire at most once per turn — set this
   * for a persistent (`[All Turns]` / `EffectTiming.None`) effect's `[Once Per Turn]`
   * watcher (its enclosing `staticModifier`'s `maxPerTurn` is NOT counted by the engine;
   * see SubTriggerSubscription.oncePerTurnKey). Must be stable across the continuous
   * recompute that reinstalls this subscription — use `${cardId}/effect-name`, not the
   * subscription id.
   */
  oncePerTurnKey?: string;
  description: string;
}
