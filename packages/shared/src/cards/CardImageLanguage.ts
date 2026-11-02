import { ArtRegion } from "#shared/cards/ArtRegion";

export const CardImageLanguage = {
  ENGLISH: { name: "ENGLISH", value: "en", label: "English", locales: ["en"] },
  JAPANESE: { name: "JAPANESE", value: ArtRegion.JAPANESE.value, label: "日本語", locales: ["ja"] },
  KOREAN: { name: "KOREAN", value: ArtRegion.KOREAN.value, label: "한국어", locales: ["ko"] },
  CHINESE: { name: "CHINESE", value: ArtRegion.CHINESE.value, label: "中文", locales: ["zh-CN", "zh-TW"] },
} as const;

export type CardImageLanguage = (typeof CardImageLanguage)[keyof typeof CardImageLanguage]["value"];
