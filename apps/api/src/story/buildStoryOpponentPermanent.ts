import type { PermanentSpec } from "#api/engine/scenario/types";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { CardDefinition } from "@aegis/shared/cards/types";
import { CardKind } from "@aegis/shared/schema/enums";

type Params = { cards: readonly string[]; level: number; opponent: string };

type Result = { permanent: PermanentSpec; remaining: string[] };

type ChainParams = { top: CardDefinition; pool: readonly string[] };

const rookieLevel = 3;

function getDigimon(cardId: string): CardDefinition | undefined {
  const definition = getCardDefinition(cardId);
  return definition?.kinds.includes(CardKind.Digimon) ? definition : undefined;
}

function canDigivolveOnto(top: CardDefinition, base: CardDefinition): boolean {
  return top.evoCosts.some((cost) => cost.level === base.level && base.colors.includes(cost.color));
}

function removeCards(pool: readonly string[], cards: readonly string[]): string[] {
  const remaining = [...pool];
  for (const card of cards) {
    remaining.splice(remaining.indexOf(card), 1);
  }
  return remaining;
}

function findStack({ top, pool }: ChainParams): string[] {
  let longest: string[] = [];
  if (top.level === rookieLevel) {
    return longest;
  }
  const bases = [...new Set(pool)]
    .map(getDigimon)
    .filter((base): base is CardDefinition => base?.level === (top.level ?? 0) - 1 && canDigivolveOnto(top, base));
  for (const base of bases) {
    const stack = [...findStack({ top: base, pool: removeCards(pool, [base.cardId]) }), base.cardId];
    if (stack.length > longest.length) {
      longest = stack;
    }
  }
  return longest;
}

function sortCandidates(candidates: CardDefinition[], opponent: string): CardDefinition[] {
  const named = opponent.toLowerCase();
  return candidates.sort(
    (left, right) =>
      Number(named.includes(right.nameEn.toLowerCase())) - Number(named.includes(left.nameEn.toLowerCase())) ||
      right.dp - left.dp ||
      left.cardId.localeCompare(right.cardId),
  );
}

export function buildStoryOpponentPermanent({ cards, level, opponent }: Params): Result | undefined {
  for (let target = level; target >= rookieLevel; target--) {
    const candidates = [...new Set(cards)]
      .map(getDigimon)
      .filter((card): card is CardDefinition => card?.level === target);
    const top = sortCandidates(candidates, opponent)[0];
    if (top) {
      const pool = removeCards(cards, [top.cardId]);
      const under = findStack({ top, pool });
      return { permanent: { card: top.cardId, under }, remaining: removeCards(pool, under) };
    }
  }
  return undefined;
}
