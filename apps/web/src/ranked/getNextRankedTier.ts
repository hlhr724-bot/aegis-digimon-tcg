import { RankedTier } from "@aegis/shared/ranked/RankedTier";

export function getNextRankedTier(rating: number) {
  return Object.values(RankedTier).find((tier) => tier.minimum > rating) ?? null;
}
