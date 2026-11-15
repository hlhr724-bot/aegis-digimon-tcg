import type { RankedSeason } from "@aegis/shared/ranked/RankedContracts";
import type { RankedDeckStats } from "@aegis/shared/ranked/RankedDeckStats";
import type { RankedDeckSort } from "@/ranked/RankedDeckSort";
import { RankedDeckIdentity } from "@/ranked/RankedDeckIdentity";
import { getRankedDeckFill } from "@/ranked/getRankedDeckFill";
import { sortRankedDeckStats } from "@/ranked/sortRankedDeckStats";
import { Icons } from "@/design/icons";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";
import { useTranslation } from "@/i18n/useTranslation";
import { Button } from "@/design/primitives";
import { useState, type CSSProperties } from "react";

type Props = { season?: RankedSeason; format: string };
type DeckBar = { row: RankedDeckStats; value: number; width: number };

const CHART_LIMIT = 10;
const PAGE_SIZE = 10;
const STAGGER_MS = 50;
const SORT_COLUMNS = [
  { column: "archetype", label: "ranked.season.archetype" },
  { column: "games", label: "ranked.meta.samples" },
  { column: "wins", label: "ranked.season.wins" },
  { column: "winrate", label: "ranked.season.winrate" },
] as const;

export function RankedMetaPanel({ season, format }: Props) {
  const { t, locale } = useTranslation();
  const [active, setActive] = useState<string | null>(null);
  const [sort, setSort] = useState<RankedDeckSort>({ column: "games", descending: true });
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ season: String(season?.id), format });
  const { data, error, refresh } = useRankedRequest<RankedDeckStats[]>(season ? `/ranked/meta?${query}` : null);
  const rows = data ?? [];
  const wins = rows.reduce((total, row) => total + row.wins, 0);
  const samples = rows.reduce((total, row) => total + row.games, 0);
  const mostPlayed = sortRankedDeckStats({ rows, sort: { column: "games", descending: true }, locale }).slice(
    0,
    CHART_LIMIT,
  );
  const largestSample = mostPlayed[0]?.games ?? 0;
  const played: DeckBar[] = mostPlayed.map((row) => ({
    row,
    value: samples ? row.games / samples : 0,
    width: largestSample ? row.games / largestSample : 0,
  }));
  const successful: DeckBar[] = sortRankedDeckStats({ rows, sort: { column: "winrate", descending: true }, locale })
    .filter((row) => row.winrate !== null)
    .slice(0, CHART_LIMIT)
    .map((row) => ({ row, value: row.winrate ?? 0, width: row.winrate ?? 0 }));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = sortRankedDeckStats({ rows, sort, locale }).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function changeSort(column: RankedDeckSort["column"]) {
    setSort((current) => ({
      column,
      descending: current.column === column ? !current.descending : column !== "archetype",
    }));
    setPage(1);
  }
  function getSortState(column: RankedDeckSort["column"]) {
    if (sort.column !== column) {
      return "none";
    }
    return sort.descending ? "descending" : "ascending";
  }
  function getName(name: string) {
    return name === "unknown" ? t("ranked.season.unknown") : name;
  }
  function renderBars(bars: DeckBar[], kind: "share" | "rate") {
    return (
      <ul className="ranked-meta__bars">
        {bars.map(({ row, value, width }, index) => (
          <li
            key={row.archetype}
            data-active={active === row.archetype || undefined}
            onPointerEnter={() => setActive(row.archetype)}
            onPointerLeave={() => setActive(null)}
            style={{ "--ranked-meta-delay": `${index * STAGGER_MS}ms` } as CSSProperties}
          >
            <RankedDeckIdentity
              name={getName(row.archetype)}
              coverCardId={row.coverCardId}
              colors={row.colors}
              detail={t("ranked.meta.appearanceCount", { count: row.games.toLocaleString(locale) })}
            />
            <strong>{formatRankedWinrate({ value, locale })}</strong>
            <div
              className="ranked-meta__bar-track"
              data-kind={kind}
              role="meter"
              aria-label={getName(row.archetype)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value * 100}
              aria-valuetext={formatRankedWinrate({ value, locale })}
            >
              <span style={{ width: `${width * 100}%`, background: getRankedDeckFill({ colors: row.colors }) }} />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section
      className="ranked-panel ranked-meta"
      aria-label={t("ranked.meta.title")}
      data-focused={active ? true : undefined}
    >
      <div>
        <h2>{t("ranked.meta.title")}</h2>
        <p className="ranked-muted">{t("ranked.meta.scope")}</p>
      </div>
      {error ? (
        <p role="alert">
          {t("ranked.season.error")} <Button onClick={refresh}>{t("ranked.season.retry")}</Button>
        </p>
      ) : null}
      {!data && !error ? <p role="status">{t("common.loading")}</p> : null}
      {data ? (
        <>
          <dl className="ranked-meta__totals">
            <div>
              <dt>{t("ranked.meta.samples")}</dt>
              <dd>{samples.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t("ranked.season.wins")}</dt>
              <dd>{wins.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t("ranked.meta.archetypes")}</dt>
              <dd>{rows.filter((row) => row.archetype !== "unknown").length}</dd>
            </div>
          </dl>
          <div className="ranked-meta__charts">
            <section className="ranked-meta__card">
              <h3>{t("ranked.meta.played")}</h3>
              <p className="ranked-muted">{t("ranked.meta.share")}</p>
              {played.length ? renderBars(played, "share") : <p className="ranked-empty">{t("ranked.season.empty")}</p>}
            </section>
            <section className="ranked-meta__card">
              <h3>{t("ranked.meta.successful")}</h3>
              <p className="ranked-muted">{t("ranked.meta.minimum")}</p>
              {successful.length ? (
                <div>
                  {renderBars(successful, "rate")}
                  <div className="ranked-meta__axis" aria-hidden="true">
                    {[0, 0.5, 1].map((value) => (
                      <span key={value}>{formatRankedWinrate({ value, locale })}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="ranked-empty">{t("ranked.season.insufficient")}</p>
              )}
            </section>
          </div>
          {rows.length ? (
            <div className="ranked-table-scroll" tabIndex={0} role="region" aria-label={t("ranked.meta.title")}>
              <table className="ranked-table">
                <caption>{t("ranked.meta.title")}</caption>
                <thead>
                  <tr>
                    {SORT_COLUMNS.map(({ column, label }) => (
                      <th key={column} scope="col" aria-sort={getSortState(column)}>
                        <button type="button" className="ranked-table__sort" onClick={() => changeSort(column)}>
                          {t(label)}
                          {getSortState(column) === "ascending" ? <Icons.ChevronUp size={14} /> : null}
                          {getSortState(column) === "descending" ? <Icons.ChevronDown size={14} /> : null}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.archetype}>
                      <th scope="row">
                        <RankedDeckIdentity
                          name={getName(row.archetype)}
                          coverCardId={row.coverCardId}
                          colors={row.colors}
                        />
                      </th>
                      <td>{row.games.toLocaleString(locale)}</td>
                      <td>{row.wins.toLocaleString(locale)}</td>
                      <td>
                        {row.winrate === null
                          ? t("ranked.season.insufficient")
                          : formatRankedWinrate({ value: row.winrate, locale })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {pages > 1 ? (
            <div className="ranked-pagination">
              <Button variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
                {t("ranked.season.previous")}
              </Button>
              <span>
                {page} / {pages}
              </span>
              <Button variant="secondary" disabled={page === pages} onClick={() => setPage((value) => value + 1)}>
                {t("ranked.season.next")}
              </Button>
            </div>
          ) : null}
          <p className="ranked-muted">{t("ranked.meta.note")}</p>
        </>
      ) : null}
    </section>
  );
}
