import { useState, type CSSProperties } from "react";
import { CoverThumb } from "@/design/cards";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { COLORS } from "@/design/theme";
import { displayCoverArt, displayCoverCard, type DeckListing } from "@/game/decks";
import { HomeCard } from "@/home/HomeCard";
import { HomeMatchQueue } from "@/home/HomeMatchQueue";
import { useTranslation } from "@/i18n/useTranslation";

type HomeNextMatchCardParams = {
  deck: DeckListing | undefined;
  rankedEnabled: boolean;
  onFindMatch: (queue: HomeMatchQueue) => void;
  onPractice: () => void;
  onPrivateMatch: () => void;
  onChangeDeck: () => void;
};

export function HomeNextMatchCard({
  deck,
  rankedEnabled,
  onFindMatch,
  onPractice,
  onPrivateMatch,
  onChangeDeck,
}: HomeNextMatchCardParams) {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<HomeMatchQueue>(HomeMatchQueue.CASUAL.value);
  const selectedQueue = rankedEnabled ? queue : HomeMatchQueue.CASUAL.value;
  return (
    <HomeCard
      className="home-next"
      title={t("home.next.title")}
      description={t("home.next.description")}
      action={{ label: t("home.next.change"), onClick: onChangeDeck }}
    >
      {deck ? (
        <div className="home-next__deck">
          <span
            className="home-tcg-card home-next__cover"
            style={{ "--deck-color": COLORS[deck.color].base } as CSSProperties}
          >
            <CoverThumb
              coverCardId={displayCoverCard(deck)}
              artId={displayCoverArt(deck)}
              sigilColor={deck.color}
              sigilSize={48}
            />
          </span>
          <div className="home-next__info">
            <h3>{deck.name}</h3>
            <div className="home-facts">
              <span>
                <Icons.Cards size={14} aria-hidden="true" />
                {t("common.cards", { count: deck.mainDeck.length })}
              </span>
              <span>
                <Icons.Hexagon size={14} aria-hidden="true" />
                {t("home.next.eggs", { count: deck.eggDeck.length })}
              </span>
            </div>
            <span className="home-color-dots" aria-hidden="true">
              <i style={{ background: COLORS[deck.color].base }} />
            </span>
            {rankedEnabled ? (
              <div className="home-tabs-list" role="group" aria-label={t("home.next.queueAria")}>
                {Object.values(HomeMatchQueue).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selectedQueue === option.value}
                    onClick={() => setQueue(option.value)}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="home-empty">
          <Icons.Cards size={22} aria-hidden="true" />
          <p>
            <strong>{t("home.next.noDeck")}</strong>
          </p>
        </div>
      )}
      <div className="home-next__actions">
        <Button size="lg" full icon={Icons.Search} onClick={() => onFindMatch(selectedQueue)}>
          {t("home.next.find")}
        </Button>
        <div className="home-next__row">
          <Button variant="secondary" icon={Icons.Bot} onClick={onPractice}>
            {t("home.next.bot")}
          </Button>
          <Button variant="secondary" icon={Icons.Plus} onClick={onPrivateMatch}>
            {t("home.next.room")}
          </Button>
        </div>
      </div>
    </HomeCard>
  );
}
