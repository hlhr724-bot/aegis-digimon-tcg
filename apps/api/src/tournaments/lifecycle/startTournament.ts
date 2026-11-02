import type { AccountStore } from "#api/accounts/AccountStore";
import type { BotSeatingStore } from "#api/tournaments/bots/BotSeatingStore";
import type { EliminationStore } from "#api/tournaments/elimination/EliminationStore";
import { openEliminationEvent, type OpenEliminationOutcome } from "#api/tournaments/lifecycle/openEliminationEvent";
import type {
  ParticipantFailure,
  ParticipantRecord,
  ParticipantStore,
} from "#api/tournaments/participants/ParticipantStore";
import type { SwissProgram } from "#api/tournaments/swiss/SwissProgram";

type Params = {
  tournamentId: string;
  accounts: AccountStore;
  participants: ParticipantStore;
  bots: BotSeatingStore;
  elimination: EliminationStore;
  swiss: SwissProgram;
  now?: number;
};

export type StartTournamentOutcome =
  | { kind: "not_found" }
  | { kind: "elimination"; opened: OpenEliminationOutcome }
  | { kind: "swiss_check_in_failed"; reason: ParticipantFailure }
  | {
      kind: "swiss";
      participants: ParticipantRecord[];
      program: Awaited<ReturnType<SwissProgram["startTournamentProgram"]>>;
    };

export async function startTournament({
  tournamentId,
  accounts,
  participants,
  bots,
  elimination,
  swiss,
  now = Date.now(),
}: Params): Promise<StartTournamentOutcome> {
  const tournament = await accounts.tournament(tournamentId);
  if (!tournament) {
    return { kind: "not_found" };
  }
  if (tournament.structure === "single_elimination") {
    return {
      kind: "elimination",
      opened: await openEliminationEvent({ tournamentId, participants, bots, elimination, now }),
    };
  }
  const closed = await participants.closeCheckIn({ tournamentId, now });
  if (!closed.ok) {
    return { kind: "swiss_check_in_failed", reason: closed.reason };
  }
  return { kind: "swiss", participants: closed.value, program: await swiss.startTournamentProgram(tournamentId, now) };
}
