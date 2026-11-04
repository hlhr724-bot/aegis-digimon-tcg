/* Deck Builder — list your decks, then edit one in a full builder: a filterable card
   pool on the left, the current 50-main + 5-egg list on the right with +/− steppers,
   a live cost curve and color balance, and the shared card-detail drawer. The 50/5
   targets and per-card copy limits (maxCountInDeck) are enforced as you build. Saved
   decks flow back to App state, so a build is immediately selectable for a match. */

import { useState } from "react";
import { type Screen } from "../design/primitives";
import { createBlankDeck, type DeckListing } from "../game/decks";
import { useTranslation } from "../i18n";
import { DeckEditor } from "./DeckEditor";
import { DeckList } from "./DeckList";
import { DeckMatchupPage } from "@/screens/deckSimulation/DeckMatchupPage";
import "./deckBuilder.css";

export function DeckBuilder({
  decks,
  activeDeckId,
  initialEditingDeck,
  onSelectDeck,
  onSaveDeck,
  onDeleteDeck,
  onNav,
  signedIn = false,
}: {
  decks: DeckListing[];
  activeDeckId: string;
  initialEditingDeck?: DeckListing | null;
  onSelectDeck: (id: string) => void;
  onSaveDeck: (deck: DeckListing, setActive: boolean) => void;
  onDeleteDeck: (id: string) => void;
  onNav: (s: Screen) => void;
  signedIn?: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<DeckListing | null>(initialEditingDeck ?? null);
  const [testing, setTesting] = useState<DeckListing | null>(null);
  if (editing) {
    return <DeckEditor deck={editing} onSave={onSaveDeck} onClose={() => setEditing(null)} onNav={onNav} />;
  }
  if (testing) {
    return <DeckMatchupPage deck={testing} onBack={() => setTesting(null)} />;
  }
  return (
    <DeckList
      decks={decks}
      activeDeckId={activeDeckId}
      onEdit={setEditing}
      onNew={() => setEditing(createBlankDeck(decks, undefined, t("deck.newDeckName")))}
      onSelectDeck={onSelectDeck}
      onDelete={onDeleteDeck}
      onPlay={() => onNav("lobby")}
      onTest={setTesting}
      signedIn={signedIn}
    />
  );
}
