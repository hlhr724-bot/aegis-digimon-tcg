import type { CSSProperties } from "react";
import type { CommunityDeckSummary } from "@aegis/shared/decks/community";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { Badge, Button, ColorDot, IconButton } from "@/design/primitives";
import { COLORS, colorKey } from "@/design/theme";
import { useTranslation } from "@/i18n/useTranslation";
import { LikeButton } from "@/screens/community/LikeButton";

type CommunityDeckTileParams = {
  deck: CommunityDeckSummary;
  signedIn: boolean;
  accountId: string | undefined;
  onOpen: () => void;
  onCopy: () => void;
  onPlay: () => void;
};

export function CommunityDeckTile({ deck, signedIn, accountId, onOpen, onCopy, onPlay }: CommunityDeckTileParams) {
  const { t, locale } = useTranslation();
  const color = COLORS[colorKey(deck.colors[0])];
  return (
    <article className="community-deck-tile" style={{ "--deck-color-soft": color.soft } as CSSProperties}>
      <button type="button" className="community-deck-tile__cover" tabIndex={-1} aria-hidden="true" onClick={onOpen}>
        <CoverThumb coverCardId={deck.coverCardId ?? undefined} sigilColor={colorKey(deck.colors[0])} sigilSize={56} />
        <span className="community-deck-tile__badges">
          {deck.legal ? null : <Badge tone="danger">{t("community.notLegal")}</Badge>}
          {deck.hasGuide ? (
            <Badge tone="primary">
              <Icons.BookOpen size={12} />
              {t("community.guide.label")}
            </Badge>
          ) : null}
        </span>
      </button>
      <div className="community-deck-tile__body">
        <h3 className="community-deck-tile__name">
          <button type="button" onClick={onOpen}>
            {deck.name}
          </button>
        </h3>
        <span className="community-deck-tile__author">
          {t("community.byAuthor", { name: deck.author.displayName })}
        </span>
        <div className="community-deck-tile__stats">
          <span title={t("community.copies", { count: deck.copyCount })}>
            <Icons.Copy size={13} />
            <span className="aegis-sr-only">{t("community.copies", { count: deck.copyCount })}</span>
            <span aria-hidden="true">{deck.copyCount.toLocaleString(locale)}</span>
          </span>
          <LikeButton
            key={`${deck.id}:${deck.likeCount}:${deck.likedByMe}`}
            deck={deck}
            signedIn={signedIn}
            ownDeck={deck.author.id === accountId}
          />
          <span className="community-deck-tile__colors" aria-hidden="true">
            {deck.colors.map((entry) => (
              <ColorDot key={entry} color={entry} size={9} />
            ))}
          </span>
        </div>
      </div>
      <div className="community-deck-tile__foot">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          {t("community.viewList")}
        </Button>
        <IconButton
          size="sm"
          variant="secondary"
          label={t("community.copy")}
          title={t("community.copy")}
          onClick={onCopy}
        >
          <Icons.Copy size={16} />
        </IconButton>
        <IconButton size="sm" label={t("common.play")} title={t("common.play")} disabled={!deck.legal} onClick={onPlay}>
          <Icons.Swords size={16} />
        </IconButton>
      </div>
    </article>
  );
}
