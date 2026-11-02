import type { RankedStanding } from "@aegis/shared/ranked/RankedContracts";
import { useTranslation } from "@/i18n/useTranslation";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";

type Props = { entries: RankedStanding[]; mineId?: string; onSelect?: (entry: RankedStanding) => void };

export function RankedPodium({ entries, mineId, onSelect }: Props) {
  const { t, locale } = useTranslation();
  return (
    <ol className="ranked-podium" aria-label={t("ranked.season.podium")}>
      {entries.map((entry) => (
        <li
          key={entry.accountId}
          className="ranked-podium__entry"
          data-place={entry.position}
          data-mine={entry.accountId === mineId || undefined}
        >
          <span className="ranked-podium__place">{entry.position}</span>
          <span className="ranked-avatar ranked-equipped" data-tier={entry.tier} aria-hidden="true">
            {entry.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="ranked-podium__identity">
            <button type="button" className="ranked-podium__player" onClick={() => onSelect?.(entry)}>
              {entry.displayName}
            </button>
          </div>
          <dl className="ranked-podium__stats">
            <div className="ranked-podium__rating">
              <dt>{t("ranked.season.rating")}</dt>
              <dd>{entry.rating.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t("ranked.season.record")}</dt>
              <dd>
                {entry.wins} / {entry.losses} / {entry.draws}
              </dd>
            </div>
            <div>
              <dt>{t("ranked.season.winrate")}</dt>
              <dd>{formatRankedWinrate({ value: entry.winrate, locale })}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
