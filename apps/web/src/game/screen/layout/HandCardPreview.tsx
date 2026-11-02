import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import { useState } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@aegis/shared";
import { useTranslation } from "../../../i18n";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { CardFull } from "../../../design/cards";
import { ArenaPermanentInspector, type ArenaInspectionOptions } from "../../ArenaPermanentInspector";
import { playButtonLabel, type ActivatableEntry } from "../../boardModel";
import { CardZoomOverlay } from "../../overlay";
import { buildPrintedCardDetail } from "../../permanentDetail";

export function HandCardPreview({
  cardId,
  artId,
  arenaInspection,
  activatableEffects,
  canPlay,
  canDigivolve,
  canLink = false,
  onPlay,
  onActivateEffect,
  onChooseBase,
  onLink,
  onCancel,
}: {
  cardId: string;
  artId?: string;
  arenaInspection?: ArenaInspectionOptions;
  activatableEffects: ActivatableEntry[];
  canPlay: boolean;
  canDigivolve: boolean;
  /** Server projection: some own Digimon accepts this card as a link right now. */
  canLink?: boolean;
  onPlay: () => void;
  onActivateEffect: (effect: ActivatableEntry) => void;
  onChooseBase: () => void;
  onLink?: () => void;
  onCancel: () => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const translateCardText = useTranslatedCardText();
  const card = getCardDefinition(cardId);
  const [zoomed, setZoomed] = useState(false);
  if (arenaInspection) {
    const actions =
      activatableEffects.length || canPlay || canDigivolve || (canLink && onLink) ? (
        <>
          {activatableEffects.map((effect, index) => (
            <Button
              key={`${effect.instanceId}:${effect.effectKey}`}
              size="sm"
              variant="secondary"
              icon={Icons.Sparkles}
              className="arena-permanent-inspector__activate"
              onClick={() => onActivateEffect(effect)}
              aria-label={`${t("game.activateEffect")}: ${translateCardText({ text: effect.description, cardId })}`}
              title={translateCardText({ text: effect.description, cardId })}
            >
              {t("game.activateHandEffect")}
              {activatableEffects.length > 1 ? ` ${index + 1}` : ""}
            </Button>
          ))}
          {canPlay ? (
            <Button size="sm" onClick={onPlay}>
              {playButtonLabel(card?.kinds ?? [], t)}
            </Button>
          ) : null}
          {canDigivolve ? (
            <Button size="sm" variant="secondary" onClick={onChooseBase}>
              {t("game.digivolve")}
            </Button>
          ) : null}
          {canLink && onLink ? (
            <Button size="sm" variant="secondary" onClick={onLink}>
              {t("game.link")}
            </Button>
          ) : null}
        </>
      ) : undefined;
    return (
      <>
        <ArenaPermanentInspector
          detail={buildPrintedCardDetail(cardId, artId)}
          inspection={arenaInspection}
          actions={actions}
          zoomed={zoomed}
          onZoom={() => setZoomed(true)}
          onClose={onCancel}
        />
        {zoomed ? <CardZoomOverlay cardId={cardId} artId={artId} onClose={() => setZoomed(false)} /> : null}
      </>
    );
  }
  return createPortal(
    // Same bottom sheet as the field-card actions, so tapping a card reads the same
    // whether it is in hand or on the board.
    <div
      className="card-action-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={getCardName(cardId)}
      onClick={onCancel}
    >
      <div className="card-action-sheet__panel" onClick={(event) => event.stopPropagation()}>
        <div className="card-action-sheet__grip" aria-hidden />
        <div className="card-action-sheet__body">
          <button
            type="button"
            className="card-action-sheet__zoom"
            onClick={() => setZoomed(true)}
            aria-label={t("overlay.zoomCard")}
          >
            <CardFull cardId={cardId} artId={artId} width={190} />
          </button>
          <div className="card-action-sheet__info">
            <strong>{getCardName(cardId)}</strong>
            <div className="card-action-sheet__stats">
              {card?.level ? <span>Lv.{card.level}</span> : null}
              <span>
                {card && card.playCost >= 0
                  ? t(card.isDualCard ? "game.useCostsMemory" : "game.costsMemory", { count: card.playCost })
                  : t("game.noCost")}
              </span>
              {card?.dp ? <span>{card.dp.toLocaleString()} DP</span> : null}
            </div>
          </div>
        </div>
        <div className="card-action-sheet__actions" aria-label={t("game.actions")}>
          {activatableEffects.map((effect, index) => (
            <Button
              key={`${effect.instanceId}:${effect.effectKey}`}
              size="md"
              full
              variant="secondary"
              onClick={() => onActivateEffect(effect)}
              aria-label={`${t("game.activateEffect")}: ${translateCardText({ text: effect.description, cardId })}`}
              autoFocus={index === 0}
              title={translateCardText({ text: effect.description, cardId })}
            >
              {t("game.activateHandEffect")}
              {activatableEffects.length > 1 ? ` ${index + 1}` : ""}
            </Button>
          ))}
          {canPlay ? (
            <Button size="md" full onClick={onPlay} autoFocus={activatableEffects.length === 0}>
              {playButtonLabel(card?.kinds ?? [], t)}
            </Button>
          ) : null}
          {canDigivolve ? (
            <Button
              size="md"
              full
              variant="secondary"
              onClick={onChooseBase}
              autoFocus={activatableEffects.length === 0 && !canPlay}
            >
              {t("game.clickToDigivolve")}
            </Button>
          ) : null}
          {canLink && onLink ? (
            <Button size="md" full variant="secondary" onClick={onLink}>
              {t("game.link")}
            </Button>
          ) : null}
          <Button
            size="sm"
            full
            variant="ghost"
            data-arena-cancel
            onClick={onCancel}
            autoFocus={activatableEffects.length === 0 && !canPlay && !canDigivolve && !canLink}
          >
            {t("common.cancel")}
          </Button>
        </div>
        {zoomed ? <CardZoomOverlay cardId={cardId} artId={artId} onClose={() => setZoomed(false)} /> : null}
      </div>
    </div>,
    document.body,
  );
}
