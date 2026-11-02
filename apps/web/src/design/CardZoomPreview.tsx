import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { useCardImageUrls } from "@/design/tokenArt/useCardImageUrls";
import { Sigil } from "@/design/Sigil";
import { colorKey } from "@/design/theme";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";

const ZOOM_GAP = 14;

export function CardZoomPreview({
  cardId,
  artId,
  x,
  y,
  fallbackIndex,
  width = 380,
}: {
  cardId: string;
  artId?: string;
  x: number;
  y: number;
  fallbackIndex: number;
  width?: number;
}) {
  const height = Math.round(width * 1.4);
  const translations = useCardTranslations();
  const def = getCardDefinition(cardId);
  const urls = useCardImageUrls({ cardId, artId });
  const [extra, setExtra] = useState(0);
  useEffect(() => setExtra(0), [cardId, artId, urls]);
  const idx = fallbackIndex + extra;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const preferredLeft = x + ZOOM_GAP + width > vw ? x - ZOOM_GAP - width : x + ZOOM_GAP;
  const left = Math.max(ZOOM_GAP, Math.min(preferredLeft, vw - width - ZOOM_GAP));
  const top = Math.max(ZOOM_GAP, Math.min(y - height / 2, vh - height - ZOOM_GAP));

  return createPortal(
    <div
      data-testid="card-zoom-preview"
      style={{
        position: "fixed",
        left,
        top,
        width: width,
        height: height,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 30px 70px rgba(15,23,42,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
        zIndex: 9999,
        pointerEvents: "none",
        animation: "aegis-pop 120ms ease-out",
      }}
    >
      {idx >= urls.length ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "var(--ds-fill)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Sigil cardId={cardId} color={colorKey(def?.colors[0])} size={width * 0.5} />
        </div>
      ) : (
        <img
          draggable={false}
          src={urls[idx]}
          decoding="async"
          alt={def ? getTranslatedCardName({ name: def.nameEn, translations }) : undefined}
          onError={() => setExtra((e) => e + 1)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
        />
      )}
    </div>,
    document.body,
  );
}
