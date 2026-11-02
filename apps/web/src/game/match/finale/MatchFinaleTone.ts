export const MatchFinaleTone = {
  VICTORY: { name: "VICTORY", value: "victory", tint: "#ffd666" },
  DEFEAT: { name: "DEFEAT", value: "defeat", tint: "#d65c74" },
  WITNESS: { name: "WITNESS", value: "witness", tint: "#b2bed6" },
} as const;

export type MatchFinaleTone = (typeof MatchFinaleTone)[keyof typeof MatchFinaleTone]["value"];
