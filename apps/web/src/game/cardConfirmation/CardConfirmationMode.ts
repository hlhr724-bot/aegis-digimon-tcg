export const CardConfirmationMode = {
  ALWAYS: {
    name: "ALWAYS",
    value: "always",
    labelKey: "settings.cardConfirmationAlways",
  },
  SKIP_PLAY_ONLY: {
    name: "SKIP_PLAY_ONLY",
    value: "skip-play-only",
    labelKey: "settings.cardConfirmationSkipPlayOnly",
  },
  NEVER: {
    name: "NEVER",
    value: "never",
    labelKey: "settings.cardConfirmationNever",
  },
} as const;

export type CardConfirmationMode = (typeof CardConfirmationMode)[keyof typeof CardConfirmationMode]["value"];
