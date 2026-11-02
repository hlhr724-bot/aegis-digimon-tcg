import { useTranslation } from "@/i18n/useTranslation";
import { countDeckCardTypes } from "@/screens/countDeckCardTypes";
import type { CountMap } from "@/screens/deckCounts";
import "@/screens/deckBuilder.css";

interface DeckTypeBreakdownProps {
  main: CountMap;
  egg: CountMap;
}

export function DeckTypeBreakdown({ main, egg }: DeckTypeBreakdownProps) {
  const { t } = useTranslation();
  const counts = countDeckCardTypes({ main, egg });
  const types = [
    { kind: "Digimon", label: t("library.kind.Digimon"), count: counts.Digimon },
    { kind: "Tamer", label: t("library.kind.Tamer"), count: counts.Tamer },
    { kind: "Option", label: t("library.kind.Option"), count: counts.Option },
    { kind: "Dual", label: t("deck.kindDual"), count: counts.Dual },
    { kind: "DigiEgg", label: t("library.kind.DigiEgg"), count: counts.DigiEgg },
  ].filter((type) => type.kind !== "Dual" || type.count > 0);
  return (
    <div>
      <div className="deck-stat-label">{t("library.cardType")}</div>
      <dl className="deck-type-breakdown">
        {types.map((type) => (
          <div key={type.kind} className="deck-type-breakdown__item">
            <dt>{type.label}</dt>
            <dd>{type.count}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
