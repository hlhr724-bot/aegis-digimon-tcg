export const DecisionSelectionGoal = {
  GAIN: { name: "GAIN", value: "gain" },
  DISCARD: { name: "DISCARD", value: "discard" },
  PLAY: { name: "PLAY", value: "play" },
  EVOLVE: { name: "EVOLVE", value: "evolve" },
  MATERIAL: { name: "MATERIAL", value: "material" },
  PROTECT: { name: "PROTECT", value: "protect" },
} as const;

export type DecisionSelectionGoal = (typeof DecisionSelectionGoal)[keyof typeof DecisionSelectionGoal]["value"];
