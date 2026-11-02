import type { Queryable } from "#api/db/migrator";
import { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";

type PlacementRole = Exclude<TournamentDiscordRole, "participant">;
type Params = {
  db: Queryable;
  tournamentId: string;
  winnerParticipantId: string | null;
  standings: (tournamentId: string) => Promise<readonly { participantId: string }[]>;
};

export async function computeTournamentPlacements({
  db,
  tournamentId,
  winnerParticipantId,
  standings,
}: Params): Promise<Map<string, PlacementRole>> {
  const placements = new Map<string, PlacementRole>();
  if (winnerParticipantId) {
    placements.set(winnerParticipantId, TournamentDiscordRole.CHAMPION.value);
  }
  const bracket = await db.query<{ id: string }>(
    "SELECT id FROM tournament_phases WHERE tournament_id=$1 AND kind IN ('top_cut','single_elimination') ORDER BY phase_order DESC LIMIT 1",
    [tournamentId],
  );
  const phaseId = bracket.rows[0]?.id;
  if (phaseId) {
    const matches = await db.query<{
      round: number;
      winner_participant_id: string | null;
      player0_participant_id: string | null;
      player1_participant_id: string | null;
    }>(
      "SELECT round, winner_participant_id, player0_participant_id, player1_participant_id FROM tournament_matches WHERE phase_id=$1 AND status='finished'",
      [phaseId],
    );
    const finalRound = Math.max(...matches.rows.map((match) => Number(match.round)));
    for (const match of matches.rows) {
      const depth = finalRound - Number(match.round);
      const role =
        depth <= 1 ? TournamentDiscordRole.TOP_FOUR.value : depth === 2 ? TournamentDiscordRole.TOP_EIGHT.value : null;
      const loser = [match.player0_participant_id, match.player1_participant_id].find(
        (participant) => participant && participant !== match.winner_participant_id,
      );
      if (role && loser && !placements.has(String(loser))) {
        placements.set(String(loser), role);
      }
    }
    return placements;
  }
  const rows = await standings(tournamentId);
  rows.slice(0, 8).forEach((row, index) => {
    if (!placements.has(row.participantId)) {
      placements.set(
        row.participantId,
        index < 4 ? TournamentDiscordRole.TOP_FOUR.value : TournamentDiscordRole.TOP_EIGHT.value,
      );
    }
  });
  return placements;
}
