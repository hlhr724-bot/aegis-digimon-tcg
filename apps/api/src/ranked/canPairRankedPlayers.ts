type Entry = { rating: number; queuedAt: number; region: string; format: string; slot: string };
type Params = { first: Entry; second: Entry; now: number };

export function canPairRankedPlayers({ first, second, now }: Params): boolean {
  if (first.format !== second.format || first.slot !== second.slot) {
    return false;
  }
  const waited = Math.max(0, Math.min(now - first.queuedAt, now - second.queuedAt));
  const spread = Math.min(400, 100 + Math.floor(waited / 30_000) * 50);
  return Math.abs(first.rating - second.rating) <= spread && (first.region === second.region || waited >= 60_000);
}
