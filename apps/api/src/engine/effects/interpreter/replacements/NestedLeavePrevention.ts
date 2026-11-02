import type { Condition } from "@aegis/shared/effects/ir/predicates/conditions";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";

export type NestedLeavePrevention = {
  kind?: string;
  cost?: Cost;
  costOptions?: Cost[];
  condition?: Condition;
  grant?: unknown;
};
