export const RankedRegion = {
  SOUTH_AMERICA: { name: "SOUTH_AMERICA", value: "south_america" },
  NORTH_AMERICA: { name: "NORTH_AMERICA", value: "north_america" },
  EUROPE: { name: "EUROPE", value: "europe" },
  ASIA: { name: "ASIA", value: "asia" },
  OCEANIA: { name: "OCEANIA", value: "oceania" },
  AFRICA: { name: "AFRICA", value: "africa" },
} as const;

export type RankedRegion = (typeof RankedRegion)[keyof typeof RankedRegion]["value"];
