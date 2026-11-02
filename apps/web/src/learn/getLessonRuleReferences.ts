import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import { KEYWORD_GLOSSARY } from "@/game/keywordGlossary";

const lessonReferences: Readonly<Record<string, readonly string[]>> = {
  "tutorial-attack-security": ["1-2-3-1", "11-5", "13-1"],
  "tutorial-hatch": ["3-4", "6-4"],
  "tutorial-memory": ["4-1", "4-2", "6-6"],
  "tutorial-digivolve": ["8-1", "4-8"],
  "tutorial-block": ["12-1", "14-1", "16-5"],
  "tutorial-tamers": ["4-4", "15-3", "16-4"],
  "practice-game-preparation": ["1-4-1", "5-2", "6-3-1"],
  "practice-rule-checks": ["9-1", "17-1-1", "17-1-3-1-1"],
  "practice-derived-trash-triggers": ["15-4-3", "15-4-5", "15-14", "15-3"],
  "practice-order-before-digivolving": ["15-4-3", "15-4-4-4", "15-3", "16-9"],
  "practice-inherited-sacrifice-recruit": ["15-3", "15-8-5", "15-4-5", "15-16-4"],
  "practice-inherited-unsuspend-engage": ["15-3", "15-4-3", "15-16-12", "16-44"],
};

export function getLessonRuleReferences(lesson: TutorialLesson): readonly string[] {
  if (lesson.keyword) {
    const keyword = KEYWORD_GLOSSARY[lesson.keyword];
    return keyword ? [keyword.rule] : [];
  }
  return lessonReferences[lesson.id] ?? lessonReferences[lesson.id.replace("practice-", "tutorial-")] ?? [];
}
