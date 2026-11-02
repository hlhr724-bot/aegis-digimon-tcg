export const WinrateTone = {
  GOOD: { name: "GOOD", value: "good" },
  EVEN: { name: "EVEN", value: "even" },
  BAD: { name: "BAD", value: "bad" },
} as const;
export type WinrateTone = (typeof WinrateTone)[keyof typeof WinrateTone]["value"];
