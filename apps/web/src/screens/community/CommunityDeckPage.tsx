import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { DeckGuide } from "@/screens/community/DeckGuide";
import { DeckGuideEditor } from "@/screens/community/DeckGuideEditor";
import { CardDetailDrawer } from "@/screens/CardDetailDrawer";
import { useEffect, useState } from "react";
import { type CommunityDeck } from "@aegis/shared";
import { communityApi } from "../../community/client";
import { communityDeckListing } from "../../community/communityDeckListing";
import { CardFull, CoverThumb } from "../../design/cards";
import { Alert, Badge, Button, ColorDot } from "../../design/primitives";
import { Panel, SectionHeading } from "../../design/surfaces";
import { Icons } from "../../design/icons";
import { displayCoverArt, displayCoverCard } from "../../game/decks";
import { useTranslation } from "../../i18n";
import { DeckImageButton } from "../DeckImageButton";
import { deckSections } from "../deckSections";
import { LikeButton } from "./LikeButton";
import { DeckReportsPanel } from "./DeckReportsPanel";
import { DeckReviewPanel } from "./DeckReviewPanel";
import { HideDeckDialog } from "./HideDeckDialog";
import { ReportDeckDialog } from "./ReportDeckDialog";

type Load = { status: "loading" } | { status: "missing" } | { status: "ready"; deck: CommunityDeck };

export function CommunityDeckPage({
  deckId,
  signedIn,
  accountId,
  isAdmin,
  onBack,
  onPlay,
  onCopy,
  onNotice,
}: {
  deckId: string;
  signedIn: boolean;
  accountId: string | undefined;
  isAdmin: boolean;
  onBack: () => void;
  onPlay: (deck: CommunityDeck) => void;
  onCopy: (deck: CommunityDeck) => void;
  onNotice: (message: string) => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t, locale } = useTranslation();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [editingGuide, setEditingGuide] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [moderationFailed, setModerationFailed] = useState(false);
  const [inspectedCardId, setInspectedCardId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setLoad({ status: "loading" });
    setEditingGuide(false);
    communityApi
      .deck(deckId)
      .then((deck) => {
        if (current) setLoad({ status: "ready", deck });
      })
      .catch(() => {
        if (current) setLoad({ status: "missing" });
      });
    return () => {
      current = false;
    };
  }, [deckId]);

  const back = (
    <button type="button" className="community-back" onClick={onBack}>
      <Icons.ArrowLeft size={16} />
      {t("community.back")}
    </button>
  );

  if (load.status !== "ready")
    return (
      <div className="community-deck-page">
        {back}
        <p className="community-empty" role="status">
          {load.status === "loading" ? t("common.loading") : t("community.notFound")}
        </p>
      </div>
    );

  const { deck } = load;
  const ownDeck = deck.author.id === accountId;
  const hidden = deck.status === "hidden";
  const showRestored = () => {
    setLoad({ status: "ready", deck: { ...deck, status: "public", moderation: undefined } });
    onNotice(t("community.moderation.restored"));
  };
  const restore = () => {
    setModerating(true);
    setModerationFailed(false);
    communityApi
      .moderate(deck.id, { action: "restore" })
      .then(showRestored)
      .catch(() => setModerationFailed(true))
      .finally(() => setModerating(false));
  };
  const listing = communityDeckListing(deck);
  const sections = deckSections(listing, t);
  const updated = new Date(deck.updatedAt).toLocaleDateString(locale);

  return (
    <div className="community-deck-page">
      <div className="community-deck-page__column">
        {back}
        <Panel as="div" className="community-deck-hero">
          <span className="community-deck-hero__cover">
            <CoverThumb
              coverCardId={displayCoverCard(listing)}
              artId={displayCoverArt(listing)}
              sigilColor={listing.color}
              sigilSize={72}
            />
          </span>
          <div className="community-deck-hero__identity">
            <h2 className="aegis-page-title">{deck.name}</h2>
            <p className="community-deck-hero__meta">
              {t("community.byAuthor", { name: deck.author.displayName })} · {t("community.updated", { date: updated })}
            </p>
            <div className="community-deck-hero__tags">
              <span className="community-tile__colors" aria-hidden="true">
                {deck.colors.map((color) => (
                  <ColorDot key={color} color={color} size={12} />
                ))}
              </span>
              {hidden ? <Badge tone="danger">{t("community.moderation.hiddenBadge")}</Badge> : null}
              <Badge tone={deck.legal ? "success" : "danger"}>
                {deck.legal ? t("redesign.decks.list.legal") : t("community.notLegal")}
              </Badge>
              <span className="community-deck-hero__counts">
                {t("redesign.play.deckCounts", { main: deck.mainDeck.length, egg: deck.eggDeck.length })}
              </span>
              <span className="community-deck-hero__counts">{t("community.copies", { count: deck.copyCount })}</span>
            </div>
          </div>
          <div className="community-deck-hero__actions">
            <LikeButton
              key={`${deck.id}:${deck.likeCount}:${deck.likedByMe}`}
              deck={deck}
              signedIn={signedIn}
              ownDeck={ownDeck}
              size="lg"
            />
            <Button icon={Icons.Swords} disabled={!deck.legal} onClick={() => onPlay(deck)}>
              {t("community.playWith")}
            </Button>
            <Button variant="secondary" icon={Icons.Copy} onClick={() => onCopy(deck)}>
              {t("community.copyToMine")}
            </Button>
            <DeckImageButton
              deck={listing}
              subtitle={t("community.byAuthor", { name: deck.author.displayName })}
              variant="secondary"
              label={t("deck.exportPng")}
            />
            {isAdmin ? (
              <Button
                variant={hidden ? "secondary" : "danger"}
                icon={hidden ? Icons.Eye : Icons.Shield}
                disabled={moderating}
                onClick={hidden ? restore : () => setHiding(true)}
              >
                {t(hidden ? "community.moderation.restore" : "community.moderation.hide")}
              </Button>
            ) : null}
            {!signedIn || ownDeck || hidden ? null : reported ? (
              <span className="community-report-link" role="status">
                <Icons.Check size={14} />
                {t("community.report.done")}
              </span>
            ) : (
              <button type="button" className="community-report-link" onClick={() => setReporting(true)}>
                <Icons.Flag size={14} />
                {t("community.report.open")}
              </button>
            )}
          </div>
        </Panel>
        {moderationFailed ? <Alert tone="danger">{t("community.moderation.error")}</Alert> : null}
        {/* Keyed by status: hiding the deck closes its reports on the server, so the panel reloads. */}
        {isAdmin ? <DeckReportsPanel key={deck.status} deckId={deck.id} /> : null}
        {isAdmin && hidden && deck.moderation ? (
          <DeckReviewPanel
            deckId={deck.id}
            moderation={deck.moderation}
            onApproved={showRestored}
            onDeclined={(moderation) => {
              setLoad({ status: "ready", deck: { ...deck, moderation } });
              onNotice(t("community.moderation.declined"));
            }}
          />
        ) : null}
        {hiding ? (
          <HideDeckDialog
            deckId={deck.id}
            deckName={deck.name}
            onClose={() => setHiding(false)}
            onHidden={(moderation) => {
              setHiding(false);
              setLoad({ status: "ready", deck: { ...deck, status: "hidden", moderation } });
              onNotice(t("community.moderation.hidden"));
            }}
          />
        ) : null}
        {reporting ? (
          <ReportDeckDialog
            deckId={deck.id}
            deckName={deck.name}
            onClose={() => setReporting(false)}
            onReported={() => {
              setReporting(false);
              setReported(true);
              onNotice(t("community.report.sent"));
            }}
          />
        ) : null}

        {deck.guide || (ownDeck && !hidden) ? (
          <section className="community-guide" aria-labelledby="community-guide-title">
            <SectionHeading
              id="community-guide-title"
              title={t("community.guide.title")}
              action={
                ownDeck && !hidden && !editingGuide ? (
                  <Button size="sm" variant="secondary" icon={Icons.Pencil} onClick={() => setEditingGuide(true)}>
                    {t(deck.guide ? "community.guide.edit" : "community.guide.add")}
                  </Button>
                ) : undefined
              }
            />
            {editingGuide && ownDeck && !hidden ? (
              <DeckGuideEditor
                key={deck.id}
                deckId={deck.id}
                initialGuide={deck.guide}
                onCancel={() => setEditingGuide(false)}
                onSaved={(guide) => {
                  setLoad({ status: "ready", deck: { ...deck, guide, hasGuide: guide !== null } });
                  setEditingGuide(false);
                  onNotice(t("community.guide.saved"));
                }}
              />
            ) : deck.guide ? (
              <DeckGuide guide={deck.guide} />
            ) : (
              <p className="community-guide__empty">{t("community.guide.emptyOwner")}</p>
            )}
          </section>
        ) : null}

        <section className="community-decklist" aria-labelledby="community-decklist-title">
          <SectionHeading id="community-decklist-title" title={t("community.decklist")} />
          <div className="community-decklist__sections">
            {sections.map((section) => (
              <section key={section.id} className="community-decklist__section" aria-label={section.label}>
                <h3 className="community-decklist__section-title">{section.label}</h3>
                <ul className="community-decklist__cards">
                  {section.entries.map(({ cardId, count }) => (
                    <li key={cardId} className="community-decklist__card">
                      <button
                        type="button"
                        className="community-decklist__open"
                        aria-label={t("feed.openCard", { card: getCardName(cardId) })}
                        onClick={() => setInspectedCardId((current) => (current === cardId ? null : cardId))}
                      >
                        <CardFull cardId={cardId} width={88} selected={inspectedCardId === cardId} zoomOnHover />
                      </button>
                      <span className="community-decklist__count">×{count}</span>
                      <span className="community-decklist__name">{getCardName(cardId)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      </div>
      {inspectedCardId ? <CardDetailDrawer cardId={inspectedCardId} onClose={() => setInspectedCardId(null)} /> : null}
    </div>
  );
}
