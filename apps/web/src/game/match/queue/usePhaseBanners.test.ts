import { describe, expect, it } from "vitest";
import { ArraySchema } from "@colyseus/schema";
import { GameState, PlayerState, type Seat, type ServerEvent } from "@aegis/shared";
import { snapshotGameState } from "../../../net/presentedState";
import { releaseHandMoves } from "./usePhaseBanners";

function concealedState(seat: Seat): GameState {
  const state = new GameState();
  state.players = new ArraySchema(new PlayerState(), new PlayerState());
  state.players[seat]!.handCount = 5;
  state.players[seat]!.deckCount = 40;
  const snapshot = snapshotGameState(state);
  // StateView omits the opponent's private collection on the wire.
  Reflect.deleteProperty(snapshot.players[seat]!, "hand");
  return snapshot;
}

describe("releaseHandMoves with a concealed hand", () => {
  it.each([0, 1] as const)("updates public counts without reading seat %s's hidden cards", (seat) => {
    const held = concealedState(seat);
    const live = concealedState(seat);
    live.players[seat]!.handCount = 6;
    live.players[seat]!.deckCount = 39;
    const moves: ServerEvent[] = [{ kind: "cardsMoved", seat, from: "deck", to: "hand", instanceIds: ["hidden-draw"] }];

    const released = releaseHandMoves({ held, live, moves });

    expect(released.players[seat]!.handCount).toBe(6);
    expect(released.players[seat]!.deckCount).toBe(39);
    expect(released.players[seat]!.hand).toEqual([]);
    expect(held.players[seat]!.handCount).toBe(5);
    expect(held.players[seat]!.deckCount).toBe(40);
    expect(held.players[seat]!.hand).toBeUndefined();
    expect(live.players[seat]!.hand).toBeUndefined();
  });
});

function heldHand(instanceIds: readonly string[]): GameState {
  const state = new GameState();
  state.players = new ArraySchema(new PlayerState(), new PlayerState());
  const held = snapshotGameState(state);
  held.players[0]!.hand = instanceIds.map((instanceId) => ({ instanceId, cardId: "BT20-083" })) as never;
  held.players[0]!.handCount = instanceIds.length;
  return held;
}

describe("releaseHandMoves with an effect play from hand", () => {
  it.each(["various", "hand"])("drops a held hand card played from %s", (from) => {
    const moves: ServerEvent[] = ["first", "second"].map((instanceId) => ({
      kind: "cardsMoved",
      from,
      fromSeat: 0,
      to: "battleArea",
      instanceIds: [instanceId],
    }));

    const released = releaseHandMoves({ held: heldHand(["first", "second", "kept"]), live: undefined, moves });

    expect(released.players[0]!.hand.map((card) => card.instanceId)).toEqual(["kept"]);
    expect(released.players[0]!.handCount).toBe(1);
  });

  it("leaves the held hand alone for a move between two other zones", () => {
    const moves: ServerEvent[] = [{ kind: "cardsMoved", from: "various", to: "trash", instanceIds: ["elsewhere"] }];

    const released = releaseHandMoves({ held: heldHand(["kept"]), live: undefined, moves });

    expect(released.players[0]!.hand.map((card) => card.instanceId)).toEqual(["kept"]);
    expect(released.players[0]!.handCount).toBe(1);
  });
});

it("uses the origin owner when a hidden hand card moves to another player's zone", () => {
  const held = concealedState(0);
  const released = releaseHandMoves({
    held,
    live: undefined,
    moves: [{ kind: "cardsMoved", instanceIds: ["hidden"], from: "hand", fromSeat: 0, to: "security", seat: 1 }],
  });
  expect(released.players[0]!.handCount).toBe(4);
  expect(released.players[1]!.handCount).toBe(held.players[1]!.handCount);
});
