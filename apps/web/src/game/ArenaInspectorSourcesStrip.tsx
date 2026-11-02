import { useState } from "react";
import { CardBack, CardFull } from "@/design/cards";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { ArenaInspectorSourceEffect } from "@/game/ArenaInspectorSourceEffect";
import type { StackCard } from "@/game/overlay/types";
import { stackCardCaption } from "@/game/overlay/viewer/stackCardCaption";
import { useCardTranslations } from "@/i18n/useCardTranslations";

type Params = {
  cards: readonly StackCard[];
  onZoom: (cardId: string, artId?: string) => void;
};

export function ArenaInspectorSourcesStrip({ cards, onZoom }: Params) {
  const { t } = useTranslation();
  const translations = useCardTranslations();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = Math.min(selectedIndex, cards.length - 1);
  const selected = cards[activeIndex];
  return (
    <section className="arena-permanent-inspector__mobile-sources">
      <h3 className="arena-permanent-inspector__effect-label">
        {t(cards.length === 1 ? "overlay.sourceCountOne" : "overlay.sourceCountMany", { count: cards.length })}
      </h3>
      <div
        className="arena-permanent-inspector__strip"
        role="group"
        aria-label={t(cards.length === 1 ? "overlay.sourceCountOne" : "overlay.sourceCountMany", {
          count: cards.length,
        })}
      >
        {cards.map((card, index) => (
          <button
            key={`${card.cardId}-${index}`}
            type="button"
            className="arena-permanent-inspector__source"
            aria-label={
              card.oncePerTurnUsed
                ? `${stackCardCaption(card, t, translations)}, ${t(card.role === "linked" ? "overlay.role.linkedUsed" : "overlay.role.inheritedUsed")}`
                : stackCardCaption(card, t, translations)
            }
            aria-pressed={activeIndex === index}
            data-once-per-turn-used={card.oncePerTurnUsed}
            onClick={() => setSelectedIndex(index)}
          >
            {card.cardId ? (
              <CardFull cardId={card.cardId} artId={card.artId} width={34} zoomOnHover={false} />
            ) : (
              <CardBack width={34} useSelectedSleeve={false} />
            )}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="arena-permanent-inspector__strip-detail">
          <ArenaInspectorSourceEffect card={selected} onZoom={onZoom} showThumbnail={false} />
          {selected.cardId ? (
            <button
              type="button"
              className="arena-permanent-inspector__source"
              aria-label={t("overlay.zoomCard")}
              onClick={() => onZoom(selected.cardId, selected.artId)}
            >
              <Icons.Maximize size={18} />
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
