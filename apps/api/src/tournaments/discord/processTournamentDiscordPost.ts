import { getTournamentDiscordChannelName } from "#api/tournaments/discord/getTournamentDiscordChannelName";
import { ANNOUNCED_TOURNAMENT_STATUSES } from "#api/tournaments/discord/ANNOUNCED_TOURNAMENT_STATUSES";
import { computeTournamentPlacements } from "#api/tournaments/discord/computeTournamentPlacements";
import { formatTournamentAnnouncement } from "#api/tournaments/discord/formatTournamentAnnouncement";
import { formatTournamentResults } from "#api/tournaments/discord/formatTournamentResults";
import { formatTournamentRound } from "#api/tournaments/discord/formatTournamentRound";
import { getEliminationRoundTitle } from "#api/tournaments/discord/getEliminationRoundTitle";
import { readTournamentRoster } from "#api/tournaments/discord/readTournamentRoster";
import type { TournamentDiscordContext } from "#api/tournaments/discord/TournamentDiscordContext";
import type { TournamentPlacement } from "#api/tournaments/discord/TournamentPlacement";
import type { TournamentRoundPairing } from "#api/tournaments/discord/TournamentRoundPairing";

export type TournamentDiscordPostRow = {
  id: string;
  name: string;
  description: string | null;
  format: string | null;
  status: string;
  starts_at: string | number;
  max_players: number;
  best_of: number | null;
  announcement_message_id: string | null;
  thread_id: string | null;
  channel_id: string | null;
};

type MatchRow = {
  phase_id: string;
  kind: string;
  round: number;
  position: number;
  status: string;
  player0_participant_id: string | null;
  player1_participant_id: string | null;
};

const SETTLED_MATCH_STATUSES = new Set(["finished", "bye"]);

export async function processTournamentDiscordPost(
  context: TournamentDiscordContext,
  tournament: TournamentDiscordPostRow,
): Promise<number> {
  let actions = 0;
  let channelId = tournament.channel_id;
  let announced = tournament.announcement_message_id !== null;
  if (!channelId) {
    if (!announced && !(ANNOUNCED_TOURNAMENT_STATUSES as readonly string[]).includes(tournament.status)) {
      await markClosed(context, tournament.id);
      return actions;
    }
    const channel = await context.discord.ensureTournamentChannel({
      referenceChannelId: context.config.channelId,
      guildId: context.config.guildId,
      name: getTournamentDiscordChannelName({ name: tournament.name, tournamentId: tournament.id }),
      topic: `Aegis tournament ${tournament.id}`,
    });
    if (tournament.thread_id) {
      await context.db.query("DELETE FROM tournament_discord_rounds WHERE tournament_id=$1", [tournament.id]);
    }
    await context.db.query(
      "UPDATE tournament_discord_posts SET channel_id=$2, guild_id=$4, announcement_message_id=NULL, updated_at=$3 WHERE tournament_id=$1",
      [tournament.id, channel.id, context.now, channel.guildId],
    );
    channelId = channel.id;
    announced = false;
  }
  if (!announced) {
    await announce(context, tournament, channelId);
    actions += 1;
  }
  actions += await postRounds(context, tournament.id, channelId);
  if (tournament.status === "finished" || tournament.status === "cancelled") {
    await postClosing(context, tournament, channelId);
    actions += 1;
  }
  return actions;
}

async function announce(
  context: TournamentDiscordContext,
  tournament: TournamentDiscordPostRow,
  channelId: string,
): Promise<void> {
  const { db, discord, config, now } = context;
  const registered = await db.query<{ count: string | number }>(
    "SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id=$1 AND status NOT IN ('dropped','disqualified')",
    [tournament.id],
  );
  const message = await discord.postMessage(
    channelId,
    formatTournamentAnnouncement({
      name: tournament.name,
      description: tournament.description ?? "",
      link: `${config.webUrl}/tournaments/${tournament.id}`,
      format: tournament.format ?? "standard",
      startsAt: Number(tournament.starts_at),
      maxPlayers: Number(tournament.max_players),
      registeredCount: Number(registered.rows[0]?.count ?? 0),
      bestOf: Number(tournament.best_of ?? 1),
    }),
  );
  await db.query(
    "UPDATE tournament_discord_posts SET announcement_message_id=$2, updated_at=$3 WHERE tournament_id=$1",
    [tournament.id, message.id, now],
  );
}

async function postRounds(context: TournamentDiscordContext, tournamentId: string, channelId: string): Promise<number> {
  const { db, discord, config, now } = context;
  const [matches, posted] = await Promise.all([
    db.query<MatchRow>(
      `SELECT m.phase_id, ph.kind, m.round, m.position, m.status, m.player0_participant_id, m.player1_participant_id
       FROM tournament_matches m JOIN tournament_phases ph ON ph.id = m.phase_id
       WHERE m.tournament_id=$1`,
      [tournamentId],
    ),
    db.query<{ phase_id: string; round: number }>(
      "SELECT phase_id, round FROM tournament_discord_rounds WHERE tournament_id=$1",
      [tournamentId],
    ),
  ]);
  const postedKeys = new Set(posted.rows.map((row) => `${row.phase_id}:${Number(row.round)}`));
  const groups = new Map<string, MatchRow[]>();
  for (const match of matches.rows) {
    const key = `${match.phase_id}:${Number(match.round)}`;
    if (!postedKeys.has(key)) {
      groups.set(key, [...(groups.get(key) ?? []), match]);
    }
  }
  const ordered = [...groups.values()].sort((left, right) => Number(left[0]!.round) - Number(right[0]!.round));
  let actions = 0;
  let roster: Awaited<ReturnType<typeof readTournamentRoster>> | undefined;
  for (const group of ordered) {
    if (group.some((match) => match.status === "waiting")) {
      break;
    }
    const first = group[0]!;
    let messageId: string | null = null;
    if (!group.every((match) => SETTLED_MATCH_STATUSES.has(match.status))) {
      roster ??= await readTournamentRoster(db, tournamentId);
      const knownRoster = roster;
      const pairings: TournamentRoundPairing[] = [...group]
        .sort((left, right) => Number(left.position) - Number(right.position))
        .map((match, index) => ({
          table: index + 1,
          players: [match.player0_participant_id, match.player1_participant_id].flatMap((participantId) => {
            const player = participantId ? knownRoster.get(String(participantId)) : undefined;
            return player ? [player] : [];
          }),
        }));
      const title =
        first.kind === "swiss"
          ? `Round ${Number(first.round)}`
          : `${first.kind === "top_cut" ? "Top Cut " : ""}${getEliminationRoundTitle(group.length)}`;
      for (const message of formatTournamentRound({
        title,
        link: `${config.webUrl}/tournaments/${tournamentId}`,
        pairings,
      })) {
        const sent = await discord.postMessage(channelId, message);
        messageId ??= sent.id;
      }
      actions += 1;
    }
    await db.query(
      "INSERT INTO tournament_discord_rounds (tournament_id, phase_id, round, message_id, posted_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [tournamentId, first.phase_id, Number(first.round), messageId, now],
    );
  }
  return actions;
}

async function postClosing(
  context: TournamentDiscordContext,
  tournament: TournamentDiscordPostRow,
  channelId: string,
): Promise<void> {
  const { db, discord, config } = context;
  const link = `${config.webUrl}/tournaments/${tournament.id}`;
  if (tournament.status === "cancelled") {
    await discord.postMessage(channelId, { content: `**${tournament.name}** was cancelled.` });
    await markClosed(context, tournament.id);
    return;
  }
  const finished = await db.query<{ participant_id: string | null }>(
    "SELECT participant_id FROM tournament_events WHERE tournament_id=$1 AND command='tournament_finished' ORDER BY sequence DESC LIMIT 1",
    [tournament.id],
  );
  const roster = await readTournamentRoster(db, tournament.id);
  const placements: TournamentPlacement[] = [];
  for (const [participantId, role] of await computeTournamentPlacements({
    db,
    tournamentId: tournament.id,
    winnerParticipantId: finished.rows[0]?.participant_id ? String(finished.rows[0].participant_id) : null,
    standings: context.standings,
  })) {
    const player = roster.get(participantId);
    if (!player) {
      continue;
    }
    placements.push({ accountId: player.accountId, role, player });
    if (player.accountId) {
      await db.query(
        "INSERT INTO tournament_discord_placements (tournament_id, account_id, placement) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [tournament.id, player.accountId, role],
      );
    }
  }
  for (const message of formatTournamentResults({ name: tournament.name, link, placements })) {
    await discord.postMessage(channelId, message);
  }
  await markClosed(context, tournament.id);
}

async function markClosed({ db, now }: TournamentDiscordContext, tournamentId: string): Promise<void> {
  await db.query("UPDATE tournament_discord_posts SET closed_at=$2, updated_at=$2 WHERE tournament_id=$1", [
    tournamentId,
    now,
  ]);
}
