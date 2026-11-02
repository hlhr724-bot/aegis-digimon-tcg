import { describe, expect, it } from "vitest";
import { getAgendaDayLabel } from "@/home/getAgendaDayLabel";
import type { TranslationKey } from "@/i18n/translationTypes";

const t = (key: TranslationKey) => key;
const now = new Date(2026, 9, 30, 21, 0).getTime();

describe("the agenda day label", () => {
  it("names today and tomorrow", () => {
    expect(getAgendaDayLabel({ startsAt: new Date(2026, 9, 30, 23, 30).getTime(), now, locale: "en", t })).toBe(
      "home.agenda.today",
    );
    expect(getAgendaDayLabel({ startsAt: new Date(2026, 9, 31, 0, 30).getTime(), now, locale: "en", t })).toBe(
      "home.agenda.tomorrow",
    );
  });

  it("falls back to the weekday and date for later days", () => {
    const startsAt = new Date(2026, 10, 3, 18, 0).getTime();
    expect(getAgendaDayLabel({ startsAt, now, locale: "en", t })).toBe(
      new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric" }).format(startsAt),
    );
  });
});
