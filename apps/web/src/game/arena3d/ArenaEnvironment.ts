export const ArenaEnvironment = {
  PRISM: {
    name: "PRISM",
    value: "prism",
    labelKey: "redesign.foundation.environment.prism",
    swatch: "linear-gradient(135deg, #c9b8ff 0%, #ffc9b0 55%, #8fe3d8 100%)",
  },
  GRID: {
    name: "GRID",
    value: "grid",
    labelKey: "redesign.foundation.environment.grid",
    swatch: "linear-gradient(135deg, #0b1226 0%, #1d3a7a 50%, #ff4f7b 100%)",
  },
  HALO: {
    name: "HALO",
    value: "halo",
    labelKey: "redesign.foundation.environment.halo",
    swatch: "radial-gradient(circle, #f4c46a 0%, #f4c46a 18%, #1b2033 22%, #1b2033 40%, #f4c46a 44%, #1b2033 50%)",
  },
  AURORA: {
    name: "AURORA",
    value: "aurora",
    labelKey: "redesign.foundation.environment.aurora",
    swatch: "linear-gradient(135deg, #ff8fb8 0%, #9b7bff 50%, #4fd6e8 100%)",
  },
} as const;

export type ArenaEnvironment = (typeof ArenaEnvironment)[keyof typeof ArenaEnvironment]["value"];
