const FIRST_SUNDAY_UTC = Date.UTC(2026, 0, 4);
const DAY_MS = 86_400_000;

export function formatCircuitWeekday(weekday: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(FIRST_SUNDAY_UTC + weekday * DAY_MS);
}
