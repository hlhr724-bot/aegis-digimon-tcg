import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardKind } from "@aegis/shared/schema/enums";
import type { Decklist } from "#api/engine/setup";
import { parseHeuristic, type HeuristicProgram, type HeuristicRule } from "#api/bot/evolution/heuristic";

function cardNames(cards: { nameEn: string }[]): string {
  const names = [...new Set(cards.map((card) => card.nameEn))];
  return `${names.slice(0, 6).join(", ")}${names.length > 6 ? ", and other matching deck cards" : ""}`;
}

export function generatePilotPrograms(input: { deck: Decklist; name: string; generic: HeuristicProgram }) {
  if (input.generic.basePolicy !== "projected-balanced") throw new Error("Pilots require a balanced residual base");
  const cards = [...new Set(input.deck.mainDeck)].map((id) => {
    const definition = getCardDefinition(id);
    if (!definition) throw new Error(`Unknown pilot card ${id}`);
    return definition;
  });
  const bosses = cards.filter((card) => card.kinds.includes(CardKind.Digimon) && (card.level ?? 0) >= 6);
  const tamers = cards.filter((card) => card.kinds.includes(CardKind.Tamer));
  const rookies = cards.filter((card) => card.kinds.includes(CardKind.Digimon) && card.level === 3);
  const proposals: { strategy: string; rule: HeuristicRule }[] = [];
  if (bosses.length) {
    proposals.push({
      strategy: "boss-development",
      rule: {
        feature: "digivolve",
        weight: 1,
        advice: `Favor developing ${cardNames(bosses)} when the hand has at least three cards and handover stays within two memory.`,
        when: {
          kind: "main",
          sourceCardIds: bosses.map((card) => card.cardId),
          minimum: { ownHandCount: 3 },
          maximum: { handover: 2 },
        },
      },
    });
    proposals.push({
      strategy: "boss-security-pressure",
      rule: {
        feature: "attackPlayer",
        weight: 1,
        advice: `Give ${cardNames(bosses)} additional preference for player attacks when the opponent has at most two security.`,
        when: {
          kind: "main",
          sourceCardIds: bosses.map((card) => card.cardId),
          maximum: { opponentSecurity: 2 },
        },
      },
    });
  }
  if (tamers.length)
    proposals.push({
      strategy: "early-tamer-development",
      rule: {
        feature: "playTamer",
        weight: 2,
        advice: `Favor establishing ${cardNames(tamers)} in the first four turns when the hand has at least four cards and handover stays within two memory.`,
        when: {
          kind: "main",
          sourceCardIds: tamers.map((card) => card.cardId),
          minimum: { ownHandCount: 4 },
          maximum: { turn: 4, handover: 2 },
        },
      },
    });
  if (rookies.length)
    proposals.push({
      strategy: "rookie-development",
      rule: {
        feature: "playBody",
        weight: 0.25,
        advice: `Favor developing ${cardNames(rookies)} when the hand has at most five cards and handover stays within one memory.`,
        when: {
          kind: "main",
          sourceCardIds: rookies.map((card) => card.cardId),
          maximum: { ownHandCount: 5, handover: 1 },
        },
      },
    });
  return proposals.map(({ strategy, rule }) => ({
    strategy,
    program: parseHeuristic({
      ...input.generic,
      title: `${input.name}: ${strategy}`.slice(0, 120),
      rules: [...input.generic.rules, rule],
    }),
  }));
}
