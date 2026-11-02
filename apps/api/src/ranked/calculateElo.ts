type Params = { rating: number; opponentRating: number; score: 0 | 0.5 | 1 };

export function calculateElo({ rating, opponentRating, score }: Params): number {
  const expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400));
  return Math.max(0, Math.round(rating + 32 * (score - expected)));
}
