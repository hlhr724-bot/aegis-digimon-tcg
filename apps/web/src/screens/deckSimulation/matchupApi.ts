import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import { accountApi, AccountApiError, request } from "@/account/client";

export type MatchupOpponentChoice = { mirror: true } | { famousDeckId: string } | { community: { deckIds?: string[] } };

export type StartMatchupParams = {
  deck: { mainDeck: string[]; eggDeck: string[] };
  opponent: MatchupOpponentChoice;
  games: number;
  format?: string;
};

const MATCHUPS_PATH = "/account/deck-simulations/matchups";

export const matchupApi = {
  start: (params: StartMatchupParams) =>
    request<MatchupJob>(MATCHUPS_PATH, { method: "POST", body: JSON.stringify(params) }),
  get: (jobId: string) => request<MatchupJob>(`${MATCHUPS_PATH}/${encodeURIComponent(jobId)}`),
  async replayFile(jobId: string, index: number): Promise<Blob> {
    const response = await fetch(`${accountApi.base}${MATCHUPS_PATH}/${encodeURIComponent(jobId)}/replays/${index}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new AccountApiError(response.status);
    return response.blob();
  },
  cancel: (jobId: string) => request<MatchupJob>(`${MATCHUPS_PATH}/${encodeURIComponent(jobId)}`, { method: "DELETE" }),
};
