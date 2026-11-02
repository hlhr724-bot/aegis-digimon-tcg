/* Import and export a deck as text. */

import { useState } from "react";
import { Button } from "../design/primitives";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";
import type { DeckListing } from "../game/decks";
import "./deckExportModal.css";

/* ---------------- import / export modals ---------------- */
export function DeckImportModal({ onImport, onClose }: { onImport: (text: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  return (
    <div className="deck-modal-layer" role="dialog" aria-modal="true" aria-labelledby="deck-import-title">
      <div className="deck-modal">
        <h2 id="deck-import-title" className="deck-modal__title">
          {t("deck.importTitle")}
        </h2>
        <p className="deck-modal__hint">
          {t("deck.importHint")} <code>4 Agumon BT1-009</code>
        </p>
        <p className="deck-modal__hint">
          {t("deck.importHintTabletop")} <code>["Exported from digimonmeta.com","BT1-009",…]</code>
        </p>
        <textarea
          className="deck-modal__textarea"
          autoFocus
          placeholder={"// DigimonCard.io Deck List\n4 Agumon BT1-009\n…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="deck-modal__actions">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" icon={Icons.Upload} disabled={!text.trim()} onClick={() => onImport(text)}>
            {t("common.import")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DeckDeleteModal({
  deck,
  onConfirm,
  onClose,
}: {
  deck: DeckListing;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="deck-modal-layer" role="dialog" aria-modal="true" aria-labelledby="deck-delete-title">
      <div className="deck-modal">
        <h2 id="deck-delete-title" className="deck-modal__title">
          {t("deck.deleteTitle", { name: deck.name })}
        </h2>
        <p className="deck-modal__hint">{t("deck.deleteHint")}</p>
        <div className="deck-modal__actions">
          <Button variant="secondary" size="sm" autoFocus onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" size="sm" icon={Icons.Trash} onClick={onConfirm}>
            {t("deck.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
