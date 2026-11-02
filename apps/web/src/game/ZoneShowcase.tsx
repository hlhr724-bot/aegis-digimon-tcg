import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
/* Public arrival: white turn, readable face, then a narrow upward exit.
   The queue owns the lifetime; the existing card, caption and board design stay ours. */

import { useState, type CSSProperties } from "react";
import { CardFull } from "../design/cards";
import { useTranslation } from "../i18n";
import { CardBurst } from "./CardBurst";
import type { ZoneShowcase as ZoneShowcaseModel } from "./showcases";
import { showcaseExtraHoldMs } from "./pacing";
import { SHOWCASE_OUT_AT_MS } from "./timings";

const SHOWCASE_CARD_WIDTH = 190;

export function ZoneShowcase({ showcase }: { showcase: ZoneShowcaseModel }) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const showcaseName = getCardName(showcase.cardId);
  const digivolving = showcase.kind === "digivolve";
  const [extraHoldMs] = useState(() => showcaseExtraHoldMs(showcase));
  return (
    <div
      className="battle-showcase battle-showcase--arrival"
      data-testid="zone-showcase"
      data-card-id={showcase.cardId}
      data-showcase-key={showcase.key}
      role="status"
      style={
        extraHoldMs > 0
          ? ({ "--t-showcase-out-at": `${SHOWCASE_OUT_AT_MS + extraHoldMs}ms` } as CSSProperties)
          : undefined
      }
    >
      <figure className="battle-showcase__frame">
        <span className="battle-showcase__halo" aria-hidden="true">
          <CardBurst variant={digivolving ? "evolve" : "play"} color={showcase.color} />
        </span>
        <div className="battle-showcase__art">
          <CardFull cardId={showcase.cardId} artId={showcase.artId} width={SHOWCASE_CARD_WIDTH} zoomOnHover={false} />
        </div>
        <figcaption className="battle-showcase__caption">
          {t(
            showcase.mine
              ? digivolving
                ? "showcase.youDigivolved"
                : "showcase.youPlayed"
              : digivolving
                ? "showcase.opponentDigivolved"
                : "showcase.opponentPlayed",
            { card: showcaseName },
          )}
        </figcaption>
      </figure>
    </div>
  );
}
