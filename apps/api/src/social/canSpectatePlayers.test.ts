import { GameState } from "@aegis/shared/schema/GameState";
import { SPECTATOR_ACCESS_REVOKED_CLOSE_CODE } from "@aegis/shared/protocol/spectatorAccessRevokedCloseCode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { AccountStore, type Account } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { FriendStore } from "#api/friends/FriendStore";
import { BlockStore } from "#api/blocks/BlockStore";
import { AegisRoom } from "#api/rooms/AegisRoom";
import type { SpectatorAccess } from "@aegis/shared/account/SpectatorAccess";

let accounts: AccountStore;
let host: Account;
let guest: Account;
let friend: Account;
let stranger: Account;
let blocked: Account;

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  const users = [];
  for (const name of ["Host", "Guest", "Friend", "Stranger", "Blocked"]) {
    users.push(await accounts.accountForIdentity("email", `${name}@test.invalid`, name));
  }
  [host, guest, friend, stranger, blocked] = users as [Account, Account, Account, Account, Account];
  const store = new FriendStore(accounts);
  for (const actor of [friend, blocked]) {
    for (const player of [host, guest]) {
      await store.request({ accountId: actor.id, displayName: player.displayName });
      await store.accept({ accountId: player.id, otherId: actor.id });
    }
  }
  await new BlockStore(accounts).block({ accountId: host.id, otherId: blocked.id });
});
afterEach(async () => accounts.close());

class SpectatorRoom extends AegisRoom {
  protected override accounts() {
    return accounts;
  }
  override spectatorInfo() {
    return { roomId: "privacy-room", players: [host.displayName, guest.displayName], spectators: 0 };
  }
}

describe("spectator authorization in onAuth", () => {
  for (const access of ["everyone", "friends", "nobody"] as const) {
    for (const role of ["friend", "stranger", "anonymous", "blocked"] as const) {
      it(`checks ${role} against every player's ${access} preference`, async () => {
        await accounts.updatePreferences(host.id, { spectatorAccess: access });
        await accounts.updatePreferences(guest.id, { spectatorAccess: access });
        const room = new SpectatorRoom();
        Object.defineProperty(room, "deckOwnerBySeat", {
          value: new Map([
            [0, host.id],
            [1, guest.id],
          ]),
        });
        const actor = { friend, stranger, blocked, anonymous: undefined }[role];
        const options = {
          spectator: true,
          roomCode: "ABCDEF",
          displayName: "Observer",
          deck: { mainDeck: [], eggDeck: [] },
          ...(actor ? { authTicket: await accounts.createRoomTicket(actor.id) } : {}),
        };
        const expected = role !== "blocked" && (access === "everyone" || (access === "friends" && role === "friend"));
        try {
          expect(await room.onAuth({ sessionId: "observer" } as Client, options)).toBe(expected);
        } finally {
          room.clock.clear();
          room.onDispose();
        }
      });
    }
  }

  it("requires friendship with both players when only one player restricts access", async () => {
    const store = new FriendStore(accounts);
    await store.request({ accountId: stranger.id, displayName: host.displayName });
    await store.accept({ accountId: host.id, otherId: stranger.id });
    const preferences: SpectatorAccess[] = ["everyone", "friends"];
    await accounts.updatePreferences(host.id, { spectatorAccess: preferences[0] });
    await accounts.updatePreferences(guest.id, { spectatorAccess: preferences[1] });
    const room = new SpectatorRoom();
    Object.defineProperty(room, "deckOwnerBySeat", {
      value: new Map([
        [0, host.id],
        [1, guest.id],
      ]),
    });
    try {
      expect(
        await room.onAuth({ sessionId: "observer" } as Client, {
          spectator: true,
          roomCode: "ABCDEF",
          displayName: "Observer",
          deck: { mainDeck: [], eggDeck: [] },
          authTicket: await accounts.createRoomTicket(stranger.id),
        }),
      ).toBe(false);
    } finally {
      room.clock.clear();
      room.onDispose();
    }
  });
  it("does not offer reconnection after access is revoked", async () => {
    const room = new SpectatorRoom();
    room.state = new GameState();
    Object.defineProperty(room, "spectatorClients", { value: new Set(["observer"]) });
    const reconnect = vi.fn<() => Promise<Client>>();
    room.allowReconnection = reconnect as unknown as SpectatorRoom["allowReconnection"];
    try {
      await room.onLeave({ sessionId: "observer" } as Client, SPECTATOR_ACCESS_REVOKED_CLOSE_CODE);
      expect(reconnect).not.toHaveBeenCalled();
    } finally {
      room.clock.clear();
      room.onDispose();
    }
  });

  it("rechecks friendship and preferences after a disconnected spectator returns", async () => {
    const room = new SpectatorRoom();
    room.state = new GameState();
    Object.defineProperty(room, "deckOwnerBySeat", {
      value: new Map([
        [0, host.id],
        [1, guest.id],
      ]),
    });
    Object.defineProperty(room, "spectatorClients", { value: new Set(["observer"]) });
    Object.defineProperty(room, "spectatorIdentities", { value: new Map([["observer", friend]]) });
    await accounts.updatePreferences(host.id, { spectatorAccess: "nobody" });
    const returned = { sessionId: "observer", leave: vi.fn<(code: number) => void>() } as unknown as Client;
    room.allowReconnection = vi.fn<() => Promise<Client>>(
      async () => returned,
    ) as unknown as SpectatorRoom["allowReconnection"];
    try {
      await room.onLeave({ sessionId: "observer" } as Client, 1006);
      expect(returned.leave).toHaveBeenCalledWith(SPECTATOR_ACCESS_REVOKED_CLOSE_CODE);
    } finally {
      room.clock.clear();
      room.onDispose();
    }
  });
});
