import { Schema, ArraySchema, type, view } from "@colyseus/schema";
import { CardInstance } from "./CardInstance.js";
import { Permanent } from "./Permanent.js";
import type { EffectDuration, Seat } from "./enums.js";
import { PRIVATE_VIEW_TAG, PLAYER_IDENTITY_VIEW_TAG } from "./viewTags.js";
export { PRIVATE_VIEW_TAG } from "./viewTags.js";

/** Public summary of a rule affecting current and future field entrants. */
export interface FieldEffectView {
  kind: "dp" | "restriction" | "keyword";
  value: number | string;
  amount?: number;
  duration: EffectDuration;
  ownerSeat: Seat;
  sourceCardId?: string;
  effectText?: string;
  fromSourceKind?: string[];
  byOpponentEffectsOnly?: boolean;
  continuous?: boolean;
  skipsCurrentOpponentTurnEnd?: boolean;
}

/**
 * View tag marking a PlayerState field as private to its owner. Fields tagged with
 * it are withheld from every Colyseus StateView by default and only encoded for a
 * view that explicitly added THIS player's PlayerState with this tag (see
 * engine/state/visibility.ts on the server). A single shared tag is sufficient
 * because Colyseus scopes the reveal to the specific object passed to
 * `StateView.add(player, PRIVATE_VIEW_TAG)`, so seat 0's view never unlocks seat
 * 1's private fields. Tag value 0 is intentional and distinct from Colyseus'
 * DEFAULT_VIEW_TAG (-1).
 */

/**
 * View tag for the zones NOBODY may read the contents of — not even their owner. The deck and
 * egg deck are shuffled, hidden piles: under the Comprehensive Rules a player knows only how
 * many cards are in them, and the ordering is secret until a card is drawn or an effect reveals
 * it.
 *
 * No StateView ever adds a PlayerState with this tag, which is the point: a `@view`-tagged
 * field is withheld from every view that has not explicitly unlocked it, so tagging with a
 * never-granted tag means the field is never encoded for anyone. The public sizes travel in
 * `deckCount` / `eggDeckCount` instead, and effects that legitimately reveal deck cards send
 * the identities in the decision payload (`DecisionRequest.options.visibleCards`), never by
 * exposing the zone.
 *
 * Before this existed both fields shared PRIVATE_VIEW_TAG with hand and security, so unlocking
 * a seat's own hand also shipped that seat its entire deck in draw order — readable from
 * devtools or a patched client, and decisive information in a game whose whole tension is not
 * knowing what you will draw.
 */
export const HIDDEN_ZONE_VIEW_TAG = 8;

/**
 * Public, position-preserving projection of one security slot. Hidden cards deliberately
 * carry no instance or card identity; face-up cards publish only the data the board renders.
 */
export class SecurityCardView extends Schema {
  @type("string") instanceId = "";
  @type("string") cardId = "";
  @type("string") artId = "";
  @type("boolean") faceUp = false;
}

/**
 * Every zone the analysis enumerated (deck, hand, battle area, security, trash,
 * breeding, egg deck) plus per-player flags. Mirrors documented behavior. Memory is global
 * on GameState, not per-player.
 */
export class PlayerState extends Schema {
  @type("uint8") seat!: Seat;
  @view(PLAYER_IDENTITY_VIEW_TAG) @type("string") displayName = "";
  /** A Digimon World portrait id, or "" for none (bots, and players who never picked one). */
  @view(PLAYER_IDENTITY_VIEW_TAG) @type("string") avatarId = "";
  @view(PLAYER_IDENTITY_VIEW_TAG) @type("string") sessionId = "";

  // Hidden zones. A field tagged with @view is withheld in full from every viewer that has
  // not unlocked this PlayerState with the tag, so a viewer without it sees neither the items
  // NOR the array length. The public per-zone counts the UI needs are mirrored separately
  // below (see *Count fields and syncPublicCounts in engine/state/visibility.ts).
  //
  // Two different tags, because "hidden" means two different things. Deck and egg deck are
  // secret from EVERYONE including their owner (HIDDEN_ZONE_VIEW_TAG is never granted).
  // Hand and security are secret from the OPPONENT only, so the owner's view unlocks them
  // with PRIVATE_VIEW_TAG — but note that unlocking the security ARRAY is not the same as
  // revealing the cards in it: identity lives behind CARD_ID_VIEW_TAG on CardInstance, and
  // engine/state/visibility.ts grants that only for a face-up security card.
  @view(HIDDEN_ZONE_VIEW_TAG) @type([CardInstance]) deck = new ArraySchema<CardInstance>();
  @view(HIDDEN_ZONE_VIEW_TAG) @type([CardInstance]) eggDeck = new ArraySchema<CardInstance>();
  @view(PRIVATE_VIEW_TAG) @type([CardInstance]) hand = new ArraySchema<CardInstance>();
  // security is private by default; securityView publishes a position-preserving projection
  // with identities populated only for face-up cards (engine/state/visibility.ts).
  @view(PRIVATE_VIEW_TAG) @type([CardInstance]) security = new ArraySchema<CardInstance>(); // [0] = top of stack

  // Public counts mirroring the sizes of the private zones above. These ARE synced
  // to every viewer (no @view tag) so opponents can render "deck: 37 / hand: 5 /
  // security: 5" without learning card identities. The engine is the single writer;
  // syncPublicCounts(state) recomputes them from the arrays (engine owns when).
  @type("uint16") deckCount = 0;
  @type("uint16") eggDeckCount = 0;
  @type("uint16") handCount = 0;
  @type("uint16") securityCount = 0;
  @type([SecurityCardView]) securityView = new ArraySchema<SecurityCardView>();
  /** Net effect modifier for this player's Security Digimon, public to all viewers. */
  @type("int32") securityDpDelta = 0;
  /** Active player-wide field rules, public even while the field is empty. */
  @type("string") fieldEffectsJson = "[]";

  // Public zones.
  @type([Permanent]) battleArea = new ArraySchema<Permanent>();
  @type(Permanent) breeding?: Permanent; // single raising slot (undefined when empty)
  @type([CardInstance]) trash = new ArraySchema<CardInstance>();
  /**
   * Face-down Delay Option cards waiting to activate (Comprehensive Rules §16-17).
   * Cards are faceDown; the opponent sees only the count.
   */
  @type([CardInstance]) delayZone = new ArraySchema<CardInstance>();

  @type("boolean") connected = true;
  @type("boolean") hasMulliganed = false;
  @type("boolean") lost = false; // set by security-and-win-check / deck-out / surrender

  /**
   * The Option card currently between the activation of its 1st [Main] effect and
   * that effect's resolution (Comprehensive Rules §9-1-4: a used Option is treated
   * as being in NO area for that whole window). It is held here — a slot outside
   * every zone array — rather than pre-trashed, so a zone-membership check an
   * effect runs during that window (e.g. "is this instance in your trash") reports
   * correctly. `GameEngine.listCandidateInstances()` (apps/api) folds this field in
   * so the option's own effect can still resolve against its source. It is never
   * routed through `zoneArrayOf`/`insertCard`/`extractCardAt` (it is not itself a
   * zone); `playCard.ts` reads/clears it directly. §9-1-5 carves out an exception —
   * "unless [the Option] is considered to be placed in an area" — for effects that
   * relocate themselves mid-resolution (e.g. PlaceInBattleAreaSelf turning an Option
   * into a permanent, BT18-100); `effects/primitives.ts`' `peekLooseInstance` /
   * `removeLooseInstance` read and claim this slot for exactly that case, so
   * `playCard.ts` only falls back to trashing it when nothing claimed it. Otherwise
   * `playCard.ts` clears the slot and trashes the card unconditionally once
   * activation finishes, even if the effect threw.
   *
   * No `@view` tag: the card was already revealed to use it (§9-1-9-1), so it
   * resolving face-up is public information, same as the battle area or trash.
   */
  @type(CardInstance) resolvingOption?: CardInstance;
  @type("string") botPersonaId = "";
  @type("boolean") hideIdentityFromSpectators = false;
  @view(PRIVATE_VIEW_TAG) @type("string") spectatorNamesJson = "[]";
  @view(PRIVATE_VIEW_TAG) @type("uint16") anonymousSpectatorCount = 0;
  @view(PRIVATE_VIEW_TAG) @type("string") manualInspectionJson = "[]";
  @view(PLAYER_IDENTITY_VIEW_TAG) @type("string") equippedRankedTier = "";
}
