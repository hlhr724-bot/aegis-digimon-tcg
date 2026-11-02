import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { RankedSeason } from "@aegis/shared/ranked/RankedContracts";
import type { RankedDeckStats } from "@aegis/shared/ranked/RankedDeckStats";
import type { ReactNode } from "react";
import { CommunityCard } from "@/community/CommunityCard";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { getArchetypeName } from "@/screens/community/getArchetypeName";
import { getWinrateTone } from "@/screens/community/getWinrateTone";

type CommunityMetaTableParams = {
  season: RankedSeason;
  format: DeckFormat;
  tools?: ReactNode;
};

export function CommunityMetaTable({ season, format, tools }: CommunityMetaTableParams) {
  const { t, locale } = useTranslation();
  const query = new URLSearchParams({ season: String(season.id), format });
  const { data, error, refresh } = useRankedRequest<RankedDeckStats[]>(`/ranked/meta?${query}`);
  const rows = [...(data ?? [])].sort((first, second) => second.games - first.games);
  const appearances = rows.reduce((total, row) => total + row.games, 0);
  const mostPlayed = rows[0]?.games ?? 0;
  const description = data
    ? t("community.meta.description", { count: appearances.toLocaleString(locale) })
    : t("ranked.meta.scope");
  return (
    <CommunityCard title={t("community.meta.title")} description={description} tools={tools}>
      {error ? (
        <div className="community-empty" role="alert">
          <p>{t("ranked.season.error")}</p>
          <Button size="sm" variant="secondary" onClick={refresh}>
            {t("ranked.season.retry")}
          </Button>
        </div>
      ) : null}
      {!data && !error ? <p role="status">{t("common.loading")}</p> : null}
      {data && rows.length === 0 ? <p className="community-muted">{t("ranked.season.empty")}</p> : null}
      {rows.length > 0 ? (
        <table className="community-meta-table">
          <caption className="aegis-sr-only">{t("community.meta.title")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("ranked.season.archetype")}</th>
              <th scope="col" className="community-meta-table__presence">
                {t("community.meta.presence")}
              </th>
              <th scope="col" className="community-meta-table__number">
                {t("community.meta.usage")}
              </th>
              <th scope="col" className="community-meta-table__number">
                {t("ranked.season.winrate")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.archetype}>
                <th scope="row">
                  {getArchetypeName({ name: row.archetype, locale, unknownLabel: t("ranked.season.unknown") })}
                </th>
                <td className="community-meta-table__presence">
                  <span className="community-bar" aria-hidden="true">
                    <span style={{ width: `${mostPlayed ? (row.games / mostPlayed) * 100 : 0}%` }} />
                  </span>
                </td>
                <td className="community-meta-table__number">
                  {formatRankedWinrate({ value: appearances ? row.games / appearances : 0, locale })}
                </td>
                <td
                  className="community-meta-table__number community-winrate"
                  data-tone={getWinrateTone(row.winrate)}
                  title={row.winrate === null ? t("ranked.season.insufficient") : undefined}
                >
                  {formatRankedWinrate({ value: row.winrate, locale })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {rows.length > 0 ? <p className="community-muted community-meta-note">{t("ranked.meta.minimum")}</p> : null}
    </CommunityCard>
  );
}
