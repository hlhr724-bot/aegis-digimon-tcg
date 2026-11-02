import type { AccountStore } from "#api/accounts/AccountStore";
import type { DeckProviderId } from "@aegis/shared/deckProviders/DeckProvider";
import { ProviderError } from "#api/deckProviders/ProviderError";

type Params = { store: AccountStore; providerId: DeckProviderId };

export class ProviderSnapshotReader {
  constructor(private readonly params: Params) {}

  async get(path: string): Promise<unknown> {
    const { store, providerId } = this.params;
    await store.ensureReady();
    const result = await store.pool.query<{ body: Record<string, unknown>; collected_at: string }>(
      "SELECT body, collected_at FROM deck_provider_snapshots WHERE provider=$1 AND key=$2",
      [providerId, path],
    );
    const snapshot = result.rows[0];
    if (!snapshot) {
      throw new ProviderError(503);
    }
    return {
      ...snapshot.body,
      providerDataCollectedAt: Number(snapshot.collected_at),
      providerDataStale: Number(snapshot.collected_at) < Date.now() - 7 * 86_400_000,
    };
  }
}
