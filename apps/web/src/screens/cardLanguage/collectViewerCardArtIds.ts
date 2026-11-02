import { resolveCardArt } from "@aegis/shared/cards/arts";
import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { Seat } from "@aegis/shared/schema/enums";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { PlayerState } from "@aegis/shared/schema/PlayerState";
import type { AegisJoinOptions } from "@/net/types";

type Params = {
  deck: AegisJoinOptions["deck"] | undefined;
  players: readonly PlayerState[];
  viewerSeat: Seat;
};

function listPermanentCards(permanent: Permanent): CardInstance[] {
  return [permanent.topCard, ...permanent.stack, ...permanent.linked];
}

function listPublicCards(player: PlayerState): CardInstance[] {
  return [
    ...(player.hand ?? []),
    ...player.trash,
    ...player.delayZone,
    ...[...player.battleArea].flatMap(listPermanentCards),
    ...(player.breeding ? listPermanentCards(player.breeding) : []),
  ];
}

export function collectViewerCardArtIds({ deck, players, viewerSeat }: Params): string[] {
  const deckArtIds = deck
    ? [
        ...deck.mainDeck.map((cardId, index) => resolveCardArt(cardId, deck.mainDeckArts?.[index]).artId),
        ...deck.eggDeck.map((cardId, index) => resolveCardArt(cardId, deck.eggDeckArts?.[index]).artId),
      ]
    : [];
  const ownedCards = players
    .flatMap(listPublicCards)
    .filter((card) => card?.cardId && card.ownerSeat === viewerSeat)
    .map((card) => resolveCardArt(card.cardId, card.artId).artId);
  const securityArtIds = players
    .filter((player) => player.seat === viewerSeat)
    .flatMap((player) => [...player.securityView])
    .filter((card) => card.cardId)
    .map((card) => resolveCardArt(card.cardId, card.artId).artId);
  return [...new Set([...deckArtIds, ...ownedCards, ...securityArtIds])].sort();
}
