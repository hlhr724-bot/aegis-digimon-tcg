/* The lobby's Community filter: the week's most-liked public decks, searched through the api.
   Picking one borrows it as the battle deck without saving it. */

import { useEffect, useState } from "react";
import type { CommunityDeckSummary } from "@aegis/shared";
import { communityApi } from "../../community/client";
import { communityTileListing } from "../../community/communityDeckListing";
import { ColorDot, IconButton } from "../../design/primitives";
import { Icons } from "../../design/icons";
import { useTranslation } from "../../i18n";
import { DeckListCard } from "../DeckListCard";
import { LikeButton } from "./LikeButton";
import "./community.css";

const SEARCH_DELAY_MS = 300;

type Results = { status: "loading" } | { status: "failed" } | { status: "ready"; decks: CommunityDeckSummary[] };

export function LobbyCommunityDecks({
  search,
  activeDeckId,
  accountId,
  onPick,
  onOpen,
}: {
  search: string;
  activeDeckId: string;
  /** The signed-in account, which can like; guests see the count only. */
  accountId: string | undefined;
  onPick: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [results, setResults] = useState<Results>({ status: "loading" });

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      communityApi
        .browse({ sort: "top", period: "week", colors: [], search, page: 0 })
        .then((page) => {
          if (current) setResults({ status: "ready", decks: page.decks });
        })
        .catch(() => {
          if (current) setResults({ status: "failed" });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <section className="deck-picker__group" aria-labelledby="deck-picker-community-title">
      <div className="deck-picker__group-heading">
        <h3 className="deck-picker__famous-title" id="deck-picker-community-title">
          {t("community.lobbyTitle")}
        </h3>
        <p>{t("community.lobbyHint")}</p>
      </div>
      {results.status === "loading" ? (
        <p className="deck-picker__empty">{t("common.loading")}</p>
      ) : results.status === "failed" ? (
        <p className="deck-picker__empty">{t("community.loadError")}</p>
      ) : results.decks.length === 0 ? (
        <p className="deck-picker__empty">{t("community.empty")}</p>
      ) : (
        <div className="lobby-decks community-lobby-decks">
          {results.decks.map((deck) => {
            const listing = communityTileListing(deck);
            const active = listing.id === activeDeckId;
            return (
              <DeckListCard
                key={deck.id}
                deck={listing}
                active={active}
                disabled={!deck.legal}
                onSelect={() => onPick(deck.id)}
                subtitle={t("community.byAuthor", { name: deck.author.displayName })}
                actions={
                  <>
                    <span className="community-tile__colors" aria-hidden="true">
                      {deck.colors.map((color) => (
                        <ColorDot key={color} color={color} size={10} />
                      ))}
                    </span>
                    <LikeButton
                      key={`${deck.id}:${deck.likeCount}:${deck.likedByMe}`}
                      deck={deck}
                      signedIn={accountId !== undefined}
                      ownDeck={deck.author.id === accountId}
                    />
                    {onOpen ? (
                      <IconButton
                        size="sm"
                        variant="secondary"
                        label={t("community.viewList")}
                        title={t("community.viewList")}
                        onClick={() => onOpen(deck.id)}
                      >
                        <Icons.Eye size={16} />
                      </IconButton>
                    ) : null}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
