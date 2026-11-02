import { expect, it } from "vitest";
import "#api/cards/index";
import { evolutionDeck } from "#api/bot/evolution/decks";
import { generateComboPilotPrograms } from "#api/bot/evolution/generateComboPilotPrograms";
import { parseHeuristic } from "#api/bot/evolution/heuristic";
import catalog from "#api/bot/evolution/programs/certified-balanced.json" with { type: "json" };

const versions = [
  "ex4-dgo-2022-06-25-1-ulforceveedramon@1",
  "ex6-dgo-2024-07-06-1-miragegaogamon@2",
  "bt25-dgo-2026-06-06-4-shinegreymon@1",
];

it("freezes exactly eighteen card-scoped combo proposals while retaining every generic byte", () => {
  const generic = parseHeuristic(catalog.generic);
  const serialized = JSON.stringify(generic);
  const proposals = versions.flatMap((version) => {
    const deck = evolutionDeck(version);
    return generateComboPilotPrograms({ version, deck: deck.deck, name: deck.name, generic });
  });
  expect(proposals).toHaveLength(18);
  expect(new Set(proposals.map((proposal) => proposal.strategy)).size).toBe(18);
  for (const { program } of proposals) {
    expect(parseHeuristic(program)).toEqual(program);
    expect(JSON.stringify(program.rules.slice(0, -1))).toBe(JSON.stringify(generic.rules));
    expect(program.rules).toHaveLength(19);
    const rule = program.rules.at(-1)!;
    expect([4, 8, 12]).toContain(rule.weight);
    expect(rule.when?.kind).toBe("main");
    expect(rule.when?.sourceCardIds?.length).toBeGreaterThan(0);
    expect(rule.when?.ownBoard ?? rule.when?.ownHand).toBeDefined();
  }
  expect(JSON.stringify(generic)).toBe(serialized);
});

it("rejects unpinned versions and recipe mismatch before proposing a program", () => {
  const generic = parseHeuristic(catalog.generic);
  const deck = evolutionDeck(versions[0]!);
  expect(() =>
    generateComboPilotPrograms({
      version: versions[0]!.replace("@1", "@2"),
      deck: deck.deck,
      name: deck.name,
      generic,
    }),
  ).toThrow("Unsupported");
  expect(() =>
    generateComboPilotPrograms({
      version: versions[0]!,
      deck: { ...deck.deck, mainDeck: [] },
      name: deck.name,
      generic,
    }),
  ).toThrow("outside");
});
