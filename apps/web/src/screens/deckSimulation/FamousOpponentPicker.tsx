import { VALIDATED_FAMOUS_DECKS } from "@aegis/shared";
import { useTranslation } from "@/i18n/useTranslation";
import { famousDeckCoverCard } from "@/screens/deckSimulation/famousDeckCoverCard";
import { OpponentDeckTile } from "@/screens/deckSimulation/OpponentDeckTile";

interface FamousOpponentPickerProps {
  selected: string;
  disabled: boolean;
  onChange: (deckId: string) => void;
}

export function FamousOpponentPicker({ selected, disabled, onChange }: FamousOpponentPickerProps) {
  const { t } = useTranslation();
  return (
    <div className="deck-matchup__picker">
      <p className="deck-sim__hint">{t("deckMatchup.famous.hint")}</p>
      <ul className="opponent-grid" aria-label={t("deckMatchup.source.famous")}>
        {VALIDATED_FAMOUS_DECKS.map((deck) => (
          <OpponentDeckTile
            key={deck.deckId}
            name={deck.name}
            detail={deck.block}
            colors={deck.colors}
            coverCardId={famousDeckCoverCard(deck)}
            selected={deck.deckId === selected}
            disabled={disabled}
            label={t("deckMatchup.famous.deck", { name: deck.name, block: deck.block })}
            onToggle={() => onChange(deck.deckId)}
          />
        ))}
      </ul>
    </div>
  );
}
