import { useEffect, useState } from "react";
import type { CommunityDeckSummary } from "@aegis/shared";
import { COMMUNITY_MATCHUP_LIMITS } from "@aegis/shared/deckSimulation/COMMUNITY_MATCHUP_LIMITS";
import { communityApi } from "@/community/client";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { OpponentDeckTile } from "@/screens/deckSimulation/OpponentDeckTile";

interface CommunityOpponentPickerProps {
  selected: readonly string[];
  disabled: boolean;
  onChange: (deckIds: string[]) => void;
  onDecksLoaded: (decks: readonly CommunityDeckSummary[]) => void;
}

const SEARCH_DELAY_MS = 300;
const VISIBLE_STEP = 10;
const PLACEHOLDERS = Array.from({ length: VISIBLE_STEP }, (_, index) => index);

export function CommunityOpponentPicker({ selected, disabled, onChange, onDecksLoaded }: CommunityOpponentPickerProps) {
  const { t, locale } = useTranslation();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [decks, setDecks] = useState<CommunityDeckSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(VISIBLE_STEP);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(0);
      setVisible(VISIBLE_STEP);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    communityApi
      .browse({ sort: "top", period: "all", colors: [], search, page })
      .then((result) => {
        if (!active) return;
        const legal = result.decks.filter((deck) => deck.legal);
        setDecks((current) => (page === 0 ? legal : [...current, ...legal]));
        setHasMore(result.hasMore);
        onDecksLoaded(legal);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, page, attempt, onDecksLoaded]);

  const toggle = (deckId: string) =>
    onChange(selected.includes(deckId) ? selected.filter((id) => id !== deckId) : [...selected, deckId]);
  const full = selected.length >= COMMUNITY_MATCHUP_LIMITS.maxOpponents;
  const shown = decks.slice(0, visible);
  const canShowMore = visible < decks.length || hasMore;
  const showMore = () => {
    if (visible + VISIBLE_STEP > decks.length && hasMore) setPage((current) => current + 1);
    setVisible((current) => current + VISIBLE_STEP);
  };

  return (
    <div className="deck-matchup__picker">
      <div className="deck-matchup__picker-bar">
        <label className="deck-matchup__search">
          <Icons.Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t("deckMatchup.community.search")}
            aria-label={t("deckMatchup.community.search")}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="deck-matchup__picked" aria-live="polite">
          {t("deckMatchup.community.selected", { count: selected.length, max: COMMUNITY_MATCHUP_LIMITS.maxOpponents })}
        </span>
        {selected.length > 0 ? (
          <button type="button" className="deck-matchup__link" disabled={disabled} onClick={() => onChange([])}>
            {t("deckMatchup.community.clear")}
          </button>
        ) : null}
      </div>
      <p className="deck-sim__hint">
        {t("deckMatchup.community.hint", {
          max: COMMUNITY_MATCHUP_LIMITS.maxOpponents,
          count: COMMUNITY_MATCHUP_LIMITS.defaultOpponents,
        })}
      </p>
      {failed ? (
        <div className="deck-sim__notice deck-matchup__retry">
          <span>{t("deckMatchup.community.unavailable")}</span>
          <button
            type="button"
            className="deck-sim-button"
            data-size="small"
            onClick={() => setAttempt((count) => count + 1)}
          >
            {t("deckMatchup.community.retry")}
          </button>
        </div>
      ) : null}
      {loading && decks.length === 0 ? (
        <ul className="opponent-grid" aria-hidden="true">
          {PLACEHOLDERS.map((index) => (
            <li key={index} className="opponent-tile--placeholder" />
          ))}
        </ul>
      ) : null}
      {shown.length > 0 ? (
        <ul className="opponent-grid" aria-label={t("deckMatchup.source.community")}>
          {shown.map((deck) => {
            const picked = selected.includes(deck.id);
            return (
              <OpponentDeckTile
                key={deck.id}
                name={deck.name}
                detail={t("deckMatchup.community.by", { author: deck.author.displayName })}
                colors={deck.colors}
                coverCardId={deck.coverCardId ?? undefined}
                selected={picked}
                disabled={disabled || (!picked && full)}
                label={t("deckMatchup.community.deck", { name: deck.name, author: deck.author.displayName })}
                meta={
                  <span className="opponent-tile__likes">
                    <Icons.Heart size={11} aria-hidden="true" />
                    <span className="aegis-sr-only">{t("deckMatchup.community.likes", { count: deck.likeCount })}</span>
                    <span aria-hidden="true">{deck.likeCount.toLocaleString(locale)}</span>
                  </span>
                }
                onToggle={() => toggle(deck.id)}
              />
            );
          })}
        </ul>
      ) : null}
      {!loading && !failed && decks.length === 0 ? (
        <p className="deck-sim__hint">{t("deckMatchup.community.empty")}</p>
      ) : null}
      {loading ? <p className="aegis-sr-only">{t("deckMatchup.community.loading")}</p> : null}
      {canShowMore && !loading ? (
        <button type="button" className="deck-sim-button deck-matchup__more" disabled={disabled} onClick={showMore}>
          {t("deckMatchup.community.more")}
        </button>
      ) : null}
    </div>
  );
}
