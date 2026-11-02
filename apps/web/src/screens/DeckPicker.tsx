import { useFamousDecks } from "@/game/useFamousDecks";
import { deckLegality } from "@aegis/shared/decks/legality";
import { FamousDeckListDialog } from "@/screens/FamousDeckListDialog";
import { ProviderDeckBrowser } from "@/deckProviders/ProviderDeckBrowser";

import { memo, useEffect, useMemo, useState } from "react";
import { getCardDefinition } from "@aegis/shared";
import { Button, Field, IconButton } from "../design/primitives";
import { SectionHeading } from "../design/surfaces";
import { Icons } from "../design/icons";
import { COLORS, colorKey, type ColorName } from "../design/theme";
import type { DeckListing } from "../game/decks";
import { providerApi } from "@/deckProviders/providerApi";
import { ProviderAcknowledgment } from "@/deckProviders/ProviderAcknowledgment";
import { ProviderFreshness } from "@/deckProviders/ProviderFreshness";
import type { ProviderArchetype, ProviderPage } from "@aegis/shared/deckProviders/ProviderTypes";
import { useTranslation } from "../i18n";
import { DeckListCard } from "./DeckListCard";
import { LobbyCommunityDecks } from "./community/LobbyCommunityDecks";
import "./deckPicker.css";

export type DeckFilter = "all" | "mine" | "famous" | "community";

export interface OwnDeckEntry {
  deck: DeckListing;
  legal: boolean;
}

const ALL_COLLECTIONS = "";

const colorCache = new WeakMap<DeckListing, ColorName[]>();

export function deckColors(deck: DeckListing): ColorName[] {
  const cached = colorCache.get(deck);
  if (cached) return cached;
  const counts = new Map<ColorName, number>();
  for (const cardId of deck.mainDeck) {
    for (const color of getCardDefinition(cardId)?.colors ?? []) {
      const key = colorKey(color);
      if (key !== "Neutral") counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const colors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([color]) => color);
  const result = colors.length > 0 ? colors : [deck.color];
  colorCache.set(deck, result);
  return result;
}

export function DeckColorDots({ deck, className }: { deck: DeckListing; className?: string }) {
  return (
    <span className={`deck-color-dots${className ? ` ${className}` : ""}`} aria-hidden="true">
      {deckColors(deck).map((color) => (
        <span key={color} className="deck-color-dots__dot" style={{ background: COLORS[color].base }} />
      ))}
    </span>
  );
}

function matchesQuery(deck: DeckListing, query: string, collection?: string): boolean {
  if (query === "") return true;
  const haystack = [deck.name, deck.color, deck.blurb, collection ?? ""].join(" ").toLocaleLowerCase();
  return haystack.includes(query);
}

function SetCover({ collection }: { collection: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className="deck-picker__set-fallback">{collection.slice(0, 2)}</span>;
  return (
    <img
      className="deck-picker__set"
      src={`/sets/${collection}.jpg`}
      alt=""
      aria-hidden="true"
      onError={() => setMissing(true)}
    />
  );
}

function DeckPickerView({
  ownDecks,
  format,
  activeDeckId,
  randomSelected = false,
  randomPoolSize,
  onSelectRandom,
  onSelectDeck,
  onCopyDeck,
  onUseProviderDeck,
  onEditDeck,
  onBuildDeck,
  onPickCommunityDeck,
  onOpenCommunityDeck,
  accountId,
}: {
  ownDecks: OwnDeckEntry[];
  format?: import("@aegis/shared").DeckFormat;
  activeDeckId: string;
  randomSelected?: boolean;
  randomPoolSize?: number;
  onSelectRandom?: () => void;
  onSelectDeck: (id: string) => void;
  onCopyDeck: (deck: DeckListing) => void;
  onUseProviderDeck?: (deck: DeckListing) => void;
  onEditDeck?: (deck: DeckListing) => void;
  onBuildDeck?: () => void;
  onPickCommunityDeck: (id: string) => void;
  onOpenCommunityDeck?: (id: string) => void;
  accountId: string | undefined;
}) {
  const { t } = useTranslation();
  const deckCount = (count: number) => t(count === 1 ? "lobby.deckCountOne" : "lobby.deckCount", { count });
  const presets = useFamousDecks();
  const [viewedPreset, setViewedPreset] = useState<DeckListing>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DeckFilter>("all");
  const [collection, setCollection] = useState(ALL_COLLECTIONS);
  const [ownDecksOpen, setOwnDecksOpen] = useState(true);
  const [openCollections, setOpenCollections] = useState<ReadonlySet<string>>(new Set());
  const [catalog, setCatalog] = useState<ProviderPage<ProviderArchetype>>();
  const [catalogError, setCatalogError] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setCatalogError(false);
    void providerApi
      .meta(new URLSearchParams())
      .then((result) => {
        if (current) {
          setCatalog(result);
          setOpenCollections(new Set(result.formats.slice(0, 1).map((item) => item.id)));
        }
      })
      .catch(() => {
        if (current) {
          setCatalogError(true);
        }
      });
    return () => {
      current = false;
    };
  }, [catalogVersion]);
  const query = search.trim().toLocaleLowerCase();
  const searching = query !== "";

  const collectionApplies = filter !== "mine" && filter !== "community";
  const collectionChosen = collectionApplies && collection !== ALL_COLLECTIONS;

  const visibleOwnDecks = useMemo(() => ownDecks.filter(({ deck }) => matchesQuery(deck, query)), [ownDecks, query]);
  const presetGroups = (!catalog && !catalogError ? [] : (presets?.groups ?? [])).filter(
    (group) => !catalog?.formats.some((entry) => entry.id === group.collection),
  );
  const collections = [
    ...(catalog?.formats.map((group) => group.id) ?? []),
    ...presetGroups.map((group) => group.collection),
  ];
  const visibleGroups = collections
    .filter((id) => collection === ALL_COLLECTIONS || id === collection)
    .map((id) => ({
      id,
      decks: presetGroups
        .find((group) => group.collection === id)
        ?.decks.filter((deck) => matchesQuery(deck, query, id)),
    }))
    .filter((group) => !group.decks || group.decks.length > 0);
  const showCommunity = filter === "community";
  const showOwn =
    filter !== "famous" && !showCommunity && !collectionChosen && (ownDecks.length > 0 || onBuildDeck !== undefined);
  const showFamous = filter !== "mine" && !showCommunity;

  const filters: { key: DeckFilter; label: string; count?: number }[] = [
    { key: "all", label: t("lobby.filterAll") },
    { key: "mine", label: t("lobby.filterMine"), count: ownDecks.length },
    { key: "famous", label: t("lobby.filterFamous") },
    { key: "community", label: t("community.lobbyFilter") },
  ];

  return (
    <section className="deck-picker" aria-labelledby="deck-picker-title">
      <header className="deck-picker__header">
        <SectionHeading id="deck-picker-title" title={t("lobby.pickDeck")} />
        <div className="deck-picker__intro">
          <p>{t("lobby.pickDeckHint")}</p>
          {onSelectRandom ? (
            <Button
              className="deck-picker__random-action"
              variant={randomSelected ? "primary" : "secondary"}
              icon={randomSelected ? Icons.Check : Icons.Dices}
              disabled={randomPoolSize === 0}
              aria-pressed={randomSelected}
              onClick={onSelectRandom}
            >
              {t(randomSelected ? "lobby.randomSelected" : "lobby.randomAction")}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="deck-picker__toolbar">
        <label className="deck-picker__collection-filter">
          <span className="aegis-sr-only">{t("redesign.play.collection")}</span>
          <select
            value={collection}
            disabled={!collectionApplies}
            onChange={(event) => setCollection(event.target.value)}
          >
            <option value={ALL_COLLECTIONS}>{t("redesign.play.allCollections")}</option>
            {collections.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <Icons.ChevronDown className="deck-picker__select-chevron" size={16} />
        </label>
        <Field
          className="deck-picker__search"
          label={t("lobby.searchDecks")}
          name="deckSearch"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("lobby.searchDecksPlaceholder")}
        />
        <div className="deck-picker__filters" role="group" aria-label={t("lobby.filterLabel")}>
          {filters.map((option) => (
            <button
              type="button"
              key={option.key}
              className={filter === option.key ? "is-selected" : undefined}
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
              {option.count === undefined ? null : <span className="deck-picker__filter-count">{option.count}</span>}
            </button>
          ))}
        </div>
        {showCommunity || showFamous ? null : (
          <span className="deck-picker__result-count" role="status">
            {deckCount(visibleOwnDecks.length)}
          </span>
        )}
      </div>

      {viewedPreset ? (
        <FamousDeckListDialog
          deck={viewedPreset}
          collection={
            presets?.groups.find((group) => group.decks.some((deck) => deck.id === viewedPreset.id))?.collection ?? ""
          }
          active={!randomSelected && viewedPreset.id === activeDeckId}
          onUse={
            deckLegality(viewedPreset, { format }).legal
              ? () => {
                  onSelectDeck(viewedPreset.id);
                  setViewedPreset(undefined);
                }
              : undefined
          }
          onCopy={() => onCopyDeck(viewedPreset)}
          onClose={() => setViewedPreset(undefined)}
        />
      ) : null}
      {showCommunity ? (
        <LobbyCommunityDecks
          search={search.trim()}
          activeDeckId={randomSelected ? "" : activeDeckId}
          onPick={onPickCommunityDeck}
          onOpen={onOpenCommunityDeck}
          accountId={accountId}
        />
      ) : null}

      {showOwn ? (
        <section className="deck-picker__group deck-picker__own" aria-label={t("lobby.yourDecks")}>
          <details open={searching || ownDecksOpen}>
            <summary
              className="deck-picker__summary"
              onClick={(event) => {
                event.preventDefault();
                setOwnDecksOpen((current) => !current);
              }}
            >
              <h3 className="deck-picker__group-title">{t("lobby.yourDecks")}</h3>
              <span className="deck-picker__collection-count">{ownDecks.length}</span>
              <Icons.ChevronDown className="deck-picker__chevron" size={16} />
            </summary>
            {ownDecks.length === 0 ? (
              <p className="deck-picker__empty">
                {t("lobby.noDecks")}{" "}
                <button type="button" className="aegis-text-action" onClick={onBuildDeck}>
                  {t("lobby.noDecksLink")}
                </button>
                .
              </p>
            ) : visibleOwnDecks.length === 0 ? (
              <p className="deck-picker__empty">{t("lobby.noSearchResults")}</p>
            ) : (
              <div className="lobby-decks">
                {visibleOwnDecks.map(({ deck, legal }) => (
                  <DeckListCard
                    format={format}
                    key={deck.id}
                    deck={deck}
                    active={!randomSelected && deck.id === activeDeckId}
                    disabled={!legal}
                    onSelect={() => onSelectDeck(deck.id)}
                    actions={
                      <>
                        <DeckColorDots deck={deck} />
                        {onEditDeck ? (
                          <IconButton
                            size="sm"
                            variant="secondary"
                            label={t("common.edit")}
                            title={t("common.edit")}
                            onClick={() => onEditDeck(deck)}
                          >
                            <Icons.FileText size={16} />
                          </IconButton>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </details>
        </section>
      ) : null}

      {showFamous ? (
        <section className="deck-picker__group" aria-labelledby="deck-picker-famous-title">
          <ProviderAcknowledgment />
          <div className="deck-picker__group-heading">
            <h3 className="deck-picker__famous-title" id="deck-picker-famous-title">
              {t("lobby.famousDecks")}
            </h3>
            <p>{t("lobby.famousDecksDesc")}</p>
          </div>
          {catalogError ? (
            <p role="alert">
              {t("digilab.error")}{" "}
              <Button onClick={() => setCatalogVersion((value) => value + 1)}>{t("digilab.retry")}</Button>
            </p>
          ) : !catalog ? (
            <p role="status">{t("common.loading")}</p>
          ) : visibleGroups.length === 0 ? (
            <p>{t("digilab.empty")}</p>
          ) : null}
          {visibleGroups.map((group) => {
            const headingId = `famous-${group.id.toLowerCase()}`;
            const open = collectionChosen || openCollections.has(group.id) || (searching && Boolean(group.decks));
            return (
              <section className="deck-picker__collection" aria-labelledby={headingId} key={group.id}>
                <details open={open}>
                  <summary
                    className="deck-picker__summary"
                    onClick={(event) => {
                      event.preventDefault();
                      setOpenCollections((current) => {
                        const next = new Set(current);
                        if (next.has(group.id)) {
                          next.delete(group.id);
                        } else {
                          next.add(group.id);
                        }
                        return next;
                      });
                    }}
                  >
                    <SetCover collection={group.id} />
                    <h4 id={headingId} className="deck-picker__group-title">
                      {group.id}
                    </h4>
                    <Icons.ChevronDown className="deck-picker__chevron" size={16} />
                  </summary>
                  {open && group.decks ? (
                    <div className="lobby-decks">
                      {group.decks.map((deck) => (
                        <DeckListCard
                          key={deck.id}
                          deck={deck}
                          format={format}
                          active={!randomSelected && deck.id === activeDeckId}
                          disabled={!deckLegality(deck, { format }).legal}
                          onSelect={() => onSelectDeck(deck.id)}
                          actions={
                            <>
                              <DeckColorDots deck={deck} />
                              <IconButton
                                size="sm"
                                variant="secondary"
                                label={t("lobby.copyPreset")}
                                onClick={() => onCopyDeck(deck)}
                              >
                                <Icons.Copy size={16} />
                              </IconButton>
                              <IconButton
                                size="sm"
                                variant="secondary"
                                label={t("lobby.viewList")}
                                onClick={() => setViewedPreset(deck)}
                              >
                                <Icons.Eye size={16} />
                              </IconButton>
                            </>
                          }
                        />
                      ))}
                    </div>
                  ) : open ? (
                    <ProviderDeckBrowser
                      key={group.id}
                      collection={group.id}
                      search={search.trim()}
                      activeDeckId={randomSelected ? "" : activeDeckId}
                      format={format}
                      onCopy={onCopyDeck}
                      onUse={onUseProviderDeck ?? onCopyDeck}
                    />
                  ) : null}
                </details>
              </section>
            );
          })}
          <ProviderFreshness data={catalog} />
        </section>
      ) : null}
    </section>
  );
}

export const DeckPicker = memo(DeckPickerView);
