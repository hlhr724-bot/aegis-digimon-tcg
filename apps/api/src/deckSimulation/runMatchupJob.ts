import type { MatchupGameOutcome } from "#api/deckSimulation/MatchupGameOutcome";
import type { MatchupJobTask } from "#api/deckSimulation/MatchupJobTask";
import type { MatchupJobEnd } from "#api/deckSimulation/MatchupWorkerMessage";
import { runMatchupGame } from "#api/deckSimulation/runMatchupGame";

type Params = {
  task: MatchupJobTask;
  signal: AbortSignal;
  now?: () => number;
  onGame: (game: { index: number; playerFirst: boolean; outcome: MatchupGameOutcome }) => void;
};

export async function runMatchupJob({ task, signal, now = Date.now, onGame }: Params): Promise<MatchupJobEnd> {
  for (let index = 0; index < task.request.games; index++) {
    if (signal.aborted) return "cancelled";
    if (now() >= task.deadlineEpochMs) return "timed-out";
    const playerFirst = index % 2 === 0;
    const outcome = await runMatchupGame({
      deck: task.request.deck,
      opponent: task.request.opponent,
      seed: (task.seed + index * 7919) >>> 0,
      playerFirst,
      recordReplay: index < task.sampleLimit,
      signal,
    });
    if (signal.aborted) return "cancelled";
    onGame({ index, playerFirst, outcome });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return "completed";
}
