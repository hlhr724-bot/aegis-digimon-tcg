import type { AccountStore } from "#api/accounts/AccountStore";
import { logError } from "#api/logger";
import type { BotSeatingStore } from "#api/tournaments/bots/BotSeatingStore";
import type { EliminationStore } from "#api/tournaments/elimination/EliminationStore";
import { startTournament, type StartTournamentOutcome } from "#api/tournaments/lifecycle/startTournament";
import type { ParticipantStore } from "#api/tournaments/participants/ParticipantStore";
import type { SwissProgram } from "#api/tournaments/swiss/SwissProgram";

type Params = {
  accounts: AccountStore;
  participants: ParticipantStore;
  bots: BotSeatingStore;
  elimination: EliminationStore;
  swiss: SwissProgram;
  now: number;
};

const TOURNAMENTS_PER_SWEEP = 20;
const MIN_SWISS_FIELD = 2;

export async function startDueTournaments(params: Params): Promise<number> {
  const { accounts, participants, now } = params;
  await accounts.ensureReady();
  const due = (
    await accounts.pool.query<{ id: string; structure: string }>(
      `SELECT id, structure FROM tournaments
       WHERE auto_start AND status IN ('registration','check_in') AND starts_at<=$1
       ORDER BY starts_at, id LIMIT ${TOURNAMENTS_PER_SWEEP}`,
      [now],
    )
  ).rows;
  let started = 0;
  for (const tournament of due) {
    const tournamentId = String(tournament.id);
    try {
      if (tournament.structure === "swiss" && (await confirmedField(accounts, tournamentId)) < MIN_SWISS_FIELD) {
        await participants.cancelTournament({ tournamentId, reason: "below_minimum", now });
        continue;
      }
      const outcome = await startTournament({ ...params, tournamentId });
      if (isRunning(outcome)) {
        started += 1;
      } else if (!isCancelled(outcome)) {
        logError(`[tournaments] auto-start of ${tournamentId} did not run`, new Error(describe(outcome)));
      }
    } catch (error) {
      logError(`[tournaments] auto-start of ${tournamentId} failed`, error);
    }
  }
  return started;
}

async function confirmedField(accounts: AccountStore, tournamentId: string): Promise<number> {
  const row = (
    await accounts.pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id=$1 AND status IN ('checked_in','active')",
      [tournamentId],
    )
  ).rows[0];
  return Number(row?.count ?? 0);
}

function isRunning(outcome: StartTournamentOutcome): boolean {
  if (outcome.kind === "elimination") {
    return outcome.opened.kind === "running";
  }
  return outcome.kind === "swiss" && outcome.program.ok;
}

function isCancelled(outcome: StartTournamentOutcome): boolean {
  return outcome.kind === "elimination" && outcome.opened.kind === "cancel";
}

function describe(outcome: StartTournamentOutcome): string {
  if (outcome.kind === "elimination") {
    return outcome.opened.kind === "running" ? "running" : `${outcome.opened.kind}:${outcome.opened.reason}`;
  }
  if (outcome.kind === "swiss") {
    return outcome.program.ok ? "running" : outcome.program.reason;
  }
  if (outcome.kind === "swiss_check_in_failed") {
    return outcome.reason;
  }
  return outcome.kind;
}
