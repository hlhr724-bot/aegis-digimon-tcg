import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

it("gives Junior a complete Digi-Egg deck and a legal hatch in the current World 3 opening", async () => {
  const fixture = getStoryScenario("w3-01")!;
  const deck = getStorySeatDeck({ fixture, seat: 0 });
  expect(deck.mainDeck).toHaveLength(50);
  expect(deck.eggDeck).toEqual(Array.from({ length: 4 }, () => "ST21-01"));
  const s = setupScenario(fixture);
  await s.ready();
  const loop = s.engine.runOneTurn();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding !== undefined);
    expect(s.state.players[0]!.breeding?.topCard.cardId).toBe("ST21-01");
    expect(s.state.players[0]!.eggDeck).toHaveLength(3);
    expect(s.state.turnSeat).toBe(0);
    expect(s.state.memory).toBe(0);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
