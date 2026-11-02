type Params = {
  allowedTargetCombinations: readonly (readonly string[])[] | undefined;
  picks: readonly string[];
};

export function getDecisionMaterialSelectionOrder({
  allowedTargetCombinations,
  picks,
}: Params): Map<string, number> | undefined {
  if (allowedTargetCombinations === undefined) {
    return undefined;
  }
  const selected = allowedTargetCombinations.find(
    (combination) => combination.length === picks.length && combination.every((id) => picks.includes(id)),
  );
  return new Map((selected ?? picks).map((id, index) => [id, index + 1]));
}
