export const BoardStyle = {
  CLASSIC: { name: "CLASSIC", value: "classic", labelKey: "redesign.foundation.boardStyle.classic" },
  ARENA_3D: { name: "ARENA_3D", value: "arena3d", labelKey: "redesign.foundation.boardStyle.arena3d" },
} as const;

export type BoardStyle = (typeof BoardStyle)[keyof typeof BoardStyle]["value"];
