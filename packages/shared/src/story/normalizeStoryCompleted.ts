import { storyBattleAliases } from "#shared/story/storyBattleAliases";

type Params = { completed: readonly string[] };

export function normalizeStoryCompleted({ completed }: Params): string[] {
  return [...new Set(completed.map((id) => (Object.hasOwn(storyBattleAliases, id) ? storyBattleAliases[id]! : id)))];
}
