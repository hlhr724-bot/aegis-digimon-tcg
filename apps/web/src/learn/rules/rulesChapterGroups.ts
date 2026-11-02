import type { TranslationKey } from "@/i18n/translationTypes";
import type { RulesChapterId } from "@/learn/rules/rulesChapters";

type RulesChapterGroup = { id: string; titleKey: TranslationKey; chapterIds: readonly RulesChapterId[] };

export const rulesChapterGroups: readonly RulesChapterGroup[] = [
  {
    id: "basics",
    titleKey: "learn.guide.groupBasics",
    chapterIds: ["goal", "deck", "cardTypes", "areas", "terminology", "setup"],
  },
  {
    id: "flow",
    titleKey: "learn.guide.groupFlow",
    chapterIds: ["turn", "breeding", "memory", "playing", "digivolve", "using", "link"],
  },
  { id: "combat", titleKey: "learn.guide.groupCombat", chapterIds: ["attack", "blocking", "security", "battles"] },
  { id: "effects", titleKey: "learn.guide.groupEffects", chapterIds: ["effects", "keywords", "checks", "other"] },
];
