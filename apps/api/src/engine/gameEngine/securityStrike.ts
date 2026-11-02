import { securityAttackGrantSum } from "./securityAttackGrantSum.js";

/**
 * The number of security cards an attacker checks: base 1 plus every ＜Security Attack ±N＞ grant
 * (each negative amount turned positive while an SA-sign-inversion is active on the attacker —
 * EX6-031, Q3751/Q3752; positive grants are unchanged). Per Comprehensive Rules §16-4-4 the result
 * is floored at 0: if modifiers drive it below 0, the actual number of security checks is 0, never
 * negative. Exported so the floor is a unit-testable contract rather than an unobservable defensive
 * guard (the consumer also treats <= 0 as "no check").
 */
export function securityStrikeCount(saGrants: ReadonlyArray<{ amount?: number }>, invert: boolean): number {
  return Math.max(0, 1 + securityAttackGrantSum(saGrants, invert));
}
