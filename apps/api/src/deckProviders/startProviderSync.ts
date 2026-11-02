import { runProviderSync } from "#api/deckProviders/runProviderSync";
import type { ProviderClient } from "#api/deckProviders/ProviderClient";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { DeckProviderId } from "@aegis/shared/deckProviders/DeckProvider";
import { log, logError } from "#api/logger";

type Params = { store: AccountStore; client: ProviderClient; providerId: DeckProviderId; enabled: boolean };

export function startProviderSync({ store, client, providerId, enabled }: Params): () => void {
  const controller = new AbortController();
  let running = false;
  async function tick() {
    if (running || controller.signal.aborted) {
      return;
    }
    running = true;
    try {
      const count = await runProviderSync({ store, client, providerId, signal: controller.signal });
      if (count > 0) {
        log("[deck-providers] weekly sync completed", { providerId, count });
      }
    } catch {
      if (!controller.signal.aborted) {
        logError("[deck-providers] weekly sync failed; retry in one hour", new Error("provider_sync_failed"));
      }
    } finally {
      running = false;
    }
  }
  if (!enabled) {
    return () => controller.abort();
  }
  const timer = setInterval(() => {
    void tick();
  }, 60_000);
  timer.unref();
  void tick();
  return () => {
    controller.abort();
    clearInterval(timer);
  };
}
