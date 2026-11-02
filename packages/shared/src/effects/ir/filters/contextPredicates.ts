// Predicates that read the RESOLUTION context rather than the card or the board: the firing
// event's payload, bindings written by earlier actions in the same effect, and how a permanent
// arrived where it is.

export interface ContextPredicates {
  /** The exact card being checked, identified by TriggerInfo.securityInstanceId (EX5-053). */
  isRevealedSecurityCard?: boolean;
  /**
   * Leave-prevention costs only: exclude the permanent currently being protected. In an
   * affects-all simultaneous event this still permits a different leaving permanent, matching
   * "1 other Digimon" rulings such as BT24-040 Q5781.
   */
  excludeLeavingSubject?: true;
  /** Share at least one color with the permanent stored by an earlier SelectBind. */
  sameColorAsSelectionRef?: string;
  /** Share at least one color with the loose card paid by the current return cost. */
  sameColorAsReturned?: boolean;
  /** Printed play-cost ceiling from the currently attacking Digimon. */
  playCostLteAttackerLevel?: boolean;
  /**
   * Narrows an onDeletionOf watcher to a removal cause: DP reaching 0, or deletion BY AN EFFECT
   * ("when an effect deletes one of your other Digimon" — LM-016). The `onDeletionOf` payload
   * carries the removal cause but no `byEffectSeat`, so this is the gate for the latter.
   */
  deleteCause?: "dpReachedZero" | "byEffect";
  /**
   * Level ceiling snapshotted from the `whenPlayed` subject, so it survives later level changes
   * or that Digimon leaving play (ST10-06, KB Q737/Q738).
   */
  levelLteTriggerSource?: boolean;
  /** Exact-level counterpart of `levelLteTriggerSource`. */
  levelEqTriggerSource?: boolean;
  /** Printed play-cost ceiling snapshotted from the `whenPlayed` subject. */
  playCostLteTriggerSource?: boolean;
  /**
   * As a PlaceUnder `underFilter` inside a `wouldBePlayed` Replacement: host is the card that
   * triggered the event (`TriggerInfo.wouldBePlayedCardId`), i.e. the Digimon being played (BT19-081).
   */
  isTriggerSource?: boolean;
  /**
   * As a PlaceUnder `underFilter` outside a Replacement: host is whatever the preceding
   * `PlayWithoutCost`/`Play` played in this same resolution (EX9-005), read from
   * `EffectContext.lastPlayedPermanentIds` instead of prompting.
   */
  lastPlayed?: boolean;
  /**
   * Leave-prevention `sourceFilter` only: fire only for effect-caused leaves. Absent means no
   * cause gate here; the action-level `leaveCause` stays authoritative.
   */
  leaveReason?: "effect";
  /**
   * `wouldBeReturned` SubTrigger `sourceFilter` only (CAP-C-11): fire only for these
   * destinations. Absent means any destination.
   */
  returnDestination?: Array<"hand" | "deck" | "trash">;
  /**
   * Inside a Replacement body: resolve to the permanent that triggered the replacement
   * (`ctx.trigger.deletedPermanentId` / `subjectPermanentId`) rather than scanning the board.
   * BT19-053 places the Royal Base Digimon that is about to leave, not a generic match.
   */
  useTriggerSource?: boolean;
  /**
   * Restrict to permanentIds in the named binding written by a preceding `bindResultAs`.
   * An unbound or empty ref matches nothing — never invent targets.
   */
  boundRef?: string;
  /**
   * The complement of `boundRef`: exclude permanents bound under these `SelectBind`/`bindAs`
   * handles ("delete all other Digimon" after choosing exemptions — EX11-011 binds one
   * exemption per player under different names). Matching ANY named binding excludes.
   */
  excludeSelectionRef?: string | string[];
  // There is deliberately no `playedByThisEffect` predicate. "The Digimon this effect played" is
  // expressed by `DelayedDelete`/`DelayedDeletePlayed` (which read ctx.lastPlayedPermanentIds)
  // or by `bindResultAs` + `boundRef`. The old field was read by no engine source, so every
  // filter carrying it silently matched EVERY permanent.
  /**
   * `whenPlayed` sourceFilter only: the play must be EFFECT-driven
   * (`TriggerInfo.playedByEffect`), which a manual play never sets. Encodes "when an effect
   * plays [X]" (KB Q3665/Q6034, EX5-058/EX5-062/BT15-068), unlike a bare "when your opponent
   * plays a Digimon" watcher, which omits this field and fires on any play.
   */
  byEffect?: boolean;
  byOwnEffect?: boolean;
  /**
   * Inherited digivolution-card watcher only: match the exact source stack-card instance that
   * was discarded by this event. The interpreter captures the source instance at install time
   * and compares it with the event payload after the card has moved, while the normal host anchor
   * keeps the subscription alive. This is intentionally separate from `isSelfRef`, which means
   * the current source permanent rather than a discarded stack card.
   */
  matchTrashedSource?: boolean;
  placedByThisEffect?: boolean;
  /**
   * An Option permanent that reached the battle area via a "place this card in the battle area"
   * effect (Cap-E-006, BT23-055). Options only ever get there that way, so this matches any
   * battle-area Option; `placedByThisEffect` scopes to THIS effect instance instead.
   */
  placedInBattleAreaByEffect?: boolean;
  /**
   * Deleted by the immediately preceding `DeleteByDPBudget` in this resolution, read from
   * `ctx.lastDeletedByThisEffectIds` and further narrowed by any other predicates here.
   */
  deletedByThisEffect?: boolean;
  /**
   * Count/match permanents from the simultaneous deletion snapshot carried by the current
   * `onDeletionOf` trigger. Unlike a live-board count, this remains available after the
   * deleted permanents have moved and can still be narrowed by controller/card predicates.
   */
  deletedByTrigger?: boolean;
  /**
   * Level equals the current attacker's, resolved at activation time; false when no attack is
   * in progress (EX12-069).
   */
  sameLevelAsAttacker?: boolean;
  /**
   * Inherited-effect SubTrigger `sourceFilter` only (BT2-059): the event subject must share its
   * name with the HOST permanent's top card. KB Q1024 — "this Digimon" in inherited text means
   * the host's current top-card name.
   */
  nameMatchesInheritedHost?: true;
}
