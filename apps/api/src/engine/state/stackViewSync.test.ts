import { Decoder, Encoder } from "@colyseus/schema";
import { CardInstance, GameState, Permanent, PlayerState, Zone, type Seat } from "@aegis/shared";
import { describe, expect, it, vi } from "vitest";
import {
  extractCardById,
  extractPermanentAt,
  insertCard,
  installVisibilityPort,
  placePermanent,
  pushOnStack,
  unshiftOnStack,
  type VisibilityPort,
} from "./access.js";
import { buildStateView, exposeCardInZone, refreshStateView } from "./visibility.js";

let sequence = 0;
function card(cardId: string): CardInstance {
  const value = new CardInstance();
  value.instanceId = `instance-${++sequence}`;
  value.cardId = cardId;
  value.ownerSeat = 0;
  value.faceUp = true;
  return value;
}

function mirroredState() {
  const state = new GameState();
  for (const seat of [0, 1] as Seat[]) {
    const player = new PlayerState();
    player.seat = seat;
    state.players[seat] = player;
  }
  const encoder = new Encoder(state);
  const seats = ([0, 1] as Seat[]).map((seat) => ({
    seat,
    view: buildStateView(state, seat),
    decoder: new Decoder(new GameState()),
  }));
  for (const player of state.players) {
    installVisibilityPort(player, (ownerSeat, zone, value) => {
      for (const target of seats) exposeCardInZone(target.view, target.seat, ownerSeat, zone, value);
    });
  }
  const encodeInto = (full: boolean) => {
    for (const target of seats) refreshStateView(target.view, state, target.seat);
    const iterator = { offset: 0 };
    if (full) encoder.encodeAll(iterator);
    else encoder.encode(iterator);
    const shared = iterator.offset;
    for (const target of seats) {
      iterator.offset = shared;
      target.decoder.decode(
        full ? encoder.encodeAllView(target.view, shared, iterator) : encoder.encodeView(target.view, shared, iterator),
      );
    }
    encoder.discardChanges();
  };
  return {
    state,
    snapshot: () => encodeInto(true),
    patch: () => encodeInto(false),
    seat: (seat: Seat) => seats[seat]!.decoder.state as GameState,
  };
}

describe("synchronized array StateView sync", () => {
  it.each(["hand", "battle area"] as const)(
    "keeps both distinct material identities when a hand card is prepended after a %s material enters a stack in the same patch",
    (firstZone) => {
      const mirror = mirroredState();
      const player = mirror.state.players[0]!;
      const top = card("BT10-009");
      const first = card("BT10-049");
      const second = card("BT10-008");
      player.hand.push(second);
      if (firstZone === "hand") player.hand.push(first);
      else {
        const fieldSource = new Permanent();
        fieldSource.permanentId = "field-material";
        fieldSource.controllerSeat = 0;
        fieldSource.topCard = first;
        placePermanent(player, fieldSource);
      }
      const permanent = new Permanent();
      permanent.permanentId = "xros";
      permanent.controllerSeat = 0;
      permanent.topCard = top;
      placePermanent(player, permanent);
      mirror.snapshot();

      const firstMaterial =
        firstZone === "hand"
          ? extractCardById(player, Zone.Hand, first.instanceId)!
          : extractPermanentAt(player, 0)!.topCard;
      pushOnStack(permanent, firstMaterial);
      unshiftOnStack(permanent, extractCardById(player, Zone.Hand, second.instanceId)!);
      mirror.patch();

      const expected = [second.instanceId, first.instanceId];
      expect([...permanent.stack].map((value) => value.instanceId)).toEqual(expected);
      for (const seat of [0, 1] as Seat[]) {
        const decodedPermanent = mirror
          .seat(seat)
          .players[0]!.battleArea.find((value) => value.permanentId === "xros")!;
        expect([...decodedPermanent.stack].map((value) => value.instanceId)).toEqual(expected);
      }
    },
  );

  it("preserves the owner's private hand order when a card is inserted at the front", () => {
    const mirror = mirroredState();
    const player = mirror.state.players[0]!;
    const older = card("BT10-049");
    const newer = card("BT10-008");
    const returned = card("BT10-009");
    player.hand.push(older, newer);
    player.trash.push(returned);
    mirror.snapshot();

    insertCard(player, Zone.Hand, extractCardById(player, Zone.Trash, returned.instanceId)!, "top");
    mirror.patch();

    expect([...mirror.seat(0).players[0]!.hand].map((value) => value.instanceId)).toEqual([
      returned.instanceId,
      older.instanceId,
      newer.instanceId,
    ]);
    expect(mirror.seat(1).players[0]!.hand).toHaveLength(0);
  });
  it("announces cards added to permanents that were on the field before the port was installed", () => {
    const player = new PlayerState();
    player.seat = 0;
    const fielded = new Permanent();
    fielded.permanentId = "fielded";
    fielded.controllerSeat = 0;
    fielded.topCard = card("BT10-009");
    placePermanent(player, fielded);
    const hatched = new Permanent();
    hatched.permanentId = "hatched";
    hatched.controllerSeat = 0;
    hatched.inBreeding = true;
    hatched.topCard = card("BT10-001");
    player.breeding = hatched;
    const port = vi.fn<VisibilityPort>();
    installVisibilityPort(player, port);
    const material = card("BT10-049");
    const evolved = card("BT10-008");
    pushOnStack(fielded, material);
    pushOnStack(hatched, evolved);
    expect(port).toHaveBeenCalledWith(0, Zone.BattleArea, material);
    expect(port).toHaveBeenCalledWith(0, Zone.Breeding, evolved);
  });
});
