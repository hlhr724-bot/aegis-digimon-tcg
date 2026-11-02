import type { Seat } from "@aegis/shared/schema/enums";
import { MatchFinaleTone } from "@/game/match/finale/MatchFinaleTone";

type Params = {
  winnerSeat: Seat;
  viewerSeat: Seat;
  spectating: boolean;
};

export function resolveMatchFinaleTone({ winnerSeat, viewerSeat, spectating }: Params): MatchFinaleTone {
  if (spectating) {
    return MatchFinaleTone.WITNESS.value;
  }
  if (winnerSeat === viewerSeat) {
    return MatchFinaleTone.VICTORY.value;
  }
  return MatchFinaleTone.DEFEAT.value;
}
