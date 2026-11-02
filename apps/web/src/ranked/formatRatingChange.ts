export function formatRatingChange(change: number): string {
  if (change > 0) {
    return `+${change}`;
  }
  return String(change);
}
