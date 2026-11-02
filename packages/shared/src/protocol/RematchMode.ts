export const RematchMode = {
  FINISH_SERIES: {
    name: "FINISH_SERIES",
    value: "finish",
    countsFinishedGame: true,
    allowsDeckChange: false,
    drawsFirstSeat: false,
    offeredAfterSeries: false,
  },
  NEW_SERIES: {
    name: "NEW_SERIES",
    value: "new",
    countsFinishedGame: false,
    allowsDeckChange: true,
    drawsFirstSeat: true,
    offeredAfterSeries: true,
  },
} as const;

export type RematchMode = (typeof RematchMode)[keyof typeof RematchMode]["value"];
