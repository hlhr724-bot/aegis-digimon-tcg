import { RankedRegion } from "@aegis/shared/ranked/RankedRegion";

export function getRankedRegion(): RankedRegion {
  try {
    const stored = localStorage.getItem("aegis:ranked-region");
    return (
      Object.values(RankedRegion).find((entry) => entry.value === stored)?.value ?? RankedRegion.SOUTH_AMERICA.value
    );
  } catch {
    return RankedRegion.SOUTH_AMERICA.value;
  }
}
