type TournamentTimeParams = {
  epochMs: number;
  locale: string;
};

export function formatTournamentTime({ epochMs, locale }: TournamentTimeParams): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(epochMs);
}
