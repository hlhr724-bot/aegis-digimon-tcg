import { resolveCardArt, type CardInstance, type Seat } from "@aegis/shared";
import type { GameEngine } from "#api/engine/GameEngine";
import { beliefDeckCatalog } from "#api/bot/evolution/beliefDeckCatalog";
import { determinize } from "#api/bot/evolution/determinize";
import { isHiddenSamplingWindow } from "#api/bot/evolution/isHiddenSamplingWindow";
import { getOpponentPublicCards } from "#api/bot/evolution/getOpponentPublicCards";
import { sampleBeliefDeck } from "#api/bot/evolution/sampleBeliefDeck";
import type { SeenOpponentCards } from "#api/bot/evolution/SeenOpponentCards";

type Params = { engine: GameEngine; observer: Seat; seed: number; seenCards?: SeenOpponentCards };

function setCardIdentity({ cards, cardIds, seat }: { cards: CardInstance[]; cardIds: string[]; seat: Seat }): void {
  const ordered = [...cards].sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  for (let index = 0; index < ordered.length; index++) {
    const card = ordered[index]!;
    const cardId = cardIds[index]!;
    card.cardId = cardId;
    card.artId = resolveCardArt(cardId).artId;
    card.ownerSeat = seat;
    card.faceUp = false;
  }
}

export async function determinizeFromArchetypes({ engine, observer, seed, seenCards }: Params): Promise<void> {
  if (!isHiddenSamplingWindow({ engine, observer }))
    throw new Error("Archetype sampling requires a settled main-phase or own block or Counter window");
  const opponentSeat = observer === 0 ? 1 : 0;
  const opponent = engine.state.players[opponentSeat]!;
  const hiddenMain = [
    ...opponent.deck,
    ...Array.from(opponent.hand).filter((card) => !card.faceUp),
    ...Array.from(opponent.security).filter((card) => !card.faceUp),
  ];
  const publicCards = getOpponentPublicCards({ state: engine.state, opponentSeat });
  const sample = sampleBeliefDeck({
    catalog: beliefDeckCatalog(),
    observedMainCards: publicCards.main,
    observedEggCards: publicCards.eggs,
    seenMainCards: seenCards?.main,
    seenEggCards: seenCards?.eggs,
    mainCardCount: hiddenMain.length,
    eggCardCount: opponent.eggDeck.length,
    seed,
  });
  setCardIdentity({ cards: hiddenMain, cardIds: sample.mainDeck, seat: opponentSeat });
  setCardIdentity({ cards: Array.from(opponent.eggDeck), cardIds: sample.eggDeck, seat: opponentSeat });
  await determinize(engine, observer, seed);
}
