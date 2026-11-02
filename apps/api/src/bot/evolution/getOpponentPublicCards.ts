import {
  CardKind,
  getCardDefinition,
  isTokenDefinition,
  type CardInstance,
  type GameState,
  type Seat,
} from "@aegis/shared";

type PublicCards = { main: string[]; eggs: string[] };

function includeCard({ card, seat, publicCards }: { card: CardInstance; seat: Seat; publicCards: PublicCards }) {
  if (card.ownerSeat !== seat) return;
  const definition = getCardDefinition(card.cardId);
  if (definition !== undefined && isTokenDefinition(definition)) return;
  if (definition?.kinds.includes(CardKind.DigiEgg) === true) {
    publicCards.eggs.push(card.cardId);
  } else {
    publicCards.main.push(card.cardId);
  }
}

export function getOpponentPublicCards({ state, opponentSeat }: { state: GameState; opponentSeat: Seat }): PublicCards {
  const publicCards: PublicCards = { main: [], eggs: [] };
  for (const player of state.players) {
    for (const card of player.trash) includeCard({ card, seat: opponentSeat, publicCards });
    for (const card of player.delayZone) includeCard({ card, seat: opponentSeat, publicCards });
    for (const card of player.hand) {
      if (card.faceUp) includeCard({ card, seat: opponentSeat, publicCards });
    }
    for (const card of player.security) {
      if (card.faceUp) includeCard({ card, seat: opponentSeat, publicCards });
    }
    for (const permanent of [...player.battleArea, ...(player.breeding === undefined ? [] : [player.breeding])]) {
      if (permanent.topCard !== undefined) includeCard({ card: permanent.topCard, seat: opponentSeat, publicCards });
      for (const card of permanent.stack) includeCard({ card, seat: opponentSeat, publicCards });
      for (const card of permanent.linked) includeCard({ card, seat: opponentSeat, publicCards });
    }
  }
  return publicCards;
}
