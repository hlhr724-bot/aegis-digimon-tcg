// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import {
  DECISION_CHANNEL,
  GameState,
  SERIES_CHANNEL,
  type DecisionRequest,
  type Seat,
  type SeriesSeatMessage,
} from "@aegis/shared";
import { RematchMode } from "@aegis/shared/protocol/RematchMode";
import { RematchStatus } from "@aegis/shared/protocol/RematchStatus";
import { USED_DECK_CHANNEL, type UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { startTestServer, type TestServer } from "./scenarioHarness/server";

let server: TestServer | undefined;
const rooms: Room<GameState>[] = [];
afterEach(async () => {
  await Promise.all(rooms.splice(0).map((room) => room.leave().catch(() => undefined)));
  await server?.close();
  server = undefined;
});

interface Player {
  name: string;
  room: Room<GameState>;
  seatToken?: string;
}

function keepEveryHand(room: Room<GameState>) {
  room.onMessage<DecisionRequest>(DECISION_CHANNEL, (request) => {
    if (request.kind === "mulligan") room.send("mulligan", { keep: true });
  });
}

function bind(player: Player, room: Room<GameState>) {
  player.room = room;
  rooms.push(room);
  keepEveryHand(room);
  room.onMessage<SeriesSeatMessage>(SERIES_CHANNEL, (message) => {
    player.seatToken = message.seatToken;
  });
  room.send("ready", {});
}

async function queue(endpoint: string, name: string, bestOf: 1 | 3, deck = RED_DECK): Promise<Player> {
  const room = await new Client(endpoint).joinOrCreate<GameState>(
    "aegis",
    { displayName: name, deck, matchTimer: false, bestOf },
    GameState,
  );
  const player: Player = { name, room };
  bind(player, room);
  return player;
}

function seatOf(player: Player): Seat {
  return player.room.state.players.findIndex((entry) => entry.displayName === player.name) as Seat;
}

async function startedGame(players: Player[]) {
  await vi.waitFor(() => expect(players[0]!.room.state.turnCount).toBeGreaterThan(0), { timeout: 10_000 });
}

/** Ends the running game with `loser` conceding through the real intent. */
async function concede(loser: Player, players: Player[]) {
  await startedGame(players);
  loser.room.send("surrender", {});
  await vi.waitFor(() => expect(loser.room.state.gameOver).toBe(true), { timeout: 5000 });
}

/** The loser picks; then both seats hop to the room the series opened, seat 1 first. */
async function nextGame(players: Player[], chooser: Player, goFirst: boolean) {
  await vi.waitFor(() => expect(chooser.room.state.series.phase).toBe("choosing"));
  expect(chooser.room.state.series.chooserSeat).toBe(seatOf(chooser));
  chooser.room.send(SERIES_CHANNEL, { action: "chooseTurnOrder", goFirst });
  await hopToNextGame(players);
}

async function hopToNextGame(players: Player[]) {
  await vi.waitFor(() => expect(players[0]!.room.state.series.nextRoomId).not.toBe(""), { timeout: 5000 });
  const nextRoomId = players[0]!.room.state.series.nextRoomId;
  // Seat 1 hops first: the room must hold it until seat 0 arrives, since seats fill in order.
  const bySeatDescending = [...players].sort((a, b) => seatOf(b) - seatOf(a));
  for (const player of bySeatDescending) {
    await vi.waitFor(() => expect(player.seatToken).toBeDefined());
    const previous = player.room;
    const next = await new Client(server!.endpoint).joinById<GameState>(
      nextRoomId,
      { displayName: "ignored", deck: BLUE_DECK, seriesToken: player.seatToken },
      GameState,
    );
    await previous.leave();
    rooms.splice(rooms.indexOf(previous), 1);
    bind(player, next);
  }
}

function chooseDeck(player: Player, deck?: typeof RED_DECK) {
  player.room.send(SERIES_CHANNEL, {
    action: "chooseSeriesDeck",
    ...(deck ? { deck: { deckName: "Swapped deck", ...deck } } : {}),
  });
}

async function usedDeckOf(player: Player): Promise<UsedDeck> {
  const used = new Promise<UsedDeck>((resolve) => player.room.onMessage<UsedDeck>(USED_DECK_CHANNEL, resolve));
  player.room.send(USED_DECK_CHANNEL, {});
  return used;
}

async function acceptNewSeries(offering: Player, answering: Player) {
  await vi.waitFor(() => expect(answering.room.state.series.rematchStatus).toBe(RematchStatus.OPEN.value));
  offering.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.NEW_SERIES.value });
  await vi.waitFor(() => expect(answering.room.state.series.rematchStatus).toBe(RematchStatus.OFFERED.value));
  answering.room.send(SERIES_CHANNEL, { action: "answerRematch", accept: true });
  await vi.waitFor(() => expect(answering.room.state.series.phase).toBe("deckSelection"));
}

describe("casual best-of-three websocket contract", () => {
  it("keeps Bo1 and Bo3 queues apart", async () => {
    server = await startTestServer();
    const single = await queue(server.endpoint, "Single", 1);
    const series = await queue(server.endpoint, "Series", 3);
    expect(series.room.roomId).not.toBe(single.room.roomId);
    const seriesOpponent = await queue(server.endpoint, "Series opponent", 3);
    expect(seriesOpponent.room.roomId).toBe(series.room.roomId);
    await vi.waitFor(() => expect(series.room.state.series.bestOf).toBe(3));
    expect(single.room.state.series.bestOf).toBe(1);
  }, 15_000);

  it("plays a series to 2-1 across two room hops with the loser choosing turn order", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 3);
    const bob = await queue(server.endpoint, "Bob", 3, BLUE_DECK);
    const players = [alice, bob];
    const aliceSeat = () => seatOf(alice);

    await concede(alice, players);
    await vi.waitFor(() => expect(bob.room.state.series.wins0 + bob.room.state.series.wins1).toBe(1));
    await nextGame(players, alice, false);

    await startedGame(players);
    const game2 = alice.room.state;
    expect(game2.series.gameNumber).toBe(2);
    expect(seatOf(alice)).toBe(aliceSeat());
    expect(game2.players[aliceSeat()]!.displayName).toBe("Alice");
    // Alice chose to go second, so Bob starts game 2.
    expect(game2.turnSeat).toBe(1 - aliceSeat());

    await concede(bob, players);
    await nextGame(players, bob, true);
    await startedGame(players);
    expect(bob.room.state.series.gameNumber).toBe(3);
    expect(bob.room.state.turnSeat).toBe(seatOf(bob));

    await concede(bob, players);
    await vi.waitFor(() => expect(alice.room.state.series.phase).toBe("over"));
    expect(alice.room.state.series.winnerSeat).toBe(aliceSeat());
    expect(alice.room.state.series.endReason).toBe("won");
    expect([...alice.room.state.series.results]).toEqual([1 - aliceSeat(), aliceSeat(), aliceSeat()]);
  }, 60_000);

  it("forfeits the series when a seat leaves between games", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 3);
    const bob = await queue(server.endpoint, "Bob", 3, BLUE_DECK);
    await concede(alice, [alice, bob]);
    await vi.waitFor(() => expect(bob.room.state.series.phase).toBe("choosing"));
    alice.room.send(SERIES_CHANNEL, { action: "leave" });
    await vi.waitFor(() => expect(bob.room.state.series.phase).toBe("over"));
    expect(bob.room.state.series.winnerSeat).toBe(seatOf(bob));
    expect(bob.room.state.series.endReason).toBe("forfeit");
  }, 20_000);

  it("refuses a forged continuation and a joiner without a seat token", async () => {
    server = await startTestServer();
    await expect(
      new Client(server.endpoint).create<GameState>(
        "aegis",
        { displayName: "Forger", deck: RED_DECK, seriesId: "made-up", seriesNonce: "made-up" },
        GameState,
      ),
    ).rejects.toThrow(/cannot continue/i);

    const alice = await queue(server.endpoint, "Alice", 3);
    const bob = await queue(server.endpoint, "Bob", 3, BLUE_DECK);
    await concede(alice, [alice, bob]);
    alice.room.send(SERIES_CHANNEL, { action: "chooseTurnOrder", goFirst: true });
    await vi.waitFor(() => expect(alice.room.state.series.nextRoomId).not.toBe(""), { timeout: 5000 });
    await expect(
      new Client(server.endpoint).joinById<GameState>(
        alice.room.state.series.nextRoomId,
        { displayName: "Intruder", deck: RED_DECK, seriesToken: "guess" },
        GameState,
      ),
    ).rejects.toThrow(/auth/i);
  }, 20_000);
});

describe("rematch after a best-of-one", () => {
  it("starts a fresh best-of-three when both players accept, with a deck choice and a drawn first player", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);
    const players = [alice, bob];
    const aliceSeat = seatOf(alice);

    await concede(alice, players);
    await acceptNewSeries(bob, alice);
    expect(alice.room.state.series.rematchStatus).toBe(RematchStatus.ACCEPTED.value);
    expect(alice.room.state.series.bestOf).toBe(3);
    expect(alice.room.state.series.chooserSeat).toBe(-1);
    chooseDeck(alice);
    chooseDeck(bob);
    await vi.waitFor(() => expect(alice.room.state.series.phase).toBe("starting"));
    expect(alice.room.state.series.nextFirstSeat).toBe(-1);
    await hopToNextGame(players);

    await startedGame(players);
    const game1 = alice.room.state;
    expect(game1.series.bestOf).toBe(3);
    expect(game1.series.gameNumber).toBe(1);
    expect([...game1.series.results]).toEqual([]);
    expect(seatOf(alice)).toBe(aliceSeat);
    expect(game1.players[aliceSeat]!.displayName).toBe("Alice");

    await concede(alice, players);
    await vi.waitFor(() => expect(alice.room.state.series.phase).toBe("choosing"));
    expect(alice.room.state.series.rematchStatus).toBe(RematchStatus.NONE.value);
    expect([...alice.room.state.series.results]).toEqual([1 - aliceSeat]);
  }, 60_000);

  it("counts the finished game as game 1 when both players agree to finish the best-of-three", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);
    const players = [alice, bob];
    const aliceSeat = seatOf(alice);
    const bobSeat = (1 - aliceSeat) as Seat;

    await concede(alice, players);
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OPEN.value));
    bob.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.FINISH_SERIES.value });
    await vi.waitFor(() => expect(alice.room.state.series.rematchMode).toBe(RematchMode.FINISH_SERIES.value));
    alice.room.send(SERIES_CHANNEL, { action: "answerRematch", accept: true });

    await vi.waitFor(() => expect(alice.room.state.series.phase).toBe("choosing"));
    expect(alice.room.state.series.gameNumber).toBe(1);
    expect([...alice.room.state.series.results]).toEqual([bobSeat]);
    expect(alice.room.state.series.chooserSeat).toBe(aliceSeat);
    await nextGame(players, alice, false);

    await startedGame(players);
    const game2 = alice.room.state.series;
    expect(game2.gameNumber).toBe(2);
    expect([...game2.results]).toEqual([bobSeat]);
    expect(bobSeat === 0 ? game2.wins0 : game2.wins1).toBe(1);

    await concede(alice, players);
    await vi.waitFor(() => expect(alice.room.state.series.phase).toBe("over"));
    expect(alice.room.state.series.winnerSeat).toBe(bobSeat);
  }, 60_000);

  it("replaces the offer when the other player asks for the other series", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);

    await concede(alice, [alice, bob]);
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OPEN.value));
    alice.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.NEW_SERIES.value });
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OFFERED.value));
    bob.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.FINISH_SERIES.value });

    await vi.waitFor(() => expect(alice.room.state.series.rematchOfferSeat).toBe(seatOf(bob)));
    expect(alice.room.state.series.rematchStatus).toBe(RematchStatus.OFFERED.value);
    expect(alice.room.state.series.rematchMode).toBe(RematchMode.FINISH_SERIES.value);
  }, 20_000);

  it("starts the series when both players offer", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);

    await concede(alice, [alice, bob]);
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OPEN.value));
    alice.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.NEW_SERIES.value });
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OFFERED.value));
    bob.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.NEW_SERIES.value });

    await vi.waitFor(() => expect(bob.room.state.series.phase).toBe("deckSelection"));
  }, 20_000);

  it("plays the new best-of-three with the deck each player switched to", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);
    const players = [alice, bob];

    await concede(alice, players);
    await acceptNewSeries(alice, bob);
    chooseDeck(alice, BLUE_DECK);
    await vi.waitFor(() =>
      expect(bob.room.state.series[seatOf(alice) === 0 ? "deckChanged0" : "deckChanged1"]).toBe(true),
    );
    expect(bob.room.state.series.phase).toBe("deckSelection");
    chooseDeck(bob, BLUE_DECK);
    await hopToNextGame(players);
    await startedGame(players);

    const aliceDeck = await usedDeckOf(alice);
    expect(aliceDeck.deckName).toBe("Swapped deck");
    expect(aliceDeck.mainDeck).toEqual(BLUE_DECK.mainDeck);
    expect(bob.room.state.series[seatOf(bob) === 0 ? "deckChanged0" : "deckChanged1"]).toBe(false);
  }, 60_000);

  it("ignores an illegal deck and keeps the seat choosing", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);

    await concede(alice, [alice, bob]);
    await acceptNewSeries(alice, bob);
    chooseDeck(alice, { mainDeck: RED_DECK.mainDeck.slice(0, 10), eggDeck: [] });
    chooseDeck(bob);
    await vi.waitFor(() => expect(alice.room.state.series[seatOf(bob) === 0 ? "deckReady0" : "deckReady1"]).toBe(true));
    expect(alice.room.state.series[seatOf(alice) === 0 ? "deckReady0" : "deckReady1"]).toBe(false);
    expect(alice.room.state.series.phase).toBe("deckSelection");
  }, 20_000);

  it("forfeits the new best-of-three when a player leaves while choosing decks", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);

    await concede(alice, [alice, bob]);
    await acceptNewSeries(alice, bob);
    alice.room.send(SERIES_CHANNEL, { action: "leave" });
    await vi.waitFor(() => expect(bob.room.state.series.phase).toBe("over"));
    expect(bob.room.state.series.endReason).toBe("forfeit");
  }, 20_000);

  it("keeps the match single when the opponent declines", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);

    await concede(alice, [alice, bob]);
    await vi.waitFor(() => expect(alice.room.state.series.rematchStatus).toBe(RematchStatus.OPEN.value));
    alice.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.NEW_SERIES.value });
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OFFERED.value));
    alice.room.send(SERIES_CHANNEL, { action: "answerRematch", accept: true });
    bob.room.send(SERIES_CHANNEL, { action: "answerRematch", accept: false });

    await vi.waitFor(() => expect(alice.room.state.series.rematchStatus).toBe(RematchStatus.DECLINED.value));
    alice.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.NEW_SERIES.value });
    await vi.waitFor(() => expect(alice.room.state.series.rematchStatus).toBe(RematchStatus.DECLINED.value));
    expect(alice.room.state.series.bestOf).toBe(1);
    expect(alice.room.state.series.phase).toBe("playing");
  }, 20_000);

  it("closes the offer when the opponent leaves the finished room", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 1);
    const bob = await queue(server.endpoint, "Bob", 1, BLUE_DECK);

    await concede(alice, [alice, bob]);
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OPEN.value));
    bob.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.NEW_SERIES.value });
    await vi.waitFor(() => expect(alice.room.state.series.rematchStatus).toBe(RematchStatus.OFFERED.value));
    await alice.room.leave();
    rooms.splice(rooms.indexOf(alice.room), 1);

    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.CLOSED.value));
  }, 20_000);

  it("offers a new best-of-three, and only a new one, once a best-of-three is won", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 3);
    const bob = await queue(server.endpoint, "Bob", 3, BLUE_DECK);
    const players = [alice, bob];

    await concede(alice, players);
    await nextGame(players, alice, true);
    await concede(alice, players);
    await vi.waitFor(() => expect(bob.room.state.series.phase).toBe("over"));
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OPEN.value));

    alice.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.FINISH_SERIES.value });
    alice.room.send(SERIES_CHANNEL, { action: "offerRematch", mode: RematchMode.NEW_SERIES.value });
    await vi.waitFor(() => expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.OFFERED.value));
    expect(bob.room.state.series.rematchMode).toBe(RematchMode.NEW_SERIES.value);
    bob.room.send(SERIES_CHANNEL, { action: "answerRematch", accept: true });

    await vi.waitFor(() => expect(alice.room.state.series.phase).toBe("deckSelection"));
    expect(alice.room.state.series.gameNumber).toBe(0);
    expect([...alice.room.state.series.results]).toEqual([]);
    expect(alice.room.state.series.winnerSeat).toBe(-1);
    chooseDeck(alice);
    chooseDeck(bob);
    await hopToNextGame(players);
    await startedGame(players);
    expect(alice.room.state.series.gameNumber).toBe(1);
    expect(alice.room.state.series.wins0 + alice.room.state.series.wins1).toBe(0);
  }, 60_000);

  it("never offers a rematch inside a best-of-three", async () => {
    server = await startTestServer();
    const alice = await queue(server.endpoint, "Alice", 3);
    const bob = await queue(server.endpoint, "Bob", 3, BLUE_DECK);

    await concede(alice, [alice, bob]);
    await vi.waitFor(() => expect(bob.room.state.series.phase).toBe("choosing"));
    expect(bob.room.state.series.rematchStatus).toBe(RematchStatus.NONE.value);
  }, 20_000);
});
