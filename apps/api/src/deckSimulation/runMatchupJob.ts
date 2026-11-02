import type { MatchupGameOutcome } from "#api/deckSimulation/MatchupGameOutcome";
import type { MatchupJobTask } from "#api/deckSimulation/MatchupJobTask";
import type { MatchupJobEnd } from "#api/deckSimulation/MatchupWorkerMessage";
import { runMatchupGame } from "#api/deckSimulation/runMatchupGame";

type PlayedGame = { index: number; opponentIndex: number; playerFirst: boolean; outcome: MatchupGameOutcome };

type Params = {
  task: MatchupJobTask;
  signal: AbortSignal;
  now?: () => number;
  onGame: (game: PlayedGame) => void;
};

export async function runMatchupJob({ task, signal, now = Date.now, onGame }: Params): Promise<MatchupJobEnd> {
  const { opponents, gamesPerOpponent } = task.request;
  const samplesPerOpponent = Math.max(1, Math.floor(task.sampleLimit / opponents.length));
  let recorded = 0;
  for (let opponentIndex = 0; opponentIndex < opponents.length; opponentIndex++) {
    for (let game = 0; game < gamesPerOpponent; game++) {
      if (signal.aborted) return "cancelled";
      if (now() >= task.deadlineEpochMs) return "timed-out";
      const index = opponentIndex * gamesPerOpponent + game;
      const playerFirst = game % 2 === 0;
      const recordReplay = game < samplesPerOpponent && recorded < task.sampleLimit;
      const outcome = await runMatchupGame({
        deck: task.request.deck,
        opponent: opponents[opponentIndex]!.deck,
        seed: (task.seed + index * 7919) >>> 0,
        playerFirst,
        recordReplay,
        signal,
      });
      if (signal.aborted) return "cancelled";
      if (recordReplay) recorded++;
      onGame({ index, opponentIndex, playerFirst, outcome });
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  return "completed";
}
