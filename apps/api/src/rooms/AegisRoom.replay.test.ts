import { SPECTATOR_REPLAY_SEAT } from "@aegis/shared/replays/spectatorReplaySeat";
import { SpectatorAccess } from "@aegis/shared/account/SpectatorAccess";
import { buildDeckCompositionKey } from "#api/accounts/buildDeckCompositionKey";
import { gunzipSync } from "node:zlib";
import { CloseCode, type Client } from "colyseus";
import { REPLAY_CHANNEL, type MatchReplay, type ReplayDownloadMessage } from "@aegis/shared";
import type { AccountStore } from "../accounts/AccountStore.js";
import type { ReplayLibrary } from "../replays/ReplayLibrary.js";
import type { SeriesRecord } from "./series/SeriesDirectory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AegisRoom } from "./AegisRoom.js";
import { RED_DECK, BLUE_DECK } from "../engine/testDecks.js";

const rooms: AegisRoom[] = [];
afterEach(() => {
  for (const room of rooms.splice(0)) room.onDispose();
});
async function start(bestOf = 1) {
  const room = new AegisRoom();
  rooms.push(room);
  room.lock = vi.fn<typeof room.lock>(async () => {});
  room.unlock = vi.fn<typeof room.unlock>(async () => {});
  room.setMatchmaking = vi.fn<typeof room.setMatchmaking>(async () => {});
  room.broadcast = vi.fn<typeof room.broadcast>(() => true);
  Reflect.set(room, "accounts", () => ({
    recordRecentMatch: vi.fn<AccountStore["recordRecentMatch"]>(async () => {}),
    ensureReady: vi.fn<AccountStore["ensureReady"]>(async () => {}),
    pool: { query: async () => ({ rows: [] }) },
  }));
  Reflect.set(room, "replays", () => ({ record: vi.fn<ReplayLibrary["record"]>(async () => "index-id") }));
  await room.onCreate({ seed: 1, bestOf });
  const players = ["a", "b"].map((sessionId) => ({ sessionId, send: vi.fn<Client["send"]>() }) as unknown as Client);
  for (const [seat, client] of players.entries()) {
    room.clients.push(client);
    room.onJoin(client, { displayName: `Player ${seat}`, deck: seat === 0 ? RED_DECK : BLUE_DECK });
  }
  const send = (client: Client, type: string) => Reflect.get(room, "handleIntent").call(room, client, { type });
  send(players[0]!, "ready");
  send(players[1]!, "ready");
  return { room, players, send };
}
function readyMessage(client: Client): Extract<ReplayDownloadMessage, { kind: "ready" }> | undefined {
  const message = vi.mocked(client.send).mock.calls.find(([channel]) => channel === REPLAY_CHANNEL)?.[1] as
    | ReplayDownloadMessage
    | undefined;
  return message?.kind === "ready" ? message : undefined;
}
function signIn(room: AegisRoom, client: Client, accountId: string) {
  (Reflect.get(room, "accountByClient") as Map<string, string>).set(client.sessionId, accountId);
}
function indexWith(room: AegisRoom, record: ReplayLibrary["record"]) {
  const spy = vi.fn<ReplayLibrary["record"]>(record);
  Reflect.set(room, "replays", () => ({ record: spy }));
  return spy;
}
function replayOf(client: Client): MatchReplay | undefined {
  const message = vi.mocked(client.send).mock.calls.find(([channel]) => channel === REPLAY_CHANNEL)?.[1] as
    | ReplayDownloadMessage
    | undefined;
  if (message?.kind !== "ready") return undefined;
  return JSON.parse(gunzipSync(Buffer.from(message.data, "base64")).toString());
}

describe("room replay delivery", () => {
  it("records both participants before a quitter's identity is removed during database I/O", async () => {
    const { room, players } = await start();
    const identities = Reflect.get(room, "accountByClient") as Map<string, string>;
    identities.set(players[0]!.sessionId, "owner-zero");
    identities.set(players[1]!.sessionId, "owner-one");
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const record = vi.fn<AccountStore["recordRecentMatch"]>(async () => waiting);
    Reflect.set(room, "accounts", () => ({ recordRecentMatch: record }));
    await room.onLeave(players[1]!, CloseCode.CONSENTED);
    expect(identities.has(players[1]!.sessionId)).toBe(false);
    expect(record.mock.calls.map(([owner]) => owner)).toEqual(["owner-zero", "owner-one"]);
    expect(record.mock.calls[1]?.[2]).toMatchObject({ mode: "casual", result: "loss" });
    expect(record.mock.calls[0]?.[2]).toMatchObject({
      ownDeckKey: buildDeckCompositionKey(RED_DECK),
      ownDeckStartedAt: expect.any(Number),
    });
    expect(record.mock.calls[1]?.[2]).toMatchObject({
      ownDeckKey: buildDeckCompositionKey(BLUE_DECK),
      ownDeckStartedAt: expect.any(Number),
    });
    expect(record.mock.calls[0]?.[2].opponentDeck).toMatchObject({ deckId: null, mainDeck: BLUE_DECK.mainDeck });
    expect(record.mock.calls[0]?.[2].ownDeck).toMatchObject({ mainDeck: RED_DECK.mainDeck });
    expect(record.mock.calls[1]?.[2].ownDeck).toMatchObject({ mainDeck: BLUE_DECK.mainDeck });
    expect(record.mock.calls[1]?.[2].opponentDeck).toMatchObject({ deckId: null, mainDeck: RED_DECK.mainDeck });
    const startingDeck = (Reflect.get(room, "initialDeckBySeat") as Map<number, { mainDeck: string[] }>).get(1)!;
    startingDeck.mainDeck[0] = "BT1-010";
    expect(record.mock.calls[0]?.[2].opponentDeck?.mainDeck).toEqual(BLUE_DECK.mainDeck);
    expect(record.mock.calls[1]?.[2].ownDeck?.mainDeck).toEqual(BLUE_DECK.mainDeck);
    release();
  });

  it("indexes participant exports using their authenticated identity and leaves anonymous spectator exports unindexed", async () => {
    const { room, players, send } = await start();
    const [signedIn, guest] = players as [Client, Client];
    signIn(room, signedIn, "trusted-owner");
    const spectator = { sessionId: "observer", send: vi.fn<Client["send"]>() } as unknown as Client;
    room.clients.push(spectator);
    (Reflect.get(room, "spectatorClients") as Set<string>).add(spectator.sessionId);
    signIn(room, spectator, "observer-owner");
    const record = indexWith(room, async () => "index-id");
    Reflect.get(room, "sendReplayDownload").call(room, signedIn);
    expect(record).not.toHaveBeenCalled();
    send(guest, "surrender");
    await vi.waitFor(() => expect(readyMessage(signedIn)).toBeDefined());
    await vi.waitFor(() => expect(readyMessage(guest)).toBeDefined());
    expect(readyMessage(signedIn)!.indexId).toBe("index-id");
    expect(readyMessage(guest)!.indexId).toBeUndefined();
    await vi.waitFor(() => expect(readyMessage(spectator)).toBeDefined());
    expect(readyMessage(spectator)!.indexId).toBeUndefined();
    expect(readyMessage(spectator)!.viewerSeat).toBe(SPECTATOR_REPLAY_SEAT);
    expect(record).toHaveBeenCalledOnce();
    const [owner, exported, context] = record.mock.calls[0]!;
    expect(owner).toBe("trusted-owner");
    expect(exported).toMatchObject({ kind: "ready", viewerSeat: 0 });
    expect(context).toEqual({ format: room.state.format, playerAccountIds: [null, null] });
    expect(JSON.parse(gunzipSync(Buffer.from(exported.data, "base64")).toString())).toEqual(replayOf(signedIn));
    Reflect.get(room, "sendReplayDownload").call(room, signedIn);
    await vi.waitFor(() =>
      expect(vi.mocked(signedIn.send).mock.calls.filter(([channel]) => channel === REPLAY_CHANNEL)).toHaveLength(2),
    );
    expect(record).toHaveBeenCalledOnce();
  });
  it("indexes the room format and both seated accounts so public listings can recheck identity privacy", async () => {
    const { room, players, send } = await start();
    const [signedIn, opponent] = players as [Client, Client];
    signIn(room, signedIn, "trusted-owner");
    const owners = Reflect.get(room, "deckOwnerBySeat") as Map<number, string>;
    owners.set(0, "trusted-owner");
    owners.set(1, "opponent-account");
    Reflect.set(room, "accounts", () => ({
      preferences: vi.fn<AccountStore["preferences"]>(async () => ({})),
      recordRecentMatch: vi.fn<AccountStore["recordRecentMatch"]>(async () => {}),
    }));
    const record = indexWith(room, async () => "index-id");
    send(opponent, "surrender");
    await vi.waitFor(() => expect(readyMessage(signedIn)?.indexId).toBe("index-id"));
    expect(record).toHaveBeenCalledExactlyOnceWith("trusted-owner", expect.objectContaining({ viewerSeat: 0 }), {
      format: room.state.format,
      playerAccountIds: ["trusted-owner", "opponent-account"],
    });
  });
  it("still delivers the file without an index id when the index write fails, and retries later", async () => {
    const { room, players, send } = await start();
    const client = players[0]!;
    signIn(room, client, "trusted-owner");
    let fail = true;
    const record = indexWith(room, async () => {
      if (fail) throw new Error("database offline");
      return "index-id";
    });
    send(players[1]!, "surrender");
    await vi.waitFor(() => expect(readyMessage(client)).toBeDefined());
    expect(readyMessage(client)!.indexId).toBeUndefined();
    fail = false;
    Reflect.get(room, "sendReplayDownload").call(room, client);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(client.send)
          .mock.calls.filter(([channel]) => channel === REPLAY_CHANNEL)
          .at(-1)?.[1],
      ).toMatchObject({ indexId: "index-id" }),
    );
  });
  it("restores the server-owned account identity for continuation games before indexing", async () => {
    const { room, players, send } = await start(3);
    const client = players[0]!;
    const series = Reflect.get(room, "casualSeries");
    const original = series.seatForToken.bind(series);
    series.seatForToken = (token: unknown) => (token === "trusted-series-token" ? 0 : undefined);
    const record = {
      seats: [
        { token: "trusted-series-token", accountId: "original-account", displayName: "Original", deck: RED_DECK },
        { token: "other", displayName: "Other", deck: BLUE_DECK },
      ],
    } as SeriesRecord;
    const options = { seriesToken: "trusted-series-token", accountId: "forged-client-account" };
    expect(await Reflect.get(room, "authorizeSeriesSeat").call(room, client, options, record)).toBe(true);
    series.seatForToken = original;
    const index = indexWith(room, async () => "index-id");
    send(players[1]!, "surrender");
    await vi.waitFor(() => expect(readyMessage(client)?.indexId).toBe("index-id"));
    expect(index).toHaveBeenCalledWith(
      "original-account",
      expect.objectContaining({ kind: "ready" }),
      expect.objectContaining({ format: room.state.format }),
    );
  });
  it("starts at the ready-gated match and sends participant hands only to participants", async () => {
    const { room, players, send } = await start();
    expect(replayOf(players[0]!)).toBeUndefined();
    const spectator = { sessionId: "observer", send: vi.fn<Client["send"]>() } as unknown as Client;
    room.clients.push(spectator);
    (Reflect.get(room, "spectatorClients") as Set<string>).add(spectator.sessionId);
    const hands = room.state.players.map((player) => player.hand.map((card) => card.cardId));
    send(players[0]!, "surrender");
    await vi.waitFor(() => expect(replayOf(players[0]!)).toBeDefined());
    for (const [seat, client] of players.entries()) {
      const replay = replayOf(client)!;
      expect(replay.viewerSeat).toBe(seat);
      expect(replay.frames[0]!.events.some((entry) => entry.kind === "matchStarted")).toBe(true);
      expect(replay.frames[0]!.state.players[seat]!.hand.map((card) => card.cardId)).toEqual(hands[seat]);
      expect(replay.frames[0]!.state.players[1 - seat]!.hand.map((card) => card.cardId)).toEqual(hands[1 - seat]);
      expect(replay.frames.at(-1)!.state.gameOver).toBe(true);
      expect(replay.frames.at(-1)!.events.some((entry) => entry.kind === "gameOver")).toBe(true);
      expect(
        replay.frames.every(
          (frame, index) => index === 0 || frame.state.stateVersion > replay.frames[index - 1]!.state.stateVersion,
        ),
      ).toBe(true);
    }
    await vi.waitFor(() => expect(replayOf(spectator)).toBeDefined());
    const spectatorReplay = replayOf(spectator)!;
    expect(spectatorReplay.viewerSeat).toBe(SPECTATOR_REPLAY_SEAT);
    expect(spectatorReplay.visibleHandSeats).toEqual([]);
    expect(spectatorReplay.frames).toHaveLength(replayOf(players[0]!)!.frames.length);
    for (const frame of spectatorReplay.frames) {
      expect(frame.state.players.map((player) => player.hand)).toEqual([[], []]);
      expect(frame.events.some((event) => event.kind === "finalReveal")).toBe(false);
    }
  });
  it("captures a consenting departure without requiring account persistence", async () => {
    const { room, players } = await start();
    await room.onLeave(players[0]!, CloseCode.CONSENTED);
    await vi.waitFor(() => expect(replayOf(players[1]!)).toBeDefined());
    expect(replayOf(players[1]!)!.winnerSeat).toBe(1);
  });
  it("re-delivers the completed file to a new socket carrying the returning player's session", async () => {
    const { room, players, send } = await start();
    send(players[1]!, "surrender");
    await vi.waitFor(() => expect(replayOf(players[0]!)).toBeDefined());
    const original = replayOf(players[0]!)!;
    const returning = { sessionId: players[0]!.sessionId, send: vi.fn<Client["send"]>() } as unknown as Client;
    room.clients.splice(room.clients.indexOf(players[0]!), 1, returning);
    room.allowReconnection = vi.fn<() => Promise<Client>>(
      async () => returning,
    ) as unknown as AegisRoom["allowReconnection"];
    await room.onLeave(players[0]!, CloseCode.WITH_ERROR);
    await vi.waitFor(() => expect(replayOf(returning)).toBeDefined());
    expect(replayOf(returning)).toEqual(original);
    expect(replayOf(returning)!.frames.at(-1)!.state.gameOver).toBe(true);
  });
});

it("exports the own deck but omits an opponent that disabled post-match sharing", async () => {
  const { room, players, send } = await start();
  (Reflect.get(room, "deckOwnerBySeat") as Map<number, string>).set(1, "private-opponent");
  Reflect.set(room, "accounts", () => ({
    preferences: vi.fn<AccountStore["preferences"]>(async () => ({ shareDeckAfterMatch: false })),
  }));
  send(players[1]!, "surrender");
  await vi.waitFor(() => expect(replayOf(players[0]!)?.decks).toBeDefined());
  const replay = replayOf(players[0]!)!;
  expect(replay.decks?.[0]?.mainDeck).toEqual(RED_DECK.mainDeck);
  expect(replay.decks?.[1]).toBeNull();
  expect(replay.deckIcons?.[1]).toBeNull();
  expect(readyMessage(players[0]!)?.summary).not.toHaveProperty("decks");
  expect(replayOf(players[1]!)?.decks?.[1]?.mainDeck).toEqual(BLUE_DECK.mainDeck);
});

type AddSpectatorParams = { room: AegisRoom; accountId?: string };

function addSpectator({ room, accountId }: AddSpectatorParams): Client {
  const client = { sessionId: "spectator", send: vi.fn<Client["send"]>() } as unknown as Client;
  room.clients.push(client);
  (Reflect.get(room, "spectatorClients") as Set<string>).add(client.sessionId);
  if (accountId) {
    (Reflect.get(room, "spectatorIdentities") as Map<string, { id: string; displayName: string }>).set(
      client.sessionId,
      {
        id: accountId,
        displayName: "Spectator",
      },
    );
  }
  return client;
}

describe("spectator replay saving", () => {
  it("indexes a signed-in spectator's public recording and reuses the export on retry", async () => {
    const { room, players, send } = await start();
    const spectator = addSpectator({ room, accountId: "spectator-owner" });
    const record = indexWith(room, async () => "spectator-index");
    Reflect.get(room, "sendReplayDownload").call(room, spectator);
    expect(spectator.send).not.toHaveBeenCalled();
    send(players[0]!, "surrender");
    await vi.waitFor(() => expect(readyMessage(spectator)?.indexId).toBe("spectator-index"));
    expect(record).toHaveBeenCalledExactlyOnceWith(
      "spectator-owner",
      expect.objectContaining({ viewerSeat: SPECTATOR_REPLAY_SEAT }),
      { format: room.state.format, playerAccountIds: [null, null] },
    );
    const original = readyMessage(spectator)!;
    vi.mocked(spectator.send).mockClear();
    Reflect.get(room, "sendReplayDownload").call(room, spectator);
    await vi.waitFor(() => expect(readyMessage(spectator)).toEqual(original));
    expect(record).toHaveBeenCalledOnce();
  });

  it("lets an anonymous spectator save the full match while preserving identity and deck privacy", async () => {
    const { room, players, send } = await start();
    const spectator = addSpectator({ room });
    const record = indexWith(room, async () => "unused-index");
    (Reflect.get(room, "deckOwnerBySeat") as Map<number, string>).set(0, "hidden-player");
    (Reflect.get(room, "deckOwnerBySeat") as Map<number, string>).set(1, "private-deck");
    Reflect.set(room, "accounts", () => ({
      preferences: vi.fn<AccountStore["preferences"]>(async (owner) => ({
        hideIdentityFromSpectators: owner === "hidden-player",
        shareDeckAfterMatch: owner !== "private-deck",
      })),
      recordRecentMatch: vi.fn<AccountStore["recordRecentMatch"]>(async () => {}),
    }));
    room.state.players[0]!.avatarId = "private-avatar";
    send(players[0]!, "surrender");
    await vi.waitFor(() => expect(readyMessage(spectator)).toBeDefined());
    const replay = replayOf(spectator)!;
    expect(readyMessage(spectator)!.indexId).toBeUndefined();
    expect(record).not.toHaveBeenCalled();
    expect(replay.viewerSeat).toBe(SPECTATOR_REPLAY_SEAT);
    expect(replay.visibleHandSeats).toEqual([]);
    expect(replay.players).toEqual(["Player 1", "Player 1"]);
    expect(replay.decks).toEqual([null, null]);
    expect(replay.deckIcons).toEqual([null, null]);
    expect(replay.frames[0]!.events.some((event) => event.kind === "matchStarted")).toBe(true);
    expect(replay.frames.at(-1)!.state.gameOver).toBe(true);
    for (const frame of replay.frames) {
      expect(frame.state.players[0]!.displayName).toBe("Player 1");
      expect(frame.state.players[0]!.avatarId).toBe("");
      for (const player of frame.state.players) {
        expect(player.hand).toEqual([]);
        expect(player.deck).toEqual([]);
        expect(player.eggDeck).toEqual([]);
        expect(player.security).toEqual([]);
        expect(player.spectatorNamesJson).toBe("[]");
        expect(player.manualInspectionJson).toBe("[]");
      }
    }
  });

  it.each([SpectatorAccess.FRIENDS.value, SpectatorAccess.NOBODY.value])(
    "does not export an anonymous spectator replay after access changes to %s",
    async (spectatorAccess) => {
      const { room, players, send } = await start();
      const spectator = addSpectator({ room });
      (Reflect.get(room, "deckOwnerBySeat") as Map<number, string>).set(0, "restricted-player");
      Reflect.set(room, "accounts", () => ({
        preferences: vi.fn<AccountStore["preferences"]>(async () => ({ spectatorAccess })),
        recordRecentMatch: vi.fn<AccountStore["recordRecentMatch"]>(async () => {}),
      }));
      send(players[0]!, "surrender");
      await vi.waitFor(() => expect(readyMessage(players[0]!)).toBeDefined());
      await Reflect.get(room, "sendSpectatorReplay").call(room, spectator);
      expect(spectator.send).not.toHaveBeenCalled();
    },
  );

  it("tells anonymous spectators when the recording exceeded its limit", async () => {
    const { room, players, send } = await start();
    const spectator = addSpectator({ room });
    Reflect.set(Reflect.get(room, "replayRecording"), "overflow", true);
    send(players[0]!, "surrender");
    await vi.waitFor(() =>
      expect(spectator.send).toHaveBeenCalledWith(REPLAY_CHANNEL, { kind: "unavailable", reason: "recording_limit" }),
    );
  });
});
