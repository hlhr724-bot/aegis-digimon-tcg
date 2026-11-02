import type { RankedSeason } from "@aegis/shared/ranked/RankedContracts";
import type { RankedDeckStats } from "@aegis/shared/ranked/RankedDeckStats";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";
import { useTranslation } from "@/i18n/useTranslation";
import { Button } from "@/design/primitives";

type Props = { season?: RankedSeason; format: string; region: string };
const COLORS = [
  "var(--ds-accent)",
  "var(--ranked-diamond)",
  "var(--ranked-gold)",
  "var(--ds-rim-ready)",
  "var(--ds-danger)",
  "var(--ranked-platinum)",
  "var(--ranked-bronze)",
  "var(--ranked-silver)",
];

export function RankedMetaPanel({ season, format, region }: Props) {
  const { t, locale } = useTranslation();
  const query = new URLSearchParams({ season: String(season?.id), format });
  if (region) {
    query.set("region", region);
  }
  const { data, error, refresh } = useRankedRequest<RankedDeckStats[]>(season ? `/ranked/meta?${query}` : null);
  const rows = data ?? [];
  const wins = rows.reduce((total, row) => total + row.wins, 0);
  const samples = rows.reduce((total, row) => total + row.games, 0);
  const distribution = rows.filter((row) => row.wins > 0);
  const circumference = 2 * Math.PI * 44;
  let offset = 0;
  const segments = distribution.map((row) => {
    const length = wins ? (row.wins / wins) * circumference : 0;
    const segment = { row, color: COLORS[rows.indexOf(row) % COLORS.length], offset, length };
    offset += length;
    return segment;
  });
  const successful = rows.filter((row) => row.winrate !== null).sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0));
  function getName(name: string) {
    return name === "unknown"
      ? t("ranked.season.unknown")
      : name.replace(/[_-]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase(locale));
  }
  return (
    <section className="ranked-panel ranked-meta" aria-label={t("ranked.meta.title")}>
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
              <h3>{t("ranked.meta.winning")}</h3>
              <p className="ranked-muted">{t("ranked.meta.share")}</p>
              {wins > 0 ? (
                <div className="ranked-meta__distribution">
                  <div className="ranked-meta__donut">
                    <svg viewBox="0 0 112 112" role="img" aria-label={t("ranked.meta.winning")}>
                      <circle className="ranked-meta__track" cx="56" cy="56" r="44" />
                      {segments.map(({ row, color, offset: start, length }) => (
                        <circle
                          key={row.archetype}
                          className="ranked-meta__segment"
                          cx="56"
                          cy="56"
                          r="44"
                          stroke={color}
                          strokeDasharray={`${Math.max(0, length - 1.5)} ${circumference}`}
                          strokeDashoffset={-start}
                          transform="rotate(-90 56 56)"
                        >
                          <title>{`${getName(row.archetype)} · ${formatRankedWinrate({ value: row.wins / wins, locale })}`}</title>
                        </circle>
                      ))}
                    </svg>
                    <div className="ranked-meta__donut-total" aria-hidden="true">
                      <strong>{wins.toLocaleString(locale)}</strong>
                      <span>{t("ranked.season.wins")}</span>
                    </div>
                  </div>
                  <ul>
                    {distribution.map((row) => (
                      <li key={row.archetype}>
                        <span
                          className="ranked-meta__dot"
                          style={{ background: COLORS[rows.indexOf(row) % COLORS.length] }}
                        />
                        <span className="ranked-meta__legend-name">
                          {getName(row.archetype)}
                          <small>
                            {row.wins.toLocaleString(locale)} {t("ranked.season.wins")}
                          </small>
                        </span>
                        <strong>{formatRankedWinrate({ value: row.wins / wins, locale })}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="ranked-empty">{t("ranked.season.empty")}</p>
              )}
            </section>
            <section className="ranked-meta__card">
              <h3>{t("ranked.meta.successful")}</h3>
              <p className="ranked-muted">{t("ranked.meta.minimum")}</p>
              {successful.length ? (
                <div>
                  <ul className="ranked-meta__bars">
                    {successful.slice(0, 6).map((row) => (
                      <li key={row.archetype}>
                        <span className="ranked-meta__bar-name">
                          <span
                            className="ranked-meta__dot"
                            style={{ background: COLORS[rows.indexOf(row) % COLORS.length] }}
                          />
                          {getName(row.archetype)}
                        </span>
                        <strong>{formatRankedWinrate({ value: row.winrate, locale })}</strong>
                        <div
                          className="ranked-meta__bar-track"
                          role="meter"
                          aria-label={getName(row.archetype)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={(row.winrate ?? 0) * 100}
                          aria-valuetext={formatRankedWinrate({ value: row.winrate, locale })}
                        >
                          <span
                            style={{
                              width: `${(row.winrate ?? 0) * 100}%`,
                              background: COLORS[rows.indexOf(row) % COLORS.length],
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
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
                    <th scope="col">{t("ranked.season.archetype")}</th>
                    <th scope="col">{t("ranked.meta.samples")}</th>
                    <th scope="col">{t("ranked.season.wins")}</th>
                    <th scope="col">{t("ranked.season.winrate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.archetype}>
                      <th scope="row">{getName(row.archetype)}</th>
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
          <p className="ranked-muted">{t("ranked.meta.note")}</p>
        </>
      ) : null}
    </section>
  );
}
