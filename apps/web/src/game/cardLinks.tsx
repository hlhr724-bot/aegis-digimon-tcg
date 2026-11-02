import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import type { LogSegment } from "@/game/matchLogLinks";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { CardZoomPreview } from "@/design/CardZoomPreview";
import { useCardHoverPreview } from "@/game/useCardHoverPreview";
/* Card names as links, shared by every surface that names a card.

   The play log set the pattern: a named card is a button that opens the card,
   which is how a player checks what just hit them without leaving the board.
   Notices, side panels, combat prompts and decision dialogs all link the same
   way, through this one component and one `.card-link` style.

   A name is linked only where the surface already holds the card's id. Names
   that only exist inside server prose or printed card text stay plain text: a
   link to the wrong card is worse than no link at all. */

import { splitTextByHighlight } from "@/game/splitTextByHighlight";
import { createContext, useContext, type ReactNode } from "react";
import { getCardDefinition } from "@aegis/shared";
import { useTranslation, type Translate } from "../i18n";
import { logSegments, type NamedCard } from "./matchLogLinks";

const CardOpenerContext = createContext<((cardId: string, artId?: string) => void) | undefined>(undefined);

/**
 * Lets everything below open a card.
 *
 * A context rather than a prop because the surfaces that name cards are spread
 * across every overlay and prompt on the board, and threading one callback
 * through all of them would say nothing about any of them. Without a provider
 * every link falls back to the plain text it replaced.
 */
export function CardOpenerProvider({
  onOpenCard,
  children,
}: {
  onOpenCard: (cardId: string, artId?: string) => void;
  children: ReactNode;
}) {
  return <CardOpenerContext.Provider value={onOpenCard}>{children}</CardOpenerContext.Provider>;
}

export function useCardOpener(): ((cardId: string, artId?: string) => void) | undefined {
  return useContext(CardOpenerContext);
}

/** A card's printed name, or a neutral word — a raw card id is not something a player can read. */
export function cardDisplayName(cardId: string | undefined, t: Translate): string {
  return (cardId ? getCardDefinition(cardId)?.nameEn : undefined) ?? t("overlay.card");
}

/** The cards a line names, paired with the names it printed, in the line's own order. */
function namedCards(cardIds: readonly (string | undefined)[] | undefined): NamedCard[] {
  const named: NamedCard[] = [];
  for (const cardId of cardIds ?? []) {
    const name = cardId ? getCardDefinition(cardId)?.nameEn : undefined;
    if (cardId && name) {
      named.push({ name: `${name} (${cardId})`, cardId }, { name, cardId });
    }
  }
  return named;
}

type TranslatedReferenceParams = { segment: LogSegment; translations?: CardTranslationData };

function getTranslatedReference({ segment, translations }: TranslatedReferenceParams): string {
  if (!segment.cardId) {
    return segment.text;
  }
  const name = getCardDefinition(segment.cardId)?.nameEn ?? segment.text;
  return `${getTranslatedCardName({ name, translations })} (${segment.cardId})`;
}

function CardLinkButton({
  cardId,
  artId,
  text,
  className,
  highlight,
  onOpenCard,
}: {
  cardId: string;
  artId?: string;
  text: string;
  highlight?: string;
  className?: string;
  onOpenCard: (cardId: string, artId?: string) => void;
}) {
  const { t } = useTranslation();
  const preview = useCardHoverPreview();
  return (
    <>
      <button
        type="button"
        className={className ? `card-link ${className}` : "card-link"}
        aria-label={t("feed.openCard", { card: text })}
        {...preview.handlers}
        onClick={() => {
          preview.hide();
          onOpenCard(cardId, artId);
        }}
      >
        <HighlightedText text={text} highlight={highlight} />
      </button>
      {preview.point ? (
        <CardZoomPreview
          cardId={cardId}
          artId={artId}
          x={preview.point.x}
          y={preview.point.y}
          fallbackIndex={0}
          width={300}
        />
      ) : null}
    </>
  );
}

/**
 * One card's name on its own, as a link when the card can be opened.
 *
 * `label` overrides the printed name for a surface that already decided how to
 * word it; everything else reads the name off the id, so the link and the text
 * can never disagree.
 */
export function CardLink({
  cardId,
  artId,
  label,
  className,
}: {
  cardId?: string;
  artId?: string;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const translations = useCardTranslations();
  const openCard = useCardOpener();
  const name = label ?? getTranslatedCardName({ name: cardDisplayName(cardId, t), translations });
  const text = cardId && getCardDefinition(cardId) ? `${name} (${cardId})` : name;
  if (!openCard || !cardId || !getCardDefinition(cardId)) return <span className={className}>{text}</span>;
  return <CardLinkButton cardId={cardId} artId={artId} text={text} className={className} onOpenCard={openCard} />;
}

/**
 * A finished sentence with the cards it names turned into links.
 *
 * For text this client built by interpolating names it read off `cardIds`, so
 * every match is the card the caller meant. `onOpenCard` overrides the context
 * for a caller that owns its own opener; with neither, the same text renders as
 * the plain run it was before.
 */
export function CardLinkedText({
  text,
  cardIds,
  onOpenCard,
  highlight,
}: {
  text: string;
  highlight?: string;
  cardIds?: readonly (string | undefined)[];
  onOpenCard?: (cardId: string, artId?: string) => void;
}) {
  const translations = useCardTranslations();
  const contextOpener = useCardOpener();
  const openCard = onOpenCard ?? contextOpener;
  const segments = logSegments(text, namedCards(cardIds));
  if (!openCard) {
    const translated = segments.map((segment) => getTranslatedReference({ segment, translations })).join("");
    return <HighlightedText text={translated} highlight={highlight} />;
  }
  return (
    <>
      {segments.map((segment, index) =>
        segment.cardId && openCard ? (
          <CardLinkButton
            key={index}
            cardId={segment.cardId}
            text={getTranslatedReference({ segment, translations })}
            highlight={highlight}
            onOpenCard={openCard}
          />
        ) : (
          <HighlightedText key={index} text={getTranslatedReference({ segment, translations })} highlight={highlight} />
        ),
      )}
    </>
  );
}

function HighlightedText({ text, highlight }: { text: string; highlight?: string }) {
  return (
    <>
      {splitTextByHighlight({ text, highlight }).map((segment, index) =>
        segment.highlighted ? (
          <mark className="play-log__mark" key={index}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
