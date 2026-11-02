export function getWeeklySyncPeriod(now: Date): string {
  const scheduled = new Date(now);
  scheduled.setUTCDate(scheduled.getUTCDate() - scheduled.getUTCDay());
  scheduled.setUTCHours(6, 0, 0, 0);
  if (scheduled.getTime() > now.getTime()) {
    scheduled.setUTCDate(scheduled.getUTCDate() - 7);
  }
  return scheduled.toISOString();
}
