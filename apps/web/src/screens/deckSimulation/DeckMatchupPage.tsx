import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { displayCoverArt, displayCoverCard, type DeckListing } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";
import { DeckMatchup } from "@/screens/deckSimulation/DeckMatchup";
import "@/design/pageHeader.css";

interface DeckMatchupPageProps {
  deck: DeckListing;
  onBack: () => void;
}

export function DeckMatchupPage({ deck, onBack }: DeckMatchupPageProps) {
  const { t } = useTranslation();
  return (
    <main className="aegis-page deck-matchup-page">
      <div className="aegis-page__wrap">
        <button type="button" className="deck-builder-crumb deck-matchup-page__back" onClick={onBack}>
          <Icons.ChevronLeft size={16} />
          {t("deck.title")}
        </button>
        <header className="deck-matchup-page__header">
          <span className="deck-matchup-page__cover" aria-hidden="true">
            <CoverThumb
              coverCardId={displayCoverCard(deck)}
              artId={displayCoverArt(deck)}
              sigilColor={deck.color}
              sigilSize={36}
            />
          </span>
          <div className="deck-matchup-page__heading">
            <span className="deck-matchup-page__eyebrow">{t("deckMatchup.page.eyebrow")}</span>
            <h1>{deck.name}</h1>
            <p>{t("deckMatchup.page.intro")}</p>
          </div>
        </header>
        <div className="deck-matchup-page__sheet">
          <DeckMatchup
            deckId={deck.id}
            mainDeck={deck.mainDeck}
            eggDeck={deck.eggDeck}
            format={deck.format}
            art={{ coverCardId: displayCoverCard(deck), color: deck.color }}
          />
        </div>
      </div>
    </main>
  );
}
