import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useState } from "react";

import { CardZoomPreview } from "@/design/CardZoomPreview";
import { useHoverZoomEnabled } from "@/design/useHoverZoomEnabled";

type Props = { cardId: string };

export function DeckGuideCardChip({ cardId }: Props) {
  const getCardName = useTranslatedCardName();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const zoomEnabled = useHoverZoomEnabled();
  return (
    <>
      <a
        className="community-guide__card"
        href={`/collection?q=${encodeURIComponent(cardId)}`}
        onMouseMove={(event) => setPosition({ x: event.clientX, y: event.clientY })}
        onMouseLeave={() => setPosition(null)}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({ x: rect.right, y: rect.top });
        }}
        onBlur={() => setPosition(null)}
      >
        <span>{cardId}</span> {getCardName(cardId)}
      </a>
      {zoomEnabled && position ? (
        <CardZoomPreview cardId={cardId} x={position.x} y={position.y} fallbackIndex={0} />
      ) : null}
    </>
  );
}
