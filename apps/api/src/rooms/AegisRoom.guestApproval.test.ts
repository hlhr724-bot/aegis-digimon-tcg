import { describe, expect, it, vi } from "vitest";
import { CloseCode, type Client } from "colyseus";
import { GuestApproval } from "@aegis/shared/protocol/GuestApproval";
import { GUEST_APPROVAL_CHANNEL } from "@aegis/shared/protocol/GuestApprovalMessage";
import { GUEST_DECLINED_CLOSE_CODE, HOST_LEFT_CLOSE_CODE } from "@aegis/shared/protocol/closeCodes";
import { AegisRoom, type AegisJoinOptions } from "#api/rooms/AegisRoom";
import type { AccountStore } from "#api/accounts/AccountStore";
import { BLUE_DECK, RED_DECK } from "#api/engine/testDecks";

type TestClient = Client & { leave: ReturnType<typeof vi.fn> };

type ReconnectionDeferred = Promise<Client> & { resolve: (client: Client) => void; reject: (error: unknown) => void };

type RoomParams = {
  requireApproval?: boolean;
  tickets?: Record<string, { id: string; displayName: string }>;
};

class ApprovalRoom extends AegisRoom {
  tickets: Record<string, { id: string; displayName: string }> = {};

  protected override accounts(): AccountStore {
    return {
      consumeRoomTicket: async (ticket: string | undefined) =>
        ticket && this.tickets[ticket] ? { account: this.tickets[ticket] } : undefined,
      ensureReady: async () => {},
      pool: { query: async () => ({ rows: [] }) },
    } as unknown as AccountStore;
  }
}

function createClient(sessionId: string): TestClient {
  return {
    sessionId,
    send: vi.fn<Client["send"]>(),
    leave: vi.fn<Client["leave"]>(),
    view: undefined,
  } as unknown as TestClient;
}

function createRoom({ requireApproval = true, tickets = {} }: RoomParams = {}): ApprovalRoom {
  const room = new ApprovalRoom();
  room.tickets = tickets;
  room.lock = vi.fn<AegisRoom["lock"]>(async () => {});
  room.unlock = vi.fn<AegisRoom["unlock"]>(async () => {});
  room.setMatchmaking = vi.fn<AegisRoom["setMatchmaking"]>(async () => {});
  room.disconnect = vi.fn<AegisRoom["disconnect"]>(async () => {});
  room.broadcast = vi.fn<AegisRoom["broadcast"]>(() => true);
  room.onCreate({ seed: 1, private: true, requireApproval });
  room.broadcastPatch = vi.fn<AegisRoom["broadcastPatch"]>(() => false);
  return room;
}

async function join(room: ApprovalRoom, client: TestClient, options: AegisJoinOptions): Promise<boolean> {
  if (!(await room.onAuth(client, options))) {
    return false;
  }
  room.clients.push(client);
  room.onJoin(client, options);
  return true;
}

function sendMessage(room: AegisRoom, client: Client, type: string, payload: unknown): void {
  const handlers = (
    room as unknown as { onMessageEvents: { events: Record<string, ((...args: unknown[]) => void)[]> } }
  ).onMessageEvents.events;
  for (const handler of handlers["*"] ?? []) {
    handler(client, type, payload);
  }
}

function hasMatchStarted(room: AegisRoom): boolean {
  return (room as unknown as { matchStartRequested: boolean }).matchStartRequested;
}

function hostOptions(): AegisJoinOptions {
  return { displayName: "Streamer", avatarId: "greymon", deck: RED_DECK };
}

function guestOptions(room: AegisRoom, displayName = "Challenger"): AegisJoinOptions {
  return { displayName, avatarId: "garurumon", deck: BLUE_DECK, roomCode: room.state.roomCode };
}

async function seatHostAndGuest(room: ApprovalRoom): Promise<{ host: TestClient; guest: TestClient }> {
  const host = createClient("host");
  const guest = createClient("guest");
  await join(room, host, hostOptions());
  sendMessage(room, host, "ready", {});
  await join(room, guest, guestOptions(room));
  sendMessage(room, guest, "ready", {});
  return { host, guest };
}

function answer(room: AegisRoom, sender: Client, guestSessionId: string, accept: boolean): void {
  sendMessage(room, sender, GUEST_APPROVAL_CHANNEL, { guestSessionId, accept });
}

describe("private room guest approval", () => {
  it("starts the match as soon as both seats are ready when approval is off", async () => {
    const room = createRoom({ requireApproval: false });
    await seatHostAndGuest(room);

    expect(room.state.guestApproval).toBe(GuestApproval.NOT_REQUIRED.value);
    expect(hasMatchStarted(room)).toBe(true);
  });

  it("holds the match until the host accepts the guest", async () => {
    const room = createRoom();
    const { host, guest } = await seatHostAndGuest(room);

    expect(room.state.guestApproval).toBe(GuestApproval.PENDING.value);
    expect(hasMatchStarted(room)).toBe(false);

    answer(room, host, guest.sessionId, true);

    expect(room.state.guestApproval).toBe(GuestApproval.APPROVED.value);
    expect(hasMatchStarted(room)).toBe(true);
  });

  it("shows the host the guest's name and avatar while the request is pending", async () => {
    const room = createRoom();
    await seatHostAndGuest(room);

    expect(room.state.players[1]).toMatchObject({
      displayName: "Challenger",
      avatarId: "garurumon",
      sessionId: "guest",
    });
  });

  it("ignores answers from anyone but the host", async () => {
    const room = createRoom();
    const { guest } = await seatHostAndGuest(room);

    answer(room, guest, guest.sessionId, true);
    answer(room, guest, guest.sessionId, false);

    expect(room.state.guestApproval).toBe(GuestApproval.PENDING.value);
    expect(guest.leave).not.toHaveBeenCalled();
    expect(hasMatchStarted(room)).toBe(false);
  });

  it("ignores an answer that names a different guest than the one seated", async () => {
    const room = createRoom();
    const { host, guest } = await seatHostAndGuest(room);

    answer(room, host, "earlier-guest", true);
    sendMessage(room, host, GUEST_APPROVAL_CHANNEL, { guestSessionId: guest.sessionId, accept: "yes" });

    expect(room.state.guestApproval).toBe(GuestApproval.PENDING.value);
    expect(hasMatchStarted(room)).toBe(false);
  });

  it("does not start the pending match when the ready timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      const room = createRoom();
      await seatHostAndGuest(room);

      vi.advanceTimersByTime(120_000);
      room.clock.tick();

      expect(hasMatchStarted(room)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes a declined guest and frees the seat for the next challenger", async () => {
    const room = createRoom();
    const { host, guest } = await seatHostAndGuest(room);

    answer(room, host, guest.sessionId, false);
    expect(guest.leave).toHaveBeenCalledWith(GUEST_DECLINED_CLOSE_CODE);
    room.clients.splice(room.clients.indexOf(guest), 1);
    await room.onLeave(guest, GUEST_DECLINED_CLOSE_CODE);

    expect(room.state.guestApproval).toBe(GuestApproval.AWAITING_GUEST.value);
    expect(room.unlock).toHaveBeenCalled();

    const next = createClient("next-guest");
    expect(await join(room, next, guestOptions(room, "Next challenger"))).toBe(true);
    sendMessage(room, next, "ready", {});
    expect(room.state.guestApproval).toBe(GuestApproval.PENDING.value);
    expect(room.state.players[1]?.displayName).toBe("Next challenger");

    answer(room, host, next.sessionId, true);
    expect(hasMatchStarted(room)).toBe(true);
  });

  it("refuses a second join attempt while a guest is pending", async () => {
    const room = createRoom();
    await seatHostAndGuest(room);

    expect(await room.onAuth(createClient("third"), guestOptions(room, "Third"))).toBe(false);
  });

  it("refuses a declined account that tries to join again", async () => {
    const challenger = { id: "acct-guest", displayName: "Challenger" };
    const room = createRoom({ tickets: { "ticket-1": challenger, "ticket-2": challenger } });
    const host = createClient("host");
    await join(room, host, hostOptions());
    const guest = createClient("guest");
    await join(room, guest, { ...guestOptions(room), authTicket: "ticket-1" });

    answer(room, host, guest.sessionId, false);
    room.clients.splice(room.clients.indexOf(guest), 1);
    await room.onLeave(guest, GUEST_DECLINED_CLOSE_CODE);

    expect(await room.onAuth(createClient("guest-again"), { ...guestOptions(room), authTicket: "ticket-2" })).toBe(
      false,
    );
  });

  it("returns to waiting when the pending guest leaves", async () => {
    const room = createRoom();
    const { host, guest } = await seatHostAndGuest(room);

    room.clients.splice(room.clients.indexOf(guest), 1);
    await room.onLeave(guest, CloseCode.CONSENTED);

    expect(room.state.guestApproval).toBe(GuestApproval.AWAITING_GUEST.value);
    answer(room, host, guest.sessionId, true);
    expect(hasMatchStarted(room)).toBe(false);
  });

  it("closes the room for the guest when the host leaves before the match starts", async () => {
    const room = createRoom();
    const { host } = await seatHostAndGuest(room);

    room.clients.splice(room.clients.indexOf(host), 1);
    await room.onLeave(host, CloseCode.CONSENTED);

    expect(room.disconnect).toHaveBeenCalledWith(HOST_LEFT_CLOSE_CODE);
    expect(hasMatchStarted(room)).toBe(false);
  });

  it("keeps the request pending across a guest reconnect and starts after acceptance", async () => {
    const room = createRoom();
    const { host, guest } = await seatHostAndGuest(room);
    const reconnected = createClient(guest.sessionId);
    room.allowReconnection = vi.fn<() => Promise<Client>>(
      async () => reconnected,
    ) as unknown as AegisRoom["allowReconnection"];

    room.clients.splice(room.clients.indexOf(guest), 1);
    await room.onLeave(guest, CloseCode.ABNORMAL_CLOSURE);
    room.clients.push(reconnected);

    expect(room.state.guestApproval).toBe(GuestApproval.PENDING.value);
    answer(room, host, guest.sessionId, true);
    expect(hasMatchStarted(room)).toBe(true);
  });

  it("releases a disconnected guest's seat at once when the host declines", async () => {
    const room = createRoom();
    const { host, guest } = await seatHostAndGuest(room);
    room.allowReconnection = vi.fn<() => ReconnectionDeferred>(() => {
      let settle!: Pick<ReconnectionDeferred, "resolve" | "reject">;
      const pending = new Promise<Client>((resolve, reject) => {
        settle = { resolve, reject };
      }) as ReconnectionDeferred;
      pending.resolve = settle.resolve;
      pending.reject = settle.reject;
      return pending;
    }) as unknown as AegisRoom["allowReconnection"];

    room.clients.splice(room.clients.indexOf(guest), 1);
    const leaving = room.onLeave(guest, CloseCode.ABNORMAL_CLOSURE);
    await vi.waitFor(() => expect(room.allowReconnection).toHaveBeenCalled());
    answer(room, host, guest.sessionId, false);
    await leaving;

    expect(room.state.guestApproval).toBe(GuestApproval.AWAITING_GUEST.value);
    expect(room.unlock).toHaveBeenCalled();
  });

  it("keeps the host's pending request across a host reconnect", async () => {
    const room = createRoom();
    const { host, guest } = await seatHostAndGuest(room);
    const reconnected = createClient(host.sessionId);
    room.allowReconnection = vi.fn<() => Promise<Client>>(
      async () => reconnected,
    ) as unknown as AegisRoom["allowReconnection"];

    room.clients.splice(room.clients.indexOf(host), 1);
    await room.onLeave(host, CloseCode.ABNORMAL_CLOSURE);
    room.clients.push(reconnected);

    expect(room.disconnect).not.toHaveBeenCalled();
    answer(room, reconnected, guest.sessionId, true);
    expect(hasMatchStarted(room)).toBe(true);
  });
});
