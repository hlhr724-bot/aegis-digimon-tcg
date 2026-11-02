import { useArenaInputCancel } from "@/game/input/useArenaInputCancel";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { CardArt } from "../CardArt";
import { useCardOpener } from "../../cardLinks";

import { useTranslation } from "../../../i18n";
import { useBoardPreview } from "../choice/useBoardPreview";
import { DecisionViewBoardButton } from "../choice/DecisionViewBoardButton";
import { trapDialogFocus } from "../choice/decisionFocusTrap";
import "./counterOverlay.css";
import "../effectPromptFamily.css";
import { usePromptHandSpace } from "../choice/usePromptHandSpace";

/** Shared artwork header and keyboard boundary for the arena's combat questions. */
export function CardPromptFrame({
  cardId,
  fallback,
  eyebrow,
  title,
  description,
  className = "",
  label,
  surface = "left",
  onBack,
  reserveHand = true,
  boardAction = true,
  children,
}: {
  cardId?: string;
  fallback?: ReactNode;
  eyebrow: ReactNode;
  title: string;
  description: ReactNode;
  className?: string;
  label?: string;
  surface?: "left" | "center";
  onBack?: () => void;
  reserveHand?: boolean;
  boardAction?: boolean;
  children: ReactNode;
}) {
  const getCardName = useTranslatedCardName();
  const titleId = useId();
  const { t } = useTranslation();
  const openCard = useCardOpener();
  const { isViewingBoard, openBoard, boardReturn } = useBoardPreview();
  const panel = useRef<HTMLDivElement>(null);
  usePromptHandSpace(panel, reserveHand && !isViewingBoard);
  useArenaInputCancel({ ref: panel, onCancel: onBack });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      queueMicrotask(() => {
        if (previous instanceof HTMLElement && previous.isConnected && document.activeElement === document.body)
          previous.focus();
      });
    };
  }, []);
  useEffect(() => {
    if (!isViewingBoard) heading.current?.focus();
  }, [title, isViewingBoard]);
  if (isViewingBoard) return boardReturn;
  return (
    <>
      <div className="decision-overlay-backdrop" aria-hidden="true" />
      <div
        className={`game-modal__panel combat-prompt counter-overlay effect-prompt-family ${className}`}
        data-prompt-surface={surface}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={label ? undefined : titleId}
        ref={panel}
        onKeyDown={(event) => {
          if (event.key === "Escape" && onBack) {
            event.preventDefault();
            onBack();
          }
          trapDialogFocus({ event, panelRef: panel });
        }}
      >
        <header className="counter-overlay__header">
          {cardId ? (
            openCard ? (
              <button
                className="counter-overlay__art-link"
                aria-label={t("feed.openCard", { card: getCardName(cardId) })}
                onClick={() => openCard(cardId)}
              >
                <span className="mobile-prompt-art">
                  <CardArt cardId={cardId} width={64} />
                </span>
              </button>
            ) : (
              <span className="mobile-prompt-art">
                <CardArt cardId={cardId} width={64} />
              </span>
            )
          ) : (
            fallback
          )}
          <div>
            <div className="counter-overlay__eyebrow">{eyebrow}</div>
            <h2 id={titleId} ref={heading} tabIndex={-1}>
              {title}
            </h2>
            <p>{description}</p>
          </div>
        </header>
        {children}
        {boardAction ? (
          <div className="counter-overlay__board-action">
            <DecisionViewBoardButton onOpenBoard={openBoard} />
          </div>
        ) : null}
      </div>
    </>
  );
}
