import { drawsBeforeTurn } from "#shared/decks/goldfish/drawsBeforeTurn";
import { goldfishHitProbability } from "#shared/decks/goldfish/goldfishHitProbability";

type Params = {
  deckSize: number;
  groups: readonly number[];
  goingFirst: boolean;
  mulligan: boolean;
  lastTurn: number;
};

export function goldfishTurnCurve({ deckSize, groups, goingFirst, mulligan, lastTurn }: Params): number[] {
  return Array.from({ length: lastTurn + 1 }, (_, turn) =>
    goldfishHitProbability({ deckSize, groups, draws: drawsBeforeTurn({ turn, goingFirst }), mulligan }),
  );
}
