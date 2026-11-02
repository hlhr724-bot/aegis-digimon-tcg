export const PackOpeningPhase = {
  INTRO: { name: "INTRO", value: "intro", durationSeconds: 2.4, next: "choosing" },
  CHOOSING: { name: "CHOOSING", value: "choosing", durationSeconds: undefined, next: undefined },
  CHARGING: { name: "CHARGING", value: "charging", durationSeconds: 3, next: "burst" },
  BURST: { name: "BURST", value: "burst", durationSeconds: 1.6, next: "revealing" },
  REVEALING: { name: "REVEALING", value: "revealing", durationSeconds: undefined, next: undefined },
  SUMMARY: { name: "SUMMARY", value: "summary", durationSeconds: undefined, next: undefined },
} as const;

export type PackOpeningPhase = (typeof PackOpeningPhase)[keyof typeof PackOpeningPhase]["value"];
