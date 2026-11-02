import { getCardDefinition } from "@aegis/shared/cards/registry";
import "@/design/CardAceBadge.css";

type Params = { cardId?: string };

export function CardAceBadge({ cardId }: Params) {
  const card = cardId ? getCardDefinition(cardId) : undefined;
  if (!card?.isAce && !(card?.overflowMemory && card.overflowMemory > 0)) {
    return null;
  }
  return (
    <span className="card-ace-badge" aria-label="ACE" data-overflow={card.overflowMemory}>
      ACE
    </span>
  );
}
