import { useDeferredValue, useMemo, useState } from "react";
import type { PackCard } from "@/packOpening/PackCard";
import { getPackCardKey } from "@/packOpening/getPackCardKey";
import { PackRarity } from "@/packOpening/PackRarity";
import { PackResultCard } from "@/packOpening/PackResultCard";
import { groupPackResults } from "@/packOpening/results/groupPackResults";
import { ResultGrouping } from "@/packOpening/results/ResultGrouping";
import { ResultRarityFilter } from "@/packOpening/results/ResultRarityFilter";
import { ResultSort } from "@/packOpening/results/ResultSort";

type Props = {
  cards: readonly PackCard[];
  foilEnabled: boolean;
  onInspect: (index: number) => void;
};

const RARITY_OPTIONS = [
  ResultRarityFilter.ALL,
  ResultRarityFilter.ALTERNATE_ART,
  ...Object.values(PackRarity).reverse(),
];

export function PackOpeningResults({ cards, foilEnabled, onInspect }: Props) {
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<string>(ResultRarityFilter.ALL.value);
  const [sort, setSort] = useState<ResultSort>(ResultSort.PACK_ORDER.value);
  const [grouping, setGrouping] = useState<ResultGrouping>(ResultGrouping.PACK.value);
  const deferredQuery = useDeferredValue(query);
  const groups = useMemo(
    () => groupPackResults({ cards, query: deferredQuery, rarity, sort, grouping }),
    [cards, deferredQuery, rarity, sort, grouping],
  );
  const shown = groups.reduce((total, group) => total + group.entries.length, 0);
  const filtered = query.trim().length > 0 || rarity !== ResultRarityFilter.ALL.value;

  function clearFilters() {
    setQuery("");
    setRarity(ResultRarityFilter.ALL.value);
  }

  return (
    <section className="pack-opening-results" aria-label="All opened cards">
      <div className="pack-opening-results__heading">
        <h2>All cards ({cards.length})</h2>
        <p>Click a card to zoom in the 3D scene.</p>
      </div>
      <div className="pack-opening-results__toolbar" role="search">
        <label className="pack-opening-results__search">
          <span className="pack-opening-results__label">Search</span>
          <input
            type="search"
            value={query}
            placeholder="Name or card number"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="pack-opening-results__control">
          <span className="pack-opening-results__label">Rarity</span>
          <select value={rarity} onChange={(event) => setRarity(event.target.value)}>
            {RARITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pack-opening-results__control">
          <span className="pack-opening-results__label">Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as ResultSort)}>
            {Object.values(ResultSort).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pack-opening-results__control">
          <span className="pack-opening-results__label">Group by</span>
          <select value={grouping} onChange={(event) => setGrouping(event.target.value as ResultGrouping)}>
            {Object.values(ResultGrouping).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="pack-opening-results__summary" aria-live="polite">
        {filtered ? `Showing ${shown} of ${cards.length} cards` : `${cards.length} cards`}
        {filtered ? (
          <button type="button" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </p>
      {groups.length === 0 ? <p className="pack-opening-results__empty">No cards match these filters.</p> : null}
      {groups.map((group) => (
        <section key={group.key} className="pack-opening-results__group">
          {grouping === ResultGrouping.NONE.value ? null : (
            <h3>
              {group.label} <span>{group.entries.length}</span>
            </h3>
          )}
          <div className="pack-opening-results__grid">
            {group.entries.map(({ card, index }) => (
              <PackResultCard
                key={`${getPackCardKey(card)}-${index}`}
                card={card}
                index={index}
                foilEnabled={foilEnabled}
                onInspect={onInspect}
              />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
