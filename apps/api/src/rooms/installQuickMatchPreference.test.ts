import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Room, Protocol, Server, matchMaker, type Client } from "colyseus";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { createGameTransport } from "#api/connections/createGameTransport";
import { ROOM_TYPE, ROOM_TYPE_PRIVATE } from "@aegis/shared/protocol/messages";
import { installQuickMatchPreference } from "#api/rooms/installQuickMatchPreference";
import { QuickMatchPreference } from "#api/rooms/QuickMatchPreference";
import { QuickMatchPolicy } from "#api/rooms/QuickMatchPolicy";

type Reservation = { roomId: string; processId: string; sessionId: string };
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function openMatchmaking() {
  const adapter = createMemoryDatabase().adapters.createPg();
  const accounts = new AccountStore(new adapter.Pool() as never);
  const identities = await Promise.all(
    ["Alpha", "Beta", "Gamma"].map((name) => accounts.accountForIdentity("discord", name, name)),
  );
  class WaitingRoom extends Room {
    private hostAccountId: string | undefined;
    override onCreate() {
      this.maxClients = 2;
    }
    override async onAuth(_client: Client, options: { authTicket: string }) {
      const ticket = await accounts.consumeRoomTicket(options.authTicket);
      return ticket?.account;
    }
    override onJoin(client: Client) {
      this.hostAccountId ??= client.auth.id as string;
    }
    getQuickMatchAccountId() {
      return this.hostAccountId;
    }
  }
  const http = createServer();
  const server = new Server({ transport: createGameTransport({ server: http }), gracefullyShutdown: false });
  server.define(ROOM_TYPE, WaitingRoom).filterBy(["format"]);
  server.define(ROOM_TYPE_PRIVATE, WaitingRoom);
  await server.listen(0, "127.0.0.1");
  const port = (http.address() as AddressInfo).port;
  let elapsed = 0;
  let waits = 0;
  const restore = installQuickMatchPreference({
    accounts,
    canCreate: () => true,
    now: () => elapsed,
    wait: async (ms) => {
      elapsed += ms;
      waits++;
    },
  });
  const sockets: WebSocket[] = [];
  cleanups.push(async () => {
    restore();
    for (const socket of sockets) {
      socket.close();
    }
    await server.gracefullyShutdown(false);
    await accounts.close();
  });
  async function reserve(accountId: string, method = "joinOrCreate", roomType = ROOM_TYPE, format = "standard") {
    const authTicket = await accounts.createRoomTicket(accountId);
    const response = await fetch(`http://127.0.0.1:${port}/matchmake/${method}/${roomType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authTicket, format, accountId: "forged-account", avoidOpponentId: "forged-opponent" }),
    });
    expect(response.ok).toBe(true);
    const reservation = (await response.json()) as Reservation;
    expect(reservation.roomId).toBeTruthy();
    expect(await accounts.getRoomTicketAccountId(authTicket)).toBe(accountId);
    return { reservation, authTicket };
  }
  async function join(reservation: Reservation) {
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/${reservation.processId}/${reservation.roomId}?sessionId=${reservation.sessionId}`,
    );
    sockets.push(socket);
    socket.binaryType = "arraybuffer";
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("error", reject, { once: true });
      socket.addEventListener(
        "message",
        (event: MessageEvent<ArrayBuffer>) => {
          if (new Uint8Array(event.data)[0] !== Protocol.JOIN_ROOM) {
            reject(new Error("Unexpected handshake"));
            return;
          }
          socket.send(new Uint8Array([Protocol.JOIN_ROOM]));
          resolve();
        },
        { once: true },
      );
    });
  }
  return {
    accounts,
    identities,
    reserve,
    join,
    preference: new QuickMatchPreference({ presence: matchMaker.presence }),
    getWaits: () => waits,
    getElapsed: () => elapsed,
  };
}

describe("quick matchmaking opponent preference over the real HTTP reservation flow", () => {
  it("prefers another compatible waiting player and leaves the single-use ticket for websocket authentication", async () => {
    const game = await openMatchmaking();
    const [alpha, beta, gamma] = game.identities;
    await game.preference.recordOpponents([alpha!.id, beta!.id]);
    const first = await game.reserve(alpha!.id);
    await game.join(first.reservation);
    const other = await game.reserve(gamma!.id, "create");
    await game.join(other.reservation);
    const next = await game.reserve(beta!.id);
    expect(next.reservation.roomId).toBe(other.reservation.roomId);
    expect(game.getWaits()).toBe(0);
    await game.join(next.reservation);
    expect(await game.accounts.getRoomTicketAccountId(next.authTicket)).toBeUndefined();
  });

  it("waits at most fifteen seconds for a different opponent then admits the recent opponent", async () => {
    const game = await openMatchmaking();
    const [alpha, beta] = game.identities;
    await game.preference.recordOpponents([alpha!.id, beta!.id]);
    const first = await game.reserve(alpha!.id);
    await game.join(first.reservation);
    const next = await game.reserve(beta!.id);
    expect(next.reservation.roomId).toBe(first.reservation.roomId);
    expect(game.getElapsed()).toBe(QuickMatchPolicy.repeatWaitMs);
    expect(game.getWaits()).toBe(QuickMatchPolicy.repeatWaitMs / QuickMatchPolicy.pollIntervalMs);
    await game.join(next.reservation);
  });

  it("does not apply the recent-opponent delay to explicit joins or private rooms", async () => {
    const game = await openMatchmaking();
    const [alpha, beta] = game.identities;
    await game.preference.recordOpponents([alpha!.id, beta!.id]);
    const first = await game.reserve(alpha!.id);
    await game.join(first.reservation);
    const explicit = await game.reserve(beta!.id, "joinById", first.reservation.roomId);
    expect(explicit.reservation.roomId).toBe(first.reservation.roomId);
    expect(game.getWaits()).toBe(0);
    await game.join(explicit.reservation);
    const privateRoom = await game.reserve(alpha!.id, "joinOrCreate", ROOM_TYPE_PRIVATE);
    await game.join(privateRoom.reservation);
    const privateGuest = await game.reserve(beta!.id, "joinOrCreate", ROOM_TYPE_PRIVATE);
    expect(privateGuest.reservation.roomId).toBe(privateRoom.reservation.roomId);
    await game.join(privateGuest.reservation);
    expect(game.getWaits()).toBe(0);
  });
});
