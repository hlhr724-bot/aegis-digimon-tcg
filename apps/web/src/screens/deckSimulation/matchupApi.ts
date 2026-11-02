import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import type { MatchupGameCount } from "@aegis/shared/deckSimulation/MATCHUP_GAME_COUNTS";
import { request } from "@/account/client";

export type MatchupOpponentChoice = { mirror: true } | { famousDeckId: string };

export type StartMatchupParams = {
  deck: { mainDeck: string[]; eggDeck: string[] };
  opponent: MatchupOpponentChoice;
  games: MatchupGameCount;
  format?: string;
};

const MATCHUPS_PATH = "/account/deck-simulations/matchups";

export const matchupApi = {
  start: (params: StartMatchupParams) =>
    request<MatchupJob>(MATCHUPS_PATH, { method: "POST", body: JSON.stringify(params) }),
  get: (jobId: string) => request<MatchupJob>(`${MATCHUPS_PATH}/${encodeURIComponent(jobId)}`),
};
