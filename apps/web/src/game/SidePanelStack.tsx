/* The reference client's timed side panel: a titled navy card listing what just
   moved, with a border that erodes clockwise over the time it has left.

   One panel, not a column: the presentation queue decides which moment a slot is
   showing (narration.ts), and this file draws it. The name is kept because the
   frame is the same thing it always was. The panel contents come from
   ./sidePanels. */

import type { CSSProperties } from "react";
import { CardMini } from "../design/cards";
import { useTranslation } from "../i18n";
import { CardLink, CardLinkedText, cardDisplayName, useCardOpener } from "./cardLinks";
import { ErodeRing } from "./ErodeRing";
import { type AttackAnnouncement, type SidePanel, type SidePanelCard } from "./sidePanels";
import { useNoticeSize } from "@/game/noticeSize/useNoticeSize";

/* The panel is read at a glance, so the art carries it: big enough to recognise a card
   without hovering, which is the whole job now that the names are out of the picture. */
const PANEL_CARD_WIDTH = 128;

/**
 * One card in a panel: its art, its number, and its name.
 *
 * The panel used to be art alone, which left a player unable to read what had
 * just been deleted — the art is small, and a phone has no hover to enlarge it.
 * The name is the link, so pointer and keyboard reach the card the same way; the
 * art is a second pointer target for the same card.
 */
function SidePanelCardView({ card, numbered }: { card: SidePanelCard; numbered: boolean }) {
  const openCard = useCardOpener();
  const { scale } = useNoticeSize();
  return (
    <li className="side-panel__card">
      <span className="side-panel__art" aria-hidden="true">
        <CardMini
          cardId={card.cardId}
          artId={card.artId}
          width={Math.round(PANEL_CARD_WIDTH * scale)}
          zoomOnHover={false}
          onClick={openCard ? () => openCard(card.cardId, card.artId) : undefined}
        />
        {/* Numbered only when the event put its cards in an order worth reading. */}
        {numbered ? <span className="side-panel__badge">{card.badge}</span> : null}
      </span>
      <CardLink cardId={card.cardId} artId={card.artId} className="side-panel__name" />
    </li>
  );
}

export function SidePanelStack({
  panel,
  remainingMs,
  held = false,
  onDismiss,
}: {
  panel: SidePanel;
  /** What is left of the item's reading time, which is what the border erodes over. */
  remainingMs: number;
  /** The clock is stopped (a decision is waiting), so the eroding border pauses with it. */
  held?: boolean;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  const title = t(panel.titleKey);
  return (
    // Deliberately not a live region: the opponent action feed already narrates
    // these moments, and a second status would announce every card twice.
    <div className="side-panel-stack" data-held={held || undefined} data-testid="side-panel-stack">
      <section
        className="side-panel"
        data-side={panel.side}
        data-kind={panel.titleKey === "notice.deletion" ? "deletion" : undefined}
        data-testid="side-panel"
      >
        {/* The clock a player can see: the border erodes clockwise over exactly the
            time this panel has left, which nothing else on the board can shorten. */}
        <ErodeRing className="side-panel__erode" remainingMs={remainingMs} />
        <header className="side-panel__header">
          <h3 className="side-panel__title">{title}</h3>
          <span className="side-panel__owner">{t(panel.side === "you" ? "panel.yours" : "panel.opponents")}</span>
          <button
            className="side-panel__close"
            type="button"
            aria-label={t("panel.dismiss", { title })}
            onClick={() => onDismiss(panel.id)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        {/* The fan's overlap is computed from the count; see .side-panel__cards. */}
        <ol className="side-panel__cards" style={{ "--panel-card-count": panel.cards.length } as CSSProperties}>
          {panel.cards.map((card) => (
            <SidePanelCardView
              key={`${panel.id}:${card.badge}`}
              card={card}
              numbered={panel.ordered || panel.cards.length > 1}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

export function AttackAnnouncementBanner({ announcement }: { announcement: AttackAnnouncement }) {
  const { t } = useTranslation();
  const openCard = useCardOpener();
  const { cardId, artId } = announcement;
  return (
    <div
      className="attack-announcement"
      data-side={announcement.side}
      data-testid="attack-announcement"
      key={announcement.id}
    >
      <span aria-hidden="true">
        <CardMini
          cardId={cardId}
          artId={artId}
          width={44}
          zoomOnHover={false}
          onClick={openCard ? () => openCard(cardId, announcement.artId) : undefined}
        />
      </span>
      <strong className="attack-announcement__copy">
        <CardLinkedText text={t("panel.attacking", { card: cardDisplayName(cardId, t) })} cardIds={[cardId]} />
      </strong>
    </div>
  );
}
