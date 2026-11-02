import { deckFormatSettings, isDeckFormat, type DeckFormat } from "@aegis/shared/deckFormat";
import type {
  ParticipantKind,
  PhaseKind,
  RegistrationStatus,
  TournamentStructure,
} from "@aegis/shared/tournaments/index";
import type { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import type {
  TournamentResultExport,
  TournamentResultExportCard,
  TournamentResultExportDecklist,
  TournamentResultExportMatch,
  TournamentResultExportMatchResult,
  TournamentResultExportParticipant,
} from "@aegis/shared/tournaments/TournamentResultExport";
import type { Queryable } from "#api/db/migrator";
import { getFinalPlacements } from "#api/tournaments/results/getFinalPlacements";

type Params = {
  db: Queryable;
  tournamentId: string;
  standings: (tournamentId: string) => Promise<readonly { participantId: string }[]>;
  now: number;
};
type EventRow = {
  id: string;
  name: string;
  category: TournamentCategory | null;
  format: string | null;
  structure: TournamentStructure;
  best_of: string | number;
  top_cut_enabled: boolean | null;
  top_cut_size: string | number | null;
  starts_at: string | number;
  organizer_display_name: string | null;
};
type ParticipantRow = {
  id: string;
  kind: ParticipantKind;
  account_id: string | null;
  display_name: string;
  status: RegistrationStatus;
  deck_snapshot: { mainDeck?: unknown; eggDeck?: unknown } | string | null;
};
type LedgerRow = { participant_id: string; round_number: string | number; outcome: string };
type MatchRow = {
  id: string;
  round: string | number;
  position: string | number;
  status: string;
  phase_id: string;
  player0_participant_id: string | null;
  player1_participant_id: string | null;
  winner_participant_id: string | null;
  player0_account_id: string | null;
  player1_account_id: string | null;
  winner_account_id: string | null;
};
type PhaseRow = {
  id: string;
  kind: PhaseKind;
  phase_order: string | number;
  planned_rounds: string | number | null;
  round_offset: string | number | null;
  created_at: string | number;
};
type SeriesRow = { tournament_match_id: string; wins0: string | number; wins1: string | number };
type ResultRecord = { wins: number; losses: number; draws: number; byes: number; matchPoints: number };
type Seats = { player1: string | null; player2: string | null; winner: string | null };

const LOSS_OUTCOMES = new Set(["loss", "double_loss", "no_show_loss", "concession"]);
const SETTLED_MATCH_STATUSES = new Set(["finished", "bye"]);
const BRACKET_PHASES = new Set<PhaseKind>(["top_cut", "single_elimination"]);

export async function buildTournamentResultExport({
  db,
  tournamentId,
  standings,
  now,
}: Params): Promise<TournamentResultExport | null> {
  const event = (
    await db.query<EventRow>(
      `SELECT t.id, t.name, t.category, t.format, t.structure, t.best_of, t.top_cut_enabled, t.top_cut_size,
              t.starts_at, a.display_name AS organizer_display_name
       FROM tournaments t LEFT JOIN accounts a ON a.id = t.created_by
       WHERE t.id=$1 AND t.status='finished'`,
      [tournamentId],
    )
  ).rows[0];
  if (!event) {
    return null;
  }
  const participants = await db.query<ParticipantRow>(
    "SELECT id, kind, account_id, display_name, status, deck_snapshot FROM tournament_participants WHERE tournament_id=$1 ORDER BY created_at, id",
    [tournamentId],
  );
  const ledger = await db.query<LedgerRow>(
    "SELECT participant_id, round_number, outcome FROM tournament_result_ledger WHERE tournament_id=$1 ORDER BY round_number, participant_id",
    [tournamentId],
  );
  const matches = await db.query<MatchRow>(
    `SELECT id, round, position, status, phase_id, player0_participant_id, player1_participant_id, winner_participant_id,
            player0_account_id, player1_account_id, winner_account_id
     FROM tournament_matches WHERE tournament_id=$1 ORDER BY round, position`,
    [tournamentId],
  );
  const phases = await db.query<PhaseRow>(
    "SELECT id, kind, phase_order, planned_rounds, round_offset, created_at FROM tournament_phases WHERE tournament_id=$1 ORDER BY phase_order",
    [tournamentId],
  );
  const series = await db.query<SeriesRow>(
    "SELECT s.tournament_match_id, s.wins0, s.wins1 FROM match_series s JOIN tournament_matches m ON m.id = s.tournament_match_id WHERE m.tournament_id=$1",
    [tournamentId],
  );
  const finished = await db.query<{ participant_id: string | null; created_at: string | number }>(
    "SELECT participant_id, created_at FROM tournament_events WHERE tournament_id=$1 AND command='tournament_finished' ORDER BY sequence DESC LIMIT 1",
    [tournamentId],
  );
  const participantByAccount = new Map(
    participants.rows.flatMap((row) => (row.account_id ? [[String(row.account_id), String(row.id)] as const] : [])),
  );
  const phaseById = new Map(phases.rows.map((phase) => [String(phase.id), phase]));
  const winsByMatch = new Map(
    series.rows.map((row) => [String(row.tournament_match_id), [Number(row.wins0), Number(row.wins1)] as const]),
  );
  const ledgerOutcome = new Map(
    ledger.rows.map((row) => [`${row.participant_id}:${Number(row.round_number)}`, row.outcome]),
  );
  const records = getRecords(ledger.rows);
  const settled = matches.rows.filter((match) => SETTLED_MATCH_STATUSES.has(match.status));
  const exportedMatches = settled.map((match) =>
    buildMatch({
      match,
      seats: getSeats(match, participantByAccount),
      phase: phaseById.get(String(match.phase_id))?.kind ?? "single_elimination",
      wins: winsByMatch.get(String(match.id)) ?? [0, 0],
      ledgerOutcome,
    }),
  );
  const played = new Set([
    ...records.keys(),
    ...exportedMatches.flatMap((match) =>
      [match.player1ParticipantId, match.player2ParticipantId].filter((id): id is string => id !== null),
    ),
  ]);
  const playedParticipants = participants.rows.filter((row) => played.has(String(row.id)));
  const swissOrder = (await standings(tournamentId))
    .map((row) => row.participantId)
    .filter((participantId) => played.has(participantId));
  const placements = getFinalPlacements({
    championParticipantId: finished.rows[0]?.participant_id ? String(finished.rows[0].participant_id) : null,
    bracket: getBracket({ phases: phases.rows, matches: exportedMatches }),
    swissOrder,
    unranked: playedParticipants.map((row) => ({
      participantId: String(row.id),
      matchPoints: records.get(String(row.id))?.matchPoints ?? 0,
    })),
  });
  const format = isDeckFormat(event.format) ? event.format : ("standard" satisfies DeckFormat);
  const settings = deckFormatSettings(format);
  const startedAt = phases.rows.length ? Math.min(...phases.rows.map((phase) => Number(phase.created_at))) : null;
  return {
    schemaVersion: 1,
    exportedAt: now,
    event: {
      id: String(event.id),
      name: event.name,
      organizerDisplayName: event.organizer_display_name ?? "",
      category: event.category ?? "community",
      format,
      cardPool: settings.set,
      deckRules: settings.rules,
      structure: event.structure,
      bestOf: Number(event.best_of),
      topCutSize: event.top_cut_enabled && event.top_cut_size !== null ? Number(event.top_cut_size) : null,
      scheduledStartAt: Number(event.starts_at),
      startedAt,
      finishedAt: finished.rows[0] ? Number(finished.rows[0].created_at) : now,
    },
    participants: playedParticipants
      .map((row) =>
        buildParticipant({ row, record: records.get(String(row.id)), placement: placements.get(String(row.id)) }),
      )
      .sort(compareParticipants),
    matches: exportedMatches,
  };
}

function getRecords(rows: readonly LedgerRow[]): Map<string, ResultRecord> {
  const records = new Map<string, ResultRecord>();
  for (const row of rows) {
    const participantId = String(row.participant_id);
    const record = records.get(participantId) ?? { wins: 0, losses: 0, draws: 0, byes: 0, matchPoints: 0 };
    if (row.outcome === "win") {
      record.wins += 1;
      record.matchPoints += 3;
    } else if (row.outcome === "bye") {
      record.byes += 1;
      record.matchPoints += 3;
    } else if (row.outcome === "draw") {
      record.draws += 1;
      record.matchPoints += 1;
    } else if (LOSS_OUTCOMES.has(row.outcome)) {
      record.losses += 1;
    }
    records.set(participantId, record);
  }
  return records;
}

function getSeats(match: MatchRow, participantByAccount: ReadonlyMap<string, string>): Seats {
  const resolve = (participantId: string | null, accountId: string | null) => {
    if (participantId) {
      return String(participantId);
    }
    return accountId ? (participantByAccount.get(String(accountId)) ?? null) : null;
  };
  const player0 = resolve(match.player0_participant_id, match.player0_account_id);
  const player1 = resolve(match.player1_participant_id, match.player1_account_id);
  const winner = resolve(match.winner_participant_id, match.winner_account_id);
  if (!player0 && player1) {
    return { player1, player2: null, winner };
  }
  return { player1: player0, player2: player1, winner };
}

type BuildMatchParams = {
  match: MatchRow;
  seats: Seats;
  phase: PhaseKind;
  wins: readonly [number, number];
  ledgerOutcome: ReadonlyMap<string, string>;
};

function buildMatch({ match, seats, phase, wins, ledgerOutcome }: BuildMatchParams): TournamentResultExportMatch {
  const round = Number(match.round);
  const bye = match.status === "bye";
  const swapped = !match.player0_participant_id && !match.player0_account_id;
  return {
    round,
    phase,
    table: Number(match.position) + 1,
    player1ParticipantId: seats.player1,
    player2ParticipantId: seats.player2,
    player1GamesWon: swapped ? wins[1] : wins[0],
    player2GamesWon: swapped ? wins[0] : wins[1],
    winnerParticipantId: bye ? seats.player1 : seats.winner,
    result: getMatchResult({ seats, bye, outcome: ledgerOutcome.get(`${seats.player1}:${round}`) }),
    bye,
  };
}

type MatchResultParams = { seats: Seats; bye: boolean; outcome: string | undefined };

function getMatchResult({ seats, bye, outcome }: MatchResultParams): TournamentResultExportMatchResult {
  if (bye) {
    return "bye";
  }
  if (seats.winner && seats.winner === seats.player1) {
    return "player1";
  }
  if (seats.winner && seats.winner === seats.player2) {
    return "player2";
  }
  if (outcome === "draw") {
    return "draw";
  }
  if (outcome === "double_loss") {
    return "double_loss";
  }
  return "unresolved";
}

type BracketParams = { phases: readonly PhaseRow[]; matches: readonly TournamentResultExportMatch[] };

function getBracket({ phases, matches }: BracketParams) {
  const phase = [...phases].reverse().find((entry) => BRACKET_PHASES.has(entry.kind));
  if (!phase) {
    return null;
  }
  const bracketMatches = matches
    .filter((match) => match.phase === phase.kind && !match.bye)
    .map((match) => ({
      round: match.round,
      winnerParticipantId: match.winnerParticipantId,
      participantIds: [match.player1ParticipantId, match.player2ParticipantId].filter(
        (id): id is string => id !== null,
      ),
    }));
  if (!bracketMatches.length) {
    return null;
  }
  const finalRound =
    phase.planned_rounds === null
      ? Math.max(...bracketMatches.map((match) => match.round))
      : Number(phase.round_offset ?? 0) + Number(phase.planned_rounds);
  return { finalRound, matches: bracketMatches };
}

type ParticipantParams = { row: ParticipantRow; record: ResultRecord | undefined; placement: number | undefined };

function buildParticipant({ row, record, placement }: ParticipantParams): TournamentResultExportParticipant {
  return {
    participantId: String(row.id),
    displayName: row.display_name,
    accountId: row.account_id ? String(row.account_id) : null,
    kind: row.kind,
    placement: placement ?? null,
    wins: record?.wins ?? 0,
    losses: record?.losses ?? 0,
    draws: record?.draws ?? 0,
    byes: record?.byes ?? 0,
    dropped: row.status === "dropped",
    disqualified: row.status === "disqualified",
    decklist: getDecklist(row.deck_snapshot),
  };
}

function getDecklist(snapshot: ParticipantRow["deck_snapshot"]): TournamentResultExportDecklist | null {
  const deck = typeof snapshot === "string" ? (JSON.parse(snapshot) as Exclude<typeof snapshot, string>) : snapshot;
  if (!deck || !Array.isArray(deck.mainDeck) || !Array.isArray(deck.eggDeck)) {
    return null;
  }
  return { mainDeck: countCards(deck.mainDeck), eggDeck: countCards(deck.eggDeck) };
}

function countCards(cards: readonly unknown[]): TournamentResultExportCard[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (typeof card === "string") {
      counts.set(card, (counts.get(card) ?? 0) + 1);
    }
  }
  return [...counts].map(([cardId, count]) => ({ cardId, count }));
}

function compareParticipants(
  first: TournamentResultExportParticipant,
  second: TournamentResultExportParticipant,
): number {
  return (
    (first.placement ?? Number.MAX_SAFE_INTEGER) - (second.placement ?? Number.MAX_SAFE_INTEGER) ||
    first.participantId.localeCompare(second.participantId)
  );
}
