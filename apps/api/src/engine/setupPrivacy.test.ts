import { Decoder, Encoder } from "@colyseus/schema";
import { GameState } from "@aegis/shared/schema/GameState";
import { describe, expect, it } from "vitest";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";
import { finalizeSecurity, makeRng, mulliganRedraw, runSetup } from "#api/engine/setup";
import { buildStateView } from "#api/engine/state/visibility";

const RANDOM_KEY = "37".repeat(32);

function prepareMatch(randomKey = RANDOM_KEY) {
  const state = new GameState();
  const setup = runSetup(state, {
    seed: 123,
    randomKey,
    firstSeat: 0,
    seats: [RED_DECK, BLUE_DECK].map((deck, seat) => ({ sessionId: `p${seat}`, displayName: `P${seat}`, deck })),
  });
  return { state, setup };
}

function decodeOwnerState(state: GameState): GameState {
  const encoder = new Encoder(state);
  const decoder = new Decoder(new GameState());
  const view = buildStateView(state, 0);
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  decoder.decode(encoder.encodeAllView(view, iterator.offset, iterator));
  return decoder.state;
}

describe("hidden setup identities", () => {
  it.each([false, true])("hides security identities and submitted deck positions with mulligan=%s", (redraw) => {
    const { state, setup } = prepareMatch();
    const initialHandIds = state.players[0]!.hand.map((card) => card.instanceId);
    if (redraw) {
      mulliganRedraw(state.players[0]!, setup.rngForSeat(0));
    }
    finalizeSecurity(state);
    const decoded = decodeOwnerState(state);
    const owner = decoded.players[0]!;
    expect(owner.deck).toHaveLength(0);
    expect(owner.hand).toHaveLength(5);
    expect(owner.hand.every((card) => Boolean(card.cardId))).toBe(true);
    expect(owner.security).toHaveLength(5);
    for (const card of owner.security) {
      expect(card.cardId).toBeUndefined();
      expect(card.artId).toBe("");
      expect(card.instanceId).not.toMatch(/^s[01]-\d+$/);
      expect(initialHandIds).not.toContain(card.instanceId);
    }
    expect(decoded.players[1]!.security).toHaveLength(0);
    expect(JSON.stringify(decoded.toJSON())).not.toContain(RANDOM_KEY);
  });

  it("reconstructs keyed setup and mulligans with exactly the same identities", () => {
    const first = prepareMatch();
    const second = prepareMatch();
    for (const match of [first, second]) {
      mulliganRedraw(match.state.players[0]!, match.setup.rngForSeat(0));
      finalizeSecurity(match.state);
    }
    expect(first.state.toJSON()).toEqual(second.state.toJSON());
    const ids = Array.from(first.state.players).flatMap((player) =>
      [...player.deck, ...player.hand, ...player.security, ...player.eggDeck].map((card) => card.instanceId),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not reproduce a live shuffle or its identities from the numeric seed alone", () => {
    const first = prepareMatch();
    const second = prepareMatch("84".repeat(32));
    expect(first.state.players[0]!.deck.map((card) => card.cardId)).not.toEqual(
      second.state.players[0]!.deck.map((card) => card.cardId),
    );
    expect(first.state.players[0]!.hand.map((card) => card.instanceId)).not.toEqual(
      second.state.players[0]!.hand.map((card) => card.instanceId),
    );
    const keyed = makeRng(123, RANDOM_KEY);
    const legacy = makeRng(123);
    expect(Array.from({ length: 5 }, () => keyed())).not.toEqual(Array.from({ length: 5 }, () => legacy()));
  });
});
