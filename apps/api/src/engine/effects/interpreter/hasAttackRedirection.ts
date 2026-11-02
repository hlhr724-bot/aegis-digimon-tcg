import type { Action } from "@aegis/shared/effects/ir/actions/action";

export function hasAttackRedirection(actions: readonly Action[]): boolean {
  return actions.some((action) => {
    if (action.kind === "RedirectAttack") {
      return action.mode !== "endAttack" && action.chooser !== "opponent";
    }
    if (action.kind === "ConditionalBranch") {
      return hasAttackRedirection(action.ifTrue) || hasAttackRedirection(action.ifFalse ?? []);
    }
    if (action.kind === "CostGatedBlock") {
      return hasAttackRedirection(action.actions);
    }
    return false;
  });
}
