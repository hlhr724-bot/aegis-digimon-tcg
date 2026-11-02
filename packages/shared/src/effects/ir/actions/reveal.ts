// Revealing and searching deck, hand, trash, and security.

import type { Filter, Target } from "../filters/filter.js";
import type { Scaling } from "../predicates/scaling.js";
import type { Controller, ZoneRef } from "../filters/zones.js";
import type { ActionBase } from "./base.js";

export interface HandRevealAddAction extends ActionBase {
  kind: "HandRevealAdd";
  target: Target;
  securityFilter: Filter;
  toTop?: boolean;
}

export interface RevealAddAction extends ActionBase {
  kind: "RevealAdd";
  /** Whose deck is revealed; omitted means the source owner's deck. */
  controller?: Controller;
  revealCount: number;
  /**
   * An earlier category may not take a card that a later mandatory category with another
   * destination needs (BT10-097 Q2032, Q2033). Without it, each category chooses freely from
   * the cards that remain, in printed order (EX9-007 Q4750).
   */
  reserveForLaterSlots?: boolean;
  optionalAfterReveal?: true;
  /** Multiply the base reveal count by a live board-derived scale factor. */
  revealScaling?: Scaling;
  /**
   * A "digivolve into 1 revealed card" branch that runs before the add dispositions. When
   * declined or unavailable, an add slot marked `ifDigivolveDeclined` resolves as the printed
   * fallback (EX2-072 Blue Card).
   */
  digivolveOption?: {
    into: Filter;
    /** Restrict which battle-area Digimon may digivolve. */
    target?: Target;
    /** These effects currently digivolve without paying the evolution cost. */
    payCost: false;
    optional: true;
  };
  /**
   * What to do with matching revealed cards, and how many. Several specs may apply ("1 Digimon
   * and 1 Tamer"). `to` defaults to adding to hand.
   */
  add: {
    /** Printed selection clause for this category, shown instead of the entire reveal effect. */
    effectTextPart?: string;
    filter: Filter;
    /**
     * "Add 1 [X] trait or 1 Y card among them": `count` cards from the UNION of `filter` and
     * these, never one from each (KB Q2625).
     */
    orFilters?: Filter[];
    count: number | "all";
    /** Added to numeric `count` when a condition/scaling clause applies. */
    countModifier?: Target["countModifier"];
    to?: "hand" | "trash" | "play" | "useOption" | "digivolve" | "placeUnder" | "underTamer" | "security";
    /** For `to:"useOption"`: whether the Option's memory cost is paid. */
    payCost?: boolean;
    /** For `to:"play"`: the selected card enters the battle area suspended. */
    suspended?: boolean;
    /** For `to:"digivolve"`: which battle-area Digimon may receive the revealed card. */
    digivolveTarget?: Target;
    /** Place the selected card at the TOP of security (BT6-100). */
    toTop?: boolean;
    /** The selected card is placed face down after being publicly revealed. */
    faceDown?: boolean;
    /**
     * For `to: "play"` only: a play-cost REDUCTION (floored at 0) instead of the full waiver —
     * "play 1 [X] among them with the cost reduced by N" (BT25-074), which is not "without paying
     * the cost". Absent keeps the fully free play.
     */
    costDelta?: number;
    /**
     * Alternative dispositions for the SAME chosen card ("add it to hand OR place it as a bottom
     * digivolution card"): the card is selected once, then the controller picks between the
     * default `to` and these.
     */
    orDispositions?: {
      to: "hand" | "trash" | "play" | "useOption" | "digivolve" | "placeUnder" | "underTamer" | "security";
      underFilter?: Filter;
      /** Only offer this destination when the selected card also matches this filter. */
      filter?: Filter;
    }[];
    /**
     * "You may ..." forms: the player may take fewer than `count`, down to zero, even when enough
     * cards match. Without it a numeric `count` only prompts when more match than are wanted, and
     * `count: "all"` takes every match — both forced.
     */
    optional?: boolean;
    /** Compiler spelling of an explicit "up to N"; equivalent to `optional`. */
    upTo?: boolean;
    /** Resolve only when `digivolveOption` was declined or unavailable. */
    ifDigivolveDeclined?: boolean;
    /**
     * For `to: "play"` free plays only: take any number of matching cards whose SUMMED printed
     * play cost is <= this, instead of a fixed `count` (BT11-044, BT14-068). `count` is then
     * ignored and the selection is always optional (KB Q2085). The interpreter rejects an
     * over-budget selection server-side.
     */
    costBudget?: number;
    /** Compiler spelling of a summed printed play-cost budget. */
    totalPlayCostBudget?: number;
    /**
     * For `to` of `"placeUnder"`/`"underTamer"`: which of the controller's permanents the card is
     * placed beneath as a bottom digivolution card. Absent means any of their Digimon, or any of
     * their Tamers, respectively.
     */
    underFilter?: Filter;
    /**
     * Skip this slot unless at least this many revealed cards match its filter. KB Q3114
     * (BT19-055): with only 1 applicable card revealed, add it to hand — it cannot go under a
     * Tamer unless 2+ are found.
     */
    requiresMinRevealed?: number;
  }[];
  /** Trash every revealed card matching this before disposing of the rest. */
  trashFilter?: Filter;
  /** Where the rest go. */
  rest: "deckBottom" | "deckBottomAnyOrder" | "deckTop" | "deckTopOrBottom" | "trash";
  /** Preserve an explicitly chosen bottom order for effects whose UI order is top-to-bottom. */
  reverseBottomOrder?: boolean;
  /**
   * Store how many revealed cards actually reached hand, for a later scaling or `countSource`
   * ("reveal 5, add all [X] to hand. Gain 1 memory for each card added").
   */
  trackCount?: string;
  /** Store how many revealed cards were actually played, for a following RepeatPerCount. */
  trackPlayedCount?: string;
}

export interface RevealAction extends ActionBase {
  kind: "Reveal";
  /** "reveal 1 card in your hand", "reveal the top card of your deck". */
  target?: Target;
  /** Shorthand for top-of-deck reveals. */
  count?: number;
  /** Whose deck, for the shorthand form. */
  controller?: Controller | "any";
  /** Shorthand source zone; only deck reveal is executable. */
  zone?: ZoneRef;
}

/** Look at cards in a private zone without moving or publicly revealing them. */
export interface LookAction extends ActionBase {
  kind: "Look";
  /** Whose deck is looked at; omitted means the source owner's deck. */
  controller?: Controller;
  count: number;
  zone: "deck";
}

export interface SearchAction extends ActionBase {
  kind: "Search";
  controller: Controller;
  filter: Filter;
  count: number | "all";
  /** Add the selected cards to hand, or expose the full matching search set to a following action. */
  to?: "hand" | "revealed";
  /** Play the selected cards instead of adding them to hand. */
  then?: {
    kind: "PlayWithoutCost";
    target: Target;
    payCost: false;
  };
  /** Source zone when it is not the default deck search. */
  searchZone?: ZoneRef;
  /** Semantic purpose, for searches whose results feed a following action. */
  purpose?: string;
  /** Bind the instance ids actually found, for a later action in this resolution. */
  bindResultAs?: string;
}

/** Search the controller's security stack and optionally play one matching card from it. */
export interface SearchSecurityAction extends ActionBase {
  kind: "SearchSecurity";
  target: Target;
  then: {
    kind: "PlayWithoutCost";
    source: "security";
    payCost: false;
    optional?: boolean;
  };
}
