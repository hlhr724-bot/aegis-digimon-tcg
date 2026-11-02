import { deckFormatLabel } from "@/screens/deckFormatLabel";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useState } from "react";
import { deckLegality, formatRestrictionLabel, deckFormat, type CommunityPublication } from "@aegis/shared";
import { useCommunityPublications } from "@/community/useCommunityPublications";
import { Badge, Button, ColorDot, Field } from "@/design/primitives";
import { PageHeader } from "@/design/PageHeader";
import { StatStrip } from "@/design/surfaces";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import {
  createBlankDeck,
  deckBlurbLabel,
  displayCoverArt,
  displayCoverCard,
  parseDeckList,
  type DeckListing,
} from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";
import { DeckDeleteModal, DeckImportModal } from "@/screens/DeckTextModals";
import { DeckImageButton } from "@/screens/DeckImageButton";
import { DeckPublishModal, type PublishMode } from "@/screens/DeckPublishModal";
import { EGG_TARGET, MAIN_TARGET } from "@/screens/deckCounts";
import {
  DECK_LIST_SORTS,
  deckColors,
  isDeckListSort,
  orderDecks,
  setDeckListSort,
  useDeckListSort,
  type DeckListSort,
} from "@/screens/deckListOrder";
import { placeFavoriteDecksFirst } from "@/screens/favoriteDecks/placeFavoriteDecksFirst";
import { setDeckFavorite } from "@/screens/favoriteDecks/setDeckFavorite";
import { useFavoriteDeckIds } from "@/screens/favoriteDecks/useFavoriteDeckIds";
import { deckHasBetaCards } from "@/screens/deckHasBetaCards";
import "@/design/pageHeader.css";
import "@/screens/deckList.css";

const SORT_LABELS: Record<DeckListSort, TranslationKey> = {
  recent: "redesign.decks.list.sortRecent",
  name: "redesign.decks.list.sortName",
  color: "redesign.decks.list.sortColor",
};

type DeckListParams = {
  decks: DeckListing[];
  activeDeckId: string;
  onEdit: (deck: DeckListing) => void;
  onNew: () => void;
  onSelectDeck: (id: string) => void;
  onDelete: (id: string) => void;
  onPlay: () => void;
  signedIn?: boolean;
};

type CountPublishedDecksParams = {
  decks: readonly DeckListing[];
  publications: ReadonlyMap<string, CommunityPublication>;
};

function countPublishedDecks({ decks, publications }: CountPublishedDecksParams): number {
  return decks.filter((deck) => {
    const publication = publications.get(deck.id);
    return publication !== undefined && publication.status !== "hidden";
  }).length;
}

export function DeckList({
  decks,
  activeDeckId,
  onEdit,
  onNew,
  onSelectDeck,
  onDelete,
  onPlay,
  signedIn = false,
}: DeckListParams) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<DeckListing | null>(null);
  const [query, setQuery] = useState("");
  const sort = useDeckListSort();
  const favoriteDeckIds = useFavoriteDeckIds();
  const shownDecks = placeFavoriteDecksFirst({ decks: orderDecks(decks, sort, query), favoriteDeckIds });
  const [publishing, setPublishing] = useState<{ deck: DeckListing; mode: PublishMode } | null>(null);
  const { publications, publish, requestReview, unpublish } = useCommunityPublications(signedIn);

  const handleImport = (text: string) => {
    const result = parseDeckList(text);
    const base = createBlankDeck(decks, undefined, t("deck.newDeckName"));
    onEdit({
      ...base,
      mainDeck: result.mainDeck,
      eggDeck: result.eggDeck,
      mainDeckArts: result.mainDeckArts,
      eggDeckArts: result.eggDeckArts,
    });
    setImporting(false);
  };

  const activeDeck = decks.find((deck) => deck.id === activeDeckId);
  const readyCount = decks.filter((deck) => deckLegality(deck, { format: deck.format }).legal).length;
  const stats = [
    { label: t("redesign.decks.list.statDecks"), value: decks.length },
    { label: t("redesign.decks.list.statReady"), value: readyCount },
    ...(signedIn
      ? [{ label: t("redesign.decks.list.statPublished"), value: countPublishedDecks({ decks, publications }) }]
      : []),
  ];

  return (
    <main className="aegis-page deck-list-page">
      <div className="aegis-page__wrap">
        <PageHeader
          title={t("deck.title")}
          actions={
            <>
              <Button size="sm" variant="secondary" icon={Icons.Upload} onClick={() => setImporting(true)}>
                {t("common.import")}
              </Button>
              <Button size="sm" icon={Icons.Plus} onClick={onNew}>
                {t("deck.new")}
              </Button>
            </>
          }
        />

        {importing ? <DeckImportModal onImport={handleImport} onClose={() => setImporting(false)} /> : null}
        {deleting ? (
          <DeckDeleteModal
            deck={deleting}
            onConfirm={() => {
              onDelete(deleting.id);
              setDeleting(null);
            }}
            onClose={() => setDeleting(null)}
          />
        ) : null}
        {publishing ? (
          <DeckPublishModal
            deck={publishing.deck}
            mode={publishing.mode}
            onPublish={publish}
            onRequestReview={requestReview}
            onUnpublish={unpublish}
            onClose={() => setPublishing(null)}
          />
        ) : null}

        <div className="aegis-page__body">
          {decks.length > 0 ? (
            <section className="deck-list-panel deck-list-summary" aria-label={t("deck.eyebrow")}>
              <div className="deck-list-summary__active">
                <span className="deck-list-summary__cover" aria-hidden="true">
                  {activeDeck ? (
                    <CoverThumb
                      key={displayCoverCard(activeDeck)}
                      coverCardId={displayCoverCard(activeDeck)}
                      artId={displayCoverArt(activeDeck)}
                      sigilColor={activeDeck.color}
                      sigilSize={22}
                    />
                  ) : (
                    <Icons.Cards size={18} />
                  )}
                </span>
                <span className="deck-list-summary__active-text">
                  <span className="deck-list-summary__eyebrow">{t("redesign.decks.list.statActive")}</span>
                  <b>{activeDeck?.name ?? t("common.none")}</b>
                </span>
              </div>
              <StatStrip className="deck-list-summary__stats" stats={stats} />
            </section>
          ) : null}

          <section className="deck-list-panel deck-list-section" aria-labelledby="deck-list-saved-title">
            <div className="deck-list-section__header">
              <h2 id="deck-list-saved-title" className="deck-list-section__title">
                {t("redesign.decks.list.saved")}
                {decks.length > 0 ? <span className="deck-list-section__count">{decks.length}</span> : null}
              </h2>
              {decks.length > 0 ? (
                <div className="deck-list-toolbar">
                  <Field
                    className="deck-list-toolbar__search"
                    label={t("redesign.decks.list.search")}
                    name="deckListSearch"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("redesign.decks.list.searchPlaceholder")}
                  />
                  <label className="deck-list-toolbar__sort">
                    <span className="aegis-sr-only">{t("redesign.decks.list.sort")}</span>
                    <select
                      value={sort}
                      onChange={(event) => {
                        if (isDeckListSort(event.target.value)) {
                          setDeckListSort(event.target.value);
                        }
                      }}
                    >
                      {DECK_LIST_SORTS.map((option) => (
                        <option key={option} value={option}>
                          {t(SORT_LABELS[option])}
                        </option>
                      ))}
                    </select>
                    <Icons.ChevronDown className="deck-list-toolbar__chevron" size={16} />
                  </label>
                </div>
              ) : null}
            </div>
            <DeckListContent
              decks={decks}
              shownDecks={shownDecks}
              query={query}
              activeDeckId={activeDeckId}
              favoriteDeckIds={favoriteDeckIds}
              signedIn={signedIn}
              publications={publications}
              onNew={onNew}
              onEdit={onEdit}
              onSelectDeck={onSelectDeck}
              onPlay={onPlay}
              onDelete={setDeleting}
              onPublishAction={(deck, mode) => setPublishing({ deck, mode })}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

type DeckListContentParams = {
  decks: readonly DeckListing[];
  shownDecks: readonly DeckListing[];
  query: string;
  activeDeckId: string;
  favoriteDeckIds: readonly string[];
  signedIn: boolean;
  publications: ReadonlyMap<string, CommunityPublication>;
  onNew: () => void;
  onEdit: (deck: DeckListing) => void;
  onSelectDeck: (id: string) => void;
  onPlay: () => void;
  onDelete: (deck: DeckListing) => void;
  onPublishAction: (deck: DeckListing, mode: PublishMode) => void;
};

function DeckListContent({
  decks,
  shownDecks,
  query,
  activeDeckId,
  favoriteDeckIds,
  signedIn,
  publications,
  onNew,
  onEdit,
  onSelectDeck,
  onPlay,
  onDelete,
  onPublishAction,
}: DeckListContentParams) {
  const { t } = useTranslation();
  if (decks.length === 0) {
    return (
      <div className="deck-list-empty">
        <p role="status">{t("deck.empty")}</p>
        <Button size="sm" icon={Icons.Plus} onClick={onNew}>
          {t("deck.new")}
        </Button>
      </div>
    );
  }
  if (shownDecks.length === 0) {
    return (
      <div className="deck-list-empty">
        <p role="status">{t("redesign.decks.list.noMatches", { query: query.trim() })}</p>
      </div>
    );
  }
  return (
    <div className="deck-list-table" role="table" aria-labelledby="deck-list-saved-title">
      <div className="deck-list-table__head" role="rowgroup">
        <div className="deck-list-table__row" role="row">
          <span role="columnheader">{t("redesign.decks.list.columnDeck")}</span>
          <span role="columnheader">{t("redesign.decks.list.columnColors")}</span>
          <span role="columnheader">
            <span className="aegis-sr-only">{t("redesign.decks.list.columnActions")}</span>
          </span>
        </div>
      </div>
      <div className="deck-list-grid" role="rowgroup">
        {shownDecks.map((deck) => (
          <DeckListRow
            key={deck.id}
            deck={deck}
            active={deck.id === activeDeckId}
            favorite={favoriteDeckIds.includes(deck.id)}
            onEdit={() => onEdit(deck)}
            onSelect={() => onSelectDeck(deck.id)}
            onPlay={() => {
              onSelectDeck(deck.id);
              onPlay();
            }}
            onDelete={() => onDelete(deck)}
            signedIn={signedIn}
            publication={publications.get(deck.id)}
            onPublishAction={(mode) => onPublishAction(deck, mode)}
          />
        ))}
      </div>
    </div>
  );
}

type DeckListRowParams = {
  deck: DeckListing;
  active: boolean;
  favorite: boolean;
  onEdit: () => void;
  onSelect: () => void;
  onPlay: () => void;
  onDelete: () => void;
  signedIn: boolean;
  publication: CommunityPublication | undefined;
  onPublishAction: (mode: PublishMode) => void;
};

function DeckListRow({
  deck,
  active,
  favorite,
  onEdit,
  onSelect,
  onPlay,
  onDelete,
  signedIn,
  publication,
  onPublishAction,
}: DeckListRowParams) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const { legal, banViolations, pairViolations } = deckLegality(deck, { format: deck.format });
  const colors = deckColors(deck);
  const blurb = deckBlurbLabel(t, deck.blurb);
  const moderation = publication?.status === "hidden" ? publication.moderation : undefined;
  const reviewPending = moderation?.reviewRequestedAt != null;
  const showFinishHint = !legal && banViolations.length === 0 && pairViolations.length === 0;

  return (
    <div className={`deck-list-table__row deck-list-row${active ? " is-active" : ""}`} role="row">
      <div className="deck-list-row__deck" role="cell">
        <span className="deck-list-row__cover">
          <CoverThumb
            key={displayCoverCard(deck)}
            coverCardId={displayCoverCard(deck)}
            artId={displayCoverArt(deck)}
            sigilColor={deck.color}
            sigilSize={28}
          />
        </span>
        <div className="deck-list-row__identity">
          <div className="deck-list-row__name">
            <button
              type="button"
              className="deck-list-row__favorite"
              aria-label={t("redesign.decks.list.favorite")}
              aria-pressed={favorite}
              title={favorite ? t("redesign.decks.list.unfavorite") : t("redesign.decks.list.favorite")}
              onClick={() => setDeckFavorite({ deckId: deck.id, favorite: !favorite })}
            >
              {favorite ? <Icons.Star size={18} /> : <Icons.StarOutline size={18} />}
            </button>
            <h3 className="deck-list-row__title">{deck.name}</h3>
          </div>
          <div className="deck-list-row__meta">
            <span className="deck-list-row__counts">
              <span data-complete={deck.mainDeck.length === MAIN_TARGET}>
                {t("deck.main")} {deck.mainDeck.length}/{MAIN_TARGET}
              </span>
              <span aria-hidden="true">·</span>
              <span data-complete={deck.eggDeck.length === EGG_TARGET}>
                {t("deck.egg")} {deck.eggDeck.length}/{EGG_TARGET}
              </span>
            </span>
            {active ? (
              <Badge tone="primary">
                <Icons.Check size={12} />
                {t("deck.active")}
              </Badge>
            ) : null}
            <Badge tone={legal ? "success" : "neutral"}>
              {legal ? t("redesign.decks.list.legal") : t("redesign.decks.list.draft")}
            </Badge>
            {deck.format && deck.format !== "standard" ? <Badge>{deckFormatLabel(deck.format, t)}</Badge> : null}
            {deckHasBetaCards(deck) ? <Badge tone="primary">{t("beta.tag")}</Badge> : null}
            {reviewPending ? (
              <Badge tone="warning" className="deck-list-row__visibility">
                <Icons.Clock size={12} />
                {t("community.moderation.reviewRequestedBadge")}
              </Badge>
            ) : publication?.status === "hidden" ? (
              <Badge tone="danger" className="deck-list-row__visibility">
                <Icons.Flag size={12} />
                {t("community.moderation.hiddenOwnerBadge")}
              </Badge>
            ) : publication ? (
              <Badge tone="primary" className="deck-list-row__visibility">
                <Icons.Users size={12} />
                {t("community.publish.public")}
                <Icons.Heart size={12} />
                {publication.likeCount}
              </Badge>
            ) : signedIn ? (
              <Badge className="deck-list-row__visibility">{t("community.publish.private")}</Badge>
            ) : null}
          </div>
          {publication?.status === "hidden" ? (
            <p className="deck-list-row__blurb">
              {moderation?.reason
                ? t("community.moderation.hiddenReason", { reason: t(`community.report.reason.${moderation.reason}`) })
                : t("community.moderation.hiddenOwnerNote")}{" "}
              {t(reviewPending ? "community.moderation.reviewPendingNote" : "community.moderation.ownerFixHint")}
            </p>
          ) : publication?.outdated ? (
            <p className="deck-list-row__blurb">{t("community.publish.outdated")}</p>
          ) : null}
          {moderation?.note ? (
            <p className="deck-list-row__blurb">{t("community.moderation.ownerNote", { note: moderation.note })}</p>
          ) : null}
          {blurb ? <p className="deck-list-row__blurb">{blurb}</p> : null}
          {showFinishHint ? <p className="deck-list-row__hint">{t("deck.finishToUse")}</p> : null}
          {banViolations.length > 0 ? (
            <p className="deck-list-row__violation">
              {banViolations.map(([id]) => (
                <span key={id}>
                  {getCardName(id)} ({formatRestrictionLabel(id, deckFormat(deck.format))}){" "}
                </span>
              ))}
            </p>
          ) : null}
          {pairViolations.length > 0 ? (
            <div className="deck-list-row__violation deck-list-row__violation--pair">
              <strong>{t("deck.pairTitle")}</strong>
              {pairViolations.map(([a, b]) => (
                <div key={`${a}-${b}`}>
                  {t("deck.pairRow", {
                    a: getCardName(a),
                    b: getCardName(b),
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="deck-list-row__colors" role="cell">
        <span role="img" aria-label={t("redesign.decks.list.colors", { colors: colors.join(", ") })}>
          {colors.map((color) => (
            <ColorDot key={color} color={color} size={10} />
          ))}
        </span>
      </div>
      <div className="deck-list-row__actions" role="cell">
        {legal && !active ? (
          <Button size="sm" variant="ghost" className="deck-list-row__activate" onClick={onSelect}>
            {t("deck.setActive")}
          </Button>
        ) : null}
        <Button size="sm" variant={legal ? "secondary" : "primary"} icon={Icons.Pencil} onClick={onEdit}>
          {t("common.edit")}
        </Button>
        {legal ? (
          <Button size="sm" icon={Icons.Swords} onClick={onPlay}>
            {t("common.play")}
          </Button>
        ) : null}
        {signedIn ? <DeckPublishActions deck={deck} publication={publication} onAction={onPublishAction} /> : null}
        <DeckImageButton deck={deck} size="sm" variant="ghost" iconOnly label={t("common.export")} />
        <Button
          size="sm"
          variant="ghost"
          className="deck-list-row__delete"
          icon={Icons.Trash}
          aria-label={t("deck.delete")}
          title={t("deck.delete")}
          onClick={onDelete}
        />
      </div>
    </div>
  );
}

type DeckPublishActionsParams = {
  deck: DeckListing;
  publication: CommunityPublication | undefined;
  onAction: (mode: PublishMode) => void;
};

function DeckPublishActions({ deck, publication, onAction }: DeckPublishActionsParams) {
  const { t } = useTranslation();
  const legal = deckLegality(deck).legal;
  if (publication?.status === "hidden") {
    if (publication.moderation?.reviewRequestedAt != null || !legal) {
      return null;
    }
    return (
      <Button size="sm" variant="ghost" icon={Icons.Send} onClick={() => onAction("review")}>
        {t("community.review.action")}
      </Button>
    );
  }
  if (publication) {
    return (
      <>
        {publication.outdated && legal ? (
          <Button size="sm" variant="ghost" icon={Icons.Users} onClick={() => onAction("update")}>
            {t("community.publish.update")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => onAction("unpublish")}>
          {t("community.publish.unpublish")}
        </Button>
      </>
    );
  }
  if (!legal) {
    return null;
  }
  return (
    <Button size="sm" variant="ghost" icon={Icons.Users} onClick={() => onAction("publish")}>
      {t("community.publish.action")}
    </Button>
  );
}
