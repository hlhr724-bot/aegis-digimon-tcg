import type { MatchReplay } from "@aegis/shared/replays";
import type { Seat } from "@aegis/shared/schema/enums";
import { gameOverSplash, isGameOverReason } from "@/game/gameOverSplash";

type Params = { replay: MatchReplay; viewerSeat: Seat };

export function getReplayResult({ replay, viewerSeat }: Params) {
  const event = replay.frames
    .flatMap((frame) => frame.events)
    .reverse()
    .find((entry) => entry.kind === "gameOver");
  let outcome: "win" | "loss" | "draw" = "draw";
  if (replay.winnerSeat >= 0) {
    outcome = replay.winnerSeat === viewerSeat ? "win" : "loss";
  }
  const splash = gameOverSplash(outcome, event?.kind === "gameOver" ? event.reason : "");
  return {
    ...splash,
    reasonKey: event?.kind === "gameOver" && isGameOverReason(event.reason) ? splash.reasonKey : undefined,
  };
}
