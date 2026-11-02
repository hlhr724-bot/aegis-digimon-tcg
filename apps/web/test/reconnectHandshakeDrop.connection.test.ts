// @vitest-environment node
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { Client, type Room } from "@colyseus/sdk";
import { DECISION_CHANNEL, GameState, type DecisionRequest } from "@aegis/shared";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { startTestServer, type TestServer } from "./scenarioHarness/server";

let server: TestServer | undefined;
const rooms: Room<GameState>[] = [];
afterEach(async () => {
  await Promise.all(
    rooms.splice(0).map((room) => (room.connection.isOpen ? room.leave().catch(() => undefined) : undefined)),
  );
  await server?.close();
  server = undefined;
});

async function seat(endpoint: string, displayName: string, deck: typeof RED_DECK): Promise<Room<GameState>> {
  const room = await new Client(endpoint).joinOrCreate<GameState>(
    "aegis",
    { displayName, deck, matchTimer: false, bestOf: 1 },
    GameState,
  );
  rooms.push(room);
  room.reconnection.enabled = false;
  room.onMessage<DecisionRequest>(DECISION_CHANNEL, (request) => {
    if (request.kind === "mulligan") room.send("mulligan", { keep: true });
  });
  room.send("ready", {});
  return room;
}

async function startedMatch(endpoint: string) {
  const host = await seat(endpoint, "Host", RED_DECK);
  const guest = await seat(endpoint, "Guest", BLUE_DECK);
  await vi.waitFor(() => expect(host.state.turnCount).toBeGreaterThan(0), { timeout: 10_000 });
  const guestSeat = host.state.players.findIndex((player) => player.displayName === "Guest");
  return { host, guest, guestSeat };
}

async function dropSocket(room: Room<GameState>, observer: Room<GameState>, seatIndex: number) {
  room.connection.close(4500, "test: network drop");
  await vi.waitFor(() => expect(observer.state.players[seatIndex]!.connected).toBe(false), { timeout: 5000 });
}

function requestReconnect(endpoint: string, sdkToken: string): Promise<Response> {
  const [roomId, token] = sdkToken.split(":");
  return fetch(`${endpoint.replace("ws:", "http:")}/matchmake/reconnect/${roomId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reconnectionToken: token }),
  });
}

async function reconnectAndDropBeforeAcknowledging(endpoint: string, sdkToken: string): Promise<string> {
  const [roomId, token] = sdkToken.split(":");
  const response = await requestReconnect(endpoint, sdkToken);
  expect(response.ok).toBe(true);
  const reservation = (await response.json()) as { processId: string; sessionId: string };
  const socket = new WebSocket(
    `${endpoint}/${reservation.processId}/${roomId}?sessionId=${reservation.sessionId}&reconnectionToken=${token}`,
  );
  const [joinRoom] = (await once(socket, "message")) as [Buffer];
  socket.terminate();
  return `${roomId}:${joinRoom.subarray(2, 2 + joinRoom[1]!).toString()}`;
}

describe("a reconnect that drops before the client acknowledges JOIN_ROOM", () => {
  it.each([
    ["the token it held before", (previousToken: string) => previousToken],
    ["the token JOIN_ROOM delivered", (_previousToken: string, deliveredToken: string) => deliveredToken],
  ])("keeps the seat, so the client resumes with %s", async (_label, tokenToResumeWith) => {
    server = await startTestServer();
    const { host, guest, guestSeat } = await startedMatch(server.endpoint);
    const previousToken = guest.reconnectionToken;
    await dropSocket(guest, host, guestSeat);

    const deliveredToken = await reconnectAndDropBeforeAcknowledging(server.endpoint, previousToken);
    const resumeToken = tokenToResumeWith(previousToken, deliveredToken);
    await vi.waitFor(async () => expect((await requestReconnect(server!.endpoint, resumeToken)).ok).toBe(true), {
      timeout: 5000,
    });
    expect(host.state.gameOver).toBe(false);

    const resumed = await new Client(server.endpoint).reconnect<GameState>(resumeToken, GameState);
    rooms.push(resumed);
    await vi.waitFor(() => expect(host.state.players[guestSeat]!.connected).toBe(true), { timeout: 5000 });
    expect(host.state.gameOver).toBe(false);
  });
});
