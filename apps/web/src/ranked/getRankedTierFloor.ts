import { RankedTier } from "@aegis/shared/ranked/RankedTier";

export function getRankedTierFloor(tier: RankedTier) {
  return Object.values(RankedTier).find((entry) => entry.value === tier)?.minimum ?? 0;
}
