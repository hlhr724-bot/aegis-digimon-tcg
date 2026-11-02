export const ArtRegion = {
  JAPANESE: { name: "JAPANESE", value: "ja", suffix: "-J", badge: "JP" },
  KOREAN: { name: "KOREAN", value: "ko", suffix: "-K", badge: "KR" },
  CHINESE: { name: "CHINESE", value: "zh", suffix: "-C", badge: "CN" },
} as const;

export type ArtRegion = (typeof ArtRegion)[keyof typeof ArtRegion]["value"];

export type ArtRegionEntry = (typeof ArtRegion)[keyof typeof ArtRegion];
