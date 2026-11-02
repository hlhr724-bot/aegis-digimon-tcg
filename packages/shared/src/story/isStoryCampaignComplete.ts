import type { StoryBattle } from "#shared/story/StoryBattle";

type Params = { battles: readonly StoryBattle[]; completed: readonly string[] };

export function isStoryCampaignComplete({ battles, completed }: Params): boolean {
  const required = battles.filter((battle) => !battle.isOptional);
  return (
    required.length > 0 &&
    required.every((battle) => {
      if (battle.completionGroup) {
        return required.some(
          (alternative) => alternative.completionGroup === battle.completionGroup && completed.includes(alternative.id),
        );
      }
      return completed.includes(battle.id);
    })
  );
}
