import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { ReplacementEventName } from "#api/engine/effects/context/replacements";
import type { NestedLeavePrevention } from "#api/engine/effects/interpreter/replacements/NestedLeavePrevention";

export type LeaveReplacementInstallParams = {
  ctx: EffectContext;
  action: Extract<Action, { kind: "Replacement" }>;
  event: ReplacementEventName;
  mode: "prevent" | "instead";
  replacementBudget: { oncePerTurnKey?: string };
  self: Permanent | undefined;
  activationIdentity: string | undefined;
  decodeText: string | undefined;
  nestedPrevent: NestedLeavePrevention | undefined;
  preventCost: Cost | undefined;
  nestedCostModifierRaw: string | undefined;
};
