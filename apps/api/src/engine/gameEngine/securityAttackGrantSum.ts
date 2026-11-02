export function securityAttackGrantSum(saGrants: ReadonlyArray<{ amount?: number }>, invertNegative: boolean): number {
  return saGrants.reduce((sum, grant) => {
    const amount = grant.amount ?? 1;
    return sum + (invertNegative && amount < 0 ? -amount : amount);
  }, 0);
}
