export const ManualBreedingChoice = {
  HATCH: { name: "HATCH", value: "hatch" },
  MOVE: { name: "MOVE", value: "move" },
  SKIP: { name: "SKIP", value: "skip" },
} as const;

export type ManualBreedingChoice = (typeof ManualBreedingChoice)[keyof typeof ManualBreedingChoice]["value"];
