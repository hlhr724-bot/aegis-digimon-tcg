import { TrophyAward } from "@aegis/shared/achievements/TrophyAward";
import type { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";

type TournamentTrophyAward = (typeof TrophyAward)[keyof typeof TrophyAward];

export function getTournamentTrophyAward(placement: TournamentDiscordRole): TournamentTrophyAward | null {
  return (
    Object.values(TrophyAward).find(
      (award) => "tournamentPlacement" in award && award.tournamentPlacement === placement,
    ) ?? null
  );
}
