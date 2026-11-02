import { worldStoryBattles } from "#shared/story/worldStoryBattles";

type Params = { completed: readonly string[] };

export function getWorldStoryMilestones({ completed }: Params): string[] {
  const victories = worldStoryBattles.filter((battle) => completed.includes(battle.id));
  const milestones = victories.map((battle) => `battle:${battle.id}`);
  for (const chapterId of ["native-forest", "ogremon"]) {
    const chapter = worldStoryBattles.filter((battle) => battle.chapterId === chapterId);
    if (chapter.every((battle) => completed.includes(battle.id))) {
      milestones.push(`chapter:dw1:${chapterId}`);
    }
  }
  if (victories.length === worldStoryBattles.length) {
    milestones.push("selection:dw1:opening-v1");
  }
  return milestones;
}
