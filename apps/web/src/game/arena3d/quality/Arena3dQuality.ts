export const Arena3dQuality = {
  LOW: {
    name: "LOW",
    value: "low",
    labelKey: "redesign.foundation.arena3dQuality.low",
    rank: 0,
    maxDpr: 1,
    idleFrameRate: 10,
    pacedFrameRate: 10,
    antialias: false,
    textureWidth: 384,
    textureBudgetBytes: 48 * 1024 * 1024,
    floorSegments: 1,
    floorWave: false,
    floorEnergy: false,
    bloom: false,
    moteCount: 0,
    shardCount: 3,
  },
  MEDIUM: {
    name: "MEDIUM",
    value: "medium",
    labelKey: "redesign.foundation.arena3dQuality.medium",
    rank: 1,
    maxDpr: 1.5,
    idleFrameRate: 20,
    pacedFrameRate: 30,
    antialias: true,
    textureWidth: 512,
    textureBudgetBytes: 96 * 1024 * 1024,
    floorSegments: 96,
    floorWave: true,
    floorEnergy: true,
    bloom: false,
    moteCount: 140,
    shardCount: 5,
  },
  HIGH: {
    name: "HIGH",
    value: "high",
    labelKey: "redesign.foundation.arena3dQuality.high",
    rank: 2,
    maxDpr: 2,
    idleFrameRate: 20,
    pacedFrameRate: 30,
    antialias: true,
    textureWidth: 768,
    textureBudgetBytes: 160 * 1024 * 1024,
    floorSegments: 160,
    floorWave: true,
    floorEnergy: true,
    bloom: true,
    moteCount: 260,
    shardCount: 8,
  },
} as const;

export type Arena3dQuality = (typeof Arena3dQuality)[keyof typeof Arena3dQuality]["value"];

type Arena3dQualityTier = (typeof Arena3dQuality)[keyof typeof Arena3dQuality];

export type Arena3dQualityEntry = {
  name: Arena3dQualityTier["name"];
  value: Arena3dQuality;
  labelKey: Arena3dQualityTier["labelKey"];
  rank: number;
  maxDpr: number;
  idleFrameRate: number;
  pacedFrameRate: number;
  antialias: boolean;
  textureWidth: number;
  textureBudgetBytes: number;
  floorSegments: number;
  floorWave: boolean;
  floorEnergy: boolean;
  bloom: boolean;
  moteCount: number;
  shardCount: number;
};
