import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { CardTextField } from "@/i18n/CardTextField";
import { EffectText } from "@/game/EffectText";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CardFull } from "../../../design/cards";
import { useTranslation } from "../../../i18n";
import { PrintedCardInfo } from "./PrintedCardInfo";
import { useCardZoomPrintedText } from "./useCardZoomPrintedText";

/** Full-screen blow-up of a single card; tap anywhere (or Escape) to dismiss. */
export function CardZoomOverlay({
  cardId,
  artId,
  onClose,
  inline,
  details,
}: {
  cardId: string;
  artId?: string;
  onClose: () => void;
  /** Render in place rather than portalling, so a fixture stage can hold the overlay. */
  inline?: boolean;
  /** Info shown under the card. Defaults to the printed name, level, cost and DP. */
  details?: ReactNode;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const card = getCardDefinition(cardId);
  const [printedTextShown, setPrintedTextShown] = useCardZoomPrintedText();
  const hasPrintedText = Boolean(
    card?.effectText || card?.inheritedEffectText || card?.securityEffectText || card?.linkEffect,
  );
  const showPrintedText = hasPrintedText && printedTextShown;
  const width = useCardZoomWidth(showPrintedText);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const panel = (
    <div
      className="card-zoom"
      data-printed-text={showPrintedText ? "shown" : "hidden"}
      role="dialog"
      aria-modal="true"
      aria-label={getCardName(cardId)}
      onClick={onClose}
    >
      <CardFull cardId={cardId} artId={artId} width={width} />
      <div className="card-zoom__details card-action-sheet__info" onClick={(e) => e.stopPropagation()}>
        {details ?? <PrintedCardInfo cardId={cardId} />}
        {showPrintedText && card?.effectText ? (
          <section className="card-zoom__printed">
            <strong>{t("overlay.printedEffect")}</strong>
            <EffectText
              text={card.effectText}
              cardId={cardId}
              field={CardTextField.EFFECT.value}
              surface="card-detail"
            />
          </section>
        ) : null}
        {showPrintedText && card?.inheritedEffectText ? (
          <section className="card-zoom__printed">
            <strong>{t("library.inheritedEffect")}</strong>
            <EffectText
              text={card.inheritedEffectText}
              cardId={cardId}
              field={CardTextField.INHERITED.value}
              surface="card-detail"
            />
          </section>
        ) : null}
        {showPrintedText && card?.linkEffect ? (
          <section className="card-zoom__printed">
            <strong>{t("library.linkEffect")}</strong>
            <EffectText text={card.linkEffect} cardId={cardId} field={CardTextField.LINK.value} surface="card-detail" />
          </section>
        ) : null}
        {showPrintedText && card?.securityEffectText ? (
          <section className="card-zoom__printed">
            <strong>{t("library.securityEffect")}</strong>
            <EffectText
              text={card.securityEffectText}
              cardId={cardId}
              field={CardTextField.SECURITY.value}
              surface="card-detail"
            />
          </section>
        ) : null}
      </div>
      <div className="card-zoom__actions" onClick={(e) => e.stopPropagation()}>
        {hasPrintedText ? (
          <button type="button" aria-pressed={showPrintedText} onClick={() => setPrintedTextShown(!showPrintedText)}>
            {t(showPrintedText ? "overlay.hideCardText" : "overlay.showCardText")}
          </button>
        ) : null}
        <button type="button" data-arena-cancel onClick={onClose} autoFocus>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
  return inline ? panel : createPortal(panel, document.body);
}

/**
 * The blow-up fills as much of the viewport as it can while leaving room for the
 * details and the close button below it. Cards are drawn at a 1:1.4 ratio, so the
 * height budget is what usually binds on a laptop and the width on a phone.
 */
const CARD_ZOOM_CHROME_HEIGHT = { withText: 470, withoutText: 220 };
const CARD_ZOOM_MAX_WIDTH = { withText: 560, withoutText: 760 };
const CARD_ZOOM_MIN_WIDTH = 180;

function useCardZoomWidth(withText: boolean) {
  const layout = withText ? "withText" : "withoutText";
  const measure = () =>
    Math.round(
      Math.max(
        CARD_ZOOM_MIN_WIDTH,
        Math.min(
          CARD_ZOOM_MAX_WIDTH[layout],
          window.innerWidth * 0.9,
          (window.innerHeight - CARD_ZOOM_CHROME_HEIGHT[layout]) / 1.4,
        ),
      ),
    );
  const [width, setWidth] = useState(measure);
  useEffect(() => {
    setWidth(measure());
    const onResize = () => setWidth(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [layout]);
  return width;
}
