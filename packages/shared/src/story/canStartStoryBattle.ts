import type { StoryBattle } from "#shared/story/StoryBattle";

type Params = { battle: StoryBattle; completed: readonly string[] };

export function canStartStoryBattle({ battle, completed }: Params): boolean {
  const prerequisites = [...(battle.prerequisiteIds ?? [])];
  if (battle.prerequisiteId) {
    prerequisites.push(battle.prerequisiteId);
  }
  return battle.playable && prerequisites.every((id) => completed.includes(id));
}
