import type { TranslationKey } from "@/i18n/translationTypes";

export const NoticeSize = {
  NORMAL: {
    name: "NORMAL",
    value: "normal",
    scale: 1,
    textScale: 1,
    labelKey: "settings.noticeSizeNormal" satisfies TranslationKey,
  },
  COMPACT: {
    name: "COMPACT",
    value: "compact",
    scale: 0.75,
    textScale: 0.85,
    labelKey: "settings.noticeSizeCompact" satisfies TranslationKey,
  },
} as const;

export type NoticeSize = (typeof NoticeSize)[keyof typeof NoticeSize]["value"];

export type NoticeSizeEntry = (typeof NoticeSize)[keyof typeof NoticeSize];
