import { catalogStoryBattles } from "@aegis/shared/story/catalogStoryBattles";
import type { ScenarioFixture } from "#api/engine/scenario/types";
import { makeRng, seatSeed, shuffleInPlace } from "#api/engine/setup";

type Params = { fixture: ScenarioFixture; seed: number };

export function shuffleStoryDecks({ fixture, seed }: Params): void {
  for (const seat of [0, 1] as const) {
    const board = fixture.board[seat];
    const rng = makeRng(seatSeed(seed, seat));
    if (board?.deck && catalogStoryBattles.some((battle) => battle.id === fixture.name)) {
      const hand = board.hand ?? [];
      const security = Array.isArray(board.security) ? board.security : [];
      const cards = [...hand, ...security, ...board.deck];
      shuffleInPlace(cards, rng);
      board.hand = cards.slice(0, hand.length);
      board.security = cards.slice(hand.length, hand.length + security.length);
      board.deck = cards.slice(hand.length + security.length);
    } else if (board?.deck) {
      shuffleInPlace(board.deck, rng);
    }
    if (board?.eggDeck) {
      shuffleInPlace(board.eggDeck, rng);
    }
  }
}
