import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { ProviderSnapshotReader } from "#api/deckProviders/ProviderSnapshotReader";
import { ProviderClient } from "#api/deckProviders/ProviderClient";
import { runProviderSync } from "#api/deckProviders/runProviderSync";

const enabled = process.env.POSTGRES_TESTS === "1";
const connection = process.env.POSTGRES_TEST_URL;
const schema = `provider_${randomUUID().replace(/-/g, "")}`;
if (enabled && !connection) {
  throw new Error("POSTGRES_TEST_URL required");
}

describe.skipIf(!enabled)("provider caching and weekly extraction across replicas", () => {
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
    await first.pool.query("TRUNCATE deck_provider_cache, deck_provider_sync_runs, deck_provider_snapshots");
  });
  afterAll(async () => {
    await Promise.all([first?.close(), second?.close()]);
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });
  it("serves weekly data without credentials and never fetches missing snapshots", async () => {
    const reader = new ProviderSnapshotReader({ store: first, providerId: "digilab" });
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden"));
    try {
      await first.pool.query(
        "INSERT INTO deck_provider_snapshots (provider,key,body,collected_at) VALUES ($1,$2,$3,$4)",
        ["digilab", "meta", JSON.stringify({ data: [] }), Date.now() - 9 * 86_400_000],
      );
      expect(await reader.get("meta")).toMatchObject({ data: [], providerDataStale: true });
      await expect(reader.get("missing")).rejects.toMatchObject({ status: 503 });
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
    }
  });
  it("keeps the published collection intact when a later collection request fails", async () => {
    const path = "meta?page=1&per_page=20&sort=entries&sort_dir=desc";
    await first.pool.query(
      "INSERT INTO deck_provider_snapshots (provider,key,body,collected_at) VALUES ($1,$2,$3,$4)",
      ["digilab", path, JSON.stringify({ marker: "previous" }), 123],
    );
    const get = vi
      .fn<(path: string) => Promise<unknown>>()
      .mockResolvedValueOnce({ data: [], pagination: { page: 1, total_pages: 1 }, formats: [{ format: "EX13" }] })
      .mockRejectedValueOnce(new Error("offline"));
    await expect(runProviderSync({ store: first, providerId: "digilab", client: { get } })).rejects.toThrow("offline");
    expect((await first.pool.query("SELECT body FROM deck_provider_snapshots")).rows).toEqual([
      { body: { marker: "previous" } },
    ]);
  });
  it("deduplicates concurrent upstream reads and refreshes expired data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ value: 1 }));
    const a = new ProviderClient({ store: first, providerId: "digilab", apiKey: "test-key", fetcher });
    const b = new ProviderClient({ store: second, providerId: "digilab", apiKey: "test-key", fetcher });
    expect(await Promise.all([a.get("meta"), b.get("meta"), a.get("meta")])).toMatchObject([
      { value: 1 },
      { value: 1 },
      { value: 1 },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await first.pool.query("UPDATE deck_provider_cache SET expires_at=0 WHERE key=$1", ["digilab:meta"]);
    await b.get("meta");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shares upstream cooldowns and refuses requests without a configured key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": "45" } }));
    const a = new ProviderClient({ store: first, providerId: "digilab", apiKey: "test-key", fetcher });
    const b = new ProviderClient({ store: second, providerId: "digilab", apiKey: "test-key", fetcher });
    await expect(a.get("meta")).rejects.toMatchObject({ status: 503, retryAfter: 45 });
    await expect(b.get("decklists")).rejects.toMatchObject({ status: 429 });
    await expect(
      new ProviderClient({ store: second, providerId: "digilab", fetcher }).get("meta"),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("counts failed outbound requests and serves bounded snapshots with freshness", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
    const client = new ProviderClient({ store: first, providerId: "digilab", apiKey: "test-key", fetcher });
    await expect(client.get("meta")).rejects.toMatchObject({ status: 503 });
    expect((await first.pool.query("SELECT body FROM deck_provider_cache WHERE key='budget'")).rows[0].body).toBe(1);
    fetcher.mockResolvedValue(new Response("not json"));
    await expect(client.get("meta")).rejects.toMatchObject({ status: 503 });
    expect((await first.pool.query("SELECT body FROM deck_provider_cache WHERE key='budget'")).rows[0].body).toBe(2);
    await first.pool.query(
      "INSERT INTO deck_provider_snapshots (provider,key,body,collected_at) VALUES ($1,$2,$3,$4)",
      ["digilab", "meta", JSON.stringify({ value: "weekly" }), Date.now()],
    );
    expect(await client.get("meta")).toMatchObject({ value: "weekly", providerDataStale: true });
    await first.pool.query("UPDATE deck_provider_snapshots SET collected_at=0");
    await expect(client.get("meta")).rejects.toMatchObject({ status: 503 });
  });
  it("persists a weekly snapshot once across concurrent replicas", async () => {
    const get = vi.fn<() => Promise<unknown>>(async () => ({
      data: [],
      pagination: { page: 1, total_pages: 0 },
      formats: [{ format: "EX13" }],
    }));
    const now = new Date("2026-10-18T06:00:00Z");
    const results = await Promise.all([
      runProviderSync({ store: first, client: { get }, providerId: "digilab", now }),
      runProviderSync({ store: second, client: { get }, providerId: "digilab", now }),
    ]);
    expect(results.sort()).toEqual([0, 3]);
    expect(get).toHaveBeenCalledTimes(3);
    expect((await first.pool.query("SELECT * FROM deck_provider_snapshots")).rows).toHaveLength(3);
    expect(await runProviderSync({ store: second, client: { get }, providerId: "digilab", now })).toBe(0);
  });
  it("retains failed runs for hourly retry and releases the collector lock", async () => {
    const now = new Date();
    await expect(
      runProviderSync({
        store: first,
        client: {
          get: async () => {
            throw new Error("offline");
          },
        },
        providerId: "digilab",
        now,
      }),
    ).rejects.toThrow("offline");
    const get = vi.fn<() => Promise<unknown>>(async () => ({
      data: [],
      pagination: { page: 1, total_pages: 0 },
      formats: [{ format: "EX13" }],
    }));
    expect(await runProviderSync({ store: second, client: { get }, providerId: "digilab", now })).toBe(0);
    expect(get).not.toHaveBeenCalled();
    await first.pool.query("UPDATE deck_provider_sync_runs SET attempted_at=0");
    expect(await runProviderSync({ store: second, client: { get }, providerId: "digilab", now })).toBe(3);
  });
  it("does not republish stale snapshots as a successful weekly collection", async () => {
    const collectedAt = Date.now() - 86_400_000;
    await first.pool.query(
      "INSERT INTO deck_provider_snapshots (provider,key,body,collected_at) VALUES ($1,$2,$3,$4)",
      ["digilab", "meta?page=1&per_page=20&sort=entries&sort_dir=desc", JSON.stringify({ data: [] }), collectedAt],
    );
    await expect(
      runProviderSync({
        store: first,
        providerId: "digilab",
        client: { get: async () => ({ data: [], providerDataStale: true }) },
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      Number((await first.pool.query("SELECT collected_at FROM deck_provider_snapshots")).rows[0].collected_at),
    ).toBe(collectedAt);
    expect(
      (await first.pool.query("SELECT completed_at FROM deck_provider_sync_runs")).rows[0].completed_at,
    ).toBeNull();
  });
  it("collects every released format with browsing lists, archetypes and full card lists", async () => {
    const get = vi.fn<(path: string) => Promise<unknown>>(async (path) => {
      if (path.startsWith("decklist/")) {
        return { result_id: 12, decklist: null };
      }
      if (path.startsWith("decklists")) {
        return { data: [{ result_id: 12 }], pagination: { page: 1, total_pages: 1 } };
      }
      return {
        data: [{ archetype_id: 1, meta_pct: 10 }],
        pagination: { page: 1, total_pages: 1 },
        formats: [
          { format: "EX13", release_date: "2026-01-01" },
          { format: "BT1", release_date: "2020-01-01" },
          { format: "BT99", release_date: "2099-01-01" },
        ],
      };
    });
    expect(await runProviderSync({ store: first, client: { get }, providerId: "digilab" })).toBe(9);
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "meta?page=1&per_page=20&sort=entries&sort_dir=desc",
      "meta?page=1&per_page=25&format=EX13&sort=entries&sort_dir=desc",
      "decklists?page=1&per_page=20&format=EX13&sort=date&sort_dir=desc",
      "decklists?page=1&per_page=3&format=EX13&archetype_id=1&sort=date&sort_dir=desc",
      "decklist/12",
      "meta?page=1&per_page=25&format=BT1&sort=entries&sort_dir=desc",
      "decklists?page=1&per_page=20&format=BT1&sort=date&sort_dir=desc",
      "decklists?page=1&per_page=3&format=BT1&archetype_id=1&sort=date&sort_dir=desc",
      "decklist/12",
    ]);
    expect(
      (await first.pool.query("SELECT collected_count FROM deck_provider_sync_runs")).rows[0].collected_count,
    ).toBe(9);
  }, 15_000);
});
