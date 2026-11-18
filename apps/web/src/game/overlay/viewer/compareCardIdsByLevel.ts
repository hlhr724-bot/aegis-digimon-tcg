import { getCardDefinition } from "@aegis/shared";
import { compareCardIdsByName } from "@/game/overlay/viewer/compareCardIdsByName";

function levelOf(cardId: string): number {
  return getCardDefinition(cardId)?.level ?? Number.POSITIVE_INFINITY;
}

export function compareCardIdsByLevel(first: string, second: string): number {
  const firstLevel = levelOf(first);
  const secondLevel = levelOf(second);
  return (firstLevel === secondLevel ? 0 : firstLevel - secondLevel) || compareCardIdsByName(first, second);
}
