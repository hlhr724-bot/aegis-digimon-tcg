import type { AccountStore } from "#api/accounts/AccountStore";
import { TournamentResultStore } from "#api/tournaments/results/TournamentResultStore";

type Params = {
  accounts: AccountStore;
  standings: (tournamentId: string) => Promise<readonly { participantId: string }[]>;
  intervalMs?: number;
};

export function createTournamentResultSweep({
  accounts,
  standings,
  intervalMs = 15_000,
}: Params): (now: number) => Promise<number> {
  const store = new TournamentResultStore(accounts);
  let lastRunAt = Number.NEGATIVE_INFINITY;
  return async (now) => {
    if (now - lastRunAt < intervalMs) {
      return 0;
    }
    lastRunAt = now;
    return store.sweepFinishedTournaments({ standings, now });
  };
}
