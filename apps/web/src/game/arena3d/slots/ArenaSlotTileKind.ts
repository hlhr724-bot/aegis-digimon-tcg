export const ArenaSlotTileKind = {
  EMPTY: { name: "EMPTY", value: "empty", shaderValue: 0 },
  OCCUPIED: { name: "OCCUPIED", value: "occupied", shaderValue: 1 },
  SECURITY: { name: "SECURITY", value: "security", shaderValue: 2 },
} as const;

export type ArenaSlotTileKind = (typeof ArenaSlotTileKind)[keyof typeof ArenaSlotTileKind]["value"];
