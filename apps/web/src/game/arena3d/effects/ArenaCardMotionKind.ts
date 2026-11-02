export type ArenaMotionKeyframe = {
  at: number;
  along: number;
  lift: number;
  tilt: number;
  roll: number;
  spin: number;
  scale: number;
  flash: number;
};

const REST: ArenaMotionKeyframe = { at: 0, along: 0, lift: 0, tilt: 0, roll: 0, spin: 0, scale: 1, flash: 0 };

function frame(values: Partial<ArenaMotionKeyframe> & { at: number }): ArenaMotionKeyframe {
  return { ...REST, ...values };
}

export const ArenaCardMotionKind = {
  LUNGE: {
    name: "LUNGE",
    value: "lunge",
    durationSeconds: 0.8,
    delaySeconds: 0,
    keyframes: [
      frame({ at: 0 }),
      frame({ at: 0.3, along: -0.05, lift: 0.28, tilt: -0.2, scale: 1.03 }),
      frame({ at: 0.55, along: 0.62, lift: 0.42, tilt: 0.16, scale: 1.06 }),
      frame({ at: 0.82, along: 0.08, lift: 0.12, tilt: -0.04, scale: 1.01 }),
      frame({ at: 1 }),
    ],
  },
  FINALE_LUNGE: {
    name: "FINALE_LUNGE",
    value: "finaleLunge",
    durationSeconds: 1.25,
    delaySeconds: 0,
    keyframes: [
      frame({ at: 0 }),
      frame({ at: 0.16, along: -0.12, lift: 0.5, tilt: -0.34, scale: 1.08 }),
      frame({ at: 0.36, along: 0.08, lift: 0.62, tilt: -0.22, scale: 1.1 }),
      frame({ at: 0.416, along: 0.74, lift: 0.38, tilt: 0.24, scale: 1.14, flash: 0.45 }),
      frame({ at: 0.56, along: 0.68, lift: 0.32, tilt: 0.12, scale: 1.1, flash: 0.15 }),
      frame({ at: 0.84, along: 0.1, lift: 0.1, tilt: -0.02, scale: 1.02 }),
      frame({ at: 1 }),
    ],
  },
  KNOCKBACK: {
    name: "KNOCKBACK",
    value: "knockback",
    durationSeconds: 0.6,
    delaySeconds: 0.3,
    keyframes: [
      frame({ at: 0 }),
      frame({ at: 0.22, along: 0.22, lift: 0.1, tilt: 0.32, roll: 0.08, flash: 0.4 }),
      frame({ at: 0.6, along: -0.02, lift: 0.04, tilt: -0.06 }),
      frame({ at: 1 }),
    ],
  },
  EVOLVE: {
    name: "EVOLVE",
    value: "evolve",
    durationSeconds: 1.1,
    delaySeconds: 0,
    keyframes: [
      frame({ at: 0 }),
      frame({ at: 0.3, lift: 0.55, scale: 1.06, flash: 0.15 }),
      frame({ at: 0.68, lift: 0.75, scale: 1.1, flash: 0.5 }),
      frame({ at: 0.86, lift: 0.04, scale: 1.02, flash: 0.15 }),
      frame({ at: 1 }),
    ],
  },
  DROP: {
    name: "DROP",
    value: "drop",
    durationSeconds: 0.5,
    delaySeconds: 0,
    keyframes: [
      frame({ at: 0, lift: 0.34, tilt: 0.12, scale: 1.04 }),
      frame({ at: 0.6, lift: -0.015, tilt: -0.02 }),
      frame({ at: 0.82, lift: 0.02 }),
      frame({ at: 1 }),
    ],
  },
  DELETE: {
    name: "DELETE",
    value: "delete",
    durationSeconds: 0.7,
    delaySeconds: 0,
    keyframes: [
      frame({ at: 0 }),
      frame({ at: 0.3, lift: 0.18, tilt: -0.18, flash: 0.35 }),
      frame({ at: 1, lift: -0.4, tilt: 0.9, roll: 0.15, scale: 0.8 }),
    ],
  },
  HOP: {
    name: "HOP",
    value: "hop",
    durationSeconds: 0.45,
    delaySeconds: 0,
    keyframes: [frame({ at: 0 }), frame({ at: 0.45, lift: 0.16, tilt: -0.08 }), frame({ at: 1 })],
  },
} as const;

export type ArenaCardMotionKind = (typeof ArenaCardMotionKind)[keyof typeof ArenaCardMotionKind]["value"];

export type ArenaCardMotionKindEntry = (typeof ArenaCardMotionKind)[keyof typeof ArenaCardMotionKind];
