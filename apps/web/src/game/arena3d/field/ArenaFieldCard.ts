export type ArenaFieldCard = {
  topUrls: readonly string[];
  sourceUrls: readonly (readonly string[])[];
  linkUrls: readonly (readonly string[])[];
};

export type ArenaZoneCard = {
  count: number;
  topUrls: readonly string[];
  layerUrls: readonly string[];
  topTint: string;
  layerTint: string;
};
