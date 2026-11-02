import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountStore, type Account } from "#api/accounts/AccountStore";
import { FriendStore } from "#api/friends/FriendStore";
import { BlockStore } from "#api/blocks/BlockStore";

const enabled = process.env.POSTGRES_TESTS === "1";
const connection = process.env.POSTGRES_TEST_URL;
const schema = `friends_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(!enabled)("friend transaction atomicity across connections", () => {
  let admin: Pool;
  let accounts: AccountStore;
  let otherAccounts: AccountStore;
  let friends: FriendStore;
  let otherFriends: FriendStore;
  let blocks: BlockStore;
  let first: Account;
  let second: Account;
  let third: Account;

  beforeAll(async () => {
    if (!connection) {
      throw new Error("POSTGRES_TEST_URL required");
    }
    admin = new Pool({ connectionString: connection });
    await admin.query(`CREATE SCHEMA ${schema}`);
    accounts = new AccountStore(new Pool({ connectionString: connection, options: `-c search_path=${schema}` }));
    otherAccounts = new AccountStore(new Pool({ connectionString: connection, options: `-c search_path=${schema}` }));
    await accounts.ensureReady();
    first = await accounts.accountForIdentity("email", "first@test.invalid", "First Player");
    second = await accounts.accountForIdentity("email", "second@test.invalid", "Second Player");
    third = await accounts.accountForIdentity("email", "third@test.invalid", "Third Player");
    friends = new FriendStore(accounts);
    otherFriends = new FriendStore(otherAccounts);
    blocks = new BlockStore(otherAccounts);
  });
  beforeEach(async () => {
    await accounts.pool.query("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS reject_social");
    await accounts.pool.query("TRUNCATE friend_requests,friendships,account_blocks,notifications");
  });
  afterAll(async () => {
    await Promise.all([accounts?.close(), otherAccounts?.close()]);
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("rolls back a request when its notification fails", async () => {
    await accounts.pool.query(
      "ALTER TABLE notifications ADD CONSTRAINT reject_social CHECK (kind <> 'friend_request')",
    );
    await expect(friends.request({ accountId: first.id, displayName: second.displayName })).rejects.toThrow(
      "reject_social",
    );
    expect(await friends.listRequests(first.id)).toEqual([]);
    expect((await accounts.pool.query("SELECT * FROM notifications")).rows).toEqual([]);
  });

  it("rolls back both friendship rows and keeps the request when acceptance notification fails", async () => {
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await accounts.pool.query(
      "ALTER TABLE notifications ADD CONSTRAINT reject_social CHECK (kind <> 'friend_accepted')",
    );
    await expect(otherFriends.accept({ accountId: second.id, otherId: first.id })).rejects.toThrow("reject_social");
    expect(await friends.list(first.id)).toEqual([]);
    expect(await friends.list(second.id)).toEqual([]);
    expect(await friends.listRequests(first.id)).toHaveLength(1);
    expect((await accounts.pool.query("SELECT kind FROM notifications")).rows).toEqual([{ kind: "friend_request" }]);
  });

  it("serializes simultaneous reversed requests into exactly one friendship", async () => {
    await Promise.all([
      friends.request({ accountId: first.id, displayName: second.displayName }),
      otherFriends.request({ accountId: second.id, displayName: first.displayName }),
    ]);
    expect(await friends.list(first.id)).toHaveLength(1);
    expect(await friends.list(second.id)).toHaveLength(1);
    expect(await friends.listRequests(first.id)).toEqual([]);
    expect((await accounts.pool.query("SELECT kind FROM notifications ORDER BY id")).rows).toEqual([
      { kind: "friend_accepted" },
    ]);
  });

  it("serializes blocking against acceptance and leaves no friendship or pending request", async () => {
    await friends.request({ accountId: first.id, displayName: second.displayName });
    await Promise.all([
      friends.accept({ accountId: second.id, otherId: first.id }),
      blocks.block({ accountId: first.id, otherId: second.id }),
    ]);
    expect(await friends.list(first.id)).toEqual([]);
    expect(await friends.list(second.id)).toEqual([]);
    expect(await friends.listRequests(first.id)).toEqual([]);
    expect(await friends.request({ accountId: second.id, displayName: first.displayName })).toEqual({
      error: "blocked",
    });
  });

  it("does not exceed the last friendship slot under concurrent acceptances", async () => {
    await accounts.pool.query(
      "INSERT INTO accounts (id,display_name,created_at) SELECT gen_random_uuid(),'Existing ' || n,1 FROM generate_series(1,199) n ON CONFLICT DO NOTHING",
    );
    await accounts.pool.query(
      "INSERT INTO friendships SELECT $1,id,1 FROM accounts WHERE display_name LIKE 'Existing %'",
      [first.id],
    );
    await friends.request({ accountId: second.id, displayName: first.displayName });
    await friends.request({ accountId: third.id, displayName: first.displayName });
    const results = await Promise.all([
      friends.accept({ accountId: first.id, otherId: second.id }),
      otherFriends.accept({ accountId: first.id, otherId: third.id }),
    ]);
    expect(results).toContainEqual({ accepted: true });
    expect(results).toContainEqual({ error: "limit_reached" });
    expect(await friends.list(first.id)).toHaveLength(200);
  });

  it("does not exceed the outgoing request limit across connections", async () => {
    await accounts.pool.query(
      "INSERT INTO accounts (id,display_name,created_at) SELECT gen_random_uuid(),'Pending ' || n,1 FROM generate_series(1,49) n ON CONFLICT DO NOTHING",
    );
    await accounts.pool.query(
      "INSERT INTO friend_requests SELECT $1,id,1 FROM accounts WHERE display_name LIKE 'Pending %'",
      [first.id],
    );
    const results = await Promise.all([
      friends.request({ accountId: first.id, displayName: second.displayName }),
      otherFriends.request({ accountId: first.id, displayName: third.displayName }),
    ]);
    expect(results).toContainEqual({ accepted: false });
    expect(results).toContainEqual({ error: "limit_reached" });
    expect(await friends.listRequests(first.id)).toHaveLength(50);
  });
});
