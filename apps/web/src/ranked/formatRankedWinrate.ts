type Params = { value: number | null; locale: string };

export function formatRankedWinrate({ value, locale }: Params) {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
}
