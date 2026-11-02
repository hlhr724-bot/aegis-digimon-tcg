import type { Translate } from "@/i18n/translationTypes";

type AgendaDayLabelParams = {
  startsAt: number;
  now: number;
  locale: string;
  t: Translate;
};

const DAY_MS = 86_400_000;

export function getAgendaDayLabel({ startsAt, now, locale, t }: AgendaDayLabelParams): string {
  const start = new Date(startsAt);
  const today = new Date(now);
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) {
    return t("home.agenda.today");
  }
  if (days === 1) {
    return t("home.agenda.tomorrow");
  }
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(new Date(startsAt));
}
