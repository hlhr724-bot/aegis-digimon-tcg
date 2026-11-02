import { ArtRegion, type ArtRegionEntry } from "#shared/cards/ArtRegion";

export function artRegionOf(artId: string): ArtRegionEntry | undefined {
  return Object.values(ArtRegion).find((region) => artId.endsWith(region.suffix));
}
