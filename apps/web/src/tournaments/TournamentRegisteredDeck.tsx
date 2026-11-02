import { useId, useState } from "react";
import type { TournamentBanlistCard } from "@aegis/shared/tournaments/index";
import type { TournamentOwnDeck } from "@aegis/shared/tournaments/TournamentOwnDeck";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { Alert, Button } from "@/design/primitives";
import { displayCoverArt, displayCoverCard, dominantColor, type DeckListing } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";
import { FamousDeckListDialog } from "@/screens/FamousDeckListDialog";
import { tournamentApi } from "@/tournaments/client";
import { TournamentDeckPicker } from "@/tournaments/TournamentDeckPicker";

type TournamentRegisteredDeckParams = {
  tournamentId: string;
  deck: TournamentOwnDeck;
  decks: readonly DeckListing[];
  banlistCards?: readonly TournamentBanlistCard[];
  canChange: boolean;
  onChanged: () => void;
  onDecks: () => void;
};

export function TournamentRegisteredDeck({
  tournamentId,
  deck,
  decks,
  banlistCards = [],
  canChange,
  onChanged,
  onDecks,
}: TournamentRegisteredDeckParams) {
  const { t } = useTranslation();
  const id = useId();
  const [selected, setSelected] = useState(
    decks.some((entry) => entry.id === deck.savedDeckId) ? (deck.savedDeckId ?? "") : "",
  );
  const [changing, setChanging] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const editable = canChange && !deck.locked;
  const savedDeck = decks.find((entry) => entry.id === deck.savedDeckId);
  const color = savedDeck?.color ?? dominantColor(deck.mainDeck);

  async function changeDeck() {
    setBusy(true);
    setFailed(false);
    const result = await tournamentApi.changeDeck(tournamentId, selected);
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setChanging(false);
    onChanged();
  }

  function cancelChange() {
    setChanging(false);
    setFailed(false);
    setSelected(deck.savedDeckId ?? "");
  }

  return (
    <section className="tournaments-registered-deck" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>{t("tournaments.deck.registered")}</h4>
      <div className="tournaments-registered-deck__summary">
        <span className="tournaments-deck-option__cover" aria-hidden="true">
          <CoverThumb
            coverCardId={savedDeck ? displayCoverCard(savedDeck) : deck.mainDeck.at(-1)}
            artId={savedDeck ? displayCoverArt(savedDeck) : undefined}
            sigilColor={color}
            sigilSize={32}
          />
        </span>
        <div className="tournaments-registered-deck__copy">
          <strong>{deck.available === false ? t("tournaments.deck.unavailable") : deck.name}</strong>
          {deck.available === false ? null : (
            <small>{t("lobby.famousDeckCards", { main: deck.mainDeck.length, egg: deck.eggDeck.length })}</small>
          )}
        </div>
        {editable && !changing ? (
          <Button size="sm" icon={Icons.RotateCcw} onClick={() => setChanging(true)}>
            {t("tournaments.signup.changeDeck")}
          </Button>
        ) : null}
      </div>
      <p className="tournaments-note">{t(editable ? "tournaments.deck.editable" : "tournaments.deck.locked")}</p>
      <div className="tournaments-detail__actions">
        <Button
          variant="secondary"
          size="sm"
          icon={Icons.Eye}
          disabled={deck.available === false}
          onClick={() => setPreview(true)}
        >
          {t("tournaments.deck.view")}
        </Button>
        {editable ? (
          <Button variant="ghost" size="sm" onClick={onDecks}>
            {t("tournaments.deck.editLibrary")}
          </Button>
        ) : null}
      </div>
      {editable && changing ? (
        <div className="tournaments-registered-deck__change">
          <b>{t("tournaments.deck.replace")}</b>
          <TournamentDeckPicker
            decks={decks}
            banlistCards={banlistCards}
            value={selected}
            onChange={setSelected}
            onDecks={onDecks}
          />
          <div className="tournaments-registered-deck__buttons">
            <Button variant="ghost" disabled={busy} onClick={cancelChange}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy || !selected || selected === deck.savedDeckId} onClick={() => void changeDeck()}>
              {t("tournaments.deck.save")}
            </Button>
          </div>
        </div>
      ) : null}
      {failed ? (
        <Alert tone="danger" title={t("tournaments.error.action")}>
          {t("tournaments.deck.failed")}
        </Alert>
      ) : null}
      {preview ? (
        <FamousDeckListDialog
          deck={{
            id: deck.savedDeckId ?? tournamentId,
            name: deck.name,
            mainDeck: deck.mainDeck,
            eggDeck: deck.eggDeck,
            color: dominantColor(deck.mainDeck),
            blurb: "",
          }}
          collection=""
          active={false}
          eyebrow={t("tournaments.deck.registered")}
          onClose={() => setPreview(false)}
        />
      ) : null}
    </section>
  );
}
