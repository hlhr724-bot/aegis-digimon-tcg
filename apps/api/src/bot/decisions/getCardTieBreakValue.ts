import type { CardDefinition } from "@aegis/shared/cards/types";

const RARITY_RANKS: Readonly<Record<string, number>> = { C: 0, U: 1, R: 2, P: 2, SR: 3, SEC: 4, UR: 4 };

type Params = { definition: CardDefinition | undefined };

function getTextLength(definition: CardDefinition): number {
  return (
    (definition.effectText?.length ?? 0) +
    (definition.inheritedEffectText?.length ?? 0) +
    (definition.securityEffectText?.length ?? 0)
  );
}

export function getCardTieBreakValue({ definition }: Params): number {
  if (definition === undefined) {
    return 0;
  }
  const evolutionCosts = definition.evoCosts.map((cost) => cost.memoryCost);
  const cheapestEvolution = evolutionCosts.length === 0 ? 0 : Math.min(...evolutionCosts);
  return (
    (definition.inheritedEffectText ? 0.4 : 0) +
    (definition.effectText ? 0.2 : 0) +
    (definition.securityEffectText ? 0.1 : 0) +
    (RARITY_RANKS[definition.rarity ?? ""] ?? 0) * 0.05 +
    definition.colors.length * 0.01 -
    cheapestEvolution * 0.001 +
    getTextLength(definition) * 0.000_01
  );
}
