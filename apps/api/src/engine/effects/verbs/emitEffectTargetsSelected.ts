import type { PrimitivesContext } from "./context.js";

type EmitEffectTargetsSelectedParams = {
  pc: PrimitivesContext;
  permanentIds: readonly string[];
};

export function emitEffectTargetsSelected({ pc, permanentIds }: EmitEffectTargetsSelectedParams): void {
  const sourcePermanentId = pc.effectSourcePermanentIdStack.at(-1);
  const seat = pc.effectSeatStack.at(-1);
  const emitted = pc.effectTargetsEmittedStack.at(-1);
  if (sourcePermanentId === undefined || seat === undefined || emitted === undefined) {
    return;
  }
  const targetPermanentIds: string[] = [];
  for (const permanentId of permanentIds) {
    if (permanentId === sourcePermanentId || emitted.has(permanentId)) {
      continue;
    }
    if (pc.access.permanentById(permanentId) === undefined) {
      continue;
    }
    emitted.add(permanentId);
    targetPermanentIds.push(permanentId);
  }
  if (targetPermanentIds.length === 0) {
    return;
  }
  pc.engine.emit({ kind: "effectTargetsSelected", seat, sourcePermanentId, targetPermanentIds });
}
