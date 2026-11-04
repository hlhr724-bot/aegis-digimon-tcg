import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import type { SavedMatchupResult } from "@aegis/shared/deckSimulation/SavedMatchupResult";
import { accountApi, AccountApiError, request } from "@/account/client";

export type MatchupOpponentChoice = { mirror: true } | { famousDeckId: string } | { community: { deckIds?: string[] } };

export type StartMatchupParams = {
  deck: { mainDeck: string[]; eggDeck: string[] };
  opponent: MatchupOpponentChoice;
  games: number;
  format?: string;
  deckId?: string;
};

const MATCHUPS_PATH = "/account/deck-simulations/matchups";

export type MatchupJobRef = Pick<MatchupJob, "id" | "owner">;

function jobPath({ id, owner }: MatchupJobRef): string {
  return `${owner === undefined ? "" : `/${owner}`}${MATCHUPS_PATH}/${encodeURIComponent(id)}`;
}

export const matchupApi = {
  start: (params: StartMatchupParams) =>
    request<MatchupJob>(MATCHUPS_PATH, { method: "POST", body: JSON.stringify(params) }),
  get: (job: MatchupJobRef) => request<MatchupJob>(jobPath(job)),
  async latest(deckId: string): Promise<SavedMatchupResult | undefined> {
    try {
      return await request<SavedMatchupResult>(
        `/account/deck-simulations/decks/${encodeURIComponent(deckId)}/latest-matchup`,
      );
    } catch (error) {
      if (error instanceof AccountApiError && error.status === 404) return undefined;
      throw error;
    }
  },
  async replayFile(job: MatchupJobRef, index: number): Promise<Blob> {
    const response = await fetch(`${accountApi.base}${jobPath(job)}/replays/${index}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new AccountApiError(response.status);
    return response.blob();
  },
  cancel: (job: MatchupJobRef) => request<MatchupJob>(jobPath(job), { method: "DELETE" }),
};
