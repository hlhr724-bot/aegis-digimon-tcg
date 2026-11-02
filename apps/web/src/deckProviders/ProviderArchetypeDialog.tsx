import { useState } from "react";
import type { ProviderArchetype } from "@aegis/shared/deckProviders/ProviderTypes";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { DeckListing } from "@/game/decks";
import { ProviderArchetypeDecks } from "@/deckProviders/ProviderArchetypeDecks";
import { ProviderDeckDetail } from "@/deckProviders/ProviderDeckDetail";
import { Button, Dialog } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";

type Props = {
  archetype: ProviderArchetype;
  collection: string;
  activeDeckId?: string;
  format: DeckFormat;
  onUse: (deck: DeckListing) => void;
  onCopy: (deck: DeckListing) => void;
  onClose: () => void;
};

export function ProviderArchetypeDialog({
  archetype,
  collection,
  activeDeckId,
  format,
  onUse,
  onCopy,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [detailId, setDetailId] = useState<number>();
  function handleUse(deck: DeckListing) {
    onUse(deck);
    onClose();
  }
  function handleCopy(deck: DeckListing) {
    onCopy(deck);
    onClose();
  }
  if (detailId !== undefined) {
    return (
      <ProviderDeckDetail
        id={detailId}
        format={format}
        onUse={handleUse}
        onCopy={handleCopy}
        onClose={() => setDetailId(undefined)}
      />
    );
  }
  return (
    <Dialog className="provider-dialog provider-variants-dialog" labelledBy="provider-variants-title" onClose={onClose}>
      <header>
        <div>
          <h2 id="provider-variants-title">{archetype.name}</h2>
          <p>
            {collection} · {t("digilab.versions")}
          </p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </header>
      <p>{t("digilab.versionsHint")}</p>
      <div className="deck-picker">
        <ProviderArchetypeDecks
          archetype={archetype.id}
          collection={collection}
          activeDeckId={activeDeckId}
          format={format}
          onUse={handleUse}
          onCopy={handleCopy}
          onInspect={setDetailId}
        />
      </div>
    </Dialog>
  );
}
