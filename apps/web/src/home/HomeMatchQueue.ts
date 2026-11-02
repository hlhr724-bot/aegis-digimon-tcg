export const HomeMatchQueue = {
  CASUAL: { name: "CASUAL", value: "casual", labelKey: "home.next.casual" },
  RANKED: { name: "RANKED", value: "ranked", labelKey: "home.next.ranked" },
} as const;

export type HomeMatchQueue = (typeof HomeMatchQueue)[keyof typeof HomeMatchQueue]["value"];
