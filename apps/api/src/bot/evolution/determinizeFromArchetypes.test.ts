import { expect, it } from "vitest";
import { Zone } from "@aegis/shared/schema/enums";
import { makeInstance } from "#api/engine/scenario/board";
import { fillZone } from "#api/engine/state/access";
import { setupEngine } from "#api/engine/testkit/harness";
import { beliefDeckCatalog } from "#api/bot/evolution/beliefDeckCatalog";
import { determinizeFromArchetypes } from "#api/bot/evolution/determinizeFromArchetypes";

it("samples opponent hidden identities from the same public evidence regardless of their true hidden cards", async () => {
  const visibleCard = beliefDeckCatalog()[0]!.mainDeck[0]!;
  const first = setupEngine();
  const second = setupEngine();
  for (const [setup, hiddenCard] of [
    [first, "BT1-009"],
    [second, "BT1-019"],
  ] as const) {
    const opponent = setup.state.players[1]!;
    const deck = Array.from({ length: 12 }, (_unused, index) => {
      const card = makeInstance(hiddenCard, 1, false);
      card.instanceId = `belief-hidden-${index}`;
      return card;
    });
    fillZone(opponent, Zone.Deck, deck);
    fillZone(opponent, Zone.Trash, [makeInstance(visibleCard, 1, true)]);
    await determinizeFromArchetypes({ engine: setup.engine, observer: 0, seed: 317 });
  }
  expect(first.state.players[1]!.deck.map((card) => card.cardId)).toEqual(
    second.state.players[1]!.deck.map((card) => card.cardId),
  );
});
