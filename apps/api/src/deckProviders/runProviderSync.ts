import { setTimeout } from "node:timers/promises";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { ProviderClient } from "#api/deckProviders/ProviderClient";
import { getDeckProvider } from "#api/deckProviders/getDeckProvider";
import { getWeeklySyncPeriod } from "#api/deckProviders/getWeeklySyncPeriod";
import { ProviderError } from "#api/deckProviders/ProviderError";
import type { DeckProviderId } from "@aegis/shared/deckProviders/DeckProvider";
import type { ProviderArchetype, ProviderList, ProviderPage } from "@aegis/shared/deckProviders/ProviderTypes";

type Params = {
  store: AccountStore;
  client: Pick<ProviderClient, "get">;
  providerId: DeckProviderId;
  signal?: AbortSignal;
  now?: Date;
};

export async function runProviderSync({
  store,
  client,
  providerId,
  signal,
  now = new Date(),
}: Params): Promise<number> {
  const provider = getDeckProvider(providerId);
  if (!provider) {
    return 0;
  }
  await store.ensureReady();
  const db = await store.pool.connect();
  let locked = false;
  const period = `${getWeeklySyncPeriod(now)}:all-released-sets`;
  try {
    const lock = await db.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(1869113955) AS locked");
    locked = lock.rows[0]?.locked === true;
    if (!locked) {
      return 0;
    }
    const previous = await db.query<{ completed_at: string | null; attempted_at: string }>(
      "SELECT completed_at, attempted_at FROM deck_provider_sync_runs WHERE provider=$1 AND period=$2",
      [providerId, period],
    );
    if (
      previous.rows[0]?.completed_at ||
      (previous.rows[0] && Number(previous.rows[0].attempted_at) > now.getTime() - 3_600_000)
    ) {
      return 0;
    }
    await db.query(
      "INSERT INTO deck_provider_sync_runs (provider, period, attempted_at) VALUES ($1, $2, $3) ON CONFLICT (provider, period) DO UPDATE SET attempted_at=EXCLUDED.attempted_at",
      [providerId, period, now.getTime()],
    );
    let count = 0;
    const snapshots = new Map<string, unknown>();
    async function collect(path: string): Promise<unknown> {
      signal?.throwIfAborted();
      await setTimeout(1300, undefined, { signal });
      let body: unknown;
      try {
        body = await client.get(path);
      } catch (error) {
        if (!(error instanceof ProviderError) || !error.retryAfter || error.retryAfter > 60) {
          throw error;
        }
        await setTimeout(error.retryAfter * 1000, undefined, { signal });
        body = await client.get(path);
      }
      if (body && typeof body === "object" && "providerDataStale" in body && body.providerDataStale === true) {
        throw new ProviderError(503);
      }
      snapshots.set(path, body);
      count += 1;
      return body;
    }
    const seed = provider.parseResponse({
      body: await collect(provider.buildMetaPath()),
      kind: "meta",
    }) as ProviderPage<ProviderArchetype>;
    const formats = seed.formats;
    if (formats.length === 0) {
      throw new ProviderError(502);
    }
    const seedBody = snapshots.get(provider.buildMetaPath()) as Record<string, unknown>;
    snapshots.set(provider.buildMetaPath(), {
      ...seedBody,
      formats: formats.map((format) => ({ format: format.id, display_name: format.name })),
    });
    for (const format of formats) {
      const meta = provider.parseResponse({
        body: await collect(provider.buildMetaPath({ format: format.id, perPage: 25 })),
        kind: "meta",
      }) as ProviderPage<ProviderArchetype>;
      await collect(provider.buildListsPath({ format: format.id }));
      for (const archetype of meta.data.slice(0, 25)) {
        const lists = provider.parseResponse({
          body: await collect(
            provider.buildListsPath({ format: format.id, archetype: String(archetype.id), perPage: 3 }),
          ),
          kind: "lists",
        }) as ProviderPage<ProviderList>;
        for (const list of lists.data.slice(0, 3)) {
          provider.parseResponse({ body: await collect(provider.buildDetailPath(list.id)), kind: "detail" });
        }
      }
    }
    await db.query("BEGIN");
    try {
      for (const [path, body] of snapshots) {
        await db.query(
          "INSERT INTO deck_provider_snapshots (provider, key, body, collected_at) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, key) DO UPDATE SET body=EXCLUDED.body, collected_at=EXCLUDED.collected_at",
          [providerId, path, JSON.stringify(body), Date.now()],
        );
      }
      await db.query(
        "UPDATE deck_provider_sync_runs SET completed_at=$1, collected_count=$2 WHERE provider=$3 AND period=$4",
        [Date.now(), count, providerId, period],
      );

      await db.query("DELETE FROM deck_provider_sync_runs WHERE attempted_at < $1", [Date.now() - 90 * 86_400_000]);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    return count;
  } finally {
    if (locked) {
      await db.query("SELECT pg_advisory_unlock(1869113955)");
    }
    db.release();
  }
}
