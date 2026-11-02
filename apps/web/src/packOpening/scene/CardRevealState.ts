export const CardRevealState = {
  HIDDEN: { name: "HIDDEN", value: "hidden" },
  FOUNTAIN: { name: "FOUNTAIN", value: "fountain" },
  STACK: { name: "STACK", value: "stack" },
  FOCUS: { name: "FOCUS", value: "focus" },
  SLOT: { name: "SLOT", value: "slot" },
} as const;

export type CardRevealState = (typeof CardRevealState)[keyof typeof CardRevealState]["value"];
