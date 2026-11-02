import type { ReplacementInstallInstead, ReplacementInstallPrevent } from "#api/engine/effects/context/replacements";
import { createInsteadReplacementInstall } from "#api/engine/effects/interpreter/replacements/createInsteadReplacementInstall";
import { createPreventReplacementInstall } from "#api/engine/effects/interpreter/replacements/createPreventReplacementInstall";
import type { LeaveReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/LeaveReplacementInstallParams";

export function createLeaveReplacementInstall(
  params: LeaveReplacementInstallParams,
): ReplacementInstallPrevent | ReplacementInstallInstead {
  return params.mode === "prevent" ? createPreventReplacementInstall(params) : createInsteadReplacementInstall(params);
}
