import { Schema, ArraySchema, type, view } from "@colyseus/schema";
import type { Seat } from "./enums.js";

/** View tag that reveals a physical card's identity to an authorized viewer. */
export const CARD_ID_VIEW_TAG = 4;

/** A server-authorized App Fusion route projected onto the owning hand card. */
export class AppFusionRoute extends Schema {
  @type("string") hostPermanentId!: string;
  @type("string") linkedInstanceId!: string;
  @type("int8") projectedCost!: number;
}

/**
 * A server-priced digivolution route projected onto the owning hand card. One entry per
 * (base permanent x cost path) the server would accept right now, carrying the memory it
 * would actually charge — every active continuous cost modifier already applied. The client
 * must not re-derive this from printed EvoCosts: a modifier that rewrites the cost (BT24-101
 * "Cost 1 for each of your security cards") lives in the engine, not in the card data.
 */
export class DigivolveRoute extends Schema {
  @type("string") permanentId!: string;
  /**
   * Which cost path this route prices. -1 is the path the server picks when the intent names
   * none (the printed EvoCost when it matches, otherwise the sole alternate or base-granted
   * path). A value >= 0 indexes `digivolutionRequirementsFor(cardId)` and is echoed back as
   * the intent's `alternateRequirementIndex`, so a card printing several alternate paths can
   * be priced — and chosen — one path at a time.
   */
  @type("int8") alternateRequirementIndex!: number;
  /** Memory this route would cost right now. Same figure `validateDigivolve` checked. */
  @type("int8") projectedCost!: number;
}

/** A server-authorized DNA digivolution declaration for one hand card. */
export class DnaDigivolveRoute extends Schema {
  /** JSON string array of battle-area permanent ids consumed by this declaration. Nested
   * primitive ArraySchema values do not survive the Colyseus client decoder reliably. */
  @type("string") materialPermanentIdsJson = "[]";
  /** Memory the declaration would charge after active continuous modifiers. */
  @type("int8") projectedCost!: number;
}

/**
 * A specific physical card in the match. Static card facts (DP, cost, colors,
 * level, effect text) come from CardDefinition in @aegis/shared/cards, looked up
 * by cardId; the instance carries only per-copy runtime data.
 */
export class CardInstance extends Schema {
  @type("string") instanceId!: string; // unique within the match
  @view(CARD_ID_VIEW_TAG) @type("string") cardId!: string; // e.g. "BT7-089"; key into CardDefinition registry
  /** Chosen printing for this physical copy; hidden with its canonical identity. */
  @view(CARD_ID_VIEW_TAG) @type("string") artId = "";
  /** Public provenance of this stay in trash; empty unless discarded from a Digimon’s sources. */
  @view(CARD_ID_VIEW_TAG) @type("string") trashOriginCardId = "";
  @type("uint8") ownerSeat!: Seat; // who owns it (not necessarily who controls it)
  @type("boolean") faceUp = true; // false => redacted for opponents (see Visibility)
  /** Owner-visible activated abilities available while this loose card is in hand. */
  @type("string") activatableEffectsJson = "";
  // Server-projected hand affordances, re-derived every continuous recompute by
  // GameEngine.syncHandAffordances and false/empty for every card outside the turn
  // player's hand. The client must not reconstruct play legality from card text:
  // turn, phase, open decisions, play prohibitions, colour requirements and memory
  // are already resolved here — the same contract as Permanent.attackablePermanentIds.
  @type("boolean") playableFromHand = false;
  // Memory this card would cost to play right now, with every ACTIVE CONTINUOUS cost modifier
  // already applied — the exact figure `validatePlayCard` checked affordability against, kept
  // instead of being collapsed into `playableFromHand`. -1 means "not projected": the card is
  // outside the turn player's Main-phase hand, or its only route is a material declaration
  // (DigiXros / Assembly) whose reduction comes from materials nobody has chosen yet.
  //
  // An UPPER BOUND, not a ruling. A card with a [BeforePayCost] hook can still reduce this at
  // pay time, and resolving those means prompting the player and mutating the board, so they
  // are deliberately not simulated here. The client presents it as a prediction.
  @type("int8") projectedPlayCost = -1;
  /** Seat-level prohibition: material placement remains legal, but cannot reduce the play cost. */
  @type("boolean") playCostReductionBlocked = false;
  // Own permanents this hand card may legally digivolve onto right now.
  @type(["string"]) digivolveTargetPermanentIds = new ArraySchema<string>();
  // Own battle-area Digimon this card may legally be linked to right now (§6-5-1-4 /
  // §10-1), projected for the turn player's hand cards and battle-area top cards during
  // the Main phase by GameEngine.syncLinkTargets, and empty everywhere else. The client
  // must not rebuild link legality from the printed requirement: cost reductions, memory
  // and the source's own leave restrictions are already resolved here. Published like
  // `digivolveTargetPermanentIds` rather than under `PRIVATE_VIEW_TAG`: a view-tagged
  // primitive array breaks the client decoder in the scenario suite, so this shares
  // that projection's exposure of which hand cards have a legal recipient.
  @type(["string"]) linkTargetPermanentIds = new ArraySchema<string>();
  /** Priced digivolution routes for this hand card. The owning hand zone already controls
   * visibility; leaving the nested collection untagged also lets routes projected after a
   * late hand arrival reach the owner, matching DNA routes below. */
  @type([DigivolveRoute]) digivolveRoutes = new ArraySchema<DigivolveRoute>();
  /** Legal DNA declarations for this hand card, validated and priced by the server. The owning
   * hand zone already controls visibility; keeping this untagged matches public target projections. */
  @type([DnaDigivolveRoute]) dnaDigivolveRoutes = new ArraySchema<DnaDigivolveRoute>();
  /** Legal App Fusion routes for this hand card. The owning hand zone controls visibility. */
  @type([AppFusionRoute]) appFusionRoutes = new ArraySchema<AppFusionRoute>();
  @type("string") negamonPlayEffectKey = "";
  @type("boolean") oncePerTurnUsed = false;
}
