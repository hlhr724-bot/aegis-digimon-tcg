import { useEffect, useState } from "react";
import type { CommunityDeckSummary } from "@aegis/shared/decks/community";
import { CommunityCard } from "@/community/CommunityCard";
import { communityApi } from "@/community/client";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { colorKey } from "@/design/theme";
import { useTranslation } from "@/i18n/useTranslation";

const TRENDING_LIMIT = 5;

type CommunityTrendingParams = {
  onOpenDeck: (id: string) => void;
};

export function CommunityTrending({ onOpenDeck }: CommunityTrendingParams) {
  const { t, locale } = useTranslation();
  const [decks, setDecks] = useState<CommunityDeckSummary[]>([]);

  useEffect(() => {
    let current = true;
    communityApi
      .browse({ sort: "top", period: "week", colors: [], search: "", page: 0 })
      .then((page) => {
        if (current) {
          setDecks(page.decks.slice(0, TRENDING_LIMIT));
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  if (decks.length === 0) {
    return null;
  }
  return (
    <CommunityCard title={t("community.trending.title")} className="community-trending">
      <ol className="community-list">
        {decks.map((deck, index) => (
          <li key={deck.id}>
            <button type="button" className="community-trend" onClick={() => onOpenDeck(deck.id)}>
              <span className="community-trend__position">{index + 1}</span>
              <span className="community-trend__cover">
                <CoverThumb
                  coverCardId={deck.coverCardId ?? undefined}
                  sigilColor={colorKey(deck.colors[0])}
                  sigilSize={24}
                />
              </span>
              <span className="community-trend__identity">
                <b>{deck.name}</b>
                <small>{deck.author.displayName}</small>
              </span>
              <span className="community-trend__likes" title={t("community.likes", { count: deck.likeCount })}>
                <Icons.Heart size={13} />
                {deck.likeCount.toLocaleString(locale)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </CommunityCard>
  );
}
