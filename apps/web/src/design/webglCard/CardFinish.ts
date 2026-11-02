export const CardFinish = {
  NONE: { name: "NONE", value: "none", shaderIndex: 0, glowColor: undefined },
  HOLO: { name: "HOLO", value: "holo", shaderIndex: 1, glowColor: "#4aa8ff" },
  STARLIGHT: { name: "STARLIGHT", value: "starlight", shaderIndex: 2, glowColor: "#ffc94a" },
  GOLD: { name: "GOLD", value: "gold", shaderIndex: 3, glowColor: "#ff8a3d" },
  PRISMATIC: { name: "PRISMATIC", value: "prismatic", shaderIndex: 4, glowColor: "#ff4fd8" },
} as const;

export type CardFinish = (typeof CardFinish)[keyof typeof CardFinish]["value"];

export type CardFinishEntry = (typeof CardFinish)[keyof typeof CardFinish];
