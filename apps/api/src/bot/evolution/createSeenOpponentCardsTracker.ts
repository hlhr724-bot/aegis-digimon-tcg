import { CardKind, getCardDefinition, isTokenDefinition, type Seat, type ServerEvent } from "@aegis/shared";
import type { SeenOpponentCards } from "#api/bot/evolution/SeenOpponentCards";

export function createSeenOpponentCardsTracker({ observer }: { observer: Seat }) {
  const opponentSeat = observer === 0 ? 1 : 0;
  const seen = new Map<string, Set<string>>([
    ["main", new Set<string>()],
    ["eggs", new Set<string>()],
  ]);
  const observedEvents = new Set<string>();

  function remember({ cardId, owner, eventKey }: { cardId: string; owner: Seat; eventKey: string }): void {
    if (owner !== opponentSeat || observedEvents.has(eventKey)) return;
    observedEvents.add(eventKey);
    const definition = getCardDefinition(cardId);
    if (definition !== undefined && isTokenDefinition(definition)) return;
    const category = definition?.kinds.includes(CardKind.DigiEgg) === true ? "eggs" : "main";
    seen.get(category)!.add(cardId);
  }

  function observeEvent(event: ServerEvent): void {
    switch (event.kind) {
      case "cardPlayed":
        remember({ cardId: event.cardId, owner: event.seat, eventKey: `play:${event.instanceId ?? event.cardId}` });
        for (const cardId of event.sourceCardIds ?? []) {
          remember({ cardId, owner: event.seat, eventKey: `material:${event.instanceId ?? event.cardId}:${cardId}` });
        }
        break;
      case "digivolved":
      case "hatched":
      case "movedFromBreeding":
        remember({ cardId: event.cardId, owner: event.seat, eventKey: `${event.kind}:${event.permanentId}` });
        break;
      case "cardRevealed":
        remember({
          cardId: event.cardId,
          owner: event.seat,
          eventKey: `reveal:${event.sourceCardId ?? "unknown"}:${event.cardId}`,
        });
        break;
      case "securityRevealed":
        remember({ cardId: event.revealedCardId, owner: event.seat, eventKey: `security:${event.revealedCardId}` });
        break;
      case "attackDeclared":
        remember({ cardId: event.attackerCardId, owner: event.seat, eventKey: `attack:${event.attackerPermanentId}` });
        break;
      default:
        break;
    }
  }

  function snapshot(): SeenOpponentCards {
    return { main: [...seen.get("main")!], eggs: [...seen.get("eggs")!] };
  }

  return { observeEvent, snapshot };
}
