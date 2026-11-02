import { OFFICIAL_COMPREHENSIVE_RULES_URL } from "@/game/keywordGlossary";

const chapterPages: Readonly<Record<number, number>> = {
  1: 1,
  2: 3,
  3: 6,
  4: 8,
  5: 13,
  6: 14,
  7: 15,
  8: 18,
  9: 21,
  10: 21,
  11: 22,
  12: 23,
  13: 23,
  14: 24,
  15: 24,
  16: 35,
  17: 42,
  18: 43,
};

export function getOfficialRuleUrl(rule: string): string {
  const chapter = Number.parseInt(rule, 10);
  return `${OFFICIAL_COMPREHENSIVE_RULES_URL}#page=${chapterPages[chapter] ?? 1}`;
}
