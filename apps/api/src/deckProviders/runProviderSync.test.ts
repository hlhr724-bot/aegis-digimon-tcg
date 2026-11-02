import type { Pool } from "pg";
import { DataType } from "pg-mem";
import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { afterEach, expect, it, vi } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { deckProviders } from "#api/db/migrations/037-deck-providers";
import { runMigrations } from "#api/db/migrator";
import { runProviderSync } from "#api/deckProviders/runProviderSync";
import { getWeeklySyncPeriod } from "#api/deckProviders/getWeeklySyncPeriod";
import { digilabProvider } from "#api/deckProviders/providers/digilab";
import { DeckProvider } from "@aegis/shared/deckProviders/DeckProvider";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }));

const stores: AccountStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  vi.restoreAllMocks();
});

async function prepare() {
  const db = createMemoryDatabase();
  for (const name of ["pg_try_advisory_lock", "pg_advisory_unlock"]) {
    db.public.registerFunction({ name, args: [DataType.integer], returns: DataType.bool, implementation: () => true });
  }
  const store = new AccountStore(new (db.adapters.createPg().Pool)() as Pool);
  stores.push(store);
  await runMigrations(store.pool, [deckProviders], async () => async () => undefined);
  vi.spyOn(store, "ensureReady").mockResolvedValue(undefined);
  return store;
}

function getResponse(path: string): unknown {
  const url = new URL(path, "https://provider.invalid/");
  const format = url.searchParams.get("format");
  const id = format === "BT26" ? 2 : 1;
  if (url.pathname.startsWith("/decklist/")) {
    return { result_id: Number(url.pathname.split("/").at(-1)), decklist: null };
  }
  return {
    data: url.pathname === "/meta" ? [{ archetype_id: id }] : [{ result_id: id }],
    pagination: { page: 1, total_pages: 1 },
    formats: [
      { format: "EX13", release_date: "2020-02-01" },
      { format: "BT26", release_date: "2020-01-01" },
      { format: "BT99", release_date: "2999-01-01" },
    ],
  };
}

it("publishes every released set even after the latest-only sync completed this week", async () => {
  const store = await prepare();
  const now = new Date();
  await store.pool.query(
    "INSERT INTO deck_provider_sync_runs (provider, period, attempted_at, completed_at) VALUES ($1,$2,$3,$3)",
    [DeckProvider.DIGILAB.value, getWeeklySyncPeriod(now), now.getTime()],
  );
  const get = vi.fn<(path: string) => Promise<unknown>>(async (path) => getResponse(path));
  const params = { store, client: { get }, providerId: DeckProvider.DIGILAB.value, now };
  expect(await runProviderSync(params)).toBe(9);
  const snapshots = await store.pool.query("SELECT key, body FROM deck_provider_snapshots");
  const seed = snapshots.rows.find((row) => row.key === digilabProvider.buildMetaPath());
  expect(seed.body.formats.map((format: { format: string }) => format.format)).toEqual(["EX13", "BT26"]);
  expect(snapshots.rows.map((row) => row.key)).toEqual(
    expect.arrayContaining([
      digilabProvider.buildMetaPath({ format: "BT26", perPage: 25 }),
      digilabProvider.buildListsPath({ format: "BT26", archetype: "2", perPage: 3 }),
      digilabProvider.buildDetailPath(2),
    ]),
  );
  expect(get.mock.calls.some(([path]) => path.includes("BT99"))).toBe(false);
  get.mockClear();
  expect(await runProviderSync(params)).toBe(0);
  expect(get).not.toHaveBeenCalled();
});

it("keeps the published catalog intact when an older set cannot be collected", async () => {
  const store = await prepare();
  const original = { formats: [{ format: "EX13" }] };
  await store.pool.query("INSERT INTO deck_provider_snapshots VALUES ($1,$2,$3,$4)", [
    DeckProvider.DIGILAB.value,
    digilabProvider.buildMetaPath(),
    JSON.stringify(original),
    Date.now(),
  ]);
  const get = vi.fn<(path: string) => Promise<unknown>>(async (path) => {
    if (path.includes("BT26")) throw new Error("provider unavailable");
    return getResponse(path);
  });
  await expect(runProviderSync({ store, client: { get }, providerId: DeckProvider.DIGILAB.value })).rejects.toThrow(
    "provider unavailable",
  );
  const snapshots = await store.pool.query("SELECT body FROM deck_provider_snapshots");
  expect(snapshots.rows).toEqual([{ body: original }]);
});
