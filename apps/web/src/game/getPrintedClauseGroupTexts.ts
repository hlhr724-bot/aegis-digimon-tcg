import { getPrintedClauseGroups } from "@/game/getPrintedClauseGroups";

export function getPrintedClauseGroupTexts(effectText: string): string[] {
  const { groups } = getPrintedClauseGroups(effectText);
  return groups.map((group, index) =>
    effectText.slice(group.start, groups[index + 1]?.start ?? effectText.length).trim(),
  );
}
