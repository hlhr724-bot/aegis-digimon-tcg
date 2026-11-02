import type { CardKind, Keyword, Permanent, Seat, ZoneRef } from "@aegis/shared";

/**
 * Why a permanent is leaving the battle area, passed to the leave-prevention consult so
 * a "prevent" reaction can gate on the removal cause (e.g. "by an opponent's effect" must
 * not fire on the controller's own deletion). `byEffect` carries the resolving seat (whose
 * effect drove the removal); `byBattle` is combat deletion; `byRule` is a rule-based removal.
 */
export type RemovalCause = "byEffect" | "byBattle" | "byRule";

/**
 * Event-time proof that an inherited source was discarded from a live host.
 * This is deliberately separate from deletion snapshots: discarding a
 * digivolution card is not a deletion event, but its inherited watcher still
 * needs a narrowly scoped placement proof after the source leaves the stack.
 */
export interface DiscardedStackSourceProof {
  sourceInstanceId: string;
  hostPermanentId: string;
  activatesFromDiscardedCard?: boolean;
}

/**
 * What happened at the timing window that is firing. TS replacement for the
 * source `Hashtable` carried through effect resolution. Extend per timing as
 * the card implementation surfaces the data each effect reads (card-module contract
 * sections 2 and 10).
 */
export interface TriggerInfo {
  /** Host identity captured before a linked card is trashed; the host may then hit 0 DP. */
  linkTrashedSubject?: Permanent;
  /**
   * The played permanent as it entered. A rule check can remove it before its play watchers
   * activate; they still activate against this snapshot (Q2342, Q2856).
   */
  playedSubject?: Permanent;
  /** Stack-effect conferrals captured before a deleted host leaves play (Q2214). */
  stackEffectConferralsSnapshot?: readonly {
    targetPermanentId: string;
    stackInstanceId: string;
    trigger?: string;
    excludeInherited?: boolean;
    excludeKeywords?: Keyword[];
    inheritedOnly?: boolean;
  }[];
  /** Named effect grants captured at the same pre-deletion boundary. */
  customEffectGrantsSnapshot?: readonly {
    grantId?: number;
    instanceId: string;
    token: string;
    /** Live gate for duration-scoped auras whose recipient can gain/lose effect immunity. */
    isActive?: () => boolean;
  }[];
  /** On-deletion-at-end-of-attack projections captured before deletion teardown. */
  onDeletionAtEndOfAttackProjectionsSnapshot?: readonly string[];
  /** The play was initiated by an explicitly marked Decode replacement payload. */
  playedByDecode?: boolean;
  /** Seat whose turn was active when the event occurred (preserved across deferred rule triggers). */
  turnSeat?: Seat;
  /** Controller of a deleted permanent, captured before deferred rule processing removes it. */
  deletedControllerSeat?: Seat;
  /** Card id being played during the pay-time cost window. */
  wouldBePlayedCardId?: string;
  /** Whether the pay-time declaration is using the card as an Option rather than playing a permanent. */
  wouldBePlayedAsOption?: boolean;
  attackerPermanentId?: string;
  /** Attacker's effective DP immediately after declaration/suspension, before [When Attacking] effects. */
  attackerDPAtDeclaration?: number;
  /**
   * The declared defender's digivolution-stack size, captured at attack declaration. A
   * [When Attacking] effect resolving in the same window can strip those cards; an
   * "attacks a Digimon with no digivolution cards" gate is answered by the board AT
   * DECLARATION, not by the board the earlier effect left behind (KB Q2816). The sibling
   * of {@link attackerDPAtDeclaration} for the other side of the battle.
   *
   * Controller seat and effective kinds keep "if you attack an opponent's Digimon" answerable
   * after another effect in the same window removes the defender (KB Q648, Q650).
   */
  defenderAtDeclaration?: {
    permanentId: string;
    digivolutionCardCount: number;
    controllerSeat: Seat;
    kinds: CardKind[];
  };
  /** Stable identity for this attack across all reactive attack sub-trigger fires. */
  attackSequence?: number;
  /** Named attack procedure that caused the current attack watcher, when applicable. */
  attackMechanic?: string;
  /** The defending permanent of the in-flight battle (the original target or the blocker). */
  defenderPermanentId?: string;
  /** Permanent whose currently resolving effect or battle deleted the event subject. */
  deletingPermanentId?: string;
  /** The Digimon that declared a block this battle (＜Blocker＞ window). */
  blockerPermanentId?: string;
  targetPermanentId?: string;
  drawnInstanceIds?: string[];
  /** Permanent about to be deleted (WhenPermanentWouldBeDeleted). */
  deletedPermanentId?: string;
  /** Every permanent in the same simultaneous deletion action, captured before movement. */
  deletedPermanentIds?: string[];
  /** Controller and top-card facts for every permanent in the simultaneous deletion action. */
  deletedPermanentSnapshots?: Array<{
    permanentId: string;
    controllerSeat: Seat;
    topCardId: string;
    /** Whether this host conferred inherited effects at deletion (effective Digimon or DP-bearing Digi-Egg). */
    inheritedHostIsDigimon?: boolean;
    /** Physical cards under this host before it was deleted. */
    stackInstanceIds?: string[];
    /** Sources with no card information at deletion, before trash makes them face up (§4-7-9). */
    faceDownSourceInstanceIds?: string[];
  }>;
  /** Physical cards that became link cards in the current linking operation. */
  linkedInstanceIds?: string[];
  deletedInstanceIds?: string[];
  /** Printed card id of the deleted permanent's top card, captured before it leaves play. */
  deletedTopCardId?: string;
  /** Number of digivolution cards under the deleted permanent, captured before it leaves play. */
  deletedDigivolutionCardCount?: number;
  /** Effective host colors captured before deletion, keyed by every moved card instance. */
  deletedEffectiveColorsByInstanceId?: Record<string, import("@aegis/shared").CardColor[]>;
  /** Effective host names captured before deletion, keyed by the deleted permanent. */
  deletedEffectiveNamesByPermanentId?: Record<string, string[]>;
  /** Effective keywords of the deletion subject, captured while it was still in play. */
  deletedEffectiveKeywords?: Keyword[];
  /**
   * The subset of {@link deletedInstanceIds} that were STACK cards (not top cards)
   * of the deleted permanents. Used by the placement guard to distinguish inherited
   * effects (which fire only from stack position) from top-card effects after the
   * permanent is gone.
   */
  deletedWasStackInstanceIds?: string[];
  /** Subset of deletedInstanceIds that were linked cards before their host left play. */
  deletedWasLinkedInstanceIds?: string[];
  /**
   * Deleted host top-card instance keyed by each linked card that left with it. A linked
   * [On Deletion] effect stays pending for the host card, not the link card (BT24-036 Q5615),
   * so the host must still be in trash when that pending effect would activate.
   */
  deletedLinkHostInstanceByLinkedInstanceId?: Record<string, string>;
  /** Battle opponent for each card instance deleted in a battle. */
  battleOpponentPermanentIdByInstanceId?: Record<string, string>;
  /** Snapshot of effective battle-deletion Retaliation holders and their opponents. */
  retaliationTargetsByInstanceId?: Record<string, string>;
  retaliationCountsByInstanceId?: Record<string, number>;
  /** Event-time Fortitude holders that had digivolution cards when deleted. */
  fortitudeInstanceIds?: string[];
  /** Deleted host top-card identity for every card moved with it; pending effects require that host in trash. */
  deletedHostInstanceByInstanceId?: Record<string, string>;
  /** Why the cards in this deletion window left play. */
  removalCause?: RemovalCause;
  /** Named procedure that caused the deletion, when the rules distinguish it. */
  removalMechanic?: "Overclock";
  /** True when this simultaneous deletion batch is the rule check for Digimon at exactly 0 DP. */
  deletedByDpZero?: boolean;
  /** Top-card instance IDs that individually reached exactly 0 DP in this deletion window. */
  deletedByDpZeroInstanceIds?: string[];
  /** Security card currently being checked. */
  securityInstanceId?: string;
  securityRemovalEventId?: number;
  /** Option permanent card instance that was trashed from the battle area. */
  trashedOptionInstanceId?: string;
  /** The checked security card was face-up before the check revealed it. */
  securityWasFaceUp?: boolean;
  /** Permanent that was suspended (OnTappedAnyone). */
  suspendedPermanentId?: string;
  /**
   * Permanent that just transitioned from suspended to unsuspended (whenUnsuspended).
   * Set only on an ACTUAL transition — an already-unsuspended permanent never fires this
   * (mirrors suspendedPermanentId's "actual transition" gate, KB ST18-10 read in reverse).
   * Covers every unsuspend seam: the turn-start unsuspend phase (§6-2), ＜Reboot＞ (§16-11),
   * and effect-driven Unsuspend actions.
   */
  unsuspendedPermanentId?: string;
  /**
   * The seat whose EFFECT drove an effect-suspension (whenEffectSuspends). A watcher gated on
   * `EffectSourceCard.Owner == card.Owner`) reads this to require the suspending effect was its
   * OWN controller's. Set only on the effect-driven suspend seam, never on combat suspension.
   */
  effectSuspendSeat?: Seat;
  /**
   * The cardId of a digivolution-stack card just placed at the bottom of its owner's deck
   * (onDigivolutionCardReturnToDeckBottom). The watcher gates on this card's name (BT11-065:
   * "[Vemmon]") while `subjectPermanentId` carries the host whose stack lost the card.
   */
  returnedToDeckCardId?: string;
  /** Seat whose trash supplied at least one card just returned to its deck. */
  returnedFromTrashToDeckSeat?: Seat;
  /**
   * whenPlayed: the play that drove this event was EFFECT-driven (the `playInstances` verb — e.g.
   * "play a Digimon from trash/hand by an effect"), not a manual hand play. A watcher for "when an
   * effect plays one of your Digimon" (EX5-062, KB Q3665) gates on this; a manual play leaves it
   * unset, and a digivolve never fires whenPlayed at all.
   */
  playedByEffect?: boolean;
  /** Card whose resolving effect performed this play (for exact producer gates such as EX3-025). */
  playedByEffectSourceCardId?: string;
  /**
   * Printed level of the Digimon whose effect-driven play fired `whenPlayed`, captured at the
   * play seam before On Play effects or other simultaneous effects can change/remove it.
   */
  playedLevel?: number;
  /** Printed play cost captured when the `whenPlayed` event was produced. */
  playedPlayCost?: number;
  /** Permanent that just moved breeding -> battle area (OnMove). */
  movedPermanentId?: string;
  /** Why an OnEnterFieldAnyone subject entered the battle area. */
  entryCause?: "play" | "digivolve" | "move";
  /**
   * The permanent whose ENTRY drove this SubTrigger event — the played card
   * (whenPlayed), the linked/host card (whenLinked / whenOneOfYoursDigivolves), or the
   * permanent that gained digivolution cards (onAddDigivolutionCards). A filtered
   * sub-trigger's `matches` predicate reads this to gate ("a green Tamer was played").
   */
  subjectPermanentId?: string;
  /**
   * Every permanent created by one simultaneous play operation. `subjectPermanentId`
   * remains the first entry for legacy single-subject consumers; effects that say
   * "1 of those Digimon" use this collection to offer the complete event-bound choice.
   */
  subjectPermanentIds?: string[];
  /** Card instances linked by the current operation (whenLinked). This lets a newly linked
   * card's own [When Linking] watcher join the recipient's simultaneous trigger window. */
  linkedCardInstanceIds?: string[];
  /** Card instances just added to the subject permanent's digivolution stack. */
  addedDigivolutionCardInstanceIds?: string[];
  /** Stack position used by an effect placing cards under a Digimon. */
  addedDigivolutionCardsPosition?: "top" | "bottom";
  /** True when an effect rotated the host's own top card to the bottom of its stack. */
  placedOwnTopAtStackBottom?: boolean;
  /** Printed card id selected as the destination of an imminent digivolution. */
  digivolvingIntoCardId?: string;
  /** Printed level of the permanent's top card immediately before a digivolution. */
  previousDigivolutionLevel?: number;
  addedToHand?: {
    instanceIds: string[];
    byEffect?: { ownerSeat: Seat; isDigimonEffect: boolean };
  };
  addedToSecuritySeat?: Seat;
  /**
   * The card instances just placed into the security stack (whenAddSecurity). A watcher reads
   * these to gate on the added cards' traits ("if any of them have the [Zaxon]/[Royal Base]
   * Empty/absent for a ＜Recovery＞-style face-down add (the trait gate then never holds).
   */
  addedToSecurityInstanceIds?: string[];
  /**
   * The seat whose security stack a resolving EFFECT just removed cards from
   * effect removes cards from YOUR security" (BT15-084) reads this to require the removal hit
   * its own controller's stack rather than the opponent's.
   */
  removedFromSecuritySeat?: Seat;
  /** True when an effect, rather than a security check, removed the card. */
  securityRemovedByEffect?: boolean;
  /** Card instances just trashed from a security stack. */
  trashedFromSecurityInstanceIds?: string[];
  /**
   * The seat whose EFFECT drove the digivolution-card trash (whenDigivolutionTrashed). A
   * watcher gated on "when YOU trash a digivolution card" (KB P-004) reads this to require
   * the trashing effect was its OWN controller's, not the opponent's.
   */
  byEffectSeat?: Seat;
  /** Printed card ID of the effect that produced the event, when known. */
  byEffectCardId?: string;
  /** Keyword that actually caused this event, including granted or inherited abilities. */
  byEffectKeyword?: Keyword;
  /** Printed identity before a Digimon top is trashed and its next source promoted. */
  trashedDigimonTop?: { permanentId: string; controllerSeat: Seat; cardId: string };
  /** Whether the trashed digivolution card was the top card of its stack. */
  trashedDigivolutionCardWasTop?: boolean;
  /** True only when a digivolution card was trashed to pay a ＜Digi-Burst＞ cost. */
  isDigiBurstTrash?: boolean;
  /**
   * The seat whose HAND was just trashed from (one or more cards moved from that seat's hand to
   * trash in a single trash action). A `whenHandTrashed` watcher ("[All Turns] when YOUR hand is
   * trashed from", BT25-084) gates on this equalling its own controller's seat. Fired ONCE per
   * trash action per affected seat regardless of how many cards left (KB Q6400/Q6401: trashing 2
   * in one action triggers once; trashing 1 twice triggers twice).
   */
  handTrashedSeat?: Seat;
  /** Exact instances moved from that hand by the single trash action. */
  handTrashedInstanceIds?: string[];
  /**
   * The card ID of a card directly trashed from its owner's hand by an effect. Fired once per
   * moved hand card. Use `trashedFromHandInstanceId` for "this card" identity; duplicate copies
   * share this printed ID.
   */
  trashedFromHandCardId?: string;
  /** Exact instance directly trashed from hand; binds self-referential hand watchers. */
  trashedFromHandInstanceId?: string;
  /**
   * The seat whose EFFECT drove this card's ENTRY into the battle area for the OnPlay /
   * WhenDigivolving window — i.e. the card was played or digivolved BY AN EFFECT, not by a
   * manual hard play/digivolve. A `triggerEnteredByEffect` condition reads it (documented behavior
   * the effect runtime.IsByEffect gating BT25-084's "after, if played or digivolved by an effect,
   * trash their top security"). Unset for a manual play/digivolve and for every other timing
   * (so a When Attacking window can never satisfy the gate).
   */
  enteredByEffect?: Seat;
  /**
   * True when the WhenDigivolving window was reached via a DNA digivolve (two material Digimon
   * merged), set by the DNA-digivolve fire seam. An `isDnaDigivolving` condition reads it to gate a
   * DNA-only branch (BT20-045, P-221, EX9-021). Unset for a single digivolve and every other timing.
   */
  isDnaDigivolve?: boolean;
  /**
   * Source zone of the card that caused the current WhenDigivolving window, when known.
   * Effect-driven digivolves set this from the loose instance's pre-move zone so cards can
   * distinguish "this digivolved from the trash" (BT17-065).
   */
  digivolvedFromZone?: ZoneRef;
  /** Physical card entering through this evolution, fixed before nested evolutions. */
  digivolvedInstanceId?: string;
  digivolvedSubject?: Permanent;
  /**
   * True when the card the WhenDigivolving window's subject digivolved FROM is a Tamer
   * (BT23-101's "digivolve from a Tamer" requirement), read from the printed card kind so an
   * effect can see the distinction from inside the subject's own [When Digivolving] window.
   */
  digivolvedFromTamer?: boolean;
  /**
   * True when the base digivolved AS a Tamer (KB Q2957/Q6671/Q6708): a printed Tamer that no
   * effect currently treats as a Digimon. `whenOneOfYoursDigivolves` / `whenAnyDigivolves` still
   * fire — the digivolution happened — but a watcher reading "when a Digimon digivolves" must
   * stay silent, while one that names Tamers ("when one of your Tamers digivolves", "when your
   * Digimon or Tamers digivolve") fires. The SubTrigger gate reads this flag against the
   * watcher's `sourceFilter`.
   */
  tamerDigivolved?: boolean;
  /**
   * The rules-relevant use cost of the Option whose use fired this event: after card-level
   * changes, but before payment-only reductions (BT10-032 Q1956/Q1957).
   */
  usedOptionCost?: number;
  /**
   * The instance id of a digivolution card specifically trashed (onDigivolutionCardDiscarded).
   * Carried alongside subjectPermanentId (the host permanent) so a watcher's sourceFilter can
   * gate on "THIS card specifically" (the isSelfRef pattern BT10-006 uses).
   */
  trashedDigivolutionHost?: Permanent;
  trashedDigivolutionInstanceId?: string;
  /** All sources trashed simultaneously by one Digi-Burst cost payment. */
  trashedDigivolutionInstanceIds?: string[];
  /** Subset that was face down immediately before the stack-to-trash move. */
  trashedFaceDownDigivolutionInstanceIds?: string[];
  /**
   * The seat that just drew one or more cards (whenOpponentDraws). A watcher
   * ("[Your Turn] / [All Turns] when your opponent draws a card") gates on this
   * being the OPPONENT of its own controller's seat.
   */
  drawingSeat?: Seat;
  /**
   * The seat whose hand an EFFECT just added one or more cards to
   * (whenEffectAddsToOpponentHand). Distinct from `drawingSeat`: this fires for any
   * effect-driven hand addition (effect Draw, Return-to-hand, RevealAdd-to-hand) but
   * NOT for the normal draw-phase draw (a game rule, not an effect). A watcher ("[All
   * Turns] when an effect adds cards to your opponent's hand") gates on this being the
   * OPPONENT of its own controller's seat.
   */
  effectAddedToHandSeat?: Seat;
  /**
   * Number of material cards used in the DigiXros that triggered the current OnPlay window.
   * Set by the DigiXros fire seam; absent for a non-DigiXros play and every other timing.
   * A `digiXrosCount` condition reads this to gate "DigiXrosing with N or more cards".
   */
  digiXrosMaterialCount?: number;
  /**
   * The zone a card was played FROM when a `whenPlayed` event fires via an effect
   * (`playInstances`). Set to `"digivolutionCards"` when the played card originated from
   * a battle-area permanent's digivolution stack. Absent for hand plays and every other
   * timing. A `fromDigivolution: true` sourceFilter reads this to gate on "played from
   * digivolution cards" (BT20-028 KB Q4321).
   */
  playedFromZone?: string;
  /**
   * The destination a permanent WOULD BE returned to when a `wouldBeReturned` SubTrigger
   * event fires (CAP-C-11). Set to `"hand"` or `"deck"` by the return primitives before
   * executing the move. A `returnDestination` sourceFilter reads this to restrict which
   * destinations arm the watcher (BT20-074: "hand" or "deck" only, not trash).
   */
  returnDestination?: "hand" | "deck" | "trash";
  /**
   * The permanent trashed by an effect that fired a `whenTrashedByEffect` SubTrigger event
   * (CAP-E8, BT19-093). Carried so the watcher's `sourceFilter.zone` gate can check which
   * zone the permanent was in when trashed. Set by the effect-trash seam in primitives.ts
   * before the subscription is consulted; absent for every other event type.
   */
  trashedByEffectPermanentId?: string;
  /**
   * The instance id of the card BEING PLAYED when a `wouldBePlayed` Replacement fires.
   * Set by the play-card path before consulting `instead` replacements so an action with
   * `underFilter.isTriggerSource: true` can resolve the host to the played Digimon
   * (BT19-081: "place cards from under your Tamers as DigiXros materials for this Digimon").
   */
  wouldBePlayedInstanceId?: string;
  /** All cards in one effect-driven play batch sharing this replacement window. */
  wouldBePlayedInstanceIds?: readonly string[];
  /**
   * The card ID of a card directly trashed from a player's deck (whenTrashedFromDeck, CAP-H-01).
   * Fired once per milled card (unlike onDiscardLibrary which fires once per mill action).
   * A `whenTrashedFromDeck` watcher with `sourceFilter.isSelfRef` gates on this card ID
   * matching its own source card ID ("when THIS card is trashed from the deck").
   */
  trashedFromDeckCardId?: string;
  trashedFromDeckInstanceId?: string;
  /** Card ID of the effect source that caused this deck trash, when known. */
  trashedFromDeckByEffectCardId?: string;
  /**
   * The seat whose deck an EFFECT just added one or more cards to (whenEffectAddsToDeck).
   * The whenEffectAddsToHand sibling for deck-bound returns (returnToDeck). A watcher gates
   * on this equalling its own controller's seat (or the opponent's) exactly like
   * `effectAddedToHandSeat`.
   */
  effectAddedToDeckSeat?: Seat;
  /** Controller of the resolving effect that added cards to a deck, when known. */
  effectAddedToDeckBySeat?: Seat;
  /**
   * The seat whose trash cards were just returned FROM, to hand (whenCardReturnsFromTrashToHand).
   * A watcher ("[All Turns] when a card returns from your trash to your hand", BT15-082) gates
   * on this equalling its own controller's seat.
   */
  returnedFromTrashSeat?: Seat;
  /**
   * The card IDs of the cards that just returned from trash to hand in the same move as
   * `returnedFromTrashSeat`. A sourceFilter reads these (via `getCardDefinition`) to gate on
   * the returned cards' colors/traits (BT15-082: "a Red Digimon returns from your trash").
   */
  returnedFromTrashCardIds?: string[];
  /** Digimon card instances that just returned to their owner's hand from any zone. */
  returnedDigimonToHandSeat?: Seat;
  returnedDigimonToHandInstanceIds?: string[];
  // TODO(effect-framework): add fields as more timings are implemented.
}
