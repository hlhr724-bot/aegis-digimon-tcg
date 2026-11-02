import type { TournamentBracketSpectating } from "@/tournaments/TournamentBracketSpectating";
import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import type { TournamentDetail } from "@/tournaments/types";

type Params = {
  detail: Pick<TournamentDetail, "id" | "canSpectate">;
  onWatchMatch?: (target: TournamentSpectateTarget) => void;
};

export function getTournamentBracketSpectating({
  detail,
  onWatchMatch,
}: Params): TournamentBracketSpectating | undefined {
  if (!detail.canSpectate || !onWatchMatch) {
    return undefined;
  }
  return { tournamentId: detail.id, onWatch: onWatchMatch };
}
