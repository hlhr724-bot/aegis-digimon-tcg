import { randomUUID } from "node:crypto";
import type { AccountStore } from "#api/accounts/AccountStore";
import type { ArbitrationResult } from "#api/tournaments/arbitration/ArbitrationService";
import { appendTournamentEvent, findEventByCommandId } from "#api/tournaments/audit/TournamentEventLog";

type Params = {
  accounts: AccountStore;
  tournamentId: string;
  actorAccountId: string;
  firstMatchId: string;
  firstSeat: 0 | 1;
  secondMatchId: string;
  secondSeat: 0 | 1;
  reason: string;
  commandId?: string;
  now?: number;
};

type PairingRow = {
  id: string;
  round: number;
  round_id: string | null;
  phase_id: string | null;
  status: string;
  player0_account_id: string | null;
  player1_account_id: string | null;
  player0_participant_id: string | null;
  player1_participant_id: string | null;
  player0_present_at: string | null;
  player1_present_at: string | null;
};

export async function swapTournamentPairings(input: Params): Promise<ArbitrationResult<void>> {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, reason: "reason_required" };
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.firstMatchId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.secondMatchId) ||
    input.firstMatchId === input.secondMatchId ||
    (input.firstSeat !== 0 && input.firstSeat !== 1) ||
    (input.secondSeat !== 0 && input.secondSeat !== 1)
  ) {
    return { ok: false, reason: "pairings_not_editable" };
  }
  await input.accounts.ensureReady();
  const client = await input.accounts.pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const tournament = (
      await client.query<{ created_by: string; status: string }>(
        "SELECT created_by,status FROM tournaments WHERE id=$1 FOR UPDATE",
        [input.tournamentId],
      )
    ).rows[0];
    if (!tournament) {
      return { ok: false, reason: "tournament_not_found" };
    }
    if (tournament.created_by !== input.actorAccountId) {
      return { ok: false, reason: "not_organizer" };
    }
    const commandId = input.commandId ?? randomUUID();
    const replay = await findEventByCommandId(client, input.tournamentId, commandId);
    if (replay) {
      return { ok: true, value: undefined, event: replay, replayed: true, alreadyApplied: false };
    }
    if (tournament.status !== "in_progress" && tournament.status !== "running") {
      return { ok: false, reason: "pairings_not_editable" };
    }
    const rows = (
      await client.query<PairingRow>(
        "SELECT * FROM tournament_matches WHERE tournament_id=$1 AND (id=$2 OR id=$3) ORDER BY id FOR UPDATE",
        [input.tournamentId, input.firstMatchId, input.secondMatchId],
      )
    ).rows;
    const first = rows.find((row) => row.id === input.firstMatchId);
    const second = rows.find((row) => row.id === input.secondMatchId);
    if (!first || !second) {
      return { ok: false, reason: "match_not_found" };
    }
    if (
      first.round !== second.round ||
      first.round_id !== second.round_id ||
      first.phase_id !== second.phase_id ||
      rows.some((row) => !isEditable(row))
    ) {
      return { ok: false, reason: "pairings_not_editable" };
    }
    const roster = (
      await client.query<{ id: string; account_id: string | null; status: string }>(
        "SELECT id,account_id,status FROM tournament_participants WHERE tournament_id=$1 FOR UPDATE",
        [input.tournamentId],
      )
    ).rows;
    const seatedIds: string[] = [];
    for (const row of rows) {
      for (const seat of [0, 1] as const) {
        const participantId = row[`player${seat}_participant_id`];
        const accountId = row[`player${seat}_account_id`];
        const participant = roster.find((entry) =>
          participantId ? entry.id === participantId : accountId !== null && entry.account_id === accountId,
        );
        if (!participant || participant.status !== "active") {
          return { ok: false, reason: "pairings_not_editable" };
        }
        seatedIds.push(participant.id);
      }
    }
    if (new Set(seatedIds).size !== 4) {
      return { ok: false, reason: "pairings_not_editable" };
    }
    const started = await client.query(
      "SELECT id FROM match_series WHERE tournament_match_id=$1 OR tournament_match_id=$2",
      [first.id, second.id],
    );
    if (started.rows.length) {
      return { ok: false, reason: "pairings_not_editable" };
    }
    const firstAccount = first[`player${input.firstSeat}_account_id`];
    const firstParticipant = first[`player${input.firstSeat}_participant_id`];
    const secondAccount = second[`player${input.secondSeat}_account_id`];
    const secondParticipant = second[`player${input.secondSeat}_participant_id`];
    if ((!firstAccount && !firstParticipant) || (!secondAccount && !secondParticipant)) {
      return { ok: false, reason: "pairings_not_editable" };
    }
    await client.query(
      `UPDATE tournament_matches SET player${input.firstSeat}_account_id=$1, player${input.firstSeat}_participant_id=$2, pairing_reason=NULL WHERE id=$3`,
      [secondAccount, secondParticipant, first.id],
    );
    await client.query(
      `UPDATE tournament_matches SET player${input.secondSeat}_account_id=$1, player${input.secondSeat}_participant_id=$2, pairing_reason=NULL WHERE id=$3`,
      [firstAccount, firstParticipant, second.id],
    );
    const event = await appendTournamentEvent(client, {
      tournamentId: input.tournamentId,
      actorKind: "organizer",
      actorId: input.actorAccountId,
      command: "swap_pairings",
      commandId,
      reason,
      reasonCode: "organizer_pairing_swap",
      subjectKind: "round",
      subjectId: first.round_id,
      roundId: first.round_id,
      phaseId: first.phase_id,
      before: rows,
      after: {
        firstMatchId: first.id,
        firstSeat: input.firstSeat,
        firstAccountId: secondAccount,
        firstParticipantId: secondParticipant,
        secondMatchId: second.id,
        secondSeat: input.secondSeat,
        secondAccountId: firstAccount,
        secondParticipantId: firstParticipant,
      },
      now: input.now,
    });
    await client.query("COMMIT");
    committed = true;
    return { ok: true, value: undefined, event: event.event, replayed: false, alreadyApplied: false };
  } finally {
    try {
      if (!committed) {
        await client.query("ROLLBACK");
      }
    } finally {
      client.release();
    }
  }
}

function isEditable(row: PairingRow): boolean {
  return row.status === "pending" && row.player0_present_at === null && row.player1_present_at === null;
}
