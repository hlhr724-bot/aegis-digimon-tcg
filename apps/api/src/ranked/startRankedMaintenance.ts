import type { AccountStore } from "#api/accounts/AccountStore";
import { RankedStore } from "#api/ranked/RankedStore";
import { RankedSeasonStore } from "#api/ranked/RankedSeasonStore";
import { syncRankedDiscordRoles } from "#api/ranked/syncRankedDiscordRoles";
import { getRankedConfig } from "#api/ranked/getRankedConfig";
import { logError } from "#api/logger";

type Params = { accounts: AccountStore };

export function startRankedMaintenance({ accounts }: Params): () => void {
  let busy = false;
  let stopped = false;
  async function runSweep() {
    if (busy || stopped || !getRankedConfig().enabled) {
      return;
    }
    busy = true;
    try {
      await new RankedStore(accounts).sweepQueue();
      await new RankedSeasonStore(accounts).getSeasons();
      await new RankedSeasonStore(accounts).finalizeSeasons();
      await syncRankedDiscordRoles({ accounts });
    } catch (error) {
      logError("[ranked] maintenance failed", error);
    } finally {
      busy = false;
    }
  }
  void runSweep();
  const timer = setInterval(() => void runSweep(), 15_000);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
