// Costs paid to perform an action.

import type { Filter, Target } from "../filters/filter.js";
import type { Controller, ZoneRef } from "../filters/zones.js";

/**
 * A cost paid as part of an action ("by trashing 1 card", "by suspending this Tamer"). Modeled
 * as a nested action performed first; if it cannot be paid, the parent action does not happen.
 */
export interface Cost {
  kind:
    | "compound" // pay each nested cost in sequence
    | "trash"
    | "suspend"
    | "unsuspend" // BT14-054
    | "unsuspendNamed" // BT19-090: one suspended permanent for each named requirement
    | "return"
    | "place"
    | "placeOwnTopAtStackBottom"
    | "deleteOwn"
    | "trashBreeding" // trash the owner's entire breeding-area Digimon stack
    | "payMemory"
    | "flipSecurity" // flip your top face-up security card face down (BT23-043, EX11-031)
    | "trashSecurityTop" // ST23-05
    | "trashBothSecurityTop" // BT19-043: trash both players' top security cards atomically
    | "trashBottomFaceDownUnderTamer"
    | "trashBottomFaceDownUnderDigimon"
    | "securityToHand"
    | "placeAsSecurity" // move a permanent to the security stack (BT19-048)
    | "reveal" // reveal cards from a loose zone without moving them (EX4-023)
    | "moveToBattleArea" // move the source from breeding to the battle area (BT18-086)
    | "attack" // perform the source Digimon's attack (AD1-020)
    | "digivolveSelf" // digivolve the source into the effect card (BT17-073)
    | "playFromDigivolutionCards" // play a card from a selected Digimon's stack (BT19-102)
    | "digivolve" // digivolve a live Digimon as an activation cost
    | "raw";
  target?: Target;
  /** Destination card filter for a nested digivolution cost. */
  into?: Filter;
  /** Source zones for a nested digivolution cost; defaults to hand/trash. */
  from?: ZoneRef[];
  /** Positive reduction amount applied to the nested digivolution's printed cost. */
  costReduction?: number;
  /** Distinct targets for a compound named unsuspend cost. */
  targets?: Target[];
  /** The nested costs a `compound` cost pays. */
  costs?: Cost[];
  /** Host permanent selected before resolving a stack-card play cost (BT19-102). */
  hostTarget?: Target;
  /** The played stack card must share the selected host's current top-card level (EX5-065). */
  sameLevelAsHost?: boolean;
  /** Whose stack a specialized cost draws from. */
  controller?: Controller;
  /** Cards required by a specialized fixed-card cost. */
  count?: number;
  /** For `payMemory`. */
  memory?: number;
  /**
   * The controller may decline to pay and the effect still resolves unpaid. Distinct from a
   * "You may" on the whole action.
   */
  optional?: boolean;
  /** The fixed target selection itself carries the refusal instead of a separate optional prompt. */
  declineViaSelection?: boolean;
  raw?: string;
  /** Named procedure that caused a deletion cost, when later effects distinguish it. */
  mechanic?: "Overclock";
  /** For `return` costs; `"deckBottom"` sends the card under its owner's deck (BT19-002). */
  to?: "hand" | "deckBottom" | "deckTop" | "deckTopOrBottom";
  /**
   * Store the returned Digimon's level in `EffectContext.namedCounts` under this name, so a
   * later `levelLte` can compare against it (BT19-002 "returnedDigimonLevel").
   */
  storeAs?: string;
  /**
   * Store the returned permanent's printed play cost in `EffectContext.namedCounts` under this
   * name, so a later `namedCount` scaling can reference it — "play this card with the play cost
   * reduced by the play cost of the returned Tamer" (LM-006).
   */
  storeAsPlayCost?: string;
  /** Stop a compound cost when an up-to component is paid with zero cards. */
  stopIfZero?: boolean;
  /** Order cards selected by a compound bottom-deck return as one final choice. */
  orderReturnedCards?: boolean;
  /** Select a complete compound bottom-placement batch, then order its physical materials. */
  orderPlacedCards?: boolean;
  /** Dynamic loose-zone return count: move every matching card above this many remaining. */
  leaveInZone?: number;
  /** Do not reveal selected loose-card definitions to the player paying this cost. */
  selectionHidden?: boolean;
  /** Privately show a hidden selection to the cards' owner for acknowledgement before moving it. */
  ownerInspectsSelection?: boolean;
  /**
   * Store how many cards the cost actually moved, for a later scaling or `countSource`
   * ("by placing up to N cards ... reduce by X for each card placed").
   */
  trackCount?: string;
  /** Store the distinct colors among cards selected by a return cost for later scaling. */
  trackColors?: string;
  /** Destination for place costs: "under one of your Tamers" → {controller:"mine",kind:["Tamer"]}. */
  underFilter?: Filter;
  /**
   * Host filters unioned with `underFilter` ("level 3 OR the [Legend-Arms] trait" — EX6-007,
   * EX6-009). Mirrors `Target.orFilters` and threads through `host:"target"` the same way.
   */
  underOrFilters?: Filter[];
  /**
   * Routing for a place cost whose destination is not the default digivolution stack:
   * `"security"` (BT23-045, BT24-040, BT25-044) or `"digivolutionStack"` at `position`
   * (EX9-055 top; EX9-064 bottom, face down). Absent keeps the legacy placeUnder behavior.
   */
  destination?: "security" | "digivolutionStack" | "battleArea";
  /**
   * Which end to place at. `"choice"` prompts per placed card (EX12-077). `"faceUpBottom"` is
   * `placeAsSecurity` only: face-up under the security stack (BT19-048).
   */
  position?: "top" | "bottom" | "choice" | "faceUpBottom";
  /**
   * `"self"` places under the source; `"target"` under the `underFilter` host (legacy string
   * form); `"triggerSource"` uses the timing payload host; the object form lets the player pick
   * a matching host (BT21-071).
   */
  host?: "self" | "target" | "triggerSource" | { filter: Filter; count: number; orFilters?: Filter[] };
  /**
   * Only meaningful for `destination:"security"`; digivolution cards are always face-down.
   * Security placement is face down unless this is explicitly `false` ("face up", BT18-004).
   */
  faceDown?: boolean;
  faceDownUnderTamer?: boolean;
  /** The place cost relocates a battle-area permanent rather than a loose card. */
  targetIsPermanent?: boolean;
  /**
   * For a permanent placed into security, move only its visible top card and promote its
   * top digivolution card instead of moving the whole stack out of the battle area.
   */
  detachPermanentTop?: boolean;
  /**
   * For `placeAsSecurity`, move the card directly beneath the source's top card while leaving
   * the source permanent in play. The cost is unpayable without a digivolution card.
   */
  fromDigivolutionTop?: boolean;
  /**
   * When relocating a permanent as a placement cost, move only its top card to the destination;
   * trash its existing digivolution and linked cards to their respective owners instead of
   * attaching the entire prior stack. Ignored unless `targetIsPermanent` is true.
   */
  shedOwnCards?: boolean;
  /** Store the chosen host permanent id for a downstream `target.fromSelectionRef`. */
  bindHostAs?: string;
  /**
   * Bind the card(s) actually moved by this cost for a downstream action. Place-to-security
   * stores every moved instance in `EffectContext.boundPlayed`; a loose-card trash/return also
   * snapshots the first chosen card in `selections`/`selectionFacts` so relative-level and
   * same-name target filters can resolve after the payment changes zones.
   */
  bindResultAs?: string;
}
