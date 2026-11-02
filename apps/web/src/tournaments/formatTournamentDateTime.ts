type FormatTournamentDateTimeParams = {
  epochMs: number;
  locale: string;
};

export function formatTournamentDateTime({ epochMs, locale }: FormatTournamentDateTimeParams): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(epochMs);
}
