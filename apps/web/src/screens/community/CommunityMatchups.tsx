import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { RankedMatchup } from "@aegis/shared/ranked/RankedContracts";
import { useState } from "react";
import { CommunityCard } from "@/community/CommunityCard";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { getArchetypeName } from "@/screens/community/getArchetypeName";
import { getWinrateTone } from "@/screens/community/getWinrateTone";

const MATCHUP_DAYS = 28;
const MATCHUP_LIMIT = 8;
const DAY_MS = 86_400_000;

type CommunityMatchupsParams = {
  format: DeckFormat;
};

export function CommunityMatchups({ format }: CommunityMatchupsParams) {
  const { t, locale } = useTranslation();
  const [now] = useState(Date.now);
  const query = new URLSearchParams({
    format,
    origin: "ranked",
    page: "1",
    from: String(now - MATCHUP_DAYS * DAY_MS),
    until: String(now),
  });
  const { data, error, refresh } = useRankedRequest<RankedMatchup[]>(`/ranked/matchups?${query}`);
  const rows = (data ?? [])
    .filter((row) => row.winrate !== null)
    .sort((first, second) => second.games - first.games)
    .slice(0, MATCHUP_LIMIT);
  const getName = (name: string) => getArchetypeName({ name, locale, unknownLabel: t("ranked.season.unknown") });
  return (
    <CommunityCard title={t("ranked.season.matchups")} description={t("ranked.season.last28")}>
      {error ? (
        <div className="community-empty" role="alert">
          <p>{t("ranked.season.error")}</p>
          <Button size="sm" variant="secondary" onClick={refresh}>
            {t("ranked.season.retry")}
          </Button>
        </div>
      ) : null}
      {!data && !error ? <p role="status">{t("common.loading")}</p> : null}
      {data && rows.length === 0 ? (
        <p className="community-muted">
          {data.length === 0 ? t("ranked.season.empty") : t("ranked.season.insufficient")}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="community-list">
          {rows.map((row) => (
            <li
              key={`${row.archetype}:${row.opponentArchetype}`}
              className="community-matchup"
              title={`${t("ranked.season.sample")}: ${row.games} / ${row.players}`}
            >
              <span className="community-matchup__names">
                {t("community.meta.versus", {
                  deck: getName(row.archetype),
                  opponent: getName(row.opponentArchetype),
                })}
              </span>
              <span className="community-matchup__bar" aria-hidden="true">
                <span style={{ width: `${(row.winrate ?? 0) * 100}%` }} />
              </span>
              <span className="community-winrate" data-tone={getWinrateTone(row.winrate)}>
                {formatRankedWinrate({ value: row.winrate, locale })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </CommunityCard>
  );
}
