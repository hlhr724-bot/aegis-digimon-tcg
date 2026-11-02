import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloseCode, LocalPresence, type Client } from "colyseus";
import { SEAT_TRANSFERRED_CLOSE_CODE } from "@aegis/shared/protocol/seatTransferredCloseCode";
import { AegisRoom } from "#api/rooms/AegisRoom";
import type { ActiveMatchDirectory } from "#api/rooms/activeMatch/ActiveMatchDirectory";
import { createActiveMatchDirectory } from "#api/rooms/activeMatch/createActiveMatchDirectory";

const EMPTY_DECK = { mainDeck: [], eggDeck: [] };

type PendingReconnection = [string, { resolve: (client: Client) => Promise<void> }];

type RoomInternals = {
  accountByClient: Map<string, string>;
  spectatorIdentities: Map<string, { id: string; displayName: string }>;
  spectatorClients: Set<string>;
  handleIntent: (client: Client, intent: { type: string }) => void;
  engine: { makeStateView: (seat: 0 | 1 | undefined) => unknown };
  _reconnections: Record<string, PendingReconnection | undefined>;
};

class TransferRoom extends AegisRoom {
  readonly directory: ActiveMatchDirectory = createActiveMatchDirectory({ presence: new LocalPresence() });

  protected override activeMatches(): ActiveMatchDirectory {
    return this.directory;
  }
}

type SocketClient = Client & { leave: ReturnType<typeof vi.fn<Client["leave"]>> };

function createSocketClient(sessionId: string, reconnectionToken: string): SocketClient {
  const socket = new EventEmitter() as EventEmitter & { onleave?: () => void };
  socket.onleave = vi.fn<() => void>();
  socket.on("close", socket.onleave);
  socket.on("message", vi.fn<() => void>());
  return {
    sessionId,
    reconnectionToken,
    ref: socket,
    send: vi.fn<Client["send"]>(),
    leave: vi.fn<Client["leave"]>(),
    view: undefined,
  } as unknown as SocketClient;
}

function internals(room: AegisRoom): RoomInternals {
  return room as unknown as RoomInternals;
}

type SeatAccounts = { first?: string; second?: string };

function createMatch({ first = "account-a", second = "account-b" }: SeatAccounts = {}) {
  const room = new TransferRoom();
  room.lock = vi.fn<AegisRoom["lock"]>(async () => {});
  room.unlock = vi.fn<AegisRoom["unlock"]>(async () => {});
  room.setMatchmaking = vi.fn<AegisRoom["setMatchmaking"]>(async () => {});
  room.broadcast = vi.fn<AegisRoom["broadcast"]>(() => true);
  room.onCreate({ seed: 1 });
  room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => false);
  const opponent = createSocketClient("session-a", "token-a");
  const owner = createSocketClient("session-b", "token-b");
  if (first) internals(room).accountByClient.set(opponent.sessionId, first);
  if (second) internals(room).accountByClient.set(owner.sessionId, second);
  room.clients.push(opponent);
  room.onJoin(opponent, { displayName: "Agumon", deck: EMPTY_DECK });
  room.clients.push(owner);
  room.onJoin(owner, { displayName: "Gabumon", deck: EMPTY_DECK });
  return { room, opponent, owner };
}

function startMatch(room: AegisRoom, ...clients: Client[]): void {
  for (const client of clients) internals(room).handleIntent(client, { type: "ready" });
}

function createStartedMatch(accounts?: SeatAccounts) {
  const match = createMatch(accounts);
  startMatch(match.room, match.opponent, match.owner);
  return match;
}

function getSecret(reconnectionToken: string): string {
  return reconnectionToken.split(":")[1]!;
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("continuing a live match on another device", () => {
  it("reports the seat held by the signed-in account", () => {
    const { room } = createStartedMatch();

    expect(room.findAccountSeat("account-b")).toEqual({ roomId: room.roomId, seat: 1 });
    expect(room.findAccountSeat("account-a")).toEqual({ roomId: room.roomId, seat: 0 });
  });

  it("closes the old connection with the transfer code and hands the seat to the new device", async () => {
    const { room, owner, opponent } = createStartedMatch();
    const ownerSocket = owner.ref as EventEmitter;
    const makeStateView = vi.spyOn(internals(room).engine, "makeStateView");

    const claim = await room.transferAccountSeat("account-b");

    expect(claim).toMatchObject({ roomId: room.roomId, seat: 1 });
    expect(owner.leave).toHaveBeenCalledWith(SEAT_TRANSFERRED_CLOSE_CODE);
    expect(ownerSocket.listenerCount("message")).toBe(0);
    expect(ownerSocket.listenerCount("close")).toBe(0);
    expect(opponent.leave).not.toHaveBeenCalled();
    expect(room.state.players[1]!.connected).toBe(false);

    const secret = getSecret(claim!.reconnectionToken);
    expect(claim!.reconnectionToken).toBe(`${room.roomId}:${secret}`);
    expect(secret).not.toBe("token-b");
    expect(room.checkReconnectionToken(secret)).toBe(owner.sessionId);
    expect(room.hasReservedSeat(owner.sessionId, secret)).toBe(true);

    const newDevice = createSocketClient(owner.sessionId, "token-new-device");
    room.clients.push(newDevice);
    await internals(room)._reconnections[secret]![1].resolve(newDevice);
    await flushPromises();

    expect(room.state.players[1]!.connected).toBe(true);
    expect(room.state.players[1]!.sessionId).toBe(owner.sessionId);
    expect(makeStateView).toHaveBeenLastCalledWith(1);
    expect(newDevice.view).toBeDefined();
    expect(room.state.gameOver).toBe(false);
    expect(room.findAccountSeat("account-b")).toEqual({ roomId: room.roomId, seat: 1 });
  });

  it("refuses the old device's reconnection token once the seat is transferred", async () => {
    const { room, owner } = createStartedMatch();

    const claim = await room.transferAccountSeat("account-b");

    expect(claim).not.toBeNull();
    expect(room.checkReconnectionToken("token-b")).toBeFalsy();
    expect(room.hasReservedSeat(owner.sessionId, "token-b")).toBe(false);
  });

  it("rotates the token again when a later device claims a seat that is still held", async () => {
    const { room, owner } = createStartedMatch();

    const first = await room.transferAccountSeat("account-b");
    const second = await room.transferAccountSeat("account-b");

    expect(owner.leave).toHaveBeenCalledTimes(1);
    expect(room.checkReconnectionToken(getSecret(first!.reconnectionToken))).toBeFalsy();
    expect(room.checkReconnectionToken(getSecret(second!.reconnectionToken))).toBe(owner.sessionId);
  });

  it("transfers a seat that is already waiting out its reconnect grace", async () => {
    const { room, owner } = createStartedMatch();
    room.clients.splice(room.clients.indexOf(owner), 1);
    const departure = room.onLeave(owner, CloseCode.ABNORMAL_CLOSURE);
    await flushPromises();

    const claim = await room.transferAccountSeat("account-b");

    expect(owner.leave).not.toHaveBeenCalled();
    expect(room.checkReconnectionToken("token-b")).toBeFalsy();
    const secret = getSecret(claim!.reconnectionToken);
    const newDevice = createSocketClient(owner.sessionId, "token-new-device");
    room.clients.push(newDevice);
    await internals(room)._reconnections[secret]![1].resolve(newDevice);
    await departure;
    expect(room.state.players[1]!.connected).toBe(true);
  });

  it("reports how long a dropped seat stays held for reconnection", async () => {
    const { room, owner } = createStartedMatch();
    room.clients.splice(room.clients.indexOf(owner), 1);
    void room.onLeave(owner, CloseCode.ABNORMAL_CLOSURE);
    await flushPromises();

    room.clock.currentTime += 15_000;

    const held = room.findAccountSeat("account-b");
    expect(held).toMatchObject({ roomId: room.roomId, seat: 1 });
    expect(held?.reconnectGraceMs).toBeGreaterThan(44_000);
    expect(held?.reconnectGraceMs).toBeLessThanOrEqual(45_000);
    expect(room.findAccountSeat("account-a")).toEqual({ roomId: room.roomId, seat: 0 });
  });

  it("never gives the opponent's account the other seat", async () => {
    const { room, owner, opponent } = createStartedMatch();

    const claim = await room.transferAccountSeat("account-a");

    expect(claim?.seat).toBe(0);
    expect(owner.leave).not.toHaveBeenCalled();
    expect(opponent.leave).toHaveBeenCalledWith(SEAT_TRANSFERRED_CLOSE_CODE);
  });

  it("refuses an account that holds no seat, including a signed-in spectator", async () => {
    const { room, owner, opponent } = createStartedMatch();
    const spectator = createSocketClient("session-spectator", "token-spectator");
    internals(room).spectatorIdentities.set(spectator.sessionId, { id: "account-c", displayName: "Patamon" });
    internals(room).accountByClient.set(spectator.sessionId, "account-c");
    internals(room).spectatorClients.add(spectator.sessionId);
    room.clients.push(spectator);

    expect(room.findAccountSeat("account-c")).toBeNull();
    expect(await room.transferAccountSeat("account-c")).toBeNull();
    expect(await room.transferAccountSeat("account-unknown")).toBeNull();
    expect(await room.transferAccountSeat("")).toBeNull();
    expect(owner.leave).not.toHaveBeenCalled();
    expect(opponent.leave).not.toHaveBeenCalled();
    expect(spectator.leave).not.toHaveBeenCalled();
  });

  it("keeps a guest seat out of reach", async () => {
    const { room, owner } = createStartedMatch({ second: "" });

    expect(room.findAccountSeat("")).toBeNull();
    expect(await room.transferAccountSeat("")).toBeNull();
    expect(owner.leave).not.toHaveBeenCalled();
  });

  it("refuses an account that holds both seats", async () => {
    const { room, owner, opponent } = createStartedMatch({ first: "account-b", second: "account-b" });

    expect(room.findAccountSeat("account-b")).toBeNull();
    expect(await room.transferAccountSeat("account-b")).toBeNull();
    expect(owner.leave).not.toHaveBeenCalled();
    expect(opponent.leave).not.toHaveBeenCalled();
  });

  it("refuses a match that has not started or is already over", async () => {
    const waiting = createMatch();
    expect(waiting.room.findAccountSeat("account-b")).toBeNull();
    expect(await waiting.room.transferAccountSeat("account-b")).toBeNull();

    const finished = createStartedMatch();
    finished.room.state.gameOver = true;
    expect(finished.room.findAccountSeat("account-b")).toBeNull();
    expect(await finished.room.transferAccountSeat("account-b")).toBeNull();
    expect(finished.owner.leave).not.toHaveBeenCalled();
  });
});

describe("active match directory published by a room", () => {
  it("lists every signed-in seat once the match starts and skips guests", async () => {
    const { room } = createMatch({ first: "" });
    await flushPromises();
    expect(await room.directory.find("account-b")).toBeUndefined();

    const { opponent, owner } = { opponent: room.clients[0]!, owner: room.clients[1]! };
    startMatch(room, opponent, owner);
    await flushPromises();

    expect(await room.directory.find("account-b")).toBe(room.roomId);
    expect(await room.directory.find("")).toBeUndefined();
  });

  it("removes the entry when the seat is conceded", async () => {
    const { room, owner } = createStartedMatch();
    await flushPromises();

    await room.onLeave(owner, CloseCode.CONSENTED);
    await flushPromises();

    expect(await room.directory.find("account-b")).toBeUndefined();
    expect(await room.directory.find("account-a")).toBeUndefined();
  });

  it("removes every entry when the room is disposed", async () => {
    const { room } = createStartedMatch();
    await flushPromises();

    room.onDispose();
    await flushPromises();

    expect(await room.directory.find("account-a")).toBeUndefined();
    expect(await room.directory.find("account-b")).toBeUndefined();
  });

  it("does not remove an entry that a newer room already published", async () => {
    const { room } = createStartedMatch();
    await flushPromises();
    await room.directory.publish({ accountId: "account-b", roomId: "newer-room" });

    room.onDispose();
    await flushPromises();

    expect(await room.directory.find("account-b")).toBe("newer-room");
  });
});
