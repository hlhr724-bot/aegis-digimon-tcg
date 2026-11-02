export const ManualStatus = {
  SICK: { name: "SICK", value: "sick" },
  TAUNT: { name: "TAUNT", value: "taunt" },
  IMMUNE: { name: "IMMUNE", value: "immune" },
} as const;

export type ManualStatus = (typeof ManualStatus)[keyof typeof ManualStatus]["value"];
