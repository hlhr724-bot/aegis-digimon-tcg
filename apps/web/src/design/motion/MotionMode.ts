export const MotionMode = {
  SYSTEM: {
    name: "SYSTEM",
    value: "system",
    labelKey: "settings.motionSystem",
  },
  FULL: {
    name: "FULL",
    value: "full",
    labelKey: "settings.motionFull",
  },
  REDUCED: {
    name: "REDUCED",
    value: "reduced",
    labelKey: "settings.motionReduced",
  },
} as const;

export type MotionMode = (typeof MotionMode)[keyof typeof MotionMode]["value"];
