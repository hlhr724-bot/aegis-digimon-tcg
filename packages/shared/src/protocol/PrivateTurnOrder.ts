export const PrivateTurnOrder = {
  RANDOM: { name: "RANDOM", value: "random", firstSeat: undefined },
  HOST_FIRST: { name: "HOST_FIRST", value: "hostFirst", firstSeat: 0 },
  HOST_SECOND: { name: "HOST_SECOND", value: "hostSecond", firstSeat: 1 },
} as const;

export type PrivateTurnOrder = (typeof PrivateTurnOrder)[keyof typeof PrivateTurnOrder]["value"];
