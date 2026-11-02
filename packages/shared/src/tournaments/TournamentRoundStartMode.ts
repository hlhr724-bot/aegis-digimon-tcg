export const TournamentRoundStartMode = {
  AUTOMATIC: { name: "AUTOMATIC", value: "automatic" },
  MANUAL: { name: "MANUAL", value: "manual" },
} as const;

export type TournamentRoundStartMode =
  (typeof TournamentRoundStartMode)[keyof typeof TournamentRoundStartMode]["value"];
