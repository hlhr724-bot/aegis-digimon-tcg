import { expect, it } from "vitest";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { CardKind } from "@aegis/shared/schema/enums";
import { canDigivolveOntoWithAlternates, definitionOf } from "#api/engine/cards/cardData";
import { validateDecklist } from "#api/engine/deckValidation";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import "#api/cards/index";
import { unresolvedStoryEvolutionRoutes } from "#api/story/unresolvedStoryEvolutionRoutes.testSupport";

it("records unresolved evolution routes across every campaign without adding new gaps", () => {
  const failures: string[] = [];
  for (const battle of storyBattles.filter((entry) => entry.playable)) {
    const fixture = getStoryScenario(battle.id)!;
    for (const seat of [0, 1] as const) {
      const deck = getStorySeatDeck({ fixture, seat });
      const validation = validateDecklist(deck, { betaBattleMode: false });
      expect({ battle: battle.id, seat, validation }).toEqual({ battle: battle.id, seat, validation: { ok: true } });
      const pool = [...new Set([...deck.mainDeck, ...deck.eggDeck])].map(definitionOf);
      for (const card of pool) {
        if (
          card.kinds.includes(CardKind.Digimon) &&
          (card.level ?? 0) > 3 &&
          !pool.some((base) => base.cardId !== card.cardId && canDigivolveOntoWithAlternates(card, base))
        ) {
          failures.push(`${battle.id} seat ${seat}: no evolution source for ${card.cardId}`);
        }
      }
      const board = fixture.board[seat]!;
      for (const permanent of [...(board.battleArea ?? []), ...(board.breeding ? [board.breeding] : [])]) {
        if (typeof permanent === "string") {
          continue;
        }
        const cards = [
          ...(permanent.under ?? []).map((card) => (typeof card === "string" ? card : card.card)),
          permanent.card,
        ];
        for (let index = 1; index < cards.length; index++) {
          if (!canDigivolveOntoWithAlternates(cards[index]!, cards[index - 1]!)) {
            failures.push(`${battle.id} seat ${seat}: disconnected stack ${cards.join(" / ")}`);
          }
        }
      }
    }
  }
  expect([...new Set(failures)].sort()).toEqual(unresolvedStoryEvolutionRoutes);
});
