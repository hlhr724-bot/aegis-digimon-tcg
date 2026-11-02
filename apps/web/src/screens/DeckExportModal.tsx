import { useRef, useState } from "react";
import { DeckTextFormat } from "@/game/deckExport/DeckTextFormat";
import { serializeTcgplayerDeckList } from "@/game/deckExport/serializeTcgplayerDeckList";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { DeckListing } from "@/game/decks";
import { DeckImageButton } from "@/screens/DeckImageButton";
import { useDeckImagePreview } from "@/screens/useDeckImagePreview";
import "@/screens/deckExportModal.css";

type ExportTab = "text" | "image";

export function DeckExportModal({
  text: deckText,
  deck,
  onClose,
}: {
  text: string;
  deck?: DeckListing;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [format, setFormat] = useState<DeckTextFormat>(DeckTextFormat.DIGIMON_CARD_IO.value);
  const copyRequest = useRef(0);
  const tcgplayer = deck ? serializeTcgplayerDeckList(deck) : undefined;
  const isTcgplayer = Boolean(deck) && format === DeckTextFormat.TCGPLAYER.value;
  const displayedText = isTcgplayer ? (tcgplayer?.text ?? "") : deckText;
  const unsupportedCards = isTcgplayer ? (tcgplayer?.unsupportedCards ?? []) : [];
  const copied = copiedText === displayedText;
  const canCopy = Boolean(displayedText.trim()) && unsupportedCards.length === 0;
  const [tab, setTab] = useState<ExportTab>("text");
  const copy = async () => {
    if (!canCopy) {
      return;
    }
    const request = ++copyRequest.current;
    try {
      await navigator.clipboard.writeText(displayedText);
      if (request === copyRequest.current) {
        setCopiedText(displayedText);
      }
    } catch {
      if (request === copyRequest.current) {
        setCopiedText(null);
      }
    }
  };
  return (
    <div className="deck-modal-layer" role="dialog" aria-modal="true" aria-labelledby="deck-export-title">
      <div className="deck-modal deck-export-modal">
        <h2 id="deck-export-title" className="deck-modal__title">
          {t("deck.exportTitle")}
        </h2>
        {deck ? (
          <div className="deck-export-modal__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "text"}
              className="deck-export-modal__tab"
              onClick={() => setTab("text")}
            >
              <Icons.FileText size={15} />
              {t("deck.exportTabText")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "image"}
              className="deck-export-modal__tab"
              onClick={() => setTab("image")}
            >
              <Icons.Download size={15} />
              {t("deck.exportTabImage")}
            </button>
          </div>
        ) : null}
        {tab === "image" && deck ? (
          <DeckImagePreview deck={deck} />
        ) : (
          <>
            {deck ? (
              <label className="deck-export-modal__format">
                {t("deck.exportFormat")}
                <select
                  value={format}
                  onChange={(event) => {
                    const selected = Object.values(DeckTextFormat).find((entry) => entry.value === event.target.value);
                    if (selected) {
                      copyRequest.current += 1;
                      setCopiedText(null);
                      setFormat(selected.value);
                    }
                  }}
                >
                  {Object.values(DeckTextFormat).map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {isTcgplayer ? <p className="deck-modal__hint">{t("deck.exportTcgplayerHint")}</p> : null}
            {unsupportedCards.length > 0 ? (
              <p className="deck-modal__error" role="alert">
                {t("deck.exportUnsupportedCards", { cards: unsupportedCards.join(", ") })}
              </p>
            ) : null}
            <textarea
              className="deck-modal__textarea"
              aria-label={t("deck.exportTabText")}
              readOnly
              value={displayedText}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
          </>
        )}
        <div className="deck-export-modal__actions">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("common.close")}
          </Button>
          <span className="deck-export-modal__spacer" />
          {tab === "image" && deck ? (
            <DeckImageButton deck={deck} size="sm" variant="primary" label={t("deck.exportDownloadPng")} />
          ) : (
            <Button size="sm" icon={copied ? Icons.Check : Icons.Copy} disabled={!canCopy} onClick={copy}>
              {copied ? t("common.copied") : t("common.copy")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DeckImagePreview({ deck }: { deck: DeckListing }) {
  const { t } = useTranslation();
  const preview = useDeckImagePreview(deck);
  return (
    <div className="deck-export-modal__preview" aria-busy={preview.status === "loading"}>
      {preview.status === "ready" ? (
        <img src={preview.url} alt={t("deck.exportPreviewAlt", { name: deck.name })} />
      ) : (
        <span className="deck-export-modal__preview-status">
          {preview.status === "failed" ? t("deck.exportImageFailed") : t("deck.exportImageRendering")}
        </span>
      )}
      {preview.status === "ready" ? (
        <span className="deck-export-modal__preview-meta">
          {t("deck.exportPreviewMeta", {
            width: preview.width,
            height: preview.height,
          })}
        </span>
      ) : null}
    </div>
  );
}
