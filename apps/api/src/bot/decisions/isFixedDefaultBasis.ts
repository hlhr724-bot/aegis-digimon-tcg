import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";

export function isFixedDefaultBasis(basis: DecisionBasis): boolean {
  return Object.values(DecisionBasis).some((entry) => entry.value === basis && entry.isFixedDefault);
}
