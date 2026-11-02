import { PackOpeningPhase } from "@/packOpening/PackOpeningPhase";
import { CardRevealState } from "@/packOpening/scene/CardRevealState";

type Params = {
  index: number;
  revealedCount: number;
  phase: PackOpeningPhase;
};

export function getCardRevealState({ index, revealedCount, phase }: Params): CardRevealState {
  if (phase === PackOpeningPhase.BURST.value) {
    return CardRevealState.FOUNTAIN.value;
  }
  if (phase !== PackOpeningPhase.REVEALING.value && phase !== PackOpeningPhase.SUMMARY.value) {
    return CardRevealState.HIDDEN.value;
  }
  if (phase === PackOpeningPhase.SUMMARY.value || index < revealedCount - 1) {
    return CardRevealState.SLOT.value;
  }
  if (index === revealedCount - 1) {
    return CardRevealState.FOCUS.value;
  }
  return CardRevealState.STACK.value;
}
