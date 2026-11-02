import { useState } from "react";
import { cardImageUrls } from "@aegis/shared/cards/images";
import { CardFinish } from "@/packOpening/CardFinish";
import { getCardFinish } from "@/packOpening/getCardFinish";
import type { PackCard } from "@/packOpening/PackCard";

type Props = {
  card: PackCard;
  index: number;
  foilEnabled: boolean;
  onInspect: (index: number) => void;
};

export function PackResultCard({ card, index, foilEnabled, onInspect }: Props) {
  const [imageIndex, setImageIndex] = useState(0);
  const candidates = cardImageUrls(card.cardId, card.artId);
  const urls = card.artId ? candidates.slice(0, 2) : candidates;
  const finish = getCardFinish(card);
  return (
    <button
      type="button"
      className="pack-result-card"
      data-foil={!foilEnabled || finish.value === CardFinish.NONE.value ? undefined : finish.value}
      onClick={() => onInspect(index)}
      aria-label={`Zoom ${card.nameEn}${card.artId ? " AA" : ""}, card ${index + 1}`}
    >
      <span className="pack-result-card__art">
        {urls[imageIndex] ? (
          <img
            src={urls[imageIndex]}
            alt={card.nameEn}
            loading="lazy"
            onError={() => setImageIndex((current) => current + 1)}
          />
        ) : (
          <span>{card.nameEn}</span>
        )}
      </span>
      <span>{card.nameEn}</span>
      <small>
        {card.cardId} · {card.rarity}
        {card.artId ? " · AA" : ""}
      </small>
    </button>
  );
}
