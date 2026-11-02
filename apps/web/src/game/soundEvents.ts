import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
/* Maps observed match events to audio cues. Pure so the mapping and the
   repeat-suppression rule stay testable without Web Audio. */

import type { Seat, ServerEvent } from "@aegis/shared";
import type { SoundKind } from "../design/sound";

/**
 * A locally triggered cue (an intent handler) and the server echo of the same
 * action arrive as two observations. Suppressing a repeat of the same cue within
 * this window keeps one action to one sound.
 */
export const CUE_REPEAT_WINDOW_MS = 700;

export type CueTimestamps = Partial<Record<SoundKind, number>>;

/** The cue an event deserves, or null when the event has no audio. */
export function soundForEvent(event: ServerEvent, viewerSeat: Seat): SoundKind | null {
  switch (event.kind) {
    case "cardPlayed":
      return "cardPlay";
    case "digivolved":
      return "digivolve";
    case "hatched":
      return "hatch";
    // A redirect re-aims an attack that already sounded; it is not a second declaration.
    case "attackDeclared":
      return event.redirected === true ? null : "attackDeclare";
    // The shield breaking, which is the reveal — not the outcome the check settles on later.
    case "securityRevealed":
      return "securityHit";
    // Passing your own turn closes it; the opponent passing hands the turn to you.
    case "turnEnded":
      return event.endingSeat === viewerSeat ? "endTurn" : "turnChange";
    case "movedFromBreeding":
      return "move";
    case "blocked":
      return "block";
    case "barrierResolved":
    case "evadeResolved":
      return event.accepted ? "protect" : null;
    case "effectTriggered":
      return "effectActivate";
    case "deckShuffled":
      return "shuffle";
    case "cardsMoved":
      if (event.strippedStackTops) return "deDigivolve";
      if (
        event.trashedSources ||
        (event.to === "trash" &&
          (event.from === CardMovePosition.DIGIVOLUTION_CARDS.value ||
            event.from === CardMovePosition.LINKED_CARDS.value ||
            event.from === CardMovePosition.UNDER_TAMER.value))
      ) {
        return "sourceTrash";
      }
      if (event.to === "trash") return event.from === "hand" ? "handTrash" : "delete";
      return "move";
    case "gameOver":
      // A draw is not a victory, so it takes the losing cue.
      return event.result.outcome === "win" && event.result.winnerSeat === viewerSeat ? "win" : "lose";
    default:
      return null;
  }
}

export function shouldPlayCue(kind: SoundKind, nowMs: number, playedAt: Readonly<CueTimestamps>): boolean {
  const previous = playedAt[kind];
  return previous === undefined || nowMs - previous >= CUE_REPEAT_WINDOW_MS;
}
