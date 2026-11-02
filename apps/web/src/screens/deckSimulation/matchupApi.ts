import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import { request } from "@/account/client";

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
  cancel: (jobId: string) => request<MatchupJob>(`${MATCHUPS_PATH}/${encodeURIComponent(jobId)}`, { method: "DELETE" }),
};
