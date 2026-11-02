import { expect, it } from "vitest";
import type { BeliefDeck } from "#api/bot/evolution/BeliefDeck";
import { beliefDeckCatalog } from "#api/bot/evolution/beliefDeckCatalog";
import { sampleBeliefDeck } from "#api/bot/evolution/sampleBeliefDeck";

const cards = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_unused, index) => `${prefix}-${index}`);

it("weights archetype beliefs with public cards and removes known copies from hidden samples", () => {
  const catalog: BeliefDeck[] = [
    { id: "unknown", archetype: "Unknown", weight: 100, mainDeck: cards("unknown", 50), eggDeck: cards("egg-a", 5) },
    {
      id: "observed",
      archetype: "Observed",
      weight: 1,
      mainDeck: ["public-core", "public-core", ...cards("observed", 48)],
      eggDeck: ["public-egg", ...cards("egg-b", 4)],
    },
  ];
  const sample = sampleBeliefDeck({
    catalog,
    observedMainCards: ["public-core"],
    observedEggCards: ["public-egg"],
    mainCardCount: 49,
    eggCardCount: 4,
    seed: 91,
  });
  expect(sample.id).toBe("observed");
  expect(sample.mainDeck).toHaveLength(49);
  expect(sample.mainDeck).toContain("public-core");
  expect(sample.mainDeck.filter((card) => card === "public-core")).toHaveLength(1);
  expect(sample.eggDeck).toHaveLength(4);
  expect(sample.eggDeck).not.toContain("public-egg");
});

it("is deterministic for the same public evidence and seed", () => {
  const catalog: BeliefDeck[] = [
    { id: "one", archetype: "One", weight: 1, mainDeck: cards("one", 50), eggDeck: cards("egg-one", 5) },
    { id: "two", archetype: "Two", weight: 1, mainDeck: cards("two", 50), eggDeck: cards("egg-two", 5) },
  ];
  const input = {
    catalog,
    observedMainCards: ["visible-card"],
    observedEggCards: [],
    mainCardCount: 12,
    eggCardCount: 3,
    seed: 404,
  };
  expect(sampleBeliefDeck(input)).toEqual(sampleBeliefDeck(input));
});

it("uses historical reveals as archetype evidence without treating them as cards still outside the deck", () => {
  const catalog: BeliefDeck[] = [
    { id: "other", archetype: "Other", weight: 1, mainDeck: cards("other", 50), eggDeck: cards("egg-other", 5) },
    {
      id: "seen",
      archetype: "Seen",
      weight: 0.01,
      mainDeck: ["returned-card", ...cards("seen", 49)],
      eggDeck: cards("egg-seen", 5),
    },
  ];
  const sample = sampleBeliefDeck({
    catalog,
    observedMainCards: [],
    observedEggCards: [],
    seenMainCards: ["returned-card"],
    mainCardCount: 49,
    eggCardCount: 5,
    seed: 61,
  });
  expect(sample.id).toBe("seen");
  expect(sample.mainDeck).toContain("returned-card");
});

it("builds candidates from complete famous and DigiLab decklists", () => {
  const catalog = beliefDeckCatalog();
  expect(catalog.length).toBeGreaterThan(20);
  expect(catalog.every((deck) => deck.mainDeck.length === 50 && deck.eggDeck.length > 0)).toBe(true);
});
