import { useCallback, useState } from "react";
import { tournamentApi } from "@/tournaments/client";
import { usePolledRequest } from "@/tournaments/hooks";
import type { TournamentListing } from "@/tournaments/types";

const HOME_TOURNAMENT_POLL_MS = 30_000;

export function useHomeTournaments(): TournamentListing[] | undefined {
  const [tournaments, setTournaments] = useState<TournamentListing[]>();
  const load = useCallback((signal: AbortSignal) => tournamentApi.list(signal), []);
  const apply = useCallback((result: Awaited<ReturnType<typeof tournamentApi.list>>) => {
    if (result.ok) {
      setTournaments(result.value);
    }
  }, []);
  usePolledRequest(load, apply, HOME_TOURNAMENT_POLL_MS);
  return tournaments;
}
