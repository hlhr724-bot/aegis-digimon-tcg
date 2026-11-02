import { refreshIdentityVisibility } from "#api/engine/state/refreshIdentityVisibility";
import { $changes, $refId, ArraySchema, type ChangeTree, type Metadata, StateView } from "@colyseus/schema";
import { type VisibilityZone, isHiddenZone, isOwnerPrivateZone } from "./access.js";
import {
  PRIVATE_VIEW_TAG,
  PRIVATE_DECISION_VIEW_TAG,
  CARD_ID_VIEW_TAG,
  CardInstance,
  SecurityCardView,
  type FinalRevealCard,
  type FinalRevealPlayer,
  type GameState,
  type Permanent,
  type PlayerState,
  type Seat,
  Zone,
} from "@aegis/shared";

/**
 * Per-viewer visibility filtering for the authoritative GameState
 * (subsystem: game-state-schema; sources: documented behavior, documented behavior, documented behavior).
 *
 * The synchronized schema is one shared tree, but each seat must see a different
 * slice of it: you see your own hand, deck, egg deck and face-down security; your
 * opponent sees only public information about those zones (their counts) plus the
 * fully public board (battle areas, breeding, trash, memory, phase, ...).
 *
 * Colyseus implements this with `StateView` + the `@view()` field tag: a tagged
 * field is withheld from every view by default and only encoded for a view that has
 * explicitly added the OWNING object with that tag. The secret PlayerState zones
 * carry `@view(PRIVATE_VIEW_TAG)` (see @aegis/shared PlayerState); this module is
 * the server-side policy that decides which objects each seat's view unlocks.
 *
 * Everything here is pure with respect to game rules: it reads GameState and
 * constructs/feeds a StateView. It never advances the game. The single exception is
 * syncPublicCounts, which writes only the derived public-count mirror fields (it
 * changes no zone and no card).
 *
 * The seat-specific view and per-card
 * `CardSource.IsFaceUp` decided what was rendered face-up vs as a reverse-side
 * placeholder. On an authoritative server that redaction must happen at the data
 * layer (a hidden card must never be sent at all), which is what StateView does.
 */

/**
 * Every CardInstance field that holds a nested schema (its target and route lists), read
 * from the generated metadata rather than written down. A list added to the class later is
 * repaired by {@link repairDetachedCardSchema} without anyone remembering to list it here.
 */
const NESTED_CARD_FIELDS = Object.values(CardInstance[Symbol.metadata] as Metadata).filter(
  (field): field is { name: keyof CardInstance; index: number; type: object } =>
    typeof field === "object" && field !== null && "type" in field && typeof field.type !== "string",
);

/** All four owner-private zones of a PlayerState, in a stable order. */
function privateZonesOf(player: PlayerState): readonly CardInstance[][] {
  return [Array.from(player.deck), Array.from(player.eggDeck), Array.from(player.hand), Array.from(player.security)];
}

/**
 * Every face-up, publicly-visible CardInstance a player controls on the board:
 * the cards making up each battle-area permanent (active card + digivolution
 * stack + linked cards) and the same for the breeding permanent, plus the trash
 * and face-down Delay zone.
 *
 * These need explicit per-view exposure because of a @colyseus/schema quirk: once
 * a CardInstance has lived in a @view-tagged zone (hand/deck/eggDeck/security) its
 * ChangeTree is permanently stamped `isFiltered = true`, and that flag is NOT
 * recomputed when the card later moves to a public, untagged field like
 * Permanent.topCard (ChangeTree.checkIsFiltered only re-runs when the root changes,
 * which a same-tree move is not). A filtered ChangeTree stays withheld from every
 * view that hasn't explicitly added it, so the opponent would decode topCard as
 * undefined. Force-adding each public card to the view fixes this.
 */
function publicBoardCardsOf(player: PlayerState, includeLooseZones: boolean): CardInstance[] {
  const cards: CardInstance[] = [];
  const collectPermanent = (permanent: Permanent | undefined): void => {
    if (permanent === undefined) return;
    if (permanent.topCard !== undefined) cards.push(permanent.topCard);
    cards.push(...permanent.stack, ...permanent.linked);
  };
  for (const permanent of player.battleArea) collectPermanent(permanent);
  collectPermanent(player.breeding);
  // Trash and the Delay zone are loose zones behind the mutation seam, so mid-match each
  // arrival is exposed once by the VisibilityPort. Only a full snapshot walks them — and
  // trash in particular GROWS all match, so re-adding it per patch made every patch more
  // expensive than the last.
  if (includeLooseZones) {
    cards.push(...player.trash);
    cards.push(...player.delayZone);
  }
  // §9-1-4: an Option resolving between activation and resolution of its 1st [Main]
  // effect. It was revealed to be used (§9-1-9-1), so it is public the same as any
  // board card, and needs the same forced re-add (see the ChangeTree note above).
  if (player.resolvingOption !== undefined) cards.push(player.resolvingOption);
  return cards;
}

/**
 * Restore a CardInstance and the nested schemas it owns when Colyseus has lost their
 * root or parent links during a remove/reinsert sequence. A reachable card is authoritative
 * state; leaving its child detached makes StateView.add() throw and aborts the game
 * action that happened to trigger a visibility refresh.
 *
 * Why the link is lost: moving a card out of a zone drops its ChangeTree refCount to
 * zero, and `Root.remove` then clears `root` on the card AND on every child tree it
 * owns. Re-inserting the card calls `ChangeTree.setRoot`, which only recurses into
 * children when the card itself is new to the root (`isNewChangeTree`); a card still
 * referenced from somewhere else fails that guard, so its `digivolveTargetPermanentIds`
 * keeps `root: undefined` while the card is live again.
 *
 * REPAIR IN PLACE, NEVER REASSIGN. Assigning a fresh ArraySchema retires the old refId
 * and mints a new one mid-encode. Any view that already knows the card but does not
 * receive the matching ADD decodes a dangling pointer, and the client throws
 * `"refId" not found` followed by `digivolveTargetPermanentIds is not iterable`.
 * `setParent` re-attaches the SAME tree: `addParent` dedupes by ChangeTree so a
 * still-correct parent link is untouched, and `Root.add` re-queues the list's contents
 * as ADD ops so a client that missed it while detached is brought back up to date.
 * Healthy cards fall out at the guard below and keep both their identity and their refId.
 */
function repairDetachedCardSchema(card: CardInstance): void {
  // A repeated zone move can leave an old ArraySchema in Colyseus's parent
  // chain. StateView.add follows that chain when revealing the arriving card:
  // a stale hand parent grants visibility to subsequent draws. Discard only
  // collection links that no longer contain this exact card; preserve live
  // shared references and the pending wire operations that remove the old card.
  const tree = card[$changes];
  if (tree !== undefined) {
    const parents = tree.parent === undefined ? [] : [tree.parent];
    for (let entry = tree.extraParents; entry !== undefined; entry = entry.next) parents.push(entry.ref);
    for (const parent of parents) {
      if (parent instanceof ArraySchema && !parent.includes(card)) tree.removeParent(parent);
    }
  }
  const cardTree = card[$changes];
  if (cardTree !== undefined) reattachCard(card, cardTree);
  const root = cardTree?.root;
  for (const field of NESTED_CARD_FIELDS) {
    const nestedTree = (card[field.name] as { [$changes]?: ChangeTree } | undefined)?.[$changes];
    if (nestedTree === undefined || (nestedTree.parent === card && nestedTree.root === root)) continue;
    // `root` may legitimately be undefined here and the repair still matters: a card sitting in a
    // digivolution stack can have a live parentChain but no root, and `StateView.add` rejects a
    // child on the PARENT link alone ("Cannot add a detached instance"). Passing the undefined
    // root through is deliberate — `setParent` restores the parentChain and returns early, which
    // is exactly the part `view.add` checks. Guarding on `root !== undefined` instead skips these
    // cards and the next view refresh throws mid-action, stalling the match.
    nestedTree.setParent(card, root, field.index);
  }
}

/**
 * Re-root a card that still sits in a live collection but that Colyseus no longer tracks.
 *
 * Overwriting a collection slot that held the card drops its refCount to zero, and
 * `Root.remove` clears `root` on the card and on every child it owns. If the card is then
 * written back into a slot, it keeps that stale state: the full-state walk of a join or
 * reconnect reaches it through the collection and throws in `StateView.isChangeTreeVisible`
 * on its parentless children. `setParent` through the collection that holds the card treats
 * it as new, so `Root.add` re-queues its fields and the same walk re-attaches its children.
 */
function reattachCard(card: CardInstance, cardTree: ChangeTree): void {
  if (cardTree.root !== undefined) return;
  const parent = cardTree.parent;
  const parentRoot = (parent as { [$changes]?: ChangeTree } | undefined)?.[$changes]?.root;
  if (!(parent instanceof ArraySchema) || parentRoot === undefined || !parent.includes(card)) return;
  cardTree.setParent(parent, parentRoot, parent.indexOf(card));
}

/**
 * {@link repairDetachedCardSchema} over every card a view can reach. The per-move path
 * repairs the single arriving card; a view rebuild has to sweep them all, because a card
 * can be detached by a move that predates the port being installed.
 */
function repairDetachedCardSchemas(state: GameState): void {
  const cards = new Set<CardInstance>();
  const addPermanent = (permanent: Permanent | undefined): void => {
    if (permanent?.topCard !== undefined) cards.add(permanent.topCard);
    for (const card of permanent?.stack ?? []) cards.add(card);
    for (const card of permanent?.linked ?? []) cards.add(card);
  };

  for (const player of state.players) {
    for (const zone of privateZonesOf(player)) {
      for (const card of zone) cards.add(card);
    }
    for (const card of player.trash) cards.add(card);
    for (const card of player.delayZone) cards.add(card);
    if (player.resolvingOption !== undefined) cards.add(player.resolvingOption);
    for (const permanent of player.battleArea) addPermanent(permanent);
    addPermanent(player.breeding);
  }

  for (const card of cards) repairDetachedCardSchema(card);
}

/**
 * Recompute the public per-zone count fields from the private arrays. These are the
 * only facts about a hidden zone the opponent is allowed to know (mirrors the
 * source HUD showing `HandCards.Count`, `LibraryCards.Count`,
 * `DigitamaLibraryCards.Count`, and the security stack size).
 *
 * Idempotent and side-effect-scoped to the *Count fields. The engine is the single
 * writer of GameState and decides when to call this (at minimum once before each
 * state patch is broadcast, so the counts track the arrays). Returns the same state
 * for convenient chaining in tests.
 */
export function syncPublicCounts(state: GameState): GameState {
  for (const player of state.players) {
    player.deckCount = player.deck.length;
    player.eggDeckCount = player.eggDeck.length;
    player.handCount = player.hand.length;
    player.securityCount = player.security.length;
    const projectionChanged =
      player.securityView.length !== player.security.length ||
      player.security.some((card, index) => {
        const projected = player.securityView[index];
        const faceUp = card.faceUp === true;
        return (
          projected === undefined ||
          projected.faceUp !== faceUp ||
          projected.instanceId !== (faceUp ? card.instanceId : "") ||
          projected.cardId !== (faceUp ? card.cardId : "") ||
          projected.artId !== (faceUp ? card.artId : "")
        );
      });
    if (projectionChanged) {
      player.securityView.splice(0, player.securityView.length);
      for (const card of player.security) {
        const projected = new SecurityCardView();
        projected.faceUp = card.faceUp === true;
        if (projected.faceUp) {
          projected.instanceId = card.instanceId;
          projected.cardId = card.cardId;
          projected.artId = card.artId;
        }
        player.securityView.push(projected);
      }
    }
  }
  return state;
}

/**
 * Give the owner the identity of each of their face-up security cards, and take it back from
 * each face-down one. The owner holds every element of their own security array, so a card they
 * already know (it came from their hand, trash or field, or it was face-up and was turned
 * face-down in place) would otherwise keep its decoded `cardId` while face-down (§3-7-2).
 * Removing only the identity tag queues a DELETE for `cardId` and `artId` and keeps the element.
 */
function syncOwnSecurityIdentities(view: StateView, owner: PlayerState): void {
  for (const card of owner.security) {
    const identified = view.hasTag(card, CARD_ID_VIEW_TAG);
    if (card.faceUp && !identified) {
      repairDetachedCardSchema(card);
      view.add(card, CARD_ID_VIEW_TAG);
    } else if (!card.faceUp && identified) {
      view.remove(card, CARD_ID_VIEW_TAG);
    }
  }
}

/**
 * Unlock `seat`'s own PlayerState private zones (deck, egg deck, hand, security)
 * into `view` and nothing of the opponent's. Untagged fields (the whole public
 * board) are visible to every view automatically, so they need no `add`.
 *
 * Security: only the owner's view ever holds the raw `security` array. Every other view,
 * spectators included, reads face-up security cards from the public `securityView`
 * projection. Do not add an opponent's security card to a view: once a view holds part of
 * that array, Colyseus shares the array's visibility with every card later placed in it or
 * changed in it (items of a non-default-tag `@view` collection inherit their parent's
 * visibility). A face-down card then reaches the opponent with its instance id, and with its
 * identity when the opponent saw the card before.
 *
 * Safe to call repeatedly on the SAME `view` instance to bring it up to date with the
 * current state (see `refreshStateView`'s doc for why that matters — replacing the view
 * wholesale loses track of cards that just left a private zone and drops their removal
 * from the next patch). The only removal is a face-down security card's identity tag.
 */
function unlockInto(view: StateView, state: GameState, seat: Seat | undefined, fullSnapshot: boolean): void {
  const owner = seat === undefined ? undefined : state.players[seat];
  // A full snapshot walks the whole tree, so every card it touches has to be sound first.
  // Nothing below this walks cards on a plain refresh, so the sweep is snapshot-only; each
  // arriving card is repaired individually by `exposeCardInZone` instead.
  if (fullSnapshot) repairDetachedCardSchemas(state);
  refreshIdentityVisibility({ view, state, seat });
  if (owner !== undefined) {
    // Unlock exactly this seat's private fields. A single PRIVATE_VIEW_TAG is safe:
    // Colyseus scopes the reveal to this specific PlayerState object, so the
    // opponent's identically-tagged fields stay hidden (they were never added).
    //
    // ONCE per view, not once per patch. `StateView.add` recurses through every child whose
    // tag matches or is absent, and PlayerState's public collections (trash, battle area,
    // delay zone) carry no tag — so repeating this walked the seat's entire subtree on every
    // patch, and threw outright if any card down there had a detached child list. The tag
    // only has to be granted once; the view never forgets it.
    if (!view.hasTag(owner, PRIVATE_VIEW_TAG)) view.add(owner, PRIVATE_VIEW_TAG);
    // Only on a full snapshot. Mid-match, each private-zone card is exposed once as it
    // arrives (`exposeCardInZone`, driven by the mutation seam's VisibilityPort); walking
    // every deck/hand/security card again per patch would re-queue a forced ADD for every
    // field of every card, which is what made each patch cost a full state re-encode.
    if (fullSnapshot) {
      for (const card of owner.hand) {
        exposeCard(view, card, true);
        view.add(card, CARD_ID_VIEW_TAG);
      }
      // Security identity is withheld from the owner too: a player may not look at their own
      // security stack (Comprehensive Rules §§3-7-2 and 3-7-4), so only a card already turned face-up
      // gets its cardId. Deck and egg deck are absent entirely — HIDDEN_ZONE_VIEW_TAG is
      // granted to no view, so the arrays are never encoded and there is nothing to tag.
      for (const card of owner.security) {
        exposeCard(view, card, true);
        if (card.faceUp) view.add(card, CARD_ID_VIEW_TAG);
      }
    }
  }
  // Added once per decision, not once per patch. `PendingDecision.payloadJson` carries the
  // whole candidate list, and `StateView.add` force-queues an ADD for it, so re-adding while
  // a decision sat open re-sent the entire blob 20 times a second. Later edits to the payload
  // still reach the view through the normal tagged-change path; the forced ADD is only needed
  // to make the object visible in the first place, and a new decision is a new ChangeTree.
  if (seat !== undefined && state.pendingDecision?.seat === seat && !view.has(state.pendingDecision)) {
    view.add(state.pendingDecision, PRIVATE_DECISION_VIEW_TAG);
  }

  if (
    seat !== undefined &&
    state.combatWindow?.seat === seat &&
    !view.hasTag(state.combatWindow, PRIVATE_DECISION_VIEW_TAG)
  ) {
    view.add(state.combatWindow, PRIVATE_DECISION_VIEW_TAG);
  }

  if (owner !== undefined) syncOwnSecurityIdentities(view, owner);

  // Full snapshots only. Every public card is exposed as it arrives — the mutation seam now
  // covers the permanent fields too (`setTopCard`/`pushOnStack`/`linkCard`/`setBreeding`), so a
  // card reaching the board announces itself exactly once. A join or resync still needs the
  // whole walk, because a view built now has to learn about cards that arrived before it existed.
  if (!fullSnapshot) return;
  // Cards that passed through a @view-tagged zone keep a stale `isFiltered` flag after moving
  // to a public field (see publicBoardCardsOf), so without this the opponent's battle area
  // decodes with topCard=undefined. Adding the owner's own cards too is harmless (idempotent)
  // and keeps the policy uniform.
  for (const player of state.players) {
    for (const card of publicBoardCardsOf(player, fullSnapshot)) {
      exposeCard(view, card, true);
      if (card.faceUp || card.ownerSeat === seat) view.add(card, CARD_ID_VIEW_TAG);
    }
  }
}

/**
 * Build a brand-new StateView for one seat. Use this ONLY for a seat's first view
 * (initial join) or a full resync (reconnect), both of which send the client a
 * complete state snapshot rather than a delta — see `refreshStateView` for why a
 * fresh StateView must never be substituted for an existing one mid-match.
 *
 * Pure: constructs and returns a fresh StateView; mutates no GameState.
 */
export function buildStateView(state: GameState, seat: Seat | undefined): StateView {
  const view = new StateView();
  unlockInto(view, state, seat, true);
  return view;
}

/**
 * Bring an EXISTING StateView up to date with the current state, in place — the
 * mid-match counterpart to `buildStateView`. Callers must reuse the same StateView
 * instance for a seat's whole connected session and refresh it via this function,
 * never replace it with `buildStateView`'s fresh instance once the match is under
 * way.
 *
 * Why: `@colyseus/schema`'s StateView tracks visibility per ChangeTree in a
 * `WeakSet` scoped to that ONE StateView instance. A card that just left a
 * `@view`-tagged zone (e.g. played from hand) needs its owning view to still
 * recognize it as visible at the moment its removal is encoded, so the encoder
 * emits the DELETE op — that recognition lives only in the OLD view (built while
 * the card was still in the zone). Discarding that view for a freshly-built one
 * (whose recursive `unlockInto` walk only sees zones' CURRENT contents) permanently
 * strands the delete: the new view never learns the card was ever visible, so the
 * encoder silently drops the removal and the client's copy of the zone keeps the
 * card forever (confirmed via a standalone encode/decode repro against
 * `@colyseus/schema` 3.0.76 — not a timing race, the update never arrives).
 * `unlockInto` only ever calls `view.add(...)`, so calling it repeatedly on the
 * same instance is safe/idempotent and requires no matching `view.remove(...)`.
 */
export function refreshStateView(view: StateView, state: GameState, seat: Seat | undefined): void {
  unlockInto(view, state, seat, false);
}

/**
 * Expose one card that just arrived in a loose zone to ONE viewer's StateView — the
 * per-move counterpart to the full walk in `unlockInto`, driven by the mutation seam's
 * `VisibilityPort`. Applies exactly the policy `unlockInto` applies in bulk:
 *
 * - private zone (deck/eggDeck/hand/security): only the owner learns the card exists;
 * - public zone (trash/delayZone): both seats see the card, and its identity is revealed
 *   to a viewer who either owns it or is looking at a face-up card.
 *
 * Called once per arrival, not once per patch. That is the whole point: `StateView.add`
 * force-queues an ADD for every field of the added object (and its children), so calling
 * it per patch for every card makes each patch carry the entire state.
 */
export function exposeCardInZone(
  view: StateView,
  viewerSeat: Seat | undefined,
  ownerSeat: Seat,
  zone: VisibilityZone,
  card: CardInstance,
): void {
  repairDetachedCardSchema(card);
  // A deck or egg deck is encoded for nobody, owner included; a hand or security for its owner only.
  if (isHiddenZone(zone) || (isOwnerPrivateZone(zone) && viewerSeat !== ownerSeat)) {
    rememberDeparture(view, card);
    return;
  }
  if (isOwnerPrivateZone(zone)) {
    // Untagged fields first (instanceId, ownerSeat, faceUp, the projections). A card drawn out
    // of a hidden zone is genuinely NEW to this client — the deck was never encoded — and its
    // ChangeTree is filtered, so the re-ADD that `Root.add` queues on reinsertion lands in the
    // unfiltered change set the encoder does not read for a view. Without this the card
    // arrives in hand with `instanceId: undefined`. Adding with the default tag force-queues
    // every untagged field and fixes that; it deliberately does NOT reveal `cardId`, which is
    // tagged and therefore only travels on the explicit grant below.
    exposeCard(view, card);
    // Your hand is yours to read; your face-down security is not (§3-7-2). A security card that
    // is later turned face up, or one you already knew, is settled by `syncOwnSecurityIdentities`.
    if (zone === Zone.Hand || card.faceUp) view.add(card, CARD_ID_VIEW_TAG);
    return;
  }
  exposeCard(view, card);
  if (card.faceUp || card.ownerSeat === viewerSeat) view.add(card, CARD_ID_VIEW_TAG);
}

/**
 * Cards each view already knows that have since moved where that view may not read them,
 * waiting for {@link forgetWithheldCards}.
 */
const departuresByView = new WeakMap<StateView, Set<CardInstance>>();

// A card exposed and withdrawn before a patch has no client refId yet. Its forced
// ADDs must be cancelled, while a previously delivered card must remain visible
// until its departure is encoded. Full views are used only with a snapshot.
const boundCardsByView = new WeakMap<StateView, WeakSet<CardInstance>>();
const pendingCardsByView = new WeakMap<StateView, Set<CardInstance>>();

function exposeCard(view: StateView, card: CardInstance, snapshot = false): void {
  view.add(card);
  const tree = card[$changes];
  if (tree !== undefined) {
    orderCardChangesAfterParent({ view, tree });
  }
  if (snapshot) {
    let bound = boundCardsByView.get(view);
    if (bound === undefined) boundCardsByView.set(view, (bound = new WeakSet()));
    bound.add(card);
  } else {
    let pending = pendingCardsByView.get(view);
    if (pending === undefined) pendingCardsByView.set(view, (pending = new Set()));
    pending.add(card);
  }
}

type OrderCardChangesParams = { view: StateView; tree: ChangeTree };

function orderCardChangesAfterParent({ view, tree }: OrderCardChangesParams): void {
  const refId = tree.ref[$refId];
  const changes = view.changes.get(refId);
  if (changes !== undefined) {
    view.changes.delete(refId);
    view.changes.set(refId, changes);
  }
  tree.forEachChild((child) => orderCardChangesAfterParent({ view, tree: child }));
}

function cancelPendingCard(view: StateView, tree: ChangeTree): void {
  view.changes.delete(tree.ref[$refId]);
  tree.forEachChild((child) => cancelPendingCard(view, child));
}

function rememberDeparture(view: StateView, card: CardInstance): void {
  if (!view.has(card) && !view.hasTag(card)) return;
  const tree = card[$changes];
  if (tree === undefined) return;
  if (!boundCardsByView.get(view)?.has(card)) {
    // The public parent may already have been removed from the state, while the
    // card remains rooted in a hidden hand. Colyseus skips that parent's ADD but
    // otherwise emits the card's queued subtree against an unintroduced refId.
    cancelPendingCard(view, tree);
    hideFromView(view, tree);
    pendingCardsByView.get(view)?.delete(card);
    return;
  }
  let departures = departuresByView.get(view);
  if (departures === undefined) {
    departures = new Set();
    departuresByView.set(view, departures);
  }
  departures.add(card);
}

/**
 * True when `card` sits in an array `viewerSeat` never receives: any deck, or another player's
 * hand or security. Face-up security reaches other players through `securityView` instead.
 */
function isWithheldFrom(state: GameState, viewerSeat: Seat | undefined, card: CardInstance): boolean {
  return state.players.some((player) => {
    if (player.deck.includes(card) || player.eggDeck.includes(card)) return true;
    if (player.seat === viewerSeat) return false;
    return player.hand.includes(card) || player.security.includes(card);
  });
}

function hideFromView(view: StateView, tree: ChangeTree): void {
  view.unmarkVisible(tree);
  view.removeAllTagsOnTree(tree);
  tree.forEachChild((child) => hideFromView(view, child));
}

/**
 * Make `view` stop tracking every card that moved out of its sight. Call it for each client
 * right AFTER a patch is encoded, never before.
 *
 * The client drops a card when the patch carrying its departure arrives. A view that still
 * counts the card as visible keeps encoding later changes to its fields (a deck reveal's
 * `faceUp` flip), and the client logs `"refId" not found` for each one.
 *
 * Why not on arrival, in `exposeCardInZone`: the departure itself is filtered on the card's
 * visibility. A hand's DELETE ships only while the view still sees the card, so hiding it in
 * the same patch strands the card in the client's hand. And `view.remove` is no substitute: it
 * queues a DELETE on the card's new parent, a deck array the client never received.
 *
 * Each card is checked against its zone at call time, so a card that came back into sight
 * before the patch (deck to trash) is left alone. A card hidden here is re-introduced in full
 * by the next `view.add` when it becomes visible again.
 */
export function forgetWithheldCards(view: StateView, state: GameState, viewerSeat: Seat | undefined): void {
  const departures = departuresByView.get(view);
  departuresByView.delete(view);
  for (const card of departures ?? []) {
    const tree = card[$changes];
    if (tree !== undefined && isWithheldFrom(state, viewerSeat, card)) {
      hideFromView(view, tree);
      boundCardsByView.get(view)?.delete(card);
    }
  }
  const pending = pendingCardsByView.get(view);
  pendingCardsByView.delete(view);
  for (const card of pending ?? []) {
    if (isWithheldFrom(state, viewerSeat, card)) continue;
    let bound = boundCardsByView.get(view);
    if (bound === undefined) boundCardsByView.set(view, (bound = new WeakSet()));
    bound.add(card);
  }
}

/**
 * Diagnostics-only: the private zones of a player as plain arrays. Used by tests and
 * any future server-side audit to assert what would be redacted. Not part of the
 * sync path.
 */
export function privateZoneSnapshot(player: PlayerState): readonly CardInstance[][] {
  return privateZonesOf(player);
}

/**
 * Every hidden zone of both players, for the `finalReveal` event sent once the match is over.
 * The StateView policy above stays untouched: once nothing can change the outcome, the identities
 * travel as a plain event payload instead of unlocking the schema's private fields.
 */
export function finalRevealOf(state: GameState): FinalRevealPlayer[] {
  const faces = (cards: Iterable<CardInstance>): FinalRevealCard[] =>
    Array.from(cards, (card) => ({ cardId: card.cardId, artId: card.artId }));
  return Array.from(state.players, (player) => ({
    seat: player.seat,
    hand: faces(player.hand),
    deck: faces(player.deck),
    eggDeck: faces(player.eggDeck),
    security: faces(player.security),
  }));
}
