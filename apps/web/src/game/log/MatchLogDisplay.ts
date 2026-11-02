import type { TranslationKey } from "@/i18n/translationTypes";

export const MatchLogDisplay = {
  POPUPS: {
    name: "POPUPS",
    value: "popups",
    showsPanel: false,
    showsPopups: true,
    labelKey: "settings.matchLogDisplayPopups" satisfies TranslationKey,
  },
  PANEL: {
    name: "PANEL",
    value: "panel",
    showsPanel: true,
    showsPopups: false,
    labelKey: "settings.matchLogDisplayPanel" satisfies TranslationKey,
  },
  BOTH: {
    name: "BOTH",
    value: "both",
    showsPanel: true,
    showsPopups: true,
    labelKey: "settings.matchLogDisplayBoth" satisfies TranslationKey,
  },
} as const;

export type MatchLogDisplay = (typeof MatchLogDisplay)[keyof typeof MatchLogDisplay]["value"];
