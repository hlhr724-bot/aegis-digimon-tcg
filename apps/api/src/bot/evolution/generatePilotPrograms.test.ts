import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardKind } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import { evolutionDeck } from "#api/bot/evolution/decks";
import { evolutionPilotDecks } from "#api/bot/evolution/evolutionPilotDecks";
import { generatePilotPrograms } from "#api/bot/evolution/generatePilotPrograms";
import { FEATURES, parseHeuristic, scoreHeuristicRules, type Feature } from "#api/bot/evolution/heuristic";
import catalog from "#api/bot/evolution/programs/certified-balanced.json" with { type: "json" };

describe("conditional preset pilots", () => {
  it("keeps the certified generic unchanged and scopes Ulforce's Tamer development to its real cards", () => {
    const deck = evolutionDeck("ex4-dgo-2022-06-25-1-ulforceveedramon");
    const generic = parseHeuristic(catalog.generic);
    const original = JSON.stringify(generic);
    const proposals = generatePilotPrograms({ deck: deck.deck, name: deck.name, generic });
    const tamer = proposals.find((entry) => entry.strategy === "early-tamer-development")!;
    const rule = tamer.program.rules.at(-1)!;
    expect(JSON.stringify(generic)).toBe(original);
    expect(tamer.program.rules.slice(0, -1)).toEqual(generic.rules);
    expect(rule.weight).toBeGreaterThan(0);
    expect(rule.when?.sourceCardIds?.length).toBeGreaterThan(0);
    for (const id of rule.when!.sourceCardIds!) {
      expect(deck.deck.mainDeck).toContain(id);
      expect(getCardDefinition(id)!.kinds).toContain(CardKind.Tamer);
    }
    const features = Object.fromEntries(FEATURES.map((feature) => [feature, 0])) as Record<Feature, number>;
    Object.assign(features, { playTamer: 1, ownHandCount: 4, turn: 3, handover: 1 });
    expect(scoreHeuristicRules(tamer.program, features, "main", rule.when!.sourceCardIds![0]).score).toBe(2);
    expect(
      scoreHeuristicRules(tamer.program, { ...features, turn: 5 }, "main", rule.when!.sourceCardIds![0]).score,
    ).toBe(0);
    expect(scoreHeuristicRules(tamer.program, features, "main", "BT1-010").score).toBe(0);
  });

  it("generates bounded, distinct card-scoped hypotheses for every eligible preset and reports exclusions", () => {
    const decks = evolutionPilotDecks();
    const generic = parseHeuristic(catalog.generic);
    expect(decks.available.length).toBeGreaterThan(24);
    expect(decks.excluded.length).toBeGreaterThan(0);
    expect(new Set(decks.available.map((deck) => deck.id)).size).toBe(decks.available.length);
    for (const deck of decks.available) {
      const proposals = generatePilotPrograms({ deck: deck.deck, name: deck.name, generic });
      expect(proposals.length).toBeGreaterThan(0);
      for (const { program } of proposals) {
        expect(parseHeuristic(program)).toEqual(program);
        expect(program.rules.slice(0, -1)).toEqual(generic.rules);
        const rule = program.rules.at(-1)!;
        expect(rule.weight).not.toBe(0);
        expect(rule.when!.sourceCardIds!.every((id) => deck.deck.mainDeck.includes(id))).toBe(true);
      }
    }
    expect(decks.excluded.every((deck) => deck.reason.length > 0)).toBe(true);
  });
});
