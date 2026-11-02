export const CardFinish = {
  NONE: { name: "NONE", value: "none", shaderIndex: 0 },
  HOLO: { name: "HOLO", value: "holo", shaderIndex: 1 },
  STARLIGHT: { name: "STARLIGHT", value: "starlight", shaderIndex: 2 },
  GOLD: { name: "GOLD", value: "gold", shaderIndex: 3 },
  PRISMATIC: { name: "PRISMATIC", value: "prismatic", shaderIndex: 4 },
} as const;

export type CardFinish = (typeof CardFinish)[keyof typeof CardFinish]["value"];

export type CardFinishEntry = (typeof CardFinish)[keyof typeof CardFinish];
