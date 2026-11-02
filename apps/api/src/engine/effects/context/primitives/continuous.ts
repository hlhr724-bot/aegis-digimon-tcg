import type { CardColor, CardDefinition, EffectDuration, Keyword, Seat } from "@aegis/shared";
import type { EnforcedRestriction } from "../restrictions.js";
import type { EffectContext } from "../../EffectContext.js";

/**
 * The static-continuous-effects subsystem: grants, prohibitions and stat
 * modifiers that stay live for a duration rather than resolving once.
 */
export interface ContinuousPrimitives {
  /**
   * Apply a continuous "can't <restriction>" rule to a permanent for a duration.
   * `fromSourceKind`, when provided, qualifies a `beAffected` entry so it blocks
   * only effects sourced from one of those card kinds (see `hasRestriction`).
   */
  /**
   * Record a continuous "can't …" prohibition on a permanent for a duration.
   *
   * `byOpponentEffectsOnly` matches the "…by your opponent's effects" wording most printed
   * protection uses: the prohibition then applies only while the OPPONENT of the restricted
   * permanent controls the resolving effect, leaving the controller's own effects free to
   * target it. Omit it for unscoped wording ("effects can't delete or trash it", EX9-005) and
   * for prohibitions that must also survive rule-based processing (BT18-086's 0 DP Digimon).
   * `byEffectsOnly` keeps an unscoped prohibition away from rule processing and battle
   * ("prevent effects from deleting it", BT7-064).
   */
  restrict(
    permanentId: string,
    restriction: EnforcedRestriction,
    duration: EffectDuration,
    opts?: {
      fromSourceKind?: string[];
      byOpponentEffectsOnly?: boolean;
      byEffectsOnly?: boolean;
      continuous?: boolean;
    },
  ): void;
  /**
   * Apply a live, duration-scoped restriction to every matching permanent a player controls.
   * `matchesAsDigimon` extends a "Digimon can't digivolve" rule to a Tamer digivolving as if it
   * is that Digimon (KB Q1157).
   */
  restrictPlayer?(
    seat: Seat,
    restriction: EnforcedRestriction,
    duration: EffectDuration,
    matches: (permanentId: string) => boolean,
    opts?: {
      sourceCardId?: string;
      effectText?: string;
      matchesAsDigimon?: (permanentId: string, asDigimon: CardDefinition) => boolean;
      fromSourceKind?: string[];
      byOpponentEffectsOnly?: boolean;
      byEffectsOnly?: boolean;
    },
  ): void;
  /**
   * Prevent one attacker from declaring an attack against one exact opposing Digimon while
   * leaving player attacks and every other Digimon target legal (BT10-042 Venusmon).
   */
  restrictAttackTarget(attackerPermanentId: string, targetPermanentId: string, duration: EffectDuration): void;
  /**
   * Arm a BT23-024 "suspend-restriction-with-superlative-exception" source for `duration`
   * (the [All Turns] link trigger fires this with UntilOpponentTurnEnd). While armed, the
   * continuous-recompute static re-derives the affected opponent set each pass.
   */
  armSuspendRestrictionSource?(permanentId: string, duration: EffectDuration): void;
  /** Whether a BT23-024 suspend-restriction source is currently armed (consuming read). */
  hasSuspendRestrictionSource?(permanentId: string): boolean;
  /**
   * Whether `permanentId` carries a `beAffected` immunity that blocks effects sourced from
   * `sourceKind` (e.g. `"Option"`). Returns false when absent or when the entry's
   * `fromSourceKind` list does not include `sourceKind`. Used by target resolution to exclude
   * immune permanents from an opponent effect's candidate set (CAP-A8, BT19-089).
   */
  isBeAffectedBySourceKind?(permanentId: string, sourceKind: string): boolean;
  /**
   * True when the permanent carries an UNQUALIFIED `beAffected` restriction (immune to ALL
   * sources, e.g. GrantImmunity "not affected by your opponent's effects"). Source-kind-qualified
   * entries are NOT reported here. Used by target resolution to exclude an immune permanent from
   * an opponent effect of any kind (CAP-C-06, BT19-101).
   */
  isUnaffectableByOpponentEffects?(permanentId: string): boolean;
  /**
   * Whether an effect of the permanent's own controller cannot affect it. Only `beAffected`
   * entries not scoped to the opponent's effects count, such as LM-020's declared card
   * category (Q2657). `sourceKinds` selects the source-kind-qualified entries that apply.
   */
  isUnaffectedByOwnEffects?(permanentId: string, sourceKinds: readonly string[]): boolean;
  /**
   * Record a positive "can only digivolve into [X]" constraint on a permanent (EX10-035). The
   * `matchesInto` predicate is satisfied by the allowed evolving card's definition; the
   * digivolve-legality check rejects any other digivolve onto this permanent.
   */
  restrictDigivolveInto?(
    permanentId: string,
    matchesInto: (def: CardDefinition) => boolean,
    duration: EffectDuration,
  ): void;
  /**
   * Record a continuous "can't have less than `floor` DP" clamp on a permanent (EX11-070's
   * inherited rule implementation; KB Q5941). Applied in the DP-calc layer AFTER all +/- changes are
   * summed (NOT a per-change clamp), distinct from `modifyDp`. The highest active floor binds.
   */
  minDpFloor?(permanentId: string, floor: number, duration: EffectDuration): void;
  /**
   * Record a continuous "your opponent's effects can't trash this Digimon's stacked cards" lock
   * on a permanent (EX11-070's rule implementation; KB Q5943). Consulted by the
   * digivolution-card trash sites (trashDigivolutionCards / deDigivolve) against the trashing
   * effect's seat; the controller's OWN effects still trash.
   */
  stackTrashLock?(permanentId: string, duration: EffectDuration): void;
  seatStackTrashLock?(ownerSeat: Seat, duration: EffectDuration): void;
  /**
   * Protect one specific digivolution-card instance from being trashed by effects, including
   * its controller's effects (BT9-109 X Antibody). Rule-driven moves do not consult this lock.
   */
  stackCardTrashLock?(instanceId: string, ownerSeat: Seat, duration: EffectDuration): void;
  securityAttackInvert?(permanentId: string, duration: EffectDuration): void;
  /** Install a deletion at the owner, opponent, or current turn end on one played permanent. */
  delayedDeletePlayed?(
    playedPermanentId: string,
    timing?: "endOfOwnerTurn" | "endOfOpponentTurn" | "endOfCurrentTurn",
    sourceCardId?: string,
  ): void;
  /**
   * Install a one-shot end-of-turn memory change for `seat` ("Gain 3 memory. At the end of
   * your turn, lose 3 memory" — BT1-021). Anchor-less: the delayed change fires at the
   * OnEndTurn window even if the installing permanent left the field first (KB Q882/Q883).
   */
  delayedGainMemory?(seat: Seat, amount: number, activationContext?: EffectContext): void;
  /** Grant a continuous name/trait alias to a permanent ("also treated as [X]"). */
  grantNameTrait(
    permanentId: string,
    kind: "name" | "trait",
    tokens: string[],
    duration: EffectDuration,
    opts?: { digiXrosOnly?: boolean; fromRule?: boolean; nameContainsOnly?: boolean },
  ): void;
  /** Grant names whose current values are recomputed from live game state. */
  grantDynamicNames?(permanentId: string, names: () => string[], duration: EffectDuration): void;
  /** Replace printed/original info while effect-granted aliases and colors stay additive. */
  setOriginalCardInfo(
    permanentId: string,
    info: { name?: string; colors?: CardColor[] },
    duration: EffectDuration,
  ): void;
  /**
   * Grant a keyword ability to a permanent for a duration ("gains ＜Blocker＞").
   * ＜Piercing＞ has a dedicated `grantPierce`; this records every other keyword.
   */
  grantKeyword(
    permanentId: string,
    keyword: string,
    duration: EffectDuration,
    amount?: number,
    opts?: {
      continuous?: boolean;
      active?: () => boolean;
      specifiers?: string[];
      sourceCardId?: string;
      sourceInstanceId?: string;
      sourceEffectText?: string;
      /** Controller and physical kinds of the effect that granted this keyword. */
      sourceSeat?: Seat;
      sourceKinds?: string[];
    },
  ): void;
  /** Treat a permanent as another level only while matching DNA requirements. */
  grantDnaLevel(permanentId: string, level: number, opts?: { intoNames?: string[]; continuous?: boolean }): void;
  orderDnaMaterials?(materialPermanentIds: string[], resultInstanceId: string): string[] | undefined;
  /** Pure legality check used before offering an effect-driven DNA result. */
  canDnaDigivolve?(
    materialPermanentIds: string[],
    resultInstanceId: string,
    extraMaterialInstanceIds?: string[],
  ): boolean;
  /** Grant a keyword to all current and future Digimon permanents controlled by a player. */
  grantPlayerKeyword(
    seat: Seat,
    keyword: string,
    duration: EffectDuration,
    amount?: number,
    opts?: { ownerSeat?: Seat; matches?: (permanentId: string) => boolean; sourceCardId?: string; effectText?: string },
  ): void;
  /**
   * Keywords currently GRANTED to a permanent (the consuming read of `grantKeyword`).
   * A filter's keyword-presence clause ("Digimon with ＜Security Attack＞") must see
   * keywords conferred by ＜...+/-＞ grants, not only the printed text (KB BT12-040 Q2172:
   * "Digimon with ＜Security Attack＞" refers to Digimon affected by SA+/SA- effects).
   */
  grantedKeywords?(permanentId: string): { keyword: string; amount?: number }[];
  /**
   * Consume (remove) the first active keyword grant matching `permanentId` + `keyword`.
   * Used to implement arm-and-consume `＜Delay＞` gating: a `GainKeyword(Delay)` arms the
   * source on one turn; when the gated play resolves, `revokeKeyword(id, "Delay")` consumes
   * the grant so subsequent turns cannot re-fire the play without re-arming.
   */
  revokeKeyword?(permanentId: string, keyword: string): void;
  /**
   * Grant a `<Link +N>` link-limit modifier to a permanent.
   * `delta` is signed; `linkMax` sums every active grant on top of the base 1.
   */
  grantLinkMax(permanentId: string, delta: number, duration: EffectDuration, opts?: { continuous?: boolean }): void;
  /**
   * Install a recipient-scoped link-cost-reduction grant on `permanentId` (documented behavior
   * `rule implementation`): while active, a card carrying one of `traits` that would link
   * to this permanent has its link cost reduced by `amount`. `runLink`/`linkCostOf` read it.
   */
  grantLinkCostReduction(
    permanentId: string,
    amount: number,
    traits: string[],
    duration: EffectDuration,
    opts?: {
      sourceCardId?: string;
      sourceInstanceId?: string;
      controllerSeat?: Seat;
      optional?: boolean;
      oncePerTurnKey?: string;
    },
  ): void;
  linkCostReductionUsed?(key: string): boolean;
  markLinkCostReductionUsed?(key: string): void;
  /**
   * Grant a card kind to a permanent for a duration ("this Tamer is also treated as
   * a Digimon"). Recorded on the ContinuousEffectLedger; the permanent's effective
   * kinds union static def.kinds with active grants. Swept/dropped/cleared with the
   * ledger's DurationBoundary lifecycle (HARD-01). `kinds` are CardKind values
   * (e.g., [CardKind.Digimon]).
   */
  grantKind?(permanentId: string, kinds: import("@aegis/shared").CardKind[], duration: EffectDuration): void;
  /**
   * Record a generic custom grant on a permanent for `duration` (the "everything else"
   * catch-all for GrantStatic actions the interpreter parsed but does not have explicit
   * primitives for — e.g. "quotedEffect", "attackImmunity", "dpReductionImmunity").
   * Stored in-memory, keyed by permanentId; `grant`'s keys are opaque to this primitive.
   * NO CONSUMER reads this store back today — recording is honest authored state (not a
   * silent no-op the way an unassigned primitive would be), but each grant kind stays
   * behaviorally inert until a subsystem is built to interpret it. Always assigned by
   * `createPrimitives` (guarded by `primitives.test.ts`'s completeness check); do not rely
   * on `?.()` to make an unimplemented call "safe" — implement or delete instead.
   */
  grantCustom?(permanentId: string, grant: Record<string, unknown>, duration: EffectDuration): void;
  /**
   * Grant a NAMED built-in effect onto a permanent for `duration` (GrantStatic grant:"effects"
   * built-in effect (e.g. "OnDeletionDeleteLowest" — RB1-030's granted "[On Deletion] Delete 1
   * of your opponent's Digimon with the lowest level"). The effect collector compiles the token
   * to a real Effect anchored on the granted permanent, so it fires through the SAME timing
   * window (OnDestroyedAnyone for an [On Deletion]) as a printed effect — the grant is not a
   * parallel/inert path. Duration-scoped: lapses at its boundary or when the host leaves play.
   */
  grantCustomEffect?(
    instanceId: string,
    ownerSeat: Seat,
    token: string,
    duration: EffectDuration,
    opts?: {
      /** Shared by every materialization of one resolved grant; distinct resolutions stack. */
      activationIdentity?: object;
      /** Re-evaluated when the granted effect would trigger. */
      isActive?: () => boolean;
      /** Explicit continuous-pass provenance; avoids ambient async-scope races. */
      continuous?: boolean;
      /** The card whose effect grants the clause. */
      sourceCardId?: string;
    },
  ): void;
  /** Grant a named effect to every matching current/future permanent controlled by `seat`. */
  grantPlayerCustomEffect?(
    seat: Seat,
    ownerSeat: Seat,
    token: string,
    duration: EffectDuration,
    matches: (permanentId: string) => boolean,
  ): void;
  /** Active named effects granted to a permanent, for live text-presence filters. */
  customEffectGrants?(permanentId: string): readonly { token: string }[];
  /**
   * Record a seat-level "can't ignore digivolution requirements" rule (documented behavior
   * `rule implementation`). Normal and effect-driven digivolve legality
   * consult this rule before applying any whole- or partial-requirement waiver.
   */
  cannotIgnoreDigivolution(seat: Seat, duration: EffectDuration): void;
  /** Whether a live rule currently forbids `seat` from ignoring digivolution requirements. */
  isDigivolutionRequirementIgnoreBlocked?(seat: Seat): boolean;
  /**
   * Grant a continuous additional COLOR to a permanent ("[Your Turn] This Digimon is also
   * treated as blue"). The permanent's effective color set becomes its printed colors UNIONED
   * with every active grant; the color-legality consumers
   * (digivolve EvoCost color check, play-time color requirement) read the effective set. The
   * grant lapses when the source leaves play or its `when` gate stops holding — the
   * static-continuous-effects lifecycle. `color` is a CardColor value (e.g. CardColor.Blue).
   */
  addColorGrant(permanentId: string, color: CardColor, duration: EffectDuration): void;
  /**
   * Record that an instance may be used/played without meeting its color requirement, or —
   * with `alsoColor` — that one extra colour ALSO satisfies the printed requirement
   * ("Black also meets this card's colour requirements").
   */
  waiveColorRequirement(instanceId: string, duration: EffectDuration, opts?: { alsoColor?: CardColor }): void;
  /**
   * Confer all effects of a digivolution-stack card onto its owning permanent
   * (GrantStatic grant:"effects").
   */
  conferStackEffects(
    targetPermanentId: string,
    stackInstanceId: string,
    duration: EffectDuration,
    opts?: {
      trigger?: string;
      excludeInherited?: boolean;
      excludeKeywords?: Keyword[];
      inheritedOnly?: boolean;
      granterInstanceId?: string;
    },
  ): void;
  /** Read the currently active stack-effect conferrals (for effects that borrow another card's skills). */
  stackEffectConferrals?(): readonly {
    targetPermanentId: string;
    stackInstanceId: string;
    trigger?: string;
    excludeInherited?: boolean;
    excludeKeywords?: Keyword[];
    inheritedOnly?: boolean;
    granterInstanceId?: string;
  }[];
  /**
   * Also offer a permanent's `[On Deletion]` effects — its own printed ones AND the inherited
   * ones its digivolution cards provide — at the end of its own attack (BT16-015's "attach
   * [End of Attack] to all of this Digimon's [On Deletion] effects"). The projected copies are
   * the SAME effects collected in a different window, so their own conditions still gate them
   * (KB BT16-015 Q2614), and the projection rides the continuous tier so it lapses with its
   * source clause (Q2615).
   */
  projectOnDeletionAtEndOfAttack?(permanentId: string, duration: EffectDuration): void;
}
