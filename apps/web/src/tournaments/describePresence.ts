import type { Translate } from "@/i18n/translationTypes";
import { formatTournamentTime } from "@/tournaments/formatTournamentTime";

type DescribePresenceParams = {
  player: string;
  at: number | null;
  locale: string;
  t: Translate;
};

export function describePresence({ player, at, locale, t }: DescribePresenceParams): string {
  if (at === null) {
    return t("tournaments.presence.notYet", { player });
  }
  return t("tournaments.presence.at", { player, time: formatTournamentTime({ epochMs: at, locale }) });
}
