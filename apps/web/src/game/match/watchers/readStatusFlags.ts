import type { Permanent } from "@aegis/shared";
import type { FreezeFlags } from "../../freezePulse";

function countTrue(flags: readonly boolean[]): number {
  return flags.filter(Boolean).length;
}

export function readStatusFlags(permanent: Permanent): FreezeFlags {
  const securityAttackModifier = permanent.securityAttackModifier ?? 0;
  const debuffs =
    countTrue([
      permanent.cannotSuspend,
      permanent.cannotUnsuspend,
      permanent.cannotDigivolve,
      permanent.cannotActivateWhenDigivolving,
    ]) + Math.max(0, -securityAttackModifier);
  const buffs =
    (permanent.grantedKeywords?.length ?? 0) +
    countTrue([
      permanent.immuneToOpponentDigimonEffects,
      permanent.immuneToOpponentOptionEffects,
      permanent.immuneToOpponentTamerEffects,
      permanent.protectedFromDpReduction,
      permanent.protectedFromStackTrash,
      permanent.protectedFromStackReturn,
      permanent.protectedFromDeDigivolve,
      permanent.protectedFromEffectDeletion,
      permanent.protectedFromBattleDeletion,
      permanent.protectedFromEffectReturn,
    ]) +
    Math.max(0, securityAttackModifier);
  return {
    cannotAttack: permanent.cannotAttack,
    cannotBlock: permanent.cannotBlock,
    debuffs,
    buffs,
  };
}
