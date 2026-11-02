import type { Locale } from "@/i18n/locales";
import type { RulesGuideChapter } from "@/learn/rules/RulesGuideChapter";
import { rulesAdvancedEn } from "@/learn/rules/content/rulesAdvanced.en";
import { rulesAdvancedPtBR } from "@/learn/rules/content/rulesAdvanced.pt-BR";
import { rulesBasicsEn } from "@/learn/rules/content/rulesBasics.en";
import { rulesBasicsPtBR } from "@/learn/rules/content/rulesBasics.pt-BR";
import { rulesKeywordsEn } from "@/learn/rules/content/rulesKeywords.en";
import { rulesKeywordsPtBR } from "@/learn/rules/content/rulesKeywords.pt-BR";
import { rulesChapters } from "@/learn/rules/rulesChapters";

const englishChapters = [...rulesBasicsEn, ...rulesAdvancedEn, rulesKeywordsEn];
const portugueseChapters = [...rulesBasicsPtBR, ...rulesAdvancedPtBR, rulesKeywordsPtBR];

export function getRulesGuideChapters(locale: Locale): readonly RulesGuideChapter[] {
  const chapters = locale === "pt-BR" ? portugueseChapters : englishChapters;
  return rulesChapters.map((chapter) => chapters.find((content) => content.id === chapter.id)!);
}
