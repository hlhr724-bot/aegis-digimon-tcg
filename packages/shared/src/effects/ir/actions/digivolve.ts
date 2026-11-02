// Digivolving, de-digivolving, and moving cards into a digivolution stack.

import type { EffectDurationRef } from "#shared/effects/ir/durations";
import type { CardColor } from "#shared/schema/enums";
import type { Filter, Target } from "#shared/effects/ir/filters/filter";
import type { ZoneRef } from "#shared/effects/ir/filters/zones";
import type { Scaling } from "#shared/effects/ir/predicates/scaling";
import type { ActionBase } from "#shared/effects/ir/actions/base";

/**
 * Widen the DigiXros material source zones at BeforePayCost time (BT19-079 "from under your
 * Tamers", BT19-087 "from under Tamers + trash"). Recorded per-seat for `duration` and read by
 * the material-picking path.
 */

export interface DeDigivolveAction extends ActionBase {
  kind: "DeDigivolve";
  target: Target;
  /**
   * Fixed peel count, or the dynamic "＜De-Digivolve 1＞ for each of this Digimon's face-down
   * digivolution cards" form (EX9-043), resolved against the source at run time.
   */
  amount: number | { kind: "countFaceDownDigivolutionCards"; host: "self" };
  /**
   * "You can't trash past level N cards": stop once the card that would become the new top is
   * at or below this level, leaving it in place. Absent peels up to `amount` unconditionally.
   */
  stopAtLevel?: number;
  /** Snapshot the opponent's post-De-Digivolve Digimon count before rule cleanup. */
  trackOpponentDigimonCountAs?: string;
}

export interface DigivolveAction extends ActionBase {
  kind: "Digivolve";
  /** Require a prior conditional Delay grant before this payload can be activated. */
  requiresDelayArmed?: true;
  /** What digivolves ("this Digimon", "1 of your Digimon"). */
  target: Target;
  /** Filter on the card digivolved into. */
  into?: Filter;
  /** Source zone for the card digivolved INTO; the interpreter resolves the pool. */
  from?: ZoneRef[];
  /** Restrict the source card to the enclosing trigger's loose source instance. */
  source?: "triggerSource" | "triggerTrashedFromHand";
  /**
   * A legacy prose-compiler encoding stores the fixed cost as a NUMBER, which the interpreter
   * normalizes to {@link DigivolveAction.costOverride}. New IR should use `true` + `costOverride`.
   */
  payCost: boolean | number;
  /** Pay the matching alternate digivolution requirement instead of an ordinary EvoCost. */
  useAlternateCost?: boolean;
  /**
   * Reduction folded INTO the digivolve verb, not a standalone cost-modifier construct.
   */
  costDelta?: number;
  /**
   * With `from` including `"security"`, the default path allows only FACE-UP security cards
   * (BT19-084). This lets the controller see and pick face-down ones.
   */
  faceDownSecurityOk?: boolean;
  /** Restrict the source card to cards revealed by the immediately preceding Search. */
  amongPreviousSearch?: boolean;
  /** Alternative spelling of `costDelta`. */
  reduceCost?: number;
  /**
   * Reduction folded into the digivolve verb whose amount is counted at resolution time
   * (BT21-082). It must NOT be modelled as a separate `wouldDigivolve` replacement — a
   * replacement installed alongside the action cannot reach the action's own digivolve. Stacks
   * with the fixed `reduceCost`/`costDelta`.
   */
  reduceCostScaling?: Scaling;
  /** Alternative name for `into`. */
  onto?: Filter;
  ignoreReqs?: boolean;
  costOverride?: number;
  /** Level to treat the digivolving Digimon as, for requirements. */
  asLevel?: number;
  /** Printed virtual identity used to check evolution requirements (for example, a Tamer as a level 5 red Digimon). */
  virtualBase?: { level: number; colors: CardColor[] };
  /** Alternative name for `ignoreReqs`. */
  ignoreRequirements?: boolean;
  /** Alternative name for `ignoreReqs`. */
  ignoreDigivolutionRequirements?: boolean;
  /** Ignore only the level requirement, preserving the action's explicit filters. */
  ignoreLevelRequirement?: boolean;
  /** Allow a printed optional digivolution branch to activate and end cleanly with no target. */
  allowNoTarget?: boolean;
  /** The card digivolved into must share a color with the chosen base. */
  colorsMatchDigivolvingSource?: boolean;
  /** Destination name must include the selected base permanent's name (EX4-072). */
  nameIncludesDigivolvingTarget?: boolean;
  /** Destination name must differ from the selected base permanent's name. */
  differentNameFromDigivolvingTarget?: boolean;
  /** Store the resulting permanent id for a downstream `filter.boundRef` or condition. */
  bindResultAs?: string;
}

/** Static registration metadata for "digivolve from hand onto a Tamer as level N". */
export interface TamerOntoDigivolveAction extends ActionBase {
  kind: "TamerOntoDigivolve";
  onto: Filter;
  asLevel: number;
  from: ZoneRef[];
}

export interface DigivolveViaPlacementAction extends Omit<ActionBase, "cost"> {
  kind: "DigivolveViaPlacement";
  placeCost: {
    kind: "placeFromTrash";
    target: Target;
    destination: "digivolutionStack";
    position: "bottom";
    hostFilter: Filter;
    raw?: string;
  };
  into: Target;
  cost: number;
  ignoreLevelRequirement?: boolean;
  ignoreDigivolutionRequirements?: boolean;
}

export interface PlaceUnderAction extends ActionBase {
  kind: "PlaceUnder";
  /**
   * Suppress card identities in the selection decision while retaining opaque instance ids.
   * Used for effects that choose from a hidden zone "without looking" (EX10-059).
   */
  blind?: boolean;
  /** Cards placed as digivolution cards or under a Tamer. */
  target: Target;
  /** When sourcing from under Tamers, restrict the selected cards to one Tamer host. */
  underTamerHostScope?: "single" | "any";
  /** Legacy compiler shape: printed placement quantity stored on the action instead of `target.count`. */
  count?: number | "all";
  underFilter?: Filter;
  /**
   * Place the top card of the Digi-Egg deck instead of a card resolved by `target` (BT13-007,
   * EX6-006). Routed through `placeUnderFromEggDeck`; `target` stops being a card source, while
   * the source permanent / `underFilter` still selects the host. Distinct from `targetIsPermanent`.
   */
  fromEggDeck?: boolean;
  /** Group the top Digi-Egg card with target permanents into one ordered placement (BT13-007/Q2264). */
  groupedEggAndPermanents?: boolean;
  fromDeckTop?: boolean;
  /**
   * With `fromEggDeck`: place the egg as the host's TOP digivolution card, revealed, rather than
   * the default bottom (BT22-007; KB Q4856). A non-matching egg-deck top is returned untouched
   * when `target.filter` carries a predicate. Routed through `placeAsTopFromEggDeck`.
   */
  asTop?: boolean;
  /**
   * `target` is a battle-area PERMANENT being relocated under the host, whole stack included,
   * rather than loose cards from hand or trash.
   */
  targetIsPermanent?: boolean;
  /** When relocating a permanent, attach only its top card and trash its existing sources/links. */
  shedOwnCards?: boolean;
  /** Move every Digimon card from one selected permanent's stack under a selected host. */
  fromSelectedPermanentDigivolutionCards?: boolean;
  /**
   * The host is itself a prior `Target.bindAs` selection (the second `Mode.Custom` select, whose
   * predicate is `permanent != selectedPermanent`). Used instead of resolving `underFilter`.
   */
  underSelectionRef?: string;
  position?: string;
  /** Store the number of distinct printed names actually placed by this action (EX6-073). */
  trackDistinctNames?: string;
  /** Let the controller arrange multiple selected cards before they enter the stack. */
  order?: "any";
  /**
   * Descriptive: the placeUnder primitive already marks effect-placed loose cards face-down.
   * The flag preserves the printed intent (EX9-043) and feeds face-down-count readers such as
   * `DeDigivolveAction`'s dynamic amount.
   */
  faceDown?: boolean;
  source?: string;
  /** Store the chosen host permanent id for downstream actions. */
  bindHostAs?: string;
  /**
   * Narrow the loose-card pool for `target` (BT19-038: `["hand", "trash"]`); absent falls back
   * to the legacy hand/trash/deck sweep. Older IR records spell this `target.from`.
   */
  from?: ZoneRef[];
  /**
   * Select the host permanent independently of the placed card's filter (BT19-038 "place 1 Tamer
   * you control under 1 of your [Xros Heart]/[Blue Flare] Digimon"). Absent makes the source
   * permanent, or `underFilter`, the host.
   */
  destination?: { filter: Filter; count: number };
  /** Select a single exact count from battle-area permanents, their linked cards, and trash.
   * Battle-area permanents are relocated with their stacks; loose cards are placed normally.
   * Used by BT26-102's mixed Seven Code material cost. */
  mixedSources?: {
    sourcePermanent?: boolean;
    battleAreaPermanents?: boolean;
    linkedCards?: boolean;
    trash?: boolean;
    hand?: boolean;
  };
  /**
   * Place as DigiXros materials for the Digimon being played — the trigger source of the
   * enclosing `wouldBePlayed` Replacement — via the materials slot rather than the digivolution
   * stack. BT19-081 uses it to extend the legal material pool to cards under the controller's Tamers.
   */
  asDigiXrosMaterial?: boolean;
  /**
   * Store how many cards were actually placed, for a later `unit:"namedCount"` scaling or
   * `levelComparison.scaling` (EX6-015).
   */
  trackCount?: string;
}

/**
 * "Trash the top/bottom digivolution card of <target>". Distinct from De-Digivolve, which sends
 * the TOP card to the deck and reverts a stage — this removes a source card and leaves the
 * Digimon's stage unchanged.
 */
export interface TrashDigivolutionAction extends ActionBase {
  kind: "TrashDigivolution";
  target: Target;
  /** Restrict which cards in each selected digivolution stack may be trashed. */
  cardFilter?: Filter;
  /** Default 1. */
  amount?: number | "all";
  /** Lower bound for an "up to `amount`" trash; the payment fails below it. */
  minAmount?: number;
  /** The default source form. */
  fromTop?: boolean;
  /** Allow choosing fewer than `amount`; when sources exist, at least one is required. */
  upTo?: boolean;
  position?: string;
  /**
   * `"acrossDigimon"` pools digivolution cards from ALL matching permanents and lets the
   * controller pick `amount` from the combined pool (EX12-035). Default is the first-resolved
   * permanent only.
   */
  scope?: "acrossDigimon";
  /**
   * The controller freely picks `amount` cards from the whole stack (RB1-016; KB Q4094) instead
   * of a deterministic `fromTop`/bottom slice.
   */
  choose?: boolean;
  /** Store the number of cards actually trashed for a later named-count scaling. */
  trackCount?: string;
}

/**
 * "[All Turns] players can't ignore digivolution requirements" (KB Q1738-Q1743): a seat-level
 * continuous rule-modifier suppressing other cards' ignore-requirements effects for BOTH players
 * (Q1738). DNA/Burst and no-cost digivolves are unaffected (Q1739/Q1740), as is adding
 * digivolution info (Q1743); ignoring PART of the requirements is blocked (Q1741/Q1742).
 */
export interface CannotIgnoreDigivolutionRequirementsAction extends ActionBase {
  kind: "CannotIgnoreDigivolutionRequirements";
  /** BT8-059 affects both players (Q1738). */
  affects: "both";
  duration: EffectDurationRef;
}

/**
 * "You may use/play this card without meeting its color requirements" and the "ignore this
 * card's color requirements" family. A continuous permission, never a no-op once recorded.
 */
export interface WaiveColorRequirementAction extends ActionBase {
  kind: "WaiveColorRequirement";
  /** Defaults to the source card. */
  target?: Target;
  /** Alternative specification of which color is waived. */
  color?: string;
  duration?: EffectDurationRef;
}
