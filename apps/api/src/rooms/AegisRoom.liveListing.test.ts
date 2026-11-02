import { getDeckFeaturedCardId } from "#api/accounts/getDeckFeaturedCardId";
import { Decoder, Encoder } from "@colyseus/schema";
import { GameState } from "@aegis/shared/schema/GameState";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { RED_DECK } from "#api/engine/testDecks";
import type { AccountPreferences } from "#api/accounts/AccountStore";

function client(sessionId: string): Client {
  return { sessionId, send: vi.fn<Client["send"]>(), view: undefined } as unknown as Client;
}

function startedRoom(options: {
  preferences: Record<string, AccountPreferences>;
  accounts: Record<string, string>;
  private?: boolean;
  coverCardId?: string;
}) {
  const room = new AegisRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => undefined);
  room.unlock = vi.fn<() => Promise<void>>(async () => undefined);
  room.broadcast = vi.fn<AegisRoom["broadcast"]>() as never;
  const setMatchmaking = vi.fn<(updates: { metadata?: Record<string, unknown> }) => Promise<void>>(
    async () => undefined,
  );
  room.setMatchmaking = setMatchmaking as never;
  Reflect.set(room, "_listing", {});
  room.onCreate({ seed: 1, ...(options.private ? { private: true } : {}) });
  const encoder = new Encoder(room.state);
  Object.assign(room, {
    accounts: () => ({
      preferences: async (accountId: string) => options.preferences[accountId] ?? {},
      decks: async () => [{ id: "preview-deck", coverCardId: options.coverCardId }],
    }),
    accountByClient: new Map(Object.entries(options.accounts)),
  });
  for (const [sessionId, displayName] of [
    ["first", "Taichi"],
    ["second", "Sora"],
  ] as const) {
    const player = client(sessionId);
    room.clients.push(player);
    room.onJoin(player, {
      displayName,
      deck: structuredClone(RED_DECK),
      ...(options.coverCardId ? { deckId: "preview-deck" } : {}),
    });
  }
  (Reflect.get(room, "startMatchNow") as () => void).call(room);
  const latestLive = () =>
    setMatchmaking.mock.calls
      .map(([updates]) => updates.metadata)
      .filter(Boolean)
      .at(-1)?.live as Record<string, unknown> | undefined;
  return { room, setMatchmaking, latestLive, encoder };
}

const bothAccounts = { first: "first-account", second: "second-account" };

describe("live match listing", () => {
  it.each<Record<string, AccountPreferences>>([
    {},
    { "first-account": { listLiveMatches: true } },
    { "first-account": { listLiveMatches: true }, "second-account": { listLiveMatches: true } },
  ])("lists casual matches unless an account opts out: %j", async (preferences) => {
    const { room, latestLive } = startedRoom({
      accounts: bothAccounts,
      preferences,
    });
    try {
      await vi.waitFor(() => expect(latestLive()).toBeDefined());
      expect(latestLive()).toMatchObject({
        spectatorCode: room.state.spectatorCode,
        players: ["Taichi", "Sora"],
        format: "standard",
        spectators: 0,
      });
    } finally {
      room.onDispose();
    }
  });

  it.each([
    ["one player opted out", { "first-account": { listLiveMatches: false } }, bothAccounts],
    [
      "both players opted out",
      { "first-account": { listLiveMatches: false }, "second-account": { listLiveMatches: false } },
      bothAccounts,
    ],
    ["a guest is seated", { "first-account": { listLiveMatches: true } }, { first: "first-account" }],
  ])("keeps the match unlisted when %s", async (_case, preferences, accounts) => {
    const { room, setMatchmaking, latestLive } = startedRoom({ accounts, preferences });
    try {
      await vi.waitFor(() => expect(setMatchmaking).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(latestLive()).toBeUndefined();
    } finally {
      room.onDispose();
    }
  });

  it("publishes the player's saved deck cover before that card enters the field", async () => {
    const { room, latestLive } = startedRoom({ accounts: bothAccounts, preferences: {}, coverCardId: "BT1-010" });
    try {
      await vi.waitFor(() => expect(latestLive()).toBeDefined());
      expect(latestLive()?.playerPreviews).toEqual([{ cardId: "BT1-010" }, { cardId: "BT1-010" }]);
    } finally {
      room.onDispose();
    }
  });

  it("never lists a private room", async () => {
    const { room, latestLive } = startedRoom({
      private: true,
      accounts: bothAccounts,
      preferences: { "first-account": { listLiveMatches: true }, "second-account": { listLiveMatches: true } },
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(latestLive()).toBeUndefined();
    } finally {
      room.onDispose();
    }
  });

  it("tracks spectators and drops the listing when the game ends", async () => {
    const { room, latestLive } = startedRoom({
      accounts: bothAccounts,
      preferences: { "first-account": { listLiveMatches: true }, "second-account": { listLiveMatches: true } },
    });
    try {
      await vi.waitFor(() => expect(latestLive()).toBeDefined());
      const player = room.state.players[0]!;
      player.avatarId = "greymon";
      const revealedCard = player.hand.shift()!;
      revealedCard.faceUp = true;
      player.trash.push(revealedCard);
      const watcher = client("watcher");
      room.clients.push(watcher);
      room.onJoin(watcher, {
        spectator: true,
        roomCode: room.state.spectatorCode,
        displayName: "Watcher",
        deck: { mainDeck: [], eggDeck: [] },
      });
      await vi.waitFor(() => expect(latestLive()?.spectators).toBe(1));
      expect(latestLive()?.playerPreviews).toEqual([
        expect.objectContaining({ avatarId: "greymon", cardId: getDeckFeaturedCardId(RED_DECK) }),
        expect.objectContaining({ cardId: getDeckFeaturedCardId(RED_DECK) }),
      ]);
      room.state.gameOver = true;
      await room.onLeave(watcher);
      await vi.waitFor(() => expect(latestLive()).toBeUndefined());
    } finally {
      room.onDispose();
    }
  });
});

it("withholds opted-out identity in listings and encoded spectator state while retaining participant identities", async () => {
  const { room, latestLive, encoder } = startedRoom({
    accounts: bothAccounts,
    preferences: {
      "first-account": { listLiveMatches: true, hideIdentityFromSpectators: true },
      "second-account": { listLiveMatches: true },
    },
  });
  try {
    await vi.waitFor(() => expect(latestLive()).toBeDefined());
    expect(latestLive()?.players).toEqual(["", "Sora"]);
    expect(room.spectatorInfo(room.state.spectatorCode)?.players).toEqual(["", "Sora"]);
    room.state.players[0]!.avatarId = "secret-avatar";
    expect(latestLive()?.playerPreviews).toEqual([{}, { cardId: getDeckFeaturedCardId(RED_DECK) }]);
    const watcher = client("watcher");
    room.clients.push(watcher);
    room.onJoin(watcher, {
      spectator: true,
      roomCode: room.state.spectatorCode,
      displayName: "Watcher",
      deck: { mainDeck: [], eggDeck: [] },
    });

    const spectator = new Decoder(new GameState());
    decodeClient({ encoder, target: watcher, decoder: spectator });
    expect(spectator.state.players[0]!.displayName).toBe("");
    expect(spectator.state.players[0]!.avatarId).toBe("");
    expect(spectator.state.players[0]!.sessionId).toBe("");
    expect(spectator.state.players[1]!.displayName).toBe("Sora");
    const participant = new Decoder(new GameState());
    decodeClient({ encoder, target: room.clients[1]!, decoder: participant });
    expect(participant.state.players[0]!.displayName).toBe("Taichi");
    expect(participant.state.players[0]!.avatarId).toBe("secret-avatar");
    expect(participant.state.players[1]!.anonymousSpectatorCount).toBe(1);
    expect(spectator.state.players[0]!.anonymousSpectatorCount).toBe(0);
  } finally {
    room.onDispose();
  }
});

it("authenticates spectator names and shows the roster only to players", async () => {
  const { room, latestLive, encoder } = startedRoom({
    accounts: bothAccounts,
    preferences: { "first-account": { listLiveMatches: true }, "second-account": { listLiveMatches: true } },
  });
  try {
    await vi.waitFor(() => expect(latestLive()).toBeDefined());
    const consumeRoomTicket = vi.fn<
      (token: string) => Promise<{ account: { id: string; displayName: string } } | undefined>
    >(async (token: string) => (token === "valid" ? { account: { id: "observer", displayName: "Mimi" } } : undefined));
    Object.assign(room, {
      accounts: () => ({
        consumeRoomTicket,
        preferences: async () => ({}),
        pool: { query: async () => ({ rows: [] }) },
      }),
    });
    for (const sessionId of ["signed-in", "guest"]) {
      const watcher = client(sessionId);
      const options = {
        spectator: true,
        roomCode: room.state.spectatorCode,
        displayName: "Spoofed",
        deck: { mainDeck: [], eggDeck: [] },
        ...(sessionId === "signed-in" ? { authTicket: "valid" } : {}),
      };
      expect(await room.onAuth(watcher, options)).toBe(true);
      room.clients.push(watcher);
      room.onJoin(watcher, options);
    }
    expect(room.state.players[0]!.spectatorNamesJson).toBe('["Mimi"]');
    expect(room.state.players[0]!.anonymousSpectatorCount).toBe(1);

    const observer = new Decoder(new GameState());
    decodeClient({ encoder, target: room.clients[2]!, decoder: observer });
    expect(observer.state.players[0]!.spectatorNamesJson).toBe("[]");
    const participant = new Decoder(new GameState());
    decodeClient({ encoder, target: room.clients[0]!, decoder: participant });
    expect(participant.state.players[0]!.spectatorNamesJson).toBe('["Mimi"]');
    expect(
      await room.onAuth(client("invalid"), {
        spectator: true,
        roomCode: room.state.spectatorCode,
        authTicket: "invalid",
        displayName: "Watcher",
        deck: { mainDeck: [], eggDeck: [] },
      }),
    ).toBe(false);
    room.state.gameOver = true;
    await room.onLeave(room.clients[2]!);
    expect(room.state.players[0]!.spectatorNamesJson).toBe("[]");
    expect(room.state.players[0]!.anonymousSpectatorCount).toBe(1);
  } finally {
    room.onDispose();
  }
});

type DecodeClientParams = { encoder: Encoder<GameState>; target: Client; decoder: Decoder<GameState> };

function decodeClient({ encoder, target, decoder }: DecodeClientParams): void {
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  decoder.decode(encoder.encodeAllView(target.view!, iterator.offset, iterator));
}
