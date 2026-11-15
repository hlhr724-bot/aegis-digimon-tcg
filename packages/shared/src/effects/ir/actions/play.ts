// Playing cards from hand, deck, trash, and token generation.

import type { Filter, Target } from "../filters/filter.js";
import type { ZoneRef } from "../filters/zones.js";
import type { Cost } from "../predicates/costs.js";
import type { Scaling } from "../predicates/scaling.js";
import type { ActionBase } from "./base.js";

export interface PlayWithoutCostAction extends ActionBase {
  kind: "PlayWithoutCost";
  /**
   * A normalized printed "play or use" clause may select a DUAL card. Keep that physical card
   * in the shared picker and resolve its Option side. DUAL cards cannot be played.
   */
  chooseDualMode?: true;
  /** Security-effect play enters the battle area without conducting a security battle. */
  withoutBattle?: true;
  /** Restrict trash candidates to the cards moved by the current whenHandTrashed batch. */
  fromTriggerHandTrash?: boolean;
  playedByDecode?: boolean;
  /** What is played; `isSelf` for "play this card". */
  target: Target;
  /** "from your hand or trash", "from security". */
  from?: ZoneRef[];
  payCost: boolean;
  /** The printed clause has no play/use-cost ceiling; ignore any generated `playCostLte` bound. */
  ignorePlayCostLimit?: true;
  /**
   * Reduce the paid cost when `payCost` is true. Folded INTO the play verb rather than being a
   * standalone CostModifier, and floored at 0. Ignored for a free play.
   */
  reduceCostBy?: number;
  costOverride?: number;
  /** Additional fixed reduction when a runtime condition holds. */
  reduceCostByIf?: { amount: number; condition: import("../predicates/conditions.js").Condition };
  /**
   * Optional Assembly declaration available during this effect-driven paid play. The player may
   * select the exact material target from their trash; when selected, the material is placed under
   * the played Digimon and the additional fixed reduction is applied.
   */
  assembly?: { target: Target; reduceCostBy: number };
  /** Dynamic paid-cost reduction, commonly sourced from a prior action's named count. */
  reduceCostByScaling?: Scaling;
  /**
   * Source the played cards from the SOURCE permanent's OWN stack, not every permanent's
   * (BT22-007; KB Q4858/Q4859/Q4860 "play 3 or as many as possible"). `target.count` caps how
   * many and is satisfied as-many-as-possible. Required because the generic
   * `from:["digivolutionCards"]` path scans ALL stacks. Mutually exclusive with `from`.
   */
  fromOwnDigivolutionStack?: boolean;
  /**
   * Additional separately counted own-stack selections played simultaneously with `target`.
   * Select every group before playing one combined batch; a card cannot fill two groups.
   * Requires `fromOwnDigivolutionStack` (EX9-021's Greymon/Ver.1 and Garurumon/Ver.2).
   */
  additionalSimultaneousTargets?: Target[];
  /** Play entering SUSPENDED rather than active (BT7-063). Default enters active. */
  suspended?: boolean;
  /**
   * Play to the BREEDING area instead of the battle area (EX5-040; Comprehensive Rules §4-17-1).
   * Only Digimon/DigiEgg cards are breeding-playable (§6-4), and an occupied slot makes this a
   * no-op rather than a throw.
   */
  breeding?: boolean;
  /** Alternative to `reduceCostBy`. */
  costReduction?: number;
  suppressOnPlayEffects?: boolean;
  /** Alternative to `target`. */
  source?: Filter;
  costModifier?: { amount: number; [key: string]: unknown };
  /**
   * Drop candidates whose `nameEn` already appears among the controller's cards in the listed
   * zones — "play 1 [Deva] Digimon card ... without the same name as cards in the battle area or
   * trash" (EX5-001..012). Battle-area names are read from the top card.
   */
  notSameNameAs?: ("battleArea" | "trash")[];
  /**
   * Skip the action entirely unless the named zone is empty — "play ... to your EMPTY breeding
   * area" (BT18-101). Only "breedingArea" is supported.
   */
  requiresEmpty?: "breedingArea";
  /**
   * Offered only while the source has an active ＜Delay＞ grant, which resolution consumes:
   * armed on one turn, fires on another (P-243). Off-field sources always skip. Pairs with
   * `notEnteredThisTurn` and `GainKeyword(Delay)` as the arming write.
   */
  requiresDelayArmed?: true;
  /**
   * Adjust the target filter's `dp.value` ceiling by `amount × scaledCount` before resolving
   * candidates. `scaledCount` comes from `scalingSource` (a `namedCounts` value written by a
   * prior Trash `trackCount` — CAP-E13, BT20-077) or from a live `scaling` count (EX11-032).
   * A ceiling <= 0 leaves the pool empty.
   */
  dpCeilingModifier?: {
    mode: "lowerCeiling" | "raiseCeiling";
    amount: number;
    scalingSource?: string;
    scaling?: Scaling;
  };
  /**
   * Raise the target filter's `playCostLte` before resolving candidates:
   * `base + floor(matchingCards / per) * raise`. `base` overrides the filter's static
   * `playCostLte`. With `filter.zone === "trash"` and `filter.controller` set to "any" or "both", both
   * players' trashes count (CAP-E16, BT21-079).
   */
  playCostCeiling?: {
    base: number;
    raise: number;
    per: number;
    filter: Filter;
    unit: "cards" | "digivolutionCards" | "selfFaceDownDigivolutionCards";
    raw?: string;
  };
  /**
   * Bind the played permanent ids in `EffectContext.boundPlayed` so a later action can reference
   * "the Digimon this effect played" — BT16-015 compares an opponent's DP against it via
   * `Delete.target.filter.dp.valueFrom`.
   */
  bindResultAs?: string;
}

/**
 * Play any number of matching cards for free, capped by total printed play cost ("play any number
 * of [X] with play costs totaling N or less").
 */
export interface PlayMultipleAction extends ActionBase {
  kind: "PlayMultiple";
  totalCost: number;
  /** Dynamic budget: add `raise` to `base` for every `per` matching cards. */
  totalCostScaling?: {
    base: number;
    raise: number;
    per: number;
    filter: Filter;
    unit: "cards" | "digivolutionCards";
  };
  filter: Filter;
  from: ZoneRef | ZoneRef[] | "digivolution";
  payCost: boolean;
  suppressOnPlayEffects?: boolean;
}

/**
 * Play a card from a specified zone with an optional cost reduction (CAP-A10, BT19-099). When the
 * filter carries `playCost.relativeToLeavingDigimon`, the target's printed cost must equal the
 * triggering leaving Digimon's cost plus that offset, resolved at run time.
 */
export interface PlayFromZoneAction extends ActionBase {
  kind: "PlayFromZone";
  target: Target;
  from: ZoneRef[];
  /**
   * Extra loose zones for this play's optional DigiXros. The rule zones, hand and battle area
   * (comprehensive 7-2-1), are always offered.
   */
  digiXrosMaterialsFrom?: ZoneRef[];
  /** Treat the resolving source as this named DigiXros material when a ruling permits it. */
  digiXrosSourceMaterialName?: string;
  /** Floored at 0, default 0. Ignored when `payCost` is false. */
  costReduction?: number;
  /**
   * A DYNAMIC reduction scoped to THIS play, `scaleFactor(scaling)` added to `costReduction` and
   * floored at 0 (EX11-034; cf. BT19-096). Unlike a board-wide CostModifier it applies only here.
   */
  costReductionScaling?: Scaling;
  /** Default true. */
  payCost?: boolean;
  /** The player may decline; 0 selected is valid. */
  optional?: boolean;
  suppressOnPlayEffects?: boolean;
  /** Store the played permanent id(s) in `EffectContext.boundPlayed` for downstream reference. */
  bindResultAs?: string;
}

/**
 * "By returning N levels' total worth of Digimon cards, play 1 matching card of each returned
 * card's level without paying the cost."
 *
 * Per the BT20-098 errata: the paid selection's levels must sum to EXACTLY
 * `cost.target.totalLevels` and the cards go to the deck bottom; then, for each returned card at
 * level L, one card matching `playFilter` at level L is played free from trash. The played
 * permanent ids bind under `bindResultAs` for a downstream `Filter.boundRef`.
 */
export interface PlayPerLevelAction extends ActionBase {
  kind: "PlayPerLevel";
  cost: Cost;
  /** Zone + kind + name/trait predicate on the playable cards. */
  playFilter: Filter;
  /** Each played card's level must equal the corresponding returned card's. */
  matchLevel: boolean;
  payCost: boolean;
  bindResultAs?: string;
  suppressOnPlayEffects?: boolean;
}

/** A synthetic token minted by an effect rather than printed as a card. */
export interface TokenSpec {
  name: string;
  kind?: string;
  color?: string;
  dp?: number;
  keywords?: Array<{ keyword: string; amount?: number; colors?: string[] }>;
}

/** "Play N [X] Token(s) without paying the cost". */
export interface PlayTokenAction extends ActionBase {
  kind: "PlayToken";
  /** Token name tokens from `[X]` refs. */
  tokens: Array<string | TokenSpec>;
  count: number;
  payCost: boolean;
  /** Alternative to `tokens`. */
  token?: string | TokenSpec;
  /** Alternative to `count`. */
  amount?: number;
  /**
   * Which seat activates the play — attribution only. Placement is `placedAs`. Absent means the
   * source's controller.
   */
  controller?: "mine" | "opponent";
  /**
   * Place the token as the OPPONENT's permanent even though the source's controller activates it
   * — "they play 1 [Petrification] Token" (EX11-012, KB Q5800).
   */
  placedAs?: "opponentDigimon";
  /** Play the token already suspended. */
  suspended?: boolean;
  /**
   * Store the permanent ids of the tokens this action played, so a later action's
   * `filter.boundRef` affects exactly those tokens ("delete THAT token" — P-165) rather than
   * every identically named token on the board.
   */
  bindResultAs?: string;
}
