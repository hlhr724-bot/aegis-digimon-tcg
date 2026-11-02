import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";

const enabled = process.env.POSTGRES_TESTS === "1";
const connection = process.env.POSTGRES_TEST_URL;
const schema = `magic_limits_${randomUUID().replace(/-/g, "")}`;

if (enabled && !connection) throw new Error("POSTGRES_TESTS=1 requires POSTGRES_TEST_URL");

describe.skipIf(!enabled)("shared magic link limits under concurrent requests", () => {
  let admin: Pool;
  let first: AccountStore;
  let second: AccountStore;

  beforeAll(async () => {
    admin = new Pool({ connectionString: connection });
    await admin.query(`CREATE SCHEMA ${schema}`);
    first = new AccountStore(new Pool({ connectionString: connection, options: `-c search_path=${schema}` }));
    second = new AccountStore(new Pool({ connectionString: connection, options: `-c search_path=${schema}` }));
    await Promise.all([first.ensureReady(), second.ensureReady()]);
  });

  beforeEach(async () => {
    await first.pool.query("TRUNCATE magic_link_request_limits");
  });

  afterAll(async () => {
    await Promise.all([first?.close(), second?.close()]);
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("admits at most three concurrent requests to the same recipient across replicas", async () => {
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, attempt) =>
        (attempt % 2 === 0 ? first : second).allowMagicLinkRequest({
          ip: `caller-${attempt}`,
          email: "shared@example.com",
          now,
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("admits at most ten concurrent recipients from one caller across replicas", async () => {
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, attempt) =>
        (attempt % 2 === 0 ? first : second).allowMagicLinkRequest({
          ip: "shared-caller",
          email: `recipient-${attempt}@example.com`,
          now,
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(10);
  });

  it("resets the short recipient window while preserving the daily limit across replicas", async () => {
    const initial = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        await first.allowMagicLinkRequest({
          ip: `initial-caller-${attempt}`,
          email: "shared@example.com",
          now: initial,
        }),
      ).toBe(true);
    }
    const now = initial + 900_000;
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, attempt) =>
        (attempt % 2 === 0 ? first : second).allowMagicLinkRequest({
          ip: `next-caller-${attempt}`,
          email: "shared@example.com",
          now,
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(2);
  });
});
