import { useEffect, useState } from "react";
import { getCardDefinition } from "@aegis/shared";
import { useCardImageUrls } from "@/design/tokenArt/useCardImageUrls";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";

type Props = { cardId: string; onOpenCard?: (cardId: string) => void };

export function LogCardThumbnail({ cardId, onOpenCard }: Props) {
  const translations = useCardTranslations();
  const urls = useCardImageUrls({ cardId });
  const [urlIndex, setUrlIndex] = useState(0);
  useEffect(() => setUrlIndex(0), [urls]);
  const definition = getCardDefinition(cardId);
  const name = definition ? getTranslatedCardName({ name: definition.nameEn, translations }) : cardId;
  const image =
    urlIndex < urls.length ? (
      <img
        src={urls[urlIndex]}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setUrlIndex((index) => index + 1)}
      />
    ) : null;
  if (!onOpenCard) {
    return (
      <span className="play-log__card" title={name}>
        {image}
      </span>
    );
  }
  return (
    <button type="button" className="play-log__card" title={name} aria-label={name} onClick={() => onOpenCard(cardId)}>
      {image}
    </button>
  );
}
