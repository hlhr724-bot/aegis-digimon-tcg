import { useMemo, useState } from "react";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import { deckLegality } from "@aegis/shared/decks/legality";
import { Button, Dialog } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { DeckPicker } from "@/screens/DeckPicker";
import { deckHasBetaCards } from "@/screens/deckHasBetaCards";
import { useFamousDecks } from "@/game/useFamousDecks";
import { communityApi } from "@/community/client";
import { communityDeckListing } from "@/community/communityDeckListing";
import type { DeckListing } from "@/game/decks";
import "@/game/overlay/match/seriesStatus.css";

export interface SeriesDeckDialogProps {
  decks: readonly DeckListing[];
  activeDeckId: string;
  accountId: string | undefined;
  format: DeckFormat;
  unlimited: boolean;
  betaAllowed: boolean;
  onChoose: (deck: DeckListing) => void;
  onCopyDeck: (deck: DeckListing) => void;
  onClose: () => void;
}

export function SeriesDeckDialog({
  decks,
  activeDeckId,
  accountId,
  format,
  unlimited,
  betaAllowed,
  onChoose,
  onCopyDeck,
  onClose,
}: SeriesDeckDialogProps) {
  const { t } = useTranslation();
  const famousDecks = useFamousDecks();
  const [illegal, setIllegal] = useState(false);
  const rules = { unlimited, format, betaAllowed };
  const ownDecks = useMemo(
    () =>
      decks
        .map((deck) => ({ deck, legal: isPlayableDeck({ deck, unlimited, format, betaAllowed }) }))
        .sort((a, b) => Number(b.legal) - Number(a.legal)),
    [decks, unlimited, format, betaAllowed],
  );
  const choose = (deck: DeckListing | undefined) => {
    if (!deck || !isPlayableDeck({ deck, ...rules })) {
      setIllegal(true);
      return;
    }
    onChoose(deck);
    onClose();
  };
  const findDeck = (id: string) =>
    decks.find((deck) => deck.id === id) ??
    famousDecks?.groups.flatMap((group) => group.decks).find((deck) => deck.id === id);
  return (
    <Dialog className="series-deck-dialog" labelledBy="series-deck-dialog-title" onClose={onClose}>
      <div className="series-deck-dialog__header">
        <h2 id="series-deck-dialog-title">{t("overlay.rematch.pickDeckTitle")}</h2>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
      {illegal ? <p role="alert">{t("overlay.rematch.illegalDeck")}</p> : null}
      <DeckPicker
        ownDecks={ownDecks}
        format={format}
        activeDeckId={activeDeckId}
        onSelectDeck={(id) => choose(findDeck(id))}
        onCopyDeck={onCopyDeck}
        onUseProviderDeck={choose}
        onPickCommunityDeck={(id) => {
          void communityApi
            .deck(id)
            .then((deck) => choose(communityDeckListing(deck)))
            .catch(() => setIllegal(true));
        }}
        accountId={accountId}
      />
    </Dialog>
  );
}

type IsPlayableDeckParams = {
  deck: DeckListing;
  unlimited: boolean;
  format: DeckFormat;
  betaAllowed: boolean;
};

function isPlayableDeck({ deck, unlimited, format, betaAllowed }: IsPlayableDeckParams): boolean {
  return deckLegality(deck, { unlimited, format }).legal && (betaAllowed || !deckHasBetaCards(deck));
}
