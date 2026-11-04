type Params = { turn: number; goingFirst: boolean };

export function drawsBeforeTurn({ turn, goingFirst }: Params): number {
  if (!Number.isSafeInteger(turn) || turn < 0) {
    throw new Error("Goldfish turn must be a nonnegative integer");
  }
  if (turn === 0) {
    return 0;
  }
  return goingFirst ? turn - 1 : turn;
}
