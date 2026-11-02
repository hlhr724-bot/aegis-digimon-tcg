import { RankedSeasonStore } from "#api/ranked/RankedSeasonStore";
import type { SeriesRecord } from "#api/rooms/series/SeriesDirectory";
import type { Client } from "colyseus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { RankedStore } from "#api/ranked/RankedStore";
import { RankedRegion } from "@aegis/shared/ranked/RankedRegion";
import { AegisRoom, type AegisJoinOptions } from "#api/rooms/AegisRoom";
import { RED_DECK } from "#api/engine/testDecks";
import type { Intent } from "@aegis/shared/protocol/messages";

let accounts: AccountStore;
let queue: RankedStore;
const rooms: AegisRoom[] = [];
class RankedTestRoom extends AegisRoom {
  protected override accounts(): AccountStore {
    return accounts;
  }
}
function createRoom(roomId: string, pairId?: string) {
  const room = new RankedTestRoom();
  (room as unknown as { roomId: string }).roomId = roomId;
  room.lock = vi.fn<() => Promise<void>>(async () => {});
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  void room.onCreate({ rankedRoom: true, rankedPairId: pairId, seed: 1, format: pairId ? "BT10" : "standard" });
  rooms.push(room);
  return room;
}
function createClient(id: string): Client {
  return { sessionId: id, send: vi.fn<() => void>(), view: undefined } as unknown as Client;
}

beforeEach(() => {
  vi.stubEnv("AEGIS_RANKED_ENABLED", "true");
  accounts = new AccountStore(createMemoryPool());
  queue = new RankedStore(accounts, async () => "reserved-room");
});
afterEach(async () => {
  for (const room of rooms.splice(0)) {
    room.onDispose();
    room.clock.stop();
  }
  await accounts.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function preparePair() {
  const players = await Promise.all(
    ["Ranked Alice", "Ranked Bob"].map((name) => accounts.accountForIdentity("discord", name, name)),
  );
  const decks = await Promise.all(
    players.map((player) => accounts.saveDeck(player.id, { name: "Frozen ranked deck", ...RED_DECK })),
  );
  const first = await queue.joinQueue({
    accountId: players[0]!.id,
    deckId: decks[0]!.id,
    format: "BT10",
    region: RankedRegion.SOUTH_AMERICA.value,
    slot: "legacy",
  });
  expect(first.status).toBe("waiting");
  const second = await queue.joinQueue({
    accountId: players[1]!.id,
    deckId: decks[1]!.id,
    format: "BT10",
    region: RankedRegion.SOUTH_AMERICA.value,
    slot: "legacy",
  });
  const views = [await queue.pollQueue(players[0]!.id), second];
  const options: AegisJoinOptions[] = await Promise.all(
    players.map(async (player, seat) => ({
      displayName: "Client cannot choose identity",
      ranked: true,
      rankedPairId: second.pairId,
      rankedToken: views[seat]!.token,
      authTicket: await accounts.createRoomTicket(player.id),
      format: "BT10",
      deck: { mainDeck: [], eggDeck: [] },
    })),
  );
  return { players, pairId: second.pairId!, options };
}

describe("ranked room admission", () => {
  it("shares only the authenticated account's equipped frame with both players", async () => {
    const { players, pairId, options } = await preparePair();
    await new RankedSeasonStore(accounts).getSeasons();
    await accounts.pool.query(
      "INSERT INTO ranked_rewards (season_id,account_id,tier,equipped,granted_at) SELECT id,$1,'diamond',true,1 FROM ranked_seasons LIMIT 1",
      [players[0]!.id],
    );
    await accounts.pool.query(
      "INSERT INTO ranked_rewards (season_id,account_id,tier,equipped,granted_at) SELECT id,$1,'gold',false,1 FROM ranked_seasons LIMIT 1",
      [players[1]!.id],
    );
    Object.assign(options[1]!, { equippedRankedTier: "diamond" });
    const room = createRoom("reserved-room", pairId);
    const clients = [createClient("framed"), createClient("unframed")];
    for (const seat of [0, 1] as const) {
      expect(await room.onAuth(clients[seat]!, options[seat]!)).toBe(true);
      room.onJoin(clients[seat]!, options[seat]!);
    }

    expect(room.state.players[0]!.equippedRankedTier).toBe("diamond");
    expect(room.state.players[1]!.equippedRankedTier).toBe("");
    expect(clients.every((client) => client.view !== undefined)).toBe(true);
  });

  it.each([Date.UTC(2026, 9, 24), Date.UTC(2026, 11, 8)])(
    "rejects direct joins without queue authorization even when a season has no formats (%s)",
    async (now) => {
      vi.spyOn(Date, "now").mockReturnValue(now);
      const player = await accounts.accountForIdentity("discord", "Direct", "Direct");
      const room = createRoom("unreserved");
      expect(
        await room.onAuth(createClient("one"), {
          displayName: "Direct",
          ranked: true,
          deck: RED_DECK,
          authTicket: await accounts.createRoomTicket(player.id),
        }),
      ).toBe(false);
    },
  );
  it("locks identities and decks to the reserved room and starts a server round clock", async () => {
    const { pairId, options, players } = await preparePair();
    const room = createRoom("reserved-room", pairId);
    const clients = [createClient("one"), createClient("two")];
    for (const [seat, client] of clients.entries()) {
      expect(await room.onAuth(client, options[seat]!)).toBe(true);
      expect(options[seat]!.deck.mainDeck).toEqual(RED_DECK.mainDeck);
      room.clients.push(client);
      room.onJoin(client, options[seat]!);
    }
    const internals = room as unknown as { handleIntent(client: Client, intent: Intent): void };
    for (const client of clients) {
      internals.handleIntent(client, { type: "ready" });
    }
    await vi.waitFor(() => expect(room.state.rankedDeadlineAt).toBeGreaterThan(Date.now()));
    expect(room.state.format).toBe("BT10");
    expect(room.state.matchTimer).toBe(true);
    expect(room.state.allowRollback).toBe(false);
    expect(room.state.rankedRemainingSeconds).toBe(48 * 60);
    await expect(queue.cancelQueue(players[0]!.id)).rejects.toThrow("ranked_already_playing");
  });
  it("claims the persisted account before admitting a later casual series game", async () => {
    const player = await accounts.accountForIdentity("discord", "Continuing", "Continuing");
    const deck = await accounts.saveDeck(player.id, { name: "Series deck", ...RED_DECK });
    const room = new RankedTestRoom();
    (room as unknown as { roomId: string }).roomId = "continued-room";
    room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
    void room.onCreate({ seed: 1 });
    rooms.push(room);
    const record = {
      seats: [{ accountId: player.id, displayName: player.displayName, deck: RED_DECK }],
    } as unknown as SeriesRecord;
    (room as unknown as { casualSeries: unknown }).casualSeries = {
      continuation: record,
      seatForToken: () => 0,
      dispose: () => {},
    };
    expect(
      await room.onAuth(createClient("continued"), {
        displayName: "ignored",
        deck: RED_DECK,
        seriesToken: "valid-series-seat",
      }),
    ).toBe(true);
    await expect(
      queue.joinQueue({
        accountId: player.id,
        deckId: deck.id,
        format: "BT10",
        region: RankedRegion.SOUTH_AMERICA.value,
        slot: "legacy",
      }),
    ).rejects.toThrow("ranked_already_playing");
  });
});
