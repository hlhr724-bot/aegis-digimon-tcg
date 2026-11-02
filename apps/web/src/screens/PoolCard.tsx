import { useCardImageLanguage } from "@/screens/cardLanguage/useCardImageLanguage";
import { findCardArtForLanguage } from "@aegis/shared/cards/findCardArtForLanguage";
/* One card in the builder's pool, with the steppers that add or remove copies. */

import { useState } from "react";
import { formatCopyLimit, formatRestrictionLabel, type DeckFormat } from "@aegis/shared";
import { CardFull } from "../design/cards";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";
import { isBetaCard } from "@/screens/isBetaCard";
import "./deckBuilder.css";

export function PoolCard({
  cardId,
  format = "standard",
  inDeck,
  atMax,
  pairConflict,
  onAdd,
  onRemove,
  onOpen,
  selected,
}: {
  cardId: string;
  format?: DeckFormat;
  inDeck: number;
  atMax: boolean;
  pairConflict: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onOpen: () => void;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const language = useCardImageLanguage();
  const [hover, setHover] = useState(false);
  const banLabel = pairConflict ? t("deck.pairBadge") : formatRestrictionLabel(cardId, format);
  const banned = formatCopyLimit(cardId, format) === 0;
  const blocked = banned || pairConflict;
  const hasCopies = inDeck > 0;
  const beta = isBetaCard(cardId);
  return (
    <div
      className="deck-pool-card"
      data-hover={hover}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="deck-pool-card__art">
        <CardFull
          cardId={cardId}
          artId={findCardArtForLanguage({ cardId, language })?.artId}
          width={132}
          selected={selected}
          count={hasCopies ? inDeck : undefined}
          dim={banned}
          onClick={() => {
            if (!blocked && !atMax) onAdd();
          }}
        />
        {blocked ? <div className="deck-pool-card__tint" /> : null}
      </div>
      {banLabel || beta ? (
        <div className="deck-pool-card__badges">
          {banLabel ? (
            <div className="deck-pool-card__restriction" data-tone={blocked ? "danger" : "warning"}>
              {banLabel}
            </div>
          ) : null}
          {beta ? (
            <div className="deck-pool-card__restriction" data-tone="beta" title={t("beta.cardHint")}>
              {t("beta.tag")}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        className="deck-pool-card__info"
        data-shifted={Boolean(banLabel || beta)}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label={t("deck.cardInfo")}
        title={t("deck.cardDetails")}
      >
        ℹ
      </button>
      <div className="deck-pool-card-actions">
        {hasCopies ? (
          <div className="deck-pool-card-stepper">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label={t("common.remove")}
            >
              −
            </button>
            <span aria-label={`${inDeck}`}>{inDeck}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              aria-label={t("common.add")}
              disabled={atMax || banned}
            >
              +
            </button>
          </div>
        ) : (
          <button
            className="deck-pool-card__add"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            disabled={atMax || banned}
          >
            <Icons.Plus size={14} />
            {banned ? t("common.banned") : atMax ? t("common.max") : t("common.add")}
          </button>
        )}
      </div>
    </div>
  );
}
