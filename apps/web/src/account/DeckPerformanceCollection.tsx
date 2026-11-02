import type { DeckPerformanceRecord } from "@aegis/shared/decks/DeckPerformanceRecord";
import type { DeckStatsWindow } from "@aegis/shared/decks/DeckStatsWindow";
import { DeckStatsWindowSelect } from "@/account/DeckStatsWindowSelect";
import { useTranslation } from "@/i18n/useTranslation";
import "@/account/deckPerformanceCollection.css";

type Props = {
  records: DeckPerformanceRecord[];
  statsWindow: DeckStatsWindow;
  onWindowChange: (statsWindow: DeckStatsWindow) => void;
  onSelect: (deckId: string) => void;
};

export function DeckPerformanceCollection({ records, statsWindow, onWindowChange, onSelect }: Props) {
  const { t, locale } = useTranslation();
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <details className="profile-deck-records" open>
      <summary>{t("profile.deckRecords.title")}</summary>
      <p>{t("profile.deckRecords.hint")}</p>
      <DeckStatsWindowSelect value={statsWindow} onChange={onWindowChange} />
      <ul>
        {records.map(({ deckId, name, stats }) => (
          <li key={deckId}>
            <button type="button" onClick={() => onSelect(deckId)}>
              {name}
            </button>
            <span>{t("profile.deckStats.matchCount", { count: stats.matches })}</span>
            <span>
              {t("profile.deckRecords.record", { wins: stats.wins, losses: stats.losses, draws: stats.draws })}
            </span>
            <strong>{format.format((stats.wins / stats.matches) * 100)}%</strong>
          </li>
        ))}
      </ul>
    </details>
  );
}
