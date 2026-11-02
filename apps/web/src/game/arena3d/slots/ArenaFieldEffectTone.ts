export const ArenaFieldEffectTone = {
  NONE: { name: "NONE", value: "none", isActive: false, isHarmful: false, color: "#ffc94d", lightColor: "#c98000" },
  HELPFUL: {
    name: "HELPFUL",
    value: "helpful",
    isActive: true,
    isHarmful: false,
    color: "#ffc94d",
    lightColor: "#c98000",
  },
  HARMFUL: {
    name: "HARMFUL",
    value: "harmful",
    isActive: true,
    isHarmful: true,
    color: "#ff3352",
    lightColor: "#a3102a",
  },
} as const;

export type ArenaFieldEffectTone = (typeof ArenaFieldEffectTone)[keyof typeof ArenaFieldEffectTone]["value"];
