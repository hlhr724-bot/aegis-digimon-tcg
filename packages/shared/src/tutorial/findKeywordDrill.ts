import type { TutorialLesson } from "#shared/tutorial/TutorialLesson";
import { keywordDrills } from "#shared/tutorial/keywordDrills";

export function findKeywordDrill(keyword: string): TutorialLesson | undefined {
  return keywordDrills.find((drill) => drill.keyword === keyword);
}
