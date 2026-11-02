import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountStore, ROOM_TICKET_RETENTION_MS } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

afterEach(() => vi.restoreAllMocks());

async function insertTicket(store: AccountStore, tokenHash: string, accountId: string, expiresAt: number) {
  await store.pool.query("INSERT INTO room_tickets (token_hash, account_id, expires_at) VALUES ($1,$2,$3)", [
    tokenHash,
    accountId,
    expiresAt,
  ]);
}

async function storedTicketHashes(store: AccountStore): Promise<string[]> {
  const { rows } = await store.pool.query<{ token_hash: string }>(
    "SELECT token_hash FROM room_tickets ORDER BY token_hash",
  );
  return rows.map((row) => row.token_hash);
}

describe("room ticket cleanup", () => {
  it("deletes tickets expired past retention and keeps recent ones", async () => {
    const store = new AccountStore(createMemoryPool());
    const account = await store.accountForIdentity("discord", "1", "One");
    const now = 10 * ROOM_TICKET_RETENTION_MS;
    vi.spyOn(Date, "now").mockReturnValue(now);
    await insertTicket(store, "stale", account.id, now - ROOM_TICKET_RETENTION_MS - 1);
    await insertTicket(store, "recent", account.id, now - ROOM_TICKET_RETENTION_MS + 1);

    const token = await store.createRoomTicket(account.id);

    expect(await storedTicketHashes(store)).not.toContain("stale");
    expect(await storedTicketHashes(store)).toContain("recent");
    expect((await store.consumeRoomTicket(token))?.account.id).toBe(account.id);
    await store.close();
  });

  it("runs the cleanup at most once per hour", async () => {
    const store = new AccountStore(createMemoryPool());
    const account = await store.accountForIdentity("discord", "1", "One");
    const clock = vi.spyOn(Date, "now").mockReturnValue(10 * ROOM_TICKET_RETENTION_MS);
    await store.createRoomTicket(account.id);
    await insertTicket(store, "stale", account.id, 0);

    clock.mockReturnValue(10 * ROOM_TICKET_RETENTION_MS + 60_000);
    await store.createRoomTicket(account.id);
    expect(await storedTicketHashes(store)).toContain("stale");

    clock.mockReturnValue(10 * ROOM_TICKET_RETENTION_MS + 60 * 60 * 1000);
    await store.createRoomTicket(account.id);
    expect(await storedTicketHashes(store)).not.toContain("stale");
    await store.close();
  });
});
