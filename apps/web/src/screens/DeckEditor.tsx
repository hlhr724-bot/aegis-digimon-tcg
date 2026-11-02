import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useCardImageLanguage } from "@/screens/cardLanguage/useCardImageLanguage";
import { findCardArtForLanguage } from "@aegis/shared/cards/findCardArtForLanguage";
/* The builder itself: a filterable pool on the left, the 50-main + 5-egg list on the
   right, and the legality counters that gate a save. */

import { useMemo, useState, useEffect, useRef, type CSSProperties } from "react";
import {
  formatPairViolations,
  formatCardViolation,
  formatCopyLimit,
  deckFormat,
  type DeckFormat,
  getCardArts,
  getCardDefinition,
  resolveCardArt,
  type CardDefinition,
  sharedCardNumberCount,
  sharedCardNumberGroups,
} from "@aegis/shared";
import { Button, type Screen } from "../design/primitives";
import { CoverThumb } from "../design/cards";
import { Icons } from "../design/icons";
import { Panel, SectionHeading } from "../design/surfaces";
import { useMediaQuery } from "../design/useMediaQuery";
import { CardDetailDrawer } from "./CardDetailDrawer";
import { DeckSleevePicker } from "./DeckSleevePicker";
import { DeckFormatSelector } from "./DeckFormatSelector";
import { FilterRail } from "./FilterRail";
import { useCardFilter } from "./cardFilters";
import { sortSearchResults } from "@/screens/sortSearchResults";
import {
  activeCollectionCards,
  displayCoverCard,
  dominantColor,
  parseDeckList,
  randomCoverCard,
  serializeDeckList,
  type DeckListing,
} from "../game/decks";
import {
  DeckKindCounts,
  DeckLevelCurve,
  DeckPreviewSections,
  DeckStepper,
  DeckViewToggle,
  useDeckView,
} from "./deckPreview";
import { DeckSplitHandle, DeckSplitPresets, useDeckShare } from "./DeckSplitHandle";
import { setDeckBuilderPreferences, useDeckBuilderPreferences } from "./deckBuilderPreferences";
import { DeckCoverPicker } from "@/screens/DeckCoverPicker";
import { DeckArtworkPicker } from "./DeckArtworkPicker";
import { useTranslation } from "../i18n";
import { ColorBalance } from "./ColorBalance";
import { DeckCostCurve } from "@/screens/DeckCostCurve";
import { DeckTypeBreakdown } from "@/screens/DeckTypeBreakdown";
import { CountChip } from "./CountChip";
import { DeckImportModal } from "./DeckTextModals";
import { DeckExportModal } from "@/screens/DeckExportModal";
import { PoolCard } from "./PoolCard";
import { CountMap, EGG_TARGET, MAIN_TARGET, expand, isEggCard, toCountMap, total } from "./deckCounts";
import "./deckBuilder.css";

const PAGE_SIZE = 60;

/* ---------------- editor ---------------- */
/** Each card's per-copy artwork, from a deck's flat copy and art lists. */
function artsByCard(deck: Pick<DeckListing, "mainDeck" | "eggDeck" | "mainDeckArts" | "eggDeckArts">) {
  const result: Record<string, string[]> = {};
  for (const [ids, choices] of [
    [deck.mainDeck, deck.mainDeckArts],
    [deck.eggDeck, deck.eggDeckArts],
  ] as const) {
    ids.forEach((id, index) => (result[id] ??= []).push(resolveCardArt(id, choices?.[index]).artId));
  }
  return result;
}

export function DeckEditor({
  deck,
  onSave,
  onClose,
  onNav,
}: {
  deck: DeckListing;
  onSave: (deck: DeckListing, setActive: boolean) => void;
  onClose: () => void;
  onNav: (s: Screen) => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const language = useCardImageLanguage();
  const [format, setFormat] = useState<DeckFormat>(() => deckFormat(deck.format));
  const pool = useMemo<CardDefinition[]>(
    () => activeCollectionCards().filter((card) => !formatCardViolation(card.cardId, format)),
    [format],
  );
  const { deckSort } = useDeckBuilderPreferences();
  const filter = useCardFilter(pool, {
    colorFilterMode: "all",
    savedSort: { sort: deckSort, setSort: (sort) => setDeckBuilderPreferences({ deckSort: sort }) },
  });
  const [main, setMain] = useState<CountMap>(() => toCountMap(deck.mainDeck));
  const [egg, setEgg] = useState<CountMap>(() => toCountMap(deck.eggDeck));
  const [arts, setArts] = useState<Record<string, string[]>>(() => artsByCard(deck));
  const [chosenArt, setChosenArt] = useState<Record<string, string>>({});
  const [artPickerCard, setArtPickerCard] = useState<string | null>(null);
  const [name, setName] = useState(deck.name);
  const [coverCardId, setCoverCardId] = useState<string | undefined>(() => displayCoverCard(deck));
  const [sleeveId, setSleeveId] = useState<string | undefined>(deck.sleeveId);
  const [eggSleeveId, setEggSleeveId] = useState<string | undefined>(deck.eggSleeveId);
  const [sel, setSel] = useState<string | null>(null);
  const [choosingCover, setChoosingCover] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deckInfoOpen, setDeckInfoOpen] = useState(false);
  const [deckInfoExpanded, setDeckInfoExpanded] = useState(false);
  const narrow = useMediaQuery("(width < 960px)");
  const sheet = useRef<HTMLElement>(null);
  const sheetTrigger = useRef<HTMLButtonElement>(null);
  const onSaveRef = useRef(onSave);
  const workspace = useRef<HTMLDivElement>(null);
  const deckShare = useDeckShare();
  const { view, setView } = useDeckView();

  function closeDeckInfo() {
    setDeckInfoOpen(false);
    sheetTrigger.current?.focus();
  }

  useEffect(() => {
    if (deckInfoOpen && narrow) sheet.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [deckInfoOpen, narrow]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const mainCount = total(main);
  const eggCount = total(egg);
  const validMain = mainCount === MAIN_TARGET;
  const shownName = name.trim() || t("deck.untitled");

  const deckCardIds = useMemo(
    () => [...Object.entries(main), ...Object.entries(egg)].flatMap(([cardId, count]) => Array(count).fill(cardId)),
    [main, egg],
  );

  const copyLimit = (id: string): number => formatCopyLimit(id, format);
  const outsideFormat = [...new Set(deckCardIds)].filter((id) => formatCardViolation(id, format));
  const add = (cardId: string) => {
    const def = getCardDefinition(cardId);
    if (!def) return;
    if (formatCardViolation(cardId, format) || copyLimit(cardId) === 0) return;
    if (formatPairViolations([...deckCardIds, cardId], format).length > 0) return;
    const eggCard = isEggCard(def);
    const map = eggCard ? egg : main;
    const cur = map[cardId] ?? 0;
    const cap = Math.min(def.maxCountInDeck, copyLimit(cardId));
    if (sharedCardNumberCount(deckCardIds, cardId) >= cap) return;
    if (eggCard && eggCount >= EGG_TARGET) return;
    if (!eggCard && mainCount >= MAIN_TARGET) return;
    setArts((previous) => ({
      ...previous,
      [cardId]: [
        ...(previous[cardId] ?? []),
        resolveCardArt(cardId, chosenArt[cardId] ?? findCardArtForLanguage({ cardId, language })?.artId).artId,
      ],
    }));
    (eggCard ? setEgg : setMain)({ ...map, [cardId]: cur + 1 });
  };
  const applyArt = (cardId: string, artId: string, copy: number | "all") =>
    setArts((previous) => ({
      ...previous,
      [cardId]: (previous[cardId] ?? Array.from({ length: main[cardId] ?? egg[cardId] ?? 0 }, () => cardId)).map(
        (current, index) => (copy === "all" || index === copy ? artId : current),
      ),
    }));
  const remove = (cardId: string) => {
    const def = getCardDefinition(cardId);
    if (!def) return;
    const eggCard = isEggCard(def);
    const map = eggCard ? egg : main;
    const cur = map[cardId] ?? 0;
    if (!cur) return;
    const next = { ...map };
    if (cur === 1) delete next[cardId];
    else next[cardId] = cur - 1;
    setArts((previous) => ({ ...previous, [cardId]: (previous[cardId] ?? []).slice(0, cur - 1) }));
    (eggCard ? setEgg : setMain)(next);
  };

  const banlistViolations = useMemo(() => {
    const violations: { cardId: string; count: number; cap: number }[] = [];
    for (const [cardId, count] of Object.entries(main)) {
      const cap = copyLimit(cardId);
      if (count > cap) violations.push({ cardId, count, cap });
    }
    for (const [cardId, count] of Object.entries(egg)) {
      const cap = copyLimit(cardId);
      if (count > cap) violations.push({ cardId, count, cap });
    }
    for (const [, members] of sharedCardNumberGroups(deckCardIds)) {
      if (members.length < 2) continue;
      const count = sharedCardNumberCount(deckCardIds, members[0]!);
      const cap = Math.min(...members.map(copyLimit));
      if (count > cap) violations.push({ cardId: members.join(" + "), count, cap });
    }
    return violations;
  }, [main, egg, deckCardIds, format]);

  const pairViolations = useMemo(
    () => formatPairViolations([...Object.keys(main), ...Object.keys(egg)], format),
    [main, egg, format],
  );
  const pairedCardIds = useMemo(() => new Set(pairViolations.flat()), [pairViolations]);

  const persist = (setActive: boolean) => {
    const mainDeck = expand(main);
    const eggDeck = expand(egg);
    onSaveRef.current(
      {
        ...deck,
        name: name.trim() || t("deck.untitled"),
        color: dominantColor(mainDeck, deck.color),
        mainDeck,
        eggDeck,
        coverCardId,
        sleeveId,
        eggSleeveId,
        format,
        mainDeckArts: Object.entries(main).flatMap(([id, count]) =>
          Array.from({ length: count }, (_, i) => resolveCardArt(id, arts[id]?.[i]).artId),
        ),
        eggDeckArts: Object.entries(egg).flatMap(([id, count]) =>
          Array.from({ length: count }, (_, i) => resolveCardArt(id, arts[id]?.[i]).artId),
        ),
      },
      setActive,
    );
  };

  useEffect(() => {
    persist(false);
  }, [main, egg, name, coverCardId, sleeveId, eggSleeveId, arts, format]);

  const play = () => {
    persist(true);
    onNav("lobby");
  };

  const handleImport = (text: string) => {
    const result = parseDeckList(text, format);
    setArts(artsByCard(result));
    setMain(toCountMap(result.mainDeck));
    setEgg(toCountMap(result.eggDeck));
    setImporting(false);
  };

  const exportDeck = { ...deck, name, mainDeck: expand(main), eggDeck: expand(egg) };
  const exportText = serializeDeckList(exportDeck);

  const selectedCount = sel ? (main[sel] ?? egg[sel] ?? 0) : 0;
  const selectedDefinition = sel ? getCardDefinition(sel) : undefined;
  const selectedAtMax =
    !sel ||
    !selectedDefinition ||
    copyLimit(sel) === 0 ||
    !!formatCardViolation(sel, format) ||
    pairedCardIds.has(sel) ||
    sharedCardNumberCount(deckCardIds, sel) >= Math.min(selectedDefinition.maxCountInDeck, copyLimit(sel));

  const [page, setPage] = useState(1);

  const sortedPool = useMemo(() => {
    return sortSearchResults({ cards: filter.filtered, sort: filter.sort, query: filter.query });
  }, [filter.filtered, filter.sort, filter.query]);

  useEffect(() => {
    setPage(1);
  }, [filter.filtered]);

  const shownPool = sortedPool.slice(0, page * PAGE_SIZE);

  const onPoolScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (shownPool.length < sortedPool.length && el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
      setPage((p) => p + 1);
    }
  };

  return (
    <main className="deck-builder-page">
      {importing ? <DeckImportModal onImport={handleImport} onClose={() => setImporting(false)} /> : null}
      {exporting ? <DeckExportModal text={exportText} deck={exportDeck} onClose={() => setExporting(false)} /> : null}
      <div className="deck-builder-top">
        <button type="button" className="deck-builder-crumb" onClick={onClose}>
          <Icons.ChevronLeft size={16} />
          {t("deck.title")}
        </button>
      </div>
      <div className="deck-builder-body">
        <FilterRail filter={filter} showCostFilter showRarityFilter showSort />

        <div className="deck-workspace" ref={workspace} style={deckShare.style}>
          <div className="deck-card-pool" onScroll={onPoolScroll}>
            <DeckFormatSelector value={format} onChange={setFormat} />
            <SectionHeading
              title={t("redesign.decks.editor.pool")}
              action={
                <span className="deck-card-pool__count">
                  {t("common.cards", { count: sortedPool.length.toLocaleString() })}
                </span>
              }
            />
            <p className="deck-card-pool__hint">{t("deck.builderHint")}</p>
            <div className="deck-card-grid">
              {shownPool.map((card) => {
                const inDeck = (isEggCard(card) ? egg : main)[card.cardId] ?? 0;
                const cap = Math.min(card.maxCountInDeck, copyLimit(card.cardId));
                return (
                  <PoolCard
                    key={card.cardId}
                    cardId={card.cardId}
                    format={format}
                    inDeck={inDeck}
                    atMax={sharedCardNumberCount(deckCardIds, card.cardId) >= cap}
                    pairConflict={pairedCardIds.has(card.cardId)}
                    onAdd={() => add(card.cardId)}
                    onRemove={() => remove(card.cardId)}
                    onOpen={() => {
                      setSel(card.cardId);
                    }}
                    selected={sel === card.cardId || inDeck > 0}
                  />
                );
              })}
              {shownPool.length === 0 ? <div className="deck-card-pool__empty">{t("deck.emptyPool")}</div> : null}
            </div>
            {shownPool.length < sortedPool.length ? (
              <div className="deck-card-pool__more">{t("deck.scrollForMore")}</div>
            ) : null}
          </div>

          <DeckSplitHandle workspace={workspace} share={deckShare.share} onShare={deckShare.setShare} />

          {deckInfoOpen ? (
            <button
              type="button"
              className="deck-info-backdrop"
              aria-label={t("common.close")}
              onClick={closeDeckInfo}
            />
          ) : null}
          <aside
            ref={sheet}
            className={`deck-current${deckInfoOpen ? " deck-current--open" : ""}${deckInfoExpanded ? " deck-current--expanded" : ""}`}
            aria-label={t("deck.detailsTitle")}
            onKeyDown={(event) => {
              if (narrow && event.key === "Escape" && !event.defaultPrevented) {
                event.preventDefault();
                closeDeckInfo();
              }
            }}
          >
            <div className="deck-info-sheet-handle">
              <button
                type="button"
                aria-label={t(
                  deckInfoExpanded ? "redesign.decks.editor.collapseSheet" : "redesign.decks.editor.expandSheet",
                )}
                aria-pressed={deckInfoExpanded}
                onClick={() => setDeckInfoExpanded((previous) => !previous)}
              >
                {deckInfoExpanded ? <Icons.Minimize size={18} /> : <Icons.Maximize size={18} />}
              </button>
              <strong>{t("deck.detailsTitle")}</strong>
              <button type="button" aria-label={t("redesign.decks.editor.closeSheet")} onClick={closeDeckInfo}>
                ×
              </button>
            </div>
            <Panel as="div" className="deck-current__header">
              <div className="deck-current__identity">
                <div className="deck-current__cover-thumb">
                  <CoverThumb
                    key={coverCardId}
                    coverCardId={coverCardId}
                    artId={coverCardId ? arts[coverCardId]?.[0] : undefined}
                    sigilColor={dominantColor(expand(main))}
                    sigilSize={22}
                  />
                </div>
                <div className="deck-current__cover-text">
                  <input
                    className="deck-current__name"
                    aria-label={t("redesign.decks.editor.name")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <div className="deck-current__cover-row">
                    <div className="deck-current__cover-name" data-auto={!coverCardId}>
                      <span className="aegis-hero-panel__eyebrow">{t("deck.cover")}</span>{" "}
                      {coverCardId ? getCardName(coverCardId) : t("deck.coverAuto")}
                    </div>
                    <button
                      type="button"
                      className="deck-current__change-cover"
                      disabled={deckCardIds.length === 0}
                      aria-haspopup="dialog"
                      onClick={() => setChoosingCover(true)}
                    >
                      <Icons.Pencil size={14} />
                      {t("deck.changeCover")}
                    </button>
                  </div>
                </div>
                <div className="deck-current__counts">
                  <CountChip label={t("deck.main")} count={mainCount} target={MAIN_TARGET} done={validMain} />
                  <CountChip
                    label={t("deck.egg")}
                    count={eggCount}
                    target={EGG_TARGET}
                    done={eggCount === EGG_TARGET}
                  />
                </div>
                <button
                  className="deck-current__random-cover"
                  onClick={() => setCoverCardId(randomCoverCard(expand(main)))}
                  disabled={mainCount === 0}
                  title={t("deck.randomCover")}
                  aria-label={t("deck.randomCover")}
                >
                  <Icons.Dices size={15} />
                </button>
              </div>
            </Panel>

            <div className="deck-current__toolbar">
              <DeckKindCounts main={main} />
              <DeckLevelCurve main={main} compact />
              <div className="deck-current__toolbar-controls">
                <DeckViewToggle view={view} onView={setView} />
                <DeckSplitPresets share={deckShare.share} onShare={deckShare.setShare} />
              </div>
            </div>

            <div className="deck-current__body">
              <DeckPreviewSections
                view={view}
                format={format}
                main={main}
                egg={egg}
                coverCardId={coverCardId}
                pairConflictCardIds={pairedCardIds}
                onOpen={setSel}
                onAdd={add}
                onRemove={remove}
                arts={arts}
              />

              <div className="deck-current__stats">
                <DeckTypeBreakdown main={main} egg={egg} />
                <DeckCostCurve main={main} />
                <ColorBalance main={main} />
              </div>
            </div>

            <div className="deck-current__footer">
              <DeckSleevePicker
                sleeveIds={{ main: sleeveId, egg: eggSleeveId }}
                onChange={(part, next) => (part === "main" ? setSleeveId : setEggSleeveId)(next)}
              />
              {outsideFormat.length > 0 ? (
                <div className="deck-current__violations" role="status">
                  {t("deckFormat.violations", { count: outsideFormat.length })}
                  <div>{outsideFormat.join(", ")}</div>
                </div>
              ) : null}
              {banlistViolations.length > 0 ? (
                <div className="deck-current__violations">
                  <strong>{t("deck.banlistTitle")}</strong>
                  {banlistViolations.map((v) => {
                    return (
                      <div key={v.cardId}>
                        {t("deck.banlistRow", { name: getCardName(v.cardId), count: v.count, cap: v.cap })}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="deck-current__row">
                <Button variant="ghost" size="sm" icon={Icons.Upload} onClick={() => setImporting(true)}>
                  {t("common.import")}
                </Button>
                <Button variant="ghost" size="sm" icon={Icons.Download} onClick={() => setExporting(true)}>
                  {t("common.export")}
                </Button>
                <span className="deck-current__row-spacer" />
                <Button variant="secondary" size="sm" icon={Icons.ArrowLeft} onClick={narrow ? closeDeckInfo : onClose}>
                  {t("common.close")}
                </Button>
                <Button
                  size="sm"
                  icon={Icons.Swords}
                  disabled={
                    !validMain || outsideFormat.length > 0 || banlistViolations.length > 0 || pairViolations.length > 0
                  }
                  onClick={play}
                >
                  {t("common.play")}
                </Button>
              </div>
            </div>
          </aside>
        </div>
        {sel ? (
          <CardDetailDrawer
            key={sel}
            cardId={sel}
            format={format}
            artId={chosenArt[sel] ?? findCardArtForLanguage({ cardId: sel, language })?.artId ?? arts[sel]?.[0]}
            onArtChange={(artId) => {
              setChosenArt((previous) => ({ ...previous, [sel]: artId }));
            }}
            onArtApply={
              selectedCount > 0 && getCardArts(sel).length > 1 ? (artId) => applyArt(sel, artId, "all") : undefined
            }
            onClose={() => setSel(null)}
            footer={
              <div className="deck-drawer-actions">
                {selectedCount > 0 ? (
                  <div className="deck-drawer-count">
                    <span>{t("deck.inDeck")}</span>
                    <DeckStepper
                      name={getCardName(sel)}
                      count={selectedCount}
                      addDisabled={selectedAtMax}
                      onAdd={() => add(sel)}
                      onRemove={() => remove(sel)}
                    />
                  </div>
                ) : (
                  <Button full icon={Icons.Plus} disabled={selectedAtMax} onClick={() => add(sel)}>
                    {copyLimit(sel) === 0 ? t("common.banned") : t("deck.addToDeck")}
                  </Button>
                )}
                {selectedCount > 0 && getCardArts(sel).length > 1 ? (
                  <Button
                    full
                    variant="secondary"
                    icon={Icons.Palette}
                    aria-label={`${getCardName(sel)} · ${t("deck.editArtwork")}`}
                    onClick={() => setArtPickerCard(sel)}
                  >
                    {t("deck.editArtwork")}
                  </Button>
                ) : null}
                <Button
                  full
                  variant={coverCardId === sel ? "secondary" : "ghost"}
                  icon={coverCardId === sel ? Icons.Check : Icons.Star}
                  onClick={() => setCoverCardId(sel)}
                >
                  {coverCardId === sel ? t("deck.coverCard") : t("deck.setAsCover")}
                </Button>
              </div>
            }
          />
        ) : null}
      </div>

      <button
        type="button"
        className="deck-info-trigger"
        ref={sheetTrigger}
        onClick={() => {
          setDeckInfoExpanded(false);
          setDeckInfoOpen(true);
        }}
        aria-expanded={deckInfoOpen}
        aria-label={[
          t("redesign.decks.editor.openSheet"),
          shownName,
          `${t("deck.main")} ${mainCount}/${MAIN_TARGET}`,
          `${t("deck.egg")} ${eggCount}/${EGG_TARGET}`,
        ].join(" · ")}
        title={t("redesign.decks.editor.openSheetHint")}
      >
        <span className="deck-info-trigger__cover" aria-hidden="true">
          <CoverThumb
            key={coverCardId}
            coverCardId={coverCardId}
            artId={coverCardId ? arts[coverCardId]?.[0] : undefined}
            sigilColor={dominantColor(expand(main))}
            sigilSize={16}
          />
        </span>
        <span className="deck-info-trigger__text">
          <span className="deck-info-trigger__title">{shownName}</span>
          <span className="deck-info-trigger__counts">
            <span data-done={validMain}>
              {t("deck.main")} {mainCount}/{MAIN_TARGET}
            </span>
            <span aria-hidden="true">·</span>
            <span data-done={eggCount === EGG_TARGET}>
              {t("deck.egg")} {eggCount}/{EGG_TARGET}
            </span>
          </span>
          <span
            className="deck-info-trigger__progress"
            style={{ "--deck-progress": `${Math.min(100, (mainCount / MAIN_TARGET) * 100)}%` } as CSSProperties}
          >
            <span />
          </span>
        </span>
        <span className="deck-info-trigger__action">
          <Icons.ChevronUp size={16} />
          {t("redesign.decks.editor.openSheet")}
        </span>
      </button>

      {artPickerCard ? (
        <DeckArtworkPicker
          key={`artwork-${artPickerCard}`}
          cardId={artPickerCard}
          arts={arts[artPickerCard] ?? []}
          count={main[artPickerCard] ?? egg[artPickerCard] ?? 0}
          onClose={() => setArtPickerCard(null)}
          onChoose={(artId, copy) => applyArt(artPickerCard, artId, copy)}
        />
      ) : null}
      {choosingCover ? (
        <DeckCoverPicker
          cardIds={deckCardIds}
          coverCardId={coverCardId}
          arts={arts}
          onChoose={(cardId) => {
            setCoverCardId(cardId);
            setChoosingCover(false);
          }}
          onClose={() => setChoosingCover(false)}
        />
      ) : null}
    </main>
  );
}
