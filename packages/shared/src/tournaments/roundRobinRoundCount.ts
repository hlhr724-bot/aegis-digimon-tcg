export function roundRobinRoundCount(participants: number): number {
  const field = Math.max(0, Math.trunc(participants));
  if (field < 2) return 0;
  return field % 2 === 0 ? field - 1 : field;
}
