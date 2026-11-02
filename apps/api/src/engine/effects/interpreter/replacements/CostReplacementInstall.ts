import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { ReplacementInstallReduceCost } from "#api/engine/effects/context/replacements";
import type { CostReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/CostReplacementInstallParams";

export type CostReplacementInstall = ReplacementInstallReduceCost & {
  amountChoices?: CostReplacementInstallParams["amountChoices"];
  potentialAmount?: (target: Permanent) => number;
};
