export function getEliminationRoundTitle(matchCount: number): string {
  if (matchCount === 1) {
    return "Final";
  }
  if (matchCount === 2) {
    return "Semifinals";
  }
  if (matchCount === 4) {
    return "Quarterfinals";
  }
  return `Round of ${matchCount * 2}`;
}
