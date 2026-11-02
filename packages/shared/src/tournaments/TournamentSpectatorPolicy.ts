export const TournamentSpectatorPolicy = {
  NOBODY: {
    name: "NOBODY",
    value: "nobody",
    labelKey: "tournaments.spectators.policy.nobody",
    descriptionKey: "tournaments.spectators.policy.nobodyHelp",
  },
  ALLOWLIST: {
    name: "ALLOWLIST",
    value: "allowlist",
    labelKey: "tournaments.spectators.policy.allowlist",
    descriptionKey: "tournaments.spectators.policy.allowlistHelp",
  },
  SIGNED_IN: {
    name: "SIGNED_IN",
    value: "signed_in",
    labelKey: "tournaments.spectators.policy.signedIn",
    descriptionKey: "tournaments.spectators.policy.signedInHelp",
  },
} as const;

export type TournamentSpectatorPolicy =
  (typeof TournamentSpectatorPolicy)[keyof typeof TournamentSpectatorPolicy]["value"];
