import type { Permanent } from "../schema/Permanent.js";
import type { CardInstance } from "../schema/CardInstance.js";
import { getCardDefinition } from "./registry.js";

type DigivolutionBase = Pick<Permanent, "inBreeding" | "topCard"> & { stack: readonly CardInstance[] };

/**
 * Cost adjustments printed on the card being digivolved into that inspect the
 * live base stack. This is shared because the server charges the adjusted cost
 * while the client must present that same cost before sending the intent.
 */
export function intrinsicDigivolutionCostReductionFor(evolvingCardId: string, base: DigivolutionBase): number {
  if (base.inBreeding) return 0;
  const baseTopCardId = base.topCard?.cardId;
  if (evolvingCardId === "BT22-061") {
    return baseTopCardId !== undefined && getCardDefinition(baseTopCardId)?.types?.includes("Ver.2") === true
      ? base.stack.filter((card) => !card.faceUp).length
      : 0;
  }
  if (evolvingCardId === "BT22-076") {
    return baseTopCardId !== undefined && getCardDefinition(baseTopCardId)?.types?.includes("Ver.1") === true ? 2 : 0;
  }
  if (evolvingCardId !== "BT10-086") return 0;
  return base.stack.some((card) => getCardDefinition(card.cardId)?.nameEn === "X Antibody") ? 2 : 0;
}
