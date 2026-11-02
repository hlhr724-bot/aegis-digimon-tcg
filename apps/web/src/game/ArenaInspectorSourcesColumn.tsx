import { useTranslation } from "@/i18n/useTranslation";
import { ArenaInspectorSourceEffect } from "@/game/ArenaInspectorSourceEffect";
import type { StackCard } from "@/game/overlay/types";

type Params = {
  cards: readonly StackCard[];
  onZoom: (cardId: string, artId?: string) => void;
};

export function ArenaInspectorSourcesColumn({ cards, onZoom }: Params) {
  const { t } = useTranslation();
  const heading = t(cards.length === 1 ? "overlay.sourceCountOne" : "overlay.sourceCountMany", { count: cards.length });
  return (
    <aside className="arena-permanent-inspector__sources" role="region" aria-label={heading} tabIndex={0}>
      <h3 className="arena-permanent-inspector__effect-label">{heading}</h3>
      {cards.map((card, index) => (
        <ArenaInspectorSourceEffect key={`${card.cardId}-${index}`} card={card} onZoom={onZoom} showThumbnail />
      ))}
    </aside>
  );
}
