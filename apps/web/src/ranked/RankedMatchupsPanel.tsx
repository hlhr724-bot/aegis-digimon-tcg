import { useState } from "react";
import type { RankedMatchup } from "@aegis/shared/ranked/RankedContracts";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { useTranslation } from "@/i18n/useTranslation";
import { Button } from "@/design/primitives";

type Props = { format: string; region: string };

export function RankedMatchupsPanel({ format, region }: Props) {
  const { t, locale } = useTranslation();
  const [origin, setOrigin] = useState("ranked");
  const [days, setDays] = useState(56);
  const [page, setPage] = useState(1);
  const [now] = useState(Date.now);
  const query = new URLSearchParams({
    format,
    origin,
    page: String(page),
    from: String(now - days * 86_400_000),
    until: String(now),
  });
  if (region) {
    query.set("region", region);
  }
  const { data, error, refresh } = useRankedRequest<RankedMatchup[]>(`/ranked/matchups?${query}`);
  function getArchetype(name: string) {
    return name === "unknown" ? t("ranked.season.unknown") : name;
  }
  return (
    <section className="ranked-panel">
      <div className="ranked-filters ranked-filters--panel">
        <label>
          <span>{t("ranked.season.origin")}</span>
          <select
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value);
              setPage(1);
            }}
          >
            <option value="ranked">{t("ranked.season.ranked")}</option>
            <option value="tournament">{t("ranked.season.tournament")}</option>
          </select>
        </label>
        <label>
          <span>{t("ranked.season.period")}</span>
          <select
            value={days}
            onChange={(event) => {
              setDays(Number(event.target.value));
              setPage(1);
            }}
          >
            <option value={56}>{t("ranked.season.last56")}</option>
            <option value={28}>{t("ranked.season.last28")}</option>
          </select>
        </label>
      </div>
      <p className="ranked-muted">{t("ranked.season.sampleHelp")}</p>
      {error ? (
        <p role="alert">
          {t("ranked.season.error")} <Button onClick={refresh}>{t("ranked.season.retry")}</Button>
        </p>
      ) : null}
      {!data && !error ? <p role="status">{t("common.loading")}</p> : null}
      {data?.length === 0 ? <p className="ranked-empty">{t("ranked.season.empty")}</p> : null}
      {data?.length ? (
        <div className="ranked-table-scroll" tabIndex={0} role="region" aria-label={t("ranked.season.matchups")}>
          <table className="ranked-table">
            <caption>{t("ranked.season.matchups")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("ranked.season.archetype")}</th>
                <th scope="col">{t("ranked.season.opponent")}</th>
                <th scope="col">{t("ranked.season.sample")}</th>
                <th scope="col">{t("ranked.season.winrate")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={`${row.archetype}:${row.opponentArchetype}`}>
                  <th scope="row">{getArchetype(row.archetype)}</th>
                  <td>{getArchetype(row.opponentArchetype)}</td>
                  <td>
                    {row.games} / {row.players}
                  </td>
                  <td>
                    {row.winrate === null
                      ? t("ranked.season.insufficient")
                      : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
                          row.winrate,
                        )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="ranked-pagination">
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
          {t("ranked.season.previous")}
        </Button>
        <span>{page}</span>
        <Button variant="secondary" disabled={!data || data.length < 50} onClick={() => setPage((value) => value + 1)}>
          {t("ranked.season.next")}
        </Button>
      </div>
    </section>
  );
}
