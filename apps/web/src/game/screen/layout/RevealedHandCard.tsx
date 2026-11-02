import type { FinalRevealCard } from "@aegis/shared";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { CardArt } from "@/game/overlay/CardArt";
import { useCardOpener } from "@/game/cardLinks";

export function RevealedHandCard({ card, width }: { card: FinalRevealCard; width: number }) {
  const getCardName = useTranslatedCardName();
  const openCard = useCardOpener();
  return (
    <button
      type="button"
      className="game-hand-reveal"
      aria-label={getCardName(card.cardId)}
      onClick={() => openCard?.(card.cardId, card.artId)}
    >
      <CardArt cardId={card.cardId} artId={card.artId} width={width} />
    </button>
  );
}
