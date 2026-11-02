import { findTutorialLesson } from "@aegis/shared/tutorial/findTutorialLesson";
import type { Screen } from "@/design/primitives";

type Params = { storyBattleId: string | undefined; next: Screen };

export function getMatchExitScreen({ storyBattleId, next }: Params): Screen {
  const lesson = findTutorialLesson(storyBattleId);
  if (lesson?.keyword) {
    return "rules";
  }
  if (lesson) {
    return "learn";
  }
  if (storyBattleId) {
    return "story";
  }
  return next;
}
