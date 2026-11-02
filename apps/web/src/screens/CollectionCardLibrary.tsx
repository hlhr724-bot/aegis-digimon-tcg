import { useEffect, useMemo, useRef, useState } from "react";
import type { CardDefinition } from "@aegis/shared";
import { getCardArts } from "@aegis/shared";
import { findCardArtForLanguage } from "@aegis/shared/cards/findCardArtForLanguage";
import { CardFull } from "@/design/cards";
import { activeCollectionCards } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";
import { CardDetailDrawer } from "@/screens/CardDetailDrawer";
import { CARD_SORTS, useCardFilter, type CardSort } from "@/screens/cardFilters";
import { useCardImageLanguage } from "@/screens/cardLanguage/useCardImageLanguage";
import { sortCards } from "@/screens/cardSorting";
import { FilterRail } from "@/screens/FilterRail";
import { sortSearchResults } from "@/screens/sortSearchResults";

const PAGE_SIZE = 48;

type CollectionCardLibraryParams = {
  hidden: boolean;
};

type SortLibraryParams = {
  cards: readonly CardDefinition[];
  sort: CardSort;
  query: string;
};

function sortLibrary({ cards, sort, query }: SortLibraryParams): readonly CardDefinition[] {
  if (sort === "releaseDate") {
    return cards;
  }
  return sortSearchResults({ cards, sort, query });
}

export function CollectionCardLibrary({ hidden }: CollectionCardLibraryParams) {
  const { t } = useTranslation();
  const language = useCardImageLanguage();
  const all = useMemo<CardDefinition[]>(() => sortCards(activeCollectionCards(), "releaseDate"), []);
  const filter = useCardFilter(all, { initialQuery: new URLSearchParams(window.location.search).get("q") ?? "" });
  const sorted = useMemo(
    () => sortLibrary({ cards: filter.filtered, sort: filter.sort, query: filter.query }),
    [filter.filtered, filter.sort, filter.query],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const totalRef = useRef(sorted.length);
  totalRef.current = sorted.length;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sorted]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => (count >= totalRef.current ? count : count + PAGE_SIZE));
        }
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const shown = sorted.slice(0, visibleCount);
  const total = sorted.length.toLocaleString();

  return (
    <div className="collection-library" hidden={hidden}>
      <section className="collection-card collection-hero">
        <div className="collection-hero__copy">
          <h2>{t("collection.title")}</h2>
          <p>{t("redesign.collection.lede")}</p>
        </div>
        <dl className="collection-stats">
          <div>
            <dt>{t("redesign.collection.statCards")}</dt>
            <dd>{all.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t("redesign.collection.statSets")}</dt>
            <dd>{filter.availableSets.length}</dd>
          </div>
          <div>
            <dt>{t("redesign.collection.statMatching")}</dt>
            <dd>{total}</dd>
          </div>
        </dl>
      </section>

      <section className="collection-card collection-filters" aria-label={t("mobile.filters")}>
        <FilterRail filter={filter} />
      </section>

      <div className="collection-results" data-detail={selected ? true : undefined}>
        <section className="collection-card collection-cards" aria-labelledby="collection-results-title">
          <header className="collection-cards__header">
            <h2 id="collection-results-title">
              {t("redesign.collection.results")}
              <span className="collection-count">{t("collection.count", { count: total })}</span>
            </h2>
            <select
              className="collection-sort"
              aria-label={t("library.sort")}
              value={filter.sort}
              onChange={(event) => filter.setSort(event.target.value as CardSort)}
            >
              {CARD_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(`library.sort.${sort}` as const)}
                </option>
              ))}
            </select>
          </header>
          <div className="collection-cards__content">
            {shown.length === 0 ? (
              <p className="collection-empty">{t("collection.empty")}</p>
            ) : (
              <div className="collection-grid">
                {shown.map((card) => (
                  <div key={card.cardId} className="collection-card-entry">
                    <CardFull
                      cardId={card.cardId}
                      artId={findCardArtForLanguage({ cardId: card.cardId, language })?.artId}
                      width={150}
                      selected={selected === card.cardId}
                      onClick={() => setSelected((current) => (current === card.cardId ? null : card.cardId))}
                    />
                    {getCardArts(card.cardId).length > 1 ? (
                      <button type="button" className="collection-art-count" onClick={() => setSelected(card.cardId)}>
                        {t("library.artworks")} · {getCardArts(card.cardId).length}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {shown.length > 0 && shown.length < sorted.length ? (
              <p className="collection-more">
                {t("redesign.collection.showing", { shown: shown.length.toLocaleString(), total })}
              </p>
            ) : null}
            <div ref={sentinelRef} className="collection-sentinel" />
          </div>
        </section>

        {selected ? (
          <CardDetailDrawer
            key={`${selected}:${language}`}
            cardId={selected}
            initialArtId={findCardArtForLanguage({ cardId: selected, language })?.artId}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
