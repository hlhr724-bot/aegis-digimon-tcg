/* The filter rail beside a card pool: color, kind, level, cost, rarity and text search. */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, ColorDot } from "../design/primitives";
import { Icons } from "../design/icons";
import { COLORS, COLOR_KEYS } from "../design/theme";
import { useTranslation } from "../i18n";
import {
  CARD_SORTS,
  COST_FILTERS,
  CardFilter,
  CardSort,
  HIGHEST_COST_FILTER,
  KIND_FILTERS,
  LEVEL_FILTERS,
  RARITY_FILTERS,
} from "./cardFilters";
import { DIGIVOLUTION_COST_FILTERS, HIGHEST_DIGIVOLUTION_COST_FILTER } from "@/screens/matchesDigivolutionCostFilter";
import "./cardLibrary.css";

type GetCostChipLabelParams = {
  cost: number;
  highestCost: number;
};

function getCostChipLabel({ cost, highestCost }: GetCostChipLabelParams): string {
  if (cost === highestCost) {
    return `${cost}+`;
  }
  return String(cost);
}

/* ---------- the shared left filter rail ---------- */
export function FilterRail({
  filter,
  extra,
  showCostFilter = false,
  showRarityFilter = false,
  showSort = false,
}: {
  filter: CardFilter;
  extra?: ReactNode;
  showCostFilter?: boolean;
  showRarityFilter?: boolean;
  showSort?: boolean;
}) {
  const { t } = useTranslation();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const sheetId = useId();
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    sheetRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [mobileFiltersOpen]);

  return (
    <>
      <Button
        className="card-filter-trigger"
        variant="secondary"
        icon={Icons.Filter}
        aria-controls={sheetId}
        aria-expanded={mobileFiltersOpen}
        onClick={() => setMobileFiltersOpen(true)}
      >
        {t("mobile.filters")}
      </Button>
      {mobileFiltersOpen ? (
        <button
          type="button"
          className="card-filter-sheet-backdrop"
          aria-label={t("common.close")}
          onClick={() => setMobileFiltersOpen(false)}
        />
      ) : null}
      <aside
        ref={sheetRef}
        id={sheetId}
        className={`card-filter-rail${mobileFiltersOpen ? " is-mobile-open has-footer" : ""}`}
        role={mobileFiltersOpen ? "dialog" : undefined}
        aria-modal={mobileFiltersOpen || undefined}
        aria-labelledby={mobileFiltersOpen ? `${sheetId}-title` : undefined}
        tabIndex={mobileFiltersOpen ? -1 : undefined}
      >
        <div className="card-filter-sheet-header">
          <h2 id={`${sheetId}-title`}>{t("mobile.filters")}</h2>
          <button type="button" aria-label={t("common.close")} onClick={() => setMobileFiltersOpen(false)}>
            ×
          </button>
        </div>
        <div className="card-filter-search">
          <Icons.Search size={15} aria-hidden="true" />
          <input
            className="card-filter-input"
            aria-label={t("library.searchPlaceholder")}
            name="cardSearch"
            autoComplete="off"
            value={filter.query}
            onChange={(e) => filter.setQuery(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
          />
        </div>

        <div className="card-filter-group">
          <div className="card-filter-label">{t("library.color")}</div>
          <div className="card-filter-chips">
            {COLOR_KEYS.map((col) => {
              const on = filter.colors.includes(col);
              const c = COLORS[col];
              return (
                <button
                  key={col}
                  className="card-filter-chip card-filter-chip--color"
                  aria-pressed={on}
                  onClick={() => filter.toggleColor(col)}
                  style={{ "--chip-color": c.base, "--chip-soft": c.soft } as CSSProperties}
                >
                  <ColorDot color={col} size={10} />
                  {col}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card-filter-group">
          <div className="card-filter-label">{t("library.cardType")}</div>
          <div className="card-filter-chips">
            {KIND_FILTERS.map((k) => (
              <button
                key={k}
                className="card-filter-chip"
                aria-pressed={filter.kinds.includes(k)}
                onClick={() => filter.toggleKind(k)}
              >
                {t(`library.kind.${k}` as const)}
              </button>
            ))}
          </div>
        </div>

        <div className="card-filter-group">
          <div className="card-filter-label">{t("library.level")}</div>
          <div className="card-filter-chips" role="group" aria-label={t("library.level")}>
            {LEVEL_FILTERS.map((level) => (
              <button
                key={level}
                className="card-filter-chip"
                onClick={() => filter.toggleLevel(level)}
                aria-pressed={filter.levels.includes(level)}
              >
                Lv. {level}
              </button>
            ))}
          </div>
        </div>

        {showCostFilter ? (
          <div className="card-filter-group">
            <div className="card-filter-label">{t("library.playCost")}</div>
            <div className="card-filter-chips" role="group" aria-label={t("library.playCost")}>
              {COST_FILTERS.map((cost) => (
                <button
                  key={cost}
                  className="card-filter-chip"
                  onClick={() => filter.toggleCost(cost)}
                  aria-pressed={filter.costs.includes(cost)}
                >
                  {getCostChipLabel({ cost, highestCost: HIGHEST_COST_FILTER })}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showCostFilter ? (
          <div className="card-filter-group">
            <div className="card-filter-label">{t("library.digivolutionCost")}</div>
            <div className="card-filter-chips" role="group" aria-label={t("library.digivolutionCost")}>
              {DIGIVOLUTION_COST_FILTERS.map((cost) => (
                <button
                  key={cost}
                  className="card-filter-chip"
                  onClick={() => filter.toggleDigivolutionCost(cost)}
                  aria-pressed={filter.digivolutionCosts.includes(cost)}
                >
                  {getCostChipLabel({ cost, highestCost: HIGHEST_DIGIVOLUTION_COST_FILTER })}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showRarityFilter ? (
          <div className="card-filter-group">
            <div className="card-filter-label">{t("library.rarity")}</div>
            <div className="card-filter-chips">
              {RARITY_FILTERS.map((rarity) => (
                <button
                  key={rarity}
                  className="card-filter-chip"
                  onClick={() => filter.toggleRarity(rarity)}
                  aria-pressed={filter.rarities.includes(rarity)}
                >
                  {rarity}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {filter.availableKeywords.length > 0 ? (
          <details className="card-filter-group card-filter-disclosure">
            <summary className="card-filter-label">
              {t("library.keywords")}
              {filter.keywords.length > 0 ? (
                <span className="card-filter-disclosure__count">{filter.keywords.length}</span>
              ) : null}
            </summary>
            <div className="card-filter-chips" role="group" aria-label={t("library.keywords")}>
              {filter.availableKeywords.map((keyword) => (
                <button
                  key={keyword.value}
                  className="card-filter-chip"
                  lang="en"
                  onClick={() => filter.toggleKeyword(keyword.value)}
                  aria-pressed={filter.keywords.includes(keyword.value)}
                >
                  {keyword.label}
                </button>
              ))}
            </div>
          </details>
        ) : null}

        {showSort ? (
          <div className="card-filter-group">
            <div className="card-filter-label">{t("library.sort")}</div>
            <select
              className="card-filter-input card-filter-select"
              value={filter.sort}
              onChange={(e) => filter.setSort(e.target.value as CardSort)}
              aria-label={t("library.sort")}
            >
              {CARD_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(`library.sort.${sort}` as const)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="card-filter-group">
          <div className="card-filter-label">{t("library.traitAttribute")}</div>
          <input
            className="card-filter-input"
            name="traitSearch"
            autoComplete="off"
            value={filter.traitQuery}
            onChange={(e) => filter.setTraitQuery(e.target.value)}
            aria-label={t("library.traitAttribute")}
            placeholder={t("library.traitAttributePlaceholder")}
          />
        </div>

        <div className="card-filter-group">
          <div className="card-filter-label">{t("library.set")}</div>
          <select
            className="card-filter-input card-filter-select"
            aria-label={t("library.set")}
            name="cardSet"
            value={filter.set}
            onChange={(e) => filter.setSet(e.target.value)}
          >
            <option value="">{t("library.allSets")}</option>
            {filter.availableSets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {extra}

        <button className="card-filter-clear" onClick={filter.clear}>
          <Icons.Filter size={14} />
          {t("library.clearFilters")}
        </button>
        {mobileFiltersOpen ? (
          <div className="card-filter-sheet-footer">
            <Button full onClick={() => setMobileFiltersOpen(false)}>
              {t("mobile.applyFilters", { count: filter.filtered.length })}
            </Button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
