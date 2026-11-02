import { getDeckProvider } from "#api/deckProviders/getDeckProvider";
import type { DeckProviderId } from "@aegis/shared/deckProviders/DeckProvider";
import type { AccountStore } from "#api/accounts/AccountStore";
import { ProviderError } from "#api/deckProviders/ProviderError";

type Params = { store: AccountStore; providerId: DeckProviderId; apiKey?: string; fetcher?: typeof fetch };

function addFreshness(body: unknown, collectedAt: number, stale: boolean): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProviderError(502);
  }
  return { ...body, providerDataCollectedAt: collectedAt, providerDataStale: stale };
}

export class ProviderClient {
  private readonly providerId: DeckProviderId;
  private readonly store: AccountStore;
  private readonly apiKey: string | undefined;
  private readonly fetcher: typeof fetch;

  constructor({ store, providerId, apiKey, fetcher = fetch }: Params) {
    this.store = store;
    this.providerId = providerId;
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async get(path: string): Promise<unknown> {
    const provider = getDeckProvider(this.providerId);
    if (!this.apiKey || !provider) {
      throw new ProviderError(503);
    }
    await this.store.ensureReady();
    const db = await this.store.pool.connect();
    let locked = false;
    try {
      await db.query("SET lock_timeout = '12s'");
      await db.query("SELECT pg_advisory_lock(1869113954)");
      locked = true;
      const cached = await db.query<{ body: unknown; expires_at: string }>(
        "SELECT body, expires_at FROM deck_provider_cache WHERE key=$1",
        [`${this.providerId}:${path}`],
      );
      if (cached.rows[0] && Number(cached.rows[0].expires_at) > Date.now()) {
        return addFreshness(cached.rows[0].body, Number(cached.rows[0].expires_at) - 900_000, false);
      }
      const cooldown = await db.query<{ expires_at: string }>(
        "SELECT expires_at FROM deck_provider_cache WHERE key=$1",
        ["cooldown"],
      );
      const remaining = Number(cooldown.rows[0]?.expires_at ?? 0) - Date.now();
      if (remaining > 0) {
        throw new ProviderError(429, Math.ceil(remaining / 1000));
      }
      const budget = await db.query<{ body: number; expires_at: string }>(
        "SELECT body, expires_at FROM deck_provider_cache WHERE key=$1",
        ["budget"],
      );
      const current = budget.rows[0];
      const fresh = current && Number(current.expires_at) > Date.now();
      const used = fresh ? Number(current.body) : 0;
      if (used >= 50) {
        throw new ProviderError(429, Math.max(1, Math.ceil((Number(current?.expires_at) - Date.now()) / 1000)));
      }
      await db.query(
        "INSERT INTO deck_provider_cache (key, body, expires_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET body=EXCLUDED.body, expires_at=EXCLUDED.expires_at",
        ["budget", JSON.stringify(used + 1), fresh ? Number(current.expires_at) : Date.now() + 60_000],
      );
      const response = await this.fetcher(`${provider.apiUrl}${path}`, {
        headers: { "X-API-Key": this.apiKey },
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (response.status === 429) {
        const value = response.headers.get("Retry-After");
        const seconds = Number(value);
        const retry =
          Number.isFinite(seconds) && seconds > 0
            ? seconds * 1000
            : Math.max(60_000, Date.parse(value ?? "") - Date.now() || 0);
        await db.query(
          "INSERT INTO deck_provider_cache (key, body, expires_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET body=EXCLUDED.body, expires_at=EXCLUDED.expires_at",
          ["cooldown", "null", Date.now() + retry],
        );
        throw new ProviderError(503, Math.ceil(retry / 1000));
      }
      if (!response.ok) {
        throw new ProviderError(response.status === 404 ? 404 : 503);
      }
      const body: unknown = await response.json();
      const collectedAt = Date.now();
      const result = addFreshness(body, collectedAt, false);
      await db.query("DELETE FROM deck_provider_cache WHERE expires_at < $1", [Date.now()]);
      await db.query(
        "INSERT INTO deck_provider_cache (key, body, expires_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET body=EXCLUDED.body, expires_at=EXCLUDED.expires_at",
        [`${this.providerId}:${path}`, JSON.stringify(body), collectedAt + 900_000],
      );
      return result;
    } catch (error) {
      if (!(error instanceof ProviderError) || error.status !== 404) {
        const snapshot = await db.query<{ body: unknown; collected_at: string }>(
          "SELECT body, collected_at FROM deck_provider_snapshots WHERE provider=$1 AND key=$2 AND collected_at > $3",
          [this.providerId, path, Date.now() - 8 * 86_400_000],
        );
        if (snapshot.rows[0]) {
          return addFreshness(snapshot.rows[0].body, Number(snapshot.rows[0].collected_at), true);
        }
      }
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(503);
    } finally {
      try {
        if (locked) {
          await db.query("SELECT pg_advisory_unlock(1869113954)");
        }
        await db.query("RESET lock_timeout");
      } finally {
        db.release();
      }
    }
  }
}
