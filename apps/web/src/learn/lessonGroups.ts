import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { rulePracticeLessons } from "@aegis/shared/tutorial/rulePracticeLessons";
import { keywordDrills } from "@aegis/shared/tutorial/keywordDrills";
import { combatKeywordDrills } from "@aegis/shared/tutorial/combatKeywordDrills";
import { protectionKeywordDrills } from "@aegis/shared/tutorial/protectionKeywordDrills";
import { evolutionKeywordDrills } from "@aegis/shared/tutorial/evolutionKeywordDrills";
import { advancedPracticeLessons } from "@aegis/shared/tutorial/advancedPracticeLessons";
import type { TutorialLesson } from "@aegis/shared/tutorial/TutorialLesson";
import type { TranslationKey } from "@/i18n/translationTypes";

type LessonGroup = {
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  lessons: readonly TutorialLesson[];
  numbered?: boolean;
};

export const lessonGroups: readonly LessonGroup[] = [
  {
    id: "first-steps",
    titleKey: "learn.catalog.firstSteps",
    descriptionKey: "learn.catalog.firstStepsBody",
    lessons: tutorialLessons.slice(0, 2),
    numbered: true,
  },
  {
    id: "build-your-field",
    titleKey: "learn.catalog.buildField",
    descriptionKey: "learn.catalog.buildFieldBody",
    lessons: tutorialLessons.slice(2, 4),
    numbered: true,
  },
  {
    id: "defend-and-support",
    titleKey: "learn.catalog.defend",
    descriptionKey: "learn.catalog.defendBody",
    lessons: tutorialLessons.slice(4),
    numbered: true,
  },
  {
    id: "rules-in-practice",
    titleKey: "learn.catalog.rulesPractice",
    descriptionKey: "learn.catalog.rulesPracticeBody",
    lessons: rulePracticeLessons.filter(
      (lesson) =>
        !tutorialLessons.some((base) => base.id === lesson.id.replace("practice-", "tutorial-")) &&
        !advancedPracticeLessons.some((advanced) => advanced.id === lesson.id),
    ),
  },
  {
    id: "combat-keywords",
    titleKey: "learn.catalog.combat",
    descriptionKey: "learn.catalog.combatBody",
    lessons: [
      ...keywordDrills.filter((lesson) =>
        ["Blocker", "Rush", "Piercing", "SecurityAttack", "Alliance"].includes(lesson.keyword ?? ""),
      ),
      ...combatKeywordDrills,
    ],
  },
  {
    id: "protection-keywords",
    titleKey: "learn.catalog.protection",
    descriptionKey: "learn.catalog.protectionBody",
    lessons: [
      ...keywordDrills.filter((lesson) => ["Recovery", "Jamming", "Reboot"].includes(lesson.keyword ?? "")),
      ...protectionKeywordDrills,
    ],
  },
  {
    id: "evolution-keywords",
    titleKey: "learn.catalog.evolution",
    descriptionKey: "learn.catalog.evolutionBody",
    lessons: [
      ...keywordDrills.filter((lesson) => ["Draw", "DeDigivolve"].includes(lesson.keyword ?? "")),
      ...evolutionKeywordDrills,
    ],
  },
  {
    id: "advanced-effects",
    titleKey: "learn.guide.advancedScenarios",
    descriptionKey: "learn.guide.advancedScenariosBody",
    lessons: advancedPracticeLessons,
  },
];
