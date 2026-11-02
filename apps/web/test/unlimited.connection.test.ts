// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { matchMaker } from "colyseus";
import {
  DECISION_CHANNEL,
  SERIES_CHANNEL,
  GameState,
  type DecisionRequest,
  type SeriesSeatMessage,
} from "@aegis/shared";
import { RED_DECK } from "@aegis-api/engine/testDecks.js";
import { startTestServer, type TestServer } from "./scenarioHarness/server";

let server: TestServer;
const rooms: Room<GameState>[] = [];
beforeAll(async () => {
  server = await startTestServer();
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
});
afterEach(async () => {
  await Promise.all(rooms.splice(0).map((room) => room.leave().catch(() => undefined)));
  vi.useRealTimers();
});
afterAll(async () => {
  await server.close();
});

function deckWith(...cards: string[]) {
  const mainDeck = [...RED_DECK.mainDeck];
  mainDeck.splice(0, cards.length, ...cards);
  return { mainDeck, eggDeck: [...RED_DECK.eggDeck] };
}
const bannedRestricted = () => deckWith("BT5-109", "BT5-109", "ST2-13", "ST2-13");
async function create(type: string, options: Record<string, unknown> = {}) {
  const room = await new Client(server.endpoint).create<GameState>(
    type,
    {
      displayName: `Host ${rooms.length}`,
      deck: RED_DECK,
      ...options,
    },
    GameState,
  );
  rooms.push(room);
  await vi.waitFor(() => expect(room.state.players.length).toBe(1));
  return room;
}
async function join(host: Room<GameState>, options: Record<string, unknown> = {}) {
  const room = await new Client(server.endpoint).joinById<GameState>(
    host.roomId,
    {
      displayName: "Guest",
      deck: RED_DECK,
      roomCode: host.state.roomCode,
      ...options,
    },
    GameState,
  );
  rooms.push(room);
  return room;
}

describe("authoritative bot/private Unlimited over websockets", () => {
  it.each(["aegis_bot", "aegis_private"])("accepts banned/restricted decks only when selected in %s", async (type) => {
    await expect(create(type, { deck: bannedRestricted() })).rejects.toThrow(/illegal deck|auth/i);
    const host = await create(type, { deck: bannedRestricted(), unlimited: true });
    expect(host.state.unlimited).toBe(true);
    const [listing] = await matchMaker.query({ roomId: host.roomId });
    expect(listing?.metadata).toEqual({ unlimited: true, format: "unlimited", gameMode: "automatic" });
    expect(await matchMaker.remoteRoomCall(host.roomId, "privateRoomInfo", [])).toEqual({
      unlimited: true,
      format: "unlimited",
      waiting: true,
    });
  });

  it("ignores banned pairs only when Unlimited is selected", async () => {
    const deck = deckWith("BT20-037", "BT17-035");
    await expect(create("aegis_private", { deck })).rejects.toThrow(/illegal deck|auth/i);
    await create("aegis_private", { deck, unlimited: true });
  });

  it("preserves the authoritative choice across a real private reconnect", async () => {
    const host = await create("aegis_private", { unlimited: true, deck: bannedRestricted() });
    const token = host.reconnectionToken;
    const departed = new Promise<void>((resolve) => host.onLeave(() => resolve()));
    host.connection.close(4500, "Unlimited reconnect proof");
    await departed;
    rooms.splice(rooms.indexOf(host), 1);
    const resumed = await new Client(server.endpoint).reconnect<GameState>(token, GameState);
    rooms.push(resumed);
    await vi.waitFor(() => expect(resumed.state.unlimited).toBe(true));
    expect(resumed.state.roomCode).toBe(host.state.roomCode);
    expect(resumed.sessionId).toBe(host.sessionId);
  });

  it("restores private series rules from the server record, overriding forged continuation options", async () => {
    const host = await create("aegis_private", { unlimited: true, deck: bannedRestricted(), bestOf: 3 });
    const guest = await join(host, { unlimited: true, deck: bannedRestricted() });
    const tokens = new Map<string, string>();
    for (const room of [host, guest]) {
      room.onMessage<DecisionRequest>(DECISION_CHANNEL, (request) => {
        if (request.kind === "mulligan") room.send("mulligan", { keep: true });
      });
      room.onMessage<SeriesSeatMessage>(SERIES_CHANNEL, (message) => tokens.set(room.sessionId, message.seatToken));
      room.send("ready", {});
    }
    await vi.waitFor(() => expect(host.state.turnCount).toBeGreaterThan(0), { timeout: 10_000 });
    host.send("surrender", {});
    await vi.waitFor(() => expect(host.state.series.phase).toBe("choosing"));
    host.send(SERIES_CHANNEL, { action: "chooseTurnOrder", goFirst: true });
    await vi.waitFor(() => expect(host.state.series.nextRoomId).not.toBe(""));
    const nextRoomId = host.state.series.nextRoomId;
    for (const previous of [host, guest]) {
      await vi.waitFor(() => expect(tokens.has(previous.sessionId)).toBe(true));
      const next = await new Client(server.endpoint).joinById<GameState>(
        nextRoomId,
        {
          displayName: "forged",
          deck: deckWith("FORGED-001"),
          unlimited: false,
          seriesToken: tokens.get(previous.sessionId),
        },
        GameState,
      );
      rooms.push(next);
      await previous.leave();
      rooms.splice(rooms.indexOf(previous), 1);
    }
    await vi.waitFor(() => expect(rooms[0]!.state.players.length).toBe(2));
    expect(rooms[0]!.state.unlimited).toBe(true);
    expect(rooms[0]!.state.series.bestOf).toBe(3);
    expect(rooms[0]!.state.roomCode).toBe(host.state.roomCode);
    expect(rooms[0]!.state.players[0]?.displayName).not.toBe("forged");
  });

  it("fixes the private host choice and rejects guest changes in both directions", async () => {
    const unlimited = await create("aegis_private", { unlimited: true, deck: bannedRestricted() });
    await expect(join(unlimited, { unlimited: false })).rejects.toThrow(/illegal deck|auth/i);
    const guest = await join(unlimited, { unlimited: true, deck: bannedRestricted() });
    await vi.waitFor(() => expect(guest.state.unlimited).toBe(true));
    const standard = await create("aegis_private");
    await expect(
      join(standard, { unlimited: true, unlimitedRoom: true, allowUnlimitedSelection: true, deck: bannedRestricted() }),
    ).rejects.toThrow(/illegal deck|auth/i);
    await expect(join(standard, { deck: bannedRestricted() })).rejects.toThrow(/illegal deck|auth/i);
    await join(standard);
    expect(standard.state.unlimited).toBe(false);
  });

  it("keeps printed caps, identity budgets, deck sizes and known cards in Unlimited", async () => {
    for (const deck of [
      deckWith(...Array<string>(5).fill("BT5-109")),
      deckWith("RB1-004", "RB1-004", "P-009", "P-009", "P-009"),
      { ...RED_DECK, mainDeck: RED_DECK.mainDeck.slice(1) },
      { ...RED_DECK, eggDeck: [...RED_DECK.eggDeck, "BT1-001"] },
      deckWith("FORGED-001"),
    ])
      await expect(create("aegis_bot", { unlimited: true, deck })).rejects.toThrow(/illegal deck|auth/i);
  });

  it("validates and seats a custom Unlimited bot deck using the room rules", async () => {
    await expect(create("aegis_bot", { botDeck: bannedRestricted() })).rejects.toThrow(/illegal deck|auth/i);
    await expect(
      create("aegis_bot", { unlimited: true, botDeck: deckWith(...Array<string>(5).fill("BT5-109")) }),
    ).rejects.toThrow(/illegal deck|auth/i);
    const host = await create("aegis_bot", { unlimited: true, botDeck: bannedRestricted() });
    expect(await matchMaker.remoteRoomCall(host.roomId, "addBot", [])).toBe(true);
    await vi.waitFor(() => expect(host.state.players.length).toBe(2));
  });

  it("accepts beta decks in private and bot rooms without a beta flag", async () => {
    const betaDeck = deckWith("EX13-007", "BT5-109", "ST2-13", "ST2-13");
    const privateRoom = await create("aegis_private", { unlimited: true, deck: betaDeck });
    await join(privateRoom, { unlimited: true, deck: betaDeck });
    const bot = await create("aegis_bot", { unlimited: true, deck: betaDeck, botDeck: betaDeck });
    expect(await matchMaker.remoteRoomCall(bot.roomId, "addBot", [])).toBe(true);
  });

  it("accepts the deployed beta-bot room name with the unified bot boundaries", async () => {
    const betaDeck = deckWith("EX13-007");
    await expect(create("aegis_beta_bot", { betaBattleMode: true, deck: bannedRestricted() })).rejects.toThrow(
      /illegal deck|auth/i,
    );
    const bot = await create("aegis_beta_bot", {
      betaBattleMode: true,
      deck: betaDeck,
      botDeck: betaDeck,
    });
    expect(bot.state.unlimited).toBe(false);
    expect(await matchMaker.remoteRoomCall(bot.roomId, "addBot", [])).toBe(true);
    await vi.waitFor(() => expect(bot.state.players.length).toBe(2));
  });

  it("keeps public, ranked and tournament registrations immutable and public Unlimited usable", async () => {
    for (const type of ["aegis", "aegis_beta", "aegis_ranked", "aegis_tournament"]) {
      await expect(
        create(type, {
          unlimited: true,
          unlimitedRoom: true,
          allowUnlimitedSelection: true,
          botRoom: true,
          private: true,
          deck: bannedRestricted(),
          betaBattleMode: type === "aegis_beta",
        }),
      ).rejects.toThrow(/illegal deck|auth/i);
    }
    const standard = await create("aegis", {
      unlimitedRoom: true,
      allowUnlimitedSelection: true,
      botRoom: true,
      private: true,
    });
    expect(standard.state.unlimited).toBe(false);
    expect(standard.state.roomCode).toBe("");
    const unlimited = await create("aegis_unlimited", { unlimited: true, deck: bannedRestricted() });
    await join(unlimited, { unlimited: true, deck: bannedRestricted() });
    expect(unlimited.state.unlimited).toBe(true);
  });
}, 30_000);
