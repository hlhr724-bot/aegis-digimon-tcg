import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { $changes, $refId, ArraySchema, Decoder, Encoder, type StateView } from "@colyseus/schema";
import {
  GameState,
  CombatWindow,
  PlayerState,
  CardInstance,
  AppFusionRoute,
  Permanent,
  PRIVATE_VIEW_TAG,
  PRIVATE_DECISION_VIEW_TAG,
  CARD_ID_VIEW_TAG,
  PendingDecision,
  type SecurityCardView,
  type Seat,
} from "@aegis/shared";
import { buildStateView, refreshStateView, syncPublicCounts, privateZoneSnapshot } from "./visibility.js";
import {
  clearZone,
  extractCardAt,
  extractPermanentAt,
  fillZone,
  insertCard,
  installVisibilityPort,
  placePermanent,
  setTopCard,
} from "./access.js";
import { exposeCardInZone, finalRevealOf, forgetWithheldCards } from "./visibility.js";
import { Zone } from "@aegis/shared";

function makeCard(id: string, ownerSeat: Seat, faceUp = true): CardInstance {
  const card = new CardInstance();
  card.instanceId = id;
  card.cardId = "TEST-001";
  card.artId = "TEST-001_P1";
  card.ownerSeat = ownerSeat;
  card.faceUp = faceUp;
  return card;
}

function fill(zone: ArraySchema<CardInstance>, prefix: string, ownerSeat: Seat, n: number): void {
  for (let i = 0; i < n; i += 1) zone.push(makeCard(`${prefix}-${i}`, ownerSeat));
}

const encoderByState = new WeakMap<GameState, Encoder<GameState>>();

/**
 * Build a two-seat GameState with populated private zones and attach it to an
 * Encoder. The Encoder assigns the root/refIds the StateView machinery needs;
 * without it StateView.add() rejects "detached" instances.
 */
function makeState(): GameState {
  const state = new GameState();
  state.players = new ArraySchema<PlayerState>();
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    player.deck = new ArraySchema<CardInstance>();
    player.eggDeck = new ArraySchema<CardInstance>();
    player.hand = new ArraySchema<CardInstance>();
    player.security = new ArraySchema<CardInstance>();
    fill(player.deck, `s${seat}-deck`, seat, 37);
    fill(player.eggDeck, `s${seat}-egg`, seat, 4);
    fill(player.hand, `s${seat}-hand`, seat, 5);
    // Security stored face-down (the default state of a fresh security stack).
    for (let i = 0; i < 5; i += 1) player.security.push(makeCard(`s${seat}-sec-${i}`, seat, false));
    state.players[seat] = player;
  }
  // eslint-disable-next-line no-new -- constructing the Encoder wires the state root.
  const encoder = new Encoder(state);
  encoderByState.set(state, encoder);
  return state;
}

function encodeAllForView(state: GameState, view: StateView, decoder: Decoder<GameState>): void {
  const encoder = encoderByState.get(state)!;
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  decoder.decode(encoder.encodeAllView(view, iterator.offset, iterator));
  encoder.discardChanges();
}

/**
 * Multi-view variants of the two helpers above. The single-view ones call
 * `discardChanges()` immediately, which is correct for one client but starves any further
 * view of the same patch — the room encodes every connected client from one `encode()` pass,
 * so a two-seat test has to do the same.
 */
type ViewTarget = { view: StateView; decoder: Decoder<GameState> };

function encodeAllForViews(state: GameState, targets: readonly ViewTarget[]): void {
  const encoder = encoderByState.get(state)!;
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  const sharedOffset = iterator.offset;
  for (const { view, decoder } of targets) {
    iterator.offset = sharedOffset;
    decoder.decode(encoder.encodeAllView(view, sharedOffset, iterator));
  }
  encoder.discardChanges();
}

function encodePatchForViews(state: GameState, targets: readonly ViewTarget[]): void {
  const encoder = encoderByState.get(state)!;
  const iterator = { offset: 0 };
  encoder.encode(iterator);
  const sharedOffset = iterator.offset;
  for (const { view, decoder } of targets) {
    iterator.offset = sharedOffset;
    decoder.decode(encoder.encodeView(view, sharedOffset, iterator));
  }
  encoder.discardChanges();
}

function encodePatchForView(state: GameState, view: StateView, decoder: Decoder<GameState>): void {
  const encoder = encoderByState.get(state)!;
  const iterator = { offset: 0 };
  encoder.encode(iterator);
  decoder.decode(encoder.encodeView(view, iterator.offset, iterator));
  encoder.discardChanges();
}

describe("syncPublicCounts", () => {
  it("mirrors each private zone's length into its public count field", () => {
    const state = makeState();
    // Counts start at their schema defaults (0) before a sync.
    expect(state.players[0]!.handCount).toBe(0);

    syncPublicCounts(state);

    for (const seat of [0, 1] as const) {
      const p = state.players[seat]!;
      expect(p.deckCount).toBe(37);
      expect(p.eggDeckCount).toBe(4);
      expect(p.handCount).toBe(5);
      expect(p.securityCount).toBe(5);
    }
  });

  it("tracks subsequent zone changes on a re-sync", () => {
    const state = makeState();
    syncPublicCounts(state);
    state.players[0]!.hand.pop();
    state.players[0]!.deck.pop();

    syncPublicCounts(state);

    expect(state.players[0]!.handCount).toBe(4);
    expect(state.players[0]!.deckCount).toBe(36);
  });

  it("does not move any card between zones", () => {
    const state = makeState();
    const before = privateZoneSnapshot(state.players[0]!).map((z) => z.map((c) => c.instanceId));
    syncPublicCounts(state);
    const after = privateZoneSnapshot(state.players[0]!).map((z) => z.map((c) => c.instanceId));
    expect(after).toEqual(before);
  });
});

describe("security identity after a live zone move", () => {
  it("does not include a card ID when a deck card enters face-down security after the first snapshot", () => {
    const state = makeState();
    const targets = ([0, 1] as const).map((seat) => ({
      seat,
      view: buildStateView(state, seat),
      decoder: new Decoder(new GameState()),
    }));
    installVisibilityPort(state.players[0]!, (ownerSeat, zone, card) => {
      for (const target of targets) exposeCardInZone(target.view, target.seat, ownerSeat, zone, card);
    });
    encodeAllForViews(state, targets);

    const card = extractCardAt(state.players[0]!, Zone.Deck, 0)!;
    card.faceUp = false;
    insertCard(state.players[0]!, Zone.Security, card);
    syncPublicCounts(state);
    for (const target of targets) refreshStateView(target.view, state, target.seat);
    encodePatchForViews(state, targets);

    const ownerSecurity = targets[0]!.decoder.state.players[0]!.security;
    const arrived = ownerSecurity.find((entry) => entry.instanceId === card.instanceId);
    expect(arrived?.cardId).toBeFalsy();
    expect(targets[0]!.view.hasTag(card, CARD_ID_VIEW_TAG)).toBe(false);
  });
});

describe("buildStateView", () => {
  let state: GameState;
  beforeEach(() => {
    state = makeState();
  });

  it("unlocks the viewer's own PlayerState with the private tag", () => {
    const view = buildStateView(state, 0);
    const own = state.players[0]!;
    expect(view.has(own)).toBe(true);
    expect(view.hasTag(own, PRIVATE_VIEW_TAG)).toBe(true);
  });

  it("makes the viewer's own hand and security visible", () => {
    const view = buildStateView(state, 0);
    const own = state.players[0]!;
    expect(view.has(own.hand)).toBe(true);
    expect(view.has(own.security)).toBe(true);
  });

  it("keeps App Fusion hand routes private to the hand owner", () => {
    const route = new AppFusionRoute();
    route.hostPermanentId = "perm-1";
    route.linkedInstanceId = "linked-1";
    route.projectedCost = 0;
    state.players[0]!.hand[0]!.appFusionRoutes.push(route);
    const ownerView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);
    expect(ownerView.has(state.players[0]!.hand[0]!)).toBe(true);
    expect(ownerView.has(state.players[0]!.hand[0]!.appFusionRoutes)).toBe(true);
    expect(opponentView.has(state.players[0]!.hand[0]!)).toBe(false);
    expect(opponentView.has(state.players[0]!.hand[0]!.appFusionRoutes)).toBe(false);
    const ownerDecoder = new Decoder(new GameState());
    const opponentDecoder = new Decoder(new GameState());
    encodeAllForViews(state, [
      { view: ownerView, decoder: ownerDecoder },
      { view: opponentView, decoder: opponentDecoder },
    ]);
    expect(ownerDecoder.state.players[0]!.hand[0]!.appFusionRoutes[0]!.linkedInstanceId).toBe("linked-1");
    expect(opponentDecoder.state.players[0]!.hand).toHaveLength(0);
  });

  it("hides the viewer's own deck and egg deck from them too", () => {
    const view = buildStateView(state, 0);
    const own = state.players[0]!;
    // HIDDEN_ZONE_VIEW_TAG is granted to no view: a shuffled pile is secret from its owner.
    expect(view.has(own.deck)).toBe(false);
    expect(view.has(own.eggDeck)).toBe(false);
  });

  it("does NOT unlock the opponent's PlayerState private zones", () => {
    const view = buildStateView(state, 0);
    const opponent = state.players[1]!;
    expect(view.hasTag(opponent, PRIVATE_VIEW_TAG)).toBe(false);
    expect(view.has(opponent.hand)).toBe(false);
    expect(view.has(opponent.deck)).toBe(false);
    expect(view.has(opponent.security)).toBe(false);
  });

  it("gives each seat a mirror-image view", () => {
    const view0 = buildStateView(state, 0);
    const view1 = buildStateView(state, 1);
    expect(view0.has(state.players[0]!.hand)).toBe(true);
    expect(view0.has(state.players[1]!.hand)).toBe(false);
    expect(view1.has(state.players[1]!.hand)).toBe(true);
    expect(view1.has(state.players[0]!.hand)).toBe(false);
  });

  it("unlocks private decision payloads only for the responding seat", () => {
    const decision = new PendingDecision();
    decision.decisionId = "private-search";
    decision.seat = 0;
    decision.kind = "selectCards";
    decision.promptText = "Choose a card";
    decision.payloadJson = JSON.stringify({ visibleCards: [{ instanceId: "secret", cardId: "SECRET-001" }] });
    state.pendingDecision = decision;

    const respondingView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);

    expect(respondingView.hasTag(decision, PRIVATE_DECISION_VIEW_TAG)).toBe(true);
    expect(opponentView.hasTag(decision, PRIVATE_DECISION_VIEW_TAG)).toBe(false);
    expect(opponentView.has(decision)).toBe(false);

    const respondingDecoder = new Decoder(new GameState());
    encodeAllForView(state, respondingView, respondingDecoder);
    expect(respondingDecoder.state.pendingDecision).toMatchObject({
      decisionId: "private-search",
      seat: 0,
      kind: "selectCards",
      payloadJson: expect.stringContaining("SECRET-001"),
    });

    const opponentDecoder = new Decoder(new GameState());
    encodeAllForView(state, opponentView, opponentDecoder);
    expect(opponentDecoder.state.pendingDecision).toMatchObject({
      decisionId: "private-search",
      seat: 0,
      kind: "selectCards",
      payloadJson: "",
    });
  });

  it("shows an opponent security card that is already face-up through the public projection only", () => {
    const flipped = state.players[1]!.security[0]!;
    flipped.faceUp = true;
    syncPublicCounts(state);

    const view = buildStateView(state, 0);
    const decoder = new Decoder(new GameState());
    encodeAllForView(state, view, decoder);

    expect(view.has(flipped)).toBe(false);
    expect(view.has(state.players[1]!.security)).toBe(false);
    expect(decoder.state.players[1]!.security).toHaveLength(0);
    expect(decoder.state.players[1]!.securityView[0]).toMatchObject({
      instanceId: flipped.instanceId,
      cardId: "TEST-001",
      faceUp: true,
    });
    expect(decoder.state.players[1]!.securityView[1]).toMatchObject({ instanceId: "", cardId: "", faceUp: false });
  });

  it("keeps all opponent security hidden when every card is face-down", () => {
    const view = buildStateView(state, 0);
    for (const card of state.players[1]!.security) {
      expect(view.has(card)).toBe(false);
    }
  });

  it("reveals an opponent card that moved from hand into a battle-area permanent", () => {
    // A card keeps a stale `isFiltered` flag after leaving the @view-tagged hand,
    // so without explicit re-exposure the opponent decodes topCard=undefined.
    const opponent = state.players[1]!;
    const card = opponent.hand.pop()!;
    const permanent = new Permanent();
    permanent.permanentId = "perm-test";
    permanent.controllerSeat = 1;
    permanent.topCard = card;
    opponent.battleArea = new ArraySchema<Permanent>();
    opponent.battleArea.push(permanent);

    const view = buildStateView(state, 0);
    expect(view.has(card)).toBe(true);
  });

  it("reveals opponent digivolution-stack and linked cards on a permanent", () => {
    const opponent = state.players[1]!;
    const top = opponent.hand.pop()!;
    const stackCard = opponent.hand.pop()!;
    const linkedCard = opponent.hand.pop()!;
    const permanent = new Permanent();
    permanent.permanentId = "perm-stacked";
    permanent.controllerSeat = 1;
    permanent.topCard = top;
    permanent.stack = new ArraySchema<CardInstance>(stackCard);
    permanent.linked = new ArraySchema<CardInstance>(linkedCard);
    opponent.battleArea = new ArraySchema<Permanent>();
    opponent.battleArea.push(permanent);

    const view = buildStateView(state, 0);
    expect(view.has(top)).toBe(true);
    expect(view.has(stackCard)).toBe(true);
    expect(view.has(linkedCard)).toBe(true);
  });

  it("reveals a face-down public stack card's identity only to its owner", () => {
    const owner = state.players[0]!;
    const top = owner.hand.pop()!;
    const hiddenStackCard = owner.hand.pop()!;
    hiddenStackCard.faceUp = false;
    const permanent = new Permanent();
    permanent.permanentId = "perm-face-down-stack";
    permanent.controllerSeat = 0;
    permanent.topCard = top;
    permanent.stack = new ArraySchema<CardInstance>(hiddenStackCard);
    owner.battleArea = new ArraySchema<Permanent>(permanent);

    const ownerView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);
    expect(ownerView.hasTag(hiddenStackCard, CARD_ID_VIEW_TAG)).toBe(true);
    expect(opponentView.hasTag(hiddenStackCard, CARD_ID_VIEW_TAG)).toBe(false);

    const ownerDecoder = new Decoder(new GameState());
    encodeAllForView(state, ownerView, ownerDecoder);
    expect(ownerDecoder.state.players[0]!.battleArea[0]!.stack[0]!.cardId).toBe("TEST-001");

    const opponentDecoder = new Decoder(new GameState());
    encodeAllForView(state, opponentView, opponentDecoder);
    expect(opponentDecoder.state.players[0]!.battleArea[0]!.stack[0]!.cardId).toBeUndefined();
    expect(opponentDecoder.state.players[0]!.battleArea[0]!.stack[0]!.artId).toBe("");
    expect(ownerDecoder.state.players[0]!.battleArea[0]!.stack[0]!.artId).toBe("TEST-001_P1");
  });

  it("keeps a face-down Delay card identifiable to its owner and hidden from the opponent", () => {
    const owner = state.players[0]!;
    const delayCard = owner.hand.pop()!;
    delayCard.faceUp = false;
    owner.delayZone = new ArraySchema<CardInstance>(delayCard);

    const ownerView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);
    expect(ownerView.hasTag(delayCard, CARD_ID_VIEW_TAG)).toBe(true);
    expect(opponentView.hasTag(delayCard, CARD_ID_VIEW_TAG)).toBe(false);
  });

  it("refreshes after a card moves between schema zones", () => {
    const view = buildStateView(state, 0);
    const player = state.players[0]!;
    const moved = extractCardAt(player, Zone.Hand, 0)!;
    insertCard(player, Zone.Trash, moved);

    expect(() => refreshStateView(view, state, 0)).not.toThrow();
  });

  /** Detach `card.digivolveTargetPermanentIds` the way a remove/reinsert sequence does. */
  function detachTargetsList(card: CardInstance): ArraySchema<string> {
    const nested = card.digivolveTargetPermanentIds;
    while (nested[$changes].root !== undefined) {
      nested[$changes].root.remove(nested[$changes]);
    }
    nested[$changes].removeParent(card);
    expect(nested[$changes].root).toBeUndefined();
    expect(nested[$changes].parent).toBeUndefined();
    return nested;
  }

  it("reattaches a detached nested card schema in place, preserving its refId", () => {
    const player = state.players[0]!;
    const card = extractCardAt(player, Zone.Hand, 0)!;
    insertCard(player, Zone.Trash, card);
    const nested = card.digivolveTargetPermanentIds;
    nested.push("perm-a");
    detachTargetsList(card);
    const refIdBeforeRepair = nested[$refId];

    // The snapshot sweep is one of the two repair entry points (the other is per-arrival,
    // below). Either way the SAME tree is reattached: a fresh ArraySchema would strand every
    // client that already knows the old ref, which decodes as `"refId" not found`.
    const view = buildStateView(state, 0);

    expect(card.digivolveTargetPermanentIds).toBe(nested);
    expect(nested[$refId]).toBe(refIdBeforeRepair);
    expect(Array.from(card.digivolveTargetPermanentIds)).toEqual(["perm-a"]);
    expect(nested[$changes].root).toBeDefined();
    expect(nested[$changes].parent).toBe(card);

    const decoder = new Decoder(new GameState());
    encodeAllForView(state, view, decoder);
    const clientPlayer = decoder.state.players[0]!;
    expect(clientPlayer.hand.some(({ instanceId }) => instanceId === card.instanceId)).toBe(false);
    const clientCard = clientPlayer.trash.find(({ instanceId }) => instanceId === card.instanceId);
    expect(clientCard).toBeDefined();
    expect(Array.from(clientCard!.digivolveTargetPermanentIds)).toEqual(["perm-a"]);
  });

  it("re-roots a card a slot overwrite left untracked, so a reconnect's full sync succeeds", () => {
    const connectedView = buildStateView(state, 0);
    const connectedClient = new Decoder(new GameState());
    encodeAllForView(state, connectedView, connectedClient);
    const security = state.players[0]!.security;
    const card = security[1]!;
    // Writing a card into its own slot twice (what an in-place Fisher-Yates does when j === i)
    // drops its refCount to zero, un-rooting it and its lists, and never re-attaches them.
    security[1] = card;
    security[1] = card;
    expect(card[$changes]?.root).toBeUndefined();
    expect(card.digivolveRoutes[$changes]?.parent).toBeUndefined();

    const reconnectView = buildStateView(state, 0);
    const reconnectClient = new Decoder(new GameState());

    expect(() => encodeAllForView(state, reconnectView, reconnectClient)).not.toThrow();
    expect(card[$changes]?.root).toBeDefined();
    expect(card.digivolveRoutes[$changes]?.parent).toBe(card);
    const serverOrder = security.map(({ instanceId }) => instanceId);
    expect(reconnectClient.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual(serverOrder);
    encodePatchForView(state, connectedView, connectedClient);
    expect(connectedClient.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual(serverOrder);
  });

  it("repairs an arriving card through the visibility port, without any sweep", () => {
    const view = buildStateView(state, 0);
    const decoder = new Decoder(new GameState());
    encodeAllForView(state, view, decoder);
    installVisibilityPort(state.players[0]!, (ownerSeat, zone, card) => {
      exposeCardInZone(view, 0, ownerSeat, zone, card);
    });

    const player = state.players[0]!;
    const card = extractCardAt(player, Zone.Hand, 0)!;
    card.digivolveTargetPermanentIds.push("perm-b");
    const nested = detachTargetsList(card);
    const refIdBeforeRepair = nested[$refId];

    // No refresh, no sweep: the arrival itself has to repair the card.
    insertCard(player, Zone.Trash, card);

    expect(card.digivolveTargetPermanentIds).toBe(nested);
    expect(nested[$refId]).toBe(refIdBeforeRepair);
    expect(nested[$changes].parent).toBe(card);

    syncPublicCounts(state);
    expect(() => refreshStateView(view, state, 0)).not.toThrow();
    encodePatchForView(state, view, decoder);
    const clientCard = decoder.state.players[0]!.trash.find(({ instanceId }) => instanceId === card.instanceId);
    expect(clientCard).toBeDefined();
    expect(Array.from(clientCard!.digivolveTargetPermanentIds)).toEqual(["perm-b"]);
  });
});

describe("visibility port (per-move exposure)", () => {
  let state: GameState;

  beforeEach(() => {
    state = makeState();
  });

  /**
   * Wire both seats' StateViews to the mutation seam the way AegisRoom does, so a test can
   * move cards through `insertCard` and have the views updated by arrival alone.
   */
  function wirePort(views: readonly StateView[]): void {
    for (const player of state.players) {
      installVisibilityPort(player, (owner, zone, card) => {
        views.forEach((view, viewerSeat) => {
          exposeCardInZone(view, viewerSeat as Seat, owner, zone, card);
        });
      });
    }
  }

  it("keeps a card private to its owner when it arrives in a private zone", () => {
    const ownerView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);
    wirePort([ownerView, opponentView]);

    const ownerDecoder = new Decoder(new GameState());
    const opponentDecoder = new Decoder(new GameState());
    const targets = [
      { view: ownerView, decoder: ownerDecoder },
      { view: opponentView, decoder: opponentDecoder },
    ];
    encodeAllForViews(state, targets);

    const drawn = makeCard("late-draw", 0);
    insertCard(state.players[0]!, Zone.Hand, drawn);
    syncPublicCounts(state);
    encodePatchForViews(state, targets);

    const ownerHand = ownerDecoder.state.players[0]!.hand;
    expect(ownerHand.some(({ instanceId }) => instanceId === "late-draw")).toBe(true);
    // The opponent gets the count mirror and nothing else.
    expect(opponentDecoder.state.players[0]!.hand.length).toBe(0);
    expect(opponentDecoder.state.players[0]!.handCount).toBe(ownerHand.length);
  });

  it("sends private evolution routes for a card that arrives in hand after the view exists", () => {
    const ownerView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);
    wirePort([ownerView, opponentView]);

    const ownerDecoder = new Decoder(new GameState());
    const opponentDecoder = new Decoder(new GameState());
    const targets = [
      { view: ownerView, decoder: ownerDecoder },
      { view: opponentView, decoder: opponentDecoder },
    ];
    encodeAllForViews(state, targets);

    const drawn = makeCard("late-route", 0);
    insertCard(state.players[0]!, Zone.Hand, drawn);
    const route = new AppFusionRoute();
    route.hostPermanentId = "host";
    route.linkedInstanceId = "linked";
    route.projectedCost = 0;
    drawn.appFusionRoutes.push(route);
    syncPublicCounts(state);
    encodePatchForViews(state, targets);

    const ownerCard = ownerDecoder.state.players[0]!.hand.find(({ instanceId }) => instanceId === "late-route");
    expect(ownerCard?.appFusionRoutes[0]?.linkedInstanceId).toBe("linked");
    expect(opponentDecoder.state.players[0]!.hand).toHaveLength(0);
  });

  /**
   * The property `refreshStateView`'s old per-patch walk existed to guarantee, now carried by
   * arrival-time exposure alone: a view that learned a card when it entered the hand still
   * recognises it when it leaves, so the encoder emits the DELETE instead of dropping it and
   * stranding a phantom copy in the client's hand forever.
   */
  it("encodes the removal of a card exposed only at arrival time", () => {
    const ownerView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);
    wirePort([ownerView, opponentView]);

    const ownerDecoder = new Decoder(new GameState());
    encodeAllForView(state, ownerView, ownerDecoder);

    const player = state.players[0]!;
    const drawn = makeCard("played-card", 0);
    insertCard(player, Zone.Hand, drawn);
    syncPublicCounts(state);
    encodePatchForView(state, ownerView, ownerDecoder);
    expect(ownerDecoder.state.players[0]!.hand.some(({ instanceId }) => instanceId === "played-card")).toBe(true);

    // Move it out WITHOUT any view refresh — arrival-time exposure must carry the delete.
    const moved = extractCardAt(player, Zone.Hand, player.hand.length - 1)!;
    insertCard(player, Zone.Trash, moved);
    syncPublicCounts(state);
    encodePatchForView(state, ownerView, ownerDecoder);

    const clientPlayer = ownerDecoder.state.players[0]!;
    expect(clientPlayer.hand.some(({ instanceId }) => instanceId === "played-card")).toBe(false);
    expect(clientPlayer.trash.some(({ instanceId }) => instanceId === "played-card")).toBe(true);
  });

  it("shows a card arriving in a public zone to both seats", () => {
    const ownerView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);
    wirePort([ownerView, opponentView]);

    const ownerDecoder = new Decoder(new GameState());
    const opponentDecoder = new Decoder(new GameState());
    const targets = [
      { view: ownerView, decoder: ownerDecoder },
      { view: opponentView, decoder: opponentDecoder },
    ];
    encodeAllForViews(state, targets);

    const trashed = makeCard("to-trash", 0);
    insertCard(state.players[0]!, Zone.Trash, trashed);
    syncPublicCounts(state);
    encodePatchForViews(state, targets);

    for (const decoder of [ownerDecoder, opponentDecoder]) {
      const card = decoder.state.players[0]!.trash.find(({ instanceId }) => instanceId === "to-trash");
      expect(card).toBeDefined();
      expect(card!.cardId).toBe("TEST-001"); // face-up: identity revealed to both
    }
  });

  it("does not re-send private zone contents on every patch", () => {
    const ownerView = buildStateView(state, 0);
    wirePort([ownerView]);
    const decoder = new Decoder(new GameState());
    encodeAllForView(state, ownerView, decoder);
    // `encodeAllView` does not drain `view.changes` (only `encodeView` does), so the forced
    // ADDs `buildStateView` queued for the initial snapshot are still pending. Spend them on
    // one throwaway patch; what matters is the STEADY-STATE patch that follows.
    encodePatchForView(state, ownerView, decoder);

    // A patch that changes one unrelated public field must not drag the whole hand/deck along.
    state.players[0]!.deckCount = 36;
    // Exactly what AegisRoom.onBeforePatch does. Before the private-zone walk was removed from
    // this path it re-queued a forced ADD for every field of all 46 private cards, every patch.
    refreshStateView(ownerView, state, 0);
    const encoder = encoderByState.get(state)!;
    const iterator = { offset: 0 };
    encoder.encode(iterator);
    const bytes = encoder.encodeView(ownerView, iterator.offset, iterator);
    encoder.discardChanges();

    // 46 private cards live in this fixture; re-adding them would run to hundreds of bytes.
    expect(bytes.byteLength).toBeLessThan(64);
  });

  /**
   * Layer C's payoff: a permanent's cards are announced as they arrive, so a refresh no longer
   * walks the board. Patch cost must not track board size either.
   */
  it("keeps patch size flat as the board fills", () => {
    const ownerView = buildStateView(state, 0);
    wirePort([ownerView]);
    const decoder = new Decoder(new GameState());
    encodeAllForView(state, ownerView, decoder);
    encodePatchForView(state, ownerView, decoder); // drain the join-time forced ADDs

    const encoder = encoderByState.get(state)!;
    const patchSize = (): number => {
      refreshStateView(ownerView, state, 0);
      const iterator = { offset: 0 };
      encoder.encode(iterator);
      const bytes = encoder.encodeView(ownerView, iterator.offset, iterator);
      encoder.discardChanges();
      return bytes.byteLength;
    };

    state.players[0]!.deckCount = 36;
    const emptyBoard = patchSize();

    const player = state.players[0]!;
    for (let i = 0; i < 5; i += 1) {
      const permanent = new Permanent();
      permanent.permanentId = `perm-${i}`;
      permanent.controllerSeat = 0;
      permanent.topCard = makeCard(`top-${i}`, 0);
      for (let j = 0; j < 3; j += 1) permanent.stack.push(makeCard(`stack-${i}-${j}`, 0));
      placePermanent(player, permanent);
    }
    encodePatchForView(state, ownerView, decoder); // the arrivals themselves, sent once

    state.players[0]!.deckCount = 35;
    const fullBoard = patchSize();

    expect(decoder.state.players[0]!.battleArea.length).toBe(5);
    expect(fullBoard).toBeLessThanOrEqual(emptyBoard + 8);
  });

  /**
   * Trash grows all match, so a per-patch walk of it made every patch cost more than the
   * last — the "it gets laggy after a while" shape. Patch cost must not track trash size.
   */
  it("keeps patch size flat as the trash grows", () => {
    const ownerView = buildStateView(state, 0);
    wirePort([ownerView]);
    const decoder = new Decoder(new GameState());
    encodeAllForView(state, ownerView, decoder);
    encodePatchForView(state, ownerView, decoder); // drain the join-time forced ADDs

    const encoder = encoderByState.get(state)!;
    const patchSize = (): number => {
      refreshStateView(ownerView, state, 0);
      const iterator = { offset: 0 };
      encoder.encode(iterator);
      const bytes = encoder.encodeView(ownerView, iterator.offset, iterator);
      encoder.discardChanges();
      return bytes.byteLength;
    };

    state.players[0]!.deckCount = 36;
    const withEmptyTrash = patchSize();

    for (let i = 0; i < 30; i += 1) insertCard(state.players[0]!, Zone.Trash, makeCard(`trash-${i}`, 0));
    encodePatchForView(state, ownerView, decoder); // the arrivals themselves, sent once

    state.players[0]!.deckCount = 35;
    const withFullTrash = patchSize();

    expect(decoder.state.players[0]!.trash.length).toBe(30);
    expect(withFullTrash).toBeLessThanOrEqual(withEmptyTrash + 8);
  });
});

describe("hidden zone redaction (what the owner's own client receives)", () => {
  let state: GameState;

  beforeEach(() => {
    state = makeState();
  });

  /** Decode a full snapshot the way a joining client would, and return its copy of the state. */
  function decodeForSeat(seat: Seat): GameState {
    const view = buildStateView(state, seat);
    const decoder = new Decoder(new GameState());
    encodeAllForView(state, view, decoder);
    return decoder.state;
  }

  it("never sends the deck or egg deck to their owner, only the counts", () => {
    syncPublicCounts(state);
    const mine = decodeForSeat(0).players[0]!;

    // Deck ORDER is the decisive secret: knowing the draw sequence decides games. It must not
    // reach the browser at all, not even redacted — an instanceId list still tracks a known
    // card through a shuffle.
    expect(mine.deck.length).toBe(0);
    expect(mine.eggDeck.length).toBe(0);
    expect(mine.deckCount).toBe(37);
    expect(mine.eggDeckCount).toBe(4);
  });

  it("still sends the owner their own hand, with identities", () => {
    const mine = decodeForSeat(0).players[0]!;
    expect(mine.hand.length).toBe(5);
    for (const card of mine.hand) expect(card.cardId).toBe("TEST-001");
  });

  it("sends the owner their face-down security as anonymous cards", () => {
    syncPublicCounts(state);
    const mine = decodeForSeat(0).players[0]!;

    // The stack is there (the client counts it and reads faceUp), but §3-7-2 says a player may
    // not look at their own security, so no identity travels.
    expect(mine.security.length).toBe(5);
    expect(mine.securityCount).toBe(5);
    for (const card of mine.security) {
      expect(card.instanceId).toBeTruthy(); // the card object arrives...
      expect(card.faceUp).toBe(false);
      expect(card.cardId).toBeFalsy(); // ...but never carries an identity
    }
  });

  it("sends the identity of a security card that is already face-up", () => {
    const owner = state.players[0]!;
    owner.security[2]!.faceUp = true;
    const mine = decodeForSeat(0).players[0]!;

    const revealed = mine.security.find((card) => card.faceUp);
    expect(revealed?.cardId).toBe("TEST-001");
    expect(mine.security.filter((card) => !card.faceUp).every((card) => !card.cardId)).toBe(true);
    expect(mine.security.filter((card) => !card.faceUp).every((card) => !card.artId)).toBe(true);
  });

  it("keeps the opponent blind to every hidden zone", () => {
    syncPublicCounts(state);
    const theirs = decodeForSeat(1).players[0]!;
    expect(theirs.deck.length).toBe(0);
    expect(theirs.eggDeck.length).toBe(0);
    expect(theirs.hand.length).toBe(0);
    expect(theirs.security.length).toBe(0);
    // Counts are public so the opponent can render the piles.
    expect(theirs.deckCount).toBe(37);
    expect(theirs.handCount).toBe(5);
  });

  it("reveals a card's identity to the owner as it is drawn into hand", () => {
    const view = buildStateView(state, 0);
    const decoder = new Decoder(new GameState());
    encodeAllForView(state, view, decoder);
    installVisibilityPort(state.players[0]!, (owner, zone, card) => {
      exposeCardInZone(view, 0, owner, zone, card);
    });

    const player = state.players[0]!;
    const drawn = extractCardAt(player, Zone.Deck, 0)!;
    insertCard(player, Zone.Hand, drawn);
    syncPublicCounts(state);
    encodePatchForView(state, view, decoder);

    const clientCard = decoder.state.players[0]!.hand.find(({ instanceId }) => instanceId === drawn.instanceId);
    expect(clientCard).toBeDefined();
    expect(clientCard!.cardId).toBe("TEST-001");
  });
});

describe("face-up security", () => {
  it("synchronizes a newly face-up security card to both player viewpoints", () => {
    const state = makeState();
    syncPublicCounts(state);
    const ownerView = buildStateView(state, 0);
    const opponentView = buildStateView(state, 1);
    const ownerDecoder = new Decoder(new GameState());
    const opponentDecoder = new Decoder(new GameState());
    const targets = [
      { view: ownerView, decoder: ownerDecoder },
      { view: opponentView, decoder: opponentDecoder },
    ];
    encodeAllForViews(state, targets);

    const revealed = state.players[0]!.security[2]!;
    revealed.faceUp = true;
    syncPublicCounts(state);
    refreshStateView(ownerView, state, 0);
    refreshStateView(opponentView, state, 1);
    encodePatchForViews(state, targets);

    const ownerSecurity = ownerDecoder.state.players[0]!.securityView;
    const opponentSecurity = opponentDecoder.state.players[0]!.securityView;
    expect(ownerSecurity[2]).toMatchObject({
      cardId: "TEST-001",
      artId: "TEST-001_P1",
      faceUp: true,
    });
    expect(opponentSecurity[2]).toMatchObject({
      cardId: "TEST-001",
      artId: "TEST-001_P1",
      faceUp: true,
    });
    expect(ownerSecurity.filter(({ faceUp }) => !faceUp).every(({ cardId }) => !cardId)).toBe(true);
    expect(
      opponentSecurity
        .filter(({ faceUp }) => !faceUp)
        .every(({ instanceId, cardId, artId }) => !instanceId && !cardId && !artId),
    ).toBe(true);
    expect(ownerDecoder.state.players[0]!.security[2]).toMatchObject({ cardId: "TEST-001", faceUp: true });
    expect(opponentDecoder.state.players[0]!.security).toHaveLength(0);
  });
});

describe("spectator visibility", () => {
  it("encodes public counts but neither hand, hidden security, decisions nor counter candidates", () => {
    const state = makeState();
    syncPublicCounts(state);
    const decision = new PendingDecision();
    decision.decisionId = "private-question";
    decision.seat = 0;
    decision.kind = "selectCards";
    decision.payloadJson = JSON.stringify({ cardIds: ["SECRET-HAND"] });
    state.pendingDecision = decision;
    const counter = new CombatWindow();
    counter.seat = 0;
    counter.kind = "counter";
    counter.eligibleCountersJson = JSON.stringify([{ instanceId: "private-hand-card", effectKey: "blast" }]);
    state.combatWindow = counter;
    const targets = [0, 1, undefined].map((seat) => ({
      view: buildStateView(state, seat as Seat | undefined),
      decoder: new Decoder(new GameState()),
    }));
    encodeAllForViews(state, targets);
    expect(targets[0]!.decoder.state.pendingDecision?.payloadJson).toContain("SECRET-HAND");
    expect(targets[0]!.decoder.state.combatWindow?.eligibleCountersJson).toContain("private-hand-card");
    for (const target of targets.slice(1)) {
      expect(target.decoder.state.pendingDecision?.payloadJson ?? "").toBe("");
      expect(target.decoder.state.combatWindow?.eligibleCountersJson ?? "").toBe("");
    }
    const watched = targets[2]!.decoder.state;
    for (const player of watched.players) {
      expect(player.hand.length).toBe(0);
      expect(player.deck.length).toBe(0);
      expect(player.eggDeck.length).toBe(0);
      expect(player.security.length).toBe(0);
      expect(player.handCount).toBe(5);
      expect(player.securityCount).toBe(5);
    }
    for (const target of targets) target.view.dispose();
  });

  it("updates public card arrivals and face-up security without unlocking later draws", () => {
    const state = makeState();
    const view = buildStateView(state, undefined);
    const decoder = new Decoder(new GameState());
    syncPublicCounts(state);
    encodeAllForView(state, view, decoder);
    const player = state.players[0]!;
    const played = player.hand.shift()!;
    player.trash.push(played);
    exposeCardInZone(view, undefined, 0, Zone.Trash, played);
    const drawn = makeCard("new-private-hand", 0);
    player.hand.push(drawn);
    exposeCardInZone(view, undefined, 0, Zone.Hand, drawn);
    player.security[0]!.faceUp = true;
    syncPublicCounts(state);
    refreshStateView(view, state, undefined);
    encodePatchForView(state, view, decoder);
    expect(decoder.state.players[0]!.trash[0]!.cardId).toBe("TEST-001");
    expect(decoder.state.players[0]!.hand.length).toBe(0);
    expect(decoder.state.players[0]!.handCount).toBe(5);
    expect(decoder.state.players[0]!.securityView[0]!.cardId).toBe("TEST-001");
    expect(decoder.state.players[0]!.securityView[1]!.cardId).toBe("");
    view.dispose();
  });
});

describe("finalRevealOf", () => {
  it("lists every hidden zone of both seats, top first", () => {
    const state = makeState();
    state.players[1]!.deck[0]!.cardId = "TOP-001";
    const revealed = finalRevealOf(state);
    expect(revealed.map((player) => player.seat)).toEqual([0, 1]);
    const opponent = revealed[1]!;
    expect(opponent.deck).toHaveLength(37);
    expect(opponent.deck[0]).toEqual({ cardId: "TOP-001", artId: "TEST-001_P1" });
    expect(opponent.eggDeck).toHaveLength(4);
    expect(opponent.hand).toHaveLength(5);
    expect(opponent.security).toHaveLength(5);
  });
});

/**
 * Follow-up to feedback #24. A card both seats saw can move into a zone a viewer may not read:
 * any deck, or the opponent's hand or face-down security. The client drops its copy when the
 * departure arrives. If the view still counts the card as visible, the next change to one of
 * its fields (a reveal's `faceUp` flip) is encoded for a refId the client no longer has, and
 * the decoder logs `"refId" not found`.
 */
describe("a card that moves out of a viewer's sight", () => {
  let state: GameState;
  let targets: { seat: Seat; view: StateView; decoder: Decoder<GameState> }[];
  let decoderErrors: string[];

  beforeEach(() => {
    state = makeState();
    targets = ([0, 1] as const).map((seat) => ({
      seat,
      view: buildStateView(state, seat),
      decoder: new Decoder(new GameState()),
    }));
    for (const player of state.players) {
      installVisibilityPort(player, (ownerSeat, zone, card) => {
        for (const target of targets) exposeCardInZone(target.view, target.seat, ownerSeat, zone, card);
      });
    }
    decoderErrors = [];
    vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      decoderErrors.push(String(message));
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    encodeAllForViews(state, targets);
    patch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** One `AegisRoom.broadcastPatch`: `onBeforePatch`, the encode, then the after-patch release. */
  function patch(): void {
    syncPublicCounts(state);
    for (const target of targets) refreshStateView(target.view, state, target.seat);
    encodePatchForViews(state, targets);
    for (const target of targets) forgetWithheldCards(target.view, state, target.seat);
  }

  function seenBy(seat: Seat): GameState {
    return targets[seat]!.decoder.state;
  }

  it.each(["top", "bottom"] as const)(
    "synchronizes a deck card passing through %s security into hand before a patch",
    (position) => {
      const player = state.players[0]!;
      for (let round = 0; round < 3; round++) {
        const card = extractCardAt(player, Zone.Deck, 0)!;
        card.faceUp = false;
        insertCard(player, Zone.Security, card, position);
        extractCardAt(player, Zone.Security, player.security.indexOf(card));
        card.faceUp = true;
        insertCard(player, Zone.Hand, card);
        patch();

        expect(decoderErrors).toEqual([]);
        expect(seenBy(0).players[0]!.hand.map((entry) => entry.instanceId)).toEqual(
          player.hand.map((entry) => entry.instanceId),
        );
        expect(seenBy(0).players[0]!.hand.find((entry) => entry.instanceId === card.instanceId)?.cardId).toBe(
          card.cardId,
        );
        expect(seenBy(1).players[0]!.hand).toHaveLength(0);
        expectNoHiddenSecurityIdentity();
      }
    },
  );

  function trashCardSeenByBothSeats(id: string): CardInstance {
    const card = makeCard(id, 0);
    insertCard(state.players[0]!, Zone.Trash, card);
    patch();
    for (const seat of [0, 1] as const) {
      expect(seenBy(seat).players[0]!.trash.find((entry) => entry.instanceId === id)?.cardId).toBe("TEST-001");
    }
    return card;
  }

  function moveOutOfTrash(card: CardInstance, zone: Zone.Deck | Zone.Hand | Zone.Security): void {
    const player = state.players[0]!;
    extractCardAt(player, Zone.Trash, player.trash.indexOf(card));
    insertCard(player, zone, card);
  }

  it.each([Zone.Hand, Zone.Deck, Zone.EggDeck, Zone.Security] as const)(
    "keeps both player slots when a new top card returns to %s before its first board patch",
    (destination) => {
      const player = state.players[0]!;
      const permanent = new Permanent();
      permanent.permanentId = "returned-before-patch";
      permanent.controllerSeat = 0;
      permanent.topCard = makeCard("old-public-top", 0);
      placePermanent(player, permanent);
      patch();

      const previousTop = permanent.topCard;
      const newTop = extractCardAt(player, Zone.Hand, 0)!;
      setTopCard(permanent, newTop);
      extractPermanentAt(player, player.battleArea.indexOf(permanent));
      insertCard(player, Zone.Trash, previousTop);
      newTop.faceUp = false;
      insertCard(player, destination, newTop);
      patch();

      expect(decoderErrors).toEqual([]);
      for (const seat of [0, 1] as const) {
        expect(seenBy(seat).players.map((entry) => entry.seat)).toEqual([0, 1]);
        expect(seenBy(seat).players[0]!.battleArea).toHaveLength(0);
        expect(seenBy(seat).players[0]!.trash[0]!.instanceId).toBe(previousTop.instanceId);
      }
      expect(seenBy(0).players[0]!.hand.map((entry) => entry.instanceId)).toEqual(
        player.hand.map((entry) => entry.instanceId),
      );
      expect(seenBy(1).players[0]!.hand).toHaveLength(0);
      expectNoHiddenSecurityIdentity();
    },
  );

  it("forgets a previously delivered card before another unseen board round trip", () => {
    const card = trashCardSeenByBothSeats("delivered-then-hidden");
    moveOutOfTrash(card, Zone.Hand);
    patch();

    const player = state.players[0]!;
    extractCardAt(player, Zone.Hand, player.hand.indexOf(card));
    const transient = new Permanent();
    transient.permanentId = "unseen-round-trip";
    transient.controllerSeat = 0;
    transient.topCard = card;
    placePermanent(player, transient);
    extractPermanentAt(player, player.battleArea.indexOf(transient));
    insertCard(player, Zone.Hand, card);
    patch();

    expect(decoderErrors).toEqual([]);
    expect(seenBy(1).players[0]!.hand).toHaveLength(0);
    expect(seenBy(1).players[0]!.battleArea).toHaveLength(0);
    expect(seenBy(0).players[0]!.hand.find((entry) => entry.instanceId === card.instanceId)?.cardId).toBe("TEST-001");
  });

  it("re-exposes a cancelled board arrival when the card reaches trash in the same patch", () => {
    const player = state.players[0]!;
    const card = extractCardAt(player, Zone.Hand, 0)!;
    const transient = new Permanent();
    transient.permanentId = "cancelled-then-public";
    transient.controllerSeat = 0;
    transient.topCard = card;
    placePermanent(player, transient);
    extractPermanentAt(player, player.battleArea.indexOf(transient));
    insertCard(player, Zone.Hand, card);
    extractCardAt(player, Zone.Hand, player.hand.indexOf(card));
    insertCard(player, Zone.Trash, card);
    patch();

    expect(decoderErrors).toEqual([]);
    for (const seat of [0, 1] as const) {
      expect(seenBy(seat).players.map((entry) => entry.seat)).toEqual([0, 1]);
      expect(seenBy(seat).players[0]!.trash[0]).toMatchObject({ instanceId: card.instanceId, cardId: "TEST-001" });
    }
  });

  it("sends nothing for a deck card revealed after both seats saw it", () => {
    const card = trashCardSeenByBothSeats("returned-to-deck");
    moveOutOfTrash(card, Zone.Deck);
    card.faceUp = false;
    patch();

    card.faceUp = true;
    patch();

    expect(decoderErrors).toEqual([]);
    for (const seat of [0, 1] as const) {
      expect(seenBy(seat).players[0]!.trash.some((entry) => entry.instanceId === card.instanceId)).toBe(false);
      expect(seenBy(seat).players[0]!.deck).toHaveLength(0);
      expect(seenBy(seat).players[0]!.deckCount).toBe(state.players[0]!.deck.length);
    }
  });

  it("shows the card again to both seats when it leaves the deck for the trash", () => {
    const card = trashCardSeenByBothSeats("deck-round-trip");
    moveOutOfTrash(card, Zone.Deck);
    patch();
    card.faceUp = false;
    patch();

    const player = state.players[0]!;
    extractCardAt(player, Zone.Deck, player.deck.indexOf(card));
    insertCard(player, Zone.Trash, card);
    patch();

    expect(decoderErrors).toEqual([]);
    for (const seat of [0, 1] as const) {
      const seen = seenBy(seat).players[0]!.trash.find((entry) => entry.instanceId === card.instanceId);
      expect(seen?.cardId).toBe("TEST-001");
      expect(seen?.faceUp).toBe(true);
    }
  });

  it("still removes a card from its owner's hand when it goes into the deck", () => {
    const player = state.players[0]!;
    const card = player.hand[0]!;
    extractCardAt(player, Zone.Hand, 0);
    insertCard(player, Zone.Deck, card);
    patch();
    card.faceUp = !card.faceUp;
    patch();

    expect(decoderErrors).toEqual([]);
    const ownerHand = seenBy(0).players[0]!.hand;
    expect(ownerHand.map((entry) => entry.instanceId)).toEqual(player.hand.map((entry) => entry.instanceId));
  });

  it("sends the opponent nothing for a card that went back to its owner's hand", () => {
    const card = trashCardSeenByBothSeats("returned-to-hand");
    moveOutOfTrash(card, Zone.Hand);
    patch();
    card.faceUp = false;
    patch();

    expect(decoderErrors).toEqual([]);
    expect(seenBy(1).players[0]!.hand).toHaveLength(0);
    expect(seenBy(0).players[0]!.hand.find((entry) => entry.instanceId === card.instanceId)?.cardId).toBe("TEST-001");
  });

  /** Seat 0's security card as `seat` decoded it, from the raw array (owner only) or the public projection. */
  function decodedSecurity(seat: Seat, card: CardInstance): { raw?: CardInstance; projected?: SecurityCardView } {
    const decoded = seenBy(seat).players[0]!;
    return {
      raw: decoded.security.find((entry) => entry?.instanceId === card.instanceId),
      projected: decoded.securityView.find((entry) => entry?.instanceId === card.instanceId),
    };
  }

  /**
   * No seat may read a face-down security card, its owner included (§3-7-2). Only the owner
   * receives the raw security array; everyone reads face-up cards from `securityView`.
   */
  function expectNoHiddenSecurityIdentity(): void {
    const leaks: string[] = [];
    for (const seat of [0, 1] as const) {
      for (const decoded of seenBy(seat).players) {
        const raw = Array.from(decoded.security).filter(Boolean);
        if (decoded.seat !== seat) leaks.push(...raw.map((entry) => `seat ${seat} holds ${entry.instanceId}`));
        for (const entry of raw.filter((card) => !card.faceUp && (card.cardId || card.artId))) {
          leaks.push(`seat ${seat} reads face-down ${entry.instanceId}`);
        }
        for (const entry of Array.from(decoded.securityView)) {
          if (!entry.faceUp && (entry.instanceId || entry.cardId || entry.artId))
            leaks.push(`seat ${seat} reads projected ${entry.instanceId}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  }

  function revealTopSecurity(): CardInstance {
    const top = state.players[0]!.security[0]!;
    top.faceUp = true;
    patch();
    for (const seat of [0, 1] as const) expect(decodedSecurity(seat, top).projected?.cardId).toBe("TEST-001");
    expect(decodedSecurity(0, top).raw?.cardId).toBe("TEST-001");
    return top;
  }

  it("reveals a face-down security card to both seats once it turns face-up", () => {
    const card = trashCardSeenByBothSeats("placed-in-security");
    card.faceUp = false;
    moveOutOfTrash(card, Zone.Security);
    patch();
    expect(decodedSecurity(1, card).raw).toBeUndefined();

    card.faceUp = true;
    patch();

    expect(decoderErrors).toEqual([]);
    expect(decodedSecurity(0, card).raw?.cardId).toBe("TEST-001");
    for (const seat of [0, 1] as const) expect(decodedSecurity(seat, card).projected?.cardId).toBe("TEST-001");
    expectNoHiddenSecurityIdentity();
  });

  it("keeps both seats' view of a partly face-up security stack in step with the server", () => {
    const player = state.players[0]!;
    player.security[0]!.faceUp = true;
    patch();
    const card = trashCardSeenByBothSeats("security-beside-face-up");
    card.faceUp = false;
    moveOutOfTrash(card, Zone.Security);
    patch();
    card.faceUp = true;
    patch();
    expect(decodedSecurity(1, card).projected?.cardId).toBe("TEST-001");
    card.faceUp = false;
    patch();

    extractCardAt(player, Zone.Security, player.security.indexOf(card));
    insertCard(player, Zone.Trash, card);
    patch();

    expect(decoderErrors).toEqual([]);
    expectNoHiddenSecurityIdentity();
    expect(seenBy(0).players[0]!.security.map((entry) => entry.instanceId)).toEqual(
      player.security.map((entry) => entry.instanceId),
    );
    for (const seat of [0, 1] as const) {
      const decoded = seenBy(seat).players[0]!;
      expect(decoded.securityView.map((entry) => entry.instanceId)).toEqual(
        player.securityView.map((entry) => entry.instanceId),
      );
      expect(decoded.trash.find((entry) => entry.instanceId === card.instanceId)?.cardId).toBe("TEST-001");
    }
  });

  it("removes a face-down card from security for both seats when it leaves", () => {
    const player = state.players[0]!;
    player.security[0]!.faceUp = true;
    patch();
    const card = trashCardSeenByBothSeats("leaves-security-face-down");
    card.faceUp = false;
    moveOutOfTrash(card, Zone.Security);
    patch();
    patch();

    extractCardAt(player, Zone.Security, player.security.indexOf(card));
    insertCard(player, Zone.Trash, card);
    patch();

    expect(decoderErrors).toEqual([]);
    for (const seat of [0, 1] as const) {
      expect(decodedSecurity(seat, card)).toEqual({ raw: undefined, projected: undefined });
      expect(seenBy(seat).players[0]!.trash.find((entry) => entry.instanceId === card.instanceId)?.cardId).toBe(
        "TEST-001",
      );
    }
  });

  describe("face-down security identity", () => {
    it("keeps a known card's identity from the opponent when it enters face-down security", () => {
      revealTopSecurity();
      const card = trashCardSeenByBothSeats("known-into-security");
      card.faceUp = false;
      moveOutOfTrash(card, Zone.Security);
      patch();

      expect(decoderErrors).toEqual([]);
      expect(decodedSecurity(1, card)).toEqual({ raw: undefined, projected: undefined });
      expect(seenBy(1).players[0]!.trash.some((entry) => entry.instanceId === card.instanceId)).toBe(false);
      expectNoHiddenSecurityIdentity();
    });

    it("keeps a known card's identity from its owner when it enters face-down security", () => {
      const card = trashCardSeenByBothSeats("known-into-own-security");
      card.faceUp = false;
      moveOutOfTrash(card, Zone.Security);
      patch();

      expect(decoderErrors).toEqual([]);
      expect(decodedSecurity(0, card).raw).toMatchObject({ instanceId: card.instanceId, faceUp: false });
      expectNoHiddenSecurityIdentity();
    });

    it("keeps a new face-down card's instance id from the opponent beside a face-up card", () => {
      revealTopSecurity();
      const player = state.players[0]!;
      const card = extractCardAt(player, Zone.Deck, 0)!;
      card.faceUp = false;
      insertCard(player, Zone.Security, card, "top");
      patch();

      expect(decoderErrors).toEqual([]);
      expect(decodedSecurity(1, card)).toEqual({ raw: undefined, projected: undefined });
      expect(decodedSecurity(0, card).raw).toMatchObject({ instanceId: card.instanceId, faceUp: false });
      expectNoHiddenSecurityIdentity();
    });

    it("takes the identity back from both seats when a security card turns face-down in place", () => {
      const top = revealTopSecurity();
      top.faceUp = false;
      patch();

      expect(decoderErrors).toEqual([]);
      expect(decodedSecurity(0, top).raw).toMatchObject({ instanceId: top.instanceId, faceUp: false });
      expect(decodedSecurity(1, top)).toEqual({ raw: undefined, projected: undefined });
      expectNoHiddenSecurityIdentity();
    });

    it("shows a card turned face-down in place to both seats again when it turns face-up", () => {
      const top = revealTopSecurity();
      top.faceUp = false;
      patch();
      top.faceUp = true;
      patch();

      expect(decoderErrors).toEqual([]);
      expect(decodedSecurity(0, top).raw).toMatchObject({ cardId: "TEST-001", artId: "TEST-001_P1", faceUp: true });
      for (const seat of [0, 1] as const) {
        expect(decodedSecurity(seat, top).projected).toMatchObject({
          cardId: "TEST-001",
          artId: "TEST-001_P1",
          faceUp: true,
        });
      }
    });

    it("shows a known card that enters security face-up to both seats", () => {
      const card = trashCardSeenByBothSeats("known-into-security-face-up");
      moveOutOfTrash(card, Zone.Security);
      patch();

      expect(decoderErrors).toEqual([]);
      expect(decodedSecurity(0, card).raw).toMatchObject({ cardId: "TEST-001", faceUp: true });
      for (const seat of [0, 1] as const) {
        expect(decodedSecurity(seat, card).projected).toMatchObject({ cardId: "TEST-001", faceUp: true });
      }
      expectNoHiddenSecurityIdentity();
    });

    it("hides every position after a shuffle turns face-up security cards face-down", () => {
      const player = state.players[0]!;
      player.security[1]!.faceUp = true;
      player.security[3]!.faceUp = true;
      patch();

      const shuffled = clearZone(player, Zone.Security).reverse();
      for (const card of shuffled) card.faceUp = false;
      fillZone(player, Zone.Security, shuffled);
      patch();

      expect(decoderErrors).toEqual([]);
      expect(seenBy(0).players[0]!.security.map((entry) => entry.instanceId)).toEqual(
        player.security.map((entry) => entry.instanceId),
      );
      expectNoHiddenSecurityIdentity();
    });

    it("sends the opponent nothing from its owner's hand after a security card turns face-up", () => {
      revealTopSecurity();
      const player = state.players[0]!;
      const drawn = extractCardAt(player, Zone.Deck, 0)!;
      insertCard(player, Zone.Hand, drawn);
      patch();
      const known = trashCardSeenByBothSeats("known-into-hand");
      moveOutOfTrash(known, Zone.Hand);
      patch();
      player.hand[0]!.faceUp = !player.hand[0]!.faceUp;
      patch();

      expect(decoderErrors).toEqual([]);
      expect(seenBy(1).players[0]!.hand.filter(Boolean)).toHaveLength(0);
    });

    it("sends nothing about a known card that enters the egg deck", () => {
      const card = trashCardSeenByBothSeats("known-into-egg-deck");
      const player = state.players[0]!;
      extractCardAt(player, Zone.Trash, player.trash.indexOf(card));
      card.faceUp = false;
      insertCard(player, Zone.EggDeck, card);
      patch();
      card.faceUp = true;
      patch();

      expect(decoderErrors).toEqual([]);
      for (const seat of [0, 1] as const) {
        expect(seenBy(seat).players[0]!.eggDeck).toHaveLength(0);
        expect(seenBy(seat).players[0]!.trash.some((entry) => entry.instanceId === card.instanceId)).toBe(false);
      }
    });
  });
});

it("keeps identity and spectator roster private across patches and fresh observer views", () => {
  const state = makeState();
  const hidden = state.players[0]!;
  hidden.displayName = "Hidden Tamer";
  hidden.avatarId = "hidden-avatar";
  hidden.sessionId = "hidden-session";
  hidden.hideIdentityFromSpectators = true;
  hidden.spectatorNamesJson = '["Mimi"]';
  state.players[1]!.displayName = "Public Tamer";
  const spectator = { view: buildStateView(state, undefined), decoder: new Decoder(new GameState()) };
  const participant = { view: buildStateView(state, 0), decoder: new Decoder(new GameState()) };
  encodeAllForViews(state, [spectator, participant]);
  hidden.displayName = "Updated Hidden Tamer";
  hidden.avatarId = "updated-hidden-avatar";
  hidden.sessionId = "updated-hidden-session";
  hidden.spectatorNamesJson = '["Mimi","Joe"]';
  hidden.anonymousSpectatorCount = 2;
  state.players[1]!.displayName = "Updated Public Tamer";
  refreshStateView(spectator.view, state, undefined);
  refreshStateView(participant.view, state, 0);
  encodePatchForViews(state, [spectator, participant]);
  expect(participant.decoder.state.players[0]!.displayName).toBe("Updated Hidden Tamer");
  expect(participant.decoder.state.players[0]!.spectatorNamesJson).toBe('["Mimi","Joe"]');
  expect(participant.decoder.state.players[0]!.anonymousSpectatorCount).toBe(2);
  const reconnected = { view: buildStateView(state, undefined), decoder: new Decoder(new GameState()) };
  encodeAllForViews(state, [reconnected]);
  for (const target of [spectator, reconnected]) {
    expect(target.decoder.state.players[0]!.displayName).toBe("");
    expect(target.decoder.state.players[0]!.avatarId).toBe("");
    expect(target.decoder.state.players[0]!.sessionId).toBe("");
    expect(target.decoder.state.players[0]!.spectatorNamesJson).toBe("[]");
    expect(target.decoder.state.players[0]!.anonymousSpectatorCount).toBe(0);
    expect(target.decoder.state.players[1]!.displayName).toBe("Updated Public Tamer");
    expect(target.decoder.state.players[0]!.hand).toHaveLength(0);
  }
});

it("revokes an existing spectator identity tag after the player enables privacy", () => {
  const state = makeState();
  const owner = state.players[0]!;
  owner.displayName = "Visible Before";
  owner.avatarId = "before-avatar";
  const spectator = { view: buildStateView(state, undefined), decoder: new Decoder(new GameState()) };
  const participant = { view: buildStateView(state, 1), decoder: new Decoder(new GameState()) };
  encodeAllForViews(state, [spectator, participant]);
  expect(spectator.decoder.state.players[0]!.displayName).toBe("Visible Before");
  owner.hideIdentityFromSpectators = true;
  refreshStateView(spectator.view, state, undefined);
  refreshStateView(participant.view, state, 1);
  encodePatchForViews(state, [spectator, participant]);
  owner.displayName = "Secret After";
  owner.avatarId = "secret-avatar";
  refreshStateView(spectator.view, state, undefined);
  refreshStateView(participant.view, state, 1);
  encodePatchForViews(state, [spectator, participant]);
  expect(spectator.decoder.state.players[0]!.displayName).not.toBe("Secret After");
  expect(spectator.decoder.state.players[0]!.avatarId).not.toBe("secret-avatar");
  expect(participant.decoder.state.players[0]!.displayName).toBe("Secret After");
  expect(spectator.decoder.state.players).toHaveLength(2);
  expect(spectator.decoder.state.players[0]!.hand).toHaveLength(0);
});
