import type { AttackTarget } from "@aegis/shared/protocol/intents";

export function isSameAttackTarget(current: AttackTarget | undefined, candidate: AttackTarget): boolean {
  if (current === undefined || current.kind !== candidate.kind) {
    return false;
  }
  return current.kind === "player" || (candidate.kind === "permanent" && current.permanentId === candidate.permanentId);
}
