import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { Seat } from "@aegis/shared/schema/enums";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { ReplacementEventName } from "#api/engine/effects/context/replacements";

type ReplacementAction = Extract<Action, { kind: "Replacement" }>;

export type CostReplacementInstallParams = {
  ctx: EffectContext;
  action: ReplacementAction;
  event: ReplacementEventName;
  replacementBudget: { oncePerTurnKey?: string };
  self: Permanent | undefined;
  activationIdentity: string | undefined;
  expiresOnTurnEndOf: Seat | undefined;
  mode: "reduceCost" | "increaseCost";
  amount: number | undefined;
  amountChoices: ReplacementAction["amountChoices"];
  scalesIntoColors: boolean;
  nestedCostModifier: { raw?: string; dynamicFrom?: string } | undefined;
  intoFilter: Filter | undefined;
  replacementSourceFilter: Filter | undefined;
  interactiveCost: Cost | undefined;
  interactiveAdditionalCosts: Cost[];
  interactiveCosts: Cost[];
  interactiveOptional: boolean;
  ownerSeat: Seat;
  residentTiming: EffectContext["activeTiming"];
};
