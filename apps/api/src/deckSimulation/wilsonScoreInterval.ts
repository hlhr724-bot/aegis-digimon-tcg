const Z_95 = 1.959964;

type Params = { points: number; games: number };

export function wilsonScoreInterval({ points, games }: Params): readonly [number, number] | null {
  if (games <= 0) {
    return null;
  }
  const rate = points / games;
  const zSquared = Z_95 * Z_95;
  const denominator = 1 + zSquared / games;
  const center = (rate + zSquared / (2 * games)) / denominator;
  const half = (Z_95 * Math.sqrt((rate * (1 - rate)) / games + zSquared / (4 * games * games))) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
