import { DeckStatsWindow } from "@aegis/shared/decks/DeckStatsWindow";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";

const WINDOW_LABELS: Record<DeckStatsWindow, TranslationKey> = {
  [DeckStatsWindow.LAST_100.value]: "profile.deckStats.window.last100",
  [DeckStatsWindow.ALL.value]: "profile.deckStats.window.all",
};

type Props = { value: DeckStatsWindow; onChange: (statsWindow: DeckStatsWindow) => void };

export function DeckStatsWindowSelect({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="profile-filter profile-deck-window" role="group" aria-label={t("profile.deckStats.window")}>
      {Object.values(DeckStatsWindow).map((entry) => (
        <button
          key={entry.value}
          type="button"
          aria-pressed={value === entry.value}
          onClick={() => (value === entry.value ? undefined : onChange(entry.value))}
        >
          {t(WINDOW_LABELS[entry.value])}
        </button>
      ))}
    </div>
  );
}
