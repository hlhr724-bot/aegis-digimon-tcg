import { gzipSync } from "node:zlib";
import { FriendReplayStore } from "#api/replays/FriendReplayStore";
import { REPLAY_FORMAT_VERSION } from "@aegis/shared/replays";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { FriendStore } from "#api/friends/FriendStore";
import { BlockStore } from "#api/blocks/BlockStore";
import { DirectMessageStore } from "#api/messages/DirectMessageStore";
import { runMigrations } from "#api/db/migrator";
import { migrations } from "#api/db/migrations/index";

const schema = `social_${randomUUID().replaceAll("-", "")}`;
describe.skipIf(process.env.POSTGRES_TESTS !== "1")("social migration and concurrent message authorization", () => {
  let admin: Pool;
  let accounts: AccountStore;
  let other: AccountStore;
  beforeAll(async () => {
    const connectionString = process.env.POSTGRES_TEST_URL;
    if (!connectionString) {
      throw new Error("POSTGRES_TEST_URL required");
    }
    admin = new Pool({ connectionString });
    await admin.query(`CREATE SCHEMA ${schema}`);
    accounts = new AccountStore(new Pool({ connectionString, options: `-c search_path=${schema}` }));
    other = new AccountStore(new Pool({ connectionString, options: `-c search_path=${schema}` }));
    await runMigrations(
      accounts.pool,
      migrations.filter((migration) => migration.id < "042"),
    );
  });
  afterAll(async () => {
    await accounts?.close();
    await other?.close();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });
  it("preserves existing private and public replay metadata while enabling spectator and friend values", async () => {
    const accountId = randomUUID();
    const replayId = randomUUID();
    await accounts.pool.query("INSERT INTO accounts (id,display_name,created_at) VALUES ($1,'Migration owner',1)", [
      accountId,
    ]);
    await accounts.pool.query(
      "INSERT INTO account_replays (id,account_id,match_id,viewer_seat,summary,byte_size,created_at,drive_file_id,saved_at,visibility) VALUES ($1,$2,'existing',0,'{}',1,1,'drive-file-123',2,'public')",
      [replayId, accountId],
    );
    await accounts.ensureReady();
    expect(
      (
        await accounts.pool.query("SELECT visibility,drive_file_id,viewer_seat FROM account_replays WHERE id=$1", [
          replayId,
        ])
      ).rows,
    ).toEqual([{ visibility: "public", drive_file_id: "drive-file-123", viewer_seat: 0 }]);
    await accounts.pool.query("UPDATE account_replays SET viewer_seat=-1,visibility='friends' WHERE id=$1", [replayId]);
    expect(
      (await accounts.pool.query("SELECT viewer_seat,visibility FROM account_replays WHERE id=$1", [replayId])).rows,
    ).toEqual([{ viewer_seat: -1, visibility: "friends" }]);
  });
  it("allows only one concurrent send across processes and revokes sending when a block commits", async () => {
    const sender = await accounts.accountForIdentity("email", "sender@test.invalid", "Sender");
    const recipient = await accounts.accountForIdentity("email", "recipient@test.invalid", "Recipient");
    const friends = new FriendStore(accounts);
    await friends.request({ accountId: sender.id, displayName: recipient.displayName });
    await friends.accept({ accountId: recipient.id, otherId: sender.id });
    const first = new DirectMessageStore(accounts);
    const second = new DirectMessageStore(other);
    const results = await Promise.all([
      first.send({ accountId: sender.id, friendId: recipient.id, body: "First" }),
      second.send({ accountId: sender.id, friendId: recipient.id, body: "Second" }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await new BlockStore(other).block({ accountId: recipient.id, otherId: sender.id });
    expect(await first.send({ accountId: sender.id, friendId: recipient.id, body: "After block" })).toBeUndefined();
    expect(await first.list({ accountId: sender.id, friendId: recipient.id })).toBeUndefined();
  });
  it("serializes protected replay quotas and rolls back files when visibility updates fail", async () => {
    const owner = await accounts.accountForIdentity("email", "quota@test.invalid", "Quota owner");
    const firstId = randomUUID();
    const secondId = randomUUID();
    const archive = gzipSync(
      JSON.stringify({ format: "aegis-replay", version: REPLAY_FORMAT_VERSION, id: "quota-match", viewerSeat: -1 }),
    );
    for (const id of [firstId, secondId]) {
      await accounts.pool.query(
        "INSERT INTO account_replays (id,account_id,match_id,viewer_seat,summary,byte_size,created_at,drive_file_id,saved_at) VALUES ($1,$2,$3,-1,'{}',1,1,'drive-file-123',2)",
        [id, owner.id, id === firstId ? "quota-match" : "other-match"],
      );
    }
    const remaining = 128 * 1024 * 1024 - archive.length;
    for (let index = 0; index < 4; index++) {
      const id = randomUUID();
      await accounts.pool.query(
        "INSERT INTO account_replays (id,account_id,match_id,viewer_seat,summary,byte_size,created_at,drive_file_id,saved_at) VALUES ($1,$2,$3,0,'{}',1,1,'drive-file-123',2)",
        [id, owner.id, id],
      );
      await accounts.pool.query(
        "INSERT INTO friend_replay_files (replay_id,account_id,archive,byte_size,created_at) VALUES ($1,$2,'\\x', $3,1)",
        [id, owner.id, Math.floor(remaining / 4) + (index < remaining % 4 ? 1 : 0)],
      );
    }
    const secondArchive = gzipSync(
      JSON.stringify({ format: "aegis-replay", version: REPLAY_FORMAT_VERSION, id: "other-match", viewerSeat: -1 }),
    );
    const results = await Promise.all([
      new FriendReplayStore(accounts).save({ accountId: owner.id, replayId: firstId, archive }),
      new FriendReplayStore(other).save({ accountId: owner.id, replayId: secondId, archive: secondArchive }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      Number(
        (
          await accounts.pool.query("SELECT sum(byte_size) AS total FROM friend_replay_files WHERE account_id=$1", [
            owner.id,
          ])
        ).rows[0].total,
      ),
    ).toBeLessThanOrEqual(128 * 1024 * 1024);
    const cleanOwner = await accounts.accountForIdentity("email", "rollback@test.invalid", "Rollback owner");
    const replayId = randomUUID();
    await accounts.pool.query(
      "INSERT INTO account_replays (id,account_id,match_id,viewer_seat,summary,byte_size,created_at,drive_file_id,saved_at) VALUES ($1,$2,'quota-match',-1,'{}',1,1,'drive-file-123',2)",
      [replayId, cleanOwner.id],
    );
    await accounts.pool.query(
      "ALTER TABLE account_replays ADD CONSTRAINT refuse_friend_copy CHECK (visibility <> 'friends' OR account_id <> '" +
        cleanOwner.id +
        "')",
    );
    await expect(new FriendReplayStore(accounts).save({ accountId: cleanOwner.id, replayId, archive })).rejects.toThrow(
      "refuse_friend_copy",
    );
    expect(
      (await accounts.pool.query("SELECT * FROM friend_replay_files WHERE replay_id=$1", [replayId])).rows,
    ).toEqual([]);
  });
});
