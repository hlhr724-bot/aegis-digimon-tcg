import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { matchMaker } from "colyseus";
import { GameState, ROOM_TYPE, EVENT_CHANNEL } from "@aegis/shared";
import type { LiveMatch } from "@aegis/shared/protocol/LiveMatch";
import { AegisRoom } from "@aegis-api/rooms/AegisRoom.js";
import { RED_DECK } from "@aegis-api/engine/testDecks.js";
import { startTestServer, type TestServer } from "./scenarioHarness/server";

let server: TestServer;
const connections: Room[] = [];
const accountStore = {
  consumeRoomTicket: async (ticket: unknown) =>
    typeof ticket === "string"
      ? {
          account: { id: ticket, displayName: ticket, avatarUrl: null, avatarId: null, isAdmin: false },
          tournamentMatchId: null,
        }
      : undefined,
  preferences: async (accountId: string) => ({ listLiveMatches: accountId.startsWith("opted-in") }),
  recordRecentMatch: async () => undefined,
  recordMatch: async () => undefined,
  ensureReady: async () => undefined,
  pool: { query: async () => ({ rows: [], rowCount: 0 }) },
};

beforeAll(async () => {
  vi.spyOn(AegisRoom.prototype as unknown as { accounts: () => unknown }, "accounts").mockReturnValue(accountStore);
  server = await startTestServer();
});
afterAll(async () => {
  await Promise.all(
    connections.filter((room) => room.connection.isOpen).map((room) => room.leave().catch(() => undefined)),
  );
  await server.close();
  vi.restoreAllMocks();
});

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for live match state");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function seat(join: Promise<Room<GameState>>): Promise<Room<GameState>> {
  const room = await join;
  room.onMessage(EVENT_CHANNEL, () => {});
  room.onMessage("decision", () => {});
  connections.push(room);
  return room;
}

async function startedMatch(tickets: [string | undefined, string | undefined]) {
  const first = await seat(
    new Client(server.endpoint).create<GameState>(
      ROOM_TYPE,
      { displayName: "Alpha", deck: RED_DECK, authTicket: tickets[0] },
      GameState,
    ),
  );
  await waitFor(() => first.state?.players.length === 1);
  const second = await seat(
    new Client(server.endpoint).joinById<GameState>(
      first.roomId,
      { displayName: "Beta", deck: RED_DECK, authTicket: tickets[1] },
      GameState,
    ),
  );
  first.send("ready", {});
  second.send("ready", {});
  await waitFor(() => first.state.players[0]!.handCount > 0);
  return first;
}

async function liveEntry(roomId: string): Promise<LiveMatch | undefined> {
  const [listing] = await matchMaker.query({ roomId });
  return (listing?.metadata as { live?: LiveMatch } | undefined)?.live;
}

it("publishes a casual match both accounts opted into and counts its spectators", async () => {
  const first = await startedMatch(["opted-in-alpha", "opted-in-beta"]);
  await waitFor(async () => (await liveEntry(first.roomId)) !== undefined);
  const live = (await liveEntry(first.roomId))!;
  expect(live).toMatchObject({ players: ["opted-in-alpha", "opted-in-beta"], format: "standard", spectators: 0 });
  expect(live.spectatorCode).toBe(first.state.spectatorCode);

  const [listing] = await matchMaker.query({ roomId: first.roomId });
  const reservation = await matchMaker.reserveSeatFor(listing!, {
    displayName: "Watcher",
    deck: { mainDeck: [], eggDeck: [] },
    spectator: true,
    roomCode: live.spectatorCode,
  });
  const watcher = await new Client(server.endpoint).consumeSeatReservation<GameState>(reservation, GameState);
  watcher.onMessage(EVENT_CHANNEL, () => {});
  connections.push(watcher);
  await waitFor(async () => (await liveEntry(first.roomId))?.spectators === 1);
});

it("keeps a match unlisted when one seat is a guest or did not opt in", async () => {
  const withGuest = await startedMatch(["opted-in-alpha", undefined]);
  const oneSided = await startedMatch(["opted-in-alpha", "private-beta"]);
  await waitFor(async () => {
    const listings = await matchMaker.query({ name: ROOM_TYPE });
    return [withGuest.roomId, oneSided.roomId].every((roomId) =>
      listings.some((listing) => listing.roomId === roomId && listing.locked),
    );
  });
  expect(await liveEntry(withGuest.roomId)).toBeUndefined();
  expect(await liveEntry(oneSided.roomId)).toBeUndefined();
});
