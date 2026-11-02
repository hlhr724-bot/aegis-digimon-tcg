export const ArenaRim = {
  SELECTED: { name: "SELECTED", value: "selected", color: "#ffd34d", strength: 1 },
  THREATENED: { name: "THREATENED", value: "threatened", color: "#ff6a3d", strength: 0.95 },
  ATTACKABLE: { name: "ATTACKABLE", value: "attackable", color: "#ff4d5e", strength: 0.9 },
  CANDIDATE: { name: "CANDIDATE", value: "candidate", color: "#4fd6ff", strength: 0.85 },
  OFFERED: { name: "OFFERED", value: "offered", color: "#80efff", strength: 0.85 },
  EFFECT_SOURCE: { name: "EFFECT_SOURCE", value: "effectSource", color: "#c18cff", strength: 0.95 },
  EFFECT_LINKED: { name: "EFFECT_LINKED", value: "effectLinked", color: "#8ab6ff", strength: 0.6 },
} as const;

export type ArenaRim = (typeof ArenaRim)[keyof typeof ArenaRim]["value"];

export type ArenaRimEntry = (typeof ArenaRim)[keyof typeof ArenaRim];
