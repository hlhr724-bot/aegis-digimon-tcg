import type { Translate } from "@/i18n/translationTypes";
import type { ApiError } from "@/tournaments/client";
import { reasonKey } from "@/tournaments/labels";

type DescribeTournamentErrorParams = { error: ApiError; t: Translate };

export function describeTournamentError({ error, t }: DescribeTournamentErrorParams): string {
  const key = reasonKey(error.code);
  return key ? t(key) : t("tournaments.reason.unknown", { code: error.code });
}
