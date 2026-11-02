import { parseActivatable } from "@/game/boardModel";
import type { HandEntry } from "@/game/piece/types";
import { CardConfirmationMode } from "@/game/cardConfirmation/CardConfirmationMode";

type Params = { entry: HandEntry | undefined; mode: CardConfirmationMode };

export function shouldConfirmCardPlay({ entry, mode }: Params): boolean {
  if (mode === CardConfirmationMode.NEVER.value) {
    return false;
  }
  if (mode === CardConfirmationMode.ALWAYS.value || !entry || !entry.playableFromHand) {
    return true;
  }
  return Boolean(
    entry.digivolveTargetPermanentIds.length ||
    entry.digivolveRoutes?.length ||
    entry.dnaDigivolveRoutes?.length ||
    entry.appFusionRoutes?.length ||
    entry.linkTargetPermanentIds.length ||
    entry.negamonPlayEffectKey ||
    parseActivatable(entry.activatableEffectsJson).length,
  );
}
