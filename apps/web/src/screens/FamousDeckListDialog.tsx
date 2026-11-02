import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
/* Read-only card list for a famous preset, opened from the lobby. Lets a player
   inspect a tournament list before playing it, without copying it first. */

import { useEffect, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CardFull } from "../design/cards";
import { Button, Dialog, Eyebrow, IconButton } from "../design/primitives";
import { Icons } from "../design/icons";
import type { DeckListing } from "../game/decks";
import { useTranslation } from "../i18n";
import { DeckImageButton } from "./DeckImageButton";
import { deckSections } from "./deckSections";
import "./famousDeckListDialog.css";

/* Full-screen look at one card. Lives outside the dialog's portal so it paints
   above the dialog; key events still bubble through React to the dialog, so
   Escape is stopped here to close only the lightbox. */
function CardLightbox({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.getElementById("famous-deck-lightbox")?.focus();
    return () => previousFocus?.focus();
  }, []);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  const name = getCardName(cardId);
  return createPortal(
    <div
      id="famous-deck-lightbox"
      className="famous-deck-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={name}
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div className="famous-deck-lightbox__card" onClick={(event) => event.stopPropagation()}>
        <CardFull cardId={cardId} width={LIGHTBOX_CARD_WIDTH} zoomOnHover={false} />
      </div>
      <button type="button" className="famous-deck-lightbox__close" aria-label={t("common.close")} onClick={onClose}>
        <Icons.X size={22} />
      </button>
    </div>,
    document.body,
  );
}

const LIGHTBOX_CARD_WIDTH = Math.min(
  420,
  Math.round(window.innerWidth * 0.86),
  Math.round((window.innerHeight * 0.8) / 1.4),
);

export function FamousDeckListDialog({
  deck,
  collection,
  active,
  onUse,
  onCopy,
  onClose,
  eyebrow,
  copied = false,
}: {
  deck: DeckListing;
  collection: string;
  active: boolean;
  onUse?: () => void;
  onCopy?: () => void;
  onClose: () => void;
  eyebrow?: string;
  copied?: boolean;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const sections = deckSections(deck, t);
  const [inspectedCardId, setInspectedCardId] = useState<string | null>(null);

  return (
    <Dialog className="famous-deck-dialog" labelledBy="famous-deck-dialog-title" onClose={onClose}>
      <header className="famous-deck-dialog__header">
        <div>
          <Eyebrow>{eyebrow ?? t("lobby.famousDeckEyebrow")}</Eyebrow>
          <h2 id="famous-deck-dialog-title" className="famous-deck-dialog__title">
            {deck.name}
            <span className="famous-deck-dialog__collection">{collection}</span>
          </h2>
          <p className="famous-deck-dialog__meta">
            {t("lobby.famousDeckCards", {
              main: deck.mainDeck.length,
              egg: deck.eggDeck.length,
            })}
          </p>
        </div>
        <IconButton variant="ghost" size="sm" label={t("common.close")} onClick={onClose}>
          <Icons.X size={18} />
        </IconButton>
      </header>
      <div className="famous-deck-dialog__sections">
        {sections.map((section) => (
          <section key={section.id} className="famous-deck-dialog__section" aria-label={section.label}>
            <h3 className="famous-deck-dialog__section-title">{section.label}</h3>
            <ul className="famous-deck-dialog__cards">
              {section.entries.map(({ cardId, count }) => (
                <li key={cardId} className="famous-deck-dialog__card">
                  <button
                    type="button"
                    className="famous-deck-dialog__card-button"
                    aria-label={getCardName(cardId)}
                    onClick={() => setInspectedCardId(cardId)}
                  >
                    <CardFull cardId={cardId} width={72} zoomOnHover />
                    <span className="famous-deck-dialog__count">×{count}</span>
                  </button>
                  <span className="famous-deck-dialog__card-name" aria-hidden="true">
                    {getCardName(cardId)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer className="famous-deck-dialog__actions">
        <DeckImageButton
          deck={deck}
          subtitle={collection}
          variant="secondary"
          className="famous-deck-dialog__export"
          label={t("deck.exportPng")}
        />
        {onCopy ? (
          <Button variant="secondary" icon={Icons.FileText} onClick={onCopy} disabled={copied}>
            {copied ? t("common.copied") : t("lobby.copyPreset")}
          </Button>
        ) : null}
        {onUse ? (
          <Button icon={active ? Icons.Check : Icons.Swords} disabled={active} onClick={onUse}>
            {active ? t("deck.active") : t("lobby.useDeck")}
          </Button>
        ) : null}
      </footer>
      {inspectedCardId ? <CardLightbox cardId={inspectedCardId} onClose={() => setInspectedCardId(null)} /> : null}
    </Dialog>
  );
}
