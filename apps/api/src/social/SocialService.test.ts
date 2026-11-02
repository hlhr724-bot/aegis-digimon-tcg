import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalPresence, type Client, type Presence } from "colyseus";
import { AccountStore, type Account } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { FriendStore } from "#api/friends/FriendStore";
import { BlockStore } from "#api/blocks/BlockStore";
import { SocialService } from "#api/social/SocialService";
import { SocialRoom } from "#api/social/SocialRoom";

let accounts: AccountStore;
let first: Account;
let second: Account;
let stranger: Account;
let presence: LocalPresence;
let service: SocialService;
let now: number;
let roomOpen: boolean;
const privateCode = "ABCDEF";

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  first = await accounts.accountForIdentity("email", "first@test.invalid", "First Tamer");
  second = await accounts.accountForIdentity("email", "second@test.invalid", "Second Tamer");
  stranger = await accounts.accountForIdentity("email", "stranger@test.invalid", "Stranger");
  await new FriendStore(accounts).request({ accountId: first.id, displayName: second.displayName });
  await new FriendStore(accounts).accept({ accountId: second.id, otherId: first.id });
  presence = new LocalPresence();
  now = 100_000;
  roomOpen = true;
  service = new SocialService({
    accounts,
    presence,
    now: () => now,
    resolveRoom: async (code) => (code === privateCode ? { waiting: roomOpen, hostAccountId: first.id } : undefined),
  });
});
afterEach(async () => {
  await presence.shutdown();
  await accounts.close();
});

describe("social presence and invitations", () => {
  it("keeps multiple sessions online and lets match presence override the online lease", async () => {
    await service.writePresence({ accountId: first.id, connectionId: "tab-one", status: "online" });
    await service.writePresence({ accountId: first.id, connectionId: "tab-two", status: "online" });
    await service.writePresence({ accountId: first.id, connectionId: "game", status: "in_match" });
    expect(await service.readPresence(first.id)).toEqual({ accountId: first.id, status: "in_match" });
    await service.deletePresence({ accountId: first.id, connectionId: "game" });
    await service.deletePresence({ accountId: first.id, connectionId: "tab-one" });
    expect(await service.readPresence(first.id)).toEqual({ accountId: first.id, status: "online" });
    now += 46_000;
    expect(await service.readPresence(first.id)).toEqual({ accountId: first.id, status: null });
  });

  it("fans presence out across two social room instances sharing the cluster backbone", async () => {
    const rooms: SocialRoom[] = [];
    class TestSocialRoom extends SocialRoom {
      protected override createSocialService(): SocialService {
        return service;
      }
    }
    function createRoom(id: string) {
      const room = new TestSocialRoom();
      const processPresence = new Proxy(presence, {
        get(target, property) {
          const value: unknown = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Presence;
      Object.defineProperty(room, "presence", { value: processPresence });
      room.roomId = id;
      room.onCreate();
      rooms.push(room);
      return room;
    }
    function createClient(sessionId: string, accountId: string) {
      return {
        sessionId,
        auth: { accountId },
        send: vi.fn<(channel: string, message: unknown) => void>(),
      } as unknown as Client;
    }
    const firstRoom = createRoom("process-one");
    const secondRoom = createRoom("process-two");
    const firstClient = createClient("first", first.id);
    const secondClient = createClient("second", second.id);
    firstRoom.clients.push(firstClient);
    secondRoom.clients.push(secondClient);
    try {
      await firstRoom.onJoin(firstClient);
      await secondRoom.onJoin(secondClient);
      await service.writePresence({ accountId: first.id, connectionId: "game", status: "in_match" });
      await vi.waitFor(() =>
        expect(secondClient.send).toHaveBeenCalledWith("social", {
          kind: "presenceChanged",
          presence: { accountId: first.id, status: "in_match" },
        }),
      );
      await firstRoom.onLeave(firstClient);
      expect(await service.readPresence(first.id)).toEqual({ accountId: first.id, status: "in_match" });
      await service.deletePresence({ accountId: first.id, connectionId: "game" });
      await vi.waitFor(() =>
        expect(secondClient.send).toHaveBeenCalledWith("social", {
          kind: "presenceChanged",
          presence: { accountId: first.id, status: null },
        }),
      );
    } finally {
      for (const room of rooms) {
        room.clock.clear();
        await room.onDispose();
      }
    }
  });

  it("accepts room tickets once and rejects tournament tickets and anonymous clients", async () => {
    class TestSocialRoom extends SocialRoom {
      protected override createSocialService(): SocialService {
        return service;
      }
    }
    const room = new TestSocialRoom();
    Object.defineProperty(room, "presence", { value: presence });
    room.onCreate();
    const client = { sessionId: "auth-client" } as Client;
    try {
      expect(await room.onAuth(client, {})).toBe(false);
      const ticket = await accounts.createRoomTicket(first.id);
      expect(await room.onAuth(client, { authTicket: ticket })).toEqual({ accountId: first.id });
      expect(await room.onAuth(client, { authTicket: ticket })).toBe(false);
    } finally {
      room.clock.clear();
      await room.onDispose();
    }
  });

  it("rejects invites from non-hosts, strangers, blocked friends, and closed rooms", async () => {
    expect(await service.invite({ senderId: second.id, recipientId: first.id, roomCode: privateCode })).toBeUndefined();
    expect(
      await service.invite({ senderId: first.id, recipientId: stranger.id, roomCode: privateCode }),
    ).toBeUndefined();
    roomOpen = false;
    expect(await service.invite({ senderId: first.id, recipientId: second.id, roomCode: privateCode })).toBeUndefined();
    roomOpen = true;
    await new BlockStore(accounts).block({ accountId: second.id, otherId: first.id });
    expect(await service.invite({ senderId: first.id, recipientId: second.id, roomCode: privateCode })).toBeUndefined();
  });

  it("allows only the recipient to answer once and publishes the result to both accounts", async () => {
    const sent = vi.fn<(event: unknown) => void>();
    await presence.subscribe(`social:account:${first.id}`, sent);
    const invite = (await service.invite({ senderId: first.id, recipientId: second.id, roomCode: privateCode }))!;
    expect(await service.answer({ accountId: stranger.id, inviteId: invite.id, accept: true })).toBeUndefined();
    expect(await service.answer({ accountId: first.id, inviteId: invite.id, accept: true })).toBeUndefined();
    const answers = await Promise.all([
      service.answer({ accountId: second.id, inviteId: invite.id, accept: true }),
      service.answer({ accountId: second.id, inviteId: invite.id, accept: false }),
    ]);
    expect(answers.filter(Boolean)).toHaveLength(1);
    expect(sent).toHaveBeenCalledWith({ kind: "inviteAnswered", inviteId: invite.id, accepted: true });
  });

  it("expires invites after sixty seconds, when the room closes, or when blocking removes consent", async () => {
    const sent = vi.fn<(event: unknown) => void>();
    await presence.subscribe(`social:account:${second.id}`, sent);
    const firstInvite = (await service.invite({ senderId: first.id, recipientId: second.id, roomCode: privateCode }))!;
    now += 60_000;
    expect(await service.answer({ accountId: second.id, inviteId: firstInvite.id, accept: true })).toBeUndefined();
    expect(sent).toHaveBeenCalledWith({ kind: "inviteExpired", inviteId: firstInvite.id });
    const closed = (await service.invite({ senderId: first.id, recipientId: second.id, roomCode: privateCode }))!;
    roomOpen = false;
    expect(await service.answer({ accountId: second.id, inviteId: closed.id, accept: true })).toBeUndefined();
    roomOpen = true;
    const blocked = (await service.invite({ senderId: first.id, recipientId: second.id, roomCode: privateCode }))!;
    await new BlockStore(accounts).block({ accountId: first.id, otherId: second.id });
    expect(await service.answer({ accountId: second.id, inviteId: blocked.id, accept: true })).toBeUndefined();
  });
});
