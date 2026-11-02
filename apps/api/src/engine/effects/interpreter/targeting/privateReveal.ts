// Rules manual, "Placing Specified Cards From a Private Area in Another Private Area": a "card
// with XX" moved from the deck, hand, or security stack into another private area is revealed
// to the opponent before it moves. A plain "card" stays hidden (BT14-032 Q2406).

import type { EffectContext } from "../../EffectContext.js";
import { type LooseCandidate, looseCardsInZone } from "./loose.js";
import type { Target } from "@aegis/shared";

const PRIVATE_ZONES = ["hand", "deck", "security"] as const;

/** Filter keys that only scope where to look, not which card qualifies ("place 1 card from hand"). */
const SCOPE_ONLY_FILTER_KEYS = new Set<string>(["controller", "controllerDefault", "zone", "position", "excludeSelf"]);

export function targetHasRequirement(target: Target): boolean {
  return (
    (target.orFilters?.length ?? 0) > 0 ||
    Object.entries(target.filter).some(([key, value]) => value !== undefined && !SCOPE_ONLY_FILTER_KEYS.has(key))
  );
}

/**
 * Reveal each chosen card that still sits in a private zone. Call it after the pick and before
 * the move into the private destination. `force` reveals regardless of the filter (LM-023 Q4025).
 */
export function revealPrivateRequirementPicks(
  ctx: EffectContext,
  target: Target,
  candidates: readonly LooseCandidate[],
  chosen: readonly string[],
  force = false,
): void {
  if (!force && !targetHasRequirement(target)) return;
  for (const instanceId of chosen) {
    const card = candidates.find((candidate) => candidate.instanceId === instanceId);
    if (card === undefined) continue;
    const isPrivate = PRIVATE_ZONES.some((zone) =>
      looseCardsInZone(ctx, card.ownerSeat, zone).some((candidate) => candidate.instanceId === instanceId),
    );
    if (force || isPrivate) ctx.fx.revealCard(card.ownerSeat, card.cardId, ctx.source.cardId);
  }
}
