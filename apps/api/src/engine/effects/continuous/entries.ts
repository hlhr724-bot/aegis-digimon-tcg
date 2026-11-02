import { CardKind, EffectDuration, type CardColor, type CardDefinition, type Seat, type Keyword } from "@aegis/shared";
import type { Restriction } from "../EffectContext.js";

/**
 * What the ledger stores for each kind of continuous effect a permanent or player
 * can carry: the prohibitions, and the grants that hand out keywords, names,
 * colors, kinds and link allowances.
 */

export interface RestrictionEntry {
  permanentId: string;
  restriction: Restriction;
  duration: EffectDuration;
  /** Seat whose effect installed this restriction; used to suppress it under effect immunity. */
  originSeat?: Seat;
  /** Printed source kinds of the effect that installed this restriction. */
  sourceKinds?: string[];
  continuous?: boolean;
  /**
   * When set, this `beAffected` entry blocks ONLY effects whose source card is
   * one of these kinds. An entry without `fromSourceKind` blocks regardless of
   * source (existing behavior).
   */
  fromSourceKind?: string[];
  /**
   * When set, this entry blocks ONLY effects controlled by the restricted permanent's
   * opponent — the "…by your opponent's effects" wording most printed protection uses
   * (BT14-062, BT11-060, BT18-064, …). An entry without it blocks regardless of who
   * controls the effect ("effects can't delete or trash it", EX9-005).
   */
  byOpponentEffectsOnly?: boolean;
  /**
   * When set, this entry blocks effects only; rule processing and battle ignore it
   * ("prevent effects from deleting it", BT7-064).
   */
  byEffectsOnly?: boolean;
}

export interface PlayerRestrictionEntry {
  sourceCardId?: string;
  effectText?: string;
  seat: Seat;
  ownerSeat: Seat;
  restriction: Restriction;
  duration: EffectDuration;
  matches: (permanentId: string) => boolean;
  /**
   * For a "Digimon can't digivolve" rule: whether it also locks a Tamer that digivolves as if
   * it is the Digimon `asDigimon` (KB Q1157). The Tamer is not a Digimon on the board, so
   * `matches` never selects it.
   */
  matchesAsDigimon?: (permanentId: string, asDigimon: CardDefinition) => boolean;
  continuous?: boolean;
  /** Same scoping as a per-permanent restriction: block only effects from these card kinds. */
  fromSourceKind?: string[];
  /** Same scoping as a per-permanent restriction: block only the restricted player's opponent's effects. */
  byOpponentEffectsOnly?: boolean;
  /** Same scoping as a per-permanent restriction: rule processing and battle are not blocked. */
  byEffectsOnly?: boolean;
}

export interface AttackTargetRestriction {
  attackerPermanentId: string;
  targetPermanentId: string;
  duration: EffectDuration;
  continuous?: boolean;
}

export interface NameTraitGrant {
  permanentId: string;
  kind: "name" | "trait";
  tokens: string[];
  duration: EffectDuration;
  continuous?: boolean;
  /** True when the alias is original card information supplied by a printed (Rule). */
  fromRule?: boolean;
  /** "Name also contains [X]": satisfies inclusion filters but is not an exact name (Q7377). */
  nameContainsOnly?: boolean;
  /** When true, this name alias is ONLY valid for DigiXros material matching. */
  digiXrosOnly?: boolean;
  dynamicTokens?: () => string[];
}

export interface OriginalCardInfoOverride {
  permanentId: string;
  name?: string;
  colors?: string[];
  duration: EffectDuration;
  continuous?: boolean;
  /** Controller and card kinds of the effect that produced this override. */
  sourceSeat?: Seat;
  sourceKinds?: string[];
}

export interface PlayerKeywordGrant {
  sourceCardId?: string;
  effectText?: string;
  seat: Seat;
  keyword: string;
  amount?: number;
  duration: EffectDuration;
  /** Controller of the granting effect, whose turn a relative duration counts; defaults to `seat`. */
  ownerSeat?: Seat;
  /** Live target filter ("all of your Digimon with ＜Reboot＞"); omit to grant every Digimon. */
  matches?: (permanentId: string) => boolean;
}

export interface PlayerCustomEffectGrant {
  seat: Seat;
  ownerSeat: Seat;
  token: string;
  duration: EffectDuration;
  activationIdentity: object;
  matches: (permanentId: string) => boolean;
}

/**
 * A positive attack-legality grant: the attacker MAY also attack an opponent's
 * unsuspended Digimon (rule implementation, e.g. ST12-08). The base
 * rule lets a Digimon attack only a SUSPENDED defender; this grant relaxes that for the
 * granted attacker while active. Read by combat/legality.canAttackTarget.
 */
export interface CanAttackUnsuspendedGrant {
  permanentId: string;
  duration: EffectDuration;
  continuous?: boolean;
  /** Grant only applies to defenders with no digivolution cards (EX1-016/BT7-095). */
  noDigivolutionCards?: boolean;
  /** Grant only applies to defenders at or below this printed level (EX1-061). */
  defenderLevelMax?: number;
}

export interface VortexCanAttackPlayersGrant {
  permanentId: string;
  duration: EffectDuration;
  continuous?: boolean;
}

/**
 * An ARMED "suspend-restriction-with-superlative-exception" source (BT23-024). The source
 * permanent's [All Turns] link trigger arms this for a duration ("until their turn ends" =>
 * UntilOpponentTurnEnd). While armed, the continuous-recompute pass re-derives the affected
 * opponent set (all opponent Digimon MINUS the recomputed highest-play-cost one) and records a
 * fresh `suspend` restriction per affected permanent — so the exempt set tracks board changes
 * each pass (KB BT23-024 Q5250/Q5252 recompute). The armed marker itself is a one-shot,
 * duration-scoped entry (NOT continuous): it survives recomputes and clears at its boundary.
 */
export interface SuspendRestrictionSource {
  permanentId: string;
  duration: EffectDuration;
}

export interface UnsuspendedDigivolveProhibition {
  seat: Seat;
  sourceSeat: Seat;
  duration: EffectDuration;
}

/**
 * A positive digivolve-target constraint (EX10-035 "this Digimon can only digivolve into
 * [Apocalymon]"). The permanent may digivolve ONLY into a card whose definition satisfies
 * `matchesInto`; the digivolve-legality check rejects any other evolving card. The matcher is
 * supplied by the IR interpreter (built from the action's `into` filter) so the ledger stays
 * decoupled from the filter shape.
 */
export interface DigivolveIntoConstraint {
  permanentId: string;
  matchesInto: (def: CardDefinition) => boolean;
  duration: EffectDuration;
  continuous?: boolean;
}

export interface ColorWaiver {
  /** The instance whose color requirement is waived (a card in hand/security). */
  instanceId: string;
  /**
   * When set, the requirement is NOT waived outright: this colour ALSO satisfies it
   * ("Black also meets this card's colour requirements" — the LM Memory Boost family).
   * Absent means the blanket "you can ignore this card's colour requirements" waiver.
   */
  alsoColor?: CardColor;
  duration: EffectDuration;
  continuous?: boolean;
}

export interface KeywordGrant {
  permanentId: string;
  /** The granted keyword name (e.g. "Blocker", "Rush", "Jamming"). */
  keyword: string;
  /** Optional numeric param (e.g. Security Attack +N). */
  amount?: number;
  duration: EffectDuration;
  continuous?: boolean;
  /** Live recipient condition for duration-scoped conditional grants. */
  active?: () => boolean;
  /** Parameterized keyword alternatives, e.g. Decoy (Black/White). */
  specifiers?: string[];
  /** Exact card/clause that granted the keyword, including inherited sources. */
  sourceCardId?: string;
  sourceInstanceId?: string;
  sourceEffectText?: string;
  /** Provenance used to suppress (but retain) opponent-granted effects under immunity. */
  sourceSeat?: Seat;
  sourceKinds?: string[];
}

export interface LinkMaxGrant {
  permanentId: string;
  /** Signed change to the link limit (`<Link +1>` => 1, `<Link +2>` => 2). */
  delta: number;
  duration: EffectDuration;
  continuous?: boolean;
}

/**
 * A recipient-scoped LINK-cost-reduction grant (documented behavior `rule implementation` +
 * `UntilCalculateFixedCostEffect`, documented behavior). Keyed by the RECIPIENT permanent (the
 * Digimon a card would link TO): while active, a would-link card whose definition carries one of
 * `traits` has its link cost reduced by `amount`. `runLink`/`linkCostOf` read the recipient's
 * grant in addition to the declaring action's `costDelta`. Per KB BT25-089 Q6423 the reductions
 * do NOT stack on one declaration, so the read (`linkCostReduction`) returns the LARGEST single
 * matching grant rather than their sum. Real authoritative state, never client-supplied; cleared
 * and re-derived each continuous-recompute pass (CR-01) like every other continuous grant.
 */
export interface LinkCostReductionGrant {
  /** The link recipient the reduction is installed on. */
  permanentId: string;
  /** Magnitude of the reduction (positive). */
  amount: number;
  /** Lowercased trait tokens a would-link card must carry for the reduction to apply. */
  traits: string[];
  duration: EffectDuration;
  continuous?: boolean;
  sourceCardId?: string;
  sourceInstanceId?: string;
  controllerSeat?: Seat;
  optional?: boolean;
  oncePerTurnKey?: string;
}

export interface KindGrant {
  permanentId: string;
  /** Granted kind(s) — e.g., a Tamer becoming [Digimon]. */
  kinds: CardKind[];
  duration: EffectDuration;
  continuous?: boolean;
}

/**
 * A seat-level "players can't ignore digivolution requirements" rule (documented behavior
 * `rule implementation`, documented behavior; KB Q1738-Q1743). When active for a seat,
 * that seat may not use effects that IGNORE digivolution requirements (Q1741/Q1742); DNA/Burst,
 * no-cost digivolves, and adding-info effects are unaffected. The digivolve-legality path's
 * ignore-requirements hook consults `cannotIgnoreDigivolution(seat)`. (BT8-059 installs it for
 * BOTH seats — Q1738.) The substrate that this WOULD suppress — an in-engine ignore-requirements
 * path — does not yet exist, so the read currently has no caller; the flag is faithful authored
 */
export interface CannotIgnoreDigivolutionFlag {
  seat: Seat;
  duration: EffectDuration;
  continuous?: boolean;
}

export interface SecurityAddRestriction {
  blockedEffectSeat: Seat;
  granterSeat: Seat;
  duration: EffectDuration;
}

/**
 * A continuously-derived COLOR conferred onto a permanent ("[Your Turn] This Digimon is
 * also treated as blue"). The permanent's EFFECTIVE color set is its printed colors UNIONED
 * (BaseCardColors then each active IChangeCardColorEffect.GetCardColors appends, then
 * Distinct; documented behavior). Recorded as real authoritative server state, never supplied
 * by a client; the color-legality consumers (digivolve EvoCost color check, play-time color
 * requirement) read the effective set, not just the printed colors.
 */
export interface ColorGrant {
  permanentId: string;
  /** The granted color name (CardColor value, e.g. "Blue"). */
  color: string;
  duration: EffectDuration;
  continuous?: boolean;
}

/**
 * A "this Digimon's stacked cards can't be trashed by the opponent's effects" lock (EX11-070's
 * `permanentId`, an OPPONENT effect may not trash its digivolution-stack cards (TrashDigivolution
 * and `<De-Digivolve>`); the controller's OWN effects are unaffected (documented behavior EffectCondition =
 * IsOpponentEffect). The opponent-vs-own scope is resolved at the trash site (the host's
 * controller vs the trashing effect's seat), so the entry itself carries only the protected
 * permanent and its duration. Re-derived each continuous-recompute pass (CR-01).
 */
export interface StackTrashLock {
  permanentId: string;
  duration: EffectDuration;
  continuous?: boolean;
}

export interface SeatStackTrashLock {
  ownerSeat: Seat;
  duration: EffectDuration;
  continuous?: boolean;
}

/** One specific digivolution card that effects cannot trash (BT9-109 X Antibody). */
export interface StackCardTrashLock {
  instanceId: string;
  ownerSeat: Seat;
  duration: EffectDuration;
  continuous?: boolean;
}

export interface SecurityAttackInversion {
  permanentId: string;
  duration: EffectDuration;
  continuous?: boolean;
}

/** Stack-card effects conferred onto a permanent (GrantStatic grant:"effects"). */
export interface StackEffectConferral {
  targetPermanentId: string;
  stackInstanceId: string;
  continuous?: boolean;
  /** Limit the copied effects to the printed trigger (for example, only [Main]). */
  trigger?: string;
  /** When true, do not confer inherited effects from the matched stack card. */
  excludeInherited?: boolean;
  /** Keyword effects omitted by this particular copy. */
  excludeKeywords?: Keyword[];
  inheritedOnly?: boolean;
  /** Physical source of the grant; distinct grant sources confer distinct effect copies (Q1943). */
  granterInstanceId?: string;
}
