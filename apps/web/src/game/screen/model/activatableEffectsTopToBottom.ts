import type { Permanent } from "@aegis/shared";
import { parseActivatable, type ActivatableEntry } from "@/game/boardModel";

export function activatableEffectsTopToBottom({
  permanent,
}: {
  permanent: Pick<Permanent, "topCard" | "stack" | "linked" | "activatableEffectsJson">;
}): (ActivatableEntry & { sourceCardId?: string })[] {
  const sources = [permanent.topCard, ...[...permanent.stack].reverse(), ...permanent.linked].filter(Boolean);
  const positionOf = (entry: ActivatableEntry) => {
    const position = sources.findIndex((card) => card.instanceId === entry.instanceId);
    return position === -1 ? sources.length : position;
  };
  return parseActivatable(permanent.activatableEffectsJson)
    .map((entry) => ({ ...entry, sourceCardId: sources[positionOf(entry)]?.cardId }))
    .sort((first, second) => positionOf(first) - positionOf(second));
}
