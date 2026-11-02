type Params = {
  allowedTargetCombinations: readonly (readonly string[])[] | undefined;
  picks: readonly string[];
  complete?: boolean;
};

export function isAllowedTargetSelection({ allowedTargetCombinations, picks, complete = false }: Params): boolean {
  if (allowedTargetCombinations === undefined) {
    return true;
  }
  if (new Set(picks).size !== picks.length) {
    return false;
  }
  return allowedTargetCombinations.some(
    (combination) =>
      (!complete || combination.length === picks.length) && picks.every((id) => combination.includes(id)),
  );
}
