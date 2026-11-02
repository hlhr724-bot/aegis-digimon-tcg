import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import type { Seat } from "@aegis/shared/schema/enums";
import type { EffectContext } from "#api/engine/effects/context/effectContext";

export type CostModifierMatchParams = {
  ctx: EffectContext;
  action: Extract<Action, { kind: "CostModifier" }>;
  filter: Filter;
  selfRef: boolean;
  setMode: boolean;
  seats: Seat[];
};
