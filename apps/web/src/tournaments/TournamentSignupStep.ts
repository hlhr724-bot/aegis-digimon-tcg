export const TournamentSignupStep = {
  PASSWORD: { name: "PASSWORD", value: "password", labelKey: "tournaments.detail.password" },
  DECK: { name: "DECK", value: "deck", labelKey: "tournaments.detail.deck" },
  REVIEW: { name: "REVIEW", value: "review", labelKey: "tournaments.signup.review" },
} as const;

export type TournamentSignupStep = (typeof TournamentSignupStep)[keyof typeof TournamentSignupStep]["value"];
