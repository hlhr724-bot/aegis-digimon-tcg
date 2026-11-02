import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
/* The row of cards an opponent's effect revealed, held centre-screen the way a played card
   is (ZoneShowcase). A deck card turned face-up never reaches the viewer's state, so this is
   the one place the viewer sees those cards before they move on.

   Decoration with a caption: it takes no pointer input, and the queue owns how long it
   stays. */

import { CardFull } from "../design/cards";
import { useTranslation } from "../i18n";
import type { RevealShowcase as RevealShowcaseModel } from "./match/present/revealShowcases";

const REVEAL_CARD_WIDTH = 150;

export function RevealShowcase({ showcase }: { showcase: RevealShowcaseModel }) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const caption =
    showcase.sourceCardId === undefined
      ? t("showcase.opponentRevealed")
      : t("showcase.opponentRevealedWith", { source: getCardName(showcase.sourceCardId) });
  return (
    <div className="battle-showcase battle-showcase--reveal" data-testid="reveal-showcase" role="status">
      <figure className="battle-showcase__frame">
        <ol className="battle-showcase__row">
          {showcase.cards.map((card, index) => (
            <li key={`${index}-${card.cardId}`} className="battle-showcase__art" aria-label={getCardName(card.cardId)}>
              <CardFull cardId={card.cardId} artId={card.artId} width={REVEAL_CARD_WIDTH} zoomOnHover={false} />
            </li>
          ))}
        </ol>
        <figcaption className="battle-showcase__caption">{caption}</figcaption>
      </figure>
    </div>
  );
}
