import { accountStore } from "../accounts/runtime.js";
import { ArbitrationService } from "./arbitration/index.js";
import { BotMatchDriver, type BotMatchDriverOptions, BotSeatingStore, createBotMatchSweep } from "./bots/index.js";
import { EliminationStore } from "./elimination/index.js";
import { ParticipantStore } from "./participants/index.js";
import { DeadlineScheduler } from "./scheduler/index.js";
import { SeriesStore } from "./series/index.js";
import { SwissProgram } from "./swiss/index.js";
import { TopCutProgram } from "./topcut/index.js";

// One instance per process, sharing the AccountStore's connection pool and migration run.
export const participantStore = new ParticipantStore(accountStore);
export const seriesStore = new SeriesStore(accountStore);
export const swissProgram = new SwissProgram(accountStore, seriesStore);
export const deadlineScheduler = new DeadlineScheduler(accountStore, seriesStore);
export const eliminationStore = new EliminationStore(accountStore);
export const botSeatingStore = new BotSeatingStore(accountStore);
export const topCutProgram = new TopCutProgram(accountStore, eliminationStore);
export const arbitrationService = new ArbitrationService(
  accountStore,
  participantStore,
  seriesStore,
  swissProgram,
  eliminationStore,
);

// The low-latency trigger for closing a Swiss round: whenever a confrontation resolves — by score,
// by deadline, whatever settles it — the program is asked whether the round it belonged to is now
// complete. `AegisRoom` therefore still reports one game and learns nothing about rounds, and the
// close is idempotent, so a scheduler may ask the same question again without double-applying it.
//
// This notification is an optimisation, NOT the guarantee: it lives in one process's memory and is
// lost to a crash between the series commit and this call. `SwissProgram.sweepOpenTournaments` is
// the guarantee, and the reason a lost notification costs latency rather than a stalled tournament.
// Every failure is logged rather than discarded — a reason nobody reads is a tournament nobody
// notices has stopped.
seriesStore.addResolutionListener(async ({ matchId, tournamentId }) => {
  const closed = await swissProgram.onSeriesResolved(matchId);
  if (!closed.ok) {
    console.error(
      `[tournaments] round close after match ${matchId} of ${tournamentId} failed: ${closed.reason} ${closed.detail ?? ""}`,
    );
    return;
  }
  // The last Swiss round parks its phase in `frozen` and stops. Cutting straight away is what makes
  // the Top Cut appear the instant the Swiss phase ends rather than on the next worker tick; the
  // sweep still owns the guarantee, so a failure here is logged and left for it to retry.
  if (closed.value.kind !== "phase_frozen_for_top_cut") return;
  const cut = await topCutProgram.startTopCut(tournamentId, Date.now(), true);
  if (!cut.ok) console.error(`[tournaments] top cut for ${tournamentId} failed: ${cut.reason} ${cut.detail ?? ""}`);
});

// The same trigger for the other format. Both listeners are registered because a resolution has to
// reach whichever format the match belongs to, and neither of them can tell from here which that
// is: each scopes itself by phase and no-ops for a match that is not its own. Registering one and
// forgetting the other is a whole format that silently stops progressing, which is exactly what a
// single-slot listener made easy to do.
seriesStore.addResolutionListener(({ seriesId }) => eliminationStore.onSeriesResolvedById(seriesId));

/**
 * The driver for bot seats, built on demand.
 *
 * Lazy because its gateway reaches into the live room registry, and `AegisRoom` imports this module
 * for `seriesStore`. Deferring the import to first use breaks that cycle without either module
 * having to know about the other at load time.
 */
export async function botMatchDriver(options: BotMatchDriverOptions = {}): Promise<BotMatchDriver> {
  const { createColyseusBotRoomGateway } = await import("./bots/colyseusRoomGateway.js");
  return new BotMatchDriver(accountStore, seriesStore, createColyseusBotRoomGateway(accountStore), options);
}

/**
 * The reconciliation pass that actually gets bots into rooms. Composed into the deadline worker's
 * sweep, alongside the Swiss round-close sweep: without it a bot is seated in a bracket and then
 * waits for somebody to notice, which is nobody.
 */
export const driveBotMatches = createBotMatchSweep({ accounts: accountStore, driver: () => botMatchDriver() });
