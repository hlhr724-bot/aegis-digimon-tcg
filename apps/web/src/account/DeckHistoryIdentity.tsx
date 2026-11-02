import { useState } from "react";
import type { DeckHistoryDetails } from "@aegis/shared/decks/DeckHistoryDetails";
import { CoverThumb } from "@/design/cards";
import { Button } from "@/design/primitives";
import { COLORS } from "@/design/theme";
import { usedDeckListing } from "@/game/usedDeckListing";
import { displayCoverCard, displayCoverArt } from "@/game/decks";
import { FamousDeckListDialog } from "@/screens/FamousDeckListDialog";
import { deckFormatLabel } from "@/screens/deckFormatLabel";
import { useTranslation } from "@/i18n/useTranslation";

type Props = { details: DeckHistoryDetails };

export function DeckHistoryIdentity({ details }: Props) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const listing = { ...usedDeckListing({ snapshot: details.deck }), coverCardId: details.coverCardId };
  const format = deckFormatLabel(listing.format ?? "standard", t);
  return (
    <>
      <div className="profile-deck-overview__identity">
        <div className="profile-deck-overview__cover" aria-hidden="true">
          <CoverThumb
            coverCardId={displayCoverCard(listing)}
            artId={displayCoverArt(listing)}
            sigilColor={listing.color}
          />
        </div>
        <div className="profile-deck-overview__description">
          <span className="profile-deck-overview__eyebrow">{t("profile.deckStats.currentList")}</span>
          <h3>
            <span
              className="profile-deck-overview__color"
              style={{ backgroundColor: COLORS[listing.color].base }}
              aria-hidden="true"
            />
            {listing.name}
          </h3>
          <span className="profile-deck-overview__format">{format}</span>
          <p>{t("lobby.famousDeckCards", { main: listing.mainDeck.length, egg: listing.eggDeck.length })}</p>
          {details.cardsChangedAt > 0 ? (
            <p className="profile-deck-overview__changed">
              {t("profile.deckStats.changed")}
              <time dateTime={new Date(details.cardsChangedAt).toISOString()}>
                {new Date(details.cardsChangedAt).toLocaleDateString(locale, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </p>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {t("profile.deckStats.viewDeck")}
          </Button>
        </div>
      </div>
      {open ? (
        <FamousDeckListDialog
          deck={listing}
          collection={format}
          active={false}
          eyebrow={t("profile.deckStats.currentList")}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
