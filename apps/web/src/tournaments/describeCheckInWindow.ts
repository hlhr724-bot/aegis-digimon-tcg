import type { Translate } from "@/i18n/translationTypes";
import { formatTournamentDateTime } from "@/tournaments/formatTournamentDateTime";
import { formatTournamentTime } from "@/tournaments/formatTournamentTime";
import type { TournamentWindows } from "@/tournaments/types";

type DescribeCheckInWindowParams = {
  windows: TournamentWindows | undefined;
  locale: string;
  t: Translate;
};

export function describeCheckInWindow({ windows, locale, t }: DescribeCheckInWindowParams): string | undefined {
  const opensAt = windows?.checkInOpensAt ?? null;
  const closesAt = windows?.checkInClosesAt ?? null;
  if (closesAt === null) {
    return undefined;
  }
  const closes = formatTournamentTime({ epochMs: closesAt, locale });
  if (opensAt === null) {
    return t("tournaments.catalog.until", { time: closes });
  }
  return t("tournaments.signup.window", { opens: formatTournamentDateTime({ epochMs: opensAt, locale }), closes });
}
