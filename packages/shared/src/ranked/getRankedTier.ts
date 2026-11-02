import { RankedTier } from "#shared/ranked/RankedTier";

export function getRankedTier(rating: number): RankedTier {
  return (
    Object.values(RankedTier)
      .reverse()
      .find((tier) => rating >= tier.minimum)?.value ?? RankedTier.BRONZE.value
  );
}
