import { useEffect, useState } from "react";
import type { CommunityDeckSummary, CommunityPeriod, CommunitySort } from "@aegis/shared/decks/community";
import { CardColor } from "@aegis/shared/schema/enums";
import { communityApi } from "@/community/client";
import { Icons } from "@/design/icons";
import { Button, ColorDot } from "@/design/primitives";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { CommunityDeckTile } from "@/screens/community/CommunityDeckTile";
import { CommunityTrending } from "@/screens/community/CommunityTrending";

const SEARCH_DELAY_MS = 300;
const COLORS = Object.values(CardColor).filter((color) => color !== CardColor.None);
const SORTS: { key: CommunitySort; label: TranslationKey }[] = [
  { key: "top", label: "community.sortTop" },
  { key: "new", label: "community.sortNew" },
];
const PERIODS: { key: CommunityPeriod; label: TranslationKey }[] = [
  { key: "week", label: "community.periodWeek" },
  { key: "month", label: "community.periodMonth" },
  { key: "all", label: "community.periodAll" },
];

type Results =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; decks: CommunityDeckSummary[]; hasMore: boolean; page: number; loadingMore: boolean };

type CommunityBrowseParams = {
  signedIn: boolean;
  accountId: string | undefined;
  onOpenDeck: (id: string) => void;
  onPlay: (id: string) => void;
  onCopy: (id: string) => void;
};

export function CommunityBrowse({ signedIn, accountId, onOpenDeck, onPlay, onCopy }: CommunityBrowseParams) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<CommunitySort>("top");
  const [period, setPeriod] = useState<CommunityPeriod>("week");
  const [colors, setColors] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Results>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let current = true;
    setResults({ status: "loading" });
    communityApi
      .browse({ sort, period, colors, search, page: 0 })
      .then((page) => {
        if (current) {
          setResults({ status: "ready", ...page, page: 0, loadingMore: false });
        }
      })
      .catch(() => {
        if (current) {
          setResults({ status: "failed" });
        }
      });
    return () => {
      current = false;
    };
  }, [sort, period, colors, search, attempt]);

  const loadMore = async () => {
    if (results.status !== "ready" || results.loadingMore) {
      return;
    }
    const page = results.page + 1;
    setResults({ ...results, loadingMore: true });
    try {
      const next = await communityApi.browse({ sort, period, colors, search, page });
      setResults({
        status: "ready",
        decks: [...results.decks, ...next.decks],
        hasMore: next.hasMore,
        page,
        loadingMore: false,
      });
    } catch {
      setResults({ ...results, loadingMore: false });
    }
  };

  const toggleColor = (color: string) =>
    setColors((current) =>
      current.includes(color) ? current.filter((entry) => entry !== color) : [...current, color],
    );

  return (
    <div className="community-split">
      <div className="community-stack">
        <div className="community-filters">
          <label className="community-field">
            <Icons.Search size={16} />
            <span className="aegis-sr-only">{t("community.search")}</span>
            <input
              type="search"
              value={searchInput}
              placeholder={t("community.search")}
              maxLength={60}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <div className="community-switch" role="group" aria-label={t("community.sortLabel")}>
            {SORTS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={sort === option.key}
                onClick={() => setSort(option.key)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          {sort === "top" ? (
            <div className="community-switch" role="group" aria-label={t("community.periodLabel")}>
              {PERIODS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={period === option.key}
                  onClick={() => setPeriod(option.key)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="community-chips" role="group" aria-label={t("community.colorsLabel")}>
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="community-chip"
                aria-pressed={colors.includes(color)}
                onClick={() => toggleColor(color)}
              >
                <ColorDot color={color} size={8} />
                {color}
              </button>
            ))}
          </div>
        </div>

        <section className="community-results" aria-busy={results.status === "loading"}>
          <CommunityResults
            results={results}
            signedIn={signedIn}
            accountId={accountId}
            onOpenDeck={onOpenDeck}
            onPlay={onPlay}
            onCopy={onCopy}
            onRetry={() => setAttempt((value) => value + 1)}
            onLoadMore={loadMore}
          />
        </section>
      </div>
      <aside className="community-stack community-aside">
        <CommunityTrending onOpenDeck={onOpenDeck} />
      </aside>
    </div>
  );
}

type CommunityResultsParams = CommunityBrowseParams & {
  results: Results;
  onRetry: () => void;
  onLoadMore: () => void;
};

function CommunityResults({
  results,
  signedIn,
  accountId,
  onOpenDeck,
  onPlay,
  onCopy,
  onRetry,
  onLoadMore,
}: CommunityResultsParams) {
  const { t } = useTranslation();
  if (results.status === "loading") {
    return (
      <p className="community-empty" role="status">
        {t("common.loading")}
      </p>
    );
  }
  if (results.status === "failed") {
    return (
      <div className="community-empty" role="alert">
        <p>{t("community.loadError")}</p>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t("community.retry")}
        </Button>
      </div>
    );
  }
  if (results.decks.length === 0) {
    return (
      <div className="community-empty" role="status">
        <p>{t("community.empty")}</p>
        <p>{t("community.emptyHint")}</p>
      </div>
    );
  }
  return (
    <>
      <div className="community-deck-grid">
        {results.decks.map((deck) => (
          <CommunityDeckTile
            key={deck.id}
            deck={deck}
            signedIn={signedIn}
            accountId={accountId}
            onOpen={() => onOpenDeck(deck.id)}
            onCopy={() => onCopy(deck.id)}
            onPlay={() => onPlay(deck.id)}
          />
        ))}
      </div>
      {results.hasMore ? (
        <div className="community-more">
          <Button variant="secondary" disabled={results.loadingMore} onClick={onLoadMore}>
            {results.loadingMore ? t("common.loading") : t("community.loadMore")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
