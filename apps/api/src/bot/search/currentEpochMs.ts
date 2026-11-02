export function currentEpochMs(): number {
  return performance.timeOrigin + performance.now();
}
