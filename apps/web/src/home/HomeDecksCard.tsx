import { CoverThumb } from "@/design/cards";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { COLORS } from "@/design/theme";
import { displayCoverArt, displayCoverCard, type DeckListing } from "@/game/decks";
import { HomeCard } from "@/home/HomeCard";
import { useTranslation } from "@/i18n/useTranslation";

const HOME_DECK_COUNT = 4;

type HomeDecksCardParams = {
  decks: readonly DeckListing[];
  activeDeckId: string;
  onEdit: (deck: DeckListing) => void;
  onPlay: (deck: DeckListing) => void;
  onBuild: () => void;
  onViewAll: () => void;
};

export function HomeDecksCard({ decks, activeDeckId, onEdit, onPlay, onBuild, onViewAll }: HomeDecksCardParams) {
  const { t } = useTranslation();
  const recent = [...decks].sort((first, second) => (second.updatedAt ?? 0) - (first.updatedAt ?? 0));
  const shown = recent.slice(0, HOME_DECK_COUNT);
  return (
    <HomeCard
      className="home-decks"
      title={t("home.decks.title")}
      description={decks.length > 0 ? t("home.decks.description", { count: decks.length }) : undefined}
      action={{ label: t("home.viewAll"), onClick: onViewAll }}
    >
      {shown.length === 0 ? (
        <div className="home-empty">
          <Icons.Cards size={22} aria-hidden="true" />
          <p>
            <strong>{t("home.decks.empty")}</strong>
          </p>
          <Button size="sm" icon={Icons.Plus} onClick={onBuild}>
            {t("home.buildDeck")}
          </Button>
        </div>
      ) : (
        <ul className="home-decks__row">
          {shown.map((deck) => (
            <li key={deck.id} className="home-deck" data-active={deck.id === activeDeckId || undefined}>
              <span className="home-tcg-card home-deck__cover">
                <CoverThumb
                  coverCardId={displayCoverCard(deck)}
                  artId={displayCoverArt(deck)}
                  sigilColor={deck.color}
                  sigilSize={36}
                />
              </span>
              <div className="home-deck__info">
                <b>{deck.name}</b>
                <div className="home-facts">
                  <span>
                    {t("common.cards", { count: deck.mainDeck.length })} ·{" "}
                    {t("home.next.eggs", { count: deck.eggDeck.length })}
                  </span>
                </div>
                <span className="home-color-dots" aria-hidden="true">
                  <i style={{ background: COLORS[deck.color].base }} />
                </span>
              </div>
              <div className="home-deck__actions">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Icons.Pencil}
                  aria-label={t("home.decks.edit", { name: deck.name })}
                  onClick={() => onEdit(deck)}
                />
                <Button size="sm" variant="secondary" onClick={() => onPlay(deck)}>
                  {t("common.play")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
