import { TournamentDiscordRole } from "#api/tournaments/discord/TournamentDiscordRole";
import { TrophySourceKind } from "@aegis/shared/achievements/TrophySourceKind";
import { TrophyTier } from "@aegis/shared/achievements/TrophyTier";
import type { Queryable } from "#api/db/migrator";
import { getTournamentTrophyAward } from "#api/achievements/getTournamentTrophyAward";
import { computeTournamentPlacements } from "#api/tournaments/discord/computeTournamentPlacements";
import type { TournamentDiscordContext } from "#api/tournaments/discord/TournamentDiscordContext";

type Params = {
  db: Queryable;
  tournamentId: string;
  standings: TournamentDiscordContext["standings"];
  now: number;
};
type LegacyAwardsParams = { db: Queryable; tournamentId: string };

type Award = NonNullable<ReturnType<typeof getTournamentTrophyAward>>;

export async function grantTournamentTrophies({ db, tournamentId, standings, now }: Params): Promise<number> {
  const claimed = await db.query(
    "INSERT INTO tournament_trophy_grants (tournament_id, granted_at) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [tournamentId, now],
  );
  if (claimed.rowCount !== 1) {
    return 0;
  }
  const finished = (
    await db.query<{ participant_id: string | null; created_at: string | number }>(
      "SELECT participant_id, created_at FROM tournament_events WHERE tournament_id=$1 AND command='tournament_finished' ORDER BY sequence DESC LIMIT 1",
      [tournamentId],
    )
  ).rows[0];
  const placements = await computeTournamentPlacements({
    db,
    tournamentId,
    winnerParticipantId: finished?.participant_id ? String(finished.participant_id) : null,
    standings,
  });
  const accounts = await readParticipantAccounts(db, tournamentId);
  const best = accounts.size === 0 ? await getLegacyAwards({ db, tournamentId }) : new Map<string, Award>();
  for (const [participantId, placement] of placements) {
    const accountId = accounts.get(participantId);
    const award = getTournamentTrophyAward(placement);
    if (!accountId || !award) {
      continue;
    }
    const current = best.get(accountId);
    if (!current || getTierRank(award.tier) > getTierRank(current.tier)) {
      best.set(accountId, award);
    }
  }
  const awardedAt = finished ? Number(finished.created_at) : now;
  let granted = 0;
  for (const [accountId, award] of best) {
    const inserted = await db.query(
      `INSERT INTO player_trophies (account_id, source_kind, source_key, award, tier, tournament_id, awarded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [accountId, TrophySourceKind.TOURNAMENT.value, tournamentId, award.value, award.tier, tournamentId, awardedAt],
    );
    granted += inserted.rowCount ?? 0;
  }
  return granted;
}

async function readParticipantAccounts(db: Queryable, tournamentId: string): Promise<Map<string, string>> {
  const rows = (
    await db.query<{ id: string; account_id: string }>(
      "SELECT id, account_id FROM tournament_participants WHERE tournament_id=$1 AND account_id IS NOT NULL",
      [tournamentId],
    )
  ).rows;
  return new Map(rows.map((row) => [String(row.id), String(row.account_id)]));
}

function getTierRank(tier: Award["tier"]): number {
  return Object.values(TrophyTier).find((entry) => entry.value === tier)?.rank ?? 0;
}

async function getLegacyAwards({ db, tournamentId }: LegacyAwardsParams): Promise<Map<string, Award>> {
  const best = new Map<string, Award>();
  const tournament = (
    await db.query<{ winner_account_id: string | null }>("SELECT winner_account_id FROM tournaments WHERE id=$1", [
      tournamentId,
    ])
  ).rows[0];
  const champion = getTournamentTrophyAward(TournamentDiscordRole.CHAMPION.value)!;
  if (tournament?.winner_account_id) {
    best.set(String(tournament.winner_account_id), champion);
  }
  const matches = (
    await db.query<{
      round: number;
      winner_account_id: string | null;
      player0_account_id: string | null;
      player1_account_id: string | null;
    }>(
      "SELECT round,winner_account_id,player0_account_id,player1_account_id FROM tournament_matches WHERE tournament_id=$1 AND status='finished'",
      [tournamentId],
    )
  ).rows;
  const finalRound = Math.max(...matches.map((match) => Number(match.round)));
  for (const match of matches) {
    const depth = finalRound - Number(match.round);
    if (depth > 2) {
      continue;
    }
    const loser = [match.player0_account_id, match.player1_account_id].find(
      (accountId) => accountId && accountId !== match.winner_account_id,
    );
    if (!loser || best.has(String(loser))) {
      continue;
    }
    const role = depth <= 1 ? TournamentDiscordRole.TOP_FOUR.value : TournamentDiscordRole.TOP_EIGHT.value;
    best.set(String(loser), getTournamentTrophyAward(role)!);
  }
  return best;
}
