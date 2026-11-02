export const LiveSearchErrorStage = {
  SNAPSHOT: { name: "SNAPSHOT", value: "snapshot" },
  SEARCH: { name: "SEARCH", value: "search" },
} as const;

export type LiveSearchErrorStage = (typeof LiveSearchErrorStage)[keyof typeof LiveSearchErrorStage]["value"];
